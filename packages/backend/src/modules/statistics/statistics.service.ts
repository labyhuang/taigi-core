/**
 * 統計查詢與計算服務
 *
 * spec-statistics.md §4 / §5
 *
 * 對外提供：
 *   - getQuestionStats / getPaperStats / explore：4.3-4.5 端點
 *   - getJob / createRecomputeJob：4.1-4.2
 *   - computeAndUpsertOne / collectTargets：給 statistics.jobs 用
 */

import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import {
  computeQuestionStatistics,
  type ComputedStatistics,
  type ResponseSlice,
  type QuestionMeta,
} from './statistics.compute.js'

// ========== Job 管理 ==========

export type RecomputeScope = 'session' | 'cumulative' | 'all'

export async function createRecomputeJob(
  prisma: PrismaClient,
  scope: RecomputeScope,
  examSessionId: string | null,
  userId: string,
): Promise<{ id: string; status: string; scope: string; examSessionId: string | null }> {
  if (scope === 'session' && !examSessionId) {
    throw new AppError(400, ErrorCode.VALIDATION, 'scope=session 時 examSessionId 必填')
  }

  // 防止同 scope 已有 RUNNING 中的 job（spec §7 ERR_RECOMPUTE_IN_PROGRESS）
  const running = await prisma.recomputeJob.findFirst({
    where: {
      scope,
      examSessionId: examSessionId ?? null,
      status: { in: ['PENDING', 'RUNNING'] },
    },
  })
  if (running) {
    throw new AppError(
      409,
      ErrorCode.RECOMPUTE_IN_PROGRESS,
      '相同範圍的統計重算已在進行中',
      [{ jobId: running.id, status: running.status }],
    )
  }

  const job = await prisma.recomputeJob.create({
    data: {
      scope,
      examSessionId: examSessionId ?? null,
      createdById: userId,
    },
    select: {
      id: true,
      status: true,
      scope: true,
      examSessionId: true,
    },
  })
  return job
}

export async function getJob(prisma: PrismaClient, jobId: string) {
  const job = await prisma.recomputeJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      scope: true,
      status: true,
      examSessionId: true,
      totalQuestions: true,
      processedQuestions: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  })
  if (!job) {
    throw new AppError(404, ErrorCode.RECOMPUTE_JOB_NOT_FOUND, '找不到該 job')
  }
  return job
}

// ========== 計算入口（給 jobs 呼叫） ==========

interface Target {
  questionId: string
  examSessionId: string | null
}

export async function collectTargetQuestions(
  prisma: PrismaClient,
  job: {
    scope: string
    examSessionId: string | null
  },
): Promise<Target[]> {
  if (job.scope === 'session') {
    const sessionId = job.examSessionId
    if (!sessionId) return []
    const questions = await prisma.question.findMany({
      where: {
        // 只算父題以外的 APPROVED 題目（題組父題沒有 answer）
        isGroupParent: false,
        candidateResponses: { some: { examSessionId: sessionId } },
      },
      select: { id: true },
    })
    return questions.map((q) => ({
      questionId: q.id,
      examSessionId: sessionId,
    }))
  }

  if (job.scope === 'cumulative') {
    const questions = await prisma.question.findMany({
      where: {
        isGroupParent: false,
        candidateResponses: { some: {} },
      },
      select: { id: true },
    })
    return questions.map((q) => ({ questionId: q.id, examSessionId: null }))
  }

  // scope = 'all'：先 session 再 cumulative
  if (!job.examSessionId) {
    // 未指定 session 等同 cumulative
    return collectTargetQuestions(prisma, { scope: 'cumulative', examSessionId: null })
  }

  const sessionTargets = await collectTargetQuestions(prisma, {
    scope: 'session',
    examSessionId: job.examSessionId,
  })
  const cumulativeTargets = sessionTargets.map((t) => ({
    questionId: t.questionId,
    examSessionId: null,
  }))
  return [...sessionTargets, ...cumulativeTargets]
}

/**
 * 載入單題的計算所需 plain data：QuestionMeta + ResponseSlice[]
 *
 * 過濾規則（spec §1.2）：
 *   - 該 question.status = APPROVED
 *   - response 來自 examSession.status IN (IMPORTED, ARCHIVED)
 *   - 對應作答欄位非 null
 */
