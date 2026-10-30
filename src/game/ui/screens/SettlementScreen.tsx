import { useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
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


const placeOf = (p: SettlementPlace): PlaceId => (p === "gate" ? "gate" : plotOf(p).id)

/** Пункты меню над местами поселения: выход в главное меню и настройки (раньше — значками в верхней панели). */
const SYSTEM_ITEMS: { path: string, icon: string, readonly label: string }[] = [
  { path: "/", icon: "🏠", get label() { return tr("Main menu", "Главное меню") } },
  { path: "/settings", icon: "⚙️", get label() { return tr("Settings", "Настройки") } }
]

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
  const [menuOpen, setMenuOpen] = useState(false)
  const started = gameStarted(save)

  // Меню мест закрывается, когда открылась карточка или начался разговор, и по Escape
  useEffect(() => {
    if (panel || talking) setMenuOpen(false)
  }, [panel, talking])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuOpen])

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
    setMenuOpen(false)
    if (near !== id) settlementControl()?.teleport(id)
    openPanel(id)
  }
  const toggleMenu = () => {
    haptic("light")
    setMenuOpen(o => !o)
  }
  const menuAlert = BUILDING_IDS.some(b => alerts[b])
  const menuGuide = guide !== "gate"
  const gateNear = near === placeOf("gate")

  return (
    <div className={`st-root${talking ? " is-talking" : ""}`}>
      <div className="st-canvas" ref={canvasRef} role="region" aria-label={tr("Settlement map", "Карта поселения")} />
      <div className="st-hud">
        <div className="st-top" ref={topRef}>
          <ResourceBar />
        </div>
        <nav className={`st-dock${menuOpen ? " is-open" : ""}`} ref={dockRef} aria-label={tr("Settlement", "Поселение")}>
          <button
            type="button"
            className="btn btn-primary btn-big st-sortie"
            onClick={() => goPlace("gate")}
          >
            <span className="btn-inner">
              <span className="ico" aria-hidden="true"><Icon emoji={gateNear ? "💬" : "⚔️"} /></span>
              {battleOn ? tr("To battle", "В бой") : tr("Sortie", "Вылазка")}
            </span>
            {alerts.gate && <i className="st-badge" aria-label={tr("New", "Новое")}>!</i>}
          </button>
          <div className="st-menu">
            {/* Столбиком над кнопкой меню, по одному друг над другом: сверху главное меню и настройки, ниже —
                места поселения. Задержка появления — снизу вверх */}
            <ul className="st-menu-list" id="st-menu-list" hidden={!menuOpen}>
              {SYSTEM_ITEMS.map((it, i) => (
                <li key={it.path} style={{ animationDelay: `${(SYSTEM_ITEMS.length + BUILDING_IDS.length - 1 - i) * 35}ms` }}>
                  <button
                    type="button"
                    className="st-dock-btn st-menu-item is-sys"
                    onClick={() => {
                      haptic("select")
                      setMenuOpen(false)
                      navigate(it.path)
                    }}
                  >
                    <span className="st-dock-ico" aria-hidden="true"><Icon emoji={it.icon} /></span>
                    <span className="st-dock-name">{it.label}</span>
                  </button>
                </li>
              ))}
              {BUILDING_IDS.map((b, i) => {
                const built = isBuilt(save, b)
                const isNear = near === placeOf(b)
                const def = buildingDef(b)
                return (
                  <li key={b} style={{ animationDelay: `${(BUILDING_IDS.length - 1 - i) * 35}ms` }}>
                    <button
                      type="button"
                      className={`st-dock-btn st-menu-item${guide === b ? " is-guide" : ""}${built ? "" : " is-unbuilt"}${isNear ? " is-near" : ""}`}
                      onClick={() => goPlace(b)}
                    >
                      <span className="st-dock-ico" aria-hidden="true"><Icon emoji={isNear ? "💬" : def.icon} /></span>
                      <span className="st-dock-name">{def.short}</span>
                      {!built && <span className="st-dock-hint">{tr("build", "построить")}</span>}
                      {alerts[b] && <i className="st-badge" aria-label={tr("New", "Новое")}>!</i>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              className={`btn btn-big st-menu-toggle${menuOpen ? " is-open" : ""}${menuGuide && !menuOpen ? " is-guide" : ""}`}
              aria-expanded={menuOpen}
              aria-controls="st-menu-list"
              aria-label={menuOpen ? tr("Close menu", "Закрыть меню") : tr("Settlement menu", "Меню поселения")}
              onClick={toggleMenu}
            >
              {/* Три полоски, при открытии складываются в крестик; рисуются CSS — ровно по центру */}
              <span className="st-burger" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {menuAlert && !menuOpen && <i className="st-badge" aria-label={tr("New", "Новое")}>!</i>}
            </button>
          </div>
        </nav>
        {/* Тап мимо меню закрывает его */}
        {menuOpen && <div className="st-menu-backdrop" onClick={() => setMenuOpen(false)} />}
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

import { Icon } from "../components/Icon"