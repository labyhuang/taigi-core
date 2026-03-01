import { Type, type Static } from '@sinclair/typebox'

export const LoginBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
})
export type LoginBodyType = Static<typeof LoginBody>

export const Verify2FABody = Type.Object({
  challengeId: Type.String({ minLength: 1 }),
  totpCode: Type.String({ minLength: 6, maxLength: 6 }),
})
export type Verify2FABodyType = Static<typeof Verify2FABody>
