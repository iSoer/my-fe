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
  sign: string
}

/** Сколько клеток крыша выступает над прямоугольником стен домика. */
export const HOUSE_ROOF_OVER = 1.4

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, "0")).join("")}`
}

/**
 * Домик NPC: фасад с дверью посередине нижнего ряда, окна со ставнями, черепичная крыша с трубой и вывеска.
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
  const win = (x: number) => `<rect x="${r1(x)}" y="${r1(facadeTop + 22)}" width="34" height="28" rx="3" fill="#2d3a52" />`
    + `<rect x="${r1(x + 3)}" y="${r1(facadeTop + 25)}" width="28" height="22" rx="2" fill="#ffe7a3" opacity=".85" />`
    + `<path d="M${r1(x + 17)} ${r1(facadeTop + 25)} v22 M${r1(x + 3)} ${r1(facadeTop + 36)} h28" stroke="#5a3b22" stroke-width="2.4" />`
    + `<rect x="${r1(x - 8)}" y="${r1(facadeTop + 21)}" width="7" height="30" fill="${shade(a.roof, 0.85)}" />`
    + `<rect x="${r1(x + 35)}" y="${r1(facadeTop + 21)}" width="7" height="30" fill="${shade(a.roof, 0.85)}" />`
    + `<rect x="${r1(x - 3)}" y="${r1(facadeTop + 52)}" width="40" height="5" fill="#6a4226" />`
  const signW = Math.min(W * 0.56, 150)
  return svg(W, H, `<ellipse cx="${r1(cx + 8)}" cy="${r1(H - 2)}" rx="${r1(W * 0.52)}" ry="9" fill="#000" opacity=".2" />`
    // фасад и цоколь
    + `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="${r1(H - facadeTop)}" fill="${a.wall}" />`
    + `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="10" fill="${shade(a.wall, 0.8)}" />`
    + `<rect x="8" y="${r1(H - 12)}" width="${r1(W - 16)}" height="12" fill="#8f8a84" />`
    + `<path d="M8 ${r1(H - 6)} H${r1(W - 8)}" stroke="#6f6a64" stroke-width="1.4" />`
    + `<rect x="8" y="${r1(facadeTop)}" width="10" height="${r1(H - facadeTop)}" fill="${shade(a.wall, 1.08)}" opacity=".6" />`
    + win(cx - doorW / 2 - 64) + win(cx + doorW / 2 + 30)
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
    // вывеска над дверью
    + `<rect x="${r1(cx - signW / 2)}" y="${r1(facadeTop - 26)}" width="${r1(signW)}" height="30" rx="5" fill="#f3e2c0" stroke="#5a3b22" stroke-width="3" />`
    + `<text x="${r1(cx)}" y="${r1(facadeTop - 5)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="800" fill="#3b2614">${a.sign}</text>`)
}

/** Высота спрайта ворот в клетках: столбы и перекладина поднимаются над нижним рядом карты. */
export const GATE_H = 2.3

/**
 * Ворота на выход из поселения (`w` клеток): частокол по бокам, бревенчатые столбы с фонарями, перекладина с вывеской,
 * распахнутые створки и тропинка, уходящая за околицу. Низ спрайта — нижний край ряда ворот.
 */
export function villageGateSvg(w: number, sign: string): string {
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
    + `<text x="${r1(W / 2)}" y="${r1(beamY + 38)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#3b2614">${sign}</text>`)
}
