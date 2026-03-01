import fp from 'fastify-plugin'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import type { FastifyInstance } from 'fastify'
import { redis } from '../config/redis.js'
import { env } from '../config/env.js'
import { createIoredisSessionStore } from './ioredisSessionStore.js'

const SESSION_MAX_AGE = 30 * 60 * 1000 // 30 分鐘

async function sessionPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
  })

  const store = createIoredisSessionStore(redis, 'taigi:sess:')

  await fastify.register(fastifySession, {
    secret: env.SESSION_SECRET,
    store,
    cookie: {
      secure: env.isProduction,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
    },
    rolling: true,
    saveUninitialized: false,
  })
}

export default fp(sessionPlugin, {
  name: 'session',
})
