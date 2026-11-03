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

/**
 * The head: a heavier, deeper voxel skull than a body section, with a raised brow, a jutting jaw
 * line and a dark mouth recess for the mandibles to work in. It faces +z, toward the player.
 */
export function headGeometry() {
  const voxels: Voxel[] = [];
  for (let x = -4; x <= 4; x++) {
    for (let y = -3; y <= 4; y++) {
      for (let z = -4; z <= 4; z++) {
        const skull = (x * x) / 17 + ((y - 0.5) * (y - 0.5)) / 13 + (z * z) / 16;
        if (skull > 1) continue;
        const mouth = z >= 2 && y <= -1 && Math.abs(x) <= 2;
        if (mouth && z >= 3) continue;
        const brow = y >= 2 && z >= 2;
        voxels.push([x, y, z, mouth ? 0.25 : brow ? 1.25 : 1 - Math.max(0, -y) * 0.12]);
      }
    }
  }
  return voxelGeometry(voxels, 1 / 8);
}

/** Glowing eyes that stand proud of the skull, and two antennae. */
export function eyesGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(block(0.24, 0.24, 0.18, side * 0.26, 0.16, 0.47));
    parts.push(block(0.12, 0.12, 0.08, side * 0.26, 0.16, 0.58));
    parts.push(block(0.06, 0.42, 0.06, side * 0.22, 0.7, 0.12));
    parts.push(block(0.06, 0.06, 0.22, side * 0.22, 0.9, 0.2));
    parts.push(block(0.11, 0.11, 0.11, side * 0.22, 0.9, 0.34));
  }
  return mergeGeometries(parts);
}

/**
 * One mandible: a hooked pincer built out along +z from a hinge at the origin, curving in toward
 * the middle. The left one is mirrored from this.
 */
export function mandibleGeometry() {
  const voxels: Voxel[] = [];
  const shape = [
    [0, 0],
    [0, 1],
    [0, 2],
    [-1, 3],
    [-1, 4],
    [-2, 5],
    [-3, 5],
  ];
  shape.forEach(([x, z], i) => {
    voxels.push([x, 0, z, i > 4 ? 1.4 : 1]);
    if (i < 4) voxels.push([x, -1, z, 0.8]);
  });
  return voxelGeometry(voxels, 1 / 8);
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
