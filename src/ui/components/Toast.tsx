import { useEffect, useState } from 'preact/hooks';

export function Toast({ message, at, error = false }: { message?: string; at?: number; error?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [message, at]);
  if (!visible || !message) return null;
  return <div class={`toast ${error ? 'toast-error' : ''}`}>{message}</div>;
}

/** Локальный тост для экранов: возвращает [элемент, show]. */
export function useToast(): [preact.JSX.Element, (msg: string, error?: boolean) => void] {
  const [state, setState] = useState<{ msg: string; at: number; error: boolean } | null>(null);
  const show = (msg: string, error = false) => setState({ msg, at: Date.now(), error });
  const el = <Toast message={state?.msg} at={state?.at} error={state?.error ?? false} />;
  return [el, show];
}
