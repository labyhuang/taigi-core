/**
 * API Client（外部考試系統 X-Api-Key）管理路由
 *
 * spec-exam-session.md §7
 *
 * 路徑：/api/admin/api-clients/...（與 admin/users 同前綴）
 */

import type { FastifyInstance } from 'fastify'
import {
  ApiClientIdParams,
  CreateApiClientBody,
  type ApiClientIdParamsType,
  type CreateApiClientBodyType,
} from './api-clients.schema.js'
import {
  listApiClients,
  createApiClient,
  revokeApiClient,
  rotateApiClient,
} from './api-clients.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { extractAuditContext, writeAuditLogSafe } from '../audit/audit.service.js'

export default async function apiClientsRoutes(fastify: FastifyInstance) {
  // GET /api/admin/api-clients
  fastify.get(
    '/admin/api-clients',
    { preHandler: [requirePermission('api-client:manage')] },
    async (_request, reply) => {
      const result = await listApiClients(fastify.prisma)
      return sendSuccess(reply, result)
    },
  )

  // POST /api/admin/api-clients
  fastify.post<{ Body: CreateApiClientBodyType }>(
    '/admin/api-clients',
    {
      schema: { body: CreateApiClientBody },
      preHandler: [requirePermission('api-client:manage')],
    },
    async (request, reply) => {
      const userId = request.session.user!.id
      const result = await createApiClient(fastify.prisma, request.body, userId)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'apiClient.create',
        resourceType: 'ApiClient',
        resourceId: result.id,
        metadata: { name: request.body.name, scopes: request.body.scopes },
      })
      return sendSuccess(reply, result, {
        statusCode: 201,
        message: '請複製並妥善保管 plainKey，此後將無法再次查看',
      })
    },
  )

  // PATCH /api/admin/api-clients/:id/revoke
  fastify.patch<{ Params: ApiClientIdParamsType }>(
    '/admin/api-clients/:id/revoke',
    {
      schema: { params: ApiClientIdParams },
      preHandler: [requirePermission('api-client:manage')],
    },
    async (request, reply) => {
      const result = await revokeApiClient(fastify.prisma, request.params.id)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'apiClient.revoke',
        resourceType: 'ApiClient',
        resourceId: request.params.id,
      })
      return sendSuccess(reply, result, { message: 'API client 已撤銷' })
    },
  )

  // POST /api/admin/api-clients/:id/rotate
  fastify.post<{ Params: ApiClientIdParamsType }>(
    '/admin/api-clients/:id/rotate',
    {
      schema: { params: ApiClientIdParams },
      preHandler: [requirePermission('api-client:manage')],
    },
    async (request, reply) => {
      const result = await rotateApiClient(fastify.prisma, request.params.id)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'apiClient.rotate',
        resourceType: 'ApiClient',
        resourceId: request.params.id,
      })
      return sendSuccess(reply, result, {
        message: '已產生新 key，舊 key 立即失效',
      })
    },
  )
}
