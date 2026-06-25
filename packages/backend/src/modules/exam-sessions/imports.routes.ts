/**
 * 應答匯入路由（spec-exam-session.md §6）
 *
 * 兩套入口：
 *
 *   A. Web UI 上傳（multipart/form-data，需 Session Cookie + CSRF）
 *      - POST /api/exam-sessions/:id/imports/candidates
 *      - POST /api/exam-sessions/:id/imports/responses
 *      - POST /api/exam-sessions/:id/imports/speaking-scores
 *
 *   B. API key 推送（application/json，CSRF 例外、X-Api-Key）
 *      - POST /api/exam-sessions/imports/api/candidates
 *      - POST /api/exam-sessions/imports/api/responses
 *      - POST /api/exam-sessions/imports/api/speaking-scores
 *      Body 內須帶 examSessionId
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import { Type, type Static } from '@sinclair/typebox'

import { sendSuccess } from '../../utils/response.js'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { requireApiKey } from '../../plugins/apiKeyAuth.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

import {
  parseCandidatesCsv,
  parseCandidatesJson,
  parseResponsesCsv,
  parseResponsesJson,
  parseSpeakingScoresCsv,
  parseSpeakingScoresJson,
} from './imports.parser.js'
import {
  importCandidates,
  importResponses,
  importSpeakingScores,
  type ImportContext,
} from './imports.service.js'
import { ExamSessionIdParams, type ExamSessionIdParamsType } from './exam-sessions.schema.js'
import { enqueueRecompute } from '../statistics/index.js'
import type { PrismaClient } from '../../generated/prisma/index.js'

/**
 * spec-statistics.md §1.4：匯入結束後若 session 已 IMPORTED 則 enqueue 重算。
 * DRAFT 階段的 response 不會被計入統計（§1.2），因此先不觸發；
 * 等管理員按 MARK_IMPORTED 時的 hook 自會發動完整重算。
 */
async function maybeEnqueueAfterImport(
  prisma: PrismaClient,
  examSessionId: string,
  fallbackUserId: string | null,
  log: FastifyRequest['log'],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return
  const session = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    select: { status: true, createdById: true },
  })
  if (!session || session.status === 'DRAFT') return
  const userId = fallbackUserId ?? session.createdById
  void enqueueRecompute(
    prisma,
    { scope: 'all', examSessionId, userId },
    log,
  )
}

// ========== Schemas ==========

const ApiImportCandidatesBody = Type.Object({
  examSessionId: Type.String({ format: 'uuid' }),
  candidates: Type.Array(Type.Any()),
})
type ApiImportCandidatesBodyType = Static<typeof ApiImportCandidatesBody>

const ApiImportResponsesBody = Type.Object({
  examSessionId: Type.String({ format: 'uuid' }),
  responses: Type.Array(Type.Any()),
})
type ApiImportResponsesBodyType = Static<typeof ApiImportResponsesBody>

const ApiImportSpeakingScoresBody = Type.Object({
  examSessionId: Type.String({ format: 'uuid' }),
  speakingScores: Type.Array(Type.Any()),
})
type ApiImportSpeakingScoresBodyType = Static<typeof ApiImportSpeakingScoresBody>

// ========== Helper：multipart 解析 ==========

interface MultipartUpload {
  buffer: Buffer
  filename: string
  format: 'csv' | 'json'
  dryRun: boolean
}

async function parseMultipart(request: FastifyRequest): Promise<MultipartUpload> {
  const parts = request.parts()
  let buffer: Buffer | null = null
  let filename = ''
  let format: 'csv' | 'json' | null = null
  let dryRun = false

  for await (const part of parts) {
    if (part.type === 'file') {
      buffer = await part.toBuffer()
      filename = part.filename
    } else if (part.type === 'field') {
      const value = String(part.value ?? '')
      if (part.fieldname === 'format') {
        if (value === 'csv' || value === 'json') format = value
      } else if (part.fieldname === 'dryRun') {
        dryRun = value === 'true' || value === '1'
      }
    }
  }

  if (!buffer) {
    throw new AppError(400, ErrorCode.VALIDATION, '未上傳任何檔案')
  }
  if (!format) {
    // fallback：依檔名副檔名推測
    const ext = filename.toLowerCase().split('.').pop()
    if (ext === 'csv') format = 'csv'
    else if (ext === 'json') format = 'json'
    else {
      throw new AppError(
        400,
        ErrorCode.VALIDATION,
        '請指定 format 欄位（csv 或 json）',
      )
    }
  }

  return { buffer, filename, format, dryRun }
}

// ========== Routes ==========

