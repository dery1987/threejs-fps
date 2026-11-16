// main.js — boot, the fixed-step simulation (60 Hz, apart from rendering),
// the round/match flow, and the screenshot staging hooks (?shot=...).
// This is the only file that touches every other module.

import { makeState, PHASE, WIN_ROUNDS, ROUND_TIME, BUY_TIME, WIN_REWARD, LOSE_REWARD, aliveOf, setBanner } from './state.js';
import { SPAWNS, SITES } from './map.js';
import { WEAPONS, buy, canBuy, BUY_LIST, currentSpread } from './weapons.js';
import { initRender, syncScene, render, canvasEl } from './render.js';
import { bindInput, stepPlayer, keys, requestLock, throwGrenade, wantsFire, dirFromYawPitch } from './player.js';
import { spawnBots, stepBot, hearShot } from './bots.js';
import { fireShot, reload, stepGrenades, stepCharge } from './combat.js';
import { initAudio, playEvents, toggleMute } from './audio.js';
import { buildHud, updateHud, setBuyOpen, isBuyOpen, setScoreboardOpen, showOverlay, hideOverlay } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');           // cover | buy | plant | score
const SEED = Number(params.get('seed') || 7);

const s = makeState(SEED);
window.__S = s; // hud.js reads the live state for the scoreboard
let freshClick = false;
let lastFrame = performance.now();
let acc = 0;
const STEP = 1 / 60;

const { renderer } = initRender(document.getElementById('game'));
buildHud();

// --- round flow -----------------------------------------------------------

function startMatch() {
  s.score.vanguard = 0; s.score.sentinel = 0;
  s.round = 1;
  startRound();
}

function startRound() {
  s.phase = PHASE.BUY;
  s.buyTime = BUY_TIME;
  s.roundTime = ROUND_TIME;
  s.charge = { state: 'carried', site: null, x: 0, z: 0, timer: 0, planter: null };
  s.grenades.length = 0; s.smokes.length = 0; s.tracers.length = 0;
  // Reset the player. Bought weapons carry over between rounds (CS-style);
  // only round 1 starts on the free pistol.
  const p = s.player;
  const sp = SPAWNS.vanguard[(s.round - 1) % SPAWNS.vanguard.length];
  const fresh = {
    x: sp.x, z: sp.z, y: 0, vy: 0, yaw: sp.yaw, pitch: 0,
    alive: true, hp: 100, reloading: 0, hasCharge: true,
    planting: 0, defusing: 0, recoil: 0, spreadBloom: 0, vx: 0, vz: 0,
  };
  if (s.round === 1) {
    Object.assign(fresh, { weapon: 'pistol', mag: 12, reserve: 36, armor: 0, frags: 0, smokes: 0, money: 800 });
  }
  Object.assign(p, fresh);
  spawnBots(s);
  // Sentinel bots take their hold points; Vanguard bots take routes.
  for (const b of s.bots) {
    const list = b.team === 'vanguard' ? SPAWNS.vanguard : SPAWNS.sentinel;
    const i = b.team === 'vanguard' ? (b.id - 1) % 5 : (b.id - 10) % 5;
    b.x = list[i].x; b.z = list[i].z; b.yaw = list[i].yaw;
    b.alive = true; b.hp = 100; b.armor = 0; b.planting = 0; b.defusing = 0;
    b.state = b.team === 'vanguard' ? 'patrol' : 'hold';
    b.routeIdx = 0; b.holdIdx = (b.id - 10) % 3; b.target = null; b.reactAt = 0;
  }
  setBanner(s, `ROUND ${s.round} — ${s.round === 1 ? 'PLANT THE CHARGE' : 'BUY PHASE'}`, 2.5);
  setBuyOpen(true);
  updateHud(s);
}

