import { useEffect, useMemo } from "react"
import { useStore } from "@nanostores/react"
import { STATS } from "@game/core/types"
import type { Stats } from "@game/core/types"
import { displayName, unitClassName } from "@game/core/units"
import { biomeDef } from "@game/content/biomes"
import { XP } from "@game/content/balance"
import { $save } from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { UnitAvatar } from "../components/UnitAvatar"
import { StatBar } from "../components/Stats"
import { useToast } from "../components/Toast"
import { RewardPicker } from "../components/RewardPicker"
import { STAT_LABELS, difficultyName, g, plural } from "../lib/format"
import { stagger, useCountUp } from "../lib/animate"
import { haptic } from "@game/platform/haptics"

/** Нарастающие задержки появления карточек итогов: каждый вызов прибавляет шаг. */
function delaySequence(start: number): (step?: number) => number {
  let delay = start
  return (step = 90) => (delay += step)
}

const CONFETTI_COLORS = ["#ffffff", "#e63946", "#ffffff", "#ff2d4a", "#ffd166", "#ffffff"]
const SPLAT_SVG = `<svg viewBox="0 0 260 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#9e1420">
    <ellipse cx="130" cy="72" rx="96" ry="38" /><ellipse cx="80" cy="60" rx="40" ry="26" />
    <ellipse cx="185" cy="58" rx="36" ry="24" />
    <circle cx="36" cy="40" r="9" /><circle cx="226" cy="36" r="7" /><circle cx="120" cy="22" r="6" />
    <circle cx="160" cy="118" r="8" /><circle cx="60" cy="112" r="5" />
  </g>
</svg>`

