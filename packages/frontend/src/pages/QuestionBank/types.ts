// ========== Enum-like 常數 ==========

export const ExamCategory = {
  GTPT: 'GTPT',
  TSH: 'TSH',
} as const
export type ExamCategoryValue = (typeof ExamCategory)[keyof typeof ExamCategory]

export const QuestionType = {
  READING: 'READING',
  LISTENING: 'LISTENING',
  SPEAKING: 'SPEAKING',
  DICTATION: 'DICTATION',
} as const
export type QuestionTypeValue = (typeof QuestionType)[keyof typeof QuestionType]

export const QuestionSubType = {
  // GTPT
  GRAMMAR: 'GRAMMAR',
  COMPREHENSION: 'COMPREHENSION',
  CONVERSATION: 'CONVERSATION',
  SPEECH: 'SPEECH',
  STORYTELLING: 'STORYTELLING',
  READ_ALOUD: 'READ_ALOUD',
  EXPRESSION: 'EXPRESSION',
  DICTATION_FILL: 'DICTATION_FILL',
  // TSH
  LISTEN_PICK_IMAGE: 'LISTEN_PICK_IMAGE',
  IMAGE_PICK_ANSWER: 'IMAGE_PICK_ANSWER',
  TSH_DIALOGUE: 'TSH_DIALOGUE',
  IMAGE_PICK_SENTENCE: 'IMAGE_PICK_SENTENCE',
  TSH_FILL_BLANK: 'TSH_FILL_BLANK',
  TSH_COMPREHENSION: 'TSH_COMPREHENSION',
} as const
export type QuestionSubTypeValue = (typeof QuestionSubType)[keyof typeof QuestionSubType]

export const QuestionStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
} as const
export type QuestionStatusValue = (typeof QuestionStatus)[keyof typeof QuestionStatus]

export const ReviewAction = {
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  ARCHIVE: 'ARCHIVE',
} as const

export const TextSystem = {
  TJ: 'TJ',
  POJ: 'POJ',
} as const

// ========== 合法 Category / Type / SubType 組合 ==========

export const VALID_CATEGORY_TYPE_SUBTYPE_MAP: Record<string, Record<string, string[]>> = {
  GTPT: {
    READING: ['GRAMMAR', 'COMPREHENSION'],
    LISTENING: ['CONVERSATION', 'SPEECH'],
    SPEAKING: ['STORYTELLING', 'READ_ALOUD', 'EXPRESSION'],
    DICTATION: ['DICTATION_FILL'],
  },
  TSH: {
    LISTENING: ['LISTEN_PICK_IMAGE', 'IMAGE_PICK_ANSWER', 'TSH_DIALOGUE'],
    READING: ['IMAGE_PICK_SENTENCE', 'TSH_FILL_BLANK', 'TSH_COMPREHENSION'],
  },
}

export const AUDIO_REQUIRED_SUBTYPES = [
  'CONVERSATION', 'SPEECH', 'DICTATION_FILL',
  'LISTEN_PICK_IMAGE', 'IMAGE_PICK_ANSWER', 'TSH_DIALOGUE',
]
export const IMAGE_REQUIRED_SUBTYPES = ['STORYTELLING', 'IMAGE_PICK_ANSWER', 'IMAGE_PICK_SENTENCE']
export const MULTIPLE_CHOICE_SUBTYPES = [
  'GRAMMAR', 'COMPREHENSION', 'CONVERSATION', 'SPEECH',
  'IMAGE_PICK_ANSWER', 'TSH_DIALOGUE', 'IMAGE_PICK_SENTENCE',
  'TSH_FILL_BLANK', 'TSH_COMPREHENSION',
]
export const IMAGE_OPTION_SUBTYPES = ['LISTEN_PICK_IMAGE']
export const GROUP_SUBTYPES = ['COMPREHENSION', 'SPEECH']
export const RUBRIC_SUBTYPES = ['STORYTELLING', 'READ_ALOUD', 'EXPRESSION']
export const STEM_REQUIRED_SUBTYPES = [
  'GRAMMAR', 'CONVERSATION', 'READ_ALOUD', 'EXPRESSION',
  'TSH_DIALOGUE', 'TSH_FILL_BLANK', 'TSH_COMPREHENSION',
]
export const TRANSCRIPT_REQUIRED_SUBTYPES = ['CONVERSATION', 'SPEECH', 'TSH_DIALOGUE']

