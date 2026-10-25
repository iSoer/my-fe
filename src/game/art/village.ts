// Процедурный SVG деревни-хаба: тропинка, цветы, деревья и домики NPC. Свет сверху-слева, как у тайлов боя
// (`art/tile.ts`); трава, кусты и пруд берутся оттуда же (биом yard). Без id и градиентов — копии не конфликтуют.

/** Размер клетки в SVG-единицах (как `TILE_SIZE` поля боя). */
export const VT = 64

const svg = (w: number, h: number, body: string): string =>
  `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

/** Детерминированный «шум» для вариантов без rng. */
function noise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0
    return (s % 1000) / 1000
  }
}

const r1 = (n: number): string => String(Math.round(n * 10) / 10)

/** Утоптанная тропинка: песочный тон, камушки и следы колёс; заливает клетку целиком, стыки не видны. */
export function villagePathSvg(variant = 0): string {
  const rnd = noise(variant + 11)
  let pebbles = ""
  for (let i = 0; i < 7; i++) {
    const x = 6 + rnd() * 52
    const y = 6 + rnd() * 52
    const r = 1.2 + rnd() * 2.2
    pebbles += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r * 1.3)}" ry="${r1(r)}" fill="#a88b62" />`
      + `<ellipse cx="${r1(x - 0.5)}" cy="${r1(y - 0.6)}" rx="${r1(r * 0.6)}" ry="${r1(r * 0.45)}" fill="#e6cfa4" opacity=".7" />`
  }
  let speck = ""
  for (let i = 0; i < 14; i++)
    speck += `<circle cx="${r1(rnd() * 64)}" cy="${r1(rnd() * 64)}" r="${r1(0.6 + rnd())}" fill="#b89a6e" opacity=".55" />`
  return svg(VT, VT, "<rect width=\"64\" height=\"64\" fill=\"#d7bb8a\" />"
    + `<rect width="64" height="64" fill="#c9aa76" opacity="${r1(0.25 + rnd() * 0.2)}" />`
    + speck + pebbles)
}

/** Клумба поверх травы: россыпь цветов трёх цветов с серединками. */
export function villageFlowersSvg(variant = 0): string {
  const rnd = noise(variant + 31)
  const colors = ["#ff8fab", "#ffd166", "#ffffff", "#b79cff"]
  let out = ""
  for (let i = 0; i < 9; i++) {
    const x = 8 + rnd() * 48
    const y = 8 + rnd() * 48
    const c = colors[Math.floor(rnd() * colors.length)] ?? "#ffffff"
    out += `<path d="M${r1(x)} ${r1(y + 6)} q-1 -3 0 -6" stroke="#3f8f3a" stroke-width="1.4" fill="none" />`
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      out += `<circle cx="${r1(x + Math.cos(a) * 2.2)}" cy="${r1(y + Math.sin(a) * 2.2)}" r="1.8" fill="${c}" />`
    }
    out += `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.3" fill="#e9a23b" />`
  }
  return svg(VT, VT, out)
}

/** Высота спрайта дерева в клетках: крона выше своей клетки, основание — у нижнего края клетки. */
export const TREE_H = 1.75

/** Дерево: ствол, корни, тень и трёхслойная крона; вариант меняет оттенок и форму. */
export function villageTreeSvg(variant = 0): string {
  const rnd = noise(variant + 51)
  const h = VT * TREE_H
  const greens = [["#2f7d32", "#3f9a40", "#5fbf55"], ["#2a6f3f", "#3a8c50", "#62b46a"], ["#3c7a2a", "#539a36", "#7cc04d"]]
  const [dark, mid, light] = greens[variant % greens.length] as [string, string, string]
  const cx = 32 + (rnd() - 0.5) * 4
  const top = 14 + rnd() * 6
  return svg(VT, h, `<ellipse cx="34" cy="${h - 9}" rx="24" ry="7" fill="#000" opacity=".22" />`
    + `<path d="M27 ${h - 30} L28 ${h - 11} Q32 ${h - 7} 36 ${h - 11} L37 ${h - 30} Z" fill="#7a4e2d" />`
    + `<path d="M29 ${h - 30} L30 ${h - 12}" stroke="#9c6a40" stroke-width="2" />`
    + `<path d="M28 ${h - 12} q-5 2 -8 1 M36 ${h - 12} q5 2 8 1" stroke="#6a4226" stroke-width="2.4" fill="none" stroke-linecap="round" />`
    + `<ellipse cx="${r1(cx)}" cy="${r1(h - 44)}" rx="27" ry="21" fill="${dark}" />`
    + `<ellipse cx="${r1(cx - 9)}" cy="${r1(h - 54)}" rx="17" ry="15" fill="${mid}" />`
    + `<ellipse cx="${r1(cx + 10)}" cy="${r1(h - 52)}" rx="16" ry="14" fill="${mid}" />`
    + `<ellipse cx="${r1(cx)}" cy="${r1(top + 18)}" rx="17" ry="${r1(16)}" fill="${mid}" />`
    + `<ellipse cx="${r1(cx - 7)}" cy="${r1(top + 13)}" rx="9" ry="7" fill="${light}" opacity=".85" />`
    + `<ellipse cx="${r1(cx - 15)}" cy="${r1(h - 57)}" rx="6" ry="5" fill="${light}" opacity=".7" />`
    + `<path d="M${r1(cx + 14)} ${r1(h - 38)} q6 -6 4 -14" stroke="${dark}" stroke-width="2" fill="none" opacity=".6" />`)
}

export interface HouseArt {
  w: number
  h: number
  roof: string
  wall: string
  /**
   * Чей домик: у Казармы флаг и щит с мечами, у Лавки полосатый навес и бочки, у Ратуши часы над дверью,
   * вымпелы на крыше и снопы у стены, у Больницы красный крест и горшки с травами, у Столовой котёл над дверью,
   * стол с мисками и дым из трубы. Подпись — вывеской сцены.
   */
  npc: "barracks" | "market" | "settlement" | "hospital" | "canteen"
  /** Уровень здания 1–5: ящики с цветами, каменный цоколь, знамёна, золотой конёк. */
  level?: number
}

