/**
 * SVG-миниатюры котиков, собачек и мышек в стиле cat-chase.
 * Один viewBox для всех видов и снаряжения: 0 -28 120 140 (запас сверху под шарики, корону, кастрюлю).
 */
import { BLUSH, INK, NOSE, shade, type FurArt } from './palettes';

export type ArtSpecies = 'cat' | 'dog' | 'mouse';
export type Pose = 'idle' | 'run' | 'hurt' | 'dead' | 'happy' | 'carried' | 'blink';
export type ArtMoveType = 'infantry' | 'armor' | 'cavalry' | 'flier';
export type ArtWeapon = 'claw' | 'fang' | 'stick' | 'hiss' | 'howl' | 'growl' | 'slingshot' | 'burr' | 'bandage' | 'purr';

export interface CritterArt {
  species: ArtSpecies;
  fur: FurArt;
  iris: string;
  /** 0 однотонный, 1 полосатый, 2 пятнистый, 3 смокинг. */
  pattern: number;
  /** 0 круглые, 1 миндалевидные, 2 сонные, 3 злые, 4 огромные, 5 косые. */
  eyes: number;
  /** 0 нет, 1 красный ошейник, 2 синий ошейник, 3 бандана, 4 повязка, 5 шрам, 6 бантик, 7 колокольчик. */
  accessory: number;
  moveType?: ArtMoveType;
  weapon?: ArtWeapon;
  weaponColor?: string;
  boss?: boolean;
  /** Хмурые брови (враги). */
  angry?: boolean;
  pose?: Pose;
  /** Добавить CSS-хуки и оба набора глаз для анимации в DOM. */
  animated?: boolean;
  blinkDelay?: number;
}

export const VIEW = { x: 0, y: -28, w: 120, h: 140 } as const;
export const VIEW_BOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;

const sw = 'stroke-width="1.5"';

/* ---------- Глаза ---------- */

function openEyes(a: CritterArt, cx: number, cy: number, shiftIn: number, big = false): string {
  let rx = big ? 9.5 : 8;
  let ry = big ? 12 : 10.5;
  if (a.eyes === 1 && !big) {
    rx = 7.5;
    ry = 8.5;
  }
  if (a.eyes === 4) {
    rx = 9.5;
    ry = 12;
  }
  if (a.species === 'dog') {
    rx -= 1;
    ry -= 1.5;
  }
  if (a.species === 'mouse') {
    rx -= 1.5;
    ry -= 2.5;
  }
  const px = cx + shiftIn;
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" />
    <ellipse cx="${px}" cy="${cy + 2}" rx="${rx * 0.68}" ry="${ry * 0.72}" fill="${a.iris}" />
    <ellipse cx="${px}" cy="${cy + 5}" rx="${rx * 0.38}" ry="${ry * 0.34}" fill="${INK}" />
    <circle cx="${cx + 3.5}" cy="${cy - 4.5}" r="${rx * 0.4}" fill="#fff" />
    <circle cx="${cx - 3}" cy="${cy + 5}" r="1.5" fill="#fff" opacity=".9" />
    ${a.eyes === 2 ? `<path d="M${cx - rx} ${cy} a${rx} ${ry} 0 0 1 ${rx * 2} 0 z" fill="${a.fur.fur}" stroke="${a.fur.line}" stroke-width="1.2" />` : ''}`;
}

function eyesGroup(a: CritterArt, pose: Pose): string {
  const cy = a.species === 'mouse' ? 50 : 52;
  const lx = 45;
  const rx = 75;
  const cross = a.eyes === 5 ? 2.2 : 0;
  const angry = a.angry || a.eyes === 3;
  const brows = angry
    ? `<g stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M35 40 l15 6" /><path d="M85 40 l-15 6" /></g>`
    : '';
  const happy = `<g class="eyes-happy" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
      <path d="M37 ${cy + 2} q8 -10 16 0" /><path d="M67 ${cy + 2} q8 -10 16 0" /></g>`;
  if (pose === 'dead') {
    return `<g stroke="${INK}" stroke-width="3.4" stroke-linecap="round">
      <path d="M38 ${cy - 7} l14 14 M52 ${cy - 7} l-14 14" /><path d="M68 ${cy - 7} l14 14 M82 ${cy - 7} l-14 14" /></g>`;
  }
  if (pose === 'hurt') {
    return `<g fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M38 ${cy - 6} l10 6 l-10 6" /><path d="M82 ${cy - 6} l-10 6 l10 6" /></g>${brows}`;
  }
  if (pose === 'blink' && !a.animated) {
    return `<g fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
      <path d="M37 ${cy + 1} q8 3 16 0" /><path d="M67 ${cy + 1} q8 3 16 0" /></g>${brows}`;
  }
  if (pose === 'happy' && !a.animated) return happy.replace(' class="eyes-happy"', '') + brows;
  const big = pose === 'carried';
  const open = `<g class="eyes-open"${a.animated ? ` style="animation-delay:${(a.blinkDelay ?? 0).toFixed(2)}s"` : ''}>
      ${openEyes(a, lx, cy, cross, big)}${openEyes(a, rx, cy, -cross, big)}</g>`;
  return open + (a.animated ? happy : '') + brows;
}

