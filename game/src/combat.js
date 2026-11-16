// combat.js — hitscan shooting, damage and kills, grenade physics and the
// charge timer. Hit tests are ray-vs-sphere against head and body spheres,
// so a headshot really is a headshot.

import { WEAPONS, currentSpread, damageAt, applyArmor, GRENADES } from './weapons.js';
import { hasLOS, collideCircle } from './map.js';
import { EYE_STAND, dirFromYawPitch } from './player.js';
import { pushKillfeed, setBanner } from './state.js';

const EYE = EYE_STAND;

// Ray vs sphere; returns distance along the ray or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function bodySpheres(a) {
  const y = a.y ?? 0;
  return [
    { x: a.x, y: y + 1.52, z: a.z, r: 0.24, head: true },
    { x: a.x, y: y + 0.95, z: a.z, r: 0.46, head: false },
  ];
}

// Find the nearest actor hit by a ray from (o) along (d), up to maxDist.
// Smokes block the shot entirely.
export function rayHit(s, ox, oy, oz, dx, dy, dz, maxDist, ignore) {
  for (const sm of s.smokes) {
    if (raySphere(ox, oy, oz, dx, dy, dz, sm.x, sm.y, sm.z, sm.r) < maxDist) return { blocked: true };
  }
  let best = null;
  const actors = [s.player, ...s.bots];
  for (const a of actors) {
    if (!a.alive || a === ignore) continue;
    for (const sp of bodySpheres(a)) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, sp.x, sp.y, sp.z, sp.r);
      if (t < maxDist && (!best || t < best.t)) best = { t, target: a, head: sp.head };
    }
  }
  return best;
}

// One hitscan shot from `shooter` along a direction with spread applied.
// `spread` is the cone half-angle; `rngFn` supplies deterministic jitter.
export function fireShot(s, shooter, dir, spread, rngFn) {
  const w = WEAPONS[shooter.weapon];
  if (shooter.mag <= 0) { s.events.push({ kind: 'dry' }); return; }
  shooter.mag--;
  shooter.lastShot = s.time;
  shooter.spreadBloom = Math.min(0.05, (shooter.spreadBloom || 0) + w.recoil * 0.6);
  if (shooter.isPlayer) shooter.recoil = Math.min(0.09, (shooter.recoil || 0) + w.recoil);
  s.shotsFired++;

  const a = (rngFn() - 0.5) * 2 * spread;
  const b = (rngFn() - 0.5) * 2 * spread;
  // Perturb the direction by small yaw/pitch offsets.
  const yaw = Math.atan2(-dir.x, -dir.z) + a;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) + b;
  const d = dirFromYawPitch(yaw, pitch);
  const ox = shooter.x, oy = (shooter.y ?? 0) + EYE, oz = shooter.z;

  const hit = rayHit(s, ox, oy, oz, d.x, d.y, d.z, w.range, shooter);
  const endT = hit && hit.t !== undefined ? hit.t : w.range;
  s.tracers.push({ x0: ox, y0: oy, z0: oz, x1: ox + d.x * endT, y1: oy + d.y * endT, z1: oz + d.z * endT, t: 0.09, color: w.tracer });
  s.flashes.push({ x: ox + d.x * 0.7, y: oy, z: oz + d.z * 0.7, t: 0.06, team: shooter.team });
  s.events.push({ kind: shooter.isPlayer ? 'shot' : 'distant', weapon: shooter.weapon });
  s.noises.push({ x: ox, z: oz }); // bots hear the shot (drained by main.js)

  if (hit && hit.target) {
    const dmg = applyArmor(hit.target, damageAt(w, hit.t, hit.head));
    hit.target.hp -= dmg;
    s.shotsHit++;
    if (shooter.isPlayer) {
      s.events.push({ kind: 'hit' });
      shooter.hitmark = s.time + 0.12;
      if (hit.head) shooter.hitmarkHead = true;
    } else if (hit.target.isPlayer) {
      s.events.push({ kind: 'hurt' });
      s.player.flash = 0.25;
    }
    if (hit.target.hp <= 0) kill(s, shooter, hit.target, hit.head, w);
  }
}

