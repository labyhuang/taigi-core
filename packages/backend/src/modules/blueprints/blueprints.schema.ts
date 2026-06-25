import { Type, type Static } from '@sinclair/typebox'

const BlueprintCellSchema = Type.Object({
  orderIndex: Type.Number({ minimum: 1 }),
  questionType: Type.String(),
  questionSubType: Type.String(),
  criteria: Type.Optional(Type.Record(Type.String(), Type.String())),
  questionCount: Type.Number({ minimum: 1 }),
  scorePerQuestion: Type.Number({ minimum: 0 }),
})

export const CreateBlueprintBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  examCategory: Type.String(),
  totalQuestions: Type.Number({ minimum: 1 }),
  totalScore: Type.Number({ minimum: 0 }),
  cells: Type.Array(BlueprintCellSchema, { minItems: 1 }),
})
export type CreateBlueprintBodyType = Static<typeof CreateBlueprintBody>

export const UpdateBlueprintBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  examCategory: Type.Optional(Type.String()),
  totalQuestions: Type.Optional(Type.Number({ minimum: 1 })),
  totalScore: Type.Optional(Type.Number({ minimum: 0 })),
  cells: Type.Optional(Type.Array(BlueprintCellSchema, { minItems: 1 })),
})
export type UpdateBlueprintBodyType = Static<typeof UpdateBlueprintBody>

export const GeneratePaperBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  // 是否排除已被任何 PUBLISHED 考卷使用過的題目（業務規則：考過題目不再考）。
  // 預設 true；未來開放隨到隨考時可關閉。詳見 spec-export.md §4.5。
  excludeUsedQuestions: Type.Optional(Type.Boolean({ default: true })),
})
export type GeneratePaperBodyType = Static<typeof GeneratePaperBody>

export const BlueprintIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type BlueprintIdParamsType = Static<typeof BlueprintIdParams>

export const ListBlueprintsQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  examCategory: Type.Optional(Type.String()),
})
export type ListBlueprintsQueryType = Static<typeof ListBlueprintsQuery>
