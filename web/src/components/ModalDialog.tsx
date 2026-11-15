import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalDialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  closedBy?: 'any' | 'closerequest'
  maxWidth?: string
  children: ReactNode
}

export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  closedBy = 'any',
  maxWidth = '36rem',
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => {
      dialog.returnValue = ''
      onCloseRef.current()
    }

    dialog.addEventListener('close', handleClose)

    // Fallback for browsers without native <dialog closedby="any"> support (e.g. Safari)
    let cleanupBackdropFallback: (() => void) | undefined
    if (closedBy === 'any' && !('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const isInsideDialogBox =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        if (!isInsideDialogBox) {
          dialog.close()
        }
      }
      dialog.addEventListener('click', handleBackdropClick)
      cleanupBackdropFallback = () => dialog.removeEventListener('click', handleBackdropClick)
    }

    return () => {
      dialog.removeEventListener('close', handleClose)
      cleanupBackdropFallback?.()
    }
  }, [closedBy])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="solilo-dialog"
      style={{ maxInlineSize: maxWidth }}
      {...({ closedby: closedBy } as Record<string, string>)}
    >
      <div className="dialog-header">
        <div>
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          {subtitle ? <p className="dialog-subtitle">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="关闭窗口"
          onClick={() => dialogRef.current?.close()}
        >
          ✕
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
