/** Тайлы карты 64×64 (вид сверху) в зависимости от биома и типа местности. */
import type { TerrainId } from '@core/types';
import { biomeDef } from '@content/biomes';
import { hex, shade } from './palettes';

const S = 64;

function plainDeco(biomeId: string, base: string): string {
  const d = shade(base, -0.16);
  switch (biomeId) {
    case 'roofs':
      return `<g stroke="${d}" stroke-width="1.5"><path d="M0 16 h64 M0 32 h64 M0 48 h64" /><path d="M16 0 v16 M48 0 v16 M32 16 v16 M16 32 v16 M48 32 v16 M32 48 v16" /></g>`;
    case 'basement':
      return `<path d="M14 40 l10 6 l-4 10" fill="none" stroke="${d}" stroke-width="1.5" />`;
    case 'dump':
      return `<g fill="${d}"><rect x="10" y="12" width="9" height="4" transform="rotate(-20 14 14)" /><circle cx="46" cy="44" r="3" /><rect x="30" y="50" width="6" height="6" /></g>`;
    case 'winter_park':
      return `<g fill="#fff" opacity=".7"><ellipse cx="20" cy="22" rx="12" ry="4" /><ellipse cx="46" cy="46" rx="14" ry="5" /></g>`;
    default:
      return `<g stroke="${d}" stroke-width="2" stroke-linecap="round"><path d="M12 20 l2 -6 M16 20 l1 -5 M40 44 l2 -6 M44 44 l1 -5 M24 52 l2 -6" /></g>`;
  }
}

function forestDeco(biomeId: string, base: string): string {
  const dark = shade(base, -0.25);
  const light = shade(base, 0.22);
  switch (biomeId) {
    case 'roofs':
      return `<g stroke="#8e5a3a" stroke-width="5" stroke-linecap="round"><path d="M18 56 v-40 M46 56 v-28" /></g><g stroke="#cfd8dc" stroke-width="2"><path d="M18 16 h-10 M18 24 h-6 M46 28 h10 M46 36 h6" /></g>`;
    case 'basement':
      return `<g fill="#8d6e4a" stroke="#5a4328" stroke-width="1.5"><rect x="6" y="8" width="24" height="24" /><rect x="34" y="20" width="24" height="24" /><rect x="12" y="36" width="20" height="20" /></g><g stroke="#5a4328" stroke-width="1"><path d="M6 8 l24 24 M30 8 l-24 24 M34 20 l24 24 M58 20 l-24 24" /></g>`;
    case 'dump':
      return `<g><ellipse cx="32" cy="36" rx="26" ry="16" fill="#7d7760" /><ellipse cx="22" cy="28" rx="14" ry="10" fill="#8e886d" /><circle cx="44" cy="26" r="7" fill="#2b2b2b" /><circle cx="44" cy="26" r="3" fill="#8e886d" /><rect x="12" y="40" width="10" height="6" fill="#b7c0c8" /></g>`;
    case 'winter_park':
      return `<g fill="#fff" stroke="#d6e4f0" stroke-width="1.5"><ellipse cx="22" cy="40" rx="18" ry="12" /><ellipse cx="44" cy="26" rx="16" ry="11" /><ellipse cx="40" cy="48" rx="14" ry="9" /></g>`;
    default:
      return `<g fill="${dark}" stroke="${shade(base, -0.4)}" stroke-width="1.2"><circle cx="22" cy="24" r="13" /><circle cx="44" cy="40" r="12" /><circle cx="24" cy="46" r="9" /></g><g fill="${light}" opacity=".6"><circle cx="17" cy="19" r="4" /><circle cx="40" cy="35" r="3.5" /><circle cx="21" cy="42" r="2.6" /></g>`;
  }
}

