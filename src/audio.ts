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

  return {
    ctx,
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
