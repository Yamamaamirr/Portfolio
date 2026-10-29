(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // ───────── Smooth scroll ─────────
  let lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id === "#" ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20 });
      else if (target === 0) scrollTo({ top: 0 });
      else target.scrollIntoView();
    });
  });

  // ───────── Chapters → state ─────────
  const chapters = [...document.querySelectorAll(".chapter")];
  // the intro is state 0 (the undergraduate years), so the panel has something to grow from
  const stops = [$(".intro"), ...chapters];
  const states = stops.map((c) => JSON.parse(c.dataset.state));
  const N = states.length;
  const SKILLS = [
    ["rs", "Remote sensing"],
    ["web", "Geoweb"],
    ["research", "Research"],
  ];

  // Continuous position along the story: 3.4 = between chapter 3 and 4.
  // Each chapter holds its state for the first half, then eases into the next.
  function storyProgress() {
    const line = innerHeight * 0.55;
    const tops = stops.map((c) => c.getBoundingClientRect().top);
    if (line < tops[0]) return 0;
    let i = 0;
    while (i < N - 1 && tops[i + 1] <= line) i++;
    if (i === N - 1) return N - 1;
    // the intro hands over to the first chapter between the top of the page and its heading reaching the line
    if (i === 0) return smooth(clamp(scrollY / Math.max(1, tops[1] + scrollY - line)));
    // a chapter with app steps holds its state until the last step has passed
    const apps = [...stops[i].querySelectorAll(".apps")].at(-1);
    const start = apps ? Math.max(tops[i], apps.getBoundingClientRect().bottom - innerHeight * 0.45) : tops[i];
    const frac = clamp((line - start) / (tops[i + 1] - start));
    return i + smooth(clamp((frac - 0.45) / 0.55));
  }

  function stateAt(p) {
    const i = Math.min(Math.floor(p), N - 2);
    const t = p - i;
    const a = states[i], b = states[i + 1] || a;
    const near = t < 0.5 ? a : b;
        return {
      ...near,
      time: a.time.map((v, j) => lerp(v, b.time[j], t)),
      stats: Object.fromEntries(Object.keys(a.stats).map((k) => [k, lerp(a.stats[k], b.stats[k], t)])),
    };
  }

  // ───────── Skill chart ─────────
  const chart = $("#chart");
  const NS = "http://www.w3.org/2000/svg";
  function drawChart(p, focus) {
    const w = chart.clientWidth, h = chart.clientHeight;
    chart.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const padR = 100, padT = 10, padB = 18;
    // x runs from -1 (a quiet "before" where every skill is near zero) to the last chapter
    const x = (v) => ((v + 1) / N) * (w - padR);
    const y = (v) => padT + (1 - v / 100) * (h - padT - padB);
    const ORIGIN = { rs: 6, web: 0, research: 2 };
    const level = (key, q) => {
      if (q < 0) return lerp(ORIGIN[key], states[0].skills[key], smooth(q + 1));
      const i = Math.min(Math.floor(q), N - 2);
      return lerp(states[i].skills[key], states[i + 1].skills[key], smooth(q - i));
    };
    let out = "";
    const labels = [];
    SKILLS.forEach(([key, label]) => {
      const pts = [];
      for (let q = -1; q < p; q += 0.04) pts.push([x(q), y(level(key, q))]);
      pts.push([x(p), y(level(key, p))]);
      const col = key === focus ? "var(--accent)" : "var(--muted)";
      const d = "M" + pts.map((pt) => pt[0].toFixed(1) + " " + pt[1].toFixed(1)).join("L");
      const end = pts[pts.length - 1];
      out += `<path d="${d}" stroke="${col}"/>`;
      out += `<circle cx="${end[0]}" cy="${end[1]}" r="3.2" fill="${col}"/>`;
      labels.push({ x: end[0] + 7, y: end[1] + 4, col, label, bold: key === focus });
    });
    // keep end labels from colliding
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 12);
    labels.forEach((l) => (out += `<text x="${l.x}" y="${l.y}" fill="${l.col}" font-weight="${l.bold ? 700 : 400}">${l.label}</text>`));
    out += `<text x="0" y="${h - 2}" fill="var(--muted)">${states[0].date}</text>`;
    chart.innerHTML = out;
  }

  // ───────── Capabilities ─────────
  const ICONS = {
    rs: '<circle cx="8" cy="8" r="2.5"/><path d="M3 3l2 2 M13 3l-2 2 M8 1v2 M2 13l3-3 M14 13l-3-3"/>',
    spatial: '<path d="M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2z M6 2v10 M10 4v10"/>',
    web: '<rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 5.5h13 M8 8.2a1.6 1.6 0 1 1 0 .1z M8 9.8v1.7"/>',
    api: '<path d="M5 4L1.5 8 5 12 M11 4l3.5 4-3.5 4 M9.5 2.5l-3 11"/>',
    terrain: '<path d="M8 1.5l6 3.2v6.6l-6 3.2-6-3.2V4.7z M2 4.7l6 3.3 6-3.3 M8 8v6.5"/>',
    research: '<circle cx="7" cy="7" r="4.5"/><path d="M10.3 10.3l4.2 4.2"/>',
  };
  const CAP_LABELS = {
    rs: "Remote Sensing", spatial: "Spatial Analysis", web: "Web Mapping",
    api: "APIs & Data", terrain: "3D & Terrain", research: "Research",
  };
  const capsEl = $("#caps");
  capsEl.innerHTML = Object.keys(CAP_LABELS)
    .map((k) => `<div class="cap" data-cap="${k}" data-level="0"><span class="ic"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></span>${CAP_LABELS[k]}</div>`)
    .join("");
  const capEls = [...capsEl.children];

  // ───────── Donut (time split) ─────────
  const donut = $("#donut");
  const R = 38, C = 2 * Math.PI * R;
  const SEG = [["Study", "var(--ink)"], ["Work", "var(--accent)"], ["Research", "var(--orange)"]];
  donut.innerHTML =
    SEG.map((_, i) => `<circle class="seg" data-i="${i}" cx="50" cy="50" r="${R}" fill="none" stroke="${SEG[i][1]}" stroke-width="16" transform="rotate(-90 50 50)"/>`).join("") +
    `<text x="50" y="47" text-anchor="middle">TIME</text><text id="donut-lbl" x="50" y="58" text-anchor="middle" font-weight="400"></text>`;
  const segs = [...donut.querySelectorAll(".seg")];
  function drawDonut(time) {
    const total = time.reduce((a, b) => a + b, 0);
    let off = 0;
    segs.forEach((s, i) => {
      const len = (time[i] / total) * C;
      s.setAttribute("stroke-dasharray", `${Math.max(0, len - 1.5)} ${C}`);
      s.setAttribute("stroke-dashoffset", -off);
      off += len;
    });
    const top = time.indexOf(Math.max(...time));
    $("#donut-lbl").textContent = `${SEG[top][0]} ${Math.round((time[top] / total) * 100)}%`;
  }

  // ───────── Little square rows (only add/remove the difference so they pop in) ─────────
  function setCount(el, n) {
    while (el.children.length < n) el.appendChild(document.createElement("i"));
    while (el.children.length > n) el.lastChild.remove();
  }
  // named dots: one per item, and hovering a dot shows what it is
  function setDots(el, names) {
    setCount(el, names.length);
    [...el.children].forEach((d, i) => { d.title = names[i]; d.setAttribute("aria-label", names[i]); });
  }

  // ───────── Panel render ─────────
  const el = {
    date: $("#p-date"), role: $("#p-role"), org: $("#p-org"), orgRole: $("#p-orgrole"),
    counter: $("#p-counter"), squares: $("#p-squares"), stats: $("#p-stats"),
    shipped: $("#b-shipped"), building: $("#b-building"), plates: $("#b-plates"),
  };
  const STAT_LABELS = { apps: "Apps built", teams: "Teams", zones: "Time zones", degrees: "Degrees" };
  el.stats.innerHTML = Object.keys(STAT_LABELS).map((k) => `<div><span>${STAT_LABELS[k]}</span><b data-k="${k}"></b></div>`).join("");

  let current = { p: 0 };
  function renderPanel(p) {
    const s = stateAt(p);
    el.date.textContent = s.date;
    el.role.textContent = s.role;
    focusLane = s.lane || null;
    shownAt(p);
    // in a company's chapter, the grid's title names that company; otherwise the state names it
    const keys = focusLane ? [focusLane] : s.title || [];
    const now = ORGS.filter((o) => keys.includes(o.key));
    el.org.textContent = now.map((o) => o.name).join(" + ");
    el.orgRole.textContent = now.length === 1 ? now[0].role : "";
    drawChart(p, s.focus);
    capEls.forEach((c) => (c.dataset.level = s.caps[c.dataset.cap]));
    drawDonut(s.time);
    const months = workMonths();
    el.counter.innerHTML = `<b>${months}</b> month${months === 1 ? "" : "s"} of industry work`;
    setCount(el.squares, clamp(months, 0, 40));
    el.stats.querySelectorAll("b").forEach((b) => (b.textContent = fmt(s.stats[b.dataset.k])));
    ["shipped", "building", "plates"].forEach((k) => {
      setDots(el[k], s[k]);
      $(`#n-${k}`).textContent = s[k].length;
    });
  }

  // ───────── Terrain: value noise + marching squares ─────────
  const perm = new Uint8Array(512);
  (() => {
    const p = [...Array(256).keys()];
    let seed = 7;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const hash = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
  }
  const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 1.3) * 0.28 + noise3(x * 4.3, y * 4.3, z) * 0.12;

  const sizeCanvas = (cv, ctx) => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [r.width, r.height];
  };

  // ───────── Contribution grid: one column per month, one lane each for study, research and work ─────────
  // A GitHub contribution graph turned on its side, read left to right. Each place owns fixed rows, so a job
  // held during a degree shows as a second lane under it. Squares fill in up to the date the story has reached.
  const wrap = $(".contrib-wrap");
  const ORGS = JSON.parse(wrap.dataset.orgs);
  const month = (ym) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); }; // months since year 0
  const GRID_A = month("2021-11"), GRID_B = month("2028-05"), COLS = GRID_B - GRID_A + 1, ROWS = 7;
  const TODAY = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); })();
  const LANES = [["Study", 0, 1], ["Research", 2, 2], ["Work", 4, 6]];
  ORGS.forEach((o) => { o.a = month(o.from); o.b = month(o.to); });
  // how much of each place the grid shows (0–1), filled left to right as the story reaches it
  const shown = Object.fromEntries(ORGS.map((o) => [o.key, 0]));
  // months of work shown so far, counting only months that have happened
  const WORK = ORGS.filter((o) => o.rows[0] >= 4);
  const workMonths = () =>
    Math.round(WORK.reduce((n, o) => n + shown[o.key] * Math.max(0, Math.min(o.b, TODAY) - o.a + 1), 0));
  const cells = [];
  for (let c = 0; c < COLS; c++) {
    const m = GRID_A + c;
    for (let r = 0; r < ROWS; r++) {
      const org = ORGS.find((o) => o.rows.includes(r) && m >= o.a && m <= o.b);
      let lvl = 0;
      if (org) {  // a steady rhythm, seeded so it's the same on every visit; the shade carries no count
        const h = hash(c, r, 17) * 0.55 + hash(c >> 1, r, 29) * 0.45;
        lvl = clamp(Math.ceil((h * 0.6 + org.level * 0.55) * 4) - 1, 0, 4);
      }
      cells.push({ c, r, m, org, lvl, future: m > TODAY, a: 0 });
    }
  }
  $("#contrib-key").innerHTML = ORGS.map((o) => `<span><i style="background:${o.color}"></i>${o.name}</span>`).join("");

  const contrib = $("#contrib");
  const cctx = contrib.getContext("2d");
  let cw = 0, chh = 0, gridBusy = true;
  // a company's chapter lights its own lane and dims the rest, so the grid says whose work comes next
  let focusLane = null;
  const lit = { a: 0, key: null };
  const shownAt = (p) => {
    const i = Math.min(Math.floor(p), N - 2), t = p - i;
    const has = (st, k) => ((st.show || []).includes(k) ? 1 : 0);
    ORGS.forEach((o) => (shown[o.key] = lerp(has(states[i], o.key), has(states[i + 1], o.key), t)));
  };
  const tint = (hex, a) => {  // the org colour mixed into paper, like GitHub's four greens
    const n = parseInt(hex.slice(1), 16), P = [255, 255, 248];
    return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, k) => Math.round(P[k] + (c - P[k]) * a)).join(",")})`;
  };
  const SHADE = [0.14, 0.32, 0.55, 0.78, 1];
  const inLane = (r) => LANES.some(([, a, b]) => r >= a && r <= b);
  // on load the first place sweeps in over about a second instead of appearing at once
  const t0 = performance.now();
  let intro = reduceMotion ? 1 : 0;

  function drawContrib() {
    if (!cw || !chh) return false;
    const small = cw < 200;  // the phone's collapsed bar: no labels
    const labW = small ? 0 : 66, yearH = small ? 0 : 16;
    const step = (cw - labW) / COLS, sw = Math.max(1, step - Math.max(1, step * 0.18));
    const rowH = (chh - yearH) / ROWS, sh = Math.max(1, rowH - Math.max(1, rowH * 0.22));
    intro = reduceMotion ? 1 : clamp((performance.now() - t0 - 300) / 1100);
    cctx.clearRect(0, 0, cw, chh);
    cctx.font = `11px ${monoFont()}`;
    cctx.fillStyle = "#646462";
    if (!small) {
      cctx.textBaseline = "alphabetic";
      for (let c = 0; c < COLS; c++) if ((GRID_A + c) % 12 === 0) cctx.fillText(String((GRID_A + c) / 12), labW + c * step, yearH - 4);
      cctx.textBaseline = "middle";
      LANES.forEach(([name, a, b]) => cctx.fillText(name, 0, yearH + ((a + b + 1) / 2) * rowH));
    }
    let busy = intro < 1;
    if (focusLane) lit.key = focusLane;
    lit.a += ((focusLane ? 1 : 0) - lit.a) * (reduceMotion ? 1 : 0.12);
    if (Math.abs((focusLane ? 1 : 0) - lit.a) > 0.01) busy = true;
    for (const cell of cells) {
      if (!inLane(cell.r)) continue;
      const o = cell.org;
      const target = o && (cell.m - o.a + 0.5) / (o.b - o.a + 1) <= shown[o.key] * intro ? 1 : 0;
      cell.a += (target - cell.a) * (reduceMotion ? 1 : 0.16);
      if (Math.abs(target - cell.a) > 0.01) busy = true;
      const x = labW + cell.c * step, y = yearH + cell.r * rowH;
      cctx.fillStyle = "#ecebe2";
      cctx.fillRect(x, y, sw, sh);
      if (cell.a < 0.02 || !cell.org) continue;
      const dim = cell.org.key === lit.key ? 1 : 1 - 0.8 * lit.a;
      cctx.globalAlpha = cell.a * dim;
      if (cell.future) {  // months that haven't happened yet: outlined, not filled
        cctx.strokeStyle = tint(cell.org.color, 0.6);
        cctx.lineWidth = 1;
        cctx.strokeRect(x + 0.5, y + 0.5, sw - 1, sh - 1);
      } else {
        cctx.fillStyle = tint(cell.org.color, SHADE[cell.lvl]);
        cctx.fillRect(x, y, sw, sh);
      }
      cctx.globalAlpha = 1;
    }
    return busy;
  }

  function resize() {
    // seven rows (three lanes and a gap); short in the phone's collapsed bar
    contrib.style.height = (contrib.clientWidth < 200 ? 7 * 5 : 16 + 7 * 13) + "px";
    [cw, chh] = sizeCanvas(contrib, cctx);
    gridBusy = true;
    renderPanel(current.p);
  }
  addEventListener("resize", resize);

  // phones: the bottom bar expands into the full dashboard
  const panel = $(".panel"), toggle = $("#panel-toggle");
  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", open ? "Collapse dashboard" : "Expand dashboard");
    resize(); // canvases and chart were sized for the collapsed bar
  });

  // ───────── Footnote tooltips ─────────
  const tip = $("#tooltip");
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

  // ───────── Atlas previews: a framed crop of each plate follows the cursor down the list ─────────
  const preview = $("#atlas-preview");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (preview && finePointer) {
    const pImg = preview.querySelector("img");
    const pNo = preview.querySelector(".ap-no");
    const pAbstract = preview.querySelector(".ap-abstract");
    const links = [...document.querySelectorAll(".plates a[data-preview]")];
    links.forEach((a) => { const im = new Image(); im.src = a.dataset.preview; }); // warm the cache so swaps are instant
    const at = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
    let active = null, raf = 0;
    const place = () => {
      // beside the list, not over it: just right of the Atlas column, level with the cursor
      const w = preview.offsetWidth, h = preview.offsetHeight;
      const right = active ? active.closest(".plates").getBoundingClientRect().right : goal.x;
      goal.tx = Math.min(right + 28, innerWidth - w - 12);
      goal.ty = clamp(goal.y - h / 2, 12, innerHeight - h - 12);
    };
    const tick = () => {
      at.x += (goal.tx - at.x) * (reduceMotion ? 1 : 0.2);
      at.y += (goal.ty - at.y) * (reduceMotion ? 1 : 0.2);
      preview.style.transform = `translate(${at.x}px, ${at.y}px)`;
      raf = Math.abs(goal.tx - at.x) + Math.abs(goal.ty - at.y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const show = (a, x, y) => {
      if (active !== a) {
        pImg.src = a.dataset.preview;
        pNo.textContent = a.querySelector(".plate-no").textContent;
        pAbstract.textContent = a.dataset.abstract;
        preview.classList.remove("swap"); void preview.offsetWidth; preview.classList.add("swap"); // restart the fade
      }
      const first = !active;
      active = a;
      goal.x = x; goal.y = y; place();
      if (first) { at.x = goal.tx; at.y = goal.ty; } // first appearance: no slide in from the last spot
      preview.classList.add("on");
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const hide = () => { active = null; preview.classList.remove("on"); };
    links.forEach((a) => {
      a.addEventListener("pointerenter", (e) => show(a, e.clientX, e.clientY));
      a.addEventListener("pointermove", (e) => show(a, e.clientX, e.clientY));
      a.addEventListener("pointerleave", hide);
      a.addEventListener("focus", () => { const r = a.getBoundingClientRect(); show(a, r.left + Math.min(r.width, 520), r.top + r.height / 2); });
      a.addEventListener("blur", hide);
    });
    addEventListener("scroll", hide, { passive: true });
  }

  // ───────── Reveal on scroll ─────────
  const revealables = document.querySelectorAll(".intro p, .pills, .chapter > *, .atlas > *, .contact > *");
  revealables.forEach((n) => n.classList.add("reveal"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
    { rootMargin: "0px 0px -8% 0px" }
  );
  revealables.forEach((n) => io.observe(n));


  // ───────── Map sheet (sheet.js) ─────────
  const { ROMAN } = window.MapSheet;
  const NC = chapters.length;
  MapSheet.setLabel(() => `SHEET ${ROMAN[clamp(Math.round(current.p), 1, NC) - 1]} OF ${ROMAN[NC - 1]}`);

  // sheet numbers above each chapter heading
  chapters.forEach((c, i) => {
    const k = document.createElement("p");
    k.className = "sheet-no";
    k.textContent = `Sheet ${ROMAN[i]} of ${ROMAN[NC - 1]}`;
    c.insertBefore(k, c.firstChild);
  });

  // ───────── Main loop ─────────
  function frame(time) {
    if (lenis) lenis.raf(time);
    const p = storyProgress();
    // ease the panel toward the scroll position so numbers glide rather than jump
    const next = reduceMotion ? p : current.p + (p - current.p) * 0.14;
    const moved = Math.abs(next - current.p) > 0.0004;
    current.p = Math.abs(p - next) < 0.0004 ? p : next;
    if (moved) renderPanel(current.p);
    if (moved || gridBusy) gridBusy = drawContrib();
    requestAnimationFrame(frame);
  }

  resize();
  renderPanel(0);
  requestAnimationFrame(frame);
})();
