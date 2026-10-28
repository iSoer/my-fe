import { atom } from "nanostores"
import { DIALOGUES, type DialogueLine } from "@game/content/dialogues"
import { NPCS } from "@game/content/settlement"
import { $save } from "./save"

// Разговор с жителем: какая сцена идёт и на какой реплике. Сцены жителя идут по кругу (счётчик — на сессию,
// в сейв не пишется). Отключены диалоги в настройках — разговоры не открываются.

export interface DialogueState {
  npcId: string
  lines: DialogueLine[]
  index: number
}

export const $dialogue = atom<DialogueState | null>(null)

/** Какую сцену жителя показать следующей. */
const nextScene: Record<string, number> = {}

export function dialoguesEnabled(): boolean {
  return $save.get().settings.dialogues
}

/** Есть ли у жителя что сказать (и включены ли диалоги вообще). */
export function canTalk(npcId: string): boolean {
  return dialoguesEnabled() && (DIALOGUES[npcId]?.length ?? 0) > 0 && NPCS.some(n => n.id === npcId)
}

/** Начать разговор с жителем; false — диалоги выключены или сказать нечего. */
export function openDialogue(npcId: string): boolean {
  if (!canTalk(npcId)) return false
  const scenes = DIALOGUES[npcId] ?? []
  const i = nextScene[npcId] ?? 0
  nextScene[npcId] = (i + 1) % scenes.length
  const lines = scenes[i % scenes.length]?.() ?? []
  if (lines.length === 0) return false
  $dialogue.set({ npcId, lines, index: 0 })
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

/** Для тестов: сцены снова с первой. */
export function resetDialogues(): void {
  for (const k of Object.keys(nextScene)) delete nextScene[k]
  $dialogue.set(null)
}
