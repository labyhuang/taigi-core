import type { PrismaClient, Prisma } from '../../generated/prisma/index.js'
import { QuestionStatus, ReviewAction } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import {
  VALID_CATEGORY_TYPE_SUBTYPE_MAP,
  AUDIO_REQUIRED_SUBTYPES,
  IMAGE_REQUIRED_SUBTYPES,
  MULTIPLE_CHOICE_SUBTYPES,
  IMAGE_OPTION_SUBTYPES,
  GROUP_SUBTYPES,
  TRANSCRIPT_REQUIRED_SUBTYPES,
  STEM_REQUIRED_SUBTYPES,
  RUBRIC_SUBTYPES,
} from './questions.schema.js'
import type { CreateQuestionBodyType, UpdateQuestionBodyType, ListQuestionsQueryType } from './questions.schema.js'
import {
  validateAttributesShape,
  validateAttributesRequired,
} from '../attributes/attributes.validation.js'

// ========== Status 變更動作 → 所需權限對照表 ==========
// Bug #3 修復 (spec-bugfixes.md §4 / spec-question-bank.md §第三部分 2.1)：
// route 層只擋登入；實際權限由 service 層依 action 動態檢查，避免單一 permission 越權。
const STATUS_ACTION_PERMISSION: Record<string, string> = {
  [ReviewAction.SUBMIT]: 'question:submit',
  [ReviewAction.APPROVE]: 'question:approve',
  [ReviewAction.REJECT]: 'question:reject',
  [ReviewAction.ARCHIVE]: 'system:manage',
}

// ========== 合法狀態轉換表 ==========

const VALID_TRANSITIONS: Record<string, { target: QuestionStatus; action: ReviewAction }[]> = {
  [QuestionStatus.DRAFT]: [
    { target: QuestionStatus.PENDING, action: ReviewAction.SUBMIT },
  ],
  [QuestionStatus.PENDING]: [
    { target: QuestionStatus.APPROVED, action: ReviewAction.APPROVE },
    { target: QuestionStatus.REJECTED, action: ReviewAction.REJECT },
  ],
  [QuestionStatus.REJECTED]: [
    { target: QuestionStatus.PENDING, action: ReviewAction.SUBMIT },
    { target: QuestionStatus.ARCHIVED, action: ReviewAction.ARCHIVE },
  ],
  [QuestionStatus.APPROVED]: [
    { target: QuestionStatus.ARCHIVED, action: ReviewAction.ARCHIVE },
  ],
  [QuestionStatus.ARCHIVED]: [],
}

// ========== 驗證工具 ==========

export function validateCategoryTypeSubType(category: string, type: string, subType: string): void {
  const typeMap = VALID_CATEGORY_TYPE_SUBTYPE_MAP[category]
  if (!typeMap) {
    throw new AppError(400, ErrorCode.INVALID_TYPE_COMBINATION,
      `不合法的考試類型: ${category}`)
  }
  const allowed = typeMap[type]
  if (!allowed || !allowed.includes(subType)) {
    throw new AppError(400, ErrorCode.INVALID_TYPE_COMBINATION,
      `不合法的 category/type/subType 組合: ${category}/${type}/${subType}`)
  }
}

