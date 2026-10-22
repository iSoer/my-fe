import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $route, type Route } from "@game/state/router"
import { $saveError, $saveStatus } from "@game/state/save"
import { MenuScreen } from "./screens/MenuScreen"
import { ArmyScreen } from "./screens/ArmyScreen"
import { UnitScreen } from "./screens/UnitScreen"
import { BattleSetupScreen } from "./screens/BattleSetupScreen"
import { SquadScreen } from "./screens/SquadScreen"
import { BattleScreen } from "./screens/BattleScreen"
import { BattleResultScreen } from "./screens/BattleResultScreen"
import { MemorialScreen } from "./screens/MemorialScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { VillageScreen } from "./screens/VillageScreen"
import { StoreScreen } from "./screens/StoreScreen"
import { critterSvg, furArt } from "@game/art/index"
import { gameHost } from "@game/platform/host"

const SPLASH_TRIO = [
  critterSvg({
    species: "cat",
    fur: furArt(0),
    iris: "#2ecc71",
    pattern: 1,
    eyes: 0,
    accessory: 1,
    weapon: "claw",
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
    weapon: "stick",
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
    weapon: "slingshot",
    weaponColor: "#adb5bd",
    pose: "happy"
  })
]

function Splash({ onStart, ready }: { onStart: () => void, ready: boolean }) {
  return (
    <div className="screen splash" onClick={ready ? onStart : undefined}>
      <div className="splash-logo">
        <div className="splash-trio" aria-hidden="true">
          {SPLASH_TRIO.map((svg, i) => (
            <div key={i} className="critter-svg critter-svg--lg is-static" dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
        <h1>Пушистая Резня</h1>
        <p className="muted">Тактика про котиков, собачек и мышек. Милая и кровавая.</p>
      </div>
      <p className="splash-hint">{ready ? "Нажмите, чтобы начать" : "Загрузка…"}</p>
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
      return <VillageScreen />
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
  // key пересоздаёт контейнер при смене маршрута — проигрывается CSS-переход route-in
  return (
    <div className="route" key={routeKey(route)}>
      <Screen route={route} />
    </div>
  )
}

export function App() {
  const status = useStore($saveStatus)
  const err = useStore($saveError)
  const [started, setStarted] = useState(false)
  if (status !== "ready" || !started) {
    return (
      <>
        <Splash ready={status === "ready"} onStart={() => setStarted(true)} />
        {err && (
          <div className="toast toast-error">
            <span className="ico">✕</span>
            <span>
              Сейв повреждён:
              {err}
              . Начат новый.
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
