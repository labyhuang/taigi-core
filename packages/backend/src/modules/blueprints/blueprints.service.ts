import type { PrismaClient, Prisma } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import type {
  CreateBlueprintBodyType,
  UpdateBlueprintBodyType,
  ListBlueprintsQueryType,
} from './blueprints.schema.js'
import { VALID_CATEGORY_TYPE_SUBTYPE_MAP } from '../questions/questions.schema.js'

function validateCells(
  examCategory: string,
  cells: CreateBlueprintBodyType['cells'],
  totalQuestions: number,
  totalScore: number,
) {
  const validTypes = VALID_CATEGORY_TYPE_SUBTYPE_MAP[examCategory]
  if (!validTypes) {
    throw new AppError(400, ErrorCode.VALIDATION, `不合法的考試類型: ${examCategory}`)
  }

  for (const cell of cells) {
    const validSubTypes = validTypes[cell.questionType]
    if (!validSubTypes || !validSubTypes.includes(cell.questionSubType)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_TYPE_COMBINATION,
        `不合法的題型組合: ${cell.questionType}/${cell.questionSubType} (examCategory: ${examCategory})`,
      )
    }
  }

  const sumQuestions = cells.reduce((s, c) => s + c.questionCount, 0)
  const sumScore = cells.reduce((s, c) => s + c.questionCount * c.scorePerQuestion, 0)

  if (sumQuestions !== totalQuestions) {
    throw new AppError(
      400,
      ErrorCode.BLUEPRINT_CELL_MISMATCH,
      `條件格題數總和 (${sumQuestions}) 不等於預期總題數 (${totalQuestions})`,
    )
  }
  if (Math.abs(sumScore - totalScore) > 0.001) {
    throw new AppError(
      400,
      ErrorCode.BLUEPRINT_CELL_MISMATCH,
      `條件格配分總和 (${sumScore}) 不等於預期總分 (${totalScore})`,
    )
  }
}

async function validateCriteria(
  prisma: PrismaClient,
  cells: CreateBlueprintBodyType['cells'],
) {
  const attrs = await prisma.attributeDefinition.findMany({
    include: { values: true },
  })
  const attrMap = new Map(attrs.map((a) => [a.key, a.values.map((v) => v.value)]))

  for (const cell of cells) {
    if (!cell.criteria) continue
    for (const [key, value] of Object.entries(cell.criteria)) {
      const validValues = attrMap.get(key)
      if (!validValues) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION,
          `不合法的屬性 key: ${key}，請確認 AttributeDefinition`,
        )
      }
      if (!validValues.includes(value)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION,
          `屬性 "${key}" 的值 "${value}" 不合法，合法值: ${validValues.join(', ')}`,
        )
      }
    }
  }
}

