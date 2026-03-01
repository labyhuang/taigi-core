import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'
import {
  ALLOWED_AUDIO_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_AUDIO_SIZE,
  MAX_IMAGE_SIZE,
} from './media.schema.js'

// 本地儲存路徑（開發環境用，正式環境改用 S3/GCS）
const UPLOAD_DIR = join(process.cwd(), 'uploads')

export async function uploadMedia(
  prisma: PrismaClient,
  file: {
    filename: string
    mimetype: string
    data: Buffer
  },
  uploaderId: string,
) {
  const { filename, mimetype, data } = file

  // 驗證 MIME type
  const isAudio = ALLOWED_AUDIO_TYPES.includes(mimetype)
  const isImage = ALLOWED_IMAGE_TYPES.includes(mimetype)
  if (!isAudio && !isImage) {
    throw new AppError(400, ErrorCode.VALIDATION,
      `不支援的檔案格式: ${mimetype}。允許的格式: .mp3, .jpg, .png`)
  }

  // 驗證大小
  const maxSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE
  const maxLabel = isAudio ? '20MB' : '5MB'
  if (data.length > maxSize) {
    throw new AppError(400, ErrorCode.VALIDATION, `檔案大小超過上限 (${maxLabel})`)
  }

  // 產生 objectKey 並儲存（開發環境使用本地 filesystem）
  const ext = extname(filename) || (isAudio ? '.mp3' : '.jpg')
  const objectKey = `media/${randomUUID()}${ext}`
  const fullPath = join(UPLOAD_DIR, objectKey)

  await mkdir(join(UPLOAD_DIR, 'media'), { recursive: true })
  await writeFile(fullPath, data)

  const media = await prisma.media.create({
    data: {
      filename,
      objectKey,
      mimeType: mimetype,
      sizeBytes: data.length,
      uploaderId,
    },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      durationSeconds: true,
      objectKey: true,
    },
  })

  return media
}

export async function getMediaUrl(prisma: PrismaClient, id: string) {
  const media = await prisma.media.findUnique({
    where: { id },
    select: { objectKey: true },
  })
  if (!media) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '素材不存在')
  }

  // 開發環境：回傳本地 URL
  // 正式環境：產生 Presigned URL
  const url = `/uploads/${media.objectKey}`

  return { url, expiresIn: 900 }
}

export async function deleteMedia(prisma: PrismaClient, id: string) {
  const media = await prisma.media.findUnique({
    where: { id },
    include: { questions: { select: { questionId: true } } },
  })
  if (!media) {
    throw new AppError(404, ErrorCode.NOT_FOUND, '素材不存在')
  }

  if (media.questions.length > 0) {
    throw new AppError(409, ErrorCode.MEDIA_IN_USE, '素材仍被題目使用中，無法刪除')
  }

  // 刪除本地檔案
  try {
    const fullPath = join(UPLOAD_DIR, media.objectKey)
    await unlink(fullPath)
  } catch {
    // 檔案可能不存在，略過
  }

  await prisma.media.delete({ where: { id } })
}
