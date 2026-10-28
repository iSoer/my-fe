import { atom } from "nanostores"
import type { DialogueLine } from "@game/content/dialogues"
import { NPCS } from "@game/content/settlement"
import { hasNewStory, pickScene } from "@game/core/story/dialogue"
import { recordEvent } from "@game/core/story/facts"
import { $save, updateSave } from "./save"

// Разговор с жителем: какая сцена идёт и на какой реплике. Какую сцену показать, решает `core/story/dialogue`
// (сюжетные — по триггерам, фоновые — по кругу). Отключены диалоги в настройках — разговоры не открываются.

export interface DialogueState {
  npcId: string
  sceneId: string
  lines: DialogueLine[]
  index: number
}

export const $dialogue = atom<DialogueState | null>(null)

export function dialoguesEnabled(): boolean {
  return $save.get().settings.dialogues
}

/** Есть ли у жителя что сказать (и включены ли диалоги вообще). */
export function canTalk(npcId: string): boolean {
  return dialoguesEnabled() && NPCS.some(n => n.id === npcId) && !!pickScene($save.get(), npcId)
}

/** Жители, у которых ждёт новая сюжетная сцена («!» над головой); при выключенных диалогах — никто. */
export function npcStoryAlerts(): Record<string, boolean> {
  const save = $save.get()
  const on = save.settings.dialogues
  return Object.fromEntries(NPCS.map(n => [n.id, on && hasNewStory(save, n.id)]))
}

/**
 * Начать разговор с жителем; false — диалоги выключены или сказать нечего. Сцена считается увиденной сразу при
 * открытии: пропустил — значит, видел, и сюжет не застрянет на одной сцене.
 */
export function openDialogue(npcId: string): boolean {
  if (!dialoguesEnabled()) return false
  const scene = pickScene($save.get(), npcId)
  const lines = scene?.lines() ?? []
  if (!scene || lines.length === 0) return false
  updateSave(s => recordEvent(s, { type: "talked", npcId, sceneId: scene.id }))
  $dialogue.set({ npcId, sceneId: scene.id, lines, index: 0 })
  return true
}

/** Следующая реплика; после последней разговор закрывается. */
export function advanceDialogue(): void {
  const d = $dialogue.get()
  if (!d) return
  if (d.index + 1 >= d.lines.length) $dialogue.set(null)
  else $dialogue.set({ ...d, index: d.index + 1 })
}

/** Пропустить разговор целиком. */
export function skipDialogue(): void {
  $dialogue.set(null)
}
