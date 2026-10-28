import type { WeaponSkill } from "@shared/character/skills"

/**
 * Звук игры без файлов: всё синтезируется на Web Audio — музыкальные темы (секвенсор с опережающим планированием)
 * и эффекты. Музыка и джинглы — 8-битные, в духе звукового чипа старых приставок: два импульсных канала, ступенчатый
 * треугольник и шум на сдвиговом регистре, без реверберации. Контекст создаётся по первому жесту пользователя
 * (политика автоплея), до этого вызовы молчат.
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
/** Вход музыки и джинглов: окраска чипа перед шиной (своя у музыки и у джинглов — громкость по своим ползункам). */
let musicIn: AudioNode | null = null
let jingleIn: AudioNode | null = null
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
  musicIn = chipColor(c, musicBus)
  jingleIn = chipColor(c, sfxBus)
  noiseLong = lfsrNoise(c, false)
  noiseShort = lfsrNoise(c, true)
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  applyVolumes()
  void c.resume().catch(() => undefined)
  if (wanted.theme) startTheme(wanted.theme, wanted.delay)
}

/**
 * Окраска чипа: огрубление амплитуды (у каналов была 4-битная громкость и 7-битный ЦАП), срез верха около
 * 4,5 кГц (чтобы импульсы не пищали) и два фильтра низов, как на выходе приставки (около 90 и 440 Гц, второй — мягко). Возвращает вход цепочки.
 */
function chipColor(c: AudioContext, dest: AudioNode): AudioNode {
  const crush = c.createWaveShaper()
  const n = 8192
  const levels = 128
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = Math.round(((i / (n - 1)) * 2 - 1) * levels) / levels
  crush.curve = curve
  const lp = c.createBiquadFilter()
  lp.frequency.value = 4500
  lp.Q.value = 0.5
  const hp = c.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 90
  const low = c.createBiquadFilter()
  low.type = "lowshelf"
  low.frequency.value = 440
  low.gain.value = -3
  crush.connect(lp)
  lp.connect(hp)
  hp.connect(low)
  low.connect(dest)
  return crush
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

/* ---------- Звуковой чип (8 бит) ---------- */

// Подражание звуковому чипу 8-битных приставок: два импульсных канала с переключаемой скважностью (12,5/25/50 %),
// ступенчатый 4-битный треугольник для баса и шумовой канал на сдвиговом регистре для ударных. Реверберации у чипа
// не было — «эхо» композиторы делали повтором ноты тише и позже; так и здесь.

type Duty = 0.125 | 0.25 | 0.5
/** Канал ноты: импульсный (скважность) или треугольник. */
type Ch = Duty | "tri"

const waves = new Map<string, PeriodicWave>()

/** Импульс скважности `duty`: ряд Фурье прямоугольника, центрированного в нуле. */
function pulseWave(c: AudioContext, duty: Duty): PeriodicWave {
  const key = `p${duty}`
  const hit = waves.get(key)
  if (hit) return hit
  const n = 48
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  const w = c.createPeriodicWave(real, imag)
  waves.set(key, w)
  return w
}

/**
 * Треугольник чипа: 32 ступени по 16 уровням — отсюда его «зернистый» бас. Гармоники — только до 15-й: выше
 * половины числа ступеней дискретный спектр зеркалится, и вместо мягкого баса выходил бы свист в 30 раз выше ноты.
 */
function triWave(c: AudioContext): PeriodicWave {
  const hit = waves.get("tri")
  if (hit) return hit
  const steps = 32
  const s = Array.from({ length: steps }, (_, k) => (k < 16 ? 15 - k : k - 16) / 7.5 - 1)
  const n = steps / 2
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let h = 1; h < n; h++) {
    for (let k = 0; k < steps; k++) {
      real[h] = (real[h] ?? 0) + (2 / steps) * (s[k] ?? 0) * Math.cos((2 * Math.PI * h * k) / steps)
      imag[h] = (imag[h] ?? 0) + (2 / steps) * (s[k] ?? 0) * Math.sin((2 * Math.PI * h * k) / steps)
    }
  }
  const w = c.createPeriodicWave(real, imag)
  waves.set("tri", w)
  return w
}

/**
 * Шум чипа: 15-битный сдвиговый регистр. Длинный режим — шипение (малый барабан, тарелка), короткий (отвод с 6-го
 * бита, период 93 такта) — металлический звон (хэт). Высота — скоростью воспроизведения буфера.
 */
