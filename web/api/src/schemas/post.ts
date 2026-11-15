import { z } from '@hono/zod-openapi'
import { FediversePlatformSchema } from './account.js'

export const SoliloVisibilitySchema = z
  .enum(['public', 'private'])
  .openapi({
    description:
      '"public" updates can be read via Public Web API / website embed; "private" updates are visible only to you across Web, iOS, and Android.',
    example: 'public',
  })
export type SoliloVisibility = z.infer<typeof SoliloVisibilitySchema>

export const FediverseVisibilitySchema = z
  .enum(['public', 'unlisted', 'followers'])
  .openapi({
    description: 'Visibility used when cross-posting to Mastodon or Misskey.',
    example: 'public',
  })
export type FediverseVisibility = z.infer<typeof FediverseVisibilitySchema>

export const DeliveryReceiptSchema = z
  .object({
    accountId: z.string().openapi({ example: 'mastodon_mastodon.social_109382' }),
    platform: FediversePlatformSchema,
    acct: z.string().openapi({ example: '@kate@mastodon.social' }),
    status: z.enum(['pending', 'published', 'failed']).openapi({ example: 'published' }),
    remotePostId: z.string().nullable().openapi({ example: '11348392019283' }),
    remoteUrl: z
      .string()
      .nullable()
      .openapi({ example: 'https://mastodon.social/@kate/11348392019283' }),
    error: z.string().nullable().openapi({ example: null }),
    deliveredAt: z.string().nullable().openapi({ example: '2026-11-14T21:00:01.000Z' }),
  })
  .openapi('DeliveryReceipt')

export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>

export const PostSchema = z
  .object({
    id: z.string().openapi({ example: 'pst_01JCP4X9Z7G6K8M2N4Q6R8S0T2' }),
    content: z.string().openapi({ example: '深夜独自写点东西，留在自己的时间线上。' }),
    contentWarning: z.string().nullable().openapi({ example: null }),
    visibility: SoliloVisibilitySchema,
    fediverseVisibility: FediverseVisibilitySchema,
    deliveries: z.array(DeliveryReceiptSchema),
    createdAt: z.string().openapi({ example: '2026-11-14T21:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-11-14T21:00:01.000Z' }),
  })
  .openapi('Post')

export type Post = z.infer<typeof PostSchema>

export const CreatePostRequestSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1)
      .max(5000)
      .openapi({ example: '深夜独自写点东西，留在自己的时间线上。' }),
    contentWarning: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .openapi({ example: null, description: 'Optional CW / spoiler text for Mastodon & Misskey.' }),
    visibility: SoliloVisibilitySchema.default('public'),
    fediverseVisibility: FediverseVisibilitySchema.default('public'),
    accountIds: z
      .array(z.string())
      .max(20)
      .default([])
      .openapi({
        example: [],
        description:
          'IDs of connected Mastodon/Misskey accounts to cross-post to. Leave empty for Solilo-only.',
      }),
  })
  .openapi('CreatePostRequest')

export const UpdatePostRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(5000).optional(),
    contentWarning: z.string().trim().max(500).nullable().optional(),
    visibility: SoliloVisibilitySchema.optional(),
  })
  .openapi('UpdatePostRequest')

export const PostListResponseSchema = z
  .object({
    items: z.array(PostSchema),
    nextCursor: z.string().nullable().openapi({ example: null }),
  })
  .openapi('PostListResponse')

export const PublicSyndicationSchema = z.object({
  platform: FediversePlatformSchema,
  acct: z.string().openapi({ example: '@kate@mastodon.social' }),
  url: z.string().url().openapi({ example: 'https://mastodon.social/@kate/11348392019283' }),
})

export const PublicPostSchema = z
  .object({
    id: z.string(),
    content: z.string(),
    contentWarning: z.string().nullable(),
    syndications: z.array(PublicSyndicationSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('PublicPost')

export type PublicPost = z.infer<typeof PublicPostSchema>

export const PublicTimelineResponseSchema = z
  .object({
    items: z.array(PublicPostSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('PublicTimelineResponse')

export type PublicTimelineResponse = z.infer<typeof PublicTimelineResponseSchema>
