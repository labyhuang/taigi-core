/**
 * CTT 統計計算（pure functions，不依賴 Prisma）
 *
 * spec-statistics.md §2 公式 / §1.3 高低分組切分 / §5.2 介面
 *
 * 三種題型分支：
 *   - 選擇題（含圖片選項）：P / D / optionStats
 *   - 聽寫題：以 isCorrect 算 P / D；optionStats 紀錄 distinctAnswers top 10
 *   - 口說題：以 speakingScore 算 平均 / 標準差 / D（平均分差）
 */

// ========== 型別 ==========

export interface ResponseSlice {
  candidateId: string
  totalScore: number
  paperVariant: string | null
  selectedOptionId: string | null
  writtenAnswer: string | null
  speakingScore: number | null
  isCorrect: boolean | null
}

export interface QuestionMeta {
  questionId: string
  type: 'READING' | 'LISTENING' | 'SPEAKING' | 'DICTATION'
  subType: string
  options: Array<{ id: string; text: string }>
  correctOptionId: string | null
  correctText: string | null
  maxScore: number
}

export interface OptionStat {
  optionId: string
  label: string
  isCorrect: boolean
  selectionCount: number
  selectionRate: number
  selectionRateHigh: number
  selectionRateLow: number
}

export interface MultipleChoiceOptionStats {
  options: OptionStat[]
}

export interface DictationDistinctAnswerStats {
  distinctAnswers: Array<{ answer: string; count: number; isCorrect: boolean }>
}

export interface ComputedStatistics {
  totalAnswered: number
  totalCorrect: number | null
  highGroupSize: number
  lowGroupSize: number
  difficulty: number
  discrimination: number | null
  optionStats: MultipleChoiceOptionStats | DictationDistinctAnswerStats | null
  meanScore: number | null
  scoreStdDev: number | null
}

// ========== 入口 ==========

