/**
 * 試卷輸出服務
 *
 * 規格：specs/spec-export.md
 *
 * 對外提供：
 *   - renderPaper(prisma, paperId)：撈試卷 → 渲染為純文字 + 媒體 refs
 *   - bundlePaperZip(prisma, paperId, options)：打包 ZIP（streamable）
 *
 * 純文字渲染本身為 pure function（在 exports.formatter.ts），本檔負責：
 *   - DB 查詢
 *   - ZIP 打包（archiver stream）
 *   - 媒體檔讀取
 *   - 例外處理（題庫無題、媒體缺失）
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import archiver from 'archiver'
import type { Readable } from 'node:stream'

import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import {
  renderPaperToText,
  sanitizeFilename,
  README_TEXT,
  type FormatterOutput,
  type RenderedPaperInput,
  type MediaRef,
} from './exports.formatter.js'

// 與 media.service.ts 的 UPLOAD_DIR 對齊
const UPLOAD_DIR = join(process.cwd(), 'uploads')

const exportPaperSelect = {
  id: true,
  name: true,
  status: true,
  blueprintSnapshot: true,
  blueprintId: true,
  blueprint: { select: { examCategory: true, totalQuestions: true, totalScore: true } },
  questions: {
    select: {
      orderIndex: true,
      score: true,
      question: {
        select: {
          id: true,
          category: true,
          type: true,
          subType: true,
          stem: true,
          content: true,
          answer: true,
          isGroupParent: true,
          groupId: true,
          questionMedia: {
            select: {
              purpose: true,
              media: {
                select: {
                  id: true,
                  filename: true,
                  mimeType: true,
                  objectKey: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { orderIndex: 'asc' as const },
  },
} as const

export interface RenderResult {
  paperId: string
  filename: string                   // 不含副檔名的安全檔名
  text: string
  blueprintSnapshot: unknown
  mediaRefs: MediaRef[]
  /** 額外資訊：mediaId → objectKey，service 層用來抓檔 */
  objectKeyByMediaId: Map<string, string>
  warnings: string[]
}

/**
 * 從 DB 載入試卷並渲染為純文字 + 媒體計畫。
 * 不做任何檔案 IO（媒體讀取留給 ZIP 打包層）。
 */
export async function renderPaper(prisma: PrismaClient, paperId: string): Promise<RenderResult> {
  const paper = await prisma.examPaper.findUnique({
    where: { id: paperId },
    select: exportPaperSelect,
  })

  if (!paper) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  }

  if (paper.questions.length === 0) {
    throw new AppError(
      400,
      ErrorCode.PAPER_HAS_NO_QUESTIONS,
      '此考卷尚未包含任何題目，無法輸出',
    )
  }

  // 從 blueprintSnapshot 取得考試類型 / 總題數 / 總分
  // 若藍圖被刪除（blueprintId 為 null），仍可從 snapshot 取得
  const snapshot = paper.blueprintSnapshot as {
    examCategory?: string
    totalQuestions?: number
    totalScore?: number
  } | null

  const blueprintCategory = snapshot?.examCategory ?? paper.blueprint?.examCategory ?? '—'
  const totalQuestions = snapshot?.totalQuestions ?? paper.blueprint?.totalQuestions ?? paper.questions.length
  const totalScore = snapshot?.totalScore ?? paper.blueprint?.totalScore ?? paper.questions.reduce((s, q) => s + q.score, 0)

  const objectKeyByMediaId = new Map<string, string>()
  for (const pq of paper.questions) {
    for (const qm of pq.question.questionMedia) {
      objectKeyByMediaId.set(qm.media.id, qm.media.objectKey)
    }
  }

  const renderInput: RenderedPaperInput = {
    id: paper.id,
    name: paper.name,
    status: paper.status,
    blueprintSnapshot: paper.blueprintSnapshot,
    blueprintCategory: String(blueprintCategory),
    totalQuestions,
    totalScore,
    generatedAt: new Date(),
    questions: paper.questions.map((pq) => ({
      orderIndex: pq.orderIndex,
      score: pq.score,
      question: {
        id: pq.question.id,
        category: pq.question.category,
        type: pq.question.type,
        subType: pq.question.subType,
        stem: pq.question.stem,
        content: pq.question.content as RenderedPaperInput['questions'][number]['question']['content'],
        answer: pq.question.answer as RenderedPaperInput['questions'][number]['question']['answer'],
        isGroupParent: pq.question.isGroupParent,
        groupId: pq.question.groupId,
        questionMedia: pq.question.questionMedia.map((qm) => ({
          purpose: qm.purpose,
          media: {
            id: qm.media.id,
            filename: qm.media.filename,
            mimeType: qm.media.mimeType,
          },
        })),
      },
    })),
  }

  const formatted: FormatterOutput = renderPaperToText(renderInput)

  // 檔名前綴：sanitize(paper name) + 若為 DRAFT 加標記
  const baseName = sanitizeFilename(paper.name)
  const filename = paper.status === 'DRAFT' ? `${baseName}_DRAFT` : baseName

  return {
    paperId: paper.id,
    filename,
    text: formatted.text,
    blueprintSnapshot: paper.blueprintSnapshot,
    mediaRefs: formatted.mediaRefs,
    objectKeyByMediaId,
    warnings: formatted.warnings,
  }
}

