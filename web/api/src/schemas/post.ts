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

export const PostMediaSchema = z
  .object({
    id: z.string().openapi({ example: 'med_m8x9a_1f2e3d4c.jpg' }),
    url: z
      .string()
      .url()
      .openapi({ example: 'https://kate0115.cc/apps/solilo/api/media/med_m8x9a_1f2e3d4c.jpg?u=uid&sig=...' }),
    mimeType: z
      .enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      .openapi({ example: 'image/jpeg' }),
    sizeBytes: z.number().int().nonnegative().openapi({ example: 245120 }),
    alt: z.string().max(1500).nullable().openapi({ example: '傍晚窗边的胶片天空' }),
  })
  .openapi('PostMedia')

export type PostMedia = z.infer<typeof PostMediaSchema>

export const PostMediaAttachmentInputSchema = z
  .object({
    id: z.string().min(1).openapi({ example: 'med_m8x9a_1f2e3d4c.jpg' }),
    alt: z.string().trim().max(1500).nullable().optional().openapi({ example: '傍晚窗边的胶片天空' }),
  })
  .openapi('PostMediaAttachmentInput')

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
    media: z.array(PostMediaSchema).max(4).default([]),
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
      .max(5000)
      .default('')
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
    media: z
      .array(PostMediaAttachmentInputSchema)
      .max(4)
      .default([])
      .openapi({
        example: [],
        description: 'Up to 4 uploaded photo attachments (Mastodon rule).',
      }),
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
  .refine((data) => data.content.trim().length > 0 || data.media.length > 0, {
    message: '动态正文与照片不能同时为空。',
    path: ['content'],
  })
  .openapi('CreatePostRequest')

export const UpdatePostRequestSchema = z
  .object({
    content: z.string().trim().max(5000).optional(),
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
    media: z.array(PostMediaSchema).max(4).default([]),
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
