import { serve } from '@hono/node-server'
import { app } from './app.js'
import { env } from './config/env.js'
import { isFirebaseConfigured } from './config/firebase.js'

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    const origin = `http://localhost:${info.port}`
    const apiBase = `${origin}${env.BASE_PATH}`
    console.log(`[solilo-api] Listening on ${apiBase}`)
    console.log(`[solilo-api] Interactive OpenAPI docs: ${apiBase}/docs`)
    console.log(`[solilo-api] OpenAPI 3.1 spec:         ${apiBase}/openapi.json`)
    if (!isFirebaseConfigured()) {
      console.warn(
        '[solilo-api] Note: Firebase credentials are not configured yet. Copy .env.example to .env and set your Service Account credentials to enable Auth & Firestore.',
      )
    }
  },
)
