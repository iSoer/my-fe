# Арт персонажей

Персонажей никто не рисует вручную, картинок в репозитории нет. Каждый боец собирается в SVG строкой кода из данных `UnitInstance`: вид, окрас, узор, глаза, аксессуар, облик породы по `seed`, наряд класса, верховое животное, оружие в лапах, поза. Phaser растеризует этот SVG в текстуру (кэш по `unitArtKey`), а React вставляет его как data URI. Главный герой поселения (котёнок в плаще) и жители рисуются отдельно.

## Модули

| Файл                                           | Что делает                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [art/index.ts](../src/game/art/index.ts)       | Публичный вход: `unitArt(unit, opts)` → `CritterArt`, `unitSvg`, `unitPartSvg`, `unitArtKey`, `unitMounted`, `WEAPON_HEX`, реэкспорт остального                                                                                                  |
| [art/critter.ts](../src/game/art/critter.ts)   | Сборка зверька: `critterSvg`, `critterPortraitSvg`, `critterPartSvg`, `CRITTER_PARTS`, `CRITTER_PART_ANCHORS`, `VIEW` (`0 -28 120 140`), зомби-вариант (`zombieFur`, `zombify`, `zombieRags`)                                                    |
| [art/look.ts](../src/game/art/look.ts)         | `critterLook(species, breedLook, seed)` → `CritterLook` (уши, хвост, морда, отметина, пух, клок, брови, веснушки, усы, носочки, клык, кудри), `DEFAULT_LOOK`, `DRAWABLE_EARS`/`DRAWABLE_TAILS` (какие формы рисует каждый вид; породы сверяет тест), хеш `lookRand(seed, salt)` без состояния                                           |
| [art/palettes.ts](../src/game/art/palettes.ts) | `FUR_ART` (12 окрасов: `fur`/`belly`/`line`/`dark`/`earInner`, `tabby`), `EYE_ART` (5), `furArt(i)` / `eyeArt(i)` (индекс по модулю), `shade`, `mixColor`, `hex`, `INK`/`BLUSH`/`NOSE`                                                           |
| [art/outfits.ts](../src/game/art/outfits.ts)   | `CLASS_OUTFITS` (наряд каждого из 54 классов), `outfitOf`, слои наряда (`outfitAura`, `outfitCape`, `outfitBack`, `outfitBody`, `outfitHeadBack`, `outfitHead`), животные (`mountSvg`, `RIDER_TRANSFORM`), отделка яруса `TIER_TRIM`, `hatLift`  |
| [art/held.ts](../src/game/art/held.ts)         | Оружие в правой лапе: `heldWeaponSvg({ kind, grade, variant, pose, paw, pawSvg, leftPaw })`. Форма — по виду оружия, материал — по грейду (`kit`), отметка — по разновидности (`VARIANT_TRIM`). Есть хват по позам и выпавшее оружие (`DROPPED`) |
| [art/gear.ts](../src/game/art/gear.ts)         | Иконки снаряжения для UI: `weaponIconSvg(kind, grade, variant)`, `ringSvg(talismanId)`, `MATERIAL` по грейду                                                                                                                                     |
| [art/hero.ts](../src/game/art/hero.ts)         | Главный герой поселения: `heroSvg(HeroArt)`, `heroArtKey`, `heroPortraitSvg`, `HERO_VIEW` 64×80, `HERO_WALK_FRAMES` 4, `HERO_IDLE_FRAMES` 2, `HERO_ANCHOR`                                                                                       |
| [art/raster.ts](../src/game/art/raster.ts)     | `svgToImage(key, svg, w, h)`: одновременные запросы `key@WxH` ждут одну загрузку, готовые картинки не кэшируются (их держит менеджер текстур Phaser и освобождает вместе с игрой; постоянный кэш копил картинки всей сессии, и iOS выгружала страницу по памяти), `svgDataUri`, `clearRasterCache`                                                                                                                                                                 |

## От бойца к картинке: `unitArt`

`unitArt(unit, opts)` в [art/index.ts](../src/game/art/index.ts) собирает `CritterArt`:

| Поле `CritterArt`                                       | Источник                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `species`                                               | `unit.species`                                                                               |
| `fur`, `iris`                                           | `furArt(appearance.furPalette)`, `eyeArt(appearance.eyeColor)`                               |
| `pattern`, `eyes`, `accessory`                          | индексы `appearance`: узор 0–3, глаза 0–5, аксессуар 0–7                                     |
| `look`                                                  | `critterLook(species, BREEDS[breedId].look, seed)`; для неизвестной породы — облик вида      |
| `moveType`, `classId`, `tier`                           | `unitClass(unit)`                                                                            |
| `mount`                                                 | `mountOf(fwClass(classId))`: `horse` / `pegasus` / `dragon`                                  |
| `weapon`, `weaponGrade`, `weaponVariant`, `weaponColor` | `weaponSkill` и `weaponDef(skills.weapon)`, цвет — `WEAPON_HEX[WEAPON_COLOR[skill]]`         |
| `boss`, `angry`, `zombie`                               | `isBoss` (корона), `isEnemy && !opts.friendly` (хмурые брови), `isEnemy` (все враги — зомби) |
| `pose`, `animated`, `blinkDelay`                        | `opts`                                                                                       |

