# Боевая математика

Схватка считается детерминированно в `simulateCombat`, без случайности: нет шанса попадания и нет критов, их роль играют спецприёмы с кулдауном. Одна и та же функция даёт прогноз для UI и результат для редьюсера, поэтому прогноз всегда точен.

Код: [core/combat/index.ts](../src/game/core/combat/index.ts). Константы: `COMBAT` и `TERRAIN_BONUS` в [content/balance.ts](../src/game/content/balance.ts).

## Константы `COMBAT`

| Ключ           | Значение | Смысл                                                          |
| -------------- | -------- | -------------------------------------------------------------- |
| `minDamage`    | 1        | Любой удар ранит хотя бы на 1, кроме неуязвимости              |
| `triangle`     | 0.2      | ±20 % атаки за треугольник                                     |
| `effective`    | 1.5      | Эффективность оружия ×1.5 к атаке                              |
| `coverBonus`   | 0.3      | +30 % Def/Res защитнику на клетке `cover`                      |
| `followUpSpd`  | 5        | Двойная атака при Spd ≥ Spd врага + 5                          |
| `staffMult`    | 0.5      | Урон посохом ×0.5                                              |
| `weaponTierMt` | 2        | Mt за уровень заточки (`weaponTier` 0–3)                       |
| `rankShortMt`  | 2        | −Mt за каждую недостающую ступень ранга                        |
| `rankMt`       | 1/3      | Mt за ранг навыка: `floor(rankIndex/3)`, E…D дают 0, S даёт +3 |
| `bossBonus`    | 3        | Вожаку +3 к каждому стату                                      |

## 1. Статы в бою

`makeView` и `applyCombatMods` складывают статы:

1. `visibleStats(unit)` ([units](../src/game/core/units/index.ts)):
   - статы уровня и класса;
   - `weaponMt` к атакующему стату (`str` или `mag`, по `isMagicWeapon`);
   - `permanentBonus`: хуки `statBonus` пассивок и талисмана плюс `spdMod` оружия;
   - вожаку `+COMBAT.bossBonus`;
   - каждый стат не ниже `MIN_STAT`.
2. Напиток (только игрок), затем `bu.bonuses`, затем `bu.penalties`.
3. `TERRAIN_BONUS[клетка]`: `forest` даёт `{def: +1, res: +1}`. Клетка атакующего — та, **с которой он бьёт** (`attackerPos`).
4. `combatStatMod(ctx)` своих хуков.
5. `allyCombatStatMod` союзников, если союзник в пределах `range` (манхэттен) от бойца.
6. Отрицательные статы обнуляются.

`weaponMt = max(0, mt + weaponTier·2 + floor(rankIndex/3) − shortfall·2)`, где `shortfall` — на сколько ступеней ранг навыка ниже `requiredRank` оружия.

## 2. Кто бьёт и сколько раз

- **Треугольник** (`triangleOf`): red (меч) > green (топор) > blue (копьё) > red. Если хотя бы один из двоих `colorless` (кулак, лук, магия, посох) или цвета совпадают, треугольник нейтрален.
- **Эффективность**: `weapon.effectiveAgainst` содержит `moveType` врага, и у врага нет `negateEffective` (талисман `tal_foil`). Лук эффективен против `flier`, `armorslayer` против `armored`, `cavslayer` против `cavalry`.
- **Контратака**: дистанция равна `range` оружия защитника, или у защитника есть хук `counterAnyRange`.
- **Двойная атака**: `spd ≥ spd врага + 5`. Хуки `followUp` дают `selfGuaranteed` (своя двойная гарантирована) или `foeDenied` (у врага двойной нет). Если на одной стороне есть только гарантии, двойная будет. Если только запреты, её не будет. Если есть и то и другое, решает скорость. Без контратаки нет и двойной защитника.
- **Порядок ударов** (`seq`):
  1. `vantage` защитника (если он может контратаковать): защитник бьёт первым;
  2. атакующий бьёт: `brave`-оружие даёт 2 удара подряд, но только при инициативе;
  3. `desperation` атакующего (если у него есть двойная): двойная идёт сразу;
  4. контратака, если не было `vantage`;
  5. двойная атакующего, если не было `desperation`;
  6. двойная защитника.
- Смерть любого из двоих прерывает последовательность.

## 3. Урон одного удара (`doStrike`)

