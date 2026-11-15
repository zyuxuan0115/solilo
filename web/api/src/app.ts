import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './config/env.js'
import { FirebaseNotConfiguredError } from './config/firebase.js'
import { accountsRouter } from './routes/accounts.js'
import { apiKeysRouter } from './routes/apiKeys.js'
import { healthRouter } from './routes/health.js'
import { postsRouter } from './routes/posts.js'
import { publicTimelineRouter } from './routes/publicTimeline.js'
import type { AppEnv } from './types.js'

const baseApp = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: result.error.issues
              .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
              .join('; '),
          },
        },
        400,
      )
    }
  },
})

const basePrefix = env.BASE_PATH || ''
const api = basePrefix ? baseApp.basePath(basePrefix) : baseApp

api.use('*', logger())

// Public embed endpoints allow cross-origin browser fetches (per-key origin checks run in middleware)
api.use(
  '/public/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Solilo-Key', 'Authorization'],
    maxAge: 86400,
  }),
)

// Authenticated client endpoints restrict CORS to configured web origins
api.use(
  '/*',
  cors({
    origin: (origin) => {
      if (!origin) return env.corsOriginList[0] ?? '*'
      return env.corsOriginList.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Solilo-Key'],
    maxAge: 86400,
  }),
)

api.openAPIRegistry.registerComponent('securitySchemes', 'FirebaseBearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Firebase Authentication ID Token from Web, iOS, or Android client.',
})

api.openAPIRegistry.registerComponent('securitySchemes', 'SoliloApiKey', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Solilo-Key',
  description: 'Read-only API key (slk_...) for external website timeline embedding.',
})

api.onError((err, c) => {
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

  console.error('[solilo-api] Unhandled error:', err)
  return c.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.',
      },
    },
    500,
  )
})

const routes = api
  .route('/health', healthRouter)
  .route('/posts', postsRouter)
  .route('/accounts', accountsRouter)
  .route('/api-keys', apiKeysRouter)
  .route('/public', publicTimelineRouter)

const openApiJsonPath = `${basePrefix}/openapi.json`

api.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Solilo API',
    version: '0.1.0',
    description:
      'Personal monologue timeline backend for Web, iOS, Android, Mastodon/Misskey cross-posting, and website embedding.',
  },
})

api.get(
  '/docs',
  apiReference({
    pageTitle: 'Solilo API Reference',
    spec: {
      url: openApiJsonPath,
    },
  }),
)

export const app = api
export type AppType = typeof routes
