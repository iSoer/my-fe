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
import { haptic } from '@platform/haptics';

function RosterCard({ unit, selected, onClick }: { unit: UnitInstance; selected: boolean; onClick: () => void }) {
  const cls = unitClass(unit);
  const st = visibleStats(unit);
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined;
  return (
    <div class={`card clickable stack ${selected ? 'selected' : ''}`} style={{ gap: 6 }} onClick={onClick}>
      <div class="row">
        <UnitAvatar unit={unit} size="md" />
        <div class="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(unit)}</div>
          <RarityStars rarity={unit.rarity} />
        </div>
        {selected && <span class="chip squad">✓</span>}
      </div>
      <div class="muted small">
        {MOVE_EMOJI[cls.moveType]} {unitClassName(unit)}
      </div>
      <WeaponBadge kind={cls.weaponKind} />
      <div class="mini-stats" style={{ flexWrap: 'wrap' }}>
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
      {trait && <div class="small">★ {trait.name}</div>}
      <div class="muted small">
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

  const toggle = (id: string) => {
    haptic('select');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= SQUAD_SIZE ? s : [...s, id]));
  };

  const onReroll = () => {
    const r = rerollRoster();
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    setSelected([]);
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
        <p class="muted">
          Выберите {SQUAD_SIZE} из {roster.length}. Остальные уйдут в закат. Выбрано: <b>{selected.length}/{SQUAD_SIZE}</b>
        </p>
        <div class="grid-2">
          {roster.map((u) => (
            <RosterCard key={u.id} unit={u} selected={selected.includes(u.id)} onClick={() => setDetails(u)} />
          ))}
        </div>
        <div class="row">
          <Button block onClick={onReroll} disabled={!canReroll} title={canReroll ? '' : 'Недостаточно Славы'}>
            🔀 Перемешать {cost === 0 ? '(бесплатно)' : `✦${cost}`}
          </Button>
          <Button block primary onClick={onConfirm} disabled={selected.length !== SQUAD_SIZE}>
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
