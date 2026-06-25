import type { FastifyInstance } from 'fastify'
import {
  PaperIdParams,
  PaperQuestionParams,
  ListPapersQuery,
  UpdatePaperBody,
  UpdatePaperStatusBody,
  ReplacePaperQuestionBody,
  type PaperIdParamsType,
  type PaperQuestionParamsType,
  type ListPapersQueryType,
  type UpdatePaperBodyType,
  type UpdatePaperStatusBodyType,
  type ReplacePaperQuestionBodyType,
} from './papers.schema.js'
import {
  listPapers,
  getPaper,
  updatePaper,
  publishPaper,
  deletePaper,
  replacePaperQuestion,
} from './papers.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { extractAuditContext, writeAuditLogSafe } from '../audit/audit.service.js'

export default async function papersRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: ListPapersQueryType }>(
    '/papers',
    {
      schema: { querystring: ListPapersQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await listPapers(fastify.prisma, request.query)
      return sendSuccess(reply, result.data, { meta: result.meta })
    },
  )

  fastify.get<{ Params: PaperIdParamsType }>(
    '/papers/:id',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await getPaper(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  fastify.patch<{ Params: PaperIdParamsType; Body: UpdatePaperBodyType }>(
    '/papers/:id',
    {
      schema: { params: PaperIdParams, body: UpdatePaperBody },
      preHandler: [requirePermission('exam:update')],
    },
    async (request, reply) => {
      const result = await updatePaper(fastify.prisma, request.params.id, request.body.name)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'paper.updateName',
        resourceType: 'ExamPaper',
        resourceId: request.params.id,
        metadata: { name: request.body.name },
      })
      return sendSuccess(reply, result, { message: '考卷名稱已更新' })
    },
  )

  fastify.patch<{ Params: PaperIdParamsType; Body: UpdatePaperStatusBodyType }>(
    '/papers/:id/status',
    {
      schema: { params: PaperIdParams, body: UpdatePaperStatusBody },
      preHandler: [requirePermission('exam:update')],
    },
    async (request, reply) => {
      void request.body.action
      const result = await publishPaper(fastify.prisma, request.params.id)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'paper.publish',
        resourceType: 'ExamPaper',
        resourceId: request.params.id,
      })
      return sendSuccess(reply, result, { message: '考卷已發布' })
    },
  )

  fastify.patch<{ Params: PaperQuestionParamsType; Body: ReplacePaperQuestionBodyType }>(
    '/papers/:id/questions/:questionId',
    {
      schema: { params: PaperQuestionParams, body: ReplacePaperQuestionBody },
      preHandler: [requirePermission('exam:update')],
    },
    async (request, reply) => {
      const result = await replacePaperQuestion(
        fastify.prisma,
        request.params.id,
        request.params.questionId,
        request.body.newQuestionId,
      )
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'paper.replaceQuestion',
        resourceType: 'ExamPaper',
        resourceId: request.params.id,
        metadata: {
          oldQuestionId: request.params.questionId,
          newQuestionId: request.body.newQuestionId,
        },
      })
      return sendSuccess(reply, result, { message: '題目已替換' })
    },
  )

  fastify.delete<{ Params: PaperIdParamsType }>(
    '/papers/:id',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:delete')],
    },
    async (request, reply) => {
      await deletePaper(fastify.prisma, request.params.id)
      const ctx = extractAuditContext(request)
      void writeAuditLogSafe(fastify.prisma, request.log, {
        ...ctx,
        action: 'paper.delete',
        resourceType: 'ExamPaper',
        resourceId: request.params.id,
      })
      return sendSuccess(reply, null, { message: '考卷已刪除' })
    },
  )
}
