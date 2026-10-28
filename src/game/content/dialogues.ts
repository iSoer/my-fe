import { tr } from "@game/i18n"

// Разговоры с жителями поселения в духе визуальной новеллы: тап по жителю — короткая сцена из 2–3 реплик с лицом
// говорящего. У каждого жителя несколько сцен, они идут по кругу. Пока это базовые фразы-примеры; сюжетные сцены
// добавляются сюда же. Логика — `state/dialogue`, окно — `ui/settlement/DialogueBox`.

/** Кто говорит: житель, с которым разговор, или сам герой. */
export type Speaker = "npc" | "hero"

export interface DialogueLine {
  who: Speaker
  text: string
}

/** Сцены жителя: каждая — функция, чтобы реплики брались на текущем языке. */
export const DIALOGUES: Record<string, readonly (() => DialogueLine[])[]> = {
  sergeant: [
    () => [
      { who: "npc", text: tr("Stand straight, recruit! The fence won’t guard itself.", "Смирно, новобранец! Частокол сам себя не охраняет.") },
      { who: "hero", text: tr("I’m on watch tonight, Sergeant.", "Я сегодня в дозоре, сержант.") },
      { who: "npc", text: tr("Good. Keep your ears up and your blade dry.", "Добро. Уши торчком, клинок — сухим.") }
    ],
    () => [
      { who: "npc", text: tr("The Barracks are cramped, but warm. Fill them with fighters you trust.", "В Казармах тесно, зато тепло. Набирай тех, кому доверяешь.") },
      { who: "hero", text: tr("Every bunk counts.", "Каждая койка на счету.") }
    ],
    () => [
      { who: "npc", text: tr("Lost two good pups at the eastern ditch last moon.", "В прошлое полнолуние у восточного рва потеряли двоих.") },
      { who: "hero", text: tr("We’ll remember them.", "Мы их помним.") },
      { who: "npc", text: tr("Remember — and come back alive. That’s an order.", "Помни — и возвращайся живым. Это приказ.") }
    ]
  ],
  trader: [
    () => [
      { who: "npc", text: tr("Fresh steel, dearie! Well… fresh-ish.", "Свежая сталь, милок! Ну… почти свежая.") },
      { who: "hero", text: tr("Any discount for the night watch?", "А дозорным скидка будет?") },
      { who: "npc", text: tr("Upgrade my shop and we’ll talk.", "Подлатаешь лавку — поговорим.") }
    ],
    () => [
      { who: "npc", text: tr("Caravans don’t come anymore. Everything here was found beyond the fence.", "Караваны больше не ходят. Всё здесь найдено за оградой.") },
      { who: "hero", text: tr("Then it’s worth every Treat.", "Тогда оно стоит каждой Вкусняшки.") }
    ]
  ],
  coach: [
    () => [
      { who: "npc", text: tr("Hit the dummy, not the air. The dead won’t wait for you to aim.", "Бей чучело, а не воздух. Мертвецы не ждут, пока прицелишься.") },
      { who: "hero", text: tr("Again?", "Ещё раз?") },
      { who: "npc", text: tr("Again. Until your paws remember.", "Ещё. Пока лапы не запомнят.") }
    ],
    () => [
      { who: "npc", text: tr("Leave your fighters with me. They’ll grow stronger while you rest.", "Оставь бойцов у меня. Подрастут, пока ты отдыхаешь.") },
      { who: "hero", text: tr("And who guards the gate?", "А кто будет стеречь ворота?") }
    ]
  ],
  keeper: [
    () => [
      { who: "npc", text: tr("Quiet night. The stones are listening.", "Тихая ночь. Камни слушают.") },
      { who: "hero", text: tr("Do they ever answer?", "А они отвечают?") },
      { who: "npc", text: tr("Sometimes. Pray you never hear it.", "Бывает. Молись, чтобы ты не услышал.") }
    ],
    () => [
      { who: "npc", text: tr("Every name here was someone’s friend.", "Каждое имя здесь было чьим-то другом.") },
      { who: "hero", text: tr("I’ll try not to add more.", "Постараюсь не добавлять новых.") }
    ]
  ],
  barkeep: [
    () => [
      { who: "npc", text: tr("One mug before the sortie — never two. Rules of the house.", "Одна кружка перед вылазкой — не две. Правило заведения.") },
      { who: "hero", text: tr("What do you recommend?", "Что посоветуешь?") },
      { who: "npc", text: tr("Whatever keeps you breathing.", "То, после чего ты вернёшься.") }
    ],
    () => [
      { who: "npc", text: tr("The cider’s from the rotten orchard. Don’t ask what the apples saw.", "Сидр — из гнилого сада. Не спрашивай, что видели те яблоки.") },
      { who: "hero", text: tr("I wasn’t going to.", "И не собирался.") }
    ]
  ],
  scout: [
    () => [
      { who: "npc", text: tr("They’re restless out there tonight. I can hear them shuffle.", "Сегодня они беспокойные. Слышно, как шаркают.") },
      { who: "hero", text: tr("How many?", "Сколько их?") },
      { who: "npc", text: tr("Enough. Pick your squad well.", "Хватит на всех. Выбирай отряд с умом.") }
    ],
    () => [
      { who: "npc", text: tr("The gate opens only for those who mean to come back.", "Ворота открываются только тем, кто собирается вернуться.") },
      { who: "hero", text: tr("Then open them.", "Тогда открывай.") }
    ]
  ]
}
