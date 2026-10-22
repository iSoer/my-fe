import { useEffect, useState } from "react"

export function Toast({ message, at, error = false }: { message?: string, at?: number, error?: boolean }) {
  // Тост виден, пока не истёк его собственный таймер: новый `at` показывает его снова
  const [hiddenAt, setHiddenAt] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setHiddenAt(at), 2500)
    return () => clearTimeout(t)
  }, [message, at])
  if (!message || hiddenAt === at) return null
  return (
    <div key={at} className={`toast ${error ? "toast-error" : ""}`} role="status">
      <span className="ico" aria-hidden="true">
        {error ? "✕" : "✓"}
      </span>
      <span>{message}</span>
    </div>
  )
}

/** Локальный тост для экранов: возвращает [элемент, show]. */
export function useToast(): [React.JSX.Element, (msg: string, error?: boolean) => void] {
  const [state, setState] = useState<{ msg: string, at: number, error: boolean } | null>(null)
  const show = (msg: string, error = false) => setState({ msg, at: Date.now(), error })
  const el = <Toast message={state?.msg} at={state?.at} error={state?.error ?? false} />
  return [el, show]
}