/**
 * 把試卷打包為 ZIP，回傳 stream 給上層 `reply.send()` 直接 pipe。
 *
 * - includeMedia=true (預設)：包含 audio/ 與 images/
 * - includeMedia=false：只含 paper.txt + blueprint_snapshot.json + README.txt
 *
 * 媒體檔缺失時 throw `ERR_MEDIA_MISSING`，details 列出哪些題目參照了缺檔的 mediaId。
 */
export async function bundlePaperZip(
  prisma: PrismaClient,
  paperId: string,
  options: { includeMedia?: boolean } = {},
): Promise<{ filename: string; stream: Readable; warnings: string[] }> {
  const includeMedia = options.includeMedia ?? true
  const rendered = await renderPaper(prisma, paperId)

  // 若需含媒體，先驗證所有檔案存在；缺檔則一次性回 409
  if (includeMedia && rendered.mediaRefs.length > 0) {
    const missing: { mediaId: string; objectKey?: string; filename: string }[] = []
    await Promise.all(
      rendered.mediaRefs.map(async (ref) => {
        const objectKey = rendered.objectKeyByMediaId.get(ref.mediaId)
        if (!objectKey) {
          missing.push({ mediaId: ref.mediaId, filename: ref.filename })
          return
        }
        try {
          await stat(join(UPLOAD_DIR, objectKey))
        } catch {
          missing.push({ mediaId: ref.mediaId, objectKey, filename: ref.filename })
        }
      }),
    )

    if (missing.length > 0) {
      throw new AppError(
        409,
        ErrorCode.MEDIA_MISSING,
        `試卷打包時發現 ${missing.length} 個媒體檔遺失`,
        missing,
      )
    }
  }

  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.append(rendered.text, { name: 'paper.txt' })
  archive.append(JSON.stringify(rendered.blueprintSnapshot, null, 2), {
    name: 'blueprint_snapshot.json',
  })
  archive.append(README_TEXT, { name: 'README.txt' })

  if (includeMedia) {
    for (const ref of rendered.mediaRefs) {
      const objectKey = rendered.objectKeyByMediaId.get(ref.mediaId)
      if (!objectKey) continue
      const folder = ref.purpose === 'AUDIO' ? 'audio' : 'images'
      const fullPath = join(UPLOAD_DIR, objectKey)
      archive.append(createReadStream(fullPath), {
        name: `${folder}/${ref.filename}`,
      })
    }
  }

  // 不 await finalize：讓 archive 與 caller 的 reply.send() pipe 並行流出
  void archive.finalize()

  return {
    filename: rendered.filename,
    stream: archive,
    warnings: rendered.warnings,
  }
}