/* ---------- Рот и нос ---------- */

function mouth(a: CritterArt, pose: Pose): string {
  const s = a.species;
  if (s === 'cat') {
    const nose = `<path d="M56.5 62 h7 l-3.5 4.5 z" fill="${NOSE}" />`;
    if (pose === 'dead') return `${nose}<path d="M52 68 h16" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><ellipse cx="64" cy="71" rx="3.5" ry="4.5" fill="#ff7f9c" />`;
    if (pose === 'hurt') return `${nose}<ellipse cx="60" cy="69" rx="4" ry="4.5" fill="${INK}" /><ellipse cx="60" cy="71" rx="2.2" ry="2" fill="#ff7f9c" />`;
    if (pose === 'happy') return `${nose}<path d="M50 66 q5 7 10 0 q5 7 10 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" />`;
    if (pose === 'carried') return `${nose}<ellipse cx="60" cy="69" rx="2.6" ry="3" fill="${INK}" />`;
    const fang = a.weapon === 'fang' ? `<path d="M55 67 l2 5 l2 -5 z M61 67 l2 5 l2 -5 z" fill="#fff" stroke="${INK}" stroke-width=".6" />` : '';
    return `${nose}<path d="M53 66 q3.5 4 7 0 q3.5 4 7 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" />${fang}`;
  }
  if (s === 'dog') {
    const base = `<ellipse cx="60" cy="67" rx="15" ry="11" fill="${a.fur.belly}" /><ellipse cx="60" cy="62" rx="4.8" ry="3.6" fill="${INK}" /><circle cx="58.5" cy="61" r="1.2" fill="#fff" opacity=".8" />`;
    if (pose === 'dead') return `${base}<path d="M52 69 h16" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M64 69 q6 4 3 9 q-4 1 -5 -4 z" fill="#ff7f9c" />`;
    if (pose === 'hurt') return `${base}<ellipse cx="60" cy="70" rx="5" ry="4.5" fill="${INK}" /><path d="M57 72 q3 4 6 0 z" fill="#ff7f9c" />`;
    if (pose === 'happy') return `${base}<path d="M50 67 q10 10 20 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M56 70 q4 9 8 0 z" fill="#ff8fa8" />`;
    if (pose === 'carried') return `${base}<ellipse cx="60" cy="70" rx="3" ry="3.4" fill="${INK}" />`;
    const fang = a.weapon === 'fang' ? `<path d="M54 69 l2 5 l2 -5 z M62 69 l2 5 l2 -5 z" fill="#fff" stroke="${INK}" stroke-width=".6" />` : '';
    return `${base}<path d="M60 65 v3 M54 68 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M57.5 70 q2.5 8 5 0 z" fill="${NOSE}" />${fang}`;
  }
  // мышь: вытянутая мордочка, розовый нос, два зуба
  const muzzle = `<ellipse cx="60" cy="63" rx="13" ry="9.5" fill="${a.fur.belly}" /><circle cx="60" cy="67.5" r="3.4" fill="${NOSE}" stroke="${shade(NOSE, -0.25)}" stroke-width=".8" />`;
  if (pose === 'dead') return `${muzzle}<path d="M54 72 h12" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" /><ellipse cx="63" cy="74" rx="2.5" ry="3.5" fill="#ff7f9c" />`;
  if (pose === 'hurt' || pose === 'carried') return `${muzzle}<ellipse cx="60" cy="73" rx="${pose === 'carried' ? 2.2 : 3}" ry="3.2" fill="${INK}" />`;
  const teeth = `<rect x="57.2" y="70.5" width="2.6" height="4.5" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".6" /><rect x="60.2" y="70.5" width="2.6" height="4.5" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".6" />`;
  const smile = pose === 'happy' ? `<path d="M53 70 q7 6 14 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />` : `<path d="M60 70.5 v1" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />`;
  return `${muzzle}${smile}${teeth}`;
}

