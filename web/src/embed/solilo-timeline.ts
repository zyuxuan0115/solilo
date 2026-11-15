import type { PaginatedResponse, PostMedia, PublicPost } from '../types/solilo'

const WIDGET_CSS = `
  @layer base {
    :host {
      display: block;
      container-type: inline-size;
      color-scheme: inherit;

      /* Private shadow aliases reading unseeded public custom properties */
      --_fg: var(--solilo-fg, #22211e);
      --_muted: var(--solilo-muted, #6f6c65);
      --_surface: var(--solilo-surface, transparent);
      --_border: var(--solilo-border, rgba(125, 120, 110, 0.22));
      --_accent: var(--solilo-accent, #5b6f5c);
      --_radius: var(--solilo-radius, 12px);

      color: var(--_fg);
      background: var(--_surface);
      line-height: 1.65;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --_fg: var(--solilo-fg, #ebe8e1);
        --_muted: var(--solilo-muted, #9b978e);
        --_border: var(--solilo-border, rgba(210, 205, 195, 0.16));
        --_accent: var(--solilo-accent, #93b094);
      }
    }

    @supports (color: light-dark(white, black)) {
      :host {
        --_fg: var(--solilo-fg, light-dark(#22211e, #ebe8e1));
        --_muted: var(--solilo-muted, light-dark(#6f6c65, #9b978e));
        --_border: var(--solilo-border, light-dark(rgba(125, 120, 110, 0.22), rgba(210, 205, 195, 0.16)));
        --_accent: var(--solilo-accent, light-dark(#5b6f5c, #93b094));
      }
    }

    .status-msg {
      margin: 0;
      padding: 1rem 0;
      font-size: 0.925rem;
      color: var(--_muted);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .item {
      padding: 1rem 0;
      border-block-end: 1px solid var(--_border);
      display: grid;
      gap: 0.45rem;
    }

    .item:first-child {
      padding-block-start: 0.25rem;
    }

    @container (min-width: 34rem) {
      .item {
        grid-template-columns: 9.5rem minmax(0, 1fr);
        align-items: baseline;
        gap: 1.25rem;
      }
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
      color: var(--_muted);
    }

    .body {
      min-inline-size: 0;
    }

    .content {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.975rem;
    }

    .media-grid {
      display: grid;
      gap: 0.4rem;
      margin-block-start: 0.55rem;
      border-radius: calc(var(--_radius) * 0.85);
      overflow: hidden;
    }

    .content + .media-grid {
      margin-block-start: 0.65rem;
    }

    .media-grid.count-1 {
      grid-template-columns: minmax(0, 1fr);
    }

    .media-grid.count-2,
    .media-grid.count-3,
    .media-grid.count-4 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .media-cell {
      position: relative;
      display: block;
      overflow: hidden;
      background: rgba(125, 120, 110, 0.1);
      aspect-ratio: 16 / 10;
    }

    .media-grid.count-1 .media-cell {
      aspect-ratio: auto;
      max-block-size: 22rem;
    }

    .media-grid.count-3 .media-cell:first-child {
      grid-row: span 2;
      aspect-ratio: auto;
      height: 100%;
    }

    .media-img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .media-grid.count-1 .media-img {
      max-block-size: 22rem;
      object-fit: cover;
    }

    details.cw {
      border: 1px dashed var(--_border);
      border-radius: calc(var(--_radius) * 0.65);
      padding: 0.5rem 0.75rem;
    }

    details.cw > summary {
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--_muted);
      font-weight: 500;
    }

    details.cw[open] > summary {
      margin-block-end: 0.5rem;
    }

    .syndications {
      margin-block-start: 0.45rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.78rem;
    }

    .syndications a {
      color: var(--_accent);
      text-decoration: none;
      border-block-end: 1px solid transparent;
    }

    .syndications a:hover,
    .syndications a:focus-visible {
      border-block-end-color: currentColor;
    }

    .footer {
      margin-block-start: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    button.action-btn {
      /* Native buttons inside Shadow DOM do not inherit font/color by default */
      font: inherit;
      color: inherit;
      font-size: 0.85rem;
      background: transparent;
      border: 1px solid var(--_border);
      border-radius: 999px;
      padding: 0.45rem 1rem;
      min-block-size: 40px;
      cursor: pointer;
    }

    button.action-btn:hover {
      border-color: var(--_accent);
      color: var(--_accent);
    }

    button.action-btn:focus-visible {
      outline: 2px solid var(--_accent);
      outline-offset: 2px;
    }

    :host(:state(busy)) button.action-btn {
      opacity: 0.6;
      pointer-events: none;
    }
  }
`