function endRound(winner, reason) {
  if (s.phase === PHASE.ROUND_END) return;
  s.phase = PHASE.ROUND_END;
  s.phaseT = 0;
  s.roundWinner = winner;
  s.roundReason = reason;
  s.score[winner]++;
  const p = s.player;
  const won = winner === p.team;
  p.money += won ? WIN_REWARD : LOSE_REWARD;
  for (const b of s.bots) b.money += won === (b.team === p.team) ? WIN_REWARD : LOSE_REWARD;
  setBanner(s, won ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`, 3.5);
  s.events.push({ kind: won ? 'win' : 'lose' });
  setBuyOpen(false);
}

function checkRoundEnd() {
  if (s.phase !== PHASE.LIVE) return;
  const ch = s.charge;
  if (ch.state === 'detonated') { endRound('vanguard', 'CHARGE DETONATED'); return; }
  if (ch.state === 'defused') { endRound('sentinel', 'CHARGE DEFUSED'); return; }
  const v = aliveOf(s, 'vanguard'), se = aliveOf(s, 'sentinel');
  if (v === 0) { endRound('sentinel', se > 0 ? 'TEAM ELIMINATED' : ''); return; }
  if (se === 0) {
    if (ch.state === 'planted') return; // still winnable by detonation
    endRound('vanguard', 'TEAM ELIMINATED'); return;
  }
  if (s.roundTime <= 0) {
    if (ch.state === 'planted') return; // fuse still runs
    endRound('sentinel', 'TIME EXPIRED');
  }
}

// --- fixed-step simulation -------------------------------------------------

function step(dt) {
  s.time += dt;
  if (s.phase === PHASE.BUY) {
    s.buyTime -= dt;
    if (s.buyTime <= 0) {
      s.phase = PHASE.LIVE;
      setBuyOpen(false);
      setBanner(s, 'GO — PLANT THE CHARGE', 2);
    }
  } else if (s.phase === PHASE.LIVE) {
    s.roundTime -= dt;
    stepCharge(s, dt);
  } else if (s.phase === PHASE.ROUND_END) {
    s.phaseT += dt;
    if (s.phaseT > 4) {
      if (s.score.vanguard >= WIN_ROUNDS || s.score.sentinel >= WIN_ROUNDS || s.round >= 9) {
        s.phase = PHASE.MATCH_END;
        s.matchWinner = s.score.vanguard > s.score.sentinel ? 'vanguard' : 'sentinel';
        setBanner(s, s.matchWinner === 'vanguard' ? 'MATCH WON — HARBOUR IS YOURS' : 'MATCH LOST', 6);
        showOverlay(
          s.matchWinner === 'vanguard' ? 'Match won' : 'Match lost',
          s.matchWinner === 'vanguard'
            ? 'Vanguard takes the harbour, 5 rounds to ' + s.score.sentinel + '. Click to play again.'
            : 'Sentinel holds the harbour. Click to run it back.',
          'Play again',
        );
      } else {
        s.round++;
        startRound();
      }
    }
  }

  // Player.
  const moving = stepPlayer(s, dt);
  // Shooting (player).
  if (wantsFire(s, freshClick)) {
    const p = s.player;
    const w = WEAPONS[p.weapon];
    const spread = currentSpread(w, moving, p.ads, p.spreadBloom);
    fireShot(s, p, dirFromYawPitch(p.yaw + (p.recoil || 0) * 0.4, p.pitch - (p.recoil || 0) * 0.8), spread, () => Math.random());
  }
  freshClick = false;
  // Pick up a dropped charge by walking over it.
  if (s.charge.state === 'dropped' && s.player.alive) {
    if (Math.hypot(s.player.x - s.charge.x, s.player.z - s.charge.z) < 1.2) {
      s.charge.state = 'carried'; s.player.hasCharge = true;
    }
  }
  // Bots only act while the round is live (they hold still in buy phase).
  if (s.phase === PHASE.LIVE) for (const b of s.bots) stepBot(s, b, dt);
  // Grenades, charge, noises.
  stepGrenades(s, dt);
  for (const n of s.noises) hearShot(s, n.x, n.z);
  s.noises.length = 0;
  checkRoundEnd();
}

// --- actions from input ----------------------------------------------------

function onAction(action, mx, my) {
  const p = s.player;
  switch (action) {
    case 'look': {
      if (s.phase === PHASE.MENU) return;
      p.yaw -= mx * 0.0022 * (p.ads ? 0.55 : 1);
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - my * 0.0022 * (p.ads ? 0.55 : 1)));
      break;
    }
    case 'reload': if (s.phase === PHASE.LIVE) reload(s, p); break;
    case 'buy': {
      if (s.phase === PHASE.BUY || s.phase === PHASE.LIVE) {
        setBuyOpen(!isBuyOpen());
        if (isBuyOpen()) { /* keep mouse free */ document.exitPointerLock?.(); }
        else requestLock(canvasEl());
      }
      break;
    }
    case 'use': break; // E is held (keys.e); planting is handled in stepPlayer.
    case 'grenade': throwGrenade(s, 'frag'); break;
    case 'smoke': throwGrenade(s, 'smoke'); break;
    case 'scoreboard': setScoreboardOpen(true); break;
    case 'scoreboardOff': setScoreboardOpen(false); break;
    case 'mute': toggleMute(); break;
    default:
      // Number keys: buy while the shop is open, else switch to the pistol.
      if (/^Digit[1-7]$/.test(action)) {
        if (isBuyOpen()) {
          const entry = BUY_LIST[Number(action.slice(5)) - 1];
          if (entry && canBuy(s, entry.id)) { buy(s, entry.id); s.events.push({ kind: 'buy' }); }
        } else if (action === 'Digit1' && p.weapon !== 'pistol') {
          p.weapon = 'pistol'; p.mag = 12; p.reserve = 36; p.reloading = 0;
        }
      }
      break;
  }
}

bindInput(canvasEl(), onAction);
canvasEl().addEventListener('mousedown', (e) => {
  if (e.button === 0) freshClick = true;
  if (s.phase === PHASE.MENU) return;
  initAudio();
  if (!isBuyOpen()) requestLock(canvasEl());
});

document.getElementById('play').addEventListener('click', () => {
  initAudio();
  hideOverlay();
  if (s.phase === PHASE.MENU || s.phase === PHASE.MATCH_END) {
    startMatch();
  }
  requestLock(canvasEl());
});

// --- screenshot staging (?shot=...) ---------------------------------------
// Real renders of the game's own code, staged deterministically so the
// dossier's screenshots show the game as it plays.

function stageShot(kind) {
  startMatch();
  hideOverlay();
  const p = s.player;
  if (kind === 'cover') {
    // Mid-lane: player aiming down the lane at two visible enemies.
    p.x = -8; p.z = 0; p.yaw = -Math.PI / 2; p.pitch = 0.01;
    p.weapon = 'rifle'; p.mag = 30; p.reserve = 90;
    const e1 = s.bots.find((b) => b.team === 'sentinel' && b.id === 10);
    const e2 = s.bots.find((b) => b.team === 'sentinel' && b.id === 11);
    if (e1) { e1.x = 5; e1.z = -1.2; e1.yaw = Math.PI / 2; e1.state = 'hold'; }
    if (e2) { e2.x = 14; e2.z = 3; e2.yaw = Math.PI / 2; e2.state = 'hold'; }
    s.phase = PHASE.LIVE; s.roundTime = 87;
    setBuyOpen(false);
    s.killfeed.unshift({ text: 'YOU  ✕  BOT-12  [Longshore AR]', team: 'vanguard', t: s.time });
    setBanner(s, '', 0);
  } else if (kind === 'buy') {
    s.phase = PHASE.BUY; s.buyTime = 9;
    p.x = -30; p.z = 0; p.yaw = -Math.PI / 2;
    p.money = 4750;
    setBuyOpen(true);
    setBanner(s, '', 0);
  } else if (kind === 'plant') {
    s.phase = PHASE.LIVE; s.roundTime = 52;
    setBuyOpen(false);
    p.x = 15; p.z = -12; p.yaw = -1.35; p.pitch = -0.08;
    p.weapon = 'rifle'; p.mag = 24; p.reserve = 90;
    s.charge = { state: 'planted', site: 'A', x: SITES.A.x, z: SITES.A.z, timer: 32, planter: 'player' };
    p.hasCharge = false;
    const d = s.bots.find((b) => b.team === 'sentinel' && b.id === 12);
    if (d) { d.x = 27; d.z = -10; d.yaw = Math.PI / 2; d.state = 'hold'; d.defusing = 1.2; }
    setBanner(s, 'CHARGE PLANTED — DEFEND SITE A', 2.5);
  } else if (kind === 'score') {
    s.phase = PHASE.ROUND_END; s.phaseT = 1;
    setBuyOpen(false);
    s.score.vanguard = 3; s.score.sentinel = 2; s.round = 6;
    s.roundWinner = 'vanguard'; s.roundReason = 'TEAM ELIMINATED';
    p.kills = 7; p.deaths = 2; p.money = 6150;
    p.weapon = 'rifle'; p.mag = 30; p.reserve = 90;
    s.roundTime = 0;
    s.charge = { state: 'idle', site: null, x: 0, z: 0, timer: 0, planter: null };
    s.bots.forEach((b, i) => { b.kills = (i * 2) % 5; b.deaths = (i + 1) % 4; b.hp = b.alive ? Math.min(100, 40 + i * 8) : 0; });
    s.player.alive = true;
    setBanner(s, 'ROUND WON — TEAM ELIMINATED', 3.5);
    setScoreboardOpen(true);
  }
  // Let the world settle a few ticks so poses and HUD are live, then re-pin
  // the staged actors (bots walk during live play, so put them back).
  for (let i = 0; i < 30; i++) step(STEP);
  if (kind === 'cover') {
    const e1 = s.bots.find((b) => b.team === 'sentinel' && b.id === 10);
    const e2 = s.bots.find((b) => b.team === 'sentinel' && b.id === 11);
    if (e1) { e1.x = 5; e1.z = -1.2; e1.yaw = Math.PI / 2; }
    if (e2) { e2.x = 14; e2.z = 3; e2.yaw = Math.PI / 2; }
    p.x = -8; p.z = 0; p.yaw = -Math.PI / 2; p.pitch = 0.01;
  } else if (kind === 'plant') {
    const d = s.bots.find((b) => b.team === 'sentinel' && b.id === 12);
    if (d) { d.x = 27; d.z = -10; d.yaw = Math.PI / 2; d.defusing = 1.2; }
    p.x = 15; p.z = -12; p.yaw = -1.35; p.pitch = -0.08;
    s.charge.timer = 32;
  }
  s.phase = kind === 'buy' ? PHASE.BUY : kind === 'score' ? PHASE.ROUND_END : PHASE.LIVE;
  updateHud(s);
  window.__shotReady = true;
}

if (SHOT) {
  // Menu overlay stays hidden; the game is already running for the camera.
  document.getElementById('overlay').hidden = true;
  stageShot(SHOT);
} else {
  showOverlay(
    'HARBOUR LINE',
    'A tactical FPS at a dusk container terminal. Vanguard plants the charge — Sentinel holds the line. Five rounds take the harbour.',
    'Click to play',
  );
}

// Debug handle for play-testing (screenshots, not shipped logic).
window.__HARBOUR = { state: s, startMatch, startRound };

// --- main loop ------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.25) dt = 0.25;
  if (s.phase !== PHASE.MENU) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  } else {
    s.time += dt; // idle camera drift behind the menu
  }
  syncScene(s, dt);
  render();
  playEvents(s);
  updateHud(s);
}
requestAnimationFrame(frame);
