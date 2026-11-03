import * as THREE from 'three';

const MAX_SHARDS = 900;
const GRAVITY_M_S2 = 26;

interface Shard {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  rotation: THREE.Euler;
  size: number;
  color: THREE.Color;
  life: number;
}

export interface Shards {
  burst: (at: THREE.Vector3, color: number, size: number, count: number) => void;
  update: (dt: number) => void;
}

/** Everything that breaks becomes glowing cubes that rain down around the player. */
export function createShards(scene: THREE.Scene): Shards {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    MAX_SHARDS,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color());
  scene.add(mesh);

  const shards: Shard[] = [];
  const placement = new THREE.Object3D();

  return {
    burst(at, color, size, count) {
      for (let i = 0; i < count; i++) {
        if (shards.length >= MAX_SHARDS) shards.shift();
        const velocity = new THREE.Vector3().randomDirection().multiplyScalar(size * 3.2);
        velocity.y += size * 1.5;
        shards.push({
          position: at.clone().addScaledVector(velocity, 0.08),
          velocity,
          spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
          rotation: new THREE.Euler(),
          size: size * (0.09 + Math.random() * 0.17),
          color: new THREE.Color(color),
          life: 3.4 + Math.random() * 2.2,
        });
      }
    },

    update(dt) {
      for (let i = shards.length - 1; i >= 0; i--) {
        const shard = shards[i];
        shard.life -= dt;
        shard.velocity.y -= GRAVITY_M_S2 * dt;
        shard.position.addScaledVector(shard.velocity, dt);
        if (shard.position.y < shard.size / 2) {
          shard.position.y = shard.size / 2;
          shard.velocity.multiplyScalar(0.32);
          shard.velocity.y *= -1;
        }
        shard.rotation.x += shard.spin.x * dt;
        shard.rotation.y += shard.spin.y * dt;
        if (shard.life <= 0) shards.splice(i, 1);
      }
      shards.forEach((shard, i) => {
        placement.position.copy(shard.position);
        placement.rotation.copy(shard.rotation);
        placement.scale.setScalar(shard.size * Math.min(1, shard.life));
        placement.updateMatrix();
        mesh.setMatrixAt(i, placement.matrix);
        mesh.setColorAt(i, shard.color);
      });
      mesh.count = shards.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
