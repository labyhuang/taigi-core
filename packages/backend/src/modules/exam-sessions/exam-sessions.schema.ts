import { Type, type Static } from '@sinclair/typebox'

// ========== Path / Query Params ==========

export const ExamSessionIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type ExamSessionIdParamsType = Static<typeof ExamSessionIdParams>

export const ExamSessionPaperParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
  paperId: Type.String({ format: 'uuid' }),
})
export type ExamSessionPaperParamsType = Static<typeof ExamSessionPaperParams>

export const ListExamSessionsQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  examCategory: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
})
export type ListExamSessionsQueryType = Static<typeof ListExamSessionsQuery>

// ========== Body Schemas ==========

export const CreateExamSessionBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  examCategory: Type.String(),
  examDate: Type.String({ format: 'date' }),
  description: Type.Optional(Type.String()),
})
export type CreateExamSessionBodyType = Static<typeof CreateExamSessionBody>

export const UpdateExamSessionBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  examCategory: Type.Optional(Type.String()),
  examDate: Type.Optional(Type.String({ format: 'date' })),
  description: Type.Optional(Type.String()),
})
export type UpdateExamSessionBodyType = Static<typeof UpdateExamSessionBody>

export const UpdateExamSessionStatusBody = Type.Object({
  action: Type.Union([Type.Literal('MARK_IMPORTED'), Type.Literal('ARCHIVE')]),
})
export type UpdateExamSessionStatusBodyType = Static<typeof UpdateExamSessionStatusBody>

export const BindPaperBody = Type.Object({
  examPaperId: Type.String({ format: 'uuid' }),
  paperVariant: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
})
export type BindPaperBodyType = Static<typeof BindPaperBody>
