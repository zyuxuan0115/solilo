import { useEffect, useId, useState, type FormEvent } from 'react'
import type { ConnectedAccount, FediversePlatform } from '../types/solilo'
import { ModalDialog } from './ModalDialog'

interface AccountsDialogProps {
  open: boolean
  isSandbox: boolean
  accounts: ConnectedAccount[]
  initialPlatform?: FediversePlatform
  onClose: () => void
  onConnect: (platform: FediversePlatform, instance: string) => Promise<void>
  onDisconnect: (accountId: string) => Promise<void>
}

export function AccountsDialog({
  open,
  isSandbox,
  accounts,
  initialPlatform,
  onClose,
  onConnect,
  onDisconnect,
}: AccountsDialogProps) {
  const [platform, setPlatform] = useState<FediversePlatform>(initialPlatform ?? 'mastodon')

  useEffect(() => {
    if (open && initialPlatform) {
      setPlatform(initialPlatform)
    }
  }, [open, initialPlatform])
  const [instance, setInstance] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mastodonRadioId = useId()
  const misskeyRadioId = useId()
  const instanceInputId = useId()
  const instanceHintId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!instance.trim()) return

    setError(null)
    setConnecting(true)
    try {
      await onConnect(platform, instance.trim())
      setInstance('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起绑定失败，请检查实例域名。')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect(id: string) {
    setRemovingId(id)
    setError(null)
    try {
      await onDisconnect(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解绑失败。')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="联邦宇宙账号绑定"
      subtitle="支持同时绑定多个不同实例的 Mastodon 与 Misskey 账号，发帖时按需勾选同步。"
      maxWidth="38rem"
    >
      <section className="dialog-section">
        <h3 className="section-heading">已连接账号（{accounts.length}）</h3>
        {accounts.length === 0 ? (
          <p className="muted-empty">暂未绑定任何外部账号，所有更新默认仅保存在 Solilo。</p>
        ) : (
          <ul className="connected-account-list">
            {accounts.map((acc) => (
              <li key={acc.id} className="connected-account-item">
                <div className="connected-account-info">
                  <span className={`platform-pill ${acc.platform}`}>
                    {acc.platform === 'mastodon' ? 'Mastodon' : 'Misskey'}
                  </span>
                  <div>
                    <div className="account-acct">{acc.acct}</div>
                    {acc.profileUrl ? (
                      <a
                        href={acc.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="account-link"
                      >
                        查看主页 ↗
                      </a>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={removingId === acc.id}
                  onClick={() => void handleDisconnect(acc.id)}
                >
                  {removingId === acc.id ? '移除中…' : '解除绑定'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dialog-section">
        <h3 className="section-heading">添加新账号</h3>
        <form method="post" onSubmit={handleSubmit} className="connect-form">
          <fieldset className="inline-fieldset">
            <legend>选择平台协议</legend>
            <div className="radio-pill-group">
              <span className="radio-pill">
                <input
                  type="radio"
                  id={mastodonRadioId}
                  name="platform"
                  value="mastodon"
                  checked={platform === 'mastodon'}
                  onChange={() => setPlatform('mastodon')}
                />
                <label htmlFor={mastodonRadioId}>Mastodon（OAuth 2.0 动态注册）</label>
              </span>
              <span className="radio-pill">
                <input
                  type="radio"
                  id={misskeyRadioId}
                  name="platform"
                  value="misskey"
                  checked={platform === 'misskey'}
                  onChange={() => setPlatform('misskey')}
                />
                <label htmlFor={misskeyRadioId}>Misskey（MiAuth 授权）</label>
              </span>
            </div>
          </fieldset>

          <div className="field-group">
            <label htmlFor={instanceInputId}>
              实例域名 <span aria-hidden="true">*</span>
            </label>
            <input
              id={instanceInputId}
              name="instance"
              type="text"
              required
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby={instanceHintId}
              value={instance}
              onChange={(e) => {
                setInstance(e.target.value)
                if (error) setError(null)
              }}
              placeholder={platform === 'mastodon' ? 'mastodon.social 或 m.cmx.im' : 'misskey.io'}
            />
            <span id={instanceHintId} className="field-hint">
              {isSandbox
                ? '当前为本地预览模式：提交后会直接模拟绑定一个该实例的演示账号。'
                : platform === 'mastodon'
                  ? '后端会自动向该实例注册 OAuth 应用并跳转授权，Token 使用 AES-256-GCM 加密存储。'
                  : '将跳转至该 Misskey 实例进行 MiAuth 授权，完成后自动返回 Solilo。'}
            </span>
          </div>

          <div role="status" aria-live="polite" className="form-error-slot">
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={connecting}>
              {connecting
                ? '正在连接实例…'
                : isSandbox
                  ? `模拟绑定 ${platform === 'mastodon' ? 'Mastodon' : 'Misskey'}`
                  : `前往 ${platform === 'mastodon' ? 'Mastodon' : 'Misskey'} 授权`}
            </button>
          </div>
        </form>
      </section>
    </ModalDialog>
  )
}
