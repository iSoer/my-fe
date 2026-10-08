import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitInstance } from '@core/types';
import { SQUAD_SIZE } from '@core/types';
import { displayName, unitClass, unitClassName, visibleStats } from '@core/units';
import { skillInfo } from '@content/index';
import { traitDef } from '@content/traits';
import { $rosterUnits, $save, beginRosterCreation, confirmRoster, currentRerollCost, rerollRoster } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { RarityStars, WeaponBadge } from '../components/Badges';
import { BottomSheet } from '../components/Sheet';
import { UnitDetails } from '../components/UnitDetails';
import { useToast } from '../components/Toast';
import { MOVE_EMOJI } from '../lib/format';
import { stagger, useReplay } from '../lib/animate';
import { haptic } from '@platform/haptics';

function RosterCard({ unit, selected, onClick, index }: { unit: UnitInstance; selected: boolean; onClick: () => void; index: number }) {
  const cls = unitClass(unit);
  const st = visibleStats(unit);
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined;
  return (
    <div class={`card clickable stack roster-card pop-in ${selected ? 'selected' : ''}`} style={stagger(index, 50)} onClick={onClick}>
      {selected && <span class="check">✓</span>}
      <div class="row">
        <UnitAvatar unit={unit} size="md" pose={selected ? 'happy' : 'idle'} />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="name">{displayName(unit)}</div>
          <RarityStars rarity={unit.rarity} />
          <div class="muted small">
            {MOVE_EMOJI[cls.moveType]} {unitClassName(unit)}
          </div>
        </div>
      </div>
      <WeaponBadge kind={cls.weaponKind} />
      <div class="stats-mini">
        <span>
          <b>{st.hp}</b>HP
        </span>
        <span>
          <b>{st.atk}</b>Atk
        </span>
        <span>
          <b>{st.spd}</b>Spd
        </span>
        <span>
          <b>{st.def}</b>Def
        </span>
        <span>
          <b>{st.res}</b>Res
        </span>
      </div>
      {trait && <div class="trait">★ {trait.name}</div>}
      <div class="skills">
        {Object.values(unit.skills)
          .filter((id): id is string => !!id)
          .map((id) => skillInfo(id)?.name)
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  );
}

export function ArmyCreateScreen() {
  const save = useStore($save);
  const roster = useStore($rosterUnits);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<UnitInstance | null>(null);
  const [toastEl, toast] = useToast();
  const [counterKey, replayCounter] = useReplay();
  const [spinKey, setSpinKey] = useState(0);
  const pr = save.pendingRoster;

  useEffect(() => {
    if (!pr) {
      if (save.army) navigate('/army', true);
      else beginRosterCreation('army');
    }
  }, [pr, save.army]);

  if (!pr) return <div class="screen" />;

  const cost = currentRerollCost(save);
  const canReroll = save.profile.glory >= cost;
  const full = selected.length === SQUAD_SIZE;

  const toggle = (id: string) => {
    haptic('select');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= SQUAD_SIZE ? s : [...s, id]));
    replayCounter();
  };

  const onReroll = () => {
    const r = rerollRoster();
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    setSelected([]);
    setSpinKey((k) => k + 1);
    haptic('medium');
  };

  const onConfirm = () => {
    const r = confirmRoster(selected);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    navigate(r.returnTo === 'battle' ? '/battle/setup' : '/army', true);
  };

  return (
    <div class="screen">
      <TopBar title="Соберите отряд" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <div class="row between">
          <p class="muted small">
            Выберите {SQUAD_SIZE} из {roster.length}. Остальные уйдут в закат.
          </p>
          <span key={counterKey} class={`pick-counter pulse-once ${full ? 'full' : ''}`}>
            {full ? '✓' : '🐾'} {selected.length}/{SQUAD_SIZE}
          </span>
        </div>
        <div class="grid-2" key={pr.rerolls}>
          {roster.map((u, i) => (
            <RosterCard key={u.id} unit={u} index={i} selected={selected.includes(u.id)} onClick={() => setDetails(u)} />
          ))}
        </div>
        <div class="row sticky-actions">
          <Button block icon="🔀" class={spinKey ? 'spin' : ''} key={spinKey} onClick={onReroll} disabled={!canReroll} title={canReroll ? '' : 'Недостаточно Славы'}>
            Перемешать {cost === 0 ? '(бесплатно)' : `✦${cost}`}
          </Button>
          <Button block primary glow={full} big={full} onClick={onConfirm} disabled={!full}>
            Подтвердить
          </Button>
        </div>
      </div>
      <BottomSheet open={!!details} onClose={() => setDetails(null)}>
        {details && (
          <>
            <UnitDetails unit={details} />
            <Button
              block
              primary={!selected.includes(details.id)}
              danger={selected.includes(details.id)}
              disabled={!selected.includes(details.id) && selected.length >= SQUAD_SIZE}
              onClick={() => {
                toggle(details.id);
                setDetails(null);
              }}
            >
              {selected.includes(details.id) ? 'Убрать' : selected.length >= SQUAD_SIZE ? 'Отряд полон' : 'Взять'}
            </Button>
          </>
        )}
      </BottomSheet>
      {toastEl}
    </div>
  );
}
