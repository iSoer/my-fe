import { lootShare } from "@game/core/progression"
import { turnLimitOf } from "@game/content/balance"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { biomeDef } from "@game/content/biomes"
import { haptic } from "@game/platform/haptics"
import { setFastForward, type BattleUiState } from "@game/state/battleUi"
import { tr } from "@game/i18n"
import { BUFFS } from "@game/content/expedition"

/** Верхняя полоса HUD над полем: фаза, счётчик действовавших, добыча, биом и ускорение хода врага. */
export function TopHud({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const isPlayer = battle.phase === "player"
  const players = livingUnits(battle, "player")
  const acted = players.filter(u => u.acted).length
  const biome = biomeDef(battle.map.biomeId)
  const showFf = !isPlayer || ui.busy
  const limit = turnLimitOf(battle.map)
  const chests = battle.map.expedition?.chests.length ?? 0
  const opened = battle.expedition?.opened.length ?? 0
  // Бонусы всего отряда (личные — значками над бойцами)
  const teamBuffs = (battle.expedition?.buffs.team ?? []).map(b => BUFFS[b].icon).join("")
  const keys = battle.expedition
    ? Object.values(battle.expedition.keys).filter(k => k.unitId && battle.units[k.unitId]?.side === "player").length
    : 0
  return (
    <div className="bf-hud-row">
      <div key={`${battle.turn}-${battle.phase}`} className={`bf-phase ${isPlayer ? "player" : "enemy"}`}>
        <span
          className={`bf-phase-turn ${limit - battle.turn < 3 ? "late" : ""}`}
          title={tr(`The battle lasts at most ${limit} turns, then your squad retreats`, `Бой длится не больше ${limit} ходов, затем отряд отступает`)}
        >
          {tr("Turn", "Ход")}
          {`${battle.turn}/${limit}`}
        </span>
        <span className="bf-phase-name">{isPlayer ? tr("YOUR PHASE", "ВАША ФАЗА") : tr("ENEMY PHASE", "ФАЗА ВРАГА")}</span>
      </div>
      {/* На большом поле в строке ещё цель вылазки: счётчик действовавших не помещается (сигнал — пульс кнопки хода) */}
      {isPlayer && players.length > 0 && chests === 0 && (
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
      {chests > 0 && (
        <span
          className={`bf-chip bf-goal ${opened > 0 ? "ready" : ""}`}
          title={tr(
            "Kill the guard with the key, step onto the chest with the key to open it, then end a fighter’s action on the glowing EXIT in the corner to take all the loot",
            "Убейте стража с ключом, встаньте с ключом на сундук — он откроется, затем завершите действие бойца на светящемся ВЫХОДЕ в углу — отряд унесёт всю добычу"
          )}
        >
          {`📦 ${opened}/${chests}`}
          {keys > 0 ? ` · 🗝 ${keys}` : ""}
          {teamBuffs ? ` · ${teamBuffs}` : ""}
          {opened > 0 ? ` · ${tr("→ exit", "→ к выходу")}` : ""}
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
          {chests === 0 && <small className="bf-loot-risk">{tr("at risk", "под угрозой")}</small>}
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
