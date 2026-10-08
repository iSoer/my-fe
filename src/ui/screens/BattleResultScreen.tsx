import { useEffect, useMemo } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { BARRACKS_CAP, STATS } from '@core/types';
import type { Stats } from '@core/types';
import { displayName, unitClassName } from '@core/units';
import { biomeDef } from '@content/biomes';
import { $save, beginRosterCreation, recruitAction } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { UnitAvatar } from '../components/UnitAvatar';
import { StatBar } from '../components/Stats';
import { useToast } from '../components/Toast';
import { STAT_LABELS, difficultyName, g, plural } from '../lib/format';
import { stagger, useCountUp } from '../lib/animate';
import { haptic } from '@platform/haptics';

const CONFETTI_COLORS = ['#ffd166', '#ff6f9c', '#7ad3c2', '#b79cff', '#8fc9ff', '#ffffff'];
const SPLAT_SVG = `<svg viewBox="0 0 260 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#9e1420">
    <ellipse cx="130" cy="72" rx="96" ry="38" /><ellipse cx="80" cy="60" rx="40" ry="26" /><ellipse cx="185" cy="58" rx="36" ry="24" />
    <circle cx="36" cy="40" r="9" /><circle cx="226" cy="36" r="7" /><circle cx="120" cy="22" r="6" /><circle cx="160" cy="118" r="8" /><circle cx="60" cy="112" r="5" />
  </g>
</svg>`;

