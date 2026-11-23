// Procedural low-poly landmark models (no external assets needed).
import * as THREE from '../vendor/three.module.min.js';
import { rng, vnoise } from './noise.js';

const V2 = THREE.Vector2;
const SQ2 = Math.SQRT2;
const QPI = Math.PI / 4;

export function createMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  return {
    gold: std(0xe6b04a, { metalness: 1, roughness: 0.24, emissive: 0x5a3300, emissiveIntensity: 0.45 }),
    goldSoft: std(0xd9a23c, { metalness: 0.85, roughness: 0.38, emissive: 0x3a2000, emissiveIntensity: 0.25 }),
    brick: std(0xa8532e, { roughness: 0.95, flatShading: true }),
    laterite: std(0x9b6b48, { roughness: 0.95, flatShading: true }),
    stone: std(0xe6d7b9, { roughness: 0.9 }),
    stoneFlat: std(0xe6d7b9, { roughness: 0.9, flatShading: true }),
    stoneDark: std(0x7a6a58, { roughness: 0.95, flatShading: true }),
    white: std(0xfbf5ea, { roughness: 0.5 }),
    whiteFlat: std(0xfbf5ea, { roughness: 0.5, flatShading: true }),
    roofRed: std(0xb53a24, { roughness: 0.42, flatShading: true }),
    roofGreen: std(0x1f6e58, { roughness: 0.42, flatShading: true }),
    dark: std(0x2b1d12, { roughness: 1 }),
  };
}

const cyl = (rt, rb, h, seg, mat, y = 0, x = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  return m;
};
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  return m;
};

// Square-sided frustum aligned to the axes (faces face +-x / +-z). r = circumradius.
function squareFrustum(rt, rb, h, mat) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 4, 1);
  g.rotateY(QPI);
  return new THREE.Mesh(g, mat);
}

function hipRoof(w, d, h, mat) {
  const g = new THREE.CylinderGeometry(0.42 * SQ2, SQ2, h, 4, 1);
  g.rotateY(QPI);
  const m = new THREE.Mesh(g, mat);
  m.scale.set(w / 2, 1, d / 2);
  return m;
}

/* ---------- Bell shaped golden chedi (Phra Pathom Chedi style) ---------- */
export function makeBellChedi(M, { R = 4, H = 8, mat = M.gold, platform = true } = {}) {
  const g = new THREE.Group();
  let y = 0;
  if (platform) {
    for (const [r, h] of [[R * 1.95, 0.7], [R * 1.7, 0.6], [R * 1.46, 0.55]]) {
      g.add(cyl(r, r, h, 64, M.white, y));
      y += h;
    }
    g.add(cyl(R * 1.47, R * 1.47, 0.08, 64, M.goldSoft, y));
    y += 0.08;
  }
  const prof = [new V2(0.001, 0), new V2(R * 1.06, 0), new V2(R * 1.06, 0.15)];
  const N = 30, neck = R * 0.19, bellH = H * 0.6;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push(new V2(neck + (R - neck) * Math.pow(Math.cos((t * Math.PI) / 2), 0.72), 0.15 + t * (bellH - 0.15)));
  }
  let yy = bellH;
  const rings = 11;
  for (let k = 0; k < rings; k++) {
    const rr = neck * 1.35 * (1 - k / (rings + 2));
    prof.push(new V2(rr * 1.25, yy), new V2(rr * 1.25, yy + H * 0.012), new V2(rr * 0.85, yy + H * 0.014), new V2(rr * 0.8, yy + H * 0.04));
    yy += H * 0.04;
  }
  prof.push(new V2(0.01, yy + H * 0.1));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), mat);
  body.position.y = y;
  g.add(body);
  g.userData.height = y + yy + H * 0.1;
  return g;
}

