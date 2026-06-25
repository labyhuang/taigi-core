/**
 * 應答匯入服務（spec-exam-session.md §6 / §8.4）
 *
 * 設計重點：
 *   - 不把整批 import 包進 prisma.$transaction（3000+ 筆會撐爆）
 *   - 每筆 try/catch；失敗累計到 errors，不中斷
 *   - 所有匯入結束後寫入 ImportLog（讓 §6.5 端點可查歷程）
 *   - dryRun 模式：只跑驗證 + parser，不寫 DB
 */

import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import type {
  CandidateImportRow,
  ResponseImportRow,
  SpeakingScoreImportRow,
  ParseError,
} from './imports.parser.js'

// ========== 共用型別 ==========

export interface ImportResult {
  totalRows: number
  inserted: number
  updated: number
  skipped: number
  errors: ParseError[]
}

export interface ImportContext {
  actorType: 'user' | 'api_client'
  actorId: string
  sourceFormat: 'csv' | 'json'
  dryRun?: boolean
}

// ========== 共用 helpers ==========

async function ensureSessionImportable(prisma: PrismaClient, sessionId: string) {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  })
  if (!session) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考期')
  }
  if (session.status === 'ARCHIVED') {
    throw new AppError(
      403,
      ErrorCode.EXAM_SESSION_LOCKED,
      '已封存的考期不可再匯入資料',
    )
  }
  return session
}

async function writeImportLog(
  prisma: PrismaClient,
  sessionId: string,
  importType: 'candidates' | 'responses' | 'speaking_scores',
  context: ImportContext,
  result: ImportResult,
) {
  if (context.dryRun) return
  await prisma.importLog.create({
    data: {
      examSessionId: sessionId,
      importType,
      sourceFormat: context.sourceFormat,
      actorType: context.actorType,
      actorId: context.actorId,
      totalRows: result.totalRows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors as never,
    },
  })
}

// ========== Candidates ==========

export async function importCandidates(
  prisma: PrismaClient,
  examSessionId: string,
  rows: CandidateImportRow[],
  parseErrors: ParseError[],
  context: ImportContext,
): Promise<ImportResult> {
  await ensureSessionImportable(prisma, examSessionId)

  const result: ImportResult = {
    totalRows: rows.length + parseErrors.length,
    inserted: 0,
    updated: 0,
    skipped: parseErrors.length,
    errors: [...parseErrors],
  }

  for (const row of rows) {
    if (context.dryRun) {
      // dryRun：只計入「將會 upsert」
      const existing = await prisma.candidate.findUnique({
        where: {
          examSessionId_externalCandidateId: {
            examSessionId,
            externalCandidateId: row.externalCandidateId,
          },
        },
        select: { id: true },
      })
      if (existing) result.updated += 1
      else result.inserted += 1
      continue
    }

    try {
      const before = await prisma.candidate.findUnique({
        where: {
          examSessionId_externalCandidateId: {
            examSessionId,
            externalCandidateId: row.externalCandidateId,
          },
        },
        select: { id: true },
      })

      await prisma.candidate.upsert({
        where: {
          examSessionId_externalCandidateId: {
            examSessionId,
            externalCandidateId: row.externalCandidateId,
          },
        },
        create: {
          examSessionId,
          externalCandidateId: row.externalCandidateId,
          paperVariant: row.paperVariant,
          ageGroup: row.ageGroup,
          schoolType: row.schoolType,
          totalScore: row.totalScore,
          demographic: row.demographic as never,
        },
        update: {
          paperVariant: row.paperVariant,
          ageGroup: row.ageGroup,
          schoolType: row.schoolType,
          totalScore: row.totalScore,
          demographic: row.demographic as never,
          importedAt: new Date(),
        },
      })

      if (before) result.updated += 1
      else result.inserted += 1
    } catch (err) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        message: `寫入失敗: ${(err as Error).message}`,
      })
    }
  }

  await writeImportLog(prisma, examSessionId, 'candidates', context, result)
  return result
}

// ========== Responses ==========

