import { useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { BARRACKS_CAP } from '@core/types';
import { displayName, unitClassName } from '@core/units';
import { biomeDef } from '@content/biomes';
import { $save, beginRosterCreation, recruitAction } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { UnitAvatar } from '../components/UnitAvatar';
import { useToast } from '../components/Toast';
import { difficultyName, fmtGains, g } from '../lib/format';
import { haptic } from '@platform/haptics';

export function BattleResultScreen() {
  const save = useStore($save);
  const lb = save.lastBattle;
  const [toastEl, toast] = useToast();

  useEffect(() => {
    if (!lb) navigate('/', true);
  }, [lb]);
  if (!lb) return <div class="screen" />;

  const title = lb.result === 'victory' ? 'ПОБЕДА' : lb.result === 'defeat' ? 'ПОРАЖЕНИЕ' : 'ОТСТУПЛЕНИЕ';
  const army = save.army;
  const captiveAvailable = !!lb.captive && !!save.shelter.captive && save.shelter.captive.id === lb.captive.id && !!army && army.units.length < BARRACKS_CAP;
  const mvp = lb.mvpId ? lb.survivors.find((u) => u.id === lb.mvpId) : undefined;

  const acceptCaptive = () => {
    const r = recruitAction('captive');
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    toast('Пленник принят в казарму');
  };

  return (
    <div class="screen">
      <div class="screen-body">
        <div class={`result-banner ${lb.result}`}>
          <h1>{title}</h1>
          <div class="muted small">
            {difficultyName(lb.difficulty)} · {biomeDef(lb.biomeId).name} · {lb.turns} {lb.turns === 1 ? 'ход' : lb.turns < 5 ? 'хода' : 'ходов'}
          </div>
        </div>

        {lb.fallen.length > 0 && (
          <div class="stack">
            <h3 class="danger">☠ Павшие</h3>
            {lb.fallen.map((f) => (
              <div key={f.id} class="card fallen-card grave">
                <UnitAvatar unit={f.unit} size="md" dead />
                <div class="grow">
                  <b>{displayName(f.unit)}</b>
                  <div class="muted small">
                    {unitClassName(f.unit)}, ур. {f.unit.level}
                    {f.killerName ? ` · ${g(f.unit.gender, 'убит', 'убита')}: ${f.killerName}` : ''}
                    {f.battleTurn ? ` · ход ${f.battleTurn}` : ''}
                  </div>
                  <div class="epitaph">«{f.epitaph}»</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {lb.armyFell && (
          <div class="card warning-box stack">
            <div>АРМИЯ ПАЛА</div>
            <div class="small" style={{ fontWeight: 400 }}>
              Никого не осталось. Слава начислена, ростер новой армии будет лучше.
            </div>
            <Button
              primary
              block
              onClick={() => {
                beginRosterCreation('army');
                navigate('/army/create', true);
              }}
            >
              Собрать новую армию
            </Button>
          </div>
        )}

        <div class="card stack">
          <h3>Награды</h3>
          <div class="row wrap">
            <span class="chip">🦴 +{lb.rewards.treats}</span>
            <span class="chip">✦ +{lb.rewards.glory}</span>
            {lb.rewards.flawless && <span class="chip squad">Без потерь +25%</span>}
          </div>
          <div class="muted small">
            Убийств: {lb.kills} · Урона: {lb.damage}
            {mvp ? ` · MVP: ${mvp.name}` : ''}
          </div>
        </div>

        {lb.survivors.length > 0 && (
          <div class="card stack">
            <h3>Опыт</h3>
            {lb.survivors.map((u) => {
              const lvl = lb.levelUps.find((l) => l.unitId === u.id);
              return (
                <div key={u.id} class="unit-row">
                  <UnitAvatar unit={u} size="sm" />
                  <div class="info">
                    <div class="name">{displayName(u)}</div>
                    <div class="sub">
                      <span>+{lb.xp[u.id] ?? 0} XP</span>
                      {lvl && (
                        <span class="lvlup">
                          <span class="arrow">
                            Ур. {lvl.from} → {lvl.to}
                          </span>
                          <span class="muted">{fmtGains(lvl.gains)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lb.captive && (
          <div class="card stack">
            <h3>Пленник хочет к вам</h3>
            <div class="unit-row">
              <UnitAvatar unit={lb.captive} size="md" />
              <div class="info">
                <div class="name">{displayName(lb.captive)}</div>
                <div class="sub">
                  {unitClassName(lb.captive)}, ур. {lb.captive.level}
                </div>
              </div>
            </div>
            {captiveAvailable ? (
              <Button primary block onClick={acceptCaptive}>
                Принять в казарму
              </Button>
            ) : (
              <div class="muted small">{army && army.units.length >= BARRACKS_CAP ? 'Казарма полна — пленник ждёт в Приюте.' : 'Пленник ждёт в Приюте.'}</div>
            )}
          </div>
        )}

        <div class="stack">
          {!lb.armyFell && (
            <>
              <Button primary big block onClick={() => navigate('/battle/setup', true)}>
                Ещё бой
              </Button>
              <Button block onClick={() => navigate('/army', true)}>
                В казарму
              </Button>
            </>
          )}
          <Button ghost block onClick={() => navigate('/', true)}>
            В меню
          </Button>
        </div>
      </div>
      {toastEl}
    </div>
  );
}
