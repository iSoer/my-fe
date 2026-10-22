import { lootShare } from "@game/core/progression"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { biomeDef } from "@game/content/biomes"
import { $pauseOpen } from "../lib/pause"
import { haptic } from "@game/platform/haptics"
import { setFastForward, toggleDanger, type BattleUiState } from "@game/state/battleUi"

/** Верхняя полоса HUD поверх поля: фаза, счётчик походивших, биом и кнопки. */
export function TopHud({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const isPlayer = battle.phase === "player"
  const players = livingUnits(battle, "player")
  const acted = players.filter(u => u.acted).length
  const biome = biomeDef(battle.map.biomeId)
  const showFf = !isPlayer || ui.busy
  return (
    <div className="bf-hud-row">
      <div key={`${battle.turn}-${battle.phase}`} className={`bf-phase ${isPlayer ? "player" : "enemy"}`}>
        <span className="bf-phase-turn">
          Ход
          {battle.turn}
        </span>
        <span className="bf-phase-name">{isPlayer ? "ВАША ФАЗА" : "ФАЗА ВРАГА"}</span>
      </div>
      {isPlayer && players.length > 0 && (
        <span
          className={`bf-chip bf-acted ${acted === players.length ? "done" : ""}`}
          title="Сколько бойцов уже действовали"
        >
          {acted}
          /
          {players.length}
          {" "}
          ходили
        </span>
      )}
      <span className="bf-grow" />
      {battle.stats.loot > 0 && (
        <span
          className="bf-chip bf-loot"
          title={`Добыча под угрозой: целиком — только при победе, при поражении — ${Math.round(lootShare("defeat") * 100)}%, `
            + `при отступлении — ${Math.round(lootShare("retreat") * 100)}%`}
        >
          🦴
          {" "}
          {battle.stats.loot}
          <small className="bf-loot-risk">под угрозой</small>
        </span>
      )}
      <span className="bf-chip bf-biome">{biome.name}</span>
      {showFf && (
        <button
          type="button"
          className={`bf-icon ${ui.fastForward ? "active" : ""}`}
          aria-label="Ускорить"
          title="Ускорить ход противника"
          onClick={() => {
            haptic("select")
            setFastForward(!ui.fastForward)
          }}
        >
          ⏩
        </button>
      )}
      <button
        type="button"
        className={`bf-icon ${ui.dangerOn ? "active warn" : ""}`}
        aria-label="Зона опасности"
        title="Показать зону опасности"
        onClick={() => {
          haptic("select")
          toggleDanger()
        }}
      >
        ⚠
      </button>
      <button
        type="button"
        className="bf-icon"
        aria-label="Пауза"
        onClick={() => {
          haptic("select")
          $pauseOpen.set(true)
        }}
      >
        ≡
      </button>
    </div>
  )
}
