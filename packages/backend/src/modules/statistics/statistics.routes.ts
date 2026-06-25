/**
 * 統計分析路由
 *
 * spec-statistics.md §4
 */

import type { FastifyInstance } from 'fastify'
import {
  RecomputeBody,
  JobIdParams,
  QuestionStatsParams,
  QuestionStatsQuery,
  PaperStatsParams,
  PaperStatsQuery,
  ExploreQuery,
  type RecomputeBodyType,
  type JobIdParamsType,
  type QuestionStatsParamsType,
  type QuestionStatsQueryType,
  type PaperStatsParamsType,
  type PaperStatsQueryType,
  type ExploreQueryType,
} from './statistics.schema.js'
import {
  createRecomputeJob,
  getJob,
  getQuestionStats,
  getPaperStats,
  exploreStats,
} from './statistics.service.js'
import { runRecomputeJob } from './statistics.jobs.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission, requireAuth } from '../../middlewares/rbacGuard.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import { extractAuditContext, writeAuditLogSafe } from '../audit/audit.service.js'

export default async function statisticsRoutes(fastify: FastifyInstance) {
  // POST /api/statistics/recompute
  fastify.post<{ Body: RecomputeBodyType }>(
    '/statistics/recompute',
    {
      schema: { body: RecomputeBody },
      preHandler: [requireAuth()],
    },
    async (request, reply) => {
      const sessionUser = request.session.user!
      // 權限：exam-session:update 或 system:manage 任一
      if (
        !sessionUser.permissions.includes('exam-session:update') &&
        !sessionUser.permissions.includes('system:manage')
      ) {
        throw new AppError(403, ErrorCode.FORBIDDEN, '權限不足')
      }

      const job = await createRecomputeJob(
        fastify.prisma,
        request.body.scope,
        request.body.examSessionId ?? null,
        sessionUser.id,
      )

      // 立即排入背景，不等完成
      setImmediate(() => {
        void runRecomputeJob(fastify.prisma, job.id, request.log)
      })

      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'statistics.recompute',
        resourceType: 'RecomputeJob',
        resourceId: job.id,
        metadata: {
          scope: request.body.scope,
          examSessionId: request.body.examSessionId ?? null,
        },
      })

      return sendSuccess(reply, job, {
        statusCode: 202,
        message: '統計重算已排入背景處理',
      })
    },
  )

  // GET /api/statistics/jobs/:id
  fastify.get<{ Params: JobIdParamsType }>(
    '/statistics/jobs/:id',
    {
      schema: { params: JobIdParams },
      preHandler: [requirePermission('exam-session:read')],
    },
    async (request, reply) => {
      const result = await getJob(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  // GET /api/statistics/questions/:id
  fastify.get<{
    Params: QuestionStatsParamsType
    Querystring: QuestionStatsQueryType
  }>(
    '/statistics/questions/:id',
    {
      schema: { params: QuestionStatsParams, querystring: QuestionStatsQuery },
      preHandler: [requirePermission('question:read')],
    },
    async (request, reply) => {
      const view = request.query.view ?? 'cumulative'
      const result = await getQuestionStats(fastify.prisma, request.params.id, view)
      return sendSuccess(reply, result)
    },
  )

  // GET /api/statistics/papers/:id
  fastify.get<{
    Params: PaperStatsParamsType
    Querystring: PaperStatsQueryType
  }>(
    '/statistics/papers/:id',
    {
      schema: { params: PaperStatsParams, querystring: PaperStatsQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await getPaperStats(
        fastify.prisma,
        request.params.id,
        request.query.examSessionId ?? null,
      )
      return sendSuccess(reply, result)
    },
  )

  // GET /api/statistics/explore
  fastify.get<{ Querystring: ExploreQueryType }>(
    '/statistics/explore',
    {
      schema: { querystring: ExploreQuery },
      preHandler: [requirePermission('question:read')],
    },
    async (request, reply) => {
      const groupByList = request.query.groupBy
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (groupByList.length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION, 'groupBy 必填')
      }

      const result = await exploreStats(fastify.prisma, {
        groupBy: groupByList,
        examSessionId: request.query.examSessionId ?? null,
        metric: request.query.metric ?? 'difficulty',
        aggregation: request.query.aggregation ?? 'mean',
      })
      return sendSuccess(reply, result)
    },
  )
}
