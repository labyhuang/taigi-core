/**
 * ExamSession 服務（spec-exam-session.md §4 / §3 狀態機）
 *
 * 涵蓋：
 *   - CRUD（含狀態鎖定）
 *   - 綁定 / 解綁 paper
 *   - 變更狀態（MARK_IMPORTED / ARCHIVE）
 */

import type { PrismaClient, Prisma } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import type {
  CreateExamSessionBodyType,
  UpdateExamSessionBodyType,
  ListExamSessionsQueryType,
  BindPaperBodyType,
} from './exam-sessions.schema.js'

const VALID_EXAM_CATEGORIES = ['GTPT', 'TSH'] as const
type ExamCategoryValue = (typeof VALID_EXAM_CATEGORIES)[number]

function assertExamCategory(value: string): ExamCategoryValue {
  if (!(VALID_EXAM_CATEGORIES as readonly string[]).includes(value)) {
    throw new AppError(400, ErrorCode.VALIDATION, `不合法的 examCategory: ${value}`)
  }
  return value as ExamCategoryValue
}

const sessionListSelect = {
  id: true,
  name: true,
  examCategory: true,
  examDate: true,
  status: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { papers: true, candidates: true, responses: true } },
} as const satisfies Prisma.ExamSessionSelect

const sessionDetailSelect = {
  ...sessionListSelect,
  papers: {
    select: {
      paperVariant: true,
      attachedAt: true,
      examPaper: {
        select: { id: true, name: true, status: true },
      },
    },
    orderBy: { attachedAt: 'asc' as const },
  },
} as const satisfies Prisma.ExamSessionSelect

// ========== Helpers ==========

function ensureNotArchived(session: { status: string }) {
  if (session.status === 'ARCHIVED') {
    throw new AppError(
      403,
      ErrorCode.EXAM_SESSION_LOCKED,
      '此考期已封存，無法修改',
    )
  }
}

function ensureDraft(session: { status: string }, message: string) {
  if (session.status !== 'DRAFT') {
    throw new AppError(403, ErrorCode.EXAM_SESSION_LOCKED, message)
  }
}

async function getSessionOrThrow(prisma: PrismaClient, id: string) {
  const session = await prisma.examSession.findUnique({ where: { id } })
  if (!session) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考期')
  }
  return session
}

// ========== CRUD ==========

export async function createExamSession(
  prisma: PrismaClient,
  body: CreateExamSessionBodyType,
  userId: string,
) {
  const examCategory = assertExamCategory(body.examCategory)
  const created = await prisma.examSession.create({
    data: {
      name: body.name,
      examCategory,
      examDate: new Date(body.examDate),
      description: body.description ?? null,
      createdById: userId,
    },
    select: sessionDetailSelect,
  })
  return created
}