function lfsrNoise(c: AudioContext, short: boolean): AudioBuffer {
  const len = c.sampleRate
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let reg = 1
  for (let i = 0; i < len; i++) {
    if (i % 2 === 0) {
      const bit = (reg & 1) ^ ((reg >> (short ? 6 : 1)) & 1)
      reg = (reg >> 1) | (bit << 14)
    }
    d[i] = reg & 1 ? 0.8 : -0.8
  }
  return buf
}

let noiseLong: AudioBuffer | null = null
let noiseShort: AudioBuffer | null = null

interface ChipNote {
  at: number
  /** MIDI. */
  m: number
  dur: number
  gain: number
  ch: Ch
  /** Доля громкости после атаки (у чипа — спад счётчиком огибающей). Треугольник громкости не имеет: всегда 1. */
  sustain?: number
  /** Вибрато в центах; вступает с задержкой, как в драйверах 8-битных игр. */
  vib?: number
  /** Подъезд к ноте с высоты на столько полутонов (≈60 мс). */
  slide?: number
  out?: AudioNode
}

function chip(n: ChipNote): void {
  const c = ctx
  if (!c || !sfxBus) return
  const osc = c.createOscillator()
  osc.setPeriodicWave(n.ch === "tri" ? triWave(c) : pulseWave(c, n.ch))
  const f = hz(n.m)
  if (n.slide) {
    osc.frequency.setValueAtTime(hz(n.m + n.slide), n.at)
    osc.frequency.exponentialRampToValueAtTime(f, n.at + 0.06)
  }
  else osc.frequency.setValueAtTime(f, n.at)
  const g = c.createGain()
  const sus = n.ch === "tri" ? 1 : (n.sustain ?? 0.55)
  const end = n.at + Math.max(0.03, n.dur)
  g.gain.setValueAtTime(0.0001, n.at)
  g.gain.linearRampToValueAtTime(n.gain, n.at + 0.004)
  if (sus < 1) g.gain.setTargetAtTime(n.gain * sus, n.at + 0.004, 0.07)
  g.gain.setTargetAtTime(0.0001, end - 0.012, 0.01)
  osc.connect(g)
  g.connect(n.out ?? sfxBus)
  if (n.vib && n.dur > 0.25) {
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = 6
    depth.gain.setValueAtTime(0, n.at)
    depth.gain.setValueAtTime(0, n.at + 0.18)
    depth.gain.linearRampToValueAtTime(n.vib, n.at + 0.35)
    lfo.connect(depth)
    depth.connect(osc.detune)
    lfo.start(n.at)
    lfo.stop(end + 0.08)
  }
  osc.start(n.at)
  osc.stop(end + 0.08)
}

/** Удар шумового канала: `rate` — высота (меньше — глуше), спад за `dur`. */
function noise(at: number, dur: number, gain: number, rate: number, short = false, out?: AudioNode): void {
  const c = ctx
  const buf = short ? noiseShort : noiseLong
  if (!c || !sfxBus || !buf) return
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.playbackRate.value = rate
  const g = c.createGain()
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(g)
  g.connect(out ?? sfxBus)
  src.start(at, Math.random() * 0.5)
  src.stop(at + dur + 0.02)
}

/** Бочка чипа: треугольник с резким падением высоты и щелчок шума. */
function chipKick(at: number, gain: number, out?: AudioNode): void {
  const c = ctx
  if (!c || !sfxBus) return
  const osc = c.createOscillator()
  osc.setPeriodicWave(triWave(c))
  osc.frequency.setValueAtTime(190, at)
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.09)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, at)
  g.gain.setTargetAtTime(0.0001, at + 0.07, 0.02)
  osc.connect(g)
  g.connect(out ?? sfxBus)
  osc.start(at)
  osc.stop(at + 0.18)
  noise(at, 0.025, gain * 0.35, 0.35, false, out)
}

const chipSnare = (at: number, gain: number, out?: AudioNode): void => noise(at, 0.13, gain, 0.4, false, out)
const chipHat = (at: number, gain: number, open = false, out?: AudioNode): void => noise(at, open ? 0.12 : 0.035, gain, 1.1, true, out)
const chipCrash = (at: number, gain: number, out?: AudioNode): void => noise(at, 0.9, gain, 0.5, false, out)

