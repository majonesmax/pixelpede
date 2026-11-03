import type * as THREE from 'three';

/** Everything is synthesized, so the game ships no audio files. */
export interface Sound {
  ctx: AudioContext;
  shoot: () => void;
  hit: () => void;
  block: () => void;
  step: (nearness: number) => void;
  bug: () => void;
  dive: () => void;
  hurt: () => void;
  wave: () => void;
  /** One note of the mushroom restore; `step` raises the pitch as the count goes on. */
  restore: (step: number) => void;
  /** The bug's warble, placed in space so you can hear where it is. Null hides it. */
  setBug: (position: { x: number; y: number; z: number } | null) => void;
  /** Where the listener's head is and which way it faces, for placing sounds. */
  setListener: (position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3) => void;
}

export function startSound(): Sound {
  const ctx = new AudioContext();
  const output = ctx.createDynamicsCompressor();
  const volume = ctx.createGain();
  volume.gain.value = 0.9;
  output.connect(volume).connect(ctx.destination);

  const tone = (
    type: OscillatorType,
    from: number,
    to: number,
    seconds: number,
    level: number,
    delay = 0,
  ) => {
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  };

  // A low, slowly breathing chord under the whole game.
  const drone = ctx.createGain();
  drone.gain.value = 0.07;
  const darken = ctx.createBiquadFilter();
  darken.type = 'lowpass';
  darken.frequency.value = 420;
  drone.connect(darken).connect(output);
  for (const hz of [55, 55.4, 82.4, 110.3, 164.8]) {
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.value = hz;
    voice.connect(drone);
    voice.start();
  }
  const breath = ctx.createOscillator();
  const breathDepth = ctx.createGain();
  breath.frequency.value = 0.07;
  breathDepth.gain.value = 260;
  breath.connect(breathDepth).connect(darken.frequency);
  breath.start();

  // The bug's signature: a wavering, nasal tone you learn to dread, coming from wherever it is.
  const bugVoice = ctx.createGain();
  bugVoice.gain.value = 0;
  const bugPanner = new PannerNode(ctx, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    refDistance: 6,
    rolloffFactor: 1,
  });
  bugVoice.connect(bugPanner).connect(output);
  const bugTone = ctx.createOscillator();
  bugTone.type = 'square';
  bugTone.frequency.value = 620;
  const bugFilter = ctx.createBiquadFilter();
  bugFilter.type = 'bandpass';
  bugFilter.frequency.value = 900;
  bugFilter.Q.value = 2.5;
  bugTone.connect(bugFilter).connect(bugVoice);
  const warble = ctx.createOscillator();
  warble.frequency.value = 7;
  const warbleDepth = ctx.createGain();
  warbleDepth.gain.value = 240;
  warble.connect(warbleDepth).connect(bugTone.frequency);
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.9;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 160;
  sweep.connect(sweepDepth).connect(bugTone.frequency);
  for (const source of [bugTone, warble, sweep]) source.start();

  const { listener } = ctx;

  return {
    ctx,
    restore: (step) => tone('square', 523 * 2 ** (step / 12), 523 * 2 ** (step / 12), 0.07, 0.16),
    setBug(position) {
      const now = ctx.currentTime;
      bugVoice.gain.setTargetAtTime(position ? 0.55 : 0, now, 0.08);
      if (!position) return;
      bugPanner.positionX.setTargetAtTime(position.x, now, 0.03);
      bugPanner.positionY.setTargetAtTime(position.y, now, 0.03);
      bugPanner.positionZ.setTargetAtTime(position.z, now, 0.03);
    },
    setListener(position, forward, up) {
      const now = ctx.currentTime;
      listener.positionX.setTargetAtTime(position.x, now, 0.02);
      listener.positionY.setTargetAtTime(position.y, now, 0.02);
      listener.positionZ.setTargetAtTime(position.z, now, 0.02);
      listener.forwardX.setTargetAtTime(forward.x, now, 0.02);
      listener.forwardY.setTargetAtTime(forward.y, now, 0.02);
      listener.forwardZ.setTargetAtTime(forward.z, now, 0.02);
      listener.upX.setTargetAtTime(up.x, now, 0.02);
      listener.upY.setTargetAtTime(up.y, now, 0.02);
      listener.upZ.setTargetAtTime(up.z, now, 0.02);
    },
    shoot: () => tone('square', 980, 240, 0.09, 0.14),
    hit() {
      tone('sawtooth', 420, 60, 0.22, 0.45);
      tone('square', 1300, 300, 0.12, 0.2);
    },
    block: () => tone('triangle', 640, 300, 0.07, 0.22),
    step: (nearness) => tone('sawtooth', 64 + nearness * 44, 42, 0.13, 0.2 + nearness * 0.55),
    bug: () => tone('square', 1700, 900, 0.05, 0.1),
    dive: () => tone('sawtooth', 2200, 180, 2.2, 0.26),
    hurt() {
      tone('sawtooth', 200, 36, 0.7, 0.8);
      tone('square', 90, 40, 0.5, 0.5);
    },
    wave() {
      [392, 523, 659, 784].forEach((hz, i) => tone('square', hz, hz, 0.14, 0.2, i * 0.11));
    },
  };
}
