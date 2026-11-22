import { Viewer } from "./viewer.js";
import { FEATURES, ICONS, TOOL_TYPES, PLANES, OPS } from "./features.js";
import { SHAPE_KINDS, FIELD_LABELS, outline, keyPoints, translateShape, distToOutline, shapeSummary, polyArea } from "./geom2d.js";
import { evalExpr, evalVariables, fmt } from "./expr.js";
import { io, toOBJ, to3MF, fileToBase64 } from "./io.js";
import { EXAMPLES } from "./examples.js";
import { renderMarkdown } from "./help.js";

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const uid = () => Math.random().toString(36).slice(2, 8);
const clone = (o) => structuredClone(o);

const MATERIALS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21, Nylon: 1.14, Resin: 1.1, Aluminum: 2.7, Steel: 7.85, Brass: 8.5, Wood: 0.7 };
const PART_COLORS = ["#9db4cc", "#f0a35e", "#7cc68d", "#d58bd8", "#e9d36c", "#6fc3d9", "#e07a7a", "#b0a3ff"];

const blank = () => ({ version: 1, name: "Untitled", units: "mm", material: "PLA", variables: [], features: [], parts: {}, rollback: null });

const S = {
  project: blank(),
  selected: null, // feature id
  part: null, // selected part id
  editing: null, // sketch id being edited
  tool: "select",
  draft: [], // clicked points while drawing
  cursor: null, snap: null,
  sel: [], // selected shape ids in sketch
  holeMode: false,
  snapOn: true,
  gridSize: 1,
  polySides: 6,
  showResult: false,
  measure: null, // {picks:[]}
  section: null,
  build: { bodies: [], status: {}, ms: 0 },
  localErr: {},
  dirty: false,
  kernel: "loading",
  settings: loadSettings(),
};

function loadSettings() {
  try { return Object.assign({ edges: true, grid: true, ortho: false, theme: "dark", quality: 1, autoReload: true }, JSON.parse(localStorage.getItem("dm.settings") || "{}")); }
  catch { return { edges: true, grid: true, ortho: false, theme: "dark", quality: 1, autoReload: true }; }
}
function saveSettings() { localStorage.setItem("dm.settings", JSON.stringify(S.settings)); }

// ---------- history ----------
const hist = { stack: [], idx: -1, timer: 0 };
function snapshot() { return JSON.stringify(S.project); }
function commit(immediate) {
  clearTimeout(hist.timer);
  const go = () => {
    const s = snapshot();
    if (hist.stack[hist.idx] === s) return;
    hist.stack = hist.stack.slice(0, hist.idx + 1);
    hist.stack.push(s);
    if (hist.stack.length > 250) hist.stack.shift();
    hist.idx = hist.stack.length - 1;
    S.dirty = true;
    autosaveSoon();
    renderTop();
  };
  if (immediate) go(); else hist.timer = setTimeout(go, 450);
}
function undo() {
  if (hist.idx <= 0) return toast("Nothing to undo");
  hist.idx--;
  S.project = JSON.parse(hist.stack[hist.idx]);
  afterRestore();
}
function redo() {
  if (hist.idx >= hist.stack.length - 1) return toast("Nothing to redo");
  hist.idx++;
  S.project = JSON.parse(hist.stack[hist.idx]);
  afterRestore();
}
function afterRestore() {
  if (S.selected && !feat(S.selected)) S.selected = null;
  if (S.editing && !feat(S.editing)) exitSketch(true);
  S.sel = S.sel.filter((id) => S.editing && feat(S.editing).params.shapes.some((s) => s.id === id));
  autosaveSoon();
  rebuild();
  renderAll();
}
let asTimer = 0;
function autosaveSoon() { clearTimeout(asTimer); asTimer = setTimeout(() => io.autosave({ project: S.project, savedName: S.savedName }), 600); }

