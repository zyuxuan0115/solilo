import { useId, useState, type FormEvent } from 'react'
import { formatFullDateTime, formatTimeOfDay } from '../lib/time'
import type { Post, PostMedia, SoliloVisibility, UpdatePostInput } from '../types/solilo'
import { DeliveryPlatformDropdown } from './DeliveryPlatformDropdown'

interface TimelineItemProps {
  post: Post
  onUpdate: (id: string, patch: UpdatePostInput) => Promise<void>
  onRetryDelivery: (postId: string, accountId: string) => Promise<Post>
  onRequestDelete: (post: Post) => void
  onOpenMedia: (mediaList: PostMedia[], index: number) => void
}

export function TimelineItem({
  post,
  onUpdate,
  onRetryDelivery,
  onRequestDelete,
  onOpenMedia,
}: TimelineItemProps) {
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(post.content)
  const [draftCw, setDraftCw] = useState(post.contentWarning ?? '')
  const [draftVisibility, setDraftVisibility] = useState<SoliloVisibility>(post.visibility)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editContentId = useId()
  const editCwId = useId()
  const editVisPubId = useId()
  const editVisPrivId = useId()

  const mediaList = post.media ?? []
  const mastodonDeliveries = post.deliveries.filter((d) => d.platform === 'mastodon')
  const misskeyDeliveries = post.deliveries.filter((d) => d.platform === 'misskey')

  function startEditing() {
    setDraftContent(post.content)
    setDraftCw(post.contentWarning ?? '')
    setDraftVisibility(post.visibility)
    setError(null)
    setEditing(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = draftContent.trim()
    if (!trimmed && mediaList.length === 0) return

    setSaving(true)
    setError(null)
    try {
      await onUpdate(post.id, {
        content: trimmed,
        contentWarning: draftCw.trim() ? draftCw.trim() : null,
        visibility: draftVisibility,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  function renderMediaGrid(insideCollapsedCw: boolean) {
    if (mediaList.length === 0) return null
    const count = Math.min(mediaList.length, 4)

    return (
      <div className={`media-grid count-${count}`} role="group" aria-label="动态附图">
        {mediaList.slice(0, 4).map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className="media-thumb-btn"
            aria-label={item.alt ? `查看大图：${item.alt}` : `查看第 ${idx + 1} 张照片`}
            onClick={() => onOpenMedia(mediaList, idx)}
          >
            <img
              src={item.url}
              alt={item.alt ?? ''}
              loading="lazy"
              fetchPriority={insideCollapsedCw ? 'low' : undefined}
              className="media-thumb-img"
            />
            {item.alt ? (
              <span className="media-alt-badge" aria-hidden="true">
                ALT
              </span>
            ) : null}
          </button>
        ))}
      </div>
    )
  }

  return (
    <article className="timeline-entry">
      <div className="entry-rail">
        <time
          dateTime={post.createdAt}
          title={formatFullDateTime(post.createdAt)}
          className="entry-time"
        >
          {formatTimeOfDay(post.createdAt)}
        </time>
        <span
          className={`visibility-tag ${post.visibility}`}
          title={
            post.visibility === 'public'
              ? '公开：可通过 API Key 在个人网站展示'
              : '私密：仅在你登录的客户端中可见'
          }
        >
          {post.visibility === 'public' ? '公开' : '私密'}
        </span>
      </div>

      <div className="entry-main">
        {editing ? (
          <form method="post" onSubmit={handleSave} className="entry-edit-form">
            <div className="field-group compact">
              <label htmlFor={editCwId}>折叠提示（可选）</label>
              <input
                id={editCwId}
                name="contentWarning"
                type="text"
                maxLength={500}
                value={draftCw}
                onChange={(e) => setDraftCw(e.target.value)}
                placeholder="留空则直接展示正文"
              />
            </div>

            <div className="field-group compact">
              <label htmlFor={editContentId}>正文</label>
              <textarea
                id={editContentId}
                name="content"
                required={mediaList.length === 0}
                maxLength={500}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className="composer-textarea edit-textarea"
              />
            </div>

            <fieldset className="inline-fieldset">
              <legend>可见范围</legend>
              <div className="radio-pill-group">
                <span className="radio-pill">
                  <input
                    type="radio"
                    id={editVisPubId}
                    name={`vis-${post.id}`}
                    value="public"
                    checked={draftVisibility === 'public'}
                    onChange={() => setDraftVisibility('public')}
                  />
                  <label htmlFor={editVisPubId}>公开</label>
                </span>
                <span className="radio-pill">
                  <input
                    type="radio"
                    id={editVisPrivId}
                    name={`vis-${post.id}`}
                    value="private"
                    checked={draftVisibility === 'private'}
                    onChange={() => setDraftVisibility('private')}
                  />
                  <label htmlFor={editVisPrivId}>私密</label>
                </span>
              </div>
            </fieldset>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="entry-edit-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {post.contentWarning ? (
              <details className="entry-cw">
                <summary>{post.contentWarning}</summary>
                {post.content ? <p className="entry-content">{post.content}</p> : null}
                {renderMediaGrid(true)}
              </details>
            ) : (
              <>
                {post.content ? <p className="entry-content">{post.content}</p> : null}
                {renderMediaGrid(false)}
              </>
            )}

            {post.deliveries.length > 0 ? (
              <div className="delivery-dropdown-group" role="group" aria-label="联邦宇宙同步记录">
                <DeliveryPlatformDropdown
                  postId={post.id}
                  platform="mastodon"
                  deliveries={mastodonDeliveries}
                  onRetryDelivery={onRetryDelivery}
                />
                <DeliveryPlatformDropdown
                  postId={post.id}
                  platform="misskey"
                  deliveries={misskeyDeliveries}
                  onRetryDelivery={onRetryDelivery}
                />
              </div>
            ) : null}

            <div className="entry-toolbar">
              <button type="button" className="ghost-action-btn" onClick={startEditing}>
                编辑
              </button>
              <button
                type="button"
                className="ghost-action-btn danger"
                onClick={() => onRequestDelete(post)}
              >
                删除
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
