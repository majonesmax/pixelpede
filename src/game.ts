import * as THREE from 'three';
import { startSound, type Sound } from './audio';
import { hasLanded, spawnChain, splitChain, stepChain, type Chain } from './creature';
import { COLUMNS, ROWS, cellKey, cellPosition, cellSize, type Cell } from './field';
import { createHud } from './hud';
import { bugModel, faceGeometry, gunModel, segmentGeometry } from './models';
import { createShards } from './shards';
import { createStage } from './stage';

const STARTING_LIVES = 3;
const CHAIN_LENGTH = 15;
const MAX_SEGMENTS = 60;
const FIRST_STEP_S = 0.27;
const FASTEST_STEP_S = 0.1;
const STEP_SPEEDUP = 0.88;
const STARTING_BLOCKS = 28;
const BLOCK_STRENGTH = 3;
const RAIL_HALF_LENGTH_M = 9;
const RAIL_SPEED_M_S = 7.5;
const BOLT_SPEED_M_S = 170;
const BOLT_LIFE_S = 1.1;
const FIRE_INTERVAL_S = 0.13;
const MAX_BOLTS = 60;
const BUG_INTERVAL_S = 11;
const BUG_SPEED_M_S = 10;
const BUG_HIT_RADIUS_M = 2.6;
const BUG_TOUCH_RADIUS_M = 2.2;
const BODY_COLOR = new THREE.Color(0x6dffb0);
const HEAD_COLOR = new THREE.Color(0xff4fd8);

interface Block {
  cell: Cell;
  strength: number;
}

