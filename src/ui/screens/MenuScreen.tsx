import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $save, beginRosterCreation, surrenderFromMenu } from '@state/save';
import { navigate } from '@state/router';
import { learnableNow, skillCost } from '@core/units';
import { Button } from '../components/Button';
import { ResourceBar } from '../components/ResourceBar';
import { ConfirmModal } from '../components/Sheet';
import { UnitAvatar } from '../components/UnitAvatar';
import { haptic } from '@platform/haptics';

export function MenuScreen() {
  const save = useStore($save);
  const army = save.army;
  const battle = save.battle;
  const hasBattle = !!battle && !battle.result;
  const [surrender, setSurrender] = useState(false);

  const pendingSkills = army ? army.units.filter((u) => learnableNow(u).some((id) => skillCost(id) <= u.sp)).length : 0;

  const onFight = () => {
    haptic('light');
    if (hasBattle) return navigate('/battle');
    if (!army) {
      beginRosterCreation('battle');
      return navigate('/army/create');
    }
    navigate('/battle/setup');
  };
  const onArmy = () => {
    haptic('light');
    if (!army) {
      beginRosterCreation('army');
      return navigate('/army/create');
    }
    navigate('/army');
  };
  const doSurrender = () => {
    setSurrender(false);
    surrenderFromMenu();
    navigate('/battle/result');
  };

  return (
    <div class="screen menu">
      <div class="row between">
        <ResourceBar />
        <span class="muted small">{army ? `Армия: ${army.units.length} бойцов` : 'Армии нет'}</span>
      </div>
      <div class="menu-hero">
        <div class="emoji">🐱🩸🐶</div>
        <h1>Пушистая Резня</h1>
        <p class="muted">Тактика про котиков и собачек</p>
        {army && army.units.length > 0 && (
          <div class="pool">
            {army.units.slice(0, 3).map((u) => (
              <span key={u.id}>
                <UnitAvatar unit={u} size="md" />
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="menu-actions">
        {hasBattle ? (
          <>
            <Button big primary block onClick={onFight}>
              Продолжить бой
            </Button>
            <Button ghost sm block onClick={() => setSurrender(true)}>
              Сдаться
            </Button>
          </>
        ) : (
          <Button big primary block onClick={onFight}>
            В бой
          </Button>
        )}
        <div class="relative">
          <Button big block onClick={onArmy}>
            Моя армия
          </Button>
          {pendingSkills > 0 && <span class="badge-count" title="Есть что изучить">{pendingSkills}</span>}
        </div>
        <div class="menu-secondary">
          <Button ghost onClick={() => navigate('/memorial')}>
            🪦 Кладбище{save.memorial.length ? ` (${save.memorial.length})` : ''}
          </Button>
          <Button ghost onClick={() => navigate('/settings')}>
            ⚙️ Настройки
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