function Counter({ value, prefix = '+' }: { value: number; prefix?: string }) {
  const shown = useCountUp(value, 900, { fromZero: true });
  return (
    <span>
      {prefix}
      {shown}
    </span>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        delay: `${(i % 9) * 0.27}s`,
        dur: `${2.2 + (i % 5) * 0.35}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#fff',
        rot: `${(i * 53) % 360}deg`,
      })),
    [],
  );
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, background: p.color, transform: `rotate(${p.rot})` }} />
      ))}
    </div>
  );
}

function GainChips({ gains, baseDelay }: { gains: Partial<Stats>; baseDelay: number }) {
  const items = STATS.filter((s) => gains[s]);
  return (
    <span class="gain-chips">
      {items.map((s, i) => (
        <span key={s} class="gain-chip" style={{ animationDelay: `${baseDelay + i * 80}ms` }}>
          {STAT_LABELS[s]} +{gains[s]}
        </span>
      ))}
    </span>
  );
}

export function BattleResultScreen() {
  const save = useStore($save);
  const lb = save.lastBattle;
  const [toastEl, toast] = useToast();

  useEffect(() => {
    if (!lb) navigate('/', true);
  }, [lb]);
  useEffect(() => {
    if (!lb) return;
    haptic(lb.result === 'victory' ? 'success' : lb.result === 'defeat' ? 'error' : 'warning');
  }, [lb?.result]);
  if (!lb) return <div class="screen" />;

  const title = lb.result === 'victory' ? 'ПОБЕДА' : lb.result === 'defeat' ? 'ПОРАЖЕНИЕ' : 'ОТСТУПЛЕНИЕ';
  const army = save.army;
  const captiveAvailable = !!lb.captive && !!save.shelter.captive && save.shelter.captive.id === lb.captive.id && !!army && army.units.length < BARRACKS_CAP;
  const mvp = lb.mvpId ? lb.survivors.find((u) => u.id === lb.mvpId) : undefined;
  let delay = 300;
  const next = (step = 90): number => (delay += step);

  const acceptCaptive = () => {
    const r = recruitAction('captive');
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    toast('Пленник принят в казарму');
  };

  return (
    <div class="screen result-screen">
      <div class="screen-body">
        {lb.result === 'victory' && <Confetti />}
        <div class={`result-banner ${lb.result}`}>
          {lb.result === 'defeat' && <span class="splat-bg" dangerouslySetInnerHTML={{ __html: SPLAT_SVG }} />}
          <h1>
            <span class="stamp">{title}</span>
          </h1>
          <div class="muted small sub">
            {difficultyName(lb.difficulty)} · {biomeDef(lb.biomeId).name} · {lb.turns} {plural(lb.turns, 'ход', 'хода', 'ходов')}
          </div>
        </div>

        {lb.fallen.length > 0 && (
          <div class="stack">
            <div class="section-title danger">☠ Павшие</div>
            {lb.fallen.map((f, i) => (
              <div key={f.id} class="card fallen-card grave" style={stagger(i, 160)}>
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
          <div class="card warning-box stack pop-in" style={{ animationDelay: `${next()}ms` }}>
            <div>АРМИЯ ПАЛА</div>
            <div class="small" style={{ fontWeight: 400 }}>
              Никого не осталось. Слава начислена, ростер новой армии будет лучше.
            </div>
            <Button
              primary
              block
              icon="🐾"
              onClick={() => {
                beginRosterCreation('army');
                navigate('/army/create', true);
              }}
            >
              Собрать новую армию
            </Button>
          </div>
        )}

        <div class="card stack pop-in" style={{ animationDelay: `${next()}ms` }}>
          <div class="section-title">Награды</div>
          <div class="reward-chips">
            <span class="reward-chip">
              <span class="ico">🦴</span>
              <Counter value={lb.rewards.treats} />
            </span>
            <span class="reward-chip gold">
              <span class="ico">✦</span>
              <Counter value={lb.rewards.glory} />
            </span>
            {lb.rewards.flawless && <span class="chip squad pop">Без потерь +25%</span>}
          </div>
          <div class="row wrap small muted">
            <span>
              Убийств: <b>{lb.kills}</b>
            </span>
            <span>
              Урона: <b>{lb.damage}</b>
            </span>
            {mvp && <span class="chip gold pop">🏆 MVP: {mvp.name}</span>}
          </div>
        </div>

        {lb.survivors.length > 0 && (
          <div class="card stack pop-in" style={{ animationDelay: `${next()}ms` }}>
            <div class="section-title">Опыт</div>
            {lb.survivors.map((u, i) => {
              const lvl = lb.levelUps.find((l) => l.unitId === u.id);
              const xp = lb.xp[u.id] ?? 0;
              const rowDelay = delay + 120 + i * 110;
              return (
                <div key={u.id} class="xp-row pop-in" style={{ animationDelay: `${rowDelay}ms` }}>
                  <UnitAvatar unit={u} size="sm" pose={lvl ? 'happy' : 'idle'} />
                  <div class="info">
                    <div class="name">
                      <span>{displayName(u)}</span>
                      {mvp?.id === u.id && <span class="chip gold">🏆</span>}
                      {lvl && (
                        <span class="lvl-arrow" style={{ animationDelay: `${rowDelay + 300}ms` }}>
                          Ур. {lvl.from} → {lvl.to}
                        </span>
                      )}
                    </div>
                    <div class="xp-line">
                      <StatBar value={Math.min(100, u.xp)} max={100} kind="xp" animate delay={rowDelay + 150} />
                      <span>
                        <Counter value={xp} /> XP
                      </span>
                    </div>
                    {lvl && <GainChips gains={lvl.gains} baseDelay={rowDelay + 350} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lb.captive && (
          <div class="card stack pop-in" style={{ animationDelay: `${next()}ms` }}>
            <div class="section-title">⛓️ Пленник хочет к вам</div>
            <div class="unit-row">
              <UnitAvatar unit={lb.captive} size="md" friendly pose="happy" />
              <div class="info">
                <div class="name">{displayName(lb.captive)}</div>
                <div class="sub">
                  {unitClassName(lb.captive)}, ур. {lb.captive.level}
                </div>
              </div>
            </div>
            {captiveAvailable ? (
              <Button primary block icon="🤝" onClick={acceptCaptive}>
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
              <Button primary big block icon="⚔️" class="pop-in" style={{ animationDelay: `${next(120)}ms` }} onClick={() => navigate('/battle/setup', true)}>
                Ещё бой
              </Button>
              <Button block icon="🏠" class="pop-in" style={{ animationDelay: `${next()}ms` }} onClick={() => navigate('/army', true)}>
                В казарму
              </Button>
            </>
          )}
          <Button ghost block class="pop-in" style={{ animationDelay: `${next()}ms` }} onClick={() => navigate('/', true)}>
            В меню
          </Button>
        </div>
      </div>
      {toastEl}
    </div>
  );
}
