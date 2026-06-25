/**
 * 統計重算背景 job runner
 *
 * spec-statistics.md §5.3
 *
 * 設計重點：
 *   - 用 setImmediate 直接執行，不引入 queue（題庫規模容許）
 *   - 失敗時更新 errorMessage + status=FAILED，不 throw 出 process
 *   - 每 20 題更新一次 processedQuestions 給前端進度條
 *   - 提供 enqueueRecompute helper，給 imports / state 變更等地方呼叫
 */

import type { PrismaClient } from '../../generated/prisma/index.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  collectTargetQuestions,
  computeAndUpsertOne,
} from './statistics.service.js'

const PROGRESS_BATCH = 20

export async function runRecomputeJob(
  prisma: PrismaClient,
  jobId: string,
  log?: FastifyBaseLogger,
): Promise<void> {
  const job = await prisma.recomputeJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() },
    select: {
      id: true,
      scope: true,
      examSessionId: true,
    },
  })

  try {
    const targets = await collectTargetQuestions(prisma, job)

    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: { totalQuestions: targets.length },
    })

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!
      try {
        await computeAndUpsertOne(prisma, t.questionId, t.examSessionId)
      } catch (err) {
        // 單題失敗不中斷整個 job；log 後繼續
        log?.warn(
          { err, questionId: t.questionId, examSessionId: t.examSessionId },
          '統計計算單題失敗',
        )
      }
      if ((i + 1) % PROGRESS_BATCH === 0) {
        await prisma.recomputeJob.update({
          where: { id: jobId },
          data: { processedQuestions: i + 1 },
        })
      }
    }

    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        processedQuestions: targets.length,
        finishedAt: new Date(),
      },
    })
  } catch (err) {
    log?.error({ err, jobId }, '統計重算 job 失敗')
    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message.slice(0, 500),
        finishedAt: new Date(),
      },
    })
  }
}

/**
 * 排入背景重算（fire-and-forget）。
 *
 * 若同 scope+examSessionId 已有 PENDING/RUNNING job，則跳過建立，回傳 null。
 * 用於：
 *   - ExamSession 變更為 IMPORTED 時
 *   - 各匯入 endpoint 完成後
 */
export async function enqueueRecompute(
  prisma: PrismaClient,
  params: {
    scope: 'session' | 'cumulative' | 'all'
    examSessionId: string | null
    userId: string
  },
  log?: FastifyBaseLogger,
): Promise<{ id: string } | null> {
  const existing = await prisma.recomputeJob.findFirst({
    where: {
      scope: params.scope,
      examSessionId: params.examSessionId,
      status: { in: ['PENDING', 'RUNNING'] },
    },
    select: { id: true },
  })
  if (existing) {
    log?.info({ existingJobId: existing.id }, '已有重算 job 執行中，跳過 enqueue')
    return null
  }

  const job = await prisma.recomputeJob.create({
    data: {
      scope: params.scope,
      examSessionId: params.examSessionId,
      createdById: params.userId,
    },
    select: { id: true },
  })

  setImmediate(() => {
    void runRecomputeJob(prisma, job.id, log)
  })
  return job
}