export function computeQuestionStatistics(
  question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics {
  if (question.type === 'SPEAKING') {
    return computeSpeaking(question, responses)
  }
  if (question.type === 'DICTATION') {
    return computeDictation(question, responses)
  }
  // READING / LISTENING：選擇題
  return computeMultipleChoice(question, responses)
}

// ========== 高低組切分（spec §1.3） ==========

interface GroupedSlices {
  high: ResponseSlice[]
  low: ResponseSlice[]
  /** 高低組是否可用（人數 < 10 則為 false，D 值需設 null） */
  usable: boolean
}

/**
 * 依 totalScore 對 responses 排序、切分高低組。
 * 為支援 cumulative 的「同 paperVariant 獨立切再合併」邏輯，呼叫者
 * 可先依 paperVariant 分群、各自呼叫此函式、再 merge 結果。
 */
function splitHighLow(responses: ResponseSlice[]): GroupedSlices {
  const n = responses.length
  if (n < 10) {
    return { high: [], low: [], usable: false }
  }
  // 切分比例：< 30 用 1/3；否則 0.27（Kelley 1939）
  const ratio = n < 30 ? 1 / 3 : 0.27
  const groupSize = Math.max(1, Math.floor(n * ratio))
  const sorted = [...responses].sort((a, b) => b.totalScore - a.totalScore)
  return {
    high: sorted.slice(0, groupSize),
    low: sorted.slice(-groupSize),
    usable: true,
  }
}

/**
 * cumulative 視角：依 paperVariant 各自切高低組，再合併。
 * 若所有 response 的 paperVariant 都相同（典型 per-session），等同於 splitHighLow。
 */
function splitHighLowByVariant(responses: ResponseSlice[]): GroupedSlices {
  // 依 paperVariant 分群（null 視為一個獨立 group）
  const groups = new Map<string, ResponseSlice[]>()
  for (const r of responses) {
    const key = r.paperVariant ?? '__null__'
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }

  // 任一群人數 ≥ 10 才能參與
  const merged: GroupedSlices = { high: [], low: [], usable: false }
  for (const arr of groups.values()) {
    const g = splitHighLow(arr)
    if (g.usable) {
      merged.high.push(...g.high)
      merged.low.push(...g.low)
      merged.usable = true
    }
  }
  return merged
}

// ========== 選擇題 ==========

function computeMultipleChoice(
  question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics {
  const answered = responses.filter((r) => r.selectedOptionId !== null)
  const totalAnswered = answered.length

  if (totalAnswered === 0) {
    return zeroStats(question)
  }

  const totalCorrect = answered.filter((r) => r.isCorrect === true).length
  const difficulty = totalCorrect / totalAnswered

  const { high, low, usable } = splitHighLowByVariant(answered)

  let discrimination: number | null = null
  if (usable && high.length > 0 && low.length > 0) {
    const pHigh = high.filter((r) => r.isCorrect === true).length / high.length
    const pLow = low.filter((r) => r.isCorrect === true).length / low.length
    discrimination = pHigh - pLow
  }

  const options: OptionStat[] = question.options.map((opt) => {
    const selected = answered.filter((r) => r.selectedOptionId === opt.id)
    const selectedHigh = high.filter((r) => r.selectedOptionId === opt.id).length
    const selectedLow = low.filter((r) => r.selectedOptionId === opt.id).length
    return {
      optionId: opt.id,
      label: opt.text,
      isCorrect: opt.id === question.correctOptionId,
      selectionCount: selected.length,
      selectionRate: selected.length / totalAnswered,
      selectionRateHigh: high.length > 0 ? selectedHigh / high.length : 0,
      selectionRateLow: low.length > 0 ? selectedLow / low.length : 0,
    }
  })

  return {
    totalAnswered,
    totalCorrect,
    highGroupSize: high.length,
    lowGroupSize: low.length,
    difficulty,
    discrimination,
    optionStats: { options },
    meanScore: null,
    scoreStdDev: null,
  }
}

// ========== 聽寫題 ==========

function computeDictation(
  _question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics {
  const answered = responses.filter(
    (r) => typeof r.writtenAnswer === 'string' && r.writtenAnswer.trim().length > 0,
  )
  const totalAnswered = answered.length

  if (totalAnswered === 0) {
    return zeroStats(_question)
  }

  // 聽寫題仍依 isCorrect 計 P / D（外部已判過分）
  const totalCorrect = answered.filter((r) => r.isCorrect === true).length
  const difficulty = totalCorrect / totalAnswered

  const { high, low, usable } = splitHighLowByVariant(answered)

  let discrimination: number | null = null
  if (usable && high.length > 0 && low.length > 0) {
    const pHigh = high.filter((r) => r.isCorrect === true).length / high.length
    const pLow = low.filter((r) => r.isCorrect === true).length / low.length
    discrimination = pHigh - pLow
  }

  // distinctAnswers：以 trim 後的字串聚合，取 top 10
  const counter = new Map<string, { count: number; isCorrect: boolean }>()
  for (const r of answered) {
    const key = (r.writtenAnswer ?? '').trim()
    if (key.length === 0) continue
    const cur = counter.get(key)
    if (cur) {
      cur.count += 1
    } else {
      counter.set(key, { count: 1, isCorrect: r.isCorrect === true })
    }
  }
  const distinctAnswers = [...counter.entries()]
    .map(([answer, v]) => ({ answer, count: v.count, isCorrect: v.isCorrect }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalAnswered,
    totalCorrect,
    highGroupSize: high.length,
    lowGroupSize: low.length,
    difficulty,
    discrimination,
    optionStats: { distinctAnswers },
    meanScore: null,
    scoreStdDev: null,
  }
}

// ========== 口說題 ==========

function computeSpeaking(
  question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics {
  const answered = responses.filter(
    (r) => typeof r.speakingScore === 'number' && Number.isFinite(r.speakingScore),
  )
  const totalAnswered = answered.length

  if (totalAnswered === 0) {
    return zeroStats(question)
  }

  const scores = answered.map((r) => r.speakingScore as number)
  const meanScore = scores.reduce((s, v) => s + v, 0) / totalAnswered
  const variance =
    scores.reduce((s, v) => s + (v - meanScore) ** 2, 0) / totalAnswered
  const scoreStdDev = Math.sqrt(variance)

  // 口說題的「difficulty」改為平均得分率
  const maxScore = question.maxScore > 0 ? question.maxScore : 1
  const difficulty = meanScore / maxScore

  const { high, low, usable } = splitHighLowByVariant(answered)
  let discrimination: number | null = null
  if (usable && high.length > 0 && low.length > 0) {
    const meanHigh =
      high.reduce((s, r) => s + (r.speakingScore as number), 0) / high.length
    const meanLow =
      low.reduce((s, r) => s + (r.speakingScore as number), 0) / low.length
    // D_speaking = (mean_high - mean_low) / max
    discrimination = (meanHigh - meanLow) / maxScore
  }

  return {
    totalAnswered,
    totalCorrect: null, // 口說題無對錯
    highGroupSize: high.length,
    lowGroupSize: low.length,
    difficulty,
    discrimination,
    optionStats: null,
    meanScore,
    scoreStdDev,
  }
}

// ========== 邊界 ==========

function zeroStats(question: QuestionMeta): ComputedStatistics {
  return {
    totalAnswered: 0,
    totalCorrect: question.type === 'SPEAKING' ? null : 0,
    highGroupSize: 0,
    lowGroupSize: 0,
    difficulty: 0,
    discrimination: null,
    optionStats: question.type === 'SPEAKING' ? null : { options: [] } as MultipleChoiceOptionStats,
    meanScore: question.type === 'SPEAKING' ? 0 : null,
    scoreStdDev: question.type === 'SPEAKING' ? 0 : null,
  }
}

// ========== 判讀分類（給前端共用） ==========

export type DifficultyClass = 'too-easy' | 'easy' | 'moderate' | 'hard' | 'too-hard'
export type DiscriminationClass = 'good' | 'fair' | 'poor' | 'reject' | 'negative'

export function classifyDifficulty(p: number): DifficultyClass {
  if (p > 0.85) return 'too-easy'
  if (p > 0.75) return 'easy'
  if (p >= 0.4) return 'moderate'
  if (p >= 0.3) return 'hard'
  return 'too-hard'
}

export function classifyDiscrimination(d: number | null): DiscriminationClass | null {
  if (d === null) return null
  if (d < 0) return 'negative'
  if (d < 0.2) return 'reject'
  if (d < 0.3) return 'poor'
  if (d < 0.4) return 'fair'
  return 'good'
}