interface Bolt {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

interface Hand {
  controller: THREE.Group;
  cooldown: number;
}

export function createGame() {
  const { renderer, scene, camera, rig } = createStage();
  const shards = createShards(scene);
  const hud = createHud(rig);
  let sound: Sound | null = null;

  const segmentMesh = new THREE.InstancedMesh(
    segmentGeometry(),
    new THREE.MeshLambertMaterial(),
    MAX_SEGMENTS,
  );
  const faceMesh = new THREE.InstancedMesh(
    faceGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    MAX_SEGMENTS,
  );
  const blockMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.62, 0),
    new THREE.MeshLambertMaterial({ color: 0x46c8ff, flatShading: true }),
    COLUMNS * ROWS,
  );
  const boltMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0xfff27a, toneMapped: false }),
    MAX_BOLTS,
  );
  for (const mesh of [segmentMesh, faceMesh, blockMesh, boltMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  segmentMesh.setColorAt(0, BODY_COLOR);

  const bug = bugModel();
  bug.scale.setScalar(2);
  bug.visible = false;
  scene.add(bug);
  const bugLegs = bug.userData.legs as THREE.Mesh[];

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff1040,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthTest: false,
      fog: false,
    }),
  );
  flash.renderOrder = 10;
  camera.add(flash);

  const hands: Hand[] = [0, 1].map((index) => {
    const controller = renderer.xr.getController(index);
    controller.add(gunModel());
    rig.add(controller);
    return { controller, cooldown: 0 };
  });

  const chains: Chain[] = [];
  const blocks = new Map<number, Block>();
  const bolts: Bolt[] = [];
  const keys = new Set<string>();
  const placement = new THREE.Object3D();
  const origin = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const boltUp = new THREE.Vector3(0, 1, 0);
  const boltDirection = new THREE.Vector3();
  const stepStart = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const segmentSpot = new THREE.Vector3();

  let score = 0;
  let lives = STARTING_LIVES;
  let wave = 1;
  let stepInterval = FIRST_STEP_S;
  let stepClock = 0;
  let nextBug = 6;
  let bugHeading = 0;
  let running = false;
  let gameOver = false;
  let message = 'Look up';
  let messageUntil = 5;
  let time = 0;
  let lookYaw = 0;
  let lookPitch = 0.55;
  let mouseFiring = false;
  let desktopCooldown = 0;
  let lastFrame = performance.now();
  const stickButtons = new Map<string, boolean>();

  const say = (text: string, seconds = 3) => {
    message = text;
    messageUntil = time + seconds;
  };
  const drawHud = () => hud.draw(score, lives, wave, time < messageUntil ? message : '');

  const seedBlocks = (count: number) => {
    for (let i = 0; i < count; i++) {
      const cell = {
        column: Math.floor(Math.random() * COLUMNS),
        row: 2 + Math.floor(Math.random() * (ROWS - 5)),
      };
      blocks.set(cellKey(cell), { cell, strength: BLOCK_STRENGTH });
    }
  };

  const startWave = () => {
    chains.length = 0;
    chains.push(spawnChain(CHAIN_LENGTH, CHAIN_LENGTH - 1));
    stepInterval = Math.max(FASTEST_STEP_S, FIRST_STEP_S * STEP_SPEEDUP ** (wave - 1));
    stepClock = 0;
  };

  const newGame = () => {
    score = 0;
    lives = STARTING_LIVES;
    wave = 1;
    gameOver = false;
    blocks.clear();
    seedBlocks(STARTING_BLOCKS);
    startWave();
    bug.visible = false;
    nextBug = time + 6;
    say('Look up');
  };

  const hurt = () => {
    lives--;
    flash.material.opacity = 0.75;
    sound?.hurt();
    bug.visible = false;
    if (lives <= 0) {
      gameOver = true;
      say('Press B to play again', 999);
    } else {
      say('It got through!');
      startWave();
    }
  };

  const segmentAt = (segment: Chain['segments'][number], phase: number) => {
    const column = segment.previous.column + (segment.column - segment.previous.column) * phase;
    const row = segment.previous.row + (segment.row - segment.previous.row) * phase;
    return { position: cellPosition(column, row), size: cellSize(row) };
  };

  const fire = (from: THREE.Vector3, direction: THREE.Vector3) => {
    if (bolts.length >= MAX_BOLTS) return;
    bolts.push({
      position: from.clone(),
      velocity: direction.clone().multiplyScalar(BOLT_SPEED_M_S),
      life: BOLT_LIFE_S,
    });
    sound?.shoot();
  };

  const nearSegment = (bolt: Bolt, target: THREE.Vector3, radius: number) => {
    const travel = closest.subVectors(bolt.position, stepStart);
    const length = travel.lengthSq();
    const along = length
      ? THREE.MathUtils.clamp(target.clone().sub(stepStart).dot(travel) / length, 0, 1)
      : 0;
    return stepStart.clone().addScaledVector(travel, along).distanceTo(target) < radius;
  };

  const strikeChains = (bolt: Bolt, phase: number) => {
    for (let c = 0; c < chains.length; c++) {
      const chain = chains[c];
      for (let i = 0; i < chain.segments.length; i++) {
        const segment = chain.segments[i];
        const { position, size } = segmentAt(segment, phase);
        segmentSpot.set(...position);
        if (!nearSegment(bolt, segmentSpot, size * 0.62)) continue;
        score += i === 0 ? 100 : 10;
        shards.burst(segmentSpot, i === 0 ? 0xff4fd8 : 0x6dffb0, size, 34);
        sound?.hit();
        const cell = { column: segment.column, row: segment.row };
        blocks.set(cellKey(cell), { cell, strength: BLOCK_STRENGTH });
        chains.splice(c, 1, ...splitChain(chain, i));
        return true;
      }
    }
    return false;
  };

  const strikeBlocks = (bolt: Bolt) => {
    for (const [key, block] of blocks) {
      const position = cellPosition(block.cell.column, block.cell.row);
      segmentSpot.set(...position);
      const size = cellSize(block.cell.row);
      if (!nearSegment(bolt, segmentSpot, size * 0.5)) continue;
      block.strength--;
      sound?.block();
      shards.burst(segmentSpot, 0x46c8ff, size * 0.6, 5);
      if (block.strength <= 0) {
        blocks.delete(key);
        score += 1;
      }
      return true;
    }
    return false;
  };

  const strikeBug = (bolt: Bolt) => {
    if (!bug.visible || !nearSegment(bolt, bug.position, BUG_HIT_RADIUS_M)) return false;
    bug.visible = false;
    score += 300;
    nextBug = time + BUG_INTERVAL_S;
    shards.burst(bug.position, 0xffd23f, 4, 40);
    sound?.hit();
    return true;
  };

  const updateBolts = (dt: number, phase: number) => {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i];
      bolt.life -= dt;
      stepStart.copy(bolt.position);
      bolt.position.addScaledVector(bolt.velocity, dt);
      const spent =
        bolt.life <= 0 || strikeBug(bolt) || strikeChains(bolt, phase) || strikeBlocks(bolt);
      if (spent) bolts.splice(i, 1);
    }
    bolts.forEach((bolt, i) => {
      placement.position.copy(bolt.position);
      boltDirection.copy(bolt.velocity).normalize();
      placement.quaternion.setFromUnitVectors(boltUp, boltDirection);
      const distance = bolt.position.distanceTo(rig.position);
      const width = 0.05 + distance * 0.0022;
      placement.scale.set(width, 2.4 + distance * 0.02, width);
      placement.updateMatrix();
      boltMesh.setMatrixAt(i, placement.matrix);
    });
    boltMesh.count = bolts.length;
    boltMesh.instanceMatrix.needsUpdate = true;
  };

  const updateChains = (dt: number) => {
    stepClock += dt;
    if (stepClock >= stepInterval) {
      stepClock -= stepInterval;
      const blocked = new Set(blocks.keys());
      for (const chain of chains) stepChain(chain, blocked);
      const lowest = Math.max(0, ...chains.map((chain) => chain.segments[0].row));
      sound?.step(lowest / (ROWS - 1));
      if (chains.some(hasLanded)) hurt();
    }
    if (!chains.length && !gameOver) {
      wave++;
      score += 500;
      sound?.wave();
      say(`Wave ${wave}`);
      seedBlocks(8);
      startWave();
    }
    return Math.min(1, stepClock / stepInterval);
  };

  const drawChains = (phase: number) => {
    let index = 0;
    let heads = 0;
    for (const chain of chains) {
      chain.segments.forEach((segment, i) => {
        if (index >= MAX_SEGMENTS) return;
        const { position, size } = segmentAt(segment, phase);
        placement.position.set(...position);
        placement.position.y += Math.sin(time * 5 + i * 0.8) * size * 0.1;
        placement.lookAt(rig.position.x, 1.5, 0);
        placement.scale.setScalar(size * 0.86);
        placement.updateMatrix();
        segmentMesh.setMatrixAt(index, placement.matrix);
        segmentMesh.setColorAt(index, i === 0 ? HEAD_COLOR : BODY_COLOR);
        index++;
        if (i === 0) {
          faceMesh.setMatrixAt(heads++, placement.matrix);
        }
      });
    }
    segmentMesh.count = index;
    faceMesh.count = heads;
    segmentMesh.instanceMatrix.needsUpdate = true;
    faceMesh.instanceMatrix.needsUpdate = true;
    if (segmentMesh.instanceColor) segmentMesh.instanceColor.needsUpdate = true;
  };

  const drawBlocks = () => {
    let index = 0;
    for (const block of blocks.values()) {
      placement.position.set(...cellPosition(block.cell.column, block.cell.row));
      placement.rotation.set(time * 0.6 + index, time * 0.9, 0);
      placement.scale.setScalar(cellSize(block.cell.row) * (0.3 + block.strength * 0.13));
      placement.updateMatrix();
      blockMesh.setMatrixAt(index++, placement.matrix);
    }
    placement.rotation.set(0, 0, 0);
    blockMesh.count = index;
    blockMesh.instanceMatrix.needsUpdate = true;
  };

  /** The bug stays on the ground and comes for your feet in fast, unpredictable zigzags. */
  const updateBug = (dt: number) => {
    if (!bug.visible) {
      if (time < nextBug || gameOver) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      bug.position.set(side * (34 + Math.random() * 18), 1.4, -18 - Math.random() * 26);
      bugHeading = Math.random() * 6;
      bug.visible = true;
      sound?.bug();
    }
    const toPlayer = Math.atan2(rig.position.x - bug.position.x, -bug.position.z);
    const heading = toPlayer + Math.sin(time * 2.6 + bugHeading) * 1.15;
    bug.position.x += Math.sin(heading) * BUG_SPEED_M_S * dt;
    bug.position.z += Math.cos(heading) * BUG_SPEED_M_S * dt;
    bug.rotation.y = Math.PI - heading;
    bugLegs.forEach((leg, i) => {
      leg.rotation.y = Math.sin(time * 26 + i * 1.7) * 0.5;
    });
    if (Math.floor(time * 7) !== Math.floor((time - dt) * 7)) sound?.bug();
    const reach = Math.hypot(bug.position.x - rig.position.x, bug.position.z);
    if (reach < BUG_TOUCH_RADIUS_M) {
      nextBug = time + BUG_INTERVAL_S;
      hurt();
    }
  };

  const justPressed = (key: string, pressed: boolean) => {
    const before = stickButtons.get(key) ?? false;
    stickButtons.set(key, pressed);
    return pressed && !before;
  };

  const readControllers = (dt: number) => {
    const session = renderer.xr.getSession();
    if (!session) {
      desktopCooldown -= dt;
      if (mouseFiring && desktopCooldown <= 0 && !gameOver) {
        desktopCooldown = FIRE_INTERVAL_S;
        camera.getWorldPosition(origin);
        camera.getWorldDirection(facing);
        fire(origin.addScaledVector(facing, 0.5), facing);
      }
      let slide = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) slide -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) slide += 1;
      return slide;
    }

    let slide = 0;
    hands.forEach((hand, i) => {
      hand.cooldown -= dt;
      const gamepad = session.inputSources[i]?.gamepad;
      if (!gamepad) return;
      if ((gamepad.buttons[0]?.value ?? 0) > 0.4 && hand.cooldown <= 0 && !gameOver) {
        hand.cooldown = FIRE_INTERVAL_S;
        hand.controller.getWorldPosition(origin);
        hand.controller.getWorldQuaternion(quaternion);
        facing.set(0, 0, -1).applyQuaternion(quaternion);
        fire(origin, facing);
      }
      const x = gamepad.axes[2] ?? 0;
      if (Math.abs(x) > 0.15) slide += x;
      if (justPressed(`b${i}`, gamepad.buttons[5]?.pressed ?? false) && gameOver) newGame();
    });
    return THREE.MathUtils.clamp(slide, -1, 1);
  };

  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    time += dt;

    const slide = readControllers(dt);
    rig.position.x = THREE.MathUtils.clamp(
      rig.position.x + slide * RAIL_SPEED_M_S * dt,
      -RAIL_HALF_LENGTH_M,
      RAIL_HALF_LENGTH_M,
    );
    if (!renderer.xr.isPresenting) camera.rotation.set(lookPitch, lookYaw, 0, 'YXZ');

    const phase = running && !gameOver ? updateChains(dt) : Math.min(1, stepClock / stepInterval);
    drawChains(phase);
    drawBlocks();
    if (running) {
      updateBug(dt);
      updateBolts(dt, phase);
    }
    shards.update(dt);
    flash.material.opacity *= Math.exp(-dt * 3);
    flash.visible = flash.material.opacity > 0.01;
    drawHud();
    renderer.render(scene, camera);
  };

  addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyB' && gameOver) newGame();
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  renderer.domElement.addEventListener('pointerdown', () => {
    mouseFiring = true;
  });
  addEventListener('pointerup', () => {
    mouseFiring = false;
  });
  addEventListener('pointermove', (event) => {
    lookYaw -= event.movementX * 0.003;
    lookPitch = THREE.MathUtils.clamp(lookPitch - event.movementY * 0.003, -0.6, 1.5);
  });

  newGame();
  renderer.setAnimationLoop(frame);

  return {
    renderer,
    begin(audio: boolean) {
      if (audio) sound ??= startSound();
      void sound?.ctx.resume();
      running = true;
      newGame();
    },
    debug: {
      look(yaw: number, pitch: number) {
        lookYaw = yaw;
        lookPitch = pitch;
      },
      stats: () => ({ score, lives, wave, chains: chains.length, blocks: blocks.size }),
      /** Points the desktop view at the head of the nearest creature. */
      aimAtHead() {
        const head = chains[0]?.segments[0];
        if (!head) return;
        const [x, y, z] = segmentAt(head, Math.min(1, stepClock / stepInterval)).position;
        lookYaw = Math.atan2(rig.position.x - x, -z);
        lookPitch = Math.atan2(y - 1.65, Math.hypot(x - rig.position.x, z));
      },
      setFiring(on: boolean) {
        mouseFiring = on;
      },
    },
  };
}