/* ---------- Wat Arun style prang ---------- */
function buildPrangBody(M) {
  const g = new THREE.Group();
  let y = 0;
  const tiers = [[5.6, 4.7, 2.0], [4.7, 3.9, 1.8], [3.9, 3.2, 1.6], [3.2, 2.55, 1.5], [2.55, 1.9, 1.4]];
  for (const [rb, rt, h] of tiers) {
    const t = squareFrustum(rt, rb, h, M.whiteFlat);
    t.position.y = y + h / 2;
    g.add(t);
    const trim = squareFrustum(rb * 1.02, rb * 1.02, 0.14, M.goldSoft);
    trim.position.y = y + 0.07;
    g.add(trim);
    const face = ((rb + rt) / 2 / SQ2) * 0.98;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const n = box(0.9, h * 0.5, 0.2, M.dark, Math.sin(a) * face, y + h * 0.2, Math.cos(a) * face);
      n.rotation.y = a;
      g.add(n);
    }
    y += h;
  }
  const sp = [];
  const SH = 7;
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    sp.push(new V2(1.9 * Math.pow(1 - t, 1.15) * (1 + 0.1 * Math.sin(t * Math.PI * 6) * (1 - t)), t * SH));
  }
  const sg = new THREE.LatheGeometry(sp, 4);
  sg.rotateY(QPI);
  const spire = new THREE.Mesh(sg, M.whiteFlat);
  spire.position.y = y;
  g.add(spire);
  const top = y + SH;
  g.add(cyl(0.05, 0.08, 2.6, 8, M.gold, top - 0.2));
  for (const dx of [-0.45, 0, 0.45]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, dx === 0 ? 1.0 : 0.7, 8), M.gold);
    c.position.set(dx, top + 2.6 + (dx === 0 ? 0.4 : 0.2), 0);
    g.add(c);
  }
  g.userData.height = top + 3.6;
  return g;
}

export function makeWatArun(M) {
  const g = new THREE.Group();
  g.add(box(14, 0.9, 14, M.white));
  g.add(box(11, 0.9, 11, M.stone, 0, 0.9, 0));
  const main = buildPrangBody(M);
  main.position.y = 1.8;
  g.add(main);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const s = buildPrangBody(M);
      s.scale.setScalar(0.34);
      s.position.set(sx * 5.6, 0.9, sz * 5.6);
      g.add(s);
    }
  }
  g.userData.height = 1.8 + main.userData.height;
  return g;
}

/* ---------- Khmer style prang (Lopburi / Ayutthaya) ---------- */
export function makeKhmerTower(M, { mat = M.laterite, s = 1 } = {}) {
  const g = new THREE.Group();
  g.add(box(3.4, 3.2, 3.4, mat));
  g.add(box(1.0, 1.8, 0.2, M.dark, 0, 0.3, 1.72));
  g.add(box(0.3, 2.6, 0.3, mat, 1.75, 0, 1.75));
  g.add(box(0.3, 2.6, 0.3, mat, -1.75, 0, 1.75));
  let y = 3.2, w = 3.0;
  for (let i = 0; i < 5; i++) {
    const h = 1.1 - i * 0.08;
    g.add(box(w, h, w, mat, 0, y));
    g.add(box(0.28, h * 0.8, 0.28, mat, w / 2, y, w / 2));
    g.add(box(0.28, h * 0.8, 0.28, mat, -w / 2, y, w / 2));
    y += h;
    w *= 0.8;
  }
  const prof = [];
  const r0 = 0.707 * w * 0.95;
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    prof.push(new V2(r0 * Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * 38) * (1 - t)), t * 4.4));
  }
  const lg = new THREE.LatheGeometry(prof, 4);
  lg.rotateY(QPI);
  const top = new THREE.Mesh(lg, mat);
  top.position.y = y;
  g.add(top);
  g.add(cyl(0.04, 0.07, 1.4, 6, M.stone, y + 4.3));
  g.scale.setScalar(s);
  g.userData.height = (y + 5.7) * s;
  return g;
}

export function makeBuddha(M, mat) {
  const g = new THREE.Group();
  g.add(cyl(1.5, 1.7, 0.6, 24, mat));
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
  body.scale.set(1.2, 1.05, 0.85);
  body.position.y = 1.65;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), mat);
  head.position.y = 3.05;
  g.add(head);
  const ush = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), mat);
  ush.position.y = 3.65;
  g.add(ush);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 40), M.gold);
  halo.position.set(0, 3.1, -0.55);
  g.add(halo);
  return g;
}

