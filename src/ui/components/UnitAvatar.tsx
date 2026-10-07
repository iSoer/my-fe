import type { UnitInstance } from '@core/types';
import { ACCESSORIES, EYE_COLORS, FUR_PALETTES, PATTERNS } from '@content/appearance';
import { hex, speciesEmoji } from '../lib/format';

const ACC_COLORS: Record<string, string> = {
  'Красный ошейник': '#e63946',
  'Синий ошейник': '#3b82f6',
  Бандана: '#f6c344',
  Бантик: '#ff6fae',
  Колокольчик: '#ffd166',
};

export function UnitAvatar({ unit, size = 'md', dead = false }: { unit: UnitInstance; size?: 'sm' | 'md' | 'lg'; dead?: boolean }) {
  const a = unit.appearance;
  const fur = hex(FUR_PALETTES[a.furPalette]?.color ?? 0x95a5a6);
  const eye = hex(EYE_COLORS[a.eyeColor]?.color ?? 0x2ecc71);
  const pattern = PATTERNS[a.pattern] ?? 'Однотонный';
  const acc = ACCESSORIES[a.accessory] ?? '';
  let bg = fur;
  if (pattern === 'Полосатый') bg = `repeating-linear-gradient(45deg, ${fur} 0 6px, rgba(0,0,0,0.22) 6px 10px)`;
  else if (pattern === 'Пятнистый') bg = `radial-gradient(circle at 30% 30%, rgba(0,0,0,0.25) 0 14%, transparent 15%), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.25) 0 12%, transparent 13%), ${fur}`;
  else if (pattern === 'Смокинг') bg = `linear-gradient(180deg, ${fur} 0 55%, #f5f5f7 55%)`;
  const accColor = ACC_COLORS[acc];
  const title = `${FUR_PALETTES[a.furPalette]?.name ?? ''}, ${pattern.toLowerCase()}${acc && acc !== 'Без аксессуара' ? `, ${acc.toLowerCase()}` : ''}`;
  return (
    <div class={`avatar ${size} ${dead ? 'dead' : ''}`} style={{ background: bg }} title={title} aria-label={title}>
      <span class="species">{speciesEmoji(unit.species)}</span>
      <span class="eyes">
        <i style={{ background: eye }} />
        <i style={{ background: eye }} />
      </span>
      {accColor && <span class="acc" style={{ background: accColor }} />}
      {acc === 'Повязка на глаз' && <span class="acc" style={{ top: '30%', bottom: 'auto', height: '10%', background: '#111', opacity: 0.8 }} />}
      {unit.isBoss && <span class="boss">👑</span>}
    </div>
  );
}
