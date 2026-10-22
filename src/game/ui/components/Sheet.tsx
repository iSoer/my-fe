import type { ReactNode } from "react"
import { Button } from "./Button"

export function BottomSheet({
  open,
  onClose,
  title,
  children
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="handle" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="overlay modal" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel = "Да",
  danger = false,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  text?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {text && <div className="muted">{text}</div>}
      <div className="row">
        <Button block onClick={onClose}>
          Отмена
        </Button>
        <Button block primary={!danger} danger={danger} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