// ---------- helpers ----------
const feat = (id) => S.project.features.find((f) => f.id === id);
const fIndex = (id) => S.project.features.findIndex((f) => f.id === id);
const activeCount = () => (S.project.rollback == null ? S.project.features.length : S.project.rollback + 1);
const vars = () => evalVariables(S.project.variables).vars;
function num(v, fallback = 0) { try { return evalExpr(v, vars()); } catch { return fallback; } }
function bodyName(id) {
  const meta = S.project.parts[id];
  if (meta?.name) return meta.name;
  const i = S.build.bodies.findIndex((b) => b.id === id);
  return "Part " + (i >= 0 ? i + 1 : "?");
}
function partMeta(id, idx) {
  if (!S.project.parts[id]) {
    const n = idx ?? Object.keys(S.project.parts).length;
    S.project.parts[id] = { color: PART_COLORS[n % PART_COLORS.length], visible: true };
  }
  return S.project.parts[id];
}
function featureName(f) { return f.name || FEATURES[f.type].label; }
function nextName(type) {
  const base = FEATURES[type].label;
  let n = 1;
  while (S.project.features.some((f) => featureName(f) === `${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// ---------- resolving expressions ----------
function resolvePlane(p, vs) {
  const off = evalExpr(p.offset ?? 0, vs);
  if (p.planeName === "Face" && p.plane) return { o: p.plane.o.map((v, i) => v + p.plane.n[i] * off), x: p.plane.x, n: p.plane.n };
  const b = PLANES[p.planeName] || PLANES.Top;
  return { o: b.n.map((v) => v * off), x: b.x, n: b.n };
}
function resolveShape(s, vs) {
  const r = { ...s };
  for (const k of SHAPE_KINDS[s.kind].fields) r[k] = evalExpr(s[k], vs);
  if (s.kind === "poly") r.pts = s.pts.map((p) => [evalExpr(p[0], vs), evalExpr(p[1], vs)]);
  return r;
}
function resolveFeature(f, vs) {
  const def = FEATURES[f.type];
  const p = clone(f.params);
  if (f.type === "sketch") {
    p.plane = resolvePlane(f.params, vs);
    p.shapes = f.params.shapes.map((s) => resolveShape(s, vs));
  }
  for (const fld of def.fields) {
    if (fld.type !== "num") continue;
    if (p[fld.key] === undefined || p[fld.key] === null) { p[fld.key] = 0; continue; }
    if (fld.show && !fld.show(f.params)) { try { p[fld.key] = evalExpr(p[fld.key], vs); } catch { p[fld.key] = 0; } continue; }
    try { p[fld.key] = evalExpr(p[fld.key], vs); }
    catch (e) { throw new Error(`${fld.label}: ${e.message}`); }
  }
  return { id: f.id, type: f.type, suppressed: !!f.suppressed, params: p };
}
function resolvedSketch(f) {
  try { const r = resolveFeature(f, vars()); return r.params; } catch { return null; }
}

// ---------- worker ----------
let worker, reqId = 0, pending = new Map(), building = false, queued = false;
function startWorker() {
  worker = new Worker(new URL("../worker/worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    const cb = pending.get(m.req);
    if (cb) { pending.delete(m.req); cb(m); }
  };
  worker.onerror = (e) => { S.kernel = "error"; renderStatus(); console.error(e); };
  call({ type: "ping" }).then((m) => { S.kernel = m.type === "ready" ? "ready" : "error"; renderStatus(); });
}
function call(msg) {
  return new Promise((res) => { const r = ++reqId; pending.set(r, res); worker.postMessage({ ...msg, req: r }); });
}
let rbTimer = 0;
function rebuild(delay = 40) { clearTimeout(rbTimer); rbTimer = setTimeout(doBuild, delay); }
async function doBuild() {
  if (building) { queued = true; return; }
  building = true;
  renderStatus("Building…");
  const vs = vars();
  S.localErr = {};
  let until = activeCount();
  const selF = S.selected && feat(S.selected);
  if (selF && pickModeFor(selF) && !S.showResult) until = Math.min(until, fIndex(selF.id));
  const list = [];
  for (const f of S.project.features.slice(0, until)) {
    try { list.push(resolveFeature(f, vs)); }
    catch (e) { S.localErr[f.id] = e.message; list.push({ id: f.id, type: f.type, suppressed: true, params: {} }); }
  }
  const m = await call({ type: "build", features: list, quality: S.settings.quality });
  building = false;
  if (m.type === "built") {
    S.build = { bodies: m.bodies, status: m.status, ms: m.ms };
    m.bodies.forEach((b, i) => partMeta(b.id, i));
    if (S.part && !m.bodies.some((b) => b.id === S.part)) S.part = null;
    viewer.setBodies(m.bodies, S.project.parts);
    viewer.updateGrid(sceneSize());
    if (!S.fitted && m.bodies.length) { S.fitted = true; viewer.fit(false); }
    refreshPicks();
  } else {
    toast("Kernel error: " + m.error, "err");
  }
  renderTree(); renderParts(); renderStatus(); renderSketchOverlay();
  if (!S.editing && !$("#props").contains(document.activeElement)) renderProps();
  else updatePropErrors();
  if (queued) { queued = false; doBuild(); }
}
function sceneSize() {
  const b = viewer.modelBox();
  if (b.isEmpty()) return 100;
  const s = b.max.clone().sub(b.min);
  return Math.max(s.x, s.y, s.z, 10);
}

// ---------- features ----------
function ctxForDefaults() {
  const before = S.project.features.slice(0, activeCount());
  const sketches = before.filter((f) => f.type === "sketch");
  const tools = before.filter((f) => TOOL_TYPES.has(f.type));
  const bodies = S.build.bodies;
  return {
    lastSketch: sketches.at(-1)?.id || "", prevSketch: sketches.at(-2)?.id || "",
    lastTool: tools.at(-1)?.id || (bodies.at(-1) ? "body:" + bodies.at(-1).id : ""),
    hasBodies: bodies.length > 0, prevBody: bodies.at(-2)?.id,
  };
}
function addFeature(type, extra = {}) {
  if (S.editing) finishSketch();
  const c = ctxForDefaults();
  const f = { id: uid(), type, name: nextName(type), params: { ...FEATURES[type].defaults(c), ...extra } };
  if (type === "fillet" || type === "chamfer") S.showResult = false;
  if (type === "shell" || type === "draft") {
    S.showResult = false;
    if (type === "shell") {
      const top = topFace();
      if (top) f.params.faces = [top];
    }
  }
  const at = activeCount();
  S.project.features.splice(at, 0, f);
  if (S.project.rollback != null) S.project.rollback++;
  S.selected = f.id;
  S.part = null;
  commit(true);
  if (type === "sketch") { enterSketch(f.id); return f; }
  rebuild(0);
  renderAll();
  return f;
}
function topFace() {
  const b = S.build.bodies.at(-1);
  if (!b || !b.faces) return null;
  let best = null;
  for (const fc of b.faces) if (fc.t === "PLANE" && fc.n && fc.n[2] > 0.99 && (!best || fc.c[2] > best.c[2])) best = fc;
  return best ? { body: b.id, p: best.c, n: best.n } : null;
}
function deleteFeature(id) {
  const i = fIndex(id);
  if (i < 0) return;
  const f = S.project.features[i];
  const users = S.project.features.filter((x) => Object.values(x.params).includes(id) || x.params.ref === id);
  S.project.features.splice(i, 1);
  if (S.project.rollback != null && i <= S.project.rollback) S.project.rollback = Math.max(-1, S.project.rollback - 1);
  if (S.selected === id) S.selected = null;
  if (S.editing === id) exitSketch(true);
  commit(true);
  rebuild(0);
  renderAll();
  toast(`Deleted ${featureName(f)}` + (users.length ? ` — ${users.length} feature(s) used it` : ""), users.length ? "warn" : "", { label: "Undo", fn: undo });
}
function selectFeature(id) {
  if (S.editing && S.editing !== id) finishSketch();
  const prevPick = S.selected && pickModeFor(feat(S.selected));
  S.selected = id;
  S.part = null;
  S.showResult = false;
  viewer.setSelectedPart(null);
  const nowPick = id && pickModeFor(feat(id));
  if (prevPick || nowPick) rebuild(0);
  renderAll();
}
function pickModeFor(f) {
  if (!f) return null;
  if ((f.type === "fillet" || f.type === "chamfer") && f.params.sel === "picked") return "edges";
  if (f.type === "shell" || f.type === "draft") return "faces";
  return null;
}
function setParam(f, key, val, opts = {}) {
  f.params[key] = val;
  commit();
  rebuild();
  if (opts.rerender) renderProps();
  else updatePropErrors();
}

// ---------- sketch editing ----------
function enterSketch(id) {
  const f = feat(id);
  if (!f) return;
  S.selected = id;
  S.editing = id;
  S.tool = f.params.shapes.length ? "select" : "rect";
  S.draft = []; S.sel = [];
  viewer.pickMode = "sketch";
  viewer.setMouseMode("sketch");
  S.wasOrtho = S.settings.ortho;
  viewer.setOrtho(true);
  const rp = resolvedSketch(f);
  if (rp) viewer.alignToPlane(rp.plane);
  autoGrid();
  renderAll();
  rebuild(0);
}
function autoGrid() {
  const s = sceneSize();
  if (!S.userGrid) S.gridSize = s > 400 ? 10 : s > 80 ? 1 : s > 20 ? 0.5 : 0.1;
}
function finishSketch() {
  if (!S.editing) return;
  const f = feat(S.editing);
  S.editing = null;
  S.draft = [];
  viewer.pickMode = null;
  viewer.setMouseMode("model");
  viewer.setOrtho(!!S.settings.ortho);
  viewer.setLabels([]);
  if (f && f.params.shapes.length && !S.project.features.some((x) => Object.values(x.params).includes(f.id))) {
    S.hintNext = true;
  }
  commit(true);
  rebuild(0);
  renderAll();
}
function exitSketch(silent) {
  S.editing = null; S.draft = [];
  viewer.pickMode = null;
  viewer.setMouseMode("model");
  viewer.setOrtho(!!S.settings.ortho);
  viewer.setLabels([]);
  if (!silent) renderAll();
}
function curSketch() { return S.editing ? feat(S.editing) : null; }
function sketchPlane() { const f = curSketch(); return f ? resolvedSketch(f)?.plane : null; }

function snapPoint(uv, wpp, extra = []) {
  const f = curSketch();
  const rp = resolvedSketch(f);
  const tol = wpp * 10;
  let best = null, bd = tol;
  const cands = [[0, 0], ...extra];
  for (const s of rp?.shapes || []) if (!S.drag || !S.sel.includes(s.id)) cands.push(...keyPoints(s));
  for (const p of cands) {
    const d = Math.hypot(p[0] - uv[0], p[1] - uv[1]);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return { p: [best[0], best[1]], kind: "point" };
  let p = uv;
  if (S.snapOn) { const g = S.gridSize; p = [Math.round(uv[0] / g) * g, Math.round(uv[1] / g) * g]; }
  const last = S.draft.at(-1);
  if (last && S.tool === "line") {
    if (Math.abs(p[0] - last[0]) < wpp * 6) p = [last[0], p[1]];
    if (Math.abs(p[1] - last[1]) < wpp * 6) p = [p[0], last[1]];
  }
  return { p: [+p[0].toFixed(6), +p[1].toFixed(6)], kind: "grid" };
}

function previewShape(pts, cur) {
  const a = pts[0], b = cur;
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  switch (S.tool) {
    case "rect": return { kind: "rect", x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: Math.abs(dx), h: Math.abs(dy), r: 0, a: 0 };
    case "crect": return { kind: "rect", x: a[0], y: a[1], w: Math.abs(dx) * 2, h: Math.abs(dy) * 2, r: 0, a: 0 };
    case "circle": return { kind: "circle", x: a[0], y: a[1], d: Math.hypot(dx, dy) * 2 };
    case "polygon": return { kind: "polygon", x: a[0], y: a[1], r: Math.hypot(dx, dy), n: S.polySides, a: +((Math.atan2(dy, dx) * 180) / Math.PI - 90).toFixed(3) };
    case "ellipse": return { kind: "ellipse", x: a[0], y: a[1], rx: Math.abs(dx), ry: Math.abs(dy), a: 0 };
    case "slot": { const L = Math.hypot(dx, dy); return { kind: "slot", x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: S.slotW || Math.max(S.gridSize, +(L / 4).toPrecision(2)) }; }
    case "line": return { kind: "poly", pts: [...pts, b], closed: false };
  }
  return null;
}
function liveDims(sh) {
  if (!sh) return "";
  if (sh.kind === "poly") { const a = sh.pts.at(-2), b = sh.pts.at(-1); return a ? `${fmt(Math.hypot(b[0] - a[0], b[1] - a[1]), 2)}` : ""; }
  return shapeSummary(sh);
}
function validShape(s) {
  if (!s) return false;
  switch (s.kind) {
    case "rect": return s.w > 1e-6 && s.h > 1e-6;
    case "circle": return s.d > 1e-6;
    case "polygon": return s.r > 1e-6;
    case "ellipse": return s.rx > 1e-6 && s.ry > 1e-6;
    case "slot": return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 1e-6;
    case "poly": return s.pts.length >= 3 && Math.abs(polyArea(s.pts)) > 1e-8;
  }
  return false;
}
function pointInPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function addShape(s) {
  const f = curSketch();
  if (!validShape(s)) return;
  const clean = { id: uid(), ...s };
  delete clean.closed; delete clean.preview;
  for (const k of Object.keys(clean)) if (typeof clean[k] === "number") clean[k] = +clean[k].toFixed(4);
  if (clean.pts) clean.pts = clean.pts.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  let hole = S.holeMode;
  if (!hole) {
    const pts = outline(clean);
    const rp = resolvedSketch(f);
    for (const o of rp?.shapes || []) {
      if (o.hole || o.construction) continue;
      const op = outline(o);
      if (pts.every((p) => pointInPoly(p, op))) { hole = true; break; }
    }
  }
  clean.hole = hole;
  f.params.shapes.push(clean);
  S.sel = [clean.id];
  if (hole && !S.holeMode) toast("Drawn inside another shape → made it a hole. Toggle it in the list if you want it solid.");
  commit(true);
  rebuild();
  renderProps();
  renderSketchOverlay();
}

function onSketchDown(e) {
  const pl = sketchPlane();
  if (!pl) return;
  const hit = viewer.planePoint(e, pl);
  if (!hit) return;
  const sn = snapPoint(hit.uv, hit.wpp, S.draft);
  if (S.tool === "select") {
    const f = curSketch(), rp = resolvedSketch(f);
    let best = null, bd = hit.wpp * 8;
    for (const s of rp.shapes) { const d = distToOutline(s, hit.uv); if (d < bd) { bd = d; best = s; } }
    if (!best) for (const s of rp.shapes) if (pointInPoly(hit.uv, outline(s))) best = s;
    if (best) {
      if (e.shiftKey) S.sel = S.sel.includes(best.id) ? S.sel.filter((x) => x !== best.id) : [...S.sel, best.id];
      else if (!S.sel.includes(best.id)) S.sel = [best.id];
      S.drag = { start: sn.p, orig: clone(f.params.shapes), moved: false };
    } else S.sel = [];
    renderProps();
    renderSketchOverlay();
    return;
  }
  if (S.tool === "line") {
    if (S.draft.length >= 3 && Math.hypot(sn.p[0] - S.draft[0][0], sn.p[1] - S.draft[0][1]) < hit.wpp * 10) {
      addShape({ kind: "poly", pts: S.draft });
      S.draft = [];
    } else S.draft.push(sn.p);
    renderSketchOverlay();
    return;
  }
  if (!S.draft.length) S.draft = [sn.p];
  else {
    addShape(previewShape(S.draft, sn.p));
    S.draft = [];
  }
  renderSketchOverlay();
}
function onSketchMove(e) {
  const pl = sketchPlane();
  if (!pl) return;
  const hit = viewer.planePoint(e, pl);
  if (!hit) return;
  const sn = snapPoint(hit.uv, hit.wpp, S.draft);
  S.cursor = sn.p; S.snap = sn; S.screen = [e.offsetX, e.offsetY];
  if (S.drag && e.buttons & 1) {
    const dx = sn.p[0] - S.drag.start[0], dy = sn.p[1] - S.drag.start[1];
    const f = curSketch();
    f.params.shapes = S.drag.orig.map((s) => (S.sel.includes(s.id) && isPlain(s) ? translateShape(s, dx, dy) : s));
    S.drag.moved = true;
    rebuild(120);
  }
  renderSketchOverlay();
}
function isPlain(s) {
  const ks = [...SHAPE_KINDS[s.kind].fields];
  return ks.every((k) => typeof s[k] === "number") && (!s.pts || s.pts.every((p) => typeof p[0] === "number" && typeof p[1] === "number"));
}
function onSketchUp() {
  if (S.drag) {
    if (S.drag.moved) { commit(true); renderProps(); }
    S.drag = null;
  }
}
function renderSketchOverlay() {
  const list = [];
  const consumed = new Set();
  for (const f of S.project.features) for (const k of ["sketch", "sketchA", "sketchB"]) if (f.params[k]) consumed.add(f.params[k]);
  S.project.features.slice(0, activeCount()).forEach((f) => {
    if (f.type !== "sketch") return;
    const editing = S.editing === f.id;
    const show = editing || S.selected === f.id || f.show === true || (f.show === undefined && !consumed.has(f.id));
    if (!show) return;
    const rp = resolvedSketch(f);
    if (!rp) return;
    const shapes = [...rp.shapes];
    let snap = null;
    if (editing) {
      if (S.tool !== "select" && S.cursor) {
        const pv = previewShape(S.draft, S.cursor);
        if (pv && S.draft.length) shapes.push({ ...pv, id: "_pv", preview: true, hole: S.holeMode });
      }
      snap = S.tool !== "select" || S.drag ? S.snap : null;
    }
    list.push({ plane: rp.plane, shapes, active: editing, selected: editing ? S.sel : [], snap, gridSize: S.gridSize, preview: editing });
  });
  viewer.setSketches(list, sceneSize());
  if (S.editing && S.cursor && S.tool !== "select" && S.screen) {
    const pv = S.draft.length ? previewShape(S.draft, S.cursor) : null;
    const t = (pv ? liveDims(pv) + "   " : "") + `(${fmt(S.cursor[0], 2)}, ${fmt(S.cursor[1], 2)})`;
    viewer.setLabels([{ screen: S.screen, text: t, cls: "dim" }]);
  } else if (S.editing) viewer.setLabels([]);
}

// ---------- picking ----------
function refreshPicks() {
  const f = S.selected && feat(S.selected);
  const mode = pickModeFor(f);
  if (S.editing) return;
  if (S.measure) { viewer.pickMode = "measure"; viewer.setPicked([], []); return; }
  if (S.facePlanePick) { viewer.pickMode = "face-plane"; viewer.setPicked([], []); return; }
  viewer.pickMode = mode;
  if (mode === "edges") viewer.setPicked(f.params.edges, []);
  else if (mode === "faces") viewer.setPicked([], f.params.faces);
  else viewer.setPicked([], []);
}
function onPick(hit, e) {
  if (S.facePlanePick) {
    if (hit && hit.kind === "face" && hit.info?.t === "PLANE") {
      const cb = S.facePlanePick;
      S.facePlanePick = null;
      cb(hit);
    }
    return;
  }
  if (S.measure) return measurePick(hit);
  const f = S.selected && feat(S.selected);
  const mode = pickModeFor(f);
  if (mode === "edges") {
    if (!hit || hit.kind !== "edge" || !hit.info.m) return;
    const list = f.params.edges;
    const i = list.findIndex((x) => x.body === hit.body && Math.hypot(...x.p.map((v, k) => v - hit.info.m[k])) < 1e-6);
    if (i >= 0) list.splice(i, 1); else list.push({ body: hit.body, p: hit.info.m });
    setParam(f, "edges", list);
    viewer.setPicked(list, []);
    renderProps();
    return;
  }
  if (mode === "faces") {
    if (!hit || hit.kind !== "face" || !hit.info.c) return;
    const list = f.params.faces;
    const i = list.findIndex((x) => x.body === hit.body && Math.hypot(...x.p.map((v, k) => v - hit.info.c[k])) < 1e-6);
    if (i >= 0) list.splice(i, 1); else list.push({ body: hit.body, p: hit.info.c, n: hit.info.n });
    setParam(f, "faces", list);
    viewer.setPicked([], list);
    renderProps();
    return;
  }
  // plain click: select part
  S.part = hit ? hit.body : null;
  if (hit) S.selected = null;
  viewer.setSelectedPart(S.part);
  renderTree(); renderParts(); renderProps();
}
function faceToPlane(hit) {
  const n = hit.info.n.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
  const c = hit.info.c;
  const d = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
  const o = n.map((v) => +(v * d).toFixed(6));
  let x;
  if (Math.abs(n[2]) > 0.999) x = [1, 0, 0];
  else { const z = [0, 0, 1]; x = [z[1] * n[2] - z[2] * n[1], z[2] * n[0] - z[0] * n[2], z[0] * n[1] - z[1] * n[0]]; const l = Math.hypot(...x); x = x.map((v) => v / l); }
  return { o, x, n };
}

// ---------- measure ----------
function startMeasure() {
  if (S.editing) finishSketch();
  S.measure = { picks: [] };
  S.selected = null;
  refreshPicks();
  renderAll();
  hint("Measure: click faces, edges or two points. Esc to stop.");
}
function stopMeasure() { S.measure = null; viewer.setMarkers([], []); viewer.setLabels([]); refreshPicks(); renderAll(); }
function snapToEdgeEnd(hit) {
  const cur = viewer.bodies.get(hit.body);
  if (!cur || hit.kind !== "edge") return hit.point;
  const g = hit.info, L = cur.data.lines;
  const ends = [[L[g.start * 3], L[g.start * 3 + 1], L[g.start * 3 + 2]], [L[(g.start + g.count - 1) * 3], L[(g.start + g.count - 1) * 3 + 1], L[(g.start + g.count - 1) * 3 + 2]]];
  const tol = viewer.worldPerPixel() * 14;
  for (const p of ends) if (Math.hypot(p[0] - hit.point[0], p[1] - hit.point[1], p[2] - hit.point[2]) < tol) return p;
  return hit.point;
}
function measurePick(hit) {
  const M = S.measure;
  if (!hit) { M.picks = []; M.result = null; viewer.setMarkers([], []); viewer.setLabels([]); renderProps(); return; }
  const p = snapToEdgeEnd(hit);
  if (M.picks.length >= 2) M.picks = [];
  M.picks.push({ ...hit, point: p });
  const pts = M.picks.map((x) => x.point);
  const labels = [];
  const res = [];
  for (const k of M.picks) {
    if (k.kind === "edge" && k.info.len != null) res.push(`Edge (${(k.info.t || "").toLowerCase()}): length ${fmt(k.info.len)} ${S.project.units}`);
    if (k.kind === "face" && k.info.area != null) res.push(`Face (${(k.info.t || "").toLowerCase()}): area ${fmt(k.info.area)} ${S.project.units}²`);
  }
  const lines = [];
  if (pts.length === 2) {
    const d = pts[1].map((v, i) => v - pts[0][i]);
    const dist = Math.hypot(...d);
    res.unshift(`Distance ${fmt(dist)} ${S.project.units}`, `ΔX ${fmt(d[0])}   ΔY ${fmt(d[1])}   ΔZ ${fmt(d[2])}`);
    const a = M.picks[0], b = M.picks[1];
    if (a.kind === "face" && b.kind === "face" && a.info.t === "PLANE" && b.info.t === "PLANE") {
      const dot = a.info.n.reduce((s, v, i) => s + v * b.info.n[i], 0);
      if (Math.abs(Math.abs(dot) - 1) < 1e-6) {
        const gap = Math.abs(a.info.n.reduce((s, v, i) => s + v * (b.info.c[i] - a.info.c[i]), 0));
        res.unshift(`Parallel faces: gap ${fmt(gap)} ${S.project.units}`);
      } else res.unshift(`Angle between faces ${fmt((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI, 2)}°`);
    }
    lines.push(pts);
    labels.push({ p: pts[0].map((v, i) => (v + pts[1][i]) / 2), text: fmt(dist, 2), cls: "measure" });
  }
  M.result = res;
  viewer.setMarkers(pts, lines);
  viewer.setLabels(labels);
  renderProps();
}

// ---------- export ----------
async function exportAs(fmtName, opts = {}) {
  const ids = opts.ids || S.build.bodies.filter((b) => S.project.parts[b.id]?.visible !== false && !b.error).map((b) => b.id);
  if (!ids.length) return toast("Nothing visible to export", "warn");
  const base = (opts.base || S.project.name || "model").replace(/[\\/:*?"<>|]+/g, "_");
  const scale = S.project.units === "in" ? 25.4 : 1;
  const tol = { draft: 0.1, normal: 0.03, fine: 0.01 }[opts.res || "normal"];
  toast("Exporting " + fmtName.toUpperCase() + "…");
  let files = [];
  try {
    if (fmtName === "stl" || fmtName === "step") {
      const m = await call({ type: "export", fmt: fmtName, bodies: ids, tol, separate: !!opts.separate, scale });
      if (m.type === "error") throw new Error(m.error);
      files = m.files.map((x) => ({ name: base + (opts.separate ? "_" + bodyName(x.id) : "") + "." + fmtName, data: new Blob([x.buf]) }));
    } else {
      const m = await call({ type: "export", fmt: "mesh", bodies: ids, tol });
      if (m.type === "error") throw new Error(m.error);
      const meshes = m.files.map((x) => ({ name: bodyName(x.id), vertices: x.vertices, triangles: x.triangles }));
      files = [{ name: base + "." + fmtName, data: fmtName === "3mf" ? to3MF(meshes, scale) : new Blob([toOBJ(meshes, scale)]) }];
    }
    for (let i = 0; i < files.length; i++) files[i] = { ...files[i], data: await files[i].data };
    let saved = null;
    for (const fl of files) saved = (await io.exportFile(fl.name, fl.data)) || saved;
    if (saved && saved.path) {
      const actions = [{ label: "Show in folder", fn: () => io.openPath(saved.path, "folder") }];
      if (io.info?.bambu && fmtName !== "step") actions.unshift({ label: "Open in Bambu Studio", fn: () => io.openPath(saved.path, "bambu") });
      if (opts.bambu && io.info?.bambu) io.openPath(saved.path, "bambu");
      toast(`Saved ${files.length > 1 ? files.length + " files" : files[0].name} to Documents › DOOG Modeler › Exports`, "ok", actions);
    } else toast("Exported " + files.map((f) => f.name).join(", "), "ok");
  } catch (e) { toast("Export failed: " + e.message, "err"); }
}
// ---------- project files ----------
async function newProject() {
  if (S.editing) exitSketch(true);
  S.project = blank();
  S.savedName = null; S.selected = null; S.part = null; S.fitted = false;
  hist.stack = []; hist.idx = -1; commit(true);
  rebuild(0); renderAll();
  viewer.view("iso");
}
async function saveProject(as) {
  let name = S.savedName;
  if (as || !name) {
    name = await promptText("Save project as", S.project.name || "Untitled");
    if (!name) return;
  }
  S.project.name = name;
  try {
    await io.save(name, S.project);
    S.savedName = name; S.dirty = false;
    autosaveSoon();
    toast("Saved “" + name + "”" + (io.desktop ? " to Documents › DOOG Modeler" : " in this browser"), "ok");
    renderTop();
  } catch (e) { toast("Save failed: " + e.message, "err"); }
}
async function openProject(name) {
  try {
    const p = await io.load(name);
    loadProject(p, name);
    closeModal();
    toast("Opened “" + name + "”");
  } catch (e) { toast(e.message, "err"); }
}
function loadProject(p, savedName) {
  if (S.editing) exitSketch(true);
  S.project = Object.assign(blank(), p);
  S.savedName = savedName || null;
  S.selected = null; S.part = null; S.fitted = false;
  hist.stack = []; hist.idx = -1; commit(true);
  rebuild(0); renderAll();
  setTimeout(() => viewer.view("iso"), 50);
}

// ---------- UI rendering ----------
function renderAll() { renderTop(); renderRibbon(); renderTree(); renderParts(); renderProps(); renderStatus(); renderSketchOverlay(); renderViewbar(); refreshPicks(); }

function btn(icon, label, fn, opts = {}) {
  return h("button", { class: "rb " + (opts.cls || "") + (opts.active ? " active" : ""), title: (opts.tip || label) + (opts.key ? `  (${opts.key})` : ""), onclick: fn, disabled: opts.disabled },
    h("span", { class: "ic", html: ICONS[icon] || "" }), h("span", { class: "lb" }, label));
}
function renderTop() {
  const t = $("#top");
  t.innerHTML = "";
  const name = h("input", { class: "pname", value: S.project.name, spellcheck: "false", title: "Project name",
    onchange: (e) => { S.project.name = e.target.value.trim() || "Untitled"; commit(true); } });
  t.append(
    h("div", { class: "logo", html: `<b>DOOG</b> Modeler` }),
    name,
    h("span", { class: "dirty" }, S.dirty ? "●" : ""),
    h("div", { class: "tb" },
      iconBtn("newdoc", "New project", newProject),
      iconBtn("open", "Open project (Ctrl+O)", showOpen),
      iconBtn("save", "Save (Ctrl+S)", () => saveProject()),
      iconBtn("export", "Export / 3D print", showExport),
      h("span", { class: "sep" }),
      iconBtn("undo", "Undo (Ctrl+Z)", undo, hist.idx <= 0),
      iconBtn("redo", "Redo (Ctrl+Y)", redo, hist.idx >= hist.stack.length - 1),
    ),
    h("div", { class: "grow" }),
    h("select", { class: "units", title: "Units", onchange: (e) => { S.project.units = e.target.value; commit(true); renderAll(); } },
      ...["mm", "in"].map((u) => h("option", { value: u, selected: S.project.units === u }, u))),
    iconBtn("examples", "Examples & tutorials", showExamples),
    iconBtn("help", "How to use (F1)", showHelp),
    iconBtn("sun", "Settings", showSettings),
    h("span", { class: "ver " + (S.updState || ""), title: io.desktop ? "Auto-updates from GitHub. Version " + io.version : "Running in a browser (no auto-update)" }, io.desktop ? "● " + io.version.slice(0, 7) : "web"),
  );
}
function iconBtn(icon, tip, fn, disabled) { return h("button", { class: "ib", title: tip, onclick: fn, disabled, html: ICONS[icon] }); }

function renderRibbon() {
  const r = $("#ribbon");
  r.innerHTML = "";
  const grp = (title, ...items) => h("div", { class: "grp" }, h("div", { class: "items" }, ...items), h("div", { class: "gt" }, title));
  if (S.editing) {
    const t = (id, icon, label, key) => btn(icon, label, () => { S.tool = id; S.draft = []; renderRibbon(); renderSketchOverlay(); hint(TOOL_HINT[id]); }, { active: S.tool === id, key });
    r.append(
      grp("Draw",
        t("select", "select", "Select", "Esc"), t("line", "line", "Line", "L"), t("rect", "rect", "Rectangle", "R"), t("crect", "crect", "Center Rect"),
        t("circle", "circle", "Circle", "C"), t("polygon", "polygon", "Polygon", "P"), t("slot", "slot", "Slot", "O"), t("ellipse", "ellipse", "Ellipse")),
      grp("Options",
        btn("cut", S.holeMode ? "Hole: ON" : "Hole: off", () => { S.holeMode = !S.holeMode; renderRibbon(); }, { active: S.holeMode, tip: "New shapes are holes (H)" }),
        btn("grid", S.snapOn ? "Snap: ON" : "Snap: off", () => { S.snapOn = !S.snapOn; renderRibbon(); }, { active: S.snapOn, tip: "Snap to grid (G)" }),
        h("label", { class: "rsel" }, "Grid",
          h("select", { onchange: (e) => { S.gridSize = +e.target.value; S.userGrid = true; renderSketchOverlay(); } },
            ...[0.1, 0.5, 1, 2, 5, 10, 25].map((g) => h("option", { value: g, selected: S.gridSize === g }, g)))),
        S.tool === "polygon" ? h("label", { class: "rsel" }, "Sides", h("input", { type: "number", min: 3, max: 64, value: S.polySides, oninput: (e) => (S.polySides = Math.max(3, +e.target.value || 6)) })) : null,
      ),
      grp("View", btn("fit", "Look at", () => viewer.alignToPlane(sketchPlane()), { tip: "Face the sketch plane" })),
      h("div", { class: "grow" }),
      h("button", { class: "finish", onclick: finishSketch, title: "Finish sketch (Enter)" }, h("span", { class: "ic", html: ICONS.check }), "Finish Sketch"),
    );
    return;
  }
  const a = (type, label, key, tip) => btn(type === "cutx" ? "cut" : type, label || FEATURES[type]?.label, () => (type === "cutx" ? addFeature("extrude", { op: "cut", mode: "through", flip: cutFlip() }) : addFeature(type)), { key, tip: tip || FEATURES[type]?.hint });
  r.append(
    grp("Sketch", btn("sketch", "Sketch", showSketchPlane, { key: "S", cls: "big", tip: "Start a 2D sketch on a plane or a flat face" })),
    grp("Create", a("extrude", null, "E"), a("cutx", "Cut", "X", "Cut a sketch through the part"), a("revolve", null, "V"), a("loft")),
    grp("Shapes", a("box", null, "B"), a("cylinder"), a("sphere"), a("cone"), a("torus")),
    grp("Modify", a("fillet", null, "F"), a("chamfer"), a("shell"), a("draft")),
    grp("Copy", a("pattern_linear", "Linear"), a("pattern_circular", "Circular"), a("mirror", null, "M")),
    grp("Parts", a("move", "Move"), a("scale"), a("boolean"), a("split"), a("remove", "Delete"), btn("import", "Import", importFile, { tip: "Import STEP / STL" })),
    grp("Inspect",
      btn("measure", "Measure", () => (S.measure ? stopMeasure() : startMeasure()), { active: !!S.measure, key: "Q" }),
      btn("section", "Section", toggleSection, { active: !!S.section, tip: "Cut-away view" }),
      btn("vars", "Variables", showVariables, { tip: "Named values usable in any number field" })),
  );
}
const TOOL_HINT = {
  select: "Click a shape to select it, drag to move it. Shift-click for multiple. Delete removes.",
  line: "Click points to draw. Click the first point (or press Enter) to close the shape.",
  rect: "Click one corner, then the opposite corner.",
  crect: "Click the center, then a corner.",
  circle: "Click the center, then a point on the edge.",
  polygon: "Click the center, then a corner. Set the side count in the ribbon.",
  slot: "Click the start, then the end. Edit the width in the panel.",
  ellipse: "Click the center, then a corner of its bounding box.",
};
function cutFlip() {
  const sk = S.project.features.slice(0, activeCount()).filter((f) => f.type === "sketch").at(-1);
  return sk?.params.planeName === "Face";
}

function renderTree() {
  const el = $("#tree");
  el.innerHTML = "";
  const n = activeCount();
  const fs = S.project.features;
  if (!fs.length) el.append(h("div", { class: "empty" }, "No features yet.", h("br"), "Start with ", h("a", { onclick: showSketchPlane }, "Sketch"), " or a ", h("a", { onclick: () => addFeature("box") }, "Box"), "."));
  fs.forEach((f, i) => {
    const st = S.build.status[f.id] || {};
    const err = S.localErr[f.id] || st.error;
    const rolled = i >= n;
    const row = h("div", {
      class: "fi" + (S.selected === f.id ? " sel" : "") + (f.suppressed ? " sup" : "") + (rolled ? " rolled" : "") + (err ? " err" : ""),
      onclick: () => selectFeature(f.id),
      ondblclick: () => (f.type === "sketch" ? enterSketch(f.id) : null),
      oncontextmenu: (e) => { e.preventDefault(); treeMenu(e, f); },
      title: err || (st.ms != null ? `Built in ${st.ms} ms` : ""),
    },
      h("span", { class: "ic", html: ICONS[f.type] }),
      h("span", { class: "nm" }, featureName(f)),
      err ? h("span", { class: "bad", title: err }, "!") : null,
      f.type === "sketch" ? h("button", { class: "mini", title: "Show/hide", html: sketchVisible(f) ? ICONS.eye : ICONS.eyeoff, onclick: (e) => { e.stopPropagation(); f.show = !sketchVisible(f); commit(true); renderTree(); renderSketchOverlay(); } }) : null,
      h("button", { class: "mini", title: "More", html: "⋯", onclick: (e) => { e.stopPropagation(); treeMenu(e, f); } }),
    );
    el.append(row);
    if (S.project.rollback != null && i === S.project.rollback) el.append(rollbar());
  });
  if (S.project.rollback == null && fs.length) el.append(rollbar(true));
}
function rollbar(end) {
  return h("div", { class: "rollbar" + (end ? " end" : ""), title: end ? "End of history — right-click a feature to roll back" : "Rolled back. Click to roll forward to the end." , onclick: () => { S.project.rollback = null; commit(true); rebuild(0); renderAll(); } }, end ? "" : "▼ Rolled back here — click to show all");
}
function sketchVisible(f) {
  const used = S.project.features.some((x) => ["sketch", "sketchA", "sketchB"].some((k) => x.params[k] === f.id));
  return f.show === true || (f.show === undefined && !used);
}
function treeMenu(e, f) {
  const i = fIndex(f.id);
  menu(e, [
    f.type === "sketch" ? ["Edit sketch", () => enterSketch(f.id)] : ["Edit", () => selectFeature(f.id)],
    ["Rename", async () => { const n = await promptText("Rename feature", featureName(f)); if (n) { f.name = n; commit(true); renderTree(); renderProps(); } }],
    [f.suppressed ? "Unsuppress" : "Suppress (skip)", () => { f.suppressed = !f.suppressed; commit(true); rebuild(0); renderTree(); }],
    ["Roll back to here", () => { S.project.rollback = i; commit(true); rebuild(0); renderAll(); }],
    ["Duplicate", () => { const c = clone(f); c.id = uid(); c.name = featureName(f) + " copy"; S.project.features.splice(i + 1, 0, c); commit(true); rebuild(0); renderAll(); }],
    ["Move up", () => { if (i > 0) { const a = S.project.features; [a[i - 1], a[i]] = [a[i], a[i - 1]]; commit(true); rebuild(0); renderAll(); } }, i === 0],
    ["Move down", () => { const a = S.project.features; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; commit(true); rebuild(0); renderAll(); } }, i === S.project.features.length - 1],
    null,
    ["Delete", () => deleteFeature(f.id), false, "danger"],
  ]);
}
function menu(e, items) {
  const m = $("#ctx");
  m.innerHTML = "";
  for (const it of items) {
    if (!it) { m.append(h("hr")); continue; }
    m.append(h("button", { class: it[3] || "", disabled: it[2], onclick: () => { hideMenu(); it[1](); } }, it[0]));
  }
  m.style.display = "block";
  const x = Math.min(e.clientX, innerWidth - 200), y = Math.min(e.clientY, innerHeight - m.offsetHeight - 10);
  m.style.left = x + "px"; m.style.top = y + "px";
  setTimeout(() => addEventListener("pointerdown", hideMenuOutside, { once: true }), 0);
}
function hideMenuOutside(e) { if (!$("#ctx").contains(e.target)) hideMenu(); else addEventListener("pointerdown", hideMenuOutside, { once: true }); }
function hideMenu() { $("#ctx").style.display = "none"; }

function renderParts() {
  const el = $("#parts");
  el.innerHTML = "";
  if (!S.build.bodies.length) { el.append(h("div", { class: "empty" }, "Parts you make show up here.")); return; }
  for (const b of S.build.bodies) {
    const meta = partMeta(b.id);
    el.append(h("div", { class: "pi" + (S.part === b.id ? " sel" : ""), onclick: () => { S.part = b.id; S.selected = null; viewer.setSelectedPart(b.id); renderAll(); } },
      h("input", { type: "color", value: meta.color, title: "Color", onclick: (e) => e.stopPropagation(), oninput: (e) => { meta.color = e.target.value; viewer.setBodies(S.build.bodies, S.project.parts); commit(); } }),
      h("span", { class: "nm" }, bodyName(b.id)),
      b.error ? h("span", { class: "bad", title: b.error }, "!") : null,
      h("button", { class: "mini", title: "Show/hide", html: meta.visible !== false ? ICONS.eye : ICONS.eyeoff, onclick: (e) => { e.stopPropagation(); meta.visible = meta.visible === false; viewer.setBodies(S.build.bodies, S.project.parts); commit(true); renderParts(); } }),
    ));
  }
}

// ---------- properties panel ----------
function renderProps() {
  const el = $("#props");
  el.innerHTML = "";
  if (S.measure) return renderMeasureProps(el);
  if (S.editing) return renderSketchProps(el);
  const f = S.selected && feat(S.selected);
  if (f) return renderFeatureProps(el, f);
  if (S.part) return renderPartProps(el, S.part);
  renderModelProps(el);
}
function panelHead(icon, title, sub) {
  return h("div", { class: "ph" }, h("span", { class: "ic", html: ICONS[icon] }), h("div", {}, h("div", { class: "pt" }, title), sub ? h("div", { class: "ps" }, sub) : null));
}
function renderModelProps(el) {
  const bodies = S.build.bodies.filter((b) => !b.error);
  const dens = MATERIALS[S.project.material] || 1.24;
  const u = S.project.units;
  const vol = bodies.reduce((s, b) => s + b.volume, 0);
  const volCm3 = u === "in" ? vol * 16.387064 : vol / 1000;
  el.append(panelHead("cube", "Model", `${S.project.features.length} features · ${bodies.length} parts`));
  const bb = viewer.modelBox();
  const rows = [];
  if (!bb.isEmpty()) {
    const s = bb.max.clone().sub(bb.min);
    rows.push(["Size", `${fmt(s.x, 2)} × ${fmt(s.y, 2)} × ${fmt(s.z, 2)} ${u}`]);
    rows.push(["Volume", `${fmt(volCm3, 3)} cm³`]);
    rows.push(["Mass", `${fmt(volCm3 * dens, 2)} g (${S.project.material}, solid)`]);
  }
  el.append(table(rows));
  el.append(h("label", { class: "fl" }, h("span", {}, "Material"),
    h("select", { onchange: (e) => { S.project.material = e.target.value; commit(true); renderProps(); } },
      ...Object.keys(MATERIALS).map((m) => h("option", { value: m, selected: m === S.project.material }, `${m} (${MATERIALS[m]} g/cm³)`)))));
  el.append(h("div", { class: "tips" },
    h("b", {}, "Quick start"),
    h("ol", {},
      h("li", {}, "Click ", h("b", {}, "Sketch"), " → pick Top."),
      h("li", {}, "Draw a rectangle (two clicks). Type exact sizes in this panel."),
      h("li", {}, "Click ", h("b", {}, "Finish Sketch"), ", then ", h("b", {}, "Extrude"), "."),
      h("li", {}, "Use ", h("b", {}, "Fillet"), " and click edges to round them."),
      h("li", {}, h("b", {}, "Export"), " → STL/3MF for your printer.")),
    h("p", {}, "Left-drag orbits, right-drag pans, wheel zooms. Press ", h("kbd", {}, "F1"), " for the full guide.")));
}
function table(rows) { return h("table", { class: "kv" }, ...rows.map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v)))); }
function renderPartProps(el, id) {
  const b = S.build.bodies.find((x) => x.id === id);
  if (!b) return renderModelProps(el);
  const meta = partMeta(id), u = S.project.units, dens = MATERIALS[S.project.material] || 1.24;
  el.append(panelHead("cube", bodyName(id), "Part"));
  el.append(h("label", { class: "fl" }, h("span", {}, "Name"), h("input", { value: bodyName(id), onchange: (e) => { meta.name = e.target.value.trim() || undefined; commit(true); renderParts(); renderProps(); } })));
  el.append(h("label", { class: "fl" }, h("span", {}, "Color"), h("input", { type: "color", value: meta.color, oninput: (e) => { meta.color = e.target.value; viewer.setBodies(S.build.bodies, S.project.parts); viewer.setSelectedPart(id); commit(); renderParts(); } })));
  if (b.error) { el.append(h("div", { class: "errbox" }, b.error)); return; }
  const s = b.bbox.max.map((v, i) => v - b.bbox.min[i]);
  const volCm3 = u === "in" ? b.volume * 16.387064 : b.volume / 1000;
  el.append(table([
    ["Size", `${fmt(s[0], 2)} × ${fmt(s[1], 2)} × ${fmt(s[2], 2)} ${u}`],
    ["Volume", `${fmt(b.volume, 2)} ${u}³`], ["Surface", `${fmt(b.area, 2)} ${u}²`],
    ["Mass", `${fmt(volCm3 * dens, 2)} g (${S.project.material})`],
    ["Faces / edges", `${b.faces.length} / ${b.edges.length}`],
  ]));
  el.append(h("div", { class: "row" },
    h("button", { class: "btn", onclick: () => exportAs("stl", { ids: [id], base: bodyName(id) }) }, "Export STL"),
    h("button", { class: "btn", onclick: () => exportAs("step", { ids: [id], base: bodyName(id) }) }, "Export STEP"),
    h("button", { class: "btn", onclick: () => { viewer.setSelectedPart(null); S.part = null; renderAll(); } }, "Done")));
}
function renderMeasureProps(el) {
  el.append(panelHead("measure", "Measure", "Click faces, edges, or two points"));
  const r = S.measure.result;
  if (r && r.length) el.append(h("div", { class: "measure-out" }, ...r.map((x) => h("div", {}, x))));
  else el.append(h("p", { class: "muted" }, "Pick something on the model. Edge ends snap. Clicking empty space clears."));
  el.append(h("button", { class: "btn", onclick: stopMeasure }, "Done"));
}

function renderFeatureProps(el, f) {
  const def = FEATURES[f.type];
  const idx = fIndex(f.id);
  el.append(panelHead(f.type, featureName(f), def.hint));
  const err = S.localErr[f.id] || S.build.status[f.id]?.error;
  el.append(h("div", { class: "errbox", style: err ? "" : "display:none", id: "ferr" }, err || ""));
  if (f.type === "sketch") {
    el.append(h("p", {}, `${f.params.shapes.length} shapes on ${f.params.planeName === "Face" ? "a face" : f.params.planeName} plane.`));
    el.append(h("button", { class: "btn primary", onclick: () => enterSketch(f.id) }, "Edit sketch"));
  }
  const adv = [];
  for (const fld of def.fields) {
    if (fld.show && !fld.show(f.params)) continue;
    const node = fieldEl(f, fld, idx);
    if (fld.adv) adv.push(node); else el.append(node);
  }
  if (adv.length) {
    const d = h("details", { class: "adv" }, h("summary", {}, "More options"), ...adv);
    el.append(d);
  }
  const mode = pickModeFor(f);
  if (mode) {
    el.append(h("label", { class: "tg" }, h("input", { type: "checkbox", checked: S.showResult, onchange: (e) => { S.showResult = e.target.checked; rebuild(0); refreshPicks(); } }), h("span", {}, "Preview result"), h("small", {}, S.showResult ? "" : `  (showing the model before this ${def.label.toLowerCase()} so you can pick)`)));
  }
  el.append(h("div", { class: "row" },
    h("button", { class: "btn primary", onclick: () => { S.selected = null; S.showResult = true; rebuild(0); renderAll(); } }, "Done"),
    h("button", { class: "btn danger", onclick: () => deleteFeature(f.id) }, "Delete")));
}

function updatePropErrors() {
  const f = S.selected && feat(S.selected);
  const box = $("#ferr");
  if (!f || !box) return;
  const err = S.localErr[f.id] || S.build.status[f.id]?.error;
  box.textContent = err || "";
  box.style.display = err ? "" : "none";
  for (const inp of document.querySelectorAll("#props input[data-key]")) {
    try { evalExpr(inp.value, vars()); inp.classList.remove("bad"); } catch { inp.classList.add("bad"); }
  }
}

function numInput(get, set, opts = {}) {
  const inp = h("input", { class: "num", value: get(), spellcheck: "false", "data-key": opts.key || "n", title: "Numbers or math, e.g. 20/2+3 or a variable name" });
  const check = () => { try { const v = evalExpr(inp.value, vars()); inp.classList.remove("bad"); return v; } catch { inp.classList.add("bad"); return null; } };
  inp.addEventListener("input", () => { if (check() != null) set(/^-?\d*\.?\d+$/.test(inp.value.trim()) ? parseFloat(inp.value) : inp.value.trim()); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const v = check();
      if (v == null) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const nv = +(v + (e.key === "ArrowUp" ? step : -step)).toFixed(6);
      inp.value = nv; set(nv);
    }
    if (e.key === "Enter") inp.blur();
  });
  inp.addEventListener("focus", () => inp.select());
  setTimeout(check, 0);
  return inp;
}

function fieldEl(f, fld, idx) {
  const p = f.params;
  const wrap = (ctrl) => h("label", { class: "fl", title: fld.tip || "" }, h("span", {}, fld.label), ctrl);
  switch (fld.type) {
    case "num": {
      const unitless = /°|Count|count|factor|scale|Sides/i.test(fld.label);
      return wrap(h("div", { class: "numwrap" }, numInput(() => p[fld.key], (v) => setParam(f, fld.key, v), { key: fld.key }), unitless ? null : h("em", {}, S.project.units)));
    }
    case "bool":
      return h("label", { class: "tg" }, h("input", { type: "checkbox", checked: !!p[fld.key], onchange: (e) => setParam(f, fld.key, e.target.checked, { rerender: true }) }), h("span", {}, fld.label));
    case "seg":
      return wrap(h("div", { class: "seg" }, ...fld.options.map(([v, l]) => h("button", { class: p[fld.key] === v ? "on" : "", onclick: (e) => { e.preventDefault(); setParam(f, fld.key, v, { rerender: true }); } }, l))));
    case "select":
      return wrap(h("select", { onchange: (e) => { setParam(f, fld.key, e.target.value, { rerender: true }); if (fld.key === "sel") { rebuild(0); refreshPicks(); } } }, ...fld.options.map(([v, l]) => h("option", { value: v, selected: p[fld.key] === v }, l))));
    case "sketch": {
      const sk = S.project.features.slice(0, idx).filter((x) => x.type === "sketch");
      return wrap(h("select", { onchange: (e) => setParam(f, fld.key, e.target.value, { rerender: true }) },
        h("option", { value: "" }, sk.length ? "— pick a sketch —" : "— no sketches yet —"),
        ...sk.map((x) => h("option", { value: x.id, selected: p[fld.key] === x.id }, featureName(x)))));
    }
    case "ref": {
      const tools = S.project.features.slice(0, idx).filter((x) => TOOL_TYPES.has(x.type));
      return wrap(h("select", { onchange: (e) => setParam(f, fld.key, e.target.value, { rerender: true }) },
        h("option", { value: "" }, "— pick —"),
        h("optgroup", { label: "Features" }, ...tools.map((x) => h("option", { value: x.id, selected: p[fld.key] === x.id }, featureName(x)))),
        h("optgroup", { label: "Whole parts" }, ...S.build.bodies.map((b) => h("option", { value: "body:" + b.id, selected: p[fld.key] === "body:" + b.id }, bodyName(b.id))))));
    }
    case "body":
      return wrap(h("select", { onchange: (e) => setParam(f, fld.key, e.target.value) },
        fld.auto ? h("option", { value: "auto", selected: p[fld.key] === "auto" }, "Auto (parts it touches)") : h("option", { value: "last", selected: p[fld.key] === "last" }, "Last part"),
        ...S.build.bodies.map((b) => h("option", { value: b.id, selected: p[fld.key] === b.id }, bodyName(b.id))),
        p[fld.key] && !["auto", "last"].includes(p[fld.key]) && !S.build.bodies.some((b) => b.id === p[fld.key]) ? h("option", { value: p[fld.key], selected: true }, "(missing part)") : null));
    case "picks": {
      const n = (p[fld.key] || []).length;
      const what = fld.pick === "edges" ? "edge" : "face";
      return h("div", { class: "picks" },
        h("div", { class: "pk " + (n ? "" : "none") }, n ? `${n} ${what}${n > 1 ? "s" : ""} picked` : `Click ${what}s in the 3D view`),
        n ? h("button", { class: "btn sm", onclick: () => { setParam(f, fld.key, [], { rerender: true }); refreshPicks(); } }, "Clear") : null);
    }
    case "file":
      return wrap(h("div", { class: "row" }, h("span", { class: "muted" }, p.fileName || "No file"), h("button", { class: "btn sm", onclick: () => importFile(f) }, "Choose…")));
  }
  return h("div");
}

function renderSketchProps(el) {
  const f = curSketch();
  const p = f.params;
  el.append(panelHead("sketch", featureName(f), "Editing sketch"));
  const planeRow = h("div", { class: "seg" },
    ...["Top", "Front", "Right"].map((n) => h("button", { class: p.planeName === n ? "on" : "", onclick: () => { p.planeName = n; commit(true); viewer.alignToPlane(sketchPlane()); rebuild(); renderProps(); renderSketchOverlay(); } }, n)),
    p.planeName === "Face" ? h("button", { class: "on" }, "Face") : null);
  el.append(h("label", { class: "fl" }, h("span", {}, "Plane"), planeRow));
  el.append(h("label", { class: "fl" }, h("span", {}, "Offset"), h("div", { class: "numwrap" }, numInput(() => p.offset ?? 0, (v) => { p.offset = v; commit(); rebuild(); renderSketchOverlay(); }), h("em", {}, S.project.units))));
  el.append(h("button", { class: "btn sm", onclick: () => { toast("Click a flat face on the model"); S.facePlanePick = (hit) => { p.planeName = "Face"; p.plane = faceToPlane(hit); p.offset = 0; commit(true); viewer.pickMode = "sketch"; viewer.alignToPlane(sketchPlane()); rebuild(); renderProps(); renderSketchOverlay(); }; viewer.pickMode = "face-plane"; } }, "Move to a face…"));
  el.append(h("div", { class: "sh" }, `Shapes (${p.shapes.length})`));
  if (!p.shapes.length) el.append(h("p", { class: "muted" }, "Pick a draw tool in the ribbon and click in the view. " + (TOOL_HINT[S.tool] || "")));
  const list = h("div", { class: "shapes" });
  for (const s of p.shapes) {
    const sel = S.sel.includes(s.id);
    let rs; try { rs = resolveShape(s, vars()); } catch { rs = null; }
    const row = h("div", { class: "si" + (sel ? " sel" : "") + (s.hole ? " hole" : ""), onclick: () => { S.sel = [s.id]; renderProps(); renderSketchOverlay(); } },
      h("span", { class: "ic", html: ICONS[{ rect: "rect", circle: "circle", polygon: "polygon", slot: "slot", ellipse: "ellipse", poly: "line" }[s.kind]] }),
      h("span", { class: "nm" }, SHAPE_KINDS[s.kind].label + " ", h("small", {}, rs ? shapeSummary(rs) : "⚠")),
      h("button", { class: "chip" + (s.hole ? " on" : ""), title: "Make this a hole (cut out)", onclick: (e) => { e.stopPropagation(); s.hole = !s.hole; if (s.hole) s.construction = false; commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }, "hole"),
      h("button", { class: "chip" + (s.construction ? " on" : ""), title: "Construction: shown but not used", onclick: (e) => { e.stopPropagation(); s.construction = !s.construction; commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }, "ref"),
      h("button", { class: "mini", title: "Delete", html: ICONS.trash, onclick: (e) => { e.stopPropagation(); p.shapes = p.shapes.filter((x) => x.id !== s.id); S.sel = S.sel.filter((x) => x !== s.id); commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }),
    );
    list.append(row);
    if (sel && S.sel.length === 1) {
      const fields = h("div", { class: "sf" });
      for (const k of SHAPE_KINDS[s.kind].fields) {
        fields.append(h("label", { class: "fl" }, h("span", {}, FIELD_LABELS[k]), h("div", { class: "numwrap" }, numInput(() => s[k], (v) => { s[k] = v; commit(); rebuild(); renderSketchOverlay(); }, { key: k }), k === "a" || k === "n" ? null : h("em", {}, S.project.units))));
      }
      if (s.kind === "poly") {
        const ta = h("textarea", { rows: 4, spellcheck: "false" }, s.pts.map((q) => q.join(", ")).join("\n"));
        ta.addEventListener("change", () => {
          const pts = ta.value.split(/\n|;/).map((l) => l.split(",").map((x) => x.trim())).filter((q) => q.length === 2 && q[0] !== "");
          if (pts.length >= 3) { s.pts = pts.map((q) => q.map((v) => (/^-?\d*\.?\d+$/.test(v) ? parseFloat(v) : v))); commit(true); rebuild(); renderSketchOverlay(); }
        });
        fields.append(h("label", { class: "fl col" }, h("span", {}, "Points (x, y per line)"), ta));
      }
      fields.append(h("div", { class: "row" },
        h("button", { class: "btn sm", onclick: () => { const c = clone(s); c.id = uid(); Object.assign(c, translateShape(c, S.gridSize * 5, -S.gridSize * 5)); c.id = uid(); p.shapes.push(c); S.sel = [c.id]; commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }, "Duplicate"),
        h("button", { class: "btn sm", onclick: () => { p.shapes.push(mirrorShape(s, "x")); commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }, "Mirror ↔"),
        h("button", { class: "btn sm", onclick: () => { p.shapes.push(mirrorShape(s, "y")); commit(true); rebuild(); renderProps(); renderSketchOverlay(); } }, "Mirror ↕")));
      list.append(fields);
    }
  }
  el.append(list);
  el.append(h("div", { class: "row" }, h("button", { class: "btn primary", onclick: finishSketch }, "Finish sketch")));
}
function mirrorShape(s, axis) {
  const r = clone(s); r.id = uid();
  const neg = (v) => (typeof v === "number" ? -v : `-(${v})`);
  if (r.kind === "slot") { if (axis === "x") { r.x1 = neg(r.x1); r.x2 = neg(r.x2); } else { r.y1 = neg(r.y1); r.y2 = neg(r.y2); } }
  else if (r.kind === "poly") r.pts = r.pts.map((q) => (axis === "x" ? [neg(q[0]), q[1]] : [q[0], neg(q[1])]));
  else { r[axis] = neg(r[axis]); if (r.a) r.a = neg(r.a); }
  return r;
}

function renderStatus(msg) {
  const el = $("#status");
  const k = { loading: "Loading geometry kernel… (first launch downloads ~23 MB)", ready: "Kernel ready", error: "Kernel failed to load" }[S.kernel];
  const errs = Object.keys(S.build.status).filter((id) => S.build.status[id].error).length + Object.keys(S.localErr).length;
  el.innerHTML = "";
  el.append(...[
    h("span", { class: "k " + S.kernel }, msg || (S.kernel === "ready" ? `Rebuilt in ${S.build.ms} ms` : k)),
    errs ? h("span", { class: "warn" }, `⚠ ${errs} feature${errs > 1 ? "s" : ""} with errors`) : null,
    h("span", { class: "grow" }),
    h("span", { id: "hint" }, S.hintText || ""),
    h("span", { id: "hov" }),
  ].filter(Boolean));
}
function hint(t) { S.hintText = t; const e = $("#hint"); if (e) e.textContent = t; }

function renderViewbar() {
  const v = $("#viewbar");
  v.innerHTML = "";
  const b = (icon, tip, fn, active) => h("button", { class: "vb" + (active ? " on" : ""), title: tip, onclick: fn, html: ICONS[icon] || icon });
  const t = (label, name, key) => h("button", { class: "vb txt", title: `${label} view (${key})`, onclick: () => viewer.view(name) }, label);
  v.append(
    t("Iso", "iso", "0"), t("Top", "top", "1"), t("Front", "front", "2"), t("Right", "right", "3"),
    b("fit", "Zoom to fit (F)", () => viewer.fit()),
    b("persp", S.settings.ortho ? "Orthographic (click for perspective)" : "Perspective (click for orthographic)", () => { S.settings.ortho = !S.settings.ortho; saveSettings(); viewer.setOrtho(S.settings.ortho); renderViewbar(); }, S.settings.ortho),
    b("edges", "Show edges", () => { S.settings.edges = !S.settings.edges; saveSettings(); viewer.setEdgesVisible(S.settings.edges); renderViewbar(); }, S.settings.edges),
    b("wire", "X-ray", () => { S.xray = !S.xray; viewer.setWire(S.xray); renderViewbar(); }, S.xray),
    b("grid", "Show grid", () => { S.settings.grid = !S.settings.grid; saveSettings(); viewer.setGridVisible(S.settings.grid); renderViewbar(); }, S.settings.grid),
  );
  const sp = $("#sectionpanel");
  sp.innerHTML = "";
  sp.style.display = S.section ? "" : "none";
  if (S.section) {
    const bb = viewer.modelBox();
    const i = { X: "x", Y: "y", Z: "z" }[S.section.axis];
    const lo = bb.isEmpty() ? -50 : bb.min[i], hi = bb.isEmpty() ? 50 : bb.max[i];
    sp.append(h("b", {}, "Section"),
      h("div", { class: "seg" }, ...["X", "Y", "Z"].map((a) => h("button", { class: S.section.axis === a ? "on" : "", onclick: () => { S.section.axis = a; const k = a.toLowerCase(); S.section.offset = bb.isEmpty() ? 0 : (bb.min[k] + bb.max[k]) / 2; viewer.setSection(S.section); renderViewbar(); } }, a))),
      h("input", { type: "range", min: lo, max: hi, step: (hi - lo) / 400 || 0.1, value: S.section.offset, oninput: (e) => { S.section.offset = +e.target.value; viewer.setSection(S.section); $("#secv").textContent = fmt(S.section.offset, 2); } }),
      h("span", { id: "secv" }, fmt(S.section.offset, 2)),
      h("button", { class: "btn sm", onclick: () => { S.section.flip = !S.section.flip; viewer.setSection(S.section); } }, "Flip"),
      h("button", { class: "btn sm", onclick: toggleSection }, "✕"));
  }
}
function toggleSection() {
  if (S.section) S.section = null;
  else { const bb = viewer.modelBox(); S.section = { axis: "Y", offset: bb.isEmpty() ? 0 : (bb.min.y + bb.max.y) / 2, flip: false }; }
  viewer.setSection(S.section);
  renderRibbon(); renderViewbar();
}

// ---------- modals ----------
function modal(title, body, opts = {}) {
  const m = $("#modal");
  m.innerHTML = "";
  const box = h("div", { class: "mbox " + (opts.cls || "") }, h("div", { class: "mh" }, h("b", {}, title), h("button", { class: "ib", onclick: closeModal, html: "✕" })), body);
  m.append(box);
  m.style.display = "flex";
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return box;
}
function closeModal() { $("#modal").style.display = "none"; $("#modal").innerHTML = ""; }
function promptText(title, value) {
  return new Promise((res) => {
    const inp = h("input", { value, class: "big" });
    const ok = () => { const v = inp.value.trim(); closeModal(); res(v || null); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") { closeModal(); res(null); } });
    modal(title, h("div", { class: "mb" }, inp, h("div", { class: "row end" }, h("button", { class: "btn", onclick: () => { closeModal(); res(null); } }, "Cancel"), h("button", { class: "btn primary", onclick: ok }, "OK"))));
    setTimeout(() => { inp.focus(); inp.select(); }, 20);
  });
}
function showSketchPlane() {
  if (S.editing) finishSketch();
  const pick = (name) => { closeModal(); addFeature("sketch", { planeName: name }); };
  const card = (name, desc) => h("button", { class: "card", onclick: () => pick(name) }, h("b", {}, name), h("small", {}, desc));
  modal("Sketch on…", h("div", { class: "mb" },
    h("div", { class: "cards" }, card("Top", "XY plane (floor)"), card("Front", "XZ plane (facing you)"), card("Right", "YZ plane (side)")),
    S.build.bodies.length ? h("button", { class: "btn primary wide", onclick: () => {
      closeModal();
      toast("Click a flat face on the model to sketch on it");
      hint("Click a flat face to sketch on it (Esc to cancel)");
      S.facePlanePick = (hit) => { addFeature("sketch", { planeName: "Face", plane: faceToPlane(hit) }); hint(""); };
      refreshPicks();
    } }, "Pick a flat face on the model…") : null));
}
function showOpen() {
  const body = h("div", { class: "mb" }, h("p", { class: "muted" }, "Loading…"));
  modal("Open project", body);
  io.list().then((items) => {
    body.innerHTML = "";
    if (!items.length) body.append(h("p", { class: "muted" }, "No saved projects yet. Use Save (Ctrl+S)."));
    for (const it of items) {
      body.append(h("div", { class: "oi" },
        h("button", { class: "oname", onclick: () => openProject(it.name) }, it.name, h("small", {}, new Date(it.modified).toLocaleString())),
        h("button", { class: "mini", title: "Delete", html: ICONS.trash, onclick: async () => { if (confirmBox(`Delete “${it.name}”?`)) { await io.remove(it.name); showOpen(); } } })));
    }
    body.append(h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { const i = h("input", { type: "file", accept: ".dmodel,.json" }); i.onchange = async () => { const t = await i.files[0].text(); loadProject(JSON.parse(t)); closeModal(); }; i.click(); } }, "Open a .dmodel file…"),
      h("button", { class: "btn", onclick: () => io.exportFile((S.project.name || "model") + ".dmodel", JSON.stringify(S.project)).then((r) => toast(r ? "Saved to Exports folder" : "Downloaded", "ok")) }, "Save copy as .dmodel")));
    if (io.desktop) body.append(h("p", { class: "muted" }, "Projects live in Documents › DOOG Modeler."));
  });
}
function confirmBox(t) { return window.confirm(t); }
function showExport() {
  let res = "normal", sep = false;
  const body = h("div", { class: "mb" });
  const vis = S.build.bodies.filter((b) => S.project.parts[b.id]?.visible !== false).length;
  body.append(
    h("p", {}, `Exports the ${vis} visible part${vis === 1 ? "" : "s"}. Hide parts in the Parts list to leave them out.`),
    h("label", { class: "fl" }, h("span", {}, "Mesh detail"), h("div", { class: "seg" }, ...[["draft", "Draft"], ["normal", "Normal"], ["fine", "Fine"]].map(([v, l]) => h("button", { class: v === res ? "on" : "", onclick: (e) => { res = v; [...e.target.parentNode.children].forEach((c) => c.classList.toggle("on", c === e.target)); } }, l)))),
    h("label", { class: "tg" }, h("input", { type: "checkbox", onchange: (e) => (sep = e.target.checked) }), h("span", {}, "One STL file per part")),
    h("div", { class: "cards" },
      h("button", { class: "card", onclick: () => { closeModal(); exportAs("3mf", { res }); } }, h("b", {}, "3MF"), h("small", {}, "Best for Bambu Studio / slicers. Keeps parts separate.")),
      h("button", { class: "card", onclick: () => { closeModal(); exportAs("stl", { res, separate: sep }); } }, h("b", {}, "STL"), h("small", {}, "Universal 3D-print mesh.")),
      h("button", { class: "card", onclick: () => { closeModal(); exportAs("step", {}); } }, h("b", {}, "STEP"), h("small", {}, "Exact CAD solid — for Onshape, Fusion, SolidWorks, CNC.")),
      h("button", { class: "card", onclick: () => { closeModal(); exportAs("obj", { res }); } }, h("b", {}, "OBJ"), h("small", {}, "For Blender / game engines."))),
    io.info?.bambu ? h("button", { class: "btn primary wide", onclick: () => { closeModal(); exportAs("3mf", { res, bambu: true }); } }, h("span", { class: "ic", html: ICONS.printer }), " Send to Bambu Studio") : null,
    h("button", { class: "btn wide", onclick: async () => { closeModal(); const url = viewer.screenshot(); const blob = await (await fetch(url)).blob(); const r = await io.exportFile((S.project.name || "model") + ".png", blob); toast(r ? "Screenshot saved to Exports" : "Screenshot downloaded", "ok"); } }, "Save screenshot (PNG)"),
  );
  modal("Export", body);
}
function showVariables() {
  const body = h("div", { class: "mb" });
  const draw = () => {
    body.innerHTML = "";
    const { vars: vs, errors } = evalVariables(S.project.variables);
    body.append(h("p", { class: "muted" }, "Name a value once, use it anywhere: type the name (or math like ", h("code", {}, "width/2 + 3"), ") into any number box. Change it here and the whole model updates."));
    const tbl = h("div", { class: "vars" });
    S.project.variables.forEach((v, i) => {
      tbl.append(h("div", { class: "vr" },
        h("input", { value: v.name, placeholder: "name", onchange: (e) => { v.name = e.target.value.trim(); commit(true); rebuild(); draw(); } }),
        h("span", {}, "="),
        h("input", { value: v.expr, placeholder: "value", onchange: (e) => { v.expr = e.target.value.trim(); commit(true); rebuild(); draw(); } }),
        h("span", { class: errors[v.name] ? "bad" : "ok" }, errors[v.name] ? "⚠ " + errors[v.name] : "→ " + fmt(vs[v.name])),
        h("button", { class: "mini", html: ICONS.trash, onclick: () => { S.project.variables.splice(i, 1); commit(true); rebuild(); draw(); } })));
    });
    body.append(tbl, h("button", { class: "btn", onclick: () => { let n = 1; while (S.project.variables.some((v) => v.name === "v" + n)) n++; S.project.variables.push({ name: "v" + n, expr: "10" }); commit(true); draw(); } }, "+ Add variable"),
      h("p", { class: "muted" }, "Functions: sqrt, abs, min, max, round, floor, ceil, sin/cos/tan (degrees), pi, inch (=25.4)."));
  };
  draw();
  modal("Variables", body, { cls: "wide" });
}
function showSettings() {
  const st = S.settings;
  const body = h("div", { class: "mb" },
    h("label", { class: "fl" }, h("span", {}, "Theme"), h("div", { class: "seg" }, ...[["dark", "Dark"], ["light", "Light"]].map(([v, l]) => h("button", { class: st.theme === v ? "on" : "", onclick: () => { st.theme = v; saveSettings(); applyTheme(); showSettings(); } }, l)))),
    h("label", { class: "fl" }, h("span", {}, "Display quality"), h("div", { class: "seg" }, ...[[0.5, "Fast"], [1, "Normal"], [2, "Smooth"]].map(([v, l]) => h("button", { class: st.quality === v ? "on" : "", onclick: () => { st.quality = v; saveSettings(); rebuild(0); showSettings(); } }, l)))),
    h("label", { class: "tg" }, h("input", { type: "checkbox", checked: st.autoReload, onchange: (e) => { st.autoReload = e.target.checked; saveSettings(); } }), h("span", {}, "Apply app updates instantly (your work is kept)")),
    h("p", { class: "muted" }, io.desktop ? `Desktop app · version ${io.version} · launcher v${io.launcher}` : "Running in a browser — no auto-update here. Use Modeler.exe for that."),
    io.desktop ? h("button", { class: "btn", onclick: () => io.openPath("", "docs") }, "Open my projects folder") : null,
  );
  modal("Settings", body);
}
function applyTheme() { document.documentElement.dataset.theme = S.settings.theme; }
async function showHelp(section) {
  const body = h("div", { class: "mb help" }, h("p", {}, "Loading guide…"));
  modal("How to use DOOG Modeler", body, { cls: "huge" });
  try {
    const md = await (await fetch(new URL("../guide.md", import.meta.url), { cache: "no-cache" })).text();
    const { html, toc } = renderMarkdown(md);
    body.innerHTML = "";
    const nav = h("nav", { class: "toc" }, ...toc.map((t) => h("a", { class: "l" + t.level, onclick: () => body.querySelector("#" + t.id)?.scrollIntoView({ behavior: "smooth" }) }, t.text)));
    const art = h("article", { html });
    body.append(nav, art);
    if (typeof section === "string") setTimeout(() => art.querySelector("#" + section)?.scrollIntoView(), 30);
  } catch (e) { body.innerHTML = "Couldn't load the guide: " + e.message; }
}
function showExamples() {
  const body = h("div", { class: "mb" }, h("p", { class: "muted" }, "Open an example to see how it's built — click each feature in the tree to see its settings. (Your current work is autosaved; save it first if you want to keep it.)"),
    h("div", { class: "cards" }, ...EXAMPLES.map((ex) => h("button", { class: "card", onclick: () => { closeModal(); loadProject(ex.build()); toast(`Loaded “${ex.name}”. Click features in the tree to inspect them.`); } }, h("b", {}, ex.name), h("small", {}, ex.desc)))));
  modal("Examples & tutorials", body, { cls: "wide" });
}
async function importFile(existing) {
  const i = h("input", { type: "file", accept: ".step,.stp,.stl" });
  i.onchange = async () => {
    const file = i.files[0];
    if (!file) return;
    if (file.size > 40e6) return toast("File too big (40 MB max)", "err");
    const data = await fileToBase64(file);
    if (existing && existing.type === "import") { existing.params.fileName = file.name; existing.params.data = data; commit(true); rebuild(0); renderProps(); }
    else addFeature("import", { fileName: file.name, data });
  };
  i.click();
}

// ---------- toasts ----------
function toast(text, kind = "", actions) {
  const t = h("div", { class: "toast " + kind }, h("span", {}, text));
  if (actions) for (const a of [].concat(actions)) t.append(h("button", { onclick: () => { a.fn(); t.remove(); } }, a.label));
  $("#toasts").append(t);
  setTimeout(() => t.classList.add("out"), actions ? 7000 : 3200);
  setTimeout(() => t.remove(), actions ? 7600 : 3800);
}

// ---------- keyboard ----------
function onKey(e) {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); return; }
  if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); saveProject(e.shiftKey); return; }
  if (ctrl && e.key.toLowerCase() === "o") { e.preventDefault(); showOpen(); return; }
  if (e.key === "F1") { e.preventDefault(); showHelp(); return; }
  if (typing || $("#modal").style.display === "flex") { if (e.key === "Escape") closeModal(); return; }
  const k = e.key.toLowerCase();
  if (S.editing) {
    const tools = { l: "line", r: "rect", c: "circle", p: "polygon", o: "slot" };
    if (tools[k] && !ctrl) { S.tool = tools[k]; S.draft = []; renderRibbon(); hint(TOOL_HINT[S.tool]); return; }
    if (k === "h") { S.holeMode = !S.holeMode; renderRibbon(); return; }
    if (k === "g") { S.snapOn = !S.snapOn; renderRibbon(); return; }
    if (e.key === "Escape") {
      if (S.draft.length) S.draft = [];
      else if (S.tool !== "select") S.tool = "select";
      else if (S.sel.length) S.sel = [];
      else finishSketch();
      renderRibbon(); renderProps(); renderSketchOverlay(); return;
    }
    if (e.key === "Enter") {
      if (S.tool === "line" && S.draft.length >= 3) { addShape({ kind: "poly", pts: S.draft }); S.draft = []; renderSketchOverlay(); }
      else finishSketch();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && S.sel.length) {
      const f = curSketch();
      f.params.shapes = f.params.shapes.filter((s) => !S.sel.includes(s.id));
      S.sel = []; commit(true); rebuild(); renderProps(); renderSketchOverlay(); return;
    }
    if (ctrl && k === "a") { e.preventDefault(); S.sel = curSketch().params.shapes.map((s) => s.id); renderProps(); renderSketchOverlay(); return; }
    return;
  }
  if (e.key === "Escape") {
    if (S.facePlanePick) { S.facePlanePick = null; refreshPicks(); hint(""); return; }
    if (S.measure) return stopMeasure();
    if (S.selected || S.part) { S.selected = null; S.part = null; S.showResult = true; viewer.setSelectedPart(null); rebuild(0); renderAll(); }
    return;
  }
  if ((e.key === "Delete") && S.selected) return deleteFeature(S.selected);
  if (ctrl) return;
  const map = { s: showSketchPlane, e: () => addFeature("extrude"), x: () => addFeature("extrude", { op: "cut", mode: "through", flip: cutFlip() }), v: () => addFeature("revolve"), b: () => addFeature("box"), f: () => (e.shiftKey ? addFeature("fillet") : viewer.fit()), m: () => addFeature("mirror"), q: () => (S.measure ? stopMeasure() : startMeasure()),
    0: () => viewer.view("iso"), 1: () => viewer.view("top"), 2: () => viewer.view("front"), 3: () => viewer.view("right") };
  if (map[k]) { e.preventDefault(); map[k](); }
}

// ---------- boot ----------
let viewer;
async function boot() {
  applyTheme();
  document.body.innerHTML = `
  <div id="app">
    <header id="top"></header>
    <nav id="ribbon"></nav>
    <main>
      <aside id="left">
        <div class="sec"><div class="st">Features</div><div id="tree"></div></div>
        <div class="sec"><div class="st">Parts</div><div id="parts"></div></div>
      </aside>
      <div id="viewport"><div id="viewbar"></div><div id="sectionpanel"></div></div>
      <aside id="right"><div id="props"></div></aside>
    </main>
    <footer id="status"></footer>
  </div>
  <div id="modal"></div><div id="toasts"></div><div id="ctx"></div>`;
  viewer = new Viewer($("#viewport"), {
    onPick, onSketchDown, onSketchMove, onSketchUp,
    onDblClick: () => { if (S.editing && S.tool === "line" && S.draft.length >= 3) { addShape({ kind: "poly", pts: S.draft }); S.draft = []; renderSketchOverlay(); } },
    onHoverInfo: (hit) => {
      const el = $("#hov");
      if (!el) return;
      if (!hit) { el.textContent = ""; return; }
      if (hit.kind === "edge") el.textContent = `${bodyName(hit.body)} · edge ${(hit.info.t || "").toLowerCase()} · L ${fmt(hit.info.len ?? 0, 2)}`;
      else el.textContent = `${bodyName(hit.body)} · ${(hit.info?.t || "").toLowerCase()} face · (${hit.point.map((v) => fmt(v, 1)).join(", ")})`;
    },
  });
  window.__dm = { S, viewer, addFeature, rebuild, loadProject, exportAs, feat };
  viewer.setEdgesVisible(S.settings.edges);
  viewer.setGridVisible(S.settings.grid);
  if (S.settings.ortho) viewer.setOrtho(true);
  addEventListener("keydown", onKey);
  addEventListener("beforeunload", () => { io.autosave({ project: S.project, savedName: S.savedName }); stashView(); });
  startWorker();
  await io.init();
  io.heartbeat();
  io.listenUpdates(onAppUpdate, (st) => { S.updState = st.state; renderTop(); });

  // restore: hot-update stash > autosave
  let restored = false;
  try {
    const stash = JSON.parse(sessionStorage.getItem("dm.stash") || "null");
    if (stash) {
      sessionStorage.removeItem("dm.stash");
      S.project = Object.assign(blank(), stash.project);
      S.savedName = stash.savedName; S.selected = stash.selected; S.dirty = stash.dirty;
      if (stash.cam) { viewer.camera.position.fromArray(stash.cam.p); viewer.controls.target.fromArray(stash.cam.t); S.fitted = true; }
      restored = true;
      if (stash.updated) setTimeout(() => toast("Updated to the latest version ✓", "ok"), 300);
    }
  } catch {}
  if (!restored) {
    const a = await io.loadAutosave();
    if (a && a.project) { S.project = Object.assign(blank(), a.project); S.savedName = a.savedName; }
    viewer.view("iso");
  }
  commit(true);
  S.dirty = false;
  renderAll();
  rebuild(0);
  if (!localStorage.getItem("dm.welcomed")) {
    localStorage.setItem("dm.welcomed", "1");
    setTimeout(() => toast("Welcome! Press F1 any time for the full guide, or try an example.", "ok", [{ label: "Examples", fn: showExamples }, { label: "Guide", fn: showHelp }]), 800);
  }
}
function stashView(updated) {
  sessionStorage.setItem("dm.stash", JSON.stringify({ project: S.project, savedName: S.savedName, selected: S.selected, dirty: S.dirty, updated, cam: { p: viewer.camera.position.toArray(), t: viewer.controls.target.toArray() } }));
}
function onAppUpdate(info) {
  io.version = info.version || io.version;
  if (!S.settings.autoReload) { S.updState = "pending"; renderTop(); toast("Update ready", "ok", [{ label: "Reload now", fn: () => { stashView(true); location.reload(); } }]); return; }
  const go = () => { io.autosave({ project: S.project, savedName: S.savedName }); stashView(true); location.reload(); };
  if (S.drag || building) setTimeout(go, 400); else go();
}

boot();
