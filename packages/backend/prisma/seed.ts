import dotenv from 'dotenv'
import { resolve } from 'node:path'

// 從 monorepo 根目錄載入 .env（seed 在 prisma/ 下，故為 ../../../）
const rootEnv = resolve(import.meta.dirname, '../../../.env')
dotenv.config({ path: rootEnv })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), '../../.env') })
}
import { PrismaClient } from '../src/generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { createHash, randomBytes } from 'node:crypto'

const poolConfig = { connectionString: process.env.DATABASE_URL }
const adapter = new PrismaPg(poolConfig)
const prisma = new PrismaClient({ adapter })

const ROLES = [
  { name: 'ADMIN', description: '系統管理員，擁有所有權限' },
  { name: 'AUTHOR', description: '出題者，負責建立與編輯題目' },
  { name: 'REVIEWER', description: '審題者，負責審核與批准/駁回題目' },
  { name: 'ASSEMBLER', description: '組卷者，負責從已審核題目中組建測驗' },
] as const

const PERMISSIONS = [
  // 使用者管理
  { action: 'user:invite', description: '邀請新使用者' },
  { action: 'user:list', description: '查看使用者列表' },
  { action: 'user:read', description: '查看使用者詳情' },
  { action: 'user:deactivate', description: '停權/復權使用者' },
  { action: 'user:assign-role', description: '指派/移除使用者角色' },
  // 題庫管理
  { action: 'question:create', description: '建立題目' },
  { action: 'question:read', description: '查看題目' },
  { action: 'question:update', description: '編輯題目' },
  { action: 'question:delete', description: '刪除題目' },
  { action: 'question:submit', description: '提交題目進入審核' },
  { action: 'question:review', description: '進行審核操作' },
  { action: 'question:approve', description: '批准題目' },
  { action: 'question:reject', description: '駁回題目' },
  // 測驗組卷
  { action: 'exam:create', description: '建立測驗' },
  { action: 'exam:read', description: '查看測驗' },
  { action: 'exam:update', description: '編輯測驗' },
  { action: 'exam:delete', description: '刪除測驗' },
  { action: 'exam:assemble', description: '執行自動組卷' },
  // 多媒體素材
  { action: 'media:upload', description: '上傳素材' },
  { action: 'media:read', description: '查看素材' },
  { action: 'media:delete', description: '刪除素材' },
  // 系統管理
  { action: 'system:manage', description: '系統層級管理操作' },
] as const

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p.action),
  AUTHOR: [
    'question:create',
    'question:read',
    'question:update',
    'question:submit',
    'media:upload',
    'media:read',
  ],
  REVIEWER: [
    'question:read',
    'question:review',
    'question:approve',
    'question:reject',
  ],
  ASSEMBLER: [
    'question:read',
    'exam:create',
    'exam:read',
    'exam:update',
    'exam:assemble',
  ],
}

const ADMIN_EMAIL = 'laby0916@gmail.com'
const SETUP_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function main() {
  console.log('🌱 開始 Seed...\n')

  // 1. 建立 Permissions
  console.log('📦 建立 Permissions...')
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action: perm.action },
      update: { description: perm.description },
      create: perm,
    })
  }
  console.log(`   ✅ ${PERMISSIONS.length} 個 Permissions 已建立\n`)

  // 2. 建立 Roles
  console.log('📦 建立 Roles...')
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    })
  }
  console.log(`   ✅ ${ROLES.length} 個 Roles 已建立\n`)

  // 3. 建立 Role-Permission 對應
  console.log('🔗 建立 Role-Permission 對應...')
  for (const [roleName, permActions] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } })

    for (const action of permActions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { action } })

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
    }
  }
  console.log('   ✅ Role-Permission 對應已建立\n')

  // 4. 建立初始 Admin 帳號
  console.log('👤 建立初始 Admin 帳號...')
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })

  const plainToken = randomBytes(32).toString('hex')
  const hashedToken = hashToken(plainToken)
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY_MS)

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      setupToken: hashedToken,
      setupTokenExpiresAt: expiresAt,
    },
    create: {
      email: ADMIN_EMAIL,
      setupToken: hashedToken,
      setupTokenExpiresAt: expiresAt,
      roles: {
        create: {
          roleId: adminRole.id,
        },
      },
    },
  })

  console.log(`   ✅ Admin 帳號已建立: ${admin.email}`)
  console.log(`   📧 User ID: ${admin.id}`)
  console.log('')
  console.log('═══════════════════════════════════════════════════════')
  console.log('  🔑 Setup Token (24 小時有效，請妥善保管):')
  console.log(`     ${plainToken}`)
  console.log('═══════════════════════════════════════════════════════')
  console.log('')
  console.log('🎉 Seed 完成！')
}

main()
  .catch((e) => {
    console.error('❌ Seed 失敗:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