/** Сколько клеток крыша выступает над прямоугольником стен домика. */
export const HOUSE_ROOF_OVER = 1.4

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, "0")).join("")}`
}

/**
 * Домик NPC: фасад с дверью посередине нижнего ряда, окна со ставнями, черепичная крыша с трубой и приметы
 * по назначению (`npc`): силуэт читается без подписи, название — вывеской сцены.
 * Спрайт — ширина `w` клеток, высота `h + HOUSE_ROOF_OVER`, низ совпадает с нижним краем стен.
 */
export function villageHouseSvg(a: HouseArt): string {
  const W = a.w * VT
  const H = (a.h + HOUSE_ROOF_OVER) * VT
  const facadeTop = H - VT * 1.7
  const roofBase = facadeTop + 6
  const cx = W / 2
  const doorW = VT * 0.62
  const doorH = VT * 1.02
  const doorX = cx - doorW / 2
  const doorY = H - doorH
  let tiles = ""
  // Ряды черепицы — по ширине ската на своей высоте (крыша — трапеция от roofBase до y = 12)
  for (let row = 1; row <= 5; row++) {
    const y = 12 + row * ((roofBase - 16) / 6)
    const inset = W * 0.18 * ((roofBase - y) / (roofBase - 12)) + 4
    tiles += `<path d="M${r1(inset)} ${r1(y)} H${r1(W - inset)}" stroke="${shade(a.roof, 0.72)}" stroke-width="2" opacity=".7" />`
  }
  const level = a.level ?? 1
  const winL = Math.max(18, cx - doorW / 2 - 64)
  const winR = Math.min(W - 52, cx + doorW / 2 + 30)
  const win = (x: number) => `<rect x="${r1(x)}" y="${r1(facadeTop + 22)}" width="34" height="28" rx="3" fill="#2d3a52" />`
    + `<rect x="${r1(x + 3)}" y="${r1(facadeTop + 25)}" width="28" height="22" rx="2" fill="#ffe7a3" opacity=".85" />`
    + `<path d="M${r1(x + 17)} ${r1(facadeTop + 25)} v22 M${r1(x + 3)} ${r1(facadeTop + 36)} h28" stroke="#5a3b22" stroke-width="2.4" />`
    + `<rect x="${r1(x - 8)}" y="${r1(facadeTop + 21)}" width="7" height="30" fill="${shade(a.roof, 0.85)}" />`
    + `<rect x="${r1(x + 35)}" y="${r1(facadeTop + 21)}" width="7" height="30" fill="${shade(a.roof, 0.85)}" />`
    + `<rect x="${r1(x - 3)}" y="${r1(facadeTop + 52)}" width="40" height="5" fill="#6a4226" />`
    // со 2 уровня — ящик с цветами под окном
    + (level >= 2
      ? `<rect x="${r1(x - 1)}" y="${r1(facadeTop + 56)}" width="36" height="8" rx="2" fill="#8a5a33" />`
      + [5, 12, 19, 26].map((dx, i) => `<circle cx="${r1(x + dx + 1)}" cy="${r1(facadeTop + 55)}" r="3.2" fill="${["#ff8fab", "#ffd166", "#ffffff", "#b79cff"][i]}" />`).join("")
      : "")
  const emblemY = facadeTop - 4
  const hall = () =>
    // часы с золотым ободком над дверью, вымпелы по краям крыши, снопы пшеницы и колокол
    `<circle cx="${r1(cx)}" cy="${r1(emblemY - 2)}" r="16" fill="#f7f0dc" stroke="#c9a227" stroke-width="4" />`
    + `<path d="M${r1(cx)} ${r1(emblemY - 2)} V${r1(emblemY - 13)} M${r1(cx)} ${r1(emblemY - 2)} L${r1(cx + 8)} ${r1(emblemY + 3)}" stroke="#2d2a26" stroke-width="2.6" stroke-linecap="round" />`
    + `<circle cx="${r1(cx)}" cy="${r1(emblemY - 2)}" r="2.4" fill="#2d2a26" />`
    + [W * 0.1, W * 0.9].map(x =>
      `<rect x="${r1(x - 2)}" y="${r1(roofBase - 34)}" width="4" height="34" fill="#5a3b22" />`
      + `<path d="M${r1(x + 2)} ${r1(roofBase - 34)} h20 l-5 6 l5 6 h-20 Z" fill="#c9a227" stroke="#7a5c12" stroke-width="1.2" />`).join("")
    + [16, 30].map(x =>
      `<path d="M${x} ${r1(H - 6)} l4 -26 l4 26 Z" fill="#d9a441" stroke="#8a6420" stroke-width="1.4" />`
      + `<path d="M${x - 3} ${r1(H - 34)} q7 -10 14 0 q-7 6 -14 0 Z" fill="#e8c062" stroke="#8a6420" stroke-width="1.2" />`
      + `<path d="M${x} ${r1(H - 18)} h8" stroke="#8a6420" stroke-width="2" />`).join("")
    + `<path d="M${r1(W - 30)} ${r1(H - 8)} q0 -20 11 -20 q11 0 11 20 Z" fill="#c9a227" stroke="#7a5c12" stroke-width="2" />`
    + `<rect x="${r1(W - 33)}" y="${r1(H - 10)}" width="28" height="5" rx="2" fill="#7a5c12" />`
  const hospital = () =>
    // красный крест в белом круге над дверью, горшки с травами и скатанные бинты у стены
    `<circle cx="${r1(cx)}" cy="${r1(emblemY - 2)}" r="17" fill="#ffffff" stroke="#c0392b" stroke-width="3" />`
    + `<path d="M${r1(cx - 4)} ${r1(emblemY - 13)} h8 v7 h7 v8 h-7 v7 h-8 v-7 h-7 v-8 h7 Z" fill="#e63946" />`
    + [14, 30].map(x =>
      `<path d="M${x - 6} ${r1(H - 18)} h14 l-2 12 h-10 Z" fill="#c8754f" stroke="#7a4426" stroke-width="1.4" />`
      + `<path d="M${x + 1} ${r1(H - 18)} q-6 -10 -2 -16 M${x + 1} ${r1(H - 18)} q6 -10 2 -16 M${x + 1} ${r1(H - 18)} v-14" stroke="#3f8f3a" stroke-width="2.4" fill="none" stroke-linecap="round" />`).join("")
    + `<rect x="${r1(W - 30)}" y="${r1(H - 22)}" width="20" height="14" rx="6" fill="#f7f0dc" stroke="#a9a39c" stroke-width="1.6" />`
    + `<path d="M${r1(W - 24)} ${r1(H - 22)} v14 M${r1(W - 17)} ${r1(H - 22)} v14" stroke="#e63946" stroke-width="1.6" />`
  const canteen = () =>
    // котёл с паром над дверью, дым из трубы, стол с мисками у стены
    `<path d="M${r1(cx - 15)} ${r1(emblemY - 10)} h30 q0 18 -15 18 q-15 0 -15 -18 Z" fill="#3b3f46" stroke="#1d1f24" stroke-width="2" />`
    + `<rect x="${r1(cx - 18)}" y="${r1(emblemY - 13)}" width="36" height="5" rx="2" fill="#5a5f68" />`
    + `<path d="M${r1(cx - 6)} ${r1(emblemY - 16)} q-5 -6 0 -12 q5 -6 0 -12 M${r1(cx + 6)} ${r1(emblemY - 16)} q-5 -6 0 -12" stroke="#ffffff" stroke-width="2.4" fill="none" opacity=".8" stroke-linecap="round" />`
    + [0, 1, 2].map(i => `<circle cx="${r1(W * 0.72 + 26 + i * 10)}" cy="${r1(10 - i * 3)}" r="${r1(5 + i * 1.5)}" fill="#ececec" opacity="${r1(0.75 - i * 0.2)}" />`).join("")
    + `<rect x="${r1(W - 40)}" y="${r1(H - 24)}" width="32" height="6" rx="2" fill="#8a5a33" />`
    + `<path d="M${r1(W - 36)} ${r1(H - 18)} v14 M${r1(W - 12)} ${r1(H - 18)} v14" stroke="#5a3b22" stroke-width="3" />`
    + `<ellipse cx="${r1(W - 30)}" cy="${r1(H - 26)}" rx="6" ry="3" fill="#e9a23b" stroke="#7a4426" stroke-width="1.2" />`
    + `<ellipse cx="${r1(W - 18)}" cy="${r1(H - 26)}" rx="6" ry="3" fill="#f3e2c0" stroke="#7a4426" stroke-width="1.2" />`
  // Приметы уровня: с 3-го — каменный цоколь, с 4-го — знамёна по углам фасада, на 5-м — золотой конёк и звезда
  const stones = level >= 3
    ? Array.from({ length: Math.floor((W - 16) / 16) }, (_, i) =>
        `<rect x="${r1(9 + i * 16 + (i % 2) * 2)}" y="${r1(H - 11)}" width="13" height="9" rx="3" fill="#b8b2aa" stroke="#6f6a64" stroke-width="1.2" />`).join("")
    : ""
  const banners = level >= 4
    ? [14, W - 26].map(x =>
      `<rect x="${r1(x)}" y="${r1(facadeTop + 8)}" width="12" height="26" fill="${shade(a.roof, 0.9)}" />`
      + `<path d="M${r1(x)} ${r1(facadeTop + 34)} l6 6 l6 -6 Z" fill="${shade(a.roof, 0.9)}" />`
      + `<circle cx="${r1(x + 6)}" cy="${r1(facadeTop + 20)}" r="3.4" fill="#ffd166" />`).join("")
    : ""
  const crown = level >= 5
    ? `<path d="M${r1(W * 0.18)} 12 H${r1(W * 0.82)}" stroke="#ffd166" stroke-width="5" stroke-linecap="round" />`
      + `<path d="M${r1(cx)} -2 l3.5 7 l7.5 1 l-5.5 5 l1.5 7.5 l-7 -3.6 l-7 3.6 l1.5 -7.5 l-5.5 -5 l7.5 -1 Z" fill="#ffd166" stroke="#a6761d" stroke-width="1.2" transform="translate(0 4)" />`
    : ""
  const props = a.npc === "settlement" ? hall() : a.npc === "hospital" ? hospital() : a.npc === "canteen" ? canteen() : a.npc === "barracks"
    // флаг на крыше и щит со скрещёнными мечами над дверью
    ? `<rect x="${r1(W * 0.85)}" y="0" width="4" height="${r1(roofBase - 6)}" fill="#5a3b22" />`
      + `<path d="M${r1(W * 0.85 + 4)} 2 h26 l-7 9 l7 9 h-26 Z" fill="#c0392b" stroke="#7a1f16" stroke-width="1.5" />`
      + `<path d="M${r1(cx - 15)} ${r1(emblemY - 14)} h30 v14 q0 14 -15 20 q-15 -6 -15 -20 Z" fill="#3d6fb6" stroke="#1d3557" stroke-width="2.4" />`
      + `<path d="M${r1(cx - 11)} ${r1(emblemY - 10)} L${r1(cx + 11)} ${r1(emblemY + 12)} M${r1(cx + 11)} ${r1(emblemY - 10)} L${r1(cx - 11)} ${r1(emblemY + 12)}" stroke="#f1f1f1" stroke-width="3" stroke-linecap="round" />`
      // стойка с копьями у стены
      + `<path d="M${r1(W - 22)} ${r1(H - 8)} V${r1(facadeTop + 6)} M${r1(W - 14)} ${r1(H - 8)} V${r1(facadeTop + 10)}" stroke="#7a4e2d" stroke-width="3" />`
      + `<path d="M${r1(W - 25)} ${r1(facadeTop + 6)} l3 -9 l3 9 Z M${r1(W - 17)} ${r1(facadeTop + 10)} l3 -9 l3 9 Z" fill="#c9ced6" />`
      + `<rect x="${r1(W - 28)}" y="${r1(H - 30)}" width="20" height="4" fill="#5a3b22" />`
    // полосатый навес над дверью, бочка и ящики у стены
    : (() => {
        const aw = doorW + 46
        const ax = cx - aw / 2
        const ay = facadeTop - 2
        let stripes = ""
        for (let i = 0; i < 6; i++) {
          const x = ax + (aw / 6) * i
          stripes += `<path d="M${r1(x)} ${r1(ay)} h${r1(aw / 6)} v20 q${r1(-aw / 12)} 7 ${r1(-aw / 6)} 0 Z" fill="${i % 2 === 0 ? "#2f6b4f" : "#f3e2c0"}" />`
        }
        return stripes
          + `<rect x="${r1(ax - 2)}" y="${r1(ay - 4)}" width="${r1(aw + 4)}" height="6" rx="2" fill="#5a3b22" />`
          + `<ellipse cx="22" cy="${r1(H - 18)}" rx="13" ry="16" fill="#9c6a40" stroke="#5a3b22" stroke-width="2" />`
          + `<path d="M10 ${r1(H - 24)} h24 M10 ${r1(H - 12)} h24" stroke="#5a3b22" stroke-width="2" />`
          + `<rect x="${r1(W - 36)}" y="${r1(H - 28)}" width="26" height="22" fill="#c8954f" stroke="#5a3b22" stroke-width="2" />`
          + `<path d="M${r1(W - 36)} ${r1(H - 28)} l26 22 M${r1(W - 10)} ${r1(H - 28)} l-26 22" stroke="#5a3b22" stroke-width="1.5" />`
          + `<circle cx="${r1(W - 23)}" cy="${r1(H - 34)}" r="6" fill="#e63946" />`
      })()
  return svg(W, H, `<ellipse cx="${r1(cx + 8)}" cy="${r1(H - 2)}" rx="${r1(W * 0.52)}" ry="9" fill="#000" opacity=".2" />`
    // фасад и цоколь
    + `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="${r1(H - facadeTop)}" fill="${a.wall}" />`
    + `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="10" fill="${shade(a.wall, 0.8)}" />`
    + `<rect x="8" y="${r1(H - 12)}" width="${r1(W - 16)}" height="12" fill="#8f8a84" />`
    + `<path d="M8 ${r1(H - 6)} H${r1(W - 8)}" stroke="#6f6a64" stroke-width="1.4" />`
    + `<rect x="8" y="${r1(facadeTop)}" width="10" height="${r1(H - facadeTop)}" fill="${shade(a.wall, 1.08)}" opacity=".6" />`
    + stones + banners
    + win(winL) + win(winR)
    // дверь с порогом
    + `<rect x="${r1(doorX - 5)}" y="${r1(doorY - 5)}" width="${r1(doorW + 10)}" height="${r1(doorH + 5)}" rx="4" fill="#5a3b22" />`
    + `<rect x="${r1(doorX)}" y="${r1(doorY)}" width="${r1(doorW)}" height="${r1(doorH)}" rx="3" fill="#8a5a33" />`
    + `<path d="M${r1(doorX + doorW / 3)} ${r1(doorY + 4)} V${r1(H - 4)} M${r1(doorX + (doorW * 2) / 3)} ${r1(doorY + 4)} V${r1(H - 4)}" stroke="#6a4226" stroke-width="2" />`
    + `<circle cx="${r1(doorX + doorW - 7)}" cy="${r1(doorY + doorH * 0.55)}" r="2.6" fill="#ffd166" />`
    + `<rect x="${r1(doorX - 9)}" y="${r1(H - 5)}" width="${r1(doorW + 18)}" height="5" fill="#a9a39c" />`
    // труба и крыша
    + `<rect x="${r1(W * 0.72)}" y="6" width="18" height="34" fill="#8f5a46" />`
    + `<rect x="${r1(W * 0.72 - 3)}" y="2" width="24" height="7" fill="#6f4535" />`
    + `<path d="M0 ${r1(roofBase)} L${r1(W * 0.18)} 12 H${r1(W * 0.82)} L${W} ${r1(roofBase)} Z" fill="${a.roof}" />`
    + `<path d="M0 ${r1(roofBase)} L${r1(W * 0.18)} 12 H${r1(W * 0.5)} L${r1(W * 0.42)} ${r1(roofBase)} Z" fill="${shade(a.roof, 1.18)}" opacity=".55" />`
    + tiles
    + `<rect x="0" y="${r1(roofBase - 4)}" width="${W}" height="8" rx="3" fill="${shade(a.roof, 0.65)}" />`
    + crown
    + props)
}

