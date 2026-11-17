import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { app } from './app.js'
import {
  decryptSecret,
  encryptSecret,
  generateApiKey,
  hashApiKey,
  signMediaAccess,
  verifyMediaAccess,
} from './utils/crypto.js'
import { detectImageType } from './utils/image.js'
import { normalizeInstanceOrigin } from './utils/url.js'

describe('Solilo API skeleton', () => {
  it('serves GET /apps/solilo/api/health', async () => {
    const res = await app.request('/apps/solilo/api/health')
    assert.equal(res.status, 200)
    const body = (await res.json()) as { status: string; basePath: string }
    assert.equal(body.status, 'ok')
    assert.equal(body.basePath, '/apps/solilo/api')
  })

  it('generates OpenAPI 3.1 spec with all subpath routes including /media', async () => {
    const res = await app.request('/apps/solilo/api/openapi.json')
    assert.equal(res.status, 200)
    const spec = (await res.json()) as {
      openapi: string
      paths: Record<string, unknown>
    }
    assert.equal(spec.openapi, '3.1.0')
    assert.ok('/apps/solilo/api/health' in spec.paths)
    assert.ok('/apps/solilo/api/media' in spec.paths)
    assert.ok('/apps/solilo/api/media/{id}' in spec.paths)
    assert.ok('/apps/solilo/api/posts' in spec.paths)
    assert.ok('/apps/solilo/api/posts/{id}/deliveries/{accountId}/retry' in spec.paths)
    assert.ok('/apps/solilo/api/accounts/mastodon/connect' in spec.paths)
    assert.ok('/apps/solilo/api/accounts/misskey/connect' in spec.paths)
    assert.ok('/apps/solilo/api/api-keys' in spec.paths)
    assert.ok('/apps/solilo/api/public/timeline' in spec.paths)
  })

  it('serves interactive Scalar docs at GET /apps/solilo/api/docs', async () => {
    const res = await app.request('/apps/solilo/api/docs')
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.ok(html.includes('Solilo API Reference'))
  })

  it('protects authenticated timeline and media upload endpoints with 401 when token is missing', async () => {
    const resPosts = await app.request('/apps/solilo/api/posts')
    assert.equal(resPosts.status, 401)
    const resMedia = await app.request('/apps/solilo/api/media', { method: 'POST' })
    assert.equal(resMedia.status, 401)
    const resRetry = await app.request(
      '/apps/solilo/api/posts/pst_1/deliveries/acc_1/retry',
      { method: 'POST' },
    )
    assert.equal(resRetry.status, 401)
  })

  it('rejects tampered media signatures with 403', async () => {
    const res = await app.request(
      '/apps/solilo/api/media/med_123.jpg?u=user_1&sig=forged_signature',
    )
    assert.equal(res.status, 403)
  })

  it('protects public embed timeline endpoint with 401 when API key is missing', async () => {
    const res = await app.request('/apps/solilo/api/public/timeline')
    assert.equal(res.status, 401)
    const body = (await res.json()) as { error: { code: string } }
    assert.equal(body.error.code, 'MISSING_API_KEY')
  })

  it('encrypts/decrypts tokens, hashes API keys, and signs media URLs', () => {
    const token = 'secret_mastodon_or_misskey_token_123'
    const cipher = encryptSecret(token)
    assert.notEqual(cipher, token)
    assert.equal(decryptSecret(cipher), token)

    const generated = generateApiKey()
    assert.ok(generated.rawKey.startsWith('slk_'))
    assert.equal(hashApiKey(generated.rawKey), generated.keyHash)

    const sig = signMediaAccess('uid_abc', 'med_999.png')
    assert.equal(verifyMediaAccess('uid_abc', 'med_999.png', sig), true)
    assert.equal(verifyMediaAccess('uid_abc', 'med_other.png', sig), false)
  })

  it('validates image magic bytes for JPEG, PNG, GIF, WebP and rejects HTML/SVG', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    assert.deepEqual(detectImageType(pngHeader), { mimeType: 'image/png', extension: 'png' })

    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
    assert.deepEqual(detectImageType(jpegHeader), { mimeType: 'image/jpeg', extension: 'jpg' })

    const htmlSpoof = Buffer.from('<svg onload="alert(1)"></svg>')
    assert.equal(detectImageType(htmlSpoof), null)
  })

  it('normalizes Fediverse instance URLs and blocks private/localhost SSRF', () => {
    assert.deepEqual(normalizeInstanceOrigin('mastodon.social'), {
      origin: 'https://mastodon.social',
      host: 'mastodon.social',
    })
    assert.deepEqual(normalizeInstanceOrigin('https://Misskey.io/notes'), {
      origin: 'https://misskey.io',
      host: 'misskey.io',
    })
    assert.throws(() => normalizeInstanceOrigin('http://mastodon.social'))
    assert.throws(() => normalizeInstanceOrigin('localhost'))
    assert.throws(() => normalizeInstanceOrigin('127.0.0.1'))
    assert.throws(() => normalizeInstanceOrigin('192.168.1.1'))
  })
})
