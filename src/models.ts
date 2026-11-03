import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const block = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

type Voxel = [x: number, y: number, z: number, shade: number];

/** Builds a solid from voxels, skipping any fully buried, which nobody could see. */
function voxelGeometry(voxels: Voxel[], size: number) {
  const filled = new Set(voxels.map(([x, y, z]) => `${x},${y},${z}`));
  const isBuried = ([x, y, z]: Voxel) =>
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ].every(([a, b, c]) => filled.has(`${x + a},${y + b},${z + c}`));
  const parts = voxels
    .filter((voxel) => !isBuried(voxel))
    .map(([x, y, z, shade]) => {
      const box = block(size * 0.96, size * 0.96, size * 0.96, x * size, y * size, z * size);
      const color = new Float32Array(box.attributes.position.count * 3).fill(shade);
      box.setAttribute('color', new THREE.BufferAttribute(color, 3));
      return box;
    });
  return mergeGeometries(parts);
}

/** One armored body section: a banded voxel ball with three pairs of legs, facing +z. */
export function segmentGeometry() {
  const voxels: Voxel[] = [];
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      for (let z = -3; z <= 3; z++) {
        if (x * x + y * y * 1.25 + z * z > 10.5) continue;
        voxels.push([x, y, z, Math.abs(z) % 3 === 1 ? 0.55 : 1 - Math.abs(y) * 0.07]);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [-2, 0, 2]) {
      voxels.push([side * 4, -1, z, 0.42], [side * 5, -2, z, 0.42], [side * 5, -3, z, 0.42]);
      voxels.push([side * 5, -4, z, 0.3]);
    }
  }
  return voxelGeometry(voxels, 1 / 7);
}

/** A floating spore-cap: a spotted dome on a short stem, so each block is a solid thing in space. */
export function blockGeometry() {
  const voxels: Voxel[] = [];
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      for (let y = 0; y <= 3; y++) {
        if (x * x + z * z + y * y * 2.4 > 19) continue;
        const spot = (x * 3 + z * 5 + y * 7) % 11 === 0;
        voxels.push([x, y, z, spot ? 1.6 : 0.82 - y * 0.03]);
      }
    }
  }
  for (let y = -4; y < 0; y++) {
    for (const x of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) voxels.push([x, y, z, 1.25]);
    }
  }
  return voxelGeometry(voxels, 1 / 9);
}

/** A hard, faceted dart for the enemy that plunges straight down, point first. */
export function diverGeometry() {
  const voxels: Voxel[] = [];
  for (let y = -5; y <= 3; y++) {
    const radius = y < 0 ? 5 + y : 3 - y * 0.5;
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        if (x * x + z * z <= radius * radius * 0.7) voxels.push([x, y, z, y < -2 ? 1.5 : 1]);
      }
    }
  }
  return voxelGeometry(voxels, 1 / 8);
}

/** The eyes and mandibles on the first section, facing +z, which `lookAt` aims at the player. */
export function faceGeometry() {
  return mergeGeometries([
    block(0.2, 0.2, 0.12, -0.21, 0.14, -0.42),
    block(0.2, 0.2, 0.12, 0.21, 0.14, -0.42),
    block(0.1, 0.1, 0.34, -0.24, -0.24, -0.52),
    block(0.1, 0.1, 0.34, 0.24, -0.24, -0.52),
    block(0.07, 0.42, 0.07, -0.16, 0.56, -0.14),
    block(0.07, 0.42, 0.07, 0.16, 0.56, -0.14),
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
