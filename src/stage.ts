import * as THREE from 'three';
import { HORIZON_COLOR, addWorld, type Twinkle } from './world';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Carries the player along the rail: the camera and controllers both live on it. */
  rig: THREE.Group;
  twinkle: Twinkle;
}

export function createStage(): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HORIZON_COLOR, 0.0042);

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

  const twinkle = addWorld(scene);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return { renderer, scene, camera, rig, twinkle };
}
