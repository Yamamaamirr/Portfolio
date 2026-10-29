(() => {
  // ───────── Fig. 1: the tract map, three views ─────────
  // Tracts arrive in NY State Plane (feet / 40) as delta-encoded rings; each becomes a Path2D once,
  // then every redraw is a fill per tract. Hover finds the tract under the cursor (or a nearby station).
  const D = window.GAP_DATA;
  const host = document.getElementById("gapmap");
  if (!D || !host) return;
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const read = host.querySelector(".gm-read");
  const buttons = host.querySelectorAll(".gm-views button");
  const caps = document.querySelectorAll(".gm-cap, .gm-key");
  const BORO = { MN: "Manhattan", BK: "Brooklyn", QN: "Queens", BX: "Bronx", SI: "Staten Island" };
  const boro = (b) => BORO[b] || "";
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

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

  const BLUES = ["#e8edf2", "#c9d8e6", "#9db8d2", "#6f97bd", "#3f6f9c", "#1f4e79"];
  const gapColour = (pm) => (pm <= 0 ? BLUES[0] : pm < 40 ? BLUES[1] : pm < 87 ? BLUES[2] : pm < 160 ? BLUES[3] : pm < 271 ? BLUES[4] : BLUES[5]);
  const LISA = ["#ecebe2", "#c8782f", "#4f7fa8", "#e9c9a6", "#e9c9a6"];
  const LISA_NAME = ["Not significant", "Hot spot: underserved among underserved", "Cold spot: well served among well served",
    "Outlier: underserved among well served", "Outlier: well served among underserved"];

  // hatching for tracts left out of the analysis
  const hatch = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 6;
    const h = c.getContext("2d");
    h.fillStyle = "#f6f5ee"; h.fillRect(0, 0, 6, 6);
    h.strokeStyle = "rgba(20,20,20,0.16)"; h.lineWidth = 1;
    h.beginPath(); h.moveTo(0, 6); h.lineTo(6, 0); h.stroke();
    return ctx.createPattern(c, "repeat");
  })();

  let view = "gap", scale = 1, ox = 0, oy = 0, cssW = 0, cssH = 0, hover = null;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cssW = canvas.clientWidth;
    cssH = Math.min(cssW * (D.h / D.w), Math.max(420, innerHeight * 0.82));
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    scale = Math.min(cssW / D.w, cssH / D.h);
    ox = (cssW - D.w * scale) / 2; oy = (cssH - D.h * scale) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.translate(ox, oy); ctx.scale(scale, scale);
    const faded = view === "ten";
    tracts.forEach((t) => {
      ctx.fillStyle = t.x ? hatch : view === "lisa" ? LISA[t.l] : gapColour(t.pm);
      ctx.globalAlpha = faded && !t.x ? 0.45 : 1;
      ctx.fill(t.path);
    });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.6 / scale;
    ctx.strokeStyle = "rgba(255,255,248,0.9)";
    tracts.forEach((t) => ctx.stroke(t.path));
    if (hover && hover.path) {
      ctx.lineWidth = 2 / scale; ctx.strokeStyle = "#141414"; ctx.stroke(hover.path);
    }
    ctx.restore();

    // stations, in screen pixels so they stay the same size at any width
    const P = (s) => [ox + s.x * scale, oy + s.y * scale];
    const r = cssW < 600 ? 1.6 : 2.4;
    if (view === "gap") {
      D.stations.forEach((s) => {
        const [x, y] = P(s);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (s.a === 1) { ctx.fillStyle = "#c8782f"; ctx.fill(); }
        else { ctx.strokeStyle = "rgba(20,20,20,0.55)"; ctx.lineWidth = 0.8; ctx.stroke(); }
      });
    }
    if (view === "ten") {
      D.stations.filter((s) => s.m).forEach((s) => {
        const [x, y] = P(s), k = cssW < 600 ? 4 : 5.5;
        ctx.strokeStyle = "#141414"; ctx.lineWidth = 1.6; ctx.strokeRect(x - k, y - k, 2 * k, 2 * k);
      });
      const R = cssW < 600 ? 7 : 10;
      D.stations.filter((s) => s.g).sort((a, b) => b.g - a.g).forEach((s) => {
        const [x, y] = P(s);
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = "#c8782f"; ctx.fill();
        ctx.strokeStyle = "#fffff8"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#fffff8"; ctx.font = `700 ${cssW < 600 ? 8 : 10}px ${monoFont()}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.g, x, y + 0.5);
      });
    }
    if (hover && hover.n) {
      const [x, y] = P(hover);
      ctx.beginPath(); ctx.arc(x, y, (view === "ten" && hover.g ? 10 : 4) + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#141414"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function describe(h) {
    if (!h) {
      read.innerHTML = view === "ten"
        ? "<b>Ten upgrades</b>, chosen one at a time: 42,443 person-miles"
        : view === "lisa" ? "<b>161 hot-spot tracts</b>, 112,151 residents with a disability"
        : "<b>1,604 tracts</b> analysed · hover one";
      return;
    }
    if (h.n) {
      const status = h.a === 1 ? "accessible" : h.a === 2 ? "accessible in one direction" : "not accessible";
      read.innerHTML = `<b>${h.n}</b> · ${h.rt}<br>${status}` +
        (h.g ? `<br>upgrade #${h.g}: ${fmt(h.pm)} person-miles` : "") + (h.m ? `<br>MTA 2025 pick · ranks #${h.m} on this measure` : "");
      return;
    }
    if (h.x) {
      const why = h.x === "desert" ? "no subway within reach: a transit gap, not an accessibility one"
        : h.x === "zero" ? "no residents" : "survey estimate too uncertain to use";
      read.innerHTML = `<b>${boro(h.b)}</b> · left out<br>${why}`;
      return;
    }
    read.innerHTML = `<b>${boro(h.b)}</b> · ${h.g ? h.g.toFixed(2) + " extra miles" : "no gap"}<br>` +
      `${fmt(h.d)} residents with a disability (${h.p}%)<br>` +
      (view === "lisa" ? LISA_NAME[h.l] : `${fmt(h.pm)} person-miles`);
  }

  // hit-testing happens in map units on a spare context, so the visible canvas's transform doesn't matter
  const testCtx = document.createElement("canvas").getContext("2d");
  function pickTract(x, y) {
    for (const t of tracts) {
      const b = t.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (testCtx.isPointInPath(t.path, x, y)) return t;
    }
    return null;
  }

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let h = null;
    if (view !== "lisa") {
      const near = D.stations.filter((s) => view === "gap" || s.g || s.m)
        .map((s) => [s, Math.hypot(ox + s.x * scale - mx, oy + s.y * scale - my)])
        .sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] < (view === "ten" ? 12 : 6)) h = near[0];
    }
    if (!h) h = pickTract((mx - ox) / scale, (my - oy) / scale);
    if (h !== hover) { hover = h; draw(); describe(h); }
  });
  canvas.addEventListener("pointerleave", () => { hover = null; draw(); describe(null); });

  buttons.forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view;
    buttons.forEach((o) => o.setAttribute("aria-pressed", o === b));
    caps.forEach((c) => (c.hidden = c.dataset.for !== view));
    hover = null; draw(); describe(null);
  }));

  size(); describe(null);
  let lastW = canvas.clientWidth, t = null;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => { if (Math.abs(canvas.clientWidth - lastW) > 4) { lastW = canvas.clientWidth; size(); } }, 120);
  });

  // ───────── Fig. 2: gap size and gap incidence by disability decile ─────────
  // From outputs/tables/gap_by_disability_decile.csv: disability %, mean gap (mi), % of tracts with no gap.
  const DEC = [[5.8, 0.198, 44.2], [8.2, 0.197, 38.5], [9.6, 0.142, 49.7], [10.8, 0.204, 39.9], [11.9, 0.185, 45.7],
    [13.1, 0.224, 34.5], [14.6, 0.163, 44.3], [16.5, 0.216, 34.8], [19.4, 0.173, 34.8], [28.2, 0.193, 27.5]];
  const dec = document.getElementById("deciles");
  if (!dec) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    parent && parent.appendChild(n);
    return n;
  };
  const txt = (p, a, s) => { const n = el("text", a, p); n.textContent = s; return n; };

  function renderDec() {
    const W = Math.round(dec.clientWidth), narrow = W < 640;
    const pw = narrow ? W : (W - 40) / 2, ph = narrow ? 190 : 230;
    const H = narrow ? ph * 2 + 30 : ph;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg", role: "img",
      "aria-label": "Mean gap is flat across disability deciles while the share of tracts with any gap rises from about 56 to 72 percent" });
    const panels = [
      { title: "Average gap, miles", vals: DEC.map((d) => d[1]), max: 0.3, ticks: [0, 0.1, 0.2, 0.3], f: (v) => v.toFixed(2) + " mi", cls: "bar-blue" },
      { title: "Tracts with any gap", vals: DEC.map((d) => 100 - d[2]), max: 100, ticks: [0, 50, 100], f: (v) => Math.round(v) + "%", cls: "bar-orange" },
    ];
    const reads = [];
    panels.forEach((p, k) => {
      const gx = narrow ? 0 : k * (pw + 40), gy = narrow ? k * (ph + 30) : 0;
      const L = 34, T = 34, B = 26, bw = (pw - L) / 10;
      const y = (v) => gy + T + (1 - v / p.max) * (ph - T - B);
      txt(svg, { x: gx, y: gy + 12, class: "c-title" }, p.title);
      reads.push(txt(svg, { x: gx + pw, y: gy + 12, class: "c-read", style: "text-anchor:end" }, ""));
      p.ticks.forEach((t) => {
        el("line", { x1: gx + L, x2: gx + pw, y1: y(t), y2: y(t), class: t ? "c-grid" : "c-zero" }, svg);
        txt(svg, { x: gx + L - 6, y: y(t) + 4, class: "c-tick", style: "text-anchor:end" }, k ? t + "%" : t.toFixed(1));
      });
      p.vals.forEach((v, i) => {
        el("rect", { x: gx + L + i * bw + 3, y: y(v), width: bw - 6, height: y(0) - y(v), class: p.cls, "data-i": i }, svg);
      });
      txt(svg, { x: gx + L, y: gy + ph - 6, class: "c-tick", style: "text-anchor:start" }, "fewest with a disability");
      txt(svg, { x: gx + pw, y: gy + ph - 6, class: "c-tick", style: "text-anchor:end" }, "most →");
    });
    const show = (i) => {
      svg.querySelectorAll("rect").forEach((r) => r.classList.toggle("on", +r.dataset.i === i));
      reads[0].textContent = i == null ? "" : `group ${i + 1} · ${DEC[i][0]}% · ${panels[0].f(panels[0].vals[i])}`;
      reads[1].textContent = i == null ? "" : panels[1].f(panels[1].vals[i]);
    };
    svg.addEventListener("pointermove", (e) => {
      const r = e.target.closest("rect");
      if (r) show(+r.dataset.i);
    });
    svg.addEventListener("pointerleave", () => show(9));
    show(9);
    dec.replaceChildren(svg);
  }
  renderDec();
  let lastDW = dec.clientWidth, td = null;
  addEventListener("resize", () => {
    clearTimeout(td);
    td = setTimeout(() => { if (Math.abs(dec.clientWidth - lastDW) > 4) { lastDW = dec.clientWidth; renderDec(); } }, 120);
  });
})();
