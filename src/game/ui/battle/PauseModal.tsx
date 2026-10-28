import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { BattleState } from "@game/core/types"
import { biomeDef } from "@game/content/biomes"
import { $settings, updateSettings } from "@game/state/save"
import { retreat } from "@game/state/battleUi"
import { Button } from "../components/Button"
import { ConfirmModal, Modal } from "../components/Sheet"
import { $pauseOpen } from "../lib/pause"
import { difficultyName } from "../lib/format"
import { tr } from "@game/i18n"

/** Пауза боя: быстрые настройки и отступление. */
export function PauseModal({ battle }: { battle: BattleState }) {
  const open = useStore($pauseOpen)
  const settings = useStore($settings)
  const [retreatAsk, setRetreatAsk] = useState(false)
  const biome = biomeDef(battle.map.biomeId)
  return (
    <>
      <Modal open={open} onClose={() => $pauseOpen.set(false)} title={tr("Pause", "Пауза")}>
        <div className="bf-pause">
          <div className="bf-pause-meta">
            <span className="bf-chip">{difficultyName(battle.difficulty)}</span>
            <span className="bf-chip">{biome.name}</span>
            <span className="bf-chip">
              {`${tr("turn", "ход")} ${battle.turn}`}
            </span>
            <span className="bf-chip">
              {battle.map.objective === "killBoss"
                ? tr("goal: kill the Leader", "цель: убить вожака")
                : battle.map.objective === "extract"
                  ? tr("goal: open a chest and leave by an exit", "цель: открыть сундук и уйти через выход")
                  : tr("goal: wipe them all", "цель: уничтожить всех")}
            </span>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Animation speed", "Скорость анимаций")}</span>
              <div className="seg" style={{ width: 120 }}>
                <button
                  type="button"
                  className={settings.animSpeed === 1 ? "on" : ""}
                  onClick={() => updateSettings({ animSpeed: 1 })}
                >
                  ×1
                </button>
                <button
                  type="button"
                  className={settings.animSpeed === 2 ? "on" : ""}
                  onClick={() => updateSettings({ animSpeed: 2 })}
                >
                  ×2
                </button>
              </div>
            </div>
          </div>
          <div className="setting">
            <span>{tr("Attack cinematics", "Кинематик атак")}</span>
            <div className="seg">
              {(["always", "mine", "never"] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  className={settings.cinematic === v ? "on" : ""}
                  onClick={() => updateSettings({ cinematic: v })}
                >
                  {v === "always" ? tr("Always", "Всегда") : v === "mine" ? tr("Mine only", "Только мои") : tr("Never", "Никогда")}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Vibration", "Вибрация")}</span>
              <span
                className={`switch ${settings.haptics ? "on" : ""}`}
                onClick={() => updateSettings({ haptics: !settings.haptics })}
              />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>{tr("Confirm attacks", "Подтверждать атаку")}</span>
              <span
                className={`switch ${settings.confirmAttack ? "on" : ""}`}
                onClick={() => updateSettings({ confirmAttack: !settings.confirmAttack })}
              />
            </div>
          </div>
          <Button primary block onClick={() => $pauseOpen.set(false)}>
            {tr("Resume", "Продолжить")}
          </Button>
          <Button danger block onClick={() => setRetreatAsk(true)}>
            {tr("Retreat", "Отступить")}
          </Button>
        </div>
      </Modal>
      <ConfirmModal
        open={retreatAsk}
        title={tr("Retreat?", "Отступить?")}
        text={tr(
          "You keep three quarters of the Treats you’ve looted, no victory bonus. The fallen stay dead, XP is kept.",
          "Из выбитых Вкусняшек достанутся три четверти, бонуса за победу не будет. Погибшие останутся мёртвыми, опыт сохранится."
        )}
        confirmLabel={tr("Retreat", "Отступить")}
        danger
        onConfirm={() => {
          setRetreatAsk(false)
          $pauseOpen.set(false)
          void retreat()
        }}
        onClose={() => setRetreatAsk(false)}
      />
    </>
  )
}
