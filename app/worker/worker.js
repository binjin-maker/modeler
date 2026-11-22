import * as R from "./kernel.js";
import { outline } from "../js/geom2d.js";

let ready = null;
function init() {
  if (!ready) ready = R.opencascade({ locateFile: () => new URL("./replicad_single.wasm", import.meta.url).href }).then((oc) => { R.setOC(oc); });
  return ready;
}

// ---------- helpers ----------
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const tup = (p) => (p.toTuple ? p.toTuple() : [p.x, p.y, p.z]);

function mkPlane(pl) {
  return new R.Plane(pl.o, pl.x, pl.n);
}
function planeY(pl) { return V.cross(pl.n, pl.x); }

function penFromPoints(pts) {
  let pen = R.draw(pts[0]);
  for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
  return pen.close();
}

function shapeDrawing(s) {
  switch (s.kind) {
    case "rect": {
      const r = Math.max(0, Math.min(s.r || 0, s.w / 2 - 1e-3, s.h / 2 - 1e-3));
      let d = r > 1e-4 ? R.drawRoundedRectangle(s.w, s.h, r) : R.drawRectangle(s.w, s.h);
      if (s.a) d = d.rotate(s.a, [0, 0]);
      return d.translate(s.x, s.y);
    }
    case "circle":
      return R.drawCircle(s.d / 2).translate(s.x, s.y);
    case "ellipse": {
      let d = R.drawEllipse(s.rx, s.ry);
      if (s.a) d = d.rotate(s.a, [0, 0]);
      return d.translate(s.x, s.y);
    }
    case "slot": {
      const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), r = s.w / 2;
      if (L < 1e-6) return R.drawCircle(r).translate(s.x1, s.y1);
      let d = R.draw([0, -r]).lineTo([L, -r]).threePointsArcTo([L, r], [L + r, 0]).lineTo([0, r]).threePointsArcTo([0, -r], [-r, 0]).close();
      d = d.rotate((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI, [0, 0]);
      return d.translate(s.x1, s.y1);
    }
    case "polygon":
    case "poly":
      return penFromPoints(outline(s));
  }
  throw new Error("Unknown sketch shape " + s.kind);
}

function sketchDrawing(sk) {
  const shapes = sk.params.shapes || [];
  let add = null, holes = null;
  for (const s of shapes) {
    if (s.construction) continue;
    const d = shapeDrawing(s);
    if (s.hole) holes = holes ? holes.fuse(d) : d;
    else add = add ? add.fuse(d) : d;
  }
  if (!add) throw new Error("Sketch has no solid shapes (only holes or empty)");
  if (holes) add = add.cut(holes);
  return add;
}

function sketchOf(ctx, id) {
  const sk = ctx.features.find((f) => f.id === id && f.type === "sketch");
  if (!sk) throw new Error("Pick a sketch");
  if (ctx.failed.has(id)) throw new Error("Referenced sketch has an error");
  return sk;
}

function sketched(sk) {
  return sketchDrawing(sk).sketchOnPlane(mkPlane(sk.params.plane));
}

function bboxOf(shape) {
  const b = shape.boundingBox.bounds;
  return { min: b[0], max: b[1] };
}
function bboxOverlap(a, b, pad = 1e-3) {
  for (let i = 0; i < 3; i++) if (a.max[i] < b.min[i] - pad || b.max[i] < a.min[i] - pad) return false;
  return true;
}
function modelDiag(ctx) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const s of ctx.bodies.values()) {
    const b = bboxOf(s);
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.min[i]); mx[i] = Math.max(mx[i], b.max[i]); }
  }
  if (!isFinite(mn[0])) return 100;
  return V.len(V.sub(mx, mn));
}

