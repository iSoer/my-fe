import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parentRoute, parseRoute, routePath } from "@game/state/router"

describe("маршруты вылазки", () => {
  it("режим → сложность → вражеская армия → отряд", () => {
    expect(parseRoute("#/battle/setup")).toEqual({ name: "battleSetup" })
    expect(parseRoute("#/battle/difficulty")).toEqual({ name: "battleDifficulty" })
    expect(routePath({ name: "battleDifficulty" })).toBe("/battle/difficulty")
    expect(parentRoute({ name: "battleDifficulty" })).toEqual({ name: "battleSetup" })
    expect(parseRoute("#/battle/enemy/hard")).toEqual({ name: "battleEnemy", difficulty: "hard" })
    expect(routePath({ name: "battleEnemy", difficulty: "nightmare" })).toBe("/battle/enemy/nightmare")
    expect(parentRoute({ name: "battleEnemy", difficulty: "easy" })).toEqual({ name: "battleDifficulty" })
    expect(parseRoute("#/battle/squad")).toEqual({ name: "battleSquad" })
  })
  it("неизвестная сложность — не экран врагов", () => {
    expect(parseRoute("#/battle/enemy/legendary").name).toBe("notFound")
    expect(parseRoute("#/battle/enemy").name).toBe("notFound")
  })
})

describe("параметры запуска Telegram в хеше", () => {
  it("#tgWebAppData=… — главное меню, а не notFound", () => {
    expect(parseRoute("#tgWebAppData=query_id%3DAAA&tgWebAppVersion=8.0&tgWebAppPlatform=ios")).toEqual({ name: "menu" })
    expect(parseRoute("#tgWebAppVersion=8.0")).toEqual({ name: "menu" })
  })
  it("обычные маршруты и неизвестный путь не затронуты", () => {
    expect(parseRoute("#/army")).toEqual({ name: "army" })
    expect(parseRoute("#/tgWebSomething").name).toBe("notFound")
  })
})

/** Минимальный браузер: хеш, история с state, события popstate/hashchange. */
function fakeBrowser(initialHash: string) {
  type Entry = { hash: string, state: unknown }
  const entries: Entry[] = [{ hash: initialHash, state: null }]
  let index = 0
  const listeners: Record<string, (() => void)[]> = {}
  const fire = (type: string) => (listeners[type] ?? []).forEach(f => f())
  const hashOf = (url: string) => {
    const i = url.indexOf("#")
    return i < 0 ? "" : url.slice(i)
  }
  const location = {
    get hash() {
      return entries[index]!.hash
    },
    get href() {
      return `https://example.test/my-fe/${entries[index]!.hash}`
    }
  }
  const history = {
    get state() {
      return entries[index]!.state
    },
    get length() {
      return entries.length
    },
    pushState(state: unknown, _t: string, url: string) {
      entries.splice(index + 1)
      entries.push({ hash: hashOf(url), state })
      index++
    },
    replaceState(state: unknown, _t: string, url: string) {
      entries[index] = { hash: hashOf(url), state }
    },
    back() {
      if (index === 0) {
        exited = true
        return
      }
      index--
      fire("popstate")
      fire("hashchange")
    }
  }
  let exited = false
  const window = {
    addEventListener(type: string, f: () => void) {
      ;(listeners[type] ??= []).push(f)
    }
  }
  return {
    location,
    history,
    window,
    get exited() {
      return exited
    },
    get index() {
      return index
    },
    /** Ручная правка хеша или ссылка: новая запись без state, popstate + hashchange. */
    linkTo(hash: string) {
      entries.splice(index + 1)
      entries.push({ hash, state: null })
      index++
      fire("popstate")
      fire("hashchange")
    }
  }
}

describe("история и «Назад»", () => {
  let browser: ReturnType<typeof fakeBrowser>
  const load = async (hash: string) => {
    browser = fakeBrowser(hash)
    vi.stubGlobal("location", browser.location)
    vi.stubGlobal("history", browser.history)
    vi.stubGlobal("window", browser.window)
    vi.resetModules()
    const router = await import("@game/state/router")
    router.initRouter()
    return router
  }
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it("системная кнопка «назад» уменьшает глубину: back() игры не уходит из приложения", async () => {
    const r = await load("#/")
    r.navigate("/army")
    r.navigate("/army/u1")
    expect(r.historyDepth()).toBe(2)
    // Два раза «назад» браузера — снова на стартовой записи
    browser.history.back()
    browser.history.back()
    expect(r.historyDepth()).toBe(0)
    expect(r.$route.get()).toEqual({ name: "menu" })
    r.back()
    expect(browser.exited).toBe(false)
    expect(r.$route.get()).toEqual({ name: "menu" })
  })

  it("back() идёт по своей истории", async () => {
    const r = await load("#/")
    r.navigate("/army")
    r.back()
    expect(r.$route.get()).toEqual({ name: "menu" })
    expect(r.historyDepth()).toBe(0)
  })

  it("переход по ссылке без navigate — тоже шаг истории", async () => {
    const r = await load("#/")
    browser.linkTo("#/memorial")
    expect(r.historyDepth()).toBe(1)
    expect(r.$route.get()).toEqual({ name: "memorial" })
    r.back()
    expect(r.$route.get()).toEqual({ name: "menu" })
    expect(browser.exited).toBe(false)
  })

  it("открыли сразу глубокий экран — «Назад» ведёт на родительский, не из приложения", async () => {
    const r = await load("#/army/u1")
    expect(r.historyDepth()).toBe(0)
    r.back()
    expect(browser.exited).toBe(false)
    expect(r.$route.get()).toEqual({ name: "army" })
    r.back()
    expect(r.$route.get()).toEqual({ name: "menu" })
  })

  it("navigate с replace не добавляет глубины", async () => {
    const r = await load("#/")
    r.navigate("/army")
    r.navigate("/store", true)
    expect(r.historyDepth()).toBe(1)
    expect(browser.index).toBe(1)
  })

  it("старт с параметрами Telegram в хеше — меню", async () => {
    const r = await load("#tgWebAppData=abc&tgWebAppVersion=8.0")
    expect(r.$route.get()).toEqual({ name: "menu" })
  })
})
