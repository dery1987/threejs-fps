// render.js — the three.js scene: dusk container terminal, bot bodies, the
// player's viewmodel rifle, tracers, muzzle flashes, smoke and explosions.
// Meshes are built once; per frame we only move them to match the state.

import * as THREE from 'three';
import { COLLIDERS, MAP, SITES } from './map.js';
import {
  groundTexture, containerTexture, crateTexture, hazardTexture,
  siteTexture, skyTexture,
} from './textures.js';
import { eyeHeight } from './player.js';

const TEAM_COLOR = { vanguard: 0x2f8f7a, sentinel: 0xd88a2e };
const TEAM_DARK = { vanguard: 0x1d5c4f, sentinel: 0x8a5a1c };

let renderer, scene, camera;
let botMeshes = new Map();   // bot id -> {group, head, torso, gun, ...}
let viewmodel, muzzleLight, flashSprite;
let smokeMeshes = [];
let boomMesh = null, boomLight = null;
let tracerGroup, tracerMat;
let chargeMesh = null, chargeLight = null;

export function initRender(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x8a5a44, 30, 95);

  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
  scene.add(camera);

  // Dusk light: low warm sun + cool sky fill.
  const hemi = new THREE.HemisphereLight(0x7a6a9a, 0x2a2018, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 2.2);
  sun.position.set(-30, 26, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  // Sodium lamps over the yard.
  for (const [x, z] of [[-14, 0], [6, -12], [6, 12], [22, 0], [-26, -10]]) {
    const p = new THREE.PointLight(0xffb347, 28, 26, 1.8);
    p.position.set(x, 6.5, z);
    scene.add(p);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 6.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8 }),
    );
    pole.position.set(x, 3.25, z);
    scene.add(pole);
  }

  buildMap();
  buildViewmodel();
  buildCharge();

  tracerGroup = new THREE.Group();
  scene.add(tracerGroup);
  tracerMat = new THREE.LineBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.9 });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

function buildMap() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.x1 - MAP.x0 + 4, MAP.z1 - MAP.z0 + 4),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const crateTex = crateTexture();
  const hazardTex = hazardTexture();
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  const matFor = (color, tex) => {
    const key = color + (tex ? 't' : '');
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshStandardMaterial({
        color, map: tex || null, roughness: 0.82, metalness: 0.12,
      }));
    }
    return matCache.get(key);
  };

  for (const c of COLLIDERS) {
    const w = c.x1 - c.x0, d = c.z1 - c.z0, h = c.h;
    let tex = null;
    if (c.kind === 'container') tex = containerTexture('#' + new THREE.Color(c.color).getHexString(), c.label || 'HL');
    if (c.kind === 'crate') tex = crateTex;
    const m = new THREE.Mesh(geoBox, matFor(c.color, tex));
    m.scale.set(w, h, d);
    m.position.set((c.x0 + c.x1) / 2, h / 2, (c.z0 + c.z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    // Hazard stripe along the base of tall containers.
    if (c.kind === 'container' && h > 2) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 0.35),
        new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.9 }),
      );
      strip.position.set((c.x0 + c.x1) / 2, 0.18, c.z0 - 0.01);
      scene.add(strip);
    }
  }

  // Site markers: painted letters + a glowing ring on the ground.
  for (const site of [SITES.A, SITES.B]) {
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: siteTexture(site.name), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.03, site.z);
    scene.add(letter);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    scene.add(ring);
  }

  // Distant crane silhouettes for the harbour read.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 1 });
  for (const [x, z, h] of [[-40, -30, 26], [10, -34, 30], [42, 28, 24]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), craneMat);
    leg.position.set(x, h / 2, z);
    scene.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 1), craneMat);
    arm.position.set(x + 6, h - 1, z);
    scene.add(arm);
  }
}

function makeBotMesh(team) {
  const g = new THREE.Group();
  const col = TEAM_COLOR[team], dark = TEAM_DARK[team];
  const torsoMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), torsoMat);
  torso.position.y = 1.05; torso.castShadow = true;
  g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.34), darkMat);
  vest.position.y = 1.12;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.55; head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), darkMat);
  visor.position.set(0, 1.56, 0.19);
  g.add(visor);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.22), darkMat);
  legL.position.set(-0.14, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), torsoMat);
  armL.position.set(-0.32, 1.08, 0.08);
  g.add(armL);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
  gun.position.set(0.18, 1.22, 0.3);
  g.add(gun);
  // Team ring on the ground, so friend/foe reads at a glance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  scene.add(g);
  return { group: g, head, torso, legL, legR };
}

function buildViewmodel() {
  viewmodel = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.45, metalness: 0.6 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
  viewmodel.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  viewmodel.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), mid);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.35;
  viewmodel.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), mid);
  sight.position.set(0, 0.1, -0.05);
  viewmodel.add(sight);
  viewmodel.position.set(0.28, -0.26, -0.55);
  camera.add(viewmodel);
  muzzleLight = new THREE.PointLight(0xffc266, 0, 9, 1.6);
  muzzleLight.position.set(0.28, -0.2, -1.1);
  camera.add(muzzleLight);
}

