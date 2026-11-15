import { randomBytes, randomUUID } from 'node:crypto'
import { getDb } from '../config/firebase.js'
import type { ConnectedAccount, FediversePlatform } from '../schemas/account.js'
import type { ApiKeyMetadata } from '../schemas/apiKey.js'
import type {
  DeliveryReceipt,
  FediverseVisibility,
  Post,
  PublicPost,
  SoliloVisibility,
} from '../schemas/post.js'
import { decryptSecret, encryptSecret, generateApiKey, hashApiKey } from '../utils/crypto.js'

export interface StoredConnectedAccount extends ConnectedAccount {
  encryptedAccessToken: string
}

export interface StoredMastodonInstanceApp {
  instanceOrigin: string
  instanceHost: string
  clientId: string
  encryptedClientSecret: string
  redirectUri: string
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

interface StoredApiKeyRecord extends ApiKeyMetadata {
  uid: string
  keyHash: string
}

function userDoc(uid: string) {
  return getDb().collection('users').doc(uid)
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
  const docs = snapshot.docs.map((doc) => doc.data() as Post)

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
  const rawPosts = snapshot.docs.map((doc) => doc.data() as Post)

  const hasMore = rawPosts.length > options.limit
  const slice = hasMore ? rawPosts.slice(0, options.limit) : rawPosts
  const lastItem = slice[slice.length - 1]

  const items: PublicPost[] = slice.map((post) => ({
    id: post.id,
    content: post.content,
    contentWarning: post.contentWarning,
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
  return snap.data() as Post
}

export async function createPostRecord(
  uid: string,
  input: {
    content: string
    contentWarning: string | null
    visibility: SoliloVisibility
    fediverseVisibility: FediverseVisibility
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
  return snap.exists ? (snap.data() as Post) : null
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

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.content !== undefined) updates.content = patch.content
  if (patch.contentWarning !== undefined) updates.contentWarning = patch.contentWarning
  if (patch.visibility !== undefined) updates.visibility = patch.visibility

  await ref.update(updates)
  const updated = await ref.get()
  return updated.data() as Post
}

export async function deletePostRecord(uid: string, postId: string): Promise<boolean> {
  const ref = userDoc(uid).collection('posts').doc(postId)
  const existing = await ref.get()
  if (!existing.exists) return false
  await ref.delete()
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
): Promise<{ clientId: string; clientSecret: string } | null> {
  const snap = await getDb().collection('instanceApps').doc(instanceHost).get()
  if (!snap.exists) return null
  const data = snap.data() as StoredMastodonInstanceApp
  if (data.redirectUri !== expectedRedirectUri) {
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
}): Promise<void> {
  const record: StoredMastodonInstanceApp = {
    instanceOrigin: input.instanceOrigin,
    instanceHost: input.instanceHost,
    clientId: input.clientId,
    encryptedClientSecret: encryptSecret(input.clientSecret),
    redirectUri: input.redirectUri,
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
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(), // 10 minutes
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
// Public Read API Keys (for Website Embedding & External Timeline Pull)
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
  // Best-effort async touch of lastUsedAt
  void ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {})

  return {
    uid: data.uid,
    allowedOrigins: data.allowedOrigins ?? [],
  }
}
