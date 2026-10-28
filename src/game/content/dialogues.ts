import { tr } from "@game/i18n"
import { atLeast, seen, type Cond } from "@game/core/story/conditions"

// Разговоры с жителями поселения в духе визуальной новеллы: тап по жителю — короткая сцена из 2–3 реплик с лицом
// говорящего. Логика выбора — `core/story/dialogue`, окно — `ui/settlement/DialogueBox`.
//
// Сцены двух видов:
// - фоновые (без `when` или с `once: false`) — идут по кругу, когда сказать нечего;
// - сюжетные (с `when`) — открываются делами игрока и показываются один раз. Пока сюжетная сцена ждёт, над
//   жителем горит «!», и тап покажет её раньше фоновой.
// Условия — данные (`core/story/conditions`) над фактами (`core/story/facts`): счётчики событий вроде
// `sortie.started`, `drink.drunk.pale_ale`, `building.upgraded.tavern` и производные — `building.level.tavern`,
// `memorial`, `seen.<сцена>`. Из нескольких готовых сцен побеждает больший `priority`, затем более конкретное
// условие (больше критериев), затем порядок в списке.

/** Кто говорит: житель, с которым разговор, или сам герой. */
export type Speaker = "npc" | "hero"

export interface DialogueLine {
  who: Speaker
  text: string
}

export interface DialogueScene {
  /** Уникальный id: по нему сцена помечается увиденной (`seen.<id>`). */
  id: string
  npc: string
  /** Все условия должны выполняться; нет — сцена фоновая. */
  when?: Cond[]
  /** Показать один раз (по умолчанию — у сцен с `when`). `false` — повторяемая, пока условие верно. */
  once?: boolean
  /** Важнее — раньше. По умолчанию 0. */
  priority?: number
  /** Реплики — функция, чтобы брались на текущем языке. */
  lines: () => DialogueLine[]
}

/** Что бормочет себе под нос рыбак у пруда (`FISHER`): по одной реплике в облачке, вразнобой. */
export const FISHER_MUTTERS = (): string[] => [
  tr("Bite, you scaly devil… bite…", "Клюй, чешуйчатый… ну клюй же…"),
  tr("Caught a boot yesterday. A good boot, though.", "Вчера сапог вытащил. Хороший сапог, между прочим."),
  tr("The carp here have teeth now. Didn’t use to.", "У здешних карасей теперь зубы. Раньше не было."),
  tr("Zombies don’t swim. Probably. Hopefully.", "Мертвяки не плавают. Наверное. Надеюсь."),
  tr("A perch this big… no, THIS big. Got away.", "Окунь был — во! Нет, вот такой. Ушёл."),
  tr("Fish don’t care about the end of the world.", "Рыбе-то что. Рыбе конец света не указ."),
  tr("Shh… don’t stomp. You’ll scare the bream.", "Тс-с… не топай. Леща распугаешь."),
  tr("Worms are getting scarce. Everyone’s digging.", "Червей всё меньше. Все копают, все."),
  tr("If it glows, throw it back.", "Если светится — отпускай обратно."),
  tr("Fish soup tonight. If I’m lucky. And if it’s fish.", "Вечером уха. Если повезёт. И если это рыба."),
  tr("Something big nibbled the float. Very big.", "Кто-то большой поплавок пощупал. Очень большой."),
  tr("Grandpa said: the pike remembers everyone.", "Дед говорил: щука всех помнит.")
]

