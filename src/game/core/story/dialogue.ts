import type { SaveGame } from "../types"
import { SCENES, type DialogueScene } from "@game/content/dialogues"
import { check, specificity, type Cond } from "./conditions"
import { factsOf } from "./facts"

// Какую сцену разговора показать жителю. Порядок, как в системах «правил с критериями» (Valve) и storylets
// (Yarn Spinner): отбросить сцены, чьи условия не выполнены (и увиденные одноразовые), из оставшихся сюжетных
// взять самую важную и конкретную; сюжетных нет — фоновую по кругу. Без DOM и Phaser.

const isStory = (s: DialogueScene): boolean => !!s.when && s.once !== false

const conds = (s: DialogueScene): Cond => ({ all: s.when ?? [] })

function eligible(s: DialogueScene, facts: Record<string, number>, seen: readonly string[]): boolean {
  if (isStory(s) && seen.includes(s.id)) return false
  return check(conds(s), facts)
}

/** Готовые сюжетные сцены жителя — от главной к второстепенной. */
export function pendingStories(save: SaveGame, npcId: string): DialogueScene[] {
  const facts = factsOf(save)
  return SCENES
    .map((s, order) => ({ s, order }))
    .filter(({ s }) => s.npc === npcId && isStory(s) && eligible(s, facts, save.story.seen))
    .sort((a, b) =>
      (b.s.priority ?? 0) - (a.s.priority ?? 0)
      || specificity(conds(b.s)) - specificity(conds(a.s))
      || a.order - b.order)
    .map(({ s }) => s)
}

/** Ждёт ли у жителя новая сюжетная сцена («!» над головой). */
export function hasNewStory(save: SaveGame, npcId: string): boolean {
  return pendingStories(save, npcId).length > 0
}

/** Сцена для разговора: сюжетная, если готова, иначе фоновая по кругу (по числу разговоров с жителем). */
export function pickScene(save: SaveGame, npcId: string): DialogueScene | undefined {
  const story = pendingStories(save, npcId)[0]
  if (story) return story
  const facts = factsOf(save)
  const idle = SCENES.filter(s => s.npc === npcId && !isStory(s) && eligible(s, facts, save.story.seen))
  if (idle.length === 0) return undefined
  return idle[(save.story.counters[`talk.${npcId}`] ?? 0) % idle.length]
}
