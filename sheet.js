// Map-sheet frame shared by every page: neatline, graticule, bottom collar and cursor tracking.
// Pages call MapSheet.setLabel(fn) to choose the text at the right of the collar.
// The monospace currently set on the page (--mono), for canvas labels; follows the type switch.
window.monoFont = () => getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "'JetBrains Mono', monospace";

(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ───────── Map sheet: neatline, graticule, collar, cursor tracking ─────────
  // The page is treated as one tall map of Manhattan in plain lat/lon degrees:
  // x → longitude, document y → latitude.
  const LON0 = -74.03, LON_SPAN = 0.06, LAT0 = 40.8, LAT_PER_PX = 0.000004;
  const sheet = document.getElementById("sheet");
  const sctx = sheet.getContext("2d");
  const finePointer = matchMedia("(pointer: fine)").matches;
  const mouse = { x: -1, y: -1, in: false };
  const CROSSHAIR = false; // dashed lines from the cursor to the frame; true brings them back
  let sw = 0, sh = 0, dpr = 1, sheetDirty = true, lastSheetKey = "";
  let label = () => "";

  const dms = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
    return `${d}°${String(m).padStart(2, "0")}′${String(s % 60).padStart(2, "0")}″${v >= 0 ? pos : neg}`;
  };
  const lonAt = (x) => LON0 + (x / sw) * LON_SPAN;
  const latAt = (docY) => LAT0 - docY * LAT_PER_PX;

  function sizeSheet() {
    const on = getComputedStyle(sheet).display !== "none";
    sw = on ? document.documentElement.clientWidth : 0;
    sh = on ? innerHeight : 0;
    if (!on) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    sheet.width = Math.round(sw * dpr);
    sheet.height = Math.round(sh * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sheetDirty = true;
  }

  function drawSheet() {
    if (!sw) return;
    const key = `${scrollY}|${mouse.x}|${mouse.y}|${mouse.in}|${label()}`;
    if (!sheetDirty && key === lastSheetKey) return;
    lastSheetKey = key;
    sheetDirty = false;

    const ctx = sctx, B = 24, W = sw, H = sh;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fffff8";
    ctx.fillRect(0, 0, W, B); ctx.fillRect(0, H - B, W, B);
    ctx.fillRect(0, 0, B, H); ctx.fillRect(W - B, 0, B, H);

    ctx.strokeStyle = "#141414";
    ctx.lineWidth = 1;
    ctx.strokeRect(B + 0.5, B + 0.5, W - 2 * B - 1, H - 2 * B - 1);
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(5.5, 5.5, W - 11, H - 11);
    ctx.globalAlpha = 1;

    ctx.font = `9.5px ${monoFont()}`;
    ctx.fillStyle = "#646462";
    ctx.textBaseline = "middle";

    // longitude ticks along top and bottom
    const lonStep = 0.005;
    ctx.beginPath();
    for (let lon = Math.ceil(LON0 / lonStep) * lonStep; lon < LON0 + LON_SPAN; lon += lonStep) {
      const x = Math.round(((lon - LON0) / LON_SPAN) * W) + 0.5;
      if (x < B + 30 || x > W - B - 30) continue;
      ctx.moveTo(x, B); ctx.lineTo(x, B + 7);
      ctx.moveTo(x, H - B); ctx.lineTo(x, H - B - 7);
      if (mouse.in && finePointer && Math.abs(x - mouse.x) < 80) continue; // cursor label sits here
      ctx.textAlign = "center";
      ctx.fillText(dms(lon, "E", "W"), x, B / 2 + 1);
    }
    // latitude ticks along left and right, sliding as you scroll
    const latStep = 0.0025;
    const latTop = latAt(scrollY), latBot = latAt(scrollY + H);
    for (let lat = Math.floor(latTop / latStep) * latStep; lat > latBot; lat -= latStep) {
      const y = Math.round((LAT0 - lat) / LAT_PER_PX - scrollY) + 0.5;
      if (y < B + 40 || y > H - B - 40) continue;
      ctx.moveTo(B, y); ctx.lineTo(B + 7, y);
      ctx.moveTo(W - B, y); ctx.lineTo(W - B - 7, y);
      if (mouse.in && finePointer && Math.abs(y - mouse.y) < 80) continue;
      ctx.save();
      ctx.translate(B / 2 + 1, y);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(dms(lat, "N", "S"), 0, 0);
      ctx.restore();
    }
    ctx.stroke();

    // bottom collar: sheet number (drawn over the ticks' label space)
    const yb = H - B / 2 + 1;
    ctx.fillStyle = "#fffff8";
    ctx.fillRect(B, H - B + 1, W - 2 * B, B - 2);
    ctx.fillStyle = "#646462";
    ctx.textAlign = "right";
    ctx.fillText(label(), W - B - 4, yb);

    // cursor tracking: hairlines out to the neatline, coordinates in the collar
    if (mouse.in && finePointer && mouse.x > B && mouse.x < W - B && mouse.y > B && mouse.y < H - B) {
      const mx = Math.round(mouse.x) + 0.5, my = Math.round(mouse.y) + 0.5;
      if (CROSSHAIR) {
      ctx.save();
      ctx.strokeStyle = "rgba(31,78,121,0.45)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, B); ctx.lineTo(mx, H - B);
      ctx.moveTo(B, my); ctx.lineTo(W - B, my);
      ctx.stroke();
      ctx.restore();
      }

      ctx.font = `bold 9.5px ${monoFont()}`;
      const lonTxt = dms(lonAt(mouse.x), "E", "W");
      const latTxt = dms(latAt(scrollY + mouse.y), "N", "S");
      const tw1 = ctx.measureText(lonTxt).width + 12, tw2 = ctx.measureText(latTxt).width + 12;
      ctx.fillStyle = "#1f4e79";
      ctx.fillRect(clamp(mx - tw1 / 2, B, W - B - tw1), 4, tw1, B - 8);
      ctx.save();
      ctx.translate(B / 2, clamp(my, B + tw2 / 2, H - B - tw2 / 2));
      ctx.rotate(-Math.PI / 2);
      ctx.fillRect(-tw2 / 2, -(B - 8) / 2, tw2, B - 8);
      ctx.fillStyle = "#fffff8";
      ctx.textAlign = "center";
      ctx.fillText(latTxt, 0, 1);
      ctx.restore();
      ctx.fillStyle = "#fffff8";
      ctx.textAlign = "center";
      ctx.fillText(lonTxt, clamp(mx - tw1 / 2, B, W - B - tw1) + tw1 / 2, B / 2 + 1);
    }
  }

  addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; }, { passive: true });
  document.addEventListener("mouseleave", () => (mouse.in = false));
  if (document.fonts) document.fonts.ready.then(() => (sheetDirty = true));

  addEventListener("resize", sizeSheet);
  (function loop() {
    drawSheet();
    requestAnimationFrame(loop);
  })();
  sizeSheet();

  window.MapSheet = {
    ROMAN: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"],
    dms,
    latAt,
    setLabel(fn) { label = fn; sheetDirty = true; },
  };
})();