/* ---------- Bangkok: Wat Arun + Grand Palace inspired ensemble ---------- */
export function makeBangkok(M) {
  const g = new THREE.Group();
  const arun = makeWatArun(M);
  arun.scale.setScalar(0.62);
  arun.position.set(-10, 0, -2);
  g.add(arun);

  g.add(box(18, 0.8, 10, M.white, 8, 0, 1));
  g.add(box(8, 3, 4.2, M.white, 4, 0.8, 1));
  for (let i = -3; i <= 3; i++) g.add(cyl(0.12, 0.12, 2.6, 8, M.goldSoft, 0.8, 4 + i * 1.1, 3.2));
  const r1 = hipRoof(9.6, 5.8, 1.5, M.roofRed);
  r1.position.set(4, 3.8 + 0.75, 1);
  g.add(r1);
  const r2 = hipRoof(8, 4.6, 1.4, M.roofGreen);
  r2.position.set(4, 5.3 + 0.7, 1);
  g.add(r2);
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), M.gold);
    c.position.set(4 + sx * 3.3, 7.1, 1);
    c.rotation.z = -sx * 0.5;
    g.add(c);
  }
  g.add(box(5.2, 2.2, 3.4, M.white, 13, 0.8, 4));
  const r3 = hipRoof(6.4, 4.4, 1.3, M.roofRed);
  r3.position.set(13, 3 + 0.65, 4);
  g.add(r3);

  const chedi = makeBellChedi(M, { R: 1.6, H: 7, platform: false });
  chedi.position.set(11, 0.8, -2.5);
  g.add(box(4.4, 1.2, 4.4, M.white, 11, 0.8, -2.5));
  chedi.position.y = 2.0;
  g.add(chedi);
  g.userData.height = 17;
  return g;
}

/* ---------- Nakhon Pathom: giant golden bell + cloister ---------- */
export function makeNakhonPathom(M) {
  const g = new THREE.Group();
  const big = makeBellChedi(M, { R: 5.2, H: 11 });
  g.add(big);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 2.4, 80, 1, true), new THREE.MeshStandardMaterial({ color: 0xfbf5ea, roughness: 0.5, side: THREE.DoubleSide }));
  wall.position.y = 1.2;
  g.add(wall);
  const roof = new THREE.Mesh(new THREE.TorusGeometry(14, 0.55, 6, 80), M.roofRed);
  roof.rotation.x = Math.PI / 2;
  roof.position.y = 2.5;
  g.add(roof);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(14, 0.14, 6, 80), M.gold);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 3.05;
  g.add(trim);
  for (let k = 0; k < 4; k++) {
    const a = QPI + (k * Math.PI) / 2;
    const c = makeBellChedi(M, { R: 0.95, H: 3.4, platform: false });
    c.position.set(Math.cos(a) * 11.2, 0, Math.sin(a) * 11.2);
    g.add(c);
  }
  g.add(box(7, 2.4, 4, M.white, 21, 0, 5));
  const rr = hipRoof(8.6, 5.4, 1.5, M.roofRed);
  rr.position.set(21, 2.4 + 0.75, 5);
  g.add(rr);
  g.userData.height = big.userData.height;
  return g;
}

/* ---------- Ayutthaya: bell chedis, brick prang and ruins ---------- */
export function makeAyutthaya(M) {
  const r = rng(11);
  const g = new THREE.Group();
  g.add(box(28, 0.5, 11, M.stoneFlat));
  [-7.5, 0, 7.5].forEach((x) => {
    g.add(box(5.4, 0.9, 5.4, M.stoneFlat, x, 0.5, 0));
    const c = makeBellChedi(M, { R: 2.1, H: 6.4, mat: M.stone, platform: false });
    c.position.set(x, 1.4, 0);
    g.add(c);
  });
  const prang = makeKhmerTower(M, { mat: M.brick, s: 1.5 });
  prang.position.set(-14, 0.5, -6);
  g.add(prang);
  for (let i = 0; i < 16; i++) {
    const w = 1 + r() * 2.6, h = 0.7 + r() * 2.4;
    g.add(box(w, h, 0.7, M.brick, -12 + r() * 26, 0.5, 5.4 + r() * 4));
  }
  for (let i = 0; i < 8; i++) g.add(cyl(0.3, 0.4, 2 + r() * 2.5, 8, M.brick, 0.5, -11 + i * 1.7, -6.5));
  const b = makeBuddha(M, M.stoneFlat);
  b.position.set(11.5, 0.5, 7);
  g.add(b);
  g.userData.height = 12;
  return g;
}

