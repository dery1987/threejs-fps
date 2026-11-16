// textures.js — every texture is painted on a canvas in code: no image files,
// no network. Asphalt, corrugated container steel, crate wood, hazard stripes,
// a painted site letter and a dusk sky gradient.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    const v = Math.random();
    ctx.fillStyle = light ? `rgba(255,255,255,${alpha * v})` : `rgba(0,0,0,${alpha * v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function groundTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#3a3f45'; ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 5200, 0.16, false);
  speckle(ctx, 512, 512, 2200, 0.10, true);
  // expansion joints
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  // faded lane paint
  ctx.fillStyle = 'rgba(240,168,48,0.5)';
  ctx.fillRect(250, 40, 12, 180); ctx.fillRect(250, 300, 12, 172);
  ctx.fillStyle = 'rgba(230,230,220,0.28)';
  ctx.fillRect(40, 250, 180, 10); ctx.fillRect(300, 250, 172, 10);
  // oil stains
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 12 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(10,10,12,0.5)'); g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return tex(c, 7, 5);
}

export function containerTexture(base, label) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  // corrugation
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x + 9, 0, 4, 256);
  }
  speckle(ctx, 256, 256, 900, 0.18, false);
  // rust streaks from the top edge
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256, len = 20 + Math.random() * 70;
    ctx.fillStyle = `rgba(90,50,20,${0.10 + Math.random() * 0.18})`;
    ctx.fillRect(x, 0, 3 + Math.random() * 5, len);
  }
  // stencilled label
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 140);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(235,235,225,0.55)';
  ctx.fillText('HARBOUR LINE  •  22G1', 128, 166);
  return tex(c);
}

export function crateTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#7a5c38'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? '#856843' : '#6f5233';
    ctx.fillRect(0, y, 256, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + 40, 256, 2);
  }
  // frame + diagonal brace
  ctx.strokeStyle = '#5d4426'; ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(242, 242); ctx.stroke();
  speckle(ctx, 256, 256, 700, 0.15, false);
  return tex(c);
}

export function hazardTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#d8a020'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1c1c1e';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 64, 0); ctx.lineTo(i + 80, 0); ctx.lineTo(i + 16, 128); ctx.fill();
  }
  return tex(c, 4, 1);
}

export function siteTexture(letter) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(240,168,48,0.92)';
  ctx.font = 'bold 190px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Vertical dusk gradient used as the scene background.
export function skyTexture() {
  const [c, ctx] = canvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#1d2b45');
  g.addColorStop(0.45, '#4a3a52');
  g.addColorStop(0.72, '#b4632f');
  g.addColorStop(0.88, '#e08a3c');
  g.addColorStop(1.0, '#3a2a24');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
