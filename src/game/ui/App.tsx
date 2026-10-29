import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $route, type Route } from "@game/state/router"
import { $saveError, $saveNewer, $saveStatus } from "@game/state/save"
import { MenuScreen } from "./screens/MenuScreen"
import { ArmyScreen } from "./screens/ArmyScreen"
import { UnitScreen } from "./screens/UnitScreen"
import { BattleSetupScreen, EnemyTeamScreen } from "./screens/BattleSetupScreen"
import { SquadScreen } from "./screens/SquadScreen"
import { BattleScreen } from "./screens/BattleScreen"
import { BattleResultScreen } from "./screens/BattleResultScreen"
import { MemorialScreen } from "./screens/MemorialScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { SettlementScreen } from "./screens/SettlementScreen"
import { StoreScreen } from "./screens/StoreScreen"
import { critterSvg, furArt } from "@game/art/index"
import { gameHost } from "@game/platform/host"
import { $lang, tr } from "@game/i18n"

const SPLASH_TRIO = [
  critterSvg({
    species: "cat",
    fur: furArt(0),
    iris: "#2ecc71",
    pattern: 1,
    eyes: 0,
    accessory: 1,
    weapon: "sword",
    weaponColor: "#e63946",
    pose: "happy"
  }),
  critterSvg({
    species: "dog",
    fur: furArt(4),
    iris: "#8e5a2a",
    pattern: 0,
    eyes: 4,
    accessory: 3,
    weapon: "axe",
    weaponColor: "#2ec4b6",
    pose: "happy"
  }),
  critterSvg({
    species: "mouse",
    fur: furArt(1),
    iris: "#3498db",
    pattern: 0,
    eyes: 0,
    accessory: 6,
    weapon: "bow",
    weaponColor: "#adb5bd",
    pose: "happy"
  })
]

function Splash({ onStart, ready }: { onStart: () => void, ready: boolean }) {
  // Язык приходит из сейва во время загрузки — перерисовываемся при смене
  useStore($lang)
  return (
    <div className="screen splash" onClick={ready ? onStart : undefined}>
      <div className="splash-logo">
        <div className="splash-trio" aria-hidden="true">
          {SPLASH_TRIO.map((svg, i) => (
            <div key={i} className="critter-svg critter-svg--lg is-static" dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
        <h1>Cat Emblem</h1>
        <p className="muted">{tr("Tactics with kitties, doggos and mice. Cute and bloody.", "Тактика про котиков, собачек и мышек. Милая и кровавая.")}</p>
      </div>
      <p className="splash-hint">{ready ? tr("Tap to start", "Нажмите, чтобы начать") : tr("Loading…", "Загрузка…")}</p>
    </div>
  )
}

function routeKey(r: Route): string {
  return r.name === "unit" ? `unit:${r.unitId}` : r.name
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "menu":
      return <MenuScreen />
    case "village":
      return <SettlementScreen />
    case "store":
      return <StoreScreen />
    case "army":
      return <ArmyScreen />
    case "armyCreate":
    case "recruit":
      return <ArmyScreen />
    case "unit":
      return <UnitScreen unitId={route.unitId} />
    case "battleSetup":
      return <BattleSetupScreen />
    case "battleEnemy":
      return <EnemyTeamScreen difficulty={route.difficulty} />
    case "battleSquad":
      return <SquadScreen />
    case "battle":
      return <BattleScreen />
    case "battleResult":
      return <BattleResultScreen />
    case "memorial":
      return <MemorialScreen />
    case "settings":
      return <SettingsScreen />
    case "notFound":
      return <MenuScreen />
  }
}

function Router() {
  const route = useStore($route)
  const lang = useStore($lang)
  // key пересоздаёт контейнер при смене маршрута — проигрывается CSS-переход route-in; смена языка перерисовывает экран
  return (
    <div className="route" key={`${lang}:${routeKey(route)}`}>
      <Screen route={route} />
    </div>
  )
}

export function App() {
  const status = useStore($saveStatus)
  const err = useStore($saveError)
  const newer = useStore($saveNewer)
  const [started, setStarted] = useState(false)
  if (status !== "ready" || !started) {
    return (
      <>
        <Splash ready={status === "ready"} onStart={() => setStarted(true)} />
        {err && (
          <div className="toast toast-error">
            <span className="ico">✕</span>
            <span>
              {newer
                ? tr(`${err}. Update the game to continue.`, `${err}. Обновите игру, чтобы продолжить.`)
                : tr(`Save corrupted: ${err}. Started a new one.`, `Сейв повреждён: ${err}. Начат новый.`)}
            </span>
          </div>
        )}
      </>
    )
  }
  const { Overlay } = gameHost()
  return (
    <>
      <Router />
      {Overlay && <Overlay />}
    </>
  )
}
