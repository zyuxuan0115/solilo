import { useEffect } from 'react'
import type { PostMedia } from '../types/solilo'
import { ModalDialog } from './ModalDialog'

interface ImageLightboxDialogProps {
  mediaList: PostMedia[] | null
  activeIndex: number
  onChangeIndex: (nextIndex: number) => void
  onClose: () => void
}

export function ImageLightboxDialog({
  mediaList,
  activeIndex,
  onChangeIndex,
  onClose,
}: ImageLightboxDialogProps) {
  const open = mediaList !== null && mediaList.length > 0
  const total = mediaList?.length ?? 0
  const safeIndex = total > 0 ? Math.min(Math.max(0, activeIndex), total - 1) : 0
  const current = open && mediaList ? mediaList[safeIndex] : null

  useEffect(() => {
    if (!open || total <= 1) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onChangeIndex((safeIndex - 1 + total) % total)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onChangeIndex((safeIndex + 1) % total)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, total, safeIndex, onChangeIndex])

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={total > 1 ? `照片预览 (${safeIndex + 1} / ${total})` : '照片预览'}
      closedBy="any"
      maxWidth="54rem"
    >
      {current ? (
        <div className="lightbox-content">
          <div className="lightbox-stage">
            <img
              src={current.url}
              alt={current.alt || '时间线照片大图'}
              className="lightbox-img"
            />
          </div>

          {current.alt ? <p className="lightbox-caption">{current.alt}</p> : null}

          <div className="lightbox-toolbar">
            {total > 1 ? (
              <div className="lightbox-nav-btns">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onChangeIndex((safeIndex - 1 + total) % total)}
                >
                  ‹ 上一张
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onChangeIndex((safeIndex + 1) % total)}
                >
                  下一张 ›
                </button>
              </div>
            ) : (
              <span />
            )}

            {current.url.startsWith('http://') || current.url.startsWith('https://') ? (
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link-btn"
              >
                在新标签页打开原图 ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </ModalDialog>
  )
}
