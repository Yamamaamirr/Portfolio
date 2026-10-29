// Adgile chapter: one truck's day, told in the platform's three steps. On desktop the visuals take
// over the dashboard panel; on phones they stay pinned above the text.
// The city, the route and the audience are synthetic (real routes would show a client's
// movements), but every step is the platform's own: GPS pings matched to roads, audience files
// joined to the matched route, and the route clipped to a campaign's geofence.
const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const NS = "http://www.w3.org/2000/svg";
const MI = 1609.34;

const apps = $("#ad-apps"), stage = $("#ad-stage"), inner = $(".panel-inner");
const steps = [...apps.querySelectorAll(".app-step")];
const cap = $("#ad-cap");
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

// ───────── The synthetic city and the truck's day ─────────
// Metres, on a street grid turned like Manhattan's, with a waterfront along one side.
const rand = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(11);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const ANG = -0.5, AV = 150, ST = 62;                  // avenue and street spacing
const rot = (u, v) => [u * Math.cos(ANG) - v * Math.sin(ANG), u * Math.sin(ANG) + v * Math.cos(ANG)];
const node = (i, j) => rot(i * AV, j * ST);
const NI = [-4, 4], NJ = [-9, 9];
const SHORE = (x, y) => y + 0.38 * x - 330 + 25 * Math.sin(x / 140); // > 0 is water
const onLand = ([x, y]) => SHORE(x, y) < -30;

