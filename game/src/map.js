// map.js — "Harbour Line": a dusk container terminal, 70 x 46 m.
// Two sites (A north-east, B south-east), a mid lane and two side lanes.
// Colliders are axis-aligned boxes; movement and line-of-sight both use them.

export const MAP = { x0: -35, x1: 35, z0: -23, z1: 23 };

export const SITES = {
  A: { name: 'A', x: 24, z: -15, r: 4.5 },
  B: { name: 'B', x: 24, z: 15, r: 4.5 },
};

export const SPAWNS = {
  vanguard: [
    { x: -31, z: -6, yaw: -Math.PI / 2 }, { x: -31, z: -2, yaw: -Math.PI / 2 },
    { x: -31, z: 2, yaw: -Math.PI / 2 }, { x: -31, z: 6, yaw: -Math.PI / 2 },
    { x: -28, z: 0, yaw: -Math.PI / 2 },
  ],
  sentinel: [
    { x: 31, z: -6, yaw: Math.PI / 2 }, { x: 31, z: -2, yaw: Math.PI / 2 },
    { x: 31, z: 2, yaw: Math.PI / 2 }, { x: 31, z: 6, yaw: Math.PI / 2 },
    { x: 28, z: 0, yaw: Math.PI / 2 },
  ],
};

// Static colliders: {x0,z0,x1,z1,h, kind, color, label?} — kind drives the mesh.
export const COLLIDERS = [];
function box(x0, z0, x1, z1, h, kind, color, label) {
  COLLIDERS.push({ x0, z0, x1, z1, h, kind, color, label });
}

// Perimeter walls.
box(-35.6, -23.6, 35.6, -23, 4.2, 'wall', '#4c5258');
box(-35.6, 23, 35.6, 23.6, 4.2, 'wall', '#4c5258');
box(-35.6, -23, -35, 23, 4.2, 'wall', '#4c5258');
box(35, -23, 35.6, 23, 4.2, 'wall', '#4c5258');

// Container stacks — the cover and the sightline breaks.
box(-18, -17, -12, -14.6, 2.6, 'container', '#a34d2a', 'HL-01');
box(-18, -14.2, -12, -11.8, 2.6, 'container', '#2f6d6a', 'HL-02');
box(-16, -17, -14, -14.6, 5.2, 'container', '#b98a2e', 'HL-03'); // stacked pair
box(-6, -19, 0, -16.6, 2.6, 'container', '#3f5d8a', 'HL-04');
box(8, -19, 14, -16.6, 2.6, 'container', '#a34d2a', 'HL-05');
box(18, -19, 24, -16.6, 2.6, 'container', '#2f6d6a', 'HL-06');
box(-18, 11.8, -12, 14.2, 2.6, 'container', '#3f5d8a', 'HL-07');
box(-18, 14.6, -12, 17, 2.6, 'container', '#b98a2e', 'HL-08');
box(-6, 16.6, 0, 19, 2.6, 'container', '#a34d2a', 'HL-09');
box(8, 16.6, 14, 19, 2.6, 'container', '#2f6d6a', 'HL-10');
box(18, 16.6, 24, 19, 2.6, 'container', '#3f5d8a', 'HL-11');
// Mid blocks.
box(-4, -3.4, 2, -1, 2.6, 'container', '#b98a2e', 'HL-12');
box(-2, 1, 4, 3.4, 2.6, 'container', '#2f6d6a', 'HL-13');
box(10, -3, 13, -0.6, 1.2, 'crate', '#7a5c38');
box(10, 0.8, 13, 3.2, 1.2, 'crate', '#7a5c38');
box(-12, -1.2, -9.6, 1.2, 1.2, 'crate', '#7a5c38');
// Site cover.
box(20, -11, 22.4, -8.6, 2.6, 'container', '#a34d2a', 'HL-A1');
box(26, -11, 28.4, -8.6, 1.2, 'crate', '#7a5c38');
box(20, 8.6, 22.4, 11, 2.6, 'container', '#2f6d6a', 'HL-B1');
box(26, 8.6, 28.4, 11, 1.2, 'crate', '#7a5c38');
// Spawn cover.
box(-24, -4, -21.6, -1.6, 2.6, 'container', '#3f5d8a', 'HL-V1');
box(-24, 1.6, -21.6, 4, 2.6, 'container', '#b98a2e', 'HL-V2');

