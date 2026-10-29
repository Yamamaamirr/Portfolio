// Geofence demo: three synthetic truck routes on a made-up street grid. Drag the orange shape (or its corners)
// and the routes are clipped to it the way the dashboard's PostGIS query does, with the totals inside.
(() => {
  const cv = document.getElementById("fence");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = 1000, H = 620;                  // logical map units; 1 unit = 5 m
  const KM = 0.005;
  const ANG = -0.5, CX = 500, CY = 310;      // street grid tilted like Manhattan's
  const AV = 78, ST = 34;                    // avenue and street spacing
  const TRUCKS = [
    { name: "Truck A", color: "#1f4e79", seed: 7, start: [-3, -4] },
    { name: "Truck B", color: "#c8782f", seed: 19, start: [2, 5] },
    { name: "Truck C", color: "#4f7fa8", seed: 41, start: [1, 1] },
  ];
  const START_FENCE = [[420, 170], [610, 150], [690, 300], [585, 450], [395, 400], [345, 280]];

  const rot = (u, v) => [CX + u * Math.cos(ANG) - v * Math.sin(ANG), CY + u * Math.sin(ANG) + v * Math.cos(ANG)];
  const node = (i, j) => rot(i * AV, j * ST);
  const inMap = ([x, y]) => x > 30 && x < W - 30 && y > 30 && y < H - 30;
  const rand = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

  // each route is a walk along the grid that never turns straight back
  for (const t of TRUCKS) {
    const r = rand(t.seed);
    let [i, j] = t.start, last = null;
    const pts = [[i, j]];
    while (pts.length < 90) {
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 1], [0, -1]].filter(([a, b]) => inMap(node(i + a, j + b)));
      const fwd = open.filter(([a, b]) => !last || a !== -last[0] || b !== -last[1]);
      const steps = fwd.length ? fwd : open;   // turn back only at a dead end on the map's edge
      const [a, b] = steps[Math.floor(r() * steps.length)];
      const run = a ? 1 : 1 + Math.floor(r() * 3);
      for (let k = 0; k < run && inMap(node(i + a, j + b)); k++) { i += a; j += b; pts.push([i, j]); }
      last = [a, b];
    }
    t.pts = pts.map(([a, b]) => node(a, b));
    t.imp = t.pts.map(() => Math.round(40 + r() * r() * 900));   // impressions logged at each ping
    t.len = t.pts.reduce((s, p, k) => s + (k ? Math.hypot(p[0] - t.pts[k - 1][0], p[1] - t.pts[k - 1][1]) : 0), 0);
  }

  let fence = START_FENCE.map((p) => p.slice());
  const inside = (x, y) => {
    let c = false;
    for (let a = 0, b = fence.length - 1; a < fence.length; b = a++) {
      const [xa, ya] = fence[a], [xb, yb] = fence[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
    }
    return c;
  };

  // clip by walking each segment in 3-unit steps: good enough at this scale, and the totals match the drawing
  function clip(t) {
    const runs = [];
    let km = 0, cur = null;
    for (let k = 1; k < t.pts.length; k++) {
      const [x0, y0] = t.pts[k - 1], [x1, y1] = t.pts[k];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
      for (let s = 0; s < n; s++) {
        const xa = x0 + ((x1 - x0) * s) / n, ya = y0 + ((y1 - y0) * s) / n;
        const xb = x0 + ((x1 - x0) * (s + 1)) / n, yb = y0 + ((y1 - y0) * (s + 1)) / n;
        const isIn = inside((xa + xb) / 2, (ya + yb) / 2);
        if (isIn) km += Math.hypot(xb - xa, yb - ya) * KM;
        if (!cur || cur.in !== isIn) { cur = { in: isIn, pts: [[xa, ya]] }; runs.push(cur); }
        cur.pts.push([xb, yb]);
      }
    }
    const imp = t.pts.reduce((s, p, k) => s + (inside(p[0], p[1]) ? t.imp[k] : 0), 0);
    return { runs, km, imp, share: km / (t.len * KM) };
  }

  let scale = 1, dpr = 1;
  function size() {
    const w = cv.clientWidth;
    dpr = Math.min(devicePixelRatio || 1, 2);
    scale = w / W;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(H * scale * dpr);
    cv.style.height = H * scale + "px";
    dirty = true;
  }

  let dirty = true, born = null, visible = false;   // the routes draw in the first time the map scrolls into view
  const reveal = () => (born === null ? 0 : Math.min(1, (performance.now() - born) / 2200));

  function draw(now) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = "#fffff8";
    ctx.fillRect(0, 0, W, H);

    // river along the west edge, then the street grid
    ctx.fillStyle = "rgba(79,127,168,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(120, 0);
    ctx.bezierCurveTo(70, 200, 40, 380, 70, H); ctx.lineTo(0, H); ctx.fill();
    ctx.strokeStyle = "rgba(20,20,20,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) { const a = node(i, -30), b = node(i, 30); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let j = -30; j <= 30; j++) { const a = node(-12, j), b = node(12, j); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();

    // the geofence
    ctx.beginPath();
    fence.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = "rgba(200,120,47,0.08)";
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#c8782f";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);

    const rv = reveal(), stats = [];
    ctx.lineCap = ctx.lineJoin = "round";
    for (const t of TRUCKS) {
      const c = clip(t);
      stats.push(c);
      const total = c.runs.reduce((s, r) => s + r.pts.length - 1, 0);
      let budget = Math.floor(total * rv);
      for (const r of c.runs) {
        if (budget <= 0) break;
        const n = Math.min(r.pts.length - 1, budget);
        budget -= n;
        ctx.beginPath();
        for (let k = 0; k <= n; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, r.pts[k][0], r.pts[k][1]);
        ctx.strokeStyle = t.color;
        ctx.globalAlpha = r.in ? 1 : 0.32;
        ctx.lineWidth = r.in ? 4 : 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // impression pings inside the fence, sized by impressions
      if (rv === 1) t.pts.forEach(([x, y], k) => {
        if (!inside(x, y)) return;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + Math.sqrt(t.imp[k]) / 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,248,0.85)";
        ctx.fill();
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
      // live position: a marker that keeps driving the route
      if (rv === 1) {
        const f = ((now / 1000) * 0.02 + t.seed * 0.13) % 1;
        const k = f * (t.pts.length - 1), a = Math.floor(k), p = t.pts[a], q = t.pts[a + 1], u = k - a;
        const x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.globalAlpha = 0.18; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.fill();
        ctx.strokeStyle = "#fffff8"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    // corner handles
    for (const [x, y] of fence) {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fffff8"; ctx.fill();
      ctx.strokeStyle = "#a65a1b"; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // north arrow and scale bar
    ctx.fillStyle = ctx.strokeStyle = "#646462";
    ctx.font = `15px ${monoFont()}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W - 46, 74); ctx.lineTo(W - 46, 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 46, 38); ctx.lineTo(W - 51, 50); ctx.lineTo(W - 41, 50); ctx.fill();
    ctx.fillText("N", W - 46, 88);
    const bar = 0.5 / KM;
    ctx.fillStyle = "rgba(255,255,248,0.9)";
    ctx.fillRect(W - 52 - bar, H - 70, bar + 24, 40);
    ctx.fillStyle = "#646462";
    ctx.beginPath(); ctx.moveTo(W - 40 - bar, H - 40); ctx.lineTo(W - 40, H - 40);
    ctx.moveTo(W - 40 - bar, H - 45); ctx.lineTo(W - 40 - bar, H - 35);
    ctx.moveTo(W - 40, H - 45); ctx.lineTo(W - 40, H - 35); ctx.stroke();
    ctx.fillText("500 m", W - 40 - bar / 2, H - 50);

    return stats;
  }

  const rows = document.querySelectorAll("#fence-read tbody tr");
  const fmt = (n) => n.toLocaleString("en-US");
  let lastRead = "";
  function readout(stats) {
    const key = stats.map((s) => `${s.km.toFixed(2)}|${s.imp}`).join(",");
    if (key === lastRead) return;
    lastRead = key;
    stats.forEach((s, k) => {
      const td = rows[k].children;
      td[1].textContent = s.km.toFixed(1) + " km";
      td[2].textContent = Math.round(s.share * 100) + "%";
      td[3].textContent = fmt(s.imp);
    });
    const tot = rows[3].children;
    tot[1].textContent = stats.reduce((a, s) => a + s.km, 0).toFixed(1) + " km";
    tot[2].textContent = "";
    tot[3].textContent = fmt(stats.reduce((a, s) => a + s.imp, 0));
  }

  // dragging: a corner moves alone, anywhere inside moves the whole shape
  let drag = null;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / scale, (e.clientY - b.top) / scale]; };
  cv.addEventListener("pointerdown", (e) => {
    const [x, y] = at(e);
    const hit = fence.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 16 / Math.min(1, scale));
    if (hit >= 0) drag = { k: hit };
    else if (inside(x, y)) drag = { all: true, x, y };
    else return;
    cv.setPointerCapture(e.pointerId);
    cv.classList.add("dragging");
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    const [x, y] = at(e);
    if (!drag) {
      const over = fence.some(([px, py]) => Math.hypot(px - x, py - y) < 16 / Math.min(1, scale)) || inside(x, y);
      cv.style.cursor = over ? "grab" : "default";
      return;
    }
    const cx = Math.max(10, Math.min(W - 10, x)), cy = Math.max(10, Math.min(H - 10, y));
    if (drag.k !== undefined) fence[drag.k] = [cx, cy];
    else { const dx = x - drag.x, dy = y - drag.y; fence = fence.map(([px, py]) => [px + dx, py + dy]); drag.x = x; drag.y = y; }
  });
  const stop = () => { drag = null; cv.classList.remove("dragging"); };
  cv.addEventListener("pointerup", stop);
  cv.addEventListener("pointercancel", stop);
  document.getElementById("fence-reset").addEventListener("click", () => { fence = START_FENCE.map((p) => p.slice()); });

  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && born === null) born = performance.now();
  }).observe(cv);
  addEventListener("resize", size);
  size();
  (function loop(now) {
    if (visible || dirty) { readout(draw(now)); dirty = false; }
    requestAnimationFrame(loop);
  })(performance.now());
})();
