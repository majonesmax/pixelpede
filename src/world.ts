import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The color everything distant melts into: the glow along the horizon. */
export const HORIZON_COLOR = 0x1d0d3a;
const RAIL_HALF_LENGTH_M = 9;

/** A gradient dome with a glowing horizon and a faint band of nebula across the sky. */
function addSky(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 direction;
      void main() {
        direction = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 direction;
      float wave(vec3 d, float scale) {
        return sin(d.x * scale) * sin(d.y * scale * 1.7 + 1.3) * sin(d.z * scale * 0.8 + 0.4);
      }
      void main() {
        float up = max(direction.y, 0.0);
        vec3 zenith = vec3(0.012, 0.008, 0.035);
        vec3 horizon = vec3(0.16, 0.05, 0.27);
        vec3 color = mix(horizon, zenith, pow(up, 0.42));
        color += vec3(0.55, 0.12, 0.42) * pow(1.0 - up, 14.0) * 0.55;
        // A tilted band of nebula, broken up so it reads as gas rather than a stripe.
        float band = exp(-pow((direction.y - direction.x * 0.45 - 0.25) * 4.2, 2.0));
        float gas = 0.55 + 0.3 * wave(direction, 7.0) + 0.15 * wave(direction, 19.0);
        color += vec3(0.1, 0.06, 0.2) * band * gas;
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), material);
  sky.renderOrder = -10;
  scene.add(sky);

  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(11, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6, fog: false }),
  );
  moon.position.set(-210, 260, -330);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
}

export interface Twinkle {
  update: (time: number) => void;
}

function addStars(scene: THREE.Scene): Twinkle {
  const count = 2200;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3().randomDirection();
    direction.y = 0.04 + Math.abs(direction.y);
    direction
      .normalize()
      .multiplyScalar(560)
      .toArray(positions, i * 3);
    phases[i] = Math.random() * 100;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float phase;
      uniform float time;
      varying float brightness;
      void main() {
        brightness = 0.55 + 0.45 * sin(time * (1.0 + fract(phase) * 2.5) + phase);
        gl_PointSize = 1.4 + 2.2 * fract(phase * 7.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float brightness;
      void main() {
        float fade = 1.0 - length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vec3(0.82, 0.86, 1.0) * brightness, fade);
      }`,
  });
  scene.add(new THREE.Points(geometry, material));
  return { update: (seconds) => (time.value = seconds) };
}

/** A neon grid that glows near the player and fades into the haze, over a dark floor. */
function addGround(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 spot;
      void main() {
        spot = (modelMatrix * vec4(position, 1.0)).xz;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 spot;
      float lines(vec2 at, float spacing) {
        vec2 cell = abs(fract(at / spacing - 0.5) - 0.5) / fwidth(at / spacing);
        return 1.0 - min(min(cell.x, cell.y), 1.0);
      }
      void main() {
        float distance = length(spot);
        float near = exp(-distance / 70.0);
        vec3 floor = mix(vec3(0.11, 0.04, 0.2), vec3(0.03, 0.015, 0.07), smoothstep(0.0, 30.0, distance));
        vec3 grid = vec3(1.0, 0.31, 0.85) * lines(spot, 5.0) * (0.25 + 0.75 * near);
        grid += vec3(0.27, 0.78, 1.0) * lines(spot, 25.0) * 0.6 * near;
        vec3 color = floor + grid;
        color = mix(color, vec3(0.114, 0.051, 0.227), smoothstep(60.0, 300.0, distance));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 48), material);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Stepped voxel hills along the horizon, so the field sits in a valley. */
function addHills(scene: THREE.Scene) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 70; i++) {
    const angle = (i / 70) * Math.PI * 2 + Math.random() * 0.05;
    const distance = 300 + Math.random() * 60;
    const height = 18 + Math.random() * 50;
    for (let step = 0; step < 4; step++) {
      const width = 46 - step * 9;
      parts.push(
        box(
          width,
          height / 4,
          width,
          Math.sin(angle) * distance,
          (step + 0.5) * (height / 4),
          Math.cos(angle) * distance,
        ),
      );
    }
  }
  scene.add(
    new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x170a33 })),
  );
}

/** Lit windows make the dark towers read as a city at night rather than as blocks. */
function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.fillStyle = '#1a1140';
  context.fillRect(0, 0, 128, 128);
  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 128; x += 9) {
      if (Math.random() < 0.34) {
        context.fillStyle = Math.random() < 0.2 ? '#ff7ad9' : '#ffd98a';
        context.fillRect(x, y, 4, 5);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** A ring of towers. Sliding along the rail shifts them against the hills, which sells the depth. */
function addSkyline(scene: THREE.Scene) {
  const count = 90;
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: windowTexture() }),
    count,
  );
  const placement = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 140 + Math.random() * 130;
    placement.position.set(Math.sin(angle) * distance, 0, Math.cos(angle) * distance);
    placement.scale.set(10 + Math.random() * 20, 14 + Math.random() * 56, 10 + Math.random() * 20);
    placement.rotation.y = Math.random() * 3;
    placement.updateMatrix();
    towers.setMatrixAt(i, placement.matrix);
  }
  scene.add(towers);
}

/** Glowing crystal clusters scattered close around you, for something solid nearby. */
function addCrystals(scene: THREE.Scene) {
  const colors = [0x46c8ff, 0xff4fd8, 0x6dffb0];
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 70;
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const color = new THREE.Color(colors[i % colors.length]);
    for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) {
      const height = 0.6 + Math.random() * 2.6;
      const crystal = new THREE.ConeGeometry(0.22 + Math.random() * 0.3, height, 4)
        .rotateZ((Math.random() - 0.5) * 0.7)
        .translate(x + (Math.random() - 0.5) * 1.6, height / 2, z + (Math.random() - 0.5) * 1.6);
      const shade = new Float32Array(crystal.attributes.position.count * 3);
      for (let v = 0; v < crystal.attributes.position.count; v++) {
        const tip = crystal.attributes.position.getY(v) / height;
        color
          .clone()
          .multiplyScalar(0.3 + tip * 0.9)
          .toArray(shade, v * 3);
      }
      crystal.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      parts.push(crystal.toNonIndexed());
    }
  }
  scene.add(
    new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true })),
  );
}

/** Where you stand: a lit deck, with posts at each end of the rail you slide along. */
function addStation(scene: THREE.Scene) {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(RAIL_HALF_LENGTH_M * 2 + 3, 0.12, 3.4),
    new THREE.MeshLambertMaterial({ color: 0x2a1858 }),
  );
  deck.position.y = 0.06;
  scene.add(deck);
  const trim = new THREE.MeshBasicMaterial({ color: 0x6dffb0 });
  for (const z of [-1.7, 1.7]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_HALF_LENGTH_M * 2 + 3, 0.04, 0.06),
      trim,
    );
    edge.position.set(0, 0.14, z);
    scene.add(edge);
  }
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.4, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
    );
    post.position.set(side * (RAIL_HALF_LENGTH_M + 1.2), 0.7, -1.4);
    scene.add(post);
  }
}

export function addWorld(scene: THREE.Scene): Twinkle {
  addSky(scene);
  const twinkle = addStars(scene);
  addGround(scene);
  addHills(scene);
  addSkyline(scene);
  addCrystals(scene);
  addStation(scene);
  return twinkle;
}
