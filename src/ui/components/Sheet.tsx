import type { ComponentChildren } from 'preact';
import { Button } from './Button';

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="handle" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <div class="overlay modal" onClick={onClose}>
      <div class="modal-box" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel = 'Да',
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text?: ComponentChildren;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {text && <div class="muted">{text}</div>}
      <div class="row">
        <Button block onClick={onClose}>
          Отмена
        </Button>
        <Button block primary={!danger} danger={danger} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