function whiskers(a: CritterArt): string {
  const long = a.species === 'mouse' ? 16 : 12;
  const y = a.species === 'mouse' ? 64 : 60;
  return `<g stroke="${a.fur.line}" stroke-width="1.4" stroke-linecap="round" opacity=".8">
    <path d="M22 ${y} h-${long}" /><path d="M23 ${y + 6} l-${long - 1} 3" />
    <path d="M98 ${y} h${long}" /><path d="M97 ${y + 6} l${long - 1} 3" /></g>`;
}

/* ---------- Уши ---------- */

function ears(a: CritterArt, pose: Pose): string {
  const f = a.fur;
  const droop = pose === 'dead';
  if (a.species === 'cat') {
    const rot = droop ? 'transform="rotate(-25 30 34)"' : '';
    const rotR = droop ? 'transform="rotate(25 90 34)"' : '';
    return `<g class="ear ear-l" ${rot}><path d="M30 34 L24 8 L52 22 Z" fill="${f.fur}" stroke="${f.line}" ${sw} stroke-linejoin="round" /><path d="M32 30 L28 14 L46 23 Z" fill="${f.earInner}" /></g>
      <g class="ear ear-r" ${rotR}><path d="M90 34 L96 8 L68 22 Z" fill="${f.fur}" stroke="${f.line}" ${sw} stroke-linejoin="round" /><path d="M88 30 L92 14 L74 23 Z" fill="${f.earInner}" /></g>`;
  }
  if (a.species === 'dog') {
    const rot = droop ? 'transform="rotate(-12 36 30)"' : '';
    const rotR = droop ? 'transform="rotate(12 84 30)"' : '';
    return `<g class="ear ear-l" ${rot}><path d="M36 30 C 16 32, 10 66, 24 74 C 34 78, 42 62, 42 42 Z" fill="${f.dark}" stroke="${f.line}" ${sw} stroke-linejoin="round" /></g>
      <g class="ear ear-r" ${rotR}><path d="M84 30 C 104 32, 110 66, 96 74 C 86 78, 78 62, 78 42 Z" fill="${f.dark}" stroke="${f.line}" ${sw} stroke-linejoin="round" /></g>`;
  }
  const rot = droop ? 'transform="rotate(-30 30 26)"' : '';
  const rotR = droop ? 'transform="rotate(30 90 26)"' : '';
  return `<g class="ear ear-l" ${rot}><circle cx="29" cy="24" r="15" fill="${f.fur}" stroke="${f.line}" ${sw} /><circle cx="30" cy="25" r="9.5" fill="${f.earInner}" /></g>
    <g class="ear ear-r" ${rotR}><circle cx="91" cy="24" r="15" fill="${f.fur}" stroke="${f.line}" ${sw} /><circle cx="90" cy="25" r="9.5" fill="${f.earInner}" /></g>`;
}

