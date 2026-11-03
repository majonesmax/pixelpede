import * as THREE from 'three';

export interface Hud {
  draw: (score: number, lives: number, wave: number, message: string) => void;
}

/** A panel lying low in front of the player, like the marquee of a machine sunk into the field. */
export function createHud(rig: THREE.Group): Hud {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.8),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, fog: false }),
  );
  panel.position.set(0, 0.62, -2.5);
  panel.rotation.x = -0.72;
  rig.add(panel);

  return {
    draw(score, lives, wave, message) {
      context.clearRect(0, 0, 768, 256);
      context.fillStyle = 'rgba(12,6,34,.82)';
      context.fillRect(0, 0, 768, 256);
      context.textAlign = 'center';
      context.fillStyle = '#6dffb0';
      context.font = 'bold 76px system-ui';
      context.fillText(String(score).padStart(6, '0'), 384, 86);
      context.fillStyle = '#ff4fd8';
      context.font = '42px system-ui';
      context.fillText(`Wave ${wave}   ·   ${'♥'.repeat(lives) || 'Game over'}`, 384, 156);
      context.fillStyle = '#f4eeff';
      context.font = '38px system-ui';
      context.fillText(message, 384, 222, 730);
      texture.needsUpdate = true;
    },
  };
}
