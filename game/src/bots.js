// bots.js — the other nine players. Each bot follows a waypoint route, holds
// angles, engages on line-of-sight, reacts to nearby gunfire, and plays the
// objective: Vanguard bots carry and plant the charge, Sentinel bots defuse.

import {
  WAYPOINTS, EDGES, ROUTE_A, ROUTE_B, ROUTE_MID, HOLD_A, HOLD_B,
  collideCircle, hasLOS, insideSite, SITES,
} from './map.js';
import { WEAPONS, currentSpread } from './weapons.js';
import { TEAM, rng } from './state.js';
import { makeBot } from './state.js';
import { fireShot, reload } from './combat.js';
import { EYE_STAND, dirFromYawPitch } from './player.js';

const BOT_SPEED = 3.6;
const BOT_RADIUS = 0.38;
const EYE = EYE_STAND;

export function spawnBots(s) {
  s.bots = [];
  // Vanguard: 4 bots + the player. One of them carries the charge if the
  // player does not (the player carries it in this build).
  const vRoutes = [ROUTE_A, ROUTE_B, ROUTE_MID, ROUTE_A];
  for (let i = 0; i < 4; i++) {
    const sp = { x: -31 + (i % 2) * 2, z: -6 + i * 4 };
    const b = makeBotState(s, i + 1, TEAM.VANGUARD, sp.x, sp.z);
    b.route = vRoutes[i];
    b.routeIdx = 0;
    b.weapon = i === 3 ? 'rifle' : 'smg';
    b.mag = WEAPONS[b.weapon].mag; b.reserve = WEAPONS[b.weapon].reserve;
    s.bots.push(b);
  }
  // Sentinel: 5 bots holding the sites and mid.
  const holds = [HOLD_A, HOLD_B, HOLD_A, HOLD_B, ROUTE_MID];
  for (let i = 0; i < 5; i++) {
    const sp = { x: 31 - (i % 2) * 3, z: -6 + i * 3 };
    const b = makeBotState(s, 10 + i, TEAM.SENTINEL, sp.x, sp.z);
    b.hold = holds[i];
    b.holdIdx = i % holds[i].length;
    b.weapon = i === 4 ? 'sniper' : 'rifle';
    b.mag = WEAPONS[b.weapon].mag; b.reserve = WEAPONS[b.weapon].reserve;
    s.bots.push(b);
  }
}

function makeBotState(s, id, team, x, z) {
  const b = makeBot(id, team, x, z, team === TEAM.VANGUARD ? -Math.PI / 2 : Math.PI / 2);
  b.route = ROUTE_A; b.routeIdx = 0; b.hold = HOLD_A; b.holdIdx = 0;
  return b;
}

// Nearest visible enemy for `bot`, or null. Vision range 42 m; smoke blocks.
function visibleEnemy(s, bot) {
  const foes = [];
  if (s.player.alive && s.player.team !== bot.team) foes.push(s.player);
  for (const b of s.bots) if (b.alive && b.team !== bot.team) foes.push(b);
  let best = null, bestD = 42;
  for (const f of foes) {
    const dx = f.x - bot.x, dz = f.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (s.smokes.some((sm) => Math.hypot((f.x + bot.x) / 2 - sm.x, (f.z + bot.z) / 2 - sm.z) < sm.r)) continue;
    if (!hasLOS(bot.x, EYE, bot.z, f.x, 1.2, f.z)) continue;
    best = f; bestD = d;
  }
  return best ? { foe: best, dist: bestD } : null;
}

function turnTo(bot, x, z, dt, rate = 6) {
  const want = Math.atan2(-(x - bot.x), -(z - bot.z));
  let d = want - bot.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  bot.yaw += step;
  return Math.abs(d) < 0.15;
}

function walkTo(s, bot, x, z, dt, speed = BOT_SPEED) {
  const dx = x - bot.x, dz = z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  let nx = bot.x + vx * dt, nz = bot.z + vz * dt;
  [nx, nz] = collideCircle(nx, nz, BOT_RADIUS);
  bot.x = nx; bot.z = nz;
  bot.speed = speed;
  turnTo(bot, x, z, dt, 8);
  return false;
}

// Bots hear shots: any shot within 26 m pulls nearby bots toward it.
export function hearShot(s, x, z) {
  for (const b of s.bots) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - x, b.z - z) < 26) {
      b.heardAt = s.time; b.heardX = x; b.heardZ = z;
    }
  }
}

