import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { env } from './env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  return Buffer.from(env.TWO_FACTOR_ENCRYPTION_KEY, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // 格式: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('加密資料格式錯誤')
  }

  const [ivHex, authTagHex, encrypted] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateSetupToken(): { plain: string; hashed: string } {
  const plain = randomBytes(32).toString('hex')
  const hashed = hashToken(plain)
  return { plain, hashed }
}
