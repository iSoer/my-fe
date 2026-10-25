import { describe, expect, it } from "vitest"
import {
  campConnected,
  campLayout,
  canPlace,
  entranceTiles,
  findSpot,
  findVillagePath,
  heroFits,
  moveHero,
  normalizeInput,
  placeInReach,
  spotNear,
  walkableTile
} from "@game/core/village"
import {
  BUILDING_SHAPES,
  GRAVEYARD,
  HALL,
  HERO_RETURN,
  HERO_START,
  NPCS,
  VILLAGE_H,
  VILLAGE_MAP,
  VILLAGE_W
} from "@game/content/village"
import { BUILDING_IDS } from "@game/content/buildings"
import { npcAlerts, villageGuide } from "@game/state/village"
import { createEmptySave } from "@game/core/save"
import { moveBuilding, placeDecor, removeDecor, upgradeBuilding } from "@game/core/settlement"
import { generateRoster } from "@game/core/units"
import type { SaveGame } from "@game/core/types"

const rich = (): SaveGame => {
  const save = createEmptySave(1)
  return { ...save, profile: { ...save.profile, treats: 100000, food: 1000 } }
}

describe("лагерь: карта", () => {
  const camp = campLayout(createEmptySave(1).settlement)

  it("прямоугольная, по краю — лес и частокол, Ратуша стоит стенами с дверью снизу", () => {
    expect(VILLAGE_MAP.every(row => row.length === VILLAGE_W)).toBe(true)
    for (let x = 0; x < VILLAGE_W; x++) {
      expect(walkableTile(camp, x, 0)).toBe(false)
      expect(walkableTile(camp, x, VILLAGE_H - 1)).toBe(false)
    }
    for (let y = 0; y < VILLAGE_H; y++) {
      expect(walkableTile(camp, 2, y)).toBe(false)
      expect(walkableTile(camp, VILLAGE_W - 3, y)).toBe(false)
    }
    for (let y = HALL.y; y < HALL.y + HALL.h; y++) for (let x = HALL.x; x < HALL.x + HALL.w; x++) expect(walkableTile(camp, x, y)).toBe(false)
    expect(VILLAGE_MAP[HALL.y + HALL.h - 1]?.[HALL.x + Math.floor(HALL.w / 2)]).toBe("D")
    for (let y = GRAVEYARD.y; y < GRAVEYARD.y + GRAVEYARD.h; y++)
      for (let x = GRAVEYARD.x; x < GRAVEYARD.x + GRAVEYARD.w; x++) expect(walkableTile(camp, x, y)).toBe(false)
  })

  it("старт и точка возвращения свободны, до каждого места можно дойти шагами героя", () => {
    expect(heroFits(camp, HERO_START)).toBe(true)
    expect(heroFits(camp, HERO_RETURN)).toBe(true)
    expect(campConnected(camp)).toBe(true)
    expect(camp.places.map(p => p.id).sort()).toEqual(["barracks", "graveyard", "market", "settlement", "sorties"])
    for (const place of camp.places) {
      const spot = spotNear(camp, place.id)!
      expect(heroFits(camp, spot)).toBe(true)
      expect(placeInReach(camp, spot)?.id).toBe(place.id)
      const path = findVillagePath(camp, HERO_START, spot)
      expect(path.length).toBeGreaterThan(0)
      let p = { ...HERO_START }
      for (const wp of [...path, spot]) for (let i = 0; i < 40; i++) p = moveHero(camp, p, (wp.x - p.x) * 0.25, (wp.y - p.y) * 0.25)
      expect(placeInReach(camp, p)?.id, place.id).toBe(place.id)
    }
  })

  it("стены и жители не пропускают героя, вдоль стены он скользит", () => {
    // упирается в Казарму снизу: стены — ряды 14–15, герой подходит с ряда 16 левее входа
    const below = { x: 4.5, y: 16.6 }
    expect(moveHero(camp, below, 0, -3).y).toBeGreaterThan(16.2)
    const slide = moveHero(camp, below, -1, -1)
    expect(slide.x).toBeLessThan(below.x - 0.9)
    const npc = NPCS.find(n => n.id === "settlement")!
    const near = { x: npc.pos!.x, y: npc.pos!.y + 1.2 }
    expect(Math.abs(moveHero(camp, near, 0, -2).y - npc.pos!.y)).toBeGreaterThan(0.6)
  })

  it("диагональ не быстрее прямой, тап по дереву ведёт к ближайшей проходимой клетке", () => {
    const d = normalizeInput(1, 1)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1)
    const path = findVillagePath(camp, HERO_START, { x: 0.5, y: 12.5 })
    const last = path[path.length - 1]!
    expect(walkableTile(camp, Math.floor(last.x), Math.floor(last.y))).toBe(true)
  })
})