/** Высота спрайта Кладбища в клетках: ограда участка и надгробия, крест поднимается на полклетки выше. */
export const GRAVEYARD_H_OVER = 0.5

/**
 * Кладбище: участок `w` × `h` клеток за низкой кованой оградой с калиткой снизу посередине, надгробия рядами,
 * холмики, крест, кривое дерево и фонарь. Низ спрайта — нижний край участка.
 */
export function villageGraveyardSvg(w: number, h: number): string {
  const W = w * VT
  const H = (h + GRAVEYARD_H_OVER) * VT
  const top = GRAVEYARD_H_OVER * VT
  let stones = ""
  const stone = (x: number, y: number, k: number) => {
    const sw = 22
    const sh = 28 + (k % 2) * 6
    return `<ellipse cx="${r1(x)}" cy="${r1(y + 10)}" rx="16" ry="6" fill="#6b4a2b" opacity=".55" />`
      + `<path d="M${r1(x - sw / 2)} ${r1(y + 4)} V${r1(y - sh + 11)} q${r1(sw / 2)} -14 ${sw} 0 V${r1(y + 4)} Z" fill="#a9a39c" stroke="#5f5a55" stroke-width="2" />`
      + `<path d="M${r1(x - 5)} ${r1(y - sh + 18)} h10 M${r1(x)} ${r1(y - sh + 13)} v12" stroke="#6f6a64" stroke-width="2" />`
  }
  const cols = Math.max(2, w - 1)
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < cols; i++) stones += stone(28 + (i + 0.5) * ((W - 56) / cols) + (row % 2) * 10, top + 44 + row * 62, i + row)
  let fence = ""
  const gateL = W / 2 - 22
  const gateR = W / 2 + 22
  for (let x = 6; x <= W - 6; x += 12) {
    if (x > gateL && x < gateR) continue
    fence += `<path d="M${r1(x)} ${r1(H - 4)} V${r1(H - 30)} l-3 -5 h6 l-3 5" stroke="#2b2d42" stroke-width="2.4" fill="#2b2d42" />`
  }
  for (let y = top + 10; y < H - 6; y += 12)
    for (const x of [6, W - 6]) fence += `<path d="M${x} ${r1(y)} v10" stroke="#2b2d42" stroke-width="2.4" />`
  return svg(W, H, `<rect x="4" y="${r1(top + 4)}" width="${r1(W - 8)}" height="${r1(H - top - 8)}" rx="6" fill="#5f8f3e" />`
    + `<rect x="4" y="${r1(top + 4)}" width="${r1(W - 8)}" height="${r1(H - top - 8)}" rx="6" fill="#2b2d42" opacity=".12" />`
    // кривое дерево и крест
    + `<path d="M${r1(W - 30)} ${r1(top + 40)} q-6 -24 4 -44 M${r1(W - 28)} ${r1(top + 6)} q10 -6 16 -2 M${r1(W - 27)} ${r1(top + 14)} q-12 -4 -16 -12" stroke="#4a3426" stroke-width="5" fill="none" stroke-linecap="round" />`
    + `<rect x="${r1(W / 2 - 4)}" y="4" width="8" height="${r1(top + 24)}" fill="#7a6a5a" />`
    + `<rect x="${r1(W / 2 - 14)}" y="14" width="28" height="8" fill="#7a6a5a" />`
    + stones
    // ограда с калиткой и фонарём
    + `<path d="M6 ${r1(H - 26)} H${r1(gateL)} M${r1(gateR)} ${r1(H - 26)} H${r1(W - 6)} M6 ${r1(top + 10)} H${r1(W - 6)}" stroke="#2b2d42" stroke-width="3" />`
    + fence
    + `<path d="M${r1(gateL)} ${r1(H - 4)} V${r1(H - 40)} M${r1(gateR)} ${r1(H - 4)} V${r1(H - 40)}" stroke="#2b2d42" stroke-width="4" />`
    + `<circle cx="${r1(gateR + 10)}" cy="${r1(H - 40)}" r="12" fill="#ffd166" opacity=".25" />`
    + `<rect x="${r1(gateR + 5)}" y="${r1(H - 48)}" width="10" height="14" rx="2" fill="#ffe7a3" stroke="#2b2d42" stroke-width="1.5" />`)
}