function validateSubmitStrict(
  question: {
    subType: string
    stem: string | null
    content: Prisma.JsonValue | null
    answer: Prisma.JsonValue | null
    isGroupParent: boolean
  },
  mediaList: { purpose: string }[],
): void {
  const { subType, stem, content, answer, isGroupParent } = question

  // 題組父題只驗證 stem
  if (isGroupParent) {
    if (STEM_REQUIRED_SUBTYPES.includes(subType) || GROUP_SUBTYPES.includes(subType)) {
      if (!stem || stem.trim().length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION, '題組父題的題幹 (stem) 為必填')
      }
    }
    return
  }

  // 驗證 stem
  if (STEM_REQUIRED_SUBTYPES.includes(subType)) {
    if (!stem || stem.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION, '此題型的題幹 (stem) 為必填')
    }
  }

  // 驗證音檔
  if (AUDIO_REQUIRED_SUBTYPES.includes(subType)) {
    const hasAudio = mediaList.some((m) => m.purpose === 'AUDIO')
    if (!hasAudio) {
      throw new AppError(400, ErrorCode.MEDIA_REQUIRED, '此題型需要上傳音檔')
    }
  }

  // 驗證題幹圖片
  if (IMAGE_REQUIRED_SUBTYPES.includes(subType)) {
    const hasImage = mediaList.some((m) => m.purpose === 'IMAGE')
    if (!hasImage) {
      throw new AppError(400, ErrorCode.MEDIA_REQUIRED, '此題型需要上傳圖片')
    }
  }

  // IMAGE_PICK_ANSWER 需同時有 AUDIO + IMAGE
  if (subType === 'IMAGE_PICK_ANSWER') {
    const hasAudio = mediaList.some((m) => m.purpose === 'AUDIO')
    const hasImage = mediaList.some((m) => m.purpose === 'IMAGE')
    if (!hasAudio || !hasImage) {
      throw new AppError(400, ErrorCode.MEDIA_REQUIRED, '看圖揀話題型需同時上傳音檔和圖片')
    }
  }

  // 驗證圖片選項 (LISTEN_PICK_IMAGE)
  if (IMAGE_OPTION_SUBTYPES.includes(subType)) {
    const contentObj = content as { options?: { id: string; mediaId?: string }[] } | null
    if (!contentObj?.options || contentObj.options.length !== 4) {
      throw new AppError(400, ErrorCode.VALIDATION, '送審時圖片選項數量必須恰好為 4 個')
    }
    for (const opt of contentObj.options) {
      if (!opt.mediaId) {
        throw new AppError(400, ErrorCode.MEDIA_REQUIRED, '聽話揀圖的每個選項皆須有圖片 (mediaId)')
      }
    }
    const answerObj = answer as { correctOptionIds?: string[] } | null
    if (!answerObj?.correctOptionIds || answerObj.correctOptionIds.length !== 1) {
      throw new AppError(400, ErrorCode.VALIDATION, '必須設定恰好 1 個正確答案')
    }
  }

  // 驗證文字選擇題選項
  if (MULTIPLE_CHOICE_SUBTYPES.includes(subType)) {
    const contentObj = content as { options?: { id: string; text: string }[] } | null
    if (!contentObj?.options || contentObj.options.length !== 4) {
      throw new AppError(400, ErrorCode.VALIDATION, '送審時選項數量必須恰好為 4 個')
    }
    const answerObj = answer as { correctOptionIds?: string[]; transcript?: string } | null
    if (!answerObj?.correctOptionIds || answerObj.correctOptionIds.length !== 1) {
      throw new AppError(400, ErrorCode.VALIDATION, '必須設定恰好 1 個正確答案')
    }
    if (TRANSCRIPT_REQUIRED_SUBTYPES.includes(subType)) {
      if (!answerObj.transcript || answerObj.transcript.trim().length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION, '此題型的逐字稿 (transcript) 為必填')
      }
    }
  }

  // 驗證聽寫題
  if (subType === 'DICTATION_FILL') {
    const answerObj = answer as { correctText?: string } | null
    if (!answerObj?.correctText || answerObj.correctText.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION, '聽寫題的正確答案 (correctText) 為必填')
    }
  }

  // 驗證口說題
  if (RUBRIC_SUBTYPES.includes(subType)) {
    const answerObj = answer as { gradingRubric?: string } | null
    if (!answerObj?.gradingRubric || answerObj.gradingRubric.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION, '此題型的評分標準 (gradingRubric) 為必填')
    }
  }
}

// ========== 共用 select ==========

