import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitInstance } from '@core/types';
import { BARRACKS_CAP } from '@core/types';
import { recruitCost } from '@core/progression';
import { PRICES } from '@content/balance';
import { $save, recruitAction, refreshShelterAction } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitRow } from '../components/UnitRow';
import { BottomSheet } from '../components/Sheet';
import { UnitDetails } from '../components/UnitDetails';
import { useToast } from '../components/Toast';
import { ArmyTabs } from './ArmyScreen';
import { haptic } from '@platform/haptics';

export function RecruitScreen() {
  const save = useStore($save);
  const [details, setDetails] = useState<{ unit: UnitInstance; source: 'captive' | number } | null>(null);
  const [toastEl, toast] = useToast();
  const [spin, setSpin] = useState(0);
  const army = save.army;

  useEffect(() => {
    if (!army) navigate('/army', true);
  }, [army]);
  if (!army) return <div class="screen" />;

  const full = army.units.length >= BARRACKS_CAP;
  const shelter = save.shelter;

  const recruit = (source: 'captive' | number) => {
    const r = recruitAction(source);
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('success');
    toast('Боец принят в казарму');
    setDetails(null);
  };
  const refresh = () => {
    const r = refreshShelterAction();
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    setSpin((k) => k + 1);
    haptic('medium');
  };

  return (
    <div class="screen">
      <TopBar title="Приют" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <ArmyTabs active="shelter" />
      <div class="screen-body">
        <p class="muted small">
          Кандидаты обновляются после каждого боя. Казарма: <b>{army.units.length}</b>/{BARRACKS_CAP}.
          {full ? ' Казарма полна — отпустите кого-нибудь, чтобы принять нового.' : ''}
        </p>
        {shelter.captive && (
          <>
            <div class="section-title">⛓️ Пленник</div>
            <UnitRow
              unit={shelter.captive}
              friendly
              index={0}
              onClick={() => setDetails({ unit: shelter.captive as UnitInstance, source: 'captive' })}
              tags={<span class="chip gold">Бесплатно</span>}
            />
          </>
        )}
        <div class="section-title">🐾 Бродяги</div>
        {shelter.candidates.length === 0 && <p class="muted">Пока никого. Сыграйте бой или обновите список.</p>}
        <div class="stack" key={shelter.seed}>
          {shelter.candidates.map((u, i) => (
            <UnitRow key={u.id} unit={u} index={i + 1} onClick={() => setDetails({ unit: u, source: i })} right={<span class="small">🦴 {recruitCost(u.level)}</span>} />
          ))}
        </div>
        <Button block icon="🔄" key={spin} class={spin ? 'spin' : ''} onClick={refresh} disabled={save.profile.treats < PRICES.shelterRefresh}>
          Обновить список (🦴 {PRICES.shelterRefresh})
        </Button>
      </div>
      <BottomSheet open={!!details} onClose={() => setDetails(null)}>
        {details && (
          <>
            <UnitDetails unit={details.unit} />
            <Button
              block
              primary
              disabled={full || (details.source !== 'captive' && save.profile.treats < recruitCost(details.unit.level))}
              onClick={() => recruit(details.source)}
            >
              {full ? 'Казарма полна' : details.source === 'captive' ? 'Принять (бесплатно)' : `Принять за 🦴 ${recruitCost(details.unit.level)}`}
            </Button>
          </>
        )}
      </BottomSheet>
      {toastEl}
    </div>
  );
}
