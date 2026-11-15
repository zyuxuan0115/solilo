import { env } from '../../config/env.js'
import type { FediverseVisibility } from '../../schemas/post.js'
import { getMastodonInstanceApp, saveMastodonInstanceApp } from '../firestore.js'
import type {
  OutboundMediaFile,
  PublishPostInput,
  PublishPostResult,
  VerifiedRemoteProfile,
} from './types.js'

const MASTODON_SCOPES = 'read:accounts write:statuses write:media'

export function getMastodonCallbackUrl(): string {
  return `${env.publicApiBaseUrl}/accounts/mastodon/callback`
}

export async function ensureMastodonOAuthApp(
  instanceOrigin: string,
  instanceHost: string,
): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
  const redirectUri = getMastodonCallbackUrl()
  const cached = await getMastodonInstanceApp(instanceHost, redirectUri, MASTODON_SCOPES)
  if (cached) {
    return { ...cached, redirectUri }
  }

  const response = await fetch(`${instanceOrigin}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Solilo',
      redirect_uris: redirectUri,
      scopes: MASTODON_SCOPES,
      website: env.PUBLIC_WEB_URL,
    }),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(
      `Failed to register OAuth app on ${instanceHost} (${response.status}): ${bodyText.slice(0, 200)}`,
    )
  }

  const data = (await response.json()) as { client_id?: string; client_secret?: string }
  if (!data.client_id || !data.client_secret) {
    throw new Error(`Mastodon instance ${instanceHost} did not return OAuth client credentials.`)
  }

  await saveMastodonInstanceApp({
    instanceOrigin,
    instanceHost,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    redirectUri,
    scopes: MASTODON_SCOPES,
  })

  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    redirectUri,
  }
}

export function buildMastodonAuthorizeUrl(params: {
  instanceOrigin: string
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL('/oauth/authorize', params.instanceOrigin)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', MASTODON_SCOPES)
  url.searchParams.set('state', params.state)
  return url.toString()
}

export async function exchangeMastodonCodeForAccount(params: {
  instanceOrigin: string
  instanceHost: string
  code: string
}): Promise<{ accessToken: string; profile: VerifiedRemoteProfile }> {
  const app = await ensureMastodonOAuthApp(params.instanceOrigin, params.instanceHost)

  const tokenRes = await fetch(`${params.instanceOrigin}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
      scope: MASTODON_SCOPES,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    throw new Error(`Mastodon token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`)
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string }
  if (!tokenData.access_token) {
    throw new Error('Mastodon token response did not contain access_token.')
  }

  const verifyRes = await fetch(`${params.instanceOrigin}/api/v1/accounts/verify_credentials`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
    },
  })

  if (!verifyRes.ok) {
    throw new Error(`Failed to verify Mastodon credentials (${verifyRes.status}).`)
  }

  const account = (await verifyRes.json()) as {
    id: string
    username: string
    display_name?: string
    avatar?: string
    url?: string
  }

  return {
    accessToken: tokenData.access_token,
    profile: {
      remoteAccountId: String(account.id),
      username: account.username,
      displayName: account.display_name || account.username,
      avatarUrl: account.avatar ?? null,
      profileUrl: account.url ?? null,
    },
  }
}

function mapToMastodonVisibility(
  visibility: FediverseVisibility,
): 'public' | 'unlisted' | 'private' {
  if (visibility === 'followers') return 'private'
  return visibility
}

async function waitForMastodonMediaProcessing(
  instanceOrigin: string,
  accessToken: string,
  mediaId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const poll = await fetch(
      `${instanceOrigin}/api/v1/media/${encodeURIComponent(mediaId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    )
    if (poll.status === 200) return
    if (poll.status !== 206) break
  }
}

async function uploadSingleMastodonMedia(
  instanceOrigin: string,
  accessToken: string,
  media: OutboundMediaFile,
): Promise<string> {
  const buildForm = () => {
    const form = new FormData()
    const blob = new Blob([new Uint8Array(media.buffer)], { type: media.mimeType })
    form.append('file', blob, media.filename)
    if (media.alt) {
      form.append('description', media.alt)
    }
    return form
  }

  let res = await fetch(`${instanceOrigin}/api/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    body: buildForm(),
  })

  // Fallback for older Mastodon-compatible servers that only implement /api/v1/media
  if (res.status === 404) {
    res = await fetch(`${instanceOrigin}/api/v1/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      body: buildForm(),
    })
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Mastodon media upload HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  const payload = (await res.json()) as { id?: string }
  if (!payload.id) {
    throw new Error('Mastodon media upload did not return an attachment id.')
  }

  if (res.status === 202) {
    await waitForMastodonMediaProcessing(instanceOrigin, accessToken, String(payload.id))
  }

  return String(payload.id)
}

export async function publishToMastodon(input: PublishPostInput): Promise<PublishPostResult> {
  const mediaIds: string[] = []
  for (const media of input.mediaFiles) {
    const id = await uploadSingleMastodonMedia(input.instanceOrigin, input.accessToken, media)
    mediaIds.push(id)
  }

  const response = await fetch(`${input.instanceOrigin}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      status: input.content,
      spoiler_text: input.contentWarning ?? undefined,
      visibility: mapToMastodonVisibility(input.visibility),
      media_ids: mediaIds.length > 0 ? mediaIds : undefined,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Mastodon HTTP ${response.status}: ${errText.slice(0, 200)}`)
  }

  const status = (await response.json()) as { id: string; url?: string; uri?: string }
  return {
    remotePostId: String(status.id),
    remoteUrl: status.url ?? status.uri ?? null,
  }
}
