# Solilo Web (`web/`)

React + Vite + TypeScript web client and standalone `<solilo-timeline>` Web Component widget for Solilo, configured for subpath deployment at https://kate0115.cc/apps/solilo.

## Quick Start

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173/apps/solilo/ in your browser.
- Even before filling in `VITE_FIREBASE_*` in `web/.env`, you can click **进入本地预览模式** to explore the solo timeline composer, Mastodon/Misskey multi-account connection dialog, API key manager, and live `<solilo-timeline>` widget preview.
- In development, Vite automatically proxies `/apps/solilo/api/*` to `http://localhost:8787`.

## Production Build & Website Embed Widget

```bash
npm run build
```

Builds into `web/dist/`:
- `dist/index.html` + `dist/assets/*`: Solilo Web App (`base: '/apps/solilo/'`)
- `dist/embed.js`: Zero-dependency `<solilo-timeline>` Shadow DOM Custom Element

### Embedding on Your Personal Website

```html
<script type="module" src="https://kate0115.cc/apps/solilo/embed.js"></script>
<solilo-timeline
  api-url="https://kate0115.cc/apps/solilo/api"
  api-key="slk_your_readonly_key"
  limit="10"
></solilo-timeline>
```

Optional CSS theming hooks (automatically inherits page font and light/dark scheme by default):
- Custom properties: `--solilo-fg`, `--solilo-muted`, `--solilo-surface`, `--solilo-border`, `--solilo-accent`, `--solilo-radius`
- Shadow parts: `::part(container)`, `::part(list)`, `::part(item)`, `::part(content)`, `::part(meta)`, `::part(load-more)`
