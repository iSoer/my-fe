/**
 * Фоны кинематика: половина сцены за бойцом. Зависят от биома и клетки, на которой стоит боец.
 * viewBox 0 0 200 300, земля начинается на y≈156 (0.52 высоты), лапы бойца на y≈186.
 */
import type { TerrainId } from '@core/types';
import { biomeDef } from '@content/biomes';
import { hex, shade } from './palettes';

export type Side = 'left' | 'right';

const W = 200;
const H = 300;
const HORIZON = 156;
const FEET = 186;

interface Ctx {
  biome: ReturnType<typeof biomeDef>;
  terrain: TerrainId;
  side: Side;
  /** Горизонтальная позиция бойца внутри половины. */
  x: number;
  id: string;
}

function defs(ctx: Ctx): string {
  const b = ctx.biome.id;
  const grad: Record<string, [string, string]> = {
    yard: ['#bfe3ff', '#eef9ff'],
    roofs: ['#5d3f8a', '#ff9a6b'],
    basement: ['#2a2530', '#3d3640'],
    dump: ['#b9b59a', '#eae4c6'],
    winter_park: ['#b9d6ee', '#f3f8fc'],
    jungle: ['#3f8f6a', '#bfe8a0'],
    desert: ['#ffd27a', '#fff2cc'],
    glacier: ['#1b3a6b', '#bfe3ff'],
    canyon: ['#5a2e6b', '#ff9a5c'],
  };
  const [top, bottom] = grad[b] ?? grad['yard']!;
  return `<defs>
    <linearGradient id="${ctx.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}" /><stop offset="1" stop-color="${bottom}" /></linearGradient>
    <radialGradient id="${ctx.id}-glow" cx="50%" cy="20%" r="70%"><stop offset="0" stop-color="#fff2b0" stop-opacity=".9" /><stop offset="1" stop-color="#fff2b0" stop-opacity="0" /></radialGradient>
  </defs>`;
}

