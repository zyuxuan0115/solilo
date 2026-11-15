import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') })

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  BASE_PATH: z.string().default('/apps/solilo/api'),
  PUBLIC_API_ORIGIN: z.string().url().default('http://localhost:8787'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173/apps/solilo'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,https://kate0115.cc'),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const raw = parsed.data

function normalizeBasePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return ''
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.replace(/\/+$/, '')
}

export const env = {
  ...raw,
  BASE_PATH: normalizeBasePath(raw.BASE_PATH),
  PUBLIC_API_ORIGIN: raw.PUBLIC_API_ORIGIN.replace(/\/+$/, ''),
  PUBLIC_WEB_URL: raw.PUBLIC_WEB_URL.replace(/\/+$/, ''),
  corsOriginList: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  get publicApiBaseUrl(): string {
    return `${this.PUBLIC_API_ORIGIN}${this.BASE_PATH}`
  },
}