export default async function importsRoutes(fastify: FastifyInstance) {
  // multipart 限制 50MB（CSV 通常很小，但留給未來大批次匯入）
  await fastify.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  })

  // ---------- A. Web UI multipart ----------

  fastify.post<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id/imports/candidates',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:import')],
    },
    async (request, reply) => {
      const { buffer, format, dryRun } = await parseMultipart(request)
      const parsed =
        format === 'csv' ? parseCandidatesCsv(buffer) : parseCandidatesJson(buffer)

      const ctx: ImportContext = {
        actorType: 'user',
        actorId: request.session.user!.id,
        sourceFormat: format,
        dryRun,
      }

      const result = await importCandidates(
        fastify.prisma,
        request.params.id,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.params.id,
        request.session.user!.id,
        request.log,
        dryRun,
      )
      return sendSuccess(reply, result, {
        message: dryRun ? '驗證完成（dryRun）' : '匯入完成',
      })
    },
  )

  fastify.post<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id/imports/responses',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:import')],
    },
    async (request, reply) => {
      const { buffer, format, dryRun } = await parseMultipart(request)
      const parsed =
        format === 'csv' ? parseResponsesCsv(buffer) : parseResponsesJson(buffer)

      const ctx: ImportContext = {
        actorType: 'user',
        actorId: request.session.user!.id,
        sourceFormat: format,
        dryRun,
      }

      const result = await importResponses(
        fastify.prisma,
        request.params.id,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.params.id,
        request.session.user!.id,
        request.log,
        dryRun,
      )
      return sendSuccess(reply, result, {
        message: dryRun ? '驗證完成（dryRun）' : '匯入完成',
      })
    },
  )

  fastify.post<{ Params: ExamSessionIdParamsType }>(
    '/exam-sessions/:id/imports/speaking-scores',
    {
      schema: { params: ExamSessionIdParams },
      preHandler: [requirePermission('exam-session:import')],
    },
    async (request, reply) => {
      const { buffer, format, dryRun } = await parseMultipart(request)
      const parsed =
        format === 'csv'
          ? parseSpeakingScoresCsv(buffer)
          : parseSpeakingScoresJson(buffer)

      const ctx: ImportContext = {
        actorType: 'user',
        actorId: request.session.user!.id,
        sourceFormat: format,
        dryRun,
      }

      const result = await importSpeakingScores(
        fastify.prisma,
        request.params.id,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.params.id,
        request.session.user!.id,
        request.log,
        dryRun,
      )
      return sendSuccess(reply, result, {
        message: dryRun ? '驗證完成（dryRun）' : '匯入完成',
      })
    },
  )

  // ---------- B. API key 推送 ----------
  // Note: 這些 path 已在 app.ts CSRF_EXEMPT_PREFIXES (`/api/exam-sessions/imports/api/`) 內，
  // 不會被全域 CSRF hook 攔下。

  fastify.post<{ Body: ApiImportCandidatesBodyType }>(
    '/exam-sessions/imports/api/candidates',
    {
      schema: { body: ApiImportCandidatesBody },
      preHandler: [requireApiKey('import:candidates')],
    },
    async (request, reply) => {
      const parsed = parseCandidatesJson({ candidates: request.body.candidates })
      const ctx: ImportContext = {
        actorType: 'api_client',
        actorId: request.apiClient!.id,
        sourceFormat: 'json',
      }
      const result = await importCandidates(
        fastify.prisma,
        request.body.examSessionId,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.body.examSessionId,
        null,
        request.log,
        false,
      )
      return sendSuccess(reply, result, { message: '匯入完成' })
    },
  )

  fastify.post<{ Body: ApiImportResponsesBodyType }>(
    '/exam-sessions/imports/api/responses',
    {
      schema: { body: ApiImportResponsesBody },
      preHandler: [requireApiKey('import:responses')],
    },
    async (request, reply) => {
      const parsed = parseResponsesJson({ responses: request.body.responses })
      const ctx: ImportContext = {
        actorType: 'api_client',
        actorId: request.apiClient!.id,
        sourceFormat: 'json',
      }
      const result = await importResponses(
        fastify.prisma,
        request.body.examSessionId,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.body.examSessionId,
        null,
        request.log,
        false,
      )
      return sendSuccess(reply, result, { message: '匯入完成' })
    },
  )

  fastify.post<{ Body: ApiImportSpeakingScoresBodyType }>(
    '/exam-sessions/imports/api/speaking-scores',
    {
      schema: { body: ApiImportSpeakingScoresBody },
      preHandler: [requireApiKey('import:speaking_scores')],
    },
    async (request, reply) => {
      const parsed = parseSpeakingScoresJson({ speakingScores: request.body.speakingScores })
      const ctx: ImportContext = {
        actorType: 'api_client',
        actorId: request.apiClient!.id,
        sourceFormat: 'json',
      }
      const result = await importSpeakingScores(
        fastify.prisma,
        request.body.examSessionId,
        parsed.rows,
        parsed.errors,
        ctx,
      )
      await maybeEnqueueAfterImport(
        fastify.prisma,
        request.body.examSessionId,
        null,
        request.log,
        false,
      )
      return sendSuccess(reply, result, { message: '匯入完成' })
    },
  )
}