function sky(ctx: Ctx): string {
  const b = ctx.biome.id;
  let far = '';
  switch (b) {
    case 'yard':
      far = `<circle cx="${ctx.side === 'left' ? 40 : 160}" cy="40" r="18" fill="#fff1a8" opacity=".9" />
        <g fill="#fff" opacity=".85"><ellipse cx="120" cy="52" rx="26" ry="9" /><ellipse cx="132" cy="46" rx="16" ry="9" /><ellipse cx="60" cy="84" rx="22" ry="7" /></g>
        <path d="M-10 ${HORIZON} h220" stroke="#8fbf5a" stroke-width="2" />
        <g fill="#c99a66" stroke="#9a6d3c" stroke-width="1"><rect x="-6" y="${HORIZON - 34}" width="212" height="4" /><rect x="-6" y="${HORIZON - 16}" width="212" height="4" />${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 - 2} ${HORIZON - 40} h12 v40 h-12 z" />`).join('')}</g>
        <g fill="#6aa84f"><ellipse cx="170" cy="${HORIZON - 48}" rx="30" ry="24" /><ellipse cx="150" cy="${HORIZON - 36}" rx="22" ry="18" /></g>`;
      break;
    case 'roofs':
      far = `<circle cx="${ctx.side === 'left' ? 150 : 50}" cy="70" r="22" fill="#ffd27a" opacity=".95" />
        <g fill="#3b2f4a"><rect x="-10" y="96" width="60" height="70" /><rect x="40" y="76" width="44" height="90" /><rect x="90" y="106" width="50" height="60" /><rect x="140" y="86" width="70" height="80" /><rect x="96" y="60" width="10" height="50" /><rect x="100" y="52" width="2" height="12" /></g>
        <g fill="#ffd27a" opacity=".8"><rect x="4" y="110" width="6" height="8" /><rect x="22" y="124" width="6" height="8" /><rect x="52" y="90" width="6" height="8" /><rect x="66" y="112" width="6" height="8" /><rect x="156" y="100" width="6" height="8" /><rect x="178" y="118" width="6" height="8" /></g>
        <g fill="none" stroke="#d8d0e6" stroke-width="2" opacity=".6"><path d="M104 50 q6 -10 2 -20 q-4 -8 2 -14" /></g>`;
      break;
    case 'basement':
      far = `<g fill="#5a4a44">${Array.from({ length: 12 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 36 + (r % 2 ? 18 : 0) - 18}" y="${r * 14}" width="34" height="12" rx="1" fill="${r % 3 === 0 ? '#63524b' : '#574640'}" stroke="#3c302c" stroke-width="1" />`).join('')).join('')}</g>
        <g stroke="#7a7f88" stroke-width="7" stroke-linecap="round"><path d="M-10 36 h220" /><path d="M-10 36 h220" stroke="#9aa0a9" stroke-width="2" /></g>
        <path d="M${ctx.x} 0 v34" stroke="#2a2530" stroke-width="2" /><path d="M${ctx.x - 10} 34 h20 l-4 10 h-12 z" fill="#4b4a3a" /><circle cx="${ctx.x}" cy="52" r="9" fill="#fff2b0" /><ellipse cx="${ctx.x}" cy="${FEET - 6}" rx="90" ry="150" fill="url(#${ctx.id}-glow)" />`;
      break;
    case 'dump':
      far = `<g fill="#9c957f"><ellipse cx="30" cy="${HORIZON}" rx="70" ry="44" /><ellipse cx="150" cy="${HORIZON + 4}" rx="80" ry="40" /><ellipse cx="100" cy="${HORIZON + 10}" rx="40" ry="20" fill="#8a846f" /></g>
        <g fill="#2b2b2b"><circle cx="46" cy="${HORIZON - 14}" r="12" /><circle cx="46" cy="${HORIZON - 14}" r="5" fill="#9c957f" /><circle cx="160" cy="${HORIZON - 6}" r="10" /><circle cx="160" cy="${HORIZON - 6}" r="4" fill="#9c957f" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="2" stroke-linecap="round"><path d="M120 40 q6 -6 12 0" /><path d="M136 56 q6 -6 12 0" /><path d="M60 30 q6 -6 12 0" /></g>
        <g fill="#6b6b6b" opacity=".5"><circle cx="90" cy="110" r="1.4" /><circle cx="98" cy="104" r="1.2" /><circle cx="86" cy="100" r="1.1" /></g>`;
      break;
    case 'jungle':
      far = `<g fill="#2f6b3a" opacity=".9"><ellipse cx="30" cy="${HORIZON - 40}" rx="60" ry="46" /><ellipse cx="120" cy="${HORIZON - 56}" rx="70" ry="54" /><ellipse cx="190" cy="${HORIZON - 36}" rx="50" ry="40" /></g>
        <g fill="#3f8f45"><ellipse cx="60" cy="${HORIZON - 20}" rx="40" ry="26" /><ellipse cx="160" cy="${HORIZON - 24}" rx="44" ry="28" /></g>
        <g fill="#8c8a6a" stroke="#5a5a44" stroke-width="1.5"><rect x="80" y="${HORIZON - 70}" width="40" height="16" /><rect x="86" y="${HORIZON - 84}" width="28" height="14" /><rect x="92" y="${HORIZON - 96}" width="16" height="12" /></g>
        <g fill="none" stroke="#5a3a1c" stroke-width="3" stroke-linecap="round"><path d="M20 0 q8 40 -4 80" /><path d="M150 0 q-10 50 6 90" /><path d="M190 0 q4 30 -6 60" /></g>
        <g fill="#7bc96f"><ellipse cx="16" cy="80" rx="8" ry="4" transform="rotate(-30 16 80)" /><ellipse cx="156" cy="90" rx="8" ry="4" transform="rotate(30 156 90)" /></g>`;
      break;
    case 'desert':
      far = `<circle cx="${ctx.side === 'left' ? 150 : 50}" cy="46" r="26" fill="#ffb347" opacity=".95" />
        <g fill="#e8c784"><ellipse cx="40" cy="${HORIZON + 6}" rx="90" ry="34" /><ellipse cx="170" cy="${HORIZON + 10}" rx="80" ry="30" /></g>
        <g fill="#d9b06a"><path d="M100 ${HORIZON} l34 -54 l34 54 z" /><path d="M20 ${HORIZON} l22 -36 l22 36 z" opacity=".8" /></g>
        <g fill="#7fb069" stroke="#4f7a3e" stroke-width="1"><rect x="178" y="${HORIZON - 40}" width="8" height="40" rx="4" /><rect x="168" y="${HORIZON - 30}" width="6" height="14" rx="3" /><rect x="168" y="${HORIZON - 20}" width="12" height="5" rx="2.5" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="1.6" stroke-linecap="round"><path d="M60 70 q5 -5 10 0" /><path d="M72 62 q5 -5 10 0" /></g>`;
      break;
    case 'glacier':
      far = `<g fill="none" stroke-width="14" stroke-linecap="round" opacity=".35"><path d="M-10 60 q50 -40 100 -10 t120 -20" stroke="#7fffb0" /><path d="M-10 86 q60 -40 110 -14 t110 -26" stroke="#b79cff" /></g>
        <g fill="#fff" opacity=".9">${Array.from({ length: 20 }, (_, i) => `<circle cx="${(i * 47) % W}" cy="${(i * 31) % (HORIZON - 40)}" r="${1 + (i % 3) * 0.5}" />`).join('')}</g>
        <g fill="#a9d8f0" stroke="#5d9cc5" stroke-width="1.5" stroke-linejoin="round"><path d="M-6 ${HORIZON} l30 -60 l24 26 l20 -40 l30 74 z" /><path d="M120 ${HORIZON} l26 -44 l30 20 l30 -30 l10 54 z" /></g>
        <g fill="#e8f6ff" opacity=".8"><path d="M24 ${HORIZON - 60} l10 20 l-12 6 z" /><path d="M146 ${HORIZON - 44} l12 16 l-14 4 z" /></g>`;
      break;
    case 'canyon':
      far = `<circle cx="${ctx.side === 'left' ? 160 : 40}" cy="70" r="24" fill="#ffd27a" opacity=".9" />
        <g fill="#8a4a2e"><rect x="-10" y="${HORIZON - 80}" width="70" height="80" rx="8" /><rect x="90" y="${HORIZON - 60}" width="50" height="60" rx="6" /><rect x="160" y="${HORIZON - 96}" width="60" height="96" rx="8" /></g>
        <g fill="#a8603a"><rect x="40" y="${HORIZON - 50}" width="70" height="50" rx="6" /><rect x="130" y="${HORIZON - 40}" width="50" height="40" rx="6" /></g>
        <g stroke="#6e3a1f" stroke-width="2" opacity=".7"><path d="M-10 ${HORIZON - 60} h70 M-10 ${HORIZON - 40} h70 M160 ${HORIZON - 70} h60 M160 ${HORIZON - 44} h60 M40 ${HORIZON - 30} h70" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="1.6" stroke-linecap="round"><path d="M60 40 q5 -5 10 0" /><path d="M120 54 q5 -5 10 0" /></g>`;
      break;
    default:
      far = `<g fill="#2f6b3a">${[-10, 30, 70, 110, 150, 190].map((x, i) => `<path d="M${x} ${HORIZON} l20 -${48 + (i % 2) * 14} l20 ${48 + (i % 2) * 14} z" />`).join('')}</g>
        <g fill="#3d7f49">${[10, 50, 90, 130, 170].map((x, i) => `<path d="M${x} ${HORIZON} l16 -${34 + (i % 2) * 10} l16 ${34 + (i % 2) * 10} z" />`).join('')}</g>
        <g stroke="#3b3b45" stroke-width="3"><path d="M${ctx.side === 'left' ? 170 : 30} ${HORIZON} v-70" /></g><circle cx="${ctx.side === 'left' ? 170 : 30}" cy="${HORIZON - 72}" r="7" fill="#ffe9a8" />
        <g fill="#fff" opacity=".9">${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 37) % W}" cy="${(i * 53) % (HORIZON + 60)}" r="${1 + (i % 3) * 0.6}" />`).join('')}</g>`;
  }
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${ctx.id}-sky)" />${far}`;
}

