import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $save, gameStarted, newGame, surrenderFromMenu } from "@game/state/save"
import { navigate } from "@game/state/router"
import { generateUnit } from "@game/core/units"
import { backdropSvg } from "@game/art/index"
import type { UnitInstance } from "@game/core/types"
import { Button } from "../components/Button"
import { ResourceBar } from "../components/ResourceBar"
import { ConfirmModal } from "../components/Sheet"
import { UnitAvatar } from "../components/UnitAvatar"
import { haptic } from "@game/platform/haptics"
import { plural } from "../lib/format"

// Для широкой диорамы показываем середину сцены (забор и небо), а не только газон.
const YARD_BG = backdropSvg("yard", "plain", "left").replace(
  "preserveAspectRatio=\"xMidYMax slice\"",
  "preserveAspectRatio=\"xMidYMid slice\""
)
/** Демо-тройка для меню без армии: кот, пёс и мышь. */
const DEMO_CREW: UnitInstance[] = [
  generateUnit({ seed: 1, level: 1, species: "cat", classId: "infantry_claw" }),
  generateUnit({ seed: 2, level: 1, species: "dog", classId: "infantry_stick" }),
  generateUnit({ seed: 3, level: 1, species: "mouse", classId: "infantry_slingshot" })
]
const BLOOD_SVG = `<svg viewBox="0 0 390 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#c81e2e" opacity=".85">
    <ellipse cx="70" cy="178" rx="26" ry="7" /><circle cx="52" cy="172" r="4" /><circle cx="94" cy="174" r="3" />
    <ellipse cx="318" cy="186" rx="34" ry="8" /><circle cx="300" cy="178" r="3.5" />
    <circle cx="346" cy="180" r="2.6" /><circle cx="330" cy="172" r="2" />
    <ellipse cx="200" cy="192" rx="18" ry="5" />
  </g>
</svg>`
const CLOUD_SVG = `<svg viewBox="0 0 110 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#ffffff">
    <ellipse cx="34" cy="30" rx="30" ry="13" /><ellipse cx="60" cy="22" rx="24" ry="16" />
    <ellipse cx="84" cy="30" rx="22" ry="12" />
  </g>
</svg>`
/** Капли крови под заголовком. */
const DRIP_SVG = `<svg viewBox="0 0 180 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 3 Q90 -2 176 3" fill="none" stroke="#e63946" strokeWidth="3" strokeLinecap="round" />
  <path d="M40 3 q0 7 3 9 q3 -2 3 -9 z M98 3 q0 11 3 13 q3 -2 3 -13 z M140 3 q0 6 2.5 8 q2.5 -2 2.5 -8 z" fill="#e63946" />
  <circle cx="101" cy="16.5" r="1.6" fill="#e63946" />
</svg>`

function Diorama({ crew }: { crew: UnitInstance[] }) {
  return (
    <div className="diorama" aria-hidden="true">
      <div className="bg" dangerouslySetInnerHTML={{ __html: YARD_BG }} />
      <div className="cloud" dangerouslySetInnerHTML={{ __html: CLOUD_SVG }} />
      <div className="cloud c2" dangerouslySetInnerHTML={{ __html: CLOUD_SVG }} />
      <div className="blood" dangerouslySetInnerHTML={{ __html: BLOOD_SVG }} />
      <div className="crew">
        {crew.map((u, i) => (
          <span key={u.id}>
            <UnitAvatar unit={u} size="lg" pose={i === 1 ? "happy" : "idle"} friendly />
          </span>
        ))}
      </div>
    </div>
  )
}

export function MenuScreen() {
  const save = useStore($save)
  const army = save.army
  const battle = save.battle
  const started = gameStarted(save)
  const hasBattle = started && !!battle && !battle.result
  const [surrender, setSurrender] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)

  // В диораме — бойцы ростера; без них — демо-тройка.
  const crew: UnitInstance[] = army && army.units.length > 0 ? army.units.slice(0, 3) : DEMO_CREW

  const onContinue = () => {
    haptic("select")
    navigate(hasBattle ? "/battle" : "/village")
  }
  const startNew = () => {
    setConfirmNew(false)
    haptic("heavy")
    newGame()
    navigate("/village")
  }
  const onNew = () => (started ? setConfirmNew(true) : startNew())
  const doSurrender = () => {
    setSurrender(false)
    haptic("warning")
    surrenderFromMenu()
    navigate("/battle/result")
  }

  const units = army?.units.length ?? 0
  const continueSub = hasBattle
    ? `Ход ${battle?.turn ?? 1} · бой ждёт`
    : `🦴 ${save.profile.treats} · ${units} ${plural(units, "боец", "бойца", "бойцов")} · в деревню`

  return (
    <div className="screen menu">
      <div className="row between">
        <ResourceBar />
        {started && <span className="muted small">{`Ростер: ${units}`}</span>}
      </div>
      <div className="menu-hero">
        <div className="paper-frame">
          <Diorama crew={crew} />
        </div>
        <h1>Пушистая Резня</h1>
        <span className="title-drip" dangerouslySetInnerHTML={{ __html: DRIP_SVG }} />
        <p className="muted">Тактика про котиков, собачек и мышек</p>
      </div>
      <div className="menu-actions">
        {started && (
          <Button big primary block glow={hasBattle} icon={hasBattle ? "⚔️" : "🏡"} onClick={onContinue}>
            <span className="lbl">
              {hasBattle ? "Продолжить бой" : "Продолжить"}
              <div className="sub">{continueSub}</div>
            </span>
          </Button>
        )}
        {hasBattle && (
          <Button ghost sm block onClick={() => setSurrender(true)}>
            🏳️ Сдаться
          </Button>
        )}
        <Button big block primary={!started} icon="✨" onClick={onNew}>
          <span className="lbl">
            Новая игра
            <div className="sub">{started ? "Прогресс будет стёрт" : "Стартовый ростер и деревня"}</div>
          </span>
        </Button>
        <div className="menu-secondary">
          <Button ghost icon="🪦" onClick={() => navigate("/memorial")}>
            Кладбище
            {save.memorial.length ? ` (${save.memorial.length})` : ""}
          </Button>
          <Button ghost icon="⚙️" onClick={() => navigate("/settings")}>
            Настройки
          </Button>
        </div>
      </div>
      <ConfirmModal
        open={surrender}
        title="Сдаться?"
        text={"Бой засчитается как отступление: из выбитого достанется только часть, "
          + "погибшие останутся мёртвыми, выжившие вернутся в деревню."}
        confirmLabel="Сдаться"
        danger
        onConfirm={doSurrender}
        onClose={() => setSurrender(false)}
      />
      <ConfirmModal
        open={confirmNew}
        title="Начать новую игру?"
        text="Ростер, инвентарь, Вкусняшки, Слава и Кладбище будут стёрты. Настройки сохранятся."
        confirmLabel="Начать заново"
        danger
        onConfirm={startNew}
        onClose={() => setConfirmNew(false)}
      />
    </div>
  )
}
