import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { Difficulty, UnitInstance } from '@core/types';
import { SQUAD_SIZE } from '@core/types';
import { visibleStats } from '@core/units';
import { DIFFICULTIES } from '@content/balance';
import { biomeDef } from '@content/biomes';
import { $save, $unlockedBiomes, difficultyUnlocked, setSquad, startBattle } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { UnitRow } from '../components/UnitRow';
import { BottomSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { statTotal } from '../lib/format';
import { haptic } from '@platform/haptics';

export function BattleSetupScreen() {
  const save = useStore($save);
  const biomes = useStore($unlockedBiomes);
  const army = save.army;
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [biome, setBiome] = useState<string>('random');
  const [squad, setSquadLocal] = useState<string[]>(army?.squadIds ?? []);
  const [picker, setPicker] = useState(false);
  const [toastEl, toast] = useToast();

  useEffect(() => {
    if (!army) navigate('/', true);
  }, [army]);

  const squadUnits = useMemo(
    () => squad.map((id) => army?.units.find((u) => u.id === id)).filter((u): u is UnitInstance => !!u),
    [squad, army],
  );
  if (!army) return <div class="screen" />;

  const def = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[0];
  const avgLevel = squadUnits.length ? squadUnits.reduce((a, u) => a + u.level, 0) / squadUnits.length : 1;
  const squadPower = squadUnits.reduce((a, u) => a + statTotal(visibleStats(u)), 0);
  const enemyCount = def ? (def.enemies[0] + def.enemies[1]) / 2 : 4;
  const enemyLevel = def ? avgLevel + (def.levelRange[0] + def.levelRange[1]) / 2 : avgLevel;
  const enemyPower = Math.round(enemyCount * (50 + 2.95 * Math.max(0, enemyLevel - 1)));
  const ratio = enemyPower > 0 ? squadPower / enemyPower : 1;
  const ratioLabel = ratio >= 1.1 ? 'Преимущество у вас' : ratio >= 0.85 ? 'Силы равны' : ratio >= 0.6 ? 'Будет тяжело' : 'Самоубийство';
  const ratioClass = ratio >= 1.1 ? 'ok' : ratio >= 0.85 ? '' : ratio >= 0.6 ? 'warn' : 'danger';

  const removeFromSquad = (id: string) => {
    haptic('select');
    setSquadLocal((s) => s.filter((x) => x !== id));
  };
  const addToSquad = (id: string) => {
    haptic('select');
    setSquadLocal((s) => (s.length >= SQUAD_SIZE || s.includes(id) ? s : [...s, id]));
    setPicker(false);
  };

  const onStart = () => {
    if (squad.length === 0) return toast('Выберите хотя бы одного бойца', true);
    setSquad(squad);
    const r = startBattle({ difficulty, biomeId: biome, squadIds: squad });
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('heavy');
    navigate('/battle', true);
  };

  const notInSquad = army.units.filter((u) => !squad.includes(u.id));

  return (
    <div class="screen">
      <TopBar title="Подготовка к бою" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <h3>Сложность</h3>
        <div class="stack">
          {DIFFICULTIES.map((d) => {
            const unlocked = difficultyUnlocked(save, d.id);
            const rules: string[] = [];
            if (d.reinforcements.length) rules.push(`подкрепления (ход ${d.reinforcements.map((r) => r.turn).join(', ')})`);
            if (d.boss) rules.push('вожак');
            if (d.objective === 'killBoss') rules.push('цель: убить вожака');
            return (
              <div
                key={d.id}
                class={`card clickable diff-card ${difficulty === d.id ? 'selected' : ''} ${unlocked ? '' : 'locked'}`}
                onClick={() => {
                  if (!unlocked) return toast(`Откроется после ${d.unlock?.wins} побед на «${DIFFICULTIES.find((x) => x.id === d.unlock?.difficulty)?.name}»`);
                  haptic('select');
                  setDifficulty(d.id);
                }}
              >
                {!unlocked && <span class="lock">🔒</span>}
                <b>{d.name}</b>
                <div class="muted small">{d.desc}</div>
                <div class="diff-meta">
                  <span class="chip">
                    Врагов {d.enemies[0]}–{d.enemies[1]}
                  </span>
                  <span class="chip">
                    Уровень {d.levelRange[0] >= 0 ? '+' : ''}
                    {d.levelRange[0]}…+{d.levelRange[1]}
                  </span>
                  <span class="chip">🦴 ×{d.treatsMult}</span>
                  <span class="chip">✦ {d.glory}</span>
                  <span class="chip">Рекрут {Math.round(d.recruitChance * 100)}%</span>
                  {rules.map((r) => (
                    <span key={r} class="chip red">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h3>Биом</h3>
        <div class="row wrap">
          <Button sm primary={biome === 'random'} onClick={() => setBiome('random')}>
            🎲 Случайно
          </Button>
          {biomes.map((id) => (
            <Button key={id} sm primary={biome === id} onClick={() => setBiome(id)}>
              {biomeDef(id).name}
            </Button>
          ))}
        </div>

        <h3>
          Отряд {squad.length}/{SQUAD_SIZE}
        </h3>
        <div class="squad-slots">
          {Array.from({ length: SQUAD_SIZE }, (_, i) => {
            const u = squadUnits[i];
            return u ? (
              <div key={u.id} class="squad-slot filled" onClick={() => removeFromSquad(u.id)}>
                <UnitAvatar unit={u} size="sm" />
                <span class="nm">{u.name}</span>
                <span class="muted">Ур. {u.level}</span>
              </div>
            ) : (
              <div key={`empty-${i}`} class="squad-slot" onClick={() => setPicker(true)}>
                <span style={{ fontSize: 24 }}>＋</span>
                <span class="muted">Добавить</span>
              </div>
            );
          })}
        </div>
        <div class="card">
          <div class="row between">
            <span>Сила отряда</span>
            <b class={ratioClass}>{ratioLabel}</b>
          </div>
          <div class="muted small">
            Ваши {squadPower} против ≈{enemyPower} у врага
          </div>
          <div class="bar" style={{ marginTop: 6 }}>
            <div style={{ width: `${Math.min(100, ratio * 50)}%`, background: ratio >= 1 ? 'var(--ok)' : ratio >= 0.6 ? 'var(--warn)' : 'var(--accent)' }} />
          </div>
        </div>
        <div class="warning-box">☠️ Павшие в бою не возвращаются</div>
        <Button big primary block onClick={onStart} disabled={squad.length === 0}>
          Начать бой
        </Button>
      </div>
      <BottomSheet open={picker} onClose={() => setPicker(false)} title="Кого взять?">
        {notInSquad.length === 0 && <p class="muted">Все бойцы уже в отряде.</p>}
        {notInSquad.map((u) => (
          <UnitRow key={u.id} unit={u} onClick={() => addToSquad(u.id)} />
        ))}
      </BottomSheet>
      {toastEl}
    </div>
  );
}

