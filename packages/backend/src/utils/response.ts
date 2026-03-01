import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '../types/response.js'

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  options?: { message?: string; meta?: PaginationMeta; statusCode?: number },
): FastifyReply {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(options?.message && { message: options.message }),
    ...(options?.meta && { meta: options.meta }),
  }
  return reply.status(options?.statusCode ?? 200).send(response)
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown[],
): FastifyReply {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    traceId: request.id,
    timestamp: new Date().toISOString(),
  }
  return reply.status(statusCode).send(response)
}