/** Высота спрайта ворот в клетках: столбы и перекладина поднимаются над нижним рядом карты. */
export const GATE_H = 2.3

/**
 * Ворота на выход из поселения (`w` клеток): частокол по бокам, бревенчатые столбы с фонарями, перекладина с вывеской,
 * распахнутые створки и тропинка, уходящая за околицу. Низ спрайта — нижний край ряда ворот.
 */
export function villageGateSvg(w: number): string {
  const W = w * VT
  const H = VT * GATE_H
  const postW = 22
  const lx = VT * 0.32
  const rx = W - VT * 0.32 - postW
  const top = 30
  const beamY = top - 4
  const inner = lx + postW
  const innerR = rx
  let stakes = ""
  // частокол: заострённые колья слева и справа от столбов
  for (const [from, to] of [[0, lx], [rx + postW, W]] as const) {
    for (let x = from; x < to - 4; x += 10) {
      const h = H - 62 + ((x * 7) % 9)
      stakes += `<path d="M${r1(x + 1)} ${r1(H - 6)} V${r1(h)} L${r1(x + 5)} ${r1(h - 8)} L${r1(x + 9)} ${r1(h)} V${r1(H - 6)} Z" fill="#8a5a33" stroke="#5a3b22" stroke-width="1.2" />`
    }
  }
  const post = (x: number) => `<rect x="${r1(x)}" y="${top}" width="${postW}" height="${r1(H - top - 4)}" rx="4" fill="#7a4e2d" />`
    + `<rect x="${r1(x + 3)}" y="${top}" width="5" height="${r1(H - top - 4)}" fill="#9c6a40" opacity=".7" />`
    + `<path d="M${r1(x)} ${r1(top + 30)} h${postW} M${r1(x)} ${r1(H - 40)} h${postW}" stroke="#5a3b22" stroke-width="2" />`
    + `<ellipse cx="${r1(x + postW / 2)}" cy="${top}" rx="${r1(postW / 2 + 2)}" ry="5" fill="#9c6a40" stroke="#5a3b22" stroke-width="1.5" />`
  const lantern = (x: number) => `<line x1="${r1(x)}" y1="${r1(top + 36)}" x2="${r1(x)}" y2="${r1(top + 44)}" stroke="#3b2614" stroke-width="1.5" />`
    + `<circle cx="${r1(x)}" cy="${r1(top + 52)}" r="11" fill="#ffd166" opacity=".25" />`
    + `<rect x="${r1(x - 5)}" y="${r1(top + 44)}" width="10" height="14" rx="2" fill="#ffe7a3" stroke="#3b2614" stroke-width="1.5" />`
  // створки распахнуты наружу: доски под углом от столбов
  const door = (x0: number, dir: 1 | -1) => {
    const x1 = x0 + dir * 22
    let planks = ""
    for (let i = 1; i < 4; i++) {
      const x = x0 + ((x1 - x0) * i) / 4
      planks += `<line x1="${r1(x)}" y1="${r1(top + 26 + i * 2)}" x2="${r1(x)}" y2="${r1(H - 10 + i)}" stroke="#5a3b22" stroke-width="1.2" />`
    }
    return `<path d="M${r1(x0)} ${r1(top + 24)} L${r1(x1)} ${r1(top + 34)} L${r1(x1)} ${r1(H - 6)} L${r1(x0)} ${r1(H - 12)} Z" fill="#a8743f" stroke="#5a3b22" stroke-width="1.5" />`
      + planks
      + `<path d="M${r1(x0)} ${r1(top + 40)} L${r1(x1)} ${r1(top + 48)} M${r1(x0)} ${r1(H - 30)} L${r1(x1)} ${r1(H - 22)}" stroke="#5a3b22" stroke-width="2.4" />`
  }
  const signW = Math.min(W * 0.62, 132)
  return svg(W, H, `<ellipse cx="${r1(W / 2 + 6)}" cy="${r1(H - 3)}" rx="${r1(W * 0.5)}" ry="7" fill="#000" opacity=".2" />`
    // за воротами: луг и тропинка, уходящая вдаль
    + `<rect x="${r1(inner)}" y="${r1(top + 20)}" width="${r1(innerR - inner)}" height="${r1(H - top - 24)}" fill="#7cc04d" />`
    + `<path d="M${r1(W / 2 - 26)} ${r1(H - 4)} L${r1(W / 2 - 6)} ${r1(top + 22)} H${r1(W / 2 + 6)} L${r1(W / 2 + 26)} ${r1(H - 4)} Z" fill="#d7bb8a" />`
    + `<path d="M${r1(inner)} ${r1(top + 34)} q18 -8 34 0 t34 0 t34 0" stroke="#5f9f3c" stroke-width="5" fill="none" opacity=".6" />`
    + stakes
    + door(inner, 1) + door(innerR, -1)
    + post(lx) + post(rx)
    + lantern(lx - 6) + lantern(rx + postW + 6)
    // перекладина с верёвками и вывеской
    + `<rect x="${r1(lx - 10)}" y="${r1(beamY)}" width="${r1(rx + postW - lx + 20)}" height="14" rx="5" fill="#8a5a33" stroke="#5a3b22" stroke-width="2" />`
    + `<rect x="${r1(lx - 10)}" y="${r1(beamY + 2)}" width="${r1(rx + postW - lx + 20)}" height="4" rx="2" fill="#b98652" opacity=".7" />`
    + `<line x1="${r1(W / 2 - signW / 2 + 10)}" y1="${r1(beamY + 14)}" x2="${r1(W / 2 - signW / 2 + 10)}" y2="${r1(beamY + 22)}" stroke="#3b2614" stroke-width="2" />`
    + `<line x1="${r1(W / 2 + signW / 2 - 10)}" y1="${r1(beamY + 14)}" x2="${r1(W / 2 + signW / 2 - 10)}" y2="${r1(beamY + 22)}" stroke="#3b2614" stroke-width="2" />`
    + `<rect x="${r1(W / 2 - signW / 2)}" y="${r1(beamY + 21)}" width="${r1(signW)}" height="24" rx="4" fill="#f3e2c0" stroke="#5a3b22" stroke-width="2.5" />`
    + `<path d="M${r1(W / 2 - 12)} ${r1(beamY + 26)} l24 14 M${r1(W / 2 + 12)} ${r1(beamY + 26)} l-24 14" stroke="#7a1f16" stroke-width="3" stroke-linecap="round" />`)
}


