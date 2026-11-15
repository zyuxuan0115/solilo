import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { requirePublicApiKey } from '../middleware/apiKey.js'
import { ErrorResponseSchema, TimelineQuerySchema } from '../schemas/common.js'
import { PublicTimelineResponseSchema, type PublicTimelineResponse } from '../schemas/post.js'
import { listPublicPosts } from '../services/firestore.js'
import type { AppEnv } from '../types.js'
import { publicTimelineCache } from '../utils/cache.js'

const PublicTimelineQuerySchema = TimelineQuerySchema.extend({
  key: z
    .string()
    .optional()
    .openapi({
      param: { name: 'key', in: 'query' },
      example: 'slk_9a8b7c6d5e4f...',
      description:
        'Read-only Solilo API key (can also be sent via X-Solilo-Key header instead of query string).',
    }),
})

const getPublicTimelineRoute = createRoute({
  method: 'get',
  path: '/timeline',
  tags: ['Public & Website Embed'],
  summary: 'Fetch public timeline updates for personal website embedding or external scripts',
  security: [{ SoliloApiKey: [] }],
  middleware: [requirePublicApiKey] as const,
  request: {
    query: PublicTimelineQuerySchema,
  },
  responses: {
    200: {
      description: 'Cached public timeline entries',
      content: { 'application/json': { schema: PublicTimelineResponseSchema } },
    },
    401: {
      description: 'Missing or invalid API key',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Origin not allowed for this API key',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const publicTimelineRouter = new OpenAPIHono<AppEnv>().openapi(
  getPublicTimelineRoute,
  async (c) => {
    const uid = c.get('apiKeyUid')
    const { limit, cursor } = c.req.valid('query')
    const cacheKey = `limit=${limit}&cursor=${cursor ?? ''}`

    const cached = publicTimelineCache.get<PublicTimelineResponse>(uid, cacheKey)
    if (cached) {
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      c.header('X-Solilo-Cache', 'HIT')
      return c.json(cached, 200)
    }

    const fresh = await listPublicPosts(uid, { limit, cursor })
    publicTimelineCache.set(uid, cacheKey, fresh)

    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    c.header('X-Solilo-Cache', 'MISS')
    return c.json(fresh, 200)
  },
)
