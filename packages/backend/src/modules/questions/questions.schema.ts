import { Type, type Static } from '@sinclair/typebox'

// ========== 合法 Type / SubType 組合 ==========

export const VALID_TYPE_SUBTYPE_MAP: Record<string, string[]> = {
  READING: ['GRAMMAR', 'COMPREHENSION'],
  LISTENING: ['CONVERSATION', 'SPEECH'],
  SPEAKING: ['STORYTELLING', 'READ_ALOUD', 'EXPRESSION'],
  DICTATION: ['DICTATION_FILL'],
}

// 需要音檔的 SubType
export const AUDIO_REQUIRED_SUBTYPES = ['CONVERSATION', 'SPEECH', 'DICTATION_FILL']

// 需要圖片的 SubType
export const IMAGE_REQUIRED_SUBTYPES = ['STORYTELLING']

// 選擇題 SubType（需要 options + correctOptionIds）
export const MULTIPLE_CHOICE_SUBTYPES = ['GRAMMAR', 'COMPREHENSION', 'CONVERSATION', 'SPEECH']

// 題組 SubType（父子結構）
export const GROUP_SUBTYPES = ['COMPREHENSION', 'SPEECH']

// 需要 transcript 的 SubType
export const TRANSCRIPT_REQUIRED_SUBTYPES = ['CONVERSATION', 'SPEECH']

// 需要 stem 的 SubType
export const STEM_REQUIRED_SUBTYPES = ['GRAMMAR', 'CONVERSATION', 'READ_ALOUD', 'EXPRESSION']

// 需要 gradingRubric 的 SubType
export const RUBRIC_SUBTYPES = ['STORYTELLING', 'READ_ALOUD', 'EXPRESSION']

// ========== TypeBox Schemas ==========

const OptionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 8 }),
  text: Type.String({ minLength: 1 }),
})

export const MultipleChoiceContentSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 2 }),
})

export const MultipleChoiceContentStrictSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 4, maxItems: 4 }),
})

export const MultipleChoiceAnswerSchema = Type.Object({
  correctOptionIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 1 }),
  transcript: Type.Optional(Type.String()),
})

export const DictationAnswerSchema = Type.Object({
  correctText: Type.String({ minLength: 1 }),
  acceptableAlternatives: Type.Optional(Type.Array(Type.String())),
})

export const SpeakingAnswerSchema = Type.Object({
  gradingRubric: Type.String({ minLength: 1 }),
})

// ========== 媒體關聯項目 ==========

const MediaLinkSchema = Type.Object({
  mediaId: Type.String({ format: 'uuid' }),
  purpose: Type.String({ minLength: 1 }),
})

// ========== API Request Schemas ==========

export const CreateQuestionBody = Type.Object({
  type: Type.String(),
  subType: Type.String(),
  textSystem: Type.String(),
  stem: Type.Optional(Type.String()),
  content: Type.Optional(Type.Any()),
  answer: Type.Optional(Type.Any()),
  mediaIds: Type.Optional(Type.Array(MediaLinkSchema)),
  // 題組子題建立時指定父題
  groupId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type CreateQuestionBodyType = Static<typeof CreateQuestionBody>

export const UpdateQuestionBody = Type.Object({
  stem: Type.Optional(Type.String()),
  content: Type.Optional(Type.Any()),
  answer: Type.Optional(Type.Any()),
  mediaIds: Type.Optional(Type.Array(MediaLinkSchema)),
})
export type UpdateQuestionBodyType = Static<typeof UpdateQuestionBody>

export const UpdateQuestionStatusBody = Type.Object({
  action: Type.String(),
  comment: Type.Optional(Type.String()),
})
export type UpdateQuestionStatusBodyType = Static<typeof UpdateQuestionStatusBody>

export const ListQuestionsQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  subType: Type.Optional(Type.String()),
  groupId: Type.Optional(Type.String({ format: 'uuid' })),
  authorId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type ListQuestionsQueryType = Static<typeof ListQuestionsQuery>

export const QuestionIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type QuestionIdParamsType = Static<typeof QuestionIdParams>
