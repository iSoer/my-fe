import { atom } from "nanostores"
import type { Pos, SaveGame } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { learnableNow, skillCost } from "@game/core/units"
import type { PlaceId } from "@game/content/village"
import { BUILDING_IDS, FIELDS, atLevel } from "@game/content/buildings"
import type { Placeable } from "@game/core/village"
import { accrueTraining, buildingLevel, canUpgrade, fatigueOf, fieldsStored, trainees, trainingGain } from "@game/core/settlement"

/** Стройка в лагере: ставим здание или декор (`moving` — переносим построенное) либо убираем декор. */
export type BuildMode = { mode: "place", kind: Placeable, moving?: boolean } | { mode: "remove" }

/** Призрак постройки: куда встанет и можно ли (сцена сообщает при каждом сдвиге). */
export interface PlacementView {
  kind: Placeable
  x: number
  y: number
  ok: boolean
  error?: string
}

/** Лагерь для React: рядом с каким местом герой, с кем разговор (сцена при этом на паузе) и стройка. */
export interface VillageUiState {
  near?: PlaceId
  talking?: PlaceId
  build?: BuildMode
  placement?: PlacementView
}

export const $villageUi = atom<VillageUiState>({})

/** Стройка, заказанная с другого экрана (Поселение → «Построить»): начинается, когда сцена лагеря готова. */
export const $pendingBuild = atom<BuildMode | null>(null)

export function setNearNpc(near: PlaceId | undefined): void {
  const cur = $villageUi.get()
  if (cur.near !== near) $villageUi.set({ ...cur, near })
}

export function openNpc(id: PlaceId): void {
  $villageUi.set({ ...$villageUi.get(), talking: id })
}

export function closeNpc(): void {
  const cur = $villageUi.get()
  if (cur.talking) {
    const next = { ...cur }
    delete next.talking
    $villageUi.set(next)
  }
}

export function setPlacement(p: PlacementView | null): void {
  const next = { ...$villageUi.get() }
  if (p) next.placement = p
  else delete next.placement
  $villageUi.set(next)
}

/** Начать стройку: сцена показывает призрак или режим сноса. */
export function startBuild(mode: BuildMode): void {
  const next = { ...$villageUi.get(), build: mode }
  delete next.talking
  delete next.placement
  $villageUi.set(next)
  control?.build(mode)
}

export function stopBuild(): void {
  const next = { ...$villageUi.get() }
  delete next.build
  delete next.placement
  $villageUi.set(next)
  control?.build(null)
}

/** Ждёт ли Поселение игрока: можно открыть новое здание (хватает ресурсов и уровня ростера). */
export function settlementAlert(save: SaveGame): boolean {
  return BUILDING_IDS.some(id => buildingLevel(save, id) === 0 && canUpgrade(save, id).ok)
}

/**
 * «!» над местом: Казарма — ростер пуст, отряд неполон, ждёт награда или кому-то есть что изучить;
 * Лавка — ассортимент обновился; Вылазки — незаконченный бой; Ратуша — можно открыть новое здание;
 * Поля — амбар наполовину полон; полигон — есть опыт; Больница — есть кого лечить.
 */
export function npcAlerts(save: SaveGame, now = Date.now()): Record<PlaceId, boolean> {
  const army = save.army
  const learn = !!army?.units.some(u => learnableNow(u).some(id => skillCost(id) <= u.sp))
  const fields = buildingLevel(save, "fields")
  const ready = accrueTraining(save, now)
  return {
    barracks: !army || army.units.length < SQUAD_SIZE || army.squadIds.length < SQUAD_SIZE || !!save.rewardChoice || learn,
    market: save.store.fresh,
    graveyard: false,
    sorties: !!save.battle && !save.battle.result,
    settlement: settlementAlert(save),
    fields: fields > 0 && fieldsStored(save, now) >= atLevel(FIELDS.storage, fields) / 2,
    training: trainees(ready).some(u => trainingGain(ready, u) > 0),
    hospital: save.settlement.hospital.charges > 0 && !!army?.units.some(u => fatigueOf(u) > 0),
    canteen: false
  }
}

/**
 * Следующий шаг игрока — над этим местом прыгает стрелка, его кнопка в панели подсвечена: идёт бой — к воротам;
 * нет отряда или ждёт награда — в Казарму; иначе — на вылазку.
 */
export function villageGuide(save: SaveGame): PlaceId {
  if (save.battle && !save.battle.result) return "sorties"
  const army = save.army
  if (!army || army.units.length === 0 || army.squadIds.length === 0 || save.rewardChoice) return "barracks"
  return "sorties"
}

/** Управление сценой лагеря (регистрирует смонтированная сцена) — для HUD и смоук-тестов через `window.__pf.village`. */
export interface VillageControl {
  teleport(pos: Pos): void
  /** Перенести героя к месту (кнопки панели). */
  teleportTo(id: PlaceId): void
  walkTo(id: PlaceId): void
  /** Режим стройки (`null` — выйти). */
  build(mode: BuildMode | null): void
  /** Призрак — на клетку (смоук-тесты). */
  placeGhost(at: Pos): void
}

let control: VillageControl | null = null

export function setVillageControl(c: VillageControl | null): void {
  control = c
}

export function villageControl(): VillageControl | null {
  return control
}