const questionListSelect = {
  id: true,
  category: true,
  type: true,
  subType: true,
  textSystem: true,
  stem: true,
  status: true,
  attributes: true,
  isGroupParent: true,
  author: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuestionSelect

const questionDetailSelect = {
  id: true,
  category: true,
  type: true,
  subType: true,
  textSystem: true,
  stem: true,
  status: true,
  content: true,
  answer: true,
  attributes: true,
  isGroupParent: true,
  groupId: true,
  author: { select: { id: true, name: true } },
  lastReviewer: { select: { id: true, name: true } },
  questionMedia: {
    select: {
      purpose: true,
      media: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          durationSeconds: true,
        },
      },
    },
  },
  reviewLogs: {
    select: {
      id: true,
      action: true,
      comment: true,
      user: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  children: {
    select: {
      id: true,
      stem: true,
      status: true,
      content: true,
      answer: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuestionSelect

// ========== 權限 / 範圍判斷 helpers ==========

/**
 * Bug #4 修復 (spec-bugfixes.md §5 / spec-question-bank.md §第三部分 1.2)：
 * 預設拒絕原則 — 純讀者（含 ASSEMBLER）只能看到 APPROVED 題目。
 * 優先級：Admin > Reviewer > Author > 預設純讀者。
 */
function buildQuestionListScope(sessionUser: { id: string; permissions: string[] }): Prisma.QuestionWhereInput {
  const perms = sessionUser.permissions
  if (perms.includes('system:manage')) {
    return {}
  }
  if (perms.includes('question:approve')) {
    return { status: QuestionStatus.PENDING }
  }
  if (perms.includes('question:create')) {
    return { authorId: sessionUser.id }
  }
  return { status: QuestionStatus.APPROVED }
}

/**
 * 取得單題時的可見性檢查（Bug #4 / spec-question-bank.md §第三部分 1.3）。
 * 不符可見性回 403 ERR_FORBIDDEN。
 */
function assertQuestionVisibleTo(
  question: { status: QuestionStatus; author: { id: string } | null; authorId?: string | null },
  sessionUser: { id: string; permissions: string[] },
): void {
  const perms = sessionUser.permissions
  if (perms.includes('system:manage')) return

  const authorId = question.author?.id ?? question.authorId ?? null

  if (perms.includes('question:create') && authorId === sessionUser.id) return
  if (perms.includes('question:approve') && question.status === QuestionStatus.PENDING) return
  if (question.status === QuestionStatus.APPROVED) return

  throw new AppError(403, ErrorCode.FORBIDDEN, '無權檢視此題目')
}

// ========== Service Functions ==========

export async function createQuestion(
  prisma: PrismaClient,
  body: CreateQuestionBodyType,
  authorId: string,
) {
  validateCategoryTypeSubType(body.category, body.type, body.subType)
  // Bug #6 (spec-bugfixes.md §7)：建立草稿時也要驗 attributes shape，避免不合法值入庫。
  await validateAttributesShape(prisma, body.attributes)

  const isGroupParent = GROUP_SUBTYPES.includes(body.subType) && !body.groupId

  if (body.groupId) {
    const parent = await prisma.question.findUnique({ where: { id: body.groupId } })
    if (!parent) {
      throw new AppError(404, ErrorCode.NOT_FOUND, '指定的父題不存在')
    }
    if (!parent.isGroupParent) {
      throw new AppError(400, ErrorCode.VALIDATION, '指定的題目不是題組父題')
    }
  }

  // Bug #7 (spec-bugfixes.md §8)：Question 與初始 ReviewLog 須原子寫入。
  return prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        category: body.category as Prisma.QuestionCreateInput['category'],
        type: body.type as Prisma.QuestionCreateInput['type'],
        subType: body.subType as Prisma.QuestionCreateInput['subType'],
        textSystem: body.textSystem as Prisma.QuestionCreateInput['textSystem'],
        stem: body.stem ?? null,
        content: body.content ?? undefined,
        answer: body.answer ?? undefined,
        attributes: (body.attributes ?? {}) as Prisma.InputJsonValue,
        isGroupParent,
        groupId: body.groupId ?? null,
        authorId,
        questionMedia: body.mediaIds?.length
          ? {
              create: body.mediaIds.map((m) => ({
                mediaId: m.mediaId,
                purpose: m.purpose,
              })),
            }
          : undefined,
      },
      select: questionDetailSelect,
    })

    await tx.questionReviewLog.create({
      data: {
        questionId: question.id,
        userId: authorId,
        action: ReviewAction.CREATE,
        comment: null,
      },
    })

    return question
  })
}

