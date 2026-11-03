import * as THREE from 'three';
import { startSound, type Sound } from './audio';
import { hasLanded, spawnHead, splitChain, stepChain, waveChains, type Chain } from './creature';
import {
  COLUMNS,
  ROWS,
  cellKey,
  cellPosition,
  cellSize,
  setMode,
  type Cell,
  type Mode,
} from './field';
import { createHud } from './hud';
import {
  blockGeometry,
  bugModel,
  diverGeometry,
  eyesGeometry,
  headGeometry,
  mandibleGeometry,
  gunModel,
  segmentGeometry,
} from './models';
import { createShards } from './shards';
import { createStage } from './stage';

const STARTING_LIVES = 3;
const MAX_SEGMENTS = 60;
const FIRST_STEP_S = 0.27;
/** Speed only ramps over the first few waves; after that, difficulty comes from extra heads. */
const FASTEST_STEP_S = 0.21;
const STEP_SPEEDUP = 0.88;
/** From wave 2, a lone head drops in from the top this often while a wave is running. */
const EXTRA_HEAD_INTERVAL_S = 16;
const MAX_CHAINS = 9;
const RESTORE_INTERVAL_S = 0.13;
const RESTORE_POINTS = 5;
const STARTING_BLOCKS = 28;
const BLOCK_STRENGTH = 3;
const RAIL_HALF_LENGTH_M = 9;
const RAIL_SPEED_M_S = 7.5;
const BOLT_SPEED_M_S = 170;
const BOLT_LIFE_S = 1.1;
const FIRE_INTERVAL_S = 0.13;
const MAX_BOLTS = 60;
const BUG_INTERVAL_S = 11;
const DIVER_INTERVAL_S = 13;
const DIVER_ROWS_PER_S = 7;
const DIVER_STRENGTH = 2;
const DIVER_SEED_CHANCE = 0.3;
/** Rows from the bottom at which the alarm starts. */
const DANGER_ROWS = 6;
const BUG_SPEED_M_S = 10;
const BUG_HIT_RADIUS_M = 2.6;
const BUG_TOUCH_RADIUS_M = 2.2;
const BODY_COLOR = new THREE.Color(0x6dffb0);
const HEAD_COLOR = new THREE.Color(0xff4fd8);
/** Blocks lose color as they're worn down, indexed by remaining strength. */
const BLOCK_COLORS = [0x000000, 0x8a3050, 0x5a70e8, 0x46c8ff].map((hex) => new THREE.Color(hex));

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
  /** The physical controller this hand is following right now, if any. */
  source: XRInputSource | null;
}

function haloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,.55)');
  glow.addColorStop(0.4, 'rgba(255,255,255,.18)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createGame() {
  const { renderer, scene, camera, rig, twinkle } = createStage();
  const shards = createShards(scene);
  const hud = createHud(rig);
  let sound: Sound | null = null;

  const segmentMesh = new THREE.InstancedMesh(
    segmentGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    MAX_SEGMENTS,
  );
  const headMesh = new THREE.InstancedMesh(
    headGeometry(),
    new THREE.MeshLambertMaterial({ color: HEAD_COLOR, vertexColors: true }),
    MAX_SEGMENTS,
  );
  const eyesMesh = new THREE.InstancedMesh(
    eyesGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xfff6a8, toneMapped: false }),
    MAX_SEGMENTS,
  );
  const jawGeometry = mandibleGeometry();
  const jawMaterial = new THREE.MeshLambertMaterial({ color: 0xffb3f0, vertexColors: true });
  const jawMeshes = [-1, 1].map((side) => {
    const geometry = side < 0 ? jawGeometry.clone().scale(-1, 1, 1) : jawGeometry;
    return { side, mesh: new THREE.InstancedMesh(geometry, jawMaterial, MAX_SEGMENTS) };
  });
  const blockMesh = new THREE.InstancedMesh(
    blockGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
    COLUMNS * ROWS,
  );
  const boltMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0xfff27a, toneMapped: false }),
    MAX_BOLTS,
  );
  // Soft pools under everything overhead: they tie the sky to the ground and show how high it is.
  const shadowMesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    MAX_SEGMENTS + COLUMNS * ROWS,
  );
  const diverMesh = new THREE.Mesh(
    diverGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xff8a2a, vertexColors: true }),
  );
  diverMesh.visible = false;
  scene.add(diverMesh);
  const alarm = new THREE.Mesh(
    new THREE.CircleGeometry(160, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff1040,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  alarm.position.y = 0.02;
  scene.add(alarm);

  // A soft neon halo behind each section, so the creature glows against the night sky.
  const haloMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: haloTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
    MAX_SEGMENTS,
  );
  const cameraFacing = new THREE.Quaternion();

  const headMeshes = [headMesh, eyesMesh, ...jawMeshes.map((jaw) => jaw.mesh)];
  for (const mesh of [segmentMesh, blockMesh, boltMesh, shadowMesh, haloMesh, ...headMeshes]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  segmentMesh.setColorAt(0, BODY_COLOR);
  haloMesh.setColorAt(0, BODY_COLOR);
  blockMesh.setColorAt(0, BLOCK_COLORS[BLOCK_STRENGTH]);

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
    const hand: Hand = { controller, cooldown: 0, source: null };
    // The order of a session's input sources isn't fixed: a controller that sleeps, or a switch to
    // hand tracking and back, can reorder them. Each hand follows its own source instead.
    controller.addEventListener('connected', (event) => {
      hand.source = event.data;
    });
    controller.addEventListener('disconnected', () => {
      hand.source = null;
    });
    return hand;
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
  const headUp = new THREE.Vector3();

  let score = 0;
  let lives = STARTING_LIVES;
  let wave = 1;
  let stepInterval = FIRST_STEP_S;
  let stepClock = 0;
  let nextBug = 6;
  let nextDiver = 9;
  let diverRow = 0;
  let diverColumn = 0;
  let diverStrength = 0;
  let diverSeeded = -1;
  let danger = 0;
  let nextHead = 0;
  /** Damaged mushrooms still to be repaired after a lost life. Null outside that pause. */
  let restoring: Block[] | null = null;
  let restoreClock = 0;
  let restoreStep = 0;
  let bugHeading = 0;
  let running = false;
  let gameOver = false;
  let mode: Mode = 'surround';
  let message = '';
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
    chains.push(...waveChains(wave));
    nextHead = time + EXTRA_HEAD_INTERVAL_S;
    stepInterval = Math.max(FASTEST_STEP_S, FIRST_STEP_S * STEP_SPEEDUP ** (wave - 1));
    stepClock = 0;
  };

  const newGame = () => {
    score = 0;
    lives = STARTING_LIVES;
    wave = 1;
    gameOver = false;
    restoring = null;
    blocks.clear();
    seedBlocks(STARTING_BLOCKS);
    startWave();
    bug.visible = false;
    diverMesh.visible = false;
    nextBug = time + 6;
    nextDiver = time + 9;
    say(mode === 'surround' ? 'Behind you. Look up!' : 'Here it comes');
  };

  /** After a lost life, the field is cleared and every damaged mushroom regrows, one by one. */
  const beginRestore = () => {
    chains.length = 0;
    bolts.length = 0;
    diverMesh.visible = false;
    restoring = [...blocks.values()].filter((block) => block.strength < BLOCK_STRENGTH);
    restoreClock = 0;
    restoreStep = 0;
  };

  const updateRestore = (dt: number) => {
    if (!restoring) return;
    restoreClock += dt;
    while (restoreClock >= RESTORE_INTERVAL_S) {
      restoreClock -= RESTORE_INTERVAL_S;
      const block = restoring.shift();
      if (!block) {
        restoring = null;
        nextBug = time + BUG_INTERVAL_S;
        nextDiver = time + DIVER_INTERVAL_S;
        startWave();
        return;
      }
      block.strength = BLOCK_STRENGTH;
      score += RESTORE_POINTS;
      segmentSpot.set(...cellPosition(block.cell.column, block.cell.row));
      shards.burst(segmentSpot, 0x46c8ff, cellSize(block.cell.row) * 0.7, 10);
      sound?.restore(restoreStep++ % 24);
    }
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
      beginRestore();
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
        shards.burst(segmentSpot, i === 0 ? 0xff4fd8 : 0x6dffb0, size, i === 0 ? 90 : 42);
        sound?.hit();
        buzz(i === 0 ? 1 : 0.65, i === 0 ? 150 : 80);
        const cell = { column: segment.column, row: segment.row };
        blocks.set(cellKey(cell), { cell, strength: BLOCK_STRENGTH });
        chains.splice(c, 1, ...splitChain(chain, i));
        return true;
      }
    }
    return false;
  };

  const strikeDiver = (bolt: Bolt) => {
    if (!diverMesh.visible || !nearSegment(bolt, diverMesh.position, cellSize(diverRow) * 0.8)) {
      return false;
    }
    diverStrength--;
    shards.burst(diverMesh.position, 0xff8a2a, cellSize(diverRow), diverStrength > 0 ? 8 : 46);
    sound?.hit();
    buzz(0.7, 90);
    if (diverStrength <= 0) {
      diverMesh.visible = false;
      score += 200;
    }
    return true;
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
        bolt.life <= 0 ||
        strikeBug(bolt) ||
        strikeDiver(bolt) ||
        strikeChains(bolt, phase) ||
        strikeBlocks(bolt);
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
    if (wave > 1 && time >= nextHead && chains.length < MAX_CHAINS) {
      nextHead = time + EXTRA_HEAD_INTERVAL_S;
      const head = spawnHead(chains);
      if (head) chains.push(head);
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

  const headMatrix = new THREE.Matrix4();
  const jawMatrix = new THREE.Matrix4();
  const hinge = new THREE.Matrix4();
  const swing = new THREE.Matrix4();

  /**
   * How far a head is lunging right now, 0..1. Each head lurches at you every few seconds,
   * on its own beat, then snaps back.
   */
  const lungeOf = (chainIndex: number) => {
    const beat = (time * 0.42 + chainIndex * 0.37) % 1;
    return beat < 0.14 ? Math.sin((beat / 0.14) * Math.PI) : 0;
  };

  const drawHead = (heads: number, chainIndex: number, size: number) => {
    const lunge = lungeOf(chainIndex);
    // The lunge throws the head forward and up, and the jaws gape wide just before they slam.
    placement.translateZ(size * 0.9 * lunge);
    placement.rotateX(-0.35 * lunge);
    placement.scale.setScalar(size * 1.2);
    placement.updateMatrix();
    headMatrix.copy(placement.matrix);
    headMesh.setMatrixAt(heads, headMatrix);
    eyesMesh.setMatrixAt(heads, headMatrix);

    const chatter = Math.max(0, Math.sin(time * 11 + chainIndex * 2.1)) * 0.28;
    // At rest the pincers sweep out to the sides, so you see them work even head-on.
    const open = 0.55 + chatter + lunge * 0.6;
    for (const { side, mesh } of jawMeshes) {
      hinge.makeTranslation(side * 0.34, -0.2, 0.3);
      swing.makeRotationY(side * open);
      jawMatrix.multiplyMatrices(headMatrix, hinge).multiply(swing);
      mesh.setMatrixAt(heads, jawMatrix);
    }
  };

  const drawChains = (phase: number) => {
    let bodies = 0;
    let heads = 0;
    let halos = 0;
    chains.forEach((chain, chainIndex) => {
      let ahead: [number, number, number] | null = null;
      chain.segments.forEach((segment, i) => {
        if (halos >= MAX_SEGMENTS) return;
        const { position, size } = segmentAt(segment, phase);
        placement.position.set(...position);
        placement.position.y += Math.sin(time * 5 + i * 0.8) * size * 0.08;
        placement.rotation.set(0, 0, 0);
        // The head watches you. Each body section follows the one ahead, through the depth.
        if (ahead) placement.lookAt(...ahead);
        else placement.lookAt(rig.position.x, 1.5, 0);
        ahead = position;
        if (i === 0) {
          drawHead(heads++, chainIndex, size);
        } else {
          placement.scale.setScalar(size * 0.92);
          placement.updateMatrix();
          segmentMesh.setMatrixAt(bodies, placement.matrix);
          segmentMesh.setColorAt(bodies++, BODY_COLOR);
        }
        placement.quaternion.copy(cameraFacing);
        placement.scale.setScalar(size * 2.6);
        placement.updateMatrix();
        haloMesh.setMatrixAt(halos, placement.matrix);
        haloMesh.setColorAt(halos++, i === 0 ? HEAD_COLOR : BODY_COLOR);
      });
    });
    segmentMesh.count = bodies;
    haloMesh.count = halos;
    for (const mesh of headMeshes) {
      mesh.count = heads;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [segmentMesh, haloMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const shadowAt = (index: number, position: [number, number, number], size: number) => {
    placement.position.set(position[0], 0.05, position[2]);
    placement.rotation.set(0, 0, 0);
    // Height spreads a shadow out, so a low creature's pool is small, tight and alarming.
    placement.scale.setScalar(size * (1.2 + position[1] * 0.012));
    placement.updateMatrix();
    shadowMesh.setMatrixAt(index, placement.matrix);
  };

  const drawShadows = (phase: number) => {
    let index = 0;
    for (const chain of chains) {
      for (const segment of chain.segments) {
        if (index >= MAX_SEGMENTS) break;
        const { position, size } = segmentAt(segment, phase);
        shadowAt(index++, position, size);
      }
    }
    for (const block of blocks.values()) {
      shadowAt(index++, cellPosition(block.cell.column, block.cell.row), cellSize(block.cell.row));
    }
    shadowMesh.count = index;
    shadowMesh.instanceMatrix.needsUpdate = true;
  };

  /** The whole field pulses red as the creature nears the ground. */
  const updateDanger = (dt: number) => {
    const lowest = Math.max(0, ...chains.map((chain) => chain.segments[0].row));
    const target = THREE.MathUtils.clamp((lowest - (ROWS - 1 - DANGER_ROWS)) / DANGER_ROWS, 0, 1);
    danger += (target - danger) * Math.min(1, dt * 3);
    alarm.material.opacity = danger * (0.1 + 0.1 * Math.sin(time * 8));
  };

  const drawBlocks = () => {
    let index = 0;
    for (const block of blocks.values()) {
      placement.position.set(...cellPosition(block.cell.column, block.cell.row));
      placement.rotation.set(Math.sin(time * 0.5 + index) * 0.25, index * 1.7 + time * 0.2, 0);
      placement.scale.setScalar(cellSize(block.cell.row) * (0.68 + block.strength * 0.12));
      placement.updateMatrix();
      blockMesh.setMatrixAt(index, placement.matrix);
      blockMesh.setColorAt(index, BLOCK_COLORS[block.strength]);
      index++;
    }
    placement.rotation.set(0, 0, 0);
    blockMesh.count = index;
    blockMesh.instanceMatrix.needsUpdate = true;
    if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
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
    const reach = Math.hypot(bug.position.x - rig.position.x, bug.position.z);
    if (reach < BUG_TOUCH_RADIUS_M) {
      nextBug = time + BUG_INTERVAL_S;
      hurt();
    }
  };

  const buzz = (strength: number, milliseconds: number) => {
    const session = renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      try {
        void source.gamepad?.hapticActuators?.[0]?.pulse(strength, milliseconds);
      } catch {
        // Not every runtime supports haptics, and a missed buzz isn't worth a dropped frame.
      }
    }
  };

  /** Plunges straight down a column, seeding new blocks behind it to clog your lower field. */
  const updateDiver = (dt: number) => {
    if (!diverMesh.visible) {
      if (time < nextDiver || gameOver) return;
      diverColumn = 2 + Math.floor(Math.random() * (COLUMNS - 4));
      diverRow = 0;
      diverSeeded = 0;
      diverStrength = DIVER_STRENGTH;
      diverMesh.visible = true;
      nextDiver = time + DIVER_INTERVAL_S;
      sound?.dive();
    }
    diverRow += DIVER_ROWS_PER_S * dt;
    const row = Math.floor(diverRow);
    if (row > diverSeeded && row < ROWS - 3) {
      diverSeeded = row;
      if (Math.random() < DIVER_SEED_CHANCE) {
        const cell = { column: diverColumn, row };
        blocks.set(cellKey(cell), { cell, strength: BLOCK_STRENGTH });
      }
    }
    if (diverRow >= ROWS - 1) {
      diverMesh.visible = false;
      return;
    }
    diverMesh.position.set(...cellPosition(diverColumn, diverRow));
    diverMesh.rotation.y = time * 7;
    diverMesh.scale.setScalar(cellSize(diverRow) * 1.1);
  };

  const justPressed = (key: string, pressed: boolean) => {
    const before = stickButtons.get(key) ?? false;
    stickButtons.set(key, pressed);
    return pressed && !before;
  };

  const readControllers = (dt: number) => {
    if (!renderer.xr.isPresenting) {
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
      const gamepad = hand.source?.gamepad;
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
      if (justPressed(`b${i}`, gamepad.buttons[5]?.pressed ?? false)) newGame();
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

    const advancing = running && !gameOver && !restoring;
    const phase = advancing ? updateChains(dt) : Math.min(1, stepClock / stepInterval);
    updateRestore(dt);
    camera.getWorldQuaternion(cameraFacing);
    twinkle.update(time);
    drawChains(phase);
    drawBlocks();
    drawShadows(phase);
    updateDanger(dt);
    if (running) {
      if (!restoring) {
        updateBug(dt);
        updateDiver(dt);
      }
      updateBolts(dt, phase);
    }
    shards.update(dt);
    if (sound) {
      camera.getWorldPosition(origin);
      camera.getWorldDirection(facing);
      camera.getWorldQuaternion(quaternion);
      sound.setListener(origin, facing, headUp.set(0, 1, 0).applyQuaternion(quaternion));
      sound.setBug(bug.visible && running ? bug.position : null);
    }
    flash.material.opacity *= Math.exp(-dt * 3);
    flash.visible = flash.material.opacity > 0.01;
    drawHud();
    renderer.render(scene, camera);
  };

  addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyB') newGame();
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
    begin(audio: boolean, chosen: Mode = 'surround') {
      mode = chosen;
      setMode(chosen);
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
      endGame() {
        lives = 1;
        hurt();
      },
      boltCount: () => bolts.length,
      stats: () => ({
        score,
        lives,
        wave,
        chains: chains.length,
        blocks: blocks.size,
        restoring: restoring?.length ?? -1,
        damaged: [...blocks.values()].filter((block) => block.strength < BLOCK_STRENGTH).length,
      }),
      loseLife: () => hurt(),
      zoom(fov: number) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      },
      damageBlocks() {
        for (const block of blocks.values()) block.strength = 1;
      },
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
