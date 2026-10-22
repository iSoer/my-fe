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

/** Пауза боя: быстрые настройки и отступление. */
export function PauseModal({ battle }: { battle: BattleState }) {
  const open = useStore($pauseOpen)
  const settings = useStore($settings)
  const [retreatAsk, setRetreatAsk] = useState(false)
  const biome = biomeDef(battle.map.biomeId)
  return (
    <>
      <Modal open={open} onClose={() => $pauseOpen.set(false)} title="Пауза">
        <div className="bf-pause">
          <div className="bf-pause-meta">
            <span className="bf-chip">{difficultyName(battle.difficulty)}</span>
            <span className="bf-chip">{biome.name}</span>
            <span className="bf-chip">
              ход
              {battle.turn}
            </span>
            <span className="bf-chip">
              {battle.map.objective === "killBoss" ? "цель: убить вожака" : "цель: уничтожить всех"}
            </span>
          </div>
          <div className="setting">
            <div className="row">
              <span>Скорость анимаций</span>
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
            <span>Кинематик атак</span>
            <div className="seg">
              {(["always", "mine", "never"] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  className={settings.cinematic === v ? "on" : ""}
                  onClick={() => updateSettings({ cinematic: v })}
                >
                  {v === "always" ? "Всегда" : v === "mine" ? "Только мои" : "Никогда"}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>Вибрация</span>
              <span
                className={`switch ${settings.haptics ? "on" : ""}`}
                onClick={() => updateSettings({ haptics: !settings.haptics })}
              />
            </div>
          </div>
          <div className="setting">
            <div className="row">
              <span>Подтверждать атаку</span>
              <span
                className={`switch ${settings.confirmAttack ? "on" : ""}`}
                onClick={() => updateSettings({ confirmAttack: !settings.confirmAttack })}
              />
            </div>
          </div>
          <Button primary block onClick={() => $pauseOpen.set(false)}>
            Продолжить
          </Button>
          <Button danger block onClick={() => setRetreatAsk(true)}>
            Отступить
          </Button>
        </div>
      </Modal>
      <ConfirmModal
        open={retreatAsk}
        title="Отступить?"
        text={"Из выбитых Вкусняшек достанутся три четверти, бонуса за победу не будет. "
          + "Погибшие останутся мёртвыми, опыт сохранится."}
        confirmLabel="Отступить"
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