// ========== 顯示用 Label ==========

export const CATEGORY_LABELS: Record<string, string> = {
  GTPT: '全民台語認證',
  TSH: '中小學生台語認證',
}

export const TYPE_LABELS: Record<string, string> = {
  READING: '閱讀',
  LISTENING: '聽力',
  SPEAKING: '口說',
  DICTATION: '聽寫',
}

export const SUB_TYPE_LABELS: Record<string, string> = {
  // GTPT
  GRAMMAR: '詞彙語法',
  COMPREHENSION: '閱讀理解',
  CONVERSATION: '對話',
  SPEECH: '演說',
  STORYTELLING: '看圖講古',
  READ_ALOUD: '朗讀',
  EXPRESSION: '口語表達',
  DICTATION_FILL: '聽寫',
  // TSH
  LISTEN_PICK_IMAGE: '聽話揀圖',
  IMAGE_PICK_ANSWER: '看圖揀話',
  TSH_DIALOGUE: '對話理解',
  IMAGE_PICK_SENTENCE: '看圖揀句',
  TSH_FILL_BLANK: '讀句補詞',
  TSH_COMPREHENSION: '短文理解',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '審查中',
  APPROVED: '已核可',
  REJECTED: '退回修改',
  ARCHIVED: '已封存',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  ARCHIVED: 'default',
}

export const TEXT_SYSTEM_LABELS: Record<string, string> = {
  TJ: '教育部台羅',
  POJ: '白話字',
}

// ========== API Response 型別 ==========

export interface OptionItem {
  id: string
  text: string
}

export interface ImageOptionItem {
  id: string
  mediaId: string
  text?: string
}

export interface MultipleChoiceContent {
  options: OptionItem[]
}

export interface ImageChoiceContent {
  options: ImageOptionItem[]
}

export interface MultipleChoiceAnswer {
  correctOptionIds: string[]
  transcript?: string
}

export interface DictationAnswer {
  correctText: string
  acceptableAlternatives?: string[]
}

export interface SpeakingAnswer {
  gradingRubric: string
}

export interface MediaItem {
  id: string
  filename: string
  mimeType: string
  durationSeconds: number | null
}

export interface QuestionMediaItem {
  purpose: string
  media: MediaItem
}

export interface ReviewLogItem {
  id: string
  action: string
  comment: string | null
  user: { id: string; name: string | null }
  createdAt: string
}

export interface QuestionListItem {
  id: string
  category: string
  type: string
  subType: string
  textSystem: string
  stem: string | null
  status: string
  isGroupParent: boolean
  author: { id: string; name: string | null }
  createdAt: string
  updatedAt: string
}

export interface QuestionChildItem {
  id: string
  stem: string | null
  status: string
  content: MultipleChoiceContent | null
  answer: MultipleChoiceAnswer | null
}

export interface QuestionDetail {
  id: string
  category: string
  type: string
  subType: string
  textSystem: string
  stem: string | null
  status: string
  content: MultipleChoiceContent | ImageChoiceContent | null
  answer: MultipleChoiceAnswer | DictationAnswer | SpeakingAnswer | null
  isGroupParent: boolean
  groupId: string | null
  author: { id: string; name: string | null }
  lastReviewer: { id: string; name: string | null } | null
  questionMedia: QuestionMediaItem[]
  reviewLogs: ReviewLogItem[]
  children: QuestionChildItem[]
  createdAt: string
  updatedAt: string
}

export interface MediaLinkItem {
  mediaId: string
  purpose: string
}

export interface CreateQuestionPayload {
  category: string
  type: string
  subType: string
  textSystem: string
  stem?: string
  content?: MultipleChoiceContent | ImageChoiceContent | Record<string, never>
  answer?: MultipleChoiceAnswer | DictationAnswer | SpeakingAnswer | Record<string, never>
  mediaIds?: MediaLinkItem[]
  groupId?: string
}

export interface UpdateQuestionPayload {
  stem?: string
  content?: MultipleChoiceContent | ImageChoiceContent | Record<string, never>
  answer?: MultipleChoiceAnswer | DictationAnswer | SpeakingAnswer | Record<string, never>
  mediaIds?: MediaLinkItem[]
}