```
atk = stats[str|mag]                       // magical → mag
if effective:   atk = floor(atk × 1.5)
if adv:         atk += floor(atk × 0.2)
if dis:         atk -= floor(atk × 0.2)

def = magical ? foe.res : foe.def
if foe на cover: def += floor(def × 0.3)

// атакующий спецприём (kind "offense", specialCd ≤ 0)
def -= floor(def × ignoreDefPct/100)
bonus = floor(who.stats[stat] × pct/100)   // damagePctOfStat, "atk" = str|mag

dmg = max(0, atk − def)
dmg += floor(dmg × damageBonusPct/100)     // только если спецприём сработал
dmg += bonus
dmg += Σ flatDamage(ctx, strike)
dmg = floor(dmg × damageMultiplier(ctx))   // для каждого хука ≠ 1
if staff и нет wrathfulStaff: dmg = floor(dmg × 0.5)

// защитный спецприём (kind "defense", specialCd ≤ 0, подходит vsRange)
dmg = floor(dmg × (1 − reduction)); защитник лечится на floor(снятое × healPctOfDamage/100)
для каждого damageReduction(ctx) = r > 0: dmg = floor(dmg × (1 − r))
dmg = floor(dmg × buffDamageMult)          // вылазка: fury ×1.2, aegis ×0.8
dmg = max(1, dmg)                          // COMBAT.minDamage
if какой-то damageImmune(ctx, strike, dmg): dmg = 0
```

Смертельный удар (`hp − dmg ≤ 0`) не убивает, если `hp > 1` и выполнено одно из двух:

- у защитника спецприём с `miracle` и `specialCd ≤ 0` (`sp_miracle`): защитник остаётся с 1 HP, кулдаун сбрасывается;
- срабатывает хук `survive`.

В обоих случаях в `Strike` ставится `miracle: true`.

Лечение `healPctOfDamage` атакующего спецприёма (`sp_sol`) равно `floor(dmg × pct/100)`, но не больше недостающего HP.

`vsRange` защитного спецприёма: `melee` — против оружия с дальностью 1, `ranged` — с дальностью 2, `any` — против любого.

## 4. Спецприёмы и кулдаун

- Максимальный кулдаун: `specialMaxCd(unit) = max(1, special.cd + weapon.cdMod + Σ hooks.cdMod)`. Оружие `killer` даёт `cdMod −1`.
- Каждый удар бойца уменьшает его `specialCd` на 1, если спецприём не сработал, а сработавший спецприём сбрасывает кулдаун на максимум. Каждый полученный удар тоже уменьшает кулдаун защитника на 1, если не сработал защитный спецприём.
- Кулдаун тикает при ударах у спецприёма любого вида, в том числе у лечебного (`heal`).
- Атакующий спецприём срабатывает на первом же ударе при `specialCd ≤ 0`, защитный — на первом подходящем полученном ударе.

## 5. Местность в бою

| Клетка                   | Эффект                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| `forest`                 | `TERRAIN_BONUS`: +1 Def и +1 Res стоящему, проходима для всех              |
| `cover`                  | `COMBAT.coverBonus`: +30 % к Def/Res защитника (только когда по нему бьют) |
| `plain`                  | Ничего                                                                     |
| `mountain`, `water`      | Только для `flier`, бонусов нет                                            |
| `wall`, `wall_breakable` | Непроходимы; хлипкая стена ломается за 2 удара `attackWall`                |

Подписи для карточки клетки строит [content/terrain.ts](../src/game/content/terrain.ts), стоимость хода задаёт `moveCost` в [pathing.ts](../src/game/core/map/pathing.ts).

## 6. После боя

`afterCombat(ctx, info)` вызывается только у выживших. Он возвращает `Effect[]` (`afterEffects`), которые применяет редьюсер. Эффект `damage` из них оставляет минимум 1 HP.

## 7. Результат (`CombatOutcome`)

`strikes`, а для `attacker` и `defender` — `CombatSideResult`:

- `hpBefore`, `hpAfter`, `cdBefore`, `cdAfter`;
- `flags`, `stats`, `died`;
- `hits`, `damagePerHit` (урон первого удара);
- `specialTriggered`.

Кроме того, в результате есть `triangle`, `attackerEffective`, `defenderEffective`, `defenderCanCounter`, `attackerFollowUp`, `defenderFollowUp` и `afterEffects`.

`forecast` в редьюсере — обёртка над `simulateCombat`. Функция не мутирует `state`: бойцы клонируются (`cloneBu`), поэтому хуки вроде `b_barrier` могут писать во `flags` клона.

## Где менять

- Числа (треугольник, эффективность, укрытие, порог двойной, посох, заточка, вожак): `COMBAT` в [balance.ts](../src/game/content/balance.ts).
- Бонусы местности: `TERRAIN_BONUS` в [balance.ts](../src/game/content/balance.ts). Проходимость: `moveCost` в [pathing.ts](../src/game/core/map/pathing.ts). Подписи: [content/terrain.ts](../src/game/content/terrain.ts).
- Порядок ударов и формула: `simulateCombat` и `doStrike` в [core/combat/index.ts](../src/game/core/combat/index.ts).
- Новый тип эффекта навыка в бою: поле в `SkillHooks` ([skills/types.ts](../src/game/core/skills/types.ts)) и его вызов в `doStrike` или `applyCombatMods`.
- Цвета и дальность оружия: `WEAPON_COLOR`, `SPECS` в [content/weapons.ts](../src/game/content/weapons.ts).
- Тесты: [tests/game/combat.test.ts](../tests/game/combat.test.ts). Там же проверка «прогноз = результат редьюсера».