// ---------- boolean ops on bodies ----------
function applyOp(ctx, fid, tool, op, target) {
  const bodies = ctx.bodies;
  if (op === "new" || (bodies.size === 0 && op === "add")) {
    let id = fid, k = 1;
    while (bodies.has(id)) id = fid + "." + k++;
    bodies.set(id, tool);
    return;
  }
  if (bodies.size === 0) throw new Error("Nothing to " + op + " — there are no parts yet");
  const tb = bboxOf(tool);
  let targets;
  if (target && target !== "auto") {
    if (!bodies.has(target)) throw new Error("Target part no longer exists");
    targets = [target];
  } else {
    targets = [...bodies.keys()].filter((k) => bboxOverlap(bboxOf(bodies.get(k)), tb));
  }
  if (op === "add") {
    if (!targets.length) targets = [[...bodies.keys()].pop()];
    let acc = tool;
    for (const k of targets) acc = bodies.get(k).fuse(acc);
    const keep = targets[0];
    for (const k of targets.slice(1)) bodies.delete(k);
    bodies.set(keep, acc);
  } else if (op === "cut") {
    if (!targets.length) throw new Error("Cut doesn't touch any part");
    for (const k of targets) bodies.set(k, bodies.get(k).cut(tool));
  } else if (op === "intersect") {
    if (!targets.length) throw new Error("Intersect doesn't touch any part");
    for (const k of targets) bodies.set(k, bodies.get(k).intersect(tool));
  }
}

function addTool(ctx, f, tool) {
  ctx.tools.set(f.id, { shapes: [tool], op: f.params.op, target: f.params.target });
  applyOp(ctx, f.id, tool, f.params.op, f.params.target);
}

function targetBody(ctx, id) {
  if (!ctx.bodies.size) throw new Error("No parts yet");
  if (!id || id === "last") return [...ctx.bodies.keys()].pop();
  if (!ctx.bodies.has(id)) throw new Error("That part no longer exists");
  return id;
}

// ---------- edge / face matching (survives parameter edits) ----------
function edgeInfo(e) {
  const a = tup(e.startPoint), b = tup(e.endPoint), m = tup(e.pointAt(0.5));
  return { a, b, m };
}
function matchEdges(shape, picks) {
  const edges = shape.edges.map((e) => ({ e, i: edgeInfo(e) }));
  const set = new Set();
  for (const p of picks) {
    let best = null, bd = Infinity;
    for (const x of edges) {
      const d = V.len(V.sub(x.i.m, p.p));
      if (d < bd) { bd = d; best = x; }
    }
    if (best) set.add(best.e.hashCode);
  }
  return set;
}
function edgeFilter(shape, sel, picks) {
  const bb = bboxOf(shape), eps = 1e-4 * (1 + V.len(V.sub(bb.max, bb.min)));
  if (sel === "picked") {
    if (!picks || !picks.length) throw new Error("Click edges in the viewport to pick them");
    const set = matchEdges(shape, picks);
    return (f) => f.when(({ element }) => set.has(element.hashCode));
  }
  if (sel === "all") return undefined;
  const test = (e) => {
    const { a, b, m } = edgeInfo(e);
    const horiz = Math.abs(a[2] - b[2]) < eps && Math.abs(a[2] - m[2]) < eps;
    if (sel === "vertical") return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) > eps;
    if (sel === "horizontal") return horiz;
    if (sel === "top") return horiz && Math.abs(m[2] - bb.max[2]) < eps;
    if (sel === "bottom") return horiz && Math.abs(m[2] - bb.min[2]) < eps;
    return true;
  };
  return (f) => f.when(({ element }) => test(element));
}
function matchFaces(shape, picks) {
  const faces = shape.faces;
  const set = new Set();
  for (const p of picks) {
    let best = null, bd = Infinity;
    for (const f of faces) {
      const c = tup(f.center);
      let d = V.len(V.sub(c, p.p));
      if (p.n) { const n = V.norm(tup(f.normalAt())); d += (1 - V.dot(n, V.norm(p.n))) * 10; }
      if (d < bd) { bd = d; best = f; }
    }
    if (best) set.add(best.hashCode);
  }
  return set;
}

