import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { requireFirebaseAuth } from '../middleware/auth.js'
import { ErrorResponseSchema, TimelineQuerySchema } from '../schemas/common.js'
import {
  CreatePostRequestSchema,
  PostListResponseSchema,
  PostSchema,
  UpdatePostRequestSchema,
  type DeliveryReceipt,
} from '../schemas/post.js'
import { dispatchPostToAccounts } from '../services/fediverse/dispatcher.js'
import {
  createPostRecord,
  deletePostRecord,
  downloadPostMediaPayloads,
  downloadStoredMediaPayloads,
  getConnectedAccountsForDispatch,
  getPost,
  listPosts,
  resolveUserMediaForPost,
  updatePostDeliveries,
  updatePostRecord,
  updateSinglePostDelivery,
} from '../services/firestore.js'
import type { AppEnv } from '../types.js'
import { publicTimelineCache } from '../utils/cache.js'

const PostIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: 'id', in: 'path' },
    example: 'pst_01JCP4X9Z7G6K8M2N4Q6R8S0T2',
  }),
})

const RetryDeliveryParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: 'id', in: 'path' },
    example: 'pst_01JCP4X9Z7G6K8M2N4Q6R8S0T2',
  }),
  accountId: z.string().min(1).openapi({
    param: { name: 'accountId', in: 'path' },
    example: 'mastodon_mastodon.social_109382',
  }),
})

const listPostsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Posts'],
  summary: 'List your personal timeline updates (public + private)',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    query: TimelineQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated timeline updates',
      content: { 'application/json': { schema: PostListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'Firebase not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const createPostRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Posts'],
  summary: 'Create a Solilo update (with up to 4 photos) and optionally cross-post to Mastodon / Misskey',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreatePostRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created update with media and per-account delivery receipts',
      content: { 'application/json': { schema: PostSchema } },
    },
    400: {
      description: 'Validation, unknown media ID, or unknown account ID error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'Firebase not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const updatePostRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Posts'],
  summary: 'Edit an existing Solilo update or toggle its public/private visibility',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    params: PostIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdatePostRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated post',
      content: { 'application/json': { schema: PostSchema } },
    },
    400: {
      description: 'Invalid update',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Post not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const deletePostRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Posts'],
  summary: 'Delete an update and its stored photos from your Solilo timeline',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    params: PostIdParamSchema,
  },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': {
          schema: z.object({ deleted: z.literal(true) }),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Post not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const retryPostDeliveryRoute = createRoute({
  method: 'post',
  path: '/{id}/deliveries/{accountId}/retry',
  tags: ['Posts'],
  summary: 'Retry cross-posting a failed or pending delivery to a specific Mastodon / Misskey instance',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    params: RetryDeliveryParamSchema,
  },
  responses: {
    200: {
      description: 'Post with updated per-account delivery receipt',
      content: { 'application/json': { schema: PostSchema } },
    },
    400: {
      description: 'Connected account no longer exists or media could not be loaded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Post or delivery receipt not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const postsRouter = new OpenAPIHono<AppEnv>()
  .openapi(listPostsRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { limit, cursor } = c.req.valid('query')
    const result = await listPosts(uid, { limit, cursor })
    return c.json(result, 200)
  })
  .openapi(createPostRoute, async (c) => {
    const { uid } = c.get('authUser')
    const body = c.req.valid('json')

    const [accounts, resolvedMedia] = await Promise.all([
      getConnectedAccountsForDispatch(uid, body.accountIds),
      resolveUserMediaForPost(uid, body.media),
    ])

    if (!resolvedMedia) {
      return c.json(
        {
          error: {
            code: 'UNKNOWN_MEDIA_ID',
            message: '所选的一张或多张照片不存在或不属于当前账号。',
          },
        },
        400,
      )
    }

    if (body.accountIds.length > 0 && accounts.length !== new Set(body.accountIds).size) {
      return c.json(
        {
          error: {
            code: 'UNKNOWN_ACCOUNT_ID',
            message: 'One or more selected Mastodon/Misskey accountIds do not exist.',
          },
        },
        400,
      )
    }

    const initialDeliveries: DeliveryReceipt[] = accounts.map((acc) => ({
      accountId: acc.id,
      platform: acc.platform,
      acct: acc.acct,
      status: 'pending',
      remotePostId: null,
      remoteUrl: null,
      error: null,
      deliveredAt: null,
    }))

    const created = await createPostRecord(uid, {
      content: body.content,
      contentWarning: body.contentWarning ?? null,
      visibility: body.visibility,
      fediverseVisibility: body.fediverseVisibility,
      media: resolvedMedia.media,
      deliveries: initialDeliveries,
    })

    let finalPost = created
    if (accounts.length > 0) {
      const mediaFiles = await downloadStoredMediaPayloads(resolvedMedia.storageRecords)
      const receipts = await dispatchPostToAccounts({
        postId: created.id,
        content: created.content,
        contentWarning: created.contentWarning,
        fediverseVisibility: created.fediverseVisibility,
        mediaFiles,
        accounts,
      })
      finalPost = (await updatePostDeliveries(uid, created.id, receipts)) ?? {
        ...created,
        deliveries: receipts,
      }
    }

    publicTimelineCache.invalidateUser(uid)
    return c.json(finalPost, 201)
  })
  .openapi(updatePostRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')

    let updated
    try {
      updated = await updatePostRecord(uid, id, patch)
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'INVALID_UPDATE',
            message: err instanceof Error ? err.message : 'Invalid update.',
          },
        },
        400,
      )
    }

    if (!updated) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Post ${id} was not found.`,
          },
        },
        404,
      )
    }

    publicTimelineCache.invalidateUser(uid)
    return c.json(updated, 200)
  })
  .openapi(deletePostRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { id } = c.req.valid('param')

    const ok = await deletePostRecord(uid, id)
    if (!ok) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Post ${id} was not found.`,
          },
        },
        404,
      )
    }

    publicTimelineCache.invalidateUser(uid)
    return c.json({ deleted: true as const }, 200)
  })
  .openapi(retryPostDeliveryRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { id, accountId } = c.req.valid('param')

    const post = await getPost(uid, id)
    if (!post) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `未找到该条记录 (${id})。`,
          },
        },
        404,
      )
    }

    const existingReceipt = post.deliveries.find((d) => d.accountId === accountId)
    if (!existingReceipt) {
      return c.json(
        {
          error: {
            code: 'DELIVERY_NOT_FOUND',
            message: '该动态未关联此联邦宇宙账号。',
          },
        },
        404,
      )
    }

    if (existingReceipt.status === 'published' && existingReceipt.remoteUrl) {
      return c.json(post, 200)
    }

    const [account] = await getConnectedAccountsForDispatch(uid, [accountId])
    if (!account) {
      const disconnectedReceipt: DeliveryReceipt = {
        ...existingReceipt,
        status: 'failed',
        error: '该联邦宇宙账号已解除绑定，请重新绑定后再试。',
      }
      await updateSinglePostDelivery(uid, id, disconnectedReceipt)
      return c.json(
        {
          error: {
            code: 'ACCOUNT_DISCONNECTED',
            message: `账号 ${existingReceipt.acct} 已解除绑定，请重新绑定后再试。`,
          },
        },
        400,
      )
    }

    let mediaFiles
    try {
      mediaFiles = await downloadPostMediaPayloads(uid, post.media)
    } catch {
      return c.json(
        {
          error: {
            code: 'MEDIA_LOAD_FAILED',
            message: '读取动态配图失败，请稍后重试。',
          },
        },
        400,
      )
    }

    const [freshReceipt] = await dispatchPostToAccounts({
      postId: post.id,
      content: post.content,
      contentWarning: post.contentWarning,
      fediverseVisibility: post.fediverseVisibility,
      mediaFiles,
      accounts: [account],
    })

    const updated =
      (await updateSinglePostDelivery(uid, post.id, freshReceipt!)) ?? {
        ...post,
        deliveries: post.deliveries.map((d) =>
          d.accountId === accountId ? freshReceipt! : d,
        ),
      }

    publicTimelineCache.invalidateUser(uid)
    return c.json(updated, 200)
  })