// a walk along the grid that rarely doubles back
const walk = (rnd, i, j, n) => {
  let last = null;
  const pts = [node(i, j)];
  while (pts.length < n) {
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 1], [0, -1]].filter(([a, b]) => {
      const ni = i + a, nj = j + b;
      return ni >= NI[0] && ni <= NI[1] && nj >= NJ[0] && nj <= NJ[1] && onLand(node(ni, nj));
    });
    const fwd = open.filter(([a, b]) => !last || a !== -last[0] || b !== -last[1]);
    const pick = fwd.length ? fwd : open;
    if (!pick.length) break;
    const [a, b] = pick[Math.floor(rnd() * pick.length)];
    const run = a ? 1 : 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < run; k++) {
      if (i + a < NI[0] || i + a > NI[1] || j + b < NJ[0] || j + b > NJ[1] || !onLand(node(i + a, j + b))) break;
      i += a; j += b; pts.push(node(i, j));
    }
    last = [a, b];
  }
  return pts;
};
const lengths = (pts) => { const c = [0]; for (let k = 1; k < pts.length; k++) c.push(c[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return c; };
const along = (pts, c, d) => {
  let k = 1;
  while (k < c.length - 1 && c[k] < d) k++;
  const t = clamp((d - c[k - 1]) / (c[k] - c[k - 1] || 1));
  return [lerp(pts[k - 1][0], pts[k][0], t), lerp(pts[k - 1][1], pts[k][1], t)];
};
const route = walk(rand, -2, -3, 70);
const cum = lengths(route);
const LEN = cum.at(-1);
const at = (d) => along(route, cum, d);

// the map frames the truck's day
let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
for (const [x, y] of route) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
const VIEW = { cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2, w: bx1 - bx0 + 240, h: by1 - by0 + 200 };

// how many people are around: a busy core on the stretch of route nearest the middle of the map,
// a second hub further along, and the avenues busier than side streets
const nearest = (cx, cy, from = 0, to = LEN) => {
  let best = [Infinity, from];
  for (let d = from; d <= to; d += 10) { const [x, y] = at(d), e = (x - cx) ** 2 + (y - cy) ** 2; if (e < best[0]) best = [e, d]; }
  return best[1];
};
const dHub = nearest(VIEW.cx, VIEW.cy), HUB = at(dHub);
const HUB2 = at(nearest(VIEW.cx + VIEW.w * 0.25, VIEW.cy + VIEW.h * 0.2, dHub + LEN * 0.25 > LEN ? 0 : dHub + LEN * 0.25));
const crowd = ([x, y]) => {
  const u = x * Math.cos(ANG) + y * Math.sin(ANG); // back onto the grid, along the streets
  const avenue = Math.abs(((u / AV) % 1 + 1.5) % 1 - 0.5) < 0.06 ? 0.35 : 0;
  return 0.15 + Math.exp(-((x - HUB[0]) ** 2 + (y - HUB[1]) ** 2) / 2 / 170 ** 2) + 0.55 * Math.exp(-((x - HUB2[0]) ** 2 + (y - HUB2[1]) ** 2) / 2 / 120 ** 2) + avenue;
};

// GPS pings every 40 m along the route: a few metres of drift, now and then a jump off the road
const pings = [];
for (let d = 0; d <= LEN; d += 40) {
  const p = at(d), jump = rand() < 0.07;
  const e = jump ? 28 + rand() * 30 : 9;
  const a = rand() * 2 * Math.PI, r = jump ? e : Math.abs(gauss()) * e;
  pings.push({ d, true: p, raw: [p[0] + r * Math.cos(a), p[1] + r * Math.sin(a)], err: r, imp: Math.round(crowd(p) * 380 * (0.7 + 0.6 * rand())) });
}
// the people behind each ping's impressions: a few dots on the pavements either side of the street
const rp = ((v) => () => ((v = (v * 16807) % 2147483647) / 2147483647))(31);
pings.forEach((q, k) => {
  const a = pings[Math.max(0, k - 1)].true, b = pings[Math.min(pings.length - 1, k + 1)].true;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  q.people = Array.from({ length: Math.min(7, Math.round(q.imp / 80)) }, () => {
    const side = rp() < 0.5 ? -1 : 1, off = side * (9 + rp() * 6), sl = (rp() - 0.5) * 36;
    return [q.true[0] + ux * sl - uy * off, q.true[1] + uy * sl + ux * off];
  });
});
const IMP_MED = [...pings].sort((a, b) => a.imp - b.imp)[pings.length >> 1].imp;
const matchedShare = pings.filter((p) => p.err < 20).length / pings.length;
const medianDrift = [...pings].sort((a, b) => a.err - b.err)[pings.length >> 1].err;

// the campaign zone: a loose shape around the busy core
const FENCE = Array.from({ length: 9 }, (_, k) => {
  const a = (k / 9) * 2 * Math.PI, r = 250 * (1 + 0.18 * Math.sin(3 * a + 1) + 0.08 * Math.cos(5 * a));
  return [HUB[0] + r * Math.cos(a) * 0.95, HUB[1] + r * Math.sin(a) * 0.75];
});
const inFence = ([x, y]) => {
  let c = false;
  for (let i = 0, j = FENCE.length - 1; i < FENCE.length; j = i++) {
    const [xi, yi] = FENCE[i], [xj, yj] = FENCE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// the rest of the fleet, out on the same morning
const rf = ((v) => () => ((v = (v * 16807) % 2147483647) / 2147483647))(23);
const FLEET = [[2, -6], [-3, 4], [1, 2], [3, -1], [-1, -7], [-2, 1], [0, -4]].filter(([i, j]) => onLand(node(i, j))).map(([i, j]) => {
  const pts = walk(rf, i, j, 40), c = lengths(pts);
  return { pts, c, len: c.at(-1), off: rf() * 600, v: 9 + rf() * 5 };
}).filter((f) => f.len > 0);

// ───────── Drawing ─────────
// One map for the whole story. The city is drawn once and flattened into an image, so scrolling
// only redraws the light layer on top: the pings, the route, the ribbon and the zone.
const box = $("#ad-box"), base = $("#ad-base"), svg = $("#ad-map"), read = $("#ad-read");
let m = null;

function baseMap() {
  const { clientWidth: w, clientHeight: h } = box;
  if (!w || !h) return null;
  const b = el("svg", { xmlns: NS, width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const s = Math.min(w / VIEW.w, h / VIEW.h), X = (x) => (x - VIEW.cx) * s + w / 2, Y = (y) => (y - VIEW.cy) * s + h / 2;
  const pts = (a) => a.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const defs = el("defs", {}, b);
  const soft = el("filter", { id: "ad-soft", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
  el("feGaussianBlur", { stdDeviation: 16 }, soft);
  const mask = el("mask", { id: "ad-fade" }, defs);
  el("rect", { x: 24, y: 24, width: w - 48, height: h - 48, fill: "#fff", filter: "url(#ad-soft)" }, mask);

  // water drawn like the channel-migration map: pale shallows, deep middle, faint ripple
  const deep = el("filter", { id: "ad-deep" }, defs);
  el("feMorphology", { operator: "erode", radius: 7 }, deep);
  el("feGaussianBlur", { stdDeviation: 6 }, deep);
  const rip = el("filter", { id: "ad-ripple", x: 0, y: 0, width: "100%", height: "100%" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.012 0.09", numOctaves: 2, seed: 4 }, rip);
  el("feColorMatrix", { type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.62" }, rip);
  const tree = el("pattern", { id: "ad-trees", width: 9, height: 8, patternUnits: "userSpaceOnUse" }, defs);
  for (const [cx, cy, r] of [[2, 2, 1.8], [6.5, 3.5, 1.4], [3.5, 6.5, 1.6], [8, 7.5, 1]]) el("circle", { cx, cy, r, fill: "#7d8a5c", "fill-opacity": 0.35 }, tree);

  el("rect", { width: w, height: h, fill: "#f6f5ec" }, b);
  const root = el("g", { mask: "url(#ad-fade)" }, b);

  // a figure-ground plan: building footprints on lots, wide avenues, narrow streets, a diagonal
  // boulevard through the grid, a park, and piers along the waterfront
  const r2 = ((v) => () => ((v = (v * 48271) % 2147483647) / 2147483647))(97);
  const AVE = 13, STR = 7, BLVD = 14;
  // distance to the boulevard, which cuts across the grid through the middle of the map
  const blvd = (x, y) => Math.abs(0.9 * (x - VIEW.cx - 120) - (y - VIEW.cy)) / Math.hypot(0.9, 1);
  const isPark = (i, j) => i === 0 && j >= -3 && j <= -1;
  // the roads: asphalt everywhere, pavements round each block, markings on top
  el("rect", { width: w, height: h, fill: "#e3dfd3" }, root);
  const walks = el("g", { fill: "#f4f1e6", stroke: "#cbc4b1", "stroke-width": 0.7 }, root);
  const ground = el("g", {}, root), marks = el("g", {}, root), shade = el("g", { fill: "#cfc5ad" }, root), bld = el("g", { fill: "#ddd4bf", stroke: "#bdb197", "stroke-width": 0.5 }, root);
  for (let i = NI[0] - 4; i < NI[1] + 4; i++) for (let j = NJ[0] - 8; j < NJ[1] + 8; j++) {
    const u0 = i * AV + AVE, u1 = (i + 1) * AV - AVE, v0 = j * ST + STR, v1 = (j + 1) * ST - STR;
    const corners = [rot(u0, v0), rot(u1, v0), rot(u1, v1), rot(u0, v1)];
    if (!corners.some(onLand)) continue;
    el("polygon", { points: pts(corners) }, walks);
    if (isPark(i, j)) {
      el("polygon", { points: pts(corners), fill: "#e4e5d0" }, ground);
      el("polygon", { points: pts(corners), fill: "url(#ad-trees)" }, ground);
      continue;
    }
    // lots along both long sides of the block, each with a building set back a little
    for (const side of [0, 1]) {
      let u = u0;
      while (u < u1 - 6) {
        const lw = Math.min(u1 - u, 9 + r2() * 22), depth = (v1 - v0) / 2 - 2 - r2() * 9;
        const va = side ? v1 - depth : v0 + 1.5, vb = side ? v1 - 1.5 : v0 + depth;
        const q = [rot(u + 1, va), rot(u + lw - 1, va), rot(u + lw - 1, vb), rot(u + 1, vb)];
        const c = rot(u + lw / 2, (va + vb) / 2);
        if (r2() > 0.08 && q.every(onLand) && blvd(...c) > BLVD + 6) {
          // a soft shadow to the south-east gives the plan a little height
          el("polygon", { points: pts(q.map(([x, y]) => [x + 2.2, y + 2.2])) }, shade);
          el("polygon", { points: pts(q), fill: r2() < 0.18 ? "#d2c8b0" : null }, bld);
        }
        u += lw;
      }
    }
  }

  // centre lines on the avenues, crosswalks at the corners
  const dash = { fill: "none", stroke: "#fffff8", "stroke-width": 0.8, "stroke-dasharray": "5 4" };
  for (let i = NI[0] - 4; i <= NI[1] + 4; i++) el("polyline", { ...dash, points: pts([rot(i * AV, (NJ[0] - 8) * ST), rot(i * AV, (NJ[1] + 8) * ST)]) }, marks);
  const zebra = { stroke: "#fffff8", "stroke-opacity": 0.9, "stroke-dasharray": "1.1 1.1", "stroke-width": 3.5 * s };
  for (let i = NI[0] - 3; i <= NI[1] + 3; i++) for (let j = NJ[0] - 7; j <= NJ[1] + 7; j++) {
    if (!onLand(node(i, j))) continue;
    for (const sg of [-1, 1]) {
      const v = j * ST + sg * (STR + 2.5), u = i * AV + sg * (AVE + 2.5);
      el("line", { ...zebra, x1: X(rot(i * AV - AVE, v)[0]), y1: Y(rot(i * AV - AVE, v)[1]), x2: X(rot(i * AV + AVE, v)[0]), y2: Y(rot(i * AV + AVE, v)[1]) }, marks);
      el("line", { ...zebra, x1: X(rot(u, j * ST - STR)[0]), y1: Y(rot(u, j * ST - STR)[1]), x2: X(rot(u, j * ST + STR)[0]), y2: Y(rot(u, j * ST + STR)[1]) }, marks);
    }
  }
  // the boulevard: a wide road with a planted median
  const bA = [VIEW.cx - 1400, VIEW.cy + 0.9 * (-1400 - 120)], bB = [VIEW.cx + 1400, VIEW.cy + 0.9 * (1400 - 120)];
  const bline = pts([bA, bB]);
  el("polyline", { points: bline, stroke: "#cbc4b1", "stroke-width": (BLVD * 2 + 2) * s, fill: "none" }, marks);
  el("polyline", { points: bline, stroke: "#e3dfd3", "stroke-width": BLVD * 2 * s, fill: "none" }, marks);
  el("polyline", { points: bline, stroke: "#e4e5d0", "stroke-width": 4 * s, fill: "none" }, marks);
  el("polyline", { points: bline, stroke: "#7d8a5c", "stroke-opacity": 0.45, "stroke-width": 3.4 * s, "stroke-linecap": "round", "stroke-dasharray": `0 ${9 * s}`, fill: "none" }, marks);

  // the waterfront, with piers
  const shore = [];
  for (let x = -1400; x <= 1400; x += 20) shore.push([x, 330 - 0.38 * x - 25 * Math.sin(x / 140)]);
  const water = pts([...shore, [1400, 1600], [-1400, 1600]]);
  el("path", { id: "ad-wpath", d: `M${water}Z` }, el("clipPath", { id: "ad-wclip" }, defs));
  el("polygon", { points: water, fill: "#8fb3d1" }, root);
  el("polygon", { points: water, fill: "#2f5f8c", filter: "url(#ad-deep)" }, root);
  el("rect", { width: w, height: h, filter: "url(#ad-ripple)", opacity: 0.16, "clip-path": "url(#ad-wclip)" }, root);
  const nrm = Math.atan2(1, 0.38); // pointing out into the water
  for (let x = -1300; x <= 1300; x += 95) {
    const y = 330 - 0.38 * x - 25 * Math.sin(x / 140), L = 45 + r2() * 30, hw = 5;
    const dx = Math.cos(nrm) * L, dy = Math.sin(nrm) * L, px = -Math.sin(nrm) * hw, py = Math.cos(nrm) * hw;
    el("polygon", { points: pts([[x + px, y + py], [x + dx + px, y + dy + py], [x + dx - px, y + dy - py], [x - px, y - py]]), fill: "#e6dcc2", stroke: "#bdb197", "stroke-width": 0.5 }, root);
  }
  el("polyline", { points: pts(shore), fill: "none", stroke: "#d8c9a3", "stroke-width": 3 }, root);

  // flatten the city into an image
  if (base.src) URL.revokeObjectURL(base.src);
  base.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(b)], { type: "image/svg+xml" }));

  // the layer that changes with the scroll, and the furniture on top
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const odefs = el("defs", {}, svg);
  for (const [o, id] of [[0.32, "ad-glow-a"], [0.22, "ad-glow-b"]]) {
    const rg = el("radialGradient", { id }, odefs);
    el("stop", { offset: 0, "stop-color": "#c8782f", "stop-opacity": o }, rg);
    el("stop", { offset: 1, "stop-color": "#c8782f", "stop-opacity": 0 }, rg);
  }
  const over = el("g", {}, svg), top = el("g", {}, svg);
  const bar = 200 * s, bx = 14, by = h - 16;
  el("path", { d: `M${bx},${by - 4}V${by}H${bx + bar}V${by - 4}`, fill: "none", stroke: "#141414", "stroke-width": 1 }, svg);
  el("text", { x: bx + bar + 6, y: by + 1 }, svg).textContent = "200 m";
  return { w, h, s, X, Y, pts, over, top };
}

const text = (g, x, y, t, cls = "", anchor = "start", op = 1) => {
  const n = el("text", { x, y, class: cls, "text-anchor": anchor, opacity: op }, g);
  n.textContent = t;
};
// a billboard truck seen from above: a long box with the ad panels along both sides, then the cab
const truck = (g, x, y, deg, op = 1, lead = false) => {
  const t = el("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`, opacity: op }, g);
  el("rect", { x: -9, y: -2.6, width: 20, height: 7.2, rx: 1.2, fill: "#141414", "fill-opacity": 0.18 }, t); // shadow
  el("rect", { x: -10.5, y: -3.6, width: 15, height: 7.2, rx: 0.8, fill: "#fffff8", stroke: "#141414", "stroke-width": 0.8 }, t);
  el("rect", { x: -9.5, y: -3.6, width: 13, height: 1.6, fill: lead ? "#c8782f" : "#4f7fa8" }, t);
  el("rect", { x: -9.5, y: 2, width: 13, height: 1.6, fill: lead ? "#c8782f" : "#4f7fa8" }, t);
  el("rect", { x: 5.3, y: -3.1, width: 5.4, height: 6.2, rx: 1.4, fill: lead ? "#a65a1b" : "#1f4e79", stroke: "#141414", "stroke-width": 0.8 }, t);
  el("line", { x1: 8.6, y1: -2.4, x2: 8.6, y2: 2.4, stroke: "#fffff8", "stroke-opacity": 0.7, "stroke-width": 0.9 }, t); // windscreen
};
const heading = (P0, P1, X, Y) => (Math.atan2(Y(P1[1]) - Y(P0[1]), X(P1[0]) - X(P0[0])) * 180) / Math.PI;

// a ping every 10 s, starting at nine
const hhmm = (f) => { const v = 9 * 60 + (f * pings.length * 10) / 60; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(Math.floor(v % 60)).padStart(2, "0")}`; };
const routeUpTo = (d) => { const out = []; for (let k = 0; k < route.length && cum[k] <= d; k++) out.push(route[k]); out.push(at(d)); return out; };

// the clip, worked out once
const CLIP = (() => {
  let inside = 0, imp = 0, n = 0;
  const hit = [false];
  for (let k = 1; k < pings.length; k++) {
    const a = pings[k - 1].true, b = pings[k].true, h = inFence([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    hit.push(h);
    if (h) { inside += pings[k].d - pings[k - 1].d; imp += pings[k].imp; n++; }
  }
  return { hit, inside, imp, n };
})();
const ZONE_RING = [...FENCE, FENCE[0]];
let ZONE_LEN = 0;
for (let k = 1; k < ZONE_RING.length; k++) ZONE_LEN += Math.hypot(ZONE_RING[k][0] - ZONE_RING[k - 1][0], ZONE_RING[k][1] - ZONE_RING[k - 1][1]);

// p runs 0 → 3 across the three steps
function draw(p, now = 0) {
  if (!m) m = baseMap();
  if (!m) return;
  const { over, top, X, Y, pts } = m;
  over.replaceChildren();
  top.replaceChildren();
  const p0 = clamp(p), p1 = clamp(p - 1), p2 = clamp(p - 2);
  // step 1 in beats: the fleet fades and one truck is picked out, its pings drop in as it drives,
  // a pause to see the drift, then the trace snaps to the streets
  const pick = smooth(clamp(p0 / 0.15)), seen = smooth(clamp((p0 - 0.15) / 0.4)), snap = smooth(clamp((p0 - 0.65) / 0.33));
  const pingsOut = 1 - smooth(clamp(p1 / 0.3));       // step 2: the pings fade away
  const crowdIn = smooth(clamp(p1 / 0.4));              // the busy blocks warm up
  const ribbon = smooth(clamp((p1 - 0.1) / 0.85));      // the ribbon grows along the day
  const zone = smooth(clamp(p2 / 0.4)), clip = smooth(clamp((p2 - 0.35) / 0.5));

  // the crowd under the city
  if (crowdIn > 0) {
    const glow = el("g", { opacity: 0.55 * crowdIn }, over);
    el("circle", { cx: X(HUB[0]), cy: Y(HUB[1]), r: 230 * m.s * 1.6, fill: "url(#ad-glow-a)" }, glow);
    el("circle", { cx: X(HUB2[0]), cy: Y(HUB2[1]), r: 160 * m.s * 1.6, fill: "url(#ad-glow-b)" }, glow);
  }
  // the client's zone, drawn on
  if (zone > 0) {
    el("polygon", { points: pts(FENCE), fill: "#c8782f", "fill-opacity": 0.08 * zone }, over);
    el("polyline", { points: pts(ZONE_RING), fill: "none", stroke: "#a65a1b", "stroke-width": 1.4, "stroke-dasharray": `${ZONE_LEN * m.s * zone} ${ZONE_LEN * m.s}` }, over);
  }
  // the audience ribbon: each stretch as wide as the people counted along it, faded outside the zone
  if (ribbon > 0) {
    const upto = ribbon * LEN, rib = el("g", { "stroke-linecap": "round" }, over);
    for (let k = 1; k < pings.length && pings[k].d <= upto; k++) {
      const a = pings[k - 1].true, b = pings[k].true, inZ = CLIP.hit[k];
      el("line", { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: "#c8782f", "stroke-opacity": 0.55 * (inZ ? 1 : 1 - 0.75 * clip), "stroke-width": 1.5 + pings[k].imp / 38 }, rib);
    }
  }
  // the impressions: people pop up on the pavements as the truck passes, and a count floats off
  if (ribbon > 0) {
    const upto = ribbon * LEN, ppl = el("g", { fill: "#c8782f", stroke: "#fffff8", "stroke-width": 0.6 }, over), pops = [];
    for (const [k, q] of pings.entries()) {
      const age = upto - q.d;
      if (age < 0) break;
      const t = clamp(age / 70), r = 2 * (1 + 1.1 * Math.sin(Math.PI * t)), keep = CLIP.hit[k] ? 1 : 1 - 0.7 * clip;
      for (const [x, y] of q.people) el("circle", { cx: X(x), cy: Y(y), r, "fill-opacity": (t < 1 ? 0.95 : 0.6) * keep }, ppl);
      if (q.imp > IMP_MED && age < 160) pops.push([q, age]);
    }
    for (const [q, age] of pops.slice(-3)) {
      const [x, y] = q.true, f = age / 160;
      text(top, X(x) + 8, Y(y) - 6 - 22 * f, `+${fmt(q.imp)}`, "ad-lab ad-or ad-pop", "start", (1 - f) * (1 - clip));
    }
  }
  // the matched route
  if (snap > 0) {
    const d = snap * LEN, line = pts(routeUpTo(d));
    el("polyline", { points: line, fill: "none", stroke: "#fffff8", "stroke-width": 5 - 3 * ribbon, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 1 - 0.6 * clip }, over);
    el("polyline", { points: line, fill: "none", stroke: "#a65a1b", "stroke-width": 2.2 - 1.2 * ribbon, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 1 - 0.6 * clip }, over);
  }
  if (clip > 0) {
    const g = el("g", { "stroke-linecap": "round", opacity: clip }, over);
    for (let k = 1; k < pings.length; k++) if (CLIP.hit[k]) {
      const a = pings[k - 1].true, b = pings[k].true;
      el("line", { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: "#a65a1b", "stroke-width": 2.6 }, g);
    }
  }
  // the raw pings: GPS fixes with their accuracy circles, the newest pulsing; once matched each one
  // leaves a hollow ring where it was and a leader to the point on the road it was snapped to
  if (pingsOut > 0) {
    const n = Math.max(1, Math.round(seen * pings.length)), g = el("g", { opacity: pingsOut }, over);
    for (let k = 0; k < n; k++) {
      const q = pings[k], done = q.d <= snap * LEN, bad = q.err > 20, fresh = n - 1 - k;
      const [x, y] = q.raw, [tx, ty] = q.true, col = bad ? "#a65a1b" : "#1f4e79";
      if (done) {
        el("line", { x1: X(x), y1: Y(y), x2: X(tx), y2: Y(ty), stroke: col, "stroke-opacity": 0.5, "stroke-width": 0.6, "stroke-dasharray": bad ? "2 1.5" : null }, g);
        el("circle", { cx: X(x), cy: Y(y), r: 1.6, fill: "none", stroke: col, "stroke-opacity": 0.55, "stroke-width": 0.7 }, g);
        el("circle", { cx: X(tx), cy: Y(ty), r: 1.1, fill: "#fffff8", stroke: "#a65a1b", "stroke-width": 0.6 }, g);
      } else {
        const age = Math.min(1, fresh / 40); // older fixes fade back
        el("circle", { cx: X(x), cy: Y(y), r: Math.max(2.5, q.err * m.s), fill: col, "fill-opacity": 0.07 * (1 - age * 0.6), stroke: col, "stroke-opacity": 0.22 * (1 - age * 0.6), "stroke-width": 0.5 }, g);
        el("circle", { cx: X(x), cy: Y(y), r: 1.9, fill: col, stroke: "#fffff8", "stroke-width": 0.7, opacity: 1 - age * 0.45 }, g);
        if (bad) el("circle", { cx: X(x), cy: Y(y), r: 4, fill: "none", stroke: "#a65a1b", "stroke-width": 0.7, "stroke-dasharray": "1.5 1.2" }, g);
        if (fresh < 3) el("circle", { cx: X(x), cy: Y(y), r: 4 + fresh * 2.5, fill: "none", stroke: col, "stroke-opacity": 0.5 - fresh * 0.15, "stroke-width": 0.8 }, g);
      }
    }
  }
  // the rest of the fleet, driving while the heading is on screen, gone once the story starts
  const fleet = 1 - pick;
  if (fleet > 0) for (const [k, f] of FLEET.entries()) {
    const d = (f.off + now * f.v) % (2 * f.len), dd = d > f.len ? 2 * f.len - d : d, dir = d > f.len ? -1 : 1;
    const a = along(f.pts, f.c, dd), b = along(f.pts, f.c, clamp(dd + dir * 4, 0, f.len));
    truck(over, X(a[0]), Y(a[1]), heading(a, b, X, Y), fleet);
    // one plain label for the whole fleet, riding with a single truck
    if (k === 0) text(top, X(a[0]) + 10, Y(a[1]) - 9, "billboard trucks", "ad-lab", "start", fleet);
  }
  // the story's truck, wherever the story is up to
  const td = p < 1 ? (snap > 0 ? snap : seen) * LEN : p < 2 ? Math.max(0.02, ribbon) * LEN : LEN;
  const [tx, ty] = at(td);
  const [ha, hb] = [at(Math.max(0, td - 6)), at(Math.min(LEN, td + 6))];
  if (p < 2.4) {
    truck(over, X(tx), Y(ty), heading(ha, hb, X, Y), p < 2 ? 1 : 1 - zone, true);
  }
  // picking out the truck we follow
  const focus = p > 0 && p < 1 ? pick * (1 - smooth(clamp((p0 - 0.3) / 0.15))) : 0;
  if (focus > 0) {
    el("circle", { cx: X(tx), cy: Y(ty), r: 16, fill: "none", stroke: "#a65a1b", "stroke-width": 1.2, opacity: focus }, over);
  }

  // labels, each fading in and out with its step
  const [lx, ly] = pings[Math.floor(pings.length * 0.2)].raw;
  text(top, X(lx) - 12, Y(ly) - 10, snap > 0.05 ? "matched to the streets" : "raw GPS pings", `ad-lab ${snap > 0.05 ? "ad-or" : "ink"}`, "end", seen > 0.05 ? pingsOut : 0);
  text(top, X(HUB[0]), Y(HUB[1]) - 150 * m.s, "busy blocks, more eyes", "ad-lab ad-or", "middle", crowdIn * (1 - zone));
  text(top, X(FENCE[1][0]) + 6, Y(FENCE[1][1]) - 6, "the client's zone", "ad-lab ad-or", "start", zone);
  text(top, 14, 30, p < 2 ? hhmm(p < 1 ? (snap > 0 ? snap : seen) : ribbon) : "Campaign report", "ink sc-year", "start");

  // the numbers for the step in view
  let rows;
  if (p === 0) {
    rows = [
      ["Fleet", "mobile billboards"], ["Cities", "across the US"], ["Each truck", "a GPS device"],
      ["Live map", "Firebase"], ["History", "PostGIS"], ["Built with", "NestJS · React"],
    ];
  } else if (p < 1) {
    const n = Math.max(1, Math.round(seen * pings.length));
    rows = [
      ["Pings", fmt(n)], ["Every", "≈ 10 s"], ["Median drift", `${fmt(medianDrift, 0)} m`],
      ["Matched to roads", `${fmt((snap * LEN) / MI, 1)} mi`], ["Confidence", snap > 0 ? `${fmt(matchedShare * 100)}%` : "—"],
      ["Flagged jumps", fmt(pings.slice(0, n).filter((q) => q.err > 20 && q.d <= snap * LEN).length), true],
    ];
  } else if (p < 2) {
    const upto = ribbon * LEN, done = pings.filter((q) => q.d <= upto);
    const busiest = done.reduce((a, b) => (b.imp > a.imp ? b : a), pings[0]);
    rows = [
      ["Time", hhmm(ribbon)], ["Driven", `${fmt(upto / MI, 1)} mi`], ["Impressions", fmt(done.reduce((a, q) => a + q.imp, 0)), true],
      ["Busiest stretch", `${fmt(busiest.imp)} / 40 m`], ["Audience data", "daily, from S3"], ["Joined to", "matched route"],
    ];
  } else {
    rows = [
      ["Inside the zone", `${fmt((CLIP.inside * clip) / MI, 1)} mi`], ["Impressions inside", fmt(CLIP.imp * clip), true],
      ["Time inside", `${fmt((CLIP.n * 10 * clip) / 60, 0)} min`],
    ];
  }
  read.innerHTML = rows.map(([a, v, warn]) => `<div${warn ? ' class="warn"' : ""}><span>${a}</span><b>${v}</b></div>`).join("");
}

// ───────── Scroll → story position ─────────
let active = -1, last = "";
const still = matchMedia("(prefers-reduced-motion: reduce)");

function frame() {
  const line = innerHeight * 0.55;
  const first = steps[0].getBoundingClientRect(), end = steps.at(-1).getBoundingClientRect();
  const inside = line >= first.top && line <= end.bottom;
  stage.classList.toggle("live", desktop.matches && inside);
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top <= line) i = k;
  const r = steps[i].getBoundingClientRect();
  // the first step is the introduction: the city waits, then the story runs 0 → 3 over the rest
  const p = i === 0 ? 0 : i - 1 + clamp((line - r.top) / r.height);
  if (i !== active) {
    active = i;
    steps.forEach((s, k) => s.classList.toggle("on", k === i));
    cap.textContent = steps[i].dataset.cap;
  }
  const visible = desktop.matches ? inside : first.top < innerHeight && end.bottom > 0;
  // while the fleet is on screen it keeps driving; after that, only the scroll redraws the map
  const moving = p < 0.15 && !still.matches;
  const key = p.toFixed(3);
  if (visible && (moving || key !== last)) {
    draw(p, moving ? performance.now() / 1000 : 0);
    last = key;
  }
  requestAnimationFrame(frame);
}

// a new size means a new base map
new ResizeObserver(() => { m = null; last = ""; }).observe(box);
requestAnimationFrame(frame);
