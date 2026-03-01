import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../utils/errors.js'
import { ErrorCode } from '../types/response.js'

export function requireAuth() {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const sessionUser = request.session.user
    if (!sessionUser) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, '未登入或 Session 已過期')
    }
    if (!sessionUser.isSetupCompleted || !sessionUser.isTwoFactorEnabled) {
      throw new AppError(403, ErrorCode.SETUP_INCOMPLETE, '帳號尚未完成設定流程')
    }
  }
}

export function requirePermission(action: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const sessionUser = request.session.user
    if (!sessionUser) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, '未登入或 Session 已過期')
    }
    if (!sessionUser.isSetupCompleted || !sessionUser.isTwoFactorEnabled) {
      throw new AppError(403, ErrorCode.SETUP_INCOMPLETE, '帳號尚未完成設定流程')
    }
    if (!sessionUser.permissions.includes(action)) {
      request.log.warn(
        { userId: sessionUser.id, requiredPermission: action },
        '權限不足',
      )
      throw new AppError(403, ErrorCode.FORBIDDEN, '權限不足')
    }
  }
}