/* ---------- Окрас ---------- */

function patternHead(a: CritterArt): string {
  const f = a.fur;
  const stripes = `<g fill="none" stroke="${f.line}" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M52 20 v9" /><path d="M60 17 v10" /><path d="M68 20 v9" /></g>`;
  if (a.pattern === 1 || (a.pattern === 0 && f.tabby)) return stripes;
  if (a.pattern === 2) return `<g fill="${f.dark}" opacity=".85"><circle cx="76" cy="34" r="6" /><circle cx="38" cy="42" r="3.5" /></g>`;
  if (a.pattern === 3) return `<ellipse cx="60" cy="66" rx="16" ry="12" fill="${f.belly}" opacity=".95" />`;
  return '';
}

function patternBody(a: CritterArt): string {
  const f = a.fur;
  if (a.pattern === 1) return `<g fill="none" stroke="${f.line}" stroke-width="3" stroke-linecap="round" opacity=".55"><path d="M40 78 q4 4 2 10" /><path d="M78 78 q-4 4 -2 10" /></g>`;
  if (a.pattern === 2) return `<g fill="${f.dark}" opacity=".85"><circle cx="46" cy="82" r="4" /><circle cx="70" cy="94" r="3" /></g>`;
  if (a.pattern === 3) return `<ellipse cx="60" cy="88" rx="19" ry="13" fill="${f.belly}" />`;
  return '';
}

/* ---------- Аксессуары и снаряжение ---------- */

function accessory(a: CritterArt): string {
  switch (a.accessory) {
    case 1:
      return `<path d="M42 74 q18 12 36 0 l-6 10 q-12 6 -24 0 z" fill="#e5536f" stroke="#b83a52" stroke-width="1.2" stroke-linejoin="round" />`;
    case 2:
      return `<path d="M42 74 q18 12 36 0 l-6 10 q-12 6 -24 0 z" fill="#4f8fd1" stroke="#2f69a8" stroke-width="1.2" stroke-linejoin="round" />`;
    case 3:
      return `<path d="M40 76 q20 10 40 0 l-20 22 z" fill="#e5536f" stroke="#b83a52" stroke-width="1.2" stroke-linejoin="round" />
        <g fill="#fff" opacity=".8"><circle cx="54" cy="84" r="1.6" /><circle cx="62" cy="88" r="1.6" /><circle cx="66" cy="81" r="1.6" /></g>`;
    case 4:
      return `<path d="M30 44 Q 60 28, 92 40" fill="none" stroke="${INK}" stroke-width="2.6" /><ellipse cx="75" cy="52" rx="10" ry="12" fill="${INK}" /><circle cx="78" cy="48" r="1.6" fill="#fff" opacity=".5" />`;
    case 5:
      return `<g stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"><path d="M38 36 l12 18" /><path d="M41 41 l-5 3" /><path d="M45 47 l-5 3" /></g>`;
    case 6:
      return `<g transform="translate(34 20)"><path d="M0 0 l-12 -9 v18 z" fill="#ff6f9c" stroke="#d94f7f" stroke-width="1" /><path d="M0 0 l12 -9 v18 z" fill="#ff6f9c" stroke="#d94f7f" stroke-width="1" /><circle cx="0" cy="0" r="3.2" fill="#ff8fb4" stroke="#d94f7f" stroke-width="1" /></g>`;
    case 7:
      return `<path d="M42 74 q18 12 36 0" fill="none" stroke="#e5536f" stroke-width="4.5" stroke-linecap="round" /><circle cx="60" cy="84" r="5" fill="#ffd54f" stroke="#c99a2e" stroke-width="1.2" /><circle cx="60" cy="86.5" r="1.2" fill="#8a5a10" />`;
    default:
      return '';
  }
}