export async function importResponses(
  prisma: PrismaClient,
  examSessionId: string,
  rows: ResponseImportRow[],
  parseErrors: ParseError[],
  context: ImportContext,
): Promise<ImportResult> {
  await ensureSessionImportable(prisma, examSessionId)

  const result: ImportResult = {
    totalRows: rows.length + parseErrors.length,
    inserted: 0,
    updated: 0,
    skipped: parseErrors.length,
    errors: [...parseErrors],
  }

  // 預先撈：candidates 的 externalCandidateId → id 對應
  const candidateMap = await loadCandidateMap(prisma, examSessionId)

  // 預先撈：本 session 綁定 papers 的所有題目 id
  const paperQuestionIds = await loadPaperQuestionIds(prisma, examSessionId)

  for (const row of rows) {
    const candidateId = candidateMap.get(row.externalCandidateId)
    if (!candidateId) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        message: 'externalCandidateId 不存在於本考期 candidates',
      })
      continue
    }

    if (paperQuestionIds.size > 0 && !paperQuestionIds.has(row.questionId)) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        field: 'questionId',
        message: 'questionId 不屬於本考期綁定的任何考卷',
      })
      continue
    }

    if (context.dryRun) {
      const existing = await prisma.candidateResponse.findUnique({
        where: { candidateId_questionId: { candidateId, questionId: row.questionId } },
        select: { id: true },
      })
      if (existing) result.updated += 1
      else result.inserted += 1
      continue
    }

    try {
      const before = await prisma.candidateResponse.findUnique({
        where: { candidateId_questionId: { candidateId, questionId: row.questionId } },
        select: { id: true },
      })

      await prisma.candidateResponse.upsert({
        where: { candidateId_questionId: { candidateId, questionId: row.questionId } },
        create: {
          examSessionId,
          candidateId,
          questionId: row.questionId,
          selectedOptionId: row.selectedOptionId,
          writtenAnswer: row.writtenAnswer,
          isCorrect: row.isCorrect,
          pointsEarned: row.pointsEarned,
        },
        update: {
          selectedOptionId: row.selectedOptionId,
          writtenAnswer: row.writtenAnswer,
          isCorrect: row.isCorrect,
          pointsEarned: row.pointsEarned,
          importedAt: new Date(),
        },
      })

      if (before) result.updated += 1
      else result.inserted += 1
    } catch (err) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        message: `寫入失敗: ${(err as Error).message}`,
      })
    }
  }

  await writeImportLog(prisma, examSessionId, 'responses', context, result)
  return result
}

// ========== Speaking Scores ==========

export async function importSpeakingScores(
  prisma: PrismaClient,
  examSessionId: string,
  rows: SpeakingScoreImportRow[],
  parseErrors: ParseError[],
  context: ImportContext,
): Promise<ImportResult> {
  await ensureSessionImportable(prisma, examSessionId)

  const result: ImportResult = {
    totalRows: rows.length + parseErrors.length,
    inserted: 0,
    updated: 0,
    skipped: parseErrors.length,
    errors: [...parseErrors],
  }

  const candidateMap = await loadCandidateMap(prisma, examSessionId)

  // 預先撈：題目 type 用以驗證 SPEAKING
  const speakingQuestionIds = new Set(
    (
      await prisma.question.findMany({
        where: { id: { in: rows.map((r) => r.questionId) }, type: 'SPEAKING' },
        select: { id: true },
      })
    ).map((q) => q.id),
  )

  for (const row of rows) {
    const candidateId = candidateMap.get(row.externalCandidateId)
    if (!candidateId) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        message: 'externalCandidateId 不存在於本考期 candidates',
      })
      continue
    }

    if (!speakingQuestionIds.has(row.questionId)) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        field: 'questionId',
        message: '題目不存在或非 SPEAKING 類型',
      })
      continue
    }

    if (context.dryRun) {
      const existing = await prisma.candidateResponse.findUnique({
        where: { candidateId_questionId: { candidateId, questionId: row.questionId } },
        select: { id: true },
      })
      if (existing) result.updated += 1
      else result.skipped += 1
      continue
    }

    try {
      // 必須已有對應 response（spec §5.4）
      const existing = await prisma.candidateResponse.findUnique({
        where: { candidateId_questionId: { candidateId, questionId: row.questionId } },
        select: { id: true },
      })
      if (!existing) {
        result.skipped += 1
        result.errors.push({
          row: row.rowNumber,
          externalCandidateId: row.externalCandidateId,
          message: '對應 response 不存在，請先匯入 responses',
        })
        continue
      }

      await prisma.candidateResponse.update({
        where: { id: existing.id },
        data: {
          speakingScore: row.speakingScore,
          pointsEarned: row.pointsEarned,
          speakingScoredAt: new Date(),
        },
      })

      result.updated += 1
    } catch (err) {
      result.skipped += 1
      result.errors.push({
        row: row.rowNumber,
        externalCandidateId: row.externalCandidateId,
        message: `寫入失敗: ${(err as Error).message}`,
      })
    }
  }

  await writeImportLog(prisma, examSessionId, 'speaking_scores', context, result)
  return result
}

// ========== 內部 helpers ==========

async function loadCandidateMap(prisma: PrismaClient, examSessionId: string) {
  const candidates = await prisma.candidate.findMany({
    where: { examSessionId },
    select: { id: true, externalCandidateId: true },
  })
  const map = new Map<string, string>()
  for (const c of candidates) map.set(c.externalCandidateId, c.id)
  return map
}

async function loadPaperQuestionIds(prisma: PrismaClient, examSessionId: string) {
  const sessionPapers = await prisma.examSessionPaper.findMany({
    where: { examSessionId },
    select: { examPaperId: true },
  })
  const paperIds = sessionPapers.map((sp) => sp.examPaperId)
  if (paperIds.length === 0) return new Set<string>()
  const pqs = await prisma.examPaperQuestion.findMany({
    where: { examPaperId: { in: paperIds } },
    select: { questionId: true },
  })
  return new Set(pqs.map((pq) => pq.questionId))
}