/* ---------- Постройки под открытым небом ---------- */

/** Ограда участка `W` × `H` (SVG-единицы) от `top` с проходом снизу посередине. */
function yardFence(W: number, H: number, top: number, color = "#8a5a33"): string {
  const gapL = W / 2 - 26
  const gapR = W / 2 + 26
  let out = `<path d="M6 ${r1(top + 14)} H${r1(W - 6)} M6 ${r1(H - 18)} H${r1(gapL)} M${r1(gapR)} ${r1(H - 18)} H${r1(W - 6)}" stroke="${color}" stroke-width="4" />`
    + `<path d="M6 ${r1(top + 14)} V${r1(H - 18)} M${r1(W - 6)} ${r1(top + 14)} V${r1(H - 18)}" stroke="${color}" stroke-width="4" />`
  const post = (x: number, y: number) => `<rect x="${r1(x - 3.5)}" y="${r1(y - 14)}" width="7" height="18" rx="2" fill="${shade(color, 0.8)}" />`
  for (let x = 6; x <= W - 6; x += 32) {
    out += post(x, top + 16)
    if (x < gapL || x > gapR) out += post(x, H - 16)
  }
  for (let y = top + 46; y < H - 24; y += 32) out += post(6, y) + post(W - 6, y)
  return out + post(gapL, H - 16) + post(gapR, H - 16)
}