describe("лагерь: стройка", () => {
  it("каждое здание встаёт на своё место по умолчанию, и все вместе не мешают друг другу", () => {
    let save = rich()
    for (const id of BUILDING_IDS) {
      if (save.settlement.buildings[id] > 0) continue
      expect(canPlace(save.settlement, id, BUILDING_SHAPES[id].pref).ok, id).toBe(true)
      const r = upgradeBuilding(save, id, 1, BUILDING_SHAPES[id].pref)
      expect(r.ok, id).toBe(true)
      if (r.ok) save = r.value
    }
    const camp = campLayout(save.settlement)
    expect(campConnected(camp)).toBe(true)
    expect(camp.places).toHaveLength(BUILDING_IDS.length + 3)
  })

  it("на занятое место, тропинку и за частокол не поставить; вход должен быть свободен", () => {
    const s = createEmptySave(1).settlement
    expect(canPlace(s, "hospital", { x: 4, y: 14 })).toMatchObject({ ok: false })
    // тропинка через лагерь — ряд 12
    expect(canPlace(s, "hospital", { x: 6, y: 11 })).toMatchObject({ ok: false })
    expect(canPlace(s, "hospital", { x: 0, y: 5 })).toMatchObject({ ok: false })
    // вход Казармы занят: декор перед ним не ставится, а тропинка — можно
    const door = entranceTiles("barracks", s.layout.buildings.barracks!)[0]!
    expect(canPlace(s, "lantern", door)).toMatchObject({ ok: false })
    expect(canPlace(s, "path", door).ok).toBe(true)
  })

  it("вход не прячется под чужой крышей, и крыша не накрывает чужой вход", () => {
    const s = createEmptySave(1).settlement
    // полигон над Ратушей: его вход (11, 8) — под её крышей
    const under = canPlace(s, "training", { x: 9, y: 5 })
    expect(under.ok ? "" : under.error).toMatch(/roof|крыш/)
    // Больница сразу под входом Казармы: её крыша легла бы на клетки перед дверью
    const roof = canPlace(s, "hospital", { x: 5, y: 17 })
    expect(roof.ok ? "" : roof.error).toMatch(/roof|крыш/)
  })

  it("постройку, которая перекроет проход к месту, поставить нельзя", () => {
    let save = rich()
    const r = upgradeBuilding(save, "hospital", 1, { x: 14, y: 8 })
    expect(r.ok).toBe(true)
    if (r.ok) save = r.value
    // вход Больницы — (15, 10): закрываем соседей слева и справа, снизу — нельзя
    for (const at of [{ x: 14, y: 10 }, { x: 16, y: 10 }]) {
      const d = placeDecor(save, "barrels", at)
      expect(d.ok).toBe(true)
      if (d.ok) save = d.value
    }
    const last = canPlace(save.settlement, "barrels", { x: 15, y: 11 })
    expect(last).toMatchObject({ ok: false })
    expect(last.ok ? "" : last.error).toMatch(/block|Перекроет/)
  })

  it("новое здание без выбранного места встаёт на ближайшее свободное, перенос освобождает старое место", () => {
    let save = rich()
    const built = upgradeBuilding(save, "fields", 1)
    expect(built.ok).toBe(true)
    if (built.ok) save = built.value
    const at = save.settlement.layout.buildings.fields!
    expect(at).toEqual(BUILDING_SHAPES.fields.pref)
    const spot = findSpot(save.settlement, "fields", { x: 4, y: 20 })!
    const moved = moveBuilding(save, "fields", spot)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.value.settlement.layout.buildings.fields).toEqual(spot)
    expect(canPlace(moved.value.settlement, "training", BUILDING_SHAPES.training.pref).ok).toBe(spot.x === 4 ? false : true)
    expect(canPlace(moved.value.settlement, "lantern", at).ok).toBe(true)
  })

  it("декор стоит Вкусняшек, снос возвращает половину", () => {
    const save = rich()
    const placed = placeDecor(save, "well", { x: 7, y: 10 })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    expect(placed.value.profile.treats).toBe(save.profile.treats - 80)
    expect(placeDecor({ ...save, profile: { ...save.profile, treats: 0 } }, "well", { x: 7, y: 10 }).ok).toBe(false)
    const removed = removeDecor(placed.value, { x: 7, y: 10 })
    expect(removed.ok).toBe(true)
    if (removed.ok) expect(removed.value.save.profile.treats).toBe(save.profile.treats - 40)
  })
})

describe("лагерь: подсказки", () => {
  it("следующий шаг: идёт бой — к воротам, нет отряда или ждёт награда — в Казарму, иначе — на вылазку", () => {
    const save = createEmptySave(1)
    expect(villageGuide(save)).toBe("barracks")
    const units = generateRoster({ seed: 1, glory: 0 })
    save.army = { id: "a", units, squadIds: units.slice(0, 4).map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
    expect(villageGuide(save)).toBe("sorties")
    expect(villageGuide({ ...save, rewardChoice: [units[0]!] })).toBe("barracks")
    expect(npcAlerts(save).graveyard).toBe(false)
  })
})
