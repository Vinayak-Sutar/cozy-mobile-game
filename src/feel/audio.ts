/**
 * Every sound in Drift is synthesised here with the Web Audio API: no audio
 * files, nothing to license, tiny download. Notes come from a pentatonic
 * scale so any touch sounds pleasant.
 *
 * Two buses, like most games: music (background beds, the menu tune) and
 * effects (touch notes, chimes, the whoosh, UI clicks), each with its own volume.
 */

export type Voice = 'bell' | 'marimba' | 'kalimba';
export type Bed = 'pad' | 'paper' | 'night' | 'lullaby' | 'brook';
export type UiSound = 'tap' | 'open' | 'close' | 'select';

export interface SoundTheme {
  /** MIDI notes, low to high. Finger height picks the note. */
  scale: number[];
  voice: Voice;
  bed: Bed;
  /** The "whoosh" that follows finger speed. */
  swish: { type: BiquadFilterType; low: number; high: number; q: number; gain: number };
}

interface Stoppable {
  stop(fadeSeconds: number): void;
}

const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Volume sliders feel more even on a squared curve. */
const curve = (v: number): number => v * v;

const PREVIEW_SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private swishFilter!: BiquadFilterNode;
  private swishGain!: GainNode;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private theme: SoundTheme | null = null;
  private bed: Stoppable | null = null;
  private lastNoteAt = 0;
  private lastMidi = -1;
  private music = 0.7;
  private sfx = 0.85;

  constructor(music: number, sfx: number) {
    this.music = music;
    this.sfx = sfx;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.build();
      } catch (err) {
        console.warn('[drift] audio unavailable:', err);
        return;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** Effective volumes (already 0 when muted), 0..1. */
  setVolumes(music: number, sfx: number): void {
    this.music = music;
    this.sfx = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(curve(music), t, 0.08);
    this.fxBus.gain.setTargetAtTime(curve(sfx), t, 0.08);
  }

  setTheme(theme: SoundTheme | null): void {
    if (theme === this.theme && this.bed) return;
    this.theme = theme;
    if (!this.ctx) return;
    this.bed?.stop(1.2);
    this.bed = null;
    this.swishGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.rainGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    if (!theme) return;
    this.swishFilter.type = theme.swish.type;
    this.swishFilter.Q.value = theme.swish.q;
    this.bed = this.startBed(theme.bed);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.sfx > 0;
  }

  /** Plays a note for a touch at (u, v) in 0..1 screen space (v up). */
  note(u: number, v: number, intensity: number): void {
    const theme = this.theme;
    if (!this.ready || !theme) return;
    const now = performance.now();
    if (now - this.lastNoteAt < 55) return;
    this.lastNoteAt = now;

    const scale = theme.scale;
    let index = Math.min(scale.length - 1, Math.max(0, Math.floor(v * scale.length)));
    // Avoid hammering the exact same note when a finger wiggles in place.
    if (scale[index] === this.lastMidi && scale.length > 1) index = index > 0 ? index - 1 : index + 1;
    const midi = scale[index];
    this.lastMidi = midi;

    const velocity = 0.35 + 0.65 * Math.min(1, Math.max(0, intensity));
    this.playVoice(theme.voice, mtof(midi), velocity, (u - 0.5) * 1.2);
  }

  /** A note to audition the effects volume while its slider moves. */
  previewNote(position: number): void {
    if (!this.ready) return;
    const now = performance.now();
    if (now - this.lastNoteAt < 120) return;
    this.lastNoteAt = now;
    const midi = PREVIEW_SCALE[Math.min(PREVIEW_SCALE.length - 1, Math.floor(position * PREVIEW_SCALE.length))];
    this.playVoice(this.theme?.voice ?? 'bell', mtof(midi), 0.7, 0);
  }

  /** A rising two-note chime (a flower opening, a choice made). */
  chime(u: number, v: number): void {
    const theme = this.theme;
    if (!this.ready || !theme) return;
    const scale = theme.scale;
    const base = Math.min(scale.length - 2, Math.max(0, Math.floor(v * (scale.length - 1))));
    const pan = (u - 0.5) * 1.2;
    this.playVoice('bell', mtof(scale[base] + 12), 0.45, pan, 0);
    this.playVoice('bell', mtof(scale[base + 1] + 12), 0.4, pan, 0.11);
  }

  /** Rain on leaves and soil, 0..1. The sound is built the first time it's needed. */
  setRain(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.rainGain) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 1400;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 6500;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      source.connect(high).connect(soft).connect(this.rainGain).connect(this.fxBus);
      source.start();
    }
    const target = 0.07 * Math.min(1, Math.max(0, level));
    this.rainGain.gain.setTargetAtTime(target, ctx.currentTime, target > this.rainGain.gain.value ? 0.15 : 0.5);
  }

  /** A soft rushing wind, 0..1 (gusts in Windy Bay). Built the first time it's needed. */
  setWind(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.windGain) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 520;
      band.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      source.connect(band).connect(this.windGain).connect(this.fxBus);
      source.start();
    }
    const target = 0.09 * Math.min(1, Math.max(0, level));
    this.windGain.gain.setTargetAtTime(target, ctx.currentTime, target > this.windGain.gain.value ? 0.4 : 0.8);
  }

  /**
   * One syllable of a talking animal's babble, at a MIDI pitch: a tiny voice
   * blip with a lift at the end, the way Animal Crossing animals chatter.
   */
  babble(midi: number, pan = 0): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.003;
    const out = this.output(pan) as GainNode;
    const voice = ctx.createOscillator();
    voice.type = 'triangle';
    voice.frequency.setValueAtTime(mtof(midi), t);
    voice.frequency.exponentialRampToValueAtTime(mtof(midi + 2), t + 0.06);
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(mtof(midi + 12), t);
    const soft = ctx.createGain();
    soft.gain.value = 0.25;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    voice.connect(out);
    overtone.connect(soft).connect(out);
    for (const osc of [voice, overtone]) {
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  /** Something small dropping into water: a quick falling "plop". */
  plop(pan = 0, pitch = 1): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.003;
    const out = this.output(pan) as GainNode;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.09);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(out);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** A happy little rising arpeggio (a whole garden in bloom). */
  celebrate(): void {
    if (!this.ready) return;
    [72, 76, 79, 84, 88, 91].forEach((midi, i) => this.playVoice('kalimba', mtof(midi), 0.6, (i - 2.5) * 0.15, i * 0.09));
    this.playVoice('bell', mtof(96), 0.35, 0, 0.6);
  }

  /** Small interface sounds: buttons, sheets, picks. */
  ui(kind: UiSound): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.003;
    if (kind === 'select') {
      this.playVoice('marimba', mtof(76), 0.55, 0);
      this.playVoice('marimba', mtof(81), 0.5, 0, 0.07);
      return;
    }
    if (kind === 'tap') {
      // A soft "pop": a sine that drops in pitch.
      const out = this.output(0) as GainNode;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(720, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.09);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.12, t + 0.005);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.16);
      o.onended = () => out.disconnect();
      return;
    }
    // Sheet open/close: a short airy sweep, up or down.
    const out = this.output(0) as GainNode;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    const [from, to] = kind === 'open' ? [500, 2200] : [2000, 450];
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + 0.22);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.09, t + 0.05);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(filter).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.3);
    src.onended = () => out.disconnect();
  }

  /** Overall finger speed, 0..1. Drives the filtered-noise "whoosh". */
  setMotion(amount: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    if (!ctx || !theme) return;
    const a = Math.min(1, Math.max(0, amount));
    const { low, high, gain } = theme.swish;
    const t = ctx.currentTime;
    this.swishGain.gain.setTargetAtTime(gain * Math.pow(a, 0.8), t, 0.09);
    this.swishFilter.frequency.setTargetAtTime(low + (high - low) * a, t, 0.12);
  }

  private build(): void {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio API not supported');
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.3;
    compressor.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.dry.connect(compressor);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.2, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.45;
    this.wet.connect(reverb);
    reverb.connect(compressor);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = curve(this.music);
    this.musicBus.connect(this.dry);
    this.musicBus.connect(this.wet);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = curve(this.sfx);
    this.fxBus.connect(this.dry);
    this.fxBus.connect(this.wet);

    this.noise = this.whiteNoise(2);

    const swishSource = ctx.createBufferSource();
    swishSource.buffer = this.noise;
    swishSource.loop = true;
    this.swishFilter = ctx.createBiquadFilter();
    this.swishGain = ctx.createGain();
    this.swishGain.gain.value = 0;
    swishSource.connect(this.swishFilter).connect(this.swishGain).connect(this.fxBus);
    swishSource.start();

    if (this.theme) {
      const theme = this.theme;
      this.theme = null;
      this.setTheme(theme);
    }
  }

  /** A per-sound gain on the effects bus, panned left/right. */
  private output(pan: number): AudioNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner).connect(this.fxBus);
    } else {
      gain.connect(this.fxBus);
    }
    return gain;
  }

  private playVoice(voice: Voice, freq: number, velocity: number, pan: number, delay = 0, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005 + delay;
    let out: GainNode;
    if (bus) {
      out = ctx.createGain();
      out.connect(bus);
    } else {
      out = this.output(pan) as GainNode;
    }
    const env = out.gain;
    const oscillators: OscillatorNode[] = [];
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      oscillators.push(o);
      return o;
    };
    let length: number;

    if (voice === 'bell') {
      // Soft FM bell: a sine carrier lightly modulated by an inharmonic partner.
      length = 2.6;
      const carrier = osc('sine', freq);
      const modulator = osc('sine', freq * 2.01);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(freq * 0.9 * velocity, t);
      depth.gain.exponentialRampToValueAtTime(freq * 0.02, t + 1.2);
      modulator.connect(depth).connect(carrier.frequency);
      carrier.connect(out);
      env.setValueAtTime(0, t);
      env.linearRampToValueAtTime(0.11 * velocity, t + 0.012);
      env.exponentialRampToValueAtTime(0.0001, t + length);
    } else if (voice === 'marimba') {
      length = 1.1;
      const body = osc('sine', freq);
      const strike = osc('sine', freq * 4);
      const strikeGain = ctx.createGain();
      strikeGain.gain.setValueAtTime(0.35, t);
      strikeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      strike.connect(strikeGain).connect(out);
      body.connect(out);
      env.setValueAtTime(0, t);
      env.linearRampToValueAtTime(0.13 * velocity, t + 0.004);
      env.exponentialRampToValueAtTime(0.0001, t + length);
    } else {
      // Kalimba / music box: clear fundamental, a quick metallic overtone, a hint of octave.
      length = 1.8;
      const tine = osc('sine', freq);
      const overtone = osc('sine', freq * 5.4);
      const octave = osc('triangle', freq * 2);
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.28, t);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      const octaveGain = ctx.createGain();
      octaveGain.gain.value = 0.07;
      overtone.connect(overtoneGain).connect(out);
      octave.connect(octaveGain).connect(out);
      tine.connect(out);
      env.setValueAtTime(0, t);
      env.linearRampToValueAtTime(0.12 * velocity, t + 0.003);
      env.exponentialRampToValueAtTime(0.0001, t + length);
    }

    for (const o of oscillators) {
      o.start(t);
      o.stop(t + length + 0.05);
    }
    oscillators[0].onended = () => out.disconnect();
  }

  private startBed(bed: Bed): Stoppable {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.musicBus);
    const t = ctx.currentTime;
    const sources: AudioScheduledSourceNode[] = [];
    let timer = 0;
    let interval = 0;

    const sine = (type: OscillatorType, freq: number, detune = 0): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      sources.push(o);
      return o;
    };
    const lfo = (rate: number, amount: number, target: AudioParam): void => {
      const o = sine('sine', rate);
      const g = ctx.createGain();
      g.gain.value = amount;
      o.connect(g).connect(target);
    };
    const noiseSource = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.loopStart = Math.random();
      sources.push(s);
      return s;
    };

    if (bed === 'pad') {
      // A warm, slowly breathing A-minor drone.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      filter.Q.value = 0.6;
      lfo(0.05, 260, filter.frequency);
      for (const [freq, detune, type] of [
        [110, -5, 'triangle'],
        [110, 6, 'triangle'],
        [164.81, 0, 'sine'],
        [220, 3, 'sine'],
      ] as [number, number, OscillatorType][]) {
        sine(type, freq, detune).connect(filter);
      }
      filter.connect(bus);
      bus.gain.linearRampToValueAtTime(0.045, t + 3);
    } else if (bed === 'paper') {
      // Quiet room tone plus a soft F-major chord that drifts in and out.
      const room = ctx.createBiquadFilter();
      room.type = 'lowpass';
      room.frequency.value = 380;
      noiseSource().connect(room);
      const roomGain = ctx.createGain();
      roomGain.gain.value = 0.35;
      room.connect(roomGain).connect(bus);
      [174.61, 261.63, 440].forEach((freq, i) => {
        const g = ctx.createGain();
        g.gain.value = 0.22;
        lfo(0.04 + i * 0.017, 0.18, g.gain);
        sine('sine', freq).connect(g).connect(bus);
      });
      bus.gain.linearRampToValueAtTime(0.06, t + 3);
    } else if (bed === 'night') {
      // Night pond: lapping water and the occasional far-off cricket.
      const water = ctx.createBiquadFilter();
      water.type = 'bandpass';
      water.frequency.value = 520;
      water.Q.value = 0.7;
      const waterGain = ctx.createGain();
      waterGain.gain.value = 0.6;
      lfo(0.13, 0.3, waterGain.gain);
      noiseSource().connect(water).connect(waterGain).connect(bus);
      const hum = ctx.createGain();
      hum.gain.value = 0.25;
      sine('sine', 130.81).connect(hum).connect(bus);
      bus.gain.linearRampToValueAtTime(0.05, t + 3);

      const cricket = (): void => {
        if (!this.ctx) return;
        const start = ctx.currentTime + 0.05;
        const pan = ctx.createStereoPanner?.();
        const g = ctx.createGain();
        g.gain.value = 0;
        if (pan) {
          pan.pan.value = Math.random() * 1.6 - 0.8;
          g.connect(pan).connect(bus);
        } else {
          g.connect(bus);
        }
        const o = ctx.createOscillator();
        o.frequency.value = 4300 + Math.random() * 500;
        o.connect(g);
        for (let i = 0; i < 3; i++) {
          const s = start + i * 0.075;
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(0.1, s + 0.01);
          g.gain.linearRampToValueAtTime(0, s + 0.035);
        }
        o.start(start);
        o.stop(start + 0.3);
        o.onended = () => g.disconnect();
        timer = window.setTimeout(cricket, 2200 + Math.random() * 4200);
      };
      timer = window.setTimeout(cricket, 2500);
    } else if (bed === 'brook') {
      // A babbling brook and the odd bird somewhere in the garden.
      const brook = ctx.createBiquadFilter();
      brook.type = 'bandpass';
      brook.frequency.value = 900;
      brook.Q.value = 0.5;
      const brookGain = ctx.createGain();
      brookGain.gain.value = 0.55;
      lfo(0.31, 0.2, brookGain.gain);
      lfo(0.17, 300, brook.frequency);
      noiseSource().connect(brook).connect(brookGain).connect(bus);
      bus.gain.linearRampToValueAtTime(0.06, t + 3);

      const bird = (): void => {
        if (!this.ctx) return;
        const start = ctx.currentTime + 0.05;
        const pan = ctx.createStereoPanner?.();
        const g = ctx.createGain();
        g.gain.value = 0;
        if (pan) {
          pan.pan.value = Math.random() * 1.6 - 0.8;
          g.connect(pan).connect(bus);
        } else {
          g.connect(bus);
        }
        const o = ctx.createOscillator();
        o.connect(g);
        const base = 2600 + Math.random() * 1200;
        const chirps = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirps; i++) {
          const s = start + i * 0.13;
          o.frequency.setValueAtTime(base, s);
          o.frequency.exponentialRampToValueAtTime(base * 1.35, s + 0.06);
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(0.06, s + 0.015);
          g.gain.linearRampToValueAtTime(0, s + 0.08);
        }
        o.start(start);
        o.stop(start + chirps * 0.13 + 0.1);
        o.onended = () => g.disconnect();
        timer = window.setTimeout(bird, 3500 + Math.random() * 6000);
      };
      timer = window.setTimeout(bird, 2000);
    } else {
      // Menu lullaby: a slow music-box melody over a soft open fifth.
      const pad = ctx.createGain();
      pad.gain.value = 0.18;
      lfo(0.07, 0.06, pad.gain);
      sine('sine', 130.81).connect(pad);
      sine('sine', 196, 3).connect(pad);
      pad.connect(bus);
      bus.gain.linearRampToValueAtTime(1, t + 2);

      const A = [72, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 72, 69, 0, 0, 0];
      const B = [72, 0, 74, 76, 79, 0, 81, 84, 81, 0, 79, 76, 74, 0, 0, 0];
      const song = [...A, ...A, ...B, ...A];
      const stepTime = 0.38;
      let step = 0;
      let next = ctx.currentTime + 0.4;
      interval = window.setInterval(() => {
        while (next < ctx.currentTime + 0.25) {
          const midi = song[step % song.length];
          if (midi) this.playVoice('kalimba', mtof(midi), 0.28, 0, next - ctx.currentTime, bus);
          next += stepTime;
          step++;
        }
      }, 60);
    }

    for (const s of sources) s.start(t);

    return {
      stop: (fade: number) => {
        window.clearTimeout(timer);
        window.clearInterval(interval);
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + fade);
        for (const s of sources) s.stop(now + fade + 0.05);
        window.setTimeout(() => bus.disconnect(), (fade + 0.2) * 1000);
      },
    };
  }

  private whiteNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  }
}
