'use strict';

/**
 * Procedural ambient noise generation — pure math, no audio files.
 *
 * Each generator fills a Float32Array of samples in [-1, 1]. In the renderer
 * these are copied into looping AudioBuffers; in tests they run under plain
 * Node. A tiny seeded PRNG keeps output deterministic when a seed is given.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** White noise: flat spectrum. */
function white(length, rand) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** Pink noise: -3 dB/octave (Paul Kellet's economy filter). */
function pink(length, rand) {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown (red) noise: -6 dB/octave, integrated white noise with leak. */
function brown(length, rand) {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = rand() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/**
 * Rain-ish noise: band-shaped hiss (the "sheet" of rain) plus sparse
 * exponentially-decaying droplet ticks and a soft low rumble.
 */
function rain(length, rand, sampleRate) {
  const out = new Float32Array(length);
  // Base hiss: high-passed pink-ish texture.
  let lp = 0, lastW = 0, rumble = 0;
  const dropletsPerSec = 22;
  const dropProb = dropletsPerSec / sampleRate;
  let dropEnv = 0;
  let dropTone = 0;
  for (let i = 0; i < length; i++) {
    const w = rand() * 2 - 1;
    // gentle low-pass for body
    lp = lp + 0.12 * (w - lp);
    // high-passed component = fizz
    const hp = w - lastW;
    lastW = w;
    // slow rumble (very low-passed noise)
    rumble = rumble + 0.0008 * ((rand() * 2 - 1) - rumble);
    // droplets: random impulses with fast decay and slight tonal ring
    if (rand() < dropProb) {
      dropEnv = 0.5 + rand() * 0.5;
      dropTone = 800 + rand() * 2200; // Hz
    }
    let drop = 0;
    if (dropEnv > 0.001) {
      drop = dropEnv * Math.sin((2 * Math.PI * dropTone * i) / sampleRate) * 0.35;
      dropEnv *= Math.exp(-60 / sampleRate); // ~fast decay
    }
    out[i] = hp * 0.45 + lp * 0.15 + rumble * 2.0 + drop;
  }
  return out;
}

const GENERATORS = { white, pink, brown, rain };
const NOISE_TYPES = Object.keys(GENERATORS);

/**
 * Generate one channel of noise.
 * @param {'white'|'pink'|'brown'|'rain'} type
 * @param {object} [opts]
 * @param {number} [opts.sampleRate=44100]
 * @param {number} [opts.durationSec=2]
 * @param {number} [opts.seed] deterministic output when provided
 * @returns {Float32Array} samples clamped to [-1, 1]
 */
function generateNoise(type, opts = {}) {
  const gen = GENERATORS[type];
  if (!gen) throw new Error(`Unknown noise type: ${type}`);
  const sampleRate = opts.sampleRate || 44100;
  const durationSec = opts.durationSec || 2;
  const length = Math.max(1, Math.round(sampleRate * durationSec));
  const rand = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
  const out = gen(length, rand, sampleRate);
  // Normalize/clamp into [-1, 1] with a little headroom.
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const k = 0.95 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

/** Root-mean-square level of a buffer (used by tests + UI meters). */
function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

const api = { generateNoise, rms, NOISE_TYPES };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.DeepdeskNoise = api;
}
