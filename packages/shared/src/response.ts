export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
  meta?: PaginationMeta
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown[]
  }
  traceId: string
  timestamp: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export const ErrorCode = {
  VALIDATION: 'ERR_VALIDATION',
  NOT_FOUND: 'ERR_NOT_FOUND',
  DUPLICATE: 'ERR_DUPLICATE',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  CREDENTIAL_INVALID: 'ERR_CREDENTIAL_INVALID',
  FORBIDDEN: 'ERR_FORBIDDEN',
  USER_DEACTIVATED: 'ERR_USER_DEACTIVATED',
  SETUP_INCOMPLETE: 'ERR_SETUP_INCOMPLETE',
  TOKEN_INVALID: 'ERR_TOKEN_INVALID',
  TOKEN_EXPIRED: 'ERR_TOKEN_EXPIRED',
  TWO_FA_REQUIRED: 'ERR_2FA_REQUIRED',
  TWO_FA_INVALID: 'ERR_2FA_INVALID',
  INTERNAL: 'ERR_INTERNAL',
  // 題庫管理
  INVALID_STATUS_TRANSITION: 'ERR_INVALID_STATUS_TRANSITION',
  MEDIA_REQUIRED: 'ERR_MEDIA_REQUIRED',
  QUESTION_READONLY: 'ERR_QUESTION_READONLY',
  REVIEW_COMMENT_REQUIRED: 'ERR_REVIEW_COMMENT_REQUIRED',
  INVALID_TYPE_COMBINATION: 'ERR_INVALID_TYPE_COMBINATION',
  GROUP_CHILD_NO_INDEPENDENT_STATUS: 'ERR_GROUP_CHILD_NO_INDEPENDENT_STATUS',
  MEDIA_IN_USE: 'ERR_MEDIA_IN_USE',
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]