function crown(): string {
  return `<path d="M42 14 l6 -16 l12 10 l12 -10 l6 16 z" fill="#ffd54f" stroke="#d99a2b" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="48" cy="-1" r="2.4" fill="#ff6f9c" /><circle cx="60" cy="8" r="2.4" fill="#8fd3f4" /><circle cx="72" cy="-1" r="2.4" fill="#ff6f9c" />`;
}

/** Снаряжение по типу движения: до тела (сзади) и после головы (спереди/сверху). */
function gearBehind(a: CritterArt): string {
  if (a.moveType === 'cavalry') {
    return `<g class="vacuum"><ellipse cx="60" cy="104" rx="36" ry="10" fill="#2f3440" stroke="#1c2029" stroke-width="1.5" />
      <ellipse cx="60" cy="101" rx="36" ry="10" fill="#4a5262" stroke="#1c2029" stroke-width="1.5" />
      <ellipse cx="60" cy="101" rx="26" ry="6.5" fill="none" stroke="#6c768a" stroke-width="1.2" />
      <circle cx="60" cy="98" r="2.6" fill="#7ee081" /><circle cx="52" cy="99" r="1.6" fill="#ff6b6b" /></g>`;
  }
  if (a.moveType === 'flier') {
    const c = a.weaponColor ?? '#ff6f9c';
    const c2 = shade(c, 0.35);
    const c3 = shade(c, -0.2);
    return `<g class="balloons" stroke="${INK}" stroke-width=".9" opacity=".95">
      <path d="M40 -2 Q 50 40 58 74 M62 -10 Q 62 40 60 74 M82 0 Q 72 40 62 74" fill="none" stroke="#6b6b7a" stroke-width="1.2" />
      <ellipse cx="40" cy="-6" rx="11" ry="13" fill="${c2}" /><ellipse cx="82" cy="-4" rx="11" ry="13" fill="${c3}" /><ellipse cx="62" cy="-14" rx="12.5" ry="14.5" fill="${c}" />
      <g fill="#fff" opacity=".55"><ellipse cx="36" cy="-11" rx="3" ry="4.5" transform="rotate(-20 36 -11)" /><ellipse cx="78" cy="-9" rx="3" ry="4.5" transform="rotate(-20 78 -9)" /><ellipse cx="58" cy="-20" rx="3.4" ry="5" transform="rotate(-20 58 -20)" /></g></g>`;
  }
  return '';
}

function gearBody(a: CritterArt): string {
  if (a.moveType === 'armor' && a.species === 'cat') {
    return `<g class="box"><rect x="26" y="74" width="68" height="34" rx="3" fill="#dcae72" stroke="#a8763f" stroke-width="1.5" />
      <path d="M26 74 l-9 -9 h30 l-9 9 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M94 74 l9 -9 h-30 l9 9 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.2" stroke-linejoin="round" />
      <rect x="56" y="74" width="8" height="34" fill="#c9924f" opacity=".5" />
      <path d="M34 92 h10 M34 97 h16" stroke="#a8763f" stroke-width="1.2" stroke-linecap="round" opacity=".7" /></g>`;
  }
  return '';
}

function gearHead(a: CritterArt): string {
  if (a.moveType === 'armor' && a.species === 'dog') {
    return `<g class="pot"><ellipse cx="60" cy="36" rx="32" ry="7" fill="#9aa3b1" stroke="#5f6773" stroke-width="1.5" />
      <path d="M30 14 h60 v22 h-60 z" fill="#b7bfcb" stroke="#5f6773" stroke-width="1.5" />
      <path d="M30 14 h60" stroke="#e5eaf0" stroke-width="3" /><path d="M24 20 h-6 v8 h6 M96 20 h6 v8 h-6" fill="none" stroke="#5f6773" stroke-width="3" stroke-linecap="round" />
      <ellipse cx="60" cy="14" rx="30" ry="5" fill="#d6dce4" stroke="#5f6773" stroke-width="1.2" /><circle cx="60" cy="10" r="3.5" fill="#5f6773" /></g>`;
  }
  if (a.moveType === 'armor' && a.species === 'mouse') {
    return `<g class="thimble"><path d="M40 12 q20 -16 40 0 v24 h-40 z" fill="#c9cbd4" stroke="#6f737f" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M40 30 h40" stroke="#8c909b" stroke-width="2" /><g fill="#8c909b"><circle cx="50" cy="12" r="1.3" /><circle cx="60" cy="8" r="1.3" /><circle cx="70" cy="12" r="1.3" /><circle cx="46" cy="20" r="1.3" /><circle cx="56" cy="17" r="1.3" /><circle cx="66" cy="17" r="1.3" /><circle cx="75" cy="21" r="1.3" /></g></g>`;
  }
  return '';
}

