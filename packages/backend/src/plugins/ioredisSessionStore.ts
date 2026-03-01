import type { Redis } from 'ioredis'
import type { SessionStore } from '@fastify/session'
import type { Session } from 'fastify'

const DEFAULT_TTL_SEC = 30 * 60 // 30 分鐘

/**
 * 相容 @fastify/session 的 callback-style store，使用 ioredis 的 SET key value EX seconds API。
 * connect-redis v9 使用 node-redis 的 set(key, val, { expiration: { type: 'EX', value } })，
 * 與 ioredis 不相容，故改為自訂 store。
 */
export function createIoredisSessionStore(redis: Redis, prefix = 'taigi:sess:'): SessionStore {
  return {
    get(sessionId: string, callback: (err: unknown, result?: Session | null) => void): void {
      const key = prefix + sessionId
      redis
        .get(key)
        .then((data) => {
          if (!data) return callback(null, null)
          try {
            const session = JSON.parse(data) as Session
            callback(null, session)
          } catch (err) {
            callback(err instanceof Error ? err : new Error(String(err)), null)
          }
        })
        .catch((err) => callback(err, null))
    },

    set(sessionId: string, session: Session, callback: (err?: unknown) => void): void {
      const key = prefix + sessionId
      const value = JSON.stringify(session)
      const ttlSec = getTTL(session)

      if (ttlSec <= 0) {
        redis.del(key).then(() => callback(null)).catch(callback)
        return
      }

      redis
        .set(key, value, 'EX', ttlSec)
        .then(() => callback(null))
        .catch(callback)
    },

    destroy(sessionId: string, callback: (err?: unknown) => void): void {
      const key = prefix + sessionId
      redis.del(key).then(() => callback(null)).catch(callback)
    },
  }
}

function getTTL(session: Session): number {
  const s = session as { cookie?: { expires?: Date | string } }
  if (s?.cookie?.expires) {
    const ms = Number(new Date(s.cookie.expires)) - Date.now()
    return Math.max(0, Math.ceil(ms / 1000))
  }
  return DEFAULT_TTL_SEC
}
