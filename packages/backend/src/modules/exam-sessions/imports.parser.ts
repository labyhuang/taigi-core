/**
 * 匯入資料解析器（pure functions，無 IO）
 *
 * spec-exam-session.md §5
 *
 * 三種匯入：candidates / responses / speaking-scores
 * 兩種格式：csv / json
 *
 * 設計：每筆都帶 row 編號（CSV 從 2 起算扣 header；JSON 從 1 起算）。
 * 解析錯誤集中在 errors 陣列，不中斷整批。
 */

import { parse as parseCsvSync } from 'csv-parse/sync'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

// ========== 共用型別 ==========

export interface ParseError {
  row?: number
  externalCandidateId?: string
  field?: string
  message: string
}

export interface ParseResult<T> {
  rows: T[]
  errors: ParseError[]
}

// ========== Candidate Row ==========

export interface CandidateImportRow {
  externalCandidateId: string
  paperVariant: string | null
  ageGroup: string | null
  schoolType: string | null
  totalScore: number | null
  demographic: Record<string, unknown>
  rowNumber: number
}

// ========== Response Row ==========

export interface ResponseImportRow {
  externalCandidateId: string
  questionId: string
  selectedOptionId: string | null
  writtenAnswer: string | null
  isCorrect: boolean | null
  pointsEarned: number | null
  rowNumber: number
}

// ========== Speaking Score Row ==========

export interface SpeakingScoreImportRow {
  externalCandidateId: string
  questionId: string
  speakingScore: number
  pointsEarned: number
  rowNumber: number
}

// ========== Helpers ==========

function emptyToNull(v: string | undefined): string | null {
  if (v === undefined) return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

function parseBoolean(v: string | undefined): boolean | null {
  const s = emptyToNull(v)
  if (s === null) return null
  const lower = s.toLowerCase()
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y') return true
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'n') return false
  throw new Error(`不可解析為 boolean: ${s}`)
}

function parseNumber(v: string | undefined): number | null {
  const s = emptyToNull(v)
  if (s === null) return null
  const n = Number(s)
  if (Number.isNaN(n)) throw new Error(`不可解析為數值: ${s}`)
  return n
}

function parseDemographic(raw: string | undefined | null): Record<string, unknown> {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (s.length === 0) return {}
  try {
    const parsed = JSON.parse(s) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('demographic 必須為 JSON object')
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `demographic JSON 不合法: ${(err as Error).message}`,
    )
  }
}

function ensureCsvText(input: string | Buffer): string {
  return typeof input === 'string' ? input : input.toString('utf8')
}

function safeJsonParse(input: string | Buffer): unknown {
  const text = typeof input === 'string' ? input : input.toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch (err) {
    throw new AppError(
      400,
      ErrorCode.IMPORT_FORMAT_INVALID,
      `JSON 解析失敗: ${(err as Error).message}`,
    )
  }
}

function safeCsvParse(input: string | Buffer): Record<string, string>[] {
  const text = ensureCsvText(input)
  try {
    return parseCsvSync(text, {
      columns: true,
      skip_empty_lines: true,
      trim: false,
      bom: true,
    }) as Record<string, string>[]
  } catch (err) {
    throw new AppError(
      400,
      ErrorCode.IMPORT_FORMAT_INVALID,
      `CSV 解析失敗: ${(err as Error).message}`,
    )
  }
}

// ========== Candidates ==========

const REQUIRED_CANDIDATE_HEADERS = ['externalCandidateId'] as const

