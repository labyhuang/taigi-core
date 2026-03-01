import type { FastifyInstance } from 'fastify'
import { LoginBody, Verify2FABody, type LoginBodyType, type Verify2FABodyType } from './auth.schema.js'
import { loginStep1, verifyLoginTwoFa } from './auth.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requireAuth } from '../../middlewares/rbacGuard.js'

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login（第一階段：帳密驗證）
  fastify.post<{ Body: LoginBodyType }>(
    '/login',
    {
      schema: { body: LoginBody },
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const result = await loginStep1(fastify.prisma, fastify.redis, email, password)
      return sendSuccess(reply, result)
    },
  )

  // POST /api/auth/verify-2fa（第二階段：TOTP 驗證）
  fastify.post<{ Body: Verify2FABodyType }>(
    '/verify-2fa',
    {
      schema: { body: Verify2FABody },
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { challengeId, totpCode } = request.body
      const sessionUser = await verifyLoginTwoFa(fastify.prisma, fastify.redis, challengeId, totpCode)

      request.session.user = sessionUser

      return sendSuccess(reply, {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
      }, { message: '登入成功' })
    },
  )

  // POST /api/auth/logout
  fastify.post(
    '/logout',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      await request.session.destroy()
      return sendSuccess(reply, null, { message: '已成功登出' })
    },
  )

  // GET /api/auth/me
  fastify.get(
    '/me',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user!
      return sendSuccess(reply, {
        id: user.id,
        email: user.email,
        name: user.name,
        isSetupCompleted: user.isSetupCompleted,
        permissions: user.permissions,
      })
    },
  )
}
