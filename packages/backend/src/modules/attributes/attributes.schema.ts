import { Type, type Static } from '@sinclair/typebox'

const AttributeValueSchema = Type.Object({
  value: Type.String({ minLength: 1 }),
  label: Type.String({ minLength: 1 }),
  orderIndex: Type.Number({ minimum: 0 }),
})

export const CreateAttributeBody = Type.Object({
  key: Type.String({ minLength: 1, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' }),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  examCategory: Type.Optional(Type.String()),
  isRequired: Type.Optional(Type.Boolean()),
  values: Type.Array(AttributeValueSchema, { minItems: 1 }),
})
export type CreateAttributeBodyType = Static<typeof CreateAttributeBody>

export const UpdateAttributeBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  examCategory: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  isRequired: Type.Optional(Type.Boolean()),
  values: Type.Optional(Type.Array(AttributeValueSchema, { minItems: 1 })),
})
export type UpdateAttributeBodyType = Static<typeof UpdateAttributeBody>

export const AttributeIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type AttributeIdParamsType = Static<typeof AttributeIdParams>

export const ListAttributesQuery = Type.Object({
  examCategory: Type.Optional(Type.String()),
})
export type ListAttributesQueryType = Static<typeof ListAttributesQuery>
