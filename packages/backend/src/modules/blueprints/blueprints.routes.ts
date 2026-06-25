import type { FastifyInstance } from 'fastify'
import {
  CreateBlueprintBody,
  UpdateBlueprintBody,
  GeneratePaperBody,
  BlueprintIdParams,
  ListBlueprintsQuery,
  type CreateBlueprintBodyType,
  type UpdateBlueprintBodyType,
  type GeneratePaperBodyType,
  type BlueprintIdParamsType,
  type ListBlueprintsQueryType,
} from './blueprints.schema.js'
import {
  createBlueprint,
  listBlueprints,
  getBlueprint,
  updateBlueprint,
  deleteBlueprint,
  generatePaper,
} from './blueprints.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'

export default async function blueprintsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CreateBlueprintBodyType }>(
    '/blueprints',
    {
      schema: { body: CreateBlueprintBody },
      preHandler: [requirePermission('exam:create')],
    },
    async (request, reply) => {
      const userId = request.session.user!.id
      const result = await createBlueprint(fastify.prisma, request.body, userId)
      return sendSuccess(reply, result, { statusCode: 201, message: '藍圖已建立' })
    },
  )

  fastify.get<{ Querystring: ListBlueprintsQueryType }>(
    '/blueprints',
    {
      schema: { querystring: ListBlueprintsQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await listBlueprints(fastify.prisma, request.query)
      return sendSuccess(reply, result.data, { meta: result.meta })
    },
  )

  fastify.get<{ Params: BlueprintIdParamsType }>(
    '/blueprints/:id',
    {
      schema: { params: BlueprintIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await getBlueprint(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  fastify.patch<{ Params: BlueprintIdParamsType; Body: UpdateBlueprintBodyType }>(
    '/blueprints/:id',
    {
      schema: { params: BlueprintIdParams, body: UpdateBlueprintBody },
      preHandler: [requirePermission('exam:update')],
    },
    async (request, reply) => {
      const result = await updateBlueprint(fastify.prisma, request.params.id, request.body)
      return sendSuccess(reply, result, { message: '藍圖已更新' })
    },
  )

  fastify.delete<{ Params: BlueprintIdParamsType }>(
    '/blueprints/:id',
    {
      schema: { params: BlueprintIdParams },
      preHandler: [requirePermission('exam:delete')],
    },
    async (request, reply) => {
      await deleteBlueprint(fastify.prisma, request.params.id)
      return sendSuccess(reply, null, { message: '藍圖已刪除' })
    },
  )

  fastify.post<{ Params: BlueprintIdParamsType; Body: GeneratePaperBodyType }>(
    '/blueprints/:id/generate',
    {
      schema: { params: BlueprintIdParams, body: GeneratePaperBody },
      preHandler: [requirePermission('exam:assemble')],
    },
    async (request, reply) => {
      const userId = request.session.user!.id
      const result = await generatePaper(
        fastify.prisma,
        request.params.id,
        request.body.name,
        userId,
        { excludeUsedQuestions: request.body.excludeUsedQuestions ?? true },
      )
      return sendSuccess(reply, result, { statusCode: 201, message: '試卷已產生' })
    },
  )
}
