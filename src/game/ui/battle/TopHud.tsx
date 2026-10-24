import { lootShare } from "@game/core/progression"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { biomeDef } from "@game/content/biomes"
import { haptic } from "@game/platform/haptics"
import { setFastForward, type BattleUiState } from "@game/state/battleUi"
import { tr } from "@game/i18n"

/** Верхняя полоса HUD над полем: фаза, счётчик действовавших, добыча, биом и ускорение хода врага. */
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
          {tr("Turn", "Ход")}
          {battle.turn}
        </span>
        <span className="bf-phase-name">{isPlayer ? tr("YOUR PHASE", "ВАША ФАЗА") : tr("ENEMY PHASE", "ФАЗА ВРАГА")}</span>
      </div>
      {isPlayer && players.length > 0 && (
        <span
          className={`bf-chip bf-acted ${acted === players.length ? "done" : ""}`}
          title={tr("Fighters who have already acted", "Сколько бойцов уже действовали")}
        >
          {acted}
          /
          {players.length}
          {" "}
          {tr("acted", "действовали")}
        </span>
      )}
      <span className="bf-grow" />
      {battle.stats.loot > 0 && (
        <span
          className="bf-chip bf-loot"
          title={tr(
            `Loot at risk: all of it only on victory, ${Math.round(lootShare("defeat") * 100)}% on defeat, `
            + `${Math.round(lootShare("retreat") * 100)}% on retreat`,
            `Добыча под угрозой: целиком — только при победе, при поражении — ${Math.round(lootShare("defeat") * 100)}%, `
            + `при отступлении — ${Math.round(lootShare("retreat") * 100)}%`
          )}
        >
          🦴
          {" "}
          {battle.stats.loot}
          <small className="bf-loot-risk">{tr("at risk", "под угрозой")}</small>
        </span>
      )}
      <span className="bf-chip bf-biome">{biome.name}</span>
      {showFf && (
        <button
          type="button"
          className={`bf-icon ${ui.fastForward ? "active" : ""}`}
          aria-label={tr("Fast forward", "Ускорить")}
          title={tr("Speed up the enemy turn", "Ускорить ход противника")}
          onClick={() => {
            haptic("select")
            setFastForward(!ui.fastForward)
          }}
        >
          ⏩
        </button>
      )}
    </div>
  )
}
