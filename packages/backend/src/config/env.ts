import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(import.meta.dirname, '../../../../.env') })

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`環境變數 ${key} 未設定`)
  }
  return value
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  HOST: process.env.HOST ?? '0.0.0.0',

  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),

  COOKIE_SECRET: requireEnv('COOKIE_SECRET'),
  SESSION_SECRET: requireEnv('SESSION_SECRET'),

  TWO_FACTOR_ENCRYPTION_KEY: requireEnv('TWO_FACTOR_ENCRYPTION_KEY'),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  get isProduction() {
    return this.NODE_ENV === 'production'
  },

  /** 生產環境預設關閉；設為 true 則啟用 /api/docs 與 OpenAPI JSON（Phase 6） */
  get openApiEnabled() {
    return !this.isProduction || process.env.OPENAPI_ENABLED === 'true'
  },
} as const