/** Соломенное чучело на столбе: мешок-туловище, голова, перекладина рук. */
function dummy(x: number, y: number): string {
  return `<ellipse cx="${r1(x + 2)}" cy="${r1(y + 2)}" rx="12" ry="4" fill="#000" opacity=".2" />`
    + `<rect x="${r1(x - 2.5)}" y="${r1(y - 52)}" width="5" height="54" fill="#7a4e2d" />`
    + `<rect x="${r1(x - 18)}" y="${r1(y - 40)}" width="36" height="5" rx="2" fill="#7a4e2d" />`
    + `<path d="M${r1(x - 12)} ${r1(y - 38)} q12 -4 24 0 l-3 26 q-9 4 -18 0 Z" fill="#e2c065" stroke="#a6761d" stroke-width="1.6" />`
    + `<path d="M${r1(x - 10)} ${r1(y - 26)} h20 M${r1(x - 9)} ${r1(y - 18)} h18" stroke="#a6761d" stroke-width="1.4" />`
    + `<circle cx="${r1(x)}" cy="${r1(y - 50)}" r="9" fill="#e8c062" stroke="#a6761d" stroke-width="1.6" />`
    + `<path d="M${r1(x - 4)} ${r1(y - 52)} l3 3 M${r1(x + 1)} ${r1(y - 52)} l3 3 M${r1(x - 4)} ${r1(y - 49)} l3 -3 M${r1(x + 1)} ${r1(y - 49)} l3 -3" stroke="#7a1f16" stroke-width="1.4" />`
}

/**
 * Тренировочный полигон: утоптанный двор `w` × `h` клеток за оградой с проходом снизу, чучела (больше с уровнем),
 * со 2 уровня — мишень, с 3-го — стойка с оружием, с 4-го — знамя, на 5-м — золотые наконечники ограды.
 * Спрайт выше участка на `over` клеток (головы чучел).
 */
export function villageTrainingSvg(w: number, h: number, over: number, level: number): string {
  const W = w * VT
  const H = (h + over) * VT
  const top = over * VT
  const dummies = level >= 4 ? 3 : level >= 2 ? 2 : 1
  let body = `<rect x="4" y="${r1(top + 8)}" width="${r1(W - 8)}" height="${r1(H - top - 12)}" rx="8" fill="#cfae7a" />`
    + `<rect x="4" y="${r1(top + 8)}" width="${r1(W - 8)}" height="${r1(H - top - 12)}" rx="8" fill="#8a5a33" opacity=".12" />`
  const rnd = noise(w * 7 + h)
  for (let i = 0; i < 18; i++)
    body += `<circle cx="${r1(14 + rnd() * (W - 28))}" cy="${r1(top + 20 + rnd() * (H - top - 40))}" r="${r1(1 + rnd() * 1.6)}" fill="#a88b62" opacity=".7" />`
  body += yardFence(W, H, top)
  if (level >= 2) {
    // мишень на треноге справа
    const tx = W - 44
    const ty = top + 46
    body += `<path d="M${tx} ${ty + 30} l-10 26 M${tx} ${ty + 30} l10 26 M${tx} ${ty + 30} v26" stroke="#5a3b22" stroke-width="3" />`
      + `<circle cx="${tx}" cy="${ty + 14}" r="20" fill="#f3e2c0" stroke="#5a3b22" stroke-width="2" />`
      + `<circle cx="${tx}" cy="${ty + 14}" r="13" fill="#e63946" />`
      + `<circle cx="${tx}" cy="${ty + 14}" r="7" fill="#f3e2c0" />`
      + `<circle cx="${tx}" cy="${ty + 14}" r="3" fill="#e63946" />`
      + `<path d="M${tx - 22} ${ty + 6} L${tx - 2} ${ty + 13}" stroke="#5a3b22" stroke-width="2" /><path d="M${tx - 24} ${ty + 3} l4 2 l-1 4" fill="none" stroke="#e8e8e8" stroke-width="2" />`
  }
  if (level >= 3) {
    // стойка с мечами и копьём слева
    const rx = 22
    const ry = top + 30
    body += `<rect x="${rx}" y="${ry + 32}" width="40" height="5" rx="2" fill="#7a4e2d" />`
      + `<path d="M${rx + 4} ${ry + 37} v18 M${rx + 36} ${ry + 37} v18" stroke="#7a4e2d" stroke-width="4" />`
      + [8, 18, 28].map(dx => `<path d="M${rx + dx} ${ry + 34} V${ry + 4}" stroke="#c9ced6" stroke-width="3" /><path d="M${rx + dx - 4} ${ry + 24} h8" stroke="#5a3b22" stroke-width="3" />`).join("")
  }
  if (level >= 4) {
    body += `<rect x="${r1(W / 2 - 2)}" y="2" width="4" height="${r1(top + 30)}" fill="#5a3b22" />`
      + `<path d="M${r1(W / 2 + 2)} 4 h28 l-7 9 l7 9 h-28 Z" fill="#c0392b" stroke="#7a1f16" stroke-width="1.5" />`
  }
  if (level >= 5) {
    for (let x = 6; x <= W - 6; x += 32) body += `<circle cx="${x}" cy="${r1(top + 2)}" r="4" fill="#ffd166" stroke="#a6761d" stroke-width="1.2" />`
  }
  const slots = dummies === 1 ? [W / 2] : dummies === 2 ? [W * 0.36, W * 0.62] : [W * 0.3, W * 0.5, W * 0.7]
  for (const [i, x] of slots.entries()) body += dummy(x, top + 74 + (i % 2) * 22)
  return svg(W, H, body)
}

