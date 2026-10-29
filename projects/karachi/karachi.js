(() => {
  // ───────── Population, 1975–2020 ─────────
  // GHS-POP totals for Karachi Division, summed from 1 km cells in Earth Engine and read off that chart.
  // Drawn at the container's real width, so labels stay legible on phones.
  const host = document.getElementById("growth");
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const POP = [[1975, 5.61], [1980, 7.01], [1985, 8.33], [1990, 9.79], [1995, 11.49],
    [2000, 13.22], [2005, 14.84], [2010, 16.67], [2015, 18.71], [2020, 22.75]];

  function render() {
    const W = Math.round(host.clientWidth), narrow = W < 600;
    const H = narrow ? 260 : 340, L = narrow ? 30 : 40, R = narrow ? 14 : 24, T = 34, B = 30;
    const x = (yr) => L + ((yr - 1975) / 45) * (W - L - R);
    const y = (m) => T + (1 - m / 25) * (H - T - B);
    const svg = document.createElementNS(NS, "svg");
    const el = (tag, a, p = svg) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("class", "growth-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Population of Karachi Division, 1975 to 2020: 5.6 million rising to 22.8 million, steepest after 2015");

    // the two epochs the maps compare
    el("rect", { x: x(2000), y: T - 10, width: x(2020) - x(2000), height: H - T - B + 10, class: "g-span" });
    el("text", { x: x(2000) + 6, y: T + 2, class: "g-span-label" }).textContent = "2000 → 2020";

    (narrow ? [0, 10, 20] : [0, 5, 10, 15, 20, 25]).forEach((v) => {
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v ? "tl-grid" : "tl-zero" });
      el("text", { x: L - 6, y: y(v) + 4, class: "g-tick", style: "text-anchor: end" }).textContent = v;
    });
    el("text", { x: 0, y: T - 18, class: "g-tick" }).textContent = "million people";
    (narrow ? [1975, 2000, 2020] : [1975, 1985, 1995, 2000, 2005, 2015, 2020]).forEach((yr) => {
      const anchor = yr === 1975 ? "start" : yr === 2020 ? "end" : "middle";
      el("text", { x: x(yr), y: H - 8, class: "g-tick", style: `text-anchor: ${anchor}` }).textContent = yr;
    });

    el("path", { d: POP.slice(0, 9).map(([yr, v], i) => `${i ? "L" : "M"}${x(yr)},${y(v)}`).join(""), class: "g-line" });
    el("path", { d: `M${x(2015)},${y(18.71)}L${x(2020)},${y(22.75)}`, class: "g-line g-surge" });
    POP.forEach(([yr, v]) => el("circle", { cx: x(yr), cy: y(v), r: narrow ? 2.6 : 3.2, class: yr === 2020 ? "g-dot g-surge" : "g-dot" }));

    el("text", { x: x(2000) - 8, y: y(13.22) - 10, class: "g-val", style: "text-anchor: end" }).textContent = "13.2 M";
    el("text", { x: x(2020), y: y(22.75) - 10, class: "g-val g-val-surge", style: "text-anchor: end" }).textContent = "22.8 M";
    // the surge note sits in the empty top-left of the shaded band, clear of the line
    el("text", { x: x(2000) + 6, y: y(19.5), class: "g-note" }).textContent = narrow ? "2015–20: +4.0 M" : "2015 → 2020: +4.0 M in five years";
    host.replaceChildren(svg);
  }

  render();
  let lastW = host.clientWidth, t = null;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => { if (Math.abs(host.clientWidth - lastW) > 4) { lastW = host.clientWidth; render(); } }, 120);
  });
})();
