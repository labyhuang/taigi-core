import { Prisma, type PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import type { ListPapersQueryType } from './papers.schema.js'

const paperDetailSelect = {
  id: true,
  name: true,
  status: true,
  blueprintId: true,
  blueprintSnapshot: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  blueprint: { select: { id: true, name: true } },
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
                select: { id: true, filename: true, mimeType: true, durationSeconds: true },
              },
            },
          },
        },
      },
    },
    orderBy: { orderIndex: 'asc' as const },
  },
} satisfies Prisma.ExamPaperSelect

function ensureDraft(status: string) {
  if (status !== 'DRAFT') {
    throw new AppError(400, ErrorCode.PAPER_ALREADY_PUBLISHED, '已發布的考卷不可修改')
  }
}

/** 避免並發替換題目時 orderIndex / 考卷內容競態（Phase 6） */
const REPLACE_QUESTION_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 20000,
} as const

export async function listPapers(prisma: PrismaClient, query: ListPapersQueryType) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const where: Prisma.ExamPaperWhereInput = {}

  if (query.status) where.status = query.status as never
  if (query.blueprintId) where.blueprintId = query.blueprintId

  const [data, total] = await Promise.all([
    prisma.examPaper.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        blueprintId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        blueprint: { select: { id: true, name: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.examPaper.count({ where }),
  ])

  return {
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getPaper(prisma: PrismaClient, id: string) {
  const paper = await prisma.examPaper.findUnique({
    where: { id },
    select: paperDetailSelect,
  })

  if (!paper) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  }

  return paper
}

export async function updatePaper(prisma: PrismaClient, id: string, name: string) {
  const paper = await prisma.examPaper.findUnique({ where: { id } })
  if (!paper) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  ensureDraft(paper.status)

  return prisma.examPaper.update({
    where: { id },
    data: { name },
    select: paperDetailSelect,
  })
}

export async function publishPaper(prisma: PrismaClient, id: string) {
  const paper = await prisma.examPaper.findUnique({ where: { id } })
  if (!paper) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  ensureDraft(paper.status)

  return prisma.examPaper.update({
    where: { id },
    data: { status: 'PUBLISHED' },
    select: paperDetailSelect,
  })
}

export async function deletePaper(prisma: PrismaClient, id: string) {
  const paper = await prisma.examPaper.findUnique({ where: { id } })
  if (!paper) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  ensureDraft(paper.status)

  await prisma.examPaper.delete({ where: { id } })
}

export async function replacePaperQuestion(
  prisma: PrismaClient,
  paperId: string,
  oldQuestionId: string,
  newQuestionId: string,
) {
  return prisma.$transaction(async (tx) => {
    const paper = await tx.examPaper.findUnique({
      where: { id: paperId },
      include: { questions: true },
    })
    if (!paper) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
    ensureDraft(paper.status)

    const existingPQ = paper.questions.find((pq) => pq.questionId === oldQuestionId)
    if (!existingPQ) {
      throw new AppError(404, ErrorCode.NOT_FOUND, '該題目不在此考卷中')
    }

    const alreadyInPaper = paper.questions.some((pq) => pq.questionId === newQuestionId)
    if (alreadyInPaper) {
      throw new AppError(400, ErrorCode.QUESTION_ALREADY_IN_PAPER, '新題目已存在於此考卷中')
    }

    const [oldQuestion, newQuestion] = await Promise.all([
      tx.question.findUnique({
        where: { id: oldQuestionId },
        select: { id: true, category: true, type: true, subType: true, isGroupParent: true },
      }),
      tx.question.findUnique({
        where: { id: newQuestionId },
        select: {
          id: true,
          category: true,
          type: true,
          subType: true,
          status: true,
          isGroupParent: true,
        },
      }),
    ])

    if (!oldQuestion) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到原題目')
    if (!newQuestion) throw new AppError(404, ErrorCode.NOT_FOUND, '找不到新題目')

    if (newQuestion.status !== 'APPROVED') {
      throw new AppError(400, ErrorCode.VALIDATION, '新題目必須為已核可狀態')
    }

    if (
      newQuestion.category !== oldQuestion.category ||
      newQuestion.type !== oldQuestion.type ||
      newQuestion.subType !== oldQuestion.subType
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION,
        '新題目的 category/type/subType 必須與被替換的題目一致',
      )
    }

    if (oldQuestion.isGroupParent) {
      const oldChildren = await tx.question.findMany({
        where: { groupId: oldQuestionId },
        select: { id: true },
      })
      const oldChildIds = oldChildren.map((c) => c.id)

      await tx.examPaperQuestion.deleteMany({
        where: {
          examPaperId: paperId,
          questionId: { in: [oldQuestionId, ...oldChildIds] },
        },
      })

      const newChildren = await tx.question.findMany({
        where: { groupId: newQuestionId, status: 'APPROVED' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })

      const startOrder = existingPQ.orderIndex
      const newEntries = [
        { examPaperId: paperId, questionId: newQuestionId, orderIndex: startOrder, score: 0 },
        ...newChildren.map((c, i) => ({
          examPaperId: paperId,
          questionId: c.id,
          orderIndex: startOrder + i + 1,
          score: existingPQ.score || 0,
        })),
      ]

      const shift = newEntries.length - (1 + oldChildIds.length)
      if (shift !== 0) {
        const laterPQs = paper.questions.filter(
          (pq) =>
            pq.orderIndex > existingPQ.orderIndex + oldChildIds.length &&
            !oldChildIds.includes(pq.questionId) &&
            pq.questionId !== oldQuestionId,
        )
        for (const pq of laterPQs) {
          await tx.examPaperQuestion.update({
            where: { id: pq.id },
            data: { orderIndex: pq.orderIndex + shift },
          })
        }
      }

      await tx.examPaperQuestion.createMany({ data: newEntries })

      return tx.examPaper.findUnique({
        where: { id: paperId },
        select: paperDetailSelect,
      })
    }

    await tx.examPaperQuestion.update({
      where: { id: existingPQ.id },
      data: { questionId: newQuestionId },
    })

    return tx.examPaper.findUnique({
      where: { id: paperId },
      select: paperDetailSelect,
    })
  }, REPLACE_QUESTION_TX)
}
