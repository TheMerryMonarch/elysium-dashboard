/* =======================
   ELYSIUM SOUNDSCAPE
   A generated ambient score, played live from the tank's own telemetry.
   Nothing is prerecorded: every sound is synthesized in the browser with the
   Web Audio API, so there are no audio files to host and nothing to license.

     time of day (朝 日 黄昏 夜)  -> scale and mood
     pH                           -> key (the root note)
     dissolved oxygen %           -> pace (how often the koto-like plucks fall)
     CO2 injection on             -> bubbles
     temperature                  -> warmth (brightness of the water bed)
     phase change                 -> a singing-bowl strike

   Browsers refuse to start sound without a click, so it is opt-in via the
   header button. index.html feeds it through three calls:
     ElysiumSound.setTelemetry({ ph, doPct, tempF })   every /latest poll
     ElysiumSound.setPhase(kanji, { co2 })             every light-cycle tick
     ElysiumSound.setLang("en" | "jp")                 on language toggle
======================= */
(function () {
  "use strict";

  const AC = window.AudioContext || window.webkitAudioContext;

  /* Each phase of the light cycle plays in a traditional Japanese pentatonic
     scale. pace scales how often notes fall; bright opens or closes the tone
     filter; drone sets how present the low bed is. Night is sparse and dark. */
  const PHASES = {
    "朝":   { en: "Yo scale",     jp: "陽音階",       steps: [0, 2, 5, 7, 9], pace: 1.0,  bright: 0.85, drone: 0.85, gap: 0.30 },
    "日":   { en: "Yonanuki",     jp: "ヨナ抜き音階", steps: [0, 2, 4, 7, 9], pace: 1.15, bright: 1.0,  drone: 0.8, gap: 0.24 },
    "黄昏": { en: "Miyako-bushi", jp: "都節音階",     steps: [0, 1, 5, 7, 8], pace: 0.8,  bright: 0.7,  drone: 0.75, gap: 0.42 },
    "夜":   { en: "Hirajōshi",    jp: "平調子",       steps: [0, 2, 3, 7, 8], pace: 0.45, bright: 0.45, drone: 0.6, gap: 0.55 },
  };

  /* pH picks the key. The CO2 cycle swings pH by most of a unit every day, so
     the tank drifts down through the keys while CO2 is on and climbs back
     overnight. Seven roots, A through G around D; hysteresis keeps a reading
     that sits on a boundary from flipping the key back and forth. */
  const BASE_MIDI = 50;                               // D3
  const KEY_OFFSETS = [-5, -3, -2, 0, 2, 3, 5];       // A B C D E F G
  const DEFAULT_KEY = 3;                              // D, until pH arrives
  const PH_LO = 5.6, PH_HI = 7.4;
  const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

  /* Dissolved oxygen sets the pace: mean seconds between musical events. */
  const DO_LO = 20, DO_HI = 100, GAP_SLOW = 9, GAP_FAST = 2.5;
  const AVG_PHRASE = 1.7;                             // notes per event, on average

  const UI = {
    en: {
      listen: "Listen", playing: "Listening",
      title: "Play a soundscape generated live from the tank's sensors",
      unsupported: "Sound isn't supported in this browser",
      main: (scale, key, rate) => `♪ ${scale} in ${key} · ${rate} notes/min`,
      map: "pH → key · O₂ → pace · CO₂ → bubbles · temp → warmth",
    },
    jp: {
      listen: "聴く", playing: "再生中",
      title: "水槽のセンサーからリアルタイムに生成されるサウンドスケープ",
      unsupported: "このブラウザでは音声を再生できません",
      main: (scale, key, rate) => `♪ ${scale}・${key}調 · 毎分${rate}音`,
      map: "pH → 調 · 溶存酸素 → テンポ · CO₂ → 泡 · 水温 → 音色",
    },
  };

  const state = {
    ph: null, doPct: null, tempF: null,
    co2: false, phase: "日", keyIdx: null, lang: "en",
  };

  let ctx = null;
  let nodes = null;
  let running = false;
  let deg = 5;                    // melody position, in scale degrees
  const timers = new Set();

  /* ---------- helpers ---------- */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
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
  function panner(x) {
    if (!ctx.createStereoPanner) return ctx.createGain();   // old Safari: no panning
    const p = ctx.createStereoPanner();
    p.pan.value = x;
    return p;
  }

  /* ---------- derived musical parameters ---------- */
  function keyIndexFor(ph, current) {
    if (ph == null) return current == null ? DEFAULT_KEY : current;
    const x = (clamp(ph, PH_LO, PH_HI) - PH_LO) / (PH_HI - PH_LO) * (KEY_OFFSETS.length - 1);
    if (current != null && Math.abs(x - current) < 0.8) return current;
    return Math.round(x);
  }
  function rootMidi() {
    const i = state.keyIdx == null ? DEFAULT_KEY : state.keyIdx;
    return BASE_MIDI + KEY_OFFSETS[i];
  }
  function keyName() { return NOTE_NAMES[rootMidi() % 12]; }
  function meanGap() {
    const d = state.doPct == null ? 60 : clamp(state.doPct, DO_LO, DO_HI);
    const gap = GAP_SLOW - (d - DO_LO) / (DO_HI - DO_LO) * (GAP_SLOW - GAP_FAST);
    return gap / PHASES[state.phase].pace;
  }
  function notesPerMinute() { return Math.max(1, Math.round(60 / meanGap() * AVG_PHRASE)); }
  function warmth() {
    const t = state.tempF == null ? 72 : state.tempF;
    return clamp((t - 66) / 12, 0, 1);                 // 66°F -> 0, 78°F -> 1
  }

  /* ---------- noise + reverb buffers ---------- */
  function brownNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }
  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* ---------- the graph ----------
     every voice -> tone (lowpass) -> dry + reverb -> master -> limiter -> out */
  function build() {
    ctx = new AC();

    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 10;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.35;
    chain(master, limiter, ctx.destination);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5000;
    tone.Q.value = 0.3;

    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(4, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    chain(tone, dry, master);
    chain(tone, verb, wet, master);

    nodes = { master, limiter, tone };
    buildDrone();
    buildWater();
  }

  // Low bed: root and fifth an octave apart, a lowpass that breathes slowly.
  function buildDrone() {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;                        // one breath every ~22s
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 170;
    chain(lfo, lfoAmt, lp.frequency);
    lfo.start();

    const g = ctx.createGain();
    g.gain.value = 0;
    const voices = [
      // The octave carries more than usual: phone and laptop speakers roll off
      // below ~100 Hz, and the bed should still be there on them.
      { rel: 0,  type: "sine",     gain: 0.45, det: 0 },
      { rel: 7,  type: "triangle", gain: 0.16, det: 4 },
      { rel: 12, type: "sine",     gain: 0.30, det: -5 },
      { rel: 19, type: "sine",     gain: 0.05, det: 6 },
    ];
    const oscs = voices.map((v) => {
      const o = ctx.createOscillator();
      o.type = v.type;
      o.detune.value = v.det;
      const vg = ctx.createGain();
      vg.gain.value = v.gain;
      chain(o, vg, lp);
      o.start();
      return { o, rel: v.rel };
    });
    chain(lp, g, nodes.tone);
    nodes.drone = { g, oscs };
  }

  // Water: soft brown noise through a wide bandpass, swelling slowly.
  function buildWater() {
    const src = ctx.createBufferSource();
    src.buffer = brownNoise(6);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.025;
    chain(lfo, lfoAmt, g.gain);
    lfo.start();
    chain(src, bp, g, nodes.tone);
    src.start();
    nodes.water = { bp };
  }

  // Push the current telemetry and phase into the running graph, gliding
  // rather than jumping so a new reading never clicks.
  function applyParams(immediate) {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const glide = immediate ? 0.01 : 4;
    const p = PHASES[state.phase];
    const droneRoot = rootMidi() - 12;
    nodes.drone.oscs.forEach((v) => v.o.frequency.setTargetAtTime(mtof(droneRoot + v.rel), t, glide));
    nodes.drone.g.gain.setTargetAtTime(0.17 * p.drone, t, immediate ? 0.5 : 3);
    const w = warmth();
    nodes.tone.frequency.setTargetAtTime(1600 + 4400 * p.bright * (0.6 + 0.4 * w), t, 3);
    nodes.water.bp.frequency.setTargetAtTime(420 + 700 * w, t, 3);
  }

  /* ---------- voices ---------- */

  // Koto-like pluck: a triangle with a quiet octave, a fast filter close, and
  // a tiny pitch drop on the attack the way a plucked silk string settles.
  function pluck(midi, when, vel, pan) {
    const f = mtof(midi);
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(f * 1.012, when);
    o1.frequency.exponentialRampToValueAtTime(f, when + 0.04);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(f * 2.003, when);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(Math.min(f * 8, 8000), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 300), when + 1.2);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(vel, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 2.8);

    const out = panner(pan);
    o1.connect(lp);
    chain(o2, g2, lp);
    chain(lp, env, out, nodes.tone);
    o1.start(when);
    o2.start(when);
    o1.stop(when + 3);
    o2.stop(when + 3);
    o1.onended = () => out.disconnect();
  }

  // CO2 bubble: a short sine chirp that rises as the bubble leaves the diffuser.
  function bubble(when) {
    const f0 = rand(500, 1400);
    const dur = rand(0.05, 0.12);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.4, when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(rand(0.02, 0.04), when + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.02);
    const out = panner(rand(-0.7, 0.7));
    chain(o, env, out, nodes.tone);
    o.start(when);
    o.stop(when + dur + 0.05);
    o.onended = () => out.disconnect();
  }

  // Singing bowl: inharmonic partials, each a slightly detuned pair so it beats
  // as it rings. Struck on start and at each change of the light cycle.
  function bowl(when, level) {
    const f = mtof(rootMidi());
    const partials = [[1, 1, 10], [2.76, 0.45, 7], [5.4, 0.2, 4.5], [8.93, 0.08, 2.5]];
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(nodes.tone);
    partials.forEach(([ratio, amp, decay]) => {
      [-0.7, 0.7].forEach((beat) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * ratio + beat * ratio * 0.5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, when);
        env.gain.exponentialRampToValueAtTime(amp / 2, when + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
        chain(o, env, out);
        o.start(when);
        o.stop(when + decay + 0.1);
      });
    });
    // Plain timeout, not after(): stop() clears those, and this cleanup must still run.
    setTimeout(() => out.disconnect(), 11000);
  }

  /* ---------- schedulers ---------- */

  // Melody wanders the scale in small steps across two octaves; now and then
  // it adds a fifth below or drops to the root, so it phrases instead of noodling.
  function noteFor(d) {
    const steps = PHASES[state.phase].steps;
    const oct = Math.floor(d / steps.length);
    return rootMidi() + 12 + steps[d % steps.length] + 12 * oct;
  }
  function walk() {
    const moves = [-2, -1, -1, 1, 1, 2];
    deg += moves[Math.floor(Math.random() * moves.length)];
    if (deg < 0) deg = 1;
    if (deg > 9) deg = 8;
  }

  function schedulePluck() {
    if (!running) return;
    const p = PHASES[state.phase];
    const r = Math.random();
    const n = r < 0.45 ? 1 : r < 0.85 ? 2 : 3;
    let when = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      walk();
      const vel = rand(0.09, 0.16) * (state.phase === "夜" ? 0.8 : 1);
      pluck(noteFor(deg), when, vel, rand(-0.45, 0.45));
      if (Math.random() < 0.12) pluck(noteFor(deg) - 5, when + 0.01, vel * 0.6, rand(-0.3, 0.3));
      when += p.gap + rand(0, 0.45);
    }
    if (Math.random() < 0.12) pluck(rootMidi() + 12, when + 0.3, 0.08, 0);
    after(meanGap() * rand(0.5, 1.5), schedulePluck);
  }

  function scheduleBubbles() {
    if (!running) return;
    if (state.co2) {
      const k = 1 + Math.floor(Math.random() * 3);
      let when = ctx.currentTime + 0.05;
      for (let i = 0; i < k; i++) {
        bubble(when);
        when += rand(0.05, 0.17);
      }
    }
    after(state.co2 ? rand(0.6, 3) : 5, scheduleBubbles);
  }

  /* ---------- start / stop ---------- */
  function start() {
    if (!AC) return;
    if (!ctx) build();
    // resume() must be called inside the click handler for iOS to allow audio.
    const resumed = ctx.resume();
    running = true;
    applyParams(true);
    const t = ctx.currentTime;
    const g = nodes.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.85, t + 3);
    bowl(t + 0.2, 0.16);
    after(2.5, schedulePluck);
    after(1, scheduleBubbles);
    render();
    return resumed;
  }

  function stop() {
    running = false;
    clearTimers();
    if (ctx) {
      const t = ctx.currentTime;
      const g = nodes.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => { if (!running) ctx.suspend(); }, 1400);
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
    if (status) {
      status.hidden = !running;
      const p = PHASES[state.phase];
      if (statusMain) statusMain.textContent = u.main(state.lang === "jp" ? p.jp : p.en, keyName(), notesPerMinute());
      if (statusMap) statusMap.textContent = u.map;
    }
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
      state.keyIdx = keyIndexFor(state.ph, state.keyIdx);
      if (running) applyParams(false);
      render();
    },
    setPhase(kanji, opts) {
      const next = PHASES[kanji] ? kanji : state.phase;
      const changed = next !== state.phase;
      state.phase = next;
      if (opts && typeof opts.co2 === "boolean") state.co2 = opts.co2;
      if (running) {
        applyParams(false);
        if (changed) bowl(ctx.currentTime + 0.1, 0.2);
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
