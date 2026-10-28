// Процедурный SVG вылазки в чащу: сундук (закрытый и открытый) и ключ. Свет сверху-слева, как у тайлов (`art/tile.ts`);
// без id и градиентов — копии на поле не конфликтуют.

const svg = (body: string): string =>
  `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

/** Сундук на клетке: дубовые доски, железные оковки, замок; открытый — откинутая крышка и сияние добычи. */
export function chestSvg(open: boolean): string {
  const shadow = "<ellipse cx=\"33\" cy=\"55\" rx=\"24\" ry=\"6\" fill=\"#000\" opacity=\".38\" />"
  const body = "<rect x=\"10\" y=\"30\" width=\"44\" height=\"24\" rx=\"3\" fill=\"#7a4a24\" stroke=\"#3b2412\" stroke-width=\"2\" />"
    + "<path d=\"M10 38 h44 M10 46 h44\" stroke=\"#5c3518\" stroke-width=\"1.6\" opacity=\".8\" />"
    + "<rect x=\"14\" y=\"30\" width=\"5\" height=\"24\" fill=\"#8d97a1\" stroke=\"#3d434a\" stroke-width=\"1.2\" />"
    + "<rect x=\"45\" y=\"30\" width=\"5\" height=\"24\" fill=\"#8d97a1\" stroke=\"#3d434a\" stroke-width=\"1.2\" />"
    + "<rect x=\"10\" y=\"30\" width=\"44\" height=\"3\" fill=\"#fff\" opacity=\".14\" />"
  if (!open) {
    const lid = "<path d=\"M10 31 V22 Q10 12 32 12 Q54 12 54 22 V31 Z\" fill=\"#8a5530\" stroke=\"#3b2412\" stroke-width=\"2\" />"
      + "<path d=\"M14 31 V20 Q15 15 19 14 V31 Z M45 14 Q49 15 50 20 V31 H45 Z\" fill=\"#8d97a1\" stroke=\"#3d434a\" stroke-width=\"1.2\" />"
      + "<path d=\"M16 18 Q32 10 48 18\" stroke=\"#fff\" stroke-width=\"2\" fill=\"none\" opacity=\".25\" />"
    const lock = "<rect x=\"27\" y=\"26\" width=\"10\" height=\"12\" rx=\"2\" fill=\"#e0b54a\" stroke=\"#6b4c10\" stroke-width=\"1.4\" />"
      + "<circle cx=\"32\" cy=\"31\" r=\"1.8\" fill=\"#3b2412\" /><rect x=\"31.2\" y=\"31\" width=\"1.6\" height=\"4\" fill=\"#3b2412\" />"
    return svg(shadow + body + lid + lock)
  }
  const glow = "<ellipse cx=\"32\" cy=\"30\" rx=\"20\" ry=\"9\" fill=\"#ffe08a\" opacity=\".55\" />"
    + "<path d=\"M22 30 L18 6 M32 28 V2 M42 30 L46 6\" stroke=\"#fff3c4\" stroke-width=\"3\" opacity=\".45\" stroke-linecap=\"round\" />"
  const lid = "<path d=\"M10 30 L13 10 Q32 4 51 10 L54 30 Q32 25 10 30 Z\" fill=\"#5c3518\" stroke=\"#3b2412\" stroke-width=\"2\" />"
    + "<path d=\"M14 28 L16 12 L20 11 L18 28 Z M44 11 L48 12 L50 28 L46 28 Z\" fill=\"#6f7880\" stroke=\"#3d434a\" stroke-width=\"1\" />"
  const inside = "<ellipse cx=\"32\" cy=\"31\" rx=\"21\" ry=\"4\" fill=\"#2a170a\" />"
    + "<g fill=\"#f2d27a\" stroke=\"#8a6416\" stroke-width=\".8\"><ellipse cx=\"25\" cy=\"30\" rx=\"5\" ry=\"2.4\" /><ellipse cx=\"35\" cy=\"29\" rx=\"5\" ry=\"2.4\" /><ellipse cx=\"30\" cy=\"27\" rx=\"5\" ry=\"2.4\" /></g>"
    + "<path d=\"M40 27 l6 -3 l-1 4 z\" fill=\"#f1f1f1\" stroke=\"#6b6b6b\" stroke-width=\".8\" />"
  return svg(shadow + glow + lid + inside + body)
}

/** Ключ: латунное кольцо, стержень и бородка (для земли и значка над бойцом). */
export function keySvg(): string {
  return svg("<ellipse cx=\"32\" cy=\"50\" rx=\"14\" ry=\"4\" fill=\"#000\" opacity=\".3\" />"
    + "<g transform=\"rotate(-35 32 32)\"><circle cx=\"20\" cy=\"32\" r=\"10\" fill=\"none\" stroke=\"#e0b54a\" stroke-width=\"6\" />"
    + "<circle cx=\"20\" cy=\"32\" r=\"10\" fill=\"none\" stroke=\"#6b4c10\" stroke-width=\"1.4\" />"
    + "<rect x=\"29\" y=\"29\" width=\"26\" height=\"6\" rx=\"2\" fill=\"#e0b54a\" stroke=\"#6b4c10\" stroke-width=\"1.4\" />"
    + "<rect x=\"44\" y=\"34\" width=\"5\" height=\"8\" fill=\"#e0b54a\" stroke=\"#6b4c10\" stroke-width=\"1.2\" />"
    + "<rect x=\"51\" y=\"34\" width=\"4\" height=\"6\" fill=\"#e0b54a\" stroke=\"#6b4c10\" stroke-width=\"1.2\" />"
    + "<path d=\"M14 27 a7 7 0 0 1 8 -4\" stroke=\"#fff6d0\" stroke-width=\"2\" fill=\"none\" /></g>")
}
