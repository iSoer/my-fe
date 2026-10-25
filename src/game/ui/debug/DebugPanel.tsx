import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { Difficulty, ObjectiveKind, Rarity } from "@game/core/types"
import { DIFFICULTIES } from "@game/content/balance"
import { BIOMES } from "@game/content/biomes"
import { randomSeed } from "@game/core/rng"
import { rosterLevel } from "@game/core/progression"
import { $save } from "@game/state/save"
import { $infinite, debugActions, endBattleAs, initDebug, setInfinite, startDebugBattle, tweakBattle } from "@game/state/debug"
import { Button } from "../components/Button"
import { BottomSheet } from "../components/Sheet"
import "./debug.css"

// Debug-панель (только локальный запуск, см. `DEBUG`): плавающая кнопка 🐞 поверх любого экрана.

type Tab = "res" | "roster" | "camp" | "battle"

const TABS: { id: Tab, label: string }[] = [
  { id: "res", label: "Ресурсы" },
  { id: "roster", label: "Ростер" },
  { id: "camp", label: "Лагерь" },
  { id: "battle", label: "Бой" }
]

function Row({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="dbg-row">
      <span className="dbg-label">{label}</span>
      <div className="dbg-btns">{children}</div>
    </div>
  )
}

function ResourcesTab() {
  const save = useStore($save)
  const infinite = useStore($infinite)
  const p = save.profile
  return (
    <div className="stack">
      <label className="dbg-check">
        <input type="checkbox" checked={infinite} onChange={e => setInfinite(e.target.checked)} />
        <span>Бесконечная валюта (🦴 и 🌾 не кончаются)</span>
      </label>
      <Row label={`🦴 ${p.treats}`}>
        <Button sm onClick={() => debugActions.treats(1000)}>+1k</Button>
        <Button sm onClick={() => debugActions.treats(10000)}>+10k</Button>
        <Button sm ghost onClick={() => debugActions.treats(-p.treats)}>0</Button>
      </Row>
      <Row label={`🌾 ${p.food}`}>
        <Button sm onClick={() => debugActions.food(100)}>+100</Button>
        <Button sm onClick={() => debugActions.food(1000)}>+1k</Button>
        <Button sm ghost onClick={() => debugActions.food(-p.food)}>0</Button>
      </Row>
      <Row label={`✦ ${p.glory}`}>
        <Button sm onClick={() => debugActions.glory(100)}>+100</Button>
        <Button sm onClick={() => debugActions.glory(1000)}>+1k</Button>
        <Button sm ghost onClick={() => debugActions.glory(-p.glory)}>0</Button>
      </Row>
      <Button block onClick={debugActions.unlockAll}>Открыть все сложности и звёзды ★5</Button>
    </div>
  )
}

function RosterTab() {
  const save = useStore($save)
  const [level, setLevel] = useState(20)
  const [rarity, setRarity] = useState<Rarity>(1)
  const army = save.army
  return (
    <div className="stack">
      <p className="muted small">
        {army ? `Бойцов: ${army.units.length}, отряд: ${army.squadIds.length}, уровень ростера: ${rosterLevel(army)}` : "Ростера нет"}
      </p>
      <Row label="Уровень">
        <input className="dbg-input" type="number" min={1} max={80} value={level} onChange={e => setLevel(Number(e.target.value) || 1)} />
        <Button sm onClick={() => debugActions.levels(level, false)}>Всем</Button>
        <Button sm onClick={() => debugActions.levels(level, true)}>Отряду</Button>
      </Row>
      <Row label="Новый боец">
        <select className="dbg-input" value={rarity} onChange={e => setRarity(Number(e.target.value) as Rarity)}>
          {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{"★".repeat(r)}</option>)}
        </select>
        <Button sm onClick={() => debugActions.recruit(level, rarity)}>{`+ ур. ${level}`}</Button>
      </Row>
      <Row label="Прочее">
        <Button sm onClick={() => debugActions.sp(500)}>+500 SP</Button>
        <Button sm onClick={debugActions.clearFatigue}>Снять усталость</Button>
      </Row>
      <Button block onClick={debugActions.allItems}>Всё оружие и талисманы в инвентарь (+1)</Button>
    </div>
  )
}

