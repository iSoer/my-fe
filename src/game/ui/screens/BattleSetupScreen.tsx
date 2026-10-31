import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { BattleMode, Difficulty, SaveGame } from "@game/core/types"
import { drinkForBattle } from "@game/core/settlement/tavern"
import { drinkDef } from "@game/content/tavern"
import { drinkEffects } from "../lib/format"
import { DIFFICULTIES, EXPEDITION } from "@game/content/balance"
import { biomeDef } from "@game/content/biomes"
import {
  $save,
  $sortieMode,
  difficultyUnlocked,
  enemyTeams,
  ensureRoster,
  ensureSortieSeed,
  scoutBattle,
  type EnemyTeamOffer
} from "@game/state/save"
import { rosterLevel } from "@game/core/progression"
import { factionDef } from "@game/content/factions"
import { UnitAvatar } from "../components/UnitAvatar"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { stagger } from "../lib/animate"
import { haptic } from "@game/platform/haptics"
import { plural, tr } from "@game/i18n"
import "../squad.css"

export const DIFF_STYLE: Record<Difficulty, { icon: string, color: string, rgb: string }> = {
  easy: { icon: "🌱", color: "#9ad66b", rgb: "154, 214, 107" },
  normal: { icon: "⚔️", color: "#8fc9ff", rgb: "143, 201, 255" },
  hard: { icon: "🔥", color: "#ffb86b", rgb: "255, 184, 107" },
  nightmare: { icon: "💀", color: "#ff5a68", rgb: "255, 90, 104" }
}

const BIOME_ICON: Record<string, string> = {
  yard: "🏡",
  roofs: "🏙️",
  basement: "🕯️",
  dump: "🗑️",
  winter_park: "❄️",
  jungle: "🌴",
  desert: "🏜️",
  glacier: "🧊",
  canyon: "🏞️",
  deep_forest: "🌲",
  indoors: "🛋️",
  factory: "🏭",
  infested: "☣️"
}

const TEAM_RANK = (team: number): string =>
  [tr("Recruits", "Новобранцы"), tr("Fighters", "Бойцы"), tr("Veterans", "Ветераны"), tr("Elite", "Элита")][team] ?? ""

/** Команда, ближайшая к уровню армии: её окно содержит уровень или ближе всех к нему. */
function closestTeam(offers: EnemyTeamOffer[], level: number): number {
  let best = 0
  let bestGap = Infinity
  for (const o of offers) {
    const gap = level < o.levels[0] ? o.levels[0] - level : level > o.levels[1] ? level - o.levels[1] : 0
    if (gap < bestGap) {
      best = o.team
      bestGap = gap
    }
  }
  return best
}

/** Карточка вражеской команды: уровни героев, кто в ней, награда за победу и сколько опыта даст. */
function TeamCard({ offer, selected, onPick, index }: { offer: EnemyTeamOffer, selected: boolean, onPick: () => void, index: number }) {
  const faction = factionDef(offer.map.factionId)
  const shown = offer.map.enemies.slice(0, 6)
  const xp = offer.xp === "less"
    ? { cls: "less", text: tr("less XP — you outlevel them", "меньше опыта — вы сильнее") }
    : offer.xp === "more"
      ? { cls: "more", text: tr("more XP — they outlevel you", "больше опыта — они сильнее") }
      : { cls: "", text: tr("XP as usual", "обычный опыт") }
  return (
    <button type="button" className={`team-card pop-in ${selected ? "selected" : ""}`} style={stagger(index, 50)} onClick={onPick}>
      <div className="team-head">
        <span className="team-levels">{`${tr("Lv.", "Ур.")} ${offer.levels[0]}–${offer.levels[1]}`}</span>
        <span className="team-name">
          <b>{TEAM_RANK(offer.team)}</b>
          <span className="muted small">{` · ${faction.name}`}</span>
          <span className="team-biome small"><IconText text={`${BIOME_ICON[offer.map.biomeId] ?? "🗺️"} ${biomeDef(offer.map.biomeId).name}`} /></span>
        </span>
      </div>
      <div className="team-foes">
        {shown.map(e => (
          <span key={e.unit.id} className="team-foe">
            <UnitAvatar unit={e.unit} size="sm" />
            <span className="team-foe-lv">{e.unit.level}</span>
          </span>
        ))}
        {offer.count > shown.length && <span className="team-more">{`+${offer.count - shown.length}`}</span>}
      </div>
      <div className="team-foot">
        <span className="small">
          {offer.map.expedition
            ? tr(
                `${offer.map.expedition.chests.length} chests · ${offer.count} guards`,
                `сундуков: ${offer.map.expedition.chests.length} · стражей: ${offer.count}`
              )
            : tr(`${offer.count} enemies`, `врагов: ${offer.count}`)}
          {offer.reinforcements > 0 ? tr(` (${offer.reinforcements} as reinforcements)`, ` (из них ${offer.reinforcements} — подкрепление)`) : ""}
        </span>
        <span className="team-reward">
          <IconText text={`🦴 ${offer.treats} · ✦ ${offer.glory}`} />
          <small>{offer.map.expedition ? tr(" for escaping + chests + loot", " за уход + сундуки + добыча") : tr(" for victory + loot", " за победу + добыча")}</small>
        </span>
        <span className={`team-xp ${xp.cls}`}>{xp.text}</span>
      </div>
    </button>
  )
}

