import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { redis } from '../config/redis.js'

async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    global: true,
    max: env.isProduction ? 100 : 500,
    timeWindow: '1 minute',
    ...(env.isProduction ? { redis } : {}),
  })
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
})
