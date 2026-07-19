/**
 * Tiny WebAudio sound manager. Every effect is synthesized (oscillators and
 * noise buffers) — there are no audio assets.
 *
 * Autoplay-policy safe: the AudioContext is created lazily and resumed from
 * `unlock()`, which the app calls on the first user gesture (pointerdown /
 * keydown). Playback attempts before unlock are silently dropped/resumed.
 * SSR-safe: nothing touches `window` at module scope.
 */

export type SfxName =
  | 'select' // card pick flick
  | 'deal' // staggered deal-in flicks
  | 'play' // combo lands on the table (thump)
  | 'chop' // chop/bomb lands (metallic hit)
  | 'pass' // pass tick
  | 'sweep' // trick won, cards swept away (whoosh)
  | 'out' // a player shed their last card
  | 'win'; // round/game over stinger

const MUTE_KEY = 'thirteen.muted';

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
}

interface NoiseOpts {
  dur: number;
  at?: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
}

class SfxManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean | null = null; // null = not loaded yet

  isMuted(): boolean {
    if (this.muted === null) {
      this.muted = this.readMuted();
    }
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      }
    } catch {
      // Persistence is best-effort; muting still works for the session.
    }
    if (!muted) this.unlock();
  }

  /** Create/resume the AudioContext. Safe to call from any user gesture. */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
  }

  /** Play a named effect. No-ops when muted or audio is unavailable. */
  play(name: SfxName): void {
    if (this.isMuted()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') {
      // Resume in place; sounds scheduled below use the frozen currentTime,
      // so they still play as soon as the context is running again.
      void ctx.resume().catch(() => undefined);
    }
    switch (name) {
      case 'select':
        this.noise({ dur: 0.07, gain: 0.5, filter: 'highpass', freq: 2400 });
        this.tone({ freq: 880, dur: 0.05, type: 'triangle', gain: 0.12 });
        break;
      case 'deal':
        for (let i = 0; i < 3; i++) {
          this.noise({ dur: 0.06, at: i * 0.08, gain: 0.4, filter: 'highpass', freq: 2000 });
        }
        break;
      case 'play':
        this.tone({ freq: 170, freqEnd: 62, dur: 0.16, type: 'sine', gain: 0.7 });
        this.noise({ dur: 0.09, gain: 0.35, filter: 'lowpass', freq: 900 });
        break;
      case 'chop':
        this.tone({ freq: 540, freqEnd: 210, dur: 0.22, type: 'square', gain: 0.28 });
        this.noise({ dur: 0.2, gain: 0.5, filter: 'bandpass', freq: 3200, freqEnd: 900, q: 1.2 });
        break;
      case 'pass':
        this.tone({ freq: 1050, dur: 0.045, type: 'square', gain: 0.16 });
        break;
      case 'sweep':
        this.noise({
          dur: 0.32,
          gain: 0.45,
          filter: 'bandpass',
          freq: 2600,
          freqEnd: 320,
          q: 1.4,
        });
        break;
      case 'out':
        this.tone({ freq: 659, dur: 0.11, type: 'triangle', gain: 0.35 });
        this.tone({ freq: 880, dur: 0.16, type: 'triangle', gain: 0.35, at: 0.1 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((freq, i) =>
          this.tone({ freq, dur: 0.24, type: 'triangle', gain: 0.3, at: i * 0.11 }),
        );
        break;
    }
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private readMuted(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
    return this.ctx;
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const length = Math.floor(this.ctx.sampleRate * 0.5);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private tone({ freq, freqEnd, dur, type = 'sine', gain = 0.3, at = 0 }: ToneOpts): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    }
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise({ dur, at = 0, gain = 0.3, filter, freq, freqEnd, q = 0.8 }: NoiseOpts): void {
    if (!this.ctx || !this.master) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = src;
    if (filter && freq !== undefined) {
      const biquad = this.ctx.createBiquadFilter();
      biquad.type = filter;
      biquad.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== undefined) {
        biquad.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 10), t0 + dur);
      }
      biquad.Q.value = q;
      src.connect(biquad);
      node = biquad;
    }
    node.connect(amp).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}

export const sfx = new SfxManager();
