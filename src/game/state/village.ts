import { atom } from "nanostores"
import type { Pos, SaveGame } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { learnableNow, skillCost } from "@game/core/units"
import type { NpcId } from "@game/content/village"

/** Деревня для React: рядом с каким NPC герой и с кем идёт разговор (сцена при разговоре на паузе). */
export interface VillageUiState {
  near?: NpcId
  talking?: NpcId
}

export const $villageUi = atom<VillageUiState>({})

export function setNearNpc(near: NpcId | undefined): void {
  const cur = $villageUi.get()
  if (cur.near !== near) $villageUi.set({ ...cur, near })
}

export function openNpc(id: NpcId): void {
  $villageUi.set({ ...$villageUi.get(), talking: id })
}

export function closeNpc(): void {
  const cur = $villageUi.get()
  if (cur.talking) $villageUi.set({ near: cur.near })
}

/**
 * «!» на здании: Казарма — ростер пуст, отряд неполон, ждёт награда или кому-то есть что изучить;
 * Лавка — ассортимент обновился; Вылазки — незаконченный бой; Кладбище — никогда.
 */
export function npcAlerts(save: SaveGame): Record<NpcId, boolean> {
  const army = save.army
  const learn = !!army?.units.some(u => learnableNow(u).some(id => skillCost(id) <= u.sp))
  return {
    barracks: !army || army.units.length < SQUAD_SIZE || army.squadIds.length < SQUAD_SIZE || !!save.rewardChoice || learn,
    store: save.store.fresh,
    graveyard: false,
    sorties: !!save.battle && !save.battle.result
  }
}

/**
 * Следующий шаг игрока — над этим местом прыгает стрелка, его кнопка в панели подсвечена: идёт бой — к воротам;
 * нет отряда или ждёт награда — в Казарму; иначе — на вылазку.
 */
export function villageGuide(save: SaveGame): NpcId {
  if (save.battle && !save.battle.result) return "sorties"
  const army = save.army
  if (!army || army.units.length === 0 || army.squadIds.length === 0 || save.rewardChoice) return "barracks"
  return "sorties"
}

/** Управление сценой деревни (регистрирует смонтированная сцена) — для смоук-тестов через `window.__pf.village`. */
export interface VillageControl {
  teleport(pos: Pos): void
  walkTo(id: NpcId): void
}

let control: VillageControl | null = null

export function setVillageControl(c: VillageControl | null): void {
  control = c
}

export function villageControl(): VillageControl | null {
  return control
}
