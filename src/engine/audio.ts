// Tiny chiptune sound effects synthesised with WebAudio — no audio files needed.

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted: boolean;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("yq-muted");
    } catch {
      /* storage blocked — default to sound on */
    }
    this.muted = stored === "1";
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem("yq-muted", this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  private tone(freq: number, dur: number, wave: Wave = "square", slideTo?: number, delay = 0, vol = 1) {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.6, delay = 0, lowpass = 4000) {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  select() { this.tone(880, 0.06, "square", undefined, 0, 0.5); }
  confirm() { this.tone(660, 0.07, "square"); this.tone(990, 0.09, "square", undefined, 0.06); }
  step() { this.noise(0.03, 0.12, 0, 1200); }
  dash() { this.noise(0.16, 0.4, 0, 2500); this.tone(220, 0.16, "sawtooth", 660, 0, 0.3); }
  slash() { this.tone(1200, 0.12, "square", 180, 0, 0.6); this.noise(0.12, 0.5, 0.02, 6000); }
  hit() { this.noise(0.25, 0.9, 0, 900); this.tone(120, 0.25, "triangle", 50); }
  poof() { this.noise(0.4, 0.5, 0, 1600); }
  coin() { this.tone(988, 0.07, "square", undefined, 0, 0.4); this.tone(1319, 0.18, "square", undefined, 0.07, 0.4); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.35 : 0.12, "square", undefined, i * 0.11, 0.55)); }
  teleport() { this.tone(200, 0.5, "sine", 1800, 0, 0.6); this.tone(300, 0.5, "square", 2400, 0.05, 0.25); }
  heart() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.22, "triangle", undefined, i * 0.15, 0.6)); }
  blip() { this.tone(1400, 0.02, "square", undefined, 0, 0.15); }
}

export const sfx = new Sfx();
