import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { UnitInstance } from '@core/types';
import { SQUAD_SIZE, BARRACKS_CAP } from '@core/types';
import { learnableNow, skillCost } from '@core/units';
import { $save, beginRosterCreation } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitRow } from '../components/UnitRow';
import { SPECIES_ORDER } from '../lib/format';

type SortKey = 'level' | 'class' | 'species' | 'recent';

export function ArmyTabs({ active }: { active: 'barracks' | 'shelter' }) {
  return (
    <div class="tabs">
      <button type="button" class={active === 'barracks' ? 'on' : ''} onClick={() => navigate('/army', true)}>
        Казарма
      </button>
      <button type="button" class={active === 'shelter' ? 'on' : ''} onClick={() => navigate('/army/recruit', true)}>
        Приют
      </button>
    </div>
  );
}

function sortUnits(units: UnitInstance[], key: SortKey): UnitInstance[] {
  const arr = [...units];
  switch (key) {
    case 'level':
      return arr.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    case 'class':
      return arr.sort((a, b) => a.classId.localeCompare(b.classId) || b.level - a.level);
    case 'species':
      return arr.sort((a, b) => SPECIES_ORDER[a.species] - SPECIES_ORDER[b.species] || b.level - a.level);
    case 'recent':
      return arr.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export function ArmyScreen() {
  const save = useStore($save);
  const [sort, setSort] = useState<SortKey>('level');
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

  const units = sortUnits(army.units, sort);
  const sorts: { k: SortKey; label: string }[] = [
    { k: 'level', label: 'Уровень' },
    { k: 'class', label: 'Класс' },
    { k: 'species', label: 'Вид' },
    { k: 'recent', label: 'Новые' },
  ];

  return (
    <div class="screen">
      <TopBar title="Моя армия" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <ArmyTabs active="barracks" />
      <div class="screen-body">
        <div class="row between">
          <span class="muted small">
            Бойцов: {army.units.length}/{BARRACKS_CAP} · Отряд: {army.squadIds.length}/{SQUAD_SIZE}
          </span>
        </div>
        <div class="sort-row">
          {sorts.map((s) => (
            <Button key={s.k} sm ghost={sort !== s.k} onClick={() => setSort(s.k)}>
              {s.label}
            </Button>
          ))}
        </div>
        {units.map((u, i) => {
          const inSquad = army.squadIds.includes(u.id);
          const canLearn = learnableNow(u).some((id) => skillCost(id) <= u.sp);
          return (
            <UnitRow
              key={u.id}
              unit={u}
              animated={i < 12}
              onClick={() => navigate(`/army/${u.id}`)}
              tags={
                <>
                  {inSquad && <span class="chip squad">В отряде</span>}
                  {canLearn && <span class="chip red">Есть навык</span>}
                </>
              }
              right={<span class="muted small">SP {u.sp}</span>}
            />
          );
        })}
        <Button block onClick={() => navigate('/battle/setup')} primary>
          К подготовке боя
        </Button>
      </div>
    </div>
  );
}