export async function computeAndUpsertOne(
  prisma: PrismaClient,
  questionId: string,
  examSessionId: string | null,
): Promise<ComputedStatistics | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      status: true,
      type: true,
      subType: true,
      isGroupParent: true,
      content: true,
      answer: true,
    },
  })

  if (!question || question.isGroupParent) return null
  if (question.status !== 'APPROVED') return null

  const meta = buildQuestionMeta(question)

  const responses = await prisma.candidateResponse.findMany({
    where: {
      questionId,
      examSession: { status: { in: ['IMPORTED', 'ARCHIVED'] } },
      ...(examSessionId ? { examSessionId } : {}),
    },
    select: {
      candidateId: true,
      selectedOptionId: true,
      writtenAnswer: true,
      speakingScore: true,
      isCorrect: true,
      candidate: {
        select: { totalScore: true, paperVariant: true },
      },
    },
  })

  const slices: ResponseSlice[] = responses.map((r) => ({
    candidateId: r.candidateId,
    totalScore: r.candidate.totalScore ?? 0,
    paperVariant: r.candidate.paperVariant,
    selectedOptionId: r.selectedOptionId,
    writtenAnswer: r.writtenAnswer,
    speakingScore: r.speakingScore,
    isCorrect: r.isCorrect,
  }))

  const stats = computeQuestionStatistics(meta, slices)

  // 注意：Prisma 對 nullable 複合 unique key 的 findUnique/upsert 限制較多，
  // 改用 findFirst + update / create 模擬 upsert（spec §1.5 重算同 (questionId, examSessionId) 紀錄）
  const existing = await prisma.questionStatistics.findFirst({
    where: { questionId, examSessionId: examSessionId },
    select: { id: true },
  })

  const data = {
    totalAnswered: stats.totalAnswered,
    totalCorrect: stats.totalCorrect,
    highGroupSize: stats.highGroupSize,
    lowGroupSize: stats.lowGroupSize,
    difficulty: stats.difficulty,
    discrimination: stats.discrimination,
    optionStats: (stats.optionStats ?? undefined) as never,
    meanScore: stats.meanScore,
    scoreStdDev: stats.scoreStdDev,
  }

  if (existing) {
    await prisma.questionStatistics.update({
      where: { id: existing.id },
      data: { ...data, computedAt: new Date() },
    })
  } else {
    await prisma.questionStatistics.create({
      data: { questionId, examSessionId, ...data },
    })
  }

  return stats
}

function buildQuestionMeta(q: {
  id: string
  type: string
  subType: string
  content: unknown
  answer: unknown
}): QuestionMeta {
  const content = (q.content ?? {}) as { options?: { id: string; text?: string; mediaId?: string }[] }
  const answer = (q.answer ?? {}) as {
    correctOptionIds?: string[]
    correctText?: string
  }

  const options = (content.options ?? []).map((o) => ({
    id: o.id,
    text: o.text ?? '',
  }))

  const correctOptionId =
    Array.isArray(answer.correctOptionIds) && answer.correctOptionIds.length > 0
      ? answer.correctOptionIds[0] ?? null
      : null

  // 試題滿分目前無欄位明確指出，預設 1.0；口說題的單題滿分由 maxScore 決定
  // 之後可從 ExamPaperQuestion.score 反查（cumulative 跨多卷時取平均）
  const maxScore = 1

  return {
    questionId: q.id,
    type: q.type as QuestionMeta['type'],
    subType: q.subType,
    options,
    correctOptionId,
    correctText: answer.correctText ?? null,
    maxScore,
  }
}

// ========== 4.3 單題統計 ==========

