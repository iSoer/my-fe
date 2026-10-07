import type { MoveType, Rarity, WeaponKind } from '@core/types';
import { KIND_COLOR } from '@content/weapons';
import { MOVE_NAMES, WEAPON_KIND_NAMES } from '@content/classes';
import { COLOR_CSS, MOVE_EMOJI } from '../lib/format';

export function WeaponBadge({ kind, name }: { kind: WeaponKind; name?: string }) {
  return (
    <span class="badge">
      <span class="dot" style={{ background: COLOR_CSS[KIND_COLOR[kind]] }} />
      {name ?? WEAPON_KIND_NAMES[kind]}
    </span>
  );
}

export function MoveBadge({ moveType }: { moveType: MoveType }) {
  return (
    <span class="badge">
      {MOVE_EMOJI[moveType]} {MOVE_NAMES[moveType]}
    </span>
  );
}

export function RarityStars({ rarity }: { rarity: Rarity }) {
  return (
    <span class="stars" aria-label={`Редкость ${rarity}`}>
      {'★'.repeat(rarity)}
      <span style={{ opacity: 0.25 }}>{'★'.repeat(5 - rarity)}</span>
    </span>
  );
}
