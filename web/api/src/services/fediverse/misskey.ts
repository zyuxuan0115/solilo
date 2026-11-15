import { env } from '../../config/env.js'
import type { FediverseVisibility } from '../../schemas/post.js'
import type {
  OutboundMediaFile,
  PublishPostInput,
  PublishPostResult,
  VerifiedRemoteProfile,
} from './types.js'

const MISSKEY_PERMISSIONS = 'read:account,write:notes,write:drive'

export function getMisskeyCallbackUrl(): string {
  return `${env.publicApiBaseUrl}/accounts/misskey/callback`
}

export function buildMisskeyMiAuthUrl(params: {
  instanceOrigin: string
  sessionId: string
}): string {
  const url = new URL(`/miauth/${encodeURIComponent(params.sessionId)}`, params.instanceOrigin)
  url.searchParams.set('name', 'Solilo')
  url.searchParams.set('callback', getMisskeyCallbackUrl())
  url.searchParams.set('permission', MISSKEY_PERMISSIONS)
  return url.toString()
}

export async function checkMisskeyMiAuthSession(params: {
  instanceOrigin: string
  sessionId: string
}): Promise<{ accessToken: string; profile: VerifiedRemoteProfile }> {
  const response = await fetch(
    `${params.instanceOrigin}/api/miauth/${encodeURIComponent(params.sessionId)}/check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Misskey MiAuth check failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    ok?: boolean
    token?: string
    user?: {
      id: string
      username: string
      name?: string | null
      avatarUrl?: string | null
    }
  }

  if (!data.ok || !data.token || !data.user) {
    throw new Error('Misskey authorization was not approved or session expired.')
  }

  return {
    accessToken: data.token,
    profile: {
      remoteAccountId: String(data.user.id),
      username: data.user.username,
      displayName: data.user.name || data.user.username,
      avatarUrl: data.user.avatarUrl ?? null,
      profileUrl: `${params.instanceOrigin}/@${encodeURIComponent(data.user.username)}`,
    },
  }
}

function mapToMisskeyVisibility(
  visibility: FediverseVisibility,
): 'public' | 'home' | 'followers' {
  if (visibility === 'unlisted') return 'home'
  return visibility
}

async function uploadSingleMisskeyDriveFile(
  instanceOrigin: string,
  accessToken: string,
  media: OutboundMediaFile,
): Promise<string> {
  const form = new FormData()
  form.append('i', accessToken)
  form.append('name', media.filename)
  if (media.alt) {
    form.append('comment', media.alt)
  }
  const blob = new Blob([new Uint8Array(media.buffer)], { type: media.mimeType })
  form.append('file', blob, media.filename)

  const res = await fetch(`${instanceOrigin}/api/drive/files/create`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Misskey Drive upload HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  const payload = (await res.json()) as { id?: string }
  if (!payload.id) {
    throw new Error('Misskey Drive did not return file.id.')
  }
  return String(payload.id)
}

export async function publishToMisskey(input: PublishPostInput): Promise<PublishPostResult> {
  const fileIds: string[] = []
  for (const media of input.mediaFiles) {
    const fileId = await uploadSingleMisskeyDriveFile(
      input.instanceOrigin,
      input.accessToken,
      media,
    )
    fileIds.push(fileId)
  }

  const trimmedText = input.content.trim()

  const response = await fetch(`${input.instanceOrigin}/api/notes/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      i: input.accessToken,
      text: trimmedText.length > 0 ? input.content : null,
      cw: input.contentWarning || null,
      visibility: mapToMisskeyVisibility(input.visibility),
      fileIds: fileIds.length > 0 ? fileIds : undefined,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Misskey HTTP ${response.status}: ${errText.slice(0, 200)}`)
  }

  const payload = (await response.json()) as { createdNote?: { id: string } }
  const noteId = payload.createdNote?.id
  if (!noteId) {
    throw new Error('Misskey did not return createdNote.id.')
  }

  return {
    remotePostId: noteId,
    remoteUrl: `${input.instanceOrigin}/notes/${encodeURIComponent(noteId)}`,
  }
}