Облик породы в сейв не попадает. `critterLook` выбирает варианты из `BreedLook` хешем `lookRand(seed, salt)`, поэтому старые бойцы получают детали тем же способом.

## Слои `critterSvg`

Порядок отрисовки задан в `critterSvg` ([critter.ts](../src/game/art/critter.ts)), все слои лежат в `<g class="rig">`:

1. `behindRider`: сияние яруса (`outfitAura`, у divine) и верховое животное (`mountSvg`: конь, пегас с перьевыми крыльями, дракон с перепончатыми; попона `barding`).
2. Всё остальное идёт в `onMount`. У всадника это группа `class="rider"` с `RIDER_TRANSFORM` (уменьшен до 0.8 и приподнят):
   1. `gearBehind`: плащ (`outfitCape`) и предмет за спиной (`outfitBack`: колчан, лук, мешок, знамя, шаль). Без `classId` используются старые подставки по типу движения: пылесос для кавалерии, шарики для летуна.
   2. `tail` по виду (`catTail` / `dogTail` / `mouseTail`) и `look.tail`, затем `legs`.
   3. Выпавшее оружие (только в позе `dead`).
   4. `body`: тело, пузо, узор `patternBody`, у зомби — заплатка. Затем `gearBody` (`outfitBody`: одежда `garb`, эмблема, отделка яруса, предмет в левой лапе, перчатки, наплечники). Затем `chestFluff` и, у зомби, `zombieRags`.
   5. `head`: задняя часть убора и капюшона, уши (`catEar` / `dogEar` / `mouseEar` по `look.ears`), пух на щеках, голова, узор и отметины, румянец (у зомби — трупные пятна), глаза (`eyesGroup`), рот, усы, аксессуар, убор (`outfitHead` со шейным убором, маской, очками или бородой, нимбом), корона вожака (поднята на `hatLift`).
   6. Оружие в правой лапе (`weaponProp` → `heldWeaponSvg`) поверх головы. Если в наряде есть `paws`, лапа рисуется в перчатке (`heldPawSvg`). Если предмет в левой лапе дублирует оружие, он не рисуется (`leftPawFree`).
3. Поза задаёт `transform` всей фигуры: `hurt` — сплющивание, `run` — наклон, `carried` — растяжка, зомби в покое сутулится.

Позы (`Pose`): `idle`, `run`, `hurt`, `dead`, `happy`, `carried`, `blink`. С `animated: true` в SVG появляются CSS-хуки и оба набора глаз — так моргает аватар в DOM.

Другие выходы того же рисунка:

- `critterPortraitSvg` — та же фигура с кадром `10 -8 100 100` (голова крупно), для окна разговора.
- `critterPartSvg(art, part)` — отдельные части `head`, `body`, `tail`, `legFront`, `legBack` в позе `dead`, со срезами крови, в том же viewBox. Используются для разлёта при гибели (`unitPartSvg`, `CRITTER_PART_ANCHORS`).

## Наряды классов

`Outfit` в [outfits.ts](../src/game/art/outfits.ts) обязательно содержит `hat` (`HatKind`), `hatColor`, `garb` (`tunic`/`vest`/`gi`/`robe`/`armor`/`plate`/`dress`/`apron`), `color`, `accent` и `emblem`. Необязательные поля: `cape`, `mask`, `mountColor`, `back`, `hand` (щиты, посох, книга, сфера, веер, лютня, кинжал), `neck`, `neckColor`, `face` (`goggles`/`scope`/`beard`), `paws`, `shoulders`, `barding`, `patched`.

Набор `hat`, `garb`, животного и необязательных признаков у каждого класса уникален, чтобы классы различались силуэтом, а не только цветом (тест «у каждого класса свой силуэтный признак»). Чем выше ярус, тем богаче отделка (`TIER_TRIM`). У divine есть нимб и сияние. `outfitOf` для неизвестного класса возвращает простую тунику.

## UnitView и текстуры Phaser

