import { useEffect, useMemo, useState } from "react"
import { useStore } from "@nanostores/react"
import { STATS } from "@game/core/types"
import type { SaveGame, UnitInstance } from "@game/core/types"
import { MAX_LEVEL, attackStatOf } from "@game/core/types"
import { isMagicWeapon } from "@game/content/weapons"
import { displayName, unitClassName, visibleStats } from "@game/core/units"
import { itemInfo } from "@game/core/items"
import { biomeDef } from "@game/content/biomes"
import { BATTLE, XP } from "@game/content/balance"
import { $save } from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { UnitAvatar } from "../components/UnitAvatar"
import { StatBar } from "../components/Stats"
import { useToast } from "../components/Toast"
import { RewardPicker } from "../components/RewardPicker"
import { LevelUpModal, type LevelUpView } from "../components/LevelUpModal"
import { STAT_LABELS, difficultyName, g } from "../lib/format"
import { plural, tr } from "@game/i18n"
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

type ResultStep = "rewards" | "progress" | "recruit"

/**
 * Итоги боя по шагам: 1) награда, 2) прогресс бойцов (опыт, новые уровни) и потери, 3) выбор бесплатного персонажа
 * за бой. Шаги без содержимого пропускаются (нет выживших и павших — нет второго, нет награды-персонажа — третьего).
 */
export function BattleResultScreen() {
  const save = useStore($save)
  const lb = save.lastBattle
  const [toastEl, toast] = useToast()
  // Набор шагов фиксируется при входе: после выбора персонажа шаг «Новый боец» не исчезает из-под рук
  const [steps] = useState<ResultStep[]>(() => {
    const out: ResultStep[] = ["rewards"]
    if (lb && (lb.survivors.length > 0 || lb.fallen.length > 0)) out.push("progress")
    if (save.rewardChoice?.length) out.push("recruit")
    return out
  })
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex] ?? "rewards"
  const last = stepIndex >= steps.length - 1
  const [recruited, setRecruited] = useState<string | null>(null)

  useEffect(() => {
    if (!lb) navigate("/", true)
  }, [lb])
  const result = lb?.result
  useEffect(() => {
    if (!result) return
    haptic(result === "victory" ? "success" : result === "defeat" ? "error" : "warning")
  }, [result])

  // Повышения уровня за бой: на шаге прогресса окна «Новый уровень» по очереди, когда доиграет полоса опыта
  const levelViews = useMemo<LevelUpView[]>(() => {
    if (!lb) return []
    return lb.levelUps.flatMap((l) => {
      // Бойцы с полигона в отряде не были — их ищем в армии
      const unit = lb.survivors.find(u => u.id === l.unitId) ?? save.army?.units.find(u => u.id === l.unitId)
      return unit ? [{ unit, from: l.from, to: l.to }] : []
    })
  }, [lb, save.army])
  const [shown, setShown] = useState<{ index: number, chain: boolean } | null>(null)
  const [levelsShown, setLevelsShown] = useState(false)
  const autoDelay = lb ? 500 + lb.survivors.length * 110 : 0
  useEffect(() => {
    if (step !== "progress" || levelsShown || levelViews.length === 0) return
    const t = window.setTimeout(() => {
      setShown({ index: 0, chain: true })
      setLevelsShown(true)
    }, autoDelay)
    return () => window.clearTimeout(t)
  }, [step, levelsShown, levelViews, autoDelay])
  const closeLevelUp = () =>
    setShown(cur => (cur && cur.chain && cur.index + 1 < levelViews.length ? { index: cur.index + 1, chain: true } : null))

  if (!lb) return <div className="screen" />

  const title = lb.result === "victory"
    ? tr("VICTORY", "ПОБЕДА")
    : lb.result === "defeat"
      ? tr("DEFEAT", "ПОРАЖЕНИЕ")
      : lb.timeUp ? tr("TIME'S UP", "ВРЕМЯ ВЫШЛО") : tr("RETREAT", "ОТСТУПЛЕНИЕ")
  const mvp = lb.mvpId ? lb.survivors.find(u => u.id === lb.mvpId) : undefined
  const stepTitle: Record<ResultStep, string> = {
    rewards: tr("Rewards", "Награда"),
    progress: tr("Fighters", "Бойцы"),
    recruit: tr("New fighter", "Новый боец")
  }
  const goNext = () => {
    haptic("select")
    if (last) navigate("/village", true)
    else setStepIndex(stepIndex + 1)
  }

  return (
    <div className="screen result-screen">
      <div className="screen-body">
        <div className="result-steps" aria-label={tr("Battle results steps", "Шаги итогов боя")}>
          {steps.map((s, i) => (
            <span key={s} className={`result-step ${i === stepIndex ? "on" : i < stepIndex ? "done" : ""}`}>
              {`${i + 1}. ${stepTitle[s]}`}
            </span>
          ))}
        </div>

        {step === "rewards" && <RewardsStep lb={lb} title={title} mvp={mvp} profile={save.profile} />}
        {step === "progress" && (
          <ProgressStep
            lb={lb}
            mvpId={mvp?.id}
            onShowLevel={(unitId) => {
              const index = levelViews.findIndex(v => v.unit.id === unitId)
              if (index >= 0) setShown({ index, chain: false })
            }}
          />
        )}
        {step === "recruit" && (
          <>
            <RewardPicker toast={toast} onClaimed={u => setRecruited(u.name)} />
            {!save.rewardChoice?.length && (
              <div className="card stack pop-in">
                <div className="section-title">{tr("New fighter", "Новый боец")}</div>
                <p className="muted">
                  {recruited
                    ? tr(`${recruited} joined your Roster. See them in the Barracks.`, `${recruited} в вашем ростере — загляните в Казарму.`)
                    : tr("You declined the reward this time.", "В этот раз вы отказались от награды.")}
                </p>
              </div>
            )}
          </>
        )}

        {/* Кнопка шага всегда внизу экрана: короткий шаг прижимает её к низу, длинный — она прилипает при прокрутке */}
        <div className="sticky-cta res-cta">
          <Button
            primary
            big
            block
            icon={last ? "🏡" : "➜"}
            className="pop-in"
            onClick={goNext}
          >
            {last ? tr("To the village", "В деревню") : tr("Next", "Далее")}
          </Button>
        </div>
      </div>
      <LevelUpModal
        view={shown ? levelViews[shown.index] ?? null : null}
        onClose={closeLevelUp}
        closeLabel={shown?.chain && shown.index + 1 < levelViews.length ? tr("Next", "Дальше") : undefined}
      />
      {toastEl}
    </div>
  )
}

