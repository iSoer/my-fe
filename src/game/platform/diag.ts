/**
 * Скрытая диагностика для отладки на телефоне (без Web Inspector): кольцевой журнал в localStorage.
 * Пишет запуски страницы (и был ли до этого незавершённый экран боя — признак выгрузки iOS по памяти) и снимки
 * размеров Phaser-игры: буфер, CSS-размер канваса, буфер WebGL, зум камер, раскладка поля.
 * Просмотр — в Настройках, карточка «Приложение»: пять касаний по заголовку.
 */

const LOG_KEY = "pawfield:diag"
const ALIVE_KEY = "pawfield:diag:alive"
const MAX_ENTRIES = 120

export type DiagData = Record<string, unknown>

export interface DiagEntry extends DiagData {
  t: string
  k: string
}

function read(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? (v as DiagEntry[]) : []
  }
  catch {
    return []
  }
}

/** Записать событие (журнал обрезается до последних MAX_ENTRIES). Никогда не бросает. */
export function diagLog(kind: string, data: DiagData = {}): void {
  try {
    const list = read()
    list.push({ t: new Date().toISOString(), k: kind, ...data })
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)))
  }
  catch {
    /* переполненное или недоступное хранилище — диагностика не должна ломать игру */
  }
}

export function diagEntries(): DiagEntry[] {
  return read()
}

export function diagClear(): void {
  try {
    localStorage.removeItem(LOG_KEY)
  }
  catch {
    /* ignore */
  }
}

/** Журнал текстом: строка на событие. */
export function diagText(): string {
  return read()
    .map(({ t, k, ...rest }) => `${t.slice(5, 19).replace("T", " ")} ${k} ${JSON.stringify(rest)}`)
    .join("\n")
}

/** Окно и устройство — общая часть снимков. */
export function diagEnv(): DiagData {
  if (typeof window === "undefined") return {}
  const vv = window.visualViewport
  return {
    dpr: window.devicePixelRatio,
    inner: `${window.innerWidth}x${window.innerHeight}`,
    vv: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}@${vv.scale}` : null,
    vis: document.visibilityState
  }
}

/** Экран, который сейчас открыт (бой/поселение): если страница перезапустилась, не закрыв его, — это видно при старте. */
export function diagScreen(name: string | null): void {
  try {
    if (name) localStorage.setItem(ALIVE_KEY, name)
    else localStorage.removeItem(ALIVE_KEY)
  }
  catch {
    /* ignore */
  }
}

let booted = false

/** Отметить запуск страницы. Вызывается хостом один раз при загрузке. */
export function diagBoot(): void {
  if (booted || typeof window === "undefined") return
  booted = true
  let alive: string | null = null
  try {
    alive = localStorage.getItem(ALIVE_KEY)
  }
  catch {
    /* ignore */
  }
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined
  diagLog("boot", { ...diagEnv(), nav: nav?.type ?? null, hash: location.hash.slice(0, 40), unclosedScreen: alive })
  diagScreen(null)
  // Обычное закрытие оставляет pagehide перед следующим boot; выгрузка процесса iOS — нет
  window.addEventListener("pagehide", () => {
    let screen: string | null = null
    try {
      screen = localStorage.getItem(ALIVE_KEY)
    }
    catch {
      /* ignore */
    }
    diagLog("pagehide", { screen })
  })
}

/* ---------- Снимок смонтированной Phaser-игры ---------- */

let snapshotter: ((reason: string) => void) | null = null

/** Phaser-игра регистрирует, как снять её снимок; `null` — игра уничтожена (снимается, только если `owner` ещё текущий). */
export function setDiagSnapshotter(fn: ((reason: string) => void) | null, owner?: (reason: string) => void): void {
  if (fn === null && owner && snapshotter !== owner) return
  snapshotter = fn
}

/** Снять снимок текущей Phaser-игры, если она есть. */
export function diagSnapshot(reason: string): void {
  snapshotter?.(reason)
}
