import type { WeaponSkill } from "@shared/character/skills"

/**
 * Звук игры без файлов: всё синтезируется на Web Audio — музыкальные темы (секвенсор с опережающим планированием)
 * и эффекты. Музыка и джинглы стилизованы под SNES (SPC700): «сэмпловые» инструменты, длинное эхо, приглушённый
 * верх и лёгкое огрубление. Контекст создаётся по первому жесту пользователя (политика автоплея), до этого вызовы молчат.
 */

export type MusicTheme = "main" | "battle"

export type SfxKind
  = | "tap"
    | "select"
    | "aim"
    | "land"
    | "step"
    | "stepHeavy"
    | "hurt"
    | "heal"
    | "buff"
    | "debuff"
    | "levelUp"
    | "loot"
    | "wall"
    | "portal"
    | "special"
    | "phasePlayer"
    | "phaseEnemy"
    | "victory"
    | "defeat"
    | "retreat"
    | "deathPlayer"
    | "deathEnemy"

/** Удар в бою: звук контакта зависит от оружия и силы. */
export interface StrikeSound {
  weapon: WeaponSkill
  damage: number
  /** Доля от максимума HP цели. */
  frac: number
  special: boolean
  lethal: boolean
  effective: boolean
}

let ctx: AudioContext | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
/** Вход музыки и джинглов: окраска SPC700 перед шиной. */
let musicIn: AudioNode | null = null
let jingleIn: AudioNode | null = null
/** Посылы в эхо SPC700 (своё у музыки и у джинглов — громкость по своим ползункам). */
let musicEcho: GainNode | null = null
let jingleEcho: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let musicVol = 0.36
let sfxVol = 0.64
let wanted: { theme: MusicTheme | null, delay: number } = { theme: null, delay: 0 }
let hooked = false
const lastAt = new Map<string, number>()

/* ---------- Контекст и громкость ---------- */

/** Подписаться на жесты и видимость страницы. Повторный вызов ничего не делает. */
export function initAudio(): void {
  if (hooked || typeof window === "undefined") return
  hooked = true
  // Жест нужен и позже: iOS прерывает звук (звонок, сворачивание) и возобновить его можно только из жеста
  for (const ev of ["pointerdown", "keydown", "touchend"])
    window.addEventListener(ev, unlock, { capture: true, passive: true })
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return
    if (document.visibilityState === "hidden") void ctx.suspend().catch(() => undefined)
    else void ctx.resume().catch(() => undefined)
  })
}

function unlock(): void {
  if (ctx) {
    if (ctx.state !== "running" && document.visibilityState === "visible") void ctx.resume().catch(() => undefined)
    return
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  try {
    ctx = new AC()
  }
  catch {
    return
  }
  const c = ctx
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -12
  comp.ratio.value = 4
  comp.connect(c.destination)
  sfxBus = c.createGain()
  sfxBus.connect(comp)
  musicBus = c.createGain()
  musicBus.connect(comp)
  musicIn = snesColor(c, musicBus)
  jingleIn = snesColor(c, sfxBus)
  musicEcho = snesEcho(c, musicIn)
  jingleEcho = snesEcho(c, jingleIn)
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  applyVolumes()
  void c.resume().catch(() => undefined)
  if (wanted.theme) startTheme(wanted.theme, wanted.delay)
}

/**
 * Окраска SPC700: лёгкое огрубление амплитуды (сэмплы BRR) и срез верхов (32 кГц и гауссова интерполяция
 * давали характерный «ватный» звук). Возвращает вход цепочки.
 */
function snesColor(c: AudioContext, dest: AudioNode): AudioNode {
  const crush = c.createWaveShaper()
  const n = 8192
  const levels = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = Math.round(((i / (n - 1)) * 2 - 1) * levels) / levels
  crush.curve = curve
  const lp = c.createBiquadFilter()
  lp.frequency.value = 7200
  lp.Q.value = 0.5
  const hp = c.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 45
  crush.connect(lp)
  lp.connect(hp)
  hp.connect(dest)
  return crush
}

/** Эхо SPC700: задержка ~240 мс с сильной обратной связью и мягким FIR-срезом в петле. Возвращает посыл. */
function snesEcho(c: AudioContext, dest: AudioNode): GainNode {
  const send = c.createGain()
  send.gain.value = 0.38
  const delay = c.createDelay(1)
  delay.delayTime.value = 0.24
  const fb = c.createGain()
  fb.gain.value = 0.46
  const lp = c.createBiquadFilter()
  lp.frequency.value = 2600
  send.connect(delay)
  delay.connect(lp)
  lp.connect(fb)
  fb.connect(delay)
  lp.connect(dest)
  return send
}

/** Громкость из настроек (0–100); кривая квадратичная — так ползунок ощущается ровнее. */
export function setAudioVolumes(music: number, sfx: number): void {
  musicVol = (Math.max(0, Math.min(100, music)) / 100) ** 2
  sfxVol = (Math.max(0, Math.min(100, sfx)) / 100) ** 2
  applyVolumes()
}

function applyVolumes(): void {
  if (!ctx || !musicBus || !sfxBus) return
  musicBus.gain.setTargetAtTime(musicVol * 0.55, ctx.currentTime, 0.05)
  sfxBus.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.05)
}

/** Контекст, если эффекты сейчас слышны; повтор того же звука чаще раза в 35 мс отбрасывается. */
function live(key: string): AudioContext | null {
  if (!ctx || ctx.state !== "running" || sfxVol <= 0) return null
  const now = ctx.currentTime
  if (now - (lastAt.get(key) ?? -1) < 0.035) return null
  lastAt.set(key, now)
  return ctx
}

/* ---------- Голоса ---------- */

interface Voice {
  at: number
  dur: number
  f: number
  /** Глиссандо к частоте за время звучания. */
  to?: number
  wave?: OscillatorType
  gain: number
  attack?: number
  /** Доля длительности, которую нота держится на пике до затухания. */
  hold?: number
  lp?: number
  /** Огибающая фильтра: раскрытие до `lpPeak` на атаке и спад к `lpEnd` (медь). */
  lpPeak?: number
  lpEnd?: number
  q?: number
  detune?: number
  /** Вибрато: [частота, глубина в Гц]. */
  vib?: [number, number]
  /** Вибрато вступает с задержкой (секунды) — как у лидов SNES. */
  vibDelay?: number
  out?: AudioNode
  send?: AudioNode
}

function envelope(c: AudioContext, at: number, dur: number, peak: number, attack = 0.005, hold = 0): GainNode {
  const g = c.createGain()
  const a = Math.min(attack, dur * 0.5)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(peak, at + a)
  if (hold > 0) g.gain.setValueAtTime(peak, at + a + (dur - a) * hold)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  return g
}

