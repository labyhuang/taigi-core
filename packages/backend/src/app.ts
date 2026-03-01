import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'
import { sendSuccess } from './utils/response.js'

// Plugins
import decoratorsPlugin from './plugins/decorators.js'
import sessionPlugin from './plugins/session.js'
import csrfPlugin from './plugins/csrf.js'
import rateLimitPlugin from './plugins/rateLimit.js'
import errorHandlerPlugin from './plugins/errorHandler.js'

// Routes
import { authRoutes } from './modules/auth/index.js'
import { usersRoutes } from './modules/users/index.js'
import { healthRoutes } from './modules/health/index.js'
import { questionsRoutes } from './modules/questions/index.js'
import { mediaRoutes } from './modules/media/index.js'

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

  // 3. Session (依賴 cookie)
  await app.register(sessionPlugin)

  // 4. CSRF (依賴 session)
  await app.register(csrfPlugin)

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

  return app
}
