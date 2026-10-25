import { initAudio, playMusic, setAudioVolumes, sfx } from "@game/platform/audio"
import { $route } from "./router"
import { $settings } from "./save"

let started = false

/**
 * Звук по состоянию игры: громкость из настроек, музыка по экрану (в бою — боевая тема, после боя главная
 * возвращается после джингла итога) и щелчок на нажатия кнопок. Повторный вызов ничего не делает.
 */
export function initSound(): void {
  if (started || typeof document === "undefined") return
  started = true
  initAudio()
  $settings.subscribe(s => setAudioVolumes(s.music, s.sfx))
  let prev = $route.get().name
  $route.subscribe((r) => {
    if (r.name === "battle") playMusic("battle")
    else playMusic("main", prev === "battle" ? 2.5 : 0)
    prev = r.name
  })
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("button, [role=switch], a[href]")
      if (el && !(el as HTMLButtonElement).disabled) sfx("tap")
    },
    { capture: true, passive: true }
  )
}