export function parseCandidatesCsv(input: string | Buffer): ParseResult<CandidateImportRow> {
  const records = safeCsvParse(input)
  // CSV 行號：header 為第 1 列，第一筆資料是第 2 列
  const errors: ParseError[] = []
  const rows: CandidateImportRow[] = []

  const headerRow = records[0]
  if (!headerRow) {
    return { rows, errors }
  }

  // 檢查必填 header
  for (const h of REQUIRED_CANDIDATE_HEADERS) {
    if (!(h in headerRow)) {
      throw new AppError(
        400,
        ErrorCode.IMPORT_FORMAT_INVALID,
        `CSV 缺少必填欄位: ${h}`,
      )
    }
  }

  records.forEach((rec, idx) => {
    const rowNumber = idx + 2
    const externalCandidateId = emptyToNull(rec.externalCandidateId)
    if (!externalCandidateId) {
      errors.push({
        row: rowNumber,
        field: 'externalCandidateId',
        message: '必填',
      })
      return
    }

    try {
      rows.push({
        externalCandidateId,
        paperVariant: emptyToNull(rec.paperVariant),
        ageGroup: emptyToNull(rec.ageGroup),
        schoolType: emptyToNull(rec.schoolType),
        totalScore: parseNumber(rec.totalScore),
        demographic: parseDemographic(rec.demographic_json),
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}

export function parseCandidatesJson(input: string | Buffer | unknown): ParseResult<CandidateImportRow> {
  const errors: ParseError[] = []
  const rows: CandidateImportRow[] = []

  const data = typeof input === 'string' || Buffer.isBuffer(input)
    ? safeJsonParse(input)
    : input

  if (
    !data ||
    typeof data !== 'object' ||
    !('candidates' in (data as Record<string, unknown>)) ||
    !Array.isArray((data as { candidates: unknown }).candidates)
  ) {
    throw new AppError(
      400,
      ErrorCode.IMPORT_FORMAT_INVALID,
      'JSON 必須包含 candidates 陣列',
    )
  }

  const arr = (data as { candidates: unknown[] }).candidates

  arr.forEach((item, idx) => {
    const rowNumber = idx + 1
    if (!item || typeof item !== 'object') {
      errors.push({ row: rowNumber, message: '必須為 object' })
      return
    }
    const rec = item as Record<string, unknown>
    const externalCandidateId =
      typeof rec.externalCandidateId === 'string' ? rec.externalCandidateId.trim() : ''
    if (!externalCandidateId) {
      errors.push({
        row: rowNumber,
        field: 'externalCandidateId',
        message: '必填',
      })
      return
    }

    try {
      const totalScore =
        rec.totalScore === null || rec.totalScore === undefined
          ? null
          : Number(rec.totalScore)
      if (totalScore !== null && Number.isNaN(totalScore)) {
        throw new Error(`totalScore 不可解析為數值: ${String(rec.totalScore)}`)
      }

      const demographic =
        rec.demographic && typeof rec.demographic === 'object' && !Array.isArray(rec.demographic)
          ? (rec.demographic as Record<string, unknown>)
          : {}

      rows.push({
        externalCandidateId,
        paperVariant: typeof rec.paperVariant === 'string' && rec.paperVariant.length > 0 ? rec.paperVariant : null,
        ageGroup: typeof rec.ageGroup === 'string' && rec.ageGroup.length > 0 ? rec.ageGroup : null,
        schoolType: typeof rec.schoolType === 'string' && rec.schoolType.length > 0 ? rec.schoolType : null,
        totalScore,
        demographic,
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}

// ========== Responses ==========

const REQUIRED_RESPONSE_HEADERS = ['externalCandidateId', 'questionId'] as const

export function parseResponsesCsv(input: string | Buffer): ParseResult<ResponseImportRow> {
  const records = safeCsvParse(input)
  const errors: ParseError[] = []
  const rows: ResponseImportRow[] = []

  const headerRow = records[0]
  if (!headerRow) {
    return { rows, errors }
  }

  for (const h of REQUIRED_RESPONSE_HEADERS) {
    if (!(h in headerRow)) {
      throw new AppError(
        400,
        ErrorCode.IMPORT_FORMAT_INVALID,
        `CSV 缺少必填欄位: ${h}`,
      )
    }
  }

  records.forEach((rec, idx) => {
    const rowNumber = idx + 2
    const externalCandidateId = emptyToNull(rec.externalCandidateId)
    const questionId = emptyToNull(rec.questionId)
    if (!externalCandidateId || !questionId) {
      errors.push({
        row: rowNumber,
        message: 'externalCandidateId 與 questionId 為必填',
      })
      return
    }

    try {
      rows.push({
        externalCandidateId,
        questionId,
        selectedOptionId: emptyToNull(rec.selectedOptionId),
        writtenAnswer: emptyToNull(rec.writtenAnswer),
        isCorrect: parseBoolean(rec.isCorrect),
        pointsEarned: parseNumber(rec.pointsEarned),
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}

export function parseResponsesJson(input: string | Buffer | unknown): ParseResult<ResponseImportRow> {
  const errors: ParseError[] = []
  const rows: ResponseImportRow[] = []

  const data = typeof input === 'string' || Buffer.isBuffer(input)
    ? safeJsonParse(input)
    : input

  if (
    !data ||
    typeof data !== 'object' ||
    !('responses' in (data as Record<string, unknown>)) ||
    !Array.isArray((data as { responses: unknown }).responses)
  ) {
    throw new AppError(
      400,
      ErrorCode.IMPORT_FORMAT_INVALID,
      'JSON 必須包含 responses 陣列',
    )
  }

  const arr = (data as { responses: unknown[] }).responses

  arr.forEach((item, idx) => {
    const rowNumber = idx + 1
    if (!item || typeof item !== 'object') {
      errors.push({ row: rowNumber, message: '必須為 object' })
      return
    }
    const rec = item as Record<string, unknown>
    const externalCandidateId =
      typeof rec.externalCandidateId === 'string' ? rec.externalCandidateId.trim() : ''
    const questionId = typeof rec.questionId === 'string' ? rec.questionId.trim() : ''

    if (!externalCandidateId || !questionId) {
      errors.push({
        row: rowNumber,
        message: 'externalCandidateId 與 questionId 為必填',
      })
      return
    }

    try {
      const isCorrect =
        rec.isCorrect === undefined || rec.isCorrect === null
          ? null
          : typeof rec.isCorrect === 'boolean'
            ? rec.isCorrect
            : (() => {
                throw new Error(`isCorrect 必須為 boolean: ${String(rec.isCorrect)}`)
              })()

      const pointsEarned =
        rec.pointsEarned === undefined || rec.pointsEarned === null
          ? null
          : Number(rec.pointsEarned)
      if (pointsEarned !== null && Number.isNaN(pointsEarned)) {
        throw new Error(`pointsEarned 不可解析為數值: ${String(rec.pointsEarned)}`)
      }

      rows.push({
        externalCandidateId,
        questionId,
        selectedOptionId:
          typeof rec.selectedOptionId === 'string' && rec.selectedOptionId.length > 0
            ? rec.selectedOptionId
            : null,
        writtenAnswer:
          typeof rec.writtenAnswer === 'string' && rec.writtenAnswer.length > 0
            ? rec.writtenAnswer
            : null,
        isCorrect,
        pointsEarned,
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}

// ========== Speaking Scores ==========

const REQUIRED_SPEAKING_HEADERS = [
  'externalCandidateId',
  'questionId',
  'speakingScore',
  'pointsEarned',
] as const

export function parseSpeakingScoresCsv(input: string | Buffer): ParseResult<SpeakingScoreImportRow> {
  const records = safeCsvParse(input)
  const errors: ParseError[] = []
  const rows: SpeakingScoreImportRow[] = []

  const headerRow = records[0]
  if (!headerRow) {
    return { rows, errors }
  }

  for (const h of REQUIRED_SPEAKING_HEADERS) {
    if (!(h in headerRow)) {
      throw new AppError(
        400,
        ErrorCode.IMPORT_FORMAT_INVALID,
        `CSV 缺少必填欄位: ${h}`,
      )
    }
  }

  records.forEach((rec, idx) => {
    const rowNumber = idx + 2
    const externalCandidateId = emptyToNull(rec.externalCandidateId)
    const questionId = emptyToNull(rec.questionId)
    if (!externalCandidateId || !questionId) {
      errors.push({
        row: rowNumber,
        message: 'externalCandidateId 與 questionId 為必填',
      })
      return
    }

    try {
      const speakingScore = parseNumber(rec.speakingScore)
      const pointsEarned = parseNumber(rec.pointsEarned)
      if (speakingScore === null || pointsEarned === null) {
        throw new Error('speakingScore 與 pointsEarned 為必填數值')
      }
      rows.push({
        externalCandidateId,
        questionId,
        speakingScore,
        pointsEarned,
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}

export function parseSpeakingScoresJson(
  input: string | Buffer | unknown,
): ParseResult<SpeakingScoreImportRow> {
  const errors: ParseError[] = []
  const rows: SpeakingScoreImportRow[] = []

  const data = typeof input === 'string' || Buffer.isBuffer(input)
    ? safeJsonParse(input)
    : input

  if (
    !data ||
    typeof data !== 'object' ||
    !('speakingScores' in (data as Record<string, unknown>)) ||
    !Array.isArray((data as { speakingScores: unknown }).speakingScores)
  ) {
    throw new AppError(
      400,
      ErrorCode.IMPORT_FORMAT_INVALID,
      'JSON 必須包含 speakingScores 陣列',
    )
  }

  const arr = (data as { speakingScores: unknown[] }).speakingScores

  arr.forEach((item, idx) => {
    const rowNumber = idx + 1
    if (!item || typeof item !== 'object') {
      errors.push({ row: rowNumber, message: '必須為 object' })
      return
    }
    const rec = item as Record<string, unknown>
    const externalCandidateId =
      typeof rec.externalCandidateId === 'string' ? rec.externalCandidateId.trim() : ''
    const questionId = typeof rec.questionId === 'string' ? rec.questionId.trim() : ''
    if (!externalCandidateId || !questionId) {
      errors.push({
        row: rowNumber,
        message: 'externalCandidateId 與 questionId 為必填',
      })
      return
    }

    try {
      const speakingScore = Number(rec.speakingScore)
      const pointsEarned = Number(rec.pointsEarned)
      if (Number.isNaN(speakingScore)) throw new Error('speakingScore 必須為數值')
      if (Number.isNaN(pointsEarned)) throw new Error('pointsEarned 必須為數值')
      rows.push({
        externalCandidateId,
        questionId,
        speakingScore,
        pointsEarned,
        rowNumber,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        externalCandidateId,
        message: (err as Error).message,
      })
    }
  })

  return { rows, errors }
}
