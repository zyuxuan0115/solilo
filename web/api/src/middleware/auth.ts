import type { MiddlewareHandler } from 'hono'
import { FirebaseNotConfiguredError, getFirebaseAuth } from '../config/firebase.js'
import type { AppEnv } from '../types.js'

export const requireFirebaseAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization: Bearer <Firebase ID Token> header.',
        },
      },
      401,
    )
  }

  const idToken = authHeader.slice('Bearer '.length).trim()
  if (!idToken) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Empty Bearer token.',
        },
      },
      401,
    )
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(idToken)
    c.set('authUser', {
      uid: decoded.uid,
      email: decoded.email ?? null,
    })
    await next()
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return c.json(
        {
          error: {
            code: 'FIREBASE_NOT_CONFIGURED',
            message: err.message,
          },
        },
        503,
      )
    }

    return c.json(
      {
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired Firebase ID token.',
        },
      },
      401,
    )
  }
}
