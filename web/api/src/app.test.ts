import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { app } from './app.js'
import { decryptSecret, encryptSecret, generateApiKey, hashApiKey } from './utils/crypto.js'
import { normalizeInstanceOrigin } from './utils/url.js'

describe('Solilo API skeleton', () => {
  it('serves GET /apps/solilo/api/health', async () => {
    const res = await app.request('/apps/solilo/api/health')
    assert.equal(res.status, 200)
    const body = (await res.json()) as { status: string; basePath: string }
    assert.equal(body.status, 'ok')
    assert.equal(body.basePath, '/apps/solilo/api')
  })

  it('generates OpenAPI 3.1 spec with all subpath routes', async () => {
    const res = await app.request('/apps/solilo/api/openapi.json')
    assert.equal(res.status, 200)
    const spec = (await res.json()) as {
      openapi: string
      paths: Record<string, unknown>
    }
    assert.equal(spec.openapi, '3.1.0')
    assert.ok('/apps/solilo/api/health' in spec.paths)
    assert.ok('/apps/solilo/api/posts' in spec.paths)
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

  it('protects authenticated timeline endpoints with 401 when token is missing', async () => {
    const res = await app.request('/apps/solilo/api/posts')
    assert.equal(res.status, 401)
    const body = (await res.json()) as { error: { code: string } }
    assert.equal(body.error.code, 'UNAUTHORIZED')
  })

  it('protects public embed timeline endpoint with 401 when API key is missing', async () => {
    const res = await app.request('/apps/solilo/api/public/timeline')
    assert.equal(res.status, 401)
    const body = (await res.json()) as { error: { code: string } }
    assert.equal(body.error.code, 'MISSING_API_KEY')
  })

  it('encrypts and decrypts Fediverse tokens and hashes API keys', () => {
    const token = 'secret_mastodon_or_misskey_token_123'
    const cipher = encryptSecret(token)
    assert.notEqual(cipher, token)
    assert.equal(decryptSecret(cipher), token)

    const generated = generateApiKey()
    assert.ok(generated.rawKey.startsWith('slk_'))
    assert.equal(hashApiKey(generated.rawKey), generated.keyHash)
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
