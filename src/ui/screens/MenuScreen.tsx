import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $save, beginRosterCreation, surrenderFromMenu } from '@state/save';
import { navigate } from '@state/router';
import { generateUnit, learnableNow, skillCost } from '@core/units';
import { backdropSvg } from '@art/index';
import type { UnitInstance } from '@core/types';
import { Button } from '../components/Button';
import { ResourceBar } from '../components/ResourceBar';
import { ConfirmModal } from '../components/Sheet';
import { UnitAvatar } from '../components/UnitAvatar';
import { haptic } from '@platform/haptics';
import { plural } from '../lib/format';

// Для широкой диорамы показываем середину сцены (забор и небо), а не только газон.
const YARD_BG = backdropSvg('yard', 'plain', 'left').replace('preserveAspectRatio="xMidYMax slice"', 'preserveAspectRatio="xMidYMid slice"');
/** Демо-тройка для меню без армии: кот, пёс и мышь. */
const DEMO_CREW: UnitInstance[] = [
  generateUnit({ seed: 1, level: 1, species: 'cat', classId: 'infantry_claw' }),
  generateUnit({ seed: 2, level: 1, species: 'dog', classId: 'infantry_stick' }),
  generateUnit({ seed: 3, level: 1, species: 'mouse', classId: 'infantry_slingshot' }),
];
const BLOOD_SVG = `<svg viewBox="0 0 390 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#c81e2e" opacity=".85">
    <ellipse cx="70" cy="178" rx="26" ry="7" /><circle cx="52" cy="172" r="4" /><circle cx="94" cy="174" r="3" />
    <ellipse cx="318" cy="186" rx="34" ry="8" /><circle cx="300" cy="178" r="3.5" /><circle cx="346" cy="180" r="2.6" /><circle cx="330" cy="172" r="2" />
    <ellipse cx="200" cy="192" rx="18" ry="5" />
  </g>
</svg>`;
const CLOUD_SVG = `<svg viewBox="0 0 110 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="#ffffff"><ellipse cx="34" cy="30" rx="30" ry="13" /><ellipse cx="60" cy="22" rx="24" ry="16" /><ellipse cx="84" cy="30" rx="22" ry="12" /></g>
</svg>`;
/** Капли крови под заголовком. */
const DRIP_SVG = `<svg viewBox="0 0 180 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 3 Q90 -2 176 3" fill="none" stroke="#e63946" stroke-width="3" stroke-linecap="round" />
  <path d="M40 3 q0 7 3 9 q3 -2 3 -9 z M98 3 q0 11 3 13 q3 -2 3 -13 z M140 3 q0 6 2.5 8 q2.5 -2 2.5 -8 z" fill="#e63946" />
  <circle cx="101" cy="16.5" r="1.6" fill="#e63946" />
</svg>`;

function Diorama({ crew }: { crew: UnitInstance[] }) {
  return (
    <div class="diorama" aria-hidden="true">
      <div class="bg" dangerouslySetInnerHTML={{ __html: YARD_BG }} />
      <div class="cloud" dangerouslySetInnerHTML={{ __html: CLOUD_SVG }} />
      <div class="cloud c2" dangerouslySetInnerHTML={{ __html: CLOUD_SVG }} />
      <div class="blood" dangerouslySetInnerHTML={{ __html: BLOOD_SVG }} />
      <div class="crew">
        {crew.map((u, i) => (
          <span key={u.id}>
            <UnitAvatar unit={u} size="lg" pose={i === 1 ? 'happy' : 'idle'} friendly />
          </span>
        ))}
      </div>
    </div>
  );
}

export function MenuScreen() {
  const save = useStore($save);
  const army = save.army;
  const battle = save.battle;
  const hasBattle = !!battle && !battle.result;
  const [surrender, setSurrender] = useState(false);

  const pendingSkills = army ? army.units.filter((u) => learnableNow(u).some((id) => skillCost(id) <= u.sp)).length : 0;
  // В диораме — сначала отряд, потом остальные бойцы; без армии — демо-тройка.
  const crew: UnitInstance[] = army && army.units.length > 0 ? army.units.slice(0, 3) : DEMO_CREW;

  const onFight = () => {
    if (hasBattle) return navigate('/battle');
    if (!army) {
      beginRosterCreation('battle');
      return navigate('/army/create');
    }
    navigate('/battle/setup');
  };
  const onArmy = () => {
    if (!army) {
      beginRosterCreation('army');
      return navigate('/army/create');
    }
    navigate('/army');
  };
  const doSurrender = () => {
    setSurrender(false);
    haptic('warning');
    surrenderFromMenu();
    navigate('/battle/result');
  };

  const armyLabel = army ? `Армия: ${army.units.length} ${plural(army.units.length, 'боец', 'бойца', 'бойцов')}` : 'Армии нет';
  const fightSub = hasBattle
    ? `Ход ${battle?.turn ?? 1} · бой ждёт`
    : army
      ? `Отряд ${army.units.length}/4 готов`
      : 'Сначала соберём отряд';

  return (
    <div class="screen menu">
      <div class="row between">
        <ResourceBar />
        <span class="muted small">{armyLabel}</span>
      </div>
      <div class="menu-hero">
        <Diorama crew={crew} />
        <h1>Пушистая Резня</h1>
        <span class="title-drip" dangerouslySetInnerHTML={{ __html: DRIP_SVG }} />
        <p class="muted">Тактика про котиков, собачек и мышек</p>
      </div>
      <div class="menu-actions">
        {hasBattle ? (
          <>
            <Button big primary block glow icon="⚔️" onClick={onFight}>
              <span class="lbl">
                Продолжить бой
                <div class="sub">{fightSub}</div>
              </span>
            </Button>
            <Button ghost sm block onClick={() => setSurrender(true)}>
              🏳️ Сдаться
            </Button>
          </>
        ) : (
          <Button big primary block icon="⚔️" onClick={onFight}>
            <span class="lbl">
              В бой
              <div class="sub">{fightSub}</div>
            </span>
          </Button>
        )}
        <div class="relative">
          <Button big block icon="🐾" onClick={onArmy}>
            <span class="lbl">
              Моя армия
              <div class="sub">{army ? `${army.units.length}/4 бойцов` : 'Собрать из ростера'}</div>
            </span>
          </Button>
          {pendingSkills > 0 && (
            <span class="badge-count" title="Есть что изучить">
              {pendingSkills}
            </span>
          )}
        </div>
        <div class="menu-secondary">
          <Button ghost icon="🪦" onClick={() => navigate('/memorial')}>
            Кладбище{save.memorial.length ? ` (${save.memorial.length})` : ''}
          </Button>
          <Button ghost icon="⚙️" onClick={() => navigate('/settings')}>
            Настройки
          </Button>
        </div>
      </div>
      <ConfirmModal
        open={surrender}
        title="Сдаться?"
        text="Бой засчитается как отступление: наград не будет, погибшие останутся мёртвыми, выжившие вернутся домой."
        confirmLabel="Сдаться"
        danger
        onConfirm={doSurrender}
        onClose={() => setSurrender(false)}
      />
    </div>
  );
}
