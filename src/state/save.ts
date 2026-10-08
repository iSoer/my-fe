import { atom, computed } from 'nanostores';
import type { Army, BattleAction, BattleEvent, BattleState, BattleSummary, Difficulty, SaveGame, Settings, UnitInstance, UnitSkills } from '@core/types';
import { BARRACKS_CAP, SQUAD_SIZE } from '@core/types';
import { createEmptySave, parseSave, serializeSave } from '@core/save';
import { createRng, mixSeed, randomSeed } from '@core/rng';
import { generateRoster, learnSkill, equipSkill, skillCost } from '@core/units';
import { generateMap } from '@core/map/generate';
import { applyAction, createBattle } from '@core/battle/reducer';
import {
  generateShelter,
  memorialEntry,
  recruitCost,
  rerollCost,
  resolveBattle,
  sharpenCost,
  sharpenWeapon,
  trainCost,
  trainUnit,
} from '@core/progression';
import { difficultyDef, PRICES } from '@content/balance';
import { BIOMES } from '@content/biomes';
import { cloudLoad, cloudStore, clearLocal, cloudClear, loadLocal, saveLocal } from '@platform/storage';
import { setHapticsEnabled } from '@platform/haptics';

/* ---------- Сторы ---------- */

export const $save = atom<SaveGame>(createEmptySave(Date.now()));
export const $saveStatus = atom<'loading' | 'ready' | 'conflict' | 'error'>('loading');
export const $conflict = atom<{ local: SaveGame; cloud: SaveGame } | null>(null);
export const $saveError = atom<string | null>(null);

export const $profile = computed($save, (s) => s.profile);
export const $army = computed($save, (s) => s.army);
export const $battle = computed($save, (s) => s.battle);
export const $settings = computed($save, (s) => s.settings);
export const $shelter = computed($save, (s) => s.shelter);
export const $memorial = computed($save, (s) => s.memorial);
export const $lastBattle = computed($save, (s) => s.lastBattle);
export const $pendingRoster = computed($save, (s) => s.pendingRoster);

/** Кандидаты ростера — детерминированно из seed и числа перемешиваний. */
export const $rosterUnits = computed($save, (s): UnitInstance[] => {
  const pr = s.pendingRoster;
  if (!pr) return [];
  return generateRoster({ seed: mixSeed(pr.seed, `reroll:${pr.rerolls}`), glory: s.profile.glory, now: s.updatedAt });
});

export const $unlockedBiomes = computed($save, (s) => {
  const totalWins = Object.values(s.profile.wins).reduce((a, b) => a + b, 0);
  return BIOMES.filter((b) => totalWins >= b.unlockWins).map((b) => b.id);
});

export function difficultyUnlocked(save: SaveGame, d: Difficulty): boolean {
  const def = difficultyDef(d);
  if (!def.unlock) return true;
  return (save.profile.wins[def.unlock.difficulty] ?? 0) >= def.unlock.wins;
}

/* ---------- Персистентность ---------- */

let localTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let persistEnabled = false;

function persist(save: SaveGame, immediateCloud = false): void {
  if (!persistEnabled) return;
  const json = serializeSave(save);
  if (localTimer) clearTimeout(localTimer);
  localTimer = setTimeout(() => saveLocal(json), 100);
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => void cloudStore(json, save.updatedAt), immediateCloud ? 0 : 3000);
}

export function flushPersist(): void {
  if (!persistEnabled) return;
  const save = $save.get();
  const json = serializeSave(save);
  if (localTimer) clearTimeout(localTimer);
  saveLocal(json);
  if (cloudTimer) clearTimeout(cloudTimer);
  void cloudStore(json, save.updatedAt);
}

export function updateSave(fn: (s: SaveGame) => SaveGame, opts: { immediateCloud?: boolean } = {}): SaveGame {
  const next = { ...fn($save.get()), updatedAt: Date.now() };
  $save.set(next);
  persist(next, opts.immediateCloud ?? false);
  return next;
}