export async function listQuestions(
  prisma: PrismaClient,
  query: ListQuestionsQueryType,
  sessionUser: { id: string; permissions: string[] },
) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const skip = (page - 1) * pageSize

  // Bug #4 修復：以「預設拒絕」的角色 scope 起手，純讀者 (ASSEMBLER) 自動只看 APPROVED。
  const where: Prisma.QuestionWhereInput = { ...buildQuestionListScope(sessionUser) }

  if (query.category) where.category = query.category as Prisma.QuestionWhereInput['category']
  if (query.status) {
    const statuses = query.status.split(',') as QuestionStatus[]
    // 若使用者帶 status 篩選，與 scope 取交集（避免越權）：
    // - Admin scope 無限制 → 直接覆蓋為使用者選擇
    // - 非 Admin → 取交集，確保 status 不超出 scope 允許範圍
    if (sessionUser.permissions.includes('system:manage')) {
      where.status = { in: statuses }
    } else {
      const allowed = where.status
      if (typeof allowed === 'string') {
        where.status = statuses.includes(allowed) ? allowed : { in: [] }
      } else {
        where.status = { in: statuses }
      }
    }
  }
  if (query.type) where.type = query.type as Prisma.QuestionWhereInput['type']
  if (query.subType) where.subType = query.subType as Prisma.QuestionWhereInput['subType']
  if (query.groupId) where.groupId = query.groupId
  if (query.authorId) where.authorId = query.authorId

  if (!query.groupId) {
    where.groupId = null
  }

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: questionListSelect,
    }),
    prisma.question.count({ where }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  return {
    data: questions,
    meta: { total, page, pageSize, totalPages },
  }
}

export async function getQuestion(
  prisma: PrismaClient,
  id: string,
  sessionUser: { id: string; permissions: string[] },
) {
  const question = await prisma.question.findUnique({
    where: { id },
    select: questionDetailSelect,
  })

  if (!question) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '題目不存在')
  }

  // Bug #4 修復：依角色檢查可見性，純讀者只能看 APPROVED。
  assertQuestionVisibleTo(
    { status: question.status, author: question.author },
    sessionUser,
  )

  return question
}

export async function updateQuestion(
  prisma: PrismaClient,
  id: string,
  body: UpdateQuestionBodyType,
  sessionUser: { id: string; permissions: string[] },
) {
  const question = await prisma.question.findUnique({
    where: { id },
    select: { id: true, status: true, authorId: true, category: true, type: true, subType: true },
  })
  if (!question) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '題目不存在')
  }

  const isAdmin = sessionUser.permissions.includes('system:manage')

  if (!isAdmin) {
    if (question.authorId !== sessionUser.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, '您只能編輯自己建立的題目')
    }
    if (question.status !== QuestionStatus.DRAFT && question.status !== QuestionStatus.REJECTED) {
      throw new AppError(403, ErrorCode.QUESTION_READONLY, '題目已送審或已核可，無法編輯')
    }
  }

  // 若更新了 type 或 subType，驗證組合合法性（category 不可變更）
  const finalType = body.type ?? question.type
  const finalSubType = body.subType ?? question.subType
  if (body.type || body.subType) {
    validateCategoryTypeSubType(question.category, finalType, finalSubType)
  }

  // Bug #6 (spec-bugfixes.md §7)：更新 attributes 時也要驗 shape。
  if (body.attributes !== undefined) {
    await validateAttributesShape(prisma, body.attributes)
  }

  const updateData: Prisma.QuestionUpdateInput = {}
  if (body.type !== undefined) updateData.type = body.type as Prisma.QuestionUpdateInput['type']
  if (body.subType !== undefined) updateData.subType = body.subType as Prisma.QuestionUpdateInput['subType']
  if (body.stem !== undefined) updateData.stem = body.stem
  if (body.content !== undefined) updateData.content = body.content as Prisma.InputJsonValue
  if (body.answer !== undefined) updateData.answer = body.answer as Prisma.InputJsonValue
  if (body.attributes !== undefined) updateData.attributes = body.attributes as Prisma.InputJsonValue

  if (body.mediaIds) {
    await prisma.questionMedia.deleteMany({ where: { questionId: id } })
    if (body.mediaIds.length > 0) {
      await prisma.questionMedia.createMany({
        data: body.mediaIds.map((m) => ({
          questionId: id,
          mediaId: m.mediaId,
          purpose: m.purpose,
        })),
      })
    }
  }

  const updated = await prisma.question.update({
    where: { id },
    data: updateData,
    select: questionDetailSelect,
  })

  return updated
}

