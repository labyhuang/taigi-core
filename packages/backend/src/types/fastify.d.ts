import 'fastify'
import type { PrismaClient } from '../generated/prisma/index.js'
import type Redis from 'ioredis'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    redis: Redis
  }

  interface Session {
    user?: {
      id: string
      email: string
      name: string | null
      isSetupCompleted: boolean
      isTwoFactorEnabled: boolean
      permissions: string[]
    }
  }
}
