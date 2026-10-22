import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { Difficulty } from "@game/core/types"
import { DIFFICULTIES } from "@game/content/balance"
import { biomeDef } from "@game/content/biomes"
import { $save, $unlockedBiomes, difficultyUnlocked, ensureRoster, scoutBattle } from "@game/state/save"
import { navigate } from "@game/state/router"
import { Button } from "../components/Button"
import { TopBar } from "../components/TopBar"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { stagger } from "../lib/animate"
import { haptic } from "@game/platform/haptics"
import "../squad.css"

export const DIFF_STYLE: Record<Difficulty, { icon: string, color: string, rgb: string }> = {
  easy: { icon: "🌱", color: "#9ad66b", rgb: "154, 214, 107" },
  normal: { icon: "⚔️", color: "#8fc9ff", rgb: "143, 201, 255" },
  hard: { icon: "🔥", color: "#ffb86b", rgb: "255, 184, 107" },
  nightmare: { icon: "💀", color: "#ff5a68", rgb: "255, 90, 104" }
}

const BIOME_ICON: Record<string, string> = { yard: "🏡", roofs: "🏙️", basement: "🕯️", dump: "🗑️", winter_park: "❄️" }

/** Вылазка, шаг 1 из 2: сложность и биом. «Далее» разведывает бой и ведёт к выбору отряда. */
export function BattleSetupScreen() {
  const save = useStore($save)
  const biomes = useStore($unlockedBiomes)
  const pending = save.pendingBattle
  const [difficulty, setDifficulty] = useState<Difficulty>(pending?.difficulty ?? "easy")
  const [biome, setBiome] = useState<string>(pending?.biomeId ?? "random")
  const [toastEl, toast] = useToast()

  useEffect(() => {
    ensureRoster()
  }, [])

  const onNext = () => {
    const r = scoutBattle(difficulty, biome)
    if (!r.ok) return toast(r.error ?? "Ошибка", true)
    haptic("medium")
    navigate("/battle/squad")
  }

  return (
    <div className="screen">
      <TopBar title="Вылазка · 1/2" right={<ResourceBar />} onBack={() => navigate("/village", true)} />
      <div className="screen-body">
        <div className="section-title">Сложность</div>
        <div className="stack">
          {DIFFICULTIES.map((d, i) => {
            const unlocked = difficultyUnlocked(save, d.id)
            const st = DIFF_STYLE[d.id]
            const rules: string[] = []
            if (d.reinforcements.length)
              rules.push(`подкрепления (ход ${d.reinforcements.map(r => r.turn).join(", ")})`)
            if (d.boss) rules.push("вожак")
            if (d.objective === "killBoss") rules.push("цель: убить вожака")
            const unlockText = d.unlock
              ? `после ${d.unlock.wins} побед на «${DIFFICULTIES.find(x => x.id === d.unlock?.difficulty)?.name}»`
              : ""
            return (
              <div
                key={d.id}
                className={`card clickable diff-card pop-in ${difficulty === d.id ? "selected" : ""} ${unlocked ? "" : "locked"}`}
                style={{ ...stagger(i, 60), "--diff-color": st.color, "--diff-rgb": st.rgb } as Record<string, string>}
                onClick={() => {
                  if (!unlocked) return toast(`Откроется ${unlockText}`)
                  haptic("select")
                  setDifficulty(d.id)
                }}
              >
                <span className="diff-ico" aria-hidden="true">
                  {unlocked ? st.icon : "🔒"}
                </span>
                <div className="diff-body">
                  <b>{d.name}</b>
                  <div className="muted small">{unlocked ? d.desc : `Закрыто: ${unlockText}`}</div>
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

        <div className="section-title">Биом</div>
        <div className="biome-chips">
          <Button sm primary={biome === "random"} icon="🎲" onClick={() => setBiome("random")}>
            Случайно
          </Button>
          {biomes.map(id => (
            <Button key={id} sm primary={biome === id} icon={BIOME_ICON[id] ?? "🗺️"} onClick={() => setBiome(id)}>
              {biomeDef(id).name}
            </Button>
          ))}
        </div>

        <p className="muted small">Враги и подкрепления будут видны на следующем шаге — до выбора отряда.</p>
        <div className="sticky-cta">
          <Button big primary block icon="🔎" onClick={onNext}>
            Далее
          </Button>
        </div>
      </div>
      {toastEl}
    </div>
  )
}
