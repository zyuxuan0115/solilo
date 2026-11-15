import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { requireFirebaseAuth } from '../middleware/auth.js'
import {
  ApiKeyListResponseSchema,
  CreateApiKeyRequestSchema,
  CreateApiKeyResponseSchema,
} from '../schemas/apiKey.js'
import { ErrorResponseSchema } from '../schemas/common.js'
import {
  createApiKeyRecord,
  deleteApiKeyRecord,
  listApiKeysForUser,
} from '../services/firestore.js'
import type { AppEnv } from '../types.js'

const ApiKeyIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: 'id', in: 'path' },
    example: 'key_9f8e7d6c5b4a',
  }),
})

const listApiKeysRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Public API Keys'],
  summary: 'List read-only API keys for embedding your public timeline on websites',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  responses: {
    200: {
      description: 'API key metadata list',
      content: { 'application/json': { schema: ApiKeyListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const createApiKeyRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Public API Keys'],
  summary: 'Create a read-only API key for website embedding or external pulls',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateApiKeyRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created API key (rawKey is returned only once)',
      content: { 'application/json': { schema: CreateApiKeyResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const deleteApiKeyRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Public API Keys'],
  summary: 'Revoke a read-only API key',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    params: ApiKeyIdParamSchema,
  },
  responses: {
    200: {
      description: 'Revoked',
      content: {
        'application/json': { schema: z.object({ deleted: z.literal(true) }) },
      },
    },
    404: {
      description: 'API key not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const apiKeysRouter = new OpenAPIHono<AppEnv>()
  .openapi(listApiKeysRoute, async (c) => {
    const { uid } = c.get('authUser')
    const items = await listApiKeysForUser(uid)
    return c.json({ items }, 200)
  })
  .openapi(createApiKeyRoute, async (c) => {
    const { uid } = c.get('authUser')
    const body = c.req.valid('json')
    const created = await createApiKeyRecord(uid, body)
    return c.json(created, 201)
  })
  .openapi(deleteApiKeyRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { id } = c.req.valid('param')
    const ok = await deleteApiKeyRecord(uid, id)
    if (!ok) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `API key ${id} was not found.`,
          },
        },
        404,
      )
    }
    return c.json({ deleted: true as const }, 200)
  })
