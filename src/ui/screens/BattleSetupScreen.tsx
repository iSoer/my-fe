import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { Difficulty } from '@core/types';
import { SQUAD_SIZE } from '@core/types';
import { visibleStats } from '@core/units';
import { DIFFICULTIES } from '@content/balance';
import { biomeDef } from '@content/biomes';
import { $save, $unlockedBiomes, difficultyUnlocked, startBattle } from '@state/save';
import { navigate } from '@state/router';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { ResourceBar } from '../components/ResourceBar';
import { UnitAvatar } from '../components/UnitAvatar';
import { useToast } from '../components/Toast';
import { statTotal } from '../lib/format';
import { stagger } from '../lib/animate';
import { haptic } from '@platform/haptics';

const DIFF_STYLE: Record<Difficulty, { icon: string; color: string; rgb: string }> = {
  easy: { icon: '🌱', color: '#9ad66b', rgb: '154, 214, 107' },
  normal: { icon: '⚔️', color: '#8fc9ff', rgb: '143, 201, 255' },
  hard: { icon: '🔥', color: '#ffb86b', rgb: '255, 184, 107' },
  nightmare: { icon: '💀', color: '#ff5a68', rgb: '255, 90, 104' },
};
const BIOME_ICON: Record<string, string> = { yard: '🏡', roofs: '🏙️', basement: '🕯️', dump: '🗑️', winter_park: '❄️' };

