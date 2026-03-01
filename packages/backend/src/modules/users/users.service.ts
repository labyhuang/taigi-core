import { hash } from 'argon2'
import { generateSecret, generateURI, verifySync } from 'otplib'
import type { PrismaClient } from '../../generated/prisma/index.js'
import type { Redis } from 'ioredis'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import { generateSetupToken, hashToken, encrypt, decrypt } from '../../config/crypto.js'
import { getUserPermissions } from '../../utils/permissions.js'
import { env } from '../../config/env.js'
import type { SessionUserData } from '../auth/auth.service.js'

const SETUP_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 小時
const SESSION_KEY_PREFIX = 'taigi:sess:'

// ========== Setup 流程 ==========

export async function inviteUser(
  prisma: PrismaClient,
  email: string,
  roleIds: string[],
  invitedBy: string,
) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AppError(409, ErrorCode.DUPLICATE, '此 Email 已被使用')
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
  })
  if (roles.length !== roleIds.length) {
    throw new AppError(400, ErrorCode.VALIDATION, '部分角色 ID 不存在')
  }

  const { plain, hashed } = generateSetupToken()
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY_MS)

  const user = await prisma.user.create({
    data: {
      email,
      invitedBy,
      setupToken: hashed,
      setupTokenExpiresAt: expiresAt,
      roles: {
        create: roleIds.map((roleId) => ({
          roleId,
          assignedBy: invitedBy,
        })),
      },
    },
    select: { id: true, email: true },
  })

  const inviteUrl = `${env.FRONTEND_URL}/setup?token=${plain}`

  return { user, setupToken: plain, inviteUrl }
}

async function findUserBySetupToken(prisma: PrismaClient, plainToken: string) {
  const hashed = hashToken(plainToken)
  const user = await prisma.user.findUnique({ where: { setupToken: hashed } })

  if (!user) {
    throw new AppError(400, ErrorCode.TOKEN_INVALID, 'Setup Token 無效')
  }

  if (!user.setupTokenExpiresAt || user.setupTokenExpiresAt < new Date()) {
    throw new AppError(400, ErrorCode.TOKEN_EXPIRED, 'Setup Token 已過期')
  }

  if (user.isSetupCompleted) {
    throw new AppError(400, ErrorCode.TOKEN_INVALID, '此帳號已完成設定')
  }

  return user
}

export async function verifySetupToken(prisma: PrismaClient, plainToken: string) {
  const user = await findUserBySetupToken(prisma, plainToken)
  return { email: user.email }
}

export async function setupProfile(
  prisma: PrismaClient,
  plainToken: string,
  name: string,
  password: string,
) {
  const user = await findUserBySetupToken(prisma, plainToken)
  const passwordHash = await hash(password)

  await prisma.user.update({
    where: { id: user.id },
    data: { name, passwordHash },
  })

  return { email: user.email }
}

export async function generate2FA(prisma: PrismaClient, plainToken: string) {
  const user = await findUserBySetupToken(prisma, plainToken)

  const secret = generateSecret()
  const encrypted = encrypt(secret)

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEncrypted: encrypted },
  })

  const otpauthUrl = generateURI({
    secret,
    issuer: 'TaigiCore',
    label: user.email,
  })

  return { otpauthUrl }
}

export async function verify2FA(
  prisma: PrismaClient,
  plainToken: string,
  code: string,
): Promise<SessionUserData> {
  const user = await findUserBySetupToken(prisma, plainToken)

  if (!user.twoFactorEncrypted) {
    throw new AppError(400, ErrorCode.TWO_FA_REQUIRED, '請先生成 2FA 密鑰')
  }

  const secret = decrypt(user.twoFactorEncrypted)
  const result = verifySync({ token: code, secret })

  if (!result.valid) {
    throw new AppError(400, ErrorCode.TWO_FA_INVALID, 'TOTP 驗證碼錯誤或已過期')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isTwoFactorEnabled: true,
      isSetupCompleted: true,
      setupToken: null,
      setupTokenExpiresAt: null,
    },
  })

  const permissions = await getUserPermissions(prisma, user.id)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSetupCompleted: true,
    isTwoFactorEnabled: true,
    permissions,
  }
}

// ========== Admin 端點 ==========

export async function listRoles(prisma: PrismaClient) {
  return prisma.role.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  })
}

export async function listUsers(
  prisma: PrismaClient,
  page: number,
  pageSize: number,
) {
  const skip = (page - 1) * pageSize

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isSetupCompleted: true,
        isTwoFactorEnabled: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.user.count(),
  ])

  const data = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    isSetupCompleted: u.isSetupCompleted,
    isTwoFactorEnabled: u.isTwoFactorEnabled,
    createdAt: u.createdAt,
    roles: u.roles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
  }))

  const totalPages = Math.ceil(total / pageSize)

  return {
    data,
    meta: { total, page, pageSize, totalPages },
  }
}

export async function updateUserStatus(
  prisma: PrismaClient,
  redis: Redis,
  targetUserId: string,
  operatorId: string,
  isActive: boolean,
) {
  if (targetUserId === operatorId) {
    throw new AppError(400, ErrorCode.VALIDATION, '不可對自己執行停權/復權操作')
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '使用者不存在')
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive },
  })

  if (!isActive) {
    await destroyUserSessions(redis, targetUserId)
  }

  return { id: targetUserId, isActive }
}

export async function updateUserRoles(
  prisma: PrismaClient,
  redis: Redis,
  targetUserId: string,
  roleIds: string[],
  operatorId: string,
) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '使用者不存在')
  }

  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
  })
  if (roles.length !== roleIds.length) {
    throw new AppError(400, ErrorCode.VALIDATION, '部分角色 ID 不存在')
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: targetUserId } })
    await tx.userRole.createMany({
      data: roleIds.map((roleId) => ({
        userId: targetUserId,
        roleId,
        assignedBy: operatorId,
      })),
    })
  })

  // 更新該使用者的 Redis Session 中的 permissions 快取
  await refreshUserSessionPermissions(prisma, redis, targetUserId)

  return { id: targetUserId, roleIds }
}

/**
 * 清除指定使用者的所有 Redis Session。
 * 掃描所有 session key，檢查 userId 是否符合後刪除。
 */
async function destroyUserSessions(redis: Redis, userId: string) {
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${SESSION_KEY_PREFIX}*`,
      'COUNT',
      100,
    )
    cursor = nextCursor

    for (const key of keys) {
      const raw = await redis.get(key)
      if (!raw) continue

      try {
        const session = JSON.parse(raw) as { user?: { id: string } }
        if (session.user?.id === userId) {
          await redis.del(key)
        }
      } catch {
        // 略過無法解析的 session
      }
    }
  } while (cursor !== '0')
}

/**
 * 更新指定使用者活躍 Session 中的 permissions 快取。
 */
async function refreshUserSessionPermissions(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
) {
  const permissions = await getUserPermissions(prisma, userId)
  let cursor = '0'

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${SESSION_KEY_PREFIX}*`,
      'COUNT',
      100,
    )
    cursor = nextCursor

    for (const key of keys) {
      const raw = await redis.get(key)
      if (!raw) continue

      try {
        const session = JSON.parse(raw) as { user?: { id: string; permissions: string[] } }
        if (session.user?.id === userId) {
          session.user.permissions = permissions
          const ttl = await redis.ttl(key)
          if (ttl > 0) {
            await redis.set(key, JSON.stringify(session), 'EX', ttl)
          }
        }
      } catch {
        // 略過無法解析的 session
      }
    }
  } while (cursor !== '0')
}
