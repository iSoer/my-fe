import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitSkills } from '@core/types';
import { STATS } from '@core/types';
import { displayName, learnableNow, skillCost, slotOf, unitClass, unitClassName, visibleStats, weaponMt, levelGains } from '@core/units';
import { sharpenCost, trainCost } from '@core/progression';
import { skillInfo } from '@content/index';
import { traitDef } from '@content/traits';
import { breedDef } from '@content/breeds';
import { personalityText } from '@content/personalities';
import { basicWeaponId, weaponsForKind } from '@content/weapons';
import { $save, equipAction, learnSkillAction, releaseUnit, sharpenAction, toggleSquad, trainUnitAction } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { MoveBadge, RarityStars, WeaponBadge } from '../components/Badges';
import { StatBar, StatsGrid } from '../components/Stats';
import { BottomSheet, ConfirmModal } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { STAT_LABELS, fmtGains, speciesName } from '../lib/format';
import { useReplay } from '../lib/animate';
import { haptic } from '@platform/haptics';

const SLOT_NAMES: Record<keyof UnitSkills, string> = {
  weapon: 'Оружие',
  assist: 'Поддержка',
  special: 'Спецприём',
  a: 'Навык A',
  b: 'Навык B',
  c: 'Навык C',
};
const SLOT_ICONS: Record<keyof UnitSkills, string> = { weapon: '⚔️', assist: '🤝', special: '✨', a: 'A', b: 'B', c: 'C' };
const SLOTS: (keyof UnitSkills)[] = ['weapon', 'assist', 'special', 'a', 'b', 'c'];