// ---------- transforms ----------
const tr = (s, v) => s.clone().translate(v);
const ro = (s, ang, c, axis) => s.clone().rotate(ang, c, axis);
const mi = (s, plane, origin) => s.clone().mirror(plane, origin);

function mirrorPlane(p) {
  const n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[p.plane] || [1, 0, 0];
  return { n, o: V.mul(n, p.offset || 0) };
}

function refShapes(ctx, ref) {
  if (ref && ref.startsWith("body:")) {
    const id = ref.slice(5);
    if (!ctx.bodies.has(id)) throw new Error("Referenced part no longer exists");
    return { body: id, shapes: [ctx.bodies.get(id)] };
  }
  const t = ctx.tools.get(ref);
  if (!t) throw new Error("Pick a feature or part to copy (features like Extrude, Revolve, Box…)");
  return t;
}

function applyCopies(ctx, f, src, copies) {
  if (!copies.length) throw new Error("Count must be at least 2");
  if (src.body) {
    if (f.params.merge) {
      let acc = ctx.bodies.get(src.body);
      for (const c of copies) acc = acc.fuse(c);
      ctx.bodies.set(src.body, acc);
    } else copies.forEach((c) => applyOp(ctx, f.id, c, "new"));
    ctx.tools.set(f.id, { shapes: copies, op: f.params.merge ? "add" : "new" });
  } else {
    const op = src.op || "add";
    if (op === "new") copies.forEach((c) => applyOp(ctx, f.id, c, "new"));
    else {
      const tool = copies.length === 1 ? copies[0] : R.makeCompound(copies);
      if (op === "add") { let acc = copies[0]; for (const c of copies.slice(1)) acc = acc.fuse(c); applyOp(ctx, f.id, acc, "add", src.target); }
      else applyOp(ctx, f.id, tool, op, src.target);
    }
    ctx.tools.set(f.id, { shapes: copies, op, target: src.target });
  }
}