function ground(ctx: Ctx): string {
  const c = ctx.biome.colors;
  const plain = hex(c.plain);
  const base = ctx.terrain === 'water' ? plain : hex(c[ctx.terrain] ?? c.plain);
  const tone = ctx.terrain === 'forest' ? shade(plain, -0.12) : ctx.terrain === 'cover' ? plain : base;
  const groundColor = ctx.terrain === 'wall' || ctx.terrain === 'wall_breakable' || ctx.terrain === 'mountain' ? plain : tone;
  let texture = '';
  switch (ctx.biome.id) {
    case 'yard':
      texture = `<g stroke="${shade(groundColor, -0.18)}" stroke-width="2" stroke-linecap="round">${Array.from({ length: 14 }, (_, i) => `<path d="M${(i * 29) % W} ${HORIZON + 12 + ((i * 17) % 90)} l3 -6 M${((i * 29) % W) + 4} ${HORIZON + 12 + ((i * 17) % 90)} l2 -5" />`).join('')}</g>`;
      break;
    case 'roofs':
      texture = `<g stroke="${shade(groundColor, -0.2)}" stroke-width="1.5">${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${HORIZON + 18 + i * 20} h${W}" />`).join('')}${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 22} ${HORIZON} v${H}" opacity=".5" />`).join('')}</g>`;
      break;
    case 'basement':
      texture = `<g stroke="${shade(groundColor, -0.25)}" stroke-width="1.5" fill="none"><path d="M20 ${HORIZON + 30} l30 20 l-10 30" /><path d="M150 ${HORIZON + 60} l20 20" /></g>`;
      break;
    case 'dump':
      texture = `<g fill="${shade(groundColor, -0.2)}"><rect x="20" y="${HORIZON + 40}" width="14" height="6" transform="rotate(-15 27 ${HORIZON + 43})" /><rect x="150" y="${HORIZON + 70}" width="18" height="5" /><circle cx="110" cy="${HORIZON + 100}" r="4" /><rect x="60" y="${HORIZON + 110}" width="10" height="10" /></g>`;
      break;
    case 'jungle':
      texture = `<g fill="none" stroke="${shade(groundColor, -0.2)}" stroke-width="2.4" stroke-linecap="round">${Array.from({ length: 10 }, (_, i) => `<path d="M${(i * 41) % W} ${HORIZON + 20 + ((i * 23) % 100)} q4 -12 10 -3 M${((i * 41) % W) + 6} ${HORIZON + 20 + ((i * 23) % 100)} q2 -14 12 -9" />`).join('')}</g>`;
      break;
    case 'desert':
      texture = `<g fill="none" stroke="${shade(groundColor, -0.14)}" stroke-width="2" stroke-linecap="round" opacity=".8">${Array.from({ length: 6 }, (_, i) => `<path d="M-10 ${HORIZON + 24 + i * 22} q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />`).join('')}</g>`;
      break;
    case 'glacier':
      texture = `<g fill="none" stroke="${shade(groundColor, -0.14)}" stroke-width="1.6"><path d="M10 ${HORIZON + 30} l30 20 l-10 30 l40 40" /><path d="M150 ${HORIZON + 50} l-20 24 l30 30" /><path d="M90 ${HORIZON + 100} l20 10" /></g><g fill="#fff" opacity=".6"><ellipse cx="60" cy="${HORIZON + 80}" rx="40" ry="8" /><ellipse cx="160" cy="${HORIZON + 120}" rx="30" ry="6" /></g>`;
      break;
    case 'canyon':
      texture = `<g fill="none" stroke="${shade(groundColor, -0.2)}" stroke-width="1.8"><path d="M0 ${HORIZON + 40} h40 l10 10 h50 l8 -8 h40" /><path d="M20 ${HORIZON + 90} h50 l12 10 h60" /><path d="M120 ${HORIZON + 130} h40 l10 -6 h30" /></g><g fill="${shade(groundColor, -0.25)}"><circle cx="30" cy="${HORIZON + 70}" r="3" /><circle cx="170" cy="${HORIZON + 60}" r="2.4" /></g>`;
      break;
    default:
      texture = `<g fill="#fff" opacity=".6"><ellipse cx="40" cy="${HORIZON + 50}" rx="30" ry="8" /><ellipse cx="150" cy="${HORIZON + 90}" rx="40" ry="10" /></g>`;
  }
  return `<rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="${groundColor}" /><rect x="0" y="${HORIZON}" width="${W}" height="6" fill="${shade(groundColor, 0.2)}" opacity=".7" />${texture}`;
}

/* ---------- Реквизит клетки ---------- */

