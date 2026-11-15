import {
  useId,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type {
  ConnectedAccount,
  CreatePostInput,
  FediverseVisibility,
  SoliloVisibility,
} from '../types/solilo'

interface ComposerProps {
  accounts: ConnectedAccount[]
  onPublish: (input: CreatePostInput) => Promise<void>
  onOpenAccounts: () => void
}

export function Composer({ accounts, onPublish, onOpenAccounts }: ComposerProps) {
  const [content, setContent] = useState('')
  const [showCw, setShowCw] = useState(false)
  const [contentWarning, setContentWarning] = useState('')
  const [visibility, setVisibility] = useState<SoliloVisibility>('public')
  const [fediverseVisibility, setFediverseVisibility] = useState<FediverseVisibility>('public')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [enterToSubmit, setEnterToSubmit] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastCompositionEndAtRef = useRef<number | null>(null)

  const formHeadingId = useId()
  const contentId = useId()
  const cwId = useId()
  const enterModeId = useId()

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    lastCompositionEndAtRef.current = event.timeStamp
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd+Enter / Ctrl+Enter always submits cleanly without conflicting with IME
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      formRef.current?.requestSubmit()
      return
    }

    if (enterToSubmit && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      // Guard IME composition across Chromium, Firefox, and Safari (WebKit bug 165004)
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return
      }
      if (
        lastCompositionEndAtRef.current !== null &&
        Math.abs(event.timeStamp - lastCompositionEndAtRef.current) < 50
      ) {
        return
      }

      formRef.current?.requestSubmit()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) {
      textareaRef.current?.focus()
      return
    }

    setError(null)
    setPublishing(true)
    try {
      const validIds = selectedAccountIds.filter((id) => accounts.some((acc) => acc.id === id))
      await onPublish({
        content: trimmed,
        contentWarning: showCw && contentWarning.trim() ? contentWarning.trim() : null,
        visibility,
        fediverseVisibility,
        accountIds: validIds,
      })
      setContent('')
      setContentWarning('')
      setShowCw(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试。')
    } finally {
      setPublishing(false)
    }
  }

  const activeSelectedCount = selectedAccountIds.filter((id) =>
    accounts.some((acc) => acc.id === id),
  ).length

  return (
    <section className="composer-card" aria-labelledby={formHeadingId}>
      <form ref={formRef} method="post" action="/apps/solilo/api/posts" onSubmit={handleSubmit}>
        <div className="composer-top-row">
          <label htmlFor={contentId} id={formHeadingId} className="composer-label">
            写下此刻的喃喃自语
          </label>
          <button
            type="button"
            className="chip-toggle-btn"
            aria-expanded={showCw}
            aria-controls={cwId}
            onClick={() => setShowCw((prev) => !prev)}
          >
            {showCw ? '移除折叠提示 (CW)' : '＋ 折叠提示 (CW)'}
          </button>
        </div>

        {showCw ? (
          <div className="cw-field-wrap">
            <label htmlFor={cwId} className="visually-hidden">
              内容折叠提示（CW）
            </label>
            <input
              id={cwId}
              name="contentWarning"
              type="text"
              maxLength={500}
              value={contentWarning}
              onChange={(e) => setContentWarning(e.target.value)}
              placeholder="折叠摘要（例如：剧透 / 深夜碎碎念）"
              className="cw-input"
            />
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          id={contentId}
          name="content"
          required
          maxLength={5000}
          value={content}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            setContent(e.target.value)
            if (error) setError(null)
          }}
          placeholder="今天想对自己记下什么？不勾选外部账号时，它只安静留在你的 Solilo 时间线里…"
          className="composer-textarea"
        />

        <div className="composer-controls">
          <fieldset className="inline-fieldset">
            <legend>Solilo 留存状态</legend>
            <div className="radio-pill-group">
              <span className="radio-pill">
                <input
                  type="radio"
                  id="vis-public"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                <label htmlFor="vis-public">公开（允许网站 API 调取）</label>
              </span>
              <span className="radio-pill">
                <input
                  type="radio"
                  id="vis-private"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                <label htmlFor="vis-private">私密（仅自己可见）</label>
              </span>
            </div>
          </fieldset>

          <fieldset className="inline-fieldset">
            <legend>同步发往联邦宇宙（可多选）</legend>
            <div className="account-pills">
              {accounts.map((acc) => {
                const checkId = `sync-acc-${acc.id}`
                const checked = selectedAccountIds.includes(acc.id)
                return (
                  <span key={acc.id} className="account-check-pill">
                    <input
                      type="checkbox"
                      id={checkId}
                      name="accountIds"
                      value={acc.id}
                      checked={checked}
                      onChange={() => toggleAccount(acc.id)}
                    />
                    <label htmlFor={checkId}>
                      <span className={`platform-dot ${acc.platform}`} aria-hidden="true" />
                      {acc.acct}
                    </label>
                  </span>
                )
              })}
              <button type="button" className="chip-action-btn" onClick={onOpenAccounts}>
                ＋ 绑定 Mastodon / Misskey
              </button>
            </div>
          </fieldset>

          {activeSelectedCount > 0 ? (
            <fieldset className="inline-fieldset">
              <legend>外部实例可见性</legend>
              <div className="radio-pill-group">
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-public"
                    name="fediverseVisibility"
                    value="public"
                    checked={fediverseVisibility === 'public'}
                    onChange={() => setFediverseVisibility('public')}
                  />
                  <label htmlFor="fedi-public">公开时间轴</label>
                </span>
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-unlisted"
                    name="fediverseVisibility"
                    value="unlisted"
                    checked={fediverseVisibility === 'unlisted'}
                    onChange={() => setFediverseVisibility('unlisted')}
                  />
                  <label htmlFor="fedi-unlisted">静默公开 (Unlisted / Home)</label>
                </span>
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-followers"
                    name="fediverseVisibility"
                    value="followers"
                    checked={fediverseVisibility === 'followers'}
                    onChange={() => setFediverseVisibility('followers')}
                  />
                  <label htmlFor="fedi-followers">仅关注者</label>
                </span>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div role="status" aria-live="polite" className="form-error-slot">
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="composer-footer">
          <div className="composer-meta-left">
            <span className="char-counter">{content.length} / 5000</span>
            <span className="enter-check-wrap">
              <input
                type="checkbox"
                id={enterModeId}
                name="enterToSubmit"
                checked={enterToSubmit}
                onChange={(e) => setEnterToSubmit(e.target.checked)}
              />
              <label htmlFor={enterModeId}>Enter 发送</label>
            </span>
          </div>

          <button type="submit" className="btn btn-primary" disabled={publishing}>
            {publishing
              ? '发送中…'
              : activeSelectedCount > 0
                ? `记录并同步 (${activeSelectedCount})`
                : '记入时间线'}
          </button>
        </div>
      </form>
    </section>
  )
}