- [scene/svgTextures.ts](../src/game/scene/svgTextures.ts): `unitTexKey(scene, unit, pose, size) = "u:" + unitArtKey(unit, pose) + ":" + size + высота`, например `u:…:map192`. Размер растра — ступень под экранную высоту фигуры × плотность рендера × 1.25 ([renderScale.ts](../src/game/scene/renderScale.ts), `UNIT_TEX_BUCKETS`): `map` 149/192/256/320, `cine` 350/448/512/640 по высоте, ширина по пропорции 120:140. При плотности 1 — прежние 128×149 и 300×350. Ступень выбирают `MapScene.relayout` и `CinematicScene.run` через `setUnitTexSize`. `ensureUnitTexture(s)` растеризует `unitSvg(unit, { pose })` один раз на ключ. Наборы поз: `MAP_POSES` (без `happy`) и `CINE_POSES` (без `carried`). Части тела — `ensureUnitPartTextures` с ключом `up:…` той же ступени, что и позы (`preloadDeathParts` на карте и в кинематике).
- `unitArtKey` в [art/index.ts](../src/game/art/index.ts) содержит всё, что меняет картинку: вид, породу, seed, класс, оружейный навык, id оружия, индексы внешности, признаки вожака и врага, позу.
- [scene/UnitView.ts](../src/game/scene/UnitView.ts) (`class UnitView extends Phaser.GameObjects.Container`): спрайт миниатюры в контейнере `rig`, тень цвета оружия, полоска HP, значок перезарядки Special, глиф движения, плашки баффов и дебаффов. Пока текстура грузится, на месте спрайта стоит плейсхолдер: диск цвета `FUR_PALETTES[...].color` (он выводится из `FUR_ART[i].fur`, совпадает с рисунком) и эмодзи вида. Позы переключаются `setPose`, бег — `setRunning` (смена `idle`/`run` каждые 110 мс). Есть дыхание и моргание (`blink`), походка по типу движения (`Gait`), `takeHit`, `setDead`, `setLifted` («за шкирку»).
- React: [ui/components/UnitAvatar.tsx](../src/game/ui/components/UnitAvatar.tsx) вставляет `unitSvg(unit, { pose, animated, blinkDelay, friendly })` напрямую, без растрового кэша.

## Жители и главный герой поселения

- Жители (`NPCS`, рыбак `FISHER`, сплетники `GOSSIPS`) описаны в [content/settlement.ts](../src/game/content/settlement.ts). У каждого заданы только `species`, `fur`, `eyes` и `accessory`. [SettlementScene](../src/game/scene/settlement/SettlementScene.ts) рисует их через `critterSvg` без класса и облика, то есть с `DEFAULT_LOOK`, позы `idle` и `happy`. Поле `eyes` служит и формой глаз, и индексом цвета радужки. Портрет в [DialogueBox](../src/game/ui/settlement/DialogueBox.tsx) собирается тем же способом через `critterPortraitSvg`.
- Главный герой ([art/hero.ts](../src/game/art/hero.ts)) — чиби в чёрном плаще, лицо скрыто капюшоном. С `hood: false` видна голова белого котёнка в наушниках: это «kitty», моргание `blink: true`. Направления — `down`/`up`/`right`, а `left` получается зеркалом `right`. Позы — `idle` (2 кадра дыхания) и `walk` (4 кадра). Текстуры всех кадров заранее создаёт `SettlementScene` по ключам `heroArtKey`. В SVG нет градиентов и id, поэтому копии в DOM не конфликтуют.

## Галерея

`pnpm dev` → http://localhost:5173/tools/gallery/index.html. Код: [tools/gallery/main.ts](../tools/gallery/main.ts), страница: [tools/gallery/index.html](../tools/gallery/index.html). Галерея показывает позы трёх видов, все `WEAPON_SKILLS` с грейдами, типы движения с верховыми животными, вожака и зомби, все окрасы `FUR_ART`, каждый класс `CHARACTER_CLASSES` (настоящий боец `generateUnit` → `unitSvg`), тайлы и фоны биомов, героя, каждое здание на всех уровнях (`villageBuildingSvg`), ворота, пустырь и деревья.

`tools/gallery` входит в `include` в `tsconfig.json`, так что `pnpm typecheck` ловит устаревшие вызовы арта.

## Где менять

| Что                                        | Файл                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Какие поля бойца идут в рисунок, ключ кэша | [art/index.ts](../src/game/art/index.ts) (`unitArt`, `unitArtKey`)                                                                                 |
| Тело, уши, хвосты, глаза, позы, зомби      | [art/critter.ts](../src/game/art/critter.ts)                                                                                                       |
| Детали облика по породе и seed             | [art/look.ts](../src/game/art/look.ts) и `look` в [content/breeds.ts](../src/game/content/breeds.ts)                                               |
| Цвета окрасов и глаз                       | [art/palettes.ts](../src/game/art/palettes.ts) (по индексам совпадают с [content/appearance.ts](../src/game/content/appearance.ts))                |
| Наряд класса, животные                     | [art/outfits.ts](../src/game/art/outfits.ts)                                                                                                       |
| Оружие в лапах, иконки                     | [art/held.ts](../src/game/art/held.ts), [art/gear.ts](../src/game/art/gear.ts)                                                                     |
| Герой поселения                            | [art/hero.ts](../src/game/art/hero.ts) + загрузка кадров в [SettlementScene](../src/game/scene/settlement/SettlementScene.ts)                      |
| Спрайт на карте                            | [scene/UnitView.ts](../src/game/scene/UnitView.ts), [scene/svgTextures.ts](../src/game/scene/svgTextures.ts)                                       |
| Тесты                                      | [art](../tests/game/art.test.ts) (все виды × позы × классы × оружие, уникальность нарядов, облик пород, зомби), [hero](../tests/game/hero.test.ts) |
