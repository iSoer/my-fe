import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitInstance } from '@core/types';
import { BARRACKS_CAP } from '@core/types';
import { displayName, learnableNow, skillCost, unitClass, unitClassName, visibleStats } from '@core/units';
import { $save, beginRosterCreation, currentHireCost } from '@state/save';
import { navigate } from '@state/router';
import { haptic } from '@platform/haptics';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { RarityStars, WeaponBadge } from '../components/Badges';
import { HireSheet } from '../components/HireSheet';
import { useToast } from '../components/Toast';
import { MOVE_EMOJI } from '../lib/format';
import { stagger } from '../lib/animate';

/** Заполненный слот: краткая карточка бойца, тап — на экран бойца. */
function FilledSlot({ unit, index, justHired }: { unit: UnitInstance; index: number; justHired: boolean }) {
  const cls = unitClass(unit);
  const st = visibleStats(unit);
  const canLearn = learnableNow(unit).some((id) => skillCost(id) <= unit.sp);
  return (
    <div
      class={`card slot-card filled clickable ${justHired ? 'just-hired' : 'pop-in'}`}
      style={stagger(index, 60)}
      onClick={() => {
        haptic('select');
        navigate(`/army/${unit.id}`);
      }}
    >
      <div class="slot-head">
        <UnitAvatar unit={unit} size="md" />
        <div class="slot-meta">
          <div class="slot-name">{displayName(unit)}</div>
          <RarityStars rarity={unit.rarity} />
          <div class="muted small slot-class">
            {MOVE_EMOJI[cls.moveType]} {unitClassName(unit)} · Ур. {unit.level}
          </div>
        </div>
      </div>
      <div class="slot-foot">
        <WeaponBadge kind={cls.weaponKind} />
        {canLearn && <span class="chip red pop">Есть навык</span>}
      </div>
      <div class="mini-stats">
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
    </div>
  );
}

/** Пустой слот: цена найма, тап открывает выбор кандидатов. */
function EmptySlot({ index, cost, affordable, onClick }: { index: number; cost: number; affordable: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`slot-card empty ${affordable ? '' : 'poor'}`} style={stagger(index, 60)} onClick={onClick}>
      <span class="slot-plus" aria-hidden="true">
        +
      </span>
      <span class="slot-hire">Нанять бойца</span>
      <span class="chip gold slot-price">🦴 {cost}</span>
    </button>
  );
}

export function ArmyScreen() {
  const save = useStore($save);
  const [hiring, setHiring] = useState(false);
  const [justHired, setJustHired] = useState<string | null>(null);
  const [toastEl, toast] = useToast();
  const army = save.army;

  if (!army || army.units.length === 0) {
    return (
      <div class="screen">
        <TopBar title="Моя армия" right={<ResourceBar />} onBack={() => navigate('/', true)} />
        <div class="screen-body">
          <div class="empty">
            <div class="big">🪦</div>
            <h3>Казарма пуста</h3>
            <p>Все пали или никого ещё нет. Соберите новую армию из ростера.</p>
            <Button
              primary
              big
              icon="🐾"
              onClick={() => {
                beginRosterCreation('army');
                navigate('/army/create');
              }}
            >
              Создать армию
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cost = currentHireCost(save);
  const affordable = save.profile.treats >= cost;
  const slots = Array.from({ length: BARRACKS_CAP }, (_, i) => army.units[i] ?? null);

  const openHire = () => {
    haptic('select');
    if (!affordable && !save.shelter.captive) toast('Недостаточно Вкусняшек', true);
    setHiring(true);
  };

  return (
    <div class="screen">
      <TopBar title="Моя армия" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <div class="row between">
          <span class="muted small">
            Отряд: <b>{army.units.length}</b>/{BARRACKS_CAP}
          </span>
          <span class="muted small">
            Найм: <b>🦴 {cost}</b>
          </span>
        </div>
        <div class="slot-grid">
          {slots.map((u, i) =>
            u ? (
              <FilledSlot key={u.id} unit={u} index={i} justHired={justHired === u.id} />
            ) : (
              <EmptySlot key={`empty-${i}`} index={i} cost={cost} affordable={affordable} onClick={openHire} />
            ),
          )}
        </div>
        <p class="muted small hint-line">Цена найма растёт после каждого найма и сбрасывается после боя.</p>
        <Button block icon="⚔️" onClick={() => navigate('/battle/setup')} primary>
          К подготовке боя
        </Button>
      </div>
      <HireSheet
        open={hiring}
        onClose={() => setHiring(false)}
        toast={toast}
        onHired={(unit) => {
          setJustHired(unit.id);
          toast(`${displayName(unit)} в отряде!`);
          window.setTimeout(() => setJustHired((cur) => (cur === unit.id ? null : cur)), 900);
        }}
      />
      {toastEl}
    </div>
  );
}