function tone(v: Voice): void {
  const c = ctx
  if (!c || !sfxBus) return
  const osc = c.createOscillator()
  osc.type = v.wave ?? "sine"
  osc.frequency.setValueAtTime(v.f, v.at)
  if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, v.at + v.dur)
  if (v.detune) osc.detune.value = v.detune
  const g = envelope(c, v.at, v.dur, v.gain, v.attack, v.hold)
  let node: AudioNode = osc
  if (v.lp) {
    const f = c.createBiquadFilter()
    f.type = "lowpass"
    f.frequency.setValueAtTime(v.lp, v.at)
    if (v.q) f.Q.value = v.q
    if (v.lpPeak) {
      const a = Math.min(v.attack ?? 0.005, v.dur * 0.5) + 0.03
      f.frequency.linearRampToValueAtTime(v.lpPeak, v.at + a)
      f.frequency.exponentialRampToValueAtTime(v.lpEnd ?? v.lp, v.at + Math.max(a + 0.01, v.dur * 0.6))
    }
    node.connect(f)
    node = f
  }
  node.connect(g)
  g.connect(v.out ?? sfxBus)
  if (v.send) g.connect(v.send)
  const end = v.at + v.dur + 0.03
  if (v.vib) {
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = v.vib[0]
    if (v.vibDelay) {
      depth.gain.setValueAtTime(0, v.at)
      depth.gain.setValueAtTime(0, v.at + v.vibDelay)
      depth.gain.linearRampToValueAtTime(v.vib[1], v.at + v.vibDelay + 0.25)
    }
    else depth.gain.value = v.vib[1]
    lfo.connect(depth)
    depth.connect(osc.frequency)
    lfo.start(v.at)
    lfo.stop(end)
  }
  osc.start(v.at)
  osc.stop(end)
}

interface Hiss {
  at: number
  dur: number
  gain: number
  f: number
  to?: number
  filter?: BiquadFilterType
  q?: number
  attack?: number
  out?: AudioNode
  send?: AudioNode
}

function hiss(h: Hiss): void {
  const c = ctx
  if (!c || !sfxBus || !noiseBuf) return
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = h.filter ?? "bandpass"
  f.frequency.setValueAtTime(h.f, h.at)
  if (h.to) f.frequency.exponentialRampToValueAtTime(h.to, h.at + h.dur)
  f.Q.value = h.q ?? 1
  const g = envelope(c, h.at, h.dur, h.gain, h.attack)
  src.connect(f)
  f.connect(g)
  g.connect(h.out ?? sfxBus)
  if (h.send) g.connect(h.send)
  src.start(h.at, Math.random() * 0.5)
  src.stop(h.at + h.dur + 0.03)
}

function thud(at: number, gain: number, f = 150, dur = 0.16, out?: AudioNode): void {
  tone({ at, dur, f, to: 45, gain, ...(out ? { out } : {}) })
  // Щелчок атаки: на динамиках телефона низ почти не слышен, удар «читается» по нему
  hiss({ at, dur: 0.02, gain: gain * 0.5, f: 2500, filter: "lowpass", ...(out ? { out } : {}) })
}

/** Металлический звон: негармоничные обертоны. */
function clank(at: number, gain = 0.5): void {
  const partials: [number, number][] = [[620, 1], [1290, 0.7], [1980, 0.5], [3150, 0.3]]
  partials.forEach(([f, k], i) => tone({ at, dur: 0.38 - i * 0.06, f, gain: gain * k * 0.4 }))
  hiss({ at, dur: 0.03, gain: gain * 0.6, f: 4000, filter: "highpass" })
}

/* ---------- Ноты ---------- */

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** «F#5» → MIDI. */
function midi(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name)
  if (!m) throw new Error(`Нота? ${name}`)
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0
  return 12 * (Number(m[3]) + 1) + (PITCH[m[1] ?? "C"] ?? 0) + acc
}

const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12)

/* ---------- Инструменты SNES ---------- */

// SPC700 играл короткие сэмплы с ADSR, а вибрато и эхо добавлял драйвер. Здесь — их подражания из осцилляторов.

type InstName = "flute" | "oboe" | "brass" | "strings" | "harp" | "pizz" | "bass" | "slap"

interface Play {
  at: number
  /** MIDI. */
  m: number
  dur: number
  gain: number
  out?: AudioNode
  send?: AudioNode
}

const INST: Record<InstName, (p: Play) => void> = {
  // Флейта: мягкий треугольник, «чифф» дыхания на атаке и вибрато, вступающее после начала ноты
  flute: (p) => {
    const f = hz(p.m)
    tone({ ...p, f, wave: "triangle", attack: 0.05, hold: 0.75, vib: [5.5, f * 0.012], vibDelay: 0.2 })
    tone({ ...p, f: f * 2, gain: p.gain * 0.15, attack: 0.05, hold: 0.75 })
    hiss({ at: p.at, dur: 0.07, gain: p.gain * 0.5, f: f * 2, q: 3, out: p.out })
  },
  // Гобой: узкий квадрат с резонансом — носовой тембр
  oboe: (p) => {
    const f = hz(p.m)
    tone({ ...p, f, wave: "square", lp: 1500, q: 3, gain: p.gain * 0.7, attack: 0.04, hold: 0.7, vib: [5, f * 0.01], vibDelay: 0.18 })
  },
  // Медь: две расстроенные пилы, фильтр раскрывается на атаке
  brass: (p) => {
    const f = hz(p.m)
    for (const d of [-6, 6])
      tone({ ...p, f, wave: "sawtooth", lp: 450, lpPeak: 2800, lpEnd: 1300, q: 1.5, attack: 0.035, hold: 0.7, detune: d, gain: p.gain * 0.6, vib: [5, f * 0.008], vibDelay: 0.25 })
  },
  // Струнные: три пилы с медленной атакой и лёгким хоровым вибрато
  strings: (p) => {
    const f = hz(p.m)
    for (const d of [-11, 0, 11])
      tone({ ...p, f, wave: "sawtooth", lp: 2000, attack: Math.min(0.2, p.dur * 0.3), hold: 0.8, detune: d, gain: p.gain * 0.4, vib: [5.8, f * 0.005] })
  },
  // Арфа: щипок с быстрым спадом и тихим октавным призвуком
  harp: (p) => {
    const f = hz(p.m)
    const dur = Math.max(0.6, p.dur)
    tone({ ...p, dur, f, wave: "triangle", attack: 0.002 })
    tone({ ...p, dur: dur * 0.5, f: f * 2, gain: p.gain * 0.3, attack: 0.002 })
  },
  // Пиццикато: короткий щипок
  pizz: (p) => {
    const f = hz(p.m)
    tone({ ...p, dur: 0.18, f, wave: "triangle", attack: 0.002 })
    tone({ ...p, dur: 0.1, f, wave: "square", lp: 1200, gain: p.gain * 0.3, attack: 0.002 })
  },
  // Бас пальцами: треугольник с квадратом под мягким фильтром
  bass: (p) => {
    const f = hz(p.m)
    tone({ ...p, f, wave: "triangle", attack: 0.004, hold: 0.25 })
    tone({ ...p, f, wave: "square", lp: 700, gain: p.gain * 0.35, attack: 0.004, hold: 0.25 })
  },
  // Слэп-бас: щелчок фильтра на атаке
  slap: (p) => {
    const f = hz(p.m)
    tone({ ...p, f, wave: "sawtooth", lp: 300, lpPeak: 2200, lpEnd: 400, attack: 0.004, hold: 0.15, gain: p.gain * 0.7 })
    tone({ ...p, f, wave: "triangle", attack: 0.004, hold: 0.2, gain: p.gain * 0.6 })
  }
}

/** Мелодия инструментом: [нота, длительность в долях], «.» — пауза. Возвращает время конца. */
function phrase(at: number, notes: [string, number][], beat: number, inst: InstName, gain: number, out?: AudioNode, send?: AudioNode): number {
  let t = at
  for (const [n, len] of notes) {
    if (n !== ".") INST[inst]({ at: t, m: midi(n), dur: len * beat * 0.95, gain, out, send })
    t += len * beat
  }
  return t
}

