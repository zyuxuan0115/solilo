# Solilo Backend API (`web/api`)

TypeScript + **Hono** + **Zod OpenAPI** + **Firebase Admin (Auth & Cloud Firestore)** backend for Solilo.

## Features Included

- **Subpath-ready routing**: Defaults to `BASE_PATH=/apps/solilo/api` so it works identically in local development and behind https://kate0115.cc/apps/solilo/api.
- **Interactive OpenAPI 3.1 Docs**:
  - Scalar UI: `http://localhost:8787/apps/solilo/api/docs`
  - OpenAPI JSON: `http://localhost:8787/apps/solilo/api/openapi.json`
- **Unified Multi-Platform Endpoints** (Web, iOS, Android):
  - `GET /posts`, `POST /posts`, `PATCH /posts/:id`, `DELETE /posts/:id`
- **Dynamic Multi-Instance Fediverse Integration**:
  - **Mastodon**: Per-instance dynamic OAuth 2.0 app registration (`/api/v1/apps`), authorization, token encryption (`AES-256-GCM`), and parallel publishing (`/api/v1/statuses`).
  - **Misskey**: Per-instance MiAuth flow, token encryption (`AES-256-GCM`), and parallel note publishing (`/api/notes/create`).
- **Website Embed & External Read API**:
  - `POST /api-keys` generates read-only keys (`slk_...`, stored as SHA-256 hashes) with optional `allowedOrigins` lock.
  - `GET /public/timeline` serves public updates with an in-memory TTL cache (automatically invalidated on post updates) so blog traffic consumes near-zero Firestore reads.

## Quick Start

```bash
cd web/api
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:8787/apps/solilo/api/docs` to explore and test all endpoints interactively.

## Connecting Firebase

1. In the Firebase Console, enable **Authentication** (e.g. Email/Password, Google, Apple) and create a **Cloud Firestore** database.
2. Go to **Project Settings → Service accounts → Generate new private key**.
3. Either set `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json` in `web/api/.env`, or copy `project_id`, `client_email`, and `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
4. Deploy root [firestore.rules](../../firestore.rules) and [firestore.indexes.json](../../firestore.indexes.json) to lock down direct client database access and create the public timeline index.
