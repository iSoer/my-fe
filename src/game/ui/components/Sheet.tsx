import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button } from "./Button"
import { tr } from "@game/i18n"
import { IconText } from "./Icon"

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
        {title && <h3><IconText text={title} /></h3>}
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
  const box = (
    <div className="overlay modal" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {title && <h3><IconText text={title} /></h3>}
        {children}
      </div>
    </div>
  )
  // Порталом в корень игры: у шторки есть transform (анимация выезда), и fixed-окно внутри неё оказалось бы
  // привязано к шторке и спрятано под её затемнением
  const root = typeof document !== "undefined" ? document.querySelector(".pawfield") : null
  return root ? createPortal(box, root) : box
}

export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  text?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {text && <div className="muted">{typeof text === "string" ? <IconText text={text} /> : text}</div>}
      <div className="row">
        <Button block onClick={onClose}>
          {cancelLabel ?? tr("Cancel", "Отмена")}
        </Button>
        <Button block primary={!danger} danger={danger} onClick={onConfirm}>
          {confirmLabel ?? tr("Yes", "Да")}
        </Button>
      </div>
    </Modal>
  )
}
