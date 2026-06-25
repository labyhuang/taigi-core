/**
 * X-Api-Key 驗證 plugin（spec-exam-session.md §6.4 / §8.2）
 *
 * 用途：
 *   - 為「外部考試系統推送」端點提供無 Session 的認證機制
 *   - 走 sha256 雜湊比對 ApiClient.keyHash
 *   - 通過後 decorate request.apiClient 並非阻塞更新 lastUsedAt
 *
 * 對應路徑：CSRF 例外清單中的 `/api/exam-sessions/imports/api/`
 */

import fp from 'fastify-plugin'
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AppError } from '../utils/errors.js'
import { ErrorCode } from '../types/response.js'

declare module 'fastify' {
  interface FastifyRequest {
    apiClient?: { id: string; scopes: string[]; name: string }
  }
}

async function apiKeyAuthPlugin(fastify: FastifyInstance) {
  // 預先 decorate，避免 strict 模式下取用未 decorate 的屬性
  fastify.decorateRequest('apiClient', undefined)
}

export default fp(apiKeyAuthPlugin, { name: 'api-key-auth' })

/**
 * 用於 preHandler：驗 X-Api-Key、查 ApiClient、檢查 scope。
 *
 * 失敗回 401 ERR_API_KEY_INVALID 或 403 ERR_FORBIDDEN（scope 不足）。
 */
export function requireApiKey(scope: string) {
  return async (request: FastifyRequest) => {
    const plain = request.headers['x-api-key']
    if (!plain || typeof plain !== 'string') {
      throw new AppError(401, ErrorCode.API_KEY_INVALID, '未提供 X-Api-Key')
    }

    const keyHash = createHash('sha256').update(plain).digest('hex')
    const client = await request.server.prisma.apiClient.findUnique({
      where: { keyHash },
    })

    if (!client || !client.isActive || client.revokedAt) {
      throw new AppError(401, ErrorCode.API_KEY_INVALID, '無效的 API key')
    }

    if (!client.scopes.includes(scope)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, `此 API key 缺少 scope: ${scope}`)
    }

    request.apiClient = { id: client.id, scopes: client.scopes, name: client.name }

    // 非阻塞：更新 lastUsedAt 失敗不影響主流程
    void request.server.prisma.apiClient
      .update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err: unknown) => {
        request.log.warn({ err, apiClientId: client.id }, '更新 lastUsedAt 失敗')
      })
  }
}