export async function initSave(): Promise<void> {
  const localJson = loadLocal();
  let local: SaveGame | null = null;
  if (localJson) {
    const r = parseSave(localJson);
    if (r.ok) local = r.save;
    else $saveError.set(r.error);
  }
  let cloud: SaveGame | null = null;
  try {
    const c = await cloudLoad();
    if (c) {
      const r = parseSave(c.json);
      if (r.ok) cloud = r.save;
    }
  } catch {
    cloud = null;
  }
  setHapticsEnabled((local ?? cloud)?.settings.haptics ?? true);
  if (local && cloud && cloud.updatedAt > local.updatedAt + 60_000 && serializeSave(cloud) !== serializeSave(local)) {
    $conflict.set({ local, cloud });
    $saveStatus.set('conflict');
    $save.set(local);
    return;
  }
  const chosen = local ?? cloud ?? createEmptySave(Date.now());
  $save.set(chosen);
  persistEnabled = true;
  $saveStatus.set('ready');
  if (!local && cloud) persist(chosen);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPersist();
    });
  }
}

export function resolveConflict(choice: 'local' | 'cloud'): void {
  const c = $conflict.get();
  if (!c) return;
  $save.set(choice === 'local' ? c.local : c.cloud);
  $conflict.set(null);
  persistEnabled = true;
  $saveStatus.set('ready');
  persist($save.get(), true);
}

/* ---------- Ростер и армия ---------- */

export function beginRosterCreation(returnTo: 'battle' | 'army'): void {
  updateSave((s) => {
    if (s.pendingRoster) return { ...s, pendingRoster: { ...s.pendingRoster, returnTo } };
    return { ...s, pendingRoster: { seed: randomSeed(), rerolls: 0, returnTo }, profile: { ...s.profile, rosterRerolls: 0 } };
  });
}

export function currentRerollCost(save: SaveGame): number {
  const pr = save.pendingRoster;
  if (!pr) return 0;
  return rerollCost(pr.rerolls, save.profile.freeRerolls + (save.profile.glory >= 25 ? 1 : 0));
}

export function rerollRoster(): { ok: boolean; error?: string } {
  const s = $save.get();
  const pr = s.pendingRoster;
  if (!pr) return { ok: false, error: 'нет ростера' };
  const cost = currentRerollCost(s);
  if (s.profile.glory < cost) return { ok: false, error: 'Недостаточно Славы' };
  updateSave((st) => ({
    ...st,
    profile: { ...st.profile, glory: st.profile.glory - cost, rosterRerolls: st.profile.rosterRerolls + 1 },
    pendingRoster: pr ? { ...pr, rerolls: pr.rerolls + 1 } : st.pendingRoster,
  }));
  return { ok: true };
}

export function confirmRoster(ids: string[]): { ok: boolean; error?: string; returnTo?: 'battle' | 'army' } {
  const s = $save.get();
  const pr = s.pendingRoster;
  if (!pr) return { ok: false, error: 'нет ростера' };
  const roster = $rosterUnits.get();
  const picked = roster.filter((u) => ids.includes(u.id));
  if (picked.length !== SQUAD_SIZE) return { ok: false, error: `Нужно выбрать ${SQUAD_SIZE}` };
  const now = Date.now();
  const units = picked.map((u) => ({ ...u, createdAt: now }));
  const army: Army = { id: `army_${now.toString(36)}`, units, squadIds: units.map((u) => u.id), createdAt: now, battles: 0, wins: 0 };
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      army,
      shelter: generateShelter(randomSeed(), army, st.profile.glory, now),
      profile: {
        ...st.profile,
        armiesCreated: st.profile.armiesCreated + 1,
        treats: st.profile.treats + (st.profile.glory >= 600 && st.profile.armiesCreated > 0 ? 500 : 0),
      },
    };
    delete next.pendingRoster;
    return next;
  }, { immediateCloud: true });
  return { ok: true, returnTo: pr.returnTo };
}

function replaceUnit(army: Army, unit: UnitInstance): Army {
  return { ...army, units: army.units.map((u) => (u.id === unit.id ? unit : u)) };
}

export function setSquad(ids: string[]): void {
  updateSave((s) => (s.army ? { ...s, army: { ...s.army, squadIds: ids.slice(0, SQUAD_SIZE) } } : s));
}

export function toggleSquad(unitId: string): { ok: boolean; error?: string } {
  const s = $save.get();
  if (!s.army) return { ok: false, error: 'нет армии' };
  const inSquad = s.army.squadIds.includes(unitId);
  if (!inSquad && s.army.squadIds.length >= SQUAD_SIZE) return { ok: false, error: 'Отряд полон' };
  setSquad(inSquad ? s.army.squadIds.filter((id) => id !== unitId) : [...s.army.squadIds, unitId]);
  return { ok: true };
}