function Counter({ value, prefix = "+" }: { value: number, prefix?: string }) {
  const shown = useCountUp(value, 900, { fromZero: true })
  return (
    <span>
      {prefix}
      {shown}
    </span>
  )
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        delay: `${(i % 9) * 0.27}s`,
        dur: `${2.2 + (i % 5) * 0.35}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#fff",
        rot: `${(i * 53) % 360}deg`
      })),
    []
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.dur,
            background: p.color,
            transform: `rotate(${p.rot})`
          }}
        />
      ))}
    </div>
  )
}

function GainChips({ gains, baseDelay }: { gains: Partial<Stats>, baseDelay: number }) {
  const items = STATS.filter(s => gains[s])
  return (
    <span className="gain-chips">
      {items.map((s, i) => (
        <span key={s} className="gain-chip" style={{ animationDelay: `${baseDelay + i * 80}ms` }}>
          {STAT_LABELS[s]}
          {" "}
          +
          {gains[s]}
        </span>
      ))}
    </span>
  )
}

export function BattleResultScreen() {
  const save = useStore($save)
  const lb = save.lastBattle
  const [toastEl, toast] = useToast()

  useEffect(() => {
    if (!lb) navigate("/", true)
  }, [lb])
  const result = lb?.result
  useEffect(() => {
    if (!result) return
    haptic(result === "victory" ? "success" : result === "defeat" ? "error" : "warning")
  }, [result])
  if (!lb) return <div className="screen" />

  const title = lb.result === "victory" ? "ПОБЕДА" : lb.result === "defeat" ? "ПОРАЖЕНИЕ" : "ОТСТУПЛЕНИЕ"
  const mvp = lb.mvpId ? lb.survivors.find(u => u.id === lb.mvpId) : undefined
  const next = delaySequence(300)
  // Карточки появляются сверху вниз: первые задержки берутся в том же порядке, что и в разметке
  const fellDelay = lb.armyFell ? next() : 0
  const rewardsDelay = next()
  const xpDelay = lb.survivors.length > 0 ? next() : 0

  return (
    <div className="screen result-screen">
      <div className="screen-body">
        {lb.result === "victory" && <Confetti />}
        <div className={`result-banner ${lb.result}`}>
          {lb.result === "defeat" && <span className="splat-bg" dangerouslySetInnerHTML={{ __html: SPLAT_SVG }} />}
          <h1>
            <span className="stamp">{title}</span>
          </h1>
          <div className="muted small sub">
            {difficultyName(lb.difficulty)}
            {" "}
            ·
            {biomeDef(lb.biomeId).name}
            {" "}
            ·
            {lb.turns}
            {" "}
            {plural(lb.turns, "ход", "хода", "ходов")}
          </div>
        </div>

        {lb.fallen.length > 0 && (
          <div className="stack">
            <div className="section-title danger">☠ Павшие</div>
            {lb.fallen.map((f, i) => (
              <div key={f.id} className="card fallen-card grave" style={stagger(i, 160)}>
                <UnitAvatar unit={f.unit} size="md" dead />
                <div className="grow">
                  <b>{displayName(f.unit)}</b>
                  <div className="muted small">
                    {unitClassName(f.unit)}
                    , ур.
                    {f.unit.level}
                    {f.killerName ? ` · ${g(f.unit.gender, "убит", "убита")}: ${f.killerName}` : ""}
                    {f.battleTurn ? ` · ход ${f.battleTurn}` : ""}
                  </div>
                  <div className="epitaph">
                    «
                    {f.epitaph}
                    »
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {lb.armyFell && (
          <div className="card warning-box stack pop-in" style={{ animationDelay: `${fellDelay}ms` }}>
            <div>РОСТЕР ПАЛ</div>
            <div className="small" style={{ fontWeight: 400 }}>
              Никого не осталось. Слава начислена; Сержант Барбос в Казарме выдаст новый стартовый ростер.
            </div>
          </div>
        )}

        <div className="card stack pop-in" style={{ animationDelay: `${rewardsDelay}ms` }}>
          <div className="section-title">Награды</div>
          <div className="reward-chips">
            <span className="reward-chip">
              <span className="ico">🦴</span>
              <Counter value={lb.rewards.treats} />
            </span>
            <span className="reward-chip gold">
              <span className="ico">✦</span>
              <Counter value={lb.rewards.glory} />
            </span>
            {lb.rewards.flawless && <span className="chip squad pop">Без потерь +50%</span>}
          </div>
          <div className="muted small">
            {`Выбито из врагов: 🦴 ${lb.rewards.loot}`}
            {lb.result === "victory" && lb.rewards.treats > lb.rewards.loot
              ? ` · за победу: 🦴 ${lb.rewards.treats - lb.rewards.loot}`
              : ""}
          </div>
          {lb.rewards.lost > 0 && (
            <div className="small danger">
              {`${lb.result === "defeat" ? "Поражение" : "Отступление"}: потеряно 🦴 ${lb.rewards.lost} — `
                + "целиком добыча достаётся только победителям."}
            </div>
          )}
          <div className="row wrap small muted">
            <span>
              Убийств:
              {" "}
              <b>{lb.kills}</b>
            </span>
            <span>
              Урона:
              {" "}
              <b>{lb.damage}</b>
            </span>
            {mvp && (
              <span className="chip gold pop">
                🏆 MVP:
                {mvp.name}
              </span>
            )}
          </div>
        </div>

        {lb.survivors.length > 0 && (
          <div className="card ink stack pop-in" style={{ animationDelay: `${xpDelay}ms` }}>
            <div className="section-title">Опыт</div>
            {lb.survivors.map((u, i) => {
              const lvl = lb.levelUps.find(l => l.unitId === u.id)
              const xp = lb.xp[u.id] ?? 0
              const rowDelay = xpDelay + 120 + i * 110
              return (
                <div key={u.id} className="xp-row pop-in" style={{ animationDelay: `${rowDelay}ms` }}>
                  <UnitAvatar unit={u} size="sm" pose={lvl ? "happy" : "idle"} />
                  <div className="info">
                    <div className="name">
                      <span>{displayName(u)}</span>
                      {mvp?.id === u.id && <span className="chip gold">🏆</span>}
                      {lvl && (
                        <span className="lvl-arrow" style={{ animationDelay: `${rowDelay + 300}ms` }}>
                          Ур.
                          {" "}
                          {lvl.from}
                          {" "}
                          →
                          {" "}
                          {lvl.to}
                        </span>
                      )}
                    </div>
                    <div className="xp-line">
                      <StatBar
                        value={Math.min(XP.perLevel, u.xp)}
                        max={XP.perLevel}
                        kind="xp"
                        animate
                        delay={rowDelay + 150}
                      />
                      <span>
                        <Counter value={xp} />
                        {" "}
                        XP
                      </span>
                    </div>
                    {lvl && <GainChips gains={lvl.gains} baseDelay={rowDelay + 350} />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <RewardPicker toast={toast} />

        <div className="stack">
          <Button
            primary
            big
            block
            icon="🏡"
            className="pop-in"
            style={{ animationDelay: `${next(120)}ms` }}
            onClick={() => navigate("/village", true)}
          >
            В деревню
          </Button>
        </div>
      </div>
      {toastEl}
    </div>
  )
}