const widgetTemplate = document.createElement('template')
widgetTemplate.innerHTML = `
  <div class="root" part="container">
    <p class="status-msg" hidden></p>
    <ol class="list" part="list"></ol>
    <div class="footer" hidden>
      <button type="button" class="action-btn" part="load-more">加载更多</button>
    </div>
  </div>
`

let sharedSheet: CSSStyleSheet | null = null
if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
  sharedSheet = new CSSStyleSheet()
  sharedSheet.replaceSync(WIDGET_CSS)
}

function formatEmbedTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isSafeMediaUrl(raw: string): boolean {
  if (isSafeHttpUrl(raw)) return true
  return /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw)
}

function buildMediaGridElement(mediaItems: PostMedia[], insideCollapsedCw: boolean): HTMLDivElement | null {
  const valid = mediaItems.filter((item) => isSafeMediaUrl(item.url)).slice(0, 4)
  if (valid.length === 0) return null

  const grid = document.createElement('div')
  grid.className = `media-grid count-${valid.length}`
  grid.setAttribute('part', 'media-grid')

  for (const media of valid) {
    const img = document.createElement('img')
    img.className = 'media-img'
    img.setAttribute('part', 'media-img')
    img.src = media.url
    img.alt = media.alt ?? ''
    img.loading = 'lazy'
    if (insideCollapsedCw) {
      img.fetchPriority = 'low'
    }

    if (isSafeHttpUrl(media.url)) {
      const link = document.createElement('a')
      link.className = 'media-cell'
      link.href = media.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      if (media.alt) link.title = media.alt
      link.append(img)
      grid.append(link)
    } else {
      const span = document.createElement('span')
      span.className = 'media-cell'
      span.append(img)
      grid.append(span)
    }
  }

  return grid
}

export class SoliloTimelineElement extends HTMLElement {
  static observedAttributes = ['api-url', 'api-key', 'limit'] as const

  #internals: ElementInternals | null = null
  #abortController: AbortController | null = null
  #items: PublicPost[] = []
  #previewItems: PublicPost[] | null = null
  #nextCursor: string | null = null

  #statusEl!: HTMLParagraphElement
  #listEl!: HTMLOListElement
  #footerEl!: HTMLDivElement
  #loadMoreBtn!: HTMLButtonElement

