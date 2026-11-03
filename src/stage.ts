import * as THREE from 'three';

export const FIELD_COLOR = 0x05030c;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Carries the player along the rail: the camera and controllers both live on it. */
  rig: THREE.Group;
}

function addStars(scene: THREE.Scene) {
  const count = 1500;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3().randomDirection();
    direction.y = Math.abs(direction.y);
    direction.multiplyScalar(480).toArray(positions, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(
    new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xbfc8ff, size: 1.8, fog: false, sizeAttenuation: true }),
    ),
  );
}

/** A distant ring of dark towers. Sliding along the rail shifts them, which sells the depth. */
function addSkyline(scene: THREE.Scene) {
  const count = 90;
  const towers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: 0x1c1248 }),
    count,
  );
  const placement = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 130 + Math.random() * 130;
    placement.position.set(Math.sin(angle) * distance, 0, Math.cos(angle) * distance);
    placement.scale.set(10 + Math.random() * 20, 12 + Math.random() * 54, 10 + Math.random() * 20);
    placement.rotation.y = Math.random() * 3;
    placement.updateMatrix();
    towers.setMatrixAt(i, placement.matrix);
  }
  scene.add(towers);
}

function addGround(scene: THREE.Scene) {
  scene.add(new THREE.GridHelper(420, 84, 0xff4fd8, 0x35115e));
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(420, 40),
    new THREE.MeshBasicMaterial({ color: 0x07051a }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  scene.add(floor);
}

export function createStage(): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FIELD_COLOR);
  scene.fog = new THREE.FogExp2(FIELD_COLOR, 0.0048);

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 900);
  camera.position.y = 1.65;
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  // Strong ambient light keeps the neon look, and the sun gives the voxels their shape.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8ff, 3.1));
  const moon = new THREE.DirectionalLight(0xffffff, 3.2);
  moon.position.set(-0.5, -0.4, 1);
  scene.add(moon);

  addStars(scene);
  addGround(scene);
  addSkyline(scene);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return { renderer, scene, camera, rig };
}
