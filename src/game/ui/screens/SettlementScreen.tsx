import { useEffect, useRef, type CSSProperties } from "react"
import { useStore } from "@nanostores/react"
import type { BuildingId } from "@game/core/types"
import { BUILDING_IDS, buildingDef, plotOf, type PlaceId } from "@game/content/settlement"
import { isBuilt } from "@game/core/settlement"
import { displayName } from "@game/core/units"
import { $save, gameStarted } from "@game/state/save"
import {
  $settlementNear,
  $settlementPanel,
  closePanel,
  openPanel,
  placeAlerts,
  placeSigns,
  setHeroSpot,
  setNearPlace,
  settlementControl,
  settlementGuide,
  tickSettlement,
  type SettlementPlace
} from "@game/state/settlement"
import { navigate } from "@game/state/router"
import type { SettlementGameHandle } from "@game/scene/settlement/index"
import { haptic } from "@game/platform/haptics"
import { BottomSheet } from "../components/Sheet"
import { ResourceBar } from "../components/ResourceBar"
import { useToast } from "../components/Toast"
import { BuildingPanel, GatePanel } from "../settlement/BuildingPanel"
import { DialogueBox } from "../settlement/DialogueBox"
import { $dialogue, canTalk, npcStoryAlerts, openDialogue, skipDialogue } from "@game/state/dialogue"
import { tr } from "@game/i18n"
import "../village.css"

/** Как часто экран догоняет время: опыт на полигоне и смена витрины Лавки. */
const TICK_MS = 15_000

const DOCK: readonly SettlementPlace[] = [...BUILDING_IDS, "gate"]

const placeOf = (p: SettlementPlace): PlaceId => (p === "gate" ? "gate" : plotOf(p).id)

/**
 * Поселение: Phaser-локация в три экрана шириной, по которой ходит герой; камера идёт за ним вбок. Здания стоят на
 * своих участках; подойти к входу (или тапнуть по зданию, или по кнопке нижней панели) — открыть карточку места:
 * характеристики, постройка, улучшение и его действия.
 */
export function SettlementScreen() {
  const save = useStore($save)
  const panel = useStore($settlementPanel)
  const near = useStore($settlementNear)
  const talking = !!useStore($dialogue)
  const canvasRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  const [toastEl, toast] = useToast()
  const started = gameStarted(save)

  useEffect(() => {
    if (!gameStarted($save.get())) {
      navigate("/", true)
      return
    }
    const tick = () => {
      const ups = tickSettlement()
      const last = ups.at(-1)
      if (!last) return
      const unit = $save.get().army?.units.find(u => u.id === last.unitId)
      if (unit) toast(tr(`${displayName(unit)} reached level ${last.to} at the Training Ground`, `${displayName(unit)}: уровень ${last.to} на полигоне`))
    }
    tick()
    const t = setInterval(tick, TICK_MS)

    const el = canvasRef.current
    let handle: SettlementGameHandle | null = null
    let cancelled = false
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
    // Phaser грузится лениво — отдельным чанком, как бой
    import("@game/scene/settlement/index")
      .then((m) => {
        if (cancelled || !el) return
        handle = m.mountSettlementGame(el, {
          start: $save.get().settlement.hero,
          signs: () => placeSigns($save.get()),
          // Карта вписывается между верхней панелью и нижней — меряем их относительно холста
          insets: () => {
            const box = el.getBoundingClientRect()
            const top = topRef.current?.getBoundingClientRect().bottom ?? box.top
            const dock = dockRef.current?.getBoundingClientRect().top ?? box.bottom
            return { top: Math.max(0, top - box.top + 6), bottom: Math.max(0, box.bottom - dock + 6) }
          },
          paused: () => !!$settlementPanel.get() || !!$dialogue.get(),
          touch,
          onNear: setNearPlace,
          onOpen: (id) => {
            haptic("light")
            openPanel(id)
          },
          onRest: setHeroSpot,
          canTalk,
          npcAlerts: npcStoryAlerts,
          onTalk: (npcId) => {
            closePanel()
            if (openDialogue(npcId)) haptic("light")
          }
        })
      })
      .catch((e: unknown) => console.error("settlement load failed", e))
    return () => {
      cancelled = true
      clearInterval(t)
      handle?.destroy()
      closePanel()
      skipDialogue()
      setNearPlace(undefined)
    }
  }, [])

  if (!started) return <div className="st-root" />
  const alerts = placeAlerts(save)
  const guide = settlementGuide(save)
  const battleOn = !!save.battle && !save.battle.result

  // Кнопка панели: герой переносится ко входу в место (камера — за ним) и открывается карточка
  const goPlace = (p: SettlementPlace) => {
    const id = placeOf(p)
    haptic("select")
    if (near !== id) settlementControl()?.teleport(id)
    openPanel(id)
  }

  return (
    <div className={`st-root${talking ? " is-talking" : ""}`}>
      <div className="st-canvas" ref={canvasRef} role="region" aria-label={tr("Settlement map", "Карта поселения")} />
      <div className="st-hud">
        <div className="st-top" ref={topRef}>
          <button type="button" className="icon-btn" aria-label={tr("Main menu", "Главное меню")} title={tr("Main menu", "Главное меню")} onClick={() => navigate("/")}>
            🏠
          </button>
          <ResourceBar />
          <span className="st-grow" />
          <button type="button" className="icon-btn" aria-label={tr("Settings", "Настройки")} title={tr("Settings", "Настройки")} onClick={() => navigate("/settings")}>
            ⚙️
          </button>
        </div>
        <nav className="st-dock" ref={dockRef} style={{ "--st-buildings": BUILDING_IDS.length } as CSSProperties} aria-label={tr("Settlement", "Поселение")}>
          {DOCK.map((p) => {
            const main = p === "gate"
            const built = main || isBuilt(save, p as BuildingId)
            const label = main ? (battleOn ? tr("To battle", "В бой") : tr("Sortie", "Вылазка")) : buildingDef(p as BuildingId).short
            const isNear = near === placeOf(p)
            return (
              <button
                key={p}
                type="button"
                className={`st-dock-btn${main ? " is-main" : ""}${guide === p ? " is-guide" : ""}${built ? "" : " is-unbuilt"}${isNear ? " is-near" : ""}`}
                onClick={() => goPlace(p)}
              >
                <span className="st-dock-ico" aria-hidden="true">{isNear ? "💬" : main ? "⚔️" : buildingDef(p as BuildingId).icon}</span>
                <span className="st-dock-name">{label}</span>
                {!built && <span className="st-dock-hint">{tr("build", "построить")}</span>}
                {alerts[p] && <i className="st-badge" aria-label={tr("New", "Новое")}>!</i>}
              </button>
            )
          })}
        </nav>
      </div>
      <BottomSheet open={!!panel} onClose={closePanel}>
        <div className="st-panel">
          {panel === "gate" ? <GatePanel save={save} /> : panel ? <BuildingPanel plotId={panel} save={save} toast={toast} /> : null}
        </div>
      </BottomSheet>
      <DialogueBox />
      {toastEl}
    </div>
  )
}