function weaponProp(a: CritterArt): string {
  const c = a.weaponColor ?? '#adb5bd';
  switch (a.weapon) {
    case 'stick':
      return `<g class="stick"><path d="M44 72 L92 60" stroke="#6b4a2c" stroke-width="5.5" stroke-linecap="round" /><path d="M44 72 L92 60" stroke="#8d6248" stroke-width="3" stroke-linecap="round" /><path d="M80 63 l4 -6" stroke="#6b4a2c" stroke-width="2.5" stroke-linecap="round" /></g>`;
    case 'slingshot':
      return `<g class="slingshot" transform="translate(96 80)"><path d="M0 22 v-12 M0 10 l-8 -11 M0 10 l8 -11" fill="none" stroke="#8d6248" stroke-width="4.5" stroke-linecap="round" /><path d="M-8 -1 Q 0 6 8 -1" fill="none" stroke="#c0392b" stroke-width="2" /></g>`;
    case 'burr':
      return `<g class="burrs" fill="#7a8a3a" stroke="#4f5c22" stroke-width="1"><circle cx="100" cy="66" r="3.5" /><circle cx="107" cy="78" r="3" /><circle cx="97" cy="86" r="2.6" /></g>
        <g stroke="#4f5c22" stroke-width="1" stroke-linecap="round"><path d="M100 61 v-3 M105 66 h3 M100 71 v3 M95 66 h-3" /><path d="M107 74 v-2 M111 78 h2 M107 82 v2" /></g>`;
    case 'bandage':
      return `<g class="medkit"><rect x="82" y="84" width="14" height="14" rx="2.5" fill="#fff" stroke="#c0392b" stroke-width="1.4" /><path d="M89 87 v8 M85 91 h8" stroke="#c0392b" stroke-width="2.6" stroke-linecap="round" /></g>`;
    case 'hiss':
    case 'howl':
    case 'growl':
      return `<g class="aura" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" opacity=".9"><path d="M100 54 q7 6 0 12" /><path d="M106 48 q12 12 0 24" /></g>
        <g fill="${c}"><circle cx="18" cy="40" r="2" /><circle cx="12" cy="52" r="1.4" /></g>`;
    case 'purr':
      return `<g class="note" fill="${c}" stroke="${shade(c, -0.3)}" stroke-width="1"><ellipse cx="104" cy="52" rx="4.2" ry="3.2" transform="rotate(-20 104 52)" /><path d="M107.5 51 v-16 q6 1 8 6" fill="none" stroke="${shade(c, -0.3)}" stroke-width="2.2" stroke-linecap="round" /></g>
        <path d="M14 46 c-5 -6 -13 1 -6 7 l6 5 l6 -5 c7 -6 -1 -13 -6 -7 z" fill="#ff6f9c" />`;
    case 'claw':
      return `<g class="claws" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"><path d="M84 96 l6 -6 M88 100 l7 -5 M80 93 l5 -7" /></g>`;
    default:
      return '';
  }
}

/* ---------- Тело ---------- */

