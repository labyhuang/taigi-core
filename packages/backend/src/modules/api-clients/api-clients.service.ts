/**
 * API Client（外部考試系統 X-Api-Key）管理服務
 *
 * spec-exam-session.md §7
 *
 * 設計重點：
 *   - plain key 僅在建立 / rotate 時回應一次（同 setup token）
 *   - DB 只存 sha256(plainKey)
 *   - 撤銷 = 設 isActive=false + revokedAt=now
 */

import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient, Prisma } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

const KEY_PREFIX = 'tg_live_'

const apiClientPublicSelect = {
  id: true,
  name: true,
  scopes: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const satisfies Prisma.ApiClientSelect

function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function generatePlainKey(): string {
  // 64 byte = 128 hex chars
  return KEY_PREFIX + randomBytes(64).toString('hex')
}

export async function listApiClients(prisma: PrismaClient) {
  return prisma.apiClient.findMany({
    select: apiClientPublicSelect,
    orderBy: { createdAt: 'desc' },
  })
}

export async function createApiClient(
  prisma: PrismaClient,
  body: { name: string; scopes: string[] },
  userId: string,
) {
  const plainKey = generatePlainKey()
  const keyHash = hashKey(plainKey)

  // 撞 keyHash 機率近乎 0；若真撞到（同 plain）會丟 unique error，由 errorHandler 統一處理
  const created = await prisma.apiClient.create({
    data: {
      name: body.name,
      scopes: body.scopes,
      keyHash,
      createdById: userId,
    },
    select: apiClientPublicSelect,
  })

  return {
    ...created,
    plainKey,
  }
}

export async function revokeApiClient(prisma: PrismaClient, id: string) {
  const client = await prisma.apiClient.findUnique({ where: { id } })
  if (!client) {
    throw new AppError(404, ErrorCode.API_CLIENT_NOT_FOUND, '找不到該 API client')
  }
  if (!client.isActive) {
    throw new AppError(400, ErrorCode.VALIDATION, '此 API client 已撤銷')
  }
  return prisma.apiClient.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
    select: apiClientPublicSelect,
  })
}

export async function rotateApiClient(prisma: PrismaClient, id: string) {
  const client = await prisma.apiClient.findUnique({ where: { id } })
  if (!client) {
    throw new AppError(404, ErrorCode.API_CLIENT_NOT_FOUND, '找不到該 API client')
  }

  const plainKey = generatePlainKey()
  const keyHash = hashKey(plainKey)

  const updated = await prisma.apiClient.update({
    where: { id },
    data: {
      keyHash,
      isActive: true,
      revokedAt: null,
      lastUsedAt: null,
    },
    select: apiClientPublicSelect,
  })

  return {
    ...updated,
    plainKey,
  }
}
