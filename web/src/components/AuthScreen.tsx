import { useId, useState, type FormEvent } from 'react'
import { isFirebaseClientConfigured } from '../lib/env'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getClientAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
} from '../lib/firebase'

interface AuthScreenProps {
  onEnterSandbox: () => void
}

export function AuthScreen({ onEnterSandbox }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formHeadingId = useId()
  const emailId = useId()
  const passwordId = useId()
  const passwordHintId = useId()
  const toggleWarnId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const auth = getClientAuth()
    if (!auth) {
      setError('尚未配置 Firebase 环境变量（web/.env），可先点击下方「进入本地预览模式」体验全部界面。')
      return
    }

    setSubmitting(true)
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败，请检查账号或密码。')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    const auth = getClientAuth()
    if (!auth) {
      setError('尚未配置 Firebase 环境变量（web/.env）。')
      return
    }

    setSubmitting(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google 登录未完成。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby={formHeadingId}>
        <header className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            ◌
          </span>
          <div>
            <h1 id={formHeadingId} className="auth-title">
              Solilo
            </h1>
            <p className="auth-tagline">独自一人的时间线，喃喃自语，或顺手吹向联邦宇宙的风里。</p>
          </div>
        </header>

        {!isFirebaseClientConfigured ? (
          <div className="notice-banner" role="note">
            <p>
              <strong>提示：</strong>当前尚未填写 <code>web/.env</code> 中的 Firebase 客户端配置。你可以直接进入本地预览模式体验发帖、多平台绑定弹窗与网页嵌入组件。
            </p>
            <button type="button" className="btn btn-primary full-width" onClick={onEnterSandbox}>
              进入本地预览模式
            </button>
          </div>
        ) : null}

        <form method="post" action="/apps/solilo" onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label htmlFor={emailId}>
              邮箱 <span aria-hidden="true">*</span>
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              placeholder="you@kate0115.cc"
            />
          </div>

          <div className="field-group">
            <div className="label-row">
              <label htmlFor={passwordId}>
                密码 <span aria-hidden="true">*</span>
              </label>
              <button
                type="button"
                className="text-link-btn"
                aria-pressed={showPassword}
                aria-describedby={toggleWarnId}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? '隐藏密码' : '显示密码'}
              </button>
              <span id={toggleWarnId} className="visually-hidden">
                注意：开启后密码会明文显示在屏幕上。
              </span>
            </div>
            <input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              aria-describedby={passwordHintId}
              enterKeyHint="done"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
            />
            <span id={passwordHintId} className="field-hint">
              至少 6 位字符，跨 Web / iOS / Android 同步同一账号。
            </span>
          </div>

          <div role="status" aria-live="polite" className="form-error-slot">
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <button type="submit" className="btn btn-primary full-width" disabled={submitting}>
            {submitting ? '正在处理…' : isSignUp ? '创建个人账号' : '登录时间线'}
          </button>
        </form>

        <div className="auth-secondary-actions">
          <button
            type="button"
            className="btn btn-secondary full-width"
            disabled={submitting}
            onClick={handleGoogleSignIn}
          >
            使用 Google 账号继续
          </button>

          <div className="auth-switch-row">
            <button
              type="button"
              className="text-link-btn"
              onClick={() => {
                setIsSignUp((prev) => !prev)
                setError(null)
              }}
            >
              {isSignUp ? '已有账号？直接登录' : '还没有账号？创建一个'}
            </button>

            {isFirebaseClientConfigured ? (
              <button type="button" className="text-link-btn" onClick={onEnterSandbox}>
                本地沙盒预览
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
