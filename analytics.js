/* analytics.js — Elysium engagement events for Umami.
   Listens only: never changes the page, the stream, or the API. */
(function () {
  "use strict";

  // ---- sending ------------------------------------------------------------
  const queue = [];
  function send(name, data) {
    if (window.umami && typeof window.umami.track === "function") {
      try { data ? window.umami.track(name, data) : window.umami.track(name); } catch (e) {}
    } else {
      queue.push([name, data]);
    }
  }
  // If the tracker is late (slow network, blocked), retry for 15 s, then drop.
  let tries = 0;
  const flush = setInterval(() => {
    tries += 1;
    if (window.umami && typeof window.umami.track === "function") {
      while (queue.length) { const [n, d] = queue.shift(); send(n, d); }
      clearInterval(flush);
    } else if (tries > 30) {
      clearInterval(flush);
    }
  }, 500);

  const sent = new Set();
  function once(key, name, data) {
    if (sent.has(key)) return;
    sent.add(key);
    send(name, data);
  }

  // ---- live window ----------------------------------------------------------
  const video = document.getElementById("elysium-stream");
  if (video) {
    video.addEventListener("playing", () => once("play", "stream_play"));

    // Count only real, visible playback; a backgrounded tab doesn't count.
    let watched = 0, last = null;
    const MARKS = [1, 5, 15, 30];
    video.addEventListener("timeupdate", () => {
      const now = performance.now();
      if (last !== null && !video.paused && document.visibilityState === "visible") {
        const dt = (now - last) / 1000;
        if (dt > 0 && dt < 5) watched += dt;
      }
      last = now;
      for (const m of MARKS) {
        if (watched >= m * 60) once("watch" + m, "stream_watch", { min: m });
      }
    });
    video.addEventListener("pause", () => { last = null; });
  }

  // Landed while the shrimp are asleep (the stream script has already run).
  const sleepCard = document.getElementById("stream-sleep");
  if (sleepCard && !sleepCard.hidden) send("stream_asleep");

  // ---- header buttons -------------------------------------------------------
  const listen = document.getElementById("sound-toggle");
  if (listen) listen.addEventListener("click", () => once("listen", "listen_on"));

  const langBtn = document.querySelector(".lang-toggle");
  if (langBtn) {
    // Runs after toggleLanguage(), so currentLang is already the new language.
    langBtn.addEventListener("click", () => {
      const to = (typeof currentLang !== "undefined") ? currentLang : "unknown";
      once("lang_" + to, "lang_toggle", { to: to });
    });
  }

  // ---- sensor dials ---------------------------------------------------------
  // Dials are redrawn every 60 s, so listen on the panel, not on each svg.
  // Counts only when the dial's own scrub cursor is showing: a real read,
  // not a mouse passing over.
  const dialPanel = document.querySelector(".compact-right");
  if (dialPanel) {
    dialPanel.addEventListener("pointermove", (e) => {
      const dial = e.target.closest && e.target.closest(".dial");
      if (!dial) return;
      const cur = dial.querySelector("[data-cur]");
      if (!cur || cur.getAttribute("visibility") !== "visible") return;
      const sensor = dial.id.replace(/-dial$/, "");
      once("scrub_" + sensor, "dial_scrub", { sensor: sensor });
    });
  }

  // ---- MO/TH/ER -------------------------------------------------------------
  // Her screen auto-scrolls itself, so only count wheel or touch scrolling.
  const motherScreen = document.getElementById("mother-screen");
  if (motherScreen) {
    const read = () => once("mother", "mother_scroll");
    motherScreen.addEventListener("wheel", read, { passive: true });
    motherScreen.addEventListener("touchmove", read, { passive: true });
  }

  // ---- scroll depth ---------------------------------------------------------
  const biota = document.getElementById("biota-grid");
  if (biota && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        once("biota", "biota_seen");
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(biota);
  }

  // ---- outbound links (social links, once you add them) ---------------------
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.hostname && url.hostname !== location.hostname) {
      once("out_" + url.hostname, "outbound", { to: url.hostname });
    }
  });
})();
