(() => {
  // ───────── Fig. 1: the tract map, six views ─────────
  // Tracts arrive in UTM 12N (metres / 40) as delta-encoded rings; each becomes a Path2D once,
  // then every redraw is a fill per tract. Same machinery as Plate V.
  const D = window.UHI_DATA;
  const host = document.getElementById("heatmap");
  if (!D || !host) return;
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const read = host.querySelector(".gm-read");
  const buttons = host.querySelectorAll(".gm-views button");
  const caps = document.querySelectorAll(".gm-cap, .gm-key");

  const tracts = D.tracts.map((t) => {
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    t.r.forEach((d) => {
      let x = 0, y = 0;
      for (let i = 0; i < d.length; i += 2) {
        x += d[i]; y += d[i + 1];
        i ? path.lineTo(x, y) : path.moveTo(x, y);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      path.closePath();
    });
    return { ...t, path, box: [x0, y0, x1, y1] };
  });
  const kept = tracts.filter((t) => !t.x);

  // natural breaks from the 788 study tracts (the heat breaks match the ArcGIS map exactly)
  const RAMP = {
    t: ["#f7ecc9", "#f2c98a", "#e59a55", "#c8612a", "#8c2b16"],
    v: ["#eef0dc", "#cfdcae", "#a3c27f", "#6f9c55", "#3f6e35"],
    b: ["#efe9df", "#d8c9b2", "#b9a07f", "#8f7352", "#5e4630"],
    s: ["#e8edf2", "#c2d3e3", "#8fb0cf", "#4f7fa8", "#1f4e79"],
  };
  const classOf = (key, v) => { const b = D.breaks[key]; let i = 0; while (i < 4 && v > b[i]) i++; return i; };
  const COLD = 45;
  const QA = { 55052: "cloud", 22280: "cloud", 23888: "cloud shadow", 23826: "cloud shadow" };

  const hatch = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 6;
    const h = c.getContext("2d");
    h.fillStyle = "#f6f5ee"; h.fillRect(0, 0, 6, 6);
    h.strokeStyle = "rgba(20,20,20,0.16)"; h.lineWidth = 1;
    h.beginPath(); h.moveTo(0, 6); h.lineTo(6, 0); h.stroke();
    return ctx.createPattern(c, "repeat");
  })();

  function fill(t) {
    if (view === "o") {
      if (t.x === "svi") return hatch;
      return t.o < COLD ? "#4f7fa8" : RAMP.t[classOf("t", t.o)];
    }
    if (t.x) return hatch;
    if (view === "q") return t.q ? "#c8782f" : "#dedcd2";
    return RAMP[view][classOf(view, t[view])];
  }

  // the frame fits every tract except any lying wholly below it (one far-south tract), which gets an inset
  const inset = tracts.filter((t) => t.box[1] > D.h);
  const main = tracts.filter((t) => !inset.includes(t));
  const union = (ts) => ts.reduce((a, t) => [Math.min(a[0], t.box[0]), Math.min(a[1], t.box[1]),
    Math.max(a[2], t.box[2]), Math.max(a[3], t.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const BB = union(main), IB = inset.length ? union(inset) : null;
  // nudges so neighbouring names don't collide: [dx, dy, align]
  const NUDGE = { Phoenix: [-6, 0, "right"], Tempe: [0, 12, "center"], Mesa: [8, 0, "left"], Scottsdale: [6, -4, "left"] };

  let view = "t", scale = 1, ox = 0, oy = 0, cssW = 0, cssH = 0, hover = null;
  let base = 1, pad = { t: 52, b: 16, s: 12 }, ins = null;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const narrow = canvas.clientWidth < 600;
    pad = { t: narrow ? 88 : 56, b: narrow ? 70 : 16, s: narrow ? 8 : 16 };
    cssW = canvas.clientWidth;
    const bw = BB[2] - BB[0], bh = BB[3] - BB[1];
    cssH = Math.min((cssW - 2 * pad.s) * (bh / bw) + pad.t + pad.b, Math.max(460, innerHeight * 0.85));
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    base = Math.min((cssW - 2 * pad.s) / bw, (cssH - pad.t - pad.b) / bh);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (IB) {
      const iw = Math.max(90, cssW * 0.16), is = iw / (IB[2] - IB[0]), ih = (IB[3] - IB[1]) * is;
      ins = { x: pad.s, y: cssH - pad.b - ih - 22, w: iw + 16, h: ih + 30, s: is };
    }
    draw();
  }

  function place() {
    scale = base;
    ox = cssW / 2 - (BB[0] + BB[2]) / 2 * scale;
    oy = (pad.t + cssH - pad.b) / 2 - (BB[1] + BB[3]) / 2 * scale;
  }

  function draw() {
    place();
    ctx.save();
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.translate(ox, oy); ctx.scale(scale, scale);
    main.forEach((t) => { ctx.fillStyle = fill(t); ctx.fill(t.path); });
    ctx.lineWidth = 0.6 / scale;
    ctx.strokeStyle = "rgba(255,255,248,0.9)";
    main.forEach((t) => ctx.stroke(t.path));
    if (hover && main.includes(hover)) { ctx.lineWidth = 2 / scale; ctx.strokeStyle = "#141414"; ctx.stroke(hover.path); }
    ctx.restore();

    // city names in screen pixels, with a thin paper halo
    ctx.font = `${cssW < 600 ? 10 : 11}px ${monoFont()}`;
    ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,248,0.8)";
    D.cities.forEach((c) => {
      const [dx, dy, al] = NUDGE[c.n] || [0, 0, "center"];
      const x = ox + c.x * scale + dx, y = oy + c.y * scale + dy;
      if (x < 0 || x > cssW || y < pad.t || y > cssH) return;
      ctx.textAlign = al;
      ctx.strokeText(c.n, x, y); ctx.fillStyle = "#2b2b2b"; ctx.fillText(c.n, x, y);
    });

    if (ins) {
      ctx.fillStyle = "rgba(255,255,248,0.94)"; ctx.fillRect(ins.x, ins.y, ins.w, ins.h);
      ctx.strokeStyle = "#141414"; ctx.lineWidth = 1; ctx.strokeRect(ins.x + 0.5, ins.y + 0.5, ins.w - 1, ins.h - 1);
      ctx.save();
      ctx.translate(ins.x + 8 - IB[0] * ins.s, ins.y + 8 - IB[1] * ins.s); ctx.scale(ins.s, ins.s);
      inset.forEach((t) => { ctx.fillStyle = fill(t); ctx.fill(t.path); if (t === hover) { ctx.lineWidth = 2 / ins.s; ctx.strokeStyle = "#141414"; ctx.stroke(t.path); } });
      ctx.restore();
      ctx.font = `10px ${monoFont()}`; ctx.fillStyle = "#6b6b6b"; ctx.textAlign = "left";
      ctx.fillText("further south", ins.x + 8, ins.y + ins.h - 10);
    }
  }
  const pct = (s) => Math.round(s * 100);
  const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
  const sgn = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

  function describe(h) {
    if (!h) {
      const cold = tracts.filter((t) => t.x !== "svi" && t.o < COLD).length;
      read.innerHTML = view === "q" ? "<b>110 tracts</b> vulnerable and bare<br>mean 60.1 °C, study mean 61.1 °C"
        : view === "o" ? `<b>First pass</b>: ${cold} tracts read below ${COLD} °C`
        : "<b>788 tracts</b> analysed · hover one";
      return;
    }
    if (h.x === "svi") { read.innerHTML = `<b>Tract ${h.n}</b> · left out<br>no vulnerability score (few or no residents)`; return; }
    if (view === "o") {
      read.innerHTML = `<b>Tract ${h.n}</b> · first pass ${h.o.toFixed(1)} °C<br>` +
        (h.x ? `left out: mostly ${QA[h.m] || "flagged"} (QA ${h.m})` : `after the QA mask ${h.t.toFixed(1)} °C`);
      return;
    }
    if (h.x) { read.innerHTML = `<b>Tract ${h.n}</b> · left out<br>mostly ${QA[h.m] || "flagged"} in the QA band (${h.m})`; return; }
    read.innerHTML = `<b>Tract ${h.n}</b> · ${h.t.toFixed(1)} °C at the surface<br>` +
      `NDVI ${h.v.toFixed(2)} · NDBI ${sgn(h.b)}<br>vulnerability ${ord(pct(h.s))} percentile` +
      (h.q ? "<br>in the vulnerable, least green quarter" : "");
  }

  const testCtx = document.createElement("canvas").getContext("2d");
  function pickTract(x, y) {
    for (const t of tracts) {
      const b = t.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (testCtx.isPointInPath(t.path, x, y)) return t;
    }
    return null;
  }

  const setHover = (h) => { if (h !== hover) { hover = h; draw(); describe(h); scatterMark(h); } };
  function pickAt(sx, sy) {
    if (ins && sx >= ins.x && sx <= ins.x + ins.w && sy >= ins.y && sy <= ins.y + ins.h) {
      const x = (sx - ins.x - 8) / ins.s + IB[0], y = (sy - ins.y - 8) / ins.s + IB[1];
      return inset.find((t) => testCtx.isPointInPath(t.path, x, y)) || null;
    }
    return pickTract((sx - ox) / scale, (sy - oy) / scale);
  }
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    setHover(pickAt(e.clientX - r.left, e.clientY - r.top));
  });
  canvas.addEventListener("pointerleave", () => setHover(null));

  buttons.forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view;
    buttons.forEach((o) => o.setAttribute("aria-pressed", o === b));
    caps.forEach((c) => (c.hidden = c.dataset.for !== view));
    hover = null; draw(); describe(null);
  }));

  size(); describe(null);
  let lastW = canvas.clientWidth, rt = null;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (Math.abs(canvas.clientWidth - lastW) > 4) { lastW = canvas.clientWidth; size(); } }, 120);
  });

  // ───────── Fig. 2: vulnerability against vegetation and against heat ─────────
  const sc = document.getElementById("scatter");
  let scatterMark = () => {};
  if (!sc) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    parent && parent.appendChild(n);
    return n;
  };
  const txt = (p, a, s) => { const n = el("text", a, p); n.textContent = s; return n; };

  function renderScatter() {
    const W = Math.round(sc.clientWidth), narrow = W < 640;
    const pw = narrow ? W : (W - 40) / 2, ph = narrow ? 230 : 280;
    const H = narrow ? ph * 2 + 30 : ph;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg", role: "img",
      "aria-label": "Vulnerability falls with vegetation (rho −0.44) but shows almost no relation to surface temperature" });
    const panels = [
      { title: "Vegetation (NDVI)", key: "v", lo: 0.05, hi: 0.4, ticks: [0.1, 0.2, 0.3, 0.4], f: (v) => v.toFixed(1), stat: "ρ = −0.44" },
      { title: "Surface temperature, °C", key: "t", lo: 45, hi: 68, ticks: [45, 50, 55, 60, 65], f: (v) => v, stat: "r = −0.03 · ρ = +0.15" },
    ];
    const marks = [], dots = [];
    panels.forEach((p, k) => {
      const gx = narrow ? 0 : k * (pw + 40), gy = narrow ? k * (ph + 30) : 0;
      const L = 38, T = 30, B = 30, R = 6;
      const X = (s) => gx + L + s * (pw - L - R);
      const Y = (v) => gy + T + (1 - (v - p.lo) / (p.hi - p.lo)) * (ph - T - B);
      txt(svg, { x: gx, y: gy + 12, class: "c-title" }, p.title);
      txt(svg, { x: gx + pw, y: gy + 12, class: "c-read", style: "text-anchor:end" }, p.stat);
      p.ticks.forEach((t) => {
        el("line", { x1: gx + L, x2: gx + pw - R, y1: Y(t), y2: Y(t), class: "c-grid" }, svg);
        txt(svg, { x: gx + L - 6, y: Y(t) + 4, class: "c-tick", style: "text-anchor:end" }, p.f(t));
      });
      el("line", { x1: gx + L, x2: gx + pw - R, y1: gy + ph - B, y2: gy + ph - B, class: "c-zero" }, svg);
      txt(svg, { x: gx + L, y: gy + ph - 8, class: "c-tick", style: "text-anchor:start" }, "least vulnerable");
      txt(svg, { x: gx + pw - R, y: gy + ph - 8, class: "c-tick", style: "text-anchor:end" }, "most →");
      const g = el("g", {}, svg);
      [...kept].sort((a, b) => (a.q || 0) - (b.q || 0)).forEach((t) => {
        const c = el("circle", { cx: X(t.s), cy: Y(t[p.key]), r: narrow ? 2 : 2.6, class: t.q ? "sc-dot sc-q" : "sc-dot" }, g);
        c.__t = t; dots.push(c);
      });
      marks.push(el("circle", { r: 6, class: "sc-mark", visibility: "hidden" }, svg));
      marks[k].__pos = (t) => [X(t.s), Y(t[p.key])];
    });
    scatterMark = (t) => marks.forEach((m) => {
      if (!t || t.x) return m.setAttribute("visibility", "hidden");
      const [x, y] = m.__pos(t);
      m.setAttribute("cx", x); m.setAttribute("cy", y); m.setAttribute("visibility", "visible");
    });
    svg.addEventListener("pointermove", (e) => {
      const d = e.target.closest(".sc-dot");
      if (d) { hover = d.__t; draw(); describe(hover); scatterMark(hover); }
    });
    svg.addEventListener("pointerleave", () => setHover(null));
    sc.replaceChildren(svg);
  }
  renderScatter();
  let lastSW = sc.clientWidth, ts = null;
  addEventListener("resize", () => {
    clearTimeout(ts);
    ts = setTimeout(() => { if (Math.abs(sc.clientWidth - lastSW) > 4) { lastSW = sc.clientWidth; renderScatter(); } }, 120);
  });
})();
