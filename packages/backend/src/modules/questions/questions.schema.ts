import { Type, type Static } from '@sinclair/typebox'

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

// 需要音檔的 SubType
export const AUDIO_REQUIRED_SUBTYPES = [
  'CONVERSATION', 'SPEECH', 'DICTATION_FILL',
  'LISTEN_PICK_IMAGE', 'IMAGE_PICK_ANSWER', 'TSH_DIALOGUE',
]

// 需要題幹圖片的 SubType（透過 QuestionMedia purpose=IMAGE）
export const IMAGE_REQUIRED_SUBTYPES = ['STORYTELLING', 'IMAGE_PICK_ANSWER', 'IMAGE_PICK_SENTENCE']

// 選擇題 SubType（需要文字 options + correctOptionIds）
export const MULTIPLE_CHOICE_SUBTYPES = [
  'GRAMMAR', 'COMPREHENSION', 'CONVERSATION', 'SPEECH',
  'IMAGE_PICK_ANSWER', 'TSH_DIALOGUE', 'IMAGE_PICK_SENTENCE',
  'TSH_FILL_BLANK', 'TSH_COMPREHENSION',
]

// 圖片選項 SubType（選項為圖片而非文字）
export const IMAGE_OPTION_SUBTYPES = ['LISTEN_PICK_IMAGE']

// 題組 SubType（父子結構）
export const GROUP_SUBTYPES = ['COMPREHENSION', 'SPEECH']

// 需要 transcript 的 SubType
export const TRANSCRIPT_REQUIRED_SUBTYPES = ['CONVERSATION', 'SPEECH', 'TSH_DIALOGUE']

// 需要 stem 的 SubType
export const STEM_REQUIRED_SUBTYPES = [
  'GRAMMAR', 'CONVERSATION', 'READ_ALOUD', 'EXPRESSION',
  'TSH_DIALOGUE', 'TSH_FILL_BLANK', 'TSH_COMPREHENSION',
]

// 需要 gradingRubric 的 SubType
export const RUBRIC_SUBTYPES = ['STORYTELLING', 'READ_ALOUD', 'EXPRESSION']

// ========== TypeBox Schemas ==========

const OptionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 8 }),
  text: Type.String({ minLength: 1 }),
})

const ImageOptionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 8 }),
  mediaId: Type.String({ format: 'uuid' }),
  text: Type.Optional(Type.String()),
})

export const MultipleChoiceContentSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 2 }),
})

export const MultipleChoiceContentStrictSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 4, maxItems: 4 }),
})

export const ImageChoiceContentDraftSchema = Type.Object({
  options: Type.Array(ImageOptionSchema, { minItems: 2 }),
})

export const ImageChoiceContentStrictSchema = Type.Object({
  options: Type.Array(ImageOptionSchema, { minItems: 4, maxItems: 4 }),
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
  category: Type.String(),
  type: Type.String(),
  subType: Type.String(),
  textSystem: Type.String(),
  stem: Type.Optional(Type.String()),
  content: Type.Optional(Type.Any()),
  answer: Type.Optional(Type.Any()),
  mediaIds: Type.Optional(Type.Array(MediaLinkSchema)),
  groupId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type CreateQuestionBodyType = Static<typeof CreateQuestionBody>

export const UpdateQuestionBody = Type.Object({
  type: Type.Optional(Type.String()),
  subType: Type.Optional(Type.String()),
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
  category: Type.Optional(Type.String()),
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
