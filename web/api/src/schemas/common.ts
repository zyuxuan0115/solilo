import { z } from '@hono/zod-openapi'

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'UNAUTHORIZED' }),
      message: z.string().openapi({ example: 'Missing or invalid authentication token.' }),
    }),
  })
  .openapi('ErrorResponse')

export const TimelineQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({
      param: { name: 'limit', in: 'query' },
      example: 20,
      description: 'Number of updates to fetch (1-100).',
    }),
  cursor: z
    .string()
    .optional()
    .openapi({
      param: { name: 'cursor', in: 'query' },
      example: '2026-11-14T21:00:00.000Z',
      description: 'ISO timestamp cursor from previous page nextCursor.',
    }),
})
