import type { BattleMode, BuildingId, Difficulty, SaveGame } from "../types"

// Факты о прохождении для триггеров диалогов (и всего, что откроется по делам игрока). Устроено по образцу
// систем «качеств» (Failbetter) и правил с критериями (Valve, Yarn Spinner):
// - игра только сообщает о событиях (`recordEvent`), сама логика триггеров о ней ничего не знает;
// - события копятся в счётчиках с иерархическими ключами: общий и уточнённый — «drink.drunk» и «drink.drunk.pale_ale»;
// - то, что и так лежит в сейве (уровни зданий, Слава, павшие), не копируется в счётчики, а читается как
//   производный факт (`factsOf`) — у правды один источник.
// Без DOM и Phaser.

/** Что произошло в игре — словарь событий, на которые можно завязать триггер. */
export type GameEvent
  = | { type: "sortieStarted", mode: BattleMode, difficulty: Difficulty }
    | { type: "sortieFinished", mode: BattleMode, difficulty: Difficulty, result: "victory" | "defeat" | "retreat", kills: number, fallen: number }
    | { type: "drinkOrdered", drinkId: string }
    | { type: "drinkDrunk", drinkId: string }
    | { type: "built", building: BuildingId }
    | { type: "upgraded", building: BuildingId, level: number }
    | { type: "talked", npcId: string, sceneId: string }

/** Какие счётчики и на сколько прибавляет событие. */
export function eventCounters(ev: GameEvent): [string, number][] {
  switch (ev.type) {
    case "sortieStarted":
      return [["sortie.started", 1], [`sortie.started.${ev.mode}`, 1], [`sortie.started.${ev.difficulty}`, 1]]
    case "sortieFinished": {
      const out: [string, number][] = [
        ["sortie.finished", 1],
        [`sortie.${ev.result}`, 1],
        [`sortie.${ev.result}.${ev.mode}`, 1],
        [`sortie.${ev.result}.${ev.difficulty}`, 1]
      ]
      if (ev.kills > 0) out.push(["kills", ev.kills])
      if (ev.fallen > 0) out.push(["fallen", ev.fallen])
      return out
    }
    case "drinkOrdered":
      return [["drink.ordered", 1], [`drink.ordered.${ev.drinkId}`, 1]]
    case "drinkDrunk":
      return [["drink.drunk", 1], [`drink.drunk.${ev.drinkId}`, 1]]
    case "built":
      return [["building.built", 1], [`building.built.${ev.building}`, 1]]
    case "upgraded":
      return [["building.upgraded", 1], [`building.upgraded.${ev.building}`, 1]]
    case "talked":
      return [["talk", 1], [`talk.${ev.npcId}`, 1]]
  }
}

/** Записать событие в сейв (новый объект; прежний не меняется). Разговор ещё и помечает сцену увиденной. */
export function recordEvent(save: SaveGame, ev: GameEvent): SaveGame {
  const counters = { ...save.story.counters }
  for (const [key, by] of eventCounters(ev)) counters[key] = (counters[key] ?? 0) + by
  const seen = ev.type === "talked" && !save.story.seen.includes(ev.sceneId) ? [...save.story.seen, ev.sceneId] : save.story.seen
  return { ...save, story: { counters, seen } }
}

/**
 * Все факты разом: накопленные счётчики плюс производные из сейва. Производные ключи:
 * `building.level.<id>`, `glory`, `treats`, `army.size`, `army.maxLevel`, `memorial` (сколько бойцов погибло — отпущенные не в счёт), `seen.<sceneId>` (1 — сцена была).
 */
export function factsOf(save: SaveGame): Record<string, number> {
  const f: Record<string, number> = { ...save.story.counters }
  for (const [id, b] of Object.entries(save.settlement.buildings)) f[`building.level.${id}`] = b?.level ?? 0
  f["glory"] = save.profile.glory
  f["treats"] = save.profile.treats
  f["army.size"] = save.army?.units.length ?? 0
  f["army.maxLevel"] = Math.max(0, ...(save.army?.units.map(u => u.level) ?? []))
  // Отпущенные тоже записаны на камнях, но это не могилы: считаем только павших
  f["memorial"] = save.memorial.filter(m => m.reason === "killed").length
  for (const id of save.story.seen) f[`seen.${id}`] = 1
  return f
}
