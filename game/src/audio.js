// audio.js — all sound is synthesised with WebAudio: oscillator blips and
// filtered noise bursts. No audio files, no network, and it still sounds like
// a gunfight at dusk.

let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.35; return muted; }

function noiseBuffer(dur) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass', slideTo = null }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone({ freq = 440, dur = 0.1, gain = 0.25, type = 'sine', slideTo = null, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  shot(kind) {
    if (kind === 'sniper') { burst({ dur: 0.28, freq: 900, gain: 0.7, slideTo: 120 }); tone({ freq: 160, dur: 0.18, gain: 0.4, type: 'square', slideTo: 60 }); }
    else if (kind === 'smg') burst({ dur: 0.07, freq: 2400, gain: 0.32, slideTo: 700 });
    else if (kind === 'rifle') burst({ dur: 0.11, freq: 1600, gain: 0.5, slideTo: 300 });
    else burst({ dur: 0.09, freq: 2000, gain: 0.42, slideTo: 500 });
  },
  distantShot() { burst({ dur: 0.14, freq: 700, gain: 0.16, slideTo: 200 }); },
  dry() { tone({ freq: 1400, dur: 0.04, gain: 0.2, type: 'square' }); },
  reload() { tone({ freq: 900, dur: 0.05, gain: 0.2, type: 'square' }); tone({ freq: 600, dur: 0.05, gain: 0.2, type: 'square', delay: 0.12 }); },
  hit() { tone({ freq: 1250, dur: 0.05, gain: 0.3, type: 'square' }); },
  kill() { tone({ freq: 880, dur: 0.07, gain: 0.3 }); tone({ freq: 1320, dur: 0.09, gain: 0.3, delay: 0.07 }); },
  hurt() { tone({ freq: 220, dur: 0.12, gain: 0.3, type: 'sawtooth', slideTo: 110 }); },
  step() { burst({ dur: 0.05, freq: 500, gain: 0.08, type: 'lowpass' }); },
  plant() { tone({ freq: 990, dur: 0.09, gain: 0.3 }); },
  beep() { tone({ freq: 1180, dur: 0.08, gain: 0.3, type: 'square' }); },
  defuse() { tone({ freq: 660, dur: 0.08, gain: 0.25 }); tone({ freq: 660, dur: 0.08, gain: 0.25, delay: 0.15 }); },
  boom() {
    burst({ dur: 0.9, freq: 320, gain: 0.9, type: 'lowpass', slideTo: 40 });
    tone({ freq: 70, dur: 0.8, gain: 0.6, type: 'sine', slideTo: 28 });
  },
  grenade() { burst({ dur: 0.2, freq: 1200, gain: 0.3, slideTo: 300 }); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.16, gain: 0.28, delay: i * 0.12 })); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.18, gain: 0.25, delay: i * 0.13 })); },
  buy() { tone({ freq: 1046, dur: 0.06, gain: 0.25 }); tone({ freq: 1568, dur: 0.08, gain: 0.22, delay: 0.06 }); },
};

// Drain the state's event queue into sounds. Called once per frame.
export function playEvents(s) {
  for (const e of s.events) {
    switch (e.kind) {
      case 'shot': sfx.shot(e.weapon); break;
      case 'distant': sfx.distantShot(); break;
      case 'dry': sfx.dry(); break;
      case 'reload': sfx.reload(); break;
      case 'hit': sfx.hit(); break;
      case 'kill': sfx.kill(); break;
      case 'hurt': sfx.hurt(); break;
      case 'step': sfx.step(); break;
      case 'plant': sfx.plant(); break;
      case 'beep': sfx.beep(); break;
      case 'defuse': sfx.defuse(); break;
      case 'boom': sfx.boom(); break;
      case 'grenade': sfx.grenade(); break;
      case 'win': sfx.roundWin(); break;
      case 'lose': sfx.roundLose(); break;
      case 'buy': sfx.buy(); break;
    }
  }
  s.events.length = 0;
}
