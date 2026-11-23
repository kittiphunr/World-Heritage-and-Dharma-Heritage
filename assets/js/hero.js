import * as THREE from '../vendor/three.module.min.js';
import { createMaterials, makeBellChedi, makeKhmerTower, makeWatArun } from './models.js';
import { makeEnvironment } from './env.js';
import { rng, clamp, lerp } from './noise.js';

export function initHero(canvas, { reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  scene.fog = new THREE.Fog(0xf5e4c0, 30, 95);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const M = createMaterials();

  scene.add(new THREE.HemisphereLight(0xfff1d6, 0xb59a6a, 0.9));
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.8);
  sun.position.set(-10, 12, 8);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xa9d0ff, 0.9);
  rim.position.set(10, 6, -10);
  scene.add(rim);
  const glow = new THREE.PointLight(0xffb347, 60, 26, 1.6);
  glow.position.set(0, 4, 6);
  scene.add(glow);

  /* misty stage floor */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 96),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vP; uniform float uTime;
        void main(){
          float r = length(vP);
          float a = 1.0 - smoothstep(22.0, 76.0, r);
          float rings = smoothstep(0.92, 1.0, sin(r*1.7 - uTime*0.6))*0.08*(1.0-smoothstep(10.0,50.0,r));
          vec3 c = mix(vec3(0.97,0.90,0.72), vec3(0.78,0.82,0.55), smoothstep(8.0,60.0,r));
          c += rings*vec3(1.0,0.85,0.5);
          gl_FragColor = vec4(c, a*0.95);
          #include <colorspace_fragment>
        }`,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);

  /* hero stage */
  const stage = new THREE.Group();
  scene.add(stage);
  const pedestal = new THREE.Group();
  [[9.6, 0.5, M.white], [8.8, 0.45, M.stone], [8.0, 0.4, M.white]].reduce((y, [r, h, m]) => {
    pedestal.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.03, h, 80), m).translateY(y + h / 2));
    return y + h;
  }, 0);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(8.05, 0.07, 8, 100), M.gold);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 1.36;
  pedestal.add(trim);
  stage.add(pedestal);

  const bigStupa = makeBellChedi(M, { R: 3.4, H: 8.4 });
  bigStupa.position.y = 1.35;
  stage.add(bigStupa);

  const satellites = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const c = makeBellChedi(M, { R: 0.7, H: 2.6, platform: false });
    c.position.set(Math.cos(a) * 7.0, 1.35, Math.sin(a) * 7.0);
    satellites.add(c);
  }
  stage.add(satellites);

  /* distant skyline silhouettes */
  const far = new THREE.Group();
  const arun = makeWatArun(M);
  arun.scale.setScalar(0.9);
  arun.position.set(-34, 0, -34);
  far.add(arun);
  [-1, 0, 1].forEach((i) => {
    const t = makeBellChedi(M, { R: 2.4, H: 7, mat: M.stone, platform: false });
    t.position.set(-8 + i * 8, 0, -48);
    t.scale.setScalar(1.3);
    far.add(t);
  });
  const kh = makeKhmerTower(M, { s: 2.0 });
  kh.position.set(28, 0, -40);
  far.add(kh);
  const kh2 = makeKhmerTower(M, { s: 1.6 });
  kh2.position.set(40, 0, -44);
  far.add(kh2);
  scene.add(far);

  /* rippling rings */
  const rippleMat = () => new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ripples = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 100), rippleMat());
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    stage.add(m);
    return { m, off: i / 3 };
  });

  /* lotus petals */
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.bezierCurveTo(0.42, 0.2, 0.4, 0.85, 0, 1.2);
  petalShape.bezierCurveTo(-0.4, 0.85, -0.42, 0.2, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(petalShape, 10);
  petalGeo.scale(0.38, 0.38, 0.38);
  {
    const p = petalGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getX(i) * p.getX(i) * 2.2 + p.getY(i) * 0.1);
    petalGeo.computeVertexNormals();
  }
  const PET = 110;
  const petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, emissive: 0x442222, emissiveIntensity: 0.2 }), PET);
  const R = rng(5);
  const pd = [];
  const pcols = [0xf6b6c8, 0xfff4f0, 0xf4c6d2, 0xf1d17a];
  const col = new THREE.Color();
  for (let i = 0; i < PET; i++) {
    pd.push({
      x: (R() - 0.5) * 44, y: R() * 20 - 2, z: -6 + R() * 26,
      s: 0.7 + R() * 1.1, v: 0.35 + R() * 0.7, ph: R() * 6.28, sw: 0.4 + R() * 0.9,
      rx: R() * 6.28, ry: R() * 6.28, rz: R() * 6.28, rs: 0.3 + R() * 0.9,
    });
    col.set(pcols[i % pcols.length]);
    petals.setColorAt(i, col);
  }
  scene.add(petals);

  /* gold dust */
  const DUST = 520;
  const dpos = new Float32Array(DUST * 3), dseed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dpos.set([(R() - 0.5) * 50, R() * 18, -8 + R() * 30], i * 3);
    dseed[i] = R();
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dust = new THREE.Points(dgeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uPx; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime*(0.25+aSeed*0.5), 18.0);
        p.x += sin(uTime*0.4 + aSeed*20.0)*0.8;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        gl_PointSize = (2.0 + aSeed*4.0) * uPx * (22.0 / -mv.z);
        vA = 0.35 + 0.65*abs(sin(uTime*(0.6+aSeed) + aSeed*40.0));
      }`,
    fragmentShader: `varying float vA; void main(){
        float d = length(gl_PointCoord-0.5);
        float a = smoothstep(0.5,0.0,d)*vA;
        gl_FragColor = vec4(1.0,0.78,0.36, a);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  /* layout / interaction */
  const state = { mx: 0, my: 0, tmx: 0, tmy: 0, scroll: 0, visible: true, t: 0, w: 1, h: 1 };
  const layout = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    state.w = w; state.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wide = camera.aspect > 1.2;
    camera.fov = wide ? 32 : 42;
    camera.updateProjectionMatrix();
    const sc = wide ? 1 : clamp(camera.aspect * 1.5, 0.62, 0.9);
    stage.scale.setScalar(sc);
    stage.position.set(wide ? 8.8 : 0, wide ? 0 : -7.6 * sc, wide ? 0 : -2);
    floor.position.y = stage.position.y - 0.02;
    far.position.y = stage.position.y;
    glow.position.set(stage.position.x, stage.position.y + 4, 6);
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('pointermove', (e) => {
    state.tmx = (e.clientX / window.innerWidth - 0.5) * 2;
    state.tmy = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; }, { threshold: 0 });
  io.observe(canvas);

  const dummy = new THREE.Object3D();
  const clock = new THREE.Clock();
  const base = new THREE.Vector3(0, 3.2, 31);
  const look = new THREE.Vector3();

  const frame = (dt) => {
    state.t += dt;
    const t = state.t;
    state.mx = lerp(state.mx, state.tmx, 0.05);
    state.my = lerp(state.my, state.tmy, 0.05);
    const sc = state.scroll;
    camera.position.set(base.x + state.mx * 2.2, base.y - state.my * 0.8 + sc * 3, base.z - sc * 6);
    look.set(stage.position.x * 0.35, 5.2 + sc * 2, 0);
    camera.lookAt(look);
    stage.rotation.y = t * 0.06 + state.mx * 0.15;
    satellites.rotation.y = -t * 0.12;
    floor.material.uniforms.uTime.value = t;
    dust.material.uniforms.uTime.value = t;
    for (const r of ripples) {
      const k = (t * 0.18 + r.off) % 1;
      r.m.scale.setScalar(9.5 + k * 22);
      r.m.material.opacity = (1 - k) * (1 - k) * 0.45;
    }
    for (let i = 0; i < PET; i++) {
      const p = pd[i];
      p.y -= p.v * dt;
      if (p.y < -2) { p.y = 18; p.x = (R() - 0.5) * 44; }
      dummy.position.set(p.x + Math.sin(t * p.sw + p.ph) * 1.4, p.y, p.z + Math.cos(t * p.sw * 0.8 + p.ph) * 1.2);
      dummy.rotation.set(p.rx + t * p.rs, p.ry + t * p.rs * 0.7, p.rz + t * p.rs * 0.5);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  };

  let running = !reduced;
  const loop = () => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!running || !state.visible || document.hidden) return;
    frame(dt);
  };
  frame(0.016);
  if (!reduced) loop();
  else window.addEventListener('resize', () => frame(0));

  return {
    setScroll(p) { state.scroll = clamp(p, 0, 1); },
    renderer,
  };
}
