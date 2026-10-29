import { atom } from "nanostores"
import type { Difficulty } from "@game/core/types"

export type Route
  = | { name: "menu" }
    | { name: "village" }
    | { name: "store" }
    | { name: "army" }
    | { name: "armyCreate" }
    | { name: "recruit" }
    | { name: "unit", unitId: string }
    | { name: "battleSetup" }
    /** Шаг 2 вылазки: вражеская армия на выбранной сложности. */
    | { name: "battleEnemy", difficulty: Difficulty }
    | { name: "battleSquad" }
    | { name: "battle" }
    | { name: "battleResult" }
    | { name: "memorial" }
    | { name: "settings" }
    | { name: "notFound", path: string }

const DIFFICULTY_IDS: readonly Difficulty[] = ["easy", "normal", "hard", "nightmare"]

export function parseRoute(hash: string): Route {
  // Telegram может передать параметры запуска в хеше (`#tgWebAppData=…`) — это стартовый экран, а не маршрут
  if (hash.replace(/^#/, "").startsWith("tgWeb")) return { name: "menu" }
  const path = hash.replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "")
  const parts = path.split("/").filter(Boolean)
  const [a, b] = parts
  if (!a) return { name: "menu" }
  if (a === "army") {
    if (!b) return { name: "army" }
    if (b === "create") return { name: "armyCreate" }
    if (b === "recruit") return { name: "recruit" }
    return { name: "unit", unitId: b }
  }
  if (a === "battle") {
    if (!b) return { name: "battle" }
    if (b === "setup") return { name: "battleSetup" }
    if (b === "enemy" && parts[2] && (DIFFICULTY_IDS as readonly string[]).includes(parts[2]))
      return { name: "battleEnemy", difficulty: parts[2] as Difficulty }
    if (b === "squad") return { name: "battleSquad" }
    if (b === "result") return { name: "battleResult" }
  }
  if (a === "village") return { name: "village" }
  if (a === "store") return { name: "store" }
  if (a === "memorial") return { name: "memorial" }
  if (a === "settings") return { name: "settings" }
  return { name: "notFound", path }
}

export function routePath(r: Route): string {
  switch (r.name) {
    case "menu":
      return "/"
    case "village":
      return "/village"
    case "store":
      return "/store"
    case "army":
      return "/army"
    case "armyCreate":
      return "/army/create"
    case "recruit":
      return "/army/recruit"
    case "unit":
      return `/army/${r.unitId}`
    case "battleSetup":
      return "/battle/setup"
    case "battleEnemy":
      return `/battle/enemy/${r.difficulty}`
    case "battleSquad":
      return "/battle/squad"
    case "battle":
      return "/battle"
    case "battleResult":
      return "/battle/result"
    case "memorial":
      return "/memorial"
    case "settings":
      return "/settings"
    case "notFound":
      return `/${r.path}`
  }
}

const currentHash = (): string => (typeof location !== "undefined" ? location.hash : "")

export const $route = atom<Route>(parseRoute(currentHash()))

/**
 * Сколько наших записей истории над стартовой. Глубина хранится в `history.state` каждой записи (`pfDepth`), поэтому
 * системная кнопка «назад» браузера и вперёд/назад по истории её корректно восстанавливают (popstate / hashchange).
 */
let depth = 0

const DEPTH_KEY = "pfDepth"

function stateDepth(state: unknown): number | null {
  if (!state || typeof state !== "object") return null
  const d = (state as Record<string, unknown>)[DEPTH_KEY]
  return typeof d === "number" ? d : null
}

/** Синхронизировать `depth` с текущей записью истории; запись без метки (ручная правка хеша, ссылка) — новый шаг. */
export function syncDepth(): void {
  const d = stateDepth(history.state)
  if (d !== null) depth = d
  else {
    depth++
    history.replaceState({ [DEPTH_KEY]: depth }, "", location.href)
  }
}

/** Текущая глубина истории (для тестов и отладки). */
export function historyDepth(): number {
  return depth
}

export function navigate(path: string, replace = false): void {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`
  if (typeof location === "undefined") {
    $route.set(parseRoute(target))
    return
  }
  if (location.hash === target) return
  if (replace) history.replaceState({ [DEPTH_KEY]: depth }, "", target)
  else {
    depth++
    history.pushState({ [DEPTH_KEY]: depth }, "", target)
  }
  $route.set(parseRoute(target))
}

export function go(r: Route, replace = false): void {
  navigate(routePath(r), replace)
}

/** Назад: по истории, если она наша; иначе (открыли по ссылке, после перезагрузки) — на родительский экран. */
export function back(): void {
  if (depth > 0 && typeof history !== "undefined") history.back()
  else go(parentRoute($route.get()), true)
}

/** Куда ведёт «Назад», когда своей истории нет. */
export function parentRoute(r: Route): Route {
  switch (r.name) {
    case "unit":
    case "armyCreate":
    case "recruit":
      return { name: "army" }
    case "battleEnemy":
      return { name: "battleSetup" }
    case "battleSetup":
    case "battleResult":
    case "army":
    case "memorial":
    case "settings":
    case "battle":
    default:
      return { name: "menu" }
  }
}

let routerHooked = false

export function initRouter(): void {
  if (typeof window === "undefined" || routerHooked) return
  routerHooked = true
  // Стартовая запись — глубина 0: от неё «Назад» внутри игры уже не уходит из приложения
  depth = stateDepth(history.state) ?? 0
  history.replaceState({ ...(history.state as object | null), [DEPTH_KEY]: depth }, "", location.href)
  const onChange = () => {
    syncDepth()
    $route.set(parseRoute(location.hash))
  }
  window.addEventListener("popstate", onChange)
  window.addEventListener("hashchange", onChange)
}