function bushes(ctx: Ctx): string {
  const x = ctx.x;
  const g = hex(ctx.biome.colors.forest);
  const light = shade(g, 0.25);
  switch (ctx.biome.id) {
    case 'roofs':
      return `<g stroke="#8e5a3a" stroke-width="5" stroke-linecap="round"><path d="M${x - 40} ${FEET} v-56" /><path d="M${x + 36} ${FEET} v-40" /></g><g stroke="#cfd8dc" stroke-width="2"><path d="M${x - 40} ${FEET - 56} h-16 M${x - 40} ${FEET - 48} h-10 M${x - 40} ${FEET - 40} h-6" /><path d="M${x + 36} ${FEET - 40} h14 M${x + 36} ${FEET - 32} h10" /></g><ellipse cx="${x}" cy="${FEET - 8}" rx="34" ry="10" fill="#8e5a3a" opacity=".8" /><ellipse cx="${x}" cy="${FEET - 10}" rx="30" ry="8" fill="#a66d47" />`;
    case 'basement':
      return `<g fill="#8d6e4a" stroke="#5a4328" stroke-width="1.5"><rect x="${x - 50}" y="${FEET - 46}" width="40" height="40" /><rect x="${x - 10}" y="${FEET - 70}" width="34" height="34" /><rect x="${x + 10}" y="${FEET - 36}" width="42" height="30" /></g><g stroke="#5a4328" stroke-width="1.2"><path d="M${x - 50} ${FEET - 46} l40 40 M${x - 10} ${FEET - 46} l-40 40 M${x - 10} ${FEET - 70} l34 34 M${x + 24} ${FEET - 70} l-34 34" /></g>`;
    case 'dump':
      return `<g><ellipse cx="${x}" cy="${FEET - 14}" rx="56" ry="26" fill="#7d7760" /><ellipse cx="${x - 20}" cy="${FEET - 26}" rx="30" ry="18" fill="#8e886d" /><circle cx="${x + 30}" cy="${FEET - 30}" r="13" fill="#2b2b2b" /><circle cx="${x + 30}" cy="${FEET - 30}" r="5" fill="#8e886d" /><rect x="${x - 46}" y="${FEET - 44}" width="14" height="10" fill="#b7c0c8" transform="rotate(-20 ${x - 39} ${FEET - 39})" /><path d="M${x + 4} ${FEET - 50} l6 -10 l6 10 z" fill="#e5c05a" /></g>`;
    case 'winter_park':
      return `<g fill="#fff" stroke="#d6e4f0" stroke-width="1.5"><ellipse cx="${x - 30}" cy="${FEET - 10}" rx="40" ry="20" /><ellipse cx="${x + 34}" cy="${FEET - 6}" rx="34" ry="16" /><ellipse cx="${x}" cy="${FEET - 22}" rx="28" ry="16" /></g>`;
    case 'jungle':
      return `<g fill="${g}" stroke="${shade(g, -0.35)}" stroke-width="1.5"><ellipse cx="${x - 40}" cy="${FEET - 30}" rx="30" ry="12" transform="rotate(-35 ${x - 40} ${FEET - 30})" /><ellipse cx="${x + 38}" cy="${FEET - 34}" rx="32" ry="12" transform="rotate(30 ${x + 38} ${FEET - 34})" /><ellipse cx="${x}" cy="${FEET - 16}" rx="36" ry="12" /></g><g fill="none" stroke="${light}" stroke-width="2"><path d="M${x - 62} ${FEET - 16} l44 -28 M${x + 16} ${FEET - 20} l44 -26" /></g><g fill="none" stroke="#5a3a1c" stroke-width="3" stroke-linecap="round"><path d="M${x - 20} 0 q10 60 -6 ${FEET - 60}" /><path d="M${x + 30} 0 q-10 70 8 ${FEET - 50}" /></g>`;
    case 'desert':
      return `<g fill="#7fb069" stroke="#4f7a3e" stroke-width="1.5"><rect x="${x - 10}" y="${FEET - 90}" width="20" height="90" rx="10" /><rect x="${x - 34}" y="${FEET - 64}" width="14" height="34" rx="7" /><rect x="${x - 34}" y="${FEET - 40}" width="26" height="12" rx="6" /><rect x="${x + 20}" y="${FEET - 76}" width="14" height="30" rx="7" /><rect x="${x + 8}" y="${FEET - 54}" width="26" height="12" rx="6" /></g><g stroke="#2f5a26" stroke-width="1.2" stroke-linecap="round">${[0, 1, 2, 3, 4].map((i) => `<path d="M${x - 6} ${FEET - 80 + i * 16} h12" />`).join('')}</g><circle cx="${x}" cy="${FEET - 92}" r="6" fill="#ff8fb4" />`;
    case 'glacier':
      return `<g fill="#bfe3f5" stroke="#5d9cc5" stroke-width="1.5" stroke-linejoin="round"><path d="M${x - 60} ${FEET} l16 -40 l30 12 l-8 28 z" /><path d="M${x - 10} ${FEET} l22 -52 l34 20 l-10 32 z" /><path d="M${x + 30} ${FEET} l10 -26 l26 8 l-2 18 z" /></g><g fill="#fff" opacity=".7"><path d="M${x - 50} ${FEET - 10} l12 -24 l10 4 z" /><path d="M${x + 4} ${FEET - 20} l16 -30 l10 6 z" /></g>`;
    case 'canyon':
      return `<g fill="${g}" stroke="${shade(g, -0.45)}" stroke-width="1.5"><circle cx="${x - 30}" cy="${FEET - 18}" rx="30" r="26" /><circle cx="${x + 30}" cy="${FEET - 14}" r="22" /></g><g stroke="${shade(g, -0.5)}" stroke-width="2.4" stroke-linecap="round"><path d="M${x - 30} ${FEET - 46} v-12 M${x - 54} ${FEET - 30} l-10 -8 M${x - 6} ${FEET - 34} l10 -8 M${x + 30} ${FEET - 38} v-10 M${x + 52} ${FEET - 20} l10 -6 M${x + 12} ${FEET - 10} l-8 6" /></g>`;
    default:
      return `<g fill="${g}" stroke="${shade(g, -0.3)}" stroke-width="1.5"><ellipse cx="${x - 36}" cy="${FEET - 18}" rx="30" ry="24" /><ellipse cx="${x + 34}" cy="${FEET - 14}" rx="28" ry="20" /><ellipse cx="${x}" cy="${FEET - 28}" rx="26" ry="22" /></g><g fill="${light}" opacity=".7"><ellipse cx="${x - 44}" cy="${FEET - 26}" rx="10" ry="7" /><ellipse cx="${x + 26}" cy="${FEET - 22}" rx="9" ry="6" /><ellipse cx="${x - 6}" cy="${FEET - 36}" rx="9" ry="6" /></g>`;
  }
}

