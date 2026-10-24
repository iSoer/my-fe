import { describe, expect, it } from "vitest"
import { generateMap } from "@game/core/map/generate"
import { createBattle } from "@game/core/battle/reducer"
import { generateRoster } from "@game/core/units"
import { livingUnits } from "@game/core/battle/query"
import { BIOMES } from "@game/content/biomes"
import { createEmptySave } from "@game/core/save"
import { $save } from "@game/state/save"
import { $battleUi, beginDrag, endDrag, endTurn, enterBattleScreen, tapTile } from "@game/state/battleUi"
import { posKey, type Difficulty } from "@game/core/types"

const flush = () => new Promise(r => setTimeout(r, 0))

/**
 * Регрессия «боец не двигается»: на сгенерированных картах каждого бойца переставляют тапом и перетаскиванием
 * на подсвеченные клетки по нескольку раз за ход, затем играет враг.
 */
describe("перемещение на сгенерированных картах", () => {
  it("боец встаёт на любую подсвеченную клетку, ход не тратится, выбор и фаза не залипают", async () => {
    const diffs: Difficulty[] = ["easy", "normal", "hard", "nightmare"]
    const roster = generateRoster({ seed: 9, glory: 0 })
    let moves = 0
    for (let seed = 1; seed <= 10; seed++) {
      const map = generateMap({ seed, biomeId: BIOMES[seed % BIOMES.length]!.id, difficulty: diffs[seed % 4]!, team: 1, squadSize: 4 })
      const { state } = createBattle({ map, squad: roster.slice(0, 4).map(u => ({ ...u, level: 10 })), seed, now: 1 })
      const save = createEmptySave(1)
      save.battle = state
      $save.set(save)
      enterBattleScreen()
      for (let turn = 0; turn < 3; turn++) {
        const st0 = $save.get().battle!
        if (st0.result || st0.phase !== "player") break
        for (const bu of livingUnits(st0, "player")) {
          for (let k = 0; k < 3; k++) {
            const cur = $save.get().battle!.units[bu.unitId]!
            tapTile(cur.pos)
            const ui = $battleUi.get()
            expect(ui.selectedId, `seed ${seed}`).toBe(cur.unitId)
            const opts = [...ui.reach!.values()].filter(n => n.canStop && posKey(n.pos) !== posKey(cur.pos))
            if (opts.length === 0) break
            const to = opts[(seed * 7 + k * 13 + turn) % opts.length]!.pos
            if (k === 1) {
              expect(beginDrag(cur.unitId)).toBe(true)
              endDrag(to)
            }
            else tapTile(to)
            await flush()
            const after = $save.get().battle!.units[bu.unitId]!
            expect(after.pos, `seed ${seed} → ${posKey(to)}`).toEqual(to)
            expect(after.acted).toBe(false)
            moves++
            tapTile(after.pos)
            expect($battleUi.get().mode).toBe("idle")
          }
        }
        await endTurn()
        for (let i = 0; i < 20 && $battleUi.get().busy; i++) await flush()
        expect($battleUi.get().busy, `seed ${seed}: фаза врага не закончилась`).toBe(false)
      }
    }
    expect(moves).toBeGreaterThan(100)
  })
})
