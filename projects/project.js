(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ───────── Smooth scroll ─────────
  if (!reduceMotion && window.Lenis) {
    const lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
    (function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    })(0);
  }

  // ───────── Map sheet label: which plate this is ─────────
  // research plates read it from their "Plate N · …" line; app pages set data-sheet-label on <body>
  const plate = document.querySelector(".case > .sheet-no");
  const label = document.body.dataset.sheetLabel || (plate && plate.textContent.split("·")[0].trim().toUpperCase());
  if (window.MapSheet && label) MapSheet.setLabel(() => label);

  // ───────── 2014 / 2017 swipe ─────────
  // A transparent range input sits over the figure, so drag, touch and arrow keys all work.
  document.querySelectorAll(".swipe").forEach((swipe) => {
    const input = swipe.querySelector("input");
    const set = (v) => swipe.style.setProperty("--pos", v + "%");
    input.addEventListener("input", () => set(input.value));
    set(input.value);
  });

  // ───────── 3D orbit ─────────
  // 24 frames per flight, rendered in QGIS every 15° around Hudson Yards. Dragging scrubs through them;
  // frames load when the figure nears the viewport, and the other flight only when it's chosen.
  const orbit = document.getElementById("orbit");
  if (orbit) {
    const FRAMES = 24, STEP = 15, START = 135, PX_PER_FRAME = 16;
    const img = orbit.querySelector(".orbit-img");
    const headingEl = orbit.querySelector(".orbit-heading");
    const buttons = orbit.querySelectorAll(".orbit-years button");
    const cache = {};
    let year = "2017", frame = 0, auto = !reduceMotion, autoTimer = null;
    const src = (y, k) => `img/orbit/${y}_${String(k).padStart(2, "0")}.jpg`;

    function preload(y) {
      if (cache[y]) return cache[y];
      orbit.classList.add("loading");
      let left = FRAMES;
      cache[y] = Array.from({ length: FRAMES }, (_, k) => {
        const im = new Image();
        im.onload = im.onerror = () => { if (--left === 0) orbit.classList.remove("loading"); };
        im.src = src(y, k);
        return im;
      });
      return cache[y];
    }
    function show() {
      img.src = src(year, frame);
      headingEl.textContent = `Heading ${(START + frame * STEP) % 360}°`;
    }
    function step(d) { frame = (frame + d + FRAMES) % FRAMES; show(); }
    function stopAuto() { auto = false; clearInterval(autoTimer); orbit.classList.add("touched"); }

    new IntersectionObserver((entries, io) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      preload(year);
      if (auto) autoTimer = setInterval(() => step(1), 450); // a slow turntable until someone grabs it
    }, { rootMargin: "300px" }).observe(orbit);

    let dragX = null, dragFrame = 0;
    orbit.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      stopAuto();
      dragX = e.clientX; dragFrame = frame;
      orbit.setPointerCapture(e.pointerId);
    });
    orbit.addEventListener("pointermove", (e) => {
      if (dragX === null) return;
      const k = dragFrame - Math.round((e.clientX - dragX) / PX_PER_FRAME);
      const next = ((k % FRAMES) + FRAMES) % FRAMES;
      if (next !== frame) { frame = next; show(); }
    });
    const end = () => (dragX = null);
    orbit.addEventListener("pointerup", end);
    orbit.addEventListener("pointercancel", end);
    orbit.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault(); stopAuto(); step(e.key === "ArrowRight" ? 1 : -1);
      }
    });
    buttons.forEach((b) => b.addEventListener("click", () => {
      stopAuto();
      year = b.dataset.year;
      buttons.forEach((o) => o.setAttribute("aria-pressed", o === b));
      preload(year);
      show();
    }));
  }

  // ───────── Footnote tooltips ─────────
  const tip = document.getElementById("tooltip");
  if (tip) {
    function showTip(fn) {
      tip.textContent = fn.dataset.note;
      const r = fn.getBoundingClientRect();
      tip.classList.add("show");
      const tr = tip.getBoundingClientRect();
      tip.style.left = clamp(r.left - tr.width / 2, 12, innerWidth - tr.width - 12) + "px";
      tip.style.top = (r.top - tr.height - 10 < 8 ? r.bottom + 10 : r.top - tr.height - 10) + "px";
    }
    document.querySelectorAll("sup.fn").forEach((fn) => {
      fn.addEventListener("mouseenter", () => showTip(fn));
      fn.addEventListener("mouseleave", () => tip.classList.remove("show"));
      fn.addEventListener("click", (e) => { e.stopPropagation(); showTip(fn); });
    });
    addEventListener("click", () => tip.classList.remove("show"));
    addEventListener("scroll", () => tip.classList.remove("show"), { passive: true });
  }
})();
