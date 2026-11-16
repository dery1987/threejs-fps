// player.js — the human: WASD + mouse look (pointer lock), acceleration-based
// movement, crouch, jump, AABB collision, shooting with recoil and spread,
// planting/defusing the charge and throwing grenades.

import { collideCircle, insideSite, SITES } from './map.js';
import { WEAPONS, currentSpread, GRENADES } from './weapons.js';
import { PHASE } from './state.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.12;
export const PLAYER_RADIUS = 0.38;

export const keys = {
  f: false, b: false, l: false, r: false,
  shift: false, ctrl: false, space: false, e: false,
  mouseDown: false, mouseRight: false,
};

export function eyeHeight(p) {
  return p.crouched ? EYE_CROUCH : EYE_STAND;
}

export function bindInput(canvas, onAction) {
  const el = canvas;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.f = true; break;
      case 'KeyS': case 'ArrowDown': keys.b = true; break;
      case 'KeyA': case 'ArrowLeft': keys.l = true; break;
      case 'KeyD': case 'ArrowRight': keys.r = true; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
      case 'ControlLeft': case 'ControlRight': keys.ctrl = true; break;
      case 'Space': keys.space = true; e.preventDefault(); break;
      case 'KeyR': onAction('reload'); break;
      case 'KeyB': onAction('buy'); break;
      case 'KeyE': keys.e = true; onAction('use'); break;
      case 'KeyG': onAction('grenade'); break;
      case 'KeyQ': onAction('smoke'); break;
      case 'Tab': onAction('scoreboard'); e.preventDefault(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': onAction(e.code); break;
      case 'KeyM': onAction('mute'); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.f = false; break;
      case 'KeyS': case 'ArrowDown': keys.b = false; break;
      case 'KeyA': case 'ArrowLeft': keys.l = false; break;
      case 'KeyD': case 'ArrowRight': keys.r = false; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
      case 'ControlLeft': case 'ControlRight': keys.ctrl = false; break;
      case 'Space': keys.space = false; break;
      case 'KeyE': keys.e = false; break;
      case 'Tab': onAction('scoreboardOff'); break;
    }
  });
  el.addEventListener('mousedown', (e) => {
    if (e.button === 0) keys.mouseDown = true;
    if (e.button === 2) keys.mouseRight = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) keys.mouseDown = false;
    if (e.button === 2) keys.mouseRight = false;
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === el) onAction('look', e.movementX, e.movementY);
  });
}

export function requestLock(canvas) {
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock(); } catch (e) { /* headless: ignore */ }
  }
}

// Fixed-step movement. Returns true when the player moved this tick.
export function stepPlayer(s, dt) {
  const p = s.player;
  if (!p.alive) return false;
  const frozen = s.phase === PHASE.BUY || s.phase === PHASE.MENU || s.phase === PHASE.ROUND_END || s.phase === PHASE.MATCH_END;
  p.ads = keys.mouseRight && !frozen;

  const w = WEAPONS[p.weapon];
  const walk = p.crouched ? 2.1 : (keys.shift ? 2.6 : (p.ads ? 2.4 : 5.0));
  let ix = 0, iz = 0;
  if (!frozen) {
    if (keys.f) iz -= 1;
    if (keys.b) iz += 1;
    if (keys.l) ix -= 1;
    if (keys.r) ix += 1;
  }
  const len = Math.hypot(ix, iz) || 1;
  ix /= len; iz /= len;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Camera forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
  // W gives iz=-1, i.e. forward; D gives ix=+1, i.e. right.
  const mx = (ix * cos + iz * sin) * walk;
  const mz = (-ix * sin + iz * cos) * walk;

  // Acceleration toward the wish velocity; friction when no input.
  const accel = p.onGround ? 42 : 10;
  p.vx = approach(p.vx ?? 0, mx, accel * dt);
  p.vz = approach(p.vz ?? 0, mz, accel * dt);
  const moving = Math.hypot(p.vx, p.vz) > 0.6;
  p.speed = Math.hypot(p.vx, p.vz);

  let nx = p.x + p.vx * dt;
  let nz = p.z + p.vz * dt;
  [nx, nz] = collideCircle(nx, nz, PLAYER_RADIUS);
  p.x = nx; p.z = nz;

  if (keys.space && p.onGround && !frozen) { p.vy = 5.2; p.onGround = false; }
  p.vy -= 14 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }

  p.crouched = keys.ctrl && p.onGround;
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * 0.05);

  // Footsteps.
  if (moving && p.onGround) {
    p.stepT = (p.stepT ?? 0) + dt * p.speed;
    if (p.stepT > 3.4) { p.stepT = 0; s.events.push({ kind: 'step' }); }
  }

  // Reload timer.
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const take = Math.min(w.mag - p.mag, p.reserve);
      p.mag += take; p.reserve -= take;
    }
  }

  // Plant / defuse progress (hold E near the site).
  if (s.phase === PHASE.LIVE && !frozen) updateObjective(s, dt);
  return moving;
}

function approach(v, target, delta) {
  if (v < target) return Math.min(target, v + delta);
  if (v > target) return Math.max(target, v - delta);
  return v;
}

function updateObjective(s, dt) {
  const p = s.player;
  const ch = s.charge;
  if (ch.state === 'carried' && p.hasCharge) {
    for (const site of [SITES.A, SITES.B]) {
      if (insideSite(p.x, p.z, site)) {
        p.plantSite = site.name;
        if (keys.e) {
          p.planting += dt;
          if (Math.floor(p.planting * 4) !== Math.floor((p.planting - dt) * 4)) s.events.push({ kind: 'plant' });
          if (p.planting >= 3) {
            ch.state = 'planted'; ch.site = site.name;
            ch.x = site.x; ch.z = site.z; ch.timer = 40; ch.planter = 'player';
            p.hasCharge = false; p.planting = 0;
            s.events.push({ kind: 'beep' });
          }
          return;
        }
      }
    }
    p.planting = 0;
  } else if (ch.state === 'planted' && p.team === 'sentinel') {
    // The player is Vanguard in this build; defuse is a bot job. Kept for symmetry.
    if (insideSite(p.x, p.z, SITES[ch.site])) {
      if (keys.e) {
        p.defusing += dt;
        if (p.defusing >= 5) { ch.state = 'defused'; p.defusing = 0; }
        return;
      }
    }
    p.defusing = 0;
  }
}

// Grenade throw: small arc from the player's eye toward the look direction.
export function throwGrenade(s, kind) {
  const p = s.player;
  if (!p.alive || s.phase !== PHASE.LIVE) return;
  if (kind === 'frag' && p.frags <= 0) return;
  if (kind === 'smoke' && p.smokes <= 0) return;
  if (kind === 'frag') p.frags--; else p.smokes--;
  const dir = dirFromYawPitch(p.yaw, p.pitch);
  s.grenades.push({
    kind, x: p.x, y: eyeHeight(p), z: p.z,
    vx: dir.x * 13, vy: dir.y * 13 + 2.5, vz: dir.z * 13,
    t: 0, team: p.team,
  });
  s.events.push({ kind: 'grenade' });
}

export function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Shooting is resolved in combat.js; this only decides whether the trigger
// is pulled this tick (semi-auto needs a fresh click — tracked by caller).
export function wantsFire(s, freshClick) {
  const p = s.player;
  if (!p.alive || s.phase !== PHASE.LIVE) return false;
  if (p.reloading > 0) return false;
  const w = WEAPONS[p.weapon];
  const interval = 60 / w.rpm;
  if (s.time - p.lastShot < interval) return false;
  return w.auto ? keys.mouseDown : freshClick;
}
