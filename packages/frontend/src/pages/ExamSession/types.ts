// ========== Enum-like 常數 ==========

export const ExamSessionStatus = {
  DRAFT: 'DRAFT',
  IMPORTED: 'IMPORTED',
  ARCHIVED: 'ARCHIVED',
} as const
export type ExamSessionStatusValue =
  (typeof ExamSessionStatus)[keyof typeof ExamSessionStatus]

export const EXAM_SESSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  IMPORTED: '已匯入',
  ARCHIVED: '已封存',
}

export const EXAM_SESSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'processing',
  IMPORTED: 'success',
  ARCHIVED: 'default',
}

// ========== API 型別 ==========

export interface ExamSessionListItem {
  id: string
  name: string
  examCategory: string
  examDate: string
  status: string
  description: string | null
  createdBy: { id: string; name: string | null }
  createdAt: string
  updatedAt: string
  _count: { papers: number; candidates: number; responses: number }
}

export interface ExamSessionPaperLink {
  paperVariant: string | null
  attachedAt: string
  examPaper: { id: string; name: string; status: string }
}

export interface ExamSessionDetail extends ExamSessionListItem {
  papers: ExamSessionPaperLink[]
  importsSummary: {
    totalCandidates: number
    totalResponses: number
    responsesWithSpeakingScore: number
    lastImportedAt: string | null
  }
}

export interface ImportLogItem {
  id: string
  importType: 'candidates' | 'responses' | 'speaking_scores' | string
  sourceFormat: 'csv' | 'json' | string
  actorType: 'user' | 'api_client' | string
  actorId: string | null
  totalRows: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{
    row?: number
    externalCandidateId?: string
    field?: string
    message: string
  }>
  createdAt: string
}

export interface ImportResult {
  totalRows: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{
    row?: number
    externalCandidateId?: string
    field?: string
    message: string
  }>
}

// ========== 表單型別 ==========

export interface ExamSessionFormValues {
  name: string
  examCategory: string
  examDate: string // ISO date
  description?: string
}
