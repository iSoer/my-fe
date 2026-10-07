import { useStore } from '@nanostores/preact';
import { displayName, unitClassName } from '@core/units';
import { biomeDef } from '@content/biomes';
import { $memorial } from '@state/save';
import { navigate } from '@state/router';
import { TopBar } from '../components/TopBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { fmtDate, g } from '../lib/format';

export function MemorialScreen() {
  const memorial = useStore($memorial);
  const list = [...memorial].reverse();
  return (
    <div class="screen">
      <TopBar title="Кладбище" onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <p class="muted small">Всего павших: {memorial.length}. Они были хорошими мальчиками и девочками.</p>
        {list.length === 0 && (
          <div class="empty">
            <div class="big">🪦</div>
            <p>Пока пусто. Это ненадолго.</p>
          </div>
        )}
        {list.map((m) => (
          <div key={m.id} class="card grave">
            <UnitAvatar unit={m.unit} size="md" dead />
            <div class="grow">
              <b>{displayName(m.unit)}</b>
              <div class="muted small">
                {unitClassName(m.unit)}, ур. {m.unit.level} · {fmtDate(m.unit.createdAt)} — {fmtDate(m.diedAt)}
              </div>
              <div class="muted small">
                {m.reason === 'released'
                  ? g(m.unit.gender, 'Ушёл сам', 'Ушла сама')
                  : `${g(m.unit.gender, 'Пал', 'Пала')}${m.biomeId ? ` (${biomeDef(m.biomeId).name})` : ''}${m.killerName ? ` от лап ${m.killerName}` : ''}${m.battleTurn ? `, ход ${m.battleTurn}` : ''}`}
                {' · '}боёв: {m.unit.history.battles}, убийств: {m.unit.history.kills}
              </div>
              <div class="epitaph">«{m.epitaph}»</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