/**
 * Поля: грядки `w` × `h` клеток, всходы по зрелости (`stage` 0 — ростки, 1 — зелень, 2 — золотые колосья),
 * со 2 уровня — плетень, с 3-го — пугало, с 4-го — стог, на 5-м — подсолнухи вдоль верха.
 */
export function villageFieldsSvg(w: number, h: number, over: number, level: number, stage: number): string {
  const W = w * VT
  const H = (h + over) * VT
  const top = over * VT
  let body = `<rect x="4" y="${r1(top + 6)}" width="${r1(W - 8)}" height="${r1(H - top - 10)}" rx="6" fill="#7a5233" />`
  const rows = h * 2
  const rowH = (H - top - 26) / rows
  for (let i = 0; i < rows; i++) {
    const y = top + 14 + i * rowH
    body += `<rect x="12" y="${r1(y)}" width="${r1(W - 24)}" height="${r1(rowH * 0.62)}" rx="4" fill="#5e3d24" />`
      + `<rect x="12" y="${r1(y)}" width="${r1(W - 24)}" height="3" rx="2" fill="#9b6b44" opacity=".7" />`
    for (let x = 22; x < W - 16; x += 14) {
      const cy = y + rowH * 0.32
      if (stage === 0) body += `<path d="M${x} ${r1(cy + 3)} q-3 -5 -5 -6 M${x} ${r1(cy + 3)} q3 -5 5 -6" stroke="#6fbf4a" stroke-width="2" fill="none" />`
      else if (stage === 1) body += `<path d="M${x} ${r1(cy + 4)} V${r1(cy - 9)} M${x} ${r1(cy - 2)} q-6 -3 -7 -9 M${x} ${r1(cy - 4)} q6 -3 7 -9" stroke="#4f9f3a" stroke-width="2.2" fill="none" stroke-linecap="round" />`
      else {
        body += `<path d="M${x} ${r1(cy + 4)} V${r1(cy - 12)}" stroke="#c9a227" stroke-width="2" />`
          + `<ellipse cx="${x}" cy="${r1(cy - 15)}" rx="3.2" ry="6.5" fill="#e8c062" stroke="#a6761d" stroke-width="1" />`
      }
    }
  }
  if (level >= 2) body += yardFence(W, H, top - 4, "#9c7a4f")
  if (level >= 3) {
    // пугало над полем
    const x = W - 46
    const y = top + 40
    body += `<rect x="${x - 2.5}" y="${y - 40}" width="5" height="60" fill="#7a4e2d" />`
      + `<rect x="${x - 20}" y="${y - 24}" width="40" height="5" rx="2" fill="#7a4e2d" />`
      + `<path d="M${x - 13} ${y - 22} h26 l-4 26 h-18 Z" fill="#3d6fb6" stroke="#1d3557" stroke-width="1.6" />`
      + `<circle cx="${x}" cy="${y - 34}" r="9" fill="#e8c062" stroke="#a6761d" stroke-width="1.4" />`
      + `<path d="M${x - 15} ${y - 39} h30 l-6 -9 h-18 Z" fill="#8a5a33" stroke="#5a3b22" stroke-width="1.4" />`
  }
  if (level >= 4) {
    body += `<path d="M14 ${r1(top + 64)} q22 -48 44 0 Z" fill="#e2c065" stroke="#a6761d" stroke-width="2" />`
      + `<path d="M22 ${r1(top + 52)} q14 -8 28 0 M26 ${r1(top + 40)} q10 -6 20 0" stroke="#a6761d" stroke-width="1.6" fill="none" />`
  }
  if (level >= 5) {
    for (let x = 70; x < W - 70; x += 30) {
      body += `<path d="M${x} ${r1(top + 16)} V${r1(top - 14)}" stroke="#3f8f3a" stroke-width="3" />`
        + Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2
          return `<ellipse cx="${r1(x + Math.cos(a) * 7)}" cy="${r1(top - 18 + Math.sin(a) * 7)}" rx="4" ry="2.4" transform="rotate(${r1((a * 180) / Math.PI)} ${r1(x + Math.cos(a) * 7)} ${r1(top - 18 + Math.sin(a) * 7)})" fill="#ffd166" />`
        }).join("")
        + `<circle cx="${x}" cy="${r1(top - 18)}" r="5" fill="#7a4e2d" />`
    }
  }
  return svg(W, H, body)
}

/* ---------- Декор ---------- */

