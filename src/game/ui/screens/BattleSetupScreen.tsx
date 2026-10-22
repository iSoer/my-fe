import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { Difficulty } from "@game/core/types"
import { DIFFICULTIES } from "@game/content/balance"
import { biomeDef } from "@game/content/biomes"
import {
  $save,
  $unlockedBiomes,
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

const BIOME_ICON: Record<string, string> = { yard: "🏡", roofs: "🏙️", basement: "🕯️", dump: "🗑️", winter_park: "❄️" }

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
          {tr(`${offer.count} enemies`, `врагов: ${offer.count}`)}
          {offer.reinforcements > 0 ? tr(` (${offer.reinforcements} as reinforcements)`, ` (из них ${offer.reinforcements} — подкрепление)`) : ""}
        </span>
        <span className="team-reward">
          {`🦴 ${offer.treats} · ✦ ${offer.glory}`}
          <small>{tr(" for victory + loot", " за победу + добыча")}</small>
        </span>
        <span className={`team-xp ${xp.cls}`}>{xp.text}</span>
      </div>
    </button>
  )
}

/** Вылазка, шаг 1 из 2: сложность, биом и вражеская команда. «Далее» разведывает бой и ведёт к выбору отряда. */
export function BattleSetupScreen() {
  const save = useStore($save)
  const biomes = useStore($unlockedBiomes)
  const pending = save.pendingBattle
  const [difficulty, setDifficulty] = useState<Difficulty>(pending?.difficulty ?? "easy")
  const [biome, setBiome] = useState<string>(pending?.biomeId ?? "random")
  const [team, setTeam] = useState<number | null>(pending?.team ?? null)
  const [toastEl, toast] = useToast()

  useEffect(() => {
    ensureRoster()
    ensureSortieSeed()
  }, [])

  // Команды появляются, когда есть зерно вылазки (создаётся при входе на экран)
  const offers = save.sortieSeed !== undefined && save.army ? enemyTeams(difficulty, biome) : []
  const armyLevel = rosterLevel(save.army)
  const picked = team ?? closestTeam(offers, armyLevel)

  const onNext = () => {
    const r = scoutBattle(difficulty, biome, picked)
    if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("medium")
    navigate("/battle/squad")
  }

  return (
    <div className="screen">
      <TopBar title={tr("Sortie · 1/2", "Вылазка · 1/2")} right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="screen-body">
        <div className="section-title">{tr("Difficulty", "Сложность")}</div>
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
            return (
              <div
                key={d.id}
                className={`card clickable diff-card pop-in ${difficulty === d.id ? "selected" : ""} ${unlocked ? "" : "locked"}`}
                style={{ ...stagger(i, 60), "--diff-color": st.color, "--diff-rgb": st.rgb } as Record<string, string>}
                onClick={() => {
                  if (!unlocked) return toast(`${tr("Unlocks", "Откроется")} ${unlockText}`)
                  haptic("select")
                  setDifficulty(d.id)
                  setTeam(null)
                }}
              >
                <span className="diff-ico" aria-hidden="true">
                  {unlocked ? st.icon : "🔒"}
                </span>
                <div className="diff-body">
                  <b>
                    {d.name}
                    <span className="muted small">{`  ·  ${tr("Lv.", "ур.")} ${d.levels[0]}–${d.levels[1]}`}</span>
                  </b>
                  <div className="muted small">{unlocked ? d.desc : `${tr("Locked", "Закрыто")}: ${unlockText}`}</div>
                  <div className="diff-meta">
                    <span className="chip">{`🦴 ×${d.treatsMult}`}</span>
                    <span className="chip gold">{`✦ ${d.glory}`}</span>
                    {rules.map(r => (
                      <span key={r} className="chip red">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="section-title">{tr("Biome", "Биом")}</div>
        <div className="biome-chips">
          <Button sm primary={biome === "random"} icon="🎲" onClick={() => setBiome("random")}>
            {tr("Random", "Случайно")}
          </Button>
          {biomes.map(id => (
            <Button key={id} sm primary={biome === id} icon={BIOME_ICON[id] ?? "🗺️"} onClick={() => setBiome(id)}>
              {biomeDef(id).name}
            </Button>
          ))}
        </div>

        <div className="row between">
          <div className="section-title">{tr("Enemy army", "Армия врага")}</div>
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
