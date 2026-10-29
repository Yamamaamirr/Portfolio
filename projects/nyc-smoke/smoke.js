(() => {
  // ───────── Four instruments, one timeline ─────────
  // Satellite rows (aerosol index, CO) are read off the Earth Engine charts; ground rows come straight
  // from the EPA AirData daily files. One SVG, shared x axis, one hover readout across all rows.
  // Drawn at the container's real width, so text stays legible on phones (labels move above each row).
  const D = window.SMOKE_DATA;
  const host = document.getElementById("timeline");
  if (!D || !host) return;

  const NS = "http://www.w3.org/2000/svg";
  const day0 = Date.UTC(2023, 4, 15), DAYS = 47;
  const dayIndex = (iso) => Math.round((Date.parse(iso) - day0) / 864e5);
  const fmt = (k) => new Date(day0 + k * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const toPts = (obj) => Object.entries(obj).map(([d, v]) => [dayIndex(d), v]).sort((a, b) => a[0] - b[0]);
  const PEAK = dayIndex("2023-06-07");

  const rows = [
    { label: "Aerosol index", sub: "satellite · smoke", unit: "", pts: [toPts(D.aai)], min: -2, max: 7,
      ticks: [0, 6], cls: ["s-aai"], dec: 2 },
    { label: "Carbon monoxide", sub: "satellite · mol/m² ×10⁶", unit: "", pts: [toPts(D.co)], min: 0, max: 180000,
      ticks: [0, 150000], cls: ["s-co"], dec: -2 },
    { label: "PM2.5", sub: "ground · µg/m³", unit: " µg/m³", pts: [toPts(D.pm.queens), toPts(D.pm.bronx)], min: 0, max: 210,
      ticks: [0, 35, 200], cls: ["s-pmq", "s-pmb"], names: ["Queens", "Bronx"], limit: 35, dec: 1 },
    { label: "NO₂", sub: "ground · ppb", unit: " ppb", pts: [toPts(D.no2).map(([k, v]) => [k, v[0]])],
      band: toPts(D.no2).map(([k, v]) => [k, v[1], v[2]]), min: 0, max: 40, ticks: [0, 20, 40], cls: ["s-no2"], dec: 1 },
  ];
  const lookups = rows.map((r) => r.pts.map((pts) => new Map(pts)));
  const fmtV = (v, dec) => (v == null ? "no data" : dec < 0 ? (Math.round(v / 100) * 100).toLocaleString("en-US") : v.toFixed(dec));

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const text = (parent, attrs, s) => { const t = el("text", attrs, parent); t.textContent = s; return t; };

  function render() {
    const W = Math.round(host.clientWidth);
    const narrow = W < 600;
    // wide: labels in a left column. narrow: labels sit in a strip above each row.
    const L = narrow ? 34 : 200, R = narrow ? 6 : 16, ROW = narrow ? 84 : 120, HEAD = narrow ? 40 : 0;
    const GAP = narrow ? 18 : 26, TOP = 16, AX = 30;
    const H = TOP + rows.length * (HEAD + ROW) + (rows.length - 1) * GAP + AX;
    const x = (k) => L + (k / (DAYS - 1)) * (W - L - R);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "timeline-svg" + (narrow ? " narrow" : ""), role: "img",
      "aria-label": "Daily aerosol index, carbon monoxide, PM2.5 and NO2 over New York City, 15 May to 30 June 2023" });

    // shaded spans: the normal week (T1) and the three smoke days
    const span = (a, b, cls, label) => {
      el("rect", { x: x(a - 0.5), y: TOP - 6, width: x(b + 0.5) - x(a - 0.5), height: H - TOP - AX + 6, class: cls }, svg);
      if (label) text(svg, { x: x(a - 0.5) + 4, y: TOP + 6, class: "tl-span" }, label);
    };
    span(dayIndex("2023-05-30"), dayIndex("2023-06-04"), "tl-t1", "T1");
    span(dayIndex("2023-06-06"), dayIndex("2023-06-08"), "tl-smoke");

    const readouts = rows.map((r, i) => {
      const top = TOP + i * (HEAD + ROW + GAP), y0 = top + HEAD;
      const y = (v) => y0 + ROW - ((Math.max(r.min, Math.min(r.max, v)) - r.min) / (r.max - r.min)) * ROW;
      const g = el("g", { class: "tl-row" }, svg);
      r.ticks.forEach((t) => {
        el("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === r.limit ? "tl-limit" : t === 0 ? "tl-zero" : "tl-grid" }, g);
        text(g, { x: L - 6, y: y(t) + 4, class: "tl-tick" }, t >= 1000 ? t / 1000 + "k" : t);
      });
      if (r.limit) text(g, { x: x(1), y: y(r.limit) - 5, class: "tl-limit-label" }, "EPA daily limit, 35");
      if (r.band) {
        const hi = r.band.map(([k, , h]) => `${x(k)},${y(h)}`), lo = r.band.slice().reverse().map(([k, l]) => `${x(k)},${y(l)}`);
        el("polygon", { points: hi.concat(lo).join(" "), class: "tl-band" }, g);
      }
      r.pts.forEach((pts, s) => {
        // break the line where days are missing (the satellite skips some days)
        let d = "";
        pts.forEach(([k, v], j) => { d += (j && k - pts[j - 1][0] === 1 ? "L" : "M") + x(k) + "," + y(v); });
        el("path", { d, class: "tl-line " + r.cls[s] }, g);
        pts.forEach(([k, v]) => el("circle", { cx: x(k), cy: y(v), r: narrow ? 2 : 2.6, class: "tl-dot " + r.cls[s] }, g));
      });
      if (narrow) {
        text(g, { x: 0, y: top + 14, class: "tl-label" }, r.label);
        text(g, { x: 0, y: top + 29, class: "tl-sub" }, r.sub);
        return text(g, { x: W, y: top + 14, class: "tl-read end" }, "");
      }
      text(g, { x: 0, y: y0 + 14, class: "tl-label" }, r.label);
      text(g, { x: 0, y: y0 + 30, class: "tl-sub" }, r.sub);
      return text(g, { x: 0, y: y0 + 52, class: "tl-read" }, "");
    });

    // date axis
    const ay = H - AX + 18;
    const dates = narrow ? [["2023-05-15", "15 May", "start"], ["2023-06-07", "7 Jun"], ["2023-06-30", "30 Jun", "end"]]
      : [["2023-05-15", "15 May", "start"], ["2023-06-01", "1 Jun"], ["2023-06-07", "7 Jun"], ["2023-06-15", "15 Jun"], ["2023-06-30", "30 Jun", "end"]];
    dates.forEach(([d, t, anchor]) => {
      const k = dayIndex(d);
      text(svg, { x: x(k), y: ay, class: "tl-tick tl-date" + (k === PEAK ? " on" : ""), style: `text-anchor: ${anchor || "middle"}` }, t);
    });

    // hover: a hairline and each row's value for that day; at rest it sits on the worst day
    const hair = el("line", { y1: TOP - 6, y2: H - AX, class: "tl-hair" }, svg);
    const hairDate = text(svg, { y: ay, class: "tl-tick tl-date tl-hairdate" }, "");
    function show(k) {
      hair.setAttribute("x1", x(k)); hair.setAttribute("x2", x(k));
      hairDate.setAttribute("x", Math.max(L + 20, Math.min(W - R - 20, x(k)))); hairDate.textContent = fmt(k);
      rows.forEach((r, i) => {
        const vals = lookups[i].map((m) => m.get(k));
        readouts[i].textContent = r.names
          ? r.names.map((n, s) => `${n} ${fmtV(vals[s], r.dec)}`).join(" · ")
          : fmtV(vals[0], r.dec) + (vals[0] == null ? "" : r.unit);
      });
    }
    const kAt = (clientX) => {
      const b = svg.getBoundingClientRect();
      return Math.max(0, Math.min(DAYS - 1, Math.round(((clientX - b.left - L) / (W - L - R)) * (DAYS - 1))));
    };
    svg.addEventListener("pointermove", (e) => show(kAt(e.clientX)));
    svg.addEventListener("pointerleave", () => show(PEAK));
    show(PEAK);
    host.replaceChildren(svg);
  }

  render();
  let lastW = host.clientWidth, t = null;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => { if (Math.abs(host.clientWidth - lastW) > 4) { lastW = host.clientWidth; render(); } }, 120);
  });
})();
