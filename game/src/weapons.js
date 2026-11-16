// weapons.js — the arsenal. Damage, fire rate, spread and recoil are tuned so
// stopping to aim pays: moving or spraying widens the cone, ADS tightens it.

export const WEAPONS = {
  pistol: {
    name: 'Kestrel P9', kind: 'pistol', price: 0,
    damage: 26, headMul: 2, rpm: 320, auto: false,
    mag: 12, reserve: 36, reload: 1.4,
    spread: 0.011, moveSpread: 0.030, adsSpread: 0.004,
    recoil: 0.011, range: 60, tracer: 0xffd27a,
    desc: 'Sidearm. Reliable, free, always yours.',
  },
  smg: {
    name: 'Squall SMG', kind: 'smg', price: 1500,
    damage: 19, headMul: 2, rpm: 750, auto: true,
    mag: 25, reserve: 100, reload: 1.9,
    spread: 0.020, moveSpread: 0.045, adsSpread: 0.010,
    recoil: 0.009, range: 45, tracer: 0xffe9a8,
    desc: 'Fast hose. Shreds up close, sprays wide.',
  },
  rifle: {
    name: 'Longshore AR', kind: 'rifle', price: 2700,
    damage: 33, headMul: 2, rpm: 600, auto: true,
    mag: 30, reserve: 90, reload: 2.2,
    spread: 0.008, moveSpread: 0.034, adsSpread: 0.002,
    recoil: 0.016, range: 80, tracer: 0xfff2c0,
    desc: 'The workhorse. Accurate when you stand still.',
  },
  sniper: {
    name: 'Tidebolt DMR', kind: 'sniper', price: 4750,
    damage: 95, headMul: 2, rpm: 48, auto: false,
    mag: 5, reserve: 15, reload: 3.0,
    spread: 0.002, moveSpread: 0.09, adsSpread: 0.0005,
    recoil: 0.055, range: 120, tracer: 0xcfe8ff,
    desc: 'One shot, one down — if you hold your breath.',
  },
};

export const GRENADES = {
  frag: { name: 'Frag Charge', price: 300, radius: 7, damage: 90 },
  smoke: { name: 'Smoke Canister', price: 300, radius: 4.5, life: 14 },
};

export const ARMOR_PRICE = 650;

export const BUY_LIST = [
  { id: 'pistol', key: '1' }, { id: 'smg', key: '2' },
  { id: 'rifle', key: '3' }, { id: 'sniper', key: '4' },
  { id: 'frag', key: '5' }, { id: 'smoke', key: '6' },
  { id: 'armor', key: '7' },
];

export function weaponOf(id) { return WEAPONS[id]; }

// Current spread (radians) for a shooter: base + movement + bloom, ADS shrinks it.
export function currentSpread(w, moving, ads, bloom) {
  let s = ads ? w.adsSpread : w.spread;
  if (moving) s += w.moveSpread;
  return s + bloom;
}

// Damage falls off past half the weapon's range.
export function damageAt(w, dist, head) {
  let d = w.damage * (head ? w.headMul : 1);
  if (dist > w.range * 0.5) d *= Math.max(0.5, 1 - (dist - w.range * 0.5) / w.range);
  return d;
}

// Apply armor: absorbs 50% of damage, loses 0.5 armor per point absorbed.
export function applyArmor(target, dmg) {
  if (target.armor <= 0) return dmg;
  const absorbed = Math.min(target.armor, dmg * 0.5);
  target.armor -= absorbed;
  return dmg - absorbed * 0.5;
}

export function canBuy(s, id) {
  if (id === 'armor') return s.player.money >= ARMOR_PRICE && s.player.armor < 100;
  if (id === 'frag') return s.player.money >= GRENADES.frag.price && s.player.frags < 2;
  if (id === 'smoke') return s.player.money >= GRENADES.smoke.price && s.player.smokes < 2;
  const w = WEAPONS[id];
  return w && s.player.money >= w.price && s.player.weapon !== id;
}

// Buying replaces the primary (pistol stays as sidearm in slot 1).
export function buy(s, id) {
  const p = s.player;
  if (id === 'armor') { p.money -= ARMOR_PRICE; p.armor = 100; return true; }
  if (id === 'frag') { p.money -= GRENADES.frag.price; p.frags++; return true; }
  if (id === 'smoke') { p.money -= GRENADES.smoke.price; p.smokes++; return true; }
  const w = WEAPONS[id];
  if (!w || p.money < w.price) return false;
  p.money -= w.price;
  p.weapon = id; p.mag = w.mag; p.reserve = w.reserve; p.reloading = 0;
  return true;
}
