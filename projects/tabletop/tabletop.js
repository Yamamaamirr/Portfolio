import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ───────── 3D viewers ─────────
// The Metashape meshes, decimated to 150k faces and packed as: [u32 header length][JSON header]
// [u16 xyz, quantised to the bounding box]([u16 uv] in the photo files)[u32 triangle indices].
// data-mode="photo" shows the photo-textured mesh; otherwise the surface is shaded and coloured by height.
// Each viewer loads when it nears view and only draws while on screen.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// the stylised look from Plate I: a blue ramp from the table to the top of the box
const RAMP = ["#e9e6dc", "#c9d8e6", "#a9bfd4", "#4f7fa8", "#1f4e79", "#132f4a"].map((c) => new THREE.Color(c));
const rampAt = (t) => {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(x);
  return RAMP[i].clone().lerp(RAMP[i + 1], x - i);
};

document.querySelectorAll(".model3d").forEach((host) => {
  const photo = host.dataset.mode === "photo";
  const canvas = host.querySelector("canvas");
  const status = host.querySelector(".model-status");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 20);
  camera.up.set(0, 0, 1); // the models are Z-up, in metres
  camera.position.set(0.51 - 0.55, 0.255 - 1.25, 0.95);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.51, 0.255, 0.04);
  controls.enableDamping = true;
  controls.minDistance = 0.45;
  controls.maxDistance = 2.6;
  controls.maxPolarAngle = Math.PI * 0.47; // stay above the table
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.6;
  controls.enablePan = false;

  if (!photo) {
    scene.add(new THREE.HemisphereLight(0xfffff8, 0x8a8478, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-0.6, -0.9, 1.4);
    scene.add(sun);
  }

  const models = {};
  let year = "before", mesh = null;

  async function load(name) {
    if (models[name]) return models[name];
    const file = photo ? `${name}_photo` : name;
    const [buf, tex] = await Promise.all([
      fetch(`model/${file}.bin`).then((r) => r.arrayBuffer()),
      photo ? new THREE.TextureLoader().loadAsync(`model/${file}.jpg`) : null,
    ]);
    const hl = new DataView(buf).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
    let off = 4 + hl;
    const q = new Uint16Array(buf, off, head.v * 3); off += q.byteLength;
    let quv = null;
    if (photo) { quv = new Uint16Array(buf, off, head.v * 2); off += quv.byteLength; }
    off += (4 - (off % 4)) % 4;
    const idx = new Uint32Array(buf, off, head.f * 3);

    const pos = new Float32Array(head.v * 3);
    for (let i = 0; i < head.v * 3; i++) pos[i] = head.min[i % 3] + (q[i] / 65535) * (head.max[i % 3] - head.min[i % 3]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    let material;
    if (photo) {
      geo.setAttribute("uv", new THREE.BufferAttribute(Float32Array.from(quv, (v) => v / 65535), 2));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      material = new THREE.MeshBasicMaterial({ map: tex }); // lighting is already baked into the photo texture
    } else {
      const col = new Float32Array(head.v * 3);
      for (let i = 0; i < head.v; i++) {
        const c = rampAt(pos[i * 3 + 2] / 0.155);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      material = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    models[name] = { geo, material };
    return models[name];
  }

  async function show() {
    host.classList.add("loading");
    const m = await load(year);
    host.classList.remove("loading");
    if (!mesh) { mesh = new THREE.Mesh(m.geo, m.material); scene.add(mesh); }
    mesh.geometry = m.geo;
    mesh.material = m.material;
    if (status) status.textContent = year === "before" ? "Before · 2.38M faces in Metashape, 150k here" : "After · 1.65M faces in Metashape, 150k here";
  }

  function resize() {
    const w = host.clientWidth, h = Math.round(w * (w < 600 ? 0.8 : 9 / 16));
    renderer.setSize(w, h, false);
    canvas.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  let running = false;
  function tick() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; if (!mesh) show(); tick(); }
    else if (!e.isIntersecting) running = false;
  }, { rootMargin: "200px" }).observe(host);

  controls.addEventListener("start", () => { controls.autoRotate = false; host.classList.add("touched"); });

  host.querySelectorAll(".model-years button").forEach((b, _, all) => b.addEventListener("click", () => {
    all.forEach((o) => o.setAttribute("aria-pressed", o === b));
    year = b.dataset.v;
    show();
  }));
});

