/* =======================
   ELYSIUM SOUNDSCAPE
   Generated 8-bit music, composed live from the tank's own telemetry.

   Every few minutes the tank "writes" a short piece in the style of a gentle
   game soundtrack: NES-style voices (two pulse waves, a stepped triangle bass,
   a noise channel) played through echo and reverb. Each piece has a chord
   progression, a melody motif that returns, and a cadence home; then a short
   rest, then a new piece. Nothing is prerecorded and every melody is new, so
   there are no audio files to host and nothing to license.

     time of day (朝 日 黄昏 夜)  -> mode, groove and instruments
     pH                           -> key of the next piece
     dissolved oxygen %           -> tempo
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

  // Rhythm templates: one bar of eighth-note slots, as [start, length] pairs.
  const RHYTHMS = {
    busy: [
      [[0, 2], [2, 1], [3, 1], [4, 4]],
      [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]],
      [[0, 3], [3, 1], [4, 2], [6, 2]],
      [[0, 2], [2, 2], [4, 3], [7, 1]],
    ],
    calm: [
      [[0, 4], [4, 4]],
      [[0, 3], [3, 1], [4, 4]],
      [[0, 2], [2, 2], [4, 4]],
      [[2, 2], [4, 4]],
      [[0, 6], [6, 2]],
    ],
    sparse: [
      [[0, 8]],
      [[0, 4], [4, 4]],
      [[0, 6], [6, 2]],
      [[2, 6]],
    ],
  };

  /* Each light-cycle phase is its own little soundtrack cue.
     prog: 4-bar chord progressions as scale degrees (0 = I/i).
     arp:  broken-chord pattern over 8 slots (chord-tone index, or null = rest).
     bass: [slot, length, scale steps above the chord root].
     drums: "day" = soft kick + offbeat ticks, "light" = ticks on 2 and 4. */
  const PHASES = {
    "朝": {
      mode: "lydian", tempo: 1.0, rhythms: ["calm", "calm", "busy"],
      prog: [[0, 1, 0, 4], [0, 1, 5, 4], [0, 3, 1, 4]],
      arp: [0, 2, 4, 2, 1, 2, 4, 2], arpVel: 0.05,
      bass: [[0, 4, 0], [4, 4, 4]], drums: "light",
      en: "Lydian", jp: "・リディア旋法",
    },
    "日": {
      mode: "major", tempo: 1.08, rhythms: ["busy", "busy", "calm"],
      prog: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5], [0, 2, 3, 4]],
      arp: [0, 1, 2, 3, 4, 3, 2, 1], arpVel: 0.05,
      bass: [[0, 3, 0], [3, 1, 0], [4, 4, 4]], drums: "day",
      en: "major", jp: "長調",
    },
    "黄昏": {
      mode: "dorian", tempo: 0.92, rhythms: ["calm", "calm", "sparse"],
      prog: [[0, 3, 0, 3], [0, 6, 3, 4], [5, 6, 0, 0], [0, 2, 3, 6]],
      arp: [0, 1, 2, 1, 3, 1, 2, 1], arpVel: 0.045,
      bass: [[0, 6, 0], [6, 2, 4]], drums: null,
      en: "Dorian", jp: "・ドリア旋法",
    },
    "夜": {
      mode: "minor", tempo: 0.8, rhythms: ["sparse", "sparse", "calm"],
      prog: [[0, 5, 3, 6], [0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 6]],
      arp: [0, null, 2, null, 4, null, 2, null], arpVel: 0.04,
      bass: [[0, 8, 0]], drums: null,
      en: "minor", jp: "短調",
    },
  };

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

  /* Dissolved oxygen sets tempo: a well-oxygenated tank plays a little quicker. */
  const DO_LO = 20, DO_HI = 100, BPM_SLOW = 64, BPM_FAST = 100;

  const LOOKAHEAD = 1.2;   // seconds of notes scheduled ahead; survives background-tab timer throttling
  const TICK = 0.2;

  const UI = {
    en: {
      listen: "Listen", playing: "Listening",
      title: "Play 8-bit music composed live from the tank's sensors",
      unsupported: "Sound isn't supported in this browser",
      main: (key, mode, bpm) => `♪ ${key} ${mode} · ${bpm} BPM`,
      rest: "♪ between pieces — the next one is coming",
      map: "pH → key · O₂ → tempo · temp → tone · CO₂ → bubbles",
    },
    jp: {
      listen: "聴く", playing: "再生中",
      title: "水槽のセンサーからリアルタイムに作曲される8ビット音楽",
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
  let lastPiece = null;      // for the status line while resting
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
    const d = state.doPct == null ? 60 : clamp(state.doPct, DO_LO, DO_HI);
    const bpm = BPM_SLOW + (d - DO_LO) / (DO_HI - DO_LO) * (BPM_FAST - BPM_SLOW);
    return Math.round(bpm * PHASES[phase].tempo);
  }
  // Pulse width follows temperature: 12.5% (thin, cool) -> 25% -> 50% (round, warm).
  function leadWave() {
    const t = state.tempF == null ? 72 : state.tempF;
    return t < 70.5 ? waves.p12 : t < 74.5 ? waves.p25 : waves.p50;
  }

  /* ---------- NES-style waveforms ----------
     Built from their Fourier series, capped at 40 harmonics: enough for the
     buzzy chip character, few enough that high notes don't alias. */
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
     lead, arp -> echo send
     all voices -> mix -> soft lowpass -> dry + reverb -> master -> limiter */
  function build() {
    ctx = new AC();
    buildWaves();

    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.3;
    chain(master, limiter, ctx.destination);

    // Square waves are bright; a gentle lowpass takes the edge off without losing the chip.
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 6500;
    soften.Q.value = 0.2;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(3, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    chain(soften, dry, master);
    chain(soften, verb, wet, master);

    const mix = ctx.createGain();
    mix.connect(soften);

    // Echo: a dotted-eighth delay with a darkening feedback loop.
    const echo = ctx.createDelay(3);
    echo.delayTime.value = 0.45;
    const fb = ctx.createGain();
    fb.gain.value = 0.33;
    const fbTone = ctx.createBiquadFilter();
    fbTone.type = "lowpass";
    fbTone.frequency.value = 2400;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    chain(echo, fbTone, fb, echo);
    chain(echo, echoOut, mix);

    const bus = (echoSend) => {
      const g = ctx.createGain();
      g.connect(mix);
      if (echoSend) {
        const s = ctx.createGain();
        s.gain.value = echoSend;
        chain(g, s, echo);
      }
      return g;
    };

    nodes = {
      master, limiter, echo,
      lead: bus(0.8), arp: bus(1), bass: bus(0), drums: bus(0), fx: bus(1),
      noise: noiseBuffer(1),
    };
  }

  /* ---------- instruments ---------- */

  // One chip voice with a NES-ish volume envelope and optional delayed vibrato.
  function voice(wave, dest, midi, t, dur, vel, opt) {
    opt = opt || {};
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    const sus = opt.sustain == null ? 0.65 : opt.sustain;
    const rel = opt.release || 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.setTargetAtTime(vel * sus, t + 0.006, opt.decay || 0.12);
    g.gain.setTargetAtTime(0.0001, t + dur, rel);
    chain(o, g, dest);
    let lfo = null;
    if (opt.vibrato && dur > 0.4) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.007, t + 0.45);
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
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    chain(o, g, nodes.drums);
    o.start(t);
    o.stop(t + 0.22);
  }

  function tick(t, vel) {
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    chain(src, hp, g, nodes.drums);
    src.start(t, Math.random() * 0.9);
    src.stop(t + 0.06);
  }

  // CO2 bubble: a two-step upward blip, the classic game "pop", in key.
  function bubble(t) {
    const p = piece || lastPiece;
    const root = p ? p.root : BASE_MIDI;
    const mode = MODES[p ? p.modeName : "major"];
    const deg = pick([0, 2, 4, 4, 7, 9]);
    const midi = root + 24 + mode[mod7(deg)] + (deg >= 7 ? 12 : 0);
    voice(waves.p12, nodes.fx, midi, t, 0.03, 0.022, { sustain: 1, release: 0.01 });
    voice(waves.p12, nodes.fx, midi + 12, t + 0.035, 0.04, 0.018, { sustain: 1, release: 0.015 });
  }

  // Jingle: the tonic chord rolled upward, last note held. Marks start-up and
  // each change of the light cycle.
  function jingle(t) {
    const root = BASE_MIDI + KEY_OFFSETS[state.keyIdx == null ? DEFAULT_KEY : state.keyIdx];
    const mode = MODES[PHASES[state.phase].mode];
    const notes = [0, 2, 4, 7].map((i) => root + 12 + mode[mod7(i)] + (i >= 7 ? 12 : 0));
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      voice(waves.p25, nodes.lead, m, t + i * 0.09, last ? 0.7 : 0.08, 0.08,
        { vibrato: last, sustain: last ? 0.7 : 1, release: last ? 0.2 : 0.02 });
    });
  }

  /* ---------- the composer ----------
     A piece is 16 bars: intro (arp + bass), A (motif), B (answering motif),
     A again ending on the tonic. Melodies live in scale-step space; notes on
     the strong beats are snapped to the current chord, so the same motif
     re-fits itself to each chord it lands on. */

  function idxToMidi(root, mode, i) {
    return root + 12 * Math.floor(i / 7) + mode[mod7(i)];
  }
  function snapToChord(i, deg) {
    const tones = [mod7(deg), mod7(deg + 2), mod7(deg + 4)];
    for (let d = 0; d <= 3; d++) {
      if (tones.includes(mod7(i + d))) return i + d;
      if (tones.includes(mod7(i - d))) return i - d;
    }
    return i;
  }

  function makeMotifBar(P) {
    const rhythm = pick(RHYTHMS[pick(P.rhythms)]);
    const steps = [-2, -1, -1, 1, 1, 2, 0, 3, -3];
    return rhythm.map(([s, l], n) => ({
      s, l,
      step: n === 0 ? pick([-1, 0, 1]) : pick(steps),
      strong: s % 4 === 0,
    }));
  }
  function makeMotif(P) {
    return { bars: [makeMotifBar(P), makeMotifBar(P)], answer: makeMotifBar(P) };
  }

  const LEAD_LO = 5, LEAD_HI = 13;       // scale indices above the key root

  function compose(t0) {
    const phaseKey = state.phase;
    const P = PHASES[phaseKey];
    const mode = MODES[P.mode];
    state.keyIdx = keyIndexFor(state.ph, state.keyIdx);
    const root = BASE_MIDI + KEY_OFFSETS[state.keyIdx];
    const bpm = bpmFor(phaseKey);
    const beat = 60 / bpm;
    const bar = beat * 4;
    const e8 = beat / 2;
    const prog = pick(P.prog);
    const A = makeMotif(P);
    const B = makeMotif(P);
    const events = [];
    const add = (ev) => events.push(ev);

    const sections = ["intro", "A", "B", "end"];
    let lead = 9;

    sections.forEach((sec, si) => {
      const motif = sec === "B" ? B : A;
      // Each statement of a motif starts from the same place, so it is heard as a
      // return rather than a wander; B answers a third higher.
      const startIdx = sec === "B" ? 11 : 9;
      for (let b = 0; b < 4; b++) {
        const barT = t0 + (si * 4 + b) * bar;
        const final = sec === "end" && b === 3;
        const deg = final ? 0 : prog[b];

        // Bass: triangle, chord root (and fifth) in the octave below the key.
        P.bass.forEach(([s, l, step]) => {
          if (final && s > 0) return;
          let m = idxToMidi(root - 12, mode, deg + step);
          if (m > root - 2) m -= 12;
          add({ t: barT + s * e8, dur: (final ? 8 : l) * e8 * 0.9, v: "bass", m, vel: 0.2 });
        });

        // Arp: quiet 50% pulse broken chord, the chiptune shimmer under everything.
        const chordTones = [0, 2, 4, 6, 7].map((k) => idxToMidi(root - 12, mode, deg + k) + (deg >= 4 ? 0 : 12));
        P.arp.forEach((ci, s) => {
          if (ci == null || (final && s > 3)) return;
          const vel = P.arpVel * (sec === "intro" ? 1.25 : 1);
          add({ t: barT + s * e8, dur: e8 * 0.7, v: "arp", m: chordTones[ci], vel });
        });

        // Drums, only once the tune is going.
        if (P.drums && sec !== "intro" && !final) {
          for (let s = 0; s < 8; s++) {
            if (P.drums === "day") {
              if (s === 0 || (s === 4 && b % 2 === 1)) add({ t: barT + s * e8, v: "kick" });
              if (s % 2 === 1) add({ t: barT + s * e8, v: "tick", vel: 0.035 });
            } else if (s === 2 || s === 6) {
              add({ t: barT + s * e8, v: "tick", vel: 0.03 });
            }
          }
        }

        // Melody.
        if (sec === "intro") continue;
        if (b % 2 === 0) lead = snapToChord(startIdx, deg);
        let notes;
        if (final) {
          // Cadence: home to the tonic, held with vibrato.
          const home = [7, 14].reduce((a, c) => (Math.abs(c - lead) < Math.abs(a - lead) ? c : a), 7);
          notes = [{ s: 0, l: 8, idx: home }];
        } else {
          const src = b === 3 ? motif.answer : motif.bars[b % 2];
          notes = src.map((n) => {
            lead += n.step;
            if (lead > LEAD_HI) lead -= 2;
            if (lead < LEAD_LO) lead += 2;
            if (n.strong) lead = snapToChord(lead, deg);
            return { s: n.s, l: n.l, idx: lead };
          });
        }
        notes.forEach((n) => {
          add({
            t: barT + n.s * e8, dur: n.l * e8 * 0.92, v: "lead",
            m: idxToMidi(root, mode, n.idx), vel: 0.1,
          });
        });
      }
    });

    events.sort((a, b) => a.t - b.t);
    const end = t0 + 16 * bar + 2.5;       // let the echo and reverb ring out
    nodes.echo.delayTime.setValueAtTime(e8 * 1.5, t0);
    return { events, i: 0, end, root, bpm, modeName: P.mode, phaseKey };
  }

  function play(ev) {
    switch (ev.v) {
      case "lead":
        voice(leadWave(), nodes.lead, ev.m, ev.t, ev.dur, ev.vel, { vibrato: true, sustain: 0.7 });
        break;
      case "arp":
        voice(waves.p50, nodes.arp, ev.m, ev.t, ev.dur, ev.vel, { sustain: 0.3, decay: 0.08, release: 0.04 });
        break;
      case "bass":
        voice(waves.tri, nodes.bass, ev.m, ev.t, ev.dur, ev.vel, { sustain: 0.9, decay: 0.3, release: 0.05 });
        break;
      case "kick": kick(ev.t); break;
      case "tick": tick(ev.t, ev.vel); break;
    }
  }

  /* ---------- scheduler ---------- */
  function restSeconds() {
    return rand(6, 14) * (state.phase === "夜" ? 1.4 : 1);
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
        nextBubbleAt += rand(1.2, 5);
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
    nextPieceAt = t + 1.6;
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