/** Спрайт декора на одну клетку высотой `h` клеток (низ — нижний край клетки). Тропинка и клумба — отдельно. */
export function villageDecorSvg(id: string, h: number): string {
  const H = VT * h
  const b = H - 8
  const shadow = (rx = 20) => `<ellipse cx="34" cy="${r1(b + 2)}" rx="${rx}" ry="6" fill="#000" opacity=".22" />`
  switch (id) {
    case "lantern":
      return svg(VT, H, shadow(12)
        + `<rect x="29" y="${r1(b - 70)}" width="6" height="72" rx="2" fill="#3b3f46" />`
        + `<path d="M24 ${r1(b)} h16 l-3 -6 h-10 Z" fill="#3b3f46" />`
        + `<circle cx="32" cy="${r1(b - 66)}" r="20" fill="#ffd166" opacity=".22" />`
        + `<path d="M22 ${r1(b - 78)} h20 l-3 22 h-14 Z" fill="#ffe7a3" stroke="#3b3f46" stroke-width="2.4" />`
        + `<path d="M19 ${r1(b - 80)} h26 l-4 -7 h-18 Z" fill="#3b3f46" />`
        + `<path d="M32 ${r1(b - 76)} v18" stroke="#e9a23b" stroke-width="2" opacity=".7" />`)
    case "campfire":
      return svg(VT, H, shadow(24)
        + [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
          const a = (k / 8) * Math.PI * 2
          return `<ellipse cx="${r1(32 + Math.cos(a) * 20)}" cy="${r1(b - 8 + Math.sin(a) * 8)}" rx="6" ry="4.5" fill="#8f8a84" stroke="#5f5a55" stroke-width="1.2" />`
        }).join("")
        + `<path d="M16 ${r1(b - 4)} L48 ${r1(b - 16)} M16 ${r1(b - 16)} L48 ${r1(b - 4)}" stroke="#6a4226" stroke-width="6" stroke-linecap="round" />`
        + `<path d="M32 ${r1(b - 52)} q14 18 8 34 q-8 8 -16 0 q-6 -16 8 -34 Z" fill="#f77f00" />`
        + `<path d="M32 ${r1(b - 38)} q8 10 4 20 q-4 4 -8 0 q-3 -10 4 -20 Z" fill="#ffd166" />`)
    case "barrels": {
      const barrel = (x: number, y: number, s: number) =>
        `<ellipse cx="${x}" cy="${r1(y - 16 * s)}" rx="${r1(12 * s)}" ry="${r1(17 * s)}" fill="#9c6a40" stroke="#5a3b22" stroke-width="2" />`
        + `<path d="M${r1(x - 12 * s)} ${r1(y - 24 * s)} h${r1(24 * s)} M${r1(x - 12 * s)} ${r1(y - 8 * s)} h${r1(24 * s)}" stroke="#3b3f46" stroke-width="2.4" />`
        + `<ellipse cx="${x}" cy="${r1(y - 32 * s)}" rx="${r1(9 * s)}" ry="${r1(3.5 * s)}" fill="#b98652" stroke="#5a3b22" stroke-width="1.4" />`
      return svg(VT, H, shadow(26) + barrel(22, b - 2, 0.9) + barrel(42, b + 1, 1))
    }
    case "bench":
      return svg(VT, H, shadow(26)
        + `<rect x="8" y="${r1(b - 30)}" width="48" height="7" rx="2" fill="#8a5a33" />`
        + `<rect x="8" y="${r1(b - 20)}" width="48" height="8" rx="2" fill="#a8743f" stroke="#5a3b22" stroke-width="1.4" />`
        + `<path d="M13 ${r1(b - 12)} v12 M51 ${r1(b - 12)} v12 M13 ${r1(b - 30)} v10 M51 ${r1(b - 30)} v10" stroke="#5a3b22" stroke-width="4" />`)
    case "banner":
      return svg(VT, H, shadow(10)
        + `<rect x="18" y="6" width="5" height="${r1(b - 4)}" rx="2" fill="#5a3b22" />`
        + `<circle cx="20.5" cy="6" r="4" fill="#ffd166" />`
        + `<path d="M23 12 h28 v38 l-14 -8 l-14 8 Z" fill="#c0392b" stroke="#7a1f16" stroke-width="1.6" />`
        + `<circle cx="37" cy="26" r="5" fill="#ffd166" /><circle cx="30" cy="20" r="2.4" fill="#ffd166" /><circle cx="37" cy="17" r="2.4" fill="#ffd166" /><circle cx="44" cy="20" r="2.4" fill="#ffd166" />`)
    case "well":
      return svg(VT, H, shadow(26)
        + `<path d="M14 ${r1(b - 26)} V${r1(b - 2)} Q32 ${r1(b + 6)} 50 ${r1(b - 2)} V${r1(b - 26)} Z" fill="#a9a39c" stroke="#5f5a55" stroke-width="2" />`
        + `<path d="M14 ${r1(b - 16)} Q32 ${r1(b - 8)} 50 ${r1(b - 16)}" stroke="#5f5a55" stroke-width="1.4" fill="none" />`
        + `<ellipse cx="32" cy="${r1(b - 26)}" rx="18" ry="6" fill="#2d3a52" stroke="#5f5a55" stroke-width="2" />`
        + `<path d="M16 ${r1(b - 26)} V${r1(b - 70)} M48 ${r1(b - 26)} V${r1(b - 70)}" stroke="#7a4e2d" stroke-width="4" />`
        + `<path d="M8 ${r1(b - 64)} L32 ${r1(b - 88)} L56 ${r1(b - 64)} Z" fill="#8c3b2e" stroke="#5a2a20" stroke-width="2" />`
        + `<path d="M32 ${r1(b - 64)} v18" stroke="#3b2614" stroke-width="1.4" />`
        + `<path d="M26 ${r1(b - 46)} h12 l-2 10 h-8 Z" fill="#8a5a33" stroke="#5a3b22" stroke-width="1.4" />`)
    default:
      return svg(VT, H, "")
  }
}

/** Частокол клетки: заострённые колья на перекладине; `side` — боковая стена (колья гуще, без просветов). */
export const FENCE_H = 1.5

export function villageFenceSvg(side: boolean, variant = 0): string {
  const H = VT * FENCE_H
  const rnd = noise(variant + 71)
  let out = `<ellipse cx="32" cy="${r1(H - 4)}" rx="34" ry="5" fill="#000" opacity=".18" />`
  const n = side ? 3 : 4
  const step = side ? 13 : 16
  const x0 = side ? 32 - step : 0
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step
    const top = 16 + rnd() * 10
    out += `<path d="M${r1(x + 1)} ${r1(H - 4)} V${r1(top)} L${r1(x + 8)} ${r1(top - 10)} L${r1(x + 15)} ${r1(top)} V${r1(H - 4)} Z" fill="#8a5a33" stroke="#5a3b22" stroke-width="1.4" />`
      + `<path d="M${r1(x + 4)} ${r1(top + 2)} V${r1(H - 8)}" stroke="#a8743f" stroke-width="2" opacity=".7" />`
  }
  if (!side) out += `<path d="M0 ${r1(H - 30)} H64 M0 ${r1(H - 14)} H64" stroke="#5a3b22" stroke-width="4" />`
  return svg(VT, H, out)
}