function tallProp(ctx: Ctx): string {
  const x = ctx.x;
  switch (ctx.biome.id) {
    case 'roofs':
      return `<g><rect x="${x - 40}" y="${FEET - 70}" width="80" height="64" rx="4" fill="#9aa3ad" stroke="#5f6a73" stroke-width="2" /><g stroke="#5f6a73" stroke-width="2">${Array.from({ length: 7 }, (_, i) => `<path d="M${x - 30} ${FEET - 60 + i * 8} h60" />`).join('')}</g><circle cx="${x + 28}" cy="${FEET - 14}" r="4" fill="#2b2b2b" /></g>`;
    case 'basement':
      return `<g><rect x="${x - 46}" y="${FEET - 110}" width="92" height="104" fill="#6d5a45" stroke="#3f3222" stroke-width="2" /><g fill="#8d7658"><rect x="${x - 42}" y="${FEET - 80}" width="84" height="6" /><rect x="${x - 42}" y="${FEET - 46}" width="84" height="6" /></g><g fill="#a3c9a8" stroke="#5f8a66" stroke-width="1"><rect x="${x - 36}" y="${FEET - 100}" width="12" height="20" rx="2" /><rect x="${x - 18}" y="${FEET - 96}" width="12" height="16" rx="2" /><rect x="${x + 6}" y="${FEET - 102}" width="14" height="22" rx="2" fill="#e9c46a" /></g><g fill="#c97b5a" stroke="#8a4a2e" stroke-width="1"><rect x="${x - 30}" y="${FEET - 66}" width="20" height="20" /><rect x="${x + 2}" y="${FEET - 62}" width="26" height="16" /></g></g>`;
    case 'dump':
      return `<g fill="#2b2b2b" stroke="#111" stroke-width="1.5">${[0, 1, 2, 3].map((i) => `<ellipse cx="${x + (i % 2 ? 8 : -8)}" cy="${FEET - 10 - i * 18}" rx="40" ry="12" />`).join('')}</g><g fill="#555">${[0, 1, 2, 3].map((i) => `<ellipse cx="${x + (i % 2 ? 8 : -8)}" cy="${FEET - 10 - i * 18}" rx="16" ry="4" />`).join('')}</g>`;
    case 'jungle':
      return `<g fill="#8c8a6a" stroke="#5a5a44" stroke-width="2"><rect x="${x - 60}" y="${FEET - 40}" width="120" height="36" /><rect x="${x - 44}" y="${FEET - 72}" width="88" height="34" /><rect x="${x - 26}" y="${FEET - 100}" width="52" height="30" /><rect x="${x - 10}" y="${FEET - 118}" width="20" height="20" /></g><g fill="#4f8f45" opacity=".85"><ellipse cx="${x - 50}" cy="${FEET - 42}" rx="14" ry="6" /><ellipse cx="${x + 30}" cy="${FEET - 74}" rx="12" ry="5" /><ellipse cx="${x - 14}" cy="${FEET - 102}" rx="10" ry="4" /></g><rect x="${x - 12}" y="${FEET - 30}" width="24" height="26" fill="#1c1c14" />`;
    case 'desert':
      return `<path d="M${x - 110} ${FEET} Q ${x - 40} ${FEET - 80} ${x + 20} ${FEET - 60} Q ${x + 60} ${FEET - 48} ${x + 110} ${FEET - 70} L ${x + 110} ${FEET} Z" fill="#e2c17a" stroke="#c9a257" stroke-width="1.5" /><path d="M${x - 90} ${FEET - 6} Q ${x - 40} ${FEET - 66} ${x + 10} ${FEET - 52}" fill="none" stroke="#fff" stroke-width="2" opacity=".5" />`;
    case 'glacier':
      return `<path d="M${x - 70} ${FEET} L ${x - 40} ${FEET - 90} L ${x - 16} ${FEET - 60} L ${x + 6} ${FEET - 126} L ${x + 40} ${FEET - 70} L ${x + 70} ${FEET} Z" fill="#a9d8f0" stroke="#5d9cc5" stroke-width="2" stroke-linejoin="round" /><path d="M${x - 40} ${FEET - 90} L ${x - 28} ${FEET - 10} M${x + 6} ${FEET - 126} L ${x + 18} ${FEET - 20}" fill="none" stroke="#e8f6ff" stroke-width="3" />`;
    case 'canyon':
      return `<g fill="#b5653a" stroke="#6e3a1f" stroke-width="2"><path d="M${x - 40} ${FEET} L ${x - 32} ${FEET - 110} Q ${x} ${FEET - 130} ${x + 30} ${FEET - 112} L ${x + 44} ${FEET} Z" /></g><g stroke="#8a4a2e" stroke-width="2.4"><path d="M${x - 32} ${FEET - 80} h62 M${x - 36} ${FEET - 50} h74 M${x - 30} ${FEET - 100} h56" /></g><path d="M${x - 20} ${FEET - 118} q20 -14 44 -4" fill="none" stroke="#e0a070" stroke-width="3" />`;
    case 'winter_park':
      return `<g><path d="M${x} ${FEET - 130} l-46 70 h92 z" fill="#2f6b3a" stroke="#1f4a28" stroke-width="2" /><path d="M${x} ${FEET - 100} l-56 90 h112 z" fill="#3d7f49" stroke="#1f4a28" stroke-width="2" /><rect x="${x - 8}" y="${FEET - 12}" width="16" height="12" fill="#5a3a24" /><g fill="#fff" opacity=".85"><ellipse cx="${x - 20}" cy="${FEET - 76}" rx="14" ry="5" /><ellipse cx="${x + 14}" cy="${FEET - 46}" rx="18" ry="6" /><ellipse cx="${x - 30}" cy="${FEET - 22}" rx="16" ry="5" /></g></g>`;
    default:
      return `<g stroke="#6b4a2c" stroke-width="1.5">${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<g><rect x="${x - 52 + c * 26 + (r % 2 ? 13 : 0)}" y="${FEET - 16 - r * 18}" width="26" height="16" rx="7" fill="#a8763f" /><circle cx="${x - 39 + c * 26 + (r % 2 ? 13 : 0)}" cy="${FEET - 8 - r * 18}" r="5.5" fill="#e0b57a" /></g>`).join('')).join('')}</g>`;
  }
}

function puddle(ctx: Ctx): string {
  const x = ctx.x;
  const c = hex(ctx.biome.colors.water);
  switch (ctx.biome.id) {
    case 'roofs':
      return `<g><path d="M${x - 54} ${FEET + 6} l16 -14 l20 6 l18 -10 l22 8 l12 12 l-8 14 l-24 6 l-30 -4 l-20 -6 z" fill="#1b1a24" stroke="#3b3550" stroke-width="2" /><path d="M${x - 30} ${FEET + 2} l10 -6 l14 4" fill="none" stroke="#6b6185" stroke-width="2" /></g>`;
    case 'dump':
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="#171717" /><path d="M${x - 30} ${FEET + 2} q20 -6 40 2" fill="none" stroke="#7c6cff" stroke-width="2" opacity=".6" /><path d="M${x - 20} ${FEET + 10} q16 4 36 -2" fill="none" stroke="#5ad1c8" stroke-width="2" opacity=".5" /></g>`;
    case 'jungle':
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="64" ry="18" fill="#4a7a52" stroke="#2f5a36" stroke-width="2" /><g fill="#2f5a36" opacity=".8"><ellipse cx="${x - 30}" cy="${FEET + 4}" rx="16" ry="6" /><ellipse cx="${x + 26}" cy="${FEET + 12}" rx="14" ry="5" /></g><g fill="none" stroke="#9fd38a" stroke-width="1.5"><circle cx="${x - 8}" cy="${FEET + 2}" r="3" /><circle cx="${x + 12}" cy="${FEET + 10}" r="2" /></g></g>`;
    case 'desert':
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="#5bc0eb" stroke="#e8d7a0" stroke-width="5" /><g fill="none" stroke="#fff" stroke-width="2" opacity=".7"><path d="M${x - 30} ${FEET + 4} q10 -4 20 0" /><path d="M${x + 6} ${FEET + 12} q10 -4 20 0" /></g><g fill="none" stroke="#3f8f45" stroke-width="3" stroke-linecap="round"><path d="M${x + 56} ${FEET - 10} q-4 -36 6 -46 M${x + 56} ${FEET - 10} q-24 -18 -34 -10 M${x + 56} ${FEET - 10} q24 -18 34 -10" /></g><rect x="${x + 52}" y="${FEET - 12}" width="8" height="22" fill="#8d6248" /></g>`;
    case 'glacier':
      return `<g><path d="M${x - 60} ${FEET + 2} l14 -12 l22 6 l16 -8 l22 6 l-2 22 l-24 6 l-26 -4 l-20 -6 z" fill="#3a7fc1" stroke="#e8f6ff" stroke-width="4" /><g stroke="#e8f6ff" stroke-width="1.6" fill="none"><path d="M${x + 36} ${FEET - 6} l16 -8 l8 -14 M${x - 54} ${FEET} l-16 -6" /></g></g>`;
    case 'canyon':
      return `<g><path d="M${x - 70} ${FEET + 2} C ${x - 40} ${FEET - 10} ${x - 10} ${FEET + 22} ${x + 20} ${FEET + 6} S ${x + 60} ${FEET - 4} ${x + 80} ${FEET + 8} L ${x + 80} ${FEET + 22} C ${x + 50} ${FEET + 14} ${x + 20} ${FEET + 30} ${x - 10} ${FEET + 18} S ${x - 50} ${FEET + 12} ${x - 70} ${FEET + 20} Z" fill="#4fa3d1" stroke="#2f6f96" stroke-width="1.5" /><path d="M${x - 40} ${FEET + 8} q14 -4 28 2" fill="none" stroke="#fff" stroke-width="2" opacity=".7" /></g>`;
    case 'winter_park':
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="58" ry="16" fill="#9fd3f2" stroke="#e9f4fb" stroke-width="5" /><g stroke="#e9f4fb" stroke-width="1.6" fill="none"><path d="M${x + 40} ${FEET - 2} l16 -8 l8 -14 M${x - 50} ${FEET + 2} l-16 -6" /></g></g>`;
    default:
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="${c}" stroke="${shade(c, -0.25)}" stroke-width="1.5" /><g fill="none" stroke="#fff" stroke-width="2" opacity=".7"><path d="M${x - 30} ${FEET + 4} q10 -4 20 0" /><path d="M${x + 6} ${FEET + 12} q10 -4 20 0" /></g></g>`;
  }
}