export async function getQuestionStats(
  prisma: PrismaClient,
  questionId: string,
  view: 'cumulative' | 'by-session',
) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      category: true,
      type: true,
      subType: true,
      stem: true,
      content: true,
      answer: true,
      attributes: true,
      isGroupParent: true,
      author: { select: { id: true, name: true } },
    },
  })

  if (!question) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該題目')
  }
  if (question.isGroupParent) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION,
      '題組父題不參與統計，請查看子題',
    )
  }

  const cumulative = await prisma.questionStatistics.findFirst({
    where: { questionId, examSessionId: null },
    select: statsSelect,
  })

  let bySession: Array<{
    examSession: { id: string; name: string; examDate: Date }
    stats: Record<string, unknown>
  }> | null = null

  if (view === 'by-session') {
    const list = await prisma.questionStatistics.findMany({
      where: { questionId, examSessionId: { not: null } },
      select: {
        ...statsSelect,
        examSession: {
          select: { id: true, name: true, examDate: true },
        },
      },
      orderBy: [{ examSession: { examDate: 'desc' } }],
    })
    bySession = list.map(({ examSession, ...stats }) => ({
      examSession: examSession!,
      stats,
    }))
  }

  if (!cumulative && !bySession?.length) {
    throw new AppError(
      404,
      ErrorCode.STATS_NOT_READY,
      '此題目尚未計算統計，請先觸發 recompute',
    )
  }

  return { question, cumulative, bySession }
}

const statsSelect = {
  totalAnswered: true,
  totalCorrect: true,
  highGroupSize: true,
  lowGroupSize: true,
  difficulty: true,
  discrimination: true,
  optionStats: true,
  meanScore: true,
  scoreStdDev: true,
  computedAt: true,
} as const

// ========== 4.4 試卷統計 ==========

const DIFFICULTY_TOO_EASY = 0.85
const DIFFICULTY_TOO_HARD = 0.3
const DISCRIMINATION_THRESHOLD = 0.2

export async function getPaperStats(
  prisma: PrismaClient,
  paperId: string,
  examSessionId: string | null,
) {
  const paper = await prisma.examPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      name: true,
      status: true,
      questions: {
        select: {
          orderIndex: true,
          score: true,
          question: {
            select: {
              id: true,
              type: true,
              subType: true,
              stem: true,
              isGroupParent: true,
            },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })
  if (!paper) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該考卷')
  }

  // 過濾掉題組父題（不參與統計）
  const targetQuestions = paper.questions.filter((pq) => !pq.question.isGroupParent)
  const questionIds = targetQuestions.map((pq) => pq.question.id)
  if (questionIds.length === 0) {
    return {
      paper: { id: paper.id, name: paper.name },
      summary: emptyPaperSummary(),
      bySubType: [],
      questions: [],
    }
  }

  const stats = await prisma.questionStatistics.findMany({
    where: {
      questionId: { in: questionIds },
      examSessionId: examSessionId,
    },
    select: {
      questionId: true,
      ...statsSelect,
    },
  })
  const statsMap = new Map(stats.map((s) => [s.questionId, s]))

  // questions 明細
  const questions = targetQuestions.map((pq) => {
    const s = statsMap.get(pq.question.id)
    return {
      questionId: pq.question.id,
      orderIndex: pq.orderIndex,
      subType: pq.question.subType,
      stem: pq.question.stem,
      difficulty: s?.difficulty ?? null,
      discrimination: s?.discrimination ?? null,
      totalAnswered: s?.totalAnswered ?? 0,
      computedAt: s?.computedAt ?? null,
    }
  })

  // summary
  const computed = questions.filter((q) => q.difficulty !== null)
  const meanDifficulty =
    computed.length > 0
      ? computed.reduce((s, q) => s + (q.difficulty as number), 0) / computed.length
      : 0
  const dValues = questions
    .map((q) => q.discrimination)
    .filter((v): v is number => v !== null)
  const meanDiscrimination =
    dValues.length > 0 ? dValues.reduce((s, v) => s + v, 0) / dValues.length : 0

  const questionsTooEasy = computed.filter(
    (q) => (q.difficulty as number) > DIFFICULTY_TOO_EASY,
  ).length
  const questionsTooHard = computed.filter(
    (q) => (q.difficulty as number) < DIFFICULTY_TOO_HARD,
  ).length
  const questionsBelowDiscriminationThreshold = dValues.filter(
    (d) => d < DISCRIMINATION_THRESHOLD,
  ).length

  const summary = {
    totalQuestions: targetQuestions.length,
    questionsWithStats: computed.length,
    meanDifficulty,
    meanDiscrimination,
    questionsBelowDiscriminationThreshold,
    questionsTooEasy,
    questionsTooHard,
  }

  // bySubType 聚合
  const subTypeMap = new Map<
    string,
    { count: number; difficulties: number[]; discriminations: number[] }
  >()
  for (const q of questions) {
    const cur = subTypeMap.get(q.subType) ?? {
      count: 0,
      difficulties: [],
      discriminations: [],
    }
    cur.count += 1
    if (q.difficulty !== null) cur.difficulties.push(q.difficulty)
    if (q.discrimination !== null) cur.discriminations.push(q.discrimination)
    subTypeMap.set(q.subType, cur)
  }
  const bySubType = [...subTypeMap.entries()].map(([subType, v]) => ({
    subType,
    count: v.count,
    meanDifficulty:
      v.difficulties.length > 0
        ? v.difficulties.reduce((s, x) => s + x, 0) / v.difficulties.length
        : null,
    meanDiscrimination:
      v.discriminations.length > 0
        ? v.discriminations.reduce((s, x) => s + x, 0) / v.discriminations.length
        : null,
  }))

  return {
    paper: { id: paper.id, name: paper.name, status: paper.status },
    summary,
    bySubType,
    questions,
  }
}

