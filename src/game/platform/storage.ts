/** Сейв игры живёт в localStorage браузера; хост может развести сейвы по пользователям (Telegram id). */
let namespace = "local"

/** Вызывать до `initSave`: ключ сейва — `pawfield:save:<namespace>`. */
export function setStorageNamespace(ns: string): void {
  namespace = ns || "local"
}

export function localKey(): string {
  return `pawfield:save:${namespace}`
}

export function loadLocal(): string | null {
  try {
    return localStorage.getItem(localKey())
  }
  catch {
    return null
  }
}

export function saveLocal(json: string): void {
  try {
    localStorage.setItem(localKey(), json)
  }
  catch {
    /* quota or private mode */
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(localKey())
  }
  catch {
    /* ignore */
  }
}
