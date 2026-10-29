// Earthbound chapter: one scroll step per app. On desktop the visuals take over the
// dashboard panel; on phones they stay pinned above the text.
// App 1 follows the hydrotechnical dashboard's own logic: each stage carries a channel
// polygon (the scoured water section), the bed at that stage is min(terrain, channel),
// and the x-range is the extent of every stage's channel.
const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const NS = "http://www.w3.org/2000/svg";
const FT = 3.28084, CFS = 35.3147;

const apps = $("#apps"), stage = $("#app-stage"), panel = $(".panel"), inner = $(".panel-inner");
const steps = [...apps.querySelectorAll(".app-step")];
const views = [...stage.querySelectorAll(".app-view")];
const desktop = matchMedia("(min-width: 901px)");

function place() {
  if (desktop.matches) {
    inner.appendChild(stage);
    const head = inner.querySelector(".row-head");
    inner.style.setProperty("--stage-top", `${head.offsetTop + head.offsetHeight + 18}px`);
  } else {
    apps.insertBefore(stage, apps.firstChild);
    stage.classList.remove("live");
  }
}
desktop.addEventListener("change", place);
addEventListener("resize", place);
place();

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmt = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

// ───────── App 1: hydrotechnical scenario ─────────
let X = null;
const hx = { stageSvg: $("#hx-stage"), xsSvg: $("#hx-xs"), read: $("#hx-read") };

// same as the dashboard: the first channel segment spanning x gives the bed there
function channelAt(x, ch) {
  for (let i = 0; i < ch.length - 1; i++) {
    const [x1, y1] = ch[i], [x2, y2] = ch[i + 1];
    if ((x1 <= x && x <= x2) || (x2 <= x && x <= x1)) {
      if (x1 === x2) return Math.max(y1, y2);
      return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    }
  }
  return null;
}

function prepare(d) {
  const stages = d.stages.filter((s) => s.stage > 0 && s.channel.length >= 3).sort((a, b) => a.stage - b.stage);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const s of stages) for (const [x, y] of s.channel) {
    xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
  }
  const profile = d.profile.filter((p) => p[0] >= xMin && p[0] <= xMax && p[1] != null && p[2] != null);
  for (const [, t, p] of profile) { yMin = Math.min(yMin, t, p); yMax = Math.max(yMax, t, p); }
  // each stage's eroded bed and how deep the river has cut below the original ground
  // one sweep per stage instead of searching every segment for every point: the same answer as
  // channelAt (the first segment spanning each x), found by binary search over the sorted profile
  const xs = profile.map((p) => p[0]), sorted = xs.every((x, i) => !i || xs[i - 1] <= x);
  const lowerBound = (v) => { let a = 0, b = xs.length; while (a < b) { const m = (a + b) >> 1; if (xs[m] < v) a = m + 1; else b = m; } return a; };
  const bedOf = (ch) => {
    if (!sorted) return profile.map(([x]) => channelAt(x, ch));
    const out = new Array(xs.length).fill(null), next = Array.from({ length: xs.length + 1 }, (_, i) => i);
    const find = (i) => { while (next[i] !== i) { next[i] = next[next[i]]; i = next[i]; } return i; }; // next unfilled point
    for (let i = 0; i < ch.length - 1; i++) {
      const [x1, y1] = ch[i], [x2, y2] = ch[i + 1], lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      for (let k = find(lowerBound(lo)); k < xs.length && xs[k] <= hi; k = find(k + 1)) {
        out[k] = x1 === x2 ? Math.max(y1, y2) : y1 + ((xs[k] - x1) / (x2 - x1)) * (y2 - y1);
        next[k] = k + 1;
      }
    }
    return out;
  };
  for (const s of stages) {
    const cs = bedOf(s.channel);
    s.bed = profile.map(([, t], i) => (cs[i] === null ? t : Math.min(t, cs[i])));
    s.scour = Math.max(0, ...profile.map(([, t], i) => t - s.bed[i]));
  }
  const top = d.named.max_flow_10yr.stage;
  return { ...d, stages, profile, xMin, xMax, yMin: yMin - 1, yMax: yMax + 5, last: stages.findIndex((s) => s.stage >= top - 0.05) };
}

