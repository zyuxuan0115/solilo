import { ModalDialog } from './ModalDialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalDialog open={open} onClose={onCancel} title={title} closedBy="closerequest" maxWidth="26rem">
      <p className="confirm-desc">{description}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? '处理中…' : confirmLabel}
        </button>
      </div>
    </ModalDialog>
  )
}
