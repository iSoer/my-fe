import type { Gender } from "@game/core/types"
import { tr } from "@game/i18n"

export interface EpitaphCtx {
  name: string
  gender: Gender
  killer?: string
  className: string
  turn?: number
  personality: string
}

const g = (gender: Gender, m: string, f: string): string => (gender === "m" ? m : f)

/** Местоимения для английских эпитафий. */
const he = (c: EpitaphCtx): string => g(c.gender, "he", "she")
const He = (c: EpitaphCtx): string => g(c.gender, "He", "She")

/**
 * Шаблоны эпитафий. Текст строится на языке, активном в момент смерти, и сохраняется в сейв.
 * Количество и порядок шаблонов не зависят от языка — выбор по seed детерминирован.
 */
export const EPITAPHS: readonly ((c: EpitaphCtx) => string)[] = [
  c =>
    tr(
      `Loved boxes. Died ${c.killer ? `at the paws of ${c.killer}` : "in a box"}.`,
      `Любил${g(c.gender, "", "а")} коробки. Умер${g(c.gender, "", "ла")} ${c.killer ? `от лап ${c.killer}` : "в коробке"}.`
    ),
  c =>
    tr(
      `${c.name} always wanted to see what was behind the fence. Now ${he(c)} knows.`,
      `${c.name} всегда хотел${g(c.gender, "", "а")} посмотреть, что там за забором. Теперь знает.`
    ),
  c =>
    c.killer
      ? tr(
          `${c.killer} never apologized. ${c.name} never forgave.`,
          `${c.killer} не извинил${g(c.gender, "ся", "ся")}. ${c.name} не простил${g(c.gender, "", "а")}.`
        )
      : tr(`Went quietly. Just as ${he(c)} lived.`, `Ушёл${g(c.gender, "", "а")} тихо. Как и жил${g(c.gender, "", "а")}.`),
  c =>
    tr(
      `${c.className} to the very end. The end came${c.turn ? ` on turn ${c.turn}` : ""}.`,
      `${c.className} до самого конца. Конец наступил${c.turn ? ` на ${c.turn}-м ходу` : ""}.`
    ),
  c => tr(`${c.personality} Not anymore.`, `${c.personality} Больше не будет.`),
  c =>
    tr(
      `Here lies ${c.name}. ${He(c)} only wanted a treat.`,
      `Здесь лежит ${c.name}. Хотел${g(c.gender, "", "а")} только вкусняшку.`
    ),
  c => tr("Fell bravely. Bravery didn't help.", `Пал${g(c.gender, "", "а")} смертью храбрых. Храбрость не помогла.`),
  c =>
    c.killer
      ? tr(`${c.killer}, if you're reading this — we're coming for you.`, `${c.killer}, если ты это читаешь — мы придём за тобой.`)
      : tr("Nobody saw how it happened. Everybody saw the puddle.", "Никто не видел, как это случилось. Все видели лужу."),
  c =>
    tr(
      `Nine lives ran out sooner than ${he(c)} planned.`,
      `Девять жизней закончились раньше, чем ${g(c.gender, "планировал", "планировала")}.`
    ),
  c => tr(`${c.name} feared nothing. Big mistake.`, `${c.name} не боял${g(c.gender, "ся", "ась")} ничего. Зря.`),
  () =>
    tr(
      "Last words: “Meow.” Or “Woof.” Or “Squeak.” It was hard to hear.",
      "Последние слова: «Мяу». Или «Гав». Или «Пи». Было плохо слышно."
    ),
  c => tr("Left behind 143 socks and one puddle.", `Оставил${g(c.gender, "", "а")} после себя 143 носка и одну лужу.`),
  c => tr(`Rest easy, ${c.name}. Your bowl will always be full.`, `Спи спокойно, ${c.name}. Миска всегда будет полной.`),
  c => tr("Stood on Cover. Cover didn't help.", `Стоял${g(c.gender, "", "а")} на Укрытии. Укрытие не помогло.`),
  () => tr("The red dot is finally caught. At the cost of everything.", "Красная точка наконец поймана. Ценой всего."),
  (c) => {
    const good = `хорош${g(c.gender, "им", "ей")}`
    const kid = g(c.gender, "boy", "girl")
    return tr(
      `${He(c)} was a good ${kid}. A very good ${kid}.`,
      `Был${g(c.gender, "", "а")} ${good} ${g(c.gender, "мальчиком", "девочкой")}. Очень ${good}.`
    )
  }
]
