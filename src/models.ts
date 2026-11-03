import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const block = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** One body section built from voxels, about one unit across. */
export function segmentGeometry() {
  const parts = [block(0.7, 0.62, 0.7, 0, 0, 0), block(0.86, 0.3, 0.46, 0, 0.05, 0)];
  for (const side of [-1, 1]) {
    parts.push(block(0.26, 0.14, 0.14, side * 0.54, -0.18, 0.1));
    parts.push(block(0.14, 0.36, 0.14, side * 0.66, -0.34, 0.1));
  }
  return mergeGeometries(parts);
}

/** The eyes and mandibles on the first section, facing +z, which `lookAt` aims at the player. */
export function faceGeometry() {
  return mergeGeometries([
    block(0.2, 0.2, 0.12, -0.2, 0.14, -0.37),
    block(0.2, 0.2, 0.12, 0.2, 0.14, -0.37),
    block(0.12, 0.12, 0.3, -0.24, -0.2, -0.44),
    block(0.12, 0.12, 0.3, 0.24, -0.2, -0.44),
  ]).rotateY(Math.PI);
}

export function bugModel() {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      mergeGeometries([block(0.9, 0.5, 1.5, 0, 0, 0), block(0.56, 0.42, 0.5, 0, 0.04, -0.9)]),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    ),
  );
  const legs: THREE.Mesh[] = [];
  const legMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a1f });
  for (const side of [-1, 1]) {
    for (const z of [-0.5, 0, 0.5]) {
      const leg = new THREE.Mesh(block(0.16, 0.16, 0.7, 0, 0, 0).rotateY(Math.PI / 2), legMaterial);
      leg.position.set(side * 0.7, -0.08, z);
      group.add(leg);
      legs.push(leg);
    }
  }
  group.userData.legs = legs;
  return group;
}

export function gunModel() {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      mergeGeometries([
        block(0.05, 0.07, 0.3, 0, 0, -0.1),
        block(0.035, 0.1, 0.05, 0, -0.08, 0.02),
      ]),
      new THREE.MeshBasicMaterial({ color: 0x6dffb0 }),
    ),
  );
  return group;
}
