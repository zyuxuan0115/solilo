import type { FediverseVisibility } from '../../schemas/post.js'

export interface VerifiedRemoteProfile {
  remoteAccountId: string
  username: string
  displayName: string
  avatarUrl: string | null
  profileUrl: string | null
}

export interface PublishPostInput {
  instanceOrigin: string
  accessToken: string
  content: string
  contentWarning: string | null
  visibility: FediverseVisibility
  idempotencyKey: string
}

export interface PublishPostResult {
  remotePostId: string
  remoteUrl: string | null
}
