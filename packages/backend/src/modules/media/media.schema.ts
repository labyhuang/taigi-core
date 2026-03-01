import { Type, type Static } from '@sinclair/typebox'

export const ALLOWED_AUDIO_TYPES = ['audio/mpeg']
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png']
export const ALLOWED_MIME_TYPES = [...ALLOWED_AUDIO_TYPES, ...ALLOWED_IMAGE_TYPES]

export const MAX_AUDIO_SIZE = 20 * 1024 * 1024 // 20MB
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024  // 5MB

export const MediaIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type MediaIdParamsType = Static<typeof MediaIdParams>
