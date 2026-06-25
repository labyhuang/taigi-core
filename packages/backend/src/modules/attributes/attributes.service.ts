import type { PrismaClient, Prisma } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import type {
  CreateAttributeBodyType,
  UpdateAttributeBodyType,
  ListAttributesQueryType,
} from './attributes.schema.js'

const attributeDetailSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  examCategory: true,
  isRequired: true,
  createdAt: true,
  updatedAt: true,
  values: {
    select: { id: true, value: true, label: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' as const },
  },
} satisfies Prisma.AttributeDefinitionSelect

export async function listAttributes(
  prisma: PrismaClient,
  query: ListAttributesQueryType,
) {
  const where: Prisma.AttributeDefinitionWhereInput = {}

  if (query.examCategory) {
    where.OR = [
      { examCategory: query.examCategory as never },
      { examCategory: null },
    ]
  }

  return prisma.attributeDefinition.findMany({
    where,
    select: attributeDetailSelect,
    orderBy: { key: 'asc' },
  })
}

export async function getAttribute(prisma: PrismaClient, id: string) {
  const attr = await prisma.attributeDefinition.findUnique({
    where: { id },
    select: attributeDetailSelect,
  })

  if (!attr) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該屬性定義')
  }

  return attr
}

export async function createAttribute(
  prisma: PrismaClient,
  body: CreateAttributeBodyType,
) {
  const existing = await prisma.attributeDefinition.findUnique({
    where: { key: body.key },
  })
  if (existing) {
    throw new AppError(400, ErrorCode.DUPLICATE, `屬性 key "${body.key}" 已存在`)
  }

  return prisma.attributeDefinition.create({
    data: {
      key: body.key,
      name: body.name,
      description: body.description,
      examCategory: body.examCategory as never ?? null,
      isRequired: body.isRequired ?? false,
      values: {
        create: body.values.map((v) => ({
          value: v.value,
          label: v.label,
          orderIndex: v.orderIndex,
        })),
      },
    },
    select: attributeDetailSelect,
  })
}

export async function updateAttribute(
  prisma: PrismaClient,
  id: string,
  body: UpdateAttributeBodyType,
) {
  const existing = await prisma.attributeDefinition.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該屬性定義')
  }

  return prisma.$transaction(async (tx) => {
    if (body.values) {
      await tx.attributeValue.deleteMany({ where: { attributeId: id } })
      await tx.attributeValue.createMany({
        data: body.values.map((v) => ({
          attributeId: id,
          value: v.value,
          label: v.label,
          orderIndex: v.orderIndex,
        })),
      })
    }

    return tx.attributeDefinition.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.examCategory !== undefined && { examCategory: body.examCategory as never }),
        ...(body.isRequired !== undefined && { isRequired: body.isRequired }),
      },
      select: attributeDetailSelect,
    })
  })
}

export async function deleteAttribute(prisma: PrismaClient, id: string) {
  const existing = await prisma.attributeDefinition.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '找不到該屬性定義')
  }

  await prisma.attributeDefinition.delete({ where: { id } })
}
