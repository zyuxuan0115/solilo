import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { env } from '../config/env.js'
import { isFirebaseConfigured } from '../config/firebase.js'
import type { AppEnv } from '../types.js'

const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('solilo-api'),
    basePath: z.string().openapi({ example: '/apps/solilo/api' }),
    firebaseConfigured: z.boolean().openapi({ example: false }),
    timestamp: z.string().openapi({ example: '2026-11-14T21:30:00.000Z' }),
  })
  .openapi('HealthResponse')

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['System'],
  summary: 'Health check & runtime configuration status',
  responses: {
    200: {
      description: 'Service is healthy',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
  },
})

export const healthRouter = new OpenAPIHono<AppEnv>().openapi(healthRoute, (c) => {
  return c.json(
    {
      status: 'ok' as const,
      service: 'solilo-api' as const,
      basePath: env.BASE_PATH || '/',
      firebaseConfigured: isFirebaseConfigured(),
      timestamp: new Date().toISOString(),
    },
    200,
  )
})
