/**
 * ExamSession CRUD 路由（spec-exam-session.md §4）
 */

import type { FastifyInstance } from 'fastify'
import {
  ExamSessionIdParams,
  ExamSessionPaperParams,
  ListExamSessionsQuery,
  CreateExamSessionBody,
  UpdateExamSessionBody,
  UpdateExamSessionStatusBody,
  BindPaperBody,
  type ExamSessionIdParamsType,
  type ExamSessionPaperParamsType,
  type ListExamSessionsQueryType,
  type CreateExamSessionBodyType,
  type UpdateExamSessionBodyType,
  type UpdateExamSessionStatusBodyType,
  type BindPaperBodyType,
} from './exam-sessions.schema.js'
import {
  createExamSession,
  listExamSessions,
  getExamSession,
  updateExamSession,
  updateExamSessionStatus,
  deleteExamSession,
  bindPaper,
  unbindPaper,
  listImportLogs,
} from './exam-sessions.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { enqueueRecompute } from '../statistics/index.js'
import { extractAuditContext, writeAuditLogSafe } from '../audit/audit.service.js'

export default async function examSessionsRoutes(fastify: FastifyInstance) {
  // POST /api/exam-sessions
  fastify.post<{ Body: CreateExamSessionBodyType }>(
    '/exam-sessions',
    {
      schema: { body: CreateExamSessionBody },
      preHandler: [requirePermission('exam-session:create')],
    },
    async (request, reply) => {
      const userId = request.session.user!.id
      const result = await createExamSession(fastify.prisma, request.body, userId)
      return sendSuccess(reply, result, { statusCode: 201, message: '考期已建立' })
    },
  )

  // GET /api/exam-sessions
  fastify.get<{ Querystring: ListExamSessionsQueryType }>(
    '/exam-sessions',
    {
      schema: { querystring: ListExamSessionsQuery },
      preHandler: [requirePermission('exam-session:read')],
    },
    async (request, reply) => {
      const result = await listExamSessions(fastify.prisma, request.query)
      return sendSuccess(reply, result.data, { meta: result.meta })
    },
  )

  // GET /api/exam-sessions/:id
  fastify.get<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:read')],
    },
    async (request, reply) => {
      const result = await getExamSession(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  // PATCH /api/exam-sessions/:id
  fastify.patch<{ Params: ExamSessionIdParamsType; Body: UpdateExamSessionBodyType }>(
    '/exam-sessions/:id',
    {
      schema: { params: ExamSessionIdParams, body: UpdateExamSessionBody },
      preHandler: [requirePermission('exam-session:update')],
    },
    async (request, reply) => {
      const result = await updateExamSession(
        fastify.prisma,
        request.params.id,
        request.body,
      )
      return sendSuccess(reply, result, { message: '考期已更新' })
    },
  )

  // PATCH /api/exam-sessions/:id/status
  fastify.patch<{
    Params: ExamSessionIdParamsType
    Body: UpdateExamSessionStatusBodyType
  }>(
    '/exam-sessions/:id/status',
    {
      schema: { params: ExamSessionIdParams, body: UpdateExamSessionStatusBody },
      preHandler: [requirePermission('exam-session:update')],
    },
    async (request, reply) => {
      const result = await updateExamSessionStatus(
        fastify.prisma,
        request.params.id,
        request.body.action,
      )
      const messageMap = {
        MARK_IMPORTED: '考期已標記為已匯入',
        ARCHIVE: '考期已封存',
      }

      // spec-statistics.md §1.4：MARK_IMPORTED 後自動觸發 scope='all' 重算
      if (request.body.action === 'MARK_IMPORTED') {
        const userId = request.session.user!.id
        void enqueueRecompute(
          fastify.prisma,
          {
            scope: 'all',
            examSessionId: request.params.id,
            userId,
          },
          request.log,
        )
      }

      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: `examSession.status.${request.body.action}`,
        resourceType: 'ExamSession',
        resourceId: request.params.id,
      })

      return sendSuccess(reply, result, { message: messageMap[request.body.action] })
    },
  )

  // DELETE /api/exam-sessions/:id
  fastify.delete<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:delete')],
    },
    async (request, reply) => {
      await deleteExamSession(fastify.prisma, request.params.id)
      return sendSuccess(reply, null, { message: '考期已刪除' })
    },
  )

  // POST /api/exam-sessions/:id/papers
  fastify.post<{ Params: ExamSessionIdParamsType; Body: BindPaperBodyType }>(
    '/exam-sessions/:id/papers',
    {
      schema: { params: ExamSessionIdParams, body: BindPaperBody },
      preHandler: [requirePermission('exam-session:update')],
    },
    async (request, reply) => {
      const result = await bindPaper(fastify.prisma, request.params.id, request.body)
      return sendSuccess(reply, result, { message: '考卷已綁定' })
    },
  )

  // DELETE /api/exam-sessions/:id/papers/:paperId
  fastify.delete<{ Params: ExamSessionPaperParamsType }>(
    '/exam-sessions/:id/papers/:paperId',
    {
      schema: { params: ExamSessionPaperParams },
      preHandler: [requirePermission('exam-session:update')],
    },
    async (request, reply) => {
      const result = await unbindPaper(
        fastify.prisma,
        request.params.id,
        request.params.paperId,
      )
      return sendSuccess(reply, result, { message: '考卷已解綁' })
    },
  )

  // GET /api/exam-sessions/:id/imports
  fastify.get<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id/imports',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:read')],
    },
    async (request, reply) => {
      const result = await listImportLogs(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )
}