/** Мелодия одним каналом: [нота, длительность в долях], «.» — пауза. Возвращает время конца. */
function seq(at: number, notes: [string, number][], beat: number, ch: Ch, gain: number, out?: AudioNode, sustain?: number): number {
  let t = at
  for (const [n, len] of notes) {
    if (n !== ".") chip({ at: t, m: midi(n), dur: len * beat * 0.92, gain, ch, sustain, vib: len * beat > 0.3 ? 12 : 0, out })
    t += len * beat
  }
  return t
}

/** Аккорд «по-чиповому»: каналов мало, поэтому звуки аккорда перебираются тридцать вторыми. */
function chipChord(at: number, names: string[], dur: number, ch: Ch, gain: number, out?: AudioNode): void {
  const ms = names.map(midi)
  const step = 1 / 32
  for (let t = 0, i = 0; t < dur; t += step, i++) chip({ at: at + t, m: ms[i % ms.length] ?? 60, dur: step * 0.95, gain, ch, sustain: 1, out })
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
      // Взлёт арпеджио и мажорный аккорд-перебор
      const o = jingleIn ?? undefined
      const end = seq(t, [["C4", 1], ["E4", 1], ["G4", 1], ["C5", 1], ["E5", 1], ["G5", 1]], 0.05, 0.5, 0.07, o)
      chipChord(end, ["C4", "E4", "G4", "C5"], 0.6, 0.25, 0.05, o)
      return chip({ at: end, m: midi("C3"), dur: 0.6, gain: 0.12, ch: "tri", out: o })
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
      // Разгон шумом вверх и аккорд-удар под заставку приёма
      for (let k = 0; k < 8; k++) noise(t + k * 0.04, 0.05, 0.12 + k * 0.02, 0.3 + k * 0.12, false, jingleIn ?? undefined)
      chipChord(t + 0.32, ["D4", "F#4", "A4"], 0.35, 0.25, 0.07, jingleIn ?? undefined)
      chip({ at: t + 0.32, m: midi("D3"), dur: 0.4, gain: 0.16, ch: "tri", out: jingleIn ?? undefined })
      return chipKick(t + 0.32, 0.5, jingleIn ?? undefined)
    case "phasePlayer": {
      // «Та-та-та-там!» импульсом 25 % с подбивкой шума и перебором мажора
      const o = jingleIn ?? undefined
      const b = 0.085
      for (let k = 0; k < 3; k++) {
        chip({ at: t + k * b, m: midi("A3"), dur: b * 0.8, gain: 0.07, ch: 0.25, out: o })
        chipSnare(t + k * b, 0.1, o)
      }
      chip({ at: t + 3 * b, m: midi("D4"), dur: 0.5, gain: 0.07, ch: 0.25, vib: 14, out: o })
      chipChord(t + 3 * b, ["D3", "F#3", "A3"], 0.5, 0.25, 0.035, o)
      chip({ at: t + 3 * b, m: midi("D3"), dur: 0.55, gain: 0.13, ch: "tri", out: o })
      return chipCrash(t + 3 * b, 0.08, o)
    }
    case "phaseEnemy": {
      // Тревожный спуск по полутонам в низах и уменьшённый перебор
      const o = jingleIn ?? undefined
      seq(t, [["E3", 1], ["D#3", 1], ["D3", 1], ["C#3", 3]], 0.1, "tri", 0.15, o)
      for (let k = 0; k < 4; k++) chipKick(t + k * 0.1, 0.25, o)
      chipChord(t + 0.3, ["E3", "G3", "A#3"], 0.6, 0.5, 0.035, o)
      return chipCrash(t + 0.3, 0.06, o)
    }
    case "victory": {
      // Победный проигрыш: восходящий ход, удержание с вибрато и перебор до мажора поверх баса
      const o = jingleIn ?? undefined
      const beat = 0.12
      const end = seq(t, [["G3", 1], ["C4", 1], ["E4", 1], ["G4", 2], ["E4", 1], ["G4", 1], ["C5", 6]], beat, 0.25, 0.07, o)
      seq(t, [["E3", 1], ["G3", 1], ["C4", 1], ["E4", 2], ["C4", 1], ["E4", 1], ["G4", 6]], beat, 0.25, 0.03, o)
      const hit = end - beat * 6
      seq(t, [["C3", 2], ["G3", 2], ["C3", 3], ["C3", 6]], beat, "tri", 0.14, o)
      chipChord(hit, ["C4", "E4", "G4"], beat * 6, 0.5, 0.025, o)
      for (let k = 0; k < 6; k++) chipSnare(hit - beat * 0.5 + k * (beat / 6), 0.04 + k * 0.012, o)
      return chipCrash(hit, 0.1, o)
    }
    case "defeat": {
      // Медленный спуск в ля миноре мягким импульсом и тихий бас
      const o = jingleIn ?? undefined
      seq(t, [["E4", 2], ["D4", 2], ["C4", 2], ["B3", 2], ["A3", 6]], 0.22, 0.5, 0.06, o, 0.5)
      return void seq(t, [["A2", 4], ["F2", 4], ["E2", 2], ["A2", 6]], 0.22, "tri", 0.12, o)
    }
    case "retreat": {
      const o = jingleIn ?? undefined
      seq(t, [["A3", 2], ["G3", 2], ["E3", 4]], 0.16, 0.25, 0.06, o)
      return void seq(t, [["A2", 4], ["E2", 4]], 0.16, "tri", 0.1, o)
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
  /** По аккорду на такт, через пробел: «Am», «F», «G#m». */
  chords: string
  /** По строке на такт: 8 восьмых или 16 шестнадцатых — нота, «-» тянуть предыдущую, «.» пауза. */
  lead: string[]
  leadDuty: Duty
  leadGain: number
  /** Сдвиг мелодии в полутонах. */
  leadShift: number
  /** На каких проходах цикла звучит мелодия: [true, false] — каждый второй проход только аккомпанемент. */
  leadPasses: boolean[]
  /** «Эхо» мелодии вторым импульсным каналом: задержка в шестнадцатых и громкость. */
  echo: { steps: number, gain: number } | null
  /** Ломаный аккорд: 16 шестнадцатых — номер звука аккорда (0–5, вверх через октаву), null — пауза. */
  arp: { duty: Duty, gain: number, octave: number, pattern: (number | null)[] } | null
  /** Бас треугольником: 16 шестнадцатых — смещение от тоники в полутонах, null — пауза; длина ноты в шестнадцатых. */
  bass: (number | null)[]
  bassLen: number
  bassGain: number
  /** 16 шестнадцатых: «x» — удар (у хэта «o» — открытый). */
  kick: string
  snare: string
  hat: string
  /** Сбивка: последний такт каждых `every` — свой рисунок малого барабана. */
  fill: { every: number, snare: string } | null
  drumGain: number
  /** Тарелка в начале каждых N тактов (0 — нет). */
  crash: number
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  // Поселение: тихая ля-минорная тема на фоне — медленно, с долгими паузами, импульс 25 % в средних регистрах,
  // каждый второй проход без мелодии (только перебор и бас), ударных почти нет. Не мешает думать.
  main: {
    bpm: 72,
    chords: "Am Am F F C C G G Am Am F F Dm Dm E E",
    lead: [
      "A4 - - - C5 - E5 -",
      "D5 - - - . . . .",
      "C5 - - - A4 - F4 -",
      "G4 - - - . . . .",
      "E4 - G4 - C5 - - -",
      "B4 - A4 - G4 - . .",
      "D5 - - - B4 - G4 -",
      "A4 - - - . . . .",
      "A4 - - - C5 - E5 -",
      "G5 - - - F5 - E5 -",
      "F5 - - - . . A4 -",
      "C5 - - - . . . .",
      "D5 - - - F5 - A5 -",
      "G5 - F5 - E5 - D5 -",
      "E5 - - - G#4 - B4 -",
      "A4 - - - . . . ."
    ],
    leadDuty: 0.25,
    leadGain: 0.042,
    leadShift: -12,
    leadPasses: [true, false],
    echo: { steps: 3, gain: 0.014 },
    arp: { duty: 0.5, gain: 0.014, octave: 4, pattern: [0, null, 1, null, 2, null, 1, null, 0, null, 1, null, 2, null, 3, null] },
    bass: [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, null, null],
    bassLen: 7,
    bassGain: 0.09,
    kick: "................",
    snare: "................",
    hat: "........x.......",
    fill: null,
    drumGain: 0.05,
    crash: 0
  },
  // Бой: быстрый ми минор — мелодия импульсом 25 % с эхом, перебор аккорда шестнадцатыми, бас качает октавами
  // восьмыми, бочка в каждую долю, хэт шестнадцатыми, сбивка малого барабана в конце каждых четырёх тактов.
  battle: {
    bpm: 168,
    chords: "Em Em C D Em Em C B Am Am Em Em C D B B",
    lead: [
      "E5 - B4 - E5 F#5 G5 -",
      "F#5 - E5 - D5 - B4 -",
      "C5 - E5 - G5 - E5 C5",
      "D5 - F#5 - A5 - F#5 D5",
      "E5 - B4 - E5 F#5 G5 A5",
      "B5 - A5 - G5 - F#5 -",
      "E5 - G5 - C6 - B5 A5",
      "B5 - - - D#5 - F#5 -",
      "A5 - C6 - B5 - A5 -",
      "E5 - - - A5 - B5 C6",
      "B5 - G5 - E5 - G5 -",
      "B5 - - - E6 - D6 -",
      "C6 - B5 - A5 - G5 -",
      "A5 - B5 - C6 - D6 -",
      "D#6 - B5 - F#5 - B5 -",
      "D#6 - E6 - F#6 - D#6 -"
    ],
    leadDuty: 0.25,
    leadGain: 0.05,
    leadShift: -12,
    leadPasses: [true],
    echo: { steps: 3, gain: 0.016 },
    arp: { duty: 0.5, gain: 0.018, octave: 3, pattern: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3] },
    bass: [0, null, 12, null, 0, null, 12, null, 0, null, 12, null, 7, null, 12, null],
    bassLen: 2,
    bassGain: 0.13,
    kick: "x...x...x...x.x.",
    snare: "....x.......x...",
    hat: "xxoxxxoxxxoxxxox",
    fill: { every: 4, snare: "....x...x.xxxxxx" },
    drumGain: 0.2,
    crash: 8
  }
}

