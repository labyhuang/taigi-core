import type { FastifyInstance } from 'fastify'
import {
  InviteUserBody,
  VerifyTokenBody,
  SetupProfileBody,
  TwoFaGenerateBody,
  TwoFaVerifyBody,
  ListUsersQuery,
  UpdateUserStatusBody,
  UpdateUserRolesBody,
  UserIdParams,
  type InviteUserBodyType,
  type VerifyTokenBodyType,
  type SetupProfileBodyType,
  type TwoFaGenerateBodyType,
  type TwoFaVerifyBodyType,
  type ListUsersQueryType,
  type UpdateUserStatusBodyType,
  type UpdateUserRolesBodyType,
  type UserIdParamsType,
} from './users.schema.js'
import {
  inviteUser,
  verifySetupToken,
  setupProfile,
  generate2FA,
  verify2FA,
  listRoles,
  listUsers,
  updateUserStatus,
  updateUserRoles,
} from './users.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission, requireAuth } from '../../middlewares/rbacGuard.js'

export default async function usersRoutes(fastify: FastifyInstance) {
  // ========== 管理員操作 ==========

  // GET /api/admin/roles
  fastify.get(
    '/admin/roles',
    { preHandler: [requireAuth()] },
    async (_request, reply) => {
      const data = await listRoles(fastify.prisma)
      return sendSuccess(reply, data)
    },
  )

  // GET /api/admin/users
  fastify.get<{ Querystring: ListUsersQueryType }>(
    '/admin/users',
    {
      schema: { querystring: ListUsersQuery },
      preHandler: [requirePermission('user:list')],
    },
    async (request, reply) => {
      const page = request.query.page ?? 1
      const pageSize = request.query.pageSize ?? 20

      const result = await listUsers(fastify.prisma, page, pageSize)

      return sendSuccess(reply, result.data, { meta: result.meta })
    },
  )

  // POST /api/admin/users/invite
  fastify.post<{ Body: InviteUserBodyType }>(
    '/admin/users/invite',
    {
      schema: { body: InviteUserBody },
      preHandler: [requirePermission('user:invite')],
    },
    async (request, reply) => {
      const { email, roleIds } = request.body
      const invitedBy = request.session.user!.id

      const result = await inviteUser(fastify.prisma, email, roleIds, invitedBy)

      return sendSuccess(reply, {
        userId: result.user.id,
        email: result.user.email,
        inviteUrl: result.inviteUrl,
      }, { statusCode: 201, message: '邀請已發送' })
    },
  )

  // PATCH /api/admin/users/:id/status
  fastify.patch<{ Params: UserIdParamsType; Body: UpdateUserStatusBodyType }>(
    '/admin/users/:id/status',
    {
      schema: { params: UserIdParams, body: UpdateUserStatusBody },
      preHandler: [requirePermission('user:deactivate')],
    },
    async (request, reply) => {
      const { id } = request.params
      const { isActive } = request.body
      const operatorId = request.session.user!.id

      const result = await updateUserStatus(
        fastify.prisma,
        fastify.redis,
        id,
        operatorId,
        isActive,
      )

      const message = isActive ? '使用者已復權' : '使用者已停權'
      return sendSuccess(reply, result, { message })
    },
  )

  // PUT /api/admin/users/:id/roles
  fastify.put<{ Params: UserIdParamsType; Body: UpdateUserRolesBodyType }>(
    '/admin/users/:id/roles',
    {
      schema: { params: UserIdParams, body: UpdateUserRolesBody },
      preHandler: [requirePermission('user:assign-role')],
    },
    async (request, reply) => {
      const { id } = request.params
      const { roleIds } = request.body
      const operatorId = request.session.user!.id

      const result = await updateUserRoles(
        fastify.prisma,
        fastify.redis,
        id,
        roleIds,
        operatorId,
      )

      return sendSuccess(reply, result, { message: '角色已更新' })
    },
  )

  // ========== Setup 流程（公開端點） ==========

  // POST /api/users/setup/verify-token
  fastify.post<{ Body: VerifyTokenBodyType }>(
    '/users/setup/verify-token',
    {
      schema: { body: VerifyTokenBody },
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { token } = request.body
      const result = await verifySetupToken(fastify.prisma, token)
      return sendSuccess(reply, result)
    },
  )

  // POST /api/users/setup/profile
  fastify.post<{ Body: SetupProfileBodyType }>(
    '/users/setup/profile',
    {
      schema: { body: SetupProfileBody },
    },
    async (request, reply) => {
      const { token, name, password } = request.body
      const result = await setupProfile(fastify.prisma, token, name, password)
      return sendSuccess(reply, result, { message: '基本資料設定完成，請繼續綁定 2FA' })
    },
  )

  // POST /api/users/setup/2fa-generate
  fastify.post<{ Body: TwoFaGenerateBodyType }>(
    '/users/setup/2fa-generate',
    {
      schema: { body: TwoFaGenerateBody },
    },
    async (request, reply) => {
      const { token } = request.body
      const result = await generate2FA(fastify.prisma, token)
      return sendSuccess(reply, result)
    },
  )

  // POST /api/users/setup/2fa-verify
  fastify.post<{ Body: TwoFaVerifyBodyType }>(
    '/users/setup/2fa-verify',
    {
      schema: { body: TwoFaVerifyBody },
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { token, code } = request.body
      const sessionUser = await verify2FA(fastify.prisma, token, code)

      request.session.user = sessionUser

      return sendSuccess(reply, {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
      }, { message: '帳號開通完成，已自動登入' })
    },
  )
}
