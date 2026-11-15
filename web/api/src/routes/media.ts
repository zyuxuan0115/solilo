import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { requireFirebaseAuth } from '../middleware/auth.js'
import { ErrorResponseSchema } from '../schemas/common.js'
import { PostMediaSchema } from '../schemas/post.js'
import { downloadMediaFromStorage, uploadUserMedia } from '../services/firestore.js'
import type { AppEnv } from '../types.js'
import { verifyMediaAccess } from '../utils/crypto.js'
import { MAX_PHOTO_BYTES, detectImageType } from '../utils/image.js'

const UploadMediaSchema = z.object({
  file: z.any().openapi({
    type: 'string',
    format: 'binary',
    description: 'Photo file (JPEG, PNG, WebP, or GIF, up to 10 MB).',
  }),
  alt: z
    .string()
    .max(1500)
    .optional()
    .openapi({
      example: '傍晚窗边的云',
      description: 'Optional alt text (up to 1500 chars, synced to Mastodon & Misskey).',
    }),
})

const uploadMediaRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Media'],
  summary: 'Upload a photo to Firebase Cloud Storage (up to 4 photos per post)',
  security: [{ FirebaseBearer: [] }],
  middleware: [requireFirebaseAuth] as const,
  request: {
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: UploadMediaSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Uploaded photo metadata and signed media URL',
      content: { 'application/json': { schema: PostMediaSchema } },
    },
    400: {
      description: 'Invalid file format or size limit exceeded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const serveMediaRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Media'],
  summary: 'Stream a stored photo via its HMAC-signed capability URL',
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^[a-zA-Z0-9._-]+$/)
        .openapi({
          param: { name: 'id', in: 'path' },
          example: 'med_m8x9a_1f2e3d4c.jpg',
        }),
    }),
    query: z.object({
      u: z.string().min(1).openapi({ param: { name: 'u', in: 'query' } }),
      sig: z.string().min(1).openapi({ param: { name: 'sig', in: 'query' } }),
    }),
  },
  responses: {
    200: {
      description: 'Image binary content',
    },
    403: {
      description: 'Invalid media signature',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Media not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const mediaRouter = new OpenAPIHono<AppEnv>()
  .openapi(uploadMediaRoute, async (c) => {
    const { uid } = c.get('authUser')
    const formData = await c.req.formData()
    const fileField = formData.get('file')
    const altField = formData.get('alt')

    if (!(fileField instanceof File)) {
      return c.json(
        {
          error: {
            code: 'MISSING_FILE',
            message: 'Multipart field "file" is required.',
          },
        },
        400,
      )
    }

    if (fileField.size === 0 || fileField.size > MAX_PHOTO_BYTES) {
      return c.json(
        {
          error: {
            code: 'FILE_SIZE_INVALID',
            message: '每张照片大小需在 1B 到 10MB 之间。',
          },
        },
        400,
      )
    }

    const buffer = Buffer.from(await fileField.arrayBuffer())
    const detected = detectImageType(buffer)
    if (!detected) {
      return c.json(
        {
          error: {
            code: 'UNSUPPORTED_IMAGE_FORMAT',
            message: '仅支持上传 JPEG、PNG、WebP 或 GIF 格式的图片。',
          },
        },
        400,
      )
    }

    const alt =
      typeof altField === 'string' && altField.trim().length > 0
        ? altField.trim().slice(0, 1500)
        : null

    const uploaded = await uploadUserMedia(uid, {
      buffer,
      mimeType: detected.mimeType,
      extension: detected.extension,
      alt,
    })

    return c.json(uploaded, 201)
  })
  .openapi(serveMediaRoute, async (c) => {
    const { id } = c.req.valid('param')
    const { u, sig } = c.req.valid('query')

    if (!verifyMediaAccess(u, id, sig)) {
      return c.json(
        {
          error: {
            code: 'INVALID_MEDIA_SIGNATURE',
            message: 'Invalid media access signature.',
          },
        },
        403,
      )
    }

    const downloaded = await downloadMediaFromStorage(u, id)
    if (!downloaded) {
      return c.json(
        {
          error: {
            code: 'MEDIA_NOT_FOUND',
            message: 'Requested photo does not exist.',
          },
        },
        404,
      )
    }

    return new Response(new Uint8Array(downloaded.buffer), {
      status: 200,
      headers: {
        'Content-Type': downloaded.contentType,
        'Content-Length': String(downloaded.buffer.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