export function stepBot(s, bot, dt) {
  if (!bot.alive) return;
  const w = WEAPONS[bot.weapon];
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) {
      const take = Math.min(w.mag - bot.mag, bot.reserve);
      bot.mag += take; bot.reserve -= take;
    }
  }
  bot.speed = 0;

  const seen = visibleEnemy(s, bot);
  if (seen) {
    bot.target = seen.foe;
    if (bot.reactAt === 0) bot.reactAt = s.time + 0.25 + rng(s) * 0.35;
    bot.state = 'engage';
  } else if (bot.state === 'engage') {
    bot.state = bot.team === TEAM.VANGUARD ? 'patrol' : 'hold';
    bot.target = null; bot.reactAt = 0;
  }

  // --- objective behaviours -------------------------------------------
  if (s.charge.state === 'planted' && bot.team === TEAM.SENTINEL) {
    const site = SITES[s.charge.site];
    if (insideSite(bot.x, bot.z, site)) {
      bot.state = 'defuse';
      if (walkTo(s, bot, site.x, site.z, dt, 0)) { /* in place */ }
      bot.defusing += dt;
      if (Math.floor(bot.defusing * 2) !== Math.floor((bot.defusing - dt) * 2)) s.events.push({ kind: 'defuse' });
      if (bot.defusing >= 5) {
        s.charge.state = 'defused';
        bot.defusing = 0;
      }
      return;
    }
    bot.defusing = 0;
    walkTo(s, bot, site.x, site.z, dt);
    return;
  }
  if (s.charge.state === 'planted' && bot.team === TEAM.VANGUARD) {
    // Guard the planted charge from a nearby hold point.
    const site = SITES[s.charge.site];
    const gx = site.x + (bot.id % 3 - 1) * 6, gz = site.z + (bot.id % 2 ? 5 : -5);
    walkTo(s, bot, gx, gz, dt, BOT_SPEED * 0.8);
    return;
  }

  switch (bot.state) {
    case 'engage': {
      const foe = bot.target;
      if (!foe || !foe.alive) { bot.state = 'patrol'; break; }
      const dx = foe.x - bot.x, dz = foe.z - bot.z;
      const d = Math.hypot(dx, dz);
      const facing = turnTo(bot, foe.x, foe.z, dt, 7);
      // Strafe to stay unpredictable, keep preferred range 8-18 m.
      if (s.time > bot.strafeUntil) {
        bot.strafeDir = rng(s) > 0.5 ? 1 : -1;
        bot.strafeUntil = s.time + 0.5 + rng(s) * 0.8;
      }
      let mx = 0, mz = 0;
      if (d > 18) { mx = dx / d; mz = dz / d; }
      else if (d < 6) { mx = -dx / d; mz = -dz / d; }
      mx += (-dz / d) * bot.strafeDir * 0.6;
      mz += (dx / d) * bot.strafeDir * 0.6;
      const ml = Math.hypot(mx, mz) || 1;
      let nx = bot.x + (mx / ml) * BOT_SPEED * 0.55 * dt;
      let nz = bot.z + (mz / ml) * BOT_SPEED * 0.55 * dt;
      [nx, nz] = collideCircle(nx, nz, BOT_RADIUS);
      bot.x = nx; bot.z = nz;
      bot.speed = BOT_SPEED * 0.55;
      // Fire in bursts once reacted and roughly facing.
      if (facing && s.time >= bot.reactAt && s.time >= bot.nextShot) {
        if (bot.mag <= 0) { reload(s, bot); break; }
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(rng(s) * 4);
        const spread = currentSpread(w, true, false, 0.012) + d * 0.0009;
        const dir = dirFromYawPitch(bot.yaw, 0);
        fireShot(s, bot, dir, spread, () => rng(s));
        bot.burstLeft--;
        bot.nextShot = s.time + 60 / w.rpm;
        if (bot.burstLeft <= 0) bot.nextShot = s.time + 0.5 + rng(s) * 0.7;
      }
      break;
    }
    case 'defuse': break; // handled above
    case 'hold': {
      const node = WAYPOINTS[bot.hold[bot.holdIdx % bot.hold.length]];
      if (walkTo(s, bot, node.x, node.z, dt, BOT_SPEED * 0.8)) {
        // Hold the angle: face mid / the likely approach.
        turnTo(bot, bot.team === TEAM.SENTINEL ? -10 : 10, node.z, dt, 2);
        if (s.time > bot.holdUntil) {
          bot.holdIdx++;
          bot.holdUntil = s.time + 6 + rng(s) * 6;
        }
      }
      // A heard shot pulls a holding bot toward the noise.
      if (s.time - bot.heardAt < 3) {
        walkTo(s, bot, bot.heardX, bot.heardZ, dt, BOT_SPEED);
      }
      break;
    }
    default: { // patrol — Vanguard pushes its route toward a site
      const route = bot.route;
      const node = WAYPOINTS[route[Math.min(bot.routeIdx, route.length - 1)]];
      if (walkTo(s, bot, node.x, node.z, dt)) {
        bot.routeIdx++;
        if (bot.routeIdx >= route.length) {
          // At the site: plant if carrying, else hold.
          const site = route === ROUTE_A ? SITES.A : SITES.B;
          if (bot.hasCharge && insideSite(bot.x, bot.z, site)) {
            bot.planting += dt;
            if (bot.planting >= 3) {
              s.charge.state = 'planted'; s.charge.site = site.name;
              s.charge.x = site.x; s.charge.z = site.z; s.charge.timer = 40;
              bot.hasCharge = false; bot.planting = 0;
              s.events.push({ kind: 'beep' });
            }
          } else {
            bot.state = 'hold';
            bot.hold = route === ROUTE_A ? HOLD_A : HOLD_B;
            bot.holdIdx = 0;
          }
        }
      }
      if (s.time - bot.heardAt < 2) walkTo(s, bot, bot.heardX, bot.heardZ, dt, BOT_SPEED);
      break;
    }
  }
}