function emptyPaperSummary() {
  return {
    totalQuestions: 0,
    questionsWithStats: 0,
    meanDifficulty: 0,
    meanDiscrimination: 0,
    questionsBelowDiscriminationThreshold: 0,
    questionsTooEasy: 0,
    questionsTooHard: 0,
  }
}

// ========== 4.5 多維度交叉 ==========

export async function exploreStats(
  prisma: PrismaClient,
  query: {
    groupBy: string[]
    examSessionId: string | null
    metric: 'difficulty' | 'discrimination'
    aggregation: 'mean' | 'median'
  },
) {
  const stats = await prisma.questionStatistics.findMany({
    where: {
      examSessionId: query.examSessionId,
      // explore 對 discrimination 統計時自動排除 null
      ...(query.metric === 'discrimination' ? { discrimination: { not: null } } : {}),
    },
    select: {
      questionId: true,
      difficulty: true,
      discrimination: true,
      question: {
        select: {
          subType: true,
          category: true,
          textSystem: true,
          attributes: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  })

  // 依 groupBy 分群
  const groupKeyOf = (s: (typeof stats)[number]): string[] => {
    return query.groupBy.map((field) => {
      if (field === 'subType') return s.question.subType
      if (field === 'category') return s.question.category
      if (field === 'textSystem') return s.question.textSystem
      if (field === 'author') return s.question.author?.name ?? '—'
      if (field.startsWith('attributes.')) {
        const key = field.slice('attributes.'.length)
        const attrs = (s.question.attributes ?? {}) as Record<string, unknown>
        const v = attrs[key]
        return typeof v === 'string' ? v : v == null ? '—' : String(v)
      }
      return '—'
    })
  }

  const buckets = new Map<string, { keys: string[]; values: number[] }>()
  for (const s of stats) {
    const value = query.metric === 'difficulty' ? s.difficulty : s.discrimination
    if (value === null || value === undefined) continue
    const keys = groupKeyOf(s)
    const id = keys.join('||')
    const bucket = buckets.get(id) ?? { keys, values: [] }
    bucket.values.push(value)
    buckets.set(id, bucket)
  }

  const aggregate = (vals: number[]): number => {
    if (vals.length === 0) return 0
    if (query.aggregation === 'mean') {
      return vals.reduce((s, v) => s + v, 0) / vals.length
    }
    const sorted = [...vals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0)
  }

  const rows = [...buckets.values()]
    .map((b) => {
      const row: Record<string, unknown> = {
        value: aggregate(b.values),
        questionCount: b.values.length,
      }
      query.groupBy.forEach((field, i) => {
        row[fieldAlias(field)] = b.keys[i]
      })
      return row
    })
    .sort((a, b) => (b.value as number) - (a.value as number))

  return {
    groupBy: query.groupBy,
    metric: query.metric,
    aggregation: query.aggregation,
    examSessionId: query.examSessionId,
    rows,
  }
}

function fieldAlias(field: string): string {
  if (field.startsWith('attributes.')) {
    return `${field.slice('attributes.'.length)}_attr`
  }
  return field
}