function buildCharge() {
  chargeMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.22, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.7 }),
  );
  body.position.y = 0.11;
  chargeMesh.add(body);
  chargeLight = new THREE.PointLight(0xff3b30, 0, 6, 1.5);
  chargeLight.position.y = 0.4;
  chargeMesh.add(chargeLight);
  const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  blink.position.y = 0.26;
  chargeMesh.add(blink);
  chargeMesh.visible = false;
  scene.add(chargeMesh);

  boomMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0 }),
  );
  boomMesh.visible = false;
  scene.add(boomMesh);
  boomLight = new THREE.PointLight(0xff8a2a, 0, 30, 1.4);
  scene.add(boomLight);
}

// --- per-frame sync -------------------------------------------------------

export function syncScene(s, dt) {
  const p = s.player;
  // Camera from the player.
  const eyeY = eyeHeight(p) + (p.y ?? 0);
  camera.position.set(p.x, eyeY, p.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  // Recoil kick + weapon bob.
  const bob = p.speed > 0.5 ? Math.sin(s.time * 9) * 0.006 * Math.min(1, p.speed / 5) : 0;
  viewmodel.position.y = -0.26 + bob - (p.recoil || 0) * 0.5;
  viewmodel.position.x = 0.28 - (p.ads ? 0.28 : 0);
  viewmodel.position.z = -0.55 + (p.ads ? -0.12 : 0);
  camera.fov = p.ads ? 55 : 74;
  camera.updateProjectionMatrix();
  muzzleLight.intensity = s.flashes.length ? 26 : 0;

  // Bots.
  const seenIds = new Set();
  for (const b of s.bots) {
    seenIds.add(b.id);
    let m = botMeshes.get(b.id);
    if (!m) { m = makeBotMesh(b.team); botMeshes.set(b.id, m); }
    m.group.visible = b.alive;
    if (!b.alive) continue;
    m.group.position.set(b.x, b.y ?? 0, b.z);
    m.group.rotation.y = b.yaw;
    const swing = b.speed > 0.3 ? Math.sin(s.time * 10 + b.id) * 0.35 : 0;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
  }
  for (const [id, m] of botMeshes) if (!seenIds.has(id)) { scene.remove(m.group); botMeshes.delete(id); }

  // Charge.
  const ch = s.charge;
  if (ch.state === 'planted') {
    chargeMesh.visible = true;
    chargeMesh.position.set(ch.x, 0, ch.z);
    chargeLight.intensity = (Math.sin(s.time * 6) > 0) ? 6 : 0.5;
  } else if (ch.state === 'dropped') {
    chargeMesh.visible = true;
    chargeMesh.position.set(ch.x, 0, ch.z);
    chargeLight.intensity = 1.5;
  } else chargeMesh.visible = false;

  // Tracers.
  while (tracerGroup.children.length < s.tracers.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    tracerGroup.add(new THREE.Line(geo, tracerMat));
  }
  s.tracers.forEach((t, i) => {
    const line = tracerGroup.children[i];
    line.visible = true;
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, t.x0, t.y0, t.z0);
    pos.setXYZ(1, t.x1, t.y1, t.z1);
    pos.needsUpdate = true;
  });
  for (let i = s.tracers.length; i < tracerGroup.children.length; i++) tracerGroup.children[i].visible = false;

  // Smoke puffs.
  while (smokeMeshes.length < s.smokes.length) {
    const sm = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55, roughness: 1 }),
    );
    scene.add(sm);
    smokeMeshes.push(sm);
  }
  s.smokes.forEach((sm, i) => {
    const m = smokeMeshes[i];
    m.visible = true;
    m.position.set(sm.x, sm.y, sm.z);
    m.scale.setScalar(sm.r * (1 + 0.05 * Math.sin(s.time * 2 + i)));
  });
  for (let i = s.smokes.length; i < smokeMeshes.length; i++) smokeMeshes[i].visible = false;

  // Explosions.
  const boom = s.booms[0];
  if (boom) {
    const k = 1 - boom.t / 0.7;
    boomMesh.visible = true;
    boomMesh.position.set(boom.x, boom.y, boom.z);
    boomMesh.scale.setScalar(1 + k * 8);
    boomMesh.material.opacity = Math.max(0, 0.85 - k);
    boomLight.position.set(boom.x, 2, boom.z);
    boomLight.intensity = 60 * (1 - k);
  } else {
    boomMesh.visible = false;
    boomLight.intensity = 0;
  }

  // Damage flash overlay is DOM-driven (hud), camera shake on hurt.
  if (p.flash > 0) {
    camera.rotation.x += (Math.random() - 0.5) * 0.01;
    p.flash -= dt;
  }
  p.recoil = Math.max(0, (p.recoil || 0) - dt * 0.35);
}

export function render() {
  renderer.render(scene, camera);
}

export function canvasEl() { return renderer.domElement; }
