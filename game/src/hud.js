// hud.js — every DOM element over the canvas: health, armor, ammo, money,
// timer, round score, killfeed, crosshair, hitmarker, buy menu, scoreboard
// and the round banner. Pure reads of state; no game logic lives here.

import { WEAPONS, BUY_LIST, GRENADES, ARMOR_PRICE, canBuy } from './weapons.js';
import { PHASE } from './state.js';

let els = {};
let buyOpen = false;
let scoreboardOpen = false;

export function buildHud() {
  els = {};
  for (const id of ['health-num', 'health-bar', 'armor-num', 'armor-row', 'ammo-mag', 'ammo-reserve',
    'money', 'timer', 'score-v', 'score-s', 'round-label', 'killfeed', 'crosshair', 'hitmarker',
    'banner', 'buy-menu', 'buy-list', 'scoreboard', 'score-rows', 'charge-status', 'plant-bar',
    'plant-fill', 'hint', 'overlay', 'overlay-title', 'overlay-copy', 'play', 'weapon-name', 'fps-note']) {
    els[id] = document.getElementById(id);
  }
  return els;
}

export function isBuyOpen() { return buyOpen; }
export function setBuyOpen(v) { buyOpen = v; if (els['buy-menu']) els['buy-menu'].hidden = !v; }
export function isScoreboardOpen() { return scoreboardOpen; }
export function setScoreboardOpen(v) {
  scoreboardOpen = v;
  if (els.scoreboard) els.scoreboard.hidden = !v;
  if (v) renderScoreboard(window.__S);
}

function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function updateHud(s) {
  const p = s.player;
  if (!els['health-num']) return;
  els['health-num'].textContent = Math.max(0, Math.ceil(p.hp));
  els['health-bar'].style.width = `${Math.max(0, p.hp)}%`;
  els['health-bar'].style.background = p.hp > 50 ? '#7fc97f' : p.hp > 25 ? '#f0a830' : '#e05a4e';
  els['armor-num'].textContent = Math.ceil(p.armor);
  els['armor-row'].style.opacity = p.armor > 0 ? 1 : 0.35;
  const w = WEAPONS[p.weapon];
  els['ammo-mag'].textContent = p.reloading > 0 ? '--' : p.mag;
  els['ammo-reserve'].textContent = `/ ${p.reserve}`;
  els['ammo-mag'].parentElement.classList.toggle('empty', p.mag === 0);
  els['weapon-name'].textContent = p.reloading > 0 ? 'RELOADING…' : w.name;
  els.money.textContent = `$${p.money.toLocaleString('en-US')}`;
  els['score-v'].textContent = s.score.vanguard;
  els['score-s'].textContent = s.score.sentinel;
  els['round-label'].textContent = `ROUND ${s.round} / 9`;
  els.timer.textContent = s.phase === PHASE.BUY ? `BUY ${fmtTime(s.buyTime)}` : fmtTime(s.roundTime);
  els.timer.classList.toggle('urgent', s.roundTime <= 10 && s.phase === PHASE.LIVE);

  // Crosshair: gap grows with movement, bloom and firing.
  const gap = 3 + p.speed * 1.1 + p.spreadBloom * 90 + (p.ads ? -2 : 0);
  els.crosshair.style.setProperty('--gap', `${Math.max(2, gap).toFixed(1)}px`);
  els.crosshair.classList.toggle('ads', !!p.ads);
  const hm = p.hitmark && s.time < p.hitmark;
  els.hitmarker.classList.toggle('on', !!hm);
  els.hitmarker.classList.toggle('head', !!hm && p.hitmarkHead);

  // Killfeed.
  els.killfeed.innerHTML = s.killfeed.map((k) =>
    `<div class="kf ${k.team}">${k.text}</div>`).join('');

  // Charge status line.
  const ch = s.charge;
  if (ch.state === 'planted') {
    els['charge-status'].textContent = `⚠ CHARGE PLANTED — SITE ${ch.site} — ${Math.ceil(ch.timer)}s`;
    els['charge-status'].className = 'planted';
  } else if (ch.state === 'carried' && p.hasCharge) {
    els['charge-status'].textContent = `◆ YOU CARRY THE CHARGE — plant at A or B (hold E)`;
    els['charge-status'].className = 'carry';
  } else if (ch.state === 'dropped') {
    els['charge-status'].textContent = `◆ CHARGE DROPPED — pick it up`;
    els['charge-status'].className = 'carry';
  } else if (ch.state === 'defused') {
    els['charge-status'].textContent = '✓ CHARGE DEFUSED';
    els['charge-status'].className = '';
  } else {
    els['charge-status'].textContent = '';
    els['charge-status'].className = '';
  }

  // Plant / defuse progress bar.
  const prog = p.planting > 0 ? p.planting / 3 : p.defusing > 0 ? p.defusing / 5 : 0;
  els['plant-bar'].style.display = prog > 0 ? 'block' : 'none';
  els['plant-fill'].style.width = `${prog * 100}%`;

  // Banner.
  if (s.banner && s.time < s.bannerT) {
    els.banner.textContent = s.banner;
    els.banner.style.opacity = 1;
  } else els.banner.style.opacity = 0;

  // Hint line.
  els.hint.textContent = s.phase === PHASE.BUY
    ? 'BUY PHASE — press B for the shop, 1–7 to buy instantly'
    : s.phase === PHASE.MENU ? '' : 'B buy  •  R reload  •  G frag  •  Q smoke  •  E plant/defuse  •  Tab score';

  if (buyOpen) renderBuy(s);
  if (scoreboardOpen) renderScoreboard(s);
}

