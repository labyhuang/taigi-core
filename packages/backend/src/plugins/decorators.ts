import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../config/prisma.js'
import { redis } from '../config/redis.js'

async function decoratorsPlugin(fastify: FastifyInstance) {
  fastify.decorate('prisma', prisma)
  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
    redis.disconnect()
  })
}

export default fp(decoratorsPlugin, {
  name: 'decorators',
})
