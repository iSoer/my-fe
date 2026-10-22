import { tr } from "@game/i18n"

export interface PersonalityDef {
  id: string
  readonly text: string
}

export const PERSONALITIES: readonly PersonalityDef[] = (
  [
    ["Afraid of the vacuum, but rides it anyway.", "Боится пылесоса, но ездит на нём."],
    ["Ate the owner's passport. No regrets.", "Съел хозяйский паспорт. Не жалеет."],
    ["Sleeps 20 hours a day. Spends the other 4 killing.", "Спит 20 часов в сутки. Остальные 4 — убивает."],
    ["Loves boxes more than life itself.", "Любит коробки больше, чем жизнь."],
    ["Considers mailmen the root of all evil.", "Считает почтальонов главным злом."],
    ["Purrs only at the sight of blood.", "Мурчит только при виде крови."],
    ["Has never lost a staring contest.", "Никогда не проигрывал в гляделки."],
    ["Steals socks. Collection: 143 and counting.", "Ворует носки. Коллекция — 143 штуки."],
    ["Believes the red dot is a god.", "Думает, что красная точка — это бог."],
    ["Loudly demands food at 5 a.m. Every day.", "Громко требует еды в 5 утра. Каждый день."],
    ["Once defeated a vacuum. It was switched off.", "Однажды победил пылесос. Пылесос был выключен."],
    ["Favorite toy: someone else's tail.", "Любимая игрушка — чужой хвост."],
    ["Hates Mondays and cats on TV.", "Ненавидит понедельники и котов в телевизоре."],
    ["Brings the owner dead pigeons as tribute.", "Приносит хозяину мёртвых голубей как дань."],
    ["Can open the fridge. Can't close it.", "Умеет открывать холодильник. Не умеет закрывать."],
    ["Ran away from home for a sausage. Found the sausage.", "Сбежал из дома за колбасой. Колбасу нашёл."],
    ["Hides from responsibility in the washing machine.", "Прячется в стиральной машине от ответственности."],
    ["Loves soap bubbles. Pops them with teeth.", "Любит мыльные пузыри. Лопает их зубами."],
    ["Hates water, respects only puddles.", "Ненавидит воду, уважает только лужи."],
    ["Pretends not to hear their own name.", "Делает вид, что не слышит своё имя."],
    ["Broke three scratching posts and one destiny.", "Сломал три когтеточки и одну судьбу."],
    ["Ate a whole pizza. Zero remorse.", "Съел целую пиццу и не раскаялся."],
    ["Afraid of plastic bags. At war with plastic bags.", "Боится пакетов. Воюет против пакетов."],
    ["Runs a meatball blog. 2 followers.", "Ведёт блог о котлетах. 2 подписчика."],
    ["Plays dead to get out of walks.", "Притворяется мёртвым, чтобы не идти гулять."],
    ["Bit the vet. Twice. Gently.", "Укусил ветеринара. Дважды. Нежно."],
    ["Scratches the couch for art's sake.", "Царапает диван ради искусства."],
    ["Believes the tail is a separate enemy.", "Верит, что хвост — это отдельный враг."],
    ["Can say “mama”. Only ever says “gimme”.", "Умеет говорить «мама». Говорит только «дай»."],
    ["Keeps a winter stash of crackers under the bed.", "Хранит под кроватью запас сухарей на зиму."]
  ] as const
).map(([en, ru], i) => ({
  id: `p${i + 1}`,
  get text() { return tr(en, ru) }
}))

const MAP = new Map(PERSONALITIES.map(p => [p.id, p]))
export function personalityText(id: string): string {
  return MAP.get(id)?.text ?? ""
}
