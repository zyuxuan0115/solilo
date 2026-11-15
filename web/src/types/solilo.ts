export type FediversePlatform = 'mastodon' | 'misskey'
export type SoliloVisibility = 'public' | 'private'
export type FediverseVisibility = 'public' | 'unlisted' | 'followers'

export interface ConnectedAccount {
  id: string
  platform: FediversePlatform
  instanceOrigin: string
  instanceHost: string
  remoteAccountId: string
  username: string
  acct: string
  displayName: string
  avatarUrl: string | null
  profileUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface DeliveryReceipt {
  accountId: string
  platform: FediversePlatform
  acct: string
  status: 'pending' | 'published' | 'failed'
  remotePostId: string | null
  remoteUrl: string | null
  error: string | null
  deliveredAt: string | null
}

export interface Post {
  id: string
  content: string
  contentWarning: string | null
  visibility: SoliloVisibility
  fediverseVisibility: FediverseVisibility
  deliveries: DeliveryReceipt[]
  createdAt: string
  updatedAt: string
}

export interface CreatePostInput {
  content: string
  contentWarning?: string | null
  visibility: SoliloVisibility
  fediverseVisibility: FediverseVisibility
  accountIds: string[]
}

export interface UpdatePostInput {
  content?: string
  contentWarning?: string | null
  visibility?: SoliloVisibility
}

export interface PublicSyndication {
  platform: FediversePlatform
  acct: string
  url: string
}

export interface PublicPost {
  id: string
  content: string
  contentWarning: string | null
  syndications: PublicSyndication[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
}

export interface ApiKeyMetadata {
  id: string
  label: string
  prefix: string
  allowedOrigins: string[]
  createdAt: string
  lastUsedAt: string | null
}

export interface CreatedApiKey extends ApiKeyMetadata {
  rawKey: string
}