function mountainDeco(biomeId: string): string {
  switch (biomeId) {
    case 'roofs':
      return `<rect x="10" y="10" width="44" height="44" rx="4" fill="#9aa3ad" stroke="#5f6a73" stroke-width="2" /><g stroke="#5f6a73" stroke-width="2"><path d="M16 20 h32 M16 28 h32 M16 36 h32 M16 44 h32" /></g>`;
    case 'basement':
      return `<rect x="8" y="6" width="48" height="52" fill="#6d5a45" stroke="#3f3222" stroke-width="2" /><g fill="#8d7658"><rect x="10" y="22" width="44" height="4" /><rect x="10" y="40" width="44" height="4" /></g><g fill="#a3c9a8"><rect x="14" y="10" width="8" height="12" /><rect x="26" y="12" width="8" height="10" /><rect x="40" y="28" width="10" height="12" fill="#e9c46a" /></g>`;
    case 'dump':
      return `<g fill="#2b2b2b" stroke="#111" stroke-width="1"><ellipse cx="32" cy="44" rx="24" ry="9" /><ellipse cx="30" cy="32" rx="22" ry="9" /><ellipse cx="34" cy="20" rx="20" ry="8" /></g><g fill="#555"><ellipse cx="34" cy="20" rx="8" ry="3" /></g>`;
    case 'winter_park':
      return `<path d="M32 6 l-22 36 h44 z" fill="#2f6b3a" stroke="#1f4a28" stroke-width="2" /><path d="M32 20 l-26 38 h52 z" fill="#3d7f49" stroke="#1f4a28" stroke-width="2" /><g fill="#fff" opacity=".85"><ellipse cx="26" cy="34" rx="8" ry="3" /><ellipse cx="38" cy="48" rx="10" ry="3" /></g>`;
    default:
      return `<g stroke="#6b4a2c" stroke-width="1.2">${[0, 1, 2].map((r) => [0, 1].map((c) => `<g><rect x="${8 + c * 26 + (r % 2 ? 13 : 0) - (r % 2 ? 13 : 0)}" y="${12 + r * 14}" width="24" height="12" rx="6" fill="#a8763f" /><circle cx="${20 + c * 26}" cy="${18 + r * 14}" r="4.5" fill="#e0b57a" /></g>`).join('')).join('')}</g>`;
  }
}

function waterDeco(biomeId: string, base: string): string {
  const light = shade(base, 0.35);
  switch (biomeId) {
    case 'roofs':
      return `<path d="M8 20 l14 -10 l16 6 l14 -8 l8 14 l-6 18 l-16 10 l-20 -4 l-10 -12 z" fill="#1b1a24" stroke="#3b3550" stroke-width="2" />`;
    case 'dump':
      return `<g><ellipse cx="32" cy="34" rx="26" ry="18" fill="#171717" /><path d="M14 30 q18 -6 36 0" fill="none" stroke="#7c6cff" stroke-width="2" opacity=".6" /><path d="M18 40 q14 4 28 -2" fill="none" stroke="#5ad1c8" stroke-width="2" opacity=".5" /></g>`;
    case 'winter_park':
      return `<ellipse cx="32" cy="32" rx="24" ry="18" fill="#9fd3f2" stroke="#e9f4fb" stroke-width="4" /><path d="M50 22 l8 -6 M10 44 l-6 6" stroke="#e9f4fb" stroke-width="1.5" />`;
    default:
      return `<g fill="none" stroke="${light}" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M10 22 q6 -4 12 0 t12 0" /><path d="M26 40 q6 -4 12 0 t12 0" /><path d="M8 54 q6 -4 12 0" /></g>`;
  }
}

function wallDeco(biomeId: string, base: string, broken: boolean): string {
  const mortar = shade(base, -0.35);
  const crack = broken ? `<path d="M30 4 l6 14 l-6 10 l8 16 l-4 14" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round" />` : '';
  switch (biomeId) {
    case 'dump':
      return `<rect x="12" y="4" width="40" height="56" rx="3" fill="#dfe6ea" stroke="#8a949b" stroke-width="2" /><path d="M12 28 h40" stroke="#8a949b" stroke-width="2" /><rect x="44" y="10" width="3" height="12" rx="1.5" fill="#8a949b" /><rect x="44" y="34" width="3" height="18" rx="1.5" fill="#8a949b" />${broken ? `<path d="M14 6 l10 18 l-8 12 l12 16" fill="none" stroke="#5a5a5a" stroke-width="2" />` : ''}`;
    case 'winter_park':
      return `<g fill="#eef5fb" stroke="#b9cfe0" stroke-width="1.5">${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 16 + 1}" width="22" height="14" rx="3" />`).join('')).join('')}</g>${crack}`;
    case 'yard':
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.5">${[0, 1, 2, 3].map((i) => `<rect x="${i * 16 + 1}" y="2" width="12" height="60" rx="2" />`).join('')}<rect x="0" y="18" width="64" height="5" /><rect x="0" y="42" width="64" height="5" /></g>${broken ? `<rect x="33" y="2" width="12" height="26" fill="${hex(biomeDef(biomeId).colors.plain)}" /><path d="M20 4 l-4 24 l6 -4 l-3 26" fill="none" stroke="#3a2a14" stroke-width="2" />` : ''}`;
    default:
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.5">${[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 13 + 1}" width="22" height="11" />`).join('')).join('')}</g>${crack}`;
  }
}