// ---------- features ----------
const BUILDERS = {
  sketch() {},
  extrude(ctx, f) {
    const p = f.params, sk = sketchOf(ctx, p.sketch);
    const pl = sk.params.plane;
    let n = V.norm(pl.n);
    if (p.flip) n = V.mul(n, -1);
    let dist = p.dist, start = 0;
    if (p.mode === "through") { dist = modelDiag(ctx) * 2 + 10; if (p.op === "cut") start = 0; }
    if (p.mode === "sym") start = -dist / 2;
    if (p.mode === "through2") { dist = (modelDiag(ctx) * 2 + 10); start = -dist / 2; }
    if (!(Math.abs(dist) > 1e-6)) throw new Error("Distance can't be zero");
    const s = sketched(sk);
    let solid = s.extrude(dist, { extrusionDirection: n, twistAngle: p.twist || undefined, extrusionProfile: p.taper ? { profile: "linear", endFactor: Math.max(0.01, p.taper) } : undefined });
    if (start) solid = tr(solid, V.mul(n, start));
    addTool(ctx, f, solid);
  },
  revolve(ctx, f) {
    const p = f.params, sk = sketchOf(ctx, p.sketch), pl = sk.params.plane;
    let o = [0, 0, 0], d;
    if (p.axis === "sx") { o = pl.o; d = pl.x; }
    else if (p.axis === "sy") { o = pl.o; d = planeY(pl); }
    else d = AXES[p.axis] || AXES.Z;
    const face = sketched(sk).face();
    const solid = R.revolution(face, o, d, Math.max(0.1, Math.min(360, p.angle)));
    addTool(ctx, f, solid);
  },
  loft(ctx, f) {
    const p = f.params;
    const a = sketched(sketchOf(ctx, p.sketchA)), b = sketched(sketchOf(ctx, p.sketchB));
    addTool(ctx, f, a.loftWith(b, { ruled: !!p.ruled }));
  },
  box(ctx, f) {
    const p = f.params;
    const c = [p.x, p.y, p.z];
    const lo = p.centered ? [c[0] - p.w / 2, c[1] - p.d / 2, c[2]] : c;
    addTool(ctx, f, R.makeBox(lo, [lo[0] + p.w, lo[1] + p.d, lo[2] + p.h]));
  },
  cylinder(ctx, f) {
    const p = f.params;
    addTool(ctx, f, R.makeCylinder(p.dia / 2, p.h, [p.x, p.y, p.z], AXES[p.axis] || AXES.Z));
  },
  sphere(ctx, f) {
    const p = f.params;
    addTool(ctx, f, tr(R.makeSphere(p.dia / 2), [p.x, p.y, p.z]));
  },
  cone(ctx, f) {
    const p = f.params, r1 = p.d1 / 2, r2 = p.d2 / 2;
    const pts = [[0, 0], [r1, 0], [r2, p.h], [0, p.h]].filter((q, i) => !(i === 1 && r1 < 1e-6) && !(i === 2 && r2 < 1e-6));
    const face = penFromPoints(pts).sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, -1, 0])).face();
    addTool(ctx, f, tr(R.revolution(face, [0, 0, 0], [0, 0, 1], 360), [p.x, p.y, p.z]));
  },
  torus(ctx, f) {
    const p = f.params;
    if (p.r >= p.R) throw new Error("Tube radius must be smaller than ring radius");
    const face = R.drawCircle(p.r).translate(p.R, 0).sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, -1, 0])).face();
    addTool(ctx, f, tr(R.revolution(face, [0, 0, 0], [0, 0, 1], 360), [p.x, p.y, p.z]));
  },
  fillet(ctx, f) { roundEdges(ctx, f, "fillet"); },
  chamfer(ctx, f) { roundEdges(ctx, f, "chamfer"); },
  shell(ctx, f) {
    const p = f.params;
    if (!p.faces || !p.faces.length) throw new Error("Click the face(s) to remove (the opening)");
    const id = p.faces[0].body && ctx.bodies.has(p.faces[0].body) ? p.faces[0].body : targetBody(ctx, "last");
    const shape = ctx.bodies.get(id);
    const set = matchFaces(shape, p.faces);
    ctx.bodies.set(id, shape.shell(p.outward ? -p.thickness : p.thickness, (ff) => ff.when(({ element }) => set.has(element.hashCode))));
  },
  draft(ctx, f) {
    const p = f.params;
    if (!p.faces || !p.faces.length) throw new Error("Click the face(s) to draft");
    const id = p.faces[0].body && ctx.bodies.has(p.faces[0].body) ? p.faces[0].body : targetBody(ctx, "last");
    const shape = ctx.bodies.get(id);
    const set = matchFaces(shape, p.faces);
    const bb = bboxOf(shape);
    ctx.bodies.set(id, shape.draft(p.angle, (ff) => ff.when(({ element }) => set.has(element.hashCode)), new R.Plane([0, 0, bb.min[2]], [1, 0, 0], [0, 0, 1])));
  },
  pattern_linear(ctx, f) {
    const p = f.params, src = refShapes(ctx, p.ref);
    const d1 = V.norm(AXES[p.dir] || AXES.X), d2 = V.norm(AXES[p.dir2] || AXES.Y);
    const copies = [];
    for (let i = 0; i < Math.max(1, Math.round(p.count)); i++)
      for (let j = 0; j < Math.max(1, Math.round(p.count2 || 1)); j++) {
        if (!i && !j) continue;
        const v = V.add(V.mul(d1, i * p.spacing), V.mul(d2, j * (p.spacing2 || 0)));
        for (const s of src.shapes) copies.push(tr(s, v));
      }
    applyCopies(ctx, f, src, copies);
  },
  pattern_circular(ctx, f) {
    const p = f.params, src = refShapes(ctx, p.ref);
    const n = Math.max(1, Math.round(p.count));
    const full = Math.abs(Math.abs(p.angle) - 360) < 1e-6;
    const step = full ? p.angle / n : p.angle / Math.max(1, n - 1);
    const copies = [];
    for (let i = 1; i < n; i++) for (const s of src.shapes) copies.push(ro(s, step * i, [p.cx, p.cy, p.cz], AXES[p.axis] || AXES.Z));
    applyCopies(ctx, f, src, copies);
  },
  mirror(ctx, f) {
    const p = f.params, src = refShapes(ctx, p.ref), m = mirrorPlane(p);
    const copies = src.shapes.map((s) => mi(s, m.n, m.o));
    if (src.body) f.params.merge = p.merge !== false;
    applyCopies(ctx, f, src, copies);
  },
  move(ctx, f) {
    const p = f.params, id = targetBody(ctx, p.body);
    let s = ctx.bodies.get(id);
    if (p.angle) s = ro(s, p.angle, [p.cx || 0, p.cy || 0, p.cz || 0], AXES[p.axis] || AXES.Z);
    if (p.tx || p.ty || p.tz) s = tr(s, [p.tx, p.ty, p.tz]);
    if (p.copy) applyOp(ctx, f.id, s, "new");
    else ctx.bodies.set(id, s);
  },
  scale(ctx, f) {
    const p = f.params, id = targetBody(ctx, p.body);
    const s = ctx.bodies.get(id), bb = bboxOf(s);
    const c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, bb.min[2]];
    if (!(p.factor > 0)) throw new Error("Scale must be above 0");
    ctx.bodies.set(id, s.clone().scale(p.factor, c));
  },
  boolean(ctx, f) {
    const p = f.params;
    const a = targetBody(ctx, p.target), b = targetBody(ctx, p.tool);
    if (a === b) throw new Error("Pick two different parts");
    const A = ctx.bodies.get(a), B = ctx.bodies.get(b);
    const res = p.op === "cut" ? A.cut(B) : p.op === "intersect" ? A.intersect(B) : A.fuse(B);
    ctx.bodies.set(a, res);
    if (!p.keepTool) ctx.bodies.delete(b);
  },
  split(ctx, f) {
    const p = f.params, id = targetBody(ctx, p.body), s = ctx.bodies.get(id);
    const n = AXES[p.axis] || AXES.Z, big = modelDiag(ctx) * 4 + 100;
    const c = V.mul(n, p.offset);
    const half = R.makeBox([-big, -big, 0], [big, big, big]);
    let box = half;
    if (p.axis === "X") box = ro(half, 90, [0, 0, 0], [0, 1, 0]);
    if (p.axis === "Y") box = ro(half, -90, [0, 0, 0], [1, 0, 0]);
    box = tr(box, c);
    const upper = s.intersect(box), lower = s.cut(box);
    ctx.bodies.set(id, lower);
    applyOp(ctx, f.id, upper, "new");
  },
  remove(ctx, f) {
    const id = targetBody(ctx, f.params.body);
    ctx.bodies.delete(id);
  },
  import(ctx, f) {
    const p = f.params;
    if (!p.shape) throw new Error("Choose a STEP file");
    let s = p.shape;
    if (p.scale && p.scale !== 1) s = s.clone().scale(p.scale, [0, 0, 0]);
    addTool(ctx, f, s.clone());
  },
};