// ───────── Pipeline stages: before / after ─────────
const stages = document.getElementById("stages");
if (stages) {
  const imgs = stages.querySelectorAll(".stages img");
  stages.querySelectorAll(".stage-years button").forEach((b, _, all) => b.addEventListener("click", () => {
    all.forEach((o) => o.setAttribute("aria-pressed", o === b));
    imgs.forEach((im, i) => (im.src = `img/stage_${b.dataset.v}_${i + 1}.jpg`));
  }));
}

// ───────── Cross-section ─────────
// Both DSMs (295 × 167 cells, 4 mm) as int16 tenths of a millimetre. Dragging the slider moves the section
// line on the map and redraws the profile from the grids.
const sec = document.getElementById("section");
if (sec) {
  const NX = 295, NY = 167, CELL = 0.4, X0 = -8, Y1 = 59; // cm; row 0 is the far edge of the table (y = 59 cm)
  const svg = sec.querySelector("svg"), input = sec.querySelector("input"), line = document.querySelector(".section-line");
  const label = sec.querySelector(".section-y");
  const NS = "http://www.w3.org/2000/svg";
  fetch("model/grid.bin").then((r) => r.arrayBuffer()).then((buf) => {
    const before = new Int16Array(buf, 0, NX * NY), after = new Int16Array(buf, NX * NY * 2, NX * NY);
    const ZMAX = 18;
    let draw = () => {};
    // drawn at the container's real width so the labels stay legible on phones
    function build() {
      const W = Math.round(sec.clientWidth), narrow = W < 600;
      const H = narrow ? 220 : 300, L = narrow ? 30 : 44, R = 10, T = narrow ? 30 : 14, B = 30;
      const x = (i) => L + (i / (NX - 1)) * (W - L - R);
      const y = (cm) => T + (1 - cm / ZMAX) * (H - T - B);
      const el = (tag, a, p = svg) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      [0, 5, 10, 15].forEach((v) => {
        el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v ? "tl-grid" : "tl-zero" });
        el("text", { x: L - 6, y: y(v) + 4, class: "tl-tick" }).textContent = v;
      });
      el("text", { x: L - 6, y: y(ZMAX) + 4, class: "tl-tick" }).textContent = "cm";
      (narrow ? [0, 50, 100] : [0, 20, 40, 60, 80, 100]).forEach((v) => {
        el("text", { x: x((v - X0) / CELL), y: H - 10, class: "tl-tick", style: "text-anchor: middle" }).textContent = v;
      });
      // on phones the last tick sits near the right edge, so the axis unit moves under the height scale
      el("text", { x: narrow ? L - 6 : W - R, y: H - 10, class: "tl-tick" }).textContent = narrow ? "cm" : "x, cm";
      const loss = el("path", { class: "sec-loss" }), lb = el("path", { class: "sec-before" }), la = el("path", { class: "sec-after" });
      const read = el("text", { x: W - R, y: narrow ? 12 : T + 4, class: "sec-read", style: "text-anchor: end" });
      draw = (row) => {
        const b = [], a = [];
        for (let i = 0; i < NX; i++) { b.push(before[row * NX + i] / 100); a.push(after[row * NX + i] / 100); }
        const pb = b.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
        const pa = a.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
        lb.setAttribute("d", pb); la.setAttribute("d", pa);
        loss.setAttribute("d", pb + a.map((v, i) => `L${x(NX - 1 - i)},${y(a[NX - 1 - i])}`).join("") + "Z");
        label.textContent = `y = ${(Y1 - (row + 0.5) * CELL).toFixed(1)} cm`;
        read.textContent = `largest drop on this line ${Math.max(...b.map((v, i) => v - a[i])).toFixed(1)} cm`;
        if (line) line.style.top = ((row + 0.5) / NY) * 100 + "%";
      };
      draw(+input.value);
    }
    input.max = NY - 1;
    input.addEventListener("input", () => draw(+input.value));
    build();
    let lastW = sec.clientWidth, t = null;
    addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => { if (Math.abs(sec.clientWidth - lastW) > 4) { lastW = sec.clientWidth; build(); } }, 120);
    });
  });
}
