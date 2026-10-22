import type { Stat, Stats } from "@game/core/types"
import { STATS } from "@game/core/types"
import { STAT_LABELS } from "../lib/format"
import { stagger } from "../lib/animate"

export function StatsGrid({
  stats,
  asset,
  flaw,
  delta,
  animate = false,
  atkLabel
}: {
  stats: Stats
  asset?: Stat
  flaw?: Stat
  delta?: Partial<Stats>
  animate?: boolean
  /** Подпись атаки бойца (Str или Mag модели); без неё — «Str/Mag». */
  atkLabel?: string
}) {
  return (
    <div className="grid-stats">
      {STATS.map((s, i) => (
        <div
          key={s}
          className={`stat ${asset === s ? "asset" : ""} ${flaw === s ? "flaw" : ""} ${animate ? "pop-in" : ""}`}
          style={animate ? stagger(i, 50) : undefined}
        >
          <div className="label">{s === "atk" && atkLabel ? atkLabel : STAT_LABELS[s]}</div>
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
