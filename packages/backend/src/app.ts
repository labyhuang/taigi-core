import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'
import { sendSuccess } from './utils/response.js'

// CSRF 例外清單：登入 / 開通流程 / API key 推送等不需 CSRF 的端點。
// 詳見 spec-bugfixes.md §2.3。
const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/login',
  '/api/auth/verify-2fa',
  '/api/users/setup/verify-token',
  '/api/users/setup/profile',
  '/api/users/setup/2fa-generate',
  '/api/users/setup/2fa-verify',
  '/api/exam-sessions/imports/api/',
] as const

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Plugins
import decoratorsPlugin from './plugins/decorators.js'
import openapiPlugin from './plugins/openapi.js'
import sessionPlugin from './plugins/session.js'
import csrfPlugin from './plugins/csrf.js'
import rateLimitPlugin from './plugins/rateLimit.js'
import errorHandlerPlugin from './plugins/errorHandler.js'
import apiKeyAuthPlugin from './plugins/apiKeyAuth.js'

// Routes
import { authRoutes } from './modules/auth/index.js'
import { usersRoutes } from './modules/users/index.js'
import { healthRoutes } from './modules/health/index.js'
import { questionsRoutes } from './modules/questions/index.js'
import { mediaRoutes } from './modules/media/index.js'
import { blueprintsRoutes } from './modules/blueprints/index.js'
import { papersRoutes } from './modules/papers/index.js'
import { attributesRoutes } from './modules/attributes/index.js'
import { exportsRoutes } from './modules/exports/index.js'
import { examSessionsRoutes, importsRoutes } from './modules/exam-sessions/index.js'
import { apiClientsRoutes } from './modules/api-clients/index.js'
import { statisticsRoutes } from './modules/statistics/index.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.isProduction ? 'info' : 'debug',
      transport:
        env.isProduction
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  })

  // 1. CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  // 2. Decorators (prisma, redis)
  await app.register(decoratorsPlugin)

  // 2.0 OpenAPI（僅開發或非正式環境，或 OPENAPI_ENABLED=true）
  await app.register(openapiPlugin)

  // 2.1 API key auth decorator (spec-exam-session.md §6.4 / §8.2)
  await app.register(apiKeyAuthPlugin)

  // 3. Session (依賴 cookie)
  await app.register(sessionPlugin)

  // 4. CSRF (依賴 session)
  await app.register(csrfPlugin)

  // 4.1 CSRF 全域 onRoute hook (Bug #1 修復，spec-bugfixes.md §2)
  // 為所有 mutation 端點 (POST/PUT/PATCH/DELETE) 自動掛上 csrfProtection preHandler，
  // 排除 CSRF_EXEMPT_PREFIXES 中的公開端點。
  app.addHook('onRoute', (routeOptions) => {
    const methods = ([] as string[]).concat(routeOptions.method as never)
    const isMutation = methods.some((m) => MUTATION_METHODS.has(String(m).toUpperCase()))
    if (!isMutation) return

    const url = String(routeOptions.url ?? '')
    if (CSRF_EXEMPT_PREFIXES.some((p) => url.startsWith(p))) return

    const existing = routeOptions.preHandler
    const handlers = ([] as unknown[]).concat(existing ?? [])
    handlers.unshift(app.csrfProtection)
    routeOptions.preHandler = handlers as never
  })

  // 5. Rate Limit
  await app.register(rateLimitPlugin)

  // 6. Error Handler
  await app.register(errorHandlerPlugin)

  // ========== Routes ==========

  // Health Check、CSRF Token（前綴 /api）
  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(async (fastify) => {
    fastify.get('/csrf-token', async (_request, reply) => {
      const token = reply.generateCsrf()
      return sendSuccess(reply, { token })
    })
  }, { prefix: '/api' })

  // Auth 路由
  await app.register(authRoutes, { prefix: '/api/auth' })

  // Users 路由（包含 /api/admin/users/* 和 /api/users/setup/*）
  await app.register(usersRoutes, { prefix: '/api' })

  // 題庫管理路由
  await app.register(questionsRoutes, { prefix: '/api' })

  // 多媒體素材路由
  await app.register(mediaRoutes, { prefix: '/api' })

  // 組卷模組路由
  await app.register(blueprintsRoutes, { prefix: '/api' })
  await app.register(papersRoutes, { prefix: '/api' })
  await app.register(attributesRoutes, { prefix: '/api' })

  // 試卷輸出（純文字 + ZIP），spec-export.md
  await app.register(exportsRoutes, { prefix: '/api' })

  // 考期 / 匯入模組（spec-exam-session.md）
  await app.register(examSessionsRoutes, { prefix: '/api' })
  await app.register(importsRoutes, { prefix: '/api' })

  // API key 管理（外部考試系統推送用）
  await app.register(apiClientsRoutes, { prefix: '/api' })

  // CTT 統計分析（spec-statistics.md）
  await app.register(statisticsRoutes, { prefix: '/api' })

  return app
}
