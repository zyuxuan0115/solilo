import { isIP } from 'node:net'

function isPrivateOrReservedIp(host: string): boolean {
  const cleanHost = host.replace(/^\[|\]$/g, '')
  const version = isIP(cleanHost)
  if (version === 4) {
    const parts = cleanHost.split('.').map(Number)
    const [a = 0, b = 0] = parts
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  if (version === 6) {
    const lower = cleanHost.toLowerCase()
    if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true
    }
  }
  return false
}

/**
 * Normalizes user-entered Fediverse instance input (e.g. "mastodon.social" or "https://misskey.io/")
 * into a canonical HTTPS origin ("https://mastodon.social") and blocks local/private SSRF targets.
 */
export function normalizeInstanceOrigin(rawInput: string): { origin: string; host: string } {
  const trimmed = rawInput.trim()
  if (!trimmed) {
    throw new Error('Instance domain cannot be empty.')
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error(`Invalid instance URL: ${rawInput}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS Mastodon/Misskey instances are supported.')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    !hostname.includes('.') ||
    isPrivateOrReservedIp(hostname)
  ) {
    throw new Error('Private, local, or invalid instance hostnames are not permitted.')
  }

  return {
    origin: parsed.origin,
    host: parsed.host.toLowerCase(),
  }
}
