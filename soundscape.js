/* =======================
   ELYSIUM SOUNDSCAPE
   Generated retro-synth music, composed live from the tank's own telemetry.

   Each piece is built the way a game soundtrack cue is: a running arpeggio
   sets the pulse, then bass, pads, a melody and drums enter one layer at a
   time, drop away for a breakdown, and come back for a final pass that lands
   on the home chord. The melody is written once per piece and repeats, so it
   is heard as a tune rather than a wander. Voices are chip-style pulse and
   triangle waves, doubled and detuned for warmth, through echo and reverb.
   Nothing is prerecorded: no audio files to host, nothing to license.

     time of day (朝 日 黄昏 夜)  -> mode, tempo range, groove and drums
     pH                           -> key of the next piece
     dissolved oxygen %           -> tempo (nudged within the phase's range)
     temperature                  -> lead tone (pulse width: cool = thin, warm = round)
     CO2 injection on             -> little bubble blips
     phase change                 -> a short jingle

   Browsers refuse to start sound without a click, so it is opt-in via the
   header button. index.html feeds it through three calls:
     ElysiumSound.setTelemetry({ ph, doPct, tempF })   every /latest poll
     ElysiumSound.setPhase(kanji, { co2 })             every light-cycle tick
     ElysiumSound.setLang("en" | "jp")                 on language toggle
======================= */
(function () {
  "use strict";

  const AC = window.AudioContext || window.webkitAudioContext;

  /* ---------- musical material ---------- */

  const MODES = {
    lydian: [0, 2, 4, 6, 7, 9, 11],
    major:  [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    minor:  [0, 2, 3, 5, 7, 8, 10],
  };

  /* Melody rhythm cells: one bar of sixteenth-note slots as [start, length].
     A tune uses one cell for its first three bars and a cadence cell for the
     fourth, which is most of what makes it sound like a phrase. */
  const CELLS = {
    drive: [
      [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
      [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
      [[0, 6], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 4], [4, 4], [8, 6], [14, 2]],
      [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
    ],
    float: [
      [[0, 8], [8, 4], [12, 4]],
      [[0, 4], [4, 4], [8, 8]],
      [[0, 6], [6, 2], [8, 8]],
      [[0, 12], [12, 4]],
    ],
  };
  const CADENCES = [
    [[0, 4], [4, 4], [8, 8]],
    [[0, 8], [8, 8]],
    [[0, 2], [2, 2], [4, 12]],
  ];
  // Melodic contours in scale steps between successive notes of a cell.
  const SHAPES = [
    [1, 1, 1, -2, -1],
    [2, -1, 2, -1, -1],
    [-1, -1, 2, 1, -2],
    [1, 1, -1, -1, 1],
    [3, -1, -1, -1, 2],
    [-2, 1, 1, 1, -1],
  ];
  // Arpeggio orders over chord tones (0 root, 1 third, 2 fifth, 3 seventh, 4 octave).
  const ARPS = [
    [0, 1, 2, 3, 4, 3, 2, 1],
    [0, 2, 1, 3, 2, 4, 3, 1],
    [0, 1, 2, 4, 2, 1, 3, 2],
    [0, 2, 4, 2, 1, 3, 4, 3],
  ];

  /* Each light-cycle phase is its own cue.
     prog: 4-bar chord loops as scale degrees (0 = I / i).
     arp16: sixteenth-note arpeggio (false = eighths, for night).
     bass: "octave" bounces root/octave in eighths, "pulse" drives eighths on
     the root, "long" holds half notes. drums: "full", "light", or null. */
  const PHASES = {
    "朝": {
      mode: "lydian", bpm: 104, cells: "drive", arp16: true, bass: "pulse", drums: "light",
      prog: [[0, 1, 5, 4], [0, 4, 1, 0], [0, 1, 3, 4]],
      en: "Lydian", jp: "・リディア旋法",
    },
    "日": {
      mode: "major", bpm: 112, cells: "drive", arp16: true, bass: "octave", drums: "full",
      prog: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 5, 0], [0, 2, 3, 4]],
      en: "major", jp: "長調",
    },
    "黄昏": {
      mode: "dorian", bpm: 98, cells: "drive", arp16: true, bass: "pulse", drums: "light",
      prog: [[0, 3, 0, 3], [0, 6, 3, 4], [5, 6, 0, 0], [0, 2, 3, 6]],
      en: "Dorian", jp: "・ドリア旋法",
    },
    "夜": {
      mode: "minor", bpm: 84, cells: "float", arp16: false, bass: "long", drums: null,
      prog: [[0, 5, 3, 6], [0, 5, 2, 6], [5, 3, 0, 4], [0, 3, 5, 4]],
      en: "minor", jp: "短調",
    },
  };

  /* Arrangement: layers enter, drop for a breakdown, return for the ending.
     8 bars per melody section = the tune twice. */
  const ARRANGEMENT = [
    { bars: 4, arp: 1, sweep: [1100, 3600] },
    { bars: 4, arp: 1, bass: 1, pad: 1 },
    { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1 },
    { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, counter: 1, drums: 1 },
    { bars: 4, arp: 1, pad: 1, sweep: [1000, 3600] },
    { bars: 4, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1, ending: 1 },
  ];

  /* pH picks the key of each new piece. The CO2 cycle swings pH by most of a
     unit a day, so pieces drift through the keys: lower while CO2 is on,
     climbing back overnight. Hysteresis keeps a reading that sits on a
     boundary from flipping the key every piece. */
  const BASE_MIDI = 60;                               // C4
  const KEY_OFFSETS = [-3, -1, 0, 2, 4, 5, 7];        // A B C D E F G
  const DEFAULT_KEY = 2;                              // C, until pH arrives
  const PH_LO = 5.6, PH_HI = 7.4;
  const NOTE_EN = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" };
  const NOTE_JP = { 0: "ハ", 2: "ニ", 4: "ホ", 5: "ヘ", 7: "ト", 9: "イ", 11: "ロ" };

  /* Dissolved oxygen nudges tempo up to ±8 BPM around the phase's own. */
  const DO_LO = 20, DO_HI = 100, DO_MID = 60, BPM_SWING = 8;

  const LOOKAHEAD = 1.2;   // seconds of notes scheduled ahead; survives background-tab timer throttling
  const TICK = 0.2;

  const UI = {
    en: {
      listen: "Listen", playing: "Listening",
      title: "Play retro-synth music composed live from the tank's sensors",
      unsupported: "Sound isn't supported in this browser",
      main: (key, mode, bpm) => `♪ ${key} ${mode} · ${bpm} BPM`,
      rest: "♪ between pieces — the next one is coming",
      map: "pH → key · O₂ → tempo · temp → tone · CO₂ → bubbles",
    },
    jp: {
      listen: "聴く", playing: "再生中",
      title: "水槽のセンサーからリアルタイムに作曲されるレトロシンセ音楽",
      unsupported: "このブラウザでは音声を再生できません",
      main: (key, mode, bpm) => `♪ ${key}${mode} · ${bpm} BPM`,
      rest: "♪ 曲間 — まもなく次の曲",
      map: "pH → 調 · 溶存酸素 → テンポ · 水温 → 音色 · CO₂ → 泡",
    },
  };

  const state = {
    ph: null, doPct: null, tempF: null,
    co2: false, phase: "日", keyIdx: null, lang: "en",
  };

  let ctx = null;
  let nodes = null;
  let waves = null;
  let running = false;
  let piece = null;          // the piece currently being scheduled
  let lastPiece = null;      // key/mode for bubbles while resting
  let nextPieceAt = 0;
  let nextBubbleAt = 0;
  const timers = new Set();

  /* ---------- helpers ---------- */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const mod7 = (i) => ((i % 7) + 7) % 7;
  function num(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function after(sec, fn) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, sec * 1000);
    timers.add(id);
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }
  function chain() {
    for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    return arguments[arguments.length - 1];
  }

  /* ---------- derived parameters ---------- */
  function keyIndexFor(ph, current) {
    if (ph == null) return current == null ? DEFAULT_KEY : current;
    const x = (clamp(ph, PH_LO, PH_HI) - PH_LO) / (PH_HI - PH_LO) * (KEY_OFFSETS.length - 1);
    if (current != null && Math.abs(x - current) < 0.8) return current;
    return Math.round(x);
  }
  function bpmFor(phase) {
    const d = state.doPct == null ? DO_MID : clamp(state.doPct, DO_LO, DO_HI);
    return Math.round(PHASES[phase].bpm + (d - DO_MID) / (DO_HI - DO_MID) * BPM_SWING);
  }
  // Pulse width follows temperature: 12.5% (thin, cool) -> 25% -> 50% (round, warm).
  function leadWave() {
    const t = state.tempF == null ? 72 : state.tempF;
    return t < 70.5 ? waves.p12 : t < 74.5 ? waves.p25 : waves.p50;
  }

  /* ---------- chip waveforms ----------
     Built from their Fourier series, capped at 40 harmonics: enough for the
     chip character, few enough that high notes don't alias. */
  function waveFrom(fn) {
    const L = 1024, H = 40;
    const real = new Float32Array(H + 1), imag = new Float32Array(H + 1);
    const x = new Float32Array(L);
    for (let k = 0; k < L; k++) x[k] = fn(k / L);
    for (let n = 1; n <= H; n++) {
      let re = 0, im = 0;
      for (let k = 0; k < L; k++) {
        const a = 2 * Math.PI * n * k / L;
        re += x[k] * Math.cos(a);
        im += x[k] * Math.sin(a);
      }
      real[n] = 2 * re / L;
      imag[n] = 2 * im / L;
    }
    return ctx.createPeriodicWave(real, imag);
  }
  function buildWaves() {
    const pulse = (duty) => (p) => (p < duty ? 1 : -1);
    // The NES triangle is 32 volume steps, not a smooth ramp: that stairstep is its sound.
    const stepTri = (p) => {
      const s = Math.floor(p * 32);
      const v = s < 16 ? s : 31 - s;
      return v / 7.5 - 1;
    };
    waves = {
      p12: waveFrom(pulse(0.125)),
      p25: waveFrom(pulse(0.25)),
      p50: waveFrom(pulse(0.5)),
      tri: waveFrom(stepTri),
    };
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /* ---------- the mixer ----------
     arp -> its own sweepable lowpass
     lead, arp, counter -> echo send
     everything -> mix -> soft lowpass -> dry + reverb -> master -> limiter */
  function build() {
    ctx = new AC();
    buildWaves();

    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 8;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    chain(master, limiter, ctx.destination);

    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 7000;
    soften.Q.value = 0.2;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(2.8, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    chain(soften, dry, master);
    chain(soften, verb, wet, master);

    const mix = ctx.createGain();
    mix.connect(soften);

    const echo = ctx.createDelay(3);
    echo.delayTime.value = 0.4;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const fbTone = ctx.createBiquadFilter();
    fbTone.type = "lowpass";
    fbTone.frequency.value = 2600;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.35;
    chain(echo, fbTone, fb, echo);
    chain(echo, echoOut, mix);

    const bus = (echoSend, into) => {
      const g = ctx.createGain();
      g.connect(into || mix);
      if (echoSend) {
        const s = ctx.createGain();
        s.gain.value = echoSend;
        chain(g, s, echo);
      }
      return g;
    };

    // The arpeggio runs through its own filter so sections can sweep it open.
    const arpFilter = ctx.createBiquadFilter();
    arpFilter.type = "lowpass";
    arpFilter.frequency.value = 3200;
    arpFilter.Q.value = 4;
    arpFilter.connect(mix);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1500;
    padFilter.Q.value = 0.5;
    padFilter.connect(mix);

    nodes = {
      master, limiter, echo, arpFilter,
      lead: bus(0.7), counter: bus(0.8), arp: bus(0.5, arpFilter),
      pad: bus(0, padFilter), bass: bus(0), drums: bus(0), fx: bus(1),
      noise: noiseBuffer(1),
    };
  }

  /* ---------- instruments ---------- */

  // One chip voice with a simple volume envelope and optional delayed vibrato.
  function voice(wave, dest, midi, t, dur, vel, opt) {
    opt = opt || {};
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, t);
    if (opt.detune) o.detune.value = opt.detune;
    const g = ctx.createGain();
    const sus = opt.sustain == null ? 0.65 : opt.sustain;
    const rel = opt.release || 0.06;
    const atk = opt.attack || 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + atk);
    g.gain.setTargetAtTime(vel * sus, t + atk, opt.decay || 0.12);
    g.gain.setTargetAtTime(0.0001, t + dur, rel);
    chain(o, g, dest);
    if (opt.vibrato && dur > 0.35) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.2);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.5);
      chain(lfo, depth, o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + rel * 8);
    }
    o.start(t);
    o.stop(t + dur + rel * 8);
    o.onended = () => g.disconnect();
  }

  function kick(t) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(waves.tri);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    chain(o, g, nodes.drums);
    o.start(t);
    o.stop(t + 0.24);
  }

  function noiseHit(t, vel, type, freq, decay) {
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    chain(src, f, g, nodes.drums);
    src.start(t, Math.random() * 0.8);
    src.stop(t + decay + 0.02);
  }
  const hat = (t, vel) => noiseHit(t, vel, "highpass", 7500, 0.04);
  const snare = (t) => noiseHit(t, 0.07, "bandpass", 1900, 0.13);

  // CO2 bubble: a two-step upward blip, in the key of whatever is playing.
  function bubble(t) {
    const p = piece || lastPiece;
    const root = p ? p.root : BASE_MIDI;
    const mode = MODES[p ? p.modeName : "major"];
    const deg = pick([0, 2, 4, 4, 7, 9]);
    const midi = root + 24 + mode[mod7(deg)] + (deg >= 7 ? 12 : 0);
    voice(waves.p12, nodes.fx, midi, t, 0.03, 0.02, { sustain: 1, release: 0.01 });
    voice(waves.p12, nodes.fx, midi + 12, t + 0.035, 0.04, 0.016, { sustain: 1, release: 0.015 });
  }

  // Jingle: the tonic chord rolled upward, last note held. Marks start-up and
  // each change of the light cycle.
  function jingle(t) {
    const root = BASE_MIDI + KEY_OFFSETS[state.keyIdx == null ? DEFAULT_KEY : state.keyIdx];
    const mode = MODES[PHASES[state.phase].mode];
    const notes = [0, 2, 4, 7].map((i) => root + 12 + mode[mod7(i)] + (i >= 7 ? 12 : 0));
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      voice(waves.p25, nodes.lead, m, t + i * 0.08, last ? 0.6 : 0.07, 0.07,
        { vibrato: last, sustain: last ? 0.7 : 1, release: last ? 0.2 : 0.02 });
    });
  }

  /* ---------- the composer ----------
     Melodies live in scale-index space (7 = the octave above the key root).
     A tune is four bars: one rhythm cell and one contour, stated on each of
     the first three chords (so it sequences with the harmony), then a
     cadence bar. It is written once and repeated, which is what makes it
     heard as a tune. */

  function idxToMidi(root, mode, i) {
    return root + 12 * Math.floor(i / 7) + mode[mod7(i)];
  }
  function snapToChord(i, deg) {
    const tones = [mod7(deg), mod7(deg + 2), mod7(deg + 4)];
    for (let d = 0; d <= 3; d++) {
      if (tones.includes(mod7(i)) && d === 0) return i;
      if (tones.includes(mod7(i + d))) return i + d;
      if (tones.includes(mod7(i - d))) return i - d;
    }
    return i;
  }

  const MEL_LO = 5, MEL_HI = 14;

  function writeTune(P, prog) {
    const cell = pick(CELLS[P.cells]);
    const shape = pick(SHAPES);
    const anchor = pick([8, 9, 10]);
    const bars = [];
    for (let b = 0; b < 3; b++) {
      const deg = prog[b];
      let idx = snapToChord(anchor, deg);
      const notes = cell.map(([s, l], n) => {
        if (n > 0) {
          let step = shape[(n - 1) % shape.length];
          if (idx + step > MEL_HI || idx + step < MEL_LO) step = -step;
          idx += step;
          if (s % 8 === 0) idx = snapToChord(idx, deg);   // strong beats sit on the chord
        }
        return { s, l, idx };
      });
      bars.push(notes);
    }
    // Two endings: "open" lands on a tone of the 4th chord and leads back in;
    // "home" resolves to the key note. The tune plays open, then home.
    const cad = pick(CADENCES);
    const cadence = (target) => cad.map(([s, l], n) => ({ s, l, idx: target + (cad.length - 1 - n) }));
    const lastDeg = prog[3];
    const open = cadence(snapToChord(anchor - 1, lastDeg));
    const home = cadence(7);
    return { bars, open, home };
  }

  function compose(t0) {
    const phaseKey = state.phase;
    const P = PHASES[phaseKey];
    const mode = MODES[P.mode];
    state.keyIdx = keyIndexFor(state.ph, state.keyIdx);
    const root = BASE_MIDI + KEY_OFFSETS[state.keyIdx];
    const bpm = bpmFor(phaseKey);
    const beat = 60 / bpm;
    const bar = beat * 4;
    const s16 = beat / 4;
    const prog = pick(P.prog);
    const tune = writeTune(P, prog);
    const arpOrder = pick(ARPS);
    const events = [];
    const add = (ev) => events.push(ev);

    nodes.echo.delayTime.setValueAtTime(beat * 0.75, t0);        // dotted eighth
    const af = nodes.arpFilter.frequency;
    af.cancelScheduledValues(t0);
    af.setValueAtTime(3600, t0);

    let barNo = 0;
    ARRANGEMENT.forEach((sec) => {
      const secT = t0 + barNo * bar;
      if (sec.sweep) {
        af.setValueAtTime(sec.sweep[0], secT);
        af.exponentialRampToValueAtTime(sec.sweep[1], secT + sec.bars * bar);
      }
      for (let b = 0; b < sec.bars; b++) {
        const barT = t0 + (barNo + b) * bar;
        const inLoop = b % 4;
        const lastBar = sec.ending && b === sec.bars - 1;
        const deg = lastBar ? 0 : prog[inLoop];

        // Arpeggio: the pulse of the whole piece.
        if (sec.arp) {
          const tones = [0, 2, 4, 6, 7].map((k) => idxToMidi(root - 12, mode, deg + k) + (deg >= 4 ? 0 : 12));
          const steps = P.arp16 ? 16 : 8;
          const len = P.arp16 ? s16 : s16 * 2;
          for (let s = 0; s < steps; s++) {
            if (lastBar && s >= steps / 2) break;
            const accent = s % 4 === 0 ? 1.25 : 1;
            const alone = sec.bass ? 1 : 1.8;        // carries the intro and breakdown by itself
            add({ t: barT + s * len, dur: len * 0.8, v: "arp", m: tones[arpOrder[s % 8]], vel: 0.04 * accent * alone });
          }
        }

        // Bass.
        if (sec.bass) {
          const r = idxToMidi(root - 24, mode, deg) + (idxToMidi(root - 24, mode, deg) < root - 22 ? 12 : 0);
          if (P.bass === "long" || lastBar) {
            add({ t: barT, dur: (lastBar ? 16 : 8) * s16 * 0.95, v: "bass", m: r, vel: 0.2 });
            if (!lastBar) add({ t: barT + 8 * s16, dur: 8 * s16 * 0.95, v: "bass", m: r + 7, vel: 0.17 });
          } else {
            for (let e = 0; e < 8; e++) {
              const up = P.bass === "octave" && e % 2 === 1;
              add({ t: barT + e * 2 * s16, dur: 2 * s16 * 0.7, v: "bass", m: r + (up ? 12 : 0), vel: e % 2 ? 0.14 : 0.19 });
            }
          }
        }

        // Pad: the chord held under everything, soft attack.
        if (sec.pad) {
          [0, 2, 4, 6].forEach((k) => {
            const m = idxToMidi(root - 12, mode, deg + k) + (deg >= 3 ? 0 : 12);
            add({ t: barT, dur: bar * (lastBar ? 1.6 : 0.98), v: "pad", m, vel: 0.017 });
          });
        }

        // Melody: tune bars 1-3, then the open ending the first time round and
        // the home ending the second; the final bar holds the key note.
        if (sec.mel) {
          let notes;
          if (lastBar) notes = [{ s: 0, l: 16, idx: 7 }];
          else if (inLoop < 3) notes = tune.bars[inLoop];
          else notes = (Math.floor(b / 4) % 2 === 0 && !sec.ending) ? tune.open : tune.home;
          notes.forEach((n) => add({
            t: barT + n.s * s16, dur: n.l * s16 * 0.9, v: "lead",
            m: idxToMidi(root, mode, n.idx), vel: 0.075,
          }));
        }

        // Counter-line: long tones a register above, answering the tune.
        if (sec.counter) {
          const hi = snapToChord(15, deg);
          add({ t: barT + 8 * s16, dur: 8 * s16 * 0.9, v: "counter", m: idxToMidi(root, mode, hi), vel: 0.03 });
        }

        // Drums.
        if (sec.drums && P.drums && !lastBar) {
          for (let s = 0; s < 16; s += 2) {
            const t = barT + s * s16;
            if (P.drums === "full") {
              if (s === 0 || s === 8 || (s === 10 && b % 2)) add({ t, v: "kick" });
              if (s === 4 || s === 12) add({ t, v: "snare" });
            }
            if (s % 4 === 2) add({ t, v: "hat", vel: 0.035 });
            else if (P.drums === "full") add({ t, v: "hat", vel: 0.015 });
          }
        }
      }
      barNo += sec.bars;
    });

    events.sort((a, b) => a.t - b.t);
    const end = t0 + barNo * bar + 2.5;       // let echo and reverb ring out
    return { events, i: 0, end, root, bpm, modeName: P.mode, phaseKey };
  }

  function play(ev) {
    switch (ev.v) {
      case "lead": {
        // Two pulses a few cents apart: chip tone, but fuller.
        const w = leadWave();
        const o = { vibrato: true, sustain: 0.75, release: 0.08 };
        voice(w, nodes.lead, ev.m, ev.t, ev.dur, ev.vel, Object.assign({ detune: -5 }, o));
        voice(w, nodes.lead, ev.m, ev.t, ev.dur, ev.vel * 0.7, Object.assign({ detune: 6 }, o));
        break;
      }
      case "counter":
        voice(waves.p50, nodes.counter, ev.m, ev.t, ev.dur, ev.vel, { vibrato: true, attack: 0.08, sustain: 0.8, release: 0.2 });
        break;
      case "arp":
        voice(waves.p25, nodes.arp, ev.m, ev.t, ev.dur, ev.vel, { sustain: 0.25, decay: 0.06, release: 0.03 });
        break;
      case "pad":
        voice(waves.p50, nodes.pad, ev.m, ev.t, ev.dur, ev.vel, { attack: 0.35, sustain: 0.9, decay: 0.5, release: 0.5, detune: -7 });
        voice(waves.p50, nodes.pad, ev.m, ev.t, ev.dur, ev.vel, { attack: 0.35, sustain: 0.9, decay: 0.5, release: 0.5, detune: 7 });
        break;
      case "bass":
        voice(waves.tri, nodes.bass, ev.m, ev.t, ev.dur, ev.vel, { sustain: 0.85, decay: 0.2, release: 0.04 });
        break;
      case "kick": kick(ev.t); break;
      case "snare": snare(ev.t); break;
      case "hat": hat(ev.t, ev.vel); break;
    }
  }

  /* ---------- scheduler ---------- */
  function restSeconds() {
    return rand(4, 9) * (state.phase === "夜" ? 1.5 : 1);
  }

  function loop() {
    if (!running) return;
    const now = ctx.currentTime;

    if (!piece && now >= nextPieceAt - LOOKAHEAD) {
      piece = compose(Math.max(nextPieceAt, now + 0.1));
      lastPiece = piece;
      render();
    }
    if (piece) {
      while (piece.i < piece.events.length && piece.events[piece.i].t < now + LOOKAHEAD) {
        play(piece.events[piece.i++]);
      }
      if (piece.i >= piece.events.length && now >= piece.end) {
        nextPieceAt = now + restSeconds();
        piece = null;
        render();
      }
    }

    if (state.co2) {
      if (nextBubbleAt < now) nextBubbleAt = now + rand(0.5, 3);
      while (nextBubbleAt < now + LOOKAHEAD) {
        bubble(nextBubbleAt);
        nextBubbleAt += rand(1.5, 5);
      }
    }

    after(TICK, loop);
  }

  /* ---------- start / stop ---------- */
  function start() {
    if (!AC) return;
    if (!ctx) build();
    // resume() must be called inside the click handler for iOS to allow audio.
    const resumed = ctx.resume();
    running = true;
    const t = ctx.currentTime;
    const g = nodes.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.9, t + 0.4);
    state.keyIdx = keyIndexFor(state.ph, state.keyIdx);
    jingle(t + 0.15);
    piece = null;
    nextPieceAt = t + 1.4;
    nextBubbleAt = t + 2;
    loop();
    render();
    return resumed;
  }

  function stop() {
    running = false;
    clearTimers();
    piece = null;
    if (ctx) {
      const t = ctx.currentTime;
      const g = nodes.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 1);
      setTimeout(() => { if (!running) ctx.suspend(); }, 1300);
    }
    render();
  }

  /* ---------- UI ---------- */
  let btn = null, label = null, status = null, statusMain = null, statusMap = null;

  function render() {
    const u = UI[state.lang] || UI.en;
    if (btn) {
      btn.setAttribute("aria-pressed", running ? "true" : "false");
      btn.title = AC ? u.title : u.unsupported;
      if (label) label.textContent = running ? u.playing : u.listen;
    }
    if (!status) return;
    status.hidden = !running;
    if (statusMain) {
      if (piece) {
        const P = PHASES[piece.phaseKey];
        const pc = ((piece.root % 12) + 12) % 12;
        statusMain.textContent = state.lang === "jp"
          ? u.main(NOTE_JP[pc], P.jp, piece.bpm)
          : u.main(NOTE_EN[pc], P.en, piece.bpm);
      } else {
        statusMain.textContent = u.rest;
      }
    }
    if (statusMap) statusMap.textContent = u.map;
  }

  function mount() {
    btn = document.getElementById("sound-toggle");
    status = document.getElementById("sound-now");
    if (btn) {
      label = btn.querySelector(".sound-label");
      if (!AC) btn.disabled = true;
      btn.addEventListener("click", () => (running ? stop() : start()));
    }
    if (status) {
      statusMain = status.querySelector(".dn-sound-main");
      statusMap = status.querySelector(".dn-sound-map");
    }
    render();
  }

  /* ---------- public API ---------- */
  window.ElysiumSound = {
    setTelemetry(d) {
      d = d || {};
      const ph = num(d.ph), dp = num(d.doPct), tf = num(d.tempF);
      if (ph != null) state.ph = ph;
      if (dp != null && dp > 0) state.doPct = dp;       // 0.0 is the old broken push, not a reading
      if (tf != null) state.tempF = tf;
      render();
    },
    setPhase(kanji, opts) {
      const next = PHASES[kanji] ? kanji : state.phase;
      const changed = next !== state.phase;
      state.phase = next;
      if (opts && typeof opts.co2 === "boolean") state.co2 = opts.co2;
      // The new phase takes over from the next piece; the jingle marks the moment now.
      if (running && changed) jingle(ctx.currentTime + 0.1);
      render();
    },
    setLang(lang) {
      state.lang = UI[lang] ? lang : "en";
      render();
    },
    start, stop,
    isPlaying: () => running,
    // Exposed for recording previews and debugging; not needed by the page.
    _audio: () => (ctx && nodes ? { ctx, output: nodes.limiter } : null),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
