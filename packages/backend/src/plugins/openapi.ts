/**
 * OpenAPI（Swagger UI）— Phase 6
 * 開發環境預設啟用；生產環境須 OPENAPI_ENABLED=true。
 */

import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from '../config/env.js'

async function openapiPlugin(app: FastifyInstance) {
  if (!env.openApiEnabled) {
    app.log.info('OpenAPI / Swagger UI 已停用（production 且未設 OPENAPI_ENABLED）')
    return
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Taigi Core API',
        description:
          '台語檢定題庫核心後端。使用 Stateful Session Cookie；寫入請求需 CSRF（登入與 API key 匯入除外）。',
        version: '0.1.0',
      },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  app.log.info('OpenAPI 文件：GET /api/docs')
}

export default fp(openapiPlugin, { name: 'openapi' })
