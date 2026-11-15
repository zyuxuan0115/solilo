import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { env } from './env.js'

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (or GOOGLE_APPLICATION_CREDENTIALS / FIRESTORE_EMULATOR_HOST) in web/api/.env.',
    )
    this.name = 'FirebaseNotConfiguredError'
  }
}

let cachedApp: App | null = null
let cachedFirestore: Firestore | null = null

export function isFirebaseConfigured(): boolean {
  const hasInlineServiceAccount = Boolean(
    env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_PROJECT_ID !== 'your-firebase-project-id' &&
      env.FIREBASE_CLIENT_EMAIL &&
      env.FIREBASE_PRIVATE_KEY &&
      !env.FIREBASE_PRIVATE_KEY.includes('YOUR_KEY_HERE'),
  )
  const hasAdc = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS)
  const hasEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)
  return hasInlineServiceAccount || hasAdc || hasEmulator
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

  if (
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    env.FIREBASE_PRIVATE_KEY &&
    !env.FIREBASE_PRIVATE_KEY.includes('YOUR_KEY_HERE')
  ) {
    cachedApp = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    })
    return cachedApp
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedApp = initializeApp({
      credential: applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID,
    })
    return cachedApp
  }

  // Firebase Local Emulator mode
  cachedApp = initializeApp({
    projectId: env.FIREBASE_PROJECT_ID || 'demo-solilo',
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