export async function listExamSessions(
  prisma: PrismaClient,
  query: ListExamSessionsQueryType,
) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20

  const where: Prisma.ExamSessionWhereInput = {}
  if (query.examCategory) {
    where.examCategory = assertExamCategory(query.examCategory)
  }
  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    if (statuses.length > 0) {
      where.status = { in: statuses as never }
    }
  }

  const [data, total] = await Promise.all([
    prisma.examSession.findMany({
      where,
      select: sessionListSelect,
      orderBy: { examDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.examSession.count({ where }),
  ])

  return {
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getExamSession(prisma: PrismaClient, id: string) {
  const session = await prisma.examSession.findUnique({
    where: { id },
    select: sessionDetailSelect,
  })
  if (!session) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考期')
  }

  // 匯入摘要
  const [responsesWithSpeaking, latestResponse, latestCandidate] = await Promise.all([
    prisma.candidateResponse.count({
      where: { examSessionId: id, speakingScore: { not: null } },
    }),
    prisma.candidateResponse.findFirst({
      where: { examSessionId: id },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true },
    }),
    prisma.candidate.findFirst({
      where: { examSessionId: id },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true },
    }),
  ])

  // 兩者中較晚的時間
  const lastImportedAt =
    [latestResponse?.importedAt, latestCandidate?.importedAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    ...session,
    importsSummary: {
      totalCandidates: session._count.candidates,
      totalResponses: session._count.responses,
      responsesWithSpeakingScore: responsesWithSpeaking,
      lastImportedAt,
    },
  }
}

export async function updateExamSession(
  prisma: PrismaClient,
  id: string,
  body: UpdateExamSessionBodyType,
) {
  const session = await getSessionOrThrow(prisma, id)
  ensureNotArchived(session)

  // IMPORTED 狀態下只能改 name / description
  if (session.status === 'IMPORTED') {
    if (body.examCategory !== undefined || body.examDate !== undefined) {
      throw new AppError(
        403,
        ErrorCode.EXAM_SESSION_LOCKED,
        '已匯入資料的考期僅能修改名稱與備註',
      )
    }
  }

  const data: Prisma.ExamSessionUpdateInput = {}
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description
  if (body.examCategory !== undefined) {
    data.examCategory = assertExamCategory(body.examCategory)
  }
  if (body.examDate !== undefined) {
    data.examDate = new Date(body.examDate)
  }

  return prisma.examSession.update({
    where: { id },
    data,
    select: sessionDetailSelect,
  })
}

export async function updateExamSessionStatus(
  prisma: PrismaClient,
  id: string,
  action: 'MARK_IMPORTED' | 'ARCHIVE',
) {
  const session = await getSessionOrThrow(prisma, id)

  if (action === 'MARK_IMPORTED') {
    if (session.status !== 'DRAFT') {
      throw new AppError(
        403,
        ErrorCode.EXAM_SESSION_LOCKED,
        '只有草稿狀態的考期可以標記為已匯入',
      )
    }
    const [paperCount, candidateCount] = await Promise.all([
      prisma.examSessionPaper.count({ where: { examSessionId: id } }),
      prisma.candidate.count({ where: { examSessionId: id } }),
    ])
    if (paperCount === 0) {
      throw new AppError(400, ErrorCode.VALIDATION, '至少需綁定 1 份考卷')
    }
    if (candidateCount === 0) {
      throw new AppError(400, ErrorCode.VALIDATION, '尚未匯入任何考生資料')
    }
    return prisma.examSession.update({
      where: { id },
      data: { status: 'IMPORTED' },
      select: sessionDetailSelect,
    })
  }

  // ARCHIVE
  if (session.status !== 'IMPORTED') {
    throw new AppError(
      403,
      ErrorCode.EXAM_SESSION_LOCKED,
      '只有已匯入狀態的考期可以封存',
    )
  }
  return prisma.examSession.update({
    where: { id },
    data: { status: 'ARCHIVED' },
    select: sessionDetailSelect,
  })
}

export async function deleteExamSession(prisma: PrismaClient, id: string) {
  const session = await getSessionOrThrow(prisma, id)
  ensureDraft(session, '只有草稿狀態的考期可以刪除')
  await prisma.examSession.delete({ where: { id } })
}

// ========== Bind / Unbind paper ==========

export async function bindPaper(
  prisma: PrismaClient,
  sessionId: string,
  body: BindPaperBodyType,
) {
  const session = await getSessionOrThrow(prisma, sessionId)
  ensureDraft(session, '只有草稿狀態的考期可以綁定考卷')

  const paper = await prisma.examPaper.findUnique({
    where: { id: body.examPaperId },
    select: {
      id: true,
      status: true,
      blueprintSnapshot: true,
      blueprint: { select: { examCategory: true } },
    },
  })
  if (!paper) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  }
  if (paper.status !== 'PUBLISHED') {
    throw new AppError(
      400,
      ErrorCode.VALIDATION,
      '考卷必須先發布 (PUBLISHED) 才能綁到考期',
    )
  }

  // 比對 examCategory：優先 blueprint 反查，藍圖刪除時退回 snapshot
  const snapshot = paper.blueprintSnapshot as { examCategory?: string } | null
  const paperCategory = paper.blueprint?.examCategory ?? snapshot?.examCategory
  if (paperCategory !== session.examCategory) {
    throw new AppError(
      400,
      ErrorCode.EXAM_SESSION_PAPER_MISMATCH,
      `考卷類別 (${paperCategory ?? '未知'}) 與考期類別 (${session.examCategory}) 不符`,
    )
  }

  // paper 已綁過此 session
  const existing = await prisma.examSessionPaper.findUnique({
    where: {
      examSessionId_examPaperId: {
        examSessionId: sessionId,
        examPaperId: body.examPaperId,
      },
    },
  })
  if (existing) {
    throw new AppError(409, ErrorCode.DUPLICATE, '此考卷已綁定到本考期')
  }

  // paperVariant 重複（DB 也有 unique，但這裡先攔，回 409 自訂訊息）
  if (body.paperVariant) {
    const variantTaken = await prisma.examSessionPaper.findFirst({
      where: { examSessionId: sessionId, paperVariant: body.paperVariant },
    })
    if (variantTaken) {
      throw new AppError(
        409,
        ErrorCode.PAPER_VARIANT_DUPLICATE,
        `本考期已有 paperVariant=${body.paperVariant} 的考卷`,
      )
    }
  }

  await prisma.examSessionPaper.create({
    data: {
      examSessionId: sessionId,
      examPaperId: body.examPaperId,
      paperVariant: body.paperVariant ?? null,
    },
  })

  return getExamSession(prisma, sessionId)
}

export async function unbindPaper(
  prisma: PrismaClient,
  sessionId: string,
  paperId: string,
) {
  const session = await getSessionOrThrow(prisma, sessionId)
  ensureDraft(session, '只有草稿狀態的考期可以解綁考卷')

  const link = await prisma.examSessionPaper.findUnique({
    where: {
      examSessionId_examPaperId: {
        examSessionId: sessionId,
        examPaperId: paperId,
      },
    },
  })
  if (!link) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '此考卷未綁定到本考期')
  }

  await prisma.examSessionPaper.delete({
    where: {
      examSessionId_examPaperId: {
        examSessionId: sessionId,
        examPaperId: paperId,
      },
    },
  })

  return getExamSession(prisma, sessionId)
}

// ========== 匯入歷程 ==========

export async function listImportLogs(prisma: PrismaClient, sessionId: string) {
  await getSessionOrThrow(prisma, sessionId)
  return prisma.importLog.findMany({
    where: { examSessionId: sessionId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      importType: true,
      sourceFormat: true,
      actorType: true,
      actorId: true,
      totalRows: true,
      inserted: true,
      updated: true,
      skipped: true,
      errors: true,
      createdAt: true,
    },
  })
}
