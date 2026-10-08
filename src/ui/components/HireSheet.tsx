import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitInstance } from '@core/types';
import { displayName } from '@core/units';
import { $save, currentHireCost, freeSlots, hireAction } from '@state/save';
import { haptic } from '@platform/haptics';
import { BottomSheet } from './Sheet';
import { Button } from './Button';
import { UnitRow } from './UnitRow';
import { UnitDetails } from './UnitDetails';

/**
 * Шторка найма в пустой слот: три случайных кандидата (и пленник бесплатно, если есть).
 * Цена одна на всех кандидатов и растёт после каждого найма до следующего боя.
 */
export function HireSheet({
  open,
  onClose,
  onHired,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  onHired: (unit: UnitInstance) => void;
  toast: (msg: string, error?: boolean) => void;
}) {
  const save = useStore($save);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cost = currentHireCost(save);
  const slots = freeSlots(save);
  const treats = save.profile.treats;
  const canPay = treats >= cost;
  const captive = save.shelter.captive;

  const hire = (source: 'captive' | number, unit: UnitInstance) => {
    const r = hireAction(source);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    setExpanded(null);
    onHired(unit);
    onClose();
  };

  const card = (unit: UnitInstance, source: 'captive' | number, index: number) => {
    const free = source === 'captive';
    const isOpen = expanded === unit.id;
    return (
      <div key={unit.id} class="hire-cand stack">
        <UnitRow
          unit={unit}
          index={index}
          friendly={free}
          onClick={() => setExpanded(isOpen ? null : unit.id)}
          tags={free ? <span class="chip gold pop">⛓️ Пленник · бесплатно</span> : undefined}
          right={<span class="muted small">{isOpen ? 'Свернуть' : 'Подробнее'}</span>}
        />
        {isOpen && (
          <div class="card hire-details pop-in">
            <UnitDetails unit={unit} compact />
          </div>
        )}
        <Button block primary icon={free ? '🤝' : '🦴'} disabled={slots === 0 || (!free && !canPay)} onClick={() => hire(source, unit)}>
          {slots === 0 ? 'Слоты заняты' : free ? 'Нанять бесплатно' : `Нанять за 🦴 ${cost}`}
        </Button>
      </div>
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Кто пополнит отряд?">
      <p class="muted small hire-sub">
        🦴 <b>{cost}</b> за найм · у вас 🦴 {treats}
        {!canPay && <span class="danger-text"> — не хватает</span>}
      </p>
      <div class="stack">
        {captive && card(captive, 'captive', 0)}
        {save.shelter.candidates.map((u, i) => card(u, i, i + 1))}
        {save.shelter.candidates.length === 0 && !captive && <p class="muted">Кандидатов пока нет — сыграйте бой.</p>}
      </div>
      <div class="muted small" style={{ marginTop: 8 }}>
        Не нанятые уходят в закат. Цена растёт после каждого найма и сбрасывается после боя.
      </div>
    </BottomSheet>
  );
}

export { displayName };