function chordOn(at: number, names: string[], dur: number, inst: InstName, gain: number, out?: AudioNode, send?: AudioNode): void {
  for (const n of names) INST[inst]({ at, m: midi(n), dur, gain, out, send })
}

/* ---------- Ударные SNES ---------- */

/** Маршевый малый барабан: шум с «телом»; эхо даёт ему характерный хвост. */
function snare(at: number, gain: number, out?: AudioNode, send?: AudioNode): void {
  hiss({ at, dur: 0.16, gain, f: 1100, filter: "highpass", out, send })
  hiss({ at, dur: 0.05, gain: gain * 0.6, f: 3500, q: 1.2, out })
  tone({ at, dur: 0.08, f: 210, to: 160, wave: "triangle", gain: gain * 0.6, out })
}

/** Литавры: низкий тон с обертоном 1.5 и мягкий удар колотушки. */
function timpani(at: number, m: number, gain: number, out?: AudioNode, send?: AudioNode): void {
  const f = hz(m)
  tone({ at, dur: 1, f, to: f * 0.97, gain, out, send })
  tone({ at, dur: 0.45, f: f * 1.5, gain: gain * 0.3, out })
  hiss({ at, dur: 0.08, gain: gain * 0.5, f: 400, filter: "lowpass", out })
}

/** Дробь литавр с нарастанием. */
function timpaniRoll(at: number, m: number, dur: number, gain: number, out?: AudioNode, send?: AudioNode): void {
  const n = Math.max(3, Math.round(dur / 0.045))
  for (let i = 0; i < n; i++) timpani(at + (i * dur) / n, m, gain * (0.3 + (0.7 * i) / n), out, send)
}

/** Тарелка: длинный шипящий хвост. */
function crash(at: number, gain: number, out?: AudioNode, send?: AudioNode): void {
  hiss({ at, dur: 1.4, gain, f: 5000, filter: "highpass", out, send })
  hiss({ at, dur: 0.6, gain: gain * 0.5, f: 9000, q: 0.8, out })
}

/** Оркестровый стаб: медь и струнные аккордом плюс щелчок — визитная карточка боевых тем SNES. */
function stab(at: number, ms: number[], gain: number, out?: AudioNode, send?: AudioNode): void {
  for (const m of ms) {
    INST.brass({ at, m, dur: 0.22, gain, out, send })
    INST.strings({ at, m: m + 12, dur: 0.18, gain: gain * 0.6, out })
  }
  hiss({ at, dur: 0.08, gain: gain * 2, f: 3000, filter: "lowpass", out })
}

/* ---------- Эффекты ---------- */

/** Короткие эффекты интерфейса и боя. */
export function sfx(kind: SfxKind): void {
  const c = live(kind)
  if (!c) return
  const t = c.currentTime + 0.005
  switch (kind) {
    case "tap":
      return tone({ at: t, dur: 0.045, f: 900, to: 1300, gain: 0.1 })
    case "select":
      tone({ at: t, dur: 0.07, f: 660, wave: "triangle", gain: 0.16 })
      return tone({ at: t + 0.05, dur: 0.1, f: 990, wave: "triangle", gain: 0.14 })
    case "aim":
      tone({ at: t, dur: 0.07, f: hz(midi("E5")), wave: "square", lp: 1800, gain: 0.06 })
      return tone({ at: t + 0.07, dur: 0.12, f: hz(midi("A5")), wave: "square", lp: 1800, gain: 0.06 })
    case "land":
      thud(t, 0.35, 170, 0.12)
      return hiss({ at: t, dur: 0.08, gain: 0.18, f: 600, filter: "lowpass" })
    case "step":
      return hiss({ at: t, dur: 0.05, gain: 0.1, f: 500, filter: "lowpass" })
    case "stepHeavy":
      thud(t, 0.3, 120, 0.1)
      return hiss({ at: t, dur: 0.08, gain: 0.16, f: 300, filter: "lowpass" })
    case "hurt":
      thud(t, 0.45)
      return hiss({ at: t, dur: 0.12, gain: 0.3, f: 1800, to: 500, filter: "lowpass" })
    case "heal":
      ;["C6", "E6", "G6", "C7"].forEach((n, i) => {
        tone({ at: t + i * 0.07, dur: 0.5, f: hz(midi(n)), gain: 0.11 })
        tone({ at: t + i * 0.07, dur: 0.5, f: hz(midi(n)) / 2, wave: "triangle", gain: 0.06 })
      })
      return hiss({ at: t, dur: 0.6, gain: 0.05, f: 7000, filter: "highpass", attack: 0.15 })
    case "buff":
      tone({ at: t, dur: 0.12, f: hz(midi("A5")), wave: "square", lp: 2200, gain: 0.07 })
      return tone({ at: t + 0.08, dur: 0.22, f: hz(midi("E6")), wave: "square", lp: 2200, gain: 0.07 })
    case "debuff":
      tone({ at: t, dur: 0.12, f: hz(midi("E5")), wave: "square", lp: 1200, gain: 0.07 })
      return tone({ at: t + 0.09, dur: 0.28, f: hz(midi("A#4")), to: hz(midi("G4")), wave: "square", lp: 1200, gain: 0.07 })
    case "levelUp": {
      // Глиссандо арфы и аккорд меди с колокольчиком на вершине
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      const end = phrase(t, [["C5", 1], ["E5", 1], ["G5", 1], ["C6", 1], ["E6", 1], ["G6", 1]], 0.05, "harp", 0.12, o, e)
      chordOn(end, ["C5", "E5", "G5"], 0.75, "brass", 0.06, o, e)
      INST.flute({ at: end, m: midi("C6"), dur: 0.75, gain: 0.08, out: o, send: e })
      return bell(end, hz(midi("C7")), 0.06, 0.8)
    }
    case "loot":
      tone({ at: t, dur: 0.08, f: hz(midi("B5")), wave: "square", lp: 4000, gain: 0.08 })
      return tone({ at: t + 0.08, dur: 0.35, f: hz(midi("E6")), wave: "square", lp: 4000, gain: 0.08 })
    case "wall":
      hiss({ at: t, dur: 0.22, gain: 0.5, f: 4000, to: 300, filter: "lowpass" })
      hiss({ at: t, dur: 0.05, gain: 0.3, f: 1800, q: 4 })
      return tone({ at: t, dur: 0.12, f: 110, to: 60, wave: "square", lp: 600, gain: 0.18 })
    case "portal":
      hiss({ at: t, dur: 0.6, gain: 0.35, f: 3000, to: 200, q: 3, attack: 0.1 })
      return tone({ at: t, dur: 0.5, f: 600, to: 80, wave: "sawtooth", lp: 1200, gain: 0.1 })
    case "special":
      // Разгон и аккорд-удар под заставку приёма
      hiss({ at: t, dur: 0.35, gain: 0.35, f: 200, to: 4000, attack: 0.3 })
      stab(t + 0.3, ["D4", "F#4", "A4", "D5"].map(midi), 0.06, jingleIn ?? undefined, jingleEcho ?? undefined)
      return thud(t + 0.3, 0.6, 90, 0.4)
    case "phasePlayer": {
      // Фанфара меди «та-та-та-там» под дробь малого барабана
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      const b = 0.09
      for (let i = 0; i < 3; i++) {
        INST.brass({ at: t + i * b, m: midi("A4"), dur: b * 0.85, gain: 0.09, out: o, send: e })
        snare(t + i * b, 0.16, o, e)
      }
      chordOn(t + 3 * b, ["F#4", "A4", "D5"], 0.6, "brass", 0.07, o, e)
      chordOn(t + 3 * b, ["D4", "A4"], 0.7, "strings", 0.06, o, e)
      return crash(t + 3 * b, 0.12, o, e)
    }
    case "phaseEnemy": {
      // Дробь литавр и мрачный уменьшённый аккорд низкой меди
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      timpaniRoll(t, midi("E3"), 0.32, 0.55, o, e)
      timpani(t + 0.34, midi("E3"), 0.7, o, e)
      chordOn(t + 0.34, ["E3", "G3", "A#3"], 0.9, "brass", 0.08, o, e)
      chordOn(t + 0.34, ["E4", "A#4"], 1, "strings", 0.05, o, e)
      return crash(t + 0.34, 0.08, o, e)
    }
    case "victory": {
      // Фанфара меди со струнными, дробь литавр, финальный удар с тарелкой и глиссандо арфы
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      const beat = 0.14
      timpaniRoll(t, midi("C3"), beat * 3, 0.4, o, e)
      const end = phrase(t, [["G4", 1], ["C5", 1], ["E5", 1], ["G5", 2], ["E5", 1], ["G5", 1], ["C6", 6]], beat, "brass", 0.1, o, e)
      phrase(t, [["E4", 1], ["G4", 1], ["C5", 1], ["E5", 2], ["C5", 1], ["E5", 1], ["G5", 6]], beat, "strings", 0.05, o, e)
      const hit = end - beat * 6
      timpani(hit, midi("C3"), 0.7, o, e)
      crash(hit, 0.14, o, e)
      chordOn(hit, ["C4", "E4", "G4"], beat * 6, "strings", 0.05, o, e)
      INST.bass({ at: hit, m: midi("C3"), dur: beat * 6, gain: 0.2, out: o })
      return void phrase(hit, [["C5", 1], ["E5", 1], ["G5", 1], ["C6", 1], ["E6", 1], ["G6", 1], ["C7", 3]], 0.045, "harp", 0.08, o, e)
    }
    case "defeat": {
      // Гобой нисходит над струнными в ля миноре, в конце — тихий щипок арфы
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      const end = phrase(t, [["E5", 2], ["D5", 2], ["C5", 2], ["B4", 2], ["A4", 6]], 0.22, "oboe", 0.12, o, e)
      chordOn(t, ["A3", "C4", "E4"], 3.4, "strings", 0.05, o, e)
      INST.bass({ at: t, m: midi("A2"), dur: 3.2, gain: 0.15, out: o })
      timpani(t, midi("A2"), 0.4, o, e)
      return void phrase(end - 1.2, [["A4", 1], ["C5", 1], ["E5", 1], ["A5", 3]], 0.12, "harp", 0.06, o, e)
    }
    case "retreat": {
      const o = jingleIn ?? undefined
      const e = jingleEcho ?? undefined
      phrase(t, [["A4", 2], ["G4", 2], ["E4", 4]], 0.16, "flute", 0.12, o, e)
      return chordOn(t, ["E4", "G4", "B4"], 1.4, "strings", 0.04, o, e)
    }
    case "deathPlayer":
      // Жалобное «мяу» с дрожью и глухой удар о землю
      tone({ at: t, dur: 0.7, f: 1100, to: 520, gain: 0.2, attack: 0.03, vib: [7, 25] })
      tone({ at: t, dur: 0.7, f: 550, to: 260, wave: "triangle", gain: 0.08, attack: 0.03 })
      return thud(t + 0.5, 0.5, 130, 0.25)
    case "deathEnemy":
      tone({ at: t, dur: 0.8, f: 140, to: 60, wave: "sawtooth", lp: 500, gain: 0.3, attack: 0.08 })
      hiss({ at: t, dur: 0.6, gain: 0.15, f: 300, attack: 0.1 })
      return thud(t + 0.5, 0.5, 120, 0.25)
  }
}

