import type { FastifyInstance } from 'fastify'
import { sendSuccess, sendError } from '../../utils/response.js'
import { ErrorCode } from '../../types/response.js'

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    let dbStatus = 'disconnected'
    let redisStatus = 'disconnected'

    try {
      await fastify.prisma.$queryRaw`SELECT 1`
      dbStatus = 'connected'
    } catch {
      // DB 連線失敗
    }

    try {
      const pong = await fastify.redis.ping()
      if (pong === 'PONG') redisStatus = 'connected'
    } catch {
      // Redis 連線失敗
    }

    if (dbStatus === 'disconnected' || redisStatus === 'disconnected') {
      return sendError(reply, request, 503, ErrorCode.INTERNAL, '部分服務不可用')
    }

    return sendSuccess(reply, {
      status: 'ok',
      db: dbStatus,
      redis: redisStatus,
      uptime: process.uptime(),
    })
  })
}
