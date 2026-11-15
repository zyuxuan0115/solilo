import { z } from '@hono/zod-openapi'

export const ApiKeyMetadataSchema = z
  .object({
    id: z.string().openapi({ example: 'key_9f8e7d6c5b4a' }),
    label: z.string().openapi({ example: 'kate0115.cc 博客嵌入' }),
    prefix: z.string().openapi({ example: 'slk_9a8b7c6d' }),
    allowedOrigins: z
      .array(z.string())
      .openapi({ example: ['https://kate0115.cc'] }),
    createdAt: z.string().openapi({ example: '2026-11-14T21:00:00.000Z' }),
    lastUsedAt: z.string().nullable().openapi({ example: null }),
  })
  .openapi('ApiKeyMetadata')

export type ApiKeyMetadata = z.infer<typeof ApiKeyMetadataSchema>

export const CreateApiKeyRequestSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .openapi({ example: 'kate0115.cc 博客嵌入' }),
    allowedOrigins: z
      .array(z.string().url())
      .max(10)
      .default([])
      .openapi({
        example: ['https://kate0115.cc'],
        description:
          'Optional allowed Origin URLs for browser embeds. Empty array allows any origin.',
      }),
  })
  .openapi('CreateApiKeyRequest')

export const CreateApiKeyResponseSchema = ApiKeyMetadataSchema.extend({
  rawKey: z
    .string()
    .openapi({
      example: 'slk_9a8b7c6d5e4f3g2h1i0j9k8l7m6n5o4p',
      description: 'Full read-only API key. Save it immediately; it will not be shown again.',
    }),
}).openapi('CreateApiKeyResponse')

export const ApiKeyListResponseSchema = z
  .object({
    items: z.array(ApiKeyMetadataSchema),
  })
  .openapi('ApiKeyListResponse')
