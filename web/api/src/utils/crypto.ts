import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const DEV_FALLBACK_HEX_KEY =
  '4f7b2e91a3c6d80512ef34ab56cd78ef9012ab34cd56ef7890ab12cd34ef5678'

function getEncryptionKeyBuffer(): Buffer {
  const rawHex = env.TOKEN_ENCRYPTION_KEY?.trim()

  if (!rawHex || /^0+$/.test(rawHex)) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY must be set to a random 64-character hex string in production.',
      )
    }
    return Buffer.from(DEV_FALLBACK_HEX_KEY, 'hex')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(rawHex)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).')
  }

  return Buffer.from(rawHex, 'hex')
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKeyBuffer()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted secret format.')
  }
  const [, ivHex, tagHex, dataHex] = parts
  if (!ivHex || !tagHex || dataHex === undefined) {
    throw new Error('Malformed encrypted secret payload.')
  }

  const key = getEncryptionKeyBuffer()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim()).digest('hex')
}

export function generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const secretPart = randomBytes(24).toString('base64url')
  const rawKey = `slk_${secretPart}`
  const keyHash = hashApiKey(rawKey)
  const prefix = rawKey.slice(0, 12)
  return { rawKey, keyHash, prefix }
}
