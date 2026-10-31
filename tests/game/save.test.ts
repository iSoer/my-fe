import { afterEach, describe, expect, it, vi } from "vitest"
import { MIGRATIONS, SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { isWeaponId } from "@game/content/weapons"
import { generateRoster } from "@game/core/units"
import { generateMap } from "@game/core/map/generate"
import { createBattle } from "@game/core/battle/reducer"

describe("save", () => {
  it("пустой сейв проходит валидацию и round-trip", () => {
    const s = createEmptySave(1)
    const r = parseSave(serializeSave(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.save).toEqual(s)
  })
  it("сейв с армией и боем проходит round-trip", () => {
    const s = createEmptySave(1)
    const units = generateRoster({ seed: 3, glory: 0 }).slice(0, 4)
    s.army = { id: "a", units, squadIds: units.map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
    const map = generateMap({
      seed: 3,
      biomeId: "yard",
      difficulty: "hard",
      team: 0,
      squadSize: 4
    })
    s.battle = createBattle({ map, squad: units, seed: 3, now: 1 }).state
    const r = parseSave(serializeSave(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.save.battle?.units).toEqual(s.battle.units)
  })
  it("битый JSON и неверная схема отклоняются", () => {
    expect(parseSave("{").ok).toBe(false)
    expect(parseSave("{\"version\":1}").ok).toBe(false)
  })
  it("v6 → v7: Commoner / Noble / Diviner где угодно в сейве становятся стартовым классом по оружию", () => {
    const s = createEmptySave(1)
    const units = generateRoster({ seed: 9, glory: 0 }).slice(0, 4)
    const old = [
      { ...units[0]!, classId: "commoner", weaponSkill: "spear" as const },
      { ...units[1]!, classId: "diviner", weaponSkill: "whiteMagic" as const },
      { ...units[2]!, classId: "diviner", weaponSkill: "blackMagic" as const },
      { ...units[3]!, classId: "noble", weaponSkill: "sword" as const }
    ]
    s.army = { id: "a", units: old, squadIds: [], createdAt: 1, battles: 0, wins: 0 }
    s.shelter = { candidates: [{ ...units[0]!, classId: "commoner", weaponSkill: "bow" }], seed: 1 }
    const raw = { ...JSON.parse(serializeSave(s)), version: 6 }
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.army!.units.map(u => u.classId)).toEqual(["soldier", "healer", "mage", "gladiator"])
    expect(r.save.shelter.candidates[0]!.classId).toBe("hunter")
  })

  it("v7 → v8: предметы лечения пропадают из инвентаря, рюкзака и Лавки; оружие и талисманы остаются", () => {
    const s = createEmptySave(1)
    const raw = {
      ...JSON.parse(serializeSave(s)),
      version: 7,
      inventory: { itm_bandage: 3, itm_elixir: 1, sword_steel: 1, tal_fang: 2 },
      store: { seed: 1, weapons: ["sword_iron"], consumables: ["itm_bandage"], talismans: ["tal_fang"], fresh: false }
    }
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.inventory).toEqual({ sword_steel: 1, tal_fang: 2 })
    expect(r.save.store).toMatchObject({ seed: 1, weapons: ["sword_iron"], talismans: ["tal_fang"], fresh: false })
    expect(r.save.store).not.toHaveProperty("consumables")
  })
})

describe("настройка кнопки «Завершить ход»", () => {
  it("по умолчанию — двойное нажатие; старый сейв без настройки читается так же; выбранный режим сохраняется", () => {
    const save = createEmptySave(1)
    expect(save.settings.endTurnConfirm).toBe("double")
    const legacy = JSON.parse(serializeSave(save)) as { settings: Record<string, unknown> }
    delete legacy.settings["endTurnConfirm"]
    const r = parseSave(JSON.stringify(legacy))
    expect(r.ok && r.save.settings.endTurnConfirm).toBe("double")
    for (const mode of ["none", "modal"] as const) {
      const back = parseSave(serializeSave({ ...save, settings: { ...save.settings, endTurnConfirm: mode } }))
      expect(back.ok && back.save.settings.endTurnConfirm).toBe(mode)
    }
  })
})

describe("настройка качества графики", () => {
  it("по умолчанию — «авто»; старый сейв без настройки читается так же; выбранный режим сохраняется", () => {
    const save = createEmptySave(1)
    expect(save.settings.graphics).toBe("auto")
    const legacy = JSON.parse(serializeSave(save)) as { settings: Record<string, unknown> }
    delete legacy.settings["graphics"]
    const r = parseSave(JSON.stringify(legacy))
    expect(r.ok && r.save.settings.graphics).toBe("auto")
    for (const mode of ["crisp", "eco"] as const) {
      const back = parseSave(serializeSave({ ...save, settings: { ...save.settings, graphics: mode } }))
      expect(back.ok && back.save.settings.graphics).toBe(mode)
    }
  })
})

/** Сейв в формате v4: ростер-армия ещё с «пленником» и счётчиками наёма, без Лавки, поселения и сюжета. */
function legacyV4(): Record<string, unknown> {
  const s = createEmptySave(1000)
  const units = generateRoster({ seed: 5, glory: 0 }).slice(0, 2)
  const old = units.map((u, i) => ({
    ...u,
    // Разновидности оружия — изученные навыки: у первого бойца «стальной меч» в запасе, у второго — в лапах
    learned: [...u.learned, i === 0 ? "sword_steel" : u.skills.weapon],
    learnable: [...u.learnable, "axe_steel"]
  }))
  const raw = JSON.parse(serializeSave({ ...s, army: { id: "a", units: old, squadIds: [], createdAt: 1, battles: 1, wins: 0 } })) as Record<string, unknown>
  delete raw["store"]
  delete raw["settlement"]
  delete raw["inventory"]
  delete raw["story"]
  return {
    ...raw,
    version: 4,
    updatedAt: 1000,
    profile: { ...(raw["profile"] as object), rosterRerolls: 2, freeRerolls: 1, hiresSinceBattle: 0 },
    shelter: { prisoner: "x" },
    pendingRoster: [],
    battle: { junk: true },
    lastBattle: { junk: true },
    stats: { battles: 3, wins: 2, kills: 7, deaths: 1, armiesLost: 0 }
  }
}

describe("миграции сейва", () => {
  it("v4 → v5: Приют пуст, бой и итоги отброшены, счётчики наёма убраны", () => {
    const out = MIGRATIONS[4]!(legacyV4())
    expect(out["version"]).toBe(5)
    expect(out["shelter"]).toEqual({ candidates: [], seed: 0 })
    expect(out).not.toHaveProperty("battle")
    expect(out).not.toHaveProperty("lastBattle")
    expect(out).not.toHaveProperty("pendingRoster")
    expect(out["profile"]).not.toHaveProperty("rosterRerolls")
    expect(out["profile"]).not.toHaveProperty("hiresSinceBattle")
  })

  it("v5 → v6: оружие из навыков — в инвентарь (кроме взятого в лапы), игра считается начатой", () => {
    const v5 = MIGRATIONS[4]!(legacyV4())
    const out = MIGRATIONS[5]!(v5)
    expect(out["version"]).toBe(6)
    expect(out["inventory"]).toEqual({ sword_steel: 1 })
    const units = (out["army"] as { units: { learned: string[], learnable: string[] }[] }).units
    for (const u of units) {
      expect(u.learned.some(isWeaponId)).toBe(false)
      expect(u.learnable.some(isWeaponId)).toBe(false)
    }
    expect((out["profile"] as { startedAt?: number }).startedAt).toBe(1000)
    expect(out["village"]).toBeDefined()
  })

  it("v8 → v9: Казармы вмещают ростер, в начатой игре построены Лавка и Кладбище, витрина — по периодам", () => {
    const v8 = { ...JSON.parse(serializeSave(createEmptySave(5000))), version: 8, village: { pos: { x: 1, y: 1 }, facing: "up" } } as Record<string, unknown>
    delete v8["settlement"]
    v8["profile"] = { ...(v8["profile"] as object), startedAt: 10 }
    v8["store"] = { seed: 77, weapons: [], talismans: [], fresh: false }
    const out = MIGRATIONS[8]!(v8)
    expect(out["version"]).toBe(9)
    expect(out).not.toHaveProperty("village")
    const st = out["settlement"] as { buildings: Record<string, { level: number } | undefined> }
    expect(st.buildings["barracks"]?.level).toBeGreaterThanOrEqual(1)
    expect(st.buildings["store"]?.level).toBe(1)
    expect(st.buildings["graveyard"]?.level).toBe(1)
    expect(st.buildings["training"]).toBeUndefined()
    expect(out["store"]).toMatchObject({ seed: 77, salt: 77 })
    expect(typeof (out["store"] as { period: unknown }).period).toBe("number")
  })

  it("v8 → v9: в неначатой игре Лавки и Кладбища нет", () => {
    const v8 = { ...JSON.parse(serializeSave(createEmptySave(5000))), version: 8 } as Record<string, unknown>
    const out = MIGRATIONS[8]!(v8)
    const st = out["settlement"] as { buildings: Record<string, unknown> }
    expect(st.buildings["store"]).toBeUndefined()
    expect(st.buildings["graveyard"]).toBeUndefined()
  })

  it("v9 → v10: сейв читается как есть, бара ещё нет", () => {
    const v9 = { ...JSON.parse(serializeSave(createEmptySave(1))), version: 9 } as Record<string, unknown>
    const out = MIGRATIONS[9]!(v9)
    expect(out).toEqual({ ...v9, version: 10 })
    const r = parseSave(JSON.stringify(v9))
    expect(r.ok && r.save.settlement.buildings.tavern).toBeUndefined()
  })

  it("v11 → v12: у витрины Лавки появляются счётчик обновлений и номер выкладки, товар прежний", () => {
    const save = JSON.parse(serializeSave(createEmptySave(1))) as Record<string, unknown>
    const store: Record<string, unknown> = { ...(save["store"] as Record<string, unknown>), weapons: ["sword_iron"] }
    delete store["rerolls"]
    delete store["variant"]
    const v11 = { ...save, version: 11, store }
    const out = MIGRATIONS[11]!(v11)
    expect(out["version"]).toBe(12)
    expect(out["store"]).toEqual({ ...store, rerolls: 0, variant: 0 })
    const r = parseSave(JSON.stringify(v11))
    expect(r.ok && r.save.store).toMatchObject({ weapons: ["sword_iron"], rerolls: 0, variant: 0 })
  })

  it("v14 → v15: кровь выключается; в новой игре она выключена по умолчанию", () => {
    const save = JSON.parse(serializeSave(createEmptySave(1))) as Record<string, unknown>
    expect((save["settings"] as Record<string, unknown>)["blood"]).toBe("off")
    const v14 = { ...save, version: 14, settings: { ...(save["settings"] as Record<string, unknown>), blood: "sea" } }
    const out = MIGRATIONS[14]!(v14)
    expect(out["version"]).toBe(15)
    expect((out["settings"] as Record<string, unknown>)["blood"]).toBe("off")
    const r = parseSave(JSON.stringify(v14))
    expect(r.ok && r.save.settings.blood).toBe("off")
  })

  it("v4 → v12: вся цепочка — сейв проходит схему, бойцы и статистика сохраняются", () => {
    const v4 = legacyV4()
    const r = parseSave(JSON.stringify(v4))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.army?.units).toHaveLength(2)
    expect(r.save.inventory).toEqual({ sword_steel: 1 })
    expect(r.save.store).toMatchObject({ weapons: [], talismans: [] })
    expect(r.save.settlement.buildings.barracks?.level).toBeGreaterThanOrEqual(1)
    expect(r.save.story.counters).toEqual({ "sortie.started": 3, "sortie.finished": 3, "sortie.victory": 2, "kills": 7, "fallen": 1 })
    expect(r.save.battle).toBeUndefined()
    expect(r.save.lastBattle).toBeUndefined()
  })
})

describe("сейв более новой версии игры", () => {
  it("отклоняется с пометкой newer, а не обрезается схемой", () => {
    const raw = { ...JSON.parse(serializeSave(createEmptySave(1))), version: SAVE_VERSION + 1, futureField: { x: 1 } }
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.newer).toBe(true)
    expect(r.error).toContain(String(SAVE_VERSION + 1))
  })
  it("текущая и старые версии — не newer", () => {
    const r = parseSave("{\"version\":1}")
    expect(!r.ok && r.newer).toBeFalsy()
  })
})