// Waypoint graph: nodes on the three lanes; bots walk node to node.
export const WAYPOINTS = [
  // id: 0..4  vanguard spawn -> mid
  { x: -29, z: 0 }, { x: -22, z: -2 }, { x: -14, z: 0 }, { x: -7, z: 0 }, { x: 0, z: 0 },
  // 5..8  mid -> A
  { x: 6, z: -2 }, { x: 12, z: -6 }, { x: 18, z: -10 }, { x: 24, z: -15 },
  // 9..12 mid -> B
  { x: 6, z: 2 }, { x: 12, z: 6 }, { x: 18, z: 10 }, { x: 24, z: 15 },
  // 13..16 north lane
  { x: -22, z: -13 }, { x: -10, z: -14 }, { x: 4, z: -14 }, { x: 16, z: -14 },
  // 17..20 south lane
  { x: -22, z: 13 }, { x: -10, z: 14 }, { x: 4, z: 14 }, { x: 16, z: 14 },
  // 21..24 sentinel side
  { x: 29, z: -6 }, { x: 29, z: 6 }, { x: 26, z: -14 }, { x: 26, z: 14 },
];
export const EDGES = {
  0: [1, 13, 17], 1: [0, 2, 13], 2: [1, 3], 3: [2, 4, 14, 18],
  4: [3, 5, 9], 5: [4, 6, 15], 6: [5, 7], 7: [6, 8, 16],
  8: [7, 23], 9: [4, 10, 19], 10: [9, 11], 11: [10, 12, 20],
  12: [11, 24], 13: [0, 1, 14], 14: [13, 3, 15], 15: [14, 5, 16],
  16: [15, 7, 23], 17: [0, 18], 18: [17, 3, 19], 19: [18, 9, 20],
  20: [19, 11, 24], 21: [23, 22], 22: [21, 24], 23: [21, 8, 16], 24: [22, 12, 20],
};
export const ROUTE_A = [0, 1, 2, 3, 4, 5, 6, 7, 8];      // spawn -> site A
export const ROUTE_B = [0, 1, 2, 3, 4, 9, 10, 11, 12];   // spawn -> site B
export const ROUTE_MID = [0, 13, 14, 15, 16, 23];        // north lane flank
export const HOLD_A = [8, 16, 23];   // sentinel holds around A
export const HOLD_B = [12, 20, 24];  // sentinel holds around B

// --- geometry helpers shared by player, bots and combat -----------------

// Circle (x,z,r) vs AABB, XZ only. Returns corrected position.
export function collideCircle(x, z, r) {
  for (const c of COLLIDERS) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
      }
    }
  }
  x = Math.max(MAP.x0 + r, Math.min(MAP.x1 - r, x));
  z = Math.max(MAP.z0 + r, Math.min(MAP.z1 - r, z));
  return [x, z];
}

// Segment (ax,az)->(bx,bz) blocked by any collider? 2D slab test, XZ plane.
export function segmentBlocked(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const c of COLLIDERS) {
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) continue; }
    else {
      let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) continue; }
      else {
        let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t1 >= 0 && t0 <= 1) return true;
  }
  return false;
}

// 3D line-of-sight between two eye points: walls taller than both eyes block.
export function hasLOS(ax, ay, az, bx, by, bz) {
  if (segmentBlocked(ax, az, bx, bz)) {
    // A low crate (h<=1.3) does not block eye-level sight.
    const dx = bx - ax, dz = bz - az;
    for (const c of COLLIDERS) {
      if (c.h <= 1.3) continue;
      let t0 = 0, t1 = 1, hit = true;
      if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) hit = false; }
      else {
        let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) hit = false;
      }
      if (hit) {
        if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) hit = false; }
        else {
          let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) hit = false;
        }
      }
      if (hit && t1 >= 0 && t0 <= 1) return false;
    }
  }
  return true;
}

export function insideSite(x, z, site) {
  const dx = x - site.x, dz = z - site.z;
  return dx * dx + dz * dz < site.r * site.r;
}