const MODES: { id: BattleMode, icon: string, name: () => string, desc: () => string }[] = [
  {
    id: "skirmish",
    icon: "⚔️",
    name: () => tr("Skirmish", "Схватка"),
    desc: () => tr("A small field: rout the enemy army.", "Небольшое поле: разбейте вражескую армию.")
  },
  {
    id: "expedition",
    icon: "🌲",
    name: () => tr("Dark Thicket", "Мрачная чаща"),
    desc: () => tr(
      `A forest ${EXPEDITION.w}×${EXPEDITION.h}: guarded chests, a key on one guard, escape through the glowing corner.`,
      `Лес ${EXPEDITION.w}×${EXPEDITION.h}: сундуки под охраной, ключ у одного из стражей, уход — через светящийся угол.`
    )
  }
]

/** Кружка из бара на эту вылазку: что выпьет отряд перед боем. */
function DrinkNote({ save }: { save: SaveGame }) {
  const drink = drinkForBattle(save.settlement.drink)
  const def = drink && drinkDef(drink.id)
  if (!drink || !def) return null
  return (
    <div className="card drink-note">
      <span aria-hidden="true"><Icon emoji={def.icon} /></span>
      <span className="small">
        <b>{tr(`Before the fight: ${def.name}`, `Перед боем: ${def.name}`)}</b>
        {` · ${drinkEffects(drink.pct)}`}
      </span>
    </div>
  )
}