  constructor() {
    super()
    if (typeof this.attachInternals === 'function') {
      this.#internals = this.attachInternals()
    }
    const shadow = this.attachShadow({ mode: 'open' })
    if (sharedSheet && 'adoptedStyleSheets' in shadow) {
      shadow.adoptedStyleSheets = [sharedSheet]
    } else {
      const style = document.createElement('style')
      style.textContent = WIDGET_CSS
      shadow.append(style)
    }
    shadow.append(widgetTemplate.content.cloneNode(true))

    this.#statusEl = shadow.querySelector('.status-msg') as HTMLParagraphElement
    this.#listEl = shadow.querySelector('.list') as HTMLOListElement
    this.#footerEl = shadow.querySelector('.footer') as HTMLDivElement
    this.#loadMoreBtn = shadow.querySelector('.action-btn') as HTMLButtonElement

    this.#loadMoreBtn.addEventListener('click', () => {
      if (this.#nextCursor) {
        void this.#fetchPage(this.#nextCursor, true)
      }
    })
  }

  get apiUrl(): string {
    return this.getAttribute('api-url') ?? ''
  }
  set apiUrl(value: string) {
    if (value) this.setAttribute('api-url', value)
    else this.removeAttribute('api-url')
  }

  get apiKey(): string {
    return this.getAttribute('api-key') ?? ''
  }
  set apiKey(value: string) {
    if (value) this.setAttribute('api-key', value)
    else this.removeAttribute('api-key')
  }

  get limit(): number {
    const parsed = Number(this.getAttribute('limit'))
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.trunc(parsed), 100) : 10
  }
  set limit(value: number) {
    this.setAttribute('limit', String(Math.max(1, Math.min(Math.trunc(value) || 10, 100))))
  }

  get previewItems(): PublicPost[] | null {
    return this.#previewItems
  }
  set previewItems(items: PublicPost[] | null) {
    this.#previewItems = items
    if (this.isConnected) {
      this.refresh()
    }
  }

  connectedCallback(): void {
    this.refresh()
  }

  disconnectedCallback(): void {
    this.#abortController?.abort()
    this.#abortController = null
  }

  attributeChangedCallback(_name: string, oldVal: string | null, newVal: string | null): void {
    if (oldVal === newVal) return
    if (this.isConnected && this.#previewItems === null) {
      this.refresh()
    }
  }

  refresh(): void {
    if (this.#previewItems !== null) {
      this.#items = [...this.#previewItems].slice(0, this.limit)
      this.#nextCursor = null
      this.#setCustomState('busy', false)
      this.#setCustomState('error', false)
      this.#setCustomState('empty', this.#items.length === 0)
      this.#render()
      return
    }

    if (!this.apiUrl || !this.apiKey) {
      this.#items = []
      this.#nextCursor = null
      this.#showStatus('请配置 api-url 与 api-key 属性以加载时间线。')
      return
    }

    void this.#fetchPage(undefined, false)
  }

  #setCustomState(state: string, active: boolean): void {
    const states = this.#internals?.states
    if (!states) return
    if (active) states.add(state)
    else states.delete(state)
  }

  #showStatus(text: string | null): void {
    if (text) {
      this.#statusEl.textContent = text
      this.#statusEl.hidden = false
    } else {
      this.#statusEl.textContent = ''
      this.#statusEl.hidden = true
    }
  }

  async #fetchPage(cursor: string | undefined, append: boolean): Promise<void> {
    this.#abortController?.abort()
    const controller = new AbortController()
    this.#abortController = controller

    this.#setCustomState('busy', true)
    this.#setCustomState('error', false)
    if (!append && this.#items.length === 0) {
      this.#showStatus('正在载入时间线…')
    }

    try {
      const base = this.apiUrl.replace(/\/+$/, '')
      const url = new URL(`${base}/public/timeline`, window.location.origin)
      url.searchParams.set('limit', String(this.limit))
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Solilo-Key': this.apiKey,
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = (await res.json()) as PaginatedResponse<PublicPost>
      this.#items = append ? [...this.#items, ...data.items] : data.items
      this.#nextCursor = data.nextCursor
      this.#setCustomState('empty', this.#items.length === 0)
      this.#render()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      this.#setCustomState('error', true)
      this.#showStatus('暂时无法加载时间线记录。')
    } finally {
      if (this.#abortController === controller) {
        this.#setCustomState('busy', false)
      }
    }
  }

  #render(): void {
    this.#listEl.replaceChildren()

    if (this.#items.length === 0) {
      this.#showStatus('还没有公开的喃喃自语。')
      this.#footerEl.hidden = true
      return
    }

    this.#showStatus(null)

    const fragment = document.createDocumentFragment()
    for (const post of this.#items) {
      const li = document.createElement('li')
      li.className = 'item'
      li.setAttribute('part', 'item')

      const meta = document.createElement('div')
      meta.className = 'meta'
      meta.setAttribute('part', 'meta')
      const timeEl = document.createElement('time')
      timeEl.dateTime = post.createdAt
      timeEl.textContent = formatEmbedTimestamp(post.createdAt)
      meta.append(timeEl)

      const body = document.createElement('div')
      body.className = 'body'

      const hasContent = Boolean(post.content && post.content.length > 0)
      const contentP = hasContent ? document.createElement('p') : null
      if (contentP) {
        contentP.className = 'content'
        contentP.setAttribute('part', 'content')
        contentP.textContent = post.content
      }

      const mediaGrid = buildMediaGridElement(post.media ?? [], Boolean(post.contentWarning))

      if (post.contentWarning) {
        const details = document.createElement('details')
        details.className = 'cw'
        const summary = document.createElement('summary')
        summary.textContent = post.contentWarning
        details.append(summary)
        if (contentP) details.append(contentP)
        if (mediaGrid) details.append(mediaGrid)
        body.append(details)
      } else {
        if (contentP) body.append(contentP)
        if (mediaGrid) body.append(mediaGrid)
      }

      if (post.syndications.length > 0) {
        const synWrap = document.createElement('div')
        synWrap.className = 'syndications'
        for (const syn of post.syndications) {
          if (!isSafeHttpUrl(syn.url)) continue
          const link = document.createElement('a')
          link.href = syn.url
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.textContent = `${syn.platform === 'mastodon' ? 'Mastodon' : 'Misskey'} · ${syn.acct}`
          synWrap.append(link)
        }
        if (synWrap.childElementCount > 0) {
          body.append(synWrap)
        }
      }

      li.append(meta, body)
      fragment.append(li)
    }

    this.#listEl.append(fragment)
    this.#footerEl.hidden = !this.#nextCursor
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('solilo-timeline')) {
  customElements.define('solilo-timeline', SoliloTimelineElement)
}