export function UnitScreen({ unitId }: { unitId: string }) {
  const save = useStore($save);
  const [slot, setSlot] = useState<keyof UnitSkills | null>(null);
  const [release, setRelease] = useState<0 | 1 | 2>(0);
  const [toastEl, toast] = useToast();
  const [bounceKey, replayBounce] = useReplay();
  const [happy, setHappy] = useState(false);
  const army = save.army;
  const unit = army?.units.find((u) => u.id === unitId);

  useEffect(() => {
    if (!unit) navigate('/army', true);
  }, [unit]);
  useEffect(() => {
    if (!happy) return;
    const t = setTimeout(() => setHappy(false), 1400);
    return () => clearTimeout(t);
  }, [happy, bounceKey]);
  if (!unit || !army) return <div class="screen" />;

  const cls = unitClass(unit);
  const stats = visibleStats(unit);
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined;
  const inSquad = army.squadIds.includes(unit.id);
  const tCost = trainCost(unit.level);
  const sCost = sharpenCost(unit.weaponTier);
  const learnable = learnableNow(unit);

  const celebrate = (): void => {
    replayBounce();
    setHappy(true);
  };

  const onTrain = () => {
    const gains = levelGains(unit, unit.level, unit.level + 1);
    const r = trainUnitAction(unit.id);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    celebrate();
    toast(`Уровень ${unit.level + 1}! ${fmtGains(gains)}`);
  };
  const onSharpen = () => {
    const r = sharpenAction(unit.id);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('medium');
    celebrate();
    toast('Оружие заточено');
  };
  const onSquad = () => {
    const r = toggleSquad(unit.id);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('select');
    replayBounce();
  };
  const onRelease = () => {
    const r = releaseUnit(unit.id);
    setRelease(0);
    if (!r.ok) return;
    haptic('warning');
    navigate(r.armyFell ? '/' : '/army', true);
  };

  const slotOptions = (s: keyof UnitSkills): { id: string; state: 'equipped' | 'learned' | 'learnable' }[] => {
    const out: { id: string; state: 'equipped' | 'learned' | 'learnable' }[] = [];
    const equipped = unit.skills[s];
    if (s === 'weapon') {
      const ids = [basicWeaponId(cls.weaponKind), ...weaponsForKind(cls.weaponKind).map((w) => w.id)];
      for (const id of [...new Set(ids)]) {
        if (id === equipped) out.push({ id, state: 'equipped' });
        else if (unit.learned.includes(id) || id === basicWeaponId(cls.weaponKind)) out.push({ id, state: 'learned' });
        else if (learnable.includes(id)) out.push({ id, state: 'learnable' });
      }
      return out;
    }
    if (equipped) out.push({ id: equipped, state: 'equipped' });
    for (const id of unit.learned) if (id !== equipped && slotOf(id) === s) out.push({ id, state: 'learned' });
    for (const id of learnable) if (slotOf(id) === s) out.push({ id, state: 'learnable' });
    return out;
  };

  const onLearn = (id: string) => {
    const r = learnSkillAction(unit.id, id);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    celebrate();
    toast(`Изучено: ${skillInfo(id)?.name ?? id}`);
  };
  const onEquip = (s: keyof UnitSkills, id: string | undefined) => {
    const r = equipAction(unit.id, s, id);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('select');
    setSlot(null);
  };

  return (
    <div class="screen">
      <TopBar title={displayName(unit)} right={<ResourceBar />} onBack={() => navigate('/army', true)} />
      <div class="screen-body">
        <div class="card row pop-in">
          <span key={bounceKey} class={`avatar-wrap ${bounceKey ? 'bounce' : ''}`}>
            <UnitAvatar unit={unit} size="xl" pose={happy ? 'happy' : 'idle'} />
          </span>
          <div class="grow stack" style={{ gap: 4, minWidth: 0 }}>
            <div class="muted small">
              {speciesName(unit)} · {breedDef(unit.breedId).name} · {unitClassName(unit)}
            </div>
            <div class="row wrap">
              <RarityStars rarity={unit.rarity} />
              <b>Ур. {unit.level}</b>
              {inSquad && <span class="chip squad pop">В отряде</span>}
            </div>
            <div class="row wrap">
              <MoveBadge moveType={cls.moveType} />
              <WeaponBadge kind={cls.weaponKind} />
            </div>
            <StatBar value={unit.xp} max={100} kind="xp" animate />
            <div class="row between small muted">
              <span>XP {unit.xp}/100</span>
              <span class="gold">SP {unit.sp}</span>
            </div>
          </div>
        </div>

        <div class="card stack pop-in" style={{ animationDelay: '60ms' }}>
          <div class="row between">
            <b>Характеристики</b>
            <span class="muted small">
              Mt оружия {weaponMt(unit)}
              {unit.weaponTier ? ` · заточка ${'I'.repeat(unit.weaponTier)}` : ''}
            </span>
          </div>
          <StatsGrid stats={stats} asset={unit.asset} flaw={unit.flaw} animate />
          <div class="stack" style={{ gap: 4 }}>
            {STATS.map((s, i) => (
              <div key={s} class="row small">
                <span class="muted" style={{ width: 32 }}>
                  {STAT_LABELS[s]}
                </span>
                <div class="grow">
                  <StatBar value={unit.growths[s]} max={100} kind="growth" animate delay={120 + i * 60} />
                </div>
                <span class="muted" style={{ width: 36, textAlign: 'right' }}>
                  {unit.growths[s]}%
                </span>
              </div>
            ))}
            <div class="muted small">Рост до 40 уровня детерминирован: суммарный прирост известен заранее, порядок — нет.</div>
          </div>
        </div>

        {trait && (
          <div class="card pop-in" style={{ animationDelay: '100ms' }}>
            <b>★ Особенность: {trait.name}</b>
            <div class="muted small">{trait.desc}</div>
          </div>
        )}

        <div class="card stack pop-in" style={{ animationDelay: '140ms' }}>
          <b>Навыки</b>
          {SLOTS.map((s) => {
            const id = unit.skills[s];
            const info = id ? skillInfo(id) : undefined;
            const hasLearnable = learnable.some((l) => slotOf(l) === s && skillCost(l) <= unit.sp);
            const letter = s === 'a' || s === 'b' || s === 'c';
            return (
              <div key={s} class="slot" onClick={() => setSlot(s)}>
                <span class={`slot-ico ${letter ? 'letter' : ''}`}>{SLOT_ICONS[s]}</span>
                <span class="slot-text">
                  <div class="slot-name">{SLOT_NAMES[s]}</div>
                  <div class={`slot-value ${info ? '' : 'empty'}`}>{info?.name ?? '— пусто —'}</div>
                </span>
                {hasLearnable && <span class="chip red pop">Новое</span>}
                <span class="muted">›</span>
              </div>
            );
          })}
        </div>

        <div class="card stack pop-in" style={{ animationDelay: '180ms' }}>
          <b>Прокачка</b>
          <Button block icon="🏋️" onClick={onTrain} disabled={unit.level >= 40 || save.profile.treats < tCost}>
            Тренировка: +1 уровень {unit.level >= 40 ? '(максимум)' : `(🦴 ${tCost})`}
          </Button>
          <Button block icon="🔪" onClick={onSharpen} disabled={sCost === null || save.profile.treats < sCost}>
            Заточить оружие {sCost === null ? '(предел)' : `(🦴 ${sCost}, Mt +2)`}
          </Button>
          <Button block primary={!inSquad} icon={inSquad ? '↩️' : '🛡️'} onClick={onSquad}>
            {inSquad ? 'Убрать из отряда' : 'В отряд'}
          </Button>
          <Button block danger onClick={() => setRelease(1)}>
            Отпустить
          </Button>
        </div>

        <div class="card stack pop-in" style={{ animationDelay: '220ms' }}>
          <b>История</b>
          <div class="stats-table">
            <span class="k">Боёв</span>
            <span class="v">{unit.history.battles}</span>
            <span class="k">Убийств</span>
            <span class="v">{unit.history.kills}</span>
            <span class="k">Урона нанесено</span>
            <span class="v">{unit.history.damageDealt}</span>
            <span class="k">Урона получено</span>
            <span class="v">{unit.history.damageTaken}</span>
            {unit.history.closestCall < 999 && (
              <>
                <span class="k">Ближе всего к смерти</span>
                <span class="v danger">{unit.history.closestCall} HP</span>
              </>
            )}
          </div>
          <p class="muted small">«{personalityText(unit.personalityId)}»</p>
        </div>
      </div>

      <BottomSheet open={!!slot} onClose={() => setSlot(null)} title={slot ? `${SLOT_ICONS[slot]} ${SLOT_NAMES[slot]}` : ''}>
        {slot && (
          <div class="stack">
            {slotOptions(slot).map(({ id, state }) => {
              const info = skillInfo(id);
              if (!info) return null;
              const cost = skillCost(id);
              return (
                <div key={id} class={`skill-item ${state === 'equipped' ? 'equipped' : ''}`}>
                  <div class="txt">
                    <div>
                      <b>{info.name}</b> {state === 'equipped' && <span class="chip squad">Экипирован</span>}
                    </div>
                    <div class="desc">{info.desc}</div>
                  </div>
                  {state === 'learned' && (
                    <Button sm primary onClick={() => onEquip(slot, id)}>
                      Надеть
                    </Button>
                  )}
                  {state === 'learnable' && (
                    <Button sm onClick={() => onLearn(id)} disabled={unit.sp < cost}>
                      Изучить · {cost} SP
                    </Button>
                  )}
                </div>
              );
            })}
            {slotOptions(slot).length === 0 && <p class="muted">Нет доступных навыков для этого слота.</p>}
            {slot !== 'weapon' && unit.skills[slot] && (
              <Button block ghost onClick={() => onEquip(slot, undefined)}>
                Снять
              </Button>
            )}
            <p class="muted small">
              SP: <b class="gold">{unit.sp}</b>. Очки навыков копятся в боях.
            </p>
          </div>
        )}
      </BottomSheet>

      <ConfirmModal
        open={release === 1}
        title="Отпустить бойца?"
        text={`${displayName(unit)} уйдёт навсегда и попадёт на Кладбище с пометкой «ушёл сам».`}
        confirmLabel="Отпустить"
        danger
        onConfirm={() => setRelease(2)}
        onClose={() => setRelease(0)}
      />
      <ConfirmModal
        open={release === 2}
        title="Точно?"
        text="Вернуть нельзя. Совсем."
        confirmLabel="Да, отпустить"
        danger
        onConfirm={onRelease}
        onClose={() => setRelease(0)}
      />
      {toastEl}
    </div>
  );
}
