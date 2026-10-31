import type { BattleState } from "@game/core/types"
import type { BattlePrompt } from "@game/state/battleUi"
import { displayName } from "@game/core/units"
import { plural, tr } from "@game/i18n"
import { ConfirmModal } from "../components/Sheet"

/**
 * Вопрос в чаще: боец с ключом встал на сундук — открыть ли его; боец встал на выход — завершить ли вылазку.
 * «Нет» и тап мимо окна просто закрывают вопрос; задать его снова — тапом по бойцу на этой клетке.
 */
export function ExpeditionPrompt({ battle, prompt, onAnswer }: { battle: BattleState, prompt: BattlePrompt, onAnswer: (yes: boolean) => void }) {
  const unit = battle.roster[prompt.unitId]
  const who = unit ? displayName(unit) : tr("The fighter", "Боец")
  if (prompt.kind === "chest") {
    return (
      <ConfirmModal
        open
        title={tr("📦 Open the chest?", "📦 Открыть сундук?")}
        text={battle.explore
          ? tr("Your squad has the key to this chest. Open it and take what’s inside?", "У отряда есть ключ от этого сундука. Открыть его и забрать содержимое?")
          : tr(`${who} has the key to this chest. Open it and take what’s inside?`, `У бойца ${who} есть ключ от этого сундука. Открыть его и забрать содержимое?`)}
        confirmLabel={tr("Yes", "Да")}
        cancelLabel={tr("No", "Нет")}
        onConfirm={() => onAnswer(true)}
        onClose={() => onAnswer(false)}
      />
    )
  }
  const total = battle.map.expedition?.chests.length ?? 0
  const opened = battle.expedition?.opened.length ?? 0
  const left = total - opened
  const stays = plural(left, ["chest stays", "chests stay"], ["сундук останется", "сундука останутся", "сундуков останутся"])
  const rest = left > 0 ? tr(` ${left} ${stays} in the thicket.`, ` ${left} ${stays} в чаще.`) : ""
  const text = opened > 0
    ? tr(
        `The squad leaves through the exit with all the loot (chests opened: ${opened} of ${total}).${rest}`,
        `Отряд уйдёт через выход со всей добычей (открыто сундуков: ${opened} из ${total}).${rest}`
      )
    : tr(
        `No chest has been opened — the squad leaves without their contents, taking only what it has already won.`,
        `Ни один сундук не открыт — отряд уйдёт без их содержимого, только с тем, что уже добыл.`
      )
  return (
    <ConfirmModal
      open
      title={tr("⇱ End the sortie?", "⇱ Завершить вылазку?")}
      text={text}
      confirmLabel={tr("Yes", "Да")}
      cancelLabel={tr("No", "Нет")}
      onConfirm={() => onAnswer(true)}
      onClose={() => onAnswer(false)}
    />
  )
}
