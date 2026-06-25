import { Type, type Static } from '@sinclair/typebox'

export const PaperIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type PaperIdParamsType = Static<typeof PaperIdParams>

// includeMedia 預設 true：是否打包音檔/圖片
export const ExportZipQuery = Type.Object({
  includeMedia: Type.Optional(Type.Boolean({ default: true })),
})
export type ExportZipQueryType = Static<typeof ExportZipQuery>