function tail(a: CritterArt, pose: Pose): string {
  const f = a.fur;
  if (a.species === 'cat') {
    const d = pose === 'dead' ? 'M38 92 C 20 100, 6 96, 6 90' : pose === 'run' ? 'M38 92 C 12 90, 6 66, 20 56' : pose === 'carried' ? 'M38 92 C 30 100, 30 108, 24 112' : 'M38 92 C 14 94, 8 72, 22 62';
    return `<g class="tail"><path d="${d}" fill="none" stroke="${f.line}" stroke-width="12" stroke-linecap="round" opacity=".35" /><path d="${d}" fill="none" stroke="${f.fur}" stroke-width="9" stroke-linecap="round" /></g>`;
  }
  if (a.species === 'dog') {
    const d = pose === 'dead' ? 'M34 86 C 20 92, 10 90, 8 86' : pose === 'carried' ? 'M34 86 C 28 94, 28 102, 22 108' : 'M34 86 C 18 80, 20 58, 38 62';
    return `<g class="tail"><path d="${d}" fill="none" stroke="${f.line}" stroke-width="12" stroke-linecap="round" opacity=".35" /><path d="${d}" fill="none" stroke="${f.fur}" stroke-width="9" stroke-linecap="round" /></g>`;
  }
  const d = pose === 'dead' ? 'M40 94 C 24 104, 10 100, 4 92' : pose === 'run' ? 'M40 94 C 20 100, 8 86, 12 70' : pose === 'carried' ? 'M40 94 C 34 104, 34 112, 26 118' : 'M40 94 C 22 98, 10 86, 18 70 C 22 62, 14 60, 12 64';
  return `<g class="tail"><path d="${d}" fill="none" stroke="${shade(f.earInner, -0.25)}" stroke-width="5" stroke-linecap="round" /><path d="${d}" fill="none" stroke="${f.earInner}" stroke-width="3" stroke-linecap="round" /></g>`;
}

function legs(a: CritterArt, pose: Pose): string {
  if (a.moveType === 'cavalry') return '';
  const f = a.fur;
  const fill = a.pattern === 3 ? f.belly : f.fur;
  const dx = pose === 'run' ? 6 : pose === 'carried' ? -4 : 0;
  const cy = pose === 'carried' ? 99 : 102;
  const rx = a.species === 'mouse' ? 7.5 : 9;
  const ry = (a.species === 'mouse' ? 5.5 : 6.5) * (pose === 'carried' ? 1.15 : 1);
  return `<g class="legs">
    <ellipse class="leg leg-back" cx="${44 - dx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${f.line}" ${sw} />
    <ellipse class="leg leg-front" cx="${76 + dx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${f.line}" ${sw} /></g>`;
}

function body(a: CritterArt): string {
  const f = a.fur;
  const rx = a.species === 'mouse' ? 24 : a.species === 'dog' ? 28 : 27;
  const ry = a.species === 'mouse' ? 16 : 18;
  const cy = a.species === 'mouse' ? 88 : 86;
  return `<ellipse cx="60" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f.fur}" stroke="${f.line}" ${sw} /><ellipse cx="60" cy="${cy + 4}" rx="15" ry="10" fill="${f.belly}" />${patternBody(a)}`;
}

function head(a: CritterArt, pose: Pose): string {
  const f = a.fur;
  const r = a.species === 'mouse' ? 31 : a.species === 'dog' ? 33 : 34;
  const cy = a.species === 'mouse' ? 52 : 50;
  const blushY = a.species === 'mouse' ? 62 : 60;
  const blush = pose === 'happy' ? 0.75 : 0.55;
  return `<g class="head">
    ${ears(a, pose)}
    <circle cx="60" cy="${cy}" r="${r}" fill="${f.fur}" stroke="${f.line}" ${sw} />
    ${patternHead(a)}
    <ellipse cx="34" cy="${blushY}" rx="8" ry="4.5" fill="${BLUSH}" opacity="${blush}" />
    <ellipse cx="86" cy="${blushY}" rx="8" ry="4.5" fill="${BLUSH}" opacity="${blush}" />
    ${eyesGroup(a, pose)}
    ${mouth(a, pose)}
    ${whiskers(a)}
    ${accessory(a)}
    ${gearHead(a)}
    ${a.boss ? crown() : ''}
    ${pose === 'hurt' ? `<path d="M96 36 q4 -8 8 0 a4 4 0 1 1 -8 0 z" fill="#8ecae6" />` : ''}
  </g>`;
}

