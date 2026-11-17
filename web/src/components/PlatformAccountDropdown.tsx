import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { ConnectedAccount, FediversePlatform } from '../types/solilo'

interface PlatformAccountDropdownProps {
  platform: FediversePlatform
  accounts: ConnectedAccount[]
  selectedAccountIds: string[]
  disabled?: boolean
  onTogglePlatformAll: (platform: FediversePlatform, selectAll: boolean) => void
  onToggleSingleAccount: (accountId: string) => void
  onRequestConnect: (platform: FediversePlatform) => void
}

const supportsNativePopover =
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover')

export function PlatformAccountDropdown({
  platform,
  accounts,
  selectedAccountIds,
  disabled = false,
  onTogglePlatformAll,
  onToggleSingleAccount,
  onRequestConnect,
}: PlatformAccountDropdownProps) {
  const [fallbackOpen, setFallbackOpen] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const masterCheckboxRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const rawId = useId()
  const safeToken = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const masterCheckId = `plat-all-${platform}-${safeToken}`
  const popoverId = `plat-pop-${platform}-${safeToken}`
  const anchorName = `--plat-anchor-${platform}-${safeToken}`

  const platformLabel = platform === 'mastodon' ? 'Mastodon' : 'Misskey'
  const total = accounts.length
  const selectedCount = accounts.filter((acc) => selectedAccountIds.includes(acc.id)).length
  const allSelected = total > 0 && selectedCount === total
  const isIndeterminate = selectedCount > 0 && selectedCount < total

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  // Manual light-dismiss fallback only when native Popover API is unavailable
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

  function closePanel() {
    if (supportsNativePopover) {
      popoverRef.current?.hidePopover?.()
    } else {
      setFallbackOpen(false)
    }
  }

  function handleMasterChange() {
    if (total === 0 || disabled) return
    onTogglePlatformAll(platform, !allSelected)
  }

  function handleBindNewClick() {
    closePanel()
    onRequestConnect(platform)
  }

  const statusText =
    total === 0
      ? '未绑定'
      : allSelected
        ? `全部 (${total})`
        : isIndeterminate
          ? `${selectedCount}/${total}`
          : `(${total})`

  return (
    <div ref={wrapperRef} className="platform-dropdown-wrap">
      <div
        className={`platform-combo ${selectedCount > 0 ? 'has-selection' : ''}`}
        style={{ anchorName } as CSSProperties}
      >
        <label
          htmlFor={masterCheckId}
          className={`platform-combo-main ${total === 0 || disabled ? 'is-disabled' : ''}`}
          title={
            total === 0
              ? `尚未绑定 ${platformLabel} 账号，点击右侧箭头添加`
              : `直接勾选即可全选/取消全部 ${platformLabel} 账号`
          }
        >
          <input
            ref={masterCheckboxRef}
            id={masterCheckId}
            type="checkbox"
            className="solilo-checkbox"
            checked={allSelected}
            disabled={total === 0 || disabled}
            onChange={handleMasterChange}
          />
          <span className={`platform-dot ${platform}`} aria-hidden="true" />
          <span className="platform-combo-name">{platformLabel}</span>
          <span className="platform-combo-badge">{statusText}</span>
        </label>

        {supportsNativePopover ? (
          <button
            type="button"
            className="platform-combo-trigger"
            popoverTarget={popoverId}
            disabled={disabled}
            aria-label={`展开选择 ${platformLabel} 账号`}
            title={`查看或单独勾选 ${platformLabel} 账号`}
          >
            <span aria-hidden="true" className="combo-chevron">
              ▾
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="platform-combo-trigger"
            disabled={disabled}
            aria-expanded={fallbackOpen}
            aria-controls={popoverId}
            aria-label={`展开选择 ${platformLabel} 账号`}
            onClick={() => setFallbackOpen((prev) => !prev)}
          >
            <span aria-hidden="true" className="combo-chevron">
              ▾
            </span>
          </button>
        )}
      </div>

      <div
        ref={popoverRef}
        id={popoverId}
        {...(supportsNativePopover
          ? { popover: 'auto' as const }
          : { hidden: !fallbackOpen })}
        className={`platform-dropdown-popover ${supportsNativePopover ? '' : 'fallback-panel'}`}
        style={supportsNativePopover ? ({ positionAnchor: anchorName } as CSSProperties) : undefined}
      >
        <div className="dropdown-panel-header">
          <span className="dropdown-panel-title">
            {platformLabel} 账号 {total > 0 ? `(${selectedCount}/${total})` : ''}
          </span>
          {total > 1 ? (
            <button
              type="button"
              className="text-link-btn dropdown-select-all-btn"
              disabled={disabled}
              onClick={() => onTogglePlatformAll(platform, !allSelected)}
            >
              {allSelected ? '清空' : '全选'}
            </button>
          ) : null}
        </div>

        {total === 0 ? (
          <p className="dropdown-empty-msg">暂未绑定 {platformLabel} 账号</p>
        ) : (
          <div className="dropdown-account-list">
            {accounts.map((acc) => {
              const itemId = `acc-opt-${acc.id}-${safeToken}`
              const checked = selectedAccountIds.includes(acc.id)
              return (
                <label key={acc.id} htmlFor={itemId} className="platform-account-option">
                  <input
                    id={itemId}
                    type="checkbox"
                    name="accountIds"
                    value={acc.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggleSingleAccount(acc.id)}
                    className="solilo-checkbox"
                  />
                  <span className="platform-account-meta">
                    <span className="platform-account-acct">{acc.acct}</span>
                    {acc.displayName && acc.displayName !== acc.username ? (
                      <span className="platform-account-display">{acc.displayName}</span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        <div className="dropdown-panel-footer">
          <button
            type="button"
            className="dropdown-bind-btn"
            onClick={handleBindNewClick}
          >
            ＋ 绑定新的 {platformLabel} 账号
          </button>
        </div>
      </div>
    </div>
  )
}
