/**
 * 統計模組前端型別與門檻工具
 *
 * spec-statistics.md §2 / §4
 */

// ========== Domain types ==========

export interface OptionStatRow {
  optionId: string
  label: string
  isCorrect: boolean
  selectionCount: number
  selectionRate: number
  selectionRateHigh: number
  selectionRateLow: number
}

export interface MultipleChoiceOptionStats {
  options: OptionStatRow[]
}

export interface DictationDistinctAnswerStats {
  distinctAnswers: Array<{ answer: string; count: number; isCorrect: boolean }>
}

export type OptionStatsPayload =
  | MultipleChoiceOptionStats
  | DictationDistinctAnswerStats
  | null

export interface QuestionStatsCore {
  totalAnswered: number
  totalCorrect: number | null
  highGroupSize: number
  lowGroupSize: number
  difficulty: number
  discrimination: number | null
  optionStats: OptionStatsPayload
  meanScore: number | null
  scoreStdDev: number | null
  computedAt: string
}

export interface QuestionStatsResponse {
  question: {
    id: string
    category: string
    type: string
    subType: string
    stem: string | null
    content: unknown
    answer: unknown
    attributes: Record<string, unknown>
    author: { id: string; name: string } | null
  }
  cumulative: QuestionStatsCore | null
  bySession:
    | Array<{
        examSession: { id: string; name: string; examDate: string }
        stats: QuestionStatsCore
      }>
    | null
}

export interface PaperStatsResponse {
  paper: { id: string; name: string; status?: string }
  summary: {
    totalQuestions: number
    questionsWithStats: number
    meanDifficulty: number
    meanDiscrimination: number
    questionsBelowDiscriminationThreshold: number
    questionsTooEasy: number
    questionsTooHard: number
  }
  bySubType: Array<{
    subType: string
    count: number
    meanDifficulty: number | null
    meanDiscrimination: number | null
  }>
  questions: Array<{
    questionId: string
    orderIndex: number
    subType: string
    stem: string | null
    difficulty: number | null
    discrimination: number | null
    totalAnswered: number
    computedAt: string | null
  }>
}

export interface ExploreResponse {
  groupBy: string[]
  metric: 'difficulty' | 'discrimination'
  aggregation: 'mean' | 'median'
  examSessionId: string | null
  rows: Array<Record<string, unknown> & { value: number; questionCount: number }>
}

export interface RecomputeJobInfo {
  id: string
  scope: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
  examSessionId: string | null
  totalQuestions: number
  processedQuestions: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  createdBy?: { id: string; name: string }
}

// ========== 門檻判讀（與後端 statistics.compute.ts 同步） ==========

export type DifficultyClass = 'too-easy' | 'easy' | 'moderate' | 'hard' | 'too-hard'
export type DiscriminationClass =
  | 'good'
  | 'fair'
  | 'poor'
  | 'reject'
  | 'negative'

export function classifyDifficulty(p: number): DifficultyClass {
  if (p > 0.85) return 'too-easy'
  if (p > 0.75) return 'easy'
  if (p >= 0.4) return 'moderate'
  if (p >= 0.3) return 'hard'
  return 'too-hard'
}

export function classifyDiscrimination(
  d: number | null,
): DiscriminationClass | null {
  if (d === null) return null
  if (d < 0) return 'negative'
  if (d < 0.2) return 'reject'
  if (d < 0.3) return 'poor'
  if (d < 0.4) return 'fair'
  return 'good'
}

export const DIFFICULTY_LABELS: Record<DifficultyClass, string> = {
  'too-easy': '過於簡單',
  easy: '偏易',
  moderate: '適中',
  hard: '偏難',
  'too-hard': '過於困難',
}

export const DIFFICULTY_COLORS: Record<DifficultyClass, string> = {
  'too-easy': 'orange',
  easy: 'gold',
  moderate: 'green',
  hard: 'blue',
  'too-hard': 'red',
}

export const DISCRIMINATION_LABELS: Record<DiscriminationClass, string> = {
  good: '優良',
  fair: '尚可',
  poor: '建議改寫',
  reject: '應淘汰',
  negative: '反向（瑕疵）',
}

export const DISCRIMINATION_COLORS: Record<DiscriminationClass, string> = {
  good: 'green',
  fair: 'blue',
  poor: 'orange',
  reject: 'red',
  negative: 'magenta',
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}