function coverDeco(biomeId: string, base: string): string {
  switch (biomeId) {
    case 'roofs':
      return `<rect x="8" y="10" width="48" height="44" rx="4" fill="#cfd8dc" stroke="#78909c" stroke-width="2" /><circle cx="32" cy="32" r="14" fill="#90a4ae" stroke="#546e7a" stroke-width="2" /><path d="M32 18 v28 M18 32 h28" stroke="#546e7a" stroke-width="2" />`;
    case 'basement':
      return `<circle cx="32" cy="32" r="22" fill="#6d4c41" stroke="#3e2723" stroke-width="2" /><circle cx="32" cy="32" r="14" fill="none" stroke="#3e2723" stroke-width="2.5" /><circle cx="32" cy="32" r="5" fill="#8d6e63" />`;
    case 'dump':
      return `<rect x="6" y="18" width="52" height="30" rx="7" fill="#8d6e63" stroke="#4e342e" stroke-width="2" /><rect x="2" y="12" width="12" height="36" rx="5" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><rect x="50" y="12" width="12" height="36" rx="5" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><path d="M20 24 h24 M32 24 v20" stroke="#4e342e" stroke-width="1.5" />`;
    case 'winter_park':
      return `<path d="M4 54 q28 -46 56 0 z" fill="#f4f9fd" stroke="#c3d7e6" stroke-width="2" /><path d="M16 46 q16 -22 32 0" fill="none" stroke="#c3d7e6" stroke-width="1.5" />`;
    default:
      return `<rect x="10" y="12" width="44" height="42" rx="3" fill="${base}" stroke="#a8763f" stroke-width="2" /><path d="M10 12 h44 M32 12 v42" stroke="#a8763f" stroke-width="2" /><rect x="28" y="12" width="8" height="42" fill="#c9924f" opacity=".45" /><path d="M16 42 h12 M16 48 h18" stroke="#a8763f" stroke-width="1.5" stroke-linecap="round" opacity=".7" />`;
  }
}

/** SVG тайла 64×64 для клетки местности `terrain` в биоме `biomeId`. */
export function tileSvg(biomeId: string, terrain: TerrainId): string {
  const b = biomeDef(biomeId);
  const plain = hex(b.colors.plain);
  const own = hex(b.colors[terrain] ?? b.colors.plain);
  let base = own;
  let deco = '';
  switch (terrain) {
    case 'plain':
      deco = plainDeco(biomeId, plain);
      break;
    case 'forest':
      base = shade(plain, -0.08);
      deco = forestDeco(biomeId, own);
      break;
    case 'mountain':
      base = plain;
      deco = mountainDeco(biomeId);
      break;
    case 'water':
      base = terrain === 'water' && (biomeId === 'roofs' || biomeId === 'dump') ? plain : own;
      deco = waterDeco(biomeId, own);
      break;
    case 'wall':
      base = biomeId === 'dump' || biomeId === 'winter_park' ? plain : shade(own, -0.1);
      deco = wallDeco(biomeId, own, false);
      break;
    case 'wall_breakable':
      base = biomeId === 'dump' || biomeId === 'winter_park' ? plain : shade(own, -0.1);
      deco = wallDeco(biomeId, own, true);
      break;
    case 'cover':
      base = plain;
      deco = coverDeco(biomeId, own);
      break;
  }
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="0" y="0" width="${S}" height="${S}" fill="${base}" />${deco}</svg>`;
}

export const TILE_SIZE = S;