interface Note {
  m: number
  /** В слотах строки (восьмых или шестнадцатых). */
  len: number
}

interface Bar {
  /** Тоника аккорда, высота 0–11. */
  root: number
  third: number
  /** Сколько шестнадцатых в слоте мелодии: 2 — восьмые, 1 — шестнадцатые. */
  slot: number
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
    return { root, third: m[3] ? 3 : 4, slot: tokens.length >= 16 ? 1 : 2, lead }
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
  window.setTimeout(() => p.out.disconnect(), (fade + 1) * 1000)
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
  const pass = Math.floor(n / 16 / t.bars.length)
  // Мелодия (импульс 1) и её эхо (импульс 2)
  if (t.leadPasses[pass % t.leadPasses.length] && s % bar.slot === 0) {
    const note = bar.lead[s / bar.slot]
    if (note) {
      const dur = note.len * bar.slot * step * 0.92
      const m = note.m + t.leadShift
      chip({ at, m, dur, gain: t.leadGain, ch: t.leadDuty, vib: 14, out })
      if (t.echo) chip({ at: at + t.echo.steps * step, m, dur, gain: t.echo.gain, ch: t.leadDuty, out })
    }
  }
  // Ломаный аккорд (импульс 2)
  const idx = t.arp?.pattern[s]
  if (t.arp && idx !== null && idx !== undefined) {
    const tones = [0, bar.third, 7, 12, 12 + bar.third, 19]
    const base = 12 * (t.arp.octave + 1) + bar.root - (bar.root >= 6 ? 12 : 0)
    chip({ at, m: base + (tones[idx] ?? 0), dur: step * 0.9, gain: t.arp.gain, ch: t.arp.duty, sustain: 0.35, out })
  }
  // Бас (треугольник)
  const b = t.bass[s]
  if (b !== null && b !== undefined) chip({ at, m: 36 + bar.root + b, dur: t.bassLen * step * 0.9, gain: t.bassGain, ch: "tri", out })
  // Ударные (шум)
  const g = t.drumGain
  const fill = t.fill && barNo % t.fill.every === t.fill.every - 1
  if (s === 0 && t.crash && barNo % t.crash === 0) chipCrash(at, g * 0.5, out)
  if (t.kick[s] === "x") chipKick(at, g * 1.6, out)
  if ((fill ? t.fill?.snare : t.snare)?.[s] === "x") chipSnare(at, g * 0.9, out)
  const h = t.hat[s]
  if (h === "x" || h === "o") chipHat(at, g * 0.35, h === "o", out)
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
