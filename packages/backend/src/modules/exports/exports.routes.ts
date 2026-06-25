/**
 * 試卷輸出路由
 *
 * 規格：specs/spec-export.md §3
 *
 * - GET /api/papers/:id/export.txt        下載純文字檔
 * - GET /api/papers/:id/export.zip        下載 ZIP（含或不含媒體）
 * - GET /api/papers/:id/export/preview    預覽純文字內容（包在 ApiSuccessResponse）
 *
 * 全部需要 `exam:read` 權限。
 */

import type { FastifyInstance } from 'fastify'
import {
  PaperIdParams,
  ExportZipQuery,
  type PaperIdParamsType,
  type ExportZipQueryType,
} from './exports.schema.js'
import { renderPaper, bundlePaperZip } from './exports.service.js'
import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'

export default async function exportsRoutes(fastify: FastifyInstance) {
  // GET /api/papers/:id/export.txt
  fastify.get<{ Params: PaperIdParamsType }>(
    '/papers/:id/export.txt',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const rendered = await renderPaper(fastify.prisma, request.params.id)
      reply
        .type('text/plain; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${rendered.filename}.txt"`,
        )
      return rendered.text
    },
  )

  // GET /api/papers/:id/export.zip?includeMedia=true|false
  fastify.get<{ Params: PaperIdParamsType; Querystring: ExportZipQueryType }>(
    '/papers/:id/export.zip',
    {
      schema: { params: PaperIdParams, querystring: ExportZipQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const includeMedia = request.query.includeMedia ?? true
      const { filename, stream, warnings } = await bundlePaperZip(
        fastify.prisma,
        request.params.id,
        { includeMedia },
      )

      if (warnings.length > 0) {
        for (const w of warnings) {
          request.log.warn({ paperId: request.params.id }, w)
        }
      }

      reply
        .type('application/zip')
        .header(
          'content-disposition',
          `attachment; filename="${filename}.zip"`,
        )
      return reply.send(stream)
    },
  )

  // GET /api/papers/:id/export/preview
  fastify.get<{ Params: PaperIdParamsType }>(
    '/papers/:id/export/preview',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const rendered = await renderPaper(fastify.prisma, request.params.id)
      return sendSuccess(reply, {
        filename: `${rendered.filename}.txt`,
        content: rendered.text,
        warnings: rendered.warnings,
      })
    },
  )
}
