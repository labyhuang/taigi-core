/**
 * 稽核日誌（Phase 6）
 *
 * append-only 語意，用於高風險操作追溯。寫入失敗不阻斷主流程，但會打 error log。
 */

import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import type { PrismaClient } from '../../generated/prisma/index.js'

export interface AuditLogInput {
  userId: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

/** 從 Session 路由萃取稽核上下欄位（API key 路由無 user 時 userId 為 null） */
export function extractAuditContext(request: FastifyRequest): Pick<
  AuditLogInput,
  'userId' | 'ipAddress' | 'userAgent'
> {
  const userId = request.session.user?.id ?? null
  const ua = request.headers['user-agent']
  return {
    userId,
    ipAddress: request.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  }
}

export async function writeAuditLog(prisma: PrismaClient, input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: (input.metadata ?? {}) as never,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  })
}

export async function writeAuditLogSafe(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
  input: AuditLogInput,
): Promise<void> {
  try {
    await writeAuditLog(prisma, input)
  } catch (err) {
    log.error({ err, audit: input }, '寫入稽核日誌失敗')
  }
}