type LastBattle = NonNullable<SaveGame["lastBattle"]>

/** Плитка-цифра итогов: крупное число и подпись. */
function StatTile({ icon, value, label }: { icon: string, value: number | string, label: string }) {
  return (
    <div className="res-tile">
      <span className="res-tile-ico" aria-hidden="true">{icon}</span>
      <b>{value}</b>
      <span className="res-tile-label">{label}</span>
    </div>
  )
}

/** Шаг 1: исход боя и награда — крупные суммы с итогом в копилке, из чего сложилась награда, статистика боя и MVP. */
function RewardsStep({ lb, title, mvp, profile }: { lb: LastBattle, title: string, mvp?: UnitInstance, profile: SaveGame["profile"] }) {
  const next = delaySequence(200)
  const fellDelay = lb.armyFell ? next() : 0
  const recruitsDelay = lb.recruits?.length ? next() : 0
  const rewardsDelay = next()
  const statsDelay = next()
  const mvpDelay = next()
  const kept = lb.rewards.loot - lb.rewards.lost
  const victoryBonus = Math.max(0, lb.rewards.treats - kept)
  const squad = lb.survivors.length + lb.fallen.length
  const rows: { label: string, value: string, cls?: string }[] = [
    { label: tr("Looted from enemies", "Выбито из врагов"), value: `🦴 ${lb.rewards.loot}` }
  ]
  if (lb.rewards.lost > 0)
    rows.push({
      label: lb.result === "defeat" ? tr("Lost in defeat", "Потеряно при поражении") : tr("Lost in retreat", "Потеряно при отступлении"),
      value: `−🦴 ${lb.rewards.lost}`,
      cls: "danger"
    })
  if (lb.result === "victory" && victoryBonus > 0)
    rows.push({ label: tr("Victory bonus", "Бонус за победу"), value: `+🦴 ${victoryBonus}` })
  if (lb.rewards.flawless) rows.push({ label: tr("Flawless: no losses", "Без потерь"), value: "+50%", cls: "ok" })
  if (lb.rewards.glory > 0) rows.push({ label: tr("Glory", "Слава"), value: `+✦ ${lb.rewards.glory}` })
  return (
    <>
      {lb.result === "victory" && <Confetti />}
      <div className={`result-banner ${lb.result}`}>
        {lb.result === "defeat" && <span className="splat-bg" dangerouslySetInnerHTML={{ __html: SPLAT_SVG }} />}
        <h1>
          <span className="stamp">{title}</span>
        </h1>
        <div className="muted small sub">
          {`${difficultyName(lb.difficulty)} · ${biomeDef(lb.biomeId).name}`}
          {lb.result === "victory" ? ` · ${tr("wins here", "побед на сложности")}: ${profile.wins[lb.difficulty] ?? 0}` : ""}
        </div>
      </div>

      {lb.timeUp && (
        <div className="card warning-box stack pop-in">
          <div>{tr(`${BATTLE.turnLimit} TURNS ARE OVER`, `ПРОШЛО ${BATTLE.turnLimit} ХОДОВ`)}</div>
          <div className="small" style={{ fontWeight: 400 }}>
            {tr(
              "The squad retreated: surviving fighters are back, the loot is partly lost.",
              "Отряд отступил: выжившие бойцы вернулись, часть добычи потеряна."
            )}
          </div>
        </div>
      )}

      {lb.armyFell && (
        <div className="card warning-box stack pop-in" style={{ animationDelay: `${fellDelay}ms` }}>
          <div>{tr("ROSTER WIPED OUT", "РОСТЕР ПАЛ")}</div>
          <div className="small" style={{ fontWeight: 400 }}>
            {tr(
              "Nobody’s left. Glory has been awarded; Sergeant Barkley in the Barracks will issue a new starter roster.",
              "Никого не осталось. Слава начислена; Сержант Барбос в Казарме выдаст новый стартовый ростер."
            )}
          </div>
        </div>
      )}

      {lb.found && lb.found.length > 0 && (
        <div className="card stack pop-in" style={{ animationDelay: `${recruitsDelay}ms` }}>
          <div className="section-title">{tr("Found in chests", "Найдено в сундуках")}</div>
          <p className="small muted" style={{ margin: 0 }}>{tr("The squad carried these out — they are in the Army inventory.", "Отряд вынес это из чащи — всё уже в инвентаре армии.")}</p>
          {lb.found.map((id, i) => {
            const it = itemInfo(id)
            return (
              <div key={`${id}:${i}`} className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 24 }} aria-hidden="true">{it.icon}</span>
                <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                  <b>{it.name}</b>
                  <span className="small muted">{it.desc}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lb.recruits && lb.recruits.length > 0 && (
        <div className="card stack pop-in" style={{ animationDelay: `${recruitsDelay}ms` }}>
          <div className="section-title">{tr("Reinforcements", "Подкрепление")}</div>
          <p className="small muted" style={{ margin: 0 }}>
            {tr(
              "Too few fighters were left for a squad — recruits joined the Barracks for free, filling the roles the squad lacks.",
              "Бойцов осталось меньше, чем мест в отряде, — в Казармы бесплатно пришли новобранцы на роли, которых не хватало."
            )}
          </p>
          {lb.recruits.map(u => (
            <div key={u.id} className="row" style={{ gap: 10 }}>
              <UnitAvatar unit={u} size="md" animated={false} />
              <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                <b>{displayName(u)}</b>
                <span className="small muted">{`${"★".repeat(u.rarity)} · ${unitClassName(u)} · ${tr("Lv.", "Ур.")} ${u.level}`}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack pop-in res-rewards" style={{ animationDelay: `${rewardsDelay}ms` }}>
        <div className="section-title">{tr("Rewards", "Награды")}</div>
        <div className="res-big">
          <div className="res-big-item">
            <span className="res-big-ico" aria-hidden="true">🦴</span>
            <b><Counter value={lb.rewards.treats} /></b>
            <span className="res-big-label">{tr("Treats", "Вкусняшки")}</span>
            <span className="res-big-total">{tr(`now ${profile.treats}`, `теперь ${profile.treats}`)}</span>
          </div>
          <div className="res-big-item gold">
            <span className="res-big-ico" aria-hidden="true">✦</span>
            <b><Counter value={lb.rewards.glory} /></b>
            <span className="res-big-label">{tr("Glory", "Слава")}</span>
            <span className="res-big-total">{tr(`now ${profile.glory}`, `теперь ${profile.glory}`)}</span>
          </div>
        </div>
        <div className="res-rows">
          {rows.map(r => (
            <div key={r.label} className={`res-row ${r.cls ?? ""}`}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </div>
          ))}
        </div>
        {lb.rewards.lost > 0 && (
          <div className="small muted">{tr("Only winners keep all the loot.", "Целиком добыча достаётся только победителям.")}</div>
        )}
      </div>

      <div className="res-tiles pop-in" style={{ animationDelay: `${statsDelay}ms` }}>
        <StatTile icon="⏱" value={lb.turns} label={plural(lb.turns, ["turn", "turns"], ["ход", "хода", "ходов"])} />
        <StatTile icon="⚔" value={lb.kills} label={tr("kills", "убийств")} />
        <StatTile icon="💥" value={lb.damage} label={tr("damage", "урона")} />
        <StatTile icon="🐾" value={`${lb.survivors.length}/${squad}`} label={tr("survived", "выжили")} />
      </div>

      {mvp && (
        <div className="card ink res-mvp pop-in" style={{ animationDelay: `${mvpDelay}ms` }}>
          <UnitAvatar unit={mvp} size="md" pose="happy" />
          <div className="grow">
            <span className="res-mvp-tag">🏆 MVP</span>
            <b className="res-mvp-name">{displayName(mvp)}</b>
            <div className="muted small">{`${unitClassName(mvp)} · ${tr("Lv.", "Ур.")} ${mvp.level} · +${lb.xp[mvp.id] ?? 0} XP`}</div>
          </div>
        </div>
      )}
    </>
  )
}

/** Шаг 2: каждый выживший — опыт до следующего уровня и, если вырос, все характеристики «стало» с приростом; затем павшие. */
function ProgressStep({ lb, mvpId, onShowLevel }: { lb: LastBattle, mvpId?: string, onShowLevel: (unitId: string) => void }) {
  return (
    <>
      {lb.survivors.length > 0 && <div className="section-title">{tr("Experience", "Опыт")}</div>}
      {lb.survivors.map((u, i) => {
        const lvl = lb.levelUps.find(l => l.unitId === u.id)
        const xp = lb.xp[u.id] ?? 0
        const rowDelay = 150 + i * 120
        const after = visibleStats(u)
        const before = lvl ? visibleStats({ ...u, level: lvl.from }) : after
        const main = attackStatOf(isMagicWeapon(u.weaponSkill))
        return (
          <div key={u.id} className={`card ink res-fighter pop-in ${lvl ? "leveled" : ""}`} style={{ animationDelay: `${rowDelay}ms` }}>
            <div className="res-fighter-head">
              <UnitAvatar unit={u} size="md" pose={lvl ? "happy" : "idle"} />
              <div className="grow">
                <div className="res-fighter-name">
                  <b>{displayName(u)}</b>
                  {mvpId === u.id && <span className="chip gold">🏆</span>}
                </div>
                <div className="muted small">{unitClassName(u)}</div>
                {lvl
                  ? (
                      <button
                        type="button"
                        className="lvl-arrow"
                        style={{ animationDelay: `${rowDelay + 300}ms` }}
                        aria-label={tr("Show level up", "Показать новый уровень")}
                        onClick={() => onShowLevel(u.id)}
                      >
                        {`${tr("Lv.", "Ур.")} ${lvl.from} → ${lvl.to}`}
                      </button>
                    )
                  : <span className="res-fighter-lv">{`${tr("Lv.", "Ур.")} ${u.level}`}</span>}
              </div>
              <span className="res-fighter-xp">
                <Counter value={xp} />
                <small> XP</small>
              </span>
            </div>
            <div className="xp-line">
              <StatBar value={Math.min(XP.perLevel, u.xp)} max={XP.perLevel} kind="xp" animate delay={rowDelay + 150} />
              <span>{u.level >= MAX_LEVEL ? tr("max level", "макс. уровень") : tr(`${u.xp}/${XP.perLevel} to Lv. ${u.level + 1}`, `${u.xp}/${XP.perLevel} до ур. ${u.level + 1}`)}</span>
            </div>
            {lvl && (
              <div className="res-gains">
                {STATS.map((s, k) => {
                  const gain = after[s] - before[s]
                  return (
                    <span
                      key={s}
                      className={`res-gain ${gain > 0 ? "up" : ""} ${s === main ? "main" : ""}`}
                      style={{ animationDelay: `${rowDelay + 350 + k * 60}ms` }}
                    >
                      <small>{STAT_LABELS[s]}</small>
                      <b>{after[s]}</b>
                      {gain > 0 && <em>{`+${gain}`}</em>}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {lb.fallen.length > 0 && (
        <div className="stack">
          <div className="section-title danger">{tr("☠ The Fallen", "☠ Павшие")}</div>
          {lb.fallen.map((f, i) => (
            <div key={f.id} className="card fallen-card grave" style={stagger(i, 160)}>
              <UnitAvatar unit={f.unit} size="md" dead />
              <div className="grow">
                <b>{displayName(f.unit)}</b>
                <div className="muted small">
                  {unitClassName(f.unit)}
                  {tr(", lv.", ", ур.")}
                  {f.unit.level}
                  {f.killerName ? ` · ${tr("killed by", g(f.unit.gender, "убит", "убита"))}: ${f.killerName}` : ""}
                  {f.battleTurn ? ` · ${tr("turn", "ход")} ${f.battleTurn}` : ""}
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
    </>
  )
}
