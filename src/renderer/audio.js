'use strict';

/**
 * Deepdesk audio: procedural ambient noise player + gentle transition chime.
 * Everything is synthesized with WebAudio — zero audio files shipped.
 */
(function () {
  const { generateNoise, NOISE_TYPES } = window.DeepdeskNoise;

  let ctx = null;
  function audioCtx() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------------- Ambient engine ----------------
  const ambient = {
    playing: false,
    masterVolume: 0.5,
    mix: { white: 0, pink: 0, brown: 0.6, rain: 0.4 },
    duckedForBreak: false,
    nodes: null, // { master, sources: {type: {src, gain}} }
  };

  function buildAmbientGraph() {
    const ac = audioCtx();
    const master = ac.createGain();
    master.gain.value = 0; // fade in
    master.connect(ac.destination);
    const sources = {};
    for (const type of NOISE_TYPES) {
      // 4s looping stereo buffer, independently generated channels.
      const seconds = 4;
      const buf = ac.createBuffer(2, ac.sampleRate * seconds, ac.sampleRate);
      buf.copyToChannel(generateNoise(type, { sampleRate: ac.sampleRate, durationSec: seconds }), 0);
      buf.copyToChannel(generateNoise(type, { sampleRate: ac.sampleRate, durationSec: seconds }), 1);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ac.createGain();
      gain.gain.value = ambient.mix[type] || 0;
      src.connect(gain).connect(master);
      src.start();
      sources[type] = { src, gain };
    }
    return { master, sources };
  }

  function effectiveMaster() {
    return ambient.duckedForBreak ? 0 : ambient.masterVolume * 0.6;
  }

  const AmbientPlayer = {
    get playing() { return ambient.playing; },
    start() {
      if (ambient.playing) return;
      ambient.nodes = buildAmbientGraph();
      ambient.playing = true;
      const ac = audioCtx();
      ambient.nodes.master.gain.linearRampToValueAtTime(effectiveMaster(), ac.currentTime + 0.8);
    },
    stop() {
      if (!ambient.playing || !ambient.nodes) return;
      const ac = audioCtx();
      const nodes = ambient.nodes;
      nodes.master.gain.cancelScheduledValues(ac.currentTime);
      nodes.master.gain.setValueAtTime(nodes.master.gain.value, ac.currentTime);
      nodes.master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
      setTimeout(() => {
        for (const t of Object.keys(nodes.sources)) {
          try { nodes.sources[t].src.stop(); } catch { /* already stopped */ }
        }
        nodes.master.disconnect();
      }, 600);
      ambient.nodes = null;
      ambient.playing = false;
    },
    setMasterVolume(v) {
      ambient.masterVolume = Math.min(1, Math.max(0, v));
      if (ambient.playing && ambient.nodes) {
        const ac = audioCtx();
        ambient.nodes.master.gain.linearRampToValueAtTime(effectiveMaster(), ac.currentTime + 0.15);
      }
    },
    setMix(type, v) {
      ambient.mix[type] = Math.min(1, Math.max(0, v));
      if (ambient.playing && ambient.nodes && ambient.nodes.sources[type]) {
        const ac = audioCtx();
        ambient.nodes.sources[type].gain.linearRampToValueAtTime(ambient.mix[type], ac.currentTime + 0.15);
      }
    },
    /** Mute (without stopping) while on a break when keepDuringBreaks is off. */
    setDuckedForBreak(ducked) {
      ambient.duckedForBreak = !!ducked;
      if (ambient.playing && ambient.nodes) {
        const ac = audioCtx();
        ambient.nodes.master.gain.linearRampToValueAtTime(effectiveMaster(), ac.currentTime + 0.8);
      }
    },
    getMix() { return { ...ambient.mix }; },
  };

  // ---------------- Chime ----------------
  /**
   * Gentle two-note bell chime, synthesized: sine partials with exponential
   * decay. `kind`: 'break' (descending, relax) | 'focus' (ascending, go).
   */
  function playChime(kind = 'break', volume = 0.5) {
    if (volume <= 0) return;
    const ac = audioCtx();
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = Math.min(1, volume) * 0.5;
    master.connect(ac.destination);

    const notes = kind === 'focus'
      ? [523.25, 783.99] // C5 -> G5, ascending: back to work
      : [783.99, 523.25]; // G5 -> C5, descending: wind down

    notes.forEach((freq, i) => {
      const t = now + i * 0.28;
      // fundamental + soft octave partial = bell-ish
      for (const [mult, amp] of [[1, 1], [2, 0.35], [3.01, 0.12]]) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp * 0.32, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 1.7);
      }
    });
    setTimeout(() => master.disconnect(), 2600);
  }

  window.DeepdeskAudio = { AmbientPlayer, playChime };
})();
