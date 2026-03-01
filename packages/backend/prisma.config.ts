import dotenv from 'dotenv'
import { resolve } from 'node:path'

// 從 monorepo 根目錄載入 .env（支援從 packages/backend 或 repo root 執行）
const rootEnv = resolve(import.meta.dirname, '../../../.env')
dotenv.config({ path: rootEnv })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), '../../.env') })
}
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
