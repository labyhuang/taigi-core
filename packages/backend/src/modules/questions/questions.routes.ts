import type { FastifyInstance } from 'fastify'
import {
  CreateQuestionBody,
  UpdateQuestionBody,
  UpdateQuestionStatusBody,
  ListQuestionsQuery,
  QuestionIdParams,
  type CreateQuestionBodyType,
  type UpdateQuestionBodyType,
  type UpdateQuestionStatusBodyType,
  type ListQuestionsQueryType,
  type QuestionIdParamsType,
} from './questions.schema.js'
import {
  createQuestion,
  listQuestions,
  getQuestion,
  updateQuestion,
  deleteQuestion,
  updateQuestionStatus,
} from './questions.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'

export default async function questionsRoutes(fastify: FastifyInstance) {
  // POST /api/questions — 建立題目（草稿）
  fastify.post<{ Body: CreateQuestionBodyType }>(
    '/questions',
    {
      schema: { body: CreateQuestionBody },
      preHandler: [requirePermission('question:create')],
    },
    async (request, reply) => {
      const authorId = request.session.user!.id
      const result = await createQuestion(fastify.prisma, request.body, authorId)
      return sendSuccess(reply, result, { statusCode: 201, message: '題目草稿已建立' })
    },
  )

  // GET /api/questions — 查詢題目列表
  fastify.get<{ Querystring: ListQuestionsQueryType }>(
    '/questions',
    {
      schema: { querystring: ListQuestionsQuery },
      preHandler: [requirePermission('question:read')],
    },
    async (request, reply) => {
      const sessionUser = request.session.user!
      const result = await listQuestions(fastify.prisma, request.query, sessionUser)
      return sendSuccess(reply, result.data, { meta: result.meta })
    },
  )

  // GET /api/questions/:id — 取得題目詳情
  fastify.get<{ Params: QuestionIdParamsType }>(
    '/questions/:id',
    {
      schema: { params: QuestionIdParams },
      preHandler: [requirePermission('question:read')],
    },
    async (request, reply) => {
      const result = await getQuestion(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  // PATCH /api/questions/:id — 更新題目
  fastify.patch<{ Params: QuestionIdParamsType; Body: UpdateQuestionBodyType }>(
    '/questions/:id',
    {
      schema: { params: QuestionIdParams, body: UpdateQuestionBody },
      preHandler: [requirePermission('question:update')],
    },
    async (request, reply) => {
      const sessionUser = request.session.user!
      const result = await updateQuestion(
        fastify.prisma,
        request.params.id,
        request.body,
        sessionUser,
      )
      return sendSuccess(reply, result, { message: '題目已更新' })
    },
  )

  // DELETE /api/questions/:id — 刪除題目
  fastify.delete<{ Params: QuestionIdParamsType }>(
    '/questions/:id',
    {
      schema: { params: QuestionIdParams },
      preHandler: [requirePermission('question:delete')],
    },
    async (request, reply) => {
      const sessionUser = request.session.user!
      await deleteQuestion(fastify.prisma, request.params.id, sessionUser)
      return sendSuccess(reply, null, { message: '題目已刪除' })
    },
  )

  // PATCH /api/questions/:id/status — 變更題目狀態
  fastify.patch<{ Params: QuestionIdParamsType; Body: UpdateQuestionStatusBodyType }>(
    '/questions/:id/status',
    {
      schema: { params: QuestionIdParams, body: UpdateQuestionStatusBody },
      preHandler: [requirePermission('question:read')],
    },
    async (request, reply) => {
      const sessionUser = request.session.user!
      const { action, comment } = request.body
      const result = await updateQuestionStatus(
        fastify.prisma,
        request.params.id,
        action,
        comment,
        sessionUser,
      )
      return sendSuccess(reply, result, { message: '題目狀態已更新' })
    },
  )
}
