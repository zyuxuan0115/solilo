import { randomBytes, randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { getDb, getStorageBucket } from '../config/firebase.js'
import type { ConnectedAccount, FediversePlatform } from '../schemas/account.js'
import type { ApiKeyMetadata } from '../schemas/apiKey.js'
import type {
  DeliveryReceipt,
  FediverseVisibility,
  Post,
  PostMedia,
  PublicPost,
  SoliloVisibility,
} from '../schemas/post.js'
import {
  decryptSecret,
  encryptSecret,
  generateApiKey,
  hashApiKey,
  signMediaAccess,
} from '../utils/crypto.js'
import type { SupportedImageMime } from '../utils/image.js'

export interface StoredConnectedAccount extends ConnectedAccount {
  encryptedAccessToken: string
}

export interface StoredMastodonInstanceApp {
  instanceOrigin: string
  instanceHost: string
  clientId: string
  encryptedClientSecret: string
  redirectUri: string
  scopes?: string
  updatedAt: string
}

export interface OAuthStateRecord {
  state: string
  uid: string
  platform: FediversePlatform
  instanceOrigin: string
  instanceHost: string
  createdAt: string
  expiresAt: string
}

export interface StoredMediaRecord extends PostMedia {
  uid: string
  storagePath: string
  createdAt: string
}

interface StoredApiKeyRecord extends ApiKeyMetadata {
  uid: string
  keyHash: string
}

function userDoc(uid: string) {
  return getDb().collection('users').doc(uid)
}

function normalizeStoredPost(raw: Post): Post {
  return {
    ...raw,
    media: Array.isArray(raw.media) ? raw.media : [],
    deliveries: Array.isArray(raw.deliveries) ? raw.deliveries : [],
  }
}

// ---------------------------------------------------------------------------
// Media (Firebase Cloud Storage + Firestore Metadata)
// ---------------------------------------------------------------------------

export function buildMediaPublicUrl(uid: string, mediaId: string): string {
  const sig = signMediaAccess(uid, mediaId)
  const url = new URL(`${env.publicApiBaseUrl}/media/${encodeURIComponent(mediaId)}`)
  url.searchParams.set('u', uid)
  url.searchParams.set('sig', sig)
  return url.toString()
}

export function getMediaStoragePath(uid: string, mediaId: string): string {
  return `users/${uid}/media/${mediaId}`
}

export async function uploadUserMedia(
  uid: string,
  input: {
    buffer: Buffer
    mimeType: SupportedImageMime
    extension: 'jpg' | 'png' | 'webp' | 'gif'
    alt: string | null
  },
): Promise<PostMedia> {
  const mediaId = `med_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}.${input.extension}`
  const storagePath = getMediaStoragePath(uid, mediaId)
  const bucket = getStorageBucket()

  await bucket.file(storagePath).save(input.buffer, {
    resumable: false,
    contentType: input.mimeType,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  const url = buildMediaPublicUrl(uid, mediaId)
  const now = new Date().toISOString()

  const stored: StoredMediaRecord = {
    id: mediaId,
    uid,
    storagePath,
    url,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    alt: input.alt,
    createdAt: now,
  }

  await userDoc(uid).collection('media').doc(mediaId).set(stored)

  return {
    id: stored.id,
    url: stored.url,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    alt: stored.alt,
  }
}

export async function downloadMediaFromStorage(
  uid: string,
  mediaId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const storagePath = getMediaStoragePath(uid, mediaId)
  const file = getStorageBucket().file(storagePath)
  const [exists] = await file.exists()
  if (!exists) return null

  const [metadata] = await file.getMetadata()
  const [buffer] = await file.download()
  return {
    buffer,
    contentType: metadata.contentType || 'application/octet-stream',
  }
}

export async function resolveUserMediaForPost(
  uid: string,
  attachments: Array<{ id: string; alt?: string | null }>,
): Promise<{
  media: PostMedia[]
  storageRecords: StoredMediaRecord[]
} | null> {
  if (attachments.length === 0) {
    return { media: [], storageRecords: [] }
  }

  const refs = attachments.map((item) => userDoc(uid).collection('media').doc(item.id))
  const snaps = await getDb().getAll(...refs)

  const media: PostMedia[] = []
  const storageRecords: StoredMediaRecord[] = []

  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]!
    const inputItem = attachments[i]!
    if (!snap.exists) return null

    const record = snap.data() as StoredMediaRecord
    const resolvedAlt = inputItem.alt !== undefined ? (inputItem.alt ?? null) : record.alt
    const freshUrl = buildMediaPublicUrl(uid, record.id)

    if (resolvedAlt !== record.alt) {
      await snap.ref.update({ alt: resolvedAlt })
    }

    const mediaItem: PostMedia = {
      id: record.id,
      url: freshUrl,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      alt: resolvedAlt,
    }
    media.push(mediaItem)
    storageRecords.push({
      ...record,
      url: freshUrl,
      alt: resolvedAlt,
    })
  }

  return { media, storageRecords }
}

export async function downloadStoredMediaPayloads(
  records: StoredMediaRecord[],
): Promise<Array<{ buffer: Buffer; mimeType: SupportedImageMime; filename: string; alt: string | null }>> {
  if (records.length === 0) return []
  const bucket = getStorageBucket()

  return Promise.all(
    records.map(async (rec) => {
      const [buffer] = await bucket.file(rec.storagePath).download()
      return {
        buffer,
        mimeType: rec.mimeType,
        filename: rec.id,
        alt: rec.alt,
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// Posts (Timeline Updates)
// ---------------------------------------------------------------------------

export async function listPosts(
  uid: string,
  options: { limit: number; cursor?: string },
): Promise<{ items: Post[]; nextCursor: string | null }> {
  let query = userDoc(uid).collection('posts').orderBy('createdAt', 'desc')

  if (options.cursor) {
    query = query.startAfter(options.cursor)
  }

  const snapshot = await query.limit(options.limit + 1).get()
  const docs = snapshot.docs.map((doc) => normalizeStoredPost(doc.data() as Post))

  const hasMore = docs.length > options.limit
  const items = hasMore ? docs.slice(0, options.limit) : docs
  const lastItem = items[items.length - 1]

  return {
    items,
    nextCursor: hasMore && lastItem ? lastItem.createdAt : null,
  }
}

export async function listPublicPosts(
  uid: string,
  options: { limit: number; cursor?: string },
): Promise<{ items: PublicPost[]; nextCursor: string | null }> {
  let query = userDoc(uid)
    .collection('posts')
    .where('visibility', '==', 'public')
    .orderBy('createdAt', 'desc')

  if (options.cursor) {
    query = query.startAfter(options.cursor)
  }

  const snapshot = await query.limit(options.limit + 1).get()
  const rawPosts = snapshot.docs.map((doc) => normalizeStoredPost(doc.data() as Post))

  const hasMore = rawPosts.length > options.limit
  const slice = hasMore ? rawPosts.slice(0, options.limit) : rawPosts
  const lastItem = slice[slice.length - 1]

  const items: PublicPost[] = slice.map((post) => ({
    id: post.id,
    content: post.content,
    contentWarning: post.contentWarning,
    media: post.media,
    syndications: post.deliveries
      .filter((d) => d.status === 'published' && Boolean(d.remoteUrl))
      .map((d) => ({
        platform: d.platform,
        acct: d.acct,
        url: d.remoteUrl as string,
      })),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }))

  return {
    items,
    nextCursor: hasMore && lastItem ? lastItem.createdAt : null,
  }
}

export async function getPost(uid: string, postId: string): Promise<Post | null> {
  const snap = await userDoc(uid).collection('posts').doc(postId).get()
  if (!snap.exists) return null
  return normalizeStoredPost(snap.data() as Post)
}

export async function createPostRecord(
  uid: string,
  input: {
    content: string
    contentWarning: string | null
    visibility: SoliloVisibility
    fediverseVisibility: FediverseVisibility
    media: PostMedia[]
    deliveries: DeliveryReceipt[]
  },
): Promise<Post> {
  const now = new Date().toISOString()
  const id = `pst_${Date.now().toString(36)}_${randomBytes(5).toString('hex')}`

  const post: Post = {
    id,
    content: input.content,
    contentWarning: input.contentWarning,
    visibility: input.visibility,
    fediverseVisibility: input.fediverseVisibility,
    media: input.media,
    deliveries: input.deliveries,
    createdAt: now,
    updatedAt: now,
  }

  await userDoc(uid).collection('posts').doc(id).set(post)
  return post
}

export async function updatePostDeliveries(
  uid: string,
  postId: string,
  deliveries: DeliveryReceipt[],
): Promise<Post | null> {
  const ref = userDoc(uid).collection('posts').doc(postId)
  const updatedAt = new Date().toISOString()
  await ref.update({ deliveries, updatedAt })
  const snap = await ref.get()
  return snap.exists ? normalizeStoredPost(snap.data() as Post) : null
}

export async function updatePostRecord(
  uid: string,
  postId: string,
  patch: {
    content?: string
    contentWarning?: string | null
    visibility?: SoliloVisibility
  },
): Promise<Post | null> {
  const ref = userDoc(uid).collection('posts').doc(postId)
  const existing = await ref.get()
  if (!existing.exists) return null
  const current = normalizeStoredPost(existing.data() as Post)

  const nextContent = patch.content !== undefined ? patch.content : current.content
  if (nextContent.trim().length === 0 && current.media.length === 0) {
    throw new Error('无配图的动态正文不能为空。')
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.content !== undefined) updates.content = patch.content
  if (patch.contentWarning !== undefined) updates.contentWarning = patch.contentWarning
  if (patch.visibility !== undefined) updates.visibility = patch.visibility

  await ref.update(updates)
  const updated = await ref.get()
  return normalizeStoredPost(updated.data() as Post)
}

export async function deletePostRecord(uid: string, postId: string): Promise<boolean> {
  const ref = userDoc(uid).collection('posts').doc(postId)
  const existing = await ref.get()
  if (!existing.exists) return false

  const post = normalizeStoredPost(existing.data() as Post)
  await ref.delete()

  // Best-effort cleanup of associated Cloud Storage objects & media docs
  if (post.media.length > 0) {
    const bucket = getStorageBucket()
    await Promise.allSettled(
      post.media.map(async (m) => {
        const storagePath = getMediaStoragePath(uid, m.id)
        await Promise.allSettled([
          bucket.file(storagePath).delete({ ignoreNotFound: true }),
          userDoc(uid).collection('media').doc(m.id).delete(),
        ])
      }),
    )
  }

  return true
}

// ---------------------------------------------------------------------------
// Connected Mastodon & Misskey Accounts
// ---------------------------------------------------------------------------

function stripAccountSecret(stored: StoredConnectedAccount): ConnectedAccount {
  const { encryptedAccessToken: _ignored, ...safe } = stored
  return safe
}

export async function listConnectedAccounts(uid: string): Promise<ConnectedAccount[]> {
  const snap = await userDoc(uid).collection('accounts').orderBy('createdAt', 'asc').get()
  return snap.docs.map((doc) => stripAccountSecret(doc.data() as StoredConnectedAccount))
}

export async function getConnectedAccountsForDispatch(
  uid: string,
  accountIds: string[],
): Promise<Array<ConnectedAccount & { accessToken: string }>> {
  if (accountIds.length === 0) return []
  const uniqueIds = Array.from(new Set(accountIds))

  const refs = uniqueIds.map((id) => userDoc(uid).collection('accounts').doc(id))
  const snaps = await getDb().getAll(...refs)

  const result: Array<ConnectedAccount & { accessToken: string }> = []
  for (const snap of snaps) {
    if (!snap.exists) continue
    const data = snap.data() as StoredConnectedAccount
    result.push({
      ...stripAccountSecret(data),
      accessToken: decryptSecret(data.encryptedAccessToken),
    })
  }
  return result
}

export async function upsertConnectedAccount(
  uid: string,
  input: {
    platform: FediversePlatform
    instanceOrigin: string
    instanceHost: string
    remoteAccountId: string
    username: string
    displayName: string
    avatarUrl: string | null
    profileUrl: string | null
    accessToken: string
  },
): Promise<ConnectedAccount> {
  const id = `${input.platform}_${input.instanceHost}_${input.remoteAccountId}`.replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  )
  const ref = userDoc(uid).collection('accounts').doc(id)
  const existing = await ref.get()
  const now = new Date().toISOString()
  const createdAt = existing.exists
    ? ((existing.data() as StoredConnectedAccount).createdAt ?? now)
    : now

  const stored: StoredConnectedAccount = {
    id,
    platform: input.platform,
    instanceOrigin: input.instanceOrigin,
    instanceHost: input.instanceHost,
    remoteAccountId: input.remoteAccountId,
    username: input.username,
    acct: `@${input.username}@${input.instanceHost}`,
    displayName: input.displayName || input.username,
    avatarUrl: input.avatarUrl,
    profileUrl: input.profileUrl,
    encryptedAccessToken: encryptSecret(input.accessToken),
    createdAt,
    updatedAt: now,
  }

  await ref.set(stored)
  return stripAccountSecret(stored)
}

export async function deleteConnectedAccount(uid: string, accountId: string): Promise<boolean> {
  const ref = userDoc(uid).collection('accounts').doc(accountId)
  const snap = await ref.get()
  if (!snap.exists) return false
  await ref.delete()
  return true
}

// ---------------------------------------------------------------------------
// Mastodon Dynamic Instance OAuth Apps & One-Time OAuth States
// ---------------------------------------------------------------------------

export async function getMastodonInstanceApp(
  instanceHost: string,
  expectedRedirectUri: string,
  expectedScopes: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const snap = await getDb().collection('instanceApps').doc(instanceHost).get()
  if (!snap.exists) return null
  const data = snap.data() as StoredMastodonInstanceApp
  if (data.redirectUri !== expectedRedirectUri || data.scopes !== expectedScopes) {
    return null
  }
  return {
    clientId: data.clientId,
    clientSecret: decryptSecret(data.encryptedClientSecret),
  }
}

export async function saveMastodonInstanceApp(input: {
  instanceOrigin: string
  instanceHost: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
}): Promise<void> {
  const record: StoredMastodonInstanceApp = {
    instanceOrigin: input.instanceOrigin,
    instanceHost: input.instanceHost,
    clientId: input.clientId,
    encryptedClientSecret: encryptSecret(input.clientSecret),
    redirectUri: input.redirectUri,
    scopes: input.scopes,
    updatedAt: new Date().toISOString(),
  }
  await getDb().collection('instanceApps').doc(input.instanceHost).set(record)
}

export async function createOAuthState(input: {
  uid: string
  platform: FediversePlatform
  instanceOrigin: string
  instanceHost: string
}): Promise<OAuthStateRecord> {
  const state = randomUUID()
  const now = Date.now()
  const record: OAuthStateRecord = {
    state,
    uid: input.uid,
    platform: input.platform,
    instanceOrigin: input.instanceOrigin,
    instanceHost: input.instanceHost,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
  }
  await getDb().collection('oauthStates').doc(state).set(record)
  return record
}

export async function consumeOAuthState(
  state: string,
  expectedPlatform: FediversePlatform,
): Promise<OAuthStateRecord | null> {
  const db = getDb()
  const ref = db.collection('oauthStates').doc(state)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    tx.delete(ref)

    const data = snap.data() as OAuthStateRecord
    if (data.platform !== expectedPlatform) return null
    if (Date.parse(data.expiresAt) < Date.now()) return null
    return data
  })
}

// ---------------------------------------------------------------------------
// Public Read API Keys
// ---------------------------------------------------------------------------

export async function createApiKeyRecord(
  uid: string,
  input: { label: string; allowedOrigins: string[] },
): Promise<ApiKeyMetadata & { rawKey: string }> {
  const { rawKey, keyHash, prefix } = generateApiKey()
  const id = `key_${randomBytes(6).toString('hex')}`
  const now = new Date().toISOString()

  const record: StoredApiKeyRecord = {
    id,
    uid,
    keyHash,
    label: input.label,
    prefix,
    allowedOrigins: input.allowedOrigins,
    createdAt: now,
    lastUsedAt: null,
  }

  await getDb().collection('apiKeys').doc(keyHash).set(record)

  return {
    id,
    label: record.label,
    prefix: record.prefix,
    allowedOrigins: record.allowedOrigins,
    createdAt: record.createdAt,
    lastUsedAt: null,
    rawKey,
  }
}

export async function listApiKeysForUser(uid: string): Promise<ApiKeyMetadata[]> {
  const snap = await getDb().collection('apiKeys').where('uid', '==', uid).get()
  const items = snap.docs.map((doc) => {
    const { uid: _u, keyHash: _h, ...meta } = doc.data() as StoredApiKeyRecord
    return meta
  })
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteApiKeyRecord(uid: string, keyId: string): Promise<boolean> {
  const snap = await getDb().collection('apiKeys').where('uid', '==', uid).get()
  const target = snap.docs.find((doc) => (doc.data() as StoredApiKeyRecord).id === keyId)
  if (!target) return false
  await target.ref.delete()
  return true
}

export async function resolveApiKey(
  rawKey: string,
): Promise<{ uid: string; allowedOrigins: string[] } | null> {
  if (!rawKey.startsWith('slk_')) return null
  const keyHash = hashApiKey(rawKey)
  const ref = getDb().collection('apiKeys').doc(keyHash)
  const snap = await ref.get()
  if (!snap.exists) return null

  const data = snap.data() as StoredApiKeyRecord
  void ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {})

  return {
    uid: data.uid,
    allowedOrigins: data.allowedOrigins ?? [],
  }
}