function roundEdges(ctx, f, kind) {
  const p = f.params;
  const r = kind === "fillet" ? p.radius : p.dist;
  if (!(r > 0)) throw new Error("Size must be above 0");
  const ids = new Set();
  if (p.sel === "picked") {
    for (const e of p.edges || []) if (ctx.bodies.has(e.body)) ids.add(e.body);
    if (!ids.size && p.edges?.length) ids.add(targetBody(ctx, "last"));
  } else ids.add(targetBody(ctx, p.body));
  if (!ids.size) throw new Error("Click edges in the viewport to pick them");
  for (const id of ids) {
    const shape = ctx.bodies.get(id);
    const picks = (p.edges || []).filter((e) => e.body === id || !ctx.bodies.has(e.body));
    const filt = edgeFilter(shape, p.sel, picks);
    try {
      ctx.bodies.set(id, kind === "fillet" ? shape.fillet(r, filt) : shape.chamfer(r, filt));
    } catch (e) {
      throw new Error(`${kind === "fillet" ? "Fillet" : "Chamfer"} failed — size may be too big for these edges, or an edge is tangent/smooth`);
    }
  }
}

// ---------- rebuild with prefix cache ----------
let cache = []; // [{key, bodies: Map, tools: Map, status}]
const importCache = new Map();