// stage gauge, drawn like the sheet's scale bar: ink/paper blocks every 5 ft that
// turn blue as the river rises, with the named scenarios as notches above
function drawStageChart(st) {
  const svg = hx.stageSvg, w = svg.clientWidth, h = svg.clientHeight;
  if (!w || !h) return;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  const maxFt = Math.ceil((X.stages.at(-1).stage * FT) / 5) * 5, nowFt = st.stage * FT;
  const L = 2, R = 2, y0 = 34, bh = 9;
  const sx = (ft) => L + (ft / maxFt) * (w - L - R);
  el("text", { x: L, y: 10, "letter-spacing": "0.08em", fill: "#1f4e79" }, svg).textContent = "STAGE GAUGE";
  el("text", { x: w - R, y: 10, "text-anchor": "end", class: "ink" }, svg).textContent = `${fmt(nowFt, 1)} ft`;
  for (let ft = 0; ft < maxFt; ft += 5) {
    const odd = (ft / 5) % 2, wet = ft + 5 <= nowFt;
    el("rect", { x: sx(ft), y: y0, width: sx(ft + 5) - sx(ft), height: bh, fill: wet ? (odd ? "#4f7fa8" : "#1f4e79") : odd ? "#fffff8" : "#141414" }, svg);
    if (!wet && ft < nowFt) // the block the water is part-way up
      el("rect", { x: sx(ft), y: y0, width: sx(nowFt) - sx(ft), height: bh, fill: odd ? "#4f7fa8" : "#1f4e79" }, svg);
  }
  el("rect", { x: sx(0), y: y0, width: sx(maxFt) - sx(0), height: bh, fill: "none", stroke: "#141414", "stroke-width": 1 }, svg);
  for (const [k, v] of [["2-yr", X.named.max_flow_2yr.stage], ["mean", X.named.mean_flow_annual.stage], ["10-yr", X.named.max_flow_10yr.stage]]) {
    const x = sx(v * FT), passed = nowFt >= v * FT - 0.1;
    const c = passed ? "#a65a1b" : "#646462";
    el("line", { x1: x, x2: x, y1: y0 - 7, y2: y0, stroke: c, "stroke-width": passed ? 1.6 : 1 }, svg);
    el("text", { x: Math.min(x, w - R - 14), y: y0 - 10, "text-anchor": "middle", fill: c }, svg).textContent = k;
  }
  const x = sx(nowFt);
  el("path", { d: `M${x},${y0 + bh + 1} l5,7 h-10 z`, fill: "#c8782f" }, svg);
  for (let ft = 0; ft <= maxFt; ft += 10)
    el("text", { x: sx(ft), y: h - 2, "text-anchor": ft === 0 ? "start" : ft === maxFt ? "end" : "middle" }, svg).textContent = ft === maxFt ? `${ft} ft` : ft;
}

