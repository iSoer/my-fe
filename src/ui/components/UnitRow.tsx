import type { ComponentChildren } from 'preact';
import type { UnitInstance } from '@core/types';
import { displayName, unitClass, unitClassName, visibleStats } from '@core/units';
import { UnitAvatar } from './UnitAvatar';
import { WeaponBadge, RarityStars } from './Badges';
import { MOVE_EMOJI } from '../lib/format';
import { stagger } from '../lib/animate';

export function UnitRow({
  unit,
  onClick,
  selected,
  dim,
  right,
  tags,
  animated = true,
  friendly = false,
  index,
}: {
  unit: UnitInstance;
  onClick?: () => void;
  selected?: boolean;
  dim?: boolean;
  right?: ComponentChildren;
  tags?: ComponentChildren;
  animated?: boolean;
  friendly?: boolean;
  /** Индекс в списке для поочерёдного появления. */
  index?: number;
}) {
  const cls = unitClass(unit);
  const st = visibleStats(unit);
  return (
    <div
      class={`card unit-row ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''} ${dim ? 'dim' : ''} ${index !== undefined ? 'pop-in' : ''}`}
      style={index !== undefined ? stagger(index) : undefined}
      onClick={onClick}
    >
      <UnitAvatar unit={unit} size="md" animated={animated} friendly={friendly} />
      <div class="info">
        <div class="name">{displayName(unit)}</div>
        <div class="sub">
          <span>
            {MOVE_EMOJI[cls.moveType]} {unitClassName(unit)}
          </span>
          <WeaponBadge kind={cls.weaponKind} />
          {tags}
        </div>
        <div class="mini-stats">
          <span>
            HP <b>{st.hp}</b>
          </span>
          <span>
            Atk <b>{st.atk}</b>
          </span>
          <span>
            Spd <b>{st.spd}</b>
          </span>
          <span>
            Def <b>{st.def}</b>
          </span>
          <span>
            Res <b>{st.res}</b>
          </span>
        </div>
      </div>
      <div class="side">
        <span class="lvl">Ур. {unit.level}</span>
        <RarityStars rarity={unit.rarity} />
        {right}
      </div>
    </div>
  );
}