type Family = "blade" | "blunt" | "bow" | "dark" | "holy"

function family(w: WeaponSkill): Family {
  switch (w) {
    case "sword":
    case "spear":
      return "blade"
    case "axe":
    case "gauntlet":
      return "blunt"
    case "bow":
      return "bow"
    case "blackMagic":
      return "dark"
    case "whiteMagic":
      return "holy"
  }
}

/** Замах, выстрел или каст — в начале удара. */
export function swingSfx(weapon: WeaponSkill): void {
  const c = live("swing")
  if (!c) return
  const t = c.currentTime + 0.005
  switch (weapon) {
    case "sword":
      return hiss({ at: t, dur: 0.17, gain: 0.45, f: 500, to: 2600, q: 1.5, attack: 0.05 })
    case "spear":
      return hiss({ at: t, dur: 0.11, gain: 0.4, f: 900, to: 3200, q: 2, attack: 0.03 })
    case "axe":
      return hiss({ at: t, dur: 0.24, gain: 0.55, f: 250, to: 1300, q: 1.2, attack: 0.08 })
    case "gauntlet":
      return hiss({ at: t, dur: 0.12, gain: 0.45, f: 350, to: 1500, attack: 0.04 })
    case "bow":
      tone({ at: t, dur: 0.28, f: 392, to: 370, wave: "triangle", gain: 0.3 })
      tone({ at: t, dur: 0.04, f: 784, wave: "square", lp: 2000, gain: 0.08 })
      return hiss({ at: t + 0.02, dur: 0.15, gain: 0.12, f: 3000, filter: "highpass" })
    case "blackMagic":
      tone({ at: t, dur: 0.4, f: 98, to: 392, wave: "sawtooth", lp: 900, gain: 0.18, attack: 0.15 })
      tone({ at: t, dur: 0.4, f: 99, to: 396, wave: "sawtooth", lp: 900, gain: 0.18, attack: 0.15, detune: 12 })
      return hiss({ at: t, dur: 0.4, gain: 0.2, f: 300, to: 1500, attack: 0.2 })
    case "whiteMagic":
      ;[1047, 1319, 1568, 2093].forEach((f, i) => tone({ at: t + i * 0.05, dur: 0.3, f, gain: 0.1 }))
      return hiss({ at: t, dur: 0.4, gain: 0.07, f: 6000, filter: "highpass", attack: 0.1 })
  }
}