function drawSection(st) {
  const svg = hx.xsSvg, w = svg.clientWidth, h = svg.clientHeight;
  if (!w || !h) return;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  const P = X.profile, bed = st.bed;
  // an extruded block seen slightly from above: the front face carries the axes and the
  // top surfaces recede by (DX, -DY); the whole block stays inside the plot area
  const DX = Math.round(Math.min(34, w * 0.04)), DY = Math.round(DX * 0.6);
  const L = 46, R = 10, T = 8, B = 20, pw = w - L - R - DX, ph = h - T - B - DY;
  const sx = (v) => L + ((v - X.xMin) / (X.xMax - X.xMin)) * pw;
  const sy = (z) => T + DY + (1 - (z - X.yMin) / (X.yMax - X.yMin)) * ph;
  const xy = (x, z) => `${sx(x).toFixed(1)},${sy(z).toFixed(1)}`;
  const bedPts = P.map((p, i) => xy(p[0], bed[i]));
  const back = (pts, f = 1) => pts.map((q) => { const [a, b] = q.split(","); return `${(+a + DX * f).toFixed(1)},${(+b - DY * f).toFixed(1)}`; });
  const wse = st.wse, chx = st.channel.map((p) => p[0]), c0 = Math.min(...chx), c1 = Math.max(...chx);

  const defs = el("defs", {}, svg);
  const grad = (id, stops) => {
    const g = el("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    for (const [o, c, a] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g);
  };
  // sandy ground and stippled grass, as on the channel-migration map
  grad("hx-soil", [[0, "#ece3cc", 1], [0.08, "#e6dcc2", 1], [1, "#efe9da", 1]]);
  grad("hx-water", [[0, "#4f7fa8", 0.55], [1, "#1f4e79", 0.8]]);
  const dots = el("pattern", { id: "hx-grain", width: 8, height: 7, patternUnits: "userSpaceOnUse" }, defs);
  el("circle", { cx: 2, cy: 2, r: 0.65, fill: "#8a7a55", opacity: 0.35 }, dots);
  el("circle", { cx: 6, cy: 5.5, r: 0.5, fill: "#8a7a55", opacity: 0.25 }, dots);
  const grass = el("pattern", { id: "hx-grass", width: 5, height: 4, patternUnits: "userSpaceOnUse" }, defs);
  el("circle", { cx: 2.5, cy: 2, r: 0.75, fill: "#6f7f4f", "fill-opacity": 0.5 }, grass);
  const hatch = el("pattern", { id: "hx-scour", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "#a65a1b", "stroke-width": 1.2, opacity: 0.6 }, hatch);
  el("rect", { x: L, y: T, width: pw + DX, height: ph + DY }, el("clipPath", { id: "hx-clip" }, defs));

  const g = el("g", { "clip-path": "url(#hx-clip)" }, svg);

  // relative elevation grid, every 20 ft above the lowest point of pipe or ground
  const yTicks = [];
  for (let ft = 0; ft / FT <= X.yMax - X.yMin; ft += 20) yTicks.push(ft);
  for (const ft of yTicks) el("line", { x1: L, x2: L + pw, y1: sy(X.yMin + ft / FT), y2: sy(X.yMin + ft / FT), stroke: "#141414", "stroke-opacity": 0.1, "stroke-width": 0.6, "stroke-dasharray": "1 3" }, g);

  // receding faces first: the ground's top surface with depth lines, the block's end face,
  // then the water surface lying over the submerged bed
  const topFace = [...bedPts, ...back(bedPts).reverse()].join(" ");
  el("polygon", { points: topFace, fill: "#e5e6d3" }, g);
  el("polygon", { points: topFace, fill: "url(#hx-grass)" }, g);
  el("polyline", { points: back(bedPts).join(" "), fill: "none", stroke: "#5a4e36", "stroke-width": 0.6, opacity: 0.4 }, g);
  const xe = sx(P.at(-1)[0]), ye = sy(bed.at(-1));
  el("polygon", { points: `${xe},${ye} ${xe + DX},${ye - DY} ${xe + DX},${h - B - DY} ${xe},${h - B}`, fill: "#d8c9a3", stroke: "#8f8672", "stroke-width": 0.6 }, g);
  if (st.width > 0) {
    const a = sx(c0), b = sx(c1), y = sy(wse);
    el("polygon", { points: `${a},${y} ${b},${y} ${b + DX},${y - DY} ${a + DX},${y - DY}`, fill: "#4f7fa8", opacity: 0.32 }, g);
    for (const f of [1 / 3, 2 / 3]) el("line", { x1: a + DX * f, x2: b + DX * f, y1: y - DY * f, y2: y - DY * f, stroke: "#fffff8", "stroke-width": 0.6, opacity: 0.6 }, g);
  }

  // front face: soil gradient with a little grain, cut to the eroded bed
  const soil = [...bedPts, `${L + pw},${h - B}`, `${L},${h - B}`].join(" ");
  el("polygon", { points: soil, fill: "url(#hx-soil)" }, g);
  el("polygon", { points: soil, fill: "url(#hx-grain)" }, g);

  // what this stage has scoured away: between the original surface and the eroded bed
  let run = [];
  const flush = () => {
    if (run.length > 1) el("polygon", { points: [...run.map((i) => xy(P[i][0], P[i][1])), ...run.slice().reverse().map((i) => xy(P[i][0], bed[i]))].join(" "), fill: "url(#hx-scour)" }, g);
    run = [];
  };
  P.forEach((p, i) => (p[1] - bed[i] > 0.05 ? run.push(i) : flush()));
  flush();

  // water: the stage's channel polygon, darkening with depth, and its surface line
  el("polygon", { points: st.channel.map(([x, y]) => xy(x, y)).join(" "), fill: "url(#hx-water)" }, g);
  // ground line in ink, a touch heavier where it is dry land
  el("polyline", { points: bedPts.join(" "), fill: "none", stroke: "#5a4e36", "stroke-width": 1, "stroke-linejoin": "round" }, g);
  let dry = [];
  const land = () => { if (dry.length > 1) el("polyline", { points: dry.join(" "), fill: "none", stroke: "#5a4e36", "stroke-width": 1.5, "stroke-linejoin": "round" }, g); dry = []; };
  P.forEach((p, i) => (bed[i] >= wse || p[0] < c0 || p[0] > c1 ? dry.push(bedPts[i]) : land()));
  land();
  const wl = sy(wse);
  el("line", { x1: sx(c0), x2: sx(c1), y1: wl, y2: wl, stroke: "#1f4e79", "stroke-width": 1.2 }, g);

  // pipe: dark casing with an orange core; any stretch the bed has reached is ringed
  const pipePts = P.map((p) => xy(p[0], p[2])).join(" ");
  run = [];
  const exposed = () => { if (run.length > 1) el("polyline", { points: run.join(" "), fill: "none", stroke: "#c8782f", "stroke-width": 9, opacity: 0.3, "stroke-linecap": "round" }, g); run = []; };
  P.forEach((p, i) => (bed[i] - p[2] < 0.15 && p[0] >= c0 && p[0] <= c1 ? run.push(xy(p[0], p[2])) : exposed()));
  exposed();
  el("polyline", { points: pipePts, fill: "none", stroke: "#141414", "stroke-width": 4, "stroke-linejoin": "round" }, g);
  el("polyline", { points: pipePts, fill: "none", stroke: "#c8782f", "stroke-width": 2.2, "stroke-linejoin": "round" }, g);

  // surveyor's water-level mark at the right edge of the water
  const mx = Math.min(sx(c1) - 14, L + pw - 14);
  el("path", { d: `M${mx - 5},${wl - 9} L${mx + 5},${wl - 9} L${mx},${wl - 2} Z`, fill: "none", stroke: "#1f4e79", "stroke-width": 1.2 }, g);
  el("text", { x: mx - 9, y: wl - 4, "text-anchor": "end", fill: "#1f4e79" }, g).textContent = `${fmt(st.stage * FT, 1)} ft`;

  // frame and axes
  el("path", { d: `M${L},${T + DY} V${h - B} H${L + pw}`, fill: "none", stroke: "#141414", "stroke-width": 1 }, svg);
  for (const ft of yTicks) {
    const y = sy(X.yMin + ft / FT);
    el("line", { x1: L - 4, x2: L, y1: y, y2: y, stroke: "#141414" }, svg);
    el("text", { x: L - 7, y: y + 3, "text-anchor": "end" }, svg).textContent = ft === yTicks.at(-1) ? `${ft} ft` : ft;
  }
  for (let ft = 0, step = pw < 420 ? 1000 : 500; ft / FT <= X.xMax - X.xMin; ft += step) {
    const x = sx(X.xMin + ft / FT);
    el("line", { x1: x, x2: x, y1: h - B, y2: h - B + 4, stroke: "#141414" }, svg);
    if (x < L + pw - 100) el("text", { x, y: h - 5, "text-anchor": "middle" }, svg).textContent = fmt(ft);
  }
  el("text", { x: L + pw, y: h - 5, "text-anchor": "end" }, svg).textContent = "ft along pipe";
  // vertical exaggeration, noted on the drawing itself as on a surveyed profile
  const ve = Math.round(((X.xMax - X.xMin) / pw) / ((X.yMax - X.yMin) / ph));
  el("rect", { x: L + 5, y: h - B - 18, width: 58, height: 13, fill: "#fffff8", opacity: 0.85 }, svg);
  el("text", { x: L + 9, y: h - B - 8, class: "ink" }, svg).textContent = `V.E. ${ve}×`;
}

function drawHydro(t) {
  if (!X) return;
  const st = X.stages[Math.round(smooth(clamp(t * 1.25)) * X.last)];
  drawStageChart(st);
  drawSection(st);
  const n = X.named;
  const label = st.stage >= n.max_flow_10yr.stage - 0.05 ? "10-year flood" : st.stage >= n.mean_flow_annual.stage - 0.05 ? "above mean" : st.stage >= n.max_flow_2yr.stage - 0.05 ? "above 2-year" : "low flow";
  const rows = [
    ["Stage", `${fmt(st.stage * FT, 1)} ft`],
    ["Flow", `${fmt(st.flow * CFS)} cfs`],
    ["Scenario", label],
    ["Bed scoured", `${fmt(st.scour * FT, 1)} ft`, st.scour > 0.3],
    ["Min. depth of cover", `${fmt(st.min_cover * FT, 1)} ft`, st.min_cover < 1],
    ["Exposure", `${fmt(st.exposure * FT, 1)} ft`, st.exposure > 0],
  ];
  hx.read.innerHTML = rows.map(([k, v, warn]) => `<div${warn ? ' class="warn"' : ""}><span>${k}</span><b>${v}</b></div>`).join("");
}

// ───────── App 2: 3D pipeline viewer ─────────
// The viewer's own model for one stretch of line, laid out the way its studio mode lays it out:
// terrain coloured by height, the section curtain standing along the pipe, the pipe, and a
// reference plane under it all. The colours are the page's, not the viewer's: water in blue,
// ground from sage to paper, with a contour every metre of height.
const m3 = { box: $("#m3d"), read: $("#m3d-read"), started: false, ready: false };
let PV = null; // ground surface, modelled pipe and surveys, for the readouts
const VE3 = 2.6; // the studio's z-axis scale

async function start3D() {
  if (m3.started) return;
  m3.started = true;
  const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
    import("three"), import("three/addons/loaders/GLTFLoader.js"), import("three/addons/controls/OrbitControls.js"),
  ]);
  const gltf = await new GLTFLoader().loadAsync("assets/earthbound/domain.glb?v=2");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  m3.box.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.75, 1, 5000);
  // low, raking light so the small relief reads, like a hillshade
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x6b6250, 0.9));
  const key = new THREE.DirectionalLight(0xfff4dc, 2.4); key.position.set(-120, 90, 60); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9f5, 0.35); fill.position.set(80, 60, -60); scene.add(fill);

  // the model's three meshes, in order: terrain, pipe, section curtain
  const meshes = [];
  gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
  const [terrain, pipe, curtain] = meshes;

  // recolour the terrain with a hypsometric ramp of many stops, so a metre of relief shifts the
  // colour the way the viewer's ramp does. The flat lowest level is the river's water surface,
  // coloured as the river is on the other two figures: light shallows along the banks deepening
  // to the channel, with a sandy edge on the bank.
  const pos = terrain.geometry.attributes.position, n = pos.count;
  let zLo = Infinity, zHi = -Infinity, xLo = Infinity, yLo = Infinity;
  for (let i = 0; i < n; i++) {
    zLo = Math.min(zLo, pos.getZ(i)); zHi = Math.max(zHi, pos.getZ(i));
    xLo = Math.min(xLo, pos.getX(i)); yLo = Math.min(yLo, pos.getY(i));
  }
  // the terrain is a 1 m grid: distance from every point to the water's edge, either side
  let gx = 0, gy = 0;
  for (let i = 0; i < n; i++) { gx = Math.max(gx, Math.round(pos.getX(i) - xLo)); gy = Math.max(gy, Math.round(pos.getY(i) - yLo)); }
  gx++; gy++;
  const cell = new Int32Array(n), wetG = new Uint8Array(gx * gy), dist = new Float32Array(gx * gy).fill(Infinity);
  for (let i = 0; i < n; i++) {
    cell[i] = Math.round(pos.getY(i) - yLo) * gx + Math.round(pos.getX(i) - xLo);
    if (pos.getZ(i) < zLo + 0.05) wetG[cell[i]] = 1;
  }
  const q = [];
  for (let k = 0; k < gx * gy; k++) {
    const x = k % gx, y = (k / gx) | 0;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const u = x + dx, v = y + dy;
      return u >= 0 && v >= 0 && u < gx && v < gy && wetG[v * gx + u] !== wetG[k];
    });
    if (edge) { dist[k] = 0; q.push(k); }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % gx, y = (k / gx) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = x + dx, v = y + dy, m = v * gx + u;
      if (u < 0 || v < 0 || u >= gx || v >= gy || dist[m] <= dist[k] + 1) continue;
      dist[m] = dist[k] + 1; q.push(m);
    }
  }
  const deep = new THREE.Color("#2f5f8c"), shallow = new THREE.Color("#8fb3d1"), bank = new THREE.Color("#d8c9a3");
  const ramp = ["#6f7f55", "#8d965f", "#a9a56c", "#c2b07a", "#b89a6e", "#cdb48c", "#dccaa4", "#e9dcbd", "#f4ecd8"].map((h) => new THREE.Color(h));
  const col = new Float32Array(n * 4), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const z = pos.getZ(i), d = dist[cell[i]], wet = wetG[cell[i]];
    if (wet) c.lerpColors(shallow, deep, Math.min(1, d / 14) ** 0.7);
    else {
      const t = Math.min(0.999, Math.pow((z - zLo) / (zHi - zLo), 0.8)) * (ramp.length - 1), k = Math.floor(t);
      c.lerpColors(ramp[k], ramp[k + 1], t - k);
      if (d < 4) c.lerp(bank, 0.7 * (1 - d / 4));
    }
    col.set([c.r, c.g, c.b, 1], i * 4);
  }
  terrain.geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
  terrain.geometry.computeVertexNormals();
  const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  tmat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vH;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvH = position.z;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vH;").replace("#include <color_fragment>", `#include <color_fragment>
      float d = abs(fract(vH * 0.5 - 0.5) - 0.5) / max(fwidth(vH * 0.5), 1e-4);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.24, 0.18), (1.0 - min(d, 1.0)) * 0.12 * step(${(zLo + 0.05).toFixed(2)}, vH));`);
  };
  terrain.material = tmat;
  // the pipe is redrawn below as a round tube, which the exaggeration would otherwise flatten
  pipe.visible = false;
  curtain.material = new THREE.MeshBasicMaterial({ color: 0x1f4e79, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  curtain.renderOrder = 2;

  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.scale.set(1, 1, VE3);
  for (const m of meshes) root.add(m);
  // the curtain's outline, so it reads as a sheet rather than a haze
  root.add(new THREE.LineSegments(new THREE.EdgesGeometry(curtain.geometry, 30), new THREE.LineBasicMaterial({ color: 0x1f4e79, transparent: true, opacity: 0.45 })));
  const bb = new THREE.Box3().setFromBufferAttribute(pos);

  // the reference plane at the base, ruled every 25 m, reaching a little past the terrain
  const pw = Math.ceil((bb.max.x - bb.min.x) * 1.1 / 25) * 25, pd = Math.ceil((bb.max.y - bb.min.y) * 1.2 / 25) * 25;
  const pc = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, 0);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshBasicMaterial({ color: 0xe9e6d6, side: THREE.DoubleSide }));
  plane.position.copy(pc);
  root.add(plane);
  const gp = [];
  for (let x = -pw / 2; x <= pw / 2 + 0.1; x += 25) gp.push(pc.x + x, pc.y - pd / 2, 0.05, pc.x + x, pc.y + pd / 2, 0.05);
  for (let y = -pd / 2; y <= pd / 2 + 0.1; y += 25) gp.push(pc.x - pw / 2, pc.y + y, 0.05, pc.x + pw / 2, pc.y + y, 0.05);
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
  root.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xb5ae96 })));

  const cc = bb.getCenter(new THREE.Vector3());
  root.position.set(-cc.x, -cc.z * VE3 * 0.5, cc.y);
  scene.add(root);
  scene.updateMatrixWorld(true);

  // a faint ripple over the water, as on the channel map: light streaks along the flow
  const rc = document.createElement("canvas"); rc.width = rc.height = 256;
  const rx = rc.getContext("2d");
  for (let k = 0; k < 260; k++) {
    rx.strokeStyle = `rgba(255,255,248,${0.15 + Math.random() * 0.35})`;
    rx.lineWidth = 0.6 + Math.random();
    const x = Math.random() * 256, y = Math.random() * 256, l = 8 + Math.random() * 30;
    rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x + l, y + (Math.random() - 0.5) * 2); rx.stroke();
  }
  const rt = new THREE.CanvasTexture(rc);
  rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
  rt.repeat.set((bb.max.x - bb.min.x) / 60, (bb.max.y - bb.min.y) / 60);
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(bb.max.x - bb.min.x, bb.max.y - bb.min.y), new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.45, depthWrite: false }));
  ripple.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, zLo + 0.04);
  root.add(ripple);

  // the pipe's centreline from the model's pipe mesh, averaged in 5 m bins and smoothed, then
  // drawn in world space so the exaggeration doesn't flatten it
  const pp = pipe.geometry.attributes.position, bins = new Map();
  for (let i = 0; i < pp.count; i++) {
    const k = Math.round(pp.getX(i) / 5), b = bins.get(k) || [0, 0, 0, 0];
    b[0] += pp.getX(i); b[1] += pp.getY(i); b[2] += pp.getZ(i); b[3]++;
    bins.set(k, b);
  }
  const raw = [...bins.values()].map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]).sort((a, b) => a[0] - b[0]);
  const line = raw.map((p, k) => {
    const nb = raw.slice(Math.max(0, k - 1), k + 2);
    return root.localToWorld(new THREE.Vector3(p[0], nb.reduce((a, r) => a + r[1], 0) / nb.length, nb.reduce((a, r) => a + r[2], 0) / nb.length));
  });
  // a lit, coated steel pipe rather than a stroke: shaded round its length by the same light as
  // the ground, a little see-through where the ground hides it
  const curve = new THREE.CatmullRomCurve3(line);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2693a, roughness: 0.38, metalness: 0.12, emissive: 0x3a1608, depthTest: false, transparent: true, opacity: 0.95 });
  const pipeMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 1.45, 18), steel);
  pipeMesh.renderOrder = 4;
  scene.add(pipeMesh);

  // a three-quarter view facing the curtain; turning held to a range
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.45;
  // the viewer's angle: from the far side of the curtain, the river reach nearest
  const dir = new THREE.Vector3(0.55, 0.42, -1).normalize(), az0 = Math.atan2(dir.x, dir.z);
  controls.minAzimuthAngle = az0 - 0.3;
  controls.maxAzimuthAngle = az0 + 0.3;
  // a slow sway between the limits instead of spinning all the way round
  controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.3;
  const resize = () => {
    const { clientWidth: w, clientHeight: hh } = m3.box;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    const hz = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    camera.position.copy(dir).multiplyScalar((size.x * 0.47) / Math.tan(hz) + size.z * 0.5);
    camera.setViewOffset(w, hh, w * 0.02, -hh * 0.03, w, hh);
    camera.updateProjectionMatrix();
    controls.update();
  };
  new ResizeObserver(resize).observe(m3.box);
  resize();
  m3.render = () => {
    const az = controls.getAzimuthalAngle();
    if (az >= az0 + 0.27) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed);
    if (az <= az0 - 0.27) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed);
    controls.update();
    renderer.render(scene, camera);
  };
  m3.ready = true;
  last = "";
}

function draw3D() {
  if (!PV || !m3.ready) return;
  const at = (A, x) => { for (let i = 0; i < A.length - 1; i++) if (A[i][0] <= x && x <= A[i + 1][0]) return lerp(A[i][1], A[i + 1][1], (x - A[i][0]) / (A[i + 1][0] - A[i][0])); return null; };
  // cover only where there is ground over the pipe: over the river the surface is the water's
  const wl = Math.min(...PV.surface.map((p) => p[1])) + 1.5;
  const cover = PV.model.map(([x, y]) => [at(PV.surface, x), y]).filter(([g]) => g > wl).map(([g, y]) => g - y).filter(Number.isFinite);
  const err = Math.sqrt(PV.surveys.reduce((a, [x, y]) => a + (y - at(PV.model, x)) ** 2, 0) / PV.surveys.length);
  const ys = PV.surface.map((p) => p[1]);
  const rows = [
    ["Pipe shown", `${fmt((PV.model.at(-1)[0] - PV.model[0][0]) * FT)} ft`],
    ["Ground rises", `${fmt((Math.max(...ys) - Math.min(...ys)) * FT)} ft`],
    ["Relief shown", `${VE3}× vertical`],
    ["Cover on land", `${fmt(Math.max(0, Math.min(...cover)) * FT, 1)}–${fmt(Math.max(...cover) * FT, 1)} ft`],
    ["Surveys", PV.surveys.length],
    ["Model vs survey", `±${fmt(err * FT, 1)} ft`],
  ];
  m3.read.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
}

// ───────── App 3: channel migration ─────────
// The app's river masks: the channel traced from Sentinel imagery for each year, drawn over the
// pipelines. Scrolling steps through the years. The masks come from 10 m pixels, so their
// outlines are smoothed for drawing; earlier years stay as a stippled band, and the pipe is
// marked where it runs under this year's channel. Labels sit on the map instead of a key. The readouts are precomputed with the masks.
let SC = null;
const sc = { svg: $("#sc-map"), read: $("#sc-read") };

// corner-cutting smoothing for a closed ring of flat [x, y, x, y, …]
function chaikin(r, passes = 2) {
  for (let p = 0; p < passes; p++) {
    const o = [], n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, [ax, ay, bx, by] = [r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1]];
      o.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
    }
    r = o;
  }
  return r;
}

// nonzero winding test of a point against a year's rings
function inside(x, y, rings) {
  let wn = 0;
  for (const r of rings) {
    if (x < r.bb[0] || x > r.bb[2] || y < r.bb[1] || y > r.bb[3]) continue;
    for (let i = 0, n = r.length / 2; i < n; i++) {
      const j = (i + 1) % n, ay = r[2 * i + 1], by = r[2 * j + 1];
      const side = (r[2 * j] - r[2 * i]) * (y - ay) - (x - r[2 * i]) * (by - ay);
      if (ay <= y) { if (by > y && side > 0) wn++; } else if (by <= y && side < 0) wn--;
    }
  }
  return wn !== 0;
}

function prepareScour(d) {
  d.list = Object.keys(d.years).sort();
  d.rings = {};
  d.wet = {};
  // pipe sampled every 2 m
  const samples = d.pipes.map((r) => {
    const pts = [];
    for (let i = 0; i < r.length - 2; i += 2) {
      const [ax, ay, bx, by] = [r[i], r[i + 1], r[i + 2], r[i + 3]], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let t = 0; t < n; t++) pts.push([lerp(ax, bx, t / n), lerp(ay, by, t / n)]);
    }
    pts.push([r.at(-2), r.at(-1)]);
    return pts;
  });
  for (const y of d.list) {
    const rings = d.years[y].map((r) => {
      const s = chaikin(r);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); }
      s.bb = [x0, y0, x1, y1];
      return s;
    });
    d.rings[y] = rings;
    // runs of pipe under this year's channel
    d.wet[y] = [];
    for (const pts of samples) {
      let run = null;
      for (const [x, yy] of pts) {
        if (inside(x, yy, rings)) (run = run || []).push(x, yy);
        else if (run) { if (run.length > 2) d.wet[y].push(run); run = null; }
      }
      if (run && run.length > 2) d.wet[y].push(run);
    }
  }
  return d;
}

// the same smoothing for an open line, keeping its ends
function chaikinOpen(r, passes = 3) {
  for (let p = 0; p < passes; p++) {
    const o = [r[0], r[1]];
    for (let i = 0; i < r.length - 2; i += 2) {
      const [ax, ay, bx, by] = [r[i], r[i + 1], r[i + 2], r[i + 3]];
      o.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
    }
    o.push(r.at(-2), r.at(-1));
    r = o;
  }
  return r;
}

function drawScour(t) {
  if (!SC) return;
  const years = SC.list;
  const k = Math.min(years.length - 1, Math.floor(t * years.length));
  const { clientWidth: w, clientHeight: h } = sc.svg;
  if (!w || !h) return;
  const svg = sc.svg;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  // the window: the bend and the pipeline corridor, fitted to the frame's width
  const cx = 100, cy = -150, s = w / 1300;
  const X = (x) => (x - cx) * s + w / 2, Y = (y) => h / 2 - (y - cy) * s;
  const line = (r) => { let d = ""; for (let i = 0; i < r.length; i += 2) d += `${i ? "L" : "M"}${X(r[i]).toFixed(1)},${Y(r[i + 1]).toFixed(1)}`; return d; };
  const path = (rings) => rings.map((r) => line(r) + "Z").join("");
  const water = path(SC.rings[years[k]]);
  const pipes = (SC.smoothPipes ||= SC.pipes.map((r) => chaikinOpen(r))).map(line).join("");

  const defs = el("defs", {}, svg);
  // soft edges all round, so the river and pipes fade out rather than being cut off
  const fade = el("filter", { id: "sc-soft", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
  el("feGaussianBlur", { stdDeviation: 16 }, fade);
  const mask = el("mask", { id: "sc-fade" }, defs);
  el("rect", { x: 26, y: 26, width: w - 52, height: h - 52, fill: "#fff", filter: "url(#sc-soft)" }, mask);
  // water: a faint ripple, and lighter shallows along the banks
  const rip = el("filter", { id: "sc-ripple", x: 0, y: 0, width: "100%", height: "100%" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.012 0.09", numOctaves: 2, seed: 4 }, rip);
  el("feColorMatrix", { type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.62" }, rip);
  const deep = el("filter", { id: "sc-deep" }, defs);
  el("feMorphology", { operator: "erode", radius: 2.6 }, deep);
  el("feGaussianBlur", { stdDeviation: 2 }, deep);
  el("path", { id: "sc-w", d: water }, el("clipPath", { id: "sc-wclip" }, defs));
  // earlier channels as a fine stipple, land as a sparser one
  const dots = (id, gap, r, fill, op) => {
    const pt = el("pattern", { id, width: gap, height: gap, patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { cx: gap / 2, cy: gap / 2, r, fill, "fill-opacity": op }, pt);
  };
  dots("sc-old", 3.2, 0.75, "#1f4e79", 0.55);
  dots("sc-land", 9, 0.6, "#7d8a5c", 0.35);

  el("rect", { width: w, height: h, fill: "#f6f5ec" }, svg);
  const root = el("g", { mask: "url(#sc-fade)" }, svg);
  el("rect", { width: w, height: h, fill: "url(#sc-land)" }, root);

  // where the channel ran in earlier years
  const old = el("g", {}, root);
  for (let i = 0; i < k; i++) el("path", { d: path(SC.rings[years[i]]), fill: "#dfe6ea" }, old);
  for (let i = 0; i < k; i++) el("path", { d: path(SC.rings[years[i]]), fill: "url(#sc-old)" }, old);

  // the pipeline right-of-way: a cleared strip about 25 m wide
  el("path", { d: pipes, fill: "none", stroke: "#ebe4cf", "stroke-width": 25 * s, "stroke-linejoin": "round", "stroke-linecap": "round" }, root);

  // this year's river: sandy bank, deep water, lighter shallows at the edges, ripple
  el("path", { d: water, fill: "none", stroke: "#d8c9a3", "stroke-width": 4, "stroke-linejoin": "round" }, root);
  // shallow water first, then the deep channel as the same shape shrunk and softened, so the
  // masks' overlapping pieces never show as lines inside the river
  el("path", { d: water, fill: "#8fb3d1" }, root);
  el("path", { d: water, fill: "#2f5f8c", filter: "url(#sc-deep)" }, root);
  const inner = el("g", { "clip-path": "url(#sc-wclip)" }, root);
  el("rect", { width: w, height: h, filter: "url(#sc-ripple)", opacity: 0.16 }, inner);

  // pipelines on a paper halo, heavier with ticks where the river runs over them
  el("path", { d: pipes, fill: "none", stroke: "#fffff8", "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" }, root);
  el("path", { d: pipes, fill: "none", stroke: "#c8782f", "stroke-width": 1.7, "stroke-linejoin": "round", "stroke-linecap": "round" }, root);
  const wetRuns = SC.wet[years[k]];
  const wet = wetRuns.map(line).join("");
  el("path", { d: wet, fill: "none", stroke: "#fffff8", "stroke-width": 6.5, "stroke-linecap": "round" }, root);
  el("path", { d: wet, fill: "none", stroke: "#a65a1b", "stroke-width": 3.4, "stroke-linecap": "round" }, root);
  el("path", { d: wet, fill: "none", stroke: "#a65a1b", "stroke-width": 9, "stroke-dasharray": "1.2 5" }, root);

  // direct labels instead of a key
  const narrow = w < 520;
  const tag = (x, y, text, cls = "", anchor = "start") => { const n = el("text", { x, y, class: cls, "text-anchor": anchor }, svg); n.textContent = text; return n; };
  tag(X(-75), Y(-20), "Pipelines", "ink sc-lab", "end");
  tag(X(500), Y(-330), "River", "sc-lab sc-river");
  if (wetRuns.length) {
    // the longest run under the river, labelled with a short leader
    const run = wetRuns.reduce((a, b) => (b.length > a.length ? b : a));
    const m = Math.floor(run.length / 4) * 2, ax = X(run[m]), ay = Y(run[m + 1]);
    const lx = ax + (narrow ? 34 : 56), ly = ay + (narrow ? 34 : 46);
    el("path", { d: `M${ax + 5},${ay + 4}L${lx - 3},${ly - 9}`, stroke: "#a65a1b", "stroke-width": 0.8, fill: "none" }, svg);
    tag(lx, ly, narrow ? "under the river" : "pipe under the river", "sc-lab sc-wet");
  }
  if (k > 0 && !narrow) tag(X(-70), Y(-290), "earlier channels", "sc-lab sc-old", "end");

  // year, north arrow, scale bar
  tag(14, 30, years[k], "ink sc-year");
  const nx = w - 22;
  el("path", { d: `M${nx},12 L${nx + 5},26 L${nx},23 L${nx - 5},26Z`, fill: "#141414" }, svg);
  tag(nx, 38, "N", "", "middle");
  const bar = (500 / FT) * s, bx = 14, by = h - 16;
  el("path", { d: `M${bx},${by - 4}V${by}H${bx + bar}V${by - 4}`, fill: "none", stroke: "#141414", "stroke-width": 1 }, svg);
  tag(bx + bar + 6, by + 1, "500 ft");

  const st = SC.stats[years[k]];
  const rows = [
    ["Year", years[k]],
    ["Channel traced", `${fmt(st.area / 4046.86, 0)} ac`],
    ["Pipe under the river", `${fmt(st.pipeIn * FT)} ft`],
    ["Pipe the river has crossed", `${fmt(st.pipeFoot * FT)} ft`, true],
    ["Since", `${years[0]} · ${k + 1} yr`],
    ["Imagery", "Sentinel-2"],
  ];
  sc.read.innerHTML = rows.map(([a, v, warn]) => `<div${warn ? ' class="warn"' : ""}><span>${a}</span><b>${v}</b></div>`).join("");
}

// ───────── Scroll → active step ─────────
const DRAW = [drawHydro, draw3D, drawScour];
let active = -1, last = "";

function frame() {
  const line = innerHeight * 0.55;
  const first = steps[0].getBoundingClientRect(), end = steps.at(-1).getBoundingClientRect();
  const inside = line >= first.top && line <= end.bottom;
  stage.classList.toggle("live", desktop.matches && inside);
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top <= line) i = k;
  const r = steps[i].getBoundingClientRect();
  const t = clamp((line - r.top) / r.height);
  if (i !== active) {
    active = i;
    steps.forEach((s, k) => s.classList.toggle("on", k === i));
    views.forEach((v, k) => v.classList.toggle("on", k === i));
    // the caption closes the active figure: under its numbers, or under the placeholder
    views[i].appendChild($("#app-cap"));
    $("#app-cap").textContent = steps[i].dataset.cap;
    last = "";
  }
  const visible = desktop.matches ? inside : first.top < innerHeight && end.bottom > 0;
  if (first.top < innerHeight * 2.5) start3D(); // fetch the model a little before it's needed
  if (visible && i === 1 && m3.ready) m3.render();
  const key = `${i}:${t.toFixed(3)}`;
  if (visible && key !== last) {
    DRAW[i](t);
    last = key;
  }
  requestAnimationFrame(frame);
}

// redraw when a view changes size (readouts filling in, panel ↔ phone layout)
new ResizeObserver(() => (last = "")).observe(stage);
views.forEach((v) => v.querySelectorAll("svg").forEach((n) => new ResizeObserver(() => (last = "")).observe(n)));

fetch("assets/earthbound/domain.json?v=2").then((r) => r.json()).then((d) => { PV = d; last = ""; });
fetch("assets/earthbound/scour.json").then((r) => r.json()).then((d) => { SC = prepareScour(d); last = ""; });
fetch("assets/earthbound/crossing.json").then((r) => r.json()).then((d) => { X = prepare(d); last = ""; });
requestAnimationFrame(frame);
