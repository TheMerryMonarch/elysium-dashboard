/* =======================
   ELYSIUM SOUNDSCAPE
   Generated retro-synth music, composed live from the tank's own telemetry.

   The page writes an endless run of short pieces, the way a game soundtrack
   is a set of cues. Each piece draws its own arrangement (slow build, tune
   first, a bridge with a second theme, a journey that changes key, or a
   quiet interlude), its own instruments, groove and meter, its own chord
   loops, and a tune written for it that returns and answers itself. A short
   memory keeps consecutive pieces from sounding alike. Voices are chip-style
   pulse, triangle, bell and organ tones through echo and reverb. Nothing is
   prerecorded: no audio files to host, nothing to license.

     time of day (朝 日 黄昏 夜)  -> mode, tempo, instruments, grooves on offer
     pH                           -> key area (each piece sits on or next to it)
     dissolved oxygen %           -> tempo (nudged within the phase's range)
     temperature                  -> pulse lead tone (cool = thin, warm = round)
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

  /* =======================================================================
     MUSICAL MATERIAL
     ======================================================================= */

  const MODES = {
    lydian: [0, 2, 4, 6, 7, 9, 11],
    major:  [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    minor:  [0, 2, 3, 5, 7, 8, 10],
  };

  /* Melody rhythm cells: one bar of sixteenth-note slots as [start, length].
     A tune uses one cell for its first three bars and a cadence for the fourth. */
  const CELLS = {
    4: {
      drive: [
        [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
        [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
        [[0, 6], [6, 2], [8, 4], [12, 2], [14, 2]],
        [[0, 4], [4, 4], [8, 6], [14, 2]],
        [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
        [[2, 2], [4, 4], [8, 2], [10, 6]],
        [[0, 2], [2, 4], [6, 2], [8, 8]],
      ],
      float: [
        [[0, 8], [8, 4], [12, 4]],
        [[0, 4], [4, 4], [8, 8]],
        [[0, 6], [6, 2], [8, 8]],
        [[0, 12], [12, 4]],
        [[4, 4], [8, 8]],
      ],
    },
    3: {
      drive: [
        [[0, 4], [4, 2], [6, 2], [8, 4]],
        [[0, 2], [2, 2], [4, 4], [8, 4]],
        [[0, 6], [6, 2], [8, 2], [10, 2]],
        [[0, 4], [4, 4], [8, 2], [10, 2]],
      ],
      float: [
        [[0, 8], [8, 4]],
        [[0, 4], [4, 8]],
        [[0, 6], [6, 6]],
        [[4, 8]],
      ],
    },
  };
  const CADENCES = {
    4: [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]], [[0, 2], [2, 2], [4, 12]], [[0, 6], [6, 2], [8, 8]]],
    3: [[[0, 4], [4, 8]], [[0, 12]], [[0, 2], [2, 2], [4, 8]]],
  };
  // Contours in scale steps between successive notes of a cell.
  const SHAPES = [
    [1, 1, 1, -2, -1],
    [2, -1, 2, -1, -1],
    [-1, -1, 2, 1, -2],
    [1, 1, -1, -1, 1],
    [3, -1, -1, -1, 2],
    [-2, 1, 1, 1, -1],
    [2, 2, -1, -2, -1],
    [-1, 2, -1, 2, -3],
    [4, -1, -1, -2, 1],
  ];
  // Arpeggio orders over chord tones (0 root, 1 third, 2 fifth, 3 seventh, 4 octave).
  const ARPS = {
    4: [
      [0, 1, 2, 3, 4, 3, 2, 1],
      [0, 2, 1, 3, 2, 4, 3, 1],
      [0, 1, 2, 4, 2, 1, 3, 2],
      [0, 2, 4, 2, 1, 3, 4, 3],
      [4, 2, 3, 1, 2, 0, 1, 2],
      [0, 4, 2, 4, 1, 4, 3, 4],
    ],
    3: [
      [0, 1, 2, 4, 2, 1],
      [0, 2, 4, 2, 3, 2],
      [0, 2, 1, 3, 2, 4],
      [4, 2, 0, 2, 1, 2],
    ],
  };

  /* Each light-cycle phase: its mode and home tempo, the chord loops, and the
     pools that each piece draws its instruments, grooves and bass from. */
  const PHASES = {
    "朝": {
      mode: "lydian", bpm: 104, cells: "drive", waltz: 0.25,
      prog: [[0, 1, 5, 4], [0, 4, 1, 0], [0, 1, 3, 4], [0, 5, 1, 4], [3, 4, 0, 1], [0, 2, 1, 4]],
      leads: ["pulse", "flute", "bell", "pulse"], arps: ["chip", "pluck", "bell"], pads: ["chip", "organ", "glass"],
      grooves: ["light", "straight", "halftime", "none"], basses: ["pulse", "long", "walk"],
      arrs: ["build", "tuneFirst", "bridge", "journey", "interlude"],
      en: "Lydian", jp: "・リディア旋法",
    },
    "日": {
      mode: "major", bpm: 112, cells: "drive", waltz: 0.2,
      prog: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 5, 0], [0, 2, 3, 4], [0, 3, 4, 3], [0, 5, 1, 4], [3, 0, 4, 5], [0, 1, 3, 4]],
      leads: ["pulse", "pulse", "saw", "flute", "bell"], arps: ["chip", "pluck", "thin"], pads: ["chip", "organ"],
      grooves: ["straight", "shuffle", "halftime", "light"], basses: ["octave", "pulse", "walk"],
      arrs: ["build", "tuneFirst", "bridge", "journey", "build", "interlude"],
      en: "major", jp: "長調",
    },
    "黄昏": {
      mode: "dorian", bpm: 98, cells: "drive", waltz: 0.3,
      prog: [[0, 3, 0, 3], [0, 6, 3, 4], [5, 6, 0, 0], [0, 2, 3, 6], [0, 3, 6, 0], [3, 6, 0, 4], [0, 6, 5, 6]],
      leads: ["flute", "bell", "pulse", "saw"], arps: ["pluck", "bell", "chip"], pads: ["organ", "glass", "chip"],
      grooves: ["light", "halftime", "shuffle", "none"], basses: ["pulse", "long", "walk"],
      arrs: ["build", "tuneFirst", "bridge", "journey", "interlude"],
      en: "Dorian", jp: "・ドリア旋法",
    },
    "夜": {
      mode: "minor", bpm: 84, cells: "float", waltz: 0.3,
      prog: [[0, 5, 3, 6], [0, 5, 2, 6], [5, 3, 0, 4], [0, 3, 5, 4], [0, 6, 5, 4], [0, 2, 5, 6], [3, 0, 6, 5]],
      leads: ["bell", "flute", "flute", "pulse"], arps: ["bell", "pluck"], pads: ["glass", "organ"],
      grooves: ["none", "none", "light"], basses: ["long"],
      arrs: ["interlude", "tuneFirst", "build", "bridge"],
      en: "minor", jp: "短調",
    },
  };

  /* Arrangements: sections of whole 4-bar chord loops. Flags say which layers
     play; prog/tune "B" switches to the second theme; shift is a key change in
     semitones; sweep opens the arpeggio's filter across the section. */
  const ARRANGEMENTS = {
    // Arpeggio alone, layers stack up, breakdown, final pass.
    build: [
      { bars: 4, arp: 1, sweep: [1100, 3600] },
      { bars: 4, arp: 1, bass: 1, pad: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, counter: 1, drums: 1 },
      { bars: 4, arp: 1, pad: 1, sweep: [1000, 3600] },
      { bars: 4, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1, ending: 1 },
    ],
    // The tune straight away over pads, then the band, a quiet middle, and back.
    tuneFirst: [
      { bars: 4, pad: 1, mel: 1, arp: 1, arpSoft: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1 },
      { bars: 4, arp: 1, pad: 1, counter: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, counter: 1, drums: 1 },
      { bars: 4, arp: 1, bass: 1, pad: 1, mel: 1, ending: 1 },
    ],
    // A theme, a contrasting B theme on new chords, then A again.
    bridge: [
      { bars: 4, arp: 1, bass: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1, prog: "B", tune: "B" },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, counter: 1, drums: 1 },
      { bars: 4, arp: 1, bass: 1, pad: 1, mel: 1, ending: 1 },
    ],
    // Longer form that lifts into a new key for its second half.
    journey: [
      { bars: 4, arp: 1, sweep: [1100, 3600] },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1 },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1 },
      { bars: 4, arp: 1, pad: 1, sweep: [900, 3600], shift: "mod" },
      { bars: 8, arp: 1, bass: 1, pad: 1, mel: 1, counter: 1, drums: 1, shift: "mod" },
      { bars: 4, arp: 1, bass: 1, pad: 1, mel: 1, drums: 1, ending: 1, shift: "mod" },
    ],
    // Short and quiet: pads, a soft arpeggio, the tune once or twice, no drums.
    interlude: [
      { bars: 4, pad: 1, arp: 1, arpSoft: 1 },
      { bars: 8, pad: 1, arp: 1, arpSoft: 1, mel: 1, bass: 1 },
      { bars: 4, pad: 1, mel: 1, ending: 1 },
    ],
  };

  /* pH sets the key area. The CO2 cycle swings pH by most of a unit a day, so
     the music drifts through keys: lower while CO2 is on, climbing back
     overnight. Each piece sits on that key or a neighbour, so consecutive
     pieces don't all share one key. */
  const BASE_MIDI = 60;                               // C4
  const KEY_OFFSETS = [-3, -1, 0, 2, 4, 5, 7];        // A B C D E F G
  const DEFAULT_KEY = 2;                              // C, until pH arrives
  const PH_LO = 5.6, PH_HI = 7.4;
  const NOTE_EN = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const NOTE_JP = ["ハ", "変ニ", "ニ", "変ホ", "ホ", "ヘ", "嬰ヘ", "ト", "変イ", "イ", "変ロ", "ロ"];
  const FEEL = {
    en: { straight: "", shuffle: "shuffle", halftime: "half-time", light: "", none: "ambient", waltz: "waltz" },
    jp: { straight: "", shuffle: "シャッフル", halftime: "ハーフタイム", light: "", none: "アンビエント", waltz: "ワルツ" },
  };

  /* Lo-fi amounts per phase. cutoff: the muffler's corner in Hz (20 kHz is
     fully open); wow: tape wobble depth in seconds of delay swing;
     crackle: vinyl bed level; verb: reverb send (a little wetter at night). */
  const LOFI = {
    "朝":   { cutoff: 20000, wow: 0,       crackle: 0,     verb: 0.28 },
    "日":   { cutoff: 20000, wow: 0,       crackle: 0,     verb: 0.28 },
    "黄昏": { cutoff: 3800,  wow: 0.0004,  crackle: 0.25,  verb: 0.32 },
    "夜":   { cutoff: 1500,  wow: 0.0009,  crackle: 0.5,   verb: 0.36 },
  };

  /* Dissolved oxygen nudges tempo up to ±8 BPM around the phase's own. */
  const DO_LO = 20, DO_HI = 100, DO_MID = 60, BPM_SWING = 8;

  const LOOKAHEAD = 1.2;   // seconds of notes scheduled ahead; survives background-tab timer throttling
  const TICK = 0.2;
  const MEMORY = 3;        // how many recent pieces the chooser tries not to echo

  const UI = {
    en: {
      listen: "Listen", playing: "Listening",
      title: "Play retro-synth music composed live from the tank's sensors",
      unsupported: "Sound isn't supported in this browser",
      main: (key, mode, bpm, feel) => `♪ ${key} ${mode} · ${bpm} BPM${feel ? " · " + feel : ""}`,
      rest: "♪ between pieces — the next one is coming",
      map: "pH → key · O₂ → tempo · temp → tone · CO₂ → bubbles",
    },
    jp: {
      listen: "聴く", playing: "再生中",
      title: "水槽のセンサーからリアルタイムに作曲されるレトロシンセ音楽",
      unsupported: "このブラウザでは音声を再生できません",
      main: (key, mode, bpm, feel) => `♪ ${key}${mode} · ${bpm} BPM${feel ? " · " + feel : ""}`,
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
  const history = [];        // recent pieces' choices, newest last
  const timers = new Set();

  /* =======================================================================
     HELPERS
     ======================================================================= */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const mod7 = (i) => ((i % 7) + 7) % 7;
  const pc = (m) => ((Math.round(m) % 12) + 12) % 12;
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
  // Pick from a pool, avoiding anything the last few pieces used for this
  // choice, as long as something is left to pick.
  function pickFresh(pool, key, depth) {
    const recent = history.slice(-(depth || MEMORY)).map((h) => JSON.stringify(h[key]));
    const fresh = pool.filter((x) => !recent.includes(JSON.stringify(x)));
    return pick(fresh.length ? fresh : pool);
  }

  /* =======================================================================
     DERIVED PARAMETERS
     ======================================================================= */
  function keyIndexFor(ph, current) {
    if (ph == null) return current == null ? DEFAULT_KEY : current;
    const x = (clamp(ph, PH_LO, PH_HI) - PH_LO) / (PH_HI - PH_LO) * (KEY_OFFSETS.length - 1);
    if (current != null && Math.abs(x - current) < 0.8) return current;
    return Math.round(x);
  }
  // The pH key, or a neighbour; never the key of the last piece if avoidable.
  function chooseKey() {
    state.keyIdx = keyIndexFor(state.ph, state.keyIdx);
    const k = state.keyIdx;
    const pool = [k, k, k - 1, k + 1].filter((i) => i >= 0 && i < KEY_OFFSETS.length);
    const last = history.length ? history[history.length - 1].keyIdx : null;
    const fresh = pool.filter((i) => i !== last);
    return pick(fresh.length ? fresh : pool);
  }
  function chooseBpm(phase, meter) {
    const d = state.doPct == null ? DO_MID : clamp(state.doPct, DO_LO, DO_HI);
    const base = PHASES[phase].bpm + (d - DO_MID) / (DO_HI - DO_MID) * BPM_SWING;
    const last = history.length ? history[history.length - 1].bpm : null;
    let bpm = 0;
    for (let tries = 0; tries < 4; tries++) {
      bpm = Math.round(base * rand(0.92, 1.08) * (meter === 3 ? 0.9 : 1));
      if (last == null || Math.abs(bpm - last) >= 5) break;
    }
    return bpm;
  }
  // Glide the lo-fi stage to the current phase: over a few seconds normally,
  // instantly on start so night never opens with a bright first bar.
  function applyLofi(immediate) {
    if (!ctx || !nodes) return;
    const L = LOFI[state.phase];
    const t = ctx.currentTime;
    const tc = immediate ? 0.01 : 3;           // ~10 s to settle on a phase change
    nodes.muffle1.frequency.setTargetAtTime(L.cutoff, t, tc);
    nodes.muffle2.frequency.setTargetAtTime(Math.min(L.cutoff * 1.15, 20000), t, tc);
    nodes.wowDepth.gain.setTargetAtTime(L.wow, t, tc);
    nodes.crackleGain.gain.setTargetAtTime(L.crackle * 0.12, t, tc);
    nodes.wet.gain.setTargetAtTime(L.verb, t, tc);
  }

  // Pulse width follows temperature: 12.5% (thin, cool) -> 25% -> 50% (round, warm).
  function pulseForTemp() {
    const t = state.tempF == null ? 72 : state.tempF;
    return t < 70.5 ? waves.p12 : t < 74.5 ? waves.p25 : waves.p50;
  }

  /* =======================================================================
     WAVEFORMS
     Built from their Fourier series with a harmonic cap: enough for the chip
     character, few enough that high notes don't alias.
     ======================================================================= */
  function waveFrom(fn, H) {
    H = H || 40;
    const L = 1024;
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
    const TAU = 2 * Math.PI;
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
      sine: waveFrom((p) => Math.sin(TAU * p), 2),
      saw: waveFrom((p) => 1 - 2 * p, 14),                   // capped low: mellow, brassy
      organ: waveFrom((p) => Math.sin(TAU * p) + 0.55 * Math.sin(2 * TAU * p)
        + 0.3 * Math.sin(3 * TAU * p) + 0.15 * Math.sin(4 * TAU * p), 6),
    };
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  // Vinyl: near-silence with sparse clicks of random size, over faint hiss.
  function crackleBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.035;
    const clicks = Math.floor(seconds * 9);
    for (let c = 0; c < clicks; c++) {
      const at = Math.floor(Math.random() * (len - 60));
      const amp = (Math.random() < 0.15 ? 1 : 0.35) * (Math.random() < 0.5 ? -1 : 1) * Math.random();
      for (let k = 0; k < 40; k++) d[at + k] += amp * Math.exp(-k / 6);
    }
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

  /* =======================================================================
     MIXER
     arp -> its own sweepable lowpass; pad -> its own lowpass
     lead, arp, counter -> echo send
     everything -> mix -> soft lowpass -> dry + reverb -> master -> limiter
     ======================================================================= */
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

    /* Lo-fi stage: a slow tape wobble, then two stacked lowpasses (24 dB/oct,
       so the top really goes rather than just dimming). Wide open by day;
       at twilight and night it closes down to a muffled, late-night sound.
       LOFI below sets the amounts per phase; applyLofi() glides between them. */
    const wobble = ctx.createDelay(0.1);
    wobble.delayTime.value = 0.012;
    const wowLfo = ctx.createOscillator();
    wowLfo.frequency.value = 0.55;
    const wowDepth = ctx.createGain();
    wowDepth.gain.value = 0;
    chain(wowLfo, wowDepth, wobble.delayTime);
    wowLfo.start();
    const muffle1 = ctx.createBiquadFilter();
    muffle1.type = "lowpass";
    muffle1.frequency.value = 20000;
    muffle1.Q.value = 0.707;              // Butterworth: flat until the corner, so day stays untouched
    const muffle2 = ctx.createBiquadFilter();
    muffle2.type = "lowpass";
    muffle2.frequency.value = 20000;
    muffle2.Q.value = 0.707;

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(2.8, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    chain(soften, wobble, muffle1, muffle2);
    chain(muffle2, dry, master);
    chain(muffle2, verb, wet, master);

    // Vinyl bed: sparse crackle and a little hiss, mixed in after the muffler.
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer(7);
    crackle.loop = true;
    const crackleTone = ctx.createBiquadFilter();
    crackleTone.type = "bandpass";
    crackleTone.frequency.value = 2400;
    crackleTone.Q.value = 0.4;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0;
    chain(crackle, crackleTone, crackleGain, master);
    crackle.start();

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

    const arpFilter = ctx.createBiquadFilter();
    arpFilter.type = "lowpass";
    arpFilter.frequency.value = 3600;
    arpFilter.Q.value = 4;
    arpFilter.connect(mix);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1500;
    padFilter.Q.value = 0.5;
    padFilter.connect(mix);

    nodes = {
      master, limiter, echo, arpFilter,
      muffle1, muffle2, wowDepth, crackleGain, wet,
      lead: bus(0.7), counter: bus(0.8), arp: bus(0.5, arpFilter),
      pad: bus(0, padFilter), bass: bus(0), drums: bus(0), fx: bus(1),
      noise: noiseBuffer(1),
    };
  }

  /* =======================================================================
     INSTRUMENTS
     ======================================================================= */

  // One voice with a simple volume envelope and optional delayed vibrato.
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
      lfo.frequency.value = opt.vibRate || 5.2;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.2);
      depth.gain.linearRampToValueAtTime(f * (opt.vibDepth || 0.006), t + 0.5);
      chain(lfo, depth, o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + rel * 8);
    }
    o.start(t);
    o.stop(t + dur + rel * 8);
    o.onended = () => g.disconnect();
  }

  // Bell: a sine with a quick inharmonic partial on the strike.
  function bellNote(dest, midi, t, dur, vel) {
    voice(waves.sine, dest, midi, t, dur, vel, { sustain: 0.3, decay: 0.35, release: 0.45 });
    voice(waves.sine, dest, midi + 12, t, dur * 0.5, vel * 0.25, { sustain: 0.1, decay: 0.2, release: 0.3 });
    voice(waves.sine, dest, midi + 17.57, t, 0.05, vel * 0.3, { sustain: 0.01, decay: 0.1, release: 0.12 });
  }

  // Lead instruments.
  const LEAD_VOICES = {
    pulse: (m, t, d, v) => {
      const w = pulseForTemp();
      const o = { vibrato: true, sustain: 0.75, release: 0.08 };
      voice(w, nodes.lead, m, t, d, v, Object.assign({ detune: -5 }, o));
      voice(w, nodes.lead, m, t, d, v * 0.7, Object.assign({ detune: 6 }, o));
    },
    flute: (m, t, d, v) => {
      voice(waves.tri, nodes.lead, m, t, d, v * 1.7, { attack: 0.04, sustain: 0.85, release: 0.12, vibrato: true, vibDepth: 0.008 });
    },
    bell: (m, t, d, v) => bellNote(nodes.lead, m, t, d, v * 1.6),
    saw: (m, t, d, v) => {
      voice(waves.saw, nodes.lead, m, t, d, v * 0.8, { attack: 0.015, sustain: 0.7, release: 0.1, vibrato: true, detune: -4 });
      voice(waves.saw, nodes.lead, m - 12, t, d, v * 0.3, { attack: 0.015, sustain: 0.7, release: 0.1, detune: 4 });
    },
  };
  const ARP_VOICES = {
    chip: (m, t, d, v) => voice(waves.p25, nodes.arp, m, t, d, v, { sustain: 0.25, decay: 0.06, release: 0.03 }),
    thin: (m, t, d, v) => voice(waves.p12, nodes.arp, m, t, d, v * 0.9, { sustain: 0.25, decay: 0.06, release: 0.03 }),
    pluck: (m, t, d, v) => voice(waves.tri, nodes.arp, m, t, d, v * 2, { sustain: 0.1, decay: 0.09, release: 0.05 }),
    bell: (m, t, d, v) => voice(waves.sine, nodes.arp, m + 12, t, d, v * 1.8, { sustain: 0.15, decay: 0.15, release: 0.2 }),
  };
  const PAD_VOICES = {
    chip: (m, t, d, v) => {
      voice(waves.p50, nodes.pad, m, t, d, v, { attack: 0.35, sustain: 0.9, decay: 0.5, release: 0.5, detune: -7 });
      voice(waves.p50, nodes.pad, m, t, d, v, { attack: 0.35, sustain: 0.9, decay: 0.5, release: 0.5, detune: 7 });
    },
    organ: (m, t, d, v) => voice(waves.organ, nodes.pad, m, t, d, v * 2.2, { attack: 0.08, sustain: 0.95, decay: 0.3, release: 0.25 }),
    glass: (m, t, d, v) => {
      voice(waves.tri, nodes.pad, m + 12, t, d, v * 1.4, { attack: 0.5, sustain: 0.9, decay: 0.6, release: 0.8, detune: -6 });
      voice(waves.sine, nodes.pad, m, t, d, v * 1.6, { attack: 0.5, sustain: 0.9, decay: 0.6, release: 0.8, detune: 6 });
    },
  };

  function kick(t, vel) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(waves.tri);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel || 0.28, t);
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
  const snare = (t, vel) => noiseHit(t, vel || 0.07, "bandpass", 1900, 0.13);

  // CO2 bubble: a two-step upward blip, in the key of whatever is playing.
  function bubble(t) {
    const p = piece || lastPiece;
    const root = p ? p.rootNow : BASE_MIDI;
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

  /* =======================================================================
     COMPOSER
     Melodies live in scale-index space (7 = the octave above the key root).
     A tune is four bars: one rhythm cell and one contour stated on each of
     the first three chords (so it sequences with the harmony), then a
     cadence. Its "answer" turns the contour upside down for bars two and
     three, so a repeat can be varied without losing the tune.
     ======================================================================= */

  function idxToMidi(root, mode, i) {
    return root + 12 * Math.floor(i / 7) + mode[mod7(i)];
  }
  function snapToChord(i, deg) {
    const tones = [mod7(deg), mod7(deg + 2), mod7(deg + 4)];
    if (tones.includes(mod7(i))) return i;
    for (let d = 1; d <= 3; d++) {
      if (tones.includes(mod7(i + d))) return i + d;
      if (tones.includes(mod7(i - d))) return i - d;
    }
    return i;
  }

  const MEL_LO = 5, MEL_HI = 14;

  function writeBars(cell, shape, anchor, prog) {
    const bars = [];
    for (let b = 0; b < 3; b++) {
      const deg = prog[b];
      let idx = snapToChord(anchor, deg);
      bars.push(cell.map(([s, l], n) => {
        if (n > 0) {
          let step = shape[(n - 1) % shape.length];
          if (idx + step > MEL_HI || idx + step < MEL_LO) step = -step;
          idx += step;
          if (s % 8 === 0) idx = snapToChord(idx, deg);   // strong beats sit on the chord
        }
        return { s, l, idx };
      }));
    }
    return bars;
  }

  function writeTune(P, prog, meter, avoidCell) {
    const pool = CELLS[meter][P.cells];
    const cells = pool.filter((c) => c !== avoidCell);
    const cell = pick(cells.length ? cells : pool);
    const shape = pick(SHAPES);
    const anchor = pick([8, 9, 10]);
    const bars = writeBars(cell, shape, anchor, prog);
    const answer = writeBars(cell, shape.map((x) => -x), anchor, prog);
    const cad = pick(CADENCES[meter]);
    const cadence = (target) => cad.map(([s, l], n) => ({ s, l, idx: target + (cad.length - 1 - n) }));
    return {
      cell, bars, answer,
      open: cadence(snapToChord(anchor - 1, prog[3])),   // leads back in
      home: cadence(7),                                   // resolves to the key note
    };
  }

  function composeChoices() {
    const phaseKey = state.phase;
    const P = PHASES[phaseKey];
    const meter = Math.random() < P.waltz ? 3 : 4;
    let groove = pickFresh(P.grooves, "groove", 1);
    if (meter === 3) groove = groove === "none" ? "none" : "waltz";
    const arrName = pickFresh(P.arrs, "arr");
    let bassStyle = pickFresh(P.basses, "bass", 1);
    if (groove === "none" && bassStyle !== "long" && Math.random() < 0.6) bassStyle = "long";
    return {
      phaseKey, meter, groove, arrName, bassStyle,
      lead: pickFresh(P.leads, "lead", 1),
      arpVoice: pickFresh(P.arps, "arpVoice", 1),
      padVoice: pickFresh(P.pads, "padVoice", 1),
      progA: pickFresh(P.prog, "progA"),
      arpOrder: pick(ARPS[meter]),
      // 16th-note arpeggios drive; shuffle, waltz and night want eighths.
      arp16: P.cells === "drive" && groove !== "shuffle" && meter === 4 && Math.random() < 0.8,
      varyRepeat: Math.random() < 0.6,
      keyIdx: chooseKey(),
      modShift: pick([2, 5, -3, 3]),
    };
  }

  function compose(t0) {
    const c = composeChoices();
    const P = PHASES[c.phaseKey];
    const mode = MODES[P.mode];
    const root0 = BASE_MIDI + KEY_OFFSETS[c.keyIdx];
    const bpm = chooseBpm(c.phaseKey, c.meter);
    const beat = 60 / bpm;
    const slots = c.meter * 4;                     // sixteenths per bar
    const bar = beat * c.meter;
    const s16 = beat / 4;
    const swing = c.groove === "shuffle";
    // Swung eighths land two-thirds of the way through the beat, not halfway.
    const at = (barT, slot) => barT + slot * s16 + (swing && slot % 4 === 2 ? beat / 6 : 0);

    const progB = pick(P.prog.filter((p) => p !== c.progA));
    const tuneA = writeTune(P, c.progA, c.meter);
    const tuneB = writeTune(P, progB, c.meter, tuneA.cell);
    const sections = ARRANGEMENTS[c.arrName];
    const events = [];
    const add = (ev) => events.push(ev);

    nodes.echo.delayTime.setValueAtTime(beat * 0.75, t0);        // dotted eighth
    const af = nodes.arpFilter.frequency;
    af.cancelScheduledValues(t0);
    af.setValueAtTime(3600, t0);

    let barNo = 0;
    let shiftAt = null;
    sections.forEach((sec) => {
      const secT = t0 + barNo * bar;
      const shift = sec.shift === "mod" ? c.modShift : 0;
      if (shift && shiftAt == null) shiftAt = secT;
      const root = root0 + shift;
      const prog = sec.prog === "B" ? progB : c.progA;
      const tune = sec.tune === "B" ? tuneB : tuneA;
      if (sec.sweep) {
        af.setValueAtTime(sec.sweep[0], secT);
        af.exponentialRampToValueAtTime(sec.sweep[1], secT + sec.bars * bar);
      }

      for (let b = 0; b < sec.bars; b++) {
        const barT = t0 + (barNo + b) * bar;
        const inLoop = b % 4;
        const lastBar = sec.ending && b === sec.bars - 1;
        const deg = lastBar ? 0 : prog[inLoop];
        const nextDeg = lastBar ? 0 : prog[(inLoop + 1) % 4];

        // Arpeggio.
        if (sec.arp) {
          const tones = [0, 2, 4, 6, 7].map((k) => idxToMidi(root - 12, mode, deg + k) + (deg >= 4 ? 0 : 12));
          const step = c.arp16 ? 1 : 2;
          const soft = sec.arpSoft ? 0.6 : sec.bass ? 1 : 1.8;   // carries intros alone
          for (let s = 0, n = 0; s < slots; s += step, n++) {
            if (lastBar && s >= slots / 2) break;
            const accent = s % 4 === 0 ? 1.25 : 1;
            add({ t: at(barT, s), dur: s16 * step * 0.8, v: "arp", m: tones[c.arpOrder[n % c.arpOrder.length]], vel: 0.04 * accent * soft });
          }
        }

        // Bass.
        if (sec.bass) {
          let r = idxToMidi(root - 24, mode, deg);
          if (r < root - 22) r += 12;
          if (c.bassStyle === "long" || lastBar) {
            if (c.meter === 3 || lastBar) {
              add({ t: barT, dur: bar * 0.95, v: "bass", m: r, vel: 0.2 });
            } else {
              add({ t: barT, dur: 8 * s16 * 0.95, v: "bass", m: r, vel: 0.2 });
              add({ t: barT + 8 * s16, dur: 8 * s16 * 0.95, v: "bass", m: r + 7, vel: 0.17 });
            }
          } else if (c.bassStyle === "walk") {
            // Quarter notes through the chord, stepping into the next root.
            const tones = [deg, deg + 2, deg + 4];
            for (let q = 0; q < c.meter; q++) {
              const idx = q === c.meter - 1 ? nextDeg - 1 : tones[q % 3];
              let m = idxToMidi(root - 24, mode, idx);
              if (m < root - 22) m += 12;
              add({ t: at(barT, q * 4), dur: 4 * s16 * 0.85, v: "bass", m, vel: q === 0 ? 0.2 : 0.16 });
            }
          } else {
            for (let e = 0; e < slots / 2; e++) {
              const up = c.bassStyle === "octave" && e % 2 === 1;
              add({ t: at(barT, e * 2), dur: 2 * s16 * 0.7, v: "bass", m: r + (up ? 12 : 0), vel: e % 2 ? 0.14 : 0.19 });
            }
          }
        }

        // Pad.
        if (sec.pad) {
          [0, 2, 4, 6].forEach((k) => {
            const m = idxToMidi(root - 12, mode, deg + k) + (deg >= 3 ? 0 : 12);
            add({ t: barT, dur: bar * (lastBar ? 1.6 : 0.98), v: "pad", m, vel: 0.017 });
          });
        }

        // Melody: the tune (or its answer on a varied repeat), with the open
        // ending the first time and the home ending the second.
        if (sec.mel) {
          const second = Math.floor(b / 4) % 2 === 1;
          let notes;
          if (lastBar) notes = [{ s: 0, l: slots, idx: 7 }];
          else if (inLoop < 3) notes = (second && c.varyRepeat && inLoop > 0) ? tune.answer[inLoop] : tune.bars[inLoop];
          else notes = second ? tune.home : tune.open;
          notes.forEach((n) => add({
            t: at(barT, n.s), dur: n.l * s16 * 0.9, v: "lead",
            m: idxToMidi(root, mode, n.idx), vel: 0.075,
          }));
        }

        // Counter-line: a long tone a register above, answering the tune.
        if (sec.counter) {
          const hi = snapToChord(15, deg);
          add({ t: barT + (slots / 2) * s16, dur: (slots / 2) * s16 * 0.9, v: "counter", m: idxToMidi(root, mode, hi), vel: 0.03 });
        }

        // Drums.
        if (sec.drums && c.groove !== "none" && !lastBar) {
          for (let s = 0; s < slots; s += 2) {
            const t = at(barT, s);
            switch (c.groove) {
              case "straight":
                if (s === 0 || s === 8 || (s === 10 && b % 2)) add({ t, v: "kick" });
                if (s === 4 || s === 12) add({ t, v: "snare" });
                add({ t, v: "hat", vel: s % 4 === 2 ? 0.035 : 0.015 });
                break;
              case "shuffle":
                if (s === 0 || s === 8) add({ t, v: "kick" });
                if (s === 4 || s === 12) add({ t, v: "snare", vel: 0.06 });
                add({ t, v: "hat", vel: s % 4 === 2 ? 0.03 : 0.02 });
                break;
              case "halftime":
                if (s === 0 || (s === 6 && b % 2)) add({ t, v: "kick" });
                if (s === 8) add({ t, v: "snare" });
                add({ t, v: "hat", vel: s % 4 === 2 ? 0.03 : 0.012 });
                break;
              case "waltz":
                if (s === 0) add({ t, v: "kick", vel: 0.24 });
                if (s === 4 || s === 8) add({ t, v: "hat", vel: 0.03 });
                if (s === 8 && b % 2) add({ t, v: "snare", vel: 0.04 });
                break;
              case "light":
                if (s % 4 === 2) add({ t, v: "hat", vel: 0.03 });
                break;
            }
          }
        }
      }
      barNo += sec.bars;
    });

    events.sort((a, b) => a.t - b.t);
    const end = t0 + barNo * bar + 2.5;       // let echo and reverb ring out
    const summary = {
      arr: c.arrName, groove: c.groove, bass: c.bassStyle, lead: c.lead, arpVoice: c.arpVoice,
      padVoice: c.padVoice, progA: c.progA, keyIdx: c.keyIdx, bpm, meter: c.meter,
    };
    history.push(summary);
    if (history.length > 8) history.shift();
    return {
      events, i: 0, end, bpm, modeName: P.mode, phaseKey: c.phaseKey,
      root: root0, rootNow: root0, shiftAt, shift: c.modShift,
      lead: c.lead, arpVoice: c.arpVoice, padVoice: c.padVoice,
      feel: c.meter === 3 ? "waltz" : c.groove, summary,
    };
  }

  function play(ev) {
    switch (ev.v) {
      case "lead": LEAD_VOICES[piece.lead](ev.m, ev.t, ev.dur, ev.vel); break;
      case "arp": ARP_VOICES[piece.arpVoice](ev.m, ev.t, ev.dur, ev.vel); break;
      case "pad": PAD_VOICES[piece.padVoice](ev.m, ev.t, ev.dur, ev.vel); break;
      case "counter":
        voice(waves.p50, nodes.counter, ev.m, ev.t, ev.dur, ev.vel, { vibrato: true, attack: 0.08, sustain: 0.8, release: 0.2 });
        break;
      case "bass":
        voice(waves.tri, nodes.bass, ev.m, ev.t, ev.dur, ev.vel, { sustain: 0.85, decay: 0.2, release: 0.04 });
        break;
      case "kick": kick(ev.t, ev.vel); break;
      case "snare": snare(ev.t, ev.vel); break;
      case "hat": hat(ev.t, ev.vel); break;
    }
  }

  /* =======================================================================
     SCHEDULER
     ======================================================================= */
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
      // A journey piece changes key partway: update the status line when it does.
      if (piece.shiftAt != null && piece.rootNow === piece.root && now >= piece.shiftAt) {
        piece.rootNow = piece.root + piece.shift;
        render();
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

  /* =======================================================================
     START / STOP
     ======================================================================= */
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
    applyLofi(true);
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

  /* =======================================================================
     UI
     ======================================================================= */
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
        const k = pc(piece.rootNow);
        const jp = state.lang === "jp";
        statusMain.textContent = u.main(jp ? NOTE_JP[k] : NOTE_EN[k], jp ? P.jp : P.en, piece.bpm,
          FEEL[jp ? "jp" : "en"][piece.feel]);
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

  /* =======================================================================
     PUBLIC API
     ======================================================================= */
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
      if (running && changed) {
        jingle(ctx.currentTime + 0.1);
        applyLofi(false);                    // the muffler eases in or out with the light
      }
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
    _history: () => history.slice(),
    // Compose without playing, to audit variety. Needs start() first.
    _dryCompose: () => {
      const t0 = ctx.currentTime + 1000;
      const p = compose(t0);
      const ms = p.events.filter((e) => e.m != null).map((e) => e.m);
      const bad = p.events.filter((e) => !Number.isFinite(e.t) || (e.m != null && !Number.isFinite(e.m))).length;
      return Object.assign({}, p.summary, {
        seconds: Math.round(p.end - t0), notes: p.events.length, bad,
        lo: Math.min.apply(null, ms), hi: Math.max.apply(null, ms),
        leadNotes: p.events.filter((e) => e.v === "lead").length,
      });
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
