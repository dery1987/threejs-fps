// state.js — one place for all mutable game state (HARBOUR LINE).
// The simulation (main.js fixed step) reads and writes this object; render.js
// only reads it; hud.js only reads it. Nothing else owns game state.

export const TEAM = { VANGUARD: 'vanguard', SENTINEL: 'sentinel' };
export const PHASE = {
  MENU: 'menu',       // title overlay, world idles behind it
  BUY: 'buy',         // buy phase at round start, players frozen
  LIVE: 'live',       // round in progress
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const ROUND_TIME = 100;      // seconds per round
export const BUY_TIME = 12;         // seconds of buy phase
export const PLANT_TIME = 3;        // seconds to plant the charge
export const DEFUSE_TIME = 5;       // seconds to defuse
export const CHARGE_FUSE = 40;      // seconds from plant to detonation
export const WIN_ROUNDS = 5;        // first to 5 takes the match
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSE_REWARD = 1900;

export function makePlayer() {
  return {
    isPlayer: true, team: TEAM.VANGUARD, alive: true,
    x: -30, z: 0, y: 0, vy: 0, yaw: -Math.PI / 2, pitch: 0,
    hp: 100, armor: 0, money: START_MONEY,
    weapon: 'pistol', mag: 12, reserve: 36, reloading: 0,
    frags: 0, smokes: 0, hasCharge: true,
    crouched: false, onGround: true, speed: 0,
    spreadBloom: 0, recoil: 0, lastShot: -9, ads: false,
    planting: 0, defusing: 0, flash: 0,
  };
}

export function makeBot(id, team, x, z, yaw) {
  return {
    id, isPlayer: false, team, alive: true,
    x, z, y: 0, vy: 0, yaw, pitch: 0,
    hp: 100, armor: 0, money: START_MONEY,
    weapon: team === TEAM.VANGUARD ? 'smg' : 'rifle',
    mag: 25, reserve: 100, reloading: 0,
    frags: 0, smokes: 0, hasCharge: false,
    crouched: false, onGround: true, speed: 0,
    // AI brain
    state: 'patrol', node: 0, target: null, holdUntil: 0,
    burstLeft: 0, nextShot: 0, reactAt: 0, heardAt: 0, heardX: 0, heardZ: 0,
    planting: 0, defusing: 0, strafeDir: 1, strafeUntil: 0,
    kills: 0, deaths: 0,
  };
}

// Fresh match state. `seed` drives the deterministic bot shuffle.
export function makeState(seed = 7) {
  const s = {
    seed, time: 0, phase: PHASE.MENU, phaseT: 0,
    round: 1, score: { vanguard: 0, sentinel: 0 },
    roundTime: ROUND_TIME, buyTime: BUY_TIME,
    charge: { state: 'carried', site: null, x: 0, z: 0, timer: 0, planter: null },
    player: makePlayer(),
    bots: [],
    killfeed: [],            // {text, team, t}
    banner: '', bannerT: 0, // big centre message + expiry
    roundWinner: null, roundReason: '',
    matchWinner: null,
    grenades: [],            // {kind, x, y, z, vx, vy, vz, t, team}
    smokes: [],              // {x, y, z, r, t}
    tracers: [],             // {x0,y0,z0,x1,y1,z1,t}
    flashes: [],             // {x, y, z, t, team} muzzle flashes
    booms: [],               // {x, y, z, t} explosions
    shotsFired: 0, shotsHit: 0,
    noises: [],              // {x, z} shots bots can hear (drained each tick)
    events: [],              // {kind, ...} consumed by audio.js
    rngState: seed >>> 0,
  };
  return s;
}

// Tiny deterministic PRNG (mulberry32) so bot behaviour is reproducible.
export function rng(s) {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function aliveOf(s, team) {
  let n = 0;
  if (s.player.team === team && s.player.alive) n++;
  for (const b of s.bots) if (b.team === team && b.alive) n++;
  return n;
}

export function pushKillfeed(s, text, team) {
  s.killfeed.unshift({ text, team, t: s.time });
  if (s.killfeed.length > 5) s.killfeed.length = 5;
}

export function setBanner(s, text, dur = 2.5) {
  s.banner = text; s.bannerT = s.time + dur;
}
