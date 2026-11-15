import type { FediverseVisibility } from '../../schemas/post.js'
import type { SupportedImageMime } from '../../utils/image.js'

export interface VerifiedRemoteProfile {
  remoteAccountId: string
  username: string
  displayName: string
  avatarUrl: string | null
  profileUrl: string | null
}

export interface OutboundMediaFile {
  buffer: Buffer
  mimeType: SupportedImageMime
  filename: string
  alt: string | null
}

export interface PublishPostInput {
  instanceOrigin: string
  accessToken: string
  content: string
  contentWarning: string | null
  visibility: FediverseVisibility
  mediaFiles: OutboundMediaFile[]
  idempotencyKey: string
}

export interface PublishPostResult {
  remotePostId: string
  remoteUrl: string | null
}