export function renderBuy(s) {
  const p = s.player;
  const rows = BUY_LIST.map(({ id, key }) => {
    let name, price, owned = '';
    if (id === 'armor') { name = 'Kevlar Armor'; price = ARMOR_PRICE; owned = p.armor >= 100 ? 'OWNED' : ''; }
    else if (id === 'frag') { name = 'Frag Charge'; price = GRENADES.frag.price; owned = p.frags ? `x${p.frags}` : ''; }
    else if (id === 'smoke') { name = 'Smoke Canister'; price = GRENADES.smoke.price; owned = p.smokes ? `x${p.smokes}` : ''; }
    else {
      const w = WEAPONS[id];
      name = w.name; price = w.price;
      owned = p.weapon === id ? 'EQUIPPED' : '';
    }
    const afford = canBuy(s, id);
    return `<div class="buy-row ${afford ? '' : 'poor'} ${owned ? 'owned' : ''}">
      <span class="buy-key">${key}</span>
      <span class="buy-name">${name}</span>
      <span class="buy-owned">${owned}</span>
      <span class="buy-price">${price === 0 ? 'FREE' : '$' + price.toLocaleString('en-US')}</span>
    </div>`;
  }).join('');
  els['buy-list'].innerHTML = rows +
    `<div class="buy-foot">Balance $${p.money.toLocaleString('en-US')} — the shop closes when the round starts. Weapons: rifle beats spray, still beats moving.</div>`;
}

export function renderScoreboard(s) {
  const rows = [];
  const all = [s.player, ...s.bots].slice().sort((a, b) => (b.kills || 0) - (a.kills || 0));
  for (const a of all) {
    rows.push(`<div class="sb-row ${a.team} ${a.isPlayer ? 'me' : ''}">
      <span class="sb-name">${a.isPlayer ? 'YOU' : 'BOT-' + a.id}</span>
      <span class="sb-team">${a.team === 'vanguard' ? 'VANGUARD' : 'SENTINEL'}</span>
      <span class="sb-k">${a.kills || 0}</span><span class="sb-d">${a.deaths || 0}</span>
      <span class="sb-hp">${a.alive ? Math.ceil(a.hp) : '✕'}</span>
    </div>`);
  }
  els['score-rows'].innerHTML = rows.join('');
}

export function showOverlay(title, copy, button) {
  if (!els.overlay) return;
  els.overlay.hidden = false;
  els['overlay-title'].textContent = title;
  els['overlay-copy'].textContent = copy;
  els.play.textContent = button;
}

export function hideOverlay() { if (els.overlay) els.overlay.hidden = true; }
