import { randomBytes } from 'node:crypto'
import { verify } from 'argon2'
import { verifySync as verifyTotp } from 'otplib'
import type { PrismaClient } from '../../generated/prisma/index.js'
import type { Redis } from 'ioredis'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import { decrypt } from '../../config/crypto.js'
import { getUserPermissions } from '../../utils/permissions.js'

export interface SessionUserData {
  id: string
  email: string
  name: string | null
  isSetupCompleted: boolean
  isTwoFactorEnabled: boolean
  permissions: string[]
}

const CHALLENGE_TTL_SECONDS = 5 * 60 // 5 分鐘
const CHALLENGE_KEY_PREFIX = '2fa-challenge:'

/**
 * 登入第一階段：驗證帳號密碼，成功後生成 challengeId 存入 Redis。
 */
export async function loginStep1(
  prisma: PrismaClient,
  redis: Redis,
  email: string,
  password: string,
): Promise<{ requiresTwoFactor: true; challengeId: string }> {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    throw new AppError(401, ErrorCode.CREDENTIAL_INVALID, '帳號或密碼錯誤')
  }

  if (!user.isActive) {
    throw new AppError(403, ErrorCode.USER_DEACTIVATED, '帳號已被停權')
  }

  if (!user.isSetupCompleted) {
    throw new AppError(403, ErrorCode.SETUP_INCOMPLETE, '帳號尚未完成設定流程')
  }

  if (!user.passwordHash) {
    throw new AppError(401, ErrorCode.CREDENTIAL_INVALID, '帳號或密碼錯誤')
  }

  const passwordValid = await verify(user.passwordHash, password)
  if (!passwordValid) {
    throw new AppError(401, ErrorCode.CREDENTIAL_INVALID, '帳號或密碼錯誤')
  }

  if (!user.twoFactorEncrypted || !user.isTwoFactorEnabled) {
    throw new AppError(400, ErrorCode.TWO_FA_REQUIRED, '尚未設定 2FA')
  }

  const challengeId = randomBytes(32).toString('hex')
  await redis.set(
    `${CHALLENGE_KEY_PREFIX}${challengeId}`,
    user.id,
    'EX',
    CHALLENGE_TTL_SECONDS,
  )

  return { requiresTwoFactor: true, challengeId }
}

/**
 * 登入第二階段：以 challengeId 取得 userId，驗證 TOTP 後建立 Session。
 */
export async function verifyLoginTwoFa(
  prisma: PrismaClient,
  redis: Redis,
  challengeId: string,
  totpCode: string,
): Promise<SessionUserData> {
  const redisKey = `${CHALLENGE_KEY_PREFIX}${challengeId}`
  const userId = await redis.get(redisKey)

  if (!userId) {
    throw new AppError(400, ErrorCode.TOKEN_INVALID, '驗證請求無效或已過期，請重新登入')
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AppError(400, ErrorCode.TOKEN_INVALID, '使用者不存在')
  }

  if (!user.isActive) {
    throw new AppError(403, ErrorCode.USER_DEACTIVATED, '帳號已被停權')
  }

  if (!user.twoFactorEncrypted || !user.isTwoFactorEnabled) {
    throw new AppError(400, ErrorCode.TWO_FA_REQUIRED, '尚未設定 2FA')
  }

  const secret = decrypt(user.twoFactorEncrypted)
  const result = verifyTotp({ token: totpCode, secret })
  if (!result.valid) {
    throw new AppError(400, ErrorCode.TWO_FA_INVALID, 'TOTP 驗證碼錯誤或已過期')
  }

  await redis.del(redisKey)

  const permissions = await getUserPermissions(prisma, user.id)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSetupCompleted: user.isSetupCompleted,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
    permissions,
  }
}
