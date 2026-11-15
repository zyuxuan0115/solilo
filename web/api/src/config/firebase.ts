import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { env } from './env.js'

const API_ROOT_DIR = resolve(import.meta.dirname, '../..')
const DEFAULT_SERVICE_ACCOUNT_PATH = resolve(API_ROOT_DIR, 'service-account.json')

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Firebase Admin is not configured. Place service-account.json in web/api/ (and set GOOGLE_APPLICATION_CREDENTIALS=./service-account.json) or set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in web/api/.env.',
    )
    this.name = 'FirebaseNotConfiguredError'
  }
}

let cachedApp: App | null = null
let cachedFirestore: Firestore | null = null

function resolveCredentialsPath(): string | null {
  const configured = env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  if (configured) {
    const candidate = isAbsolute(configured) ? configured : resolve(API_ROOT_DIR, configured)
    if (existsSync(candidate)) return candidate
    const fromCwd = resolve(process.cwd(), configured)
    if (existsSync(fromCwd)) return fromCwd
    return null
  }
  if (existsSync(DEFAULT_SERVICE_ACCOUNT_PATH)) {
    return DEFAULT_SERVICE_ACCOUNT_PATH
  }
  return null
}

function getRealProjectId(): string | undefined {
  const pid = env.FIREBASE_PROJECT_ID?.trim()
  if (!pid || pid === 'your-firebase-project-id') return undefined
  return pid
}

export function isFirebaseConfigured(): boolean {
  const projectId = getRealProjectId()
  const hasInlineServiceAccount = Boolean(
    projectId &&
      env.FIREBASE_CLIENT_EMAIL &&
      !env.FIREBASE_CLIENT_EMAIL.includes('your-firebase-project-id') &&
      env.FIREBASE_PRIVATE_KEY &&
      !env.FIREBASE_PRIVATE_KEY.includes('YOUR_KEY_HERE'),
  )
  const hasServiceAccountFile = resolveCredentialsPath() !== null
  const hasEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)
  return hasInlineServiceAccount || hasServiceAccountFile || hasEmulator
}

export function getFirebaseApp(): App {
  if (cachedApp) return cachedApp

  const existing = getApps()[0]
  if (existing) {
    cachedApp = existing
    return cachedApp
  }

  if (!isFirebaseConfigured()) {
    throw new FirebaseNotConfiguredError()
  }

  const explicitProjectId = getRealProjectId()

  if (
    explicitProjectId &&
    env.FIREBASE_CLIENT_EMAIL &&
    !env.FIREBASE_CLIENT_EMAIL.includes('your-firebase-project-id') &&
    env.FIREBASE_PRIVATE_KEY &&
    !env.FIREBASE_PRIVATE_KEY.includes('YOUR_KEY_HERE')
  ) {
    cachedApp = initializeApp({
      credential: cert({
        projectId: explicitProjectId,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: explicitProjectId,
    })
    return cachedApp
  }

  const credFilePath = resolveCredentialsPath()
  if (credFilePath) {
    const parsed = JSON.parse(readFileSync(credFilePath, 'utf8')) as ServiceAccount & {
      project_id?: string
    }
    cachedApp = initializeApp({
      credential: cert(parsed),
      projectId: explicitProjectId ?? parsed.projectId ?? parsed.project_id,
    })
    return cachedApp
  }

  // Firebase Local Emulator mode
  cachedApp = initializeApp({
    projectId: explicitProjectId || 'demo-solilo',
  })
  return cachedApp
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function getDb(): Firestore {
  if (cachedFirestore) return cachedFirestore
  cachedFirestore = getFirestore(getFirebaseApp())
  cachedFirestore.settings({ ignoreUndefinedProperties: true })
  return cachedFirestore
}
