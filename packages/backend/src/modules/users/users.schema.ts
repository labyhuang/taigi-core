import { Type, type Static } from '@sinclair/typebox'

// 密碼規則：至少 8 字元，含大寫、小寫、數字各一
const PASSWORD_PATTERN = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$'

// ========== Setup 流程 ==========

export const InviteUserBody = Type.Object({
  email: Type.String({ format: 'email' }),
  roleIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
})
export type InviteUserBodyType = Static<typeof InviteUserBody>

export const VerifyTokenBody = Type.Object({
  token: Type.String({ minLength: 1 }),
})
export type VerifyTokenBodyType = Static<typeof VerifyTokenBody>

export const SetupProfileBody = Type.Object({
  token: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  password: Type.String({
    minLength: 8,
    maxLength: 128,
    pattern: PASSWORD_PATTERN,
  }),
})
export type SetupProfileBodyType = Static<typeof SetupProfileBody>

export const TwoFaGenerateBody = Type.Object({
  token: Type.String({ minLength: 1 }),
})
export type TwoFaGenerateBodyType = Static<typeof TwoFaGenerateBody>

export const TwoFaVerifyBody = Type.Object({
  token: Type.String({ minLength: 1 }),
  code: Type.String({ minLength: 6, maxLength: 6 }),
})
export type TwoFaVerifyBodyType = Static<typeof TwoFaVerifyBody>

// ========== Admin 端點 ==========

export const ListUsersQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
})
export type ListUsersQueryType = Static<typeof ListUsersQuery>

export const UpdateUserStatusBody = Type.Object({
  isActive: Type.Boolean(),
})
export type UpdateUserStatusBodyType = Static<typeof UpdateUserStatusBody>

export const UpdateUserRolesBody = Type.Object({
  roleIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
})
export type UpdateUserRolesBodyType = Static<typeof UpdateUserRolesBody>

export const UserIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type UserIdParamsType = Static<typeof UserIdParams>