/** Контакт удара: блок, попадание, приём, добивание. */
export function strikeSfx(s: StrikeSound): void {
  const c = live("strike")
  if (!c) return
  const t = c.currentTime + 0.005
  if (s.damage <= 0) return clank(t)
  const power = Math.min(1, 0.45 + s.frac * 1.2)
  switch (family(s.weapon)) {
    case "blade":
      hiss({ at: t, dur: 0.09, gain: 0.35 * power, f: 2500, filter: "highpass" })
      thud(t, 0.55 * power)
      break
    case "blunt":
      thud(t, 0.85 * power, 120, 0.22)
      hiss({ at: t, dur: 0.15, gain: 0.4 * power, f: 1200, filter: "lowpass" })
      break
    case "bow":
      tone({ at: t, dur: 0.09, f: 260, to: 90, wave: "triangle", gain: 0.45 })
      hiss({ at: t, dur: 0.05, gain: 0.3, f: 900, q: 2 })
      thud(t, 0.35 * power)
      break
    case "dark":
      hiss({ at: t, dur: 0.5, gain: 0.5 * power, f: 1200, to: 120, filter: "lowpass" })
      tone({ at: t, dur: 0.45, f: 110, to: 40, gain: 0.6 * power })
      break
    case "holy":
      tone({ at: t, dur: 0.6, f: 1568, gain: 0.12 })
      tone({ at: t, dur: 0.5, f: 2349, gain: 0.07 })
      hiss({ at: t, dur: 0.3, gain: 0.15, f: 5000, filter: "highpass" })
      thud(t, 0.35 * power)
      break
  }
  // Шлепок по телу — общий для всех попаданий
  hiss({ at: t, dur: 0.12, gain: 0.3 * power, f: 1800, to: 500, filter: "lowpass" })
  if (s.effective) tone({ at: t + 0.02, dur: 0.25, f: 2637, gain: 0.1 })
  if (s.special) {
    hiss({ at: t, dur: 0.3, gain: 0.45, f: 1800, filter: "highpass" })
    tone({ at: t, dur: 0.5, f: 70, to: 30, gain: 0.7 })
  }
  if (s.lethal) {
    hiss({ at: t + 0.04, dur: 0.35, gain: 0.45, f: 500, to: 140, q: 2 })
    tone({ at: t + 0.02, dur: 0.6, f: 55, to: 28, gain: 0.6 })
  }
}

/* ---------- Музыка ---------- */

interface ThemeDef {
  bpm: number
  /** По аккорду на такт, через пробел: «D», «Bm», «F#m». */
  chords: string
  /** По строке на такт: 8 восьмых — нота, «-» тянуть предыдущую, «.» пауза. */
  lead: string[]
  leadInst: InstName
  leadGain: number
  /** Сдвиг мелодии в полутонах. */
  leadShift: number
  /** Удвоение мелодии другим инструментом; `shift` — относительно мелодии. */
  double: { inst: InstName, shift: number, gain: number } | null
  /** Аккорд на весь такт. */
  padInst: InstName
  padGain: number
  /** 8 восьмых: смещение баса от тоники аккорда в полутонах, null — пауза. */
  bass: (number | null)[]
  bassInst: InstName
  bassGain: number
  /** Ломаный аккорд: 8 восьмых — номер звука аккорда (0–5, вверх через октаву), null — пауза. */
  arp: { inst: InstName, gain: number, pattern: (number | null)[] } | null
  /** Шестнадцатые такта с оркестровым стабом. */
  stab: number[]
  stabGain: number
  /** 16 шестнадцатых: «x» — удар, «r» — дробь (у малого барабана). */
  kick: string
  snare: string
  hat: string
  drumGain: number
  /** Каждые N тактов: удар литавр по тонике и тарелка (0 — нет). */
  timpani: number
  crash: number
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  // Главная тема: тёплый ре мажор — флейта на фоне струнных и арфы, бас пальцами, лёгкий ритм с эхом
  main: {
    bpm: 92,
    chords: "D A Bm G D A G A Bm G D A Bm G Em A",
    lead: [
      "D5 - F#5 - A5 - - F#5",
      "E5 - - C#5 E5 - A5 -",
      "F#5 - - D5 F#5 - B5 -",
      "A5 - G5 - F#5 - E5 -",
      "D5 - F#5 - A5 - D6 -",
      "C#6 - B5 - A5 - E5 -",
      "G5 - F#5 - E5 - D5 E5",
      "C#5 - - - A4 . . .",
      "B4 - D5 - F#5 - - E5",
      "D5 - - B4 G5 - - F#5",
      "F#5 - A5 - - F#5 E5 D5",
      "E5 - - - . . A4 C#5",
      "D5 - F#5 - B5 - A5 -",
      "G5 - B5 - D6 - B5 -",
      "G5 - F#5 - E5 - G5 -",
      "A5 - - - C#5 - E5 -"
    ],
    leadInst: "flute",
    leadGain: 0.1,
    leadShift: 0,
    double: null,
    padInst: "strings",
    padGain: 0.028,
    bass: [0, null, null, 0, null, null, 7, null],
    bassInst: "bass",
    bassGain: 0.2,
    arp: { inst: "harp", gain: 0.055, pattern: [0, 1, 2, 3, 4, 3, 2, 1] },
    stab: [],
    stabGain: 0,
    kick: "x.......x.......",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    drumGain: 0.18,
    timpani: 0,
    crash: 16
  },
  // Боевая тема: ми минор — медь ведёт мелодию, струнные удваивают октавой выше, слэп-бас, марш с дробью,
  // оркестровые стабы, литавры и тарелки на стыках фраз
  battle: {
    bpm: 148,
    chords: "Em C D Em Em C D B Am Em C D Am C B B",
    lead: [
      "E5 - - B4 E5 - G5 -",
      "G5 - E5 - C5 - E5 -",
      "F#5 - - D5 A5 - F#5 -",
      "G5 - F#5 - E5 - - -",
      "B5 - - G5 E5 - B5 -",
      "C6 - B5 - G5 - E5 -",
      "D6 - C6 - B5 - A5 -",
      "D#5 - F#5 - B5 - - -",
      "A5 - - E5 A5 - C6 -",
      "B5 - - G5 E5 - - -",
      "E5 - G5 - C6 - B5 -",
      "A5 - - F#5 D5 - - -",
      "C6 - B5 - A5 - E5 -",
      "G5 - E5 - C5 - E5 -",
      "D#5 - - F#5 B5 - - -",
      "A5 - G5 - F#5 - D#5 -"
    ],
    leadInst: "brass",
    leadGain: 0.085,
    leadShift: -12,
    double: { inst: "strings", shift: 12, gain: 0.05 },
    padInst: "strings",
    padGain: 0.022,
    bass: [0, 0, 12, 0, 0, 0, 12, 0],
    bassInst: "slap",
    bassGain: 0.17,
    arp: null,
    stab: [0],
    stabGain: 0.045,
    kick: "x.....x.x.....x.",
    snare: "....x..x....x.rr",
    hat: "x.x.x.x.x.x.x.x.",
    drumGain: 0.38,
    timpani: 4,
    crash: 8
  }
}

interface Note {
  m: number
  /** В восьмых. */
  len: number
}

interface Bar {
  /** Тоника аккорда, высота 0–11. */
  root: number
  third: number
  lead: (Note | null)[]
}

interface Compiled extends ThemeDef {
  bars: Bar[]
}

const compiled = new Map<MusicTheme, Compiled>()