const blueprintDetailSelect = {
  id: true,
  name: true,
  examCategory: true,
  totalQuestions: true,
  totalScore: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  cells: {
    select: {
      id: true,
      orderIndex: true,
      questionType: true,
      questionSubType: true,
      criteria: true,
      questionCount: true,
      scorePerQuestion: true,
    },
    orderBy: { orderIndex: 'asc' as const },
  },
  generatedPapers: {
    select: { id: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ExamBlueprintSelect

export async function createBlueprint(
  prisma: PrismaClient,
  body: CreateBlueprintBodyType,
  userId: string,
) {
  validateCells(body.examCategory, body.cells, body.totalQuestions, body.totalScore)
  await validateCriteria(prisma, body.cells)

  return prisma.examBlueprint.create({
    data: {
      name: body.name,
      examCategory: body.examCategory as never,
      totalQuestions: body.totalQuestions,
      totalScore: body.totalScore,
      createdById: userId,
      cells: {
        create: body.cells.map((c) => ({
          orderIndex: c.orderIndex,
          questionType: c.questionType as never,
          questionSubType: c.questionSubType as never,
          criteria: (c.criteria ?? {}) as never,
          questionCount: c.questionCount,
          scorePerQuestion: c.scorePerQuestion,
        })),
      },
    },
    select: blueprintDetailSelect,
  })
}

export async function listBlueprints(
  prisma: PrismaClient,
  query: ListBlueprintsQueryType,
) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const where: Prisma.ExamBlueprintWhereInput = {}

  if (query.examCategory) {
    where.examCategory = query.examCategory as never
  }

  const [data, total] = await Promise.all([
    prisma.examBlueprint.findMany({
      where,
      select: {
        id: true,
        name: true,
        examCategory: true,
        totalQuestions: true,
        totalScore: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { generatedPapers: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.examBlueprint.count({ where }),
  ])

  return {
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getBlueprint(prisma: PrismaClient, id: string) {
  const bp = await prisma.examBlueprint.findUnique({
    where: { id },
    select: blueprintDetailSelect,
  })

  if (!bp) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該藍圖')
  }

  return bp
}

export async function updateBlueprint(
  prisma: PrismaClient,
  id: string,
  body: UpdateBlueprintBodyType,
) {
  const existing = await prisma.examBlueprint.findUnique({
    where: { id },
    include: { cells: true },
  })

  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該藍圖')
  }

  const examCategory = body.examCategory ?? existing.examCategory
  const totalQuestions = body.totalQuestions ?? existing.totalQuestions
  const totalScore = body.totalScore ?? existing.totalScore

  if (body.cells) {
    validateCells(examCategory, body.cells, totalQuestions, totalScore)
    await validateCriteria(prisma, body.cells)
  }

  return prisma.$transaction(async (tx) => {
    if (body.cells) {
      await tx.blueprintCell.deleteMany({ where: { blueprintId: id } })
      await tx.blueprintCell.createMany({
        data: body.cells!.map((c) => ({
          blueprintId: id,
          orderIndex: c.orderIndex,
          questionType: c.questionType as never,
          questionSubType: c.questionSubType as never,
          criteria: (c.criteria ?? {}) as never,
          questionCount: c.questionCount,
          scorePerQuestion: c.scorePerQuestion,
        })),
      })
    }

    return tx.examBlueprint.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.examCategory !== undefined && { examCategory: body.examCategory as never }),
        ...(body.totalQuestions !== undefined && { totalQuestions: body.totalQuestions }),
        ...(body.totalScore !== undefined && { totalScore: body.totalScore }),
      },
      select: blueprintDetailSelect,
    })
  })
}

export async function deleteBlueprint(prisma: PrismaClient, id: string) {
  const existing = await prisma.examBlueprint.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該藍圖')
  }

  await prisma.examBlueprint.delete({ where: { id } })
}

// Fisher-Yates Shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

export interface GeneratePaperOptions {
  // 預設 true：排除已被任何 PUBLISHED 考卷用過的題目（業務規則：考過題目不再考）
  excludeUsedQuestions?: boolean
}

export async function generatePaper(
  prisma: PrismaClient,
  blueprintId: string,
  paperName: string,
  userId: string,
  options: GeneratePaperOptions = {},
) {
  const excludeUsedQuestions = options.excludeUsedQuestions ?? true
  const blueprint = await prisma.examBlueprint.findUnique({
    where: { id: blueprintId },
    include: { cells: { orderBy: { orderIndex: 'asc' } } },
  })

  if (!blueprint) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該藍圖')
  }

  // 驗證一致性
  const sumQ = blueprint.cells.reduce((s, c) => s + c.questionCount, 0)
  const sumS = blueprint.cells.reduce((s, c) => s + c.questionCount * c.scorePerQuestion, 0)
  if (sumQ !== blueprint.totalQuestions || Math.abs(sumS - blueprint.totalScore) > 0.001) {
    throw new AppError(
      400,
      ErrorCode.BLUEPRINT_CELL_MISMATCH,
      '藍圖條件格與總題數/總分不一致，請先修正藍圖',
    )
  }

  const selectedQuestions: { questionId: string; score: number; orderIndex: number }[] = []
  const usedQuestionIds = new Set<string>()
  const warnings: string[] = []
  let globalOrder = 1

  for (const cell of blueprint.cells) {
    const criteria = cell.criteria as Record<string, string> | null

    // 組合 Prisma where 條件
    const whereConditions: Prisma.QuestionWhereInput = {
      category: blueprint.examCategory,
      type: cell.questionType,
      subType: cell.questionSubType,
      status: 'APPROVED',
      id: { notIn: [...usedQuestionIds] },
    }

    // Bug #2 修復 (spec-bugfixes.md §3)：
    // multi-criteria 必須 AND 全部滿足。原本的 spread 寫法每輪迴圈會覆蓋 path/equals，
    // 導致只有最後一筆 criteria 生效。改為展開為獨立的 attributes filter 陣列。
    if (criteria && Object.keys(criteria).length > 0) {
      whereConditions.AND = Object.entries(criteria).map(([key, value]) => ({
        attributes: {
          path: [key],
          equals: value,
        },
      })) as Prisma.QuestionWhereInput[]
    }

    // 注意：TSH_COMPREHENSION 為「單題」類型（非題組），spec-question-bank.md 第二部分有定義。
    // 不可誤判為 group type，否則 isGroupParent 過濾會抽不到任何題目。
    const isGroupType = ['COMPREHENSION', 'SPEECH'].includes(cell.questionSubType)

    if (isGroupType) {
      whereConditions.isGroupParent = true
    }

    // 業務規則：「考過的題目不再考」(spec-export.md §4.5)
    // 排除已被任何 PUBLISHED 考卷用過的題目（含父題與子題）。
    if (excludeUsedQuestions) {
      whereConditions.paperQuestions = {
        none: { examPaper: { status: 'PUBLISHED' } },
      }
    }

    const pool = await prisma.question.findMany({
      where: whereConditions,
      select: { id: true, isGroupParent: true },
    })

    const shuffled = shuffle(pool)
    const needed = cell.questionCount
    const picked = shuffled.slice(0, needed)

    if (picked.length < needed) {
      const criteriaStr = criteria ? JSON.stringify(criteria) : '{}'
      warnings.push(
        `${cell.questionType} - ${cell.questionSubType} (條件: ${criteriaStr}) 題庫不足，預期 ${needed} 題，實際僅抽出 ${picked.length} 題。`,
      )
    }

    for (const q of picked) {
      if (q.isGroupParent) {
        // 父題配分 0
        selectedQuestions.push({ questionId: q.id, score: 0, orderIndex: globalOrder++ })
        usedQuestionIds.add(q.id)

        // 撈出子題
        const children = await prisma.question.findMany({
          where: { groupId: q.id, status: 'APPROVED' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })

        for (const child of children) {
          selectedQuestions.push({
            questionId: child.id,
            score: cell.scorePerQuestion,
            orderIndex: globalOrder++,
          })
          usedQuestionIds.add(child.id)
        }
      } else {
        selectedQuestions.push({
          questionId: q.id,
          score: cell.scorePerQuestion,
          orderIndex: globalOrder++,
        })
        usedQuestionIds.add(q.id)
      }
    }
  }

  // 建立藍圖快照
  const blueprintSnapshot = {
    name: blueprint.name,
    examCategory: blueprint.examCategory,
    totalQuestions: blueprint.totalQuestions,
    totalScore: blueprint.totalScore,
    cells: blueprint.cells.map((c) => ({
      orderIndex: c.orderIndex,
      questionType: c.questionType,
      questionSubType: c.questionSubType,
      criteria: c.criteria,
      questionCount: c.questionCount,
      scorePerQuestion: c.scorePerQuestion,
    })),
  }

  const paper = await prisma.examPaper.create({
    data: {
      blueprintId,
      name: paperName,
      status: 'DRAFT',
      blueprintSnapshot: blueprintSnapshot as never,
      createdById: userId,
      questions: {
        create: selectedQuestions.map((sq) => ({
          questionId: sq.questionId,
          orderIndex: sq.orderIndex,
          score: sq.score,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  })

  return {
    ...paper,
    questionCount: selectedQuestions.length,
    warnings,
  }
}