export function kill(s, killer, victim, head, w) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths = (victim.deaths || 0) + 1;
  if (killer) {
    killer.kills = (killer.kills || 0) + 1;
    if (killer.isPlayer) {
      killer.money += 300;
      s.events.push({ kind: 'kill' });
    }
  }
  const kn = killer ? (killer.isPlayer ? 'YOU' : `BOT-${killer.id}`) : '—';
  const vn = victim.isPlayer ? 'YOU' : `BOT-${victim.id}`;
  pushKillfeed(s, `${kn}  ${head ? '◎ ' : '✕ '} ${vn}  [${w.name}]`, killer ? killer.team : victim.team);
  if (victim.isPlayer) setBanner(s, 'YOU WERE ELIMINATED', 2.5);
  // The charge drops where its carrier died.
  if (victim.hasCharge) {
    victim.hasCharge = false;
    s.charge.state = 'dropped'; s.charge.x = victim.x; s.charge.z = victim.z;
  }
}

export function reload(s, a) {
  const w = WEAPONS[a.weapon];
  if (a.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return;
  a.reloading = w.reload;
  if (a.isPlayer) s.events.push({ kind: 'reload' });
}

// --- grenades -----------------------------------------------------------

export function stepGrenades(s, dt) {
  for (let i = s.grenades.length - 1; i >= 0; i--) {
    const g = s.grenades[i];
    g.t += dt;
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.12) { g.y = 0.12; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
    [g.x, g.z] = collideCircle(g.x, g.z, 0.15);
    if (g.t > 1.6) {
      s.grenades.splice(i, 1);
      if (g.kind === 'frag') detonateFrag(s, g);
      else {
        s.smokes.push({ x: g.x, y: 1.2, z: g.z, r: GRENADES.smoke.radius, t: GRENADES.smoke.life });
      }
    }
  }
  for (let i = s.smokes.length - 1; i >= 0; i--) {
    s.smokes[i].t -= dt;
    if (s.smokes[i].t <= 0) s.smokes.splice(i, 1);
  }
  for (let i = s.tracers.length - 1; i >= 0; i--) {
    s.tracers[i].t -= dt;
    if (s.tracers[i].t <= 0) s.tracers.splice(i, 1);
  }
  for (let i = s.flashes.length - 1; i >= 0; i--) {
    s.flashes[i].t -= dt;
    if (s.flashes[i].t <= 0) s.flashes.splice(i, 1);
  }
  for (let i = s.booms.length - 1; i >= 0; i--) {
    s.booms[i].t -= dt;
    if (s.booms[i].t <= 0) s.booms.splice(i, 1);
  }
}

function detonateFrag(s, g) {
  s.booms.push({ x: g.x, y: 0.6, z: g.z, t: 0.5 });
  s.events.push({ kind: 'boom' });
  for (const a of [s.player, ...s.bots]) {
    if (!a.alive) continue;
    const dx = a.x - g.x, dz = a.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d < GRENADES.frag.radius && hasLOS(g.x, 0.6, g.z, a.x, 1.2, a.z)) {
      const dmg = applyArmor(a, GRENADES.frag.damage * (1 - d / (GRENADES.frag.radius * 1.4)));
      a.hp -= dmg;
      if (a.isPlayer) { s.events.push({ kind: 'hurt' }); s.player.flash = 0.3; }
      if (a.hp <= 0) kill(s, null, a, false, { name: 'Frag Charge' });
    }
  }
}

// --- the charge ---------------------------------------------------------

export function stepCharge(s, dt) {
  const ch = s.charge;
  if (ch.state !== 'planted') return;
  ch.timer -= dt;
  if (Math.ceil(ch.timer) !== Math.ceil(ch.timer + dt)) s.events.push({ kind: 'beep' });
  if (ch.timer <= 0) {
    ch.state = 'detonated';
    s.booms.push({ x: ch.x, y: 0.6, z: ch.z, t: 0.7 });
    s.events.push({ kind: 'boom' });
    // The blast clears everyone near the site.
    for (const a of [s.player, ...s.bots]) {
      if (!a.alive) continue;
      if (Math.hypot(a.x - ch.x, a.z - ch.z) < 9) { a.hp = 0; a.alive = false; }
    }
  }
}