function wall(ctx: Ctx, broken: boolean): string {
  const x = ctx.x;
  const crack = broken ? `<path d="M${x - 10} ${FEET - 90} l8 14 l-6 10 l10 16 l-4 12" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round" /><path d="M${x + 20} ${FEET - 60} l-10 8 l6 10" fill="none" stroke="#1a1a1a" stroke-width="2" />` : '';
  switch (ctx.biome.id) {
    case 'roofs':
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 100 + r * 16}" width="32" height="14" fill="${r % 2 ? '#8e5a3a' : '#9a6442'}" stroke="#5a3620" stroke-width="1" />`).join('')).join('')}<rect x="-4" y="${FEET - 106}" width="${W + 8}" height="8" fill="#b7c0c8" stroke="#5f6a73" stroke-width="1" />${crack}</g>`;
    case 'basement':
      return `<g>${Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 112 + r * 16}" width="32" height="14" fill="${r % 3 ? '#8d4a3c' : '#9c5646'}" stroke="#4a241c" stroke-width="1" />`).join('')).join('')}${crack}</g>`;
    case 'dump':
      return `<g><rect x="${x - 36}" y="${FEET - 120}" width="72" height="116" rx="4" fill="#dfe6ea" stroke="#8a949b" stroke-width="2" /><path d="M${x - 36} ${FEET - 70} h72" stroke="#8a949b" stroke-width="2" /><rect x="${x + 20}" y="${FEET - 110}" width="5" height="28" rx="2" fill="#8a949b" /><rect x="${x + 20}" y="${FEET - 60}" width="5" height="40" rx="2" fill="#8a949b" /><g fill="#c0392b"><circle cx="${x - 22}" cy="${FEET - 94}" r="4" /><circle cx="${x - 10}" cy="${FEET - 40}" r="3" /></g>${broken ? `<path d="M${x - 36} ${FEET - 120} l20 30 l-14 20 l22 24" fill="none" stroke="#5a5a5a" stroke-width="2.5" />` : ''}</g>`;
    case 'jungle':
      return `<g fill="#9a8b3c" stroke="#5a4e1c" stroke-width="1.5">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 18 - 6}" y="${FEET - 100}" width="12" height="98" rx="6" />`).join('')}</g><g stroke="#5a4e1c" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 18 - 6} ${FEET - 70} h12 M${i * 18 - 6} ${FEET - 36} h12" />`).join('')}</g><path d="M-6 ${FEET - 84} q100 20 212 -6 M-6 ${FEET - 20} q100 -20 212 6" fill="none" stroke="#6b4a2c" stroke-width="3" />${broken ? `<path d="M${x - 6} ${FEET - 100} l6 30 l-10 14 l12 24" fill="none" stroke="#2a2010" stroke-width="2.5" /><rect x="${x + 12}" y="${FEET - 100}" width="12" height="44" fill="${hex(ctx.biome.colors.plain)}" />` : ''}`;
    case 'desert':
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 100 + r * 16}" width="32" height="14" rx="2" fill="${r % 2 ? '#c8956b' : '#d4a277'}" stroke="#8a5a36" stroke-width="1" />`).join('')).join('')}<g fill="#8a5a36" opacity=".6"><path d="M${x - 20} ${FEET - 94} h6 M${x + 30} ${FEET - 60} h8" stroke="#8a5a36" stroke-width="2" /></g>${crack}</g>`;
    case 'glacier':
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 40 + (r % 2 ? 20 : 0) - 24}" y="${FEET - 104 + r * 17}" width="38" height="15" rx="3" fill="#8fc4e8" stroke="#e8f6ff" stroke-width="1.5" />`).join('')).join('')}<g stroke="#fff" stroke-width="1.2" opacity=".8"><path d="M10 ${FEET - 96} l8 6 M90 ${FEET - 62} l8 6 M150 ${FEET - 28} l8 6" /></g>${crack}</g>`;
    case 'canyon':
      return `<g><rect x="-6" y="${FEET - 110}" width="${W + 12}" height="108" fill="#8a4a2e" stroke="#4a2414" stroke-width="2" /><g fill="none" stroke="#a8603a" stroke-width="5"><path d="M-6 ${FEET - 92} q100 6 212 -4 M-6 ${FEET - 66} q100 -6 212 4 M-6 ${FEET - 40} q100 6 212 -4 M-6 ${FEET - 16} q100 -6 212 4" /></g>${broken ? `<g fill="#6e3a1f"><circle cx="${x - 20}" cy="${FEET - 70}" r="10" /><circle cx="${x + 24}" cy="${FEET - 40}" r="8" /><circle cx="${x}" cy="${FEET - 14}" r="12" /></g>` : ''}</g>`;
    case 'winter_park':
      return `<g>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 40 + (r % 2 ? 20 : 0) - 24}" y="${FEET - 90 + r * 18}" width="38" height="16" rx="3" fill="#eef5fb" stroke="#b9cfe0" stroke-width="1.5" />`).join('')).join('')}${crack}</g>`;
    default:
      return `<g fill="#c99a66" stroke="#8a5f30" stroke-width="1.5">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 - 4} ${FEET - 96} h14 v94 h-14 z" />`).join('')}<rect x="-6" y="${FEET - 70}" width="${W + 12}" height="6" /><rect x="-6" y="${FEET - 30}" width="${W + 12}" height="6" />${broken ? `<path d="M${x - 8} ${FEET - 96} l-6 40 l10 -6 l-4 40" fill="none" stroke="#3a2a14" stroke-width="2.5" /><rect x="${x + 12}" y="${FEET - 96}" width="14" height="40" fill="${hex(ctx.biome.colors.plain)}" />` : ''}</g>`;
  }
}