/** Вылазка, шаг 1 из 4: режим — карточки друг под другом; тап выбирает режим и ведёт к выбору сложности. */
export function BattleSetupScreen() {
  const save = useStore($save)
  const mode = useStore($sortieMode)

  useEffect(() => {
    ensureRoster()
    ensureSortieSeed()
  }, [])

  return (
    <div className="screen">
      <TopBar title={tr("Sortie · 1/4", "Вылазка · 1/4")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="screen-body">
        <DrinkNote save={save} />
        <div className="section-title">{tr("Mode", "Режим")}</div>
        <div className="mode-pick">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              aria-label={m.name()}
              className={`mode-card pop-in ${mode === m.id ? "selected" : ""}`}
              style={stagger(i, 60)}
              onClick={() => {
                haptic("select")
                $sortieMode.set(m.id)
                navigate("/battle/difficulty")
              }}
            >
              <span className="mode-ico" aria-hidden="true"><Icon emoji={m.icon} /></span>
              <span className="mode-body">
                <b>{m.name()}</b>
                <span className="muted small">{m.desc()}</span>
              </span>
              <span className="mode-go" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Вылазка, шаг 2 из 4: сложность в выбранном режиме. Тап по открытой сложности ведёт к выбору вражеской армии. */
export function DifficultyScreen() {
  const save = useStore($save)
  const mode = useStore($sortieMode)
  const [toastEl, toast] = useToast()
  const modeDef = MODES.find(m => m.id === mode)

  useEffect(() => {
    ensureRoster()
    ensureSortieSeed()
  }, [])

  return (
    <div className="screen">
      <TopBar title={tr("Sortie · 2/4", "Вылазка · 2/4")} right={<ResourceBar />} onBack={() => navigate("/battle/setup", true)} />
      <div className="screen-body">
        <div className="section-title">
          <IconText text={`${tr("Difficulty", "Сложность")}${modeDef ? ` · ${modeDef.icon} ${modeDef.name()}` : ""}`} />
        </div>
        <div className="stack">
          {DIFFICULTIES.map((d, i) => {
            const unlocked = difficultyUnlocked(save, d.id)
            const st = DIFF_STYLE[d.id]
            const rules: string[] = []
            if (d.reinforcements.length)
              rules.push(`${tr("reinforcements (turn", "подкрепления (ход")} ${d.reinforcements.map(r => r.turn).join(", ")})`)
            if (d.boss) rules.push(tr("leader", "вожак"))
            if (d.objective === "killBoss") rules.push(tr("goal: kill the leader", "цель: убить вожака"))
            const unlockName = DIFFICULTIES.find(x => x.id === d.unlock?.difficulty)?.name
            const unlockWins = d.unlock?.wins ?? 0
            const winsWord = plural(unlockWins, ["win", "wins"], ["победы", "побед", "побед"])
            const unlockText = d.unlock
              ? tr(`after ${unlockWins} ${winsWord} on “${unlockName}”`, `после ${unlockWins} ${winsWord} на «${unlockName}»`)
              : ""
            const pick = () => {
              if (!unlocked) return toast(`${tr("Unlocks", "Откроется")} ${unlockText}`)
              haptic("select")
              navigate(`/battle/enemy/${d.id}`)
            }
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                aria-label={d.name}
                className={`card clickable diff-card pop-in ${unlocked ? "" : "locked"}`}
                style={{ ...stagger(i, 60), "--diff-color": st.color, "--diff-rgb": st.rgb } as Record<string, string>}
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return
                  e.preventDefault()
                  pick()
                }}
              >
                <span className="diff-ico" aria-hidden="true">
                  <Icon emoji={unlocked ? st.icon : "🔒"} />
                </span>
                <div className="diff-body">
                  <b>
                    {d.name}
                    <span className="muted small">{`  ·  ${tr("Lv.", "ур.")} ${d.levels[0]}–${d.levels[1]}`}</span>
                  </b>
                  <div className="muted small">{unlocked ? d.desc : `${tr("Locked", "Закрыто")}: ${unlockText}`}</div>
                  <div className="diff-meta">
                    <span className="chip"><IconText text={`🦴 ×${d.treatsMult}`} /></span>
                    <span className="chip gold">{`✦ ${d.glory}`}</span>
                    {rules.map(r => (
                      <span key={r} className="chip red">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                {unlocked && <span className="diff-go" aria-hidden="true">›</span>}
              </div>
            )
          })}
        </div>
      </div>
      {toastEl}
    </div>
  )
}

/**
 * Вылазка, шаг 3 из 4: вражеская армия на выбранной сложности (биом у каждой случайный).
 * По умолчанию выбрана ближайшая к уровню армии игрока; «Далее» разведывает бой и ведёт к выбору отряда.
 */
export function EnemyTeamScreen({ difficulty }: { difficulty: Difficulty }) {
  const save = useStore($save)
  const mode = useStore($sortieMode)
  const pending = save.pendingBattle
  const samePending = pending?.difficulty === difficulty && (pending.map.mode ?? "skirmish") === mode
  const [team, setTeam] = useState<number | null>(samePending ? pending.team : null)
  const [toastEl, toast] = useToast()
  const unlocked = difficultyUnlocked(save, difficulty)

  useEffect(() => {
    ensureRoster()
    ensureSortieSeed()
  }, [])
  // Закрытая сложность по прямой ссылке — назад к выбору сложности
  useEffect(() => {
    if (!unlocked) navigate("/battle/difficulty", true)
  }, [unlocked])

  // Команды появляются, когда есть зерно вылазки (создаётся при входе на экран)
  const offers = unlocked && save.sortieSeed !== undefined && save.army ? enemyTeams(difficulty, mode) : []
  const armyLevel = rosterLevel(save.army)
  const picked = team ?? closestTeam(offers, armyLevel)
  const diff = DIFFICULTIES.find(d => d.id === difficulty)
  const st = DIFF_STYLE[difficulty]

  const onNext = () => {
    const r = scoutBattle(difficulty, picked, mode)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("medium")
    navigate("/battle/squad")
  }

  return (
    <div className="screen">
      <TopBar title={tr("Sortie · 3/4", "Вылазка · 3/4")} right={<ResourceBar />} onBack={() => navigate("/battle/difficulty", true)} />
      <div className="screen-body">
        <div className="row between">
          <div className="section-title">
            <IconText text={`${st.icon} ${diff?.name ?? ""} · ${mode === "expedition" ? tr("thicket guards", "стражи чащи") : tr("enemy army", "армия врага")}`} />
          </div>
          <span className="muted small">{tr(`your army: Lv. ${armyLevel}`, `ваша армия: ур. ${armyLevel}`)}</span>
        </div>
        <div className="stack">
          {offers.map((o, i) => (
            <TeamCard
              key={`${difficulty}:${o.team}`}
              offer={o}
              index={i}
              selected={picked === o.team}
              onPick={() => {
                haptic("select")
                setTeam(o.team)
              }}
            />
          ))}
        </div>
        <p className="muted small">
          {tr(
            "Teams stay the same until your next battle. Beating a weaker team gives less XP (at least 1).",
            "Команды не меняются до следующего боя. Победа над более слабой командой даёт меньше опыта (минимум 1)."
          )}
        </p>
        <div className="sticky-cta">
          <Button big primary block icon="🔎" onClick={onNext}>
            {tr("Next", "Далее")}
          </Button>
        </div>
      </div>
      {toastEl}
    </div>
  )
}

import { Icon, IconText } from "../components/Icon"