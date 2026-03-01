import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { MediaIdParams, type MediaIdParamsType } from './media.schema.js'
import { uploadMedia, getMediaUrl, deleteMedia } from './media.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

export default async function mediaRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB
    },
  })

  // POST /api/media — 上傳媒體
  fastify.post(
    '/media',
    { preHandler: [requirePermission('media:upload')] },
    async (request, reply) => {
      const data = await request.file()
      if (!data) {
        throw new AppError(400, ErrorCode.VALIDATION, '未上傳任何檔案')
      }

      const buffer = await data.toBuffer()
      const result = await uploadMedia(
        fastify.prisma,
        {
          filename: data.filename,
          mimetype: data.mimetype,
          data: buffer,
        },
        request.session.user!.id,
      )

      return sendSuccess(reply, result, { statusCode: 201, message: '素材上傳成功' })
    },
  )

  // GET /api/media/:id/url — 取得媒體存取 URL
  fastify.get<{ Params: MediaIdParamsType }>(
    '/media/:id/url',
    {
      schema: { params: MediaIdParams },
      preHandler: [requirePermission('media:read')],
    },
    async (request, reply) => {
      const result = await getMediaUrl(fastify.prisma, request.params.id)
      return sendSuccess(reply, result)
    },
  )

  // DELETE /api/media/:id — 刪除媒體
  fastify.delete<{ Params: MediaIdParamsType }>(
    '/media/:id',
    {
      schema: { params: MediaIdParams },
      preHandler: [requirePermission('media:delete')],
    },
    async (request, reply) => {
      await deleteMedia(fastify.prisma, request.params.id)
      return sendSuccess(reply, null, { message: '素材已刪除' })
    },
  )
}
