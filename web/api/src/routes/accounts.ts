import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { env } from '../config/env.js'
import { requireFirebaseAuth } from '../middleware/auth.js'
import {
  AccountListResponseSchema,
  ConnectAccountStartRequestSchema,
  ConnectAccountStartResponseSchema,
} from '../schemas/account.js'
import { ErrorResponseSchema } from '../schemas/common.js'
import {
  buildMastodonAuthorizeUrl,
  ensureMastodonOAuthApp,
  exchangeMastodonCodeForAccount,
} from '../services/fediverse/mastodon.js'
import {
  buildMisskeyMiAuthUrl,
  checkMisskeyMiAuthSession,
} from '../services/fediverse/misskey.js'
import {
  consumeOAuthState,
  createOAuthState,
  deleteConnectedAccount,
  listConnectedAccounts,
  upsertConnectedAccount,
} from '../services/firestore.js'
import type { AppEnv } from '../types.js'
import { normalizeInstanceOrigin } from '../utils/url.js'

const AccountIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: 'id', in: 'path' },
    example: 'mastodon_mastodon.social_109382',
  }),
})

const listAccountsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Fediverse Accounts'],
  summary: 'List connected Mastodon and Misskey accounts',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  responses: {
    200: {
      description: 'Connected accounts',
      content: { 'application/json': { schema: AccountListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const connectMastodonStartRoute = createRoute({
  method: 'post',
  path: '/mastodon/connect',
  tags: ['Fediverse Accounts'],
  summary: 'Start Mastodon OAuth 2.0 connection for any Mastodon instance',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ConnectAccountStartRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Mastodon OAuth authorization URL',
      content: { 'application/json': { schema: ConnectAccountStartResponseSchema } },
    },
    400: {
      description: 'Invalid instance URL',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Remote Mastodon instance registration error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const mastodonCallbackRoute = createRoute({
  method: 'get',
  path: '/mastodon/callback',
  tags: ['Fediverse Accounts'],
  summary: 'Mastodon OAuth 2.0 redirect callback',
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  responses: {
    302: { description: 'Redirects back to Solilo web app with connection result' },
    400: {
      description: 'Invalid OAuth callback parameters or expired state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const connectMisskeyStartRoute = createRoute({
  method: 'post',
  path: '/misskey/connect',
  tags: ['Fediverse Accounts'],
  summary: 'Start Misskey MiAuth connection for any Misskey instance',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ConnectAccountStartRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Misskey MiAuth authorization URL',
      content: { 'application/json': { schema: ConnectAccountStartResponseSchema } },
    },
    400: {
      description: 'Invalid instance URL',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const misskeyCallbackRoute = createRoute({
  method: 'get',
  path: '/misskey/callback',
  tags: ['Fediverse Accounts'],
  summary: 'Misskey MiAuth redirect callback',
  request: {
    query: z.object({
      session: z.string().optional(),
    }),
  },
  responses: {
    302: { description: 'Redirects back to Solilo web app with connection result' },
    400: {
      description: 'Invalid or expired MiAuth session',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const deleteAccountRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Fediverse Accounts'],
  summary: 'Disconnect a Mastodon or Misskey account',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    params: AccountIdParamSchema,
  },
  responses: {
    200: {
      description: 'Disconnected',
      content: {
        'application/json': { schema: z.object({ deleted: z.literal(true) }) },
      },
    },
    404: {
      description: 'Account not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

function buildWebRedirectUrl(params: Record<string, string>): string {
  const url = new URL(env.PUBLIC_WEB_URL)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export const accountsRouter = new OpenAPIHono<AppEnv>()
  .openapi(listAccountsRoute, async (c) => {
    const { uid } = c.get('authUser')
    const items = await listConnectedAccounts(uid)
    return c.json({ items }, 200)
  })
  .openapi(connectMastodonStartRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { instance } = c.req.valid('json')

    let normalized: { origin: string; host: string }
    try {
      normalized = normalizeInstanceOrigin(instance)
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'INVALID_INSTANCE',
            message: err instanceof Error ? err.message : 'Invalid Mastodon instance URL.',
          },
        },
        400,
      )
    }

    try {
      const oauthApp = await ensureMastodonOAuthApp(normalized.origin, normalized.host)
      const stateRecord = await createOAuthState({
        uid,
        platform: 'mastodon',
        instanceOrigin: normalized.origin,
        instanceHost: normalized.host,
      })

      const authorizeUrl = buildMastodonAuthorizeUrl({
        instanceOrigin: normalized.origin,
        clientId: oauthApp.clientId,
        redirectUri: oauthApp.redirectUri,
        state: stateRecord.state,
      })

      return c.json({ authorizeUrl, state: stateRecord.state }, 200)
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'MASTODON_CONNECT_FAILED',
            message: err instanceof Error ? err.message : 'Could not reach Mastodon instance.',
          },
        },
        502,
      )
    }
  })
  .openapi(mastodonCallbackRoute, async (c) => {
    const { code, state, error } = c.req.valid('query')
    if (error) {
      return c.redirect(buildWebRedirectUrl({ connected: 'error', reason: error }), 302)
    }
    if (!code || !state) {
      return c.json(
        {
          error: {
            code: 'INVALID_OAUTH_CALLBACK',
            message: 'Missing code or state parameter.',
          },
        },
        400,
      )
    }

    const stateRecord = await consumeOAuthState(state, 'mastodon')
    if (!stateRecord) {
      return c.json(
        {
          error: {
            code: 'EXPIRED_OAUTH_STATE',
            message: 'OAuth state is invalid, expired, or was already used.',
          },
        },
        400,
      )
    }

    try {
      const { accessToken, profile } = await exchangeMastodonCodeForAccount({
        instanceOrigin: stateRecord.instanceOrigin,
        instanceHost: stateRecord.instanceHost,
        code,
      })

      const saved = await upsertConnectedAccount(stateRecord.uid, {
        platform: 'mastodon',
        instanceOrigin: stateRecord.instanceOrigin,
        instanceHost: stateRecord.instanceHost,
        remoteAccountId: profile.remoteAccountId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
        accessToken,
      })

      return c.redirect(
        buildWebRedirectUrl({ connected: 'mastodon', acct: saved.acct }),
        302,
      )
    } catch (err) {
      return c.redirect(
        buildWebRedirectUrl({
          connected: 'error',
          reason: err instanceof Error ? err.message : 'Mastodon exchange failed',
        }),
        302,
      )
    }
  })
  .openapi(connectMisskeyStartRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { instance } = c.req.valid('json')

    let normalized: { origin: string; host: string }
    try {
      normalized = normalizeInstanceOrigin(instance)
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'INVALID_INSTANCE',
            message: err instanceof Error ? err.message : 'Invalid Misskey instance URL.',
          },
        },
        400,
      )
    }

    const stateRecord = await createOAuthState({
      uid,
      platform: 'misskey',
      instanceOrigin: normalized.origin,
      instanceHost: normalized.host,
    })

    const authorizeUrl = buildMisskeyMiAuthUrl({
      instanceOrigin: normalized.origin,
      sessionId: stateRecord.state,
    })

    return c.json({ authorizeUrl, state: stateRecord.state }, 200)
  })
  .openapi(misskeyCallbackRoute, async (c) => {
    const { session } = c.req.valid('query')
    if (!session) {
      return c.json(
        {
          error: {
            code: 'INVALID_MIAUTH_CALLBACK',
            message: 'Missing session parameter.',
          },
        },
        400,
      )
    }

    const stateRecord = await consumeOAuthState(session, 'misskey')
    if (!stateRecord) {
      return c.json(
        {
          error: {
            code: 'EXPIRED_MIAUTH_SESSION',
            message: 'MiAuth session is invalid, expired, or was already used.',
          },
        },
        400,
      )
    }

    try {
      const { accessToken, profile } = await checkMisskeyMiAuthSession({
        instanceOrigin: stateRecord.instanceOrigin,
        sessionId: stateRecord.state,
      })

      const saved = await upsertConnectedAccount(stateRecord.uid, {
        platform: 'misskey',
        instanceOrigin: stateRecord.instanceOrigin,
        instanceHost: stateRecord.instanceHost,
        remoteAccountId: profile.remoteAccountId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
        accessToken,
      })

      return c.redirect(
        buildWebRedirectUrl({ connected: 'misskey', acct: saved.acct }),
        302,
      )
    } catch (err) {
      return c.redirect(
        buildWebRedirectUrl({
          connected: 'error',
          reason: err instanceof Error ? err.message : 'Misskey verification failed',
        }),
        302,
      )
    }
  })
  .openapi(deleteAccountRoute, async (c) => {
    const { uid } = c.get('authUser')
    const { id } = c.req.valid('param')

    const ok = await deleteConnectedAccount(uid, id)
    if (!ok) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Connected account ${id} was not found.`,
          },
        },
        404,
      )
    }
    return c.json({ deleted: true as const }, 200)
  })
