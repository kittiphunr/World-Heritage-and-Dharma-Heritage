import * as THREE from '../vendor/three.module.min.js';

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const frag = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGround;
  uniform vec3 uSunDir; uniform float uSun;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uGround, uHorizon, smoothstep(-0.35, 0.0, h));
    col = mix(col, uMid, smoothstep(0.0, 0.28, h));
    col = mix(col, uTop, smoothstep(0.2, 0.9, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.78, 0.45) * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.9 + pow(s, 900.0) * uSun);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function makeSkyMesh(radius = 50, { sun = 1.0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x6fa6d8) },
      uMid: { value: new THREE.Color(0xbfd9ea) },
      uHorizon: { value: new THREE.Color(0xfbe6bd) },
      uGround: { value: new THREE.Color(0x8a7a55) },
      uSunDir: { value: new THREE.Vector3(-0.7, 0.22, -0.65) },
      uSun: { value: sun },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Image based lighting from the procedural sunrise sky so gold looks like gold.
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSkyMesh(50, { sun: 6.0 }));
  const rt = pm.fromScene(envScene, 0.035);
  pm.dispose();
  return rt.texture;
}

export function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