function compile(name: MusicTheme): Compiled {
  const hit = compiled.get(name)
  if (hit) return hit
  const def = THEMES[name]
  const bars = def.chords.split(" ").map((ch, i): Bar => {
    const m = /^([A-G])([#b]?)(m?)$/.exec(ch)
    if (!m) throw new Error(`Аккорд? ${ch}`)
    const root = ((PITCH[m[1] ?? "C"] ?? 0) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12
    const tokens = (def.lead[i] ?? "").split(" ")
    const lead = tokens.map((tok, slot): Note | null => {
      if (tok === "-" || tok === "." || !tok) return null
      let len = 1
      while (tokens[slot + len] === "-") len++
      return { m: midi(tok), len }
    })
    return { root, third: m[3] ? 3 : 4, lead }
  })
  const out = { ...def, bars }
  compiled.set(name, out)
  return out
}

interface Player {
  name: MusicTheme
  theme: Compiled
  out: GainNode
  step: number
  nextAt: number
  timer: number
}

let player: Player | null = null

/**
 * Включить тему (с плавным входом через `delay` секунд) или выключить музыку (null).
 * До первого жеста запоминается и стартует при разблокировке звука.
 */
export function playMusic(theme: MusicTheme | null, delay = 0): void {
  wanted = { theme, delay }
  if (!ctx) return
  if (!theme) return stopPlayer(0.8)
  startTheme(theme, delay)
}

/** Плавно заглушить музыку (перед джинглом итога боя). */
export function stopMusic(fade = 0.6): void {
  wanted = { theme: null, delay: 0 }
  stopPlayer(fade)
}

function startTheme(name: MusicTheme, delay: number): void {
  const c = ctx
  if (!c || !musicIn) return
  if (player?.name === name) return
  stopPlayer(0.8)
  const now = c.currentTime
  const out = c.createGain()
  out.gain.setValueAtTime(0, now + delay)
  out.gain.linearRampToValueAtTime(1, now + delay + 1.2)
  out.connect(musicIn)
  const theme = compile(name)
  const p: Player = { name, theme, out, step: 0, nextAt: now + delay + 0.05, timer: 0 }
  p.timer = window.setInterval(() => tick(p), 25)
  player = p
  tick(p)
}

function stopPlayer(fade: number): void {
  const c = ctx
  const p = player
  if (!c || !p) return
  player = null
  window.clearInterval(p.timer)
  const now = c.currentTime
  p.out.gain.cancelScheduledValues(now)
  p.out.gain.setValueAtTime(p.out.gain.value, now)
  p.out.gain.linearRampToValueAtTime(0, now + fade)
  window.setTimeout(() => p.out.disconnect(), (fade + 2.5) * 1000)
}

/** Опережающее планирование: ноты ставятся в очередь на 150 мс вперёд, таймер лишь подкидывает новые. */
function tick(p: Player): void {
  const c = ctx
  if (!c || c.state !== "running") return
  const step = 60 / p.theme.bpm / 4
  // После паузы или троттлинга вкладки не догоняем пропущенное — продолжаем с текущего момента
  if (p.nextAt < c.currentTime - 0.2) p.nextAt = c.currentTime + 0.05
  while (p.nextAt < c.currentTime + 0.15) {
    scheduleStep(p, p.step, p.nextAt, step)
    p.step++
    p.nextAt += step
  }
}

function scheduleStep(p: Player, n: number, at: number, step: number): void {
  const t = p.theme
  const barNo = Math.floor(n / 16) % t.bars.length
  const bar = t.bars[barNo]
  if (!bar) return
  const s = n % 16
  const out = p.out
  // Эхо — на всём, кроме баса и бочки: так звучали SNES-миксы
  const send = musicEcho ?? undefined
  const g = t.drumGain
  if (s === 0) {
    for (const iv of [0, bar.third, 7]) {
      let m = 60 + bar.root + iv
      if (m > 69) m -= 12
      INST[t.padInst]({ at, m, dur: step * 16.3, gain: t.padGain, out, send })
    }
    if (t.timpani && barNo % t.timpani === 0) timpani(at, 48 + bar.root - (bar.root > 7 ? 12 : 0), g * 0.6, out, send)
    if (t.crash && barNo % t.crash === 0) crash(at, g * 0.35, out, send)
  }
  if (t.stab.includes(s)) {
    const r = 60 + bar.root - (bar.root > 5 ? 12 : 0)
    stab(at, [r, r + bar.third, r + 7], t.stabGain, out, send)
  }
  if (s % 2 === 0) {
    const slot = s / 2
    const b = t.bass[slot]
    if (b !== null && b !== undefined) INST[t.bassInst]({ at, m: 48 + bar.root + b, dur: step * 1.8, gain: t.bassGain, out })
    const note = bar.lead[slot]
    if (note) {
      const dur = note.len * step * 2 * 0.95
      INST[t.leadInst]({ at, m: note.m + t.leadShift, dur, gain: t.leadGain, out, send })
      if (t.double) INST[t.double.inst]({ at, m: note.m + t.leadShift + t.double.shift, dur, gain: t.double.gain, out, send })
    }
    const idx = t.arp?.pattern[slot]
    if (t.arp && idx !== null && idx !== undefined) {
      const tones = [0, bar.third, 7, 12, 12 + bar.third, 19]
      const base = 60 + bar.root - (bar.root >= 6 ? 12 : 0)
      INST[t.arp.inst]({ at, m: base + (tones[idx] ?? 0), dur: step * 4, gain: t.arp.gain, out, send })
    }
  }
  if (t.kick[s] === "x") thud(at, 0.9 * g, 120, 0.2, out)
  const sn = t.snare[s]
  if (sn === "x") snare(at, 0.5 * g, out, send)
  else if (sn === "r") {
    snare(at, 0.3 * g, out, send)
    snare(at + step / 2, 0.38 * g, out, send)
  }
  if (t.hat[s] === "x") hiss({ at, dur: s % 4 === 0 ? 0.05 : 0.03, gain: 0.2 * g, f: 8000, filter: "highpass", out })
}

/* ---------- Гибель ---------- */

/** Моменты анимаций гибели (deathFx): у каждого варианта свои звуки в ключевых кадрах. */
export type DeathCue
  = | "killHit"
    | "bodyFall"
    | "bodyFallLight"
    | "squirt"
    | "fountain"
    | "drip"
    | "splatSmall"
    | "gibsBurst"
    | "fuse"
    | "explosion"
    | "stretch"
    | "squash"
    | "launch"
    | "twinkle"
    | "dissolve"
    | "drill"
    | "drillEnd"
    | "petrify"
    | "crackStone"
    | "shatterStone"
    | "freeze"
    | "glint"
    | "iceCrack"
    | "shatterIce"
    | "zap"
    | "sink"
    | "plop"
    | "slice"
    | "headBonk"
    | "slideWet"
    | "stab"
    | "pull"
    | "arrow"
    | "ignite"
    | "blink"
    | "windAsh"
    | "ascend"
    | "inflate"
    | "pop"
    | "deflate"
    | "tooth"
    | "dizzy"
    | "slam"
    | "koBell"
    | "zombieSettle"
    | "boneCreak"
    | "grr"
    | "melt"
    | "bones"

/** Мокрый шлепок: узкая полоса шума с падающей частотой и «бульк» снизу. */
function squelch(at: number, gain: number, f = 700): void {
  hiss({ at, dur: 0.14, gain: gain * 1.6, f, to: f * 0.35, q: 5 })
  tone({ at, dur: 0.08, f: f * 0.4, to: f * 0.15, wave: "triangle", gain: gain * 0.5 })
}

/** Треск: россыпь коротких щелчков (кости, угли, камень). */
function crackle(at: number, dur: number, gain: number, f = 2000): void {
  const n = Math.round(dur * 60) + 2
  for (let i = 0; i < n; i++)
    hiss({ at: at + Math.random() * dur, dur: 0.006 + Math.random() * 0.008, gain: gain * (0.5 + Math.random()), f: f + Math.random() * 3000, filter: "highpass" })
}

/** Пузыри: короткие сигналы с растущей частотой. */
function bubbles(at: number, dur: number, n: number, gain = 0.12): void {
  for (let i = 0; i < n; i++) {
    const f = 250 + Math.random() * 300
    tone({ at: at + (i / n) * dur + Math.random() * 0.05, dur: 0.05, f, to: f * 2.2, gain })
  }
}

/** Колокол: негармоничные обертоны. */
function bell(at: number, f: number, gain: number, dur = 0.6): void {
  ;[[1, 1], [2.32, 0.55], [4.25, 0.3]].forEach(([k, g]) => tone({ at, dur: dur * (1.2 - (k ?? 1) * 0.12), f: f * (k ?? 1), gain: gain * (g ?? 1) }))
}

/**
 * Звук момента гибели. `speed` — скорость анимации: длинные звуки (сверло, горение, вознесение) сжимаются вместе
 * с ней; `n` — номер повтора (ступень раздувания шарика).
 */
export function deathSfx(cue: DeathCue, speed = 1, n = 0): void {
  const c = live(`death:${cue}`)
  if (!c) return
  const t = c.currentTime + 0.005
  const L = (sec: number): number => sec / Math.max(0.5, speed)
  switch (cue) {
    case "killHit":
      thud(t, 0.5, 120, 0.15)
      return squelch(t, 0.35, 600)
    case "bodyFall":
      thud(t, 0.7, 110, 0.22)
      hiss({ at: t, dur: 0.18, gain: 0.35, f: 900, to: 200, filter: "lowpass" })
      return squelch(t + 0.01, 0.2, 500)
    case "bodyFallLight":
      thud(t, 0.45, 140, 0.14)
      return hiss({ at: t, dur: 0.1, gain: 0.25, f: 700, filter: "lowpass" })
    case "squirt":
      return hiss({ at: t, dur: L(0.4), gain: 0.22, f: 1800, to: 900, q: 2, attack: 0.02 })
    case "fountain":
      hiss({ at: t, dur: L(0.9), gain: 0.22, f: 1400, q: 1.5, attack: 0.05 })
      return bubbles(t + 0.1, L(0.7), 4, 0.06)
    case "drip":
      return tone({ at: t, dur: 0.035, f: 1200, to: 2400, gain: 0.07 })
    case "splatSmall":
      thud(t, 0.2, 160, 0.08)
      return squelch(t, 0.3, 650)
    case "gibsBurst":
      thud(t, 1, 90, 0.4)
      squelch(t, 0.6, 750)
      squelch(t + 0.05, 0.5, 420)
      hiss({ at: t, dur: 0.08, gain: 0.4, f: 2500, q: 3 })
      return crackle(t, 0.15, 0.3)
    case "fuse":
      // Раздувается перед взрывом: шипение фитиля и резиновый подъём
      hiss({ at: t, dur: L(0.28), gain: 0.14, f: 4000, filter: "highpass" })
      tone({ at: t, dur: L(0.28), f: 200, to: 900, wave: "sawtooth", lp: 1500, gain: 0.08 })
      return tone({ at: t, dur: L(0.28), f: 120, to: 260, wave: "square", lp: 600, gain: 0.07, vib: [30, 15] })
    case "explosion":
      thud(t, 1, 70, 0.7)
      hiss({ at: t, dur: 1, gain: 0.7, f: 3000, to: 150, filter: "lowpass" })
      hiss({ at: t, dur: 0.4, gain: 0.4, f: 600, q: 0.7 })
      squelch(t + 0.02, 0.4, 500)
      return crackle(t + 0.05, 0.5, 0.25)
    case "stretch":
      return tone({ at: t, dur: L(0.09), f: 300, to: 700, wave: "triangle", gain: 0.12 })
    case "squash":
      // «ШМЯК!»: тяжёлый удар, мокрый шлепок и мультяшное падение тона
      thud(t, 1, 100, 0.3)
      squelch(t, 0.7, 500)
      tone({ at: t, dur: 0.15, f: 400, to: 80, wave: "square", lp: 1500, gain: 0.12 })
      return hiss({ at: t, dur: 0.2, gain: 0.4, f: 1500, filter: "lowpass" })
    case "launch":
      // Удар и свист улетающего тела
      thud(t, 0.7, 180, 0.15)
      hiss({ at: t, dur: 0.05, gain: 0.4, f: 3000, filter: "highpass" })
      return tone({ at: t + 0.05, dur: L(0.65), f: 1800, to: 500, gain: 0.1, vib: [6, 30] })
    case "twinkle":
      tone({ at: t, dur: 0.3, f: 2637, gain: 0.1 })
      return tone({ at: t + 0.06, dur: 0.35, f: 3520, gain: 0.08 })
    case "dissolve":
      hiss({ at: t, dur: L(0.9), gain: 0.18, f: 3000, to: 6000, filter: "highpass", attack: 0.2 })
      crackle(t, L(0.9), 0.1, 4000)
      return tone({ at: t, dur: L(0.7), f: 400, to: 100, wave: "sawtooth", lp: 800, gain: 0.06 })
    case "drill":
      tone({ at: t, dur: L(0.82), f: 80, to: 400, wave: "sawtooth", lp: 900, gain: 0.12, vib: [24, 20] })
      return hiss({ at: t, dur: L(0.82), gain: 0.3, f: 300, to: 1200, q: 1.5, attack: 0.05 })
    case "drillEnd":
      thud(t, 0.8, 90, 0.3)
      return hiss({ at: t, dur: 0.2, gain: 0.3, f: 600, filter: "lowpass" })
    case "petrify":
      tone({ at: t, dur: L(0.45), f: 60, to: 45, wave: "sawtooth", lp: 300, gain: 0.25 })
      hiss({ at: t, dur: L(0.45), gain: 0.25, f: 500, filter: "lowpass" })
      return crackle(t, L(0.45), 0.12, 1500)
    case "crackStone":
      hiss({ at: t, dur: 0.05, gain: 0.5, f: 2500, q: 5 })
      return crackle(t, 0.08, 0.4, 1500)
    case "shatterStone":
      thud(t, 0.6, 120, 0.2)
      crackle(t, 0.4, 0.45, 1200)
      return hiss({ at: t, dur: 0.35, gain: 0.45, f: 2500, to: 400, filter: "lowpass" })
    case "freeze":
      hiss({ at: t, dur: L(0.38), gain: 0.2, f: 6000, filter: "highpass", attack: 0.1 })
      crackle(t, L(0.38), 0.15, 4000)
      return [1568, 2093, 2637].forEach((f, i) => tone({ at: t + L(i * 0.1), dur: 0.5, f, gain: 0.05 }))
    case "glint":
      tone({ at: t, dur: 0.25, f: 3136, gain: 0.09 })
      return tone({ at: t + 0.05, dur: 0.3, f: 4186, gain: 0.06 })
    case "iceCrack":
      hiss({ at: t, dur: 0.04, gain: 0.45, f: 3000, filter: "highpass" })
      return tone({ at: t, dur: 0.06, f: 3200, to: 1800, gain: 0.08 })
    case "shatterIce":
      // Звонкая россыпь осколков
      for (let i = 0; i < 9; i++) tone({ at: t + Math.random() * 0.18, dur: 0.15, f: 2000 + Math.random() * 4000, gain: 0.07 })
      hiss({ at: t, dur: 0.4, gain: 0.35, f: 4000, filter: "highpass" })
      return thud(t, 0.3, 140, 0.12)
    case "zap":
      tone({ at: t, dur: 0.07, f: 90, wave: "sawtooth", lp: 4000, gain: 0.2, vib: [60, 40] })
      hiss({ at: t, dur: 0.07, gain: 0.35, f: 2000, filter: "highpass" })
      return crackle(t, 0.07, 0.3, 3000)
    case "sink":
      bubbles(t, L(0.9), 8)
      hiss({ at: t, dur: L(0.9), gain: 0.2, f: 500, filter: "lowpass", attack: 0.1 })
      return tone({ at: t, dur: L(0.9), f: 200, to: 90, gain: 0.1 })
    case "plop":
      return tone({ at: t, dur: 0.07, f: 180, to: 600, gain: 0.25 })
    case "slice":
      // Свист клинка, звон и мокрый разрез
      hiss({ at: t, dur: 0.12, gain: 0.45, f: 3500, filter: "highpass", attack: 0.01 })
      tone({ at: t, dur: 0.25, f: 2400, to: 3800, gain: 0.07 })
      return squelch(t + 0.02, 0.4, 800)
    case "headBonk":
      // Глухой «кокос» и шлепок
      tone({ at: t, dur: 0.09, f: 500, to: 380, gain: 0.35 })
      tone({ at: t, dur: 0.04, f: 900, wave: "triangle", gain: 0.1 })
      return squelch(t, 0.2, 600)
    case "slideWet":
      hiss({ at: t, dur: L(0.28), gain: 0.25, f: 900, to: 400, q: 3 })
      return squelch(t + L(0.1), 0.2, 500)
    case "stab":
      thud(t, 0.7, 160, 0.15)
      hiss({ at: t, dur: 0.06, gain: 0.45, f: 2500, q: 3 })
      crackle(t, 0.06, 0.3)
      return squelch(t + 0.01, 0.55, 600)
    case "pull":
      hiss({ at: t, dur: 0.25, gain: 0.3, f: 600, to: 1500, q: 3 })
      return squelch(t + 0.05, 0.3, 700)
    case "arrow":
      hiss({ at: t, dur: 0.06, gain: 0.2, f: 3000, q: 2 })
      tone({ at: t + 0.04, dur: 0.07, f: 300, to: 120, wave: "triangle", gain: 0.35 })
      return squelch(t + 0.04, 0.25, 700)
    case "ignite":
      // Вспышка пламени и потрескивающий гул
      hiss({ at: t, dur: 0.3, gain: 0.4, f: 600, to: 3000, filter: "lowpass", attack: 0.05 })
      hiss({ at: t, dur: L(0.6), gain: 0.25, f: 900, q: 0.8, attack: 0.05 })
      return crackle(t, L(0.6), 0.22, 1500)
    case "blink":
      tone({ at: t, dur: 0.05, f: 1800, gain: 0.1 })
      return tone({ at: t + 0.1, dur: 0.05, f: 1800, gain: 0.1 })
    case "windAsh":
      hiss({ at: t, dur: L(1.15), gain: 0.3, f: 400, to: 1200, attack: L(0.4) })
      return crackle(t, L(0.6), 0.08, 2500)
    case "ascend": {
      // Хор «а-а-а» и арфа вверх
      const d = L(1.4)
      for (const m of ["C5", "E5", "G5", "C6"]) {
        tone({ at: t, dur: d, f: hz(midi(m)), wave: "triangle", gain: 0.05, attack: 0.3, hold: 0.5, vib: [5, 4] })
        tone({ at: t, dur: d, f: hz(midi(m)), wave: "sawtooth", lp: 1400, gain: 0.015, attack: 0.3, hold: 0.5, vib: [5.3, 4] })
      }
      return ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "C7"].forEach((m, i) =>
        tone({ at: t + (i * d) / 12, dur: 0.5, f: hz(midi(m)), gain: 0.06 }))
    }
    case "inflate": {
      // Резиновый скрип раздувания — с каждой ступенью выше
      const f = 220 * 1.35 ** n
      return tone({ at: t, dur: L(0.13), f, to: f * 1.6, wave: "square", lp: 1400, gain: 0.08, vib: [35, 20] })
    }
    case "pop":
      hiss({ at: t, dur: 0.06, gain: 0.7, f: 1500, filter: "highpass" })
      thud(t, 0.5, 200, 0.08)
      squelch(t + 0.01, 0.4, 700)
      return tone({ at: t, dur: 0.15, f: 1200, to: 2400, gain: 0.05 })
    case "deflate":
      // Сдувается со свистом и «пр-р-р»
      tone({ at: t, dur: L(0.4), f: 600, to: 200, wave: "square", lp: 1500, gain: 0.08, vib: [25, 60] })
      return hiss({ at: t, dur: L(0.4), gain: 0.15, f: 1500, q: 2 })
    case "tooth":
      tone({ at: t, dur: 0.12, f: 2600, gain: 0.1 })
      return thud(t, 0.2, 300, 0.05)
    case "dizzy": {
      // Чирик птичек и звон звёздочек над головой
      const gap = L(0.15)
      for (let i = 0; i < 4; i++) {
        const up = i % 2 === 0
        tone({ at: t + i * gap, dur: 0.06, f: up ? 2800 : 3600, to: up ? 3600 : 2800, gain: 0.06 })
        if (i % 2 === 1) tone({ at: t + i * gap + gap / 2, dur: 0.2, f: 1760, gain: 0.04 })
      }
      return
    }
    case "slam":
      thud(t, 1, 90, 0.3)
      return hiss({ at: t, dur: 0.2, gain: 0.55, f: 2000, to: 300, filter: "lowpass" })
    case "koBell":
      // Гонг ринга: «дзынь-дзынь-дзынь»
      return [0.05, 0.3, 0.55].forEach(d => bell(t + d, 1180, 0.12))
    case "zombieSettle":
      squelch(t, 0.4, 500)
      return tone({ at: t, dur: 0.15, f: 90, to: 70, wave: "sawtooth", lp: 400, gain: 0.1 })
    case "boneCreak":
      crackle(t, 0.07, 0.35, 1500)
      return tone({ at: t, dur: 0.08, f: 150, to: 110, wave: "sawtooth", lp: 1200, gain: 0.06 })
    case "grr":
      // Вопросительный рык с подъёмом в конце
      tone({ at: t, dur: 0.5, f: 110, to: 165, wave: "sawtooth", lp: 600, gain: 0.25, attack: 0.05, vib: [9, 6] })
      return hiss({ at: t, dur: 0.4, gain: 0.1, f: 400 })
    case "melt":
      tone({ at: t, dur: L(0.82), f: 120, to: 50, wave: "sawtooth", lp: 450, gain: 0.2, vib: [7, 5] })
      hiss({ at: t, dur: L(0.82), gain: 0.3, f: 800, to: 200, filter: "lowpass" })
      return bubbles(t + L(0.3), L(0.9), 6)
    case "bones":
      for (let i = 0; i < 3; i++) {
        tone({ at: t + L(i * 0.14), dur: 0.04, f: 900 + i * 150, wave: "triangle", gain: 0.12 })
        crackle(t + L(i * 0.14), 0.03, 0.2, 1500)
      }
  }
}
