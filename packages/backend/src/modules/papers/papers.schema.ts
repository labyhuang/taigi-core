import { Type, type Static } from '@sinclair/typebox'

export const PaperIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type PaperIdParamsType = Static<typeof PaperIdParams>

export const PaperQuestionParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
  questionId: Type.String({ format: 'uuid' }),
})
export type PaperQuestionParamsType = Static<typeof PaperQuestionParams>

export const ListPapersQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  blueprintId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type ListPapersQueryType = Static<typeof ListPapersQuery>

export const UpdatePaperBody = Type.Object({
  name: Type.String({ minLength: 1 }),
})
export type UpdatePaperBodyType = Static<typeof UpdatePaperBody>

export const UpdatePaperStatusBody = Type.Object({
  action: Type.Literal('PUBLISH'),
})
export type UpdatePaperStatusBodyType = Static<typeof UpdatePaperStatusBody>

export const ReplacePaperQuestionBody = Type.Object({
  newQuestionId: Type.String({ format: 'uuid' }),
})
export type ReplacePaperQuestionBodyType = Static<typeof ReplacePaperQuestionBody>