export function BattleSetupScreen() {
  const save = useStore($save);
  const biomes = useStore($unlockedBiomes);
  const army = save.army;
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [biome, setBiome] = useState<string>('random');
  const [toastEl, toast] = useToast();

  useEffect(() => {
    if (!army) navigate('/', true);
  }, [army]);

  if (!army) return <div class="screen" />;

  // Отряд — это вся армия (4 слота).
  const squadUnits = army.units;
  const squad = squadUnits.map((u) => u.id);

  const def = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[0];
  const avgLevel = squadUnits.length ? squadUnits.reduce((a, u) => a + u.level, 0) / squadUnits.length : 1;
  const squadPower = squadUnits.reduce((a, u) => a + statTotal(visibleStats(u)), 0);
  const enemyCount = def ? (def.enemies[0] + def.enemies[1]) / 2 : 4;
  const enemyLevel = def ? avgLevel + (def.levelRange[0] + def.levelRange[1]) / 2 : avgLevel;
  const enemyPower = Math.round(enemyCount * (50 + 2.95 * Math.max(0, enemyLevel - 1)));
  const ratio = enemyPower > 0 ? squadPower / enemyPower : 1;
  const ratioLabel = ratio >= 1.1 ? 'Преимущество у вас' : ratio >= 0.85 ? 'Силы равны' : ratio >= 0.6 ? 'Будет тяжело' : 'Самоубийство';
  const ratioClass = ratio >= 1.0 ? 'ok' : ratio >= 0.75 ? 'warn' : 'danger';
  const barClass = ratio >= 1.0 ? 'good' : ratio >= 0.75 ? 'mid' : 'bad';

  const onStart = () => {
    if (squad.length === 0) return toast('В отряде никого нет — наймите бойцов', true);
    const r = startBattle({ difficulty, biomeId: biome, squadIds: squad });
    if (!r.ok) return toast(r.error ?? 'Ошибка', true);
    haptic('heavy');
    navigate('/battle', true);
  };

  return (
    <div class="screen">
      <TopBar title="Подготовка к бою" right={<ResourceBar />} onBack={() => navigate('/', true)} />
      <div class="screen-body">
        <div class="section-title">Сложность</div>
        <div class="stack">
          {DIFFICULTIES.map((d, i) => {
            const unlocked = difficultyUnlocked(save, d.id);
            const st = DIFF_STYLE[d.id];
            const rules: string[] = [];
            if (d.reinforcements.length) rules.push(`подкрепления (ход ${d.reinforcements.map((r) => r.turn).join(', ')})`);
            if (d.boss) rules.push('вожак');
            if (d.objective === 'killBoss') rules.push('цель: убить вожака');
            const unlockText = d.unlock ? `после ${d.unlock.wins} побед на «${DIFFICULTIES.find((x) => x.id === d.unlock?.difficulty)?.name}»` : '';
            return (
              <div
                key={d.id}
                class={`card clickable diff-card pop-in ${difficulty === d.id ? 'selected' : ''} ${unlocked ? '' : 'locked'}`}
                style={{ ...stagger(i, 60), '--diff-color': st.color, '--diff-rgb': st.rgb } as Record<string, string>}
                onClick={() => {
                  if (!unlocked) return toast(`Откроется ${unlockText}`);
                  haptic('select');
                  setDifficulty(d.id);
                }}
              >
                <span class="diff-ico" aria-hidden="true">
                  {unlocked ? st.icon : '🔒'}
                </span>
                <div class="diff-body">
                  <b>{d.name}</b>
                  <div class="muted small">{unlocked ? d.desc : `Закрыто: ${unlockText}`}</div>
                  <div class="diff-meta">
                    <span class="chip">
                      Врагов {d.enemies[0]}–{d.enemies[1]}
                    </span>
                    <span class="chip">
                      Уровень {d.levelRange[0] >= 0 ? '+' : ''}
                      {d.levelRange[0]}…+{d.levelRange[1]}
                    </span>
                    <span class="chip">🦴 ×{d.treatsMult}</span>
                    <span class="chip gold">✦ {d.glory}</span>
                    <span class="chip">Рекрут {Math.round(d.recruitChance * 100)}%</span>
                    {rules.map((r) => (
                      <span key={r} class="chip red">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div class="section-title">Биом</div>
        <div class="biome-chips">
          <Button sm primary={biome === 'random'} icon="🎲" onClick={() => setBiome('random')}>
            Случайно
          </Button>
          {biomes.map((id) => (
            <Button key={id} sm primary={biome === id} icon={BIOME_ICON[id] ?? '🗺️'} onClick={() => setBiome(id)}>
              {biomeDef(id).name}
            </Button>
          ))}
        </div>

        <div class="section-title">
          Отряд {squad.length}/{SQUAD_SIZE}
        </div>
        <div class="squad-slots">
          {Array.from({ length: SQUAD_SIZE }, (_, i) => {
            const u = squadUnits[i];
            return u ? (
              <div key={u.id} class="squad-slot filled pop-in" onClick={() => navigate(`/army/${u.id}`)}>
                <UnitAvatar unit={u} size="sm" />
                <span class="nm">{u.name}</span>
                <span class="muted">Ур. {u.level}</span>
              </div>
            ) : (
              <div key={`empty-${i}`} class="squad-slot empty readonly" onClick={() => navigate('/army')}>
                <span class="plus">·</span>
                <span class="muted">пусто</span>
              </div>
            );
          })}
        </div>
        {squad.length < SQUAD_SIZE && (
          <div class="muted small">
            Свободных слотов: {SQUAD_SIZE - squad.length}. Нанять можно в «Моей армии».
          </div>
        )}
        <div class="card power-card">
          <div class="row between">
            <span>Сила отряда</span>
            <b class={ratioClass}>{ratioLabel}</b>
          </div>
          <div class="muted small">
            Ваши <b>{squadPower}</b> против ≈<b>{enemyPower}</b> у врага
          </div>
          <div class="bar" style={{ marginTop: 8 }}>
            <div class={barClass} style={{ width: `${Math.min(100, ratio * 50)}%` }} />
          </div>
        </div>
        <div class="warning-box">☠️ Павшие в бою не возвращаются</div>
        <Button big primary block pulse={squad.length > 0} icon="⚔️" onClick={onStart} disabled={squad.length === 0}>
          Начать бой
        </Button>
      </div>
      {toastEl}
    </div>
  );
}
