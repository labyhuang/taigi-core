import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

/**
 * 驗證 attributes 物件中所有 key/value 皆為 AttributeDefinition / AttributeValue 中的合法組合。
 * 用於 createQuestion / updateQuestion；草稿階段也會跑（避免不合法值入庫）。
 *
 * 對應 spec-bugfixes.md §7（Bug #6）validateAttributesShape。
 */
export async function validateAttributesShape(
  prisma: PrismaClient,
  attributes: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!attributes || Object.keys(attributes).length === 0) return

  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: Object.keys(attributes) } },
    include: { values: true },
  })
  const defMap = new Map(defs.map((d) => [d.key, d]))

  for (const [key, value] of Object.entries(attributes)) {
    const def = defMap.get(key)
    if (!def) {
      throw new AppError(400, ErrorCode.VALIDATION, `不合法的屬性 key: ${key}`)
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION,
        `屬性 "${key}" 的值必須為非空字串`,
      )
    }
    const allowed = def.values.map((v) => v.value)
    if (!allowed.includes(value)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION,
        `屬性 "${key}" 的值 "${value}" 不合法，合法值: ${allowed.join(', ')}`,
      )
    }
  }
}

/**
 * 送審時驗證所有 isRequired = true 的屬性都已填入，且符合 examCategory 過濾。
 *
 * 規則（spec-question-bank.md 第二部分 §3）：
 * - 全域屬性 (examCategory = null) 對所有題目強制
 * - 限定 examCategory 的屬性僅對對應 category 的題目強制
 *
 * 對應 spec-bugfixes.md §7（Bug #6）validateAttributesRequired。
 */
export async function validateAttributesRequired(
  prisma: PrismaClient,
  category: string,
  attributes: Record<string, unknown> | null | undefined,
): Promise<void> {
  const requiredDefs = await prisma.attributeDefinition.findMany({
    where: {
      isRequired: true,
      OR: [{ examCategory: null }, { examCategory: category as never }],
    },
  })

  const missing: { field: string; message: string }[] = []
  for (const def of requiredDefs) {
    const value = attributes?.[def.key]
    if (typeof value !== 'string' || value.trim().length === 0) {
      missing.push({
        field: `attributes.${def.key}`,
        message: `送審前必填屬性「${def.name}」(${def.key}) 未填寫`,
      })
    }
  }

  if (missing.length > 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION,
      `送審前必填屬性未填寫: ${missing.map((m) => m.field).join(', ')}`,
      missing,
    )
  }
}
