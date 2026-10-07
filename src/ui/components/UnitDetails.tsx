import type { UnitInstance } from '@core/types';
import { STATS } from '@core/types';
import { displayName, unitClass, unitClassName, visibleStats } from '@core/units';
import { skillInfo } from '@content/index';
import { traitDef } from '@content/traits';
import { breedDef } from '@content/breeds';
import { personalityText } from '@content/personalities';
import { UnitAvatar } from './UnitAvatar';
import { MoveBadge, RarityStars, WeaponBadge } from './Badges';
import { StatsGrid } from './Stats';
import { STAT_LABELS, speciesEmoji } from '../lib/format';

/** Полная карточка бойца для шторок (ростер, приют, выбор отряда). */
export function UnitDetails({ unit, compact = false }: { unit: UnitInstance; compact?: boolean }) {
  const cls = unitClass(unit);
  const stats = visibleStats(unit);
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined;
  const skillIds = Object.values(unit.skills).filter((id): id is string => !!id);
  return (
    <div class="stack">
      <div class="row">
        <UnitAvatar unit={unit} size="lg" />
        <div class="grow stack" style={{ gap: 4 }}>
          <h3>{displayName(unit)}</h3>
          <div class="muted small">
            {speciesEmoji(unit.species)} {breedDef(unit.breedId).name}, {unitClassName(unit)}
          </div>
          <div class="row wrap">
            <RarityStars rarity={unit.rarity} />
            <span class="muted small">Ур. {unit.level}</span>
          </div>
          <div class="row wrap">
            <MoveBadge moveType={cls.moveType} />
            <WeaponBadge kind={cls.weaponKind} />
          </div>
        </div>
      </div>
      <StatsGrid stats={stats} asset={unit.asset} flaw={unit.flaw} />
      {!compact && (
        <div class="muted small">
          Рост: {STATS.map((s) => `${STAT_LABELS[s]} ${unit.growths[s]}%`).join(' · ')}
          {unit.asset && unit.flaw ? ` · Талант ${STAT_LABELS[unit.asset]}, изъян ${STAT_LABELS[unit.flaw]}` : ''}
        </div>
      )}
      {trait && (
        <div class="card" style={{ padding: 10 }}>
          <b>Особенность: {trait.name}</b>
          <div class="muted small">{trait.desc}</div>
        </div>
      )}
      <div class="stack" style={{ gap: 6 }}>
        <b class="small muted">Навыки</b>
        {skillIds.map((id) => {
          const info = skillInfo(id);
          if (!info) return null;
          return (
            <div key={id} class="skill-item">
              <div class="txt">
                <div>{info.name}</div>
                <div class="desc">{info.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && <p class="muted small">«{personalityText(unit.personalityId)}»</p>}
    </div>
  );
}
