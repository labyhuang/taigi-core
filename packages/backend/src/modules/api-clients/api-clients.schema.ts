import { Type, type Static } from '@sinclair/typebox'

export const ApiClientIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type ApiClientIdParamsType = Static<typeof ApiClientIdParams>

export const CreateApiClientBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  scopes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
})
export type CreateApiClientBodyType = Static<typeof CreateApiClientBody>
