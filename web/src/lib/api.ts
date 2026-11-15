import type {
  ApiKeyMetadata,
  ConnectedAccount,
  CreatePostInput,
  CreatedApiKey,
  FediversePlatform,
  PaginatedResponse,
  Post,
  PostMedia,
  PostMediaMimeType,
  PublicPost,
  UpdatePostInput,
} from '../types/solilo'
import { webEnv } from './env'
import { getClientAuth } from './firebase'

export const MAX_PHOTOS_PER_POST = 4
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const SUPPORTED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set<PostMediaMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export interface SoliloClient {
  readonly mode: 'cloud' | 'sandbox'
  listPosts(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Post>>
  uploadMedia(file: File, alt?: string): Promise<PostMedia>
  createPost(input: CreatePostInput): Promise<Post>
  updatePost(id: string, patch: UpdatePostInput): Promise<Post>
  deletePost(id: string): Promise<void>
  listAccounts(): Promise<ConnectedAccount[]>
  startConnectAccount(
    platform: FediversePlatform,
    instance: string,
  ): Promise<{ authorizeUrl?: string; sandboxAccount?: ConnectedAccount }>
  deleteAccount(id: string): Promise<void>
  listApiKeys(): Promise<ApiKeyMetadata[]>
  createApiKey(input: { label: string; allowedOrigins: string[] }): Promise<CreatedApiKey>
  deleteApiKey(id: string): Promise<void>
}

async function getIdTokenOrThrow(): Promise<string> {
  const auth = getClientAuth()
  const user = auth?.currentUser
  if (!user) {
    throw new Error('登录状态已失效，请重新登录。')
  }
  return user.getIdToken()
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdTokenOrThrow()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${webEnv.apiBaseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new Error(payload?.error?.message || `请求失败 (${res.status})`)
  }

  return (await res.json()) as T
}

export function createCloudSoliloClient(): SoliloClient {
  return {
    mode: 'cloud',
    async listPosts(params) {
      const search = new URLSearchParams()
      if (params?.limit) search.set('limit', String(params.limit))
      if (params?.cursor) search.set('cursor', params.cursor)
      const qs = search.toString()
      return apiFetch<PaginatedResponse<Post>>(`/posts${qs ? `?${qs}` : ''}`)
    },
    uploadMedia(file, alt) {
      const form = new FormData()
      form.append('file', file)
      if (alt && alt.trim()) {
        form.append('alt', alt.trim().slice(0, 1500))
      }
      return apiFetch<PostMedia>('/media', {
        method: 'POST',
        body: form,
      })
    },
    createPost(input) {
      return apiFetch<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    updatePost(id, patch) {
      return apiFetch<Post>(`/posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    async deletePost(id) {
      await apiFetch<{ deleted: true }>(`/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    async listAccounts() {
      const data = await apiFetch<{ items: ConnectedAccount[] }>('/accounts')
      return data.items
    },
    async startConnectAccount(platform, instance) {
      const data = await apiFetch<{ authorizeUrl: string; state: string }>(
        `/accounts/${platform}/connect`,
        {
          method: 'POST',
          body: JSON.stringify({ instance }),
        },
      )
      return { authorizeUrl: data.authorizeUrl }
    },
    async deleteAccount(id) {
      await apiFetch<{ deleted: true }>(`/accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    async listApiKeys() {
      const data = await apiFetch<{ items: ApiKeyMetadata[] }>('/api-keys')
      return data.items
    },
    createApiKey(input) {
      return apiFetch<CreatedApiKey>('/api-keys', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    async deleteApiKey(id) {
      await apiFetch<{ deleted: true }>(`/api-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Local Sandbox Store (for instant preview before Firebase is configured)
// ---------------------------------------------------------------------------

interface SandboxState {
  posts: Post[]
  accounts: ConnectedAccount[]
  apiKeys: ApiKeyMetadata[]
}

const SANDBOX_STORAGE_KEY = 'solilo-local-sandbox-v1'
const sandboxPendingMedia = new Map<string, PostMedia>()

function defaultSandboxState(): SandboxState {
  const now = Date.now()
  const earlier = new Date(now - 3 * 3600 * 1000).toISOString()
  const yesterday = new Date(now - 26 * 3600 * 1000).toISOString()

  return {
    accounts: [
      {
        id: 'mastodon_mastodon.social_demo',
        platform: 'mastodon',
        instanceOrigin: 'https://mastodon.social',
        instanceHost: 'mastodon.social',
        remoteAccountId: 'demo_1',
        username: 'kate',
        acct: '@kate@mastodon.social',
        displayName: 'Kate',
        avatarUrl: null,
        profileUrl: 'https://mastodon.social/@kate',
        createdAt: yesterday,
        updatedAt: yesterday,
      },
    ],
    posts: [
      {
        id: 'pst_seed_2',
        content: '把零碎的想法记在只属于自己的时间线里，想对外说的时候再顺手同步出去。',
        contentWarning: null,
        visibility: 'public',
        fediverseVisibility: 'public',
        media: [],
        deliveries: [
          {
            accountId: 'mastodon_mastodon.social_demo',
            platform: 'mastodon',
            acct: '@kate@mastodon.social',
            status: 'published',
            remotePostId: '113480001',
            remoteUrl: 'https://mastodon.social/@kate',
            error: null,
            deliveredAt: earlier,
          },
        ],
        createdAt: earlier,
        updatedAt: earlier,
      },
      {
        id: 'pst_seed_1',
        content: '这一条设为「仅自己可见」，只会出现在我的 Web / iOS / Android 里，不会被外部博客嵌入接口读取。',
        contentWarning: null,
        visibility: 'private',
        fediverseVisibility: 'public',
        media: [],
        deliveries: [],
        createdAt: yesterday,
        updatedAt: yesterday,
      },
    ],
    apiKeys: [],
  }
}

function loadSandbox(): SandboxState {
  try {
    const raw = localStorage.getItem(SANDBOX_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SandboxState
      return {
        accounts: parsed.accounts ?? [],
        apiKeys: parsed.apiKeys ?? [],
        posts: (parsed.posts ?? []).map((p) => ({
          ...p,
          media: Array.isArray(p.media) ? p.media : [],
        })),
      }
    }
  } catch {
    // Fall back to default seed
  }
  const seeded = defaultSandboxState()
  saveSandbox(seeded)
  return seeded
}

function saveSandbox(state: SandboxState): void {
  try {
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota errors in local preview mode
  }
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法读取本地图片文件。'))
    reader.readAsDataURL(blob)
  })
}

async function fileToSandboxDataUrl(file: File): Promise<string> {
  if (file.type === 'image/gif' || file.size <= 350 * 1024) {
    return readBlobAsDataUrl(file)
  }

  try {
    const bitmap = await createImageBitmap(file)
    const maxEdge = 1200
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return readBlobAsDataUrl(file)
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return readBlobAsDataUrl(file)
  }
}

export function toPublicPosts(posts: Post[]): PublicPost[] {
  return posts
    .filter((p) => p.visibility === 'public')
    .map((p) => ({
      id: p.id,
      content: p.content,
      contentWarning: p.contentWarning,
      media: p.media ?? [],
      syndications: p.deliveries
        .filter((d) => d.status === 'published' && Boolean(d.remoteUrl))
        .map((d) => ({
          platform: d.platform,
          acct: d.acct,
          url: d.remoteUrl as string,
        })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
}

export function createSandboxSoliloClient(): SoliloClient {
  return {
    mode: 'sandbox',
    async listPosts(params) {
      const state = loadSandbox()
      const sorted = [...state.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const limit = params?.limit ?? 20
      const startIdx = params?.cursor
        ? sorted.findIndex((item) => item.createdAt < params.cursor!)
        : 0
      if (startIdx < 0) return { items: [], nextCursor: null }
      const items = sorted.slice(startIdx, startIdx + limit)
      const hasMore = startIdx + limit < sorted.length
      const last = items[items.length - 1]
      return {
        items,
        nextCursor: hasMore && last ? last.createdAt : null,
      }
    },
    async uploadMedia(file, alt) {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
        throw new Error('仅支持上传 JPEG、PNG、WebP 或 GIF 格式的图片。')
      }
      if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
        throw new Error('每张照片大小需在 1B 到 10MB 之间。')
      }
      const dataUrl = await fileToSandboxDataUrl(file)
      const id = `med_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const media: PostMedia = {
        id,
        url: dataUrl,
        mimeType: file.type as PostMediaMimeType,
        sizeBytes: file.size,
        alt: alt && alt.trim() ? alt.trim().slice(0, 1500) : null,
      }
      sandboxPendingMedia.set(id, media)
      return media
    },
    async createPost(input) {
      const state = loadSandbox()
      const now = new Date().toISOString()
      const id = `pst_${Date.now().toString(36)}`
      const selected = state.accounts.filter((a) => input.accountIds.includes(a.id))
      const mediaInputs = (input.media ?? []).slice(0, MAX_PHOTOS_PER_POST)
      const resolvedMedia: PostMedia[] = mediaInputs
        .map((item) => {
          const stored = sandboxPendingMedia.get(item.id)
          if (!stored) return null
          sandboxPendingMedia.delete(item.id)
          return {
            ...stored,
            alt:
              item.alt !== undefined
                ? item.alt && item.alt.trim()
                  ? item.alt.trim().slice(0, 1500)
                  : null
                : stored.alt,
          }
        })
        .filter((item): item is PostMedia => item !== null)

      if (!input.content.trim() && resolvedMedia.length === 0) {
        throw new Error('动态正文与照片不能同时为空。')
      }

      const post: Post = {
        id,
        content: input.content,
        contentWarning: input.contentWarning ?? null,
        visibility: input.visibility,
        fediverseVisibility: input.fediverseVisibility,
        media: resolvedMedia,
        deliveries: selected.map((acc) => ({
          accountId: acc.id,
          platform: acc.platform,
          acct: acc.acct,
          status: 'published',
          remotePostId: `sim_${Date.now()}`,
          remoteUrl:
            acc.platform === 'mastodon'
              ? `${acc.instanceOrigin}/@${acc.username}`
              : `${acc.instanceOrigin}/notes/demo`,
          error: null,
          deliveredAt: now,
        })),
        createdAt: now,
        updatedAt: now,
      }

      state.posts.unshift(post)
      saveSandbox(state)
      return post
    },
    async updatePost(id, patch) {
      const state = loadSandbox()
      const target = state.posts.find((p) => p.id === id)
      if (!target) throw new Error('未找到该条记录。')
      const nextContent = patch.content !== undefined ? patch.content : target.content
      if (!nextContent.trim() && (target.media ?? []).length === 0) {
        throw new Error('动态正文与照片不能同时为空。')
      }
      if (patch.content !== undefined) target.content = patch.content
      if (patch.contentWarning !== undefined) target.contentWarning = patch.contentWarning
      if (patch.visibility !== undefined) target.visibility = patch.visibility
      target.updatedAt = new Date().toISOString()
      saveSandbox(state)
      return { ...target }
    },
    async deletePost(id) {
      const state = loadSandbox()
      state.posts = state.posts.filter((p) => p.id !== id)
      saveSandbox(state)
    },
    async listAccounts() {
      return loadSandbox().accounts
    },
    async startConnectAccount(platform, instance) {
      const cleaned = instance
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase()
      if (!cleaned || !cleaned.includes('.')) {
        throw new Error('请输入有效的实例域名，例如 mastodon.social 或 misskey.io')
      }
      const state = loadSandbox()
      const now = new Date().toISOString()
      const account: ConnectedAccount = {
        id: `${platform}_${cleaned}_${Date.now().toString(36)}`,
        platform,
        instanceOrigin: `https://${cleaned}`,
        instanceHost: cleaned,
        remoteAccountId: Date.now().toString(36),
        username: 'kate',
        acct: `@kate@${cleaned}`,
        displayName: 'Kate',
        avatarUrl: null,
        profileUrl: `https://${cleaned}/@kate`,
        createdAt: now,
        updatedAt: now,
      }
      state.accounts.push(account)
      saveSandbox(state)
      return { sandboxAccount: account }
    },
    async deleteAccount(id) {
      const state = loadSandbox()
      state.accounts = state.accounts.filter((a) => a.id !== id)
      saveSandbox(state)
    },
    async listApiKeys() {
      return loadSandbox().apiKeys
    },
    async createApiKey(input) {
      const state = loadSandbox()
      const randomPart = Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14)
      const rawKey = `slk_preview_${randomPart}`
      const meta: ApiKeyMetadata = {
        id: `key_${Date.now().toString(36)}`,
        label: input.label,
        prefix: rawKey.slice(0, 12),
        allowedOrigins: input.allowedOrigins,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      }
      state.apiKeys.unshift(meta)
      saveSandbox(state)
      return { ...meta, rawKey }
    },
    async deleteApiKey(id) {
      const state = loadSandbox()
      state.apiKeys = state.apiKeys.filter((k) => k.id !== id)
      saveSandbox(state)
    },
  }
}
