import { useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import { SQUAD_SIZE } from "@game/core/types"
import { DECOR, FIXED_PLACES, decorDef, npcOf, type DecorId, type NpcDef, type PlaceId } from "@game/content/village"
import { BUILDINGS, FIELDS, atLevel, buildingDef, type BuildingId } from "@game/content/buildings"
import { isBuilding } from "@game/core/village"
import { critterSvg, eyeArt, furArt } from "@game/art/index"
import {
  $save,
  ensureRoster,
  gameStarted,
  moveBuildingAction,
  placeDecorAction,
  removeDecorAction,
  setHeroPosition,
  tickSettlementNow,
  upgradeBuildingAction
} from "@game/state/save"
import { buildingLevel, canUpgrade, fieldsStored, nextLevelCost, type TrainingLevelUp } from "@game/core/settlement"
import {
  $pendingBuild,
  $villageUi,
  closeNpc,
  npcAlerts,
  openNpc,
  setNearNpc,
  setPlacement,
  startBuild,
  stopBuild,
  villageControl,
  villageGuide
} from "@game/state/village"
import { navigate } from "@game/state/router"
import type { VillageGameHandle } from "@game/scene/village/index"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { BottomSheet } from "../components/Sheet"
import { ResourceBar } from "../components/ResourceBar"
import { LevelUpModal } from "../components/LevelUpModal"
import { useToast } from "../components/Toast"
import {
  BuildingInfo,
  CanteenPanel,
  FieldsPanel,
  HospitalPanel,
  TrainingPanel,
  levelLabel,
  useNow,
  type Toast
} from "../components/BuildingPanels"
import { plural, tr } from "@game/i18n"
import "../village.css"

function NpcPortrait({ npc }: { npc: NpcDef }) {
  const svg = critterSvg({
    species: npc.species,
    fur: furArt(npc.fur),
    iris: eyeArt(npc.eyes),
    pattern: 0,
    eyes: npc.eyes,
    accessory: npc.accessory,
    pose: "happy"
  })
  return <div className="critter-svg critter-svg--lg is-static" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Иконка и название места: у построек — из описания здания, у постоянных мест — свои. */
function placeInfo(id: PlaceId): { icon: string, name: string } {
  return id in FIXED_PLACES ? FIXED_PLACES[id as keyof typeof FIXED_PLACES] : buildingDef(id as BuildingId)
}

interface DialogProps {
  id: PlaceId
  now: number
  toast: Toast
  onLevelUps: (l: TrainingLevelUp[]) => void
  onBuild: () => void
}

/** Разговор у места: реплика жителя, сводка и действия (у построек — уровень, улучшение и перенос). */
function PlaceDialog({ id, now, toast, onLevelUps, onBuild }: DialogProps) {
  const save = useStore($save)
  const npc = npcOf(id)
  const army = save.army
  const units = army?.units.length ?? 0
  const squad = army?.squadIds.length ?? 0
  const battleOn = !!save.battle && !save.battle.result
  const go = (path: string) => {
    haptic("select")
    closeNpc()
    navigate(path)
  }
  const toBarracks = () => {
    closeNpc()
    villageControl()?.walkTo("barracks")
  }
  const move = (b: BuildingId) => () => {
    haptic("select")
    startBuild({ mode: "place", kind: b, moving: true })
  }

  let lines: string[] = []
  let actions = <></>
  if (id === "barracks") {
    lines = units === 0
      ? [tr("The Barracks are empty: everyone fell, or nobody’s here yet. Your Glory stays with you.", "Казарма пуста: все пали или никого ещё нет. Слава остаётся с вами.")]
      : [
          tr(
            `${units} ${plural(units, ["fighter", "fighters"], ["боец", "бойца", "бойцов"])} on the roster, ${squad}/${SQUAD_SIZE} in the squad.`,
            `В ростере ${units} ${plural(units, ["fighter", "fighters"], ["боец", "бойца", "бойцов"])}, в отряде ${squad}/${SQUAD_SIZE}.`
          ),
          ...(units < SQUAD_SIZE ? [tr("Not enough fighters for a squad — recruit some.", "Не хватает бойцов в отряд — наймите в Наборе.")] : []),
          ...(save.rewardChoice ? [tr("🎁 A battle reward awaits: one fighter of your choice, free.", "🎁 Ждёт награда за бой: один боец на выбор бесплатно.")] : [])
        ]
    actions = units === 0
      ? (
          <Button
            big
            primary
            block
            icon="🐾"
            onClick={() => {
              ensureRoster()
              go("/army")
            }}
          >
            {tr("Recruit a new roster", "Набрать новый ростер")}
          </Button>
        )
      : (
          <Button big primary block icon="🛡️" onClick={() => go("/army")}>
            {tr("Barracks: army & recruits", "Казарма: армия и набор")}
          </Button>
        )
  }
  else if (id === "settlement") {
    const unbuilt = BUILDINGS.filter(b => buildingLevel(save, b.id) === 0).length
    lines = [
      tr("Build and upgrade the camp: every building opens something new.", "Стройте и улучшайте лагерь: каждое здание открывает что-то новое."),
      unbuilt > 0
        ? tr(`${unbuilt} more ${unbuilt === 1 ? "building" : "buildings"} to put up — pick a spot on the map.`, `Ещё не построено: ${unbuilt}. Место выбирается прямо на карте.`)
        : tr("Every building is up — now make them stronger.", "Все здания стоят — теперь их можно усиливать.")
    ]
    actions = (
      <>
        <Button big primary block icon="🔨" onClick={onBuild}>
          {tr("Build in the camp", "Строить в лагере")}
        </Button>
        <Button block icon="🏛️" onClick={() => go("/settlement")}>
          {tr("All buildings", "Все здания")}
        </Button>
      </>
    )
  }
  else if (id === "market") {
    lines = [save.store.fresh
      ? tr("✨ Fresh stock this hour!", "✨ Свежий завоз в этом часу!")
      : tr("New stock arrives every hour.", "Новый товар — каждый час.")]
    actions = (
      <Button big primary block icon="🛒" onClick={() => go("/store")}>
        {tr("Shop: weapons, talismans", "Лавка: оружие, талисманы")}
      </Button>
    )
  }
  else if (id === "graveyard") {
    const fallen = save.memorial.length
    lines = [fallen === 0
      ? tr("No one rests here yet. Let’s keep it that way.", "Здесь пока никто не лежит. Пусть так и останется.")
      : tr(
          `${fallen} ${fallen === 1 ? "fighter rests" : "fighters rest"} here. Each one has a story.`,
          `Павших здесь: ${fallen}. У каждого своя история.`
        )]
    actions = (
      <Button big primary block icon="🪦" onClick={() => go("/memorial")} disabled={fallen === 0}>
        {tr("Read the gravestones", "Прочитать надгробия")}
      </Button>
    )
  }
  else if (id === "sorties") {
    if (battleOn) {
      lines = [tr(
        `The battle’s still on: turn ${save.battle?.turn ?? 1}. Your squad awaits orders.`,
        `Бой ещё идёт: ход ${save.battle?.turn ?? 1}. Отряд ждёт приказа.`
      )]
      actions = (
        <Button big primary block glow icon="⚔️" onClick={() => go("/battle")}>
          {tr("Back to battle", "Вернуться в бой")}
        </Button>
      )
    }
    else if (units === 0 || squad === 0) {
      lines = [units === 0
        ? tr("No fighters, no passage — see Sergeant Barkley first.", "Без бойцов не пущу — сперва к Сержанту Барбосу.")
        : tr("No squad assembled — pick your fighters in the Barracks.", "Отряд не собран — отметь бойцов в Казарме.")]
      actions = (
        <Button big primary block icon="🛡️" onClick={toBarracks}>
          {tr("To the Barracks", "К Казарме")}
        </Button>
      )
    }
    else {
      lines = [
        tr(`Squad ${squad}/${SQUAD_SIZE}. Every fallen enemy drops loot.`, `Отряд ${squad}/${SQUAD_SIZE}. Добыча — из каждого павшего врага.`),
        tr("Lose and you keep only half the loot; retreat and you keep three quarters.", "Проиграешь — унесёшь только половину выбитого, отступишь — три четверти.")
      ]
      actions = (
        <Button big primary block icon="⚔️" onClick={() => go("/battle/setup")}>
          {tr("Plan a sortie", "Собрать вылазку")}
        </Button>
      )
    }
  }

  const building = isBuilding(id as BuildingId) ? (id as BuildingId) : undefined
  const info = placeInfo(id)
  return (
    <div className="stack">
      {npc
        ? (
            <div className="npc-head">
              <NpcPortrait npc={npc} />
              <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                <b>{npc.name}</b>
                <span className="muted small">{npc.title}</span>
                <div className="npc-say">{`«${npc.greeting}»`}</div>
              </div>
            </div>
          )
        : (
            <div className="npc-head">
              <span className="bld-ico bld-ico--lg" aria-hidden="true">{info.icon}</span>
              <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                <b>{info.name}</b>
                {building && <span className="muted small">{buildingDef(building).desc}</span>}
              </div>
            </div>
          )}
      {lines.map(l => (
        <p key={l} className="small npc-line">{l}</p>
      ))}
      {actions}
      {building && <BuildingInfo id={building} now={now} onMove={move(building)} toast={toast} />}
      {id === "training" && <TrainingPanel now={now} toast={toast} onLevelUps={onLevelUps} />}
      {id === "hospital" && <HospitalPanel toast={toast} />}
      {id === "fields" && <FieldsPanel now={now} toast={toast} />}
      {id === "canteen" && <CanteenPanel />}
      <Button block ghost onClick={closeNpc}>
        {tr("Leave", "Уйти")}
      </Button>
    </div>
  )
}

/** Каталог стройки: новые здания (место — на карте), перенос построенных, декор и снос. */
function BuildCatalog({ onPick }: { onPick: () => void }) {
  const save = useStore($save)
  const pick = (mode: Parameters<typeof startBuild>[0]) => {
    haptic("select")
    onPick()
    startBuild(mode)
  }
  return (
    <div className="stack">
      <p className="muted small">
        {tr(
          "Pick something, then tap the map to choose a spot. Drag to look around, pinch or scroll to zoom.",
          "Выберите постройку и тапните по карте, чтобы выбрать место. Карта двигается пальцем, щипок или колесо — зум."
        )}
      </p>
      <h3 className="cat-title">{tr("Buildings", "Здания")}</h3>
      {BUILDINGS.map((b) => {
        const level = buildingLevel(save, b.id)
        const cost = nextLevelCost(save, b.id)
        const check = canUpgrade(save, b.id)
        return (
          <div key={b.id} className={`card cat-row${level === 0 ? " is-new" : ""}`}>
            <span className="bld-ico" aria-hidden="true">{b.icon}</span>
            <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{b.name}</b>
              <span className="muted small">
                {level > 0 ? levelLabel(level) : b.effect(1)}
                {level === 0 && !check.ok && <span className="bld-why">{` · ${check.error}`}</span>}
              </span>
            </div>
            {level > 0
              ? <Button sm ghost onClick={() => pick({ mode: "place", kind: b.id, moving: true })}>{tr("Move", "Перенести")}</Button>
              : (
                  <Button sm primary={check.ok} disabled={!check.ok} onClick={() => pick({ mode: "place", kind: b.id })}>
                    {`🦴 ${cost?.treats ?? 0}${cost?.food ? ` · 🌾 ${cost.food}` : ""}`}
                  </Button>
                )}
          </div>
        )
      })}
      <h3 className="cat-title">{tr("Decor", "Декор")}</h3>
      <div className="cat-grid">
        {DECOR.map(d => (
          <button
            key={d.id}
            type="button"
            className="cat-decor"
            disabled={save.profile.treats < d.cost}
            onClick={() => pick({ mode: "place", kind: d.id })}
          >
            <span className="cat-decor-ico" aria-hidden="true">{d.icon}</span>
            <span className="cat-decor-name">{d.name}</span>
            <span className="cat-decor-cost">{`🦴 ${d.cost}`}</span>
          </button>
        ))}
      </div>
      <Button block ghost icon="🧹" disabled={save.settlement.layout.decor.length === 0} onClick={() => pick({ mode: "remove" })}>
        {tr("Remove decor (half back)", "Убрать декор (вернётся половина)")}
      </Button>
    </div>
  )
}

/** Панель стройки вместо нижнего меню: что ставим, можно ли сюда, кнопки «Построить» и «Готово». */
function BuildBar({ toast }: { toast: Toast }) {
  const ui = useStore($villageUi)
  const save = useStore($save)
  const mode = ui.build
  if (!mode) return null
  const p = ui.placement
  let title = tr("🧹 Remove decor", "🧹 Убрать декор")
  let hint = tr("Tap decor to remove it — half the price comes back.", "Тапните по декору, чтобы убрать: вернётся половина цены.")
  let confirm: React.ReactNode = null
  if (mode.mode === "place") {
    const kind = mode.kind
    if (isBuilding(kind)) {
      const def = buildingDef(kind)
      const cost = nextLevelCost(save, kind)
      title = `${def.icon} ${def.name}`
      hint = p && !p.ok
        ? (p.error ?? "")
        : tr("Tap the map to move it. The yellow square is the entrance — keep it clear.", "Тапните по карте, чтобы сдвинуть. Жёлтая клетка — вход, она останется свободной.")
      const place = () => {
        if (!p) return
        const at = { x: p.x, y: p.y }
        const r = mode.moving ? moveBuildingAction(kind, at) : upgradeBuildingAction(kind, at)
        if (!r.ok) return toast(r.error ?? tr("Error", "Ошибка"), true)
        haptic("success")
        toast(mode.moving ? tr(`${def.name} moved`, `${def.name}: перенесено`) : tr(`${def.name} built!`, `${def.name}: построено!`))
        stopBuild()
      }
      confirm = (
        <Button primary disabled={!p?.ok} onClick={place}>
          {mode.moving ? tr("Put here", "Поставить") : `${tr("Build", "Построить")} · 🦴 ${cost?.treats ?? 0}${cost?.food ? ` · 🌾 ${cost.food}` : ""}`}
        </Button>
      )
    }
    else {
      const def = decorDef(kind)
      title = `${def.icon} ${def.name} · 🦴 ${def.cost}`
      hint = tr("Tap cells to place — every tap buys one.", "Тапайте по клеткам — каждый тап ставит ещё одну.")
    }
  }
  return (
    <div className="vl-buildbar">
      <div className="row between" style={{ gap: 8 }}>
        <b className="vl-buildbar-title">{title}</b>
        <span className={`small${p && !p.ok && mode.mode === "place" && isBuilding(mode.kind) ? " bld-why" : " muted"}`}>{hint}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button ghost style={{ flex: 1 }} onClick={stopBuild}>
          {confirm ? tr("Cancel", "Отмена") : tr("Done", "Готово")}
        </Button>
        {confirm && <div style={{ flex: 1.6, display: "flex" }}>{confirm}</div>}
      </div>
    </div>
  )
}

interface DockItem {
  id: PlaceId | "build"
  icon: string
  name: string
  hint: string
}

/** Лагерь-хаб: Phaser-карта со свободным управлением героем и стройкой, поверх — HUD, разговоры и каталог. */
export function VillageScreen() {
  const save = useStore($save)
  const ui = useStore($villageUi)
  const now = useNow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  const pausedRef = useRef(false)
  const [catalog, setCatalog] = useState(false)
  const [levelUps, setLevelUps] = useState<TrainingLevelUp[]>([])
  const [toastEl, toast] = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const started = gameStarted(save)
  pausedRef.current = !!ui.talking || catalog || levelUps.length > 0

  useEffect(() => {
    tickSettlementNow()
  }, [now])

  useEffect(() => {
    if (!gameStarted($save.get())) {
      navigate("/", true)
      return
    }
    tickSettlementNow()
    const el = canvasRef.current
    let handle: VillageGameHandle | null = null
    let cancelled = false
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
    // Phaser грузится лениво — отдельным чанком, как бой
    import("@game/scene/village/index")
      .then((m) => {
        if (cancelled || !el) return
        handle = m.mountVillageGame(el, {
          start: $save.get().village,
          settlement: () => $save.get().settlement,
          fieldsStage: () => {
            const s = $save.get()
            const level = buildingLevel(s, "fields")
            if (level === 0) return 0
            const k = fieldsStored(s, Date.now()) / atLevel(FIELDS.storage, level)
            return k >= 0.6 ? 2 : k >= 0.25 ? 1 : 0
          },
          alerts: () => npcAlerts($save.get()),
          guide: () => villageGuide($save.get()),
          // Камера держит героя между верхней панелью и нижней — меряем их относительно холста
          insets: () => {
            const box = el.getBoundingClientRect()
            const top = topRef.current?.getBoundingClientRect().bottom ?? box.top
            const dock = dockRef.current?.getBoundingClientRect().top ?? box.bottom
            return { top: Math.max(0, top - box.top + 6), bottom: Math.max(0, box.bottom - dock + 6) }
          },
          paused: () => pausedRef.current,
          touch,
          onNear: setNearNpc,
          onTalk: (id) => {
            haptic("light")
            openNpc(id)
          },
          onRest: setHeroPosition,
          onPlacement: setPlacement,
          onDecorTap: (id: DecorId, at) => {
            const r = placeDecorAction(id, at)
            if (!r.ok) return toastRef.current(r.error ?? tr("Error", "Ошибка"), true)
            haptic("light")
          },
          onRemoveTap: (at) => {
            const r = removeDecorAction(at)
            if (!r.ok) return
            haptic("light")
            toastRef.current(tr(`${decorDef(r.id as DecorId).name} removed · +${r.refund} 🦴`, `${decorDef(r.id as DecorId).name}: убрано · +${r.refund} 🦴`))
          }
        })
        // Стройка, заказанная с экрана Поселения: сцена начнёт её, как только загрузится
        const pending = $pendingBuild.get()
        if (pending) {
          $pendingBuild.set(null)
          startBuild(pending)
        }
      })
      .catch((e: unknown) => console.error("village load failed", e))
    return () => {
      cancelled = true
      handle?.destroy()
      $villageUi.set({})
    }
  }, [])

  if (!started) return <div className="vl-root" />
  const alerts = npcAlerts(save, now)
  const guide = villageGuide(save)
  const battleOn = !!save.battle && !save.battle.result
  const dock: DockItem[] = [
    { id: "barracks", icon: "🛡️", name: tr("Barracks", "Казарма"), hint: tr("Army · recruits", "Армия · набор") },
    { id: "market", icon: "🛒", name: tr("Market", "Лавка"), hint: tr("New stock hourly", "Товар каждый час") },
    { id: "build", icon: "🔨", name: tr("Build", "Стройка"), hint: tr("Buildings · decor", "Здания · декор") },
    { id: "settlement", icon: "🏛️", name: FIXED_PLACES.settlement.name, hint: FIXED_PLACES.settlement.hint },
    { id: "sorties", icon: "⚔️", name: FIXED_PLACES.sorties.name, hint: FIXED_PLACES.sorties.hint }
  ]
  // Панель — те же места, что вывески лагеря: герой переносится к месту и сразу разговор
  const goPlace = (id: DockItem["id"]) => {
    haptic("select")
    if (id === "build") return setCatalog(true)
    if (ui.near !== id) villageControl()?.teleportTo(id)
    openNpc(id)
  }
  const shown = levelUps[0]

  return (
    <div className="vl-root">
      <div className="vl-canvas" ref={canvasRef} />
      <div className="vl-hud">
        <div className="vl-top" ref={topRef}>
          <button type="button" className="icon-btn" aria-label={tr("Main menu", "Главное меню")} title={tr("Main menu", "Главное меню")} onClick={() => navigate("/")}>
            🏠
          </button>
          <ResourceBar />
          <span className="vl-grow" />
          <button
            type="button"
            className="icon-btn"
            aria-label={tr("Settings", "Настройки")}
            title={tr("Settings", "Настройки")}
            onClick={() => navigate("/settings")}
          >
            ⚙️
          </button>
        </div>
        {ui.build
          ? (
              <nav className="vl-dock" ref={dockRef} aria-label={tr("Building", "Стройка")}>
                <BuildBar toast={toast} />
              </nav>
            )
          : (
              <nav className="vl-dock" ref={dockRef} aria-label={tr("Camp", "Лагерь")}>
                {dock.map((p) => {
                  const main = p.id === "sorties"
                  const label = main && battleOn ? tr("Back to battle", "Вернуться в бой") : p.name
                  const alert = p.id !== "build" && alerts[p.id]
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`vl-dock-btn${main ? " is-main" : ""}${guide === p.id ? " is-guide" : ""}${ui.near === p.id ? " is-near" : ""}`}
                      onClick={() => goPlace(p.id)}
                    >
                      <span className="vl-dock-ico" aria-hidden="true">{ui.near === p.id ? "💬" : p.icon}</span>
                      <span className="vl-dock-name">{label}</span>
                      {!main && <span className="vl-dock-hint">{p.hint}</span>}
                      {alert && <i className="vl-badge" aria-label={tr("New", "Новое")}>!</i>}
                    </button>
                  )
                })}
              </nav>
            )}
      </div>
      <BottomSheet open={!!ui.talking} onClose={closeNpc}>
        {ui.talking && (
          <PlaceDialog
            id={ui.talking}
            now={now}
            toast={toast}
            onLevelUps={setLevelUps}
            onBuild={() => {
              closeNpc()
              setCatalog(true)
            }}
          />
        )}
      </BottomSheet>
      <BottomSheet open={catalog} onClose={() => setCatalog(false)} title={tr("🔨 Build", "🔨 Стройка")}>
        <BuildCatalog onPick={() => setCatalog(false)} />
      </BottomSheet>
      <LevelUpModal
        view={shown ? { unit: shown.unit, from: shown.from, to: shown.to } : null}
        closeLabel={levelUps.length > 1 ? tr("Next", "Дальше") : undefined}
        onClose={() => setLevelUps(l => l.slice(1))}
      />
      {toastEl}
    </div>
  )
}
