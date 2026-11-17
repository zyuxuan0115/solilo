import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { DeliveryReceipt, FediversePlatform, Post } from '../types/solilo'

interface DeliveryPlatformDropdownProps {
  postId: string
  platform: FediversePlatform
  deliveries: DeliveryReceipt[]
  onRetryDelivery: (postId: string, accountId: string) => Promise<Post>
}

const supportsNativePopover =
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover')

export function DeliveryPlatformDropdown({
  postId,
  platform,
  deliveries,
  onRetryDelivery,
}: DeliveryPlatformDropdownProps) {
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({})
  const [retryFeedback, setRetryFeedback] = useState<{
    tone: 'info' | 'error'
    text: string
  } | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const rawId = useId()
  const safeToken = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const popoverId = `deliv-pop-${platform}-${safeToken}`
  const anchorName = `--deliv-anchor-${platform}-${safeToken}`

  useEffect(() => {
    if (supportsNativePopover || !fallbackOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setFallbackOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFallbackOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [fallbackOpen])

  if (deliveries.length === 0) {
    return null
  }

  const platformLabel = platform === 'mastodon' ? 'Mastodon' : 'Misskey'
  const publishedCount = deliveries.filter(
    (d) => d.status === 'published' && Boolean(d.remoteUrl),
  ).length
  const anyRetrying = deliveries.some((d) => Boolean(retryingIds[d.accountId]))
  const hasUnsent = deliveries.some((d) => !(d.status === 'published' && Boolean(d.remoteUrl)))

  function closePanel() {
    if (supportsNativePopover) {
      popoverRef.current?.hidePopover?.()
    } else {
      setFallbackOpen(false)
    }
  }

  async function handleRetry(receipt: DeliveryReceipt) {
    if (retryingIds[receipt.accountId]) return

    setRetryingIds((prev) => ({ ...prev, [receipt.accountId]: true }))
    setRetryFeedback({
      tone: 'info',
      text: `正在再次发送给 ${receipt.acct}…`,
    })

    try {
      const updatedPost = await onRetryDelivery(postId, receipt.accountId)
      const latest = updatedPost.deliveries.find((d) => d.accountId === receipt.accountId)

      if (latest?.status === 'published' && latest.remoteUrl) {
        setRetryFeedback({
          tone: 'info',
          text: `已成功发送给 ${receipt.acct}`,
        })
      } else {
        setRetryFeedback({
          tone: 'error',
          text: `再次发送给 ${receipt.acct} 未成功：${latest?.error || '实例暂不可用'}`,
        })
      }
    } catch (err) {
      setRetryFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : `再次发送给 ${receipt.acct} 失败`,
      })
    } finally {
      setRetryingIds((prev) => {
        const next = { ...prev }
        delete next[receipt.accountId]
        return next
      })
    }
  }

  const triggerContent = (
    <>
      <span className={`platform-dot ${platform}`} aria-hidden="true" />
      <span className="delivery-trigger-label">{platformLabel}</span>
      <span className="delivery-trigger-count">({deliveries.length})</span>
      {anyRetrying ? (
        <span className="delivery-trigger-flag">· 重试中</span>
      ) : hasUnsent ? (
        <span className="delivery-trigger-flag failed">· 待重发</span>
      ) : null}
      <span className="combo-chevron" aria-hidden="true">
        ▾
      </span>
    </>
  )

  return (
    <div ref={wrapperRef} className="delivery-dropdown-wrap">
      {supportsNativePopover ? (
        <button
          type="button"
          popoverTarget={popoverId}
          className={`delivery-dropdown-trigger ${hasUnsent ? 'has-failed' : ''}`}
          style={{ anchorName } as CSSProperties}
          aria-label={`查看 ${platformLabel} 同步账号列表（共 ${deliveries.length} 个）`}
        >
          {triggerContent}
        </button>
      ) : (
        <button
          type="button"
          aria-expanded={fallbackOpen}
          aria-controls={popoverId}
          className={`delivery-dropdown-trigger ${hasUnsent ? 'has-failed' : ''}`}
          aria-label={`查看 ${platformLabel} 同步账号列表（共 ${deliveries.length} 个）`}
          onClick={() => setFallbackOpen((prev) => !prev)}
        >
          {triggerContent}
        </button>
      )}

      <div
        ref={popoverRef}
        id={popoverId}
        {...(supportsNativePopover
          ? { popover: 'auto' as const }
          : { hidden: !fallbackOpen })}
        className={`delivery-dropdown-popover ${supportsNativePopover ? '' : 'fallback-panel'}`}
        style={supportsNativePopover ? ({ positionAnchor: anchorName } as CSSProperties) : undefined}
      >
        <div className="dropdown-panel-header">
          <span className="dropdown-panel-title">
            {platformLabel} 同步记录 ({publishedCount}/{deliveries.length})
          </span>
        </div>

        <div className="delivery-popover-list">
          {deliveries.map((d) => {
            const isSucceeded = d.status === 'published' && Boolean(d.remoteUrl)
            const isRetrying = Boolean(retryingIds[d.accountId])

            if (isSucceeded) {
              return (
                <div key={d.accountId} className="delivery-popover-row">
                  <div className="delivery-popover-info">
                    <span className="delivery-popover-acct">{d.acct}</span>
                  </div>
                  <a
                    href={d.remoteUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="delivery-action-link"
                    onClick={closePanel}
                  >
                    查看 ↗
                  </a>
                </div>
              )
            }

            return (
              <div key={d.accountId} className="delivery-popover-row is-failed">
                <div className="delivery-popover-info">
                  <span className="delivery-popover-acct">{d.acct}</span>
                  <span className="delivery-popover-sub" title={d.error ?? undefined}>
                    {isRetrying
                      ? `再次发送给 ${d.acct}…`
                      : d.error || '未成功送达该实例'}
                  </span>
                </div>
                <button
                  type="button"
                  className="delivery-retry-btn"
                  disabled={isRetrying}
                  onClick={() => void handleRetry(d)}
                >
                  {isRetrying ? '发送中…' : '再次发送'}
                </button>
              </div>
            )
          })}
        </div>

        {retryFeedback ? (
          <div
            role="status"
            aria-live="polite"
            className={`delivery-retry-feedback ${retryFeedback.tone}`}
          >
            {retryFeedback.text}
          </div>
        ) : null}
      </div>
    </div>
  )
}
