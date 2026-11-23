import * as THREE from '../vendor/three.module.min.js';
import {
  createMaterials, makeBangkok, makeNakhonPathom, makeAyutthaya, makeMountain, makeLopburi,
} from './models.js';
import { makeEnvironment, makeSkyMesh, radialTexture } from './env.js';
import { fbm, rng, clamp, lerp, smoothstep } from './noise.js';

const MS = 0.62; // landmark scale relative to authored size
const STATIONS = [
  { name: 'กรุงเทพมหานคร', path: [-40, 14], model: [-40, 6], lookY: 5, d: 44, h: 16, az: 0.32, label: 17 },
  { name: 'นครปฐม', path: [-24, -6], model: [-24, -16], lookY: 6.5, d: 54, h: 20, az: -0.4, label: 20 },
  { name: 'พระนครศรีอยุธยา', path: [-2, 4], model: [-2, -5], lookY: 3.5, d: 42, h: 15, az: 0.36, label: 14 },
  { name: 'สระบุรี', path: [24, -14], model: [31, -30], lookY: 7, d: 56, h: 20, az: -0.32, label: 23 },
  { name: 'ลพบุรี', path: [42, 6], model: [42, -6], lookY: 4.5, d: 42, h: 15, az: 0.38, label: 15 },
];
const mid = (a, b, dx, dz) => [(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dz];
const P = STATIONS.map((s) => s.path);
const pathXZ = [P[0], mid(P[0], P[1], -3, 2), P[1], mid(P[1], P[2], 0, -3), P[2], mid(P[2], P[3], 2, -4), P[3], mid(P[3], P[4], 4, -2), P[4]];
const pathCurve = new THREE.CatmullRomCurve3(pathXZ.map(([x, z]) => new THREE.Vector3(x, 0.28, z)), false, 'catmullrom', 0.5);
const riverXZ = [[-90, 29], [-60, 28], [-45, 26.5], [-30, 27], [-18, 21], [-8, 16], [4, 13], [14, 13], [26, 17], [38, 23], [55, 25], [90, 21]];
const riverCurve = new THREE.CatmullRomCurve3(riverXZ.map(([x, z]) => new THREE.Vector3(x, -0.25, z)), false, 'catmullrom', 0.5);
const RIVER_HALF = 7.2;

const pathSamples = pathCurve.getSpacedPoints(220);
const DIV = 400;
const pathLens = pathCurve.getLengths(DIV);
// parameter u (what getPoint takes) -> arc-length fraction (what the tube's uv.x is)
const uToArc = (u) => {
  const f = clamp(u) * DIV, i = Math.min(Math.floor(f), DIV - 1);
  return lerp(pathLens[i], pathLens[i + 1], f - i) / pathLens[DIV];
};
const riverSamples = riverCurve.getSpacedPoints(140);
const distTo = (samples, x, z) => {
  let m = 1e9;
  for (const p of samples) {
    const dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
};

function groundH(x, z, dPath, dRiver) {
  let h = (fbm(x * 0.045, z * 0.045) - 0.5) * 4.0;
  h *= smoothstep(5, 20, dPath);
  const ridge = fbm(x * 0.035 + 5, z * 0.035 + 3) * 0.8 + 0.35;
  const tz = clamp((-z - 42) / 40);
  h += tz * tz * (3 - 2 * tz) * 28 * ridge;
  const tx = clamp((Math.abs(x) - 66) / 18);
  h += tx * tx * 15 * ridge;
  const rc = 1 - smoothstep(4, 8, dRiver);
  return h * (1 - rc) - rc * 0.9;
}

export function initJourney(canvas, pinsEl, { reduced = false, lowPower = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  const fogCol = new THREE.Color(0xf6e3c0);
  scene.fog = new THREE.FogExp2(fogCol, 0.0042);
  const sky = makeSkyMesh(500, { sun: 1.2 });
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
  const M = createMaterials();

  scene.add(new THREE.HemisphereLight(0xfff0d2, 0x9a8a5c, 0.8));
  const sun = new THREE.DirectionalLight(0xffd9a0, 3.4);
  sun.position.set(-60, 45, 20);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.6);
  fill.position.set(40, 20, 60);
  scene.add(fill);

  /* ---------- terrain ---------- */
  const W = 190, D = 150, SX = 190, SZ = 150;
  const tgeo = new THREE.PlaneGeometry(W, D, SX, SZ);
  tgeo.rotateX(-Math.PI / 2);
  tgeo.translate(0, 0, -20);
  {
    const pos = tgeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0xa3c35f), grassB = new THREE.Color(0x628f40), rock = new THREE.Color(0x869a86), sand = new THREE.Color(0xd2c18c), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const dp = distTo(pathSamples, x, z), dr = distTo(riverSamples, x, z);
      const h = groundH(x, z, dp, dr);
      pos.setY(i, h);
      const patch = fbm(x * 0.09 + 20, z * 0.09 + 7);
      c.copy(grassA).lerp(grassB, clamp(patch * 1.3 - 0.1));
      c.lerp(sand, (1 - smoothstep(7.5, 11.5, dr)) * 0.75);
      c.lerp(rock, smoothstep(6, 15, h));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    tgeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tgeo.computeVertexNormals();
  }
  scene.add(new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));

  /* ---------- river ---------- */
  const rpts = riverCurve.getSpacedPoints(160);
  const rpos = [], ruv = [], ridx = [];
  let acc = 0;
  for (let i = 0; i < rpts.length; i++) {
    const p = rpts[i];
    const tan = riverCurve.getTangent(i / (rpts.length - 1));
    const nx = -tan.z, nz = tan.x;
    const l = Math.hypot(nx, nz) || 1;
    if (i) acc += p.distanceTo(rpts[i - 1]);
    rpos.push(p.x + (nx / l) * RIVER_HALF, p.y, p.z + (nz / l) * RIVER_HALF, p.x - (nx / l) * RIVER_HALF, p.y, p.z - (nz / l) * RIVER_HALF);
    ruv.push(acc / 12, 0, acc / 12, 1);
    if (i < rpts.length - 1) {
      const a = i * 2;
      ridx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rgeo.setIndex(ridx);
  const waterMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.7, 0.22, -0.65).normalize() } }]),
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix*vec4(position,1.); vW = wp.xyz;
        vec4 mvPosition = viewMatrix*wp;
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 q = vW.xz*0.22;
        float n = vn(q*2.0 + vec2(uTime*0.15, uTime*0.1)) * 0.6 + vn(q*5.0 - vec2(uTime*0.2, 0.)) * 0.4;
        vec3 view = normalize(cameraPosition - vW);
        vec3 nrm = normalize(vec3((n-0.5)*0.5, 1.0, (vn(q*3.+7.)-0.5)*0.5));
        float fres = pow(1.0 - max(dot(view, nrm), 0.0), 3.0);
        vec3 deep = vec3(0.07,0.30,0.38), shallow = vec3(0.22,0.52,0.52), skyc = vec3(0.98,0.86,0.62);
        float edge = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        vec3 col = mix(shallow, deep, edge);
        col = mix(col, skyc, fres*0.8);
        vec3 r = reflect(-view, nrm);
        float glint = pow(max(dot(r, uSun), 0.0), 40.0);
        col += vec3(1.0,0.82,0.5) * glint * (0.6 + n);
        col += smoothstep(0.62, 0.9, n) * 0.07;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
  scene.add(new THREE.Mesh(rgeo, waterMat));

  /* boats */
  const boats = [];
  const boatCols = [0xc0392b, 0xf2e8d5, 0x1f6e58, 0xd9a23c];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 5.6), new THREE.MeshStandardMaterial({ color: boatCols[i], roughness: 0.6 })).translateY(0.05));
    b.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 3.2), new THREE.MeshStandardMaterial({ color: 0xfbf5ea, roughness: 0.6 })).translateY(0.6));
    b.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 3.5), new THREE.MeshStandardMaterial({ color: 0xb53a24, roughness: 0.5 })).translateY(1.0));
    scene.add(b);
    boats.push({ g: b, t: Math.random(), v: (0.006 + Math.random() * 0.006) * (i % 2 ? 1 : -1), lat: (i - 1.5) * 2.2 });
  }

  /* ---------- glowing journey path ---------- */
  const pathMat = (radius, alpha) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uProg: { value: 0 }, uAlpha: { value: alpha } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uProg, uAlpha;
      void main(){
        float done = 1.0 - smoothstep(uProg-0.01, uProg+0.01, vUv.x);
        float pulse = pow(0.5+0.5*sin(vUv.x*220.0 - uTime*3.0), 6.0);
        vec3 gold = vec3(1.0,0.74,0.28);
        vec3 col = mix(vec3(0.95,0.85,0.6)*0.45, gold, done) + pulse*vec3(1.0,0.9,0.6)*0.6*done;
        float a = uAlpha * mix(0.35, 1.0, done);
        gl_FragColor = vec4(col*a, a);
      }`,
  });
  const pathCore = new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 600, 0.28, 8, false), pathMat(0.28, 1.0));
  const pathHalo = new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 300, 1.1, 8, false), pathMat(1.1, 0.28));
  scene.add(pathCore, pathHalo);

  /* beacons at each stop */
  const beaconTex = radialTexture([[0, 'rgba(255,225,150,0.9)'], [0.4, 'rgba(255,190,80,0.35)'], [1, 'rgba(255,170,60,0)']]);
  const beacons = STATIONS.map((s) => {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.6, 9, 16, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uA: { value: 0.3 } },
        vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'varying float vY; uniform float uA; void main(){ float a = (1.0-vY)*uA; gl_FragColor=vec4(vec3(1.0,0.78,0.38)*a, a); }',
      })
    );
    pillar.position.y = 4.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.35;
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.scale.set(7, 7, 1);
    disc.position.y = 1.2;
    g.add(pillar, ring, disc);
    g.position.set(s.path[0], 0, s.path[1]);
    scene.add(g);
    return { g, pillar, ring, disc };
  });

  /* ---------- landmarks ---------- */
  const blobTex = radialTexture([[0, 'rgba(60,40,20,0.45)'], [0.6, 'rgba(60,40,20,0.18)'], [1, 'rgba(60,40,20,0)']]);
  const blob = (r, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    scene.add(m);
  };
  const builders = [makeBangkok, makeNakhonPathom, makeAyutthaya, makeMountain, makeLopburi];
  const blobR = [22, 26, 22, 17, 20].map((r) => r * MS);
  const models = builders.map((fn, i) => {
    const g = fn(M);
    g.scale.setScalar(MS);
    g.position.set(STATIONS[i].model[0], 0, STATIONS[i].model[1]);
    scene.add(g);
    blob(blobR[i], STATIONS[i].model[0], STATIONS[i].model[1]);
    return g;
  });
  models[0].position.x += 3;       // nudge for composition
models[4].position.x += 1;

  /* ---------- trees ---------- */
  {
    const R = rng(21);
    const count = lowPower ? 700 : 1500;
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    crownGeo.scale(1.5, 1.25, 1.5);
    crownGeo.translate(0, 2.7, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5);
    trunkGeo.translate(0, 1.2, 0);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), count);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 }), count);
    const keepOut = STATIONS.map((s) => ({ x: s.model[0], z: s.model[1] }));
    const radii = [22, 28, 22, 18, 22].map((r) => r * MS + 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
    const greens = [0x4f8a3a, 0x5f9a3f, 0x3f7a35, 0x78a845, 0x2f6b3a];
    let n = 0, tries = 0;
    while (n < count && tries++ < 12000) {
      const x = (R() - 0.5) * 170, z = -75 + R() * 125;
      if (fbm(x * 0.06 + 3, z * 0.06 + 9) < 0.44) continue;
      const dp = distTo(pathSamples, x, z);
      if (dp < 5) continue;
      const dr = distTo(riverSamples, x, z);
      if (dr < 9.5) continue;
      if (keepOut.some((k, i) => Math.hypot(k.x - x, k.z - z) < radii[i])) continue;
      const y = groundH(x, z, dp, dr);
      if (y > 9) continue;
      const s = 0.42 + R() * 0.5;
      e.set(0, R() * 6.28, 0);
      q.setFromEuler(e);
      sc.set(s, s * (0.9 + R() * 0.5), s);
      ps.set(x, y - 0.1, z);
      m4.compose(ps, q, sc);
      crowns.setMatrixAt(n, m4);
      trunks.setMatrixAt(n, m4);
      c.set(greens[(R() * greens.length) | 0]);
      c.offsetHSL(0, 0, (R() - 0.5) * 0.06);
      crowns.setColorAt(n, c);
      n++;
    }
    crowns.count = trunks.count = n;
    scene.add(crowns, trunks);
  }

  /* ---------- mist, dust, lanterns ---------- */
  const mistTex = radialTexture([[0, 'rgba(255,248,232,0.7)'], [0.55, 'rgba(255,244,224,0.25)'], [1, 'rgba(255,244,224,0)']], 256);
  const R2 = rng(3);
  const mist = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.32, fog: false }));
    const nearMt = i < 6;
    const x = nearMt ? 31 + (R2() - 0.5) * 30 : (R2() - 0.5) * 150;
    const z = nearMt ? -34 - R2() * 8 : -75 + R2() * 35;
    s.position.set(x, nearMt ? 3 + R2() * 7 : 2 + R2() * 6, z);
    const k = nearMt ? 16 + R2() * 12 : 26 + R2() * 24;
    s.scale.set(k * 1.6, k * 0.5, 1);
    scene.add(s);
    mist.push({ s, x, b: R2() * 6 });
  }

  const makePoints = (count, size, kind) => {
    const R3 = rng(kind === 'lantern' ? 8 : 4);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([(R3() - 0.5) * 140, R3() * 26, -50 + R3() * 85], i * 3);
      seed[i] = R3();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const lant = kind === 'lantern';
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float aSeed; uniform float uTime, uPx; varying float vA;
        void main(){
          vec3 p = position;
          float sp = ${lant ? '0.5' : '0.35'} + aSeed*${lant ? '0.5' : '0.4'};
          p.y = mod(p.y + uTime*sp, 28.0);
          p.x += sin(uTime*0.3 + aSeed*30.0)*${lant ? '2.5' : '1.0'};
          vec4 mv = modelViewMatrix*vec4(p,1.);
          gl_Position = projectionMatrix*mv;
          gl_PointSize = (${size.toFixed(1)} * (0.6 + aSeed)) * uPx * (60.0 / -mv.z);
          vA = (0.4 + 0.6*abs(sin(uTime*(0.5+aSeed)+aSeed*50.0))) * smoothstep(0.0,3.0,p.y) * (1.0 - smoothstep(22.0,28.0,p.y));
        }`,
      fragmentShader: `varying float vA; void main(){
          vec2 uv = gl_PointCoord-0.5;
          ${lant
            ? 'float d = length(uv*vec2(1.0,0.8)); float core = smoothstep(0.5,0.1,d); gl_FragColor = vec4(vec3(1.0,0.62,0.22)*core*vA, core*vA*0.9);'
            : 'float d = length(uv); float a = smoothstep(0.5,0.0,d)*vA; gl_FragColor = vec4(1.0,0.82,0.42,a);'}
        }`,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  };
  const dust = makePoints(lowPower ? 500 : 1100, 1.6, 'dust');
  const lanterns = makePoints(lowPower ? 25 : 55, 5.5, 'lantern');

  /* ---------- HTML pins ---------- */
  const pinEls = STATIONS.map((s, i) => {
    const el = document.createElement('button');
    el.className = 'pin';
    el.type = 'button';
    el.dataset.go = i;
    el.innerHTML = `<span class="pin__dot"></span><span class="pin__name">${s.name}</span>`;
    pinsEl.appendChild(el);
    return el;
  });
  const pinPos = STATIONS.map((s) => new THREE.Vector3(s.model[0], s.label * MS, s.model[1]));
  pinPos[0].x += 3;

  /* ---------- camera rig ---------- */
  const offsets = STATIONS.map((s) => new THREE.Vector3(s.model[0] - s.path[0], s.lookY * MS, s.model[1] - s.path[1]));
  offsets[0].x += 3;
  offsets[4].x += 1;
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const right = new THREE.Vector3(), target = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camPos = new THREE.Vector3();

  const state = { target: 0, prog: 0, t: 0, visible: true, w: 1, h: 1 };

  function placeCamera(p) {
    const s = clamp(p, 0, 1) * 4;
    const i = Math.min(Math.floor(s), 3);
    const f = s - i;
    const e = ease(clamp((f - 0.18) / 0.64));
    const u = (i + e) / 4;
    pathCurve.getPoint(u, target);
    tmp.copy(offsets[i]).lerp(offsets[i + 1], e);
    target.add(tmp);
    const d = lerp(STATIONS[i].d, STATIONS[i + 1].d, e) * (state.w / state.h < 1 ? 1.45 : 1);
    const h = lerp(STATIONS[i].h, STATIONS[i + 1].h, e) * (state.w / state.h < 1 ? 1.2 : 1.25);
    const az = lerp(STATIONS[i].az, STATIONS[i + 1].az, e) + Math.sin(state.t * 0.25) * 0.03;
    camPos.set(target.x + Math.sin(az) * d, target.y + h, target.z + Math.cos(az) * d);
    camera.position.copy(camPos);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
    if (camera.aspect > 1.2) {
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      camera.position.addScaledVector(right, -half * camera.aspect * 0.3);
    } else {
      right.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(right, -half * 0.42);
    }
    return { u, s, e, i };
  }

  const layout = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    state.w = w; state.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : 40;
    camera.updateProjectionMatrix();
  };
  layout();
  window.addEventListener('resize', layout);
  const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; }, { threshold: 0 });
  io.observe(canvas);

  const clock = new THREE.Clock();
  const proj = new THREE.Vector3();
  const boatPos = new THREE.Vector3();

  function frame(dt, snap) {
    state.t += dt;
    const t = state.t;
    state.prog = snap ? state.target : lerp(state.prog, state.target, 1 - Math.pow(0.0015, dt));
    const { s } = placeCamera(state.prog);
    sky.position.copy(camera.position);

    waterMat.uniforms.uTime.value = t;
    pathCore.material.uniforms.uTime.value = t;
    pathHalo.material.uniforms.uTime.value = t;
    // progress in curve parameter space of the tube (uv.x ~ u)
    const uNow = (() => { const ss = clamp(state.prog, 0, 1) * 4; const i = Math.min(Math.floor(ss), 3); return (i + ease(clamp((ss - i - 0.18) / 0.64))) / 4; })();
    const arc = uToArc(uNow);
    pathCore.material.uniforms.uProg.value = arc;
    pathHalo.material.uniforms.uProg.value = arc;
    dust.material.uniforms.uTime.value = t;
    lanterns.material.uniforms.uTime.value = t;

    beacons.forEach((b, i) => {
      const near = clamp(1 - Math.abs(s - i) * 1.4);
      b.pillar.material.uniforms.uA.value = 0.1 + near * 0.32;
      b.ring.scale.setScalar(1 + near * 0.6 + Math.sin(t * 2 + i) * 0.08);
      b.ring.material.opacity = 0.35 + near * 0.65;
      b.disc.material.opacity = 0.2 + near * 0.3;
    });
    mist.forEach((m, i) => { m.s.position.x = m.x + Math.sin(t * 0.05 + m.b) * 4; });

    boats.forEach((b) => {
      b.t = (b.t + b.v * dt * 0.6 + 1) % 1;
      riverCurve.getPointAt(b.t, boatPos);
      const tan = riverCurve.getTangentAt(b.t);
      b.g.position.set(boatPos.x - tan.z * b.lat, -0.05 + Math.sin(t * 1.3 + b.lat) * 0.04, boatPos.z + tan.x * b.lat);
      b.g.rotation.y = Math.atan2(tan.x, tan.z) + (b.v < 0 ? Math.PI : 0);
    });

    // HTML pins
    for (let i = 0; i < pinEls.length; i++) {
      proj.copy(pinPos[i]).project(camera);
      const behind = proj.z > 1;
      const near = clamp(1 - Math.abs(s - i) * 1.25);
      const x = (proj.x * 0.5 + 0.5) * state.w, y = (-proj.y * 0.5 + 0.5) * state.h;
      pinEls[i].style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%,-100%)`;
      pinEls[i].style.opacity = behind ? 0 : (0.0 + near).toFixed(2);
      pinEls[i].style.pointerEvents = near > 0.5 ? 'auto' : 'none';
      pinEls[i].classList.toggle('is-active', Math.abs(s - i) < 0.35);
    }
    renderer.render(scene, camera);
  }

  frame(0.016, true);
  const loop = () => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.visible || document.hidden) return;
    frame(dt, reduced);
  };
  loop();

  return {
    setProgress(p) { state.target = clamp(p, 0, 1); if (reduced) frame(0.016, true); },
    resize: layout,
  };
}