/* ---------- Saraburi: sacred mountain with a golden chedi ---------- */
export function makeMountain(M) {
  const g = new THREE.Group();
  const H = 16, R = 11;
  const geo = new THREE.CylinderGeometry(0.9, R, H, 56, 30, true);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x4b7a3a), cB = new THREE.Color(0x77864c), cC = new THREE.Color(0xa59c8a), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + H / 2) / H;
    const ang = Math.atan2(z, x);
    const base = 0.9 + (R - 0.9) * Math.pow(1 - t, 1.3);
    const n = vnoise(Math.cos(ang) * 2.2 + t * 4, Math.sin(ang) * 2.2 + t * 4);
    const n2 = vnoise(Math.cos(ang) * 6 + 9, Math.sin(ang) * 6 + t * 9);
    const rr = base * (0.78 + 0.4 * n + 0.1 * n2) * (t > 0.96 ? 0.9 : 1);
    pos.setXYZ(i, Math.cos(ang) * rr, y + (n2 - 0.5) * 0.9 * (1 - t), Math.sin(ang) * rr);
    tmp.copy(cA).lerp(cB, Math.min(1, t * 1.6)).lerp(cC, Math.max(0, (t - 0.5) * 2 + (n2 - 0.5) * 0.6));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(0, H / 2, 0);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })));
  g.add(cyl(1.6, 1.9, 0.5, 20, M.stoneFlat, H - 0.4));
  const c = makeBellChedi(M, { R: 1.0, H: 2.8, platform: false });
  c.position.y = H + 0.1;
  g.add(c);
  g.add(box(2.4, 1.3, 1.6, M.white, 2.6, H - 0.7, 0.4));
  const rf = hipRoof(3, 2.2, 0.8, M.roofRed);
  rf.position.set(2.6, H + 0.2 + 0.4, 0.4);
  g.add(rf);
  // winding glowing stairway
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = 1.2 + t * 7.2;
    const rad = (0.9 + (R - 0.9) * Math.pow(1 - t * 0.93, 1.3)) * 0.92 + 0.3;
    pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.3 + t * (H - 0.8), Math.sin(a) * rad));
  }
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.07, 5, false),
    new THREE.MeshBasicMaterial({ color: 0xffc055, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  g.add(tube);
  g.userData.height = H + 4;
  return g;
}

/* ---------- Lopburi: Phra Prang Sam Yot ---------- */
export function makeLopburi(M) {
  const g = new THREE.Group();
  g.add(box(20, 0.7, 8, M.stoneFlat));
  const mid = makeKhmerTower(M, { s: 1.3 });
  mid.position.set(0, 0.7, 0);
  g.add(mid);
  [-6, 6].forEach((x) => {
    const t = makeKhmerTower(M, { s: 1.0 });
    t.position.set(x, 0.7, 0);
    g.add(t);
  });
  [-3, 3].forEach((x) => g.add(box(3.4, 2.4, 2.2, M.laterite, x, 0.7, 0)));
  for (let i = 0; i < 6; i++) g.add(box(1.2 + (i % 3) * 0.5, 0.8 + (i % 2) * 0.9, 0.7, M.laterite, -8.5 + i * 3.4, 0.7, 5));
  const shrine = new THREE.Group();
  shrine.add(box(3.6, 2.4, 3.4, M.white));
  const rf = hipRoof(4.6, 4.4, 1.3, M.roofRed);
  rf.position.set(0, 2.4 + 0.65, 0);
  shrine.add(rf);
  shrine.position.set(12.5, 0, 3);
  g.add(shrine);
  g.userData.height = 12;
  return g;
}
