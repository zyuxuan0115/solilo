import { z } from '@hono/zod-openapi'

export const FediversePlatformSchema = z.enum(['mastodon', 'misskey']).openapi('FediversePlatform')
export type FediversePlatform = z.infer<typeof FediversePlatformSchema>

export const ConnectedAccountSchema = z
  .object({
    id: z.string().openapi({ example: 'mastodon_mastodon.social_109382' }),
    platform: FediversePlatformSchema,
    instanceOrigin: z.string().url().openapi({ example: 'https://mastodon.social' }),
    instanceHost: z.string().openapi({ example: 'mastodon.social' }),
    remoteAccountId: z.string().openapi({ example: '109382' }),
    username: z.string().openapi({ example: 'kate' }),
    acct: z.string().openapi({ example: '@kate@mastodon.social' }),
    displayName: z.string().openapi({ example: 'Kate' }),
    avatarUrl: z.string().nullable().openapi({ example: null }),
    profileUrl: z.string().nullable().openapi({ example: 'https://mastodon.social/@kate' }),
    createdAt: z.string().openapi({ example: '2026-11-14T21:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-11-14T21:00:00.000Z' }),
  })
  .openapi('ConnectedAccount')

export type ConnectedAccount = z.infer<typeof ConnectedAccountSchema>

export const ConnectAccountStartRequestSchema = z
  .object({
    instance: z
      .string()
      .trim()
      .min(3)
      .max(255)
      .openapi({
        example: 'mastodon.social',
        description: 'Mastodon or Misskey instance domain or URL.',
      }),
  })
  .openapi('ConnectAccountStartRequest')

export const ConnectAccountStartResponseSchema = z
  .object({
    authorizeUrl: z
      .string()
      .url()
      .openapi({
        example: 'https://mastodon.social/oauth/authorize?client_id=...',
        description: 'Redirect the user browser/webview to this URL to authorize.',
      }),
    state: z.string().openapi({ example: '7b9e3f10-42aa-4f19-9a0b-3d9a81f22e11' }),
  })
  .openapi('ConnectAccountStartResponse')

export const AccountListResponseSchema = z
  .object({
    items: z.array(ConnectedAccountSchema),
  })
  .openapi('AccountListResponse')
