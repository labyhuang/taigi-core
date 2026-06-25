// ========== Enum-like 常數 ==========

export const PaperStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
} as const
export type PaperStatusValue = (typeof PaperStatus)[keyof typeof PaperStatus]

export const PAPER_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已發布',
}

export const PAPER_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'processing',
  PUBLISHED: 'success',
}

// ========== API 型別 ==========

export interface AttributeValueItem {
  id: string
  value: string
  label: string
  orderIndex: number
}

export interface AttributeDefinitionItem {
  id: string
  key: string
  name: string
  description: string | null
  examCategory: string | null
  isRequired: boolean
  values: AttributeValueItem[]
}

export interface BlueprintCellItem {
  id: string
  orderIndex: number
  questionType: string
  questionSubType: string
  criteria: Record<string, string>
  questionCount: number
  scorePerQuestion: number
}

export interface BlueprintListItem {
  id: string
  name: string
  examCategory: string
  totalQuestions: number
  totalScore: number
  createdBy: { id: string; name: string | null }
  createdAt: string
  updatedAt: string
  _count: { generatedPapers: number }
}

export interface BlueprintDetail {
  id: string
  name: string
  examCategory: string
  totalQuestions: number
  totalScore: number
  createdBy: { id: string; name: string | null }
  createdAt: string
  updatedAt: string
  cells: BlueprintCellItem[]
  generatedPapers: PaperSummary[]
}

export interface PaperSummary {
  id: string
  name: string
  status: string
  createdAt: string
}

export interface PaperListItem {
  id: string
  name: string
  status: string
  blueprintId: string
  createdBy: { id: string; name: string | null }
  blueprint: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  _count: { questions: number }
}

export interface PaperQuestionItem {
  orderIndex: number
  score: number
  question: {
    id: string
    category: string
    type: string
    subType: string
    stem: string | null
    content: unknown
    answer: unknown
    isGroupParent: boolean
    groupId: string | null
    questionMedia: {
      purpose: string
      media: {
        id: string
        filename: string
        mimeType: string
        durationSeconds: number | null
      }
    }[]
  }
}

export interface PaperDetail {
  id: string
  name: string
  status: string
  blueprintId: string
  blueprintSnapshot: unknown
  createdBy: { id: string; name: string | null }
  blueprint: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  questions: PaperQuestionItem[]
}

export interface GeneratePaperResult {
  id: string
  name: string
  status: string
  questionCount: number
  warnings: string[]
}

// ========== 表單型別 ==========

export interface BlueprintCellFormValues {
  orderIndex: number
  questionType: string
  questionSubType: string
  criteria: Record<string, string>
  questionCount: number
  scorePerQuestion: number
}

export interface BlueprintFormValues {
  name: string
  examCategory: string
  totalQuestions: number
  totalScore: number
  cells: BlueprintCellFormValues[]
}
