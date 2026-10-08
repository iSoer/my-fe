import { useEffect, useState } from 'preact/hooks';
import type { BattleState, UnitInstance } from '@core/types';
import type { CombatOutcome, CombatSideResult } from '@core/combat';
import { unitClass } from '@core/units';
import { specialDef } from '@content/skills/specials';
import { KIND_COLOR } from '@content/weapons';
import { UnitAvatar } from '../components/UnitAvatar';
import { COLOR_CSS } from '../lib/format';

/** Полоска HP, которая за кадр проезжает от «до» к «после». */
function HpBar({ before, after, max }: { before: number; after: number; max: number }) {
  const pctBefore = max > 0 ? Math.max(0, Math.min(100, (before / max) * 100)) : 0;
  const pctAfter = max > 0 ? Math.max(0, Math.min(100, (after / max) * 100)) : 0;
  const [w, setW] = useState(pctBefore);
  useEffect(() => {
    setW(pctBefore);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(pctAfter)));
    return () => cancelAnimationFrame(id);
  }, [before, after, max]);
  const cls = pctAfter <= 25 ? 'crit' : pctAfter <= 50 ? 'low' : '';
  return (
    <div class={`bf-bar bf-bar-fc ${cls}`}>
      <div class="bf-bar-lost" style={{ width: `${pctBefore}%` }} />
      <div style={{ width: `${w}%` }} />
    </div>
  );
}

function Side({ unit, res, max, hits, effective, enemy, dies, canCounter }: { unit: UnitInstance; res: CombatSideResult; max: number; hits: number; effective: boolean; enemy: boolean; dies: boolean; canCounter: boolean }) {
  const kind = unitClass(unit).weaponKind;
  return (
    <div class={`bf-fc-side ${enemy ? 'enemy' : 'player'} ${dies ? 'dies' : ''} ${res.hpAfter < res.hpBefore ? 'loss' : ''}`}>
      <div class="bf-fc-top">
        <UnitAvatar unit={unit} size="sm" animated={false} />
        <div class="bf-fc-names">
          <b>{unit.name}</b>
          <i class="bf-fc-weapon" style={{ background: COLOR_CSS[KIND_COLOR[kind]] }} />
        </div>
      </div>
      <div class="bf-fc-hp">
        <span class="before">{res.hpBefore}</span>
        <span class="arrow">→</span>
        <span class={`after ${dies ? 'dead' : ''}`}>{Math.max(0, res.hpAfter)}</span>
      </div>
      <HpBar before={res.hpBefore} after={Math.max(0, res.hpAfter)} max={max} />
      <div class="bf-fc-dmg">{hits > 0 ? <>{res.damagePerHit} <small>× {hits}</small></> : <small class="bf-muted">{canCounter ? '—' : 'не контратакует'}</small>}</div>
      <div class="bf-fc-tags">
        {res.specialTriggered && res.specialId && <span class="bf-tag gold">✦ {specialDef(res.specialId).name}</span>}
        {effective && hits > 0 && <span class="bf-tag red">×1.5</span>}
        {dies && !enemy && <span class="bf-tag death">☠ ПОГИБНЕТ</span>}
        {dies && enemy && <span class="bf-tag kill">☠ погибнет</span>}
      </div>
    </div>
  );
}

/** Прогноз боя в стиле FEH: две колонки, игрок слева. */
export function ForecastCard({ state, forecast }: { state: BattleState; forecast: CombatOutcome }) {
  const f = forecast;
  const a = state.roster[f.attacker.unitId];
  const d = state.roster[f.defender.unitId];
  const aBu = state.units[f.attacker.unitId];
  const dBu = state.units[f.defender.unitId];
  if (!a || !d || !aBu || !dBu) return null;
  const playerIsAttacker = aBu.side === 'player';
  const left = playerIsAttacker ? { unit: a, res: f.attacker, bu: aBu, eff: f.attackerEffective, can: true } : { unit: d, res: f.defender, bu: dBu, eff: f.defenderEffective, can: f.defenderCanCounter };
  const right = playerIsAttacker ? { unit: d, res: f.defender, bu: dBu, eff: f.defenderEffective, can: f.defenderCanCounter } : { unit: a, res: f.attacker, bu: aBu, eff: f.attackerEffective, can: true };
  const tri = f.triangle;
  const triLeft = playerIsAttacker ? tri : tri === 'adv' ? 'dis' : tri === 'dis' ? 'adv' : 'neutral';
  return (
    <div class="bf-card bf-forecast" role="status" aria-label="Прогноз боя">
      <Side unit={left.unit} res={left.res} max={left.bu.maxHp} hits={left.res.hits} effective={left.eff} enemy={false} dies={left.res.hpAfter <= 0} canCounter={left.can} />
      <div class="bf-fc-mid">
        <span class={`bf-tri ${triLeft}`}>{triLeft === 'adv' ? '▲' : triLeft === 'dis' ? '▼' : '•'}</span>
        <span class="bf-fc-vs">VS</span>
        {(playerIsAttacker ? f.attackerFollowUp : f.defenderFollowUp) && <span class="bf-tag tiny">×2</span>}
      </div>
      <Side unit={right.unit} res={right.res} max={right.bu.maxHp} hits={right.res.hits} effective={right.eff} enemy dies={right.res.hpAfter <= 0} canCounter={right.can} />
    </div>
  );
}