/** Полный SVG миниатюры. */
export function critterSvg(a: CritterArt): string {
  const pose: Pose = a.pose ?? 'idle';
  const rigTransform =
    pose === 'hurt'
      ? 'transform="translate(0 6) scale(1.06 0.94) translate(0 -2)"'
      : pose === 'run'
        ? 'transform="translate(0 -3) rotate(4 60 86)"'
        : pose === 'carried'
          ? 'transform="translate(60 40) scale(0.96 1.06) rotate(-6) translate(-60 -40)"'
          : '';
  return `<svg viewBox="${VIEW_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" overflow="visible">
  <g class="rig" ${rigTransform}>
    ${gearBehind(a)}
    ${tail(a, pose)}
    ${legs(a, pose)}
    ${body(a)}
    ${gearBody(a)}
    ${head(a, pose)}
    ${weaponProp(a)}
  </g>
</svg>`;
}

/* ---------- Части тела для анимаций разлёта ---------- */

export type CritterPart = 'head' | 'body' | 'tail' | 'legFront' | 'legBack';
export const CRITTER_PARTS: readonly CritterPart[] = ['head', 'body', 'tail', 'legFront', 'legBack'];

/** Центры частей в нормированных координатах текстуры (0..1), для origin спрайтов при разлёте. */
export const CRITTER_PART_ANCHORS: Record<CritterPart, { x: number; y: number }> = {
  head: { x: 0.5, y: (50 - VIEW.y) / VIEW.h },
  body: { x: 0.5, y: (86 - VIEW.y) / VIEW.h },
  tail: { x: 22 / VIEW.w, y: (80 - VIEW.y) / VIEW.h },
  legFront: { x: 76 / VIEW.w, y: (102 - VIEW.y) / VIEW.h },
  legBack: { x: 44 / VIEW.w, y: (102 - VIEW.y) / VIEW.h },
};

function singleLeg(a: CritterArt, which: 'front' | 'back'): string {
  const f = a.fur;
  const fill = a.pattern === 3 ? f.belly : f.fur;
  const rx = a.species === 'mouse' ? 7.5 : 9;
  const ry = a.species === 'mouse' ? 5.5 : 6.5;
  const cx = which === 'front' ? 76 : 44;
  return `<ellipse cx="${cx}" cy="102" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${f.line}" ${sw} />
    <ellipse cx="${cx}" cy="${102 - ry + 1}" rx="${rx * 0.55}" ry="2.2" fill="#d9122b" opacity=".85" />`;
}

/**
 * Отдельная часть миниатюры в том же viewBox, что и целая фигура: накладывается поверх спрайта
 * без пересчёта координат. Голова — с крестиками в глазах, срезы отмечены кровью.
 */
export function critterPartSvg(a: CritterArt, part: CritterPart): string {
  const dead: CritterArt = { ...a, pose: 'dead', animated: false };
  let inner = '';
  switch (part) {
    case 'head':
      inner = `${head(dead, 'dead')}<ellipse cx="60" cy="84" rx="14" ry="4" fill="#d9122b" opacity=".9" />`;
      break;
    case 'body':
      inner = `${gearBehind(dead)}${body(dead)}${gearBody(dead)}${weaponProp(dead)}<ellipse cx="60" cy="70" rx="12" ry="3.5" fill="#d9122b" opacity=".9" />`;
      break;
    case 'tail':
      inner = `${tail(dead, 'idle')}<circle cx="38" cy="92" r="4" fill="#d9122b" opacity=".9" />`;
      break;
    case 'legFront':
      inner = singleLeg(dead, 'front');
      break;
    case 'legBack':
      inner = singleLeg(dead, 'back');
      break;
  }
  return `<svg viewBox="${VIEW_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" overflow="visible"><g class="rig">${inner}</g></svg>`;
}
