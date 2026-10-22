import { useEffect, useRef } from "react"
import { useStore } from "@nanostores/react"
import { SQUAD_SIZE } from "@game/core/types"
import { NPCS, type NpcDef, type NpcId } from "@game/content/village"
import { critterSvg, eyeArt, furArt } from "@game/art/index"
import { $save, ensureRoster, ensureStore, gameStarted, setHeroPosition } from "@game/state/save"
import { $villageUi, closeNpc, npcAlerts, openNpc, setNearNpc, villageControl } from "@game/state/village"
import { navigate } from "@game/state/router"
import type { VillageGameHandle } from "@game/scene/village/index"
import { haptic } from "@game/platform/haptics"
import { Button } from "../components/Button"
import { BottomSheet } from "../components/Sheet"
import { ResourceBar } from "../components/ResourceBar"
import { plural, tr } from "@game/i18n"
import "../village.css"

const npcDef = (id: NpcId): NpcDef => NPCS.find(n => n.id === id) as NpcDef

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

/** Разговор с NPC: реплика, сводка и действия его домика (у Шрама — ворота на вылазку). */
function NpcDialog({ id }: { id: NpcId }) {
  const save = useStore($save)
  const npc = npcDef(id)
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
  else if (id === "store") {
    lines = [save.store.fresh
      ? tr("✨ Fresh stock after the sortie!", "✨ Свежий завоз после вылазки!")
      : tr("Stock refreshes after the next battle.", "Ассортимент обновится после следующего боя.")]
    actions = (
      <Button big primary block icon="🛒" onClick={() => go("/store")}>
        {tr("Shop: weapons, healing, talismans", "Лавка: оружие, лечение, талисманы")}
      </Button>
    )
  }
  else if (battleOn) {
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

  return (
    <div className="stack">
      <div className="npc-head">
        <NpcPortrait npc={npc} />
        <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
          <b>{npc.name}</b>
          <span className="muted small">{npc.title}</span>
          <div className="npc-say">{`«${npc.greeting}»`}</div>
        </div>
      </div>
      {lines.map(l => (
        <p key={l} className="small npc-line">{l}</p>
      ))}
      {actions}
      <Button block ghost onClick={closeNpc}>
        {tr("Leave", "Уйти")}
      </Button>
    </div>
  )
}

/** Деревня-хаб: Phaser-локация со свободным управлением героем, поверх — HUD и разговоры с NPC. */
export function VillageScreen() {
  const save = useStore($save)
  const ui = useStore($villageUi)
  const canvasRef = useRef<HTMLDivElement>(null)
  const started = gameStarted(save)

  useEffect(() => {
    if (!gameStarted($save.get())) {
      navigate("/", true)
      return
    }
    ensureStore()
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
          alerts: () => npcAlerts($save.get()),
          paused: () => !!$villageUi.get().talking,
          touch,
          onNear: setNearNpc,
          onTalk: (id) => {
            haptic("light")
            openNpc(id)
          },
          onRest: setHeroPosition
        })
      })
      .catch((e: unknown) => console.error("village load failed", e))
    return () => {
      cancelled = true
      handle?.destroy()
      $villageUi.set({})
    }
  }, [])

  if (!started) return <div className="vl-root" />
  const near = ui.near ? npcDef(ui.near) : undefined

  return (
    <div className="vl-root">
      <div className="vl-canvas" ref={canvasRef} />
      <div className="vl-hud">
        <div className="vl-top">
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
        <div className="vl-bottom">
          {near && !ui.talking
            ? (
                <Button big primary block glow icon="💬" onClick={() => openNpc(near.id)}>
                  {`${tr("Talk", "Поговорить")}: ${near.name}`}
                </Button>
              )
            : (
                <div className="vl-hint">
                  {tr(
                    "WASD or arrows — walk · tap the ground — go there · tap a villager — talk",
                    "WASD или стрелки — идти · тап по земле — дойти туда · тап по жителю — поговорить"
                  )}
                </div>
              )}
        </div>
      </div>
      <BottomSheet open={!!ui.talking} onClose={closeNpc}>
        {ui.talking && <NpcDialog id={ui.talking} />}
      </BottomSheet>
    </div>
  )
}
