import type { Stat, Stats } from '@core/types';
import { STATS } from '@core/types';
import { STAT_LABELS } from '../lib/format';

export function StatsGrid({ stats, asset, flaw, delta }: { stats: Stats; asset?: Stat; flaw?: Stat; delta?: Partial<Stats> }) {
  return (
    <div class="grid-stats">
      {STATS.map((s) => (
        <div key={s} class={`stat ${asset === s ? 'asset' : ''} ${flaw === s ? 'flaw' : ''}`}>
          <div class="label">{STAT_LABELS[s]}</div>
          <div class="value">{stats[s]}</div>
          {delta && delta[s] ? <div class={`delta ${(delta[s] ?? 0) > 0 ? 'ok' : 'danger'}`}>{(delta[s] ?? 0) > 0 ? `+${delta[s]}` : delta[s]}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function StatBar({ value, max, kind = 'hp' }: { value: number; max: number; kind?: 'hp' | 'xp' }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const cls = kind === 'hp' ? (pct <= 25 ? 'crit' : pct <= 50 ? 'low' : '') : '';
  return (
    <div class={`bar ${kind} ${cls}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