export async function deleteQuestion(
  prisma: PrismaClient,
  id: string,
  sessionUser: { id: string; permissions: string[] },
) {
  const question = await prisma.question.findUnique({
    where: { id },
    select: { id: true, status: true, authorId: true, isGroupParent: true },
  })
  if (!question) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '題目不存在')
  }

  const isAdmin = sessionUser.permissions.includes('system:manage')

  if (!isAdmin && question.status !== QuestionStatus.DRAFT) {
    throw new AppError(403, ErrorCode.QUESTION_READONLY, '僅草稿狀態的題目可以刪除')
  }

  if (question.isGroupParent) {
    await prisma.question.deleteMany({ where: { groupId: id } })
  }

  await prisma.question.delete({ where: { id } })
}

export async function updateQuestionStatus(
  prisma: PrismaClient,
  id: string,
  action: string,
  comment: string | undefined,
  sessionUser: { id: string; permissions: string[] },
) {
  const reviewAction = action as ReviewAction
  if (!Object.values(ReviewAction).includes(reviewAction)) {
    throw new AppError(400, ErrorCode.VALIDATION, `不合法的動作: ${action}`)
  }

  // Bug #3 修復 (spec-bugfixes.md §4)：依 action 動態檢查權限。
  // CREATE 為內部建立草稿時自動寫入的 log action，不允許從此 endpoint 觸發。
  if (reviewAction === ReviewAction.CREATE) {
    throw new AppError(400, ErrorCode.VALIDATION, 'CREATE 為內部動作，無法透過 status 端點觸發')
  }
  const requiredPerm = STATUS_ACTION_PERMISSION[reviewAction]
  if (!requiredPerm) {
    throw new AppError(400, ErrorCode.VALIDATION, `不合法的動作: ${action}`)
  }
  if (!sessionUser.permissions.includes(requiredPerm)) {
    throw new AppError(403, ErrorCode.FORBIDDEN, `此動作需要 ${requiredPerm} 權限`)
  }

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      questionMedia: { select: { purpose: true } },
    },
  })
  if (!question) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '題目不存在')
  }

  if (question.groupId) {
    throw new AppError(400, ErrorCode.GROUP_CHILD_NO_INDEPENDENT_STATUS,
      '子題不可獨立變更狀態，須透過父題操作')
  }

  const transitions = VALID_TRANSITIONS[question.status] ?? []
  const transition = transitions.find((t) => t.action === reviewAction)
  if (!transition) {
    throw new AppError(400, ErrorCode.INVALID_STATUS_TRANSITION,
      `不合法的狀態轉換: ${question.status} → ${action}`)
  }

  if (reviewAction === ReviewAction.SUBMIT) {
    if (question.authorId !== sessionUser.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, '您只能送審自己建立的題目')
    }
    validateSubmitStrict(question, question.questionMedia)
    // Bug #6 (spec-bugfixes.md §7)：送審時須驗必填屬性。
    await validateAttributesRequired(
      prisma,
      question.category,
      question.attributes as Record<string, unknown> | null,
    )

    if (question.isGroupParent) {
      const children = await prisma.question.findMany({
        where: { groupId: id },
        include: { questionMedia: { select: { purpose: true } } },
      })
      if (children.length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION, '題組至少需要 1 個子題')
      }
      for (const child of children) {
        validateSubmitStrict(child, child.questionMedia)
        await validateAttributesRequired(
          prisma,
          child.category,
          child.attributes as Record<string, unknown> | null,
        )
      }
    }
  }

  if (reviewAction === ReviewAction.REJECT) {
    if (!comment || comment.trim().length === 0) {
      throw new AppError(400, ErrorCode.REVIEW_COMMENT_REQUIRED, '退回時必須填寫退回原因')
    }
  }

  const updateData: Prisma.QuestionUpdateInput = {
    status: transition.target,
  }

  if (reviewAction === ReviewAction.APPROVE || reviewAction === ReviewAction.REJECT) {
    updateData.lastReviewer = { connect: { id: sessionUser.id } }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.question.update({
      where: { id },
      data: updateData,
      select: questionDetailSelect,
    })

    await tx.questionReviewLog.create({
      data: {
        questionId: id,
        userId: sessionUser.id,
        action: reviewAction,
        comment: comment ?? null,
      },
    })

    if (question.isGroupParent) {
      await tx.question.updateMany({
        where: { groupId: id },
        data: { status: transition.target },
      })
    }

    return result
  })

  return getQuestion(prisma, updated.id, sessionUser)
}
