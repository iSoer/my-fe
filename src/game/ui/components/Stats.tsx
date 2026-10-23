import type { Stat, Stats } from "@game/core/types"
import { STATS } from "@game/core/types"
import { STAT_LABELS } from "../lib/format"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"

export function StatsGrid({
  stats,
  asset,
  flaw,
  delta,
  animate = false,
  main
}: {
  stats: Stats
  asset?: Stat
  flaw?: Stat
  delta?: Partial<Stats>
  animate?: boolean
  /** Стат, которым бьёт оружие бойца (Str или Mag): подпись выделена золотом. */
  main?: Stat
}) {
  return (
    <div className="grid-stats">
      {STATS.map((s, i) => (
        <div
          key={s}
          className={`stat ${asset === s ? "asset" : ""} ${flaw === s ? "flaw" : ""} ${main === s ? "main" : ""} ${animate ? "pop-in" : ""}`}
          style={animate ? stagger(i, 50) : undefined}
        >
          <div className="label" title={s === main ? tr("Your weapon hits with this stat", "Этим статом бьёт оружие") : undefined}>{STAT_LABELS[s]}</div>
          <div className="value">{stats[s]}</div>
          {delta && delta[s]
            ? (
                <div className={`delta ${(delta[s] ?? 0) > 0 ? "ok" : "danger"}`}>
                  {(delta[s] ?? 0) > 0 ? `+${delta[s]}` : delta[s]}
                </div>
              )
            : null}
        </div>
      ))}
    </div>
  )
}

export function StatBar({
  value,
  max,
  kind = "hp",
  animate = false,
  delay = 0
}: {
  value: number
  max: number
  kind?: "hp" | "xp" | "sp" | "growth"
  animate?: boolean
  delay?: number
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  const cls = kind === "hp" ? (pct <= 25 ? "crit" : pct <= 50 ? "low" : "") : ""
  return (
    <div className={`bar ${kind} ${cls} ${animate ? "animate" : ""}`}>
      <div style={{ width: `${pct}%`, animationDelay: animate ? `${delay}ms` : undefined }} />
    </div>
  )
}
