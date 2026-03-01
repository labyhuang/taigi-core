import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyError } from 'fastify'
import { Prisma } from '../generated/prisma/index.js'
import { AppError } from '../utils/errors.js'
import { ErrorCode } from '../types/response.js'
import type { ApiErrorResponse } from '../types/response.js'

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error)

    // 自訂業務錯誤
    if (error instanceof AppError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
        traceId: request.id,
        timestamp: new Date().toISOString(),
      }
      return reply.status(error.statusCode).send(response)
    }

    // Fastify 驗證錯誤 (TypeBox schema validation)
    if (error.validation) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCode.VALIDATION,
          message: '請求資料驗證失敗',
          details: error.validation.map((v: { instancePath?: string; params?: Record<string, unknown>; message?: string }) => ({
            field: v.instancePath || v.params?.missingProperty,
            message: v.message,
          })),
        },
        traceId: request.id,
        timestamp: new Date().toISOString(),
      }
      return reply.status(400).send(response)
    }

    // Rate limit 錯誤
    if (error.statusCode === 429) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: '請求過於頻繁，請稍後再試',
        },
        traceId: request.id,
        timestamp: new Date().toISOString(),
      }
      return reply.status(429).send(response)
    }

    // Prisma 已知錯誤
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: ErrorCode.DUPLICATE,
            message: '資源已存在',
          },
          traceId: request.id,
          timestamp: new Date().toISOString(),
        }
        return reply.status(409).send(response)
      }
      if (error.code === 'P2025') {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: '請求的資源不存在',
          },
          traceId: request.id,
          timestamp: new Date().toISOString(),
        }
        return reply.status(404).send(response)
      }
    }

    // 未預期錯誤
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL,
        message: env.isProduction ? '伺服器內部錯誤' : error.message,
      },
      traceId: request.id,
      timestamp: new Date().toISOString(),
    }
    return reply.status(error.statusCode ?? 500).send(response)
  })
}

// env 需要在此檔案中引用
import { env } from '../config/env.js'

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
})
