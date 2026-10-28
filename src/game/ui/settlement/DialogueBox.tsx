import { useEffect, useMemo, useState } from "react"
import { useStore } from "@nanostores/react"
import { critterPortraitSvg, eyeArt, furArt, heroPortraitSvg, svgDataUri } from "@game/art/index"
import { NPCS } from "@game/content/settlement"
import { $dialogue, advanceDialogue, skipDialogue } from "@game/state/dialogue"
import { haptic } from "@game/platform/haptics"
import { tr } from "@game/i18n"

/** Скорость печати реплики, символов в секунду. */
const TYPE_CPS = 45

const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Окно разговора в духе визуальной новеллы: внизу экрана плашка с лицом говорящего (житель — слева, герой — справа),
 * именем и репликой, которая печатается по буквам. Тап по окну — допечатать или дальше; «Пропустить» — закрыть
 * разговор целиком. Пробел/Enter — дальше, Esc — пропустить.
 */
export function DialogueBox() {
  const d = useStore($dialogue)
  const line = d?.lines[d.index]
  const npc = d ? NPCS.find(n => n.id === d.npcId) : undefined
  const [shown, setShown] = useState(0)

  const npcFace = useMemo(() => npc
    ? svgDataUri(critterPortraitSvg({ species: npc.species, fur: furArt(npc.fur), iris: eyeArt(npc.eyes), pattern: 0, eyes: npc.eyes, accessory: npc.accessory, pose: "happy" }))
    : "", [npc])
  const heroFace = useMemo(() => svgDataUri(heroPortraitSvg()), [])

  const text = line?.text ?? ""
  const done = shown >= text.length

  // Новая реплика — печатаем с начала
  useEffect(() => {
    if (!text) return
    if (reducedMotion()) {
      setShown(text.length)
      return
    }
    setShown(0)
    const started = performance.now()
    const t = setInterval(() => {
      const n = Math.floor(((performance.now() - started) / 1000) * TYPE_CPS)
      setShown(Math.min(text.length, n))
      if (n >= text.length) clearInterval(t)
    }, 30)
    return () => clearInterval(t)
  }, [text, d?.index, d?.npcId])

  const next = () => {
    if (!done) return setShown(text.length)
    haptic("select")
    advanceDialogue()
  }

  useEffect(() => {
    if (!d) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipDialogue()
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!d || !line || !npc) return null
  const hero = line.who === "hero"
  const name = hero ? tr("You", "Вы") : npc.name
  return (
    <div className="dlg-root" role="dialog" aria-label={tr(`Talking to ${npc.name}`, `Разговор: ${npc.name}`)}>
      <button type="button" className="dlg-skip" onClick={() => { haptic("light"); skipDialogue() }}>
        {tr("Skip", "Пропустить")}
        {" ⏭"}
      </button>
      <div className={`dlg-box${hero ? " is-hero" : ""}`} onClick={next}>
        <div className="dlg-face" aria-hidden="true">
          <img src={hero ? heroFace : npcFace} alt="" draggable={false} />
        </div>
        <div className="dlg-body">
          <b className="dlg-name">{name}</b>
          <p className="dlg-text" aria-live="polite">
            {text.slice(0, shown)}
            <span className="dlg-rest" aria-hidden="true">{text.slice(shown)}</span>
          </p>
          <span className="dlg-more small" aria-hidden="true">
            {`${d.index + 1}/${d.lines.length}`}
            <i>{done ? (d.index + 1 < d.lines.length ? " ▼" : " ■") : ""}</i>
          </span>
        </div>
      </div>
    </div>
  )
}