/** Все сцены. Фоновые — первыми по каждому жителю, сюжетные — ниже. */
export const SCENES: readonly DialogueScene[] = [
  {
    id: "sergeant.idle1",
    npc: "sergeant",
    lines: () => [
      { who: "npc", text: tr("Stand straight, recruit! The fence won’t guard itself.", "Смирно, новобранец! Частокол сам себя не охраняет.") },
      { who: "hero", text: tr("I’m on watch tonight, Sergeant.", "Я сегодня в дозоре, сержант.") },
      { who: "npc", text: tr("Good. Keep your ears up and your blade dry.", "Добро. Уши торчком, клинок — сухим.") }
    ]
  },
  {
    id: "sergeant.idle2",
    npc: "sergeant",
    lines: () => [
      { who: "npc", text: tr("The Barracks are cramped, but warm. Fill them with fighters you trust.", "В Казармах тесно, зато тепло. Набирай тех, кому доверяешь.") },
      { who: "hero", text: tr("Every bunk counts.", "Каждая койка на счету.") }
    ]
  },
  {
    id: "sergeant.idle3",
    npc: "sergeant",
    lines: () => [
      { who: "npc", text: tr("Lost two good pups at the eastern ditch last moon.", "В прошлое полнолуние у восточного рва потеряли двоих.") },
      { who: "hero", text: tr("We’ll remember them.", "Мы их помним.") },
      { who: "npc", text: tr("Remember — and come back alive. That’s an order.", "Помни — и возвращайся живым. Это приказ.") }
    ]
  },
  {
    id: "trader.idle1",
    npc: "trader",
    lines: () => [
      { who: "npc", text: tr("Fresh steel, dearie! Well… fresh-ish.", "Свежая сталь, милок! Ну… почти свежая.") },
      { who: "hero", text: tr("Any discount for the night watch?", "А дозорным скидка будет?") },
      { who: "npc", text: tr("Upgrade my shop and we’ll talk.", "Подлатаешь лавку — поговорим.") }
    ]
  },
  {
    id: "trader.idle2",
    npc: "trader",
    lines: () => [
      { who: "npc", text: tr("Caravans don’t come anymore. Everything here was found beyond the fence.", "Караваны больше не ходят. Всё здесь найдено за оградой.") },
      { who: "hero", text: tr("Then it’s worth every Treat.", "Тогда оно стоит каждой Вкусняшки.") }
    ]
  },
  {
    id: "coach.idle1",
    npc: "coach",
    lines: () => [
      { who: "npc", text: tr("Hit the dummy, not the air. The dead won’t wait for you to aim.", "Бей чучело, а не воздух. Мертвецы не ждут, пока прицелишься.") },
      { who: "hero", text: tr("Again?", "Ещё раз?") },
      { who: "npc", text: tr("Again. Until your paws remember.", "Ещё. Пока лапы не запомнят.") }
    ]
  },
  {
    id: "coach.idle2",
    npc: "coach",
    lines: () => [
      { who: "npc", text: tr("Leave your fighters with me. They’ll grow stronger while you rest.", "Оставь бойцов у меня. Подрастут, пока ты отдыхаешь.") },
      { who: "hero", text: tr("And who guards the gate?", "А кто будет стеречь ворота?") }
    ]
  },
  {
    id: "keeper.idle1",
    npc: "keeper",
    lines: () => [
      { who: "npc", text: tr("Quiet night. The stones are listening.", "Тихая ночь. Камни слушают.") },
      { who: "hero", text: tr("Do they ever answer?", "А они отвечают?") },
      { who: "npc", text: tr("Sometimes. Pray you never hear it.", "Бывает. Молись, чтобы ты не услышал.") }
    ]
  },
  {
    id: "keeper.idle2",
    npc: "keeper",
    lines: () => [
      { who: "npc", text: tr("Every name here was someone’s friend.", "Каждое имя здесь было чьим-то другом.") },
      { who: "hero", text: tr("I’ll try not to add more.", "Постараюсь не добавлять новых.") }
    ]
  },
  {
    id: "barkeep.idle1",
    npc: "barkeep",
    lines: () => [
      { who: "npc", text: tr("One mug before the sortie — never two. Rules of the house.", "Одна кружка перед вылазкой — не две. Правило заведения.") },
      { who: "hero", text: tr("What do you recommend?", "Что посоветуешь?") },
      { who: "npc", text: tr("Whatever keeps you breathing.", "То, после чего ты вернёшься.") }
    ]
  },
  {
    id: "barkeep.idle2",
    npc: "barkeep",
    lines: () => [
      { who: "npc", text: tr("The cider’s from the rotten orchard. Don’t ask what the apples saw.", "Сидр — из гнилого сада. Не спрашивай, что видели те яблоки.") },
      { who: "hero", text: tr("I wasn’t going to.", "И не собирался.") }
    ]
  },
  {
    id: "scout.idle1",
    npc: "scout",
    lines: () => [
      { who: "npc", text: tr("They’re restless out there tonight. I can hear them shuffle.", "Сегодня они беспокойные. Слышно, как шаркают.") },
      { who: "hero", text: tr("How many?", "Сколько их?") },
      { who: "npc", text: tr("Enough. Pick your squad well.", "Хватит на всех. Выбирай отряд с умом.") }
    ]
  },
  {
    id: "scout.idle2",
    npc: "scout",
    lines: () => [
      { who: "npc", text: tr("The gate opens only for those who mean to come back.", "Ворота открываются только тем, кто собирается вернуться.") },
      { who: "hero", text: tr("Then open them.", "Тогда открывай.") }
    ]
  },
  // ---------- Сюжетные: открываются делами игрока ----------
  {
    id: "sergeant.first_win",
    npc: "sergeant",
    when: [atLeast("sortie.victory", 1)],
    lines: () => [
      { who: "npc", text: tr("So you came back — and with a win. Not bad, recruit.", "Вернулся — да ещё с победой. Неплохо, новобранец.") },
      { who: "hero", text: tr("They fall like any other.", "Они падают, как и все.") },
      { who: "npc", text: tr("Don’t get cocky. The next ones won’t be as slow.", "Не задирай нос. Следующие будут не такими медленными.") }
    ]
  },
  {
    id: "sergeant.veteran",
    npc: "sergeant",
    // Цепочка: только после первого разговора о победе
    when: [seen("sergeant.first_win"), atLeast("sortie.victory", 25)],
    lines: () => [
      { who: "npc", text: tr("Twenty-five wins. I stopped calling you recruit a while ago.", "Двадцать пять побед. Я уже давно не зову тебя новобранцем.") },
      { who: "hero", text: tr("I noticed.", "Я заметил.") }
    ]
  },
  {
    id: "scout.ten_sorties",
    npc: "scout",
    when: [atLeast("sortie.started", 10)],
    lines: () => [
      { who: "npc", text: tr("Ten times through that gate. Most don’t make it to three.", "Десять раз через эти ворота. Большинство не доживает и до трёх.") },
      { who: "hero", text: tr("I keep count too.", "Я тоже считаю.") },
      { who: "npc", text: tr("Then count the ones who came back with you.", "Тогда считай и тех, кто вернулся с тобой.") }
    ]
  },
  {
    id: "keeper.first_grave",
    npc: "keeper",
    when: [atLeast("memorial", 1)],
    lines: () => [
      { who: "npc", text: tr("I carved a new name today. Yours brought them here.", "Сегодня я вырезал новое имя. Сюда его привёл ты.") },
      { who: "hero", text: tr("I know.", "Знаю.") }
    ]
  },
  {
    id: "barkeep.upgraded",
    npc: "barkeep",
    when: [atLeast("building.level.tavern", 2)],
    lines: () => [
      { who: "npc", text: tr("New planks, new barrels! Thanks for the upgrade, hero.", "Новые доски, новые бочки! Спасибо, что подлатал бар.") },
      { who: "hero", text: tr("Pour something stronger, then.", "Тогда наливай покрепче.") },
      { who: "npc", text: tr("Already on the menu.", "Уже в меню.") }
    ]
  },
  {
    id: "barkeep.pale_ale_100",
    npc: "barkeep",
    priority: 10,
    when: [atLeast("drink.drunk.pale_ale", 100)],
    lines: () => [
      { who: "npc", text: tr("A hundred pale ales. A hundred! I’m naming a stool after you.", "Сто светлых эля. Сто! Назову в твою честь табурет.") },
      { who: "hero", text: tr("Make it a sturdy one.", "Покрепче только.") }
    ]
  },
]
