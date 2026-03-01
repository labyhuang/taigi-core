import type { ErrorCodeValue } from '../types/response.js'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCodeValue
  public readonly details?: unknown[]

  constructor(statusCode: number, code: ErrorCodeValue, message: string, details?: unknown[]) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}