function cover(ctx: Ctx): string {
  const x = ctx.x;
  switch (ctx.biome.id) {
    case 'roofs':
      return `<g><rect x="${x - 44}" y="${FEET - 60}" width="88" height="54" rx="4" fill="#cfd8dc" stroke="#78909c" stroke-width="2" /><circle cx="${x}" cy="${FEET - 33}" r="20" fill="#90a4ae" stroke="#546e7a" stroke-width="2" /><g stroke="#546e7a" stroke-width="2"><path d="M${x} ${FEET - 53} v40 M${x - 20} ${FEET - 33} h40 M${x - 14} ${FEET - 47} l28 28 M${x + 14} ${FEET - 47} l-28 28" /></g></g>`;
    case 'basement':
      return `<g><rect x="${x - 30}" y="${FEET - 80}" width="60" height="76" rx="8" fill="#6d4c41" stroke="#3e2723" stroke-width="2" /><g stroke="#3e2723" stroke-width="3"><path d="M${x - 30} ${FEET - 64} h60 M${x - 30} ${FEET - 22} h60" /></g><ellipse cx="${x}" cy="${FEET - 80}" rx="30" ry="6" fill="#8d6e63" stroke="#3e2723" stroke-width="2" /></g>`;
    case 'dump':
      return `<g><rect x="${x - 58}" y="${FEET - 50}" width="116" height="44" rx="10" fill="#8d6e63" stroke="#4e342e" stroke-width="2" /><rect x="${x - 62}" y="${FEET - 70}" width="20" height="60" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><rect x="${x + 42}" y="${FEET - 70}" width="20" height="60" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><rect x="${x - 50}" y="${FEET - 74}" width="100" height="30" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><path d="M${x - 10} ${FEET - 30} q10 -8 20 0" fill="none" stroke="#4e342e" stroke-width="2" /><circle cx="${x + 30}" cy="${FEET - 20}" r="4" fill="#fff" opacity=".7" /></g>`;
    case 'jungle':
      return `<g><rect x="${x - 56}" y="${FEET - 150}" width="112" height="150" rx="40" fill="#7a5a3a" stroke="#4a3220" stroke-width="2" /><ellipse cx="${x}" cy="${FEET - 60}" rx="28" ry="40" fill="#2a1c12" /><ellipse cx="${x}" cy="${FEET - 64}" rx="16" ry="26" fill="#140d08" /><g fill="#4f8f45"><ellipse cx="${x - 50}" cy="${FEET - 140}" rx="24" ry="10" transform="rotate(-30 ${x - 50} ${FEET - 140})" /><ellipse cx="${x + 50}" cy="${FEET - 136}" rx="24" ry="10" transform="rotate(30 ${x + 50} ${FEET - 136})" /></g></g>`;
    case 'desert':
      return `<g fill="none" stroke="#e8e0c8" stroke-width="7" stroke-linecap="round"><path d="M${x - 60} ${FEET - 4} q60 -90 120 0" /><path d="M${x - 46} ${FEET - 40} q0 -30 24 -42" /><path d="M${x - 26} ${FEET - 56} q4 -22 26 -28" /><path d="M${x - 2} ${FEET - 62} q8 -20 30 -22" /><path d="M${x + 22} ${FEET - 58} q10 -14 30 -10" /><path d="M${x - 60} ${FEET - 4} h120" /></g><g><ellipse cx="${x + 70}" cy="${FEET - 2}" rx="22" ry="16" fill="#e8e0c8" stroke="#bfb59a" stroke-width="2" /><circle cx="${x + 64}" cy="${FEET - 6}" r="4" fill="#2a2a2a" /><circle cx="${x + 78}" cy="${FEET - 6}" r="4" fill="#2a2a2a" /><path d="M${x + 60} ${FEET + 6} h22" stroke="#bfb59a" stroke-width="2" /></g>`;
    case 'glacier':
      return `<g><path d="M${x - 80} ${FEET + 4} q0 -110 80 -116 q80 6 80 116 z" fill="#eaf6ff" stroke="#9cc9e6" stroke-width="2" /><path d="M${x - 50} ${FEET + 4} q0 -70 50 -76 q50 6 50 76 z" fill="#2a4a66" /><path d="M${x - 30} ${FEET + 4} q0 -44 30 -50 q30 6 30 50 z" fill="#142a40" /><g fill="#fff" opacity=".8"><ellipse cx="${x - 40}" cy="${FEET - 92}" rx="14" ry="5" /><ellipse cx="${x + 36}" cy="${FEET - 86}" rx="12" ry="4" /></g></g>`;
    case 'canyon':
      return `<g><path d="M${x - 70} ${FEET + 2} L ${x - 60} ${FEET - 130} L ${x - 14} ${FEET - 130} L ${x - 20} ${FEET + 2} Z" fill="#b5653a" stroke="#6e3a1f" stroke-width="2" /><path d="M${x + 20} ${FEET + 2} L ${x + 14} ${FEET - 130} L ${x + 60} ${FEET - 130} L ${x + 70} ${FEET + 2} Z" fill="#b5653a" stroke="#6e3a1f" stroke-width="2" /><path d="M${x - 20} ${FEET + 2} L ${x - 14} ${FEET - 130} L ${x + 14} ${FEET - 130} L ${x + 20} ${FEET + 2} Z" fill="#1a0d08" /><g stroke="#8a4a2e" stroke-width="2"><path d="M${x - 60} ${FEET - 100} h40 M${x - 58} ${FEET - 60} h36 M${x + 20} ${FEET - 90} h40 M${x + 18} ${FEET - 50} h44" /></g></g>`;
    case 'winter_park':
      return `<g><path d="M${x - 70} ${FEET + 2} q70 -56 140 0 z" fill="#f4f9fd" stroke="#c3d7e6" stroke-width="2" /><g stroke="#c3d7e6" stroke-width="1.5" fill="none"><path d="M${x - 40} ${FEET - 10} q40 -24 80 0" /><path d="M${x - 20} ${FEET - 22} q20 -10 40 0" /></g></g>`;
    default:
      return `<g><rect x="${x - 44}" y="${FEET - 64}" width="88" height="60" rx="3" fill="#dcae72" stroke="#a8763f" stroke-width="2" /><path d="M${x - 44} ${FEET - 64} l-12 -12 h44 l-12 12 z M${x + 44} ${FEET - 64} l12 -12 h-44 l12 12 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.5" stroke-linejoin="round" /><rect x="${x - 5}" y="${FEET - 64}" width="10" height="60" fill="#c9924f" opacity=".5" /><path d="M${x - 30} ${FEET - 30} h20 M${x - 30} ${FEET - 22} h30" stroke="#a8763f" stroke-width="1.5" stroke-linecap="round" opacity=".7" /><path d="M${x + 14} ${FEET - 46} l-4 10 l6 -2 l-2 8" fill="none" stroke="#a8763f" stroke-width="1.5" /></g>`;
  }
}

function prop(ctx: Ctx): string {
  switch (ctx.terrain) {
    case 'forest':
      return bushes(ctx);
    case 'mountain':
      return tallProp(ctx);
    case 'water':
      return puddle(ctx);
    case 'wall':
      return wall(ctx, false);
    case 'wall_breakable':
      return wall(ctx, true);
    case 'cover':
      return cover(ctx);
    default:
      return '';
  }
}

/** Половина фона кинематика за бойцом, стоящим на клетке `terrain` биома `biomeId`. */
export function backdropSvg(biomeId: string, terrain: TerrainId, side: Side): string {
  const biome = biomeDef(biomeId);
  const ctx: Ctx = { biome, terrain, side, x: side === 'left' ? 108 : 92, id: `bd-${biomeId}-${terrain}-${side}` };
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  ${defs(ctx)}
  ${sky(ctx)}
  ${ground(ctx)}
  ${prop(ctx)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" />
</svg>`;
}

export const BACKDROP = { W, H, HORIZON, FEET } as const;