/** localStorage в памяти для state/save. */
function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
    map: m
  }
}

describe("загрузка сейва в игру", () => {
  let storage: ReturnType<typeof memoryStorage>
  const loadState = async (json: string | null) => {
    storage = memoryStorage()
    if (json !== null) storage.setItem("pawfield:save:local", json)
    vi.stubGlobal("localStorage", storage)
    vi.resetModules()
    return import("@game/state/save")
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("нечитаемый сейв уходит в резервную копию до новой игры, ошибка видна", async () => {
    const broken = "{\"version\":11,\"profile\":42}"
    const st = await loadState(broken)
    st.initSave()
    expect(st.$saveStatus.get()).toBe("ready")
    expect(st.$saveError.get()).toBeTruthy()
    expect(storage.getItem("pawfield:backup:local")).toBe(broken)
    // Первая же запись новой игры не трогает копию
    st.updateSave(s => ({ ...s, profile: { ...s.profile, glory: 1 } }))
    st.flushPersist()
    expect(storage.getItem("pawfield:backup:local")).toBe(broken)
    const code = st.exportBackupCode()
    expect(code && decodeURIComponent(escape(atob(code)))).toBe(broken)
  })

  it("сейв более новой версии: игра не стартует и ничего не перезаписывает", async () => {
    const newer = JSON.stringify({ ...JSON.parse(serializeSave(createEmptySave(1))), version: SAVE_VERSION + 1 })
    const st = await loadState(newer)
    st.initSave()
    expect(st.$saveStatus.get()).toBe("error")
    expect(st.$saveNewer.get()).toBe(true)
    st.updateSave(s => s)
    st.flushPersist()
    expect(storage.getItem("pawfield:save:local")).toBe(newer)
  })

  it("импорт кода — свежее изменение: updatedAt = сейчас", async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const st = await loadState(null)
    st.initSave()
    const old = { ...createEmptySave(5), updatedAt: 5 }
    old.settings = { ...old.settings, haptics: false }
    const code = btoa(unescape(encodeURIComponent(serializeSave(old))))
    expect(st.importSaveCode(code).ok).toBe(true)
    expect(st.$save.get().updatedAt).toBe(1_000_000)
    expect(st.$save.get().settings.haptics).toBe(false)
  })
})