async function prepImports(features) {
  for (const f of features) {
    if (f.type !== "import" || !f.params.data) continue;
    const key = f.params.data.length + ":" + f.params.data.slice(0, 64) + f.params.data.slice(-64);
    if (!importCache.has(key)) {
      const bin = Uint8Array.from(atob(f.params.data), (c) => c.charCodeAt(0));
      const name = (f.params.fileName || "").toLowerCase();
      const blob = new Blob([bin]);
      const shape = name.endsWith(".stl") ? await R.importSTL(blob) : await R.importSTEP(blob);
      importCache.set(key, shape);
    }
    f.params.shape = importCache.get(key);
    delete f.params.data;
  }
}

async function rebuild(features) {
  await init();
  const keys = [];
  let prev = "";
  for (const f of features) { prev = prev + "|" + JSON.stringify(f); keys.push(hash(prev)); }
  await prepImports(features);
  let start = 0;
  while (start < cache.length && start < features.length && cache[start].key === keys[start]) start++;
  cache.length = start;
  const base = start ? cache[start - 1] : { bodies: new Map(), tools: new Map(), failed: new Set() };
  const ctx = { bodies: new Map(base.bodies), tools: new Map(base.tools), failed: new Set(base.failed), features };
  const status = {};
  for (let i = 0; i < start; i++) Object.assign(status, cache[i].status);
  for (let i = start; i < features.length; i++) {
    const f = features[i];
    const st = {};
    if (!f.suppressed) {
      const before = { bodies: new Map(ctx.bodies), tools: new Map(ctx.tools) };
      try {
        const t0 = performance.now();
        BUILDERS[f.type](ctx, f);
        st.ms = Math.round(performance.now() - t0);
      } catch (e) {
        ctx.bodies = before.bodies; ctx.tools = before.tools;
        ctx.failed.add(f.id);
        console.warn("feature failed", f.type, e && (e.stack || e.message || e));
        st.error = cleanErr(e);
      }
    }
    status[f.id] = st;
    cache.push({ key: keys[i], bodies: new Map(ctx.bodies), tools: new Map(ctx.tools), failed: new Set(ctx.failed), status: { [f.id]: st } });
  }
  return { ctx, status };
}

function cleanErr(e) {
  const m = (e && e.message) || String(e);
  if (/^\d+$/.test(m) || /WebAssembly|Exception|undefined/.test(m)) return "Geometry kernel couldn't build this — try different values";
  return m;
}

function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

// ---------- meshing ----------
const meshCache = new WeakMap();
let quality = 1;