function CampTab() {
  const save = useStore($save)
  const levels = Object.entries(save.settlement.buildings).map(([id, l]) => `${id} ${l}`).join(" · ")
  return (
    <div className="stack">
      <p className="muted small">{levels}</p>
      <Row label="Все здания">
        {[0, 1, 3, 5].map(l => <Button key={l} sm onClick={() => debugActions.buildings(l)}>{`ур. ${l}`}</Button>)}
      </Row>
      <Row label="Промотать время">
        {[1, 8, 24].map(h => <Button key={h} sm onClick={() => debugActions.skipHours(h)}>{`+${h} ч`}</Button>)}
      </Row>
      <p className="muted small">Время двигает Поля и полигон (их отсчёт сдвигается назад), витрина Лавки — по кнопке.</p>
      <Button block onClick={debugActions.restock}>Новая витрина Лавки</Button>
    </div>
  )
}

function BattleTab({ onDone }: { onDone: () => void }) {
  const save = useStore($save)
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [biomeId, setBiome] = useState("random")
  const [team, setTeam] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState("")
  const [objective, setObjective] = useState<"" | ObjectiveKind>("")
  const [noWaves, setNoWaves] = useState(false)
  const [seed, setSeed] = useState(() => randomSeed())
  const [error, setError] = useState("")
  const live = !!save.battle && !save.battle.result

  const start = (quick: boolean) => {
    const lv = Number(enemyLevel)
    const r = startDebugBattle({
      seed,
      difficulty,
      biomeId,
      team,
      ...(enemyLevel.trim() && lv > 0 ? { enemyLevel: lv } : {}),
      ...(objective ? { objective } : {}),
      noReinforcements: noWaves
    }, quick)
    if (!r.ok) return setError(r.error ?? "Ошибка")
    setError("")
    onDone()
  }
  const end = (fn: () => boolean) => () => {
    if (fn()) onDone()
  }

  if (live) {
    return (
      <div className="stack">
        <p className="muted small">{`Идёт бой: ход ${save.battle?.turn ?? 1}`}</p>
        <Row label="Исход">
          <Button sm primary onClick={end(() => endBattleAs("victory"))}>Победа</Button>
          <Button sm onClick={end(() => endBattleAs("defeat"))}>Поражение</Button>
          <Button sm onClick={end(() => endBattleAs("retreat"))}>Отступление</Button>
        </Row>
        <Row label="Правки">
          <Button sm onClick={end(() => tweakBattle("weaken"))}>Враги на 1 HP</Button>
          <Button sm onClick={end(() => tweakBattle("refresh"))}>Свои: HP и ход</Button>
        </Row>
      </div>
    )
  }
  return (
    <div className="stack">
      <Row label="Сложность">
        <select className="dbg-input" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>
          {DIFFICULTIES.map(d => <option key={d.id} value={d.id}>{`${d.name} (${d.levels[0]}–${d.levels[1]})`}</option>)}
        </select>
      </Row>
      <Row label="Команда">
        {[0, 1, 2, 3].map(t => <Button key={t} sm primary={team === t} onClick={() => setTeam(t)}>{String(t + 1)}</Button>)}
      </Row>
      <Row label="Биом">
        <select className="dbg-input" value={biomeId} onChange={e => setBiome(e.target.value)}>
          <option value="random">Случайный</option>
          {BIOMES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Row>
      <Row label="Уровень врагов">
        <input className="dbg-input" type="number" min={1} max={80} placeholder="как у команды" value={enemyLevel} onChange={e => setEnemyLevel(e.target.value)} />
      </Row>
      <Row label="Цель">
        <select className="dbg-input" value={objective} onChange={e => setObjective(e.target.value as "" | ObjectiveKind)}>
          <option value="">Как у сложности</option>
          <option value="rout">Разгром</option>
          <option value="killBoss">Убить вожака</option>
        </select>
      </Row>
      <label className="dbg-check">
        <input type="checkbox" checked={noWaves} onChange={e => setNoWaves(e.target.checked)} />
        <span>Без подкреплений</span>
      </label>
      <Row label="Seed">
        <input className="dbg-input" type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} />
        <Button sm onClick={() => setSeed(randomSeed())}>🎲</Button>
      </Row>
      {error && <p className="small bld-why">{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <Button style={{ flex: 1 }} onClick={() => start(false)}>Выбрать отряд</Button>
        <Button primary style={{ flex: 1 }} onClick={() => start(true)}>В бой сразу</Button>
      </div>
    </div>
  )
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("res")
  useEffect(() => initDebug(), [])
  return (
    <>
      <button type="button" className="dbg-fab" aria-label="Debug" title="Debug" onClick={() => setOpen(true)}>
        🐞
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="🐞 Debug">
        <div className="dbg-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`dbg-tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "res" && <ResourcesTab />}
        {tab === "roster" && <RosterTab />}
        {tab === "camp" && <CampTab />}
        {tab === "battle" && <BattleTab onDone={() => setOpen(false)} />}
      </BottomSheet>
    </>
  )
}
