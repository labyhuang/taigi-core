import fp from 'fastify-plugin'
import csrfProtection from '@fastify/csrf-protection'
import type { FastifyInstance } from 'fastify'

async function csrfPlugin(fastify: FastifyInstance) {
  await fastify.register(csrfProtection, {
    sessionPlugin: '@fastify/session',
    cookieOpts: { signed: true },
  })
}

export default fp(csrfPlugin, {
  name: 'csrf',
  dependencies: ['session'],
})
