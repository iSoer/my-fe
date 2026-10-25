import { describe, expect, it } from "vitest"
import {
  addRecruit,
  addResources,
  debugBattleMap,
  forceResult,
  grantAllItems,
  refreshSquad,
  setBuildings,
  setLevels,
  skipTime,
  topUp,
  unlockAll,
  weakenEnemies
} from "@game/core/debug"
import { createEmptySave } from "@game/core/save"
import { createBattle } from "@game/core/battle/reducer"
import { generateRoster } from "@game/core/units"
import { campConnected, campLayout } from "@game/core/village"
import { fieldsStored } from "@game/core/settlement"
import { BUILDING_IDS } from "@game/content/buildings"
import { WEAPONS } from "@game/content/weapons"
import type { SaveGame } from "@game/core/types"

function game(): SaveGame {
  const save = createEmptySave(1)
  const units = generateRoster({ seed: 3, glory: 0 })
  return { ...save, army: { id: "a", units, squadIds: units.slice(0, 4).map(u => u.id), createdAt: 1, battles: 0, wins: 0 } }
}

describe("debug: сейв", () => {
  it("ресурсы прибавляются и не уходят в минус, «бесконечная валюта» пополняет только когда мало", () => {
    const s = addResources(game(), { treats: 500, food: -10, glory: 7 })
    expect(s.profile).toMatchObject({ treats: 500, food: 0, glory: 7 })
    const full = topUp(s, 1000)!
    expect(full.profile.treats).toBeGreaterThanOrEqual(1000)
    expect(full.profile.food).toBeGreaterThanOrEqual(1000)
    expect(topUp(full, 1000)).toBeNull()
  })

  it("открывает все сложности и звёзды, ставит уровни, выдаёт всё снаряжение и бойцов сверх Казарм", () => {
    const s = unlockAll(game())
    expect(s.profile.maxRarity).toBe(5)
    expect(s.profile.wins.hard).toBeGreaterThan(0)
    const squad = setLevels(s, 40, true)
    const inSquad = squad.army!.units.filter(u => squad.army!.squadIds.includes(u.id))
    expect(inSquad.every(u => u.level === 40)).toBe(true)
    expect(squad.army!.units.some(u => u.level !== 40)).toBe(true)
    expect(setLevels(s, 999, false).army!.units.every(u => u.level === 80)).toBe(true)
    expect(grantAllItems(s).inventory[WEAPONS[0]!.id]).toBe(1)
    let big = s
    for (let i = 0; i < 12; i++) big = addRecruit(big, { seed: 100 + i, level: 10, rarity: 5, now: 1 })
    expect(big.army!.units).toHaveLength(s.army!.units.length + 12)
    expect(big.army!.units.at(-1)!.rarity).toBe(5)
    expect(addRecruit(createEmptySave(1), { seed: 1, level: 5, rarity: 1, now: 1 }).army!.squadIds).toHaveLength(1)
  })

  it("все здания на уровень — с местом на карте; промотка времени растит Поля", () => {
    const s = setBuildings(game(), 5)
    for (const id of BUILDING_IDS) {
      expect(s.settlement.buildings[id]).toBe(5)
      expect(s.settlement.layout.buildings[id]).toBeDefined()
    }
    expect(campConnected(campLayout(s.settlement))).toBe(true)
    const now = s.settlement.fields.since
    expect(fieldsStored(skipTime(s, 3 * 3600_000), now)).toBeGreaterThan(fieldsStored(s, now))
    const none = setBuildings(s, 0)
    expect(none.settlement.buildings.barracks).toBe(1)
    expect(none.settlement.layout.buildings.fields).toBeUndefined()
  })
})

describe("debug: бой", () => {
  const map = debugBattleMap({ seed: 9, difficulty: "nightmare", biomeId: "glacier", team: 3, enemyLevel: 2, objective: "rout", noReinforcements: true, squadSize: 4 })

  it("карта по параметрам: биом, цель, уровень врагов, без подкреплений", () => {
    expect(map.biomeId).toBe("glacier")
    expect(map.objective).toBe("rout")
    expect(map.reinforcements).toHaveLength(0)
    expect(map.enemies.every(e => e.unit.level === 2)).toBe(true)
  })

  it("победа, поражение и правки боя", () => {
    const squad = game().army!.units.slice(0, 4)
    const { state } = createBattle({ map, squad, seed: 1, now: 1 })
    const won = forceResult(state, "victory")
    expect(won.result).toBe("victory")
    expect(Object.values(won.units).filter(u => u.side === "enemy").every(u => !u.alive)).toBe(true)
    expect(state.result).toBeUndefined()
    const lost = forceResult(state, "defeat")
    expect(Object.values(lost.units).filter(u => u.side === "player").every(u => !u.alive)).toBe(true)
    expect(Object.values(weakenEnemies(state).units).filter(u => u.side === "enemy").every(u => u.hp === 1)).toBe(true)
    const tired = structuredClone(state)
    for (const u of Object.values(tired.units)) if (u.side === "player") Object.assign(u, { hp: 1, acted: true })
    expect(Object.values(refreshSquad(tired).units).filter(u => u.side === "player").every(u => u.hp === u.maxHp && !u.acted)).toBe(true)
  })
})
