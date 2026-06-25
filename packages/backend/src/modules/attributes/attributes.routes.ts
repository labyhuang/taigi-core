import type { FastifyInstance } from 'fastify'
import {
  CreateAttributeBody,
  UpdateAttributeBody,
  AttributeIdParams,
  ListAttributesQuery,
  type CreateAttributeBodyType,
  type UpdateAttributeBodyType,
  type AttributeIdParamsType,
  type ListAttributesQueryType,
} from './attributes.schema.js'
import {
  listAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
  deleteAttribute,
} from './attributes.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'

export default async function attributesRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: ListAttributesQueryType }>(
    '/attributes',
    {
      schema: { querystring: ListAttributesQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await listAttributes(fastify.prisma, request.query)
      return sendSuccess(reply, result)
    },
  )

  fastify.get<{ Params: AttributeIdParamsType }>(
    '/attributes/:id',
    {
      schema: { params: AttributeIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const result = await getAttribute(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  fastify.post<{ Body: CreateAttributeBodyType }>(
    '/attributes',
    {
      schema: { body: CreateAttributeBody },
      preHandler: [requirePermission('system:manage')],
    },
    async (request, reply) => {
      const result = await createAttribute(fastify.prisma, request.body)
      return sendSuccess(reply, result, { statusCode: 201, message: '屬性定義已建立' })
    },
  )

  fastify.patch<{ Params: AttributeIdParamsType; Body: UpdateAttributeBodyType }>(
    '/attributes/:id',
    {
      schema: { params: AttributeIdParams, body: UpdateAttributeBody },
      preHandler: [requirePermission('system:manage')],
    },
    async (request, reply) => {
      const result = await updateAttribute(fastify.prisma, request.params.id, request.body)
      return sendSuccess(reply, result, { message: '屬性定義已更新' })
    },
  )

  fastify.delete<{ Params: AttributeIdParamsType }>(
    '/attributes/:id',
    {
      schema: { params: AttributeIdParams },
      preHandler: [requirePermission('system:manage')],
    },
    async (request, reply) => {
      await deleteAttribute(fastify.prisma, request.params.id)
      return sendSuccess(reply, null, { message: '屬性定義已刪除' })
    },
  )
}