function meshBody(shape) {
  if (meshCache.has(shape) && meshCache.get(shape).q === quality) return meshCache.get(shape);
  const bb = bboxOf(shape), diag = V.len(V.sub(bb.max, bb.min));
  const tol = Math.min(0.5, Math.max(0.005, (diag / 2000) / quality));
  const m = shape.mesh({ tolerance: tol, angularTolerance: 0.25 / quality });
  const me = shape.meshEdges({ tolerance: tol, angularTolerance: 0.25 / quality });
  const faceById = new Map(), edgeById = new Map();
  for (const fc of shape.faces) faceById.set(fc.hashCode, fc);
  for (const e of shape.edges) edgeById.set(e.hashCode, e);
  const faces = m.faceGroups.map((g) => {
    const fc = faceById.get(g.faceId);
    let info = { start: g.start, count: g.count, id: g.faceId };
    if (fc) {
      try {
        info.c = tup(fc.center); info.n = V.norm(tup(fc.normalAt())); info.t = fc.geomType;
        info.area = R.measureArea(fc);
      } catch {}
    }
    return info;
  });
  const edges = me.edgeGroups.map((g) => {
    const e = edgeById.get(g.edgeId);
    const info = { start: g.start, count: g.count, id: g.edgeId };
    if (e) { try { const ei = edgeInfo(e); info.m = ei.m; info.len = R.measureLength(e); info.t = e.geomType; } catch {} }
    return info;
  });
  let volume = 0, area = 0;
  try { volume = R.measureVolume(shape); } catch {}
  try { area = R.measureArea(shape); } catch {}
  const out = {
    q: quality,
    vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles),
    lines: new Float32Array(me.lines), faces, edges, volume, area, bbox: bb,
  };
  meshCache.set(shape, out);
  return out;
}

let lastCtx = null;

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "build") {
      if (msg.quality) quality = msg.quality;
      const t0 = performance.now();
      const { ctx, status } = await rebuild(msg.features);
      lastCtx = ctx;
      const bodies = [];
      for (const [id, s] of ctx.bodies) {
        try { bodies.push({ id, ...meshBody(s) }); }
        catch (e) { bodies.push({ id, error: cleanErr(e) }); }
      }
      self.postMessage({ type: "built", req: msg.req, bodies, status, ms: Math.round(performance.now() - t0) });
    } else if (msg.type === "export") {
      await init();
      let shapes = msg.bodies.map((id) => lastCtx?.bodies.get(id)).filter(Boolean);
      if (!shapes.length) throw new Error("Nothing visible to export");
      if (msg.scale && msg.scale !== 1 && msg.fmt !== "mesh") shapes = shapes.map((s) => s.clone().scale(msg.scale, [0, 0, 0]));
      if (msg.fmt === "stl") {
        const out = [];
        if (msg.separate) {
          for (let i = 0; i < shapes.length; i++) out.push({ id: msg.bodies[i], buf: await shapes[i].blobSTL({ tolerance: msg.tol || 0.02, angularTolerance: 0.1, binary: true }).arrayBuffer() });
        } else {
          const one = shapes.length === 1 ? shapes[0] : R.makeCompound(shapes.map((s) => s.clone()));
          out.push({ id: "all", buf: await one.blobSTL({ tolerance: msg.tol || 0.02, angularTolerance: 0.1, binary: true }).arrayBuffer() });
        }
        self.postMessage({ type: "exported", req: msg.req, files: out });
      } else if (msg.fmt === "step") {
        const one = shapes.length === 1 ? shapes[0] : R.makeCompound(shapes.map((s) => s.clone()));
        self.postMessage({ type: "exported", req: msg.req, files: [{ id: "all", buf: await one.blobSTEP().arrayBuffer() }] });
      } else if (msg.fmt === "mesh") {
        const files = shapes.map((s, i) => {
          const m = s.mesh({ tolerance: msg.tol || 0.02, angularTolerance: 0.1 });
          return { id: msg.bodies[i], vertices: m.vertices, triangles: m.triangles };
        });
        self.postMessage({ type: "exported", req: msg.req, files });
      }
    } else if (msg.type === "ping") {
      await init();
      self.postMessage({ type: "ready", req: msg.req });
    }
  } catch (e) {
    self.postMessage({ type: "error", req: msg.req, error: cleanErr(e) });
  }
};
