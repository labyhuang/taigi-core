import { PrismaClient } from '../generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.js'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ['error'] : ['query', 'info', 'warn', 'error'],
})
