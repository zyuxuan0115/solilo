import type { MiddlewareHandler } from 'hono'
import { FirebaseNotConfiguredError } from '../config/firebase.js'
import { resolveApiKey } from '../services/firestore.js'
import type { AppEnv } from '../types.js'

function extractRawApiKey(
  headerKey: string | undefined,
  authHeader: string | undefined,
  queryKey: string | undefined,
): string | null {
  if (headerKey?.trim()) return headerKey.trim()
  if (authHeader?.startsWith('Bearer slk_')) {
    return authHeader.slice('Bearer '.length).trim()
  }
  if (queryKey?.trim()) return queryKey.trim()
  return null
}

export const requirePublicApiKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rawKey = extractRawApiKey(
    c.req.header('X-Solilo-Key'),
    c.req.header('Authorization'),
    c.req.query('key'),
  )

  if (!rawKey) {
    return c.json(
      {
        error: {
          code: 'MISSING_API_KEY',
          message: 'Provide your Solilo read API key via X-Solilo-Key header or ?key=slk_... query.',
        },
      },
      401,
    )
  }

  try {
    const resolved = await resolveApiKey(rawKey)
    if (!resolved) {
      return c.json(
        {
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or revoked Solilo API key.',
          },
        },
        401,
      )
    }

    const requestOrigin = c.req.header('Origin')
    if (requestOrigin && resolved.allowedOrigins.length > 0) {
      const normalizedOrigin = requestOrigin.replace(/\/+$/, '')
      const allowed = resolved.allowedOrigins.some(
        (item) => item.replace(/\/+$/, '') === normalizedOrigin,
      )
      if (!allowed) {
        return c.json(
          {
            error: {
              code: 'ORIGIN_NOT_ALLOWED',
              message: `Origin ${requestOrigin} is not permitted for this API key.`,
            },
          },
          403,
        )
      }
    }

    c.set('apiKeyUid', resolved.uid)
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
    throw err
  }
}