export function trainUnitAction(unitId: string): { ok: boolean; error?: string } {
  const s = $save.get();
  const unit = s.army?.units.find((u) => u.id === unitId);
  if (!s.army || !unit) return { ok: false, error: 'нет бойца' };
  if (unit.level >= 40) return { ok: false, error: 'Максимальный уровень' };
  const cost = trainCost(unit.level);
  if (s.profile.treats < cost) return { ok: false, error: 'Недостаточно Вкусняшек' };
  const { unit: next } = trainUnit(unit);
  updateSave((st) => ({ ...st, army: replaceUnit(st.army as Army, next), profile: { ...st.profile, treats: st.profile.treats - cost } }));
  return { ok: true };
}

export function learnSkillAction(unitId: string, skillId: string): { ok: boolean; error?: string } {
  const s = $save.get();
  const unit = s.army?.units.find((u) => u.id === unitId);
  if (!s.army || !unit) return { ok: false, error: 'нет бойца' };
  if (unit.sp < skillCost(skillId)) return { ok: false, error: 'Недостаточно SP' };
  try {
    const next = learnSkill(unit, skillId);
    updateSave((st) => ({ ...st, army: replaceUnit(st.army as Army, next) }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function equipAction(unitId: string, slot: keyof UnitSkills, skillId: string | undefined): { ok: boolean; error?: string } {
  const s = $save.get();
  const unit = s.army?.units.find((u) => u.id === unitId);
  if (!s.army || !unit) return { ok: false, error: 'нет бойца' };
  try {
    const next = equipSkill(unit, skillId, slot);
    updateSave((st) => ({ ...st, army: replaceUnit(st.army as Army, next) }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function sharpenAction(unitId: string): { ok: boolean; error?: string } {
  const s = $save.get();
  const unit = s.army?.units.find((u) => u.id === unitId);
  if (!s.army || !unit) return { ok: false, error: 'нет бойца' };
  const cost = sharpenCost(unit.weaponTier);
  if (cost === null) return { ok: false, error: 'Оружие заточено до предела' };
  if (s.profile.treats < cost) return { ok: false, error: 'Недостаточно Вкусняшек' };
  updateSave((st) => ({ ...st, army: replaceUnit(st.army as Army, sharpenWeapon(unit)), profile: { ...st.profile, treats: st.profile.treats - cost } }));
  return { ok: true };
}

export function releaseUnit(unitId: string): { ok: boolean; armyFell?: boolean } {
  const s = $save.get();
  const unit = s.army?.units.find((u) => u.id === unitId);
  if (!s.army || !unit) return { ok: false };
  const now = Date.now();
  const remaining = s.army.units.filter((u) => u.id !== unitId);
  updateSave((st) => {
    const next: SaveGame = { ...st, memorial: [...st.memorial, memorialEntry(unit, 'released', now)] };
    if (remaining.length === 0) {
      delete next.army;
      next.stats = { ...st.stats, armiesLost: st.stats.armiesLost + 1 };
    } else next.army = { ...(st.army as Army), units: remaining, squadIds: (st.army as Army).squadIds.filter((id) => id !== unitId) };
    return next;
  });
  return { ok: true, armyFell: remaining.length === 0 };
}

export function recruitAction(source: 'captive' | number): { ok: boolean; error?: string } {
  const s = $save.get();
  if (!s.army) return { ok: false, error: 'нет армии' };
  if (s.army.units.length >= BARRACKS_CAP) return { ok: false, error: 'Казарма полна' };
  const cand = source === 'captive' ? s.shelter.captive : s.shelter.candidates[source];
  if (!cand) return { ok: false, error: 'нет кандидата' };
  const cost = source === 'captive' ? 0 : recruitCost(cand.level);
  if (s.profile.treats < cost) return { ok: false, error: 'Недостаточно Вкусняшек' };
  updateSave((st) => {
    const army = st.army as Army;
    const unit: UnitInstance = { ...cand, createdAt: Date.now(), isEnemy: false };
    delete unit.factionId;
    delete unit.isBoss;
    const shelter = { ...st.shelter };
    if (source === 'captive') delete shelter.captive;
    else shelter.candidates = shelter.candidates.filter((_, i) => i !== source);
    return {
      ...st,
      army: { ...army, units: [...army.units, unit] },
      shelter,
      profile: { ...st.profile, treats: st.profile.treats - cost },
    };
  });
  return { ok: true };
}

export function refreshShelterAction(): { ok: boolean; error?: string } {
  const s = $save.get();
  if (s.profile.treats < PRICES.shelterRefresh) return { ok: false, error: 'Недостаточно Вкусняшек' };
  updateSave((st) => ({
    ...st,
    shelter: { ...generateShelter(randomSeed(), st.army, st.profile.glory, Date.now()), captive: st.shelter.captive },
    profile: { ...st.profile, treats: st.profile.treats - PRICES.shelterRefresh },
  }));
  return { ok: true };
}

/* ---------- Бой ---------- */

export interface StartBattleOptions {
  difficulty: Difficulty;
  biomeId: string | 'random';
  squadIds: string[];
  seed?: number;
}

export function startBattle(opts: StartBattleOptions): { ok: boolean; error?: string; events?: BattleEvent[] } {
  const s = $save.get();
  if (!s.army) return { ok: false, error: 'нет армии' };
  if (s.battle && !s.battle.result) return { ok: false, error: 'бой уже идёт' };
  const squad = opts.squadIds.map((id) => s.army?.units.find((u) => u.id === id)).filter((u): u is UnitInstance => !!u);
  if (squad.length === 0) return { ok: false, error: 'Пустой отряд' };
  if (!difficultyUnlocked(s, opts.difficulty)) return { ok: false, error: 'Сложность закрыта' };
  const seed = opts.seed ?? randomSeed();
  const avg = Math.round(squad.reduce((a, u) => a + u.level, 0) / squad.length);
  const map = generateMap({
    seed,
    biomeId: opts.biomeId,
    difficulty: opts.difficulty,
    squadAvgLevel: avg,
    squadSize: squad.length,
    unlockedBiomes: $unlockedBiomes.get(),
    now: Date.now(),
  });
  const { state, events } = createBattle({ map, squad, seed: createRng(seed).fork('battle').seed, now: Date.now() });
  updateSave((st) => ({ ...st, battle: state, army: st.army ? { ...st.army, squadIds: squad.map((u) => u.id) } : st.army }), { immediateCloud: true });
  return { ok: true, events };
}

export function dispatchBattle(action: BattleAction): { state: BattleState; events: BattleEvent[] } {
  const s = $save.get();
  if (!s.battle) throw new Error('нет боя');
  const { state, events } = applyAction(s.battle, action);
  updateSave((st) => ({ ...st, battle: state }), { immediateCloud: !!state.result });
  return { state, events };
}

/** Сдаться из меню: отступление + подведение итогов. */
export function surrenderFromMenu(): BattleSummary | null {
  const s = $save.get();
  if (!s.battle) return s.lastBattle ?? null;
  if (!s.battle.result) dispatchBattle({ type: 'retreat' });
  return finishBattle();
}

/** Завершить бой: применить итоги к армии/профилю, убрать battle, записать lastBattle. */
export function finishBattle(): BattleSummary | null {
  const s = $save.get();
  if (!s.battle) return s.lastBattle ?? null;
  const state = s.battle;
  const now = Date.now();
  const res = resolveBattle(s, state, now);
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      profile: res.profile,
      memorial: res.memorial,
      shelter: res.shelter,
      lastBattle: res.summary,
      stats: {
        ...st.stats,
        battles: st.stats.battles + 1,
        wins: st.stats.wins + (res.summary.result === 'victory' ? 1 : 0),
        kills: st.stats.kills + res.summary.kills,
        deaths: st.stats.deaths + res.summary.fallen.length,
        armiesLost: st.stats.armiesLost + (res.summary.armyFell ? 1 : 0),
      },
    };
    delete next.battle;
    if (res.army) next.army = res.army;
    else delete next.army;
    return next;
  }, { immediateCloud: true });
  return res.summary;
}

/* ---------- Настройки ---------- */

export function updateSettings(patch: Partial<Settings>): void {
  updateSave((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics);
}

export async function resetProgress(): Promise<void> {
  persistEnabled = false;
  clearLocal();
  await cloudClear();
  $save.set(createEmptySave(Date.now()));
  persistEnabled = true;
  flushPersist();
}

export function exportSaveCode(): string {
  return btoa(unescape(encodeURIComponent(serializeSave($save.get()))));
}

export function importSaveCode(code: string): { ok: boolean; error?: string } {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const r = parseSave(json);
    if (!r.ok) return { ok: false, error: r.error };
    $save.set(r.save);
    flushPersist();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
