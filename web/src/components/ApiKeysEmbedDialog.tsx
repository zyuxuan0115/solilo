import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { SoliloTimelineElement } from '../embed/solilo-timeline'
import { toPublicPosts } from '../lib/api'
import { webEnv } from '../lib/env'
import { type ThemeChoice } from '../lib/theme'
import type { ApiKeyMetadata, CreatedApiKey, Post } from '../types/solilo'
import { ModalDialog } from './ModalDialog'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'solilo-timeline': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        'api-url'?: string
        'api-key'?: string
        limit?: string | number
      }
    }
  }
}

interface ApiKeysEmbedDialogProps {
  open: boolean
  posts: Post[]
  apiKeys: ApiKeyMetadata[]
  themeChoice: ThemeChoice
  onChangeTheme: (choice: ThemeChoice) => void
  onClose: () => void
  onCreateKey: (input: { label: string; allowedOrigins: string[] }) => Promise<CreatedApiKey>
  onRevokeKey: (id: string) => Promise<void>
}

export function ApiKeysEmbedDialog({
  open,
  posts,
  apiKeys,
  themeChoice,
  onChangeTheme,
  onClose,
  onCreateKey,
  onRevokeKey,
}: ApiKeysEmbedDialogProps) {
  const [label, setLabel] = useState('kate0115.cc 个人网站嵌入')
  const [originsText, setOriginsText] = useState('https://kate0115.cc')
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<CreatedApiKey | null>(null)
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previewRef = useRef<HTMLElement | null>(null)
  const labelInputId = useId()
  const originsInputId = useId()
  const originsHintId = useId()
  const themeSysId = useId()
  const themeLightId = useId()
  const themeDarkId = useId()

  useEffect(() => {
    const el = previewRef.current as SoliloTimelineElement | null
    if (!el) return
    el.previewItems = toPublicPosts(posts)
  }, [posts, open])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!label.trim()) return

    setError(null)
    setCreating(true)
    try {
      const origins = originsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const created = await onCreateKey({
        label: label.trim(),
        allowedOrigins: origins,
      })
      setFreshKey(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成 API Key 失败。')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)
    setError(null)
    try {
      await onRevokeKey(id)
      if (freshKey?.id === id) {
        setFreshKey(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '吊销失败。')
    } finally {
      setRevokingId(null)
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(key)
      window.setTimeout(() => {
        setCopiedTarget((curr) => (curr === key ? null : curr))
      }, 2000)
    } catch {
      // Clipboard API unavailable
    }
  }

  const displayKey = freshKey?.rawKey ?? 'slk_替换为你的只读密钥'
  const publicBase = `${webEnv.publicOrigin}/apps/solilo`
  const embedSnippet = `<script type="module" src="${publicBase}/embed.js"></script>
<solilo-timeline
  api-url="${publicBase}/api"
  api-key="${displayKey}"
  limit="10"
></solilo-timeline>`

  const restSnippet = `curl "${publicBase}/api/public/timeline?limit=10" \\
  -H "X-Solilo-Key: ${displayKey}"`

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="API Key、网站嵌入与外观设置"
      subtitle="管理只读 API Key，将公开的过往记录嵌入个人博客，或调整当前设备界面主题。"
      maxWidth="44rem"
    >
      <section className="dialog-section">
        <h3 className="section-heading">1. 只读 API Key 管理</h3>
        <form method="post" onSubmit={handleCreate} className="api-key-form">
          <div className="two-col-fields">
            <div className="field-group compact">
              <label htmlFor={labelInputId}>
                用途备注 <span aria-hidden="true">*</span>
              </label>
              <input
                id={labelInputId}
                name="label"
                type="text"
                required
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：kate0115.cc 首页"
              />
            </div>

            <div className="field-group compact">
              <label htmlFor={originsInputId}>允许跨域调用的网站（可选）</label>
              <input
                id={originsInputId}
                name="allowedOrigins"
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={originsHintId}
                value={originsText}
                onChange={(e) => setOriginsText(e.target.value)}
                placeholder="https://kate0115.cc"
              />
              <span id={originsHintId} className="field-hint">
                多个域名用逗号分隔；留空则允许任意来源。
              </span>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
              {creating ? '生成中…' : '＋ 生成只读 API Key'}
            </button>
          </div>
        </form>

        {freshKey ? (
          <div className="fresh-key-box" role="status" aria-live="polite">
            <div className="fresh-key-header">
              <strong>新密钥已生成（仅完整显示这一次，请立即保存）：</strong>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void copyText('rawKey', freshKey.rawKey)}
              >
                {copiedTarget === 'rawKey' ? '已复制 ✓' : '复制密钥'}
              </button>
            </div>
            <code className="fresh-key-code">{freshKey.rawKey}</code>
          </div>
        ) : null}

        {apiKeys.length > 0 ? (
          <ul className="connected-account-list">
            {apiKeys.map((item) => (
              <li key={item.id} className="connected-account-item">
                <div>
                  <div className="account-acct">
                    {item.label} <code className="key-prefix">{item.prefix}…</code>
                  </div>
                  <div className="field-hint">
                    允许来源：
                    {item.allowedOrigins.length > 0 ? item.allowedOrigins.join(', ') : '不限'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={revokingId === item.id}
                  onClick={() => void handleRevoke(item.id)}
                >
                  {revokingId === item.id ? '吊销中…' : '吊销'}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="dialog-section">
        <div className="snippet-header">
          <h3 className="section-heading">2. 嵌入个人网站（Web Component）</h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void copyText('embed', embedSnippet)}
          >
            {copiedTarget === 'embed' ? '已复制代码 ✓' : '复制 HTML 代码'}
          </button>
        </div>
        <p className="field-hint">
          原生 Shadow DOM 封装，不会污染你博客的现有 CSS，同时自动继承字体与深浅色变量：
        </p>
        <pre className="code-block">
          <code>{embedSnippet}</code>
        </pre>

        <div className="snippet-header">
          <span className="field-hint">或者直接通过 Web API 拉取 JSON 数据：</span>
          <button
            type="button"
            className="text-link-btn"
            onClick={() => void copyText('rest', restSnippet)}
          >
            {copiedTarget === 'rest' ? '已复制 ✓' : '复制 curl 示例'}
          </button>
        </div>
        <pre className="code-block compact">
          <code>{restSnippet}</code>
        </pre>
      </section>

      <section className="dialog-section">
        <h3 className="section-heading">3. 嵌入组件实时预览（仅展示「公开」状态记录）</h3>
        <div className="widget-preview-frame">
          <solilo-timeline ref={previewRef} limit="5" />
        </div>
      </section>

      <section className="dialog-section">
        <h3 className="section-heading">4. 界面主题偏好</h3>
        <fieldset className="inline-fieldset">
          <legend className="visually-hidden">选择界面浅色或深色模式</legend>
          <div className="radio-pill-group">
            <span className="radio-pill">
              <input
                type="radio"
                id={themeSysId}
                name="solilo-theme"
                value="system"
                checked={themeChoice === 'system'}
                onChange={() => onChangeTheme('system')}
              />
              <label htmlFor={themeSysId}>跟随系统</label>
            </span>
            <span className="radio-pill">
              <input
                type="radio"
                id={themeLightId}
                name="solilo-theme"
                value="light"
                checked={themeChoice === 'light'}
                onChange={() => onChangeTheme('light')}
              />
              <label htmlFor={themeLightId}>浅色纸张</label>
            </span>
            <span className="radio-pill">
              <input
                type="radio"
                id={themeDarkId}
                name="solilo-theme"
                value="dark"
                checked={themeChoice === 'dark'}
                onChange={() => onChangeTheme('dark')}
              />
              <label htmlFor={themeDarkId}>深色静夜</label>
            </span>
          </div>
        </fieldset>
      </section>
    </ModalDialog>
  )
}
