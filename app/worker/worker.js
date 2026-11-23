import * as R from "./kernel.js";
import { outline } from "../js/geom2d.js";
import { METALS, PROCESSES } from "../js/castingdb.js";

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

// ---------- shared geometry helpers ----------
const TOP_PLANE = () => new R.Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
function coneSolid(d1, d2, h, pos) {
  const r1 = Math.max(0, d1 / 2), r2 = Math.max(0, d2 / 2);
  const pts = [[0, 0], [r1, 0], [r2, h], [0, h]].filter((q, i) => !(i === 1 && r1 < 1e-6) && !(i === 2 && r2 < 1e-6));
  const face = penFromPoints(pts).sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, -1, 0])).face();
  return R.revolution(face, [0, 0, 0], [0, 0, 1], 360).translate(pos);
}
const cyl = (d, z0, z1, x, y) => R.makeCylinder(d / 2, Math.max(0.01, z1 - z0), [x, y, z0], [0, 0, 1]);
const box = (x0, y0, z0, x1, y1, z1) => R.makeBox([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Brute-force ray caster over a mesh (Möller–Trumbore)
function rayCaster(m) {
  const V = m.vertices, T = m.triangles, n = T.length / 3;
  const tri = new Float64Array(n * 9);
  for (let i = 0; i < n; i++) {
    const a = T[i * 3] * 3, b = T[i * 3 + 1] * 3, c = T[i * 3 + 2] * 3;
    tri.set([V[a], V[a + 1], V[a + 2], V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2], V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]], i * 9);
  }
  return (o, d, tmin = 1e-4) => {
    let best = Infinity, bi = -1;
    for (let i = 0; i < n; i++) {
      const k = i * 9;
      const e1x = tri[k + 3], e1y = tri[k + 4], e1z = tri[k + 5], e2x = tri[k + 6], e2y = tri[k + 7], e2z = tri[k + 8];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, tx = o[0] - tri[k], ty = o[1] - tri[k + 1], tz = o[2] - tri[k + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > tmin && t < best) { best = t; bi = i; }
    }
    return bi >= 0 ? { t: best, i: bi } : null;
  };
}

function meshTriangles(m) {
  const P = m.vertices, T = m.triangles, N = m.normals, n = T.length / 3, out = [];
  for (let i = 0; i < n; i++) {
    const a = T[i * 3], b = T[i * 3 + 1], c = T[i * 3 + 2];
    const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], C = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    let nn = V.cross(V.sub(B, A), V.sub(C, A));
    const area = V.len(nn) / 2;
    if (area < 1e-12) continue;
    nn = V.norm(nn);
    const vn = [N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]];
    if (V.dot(nn, vn) < 0) nn = V.mul(nn, -1);
    out.push({ A, B, C, n: nn, area, c: V.mul(V.add(V.add(A, B), C), 1 / 3) });
  }
  return out;
}

// ---------- casting ----------
function analyzePart(shape, zpParam, autoParting) {
  const m = meshBody(shape);
  const bb = m.bbox, cast = rayCaster(m), tris = meshTriangles(m);
  const H = bb.max[2] - bb.min[2];
  const rand = rng(1234567);
  const total = tris.reduce((s, t) => s + t.area, 0);
  const cum = [];
  let acc = 0;
  for (const t of tris) { acc += t.area; cum.push(acc); }
  const samples = [];
  const N = clamp(Math.round(120000 / Math.max(1, tris.length)), 60, 400);
  for (let k = 0; k < N; k++) {
    const r = rand() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = V.add(t.A, V.add(V.mul(V.sub(t.B, t.A), u), V.mul(V.sub(t.C, t.A), v)));
    const hit = cast(V.sub(p, V.mul(t.n, 1e-3)), V.mul(t.n, -1));
    if (hit) samples.push({ p, n: t.n, t: hit.t });
  }
  const th = samples.map((s) => s.t).sort((a, b) => a - b);
  const pct = (q) => (th.length ? th[Math.min(th.length - 1, Math.floor(q * th.length))] : 0);

  // parting plane = widest horizontal section
  let zp = zpParam;
  if (autoParting) {
    const bins = 24, ext = Array.from({ length: bins }, () => [Infinity, -Infinity, Infinity, -Infinity]);
    const V3 = m.vertices;
    for (let i = 0; i < V3.length; i += 3) {
      const b = clamp(Math.floor(((V3[i + 2] - bb.min[2]) / (H || 1)) * bins), 0, bins - 1), e = ext[b];
      e[0] = Math.min(e[0], V3[i]); e[1] = Math.max(e[1], V3[i]); e[2] = Math.min(e[2], V3[i + 1]); e[3] = Math.max(e[3], V3[i + 1]);
    }
    const area = ext.map((e) => (isFinite(e[0]) ? (e[1] - e[0]) * (e[3] - e[2]) : 0));
    const mx = Math.max(...area);
    let best = area.findIndex((a) => a >= mx * 0.97);
    zp = best <= 0 ? bb.min[2] : best >= bins - 1 ? bb.max[2] : bb.min[2] + ((best + 0.5) / bins) * H;
  }
  let under = 0, vert = 0;
  for (const t of tris) {
    if (t.c[2] > zp + 1e-3 && t.n[2] < -0.05) under += t.area;
    else if (t.c[2] < zp - 1e-3 && t.n[2] > 0.05) under += t.area;
    if (Math.abs(t.n[2]) < 0.0087) vert += t.area;
  }
  return { m, bb, cast, samples, total, H, zp, minWall: pct(0.05), medWall: pct(0.5), maxWall: th.length ? th[th.length - 1] : 0, underPct: (100 * under) / total, vertPct: (100 * vert) / total };
}

function castingBuild(ctx, f) {
  const p = f.params;
  const id = targetBody(ctx, p.body);
  const part = ctx.bodies.get(id);
  const proc = PROCESSES[p.process] || PROCESSES.sand;
  const metal = METALS[p.metal] || METALS.aluminum;
  const a = analyzePart(part, p.parting, p.autoParting !== false);
  const { bb, cast, samples, H } = a;
  const zp = a.zp;
  const vol = R.measureVolume(part), area = R.measureArea(part);
  const modulus = vol / Math.max(1e-6, area);
  const lowMelt = metal.pour < 500;
  const below = zp > bb.min[2] + 1e-3;

  // --- sizing ---
  const g = 9810, cd = 0.8;
  const headMin = Math.max(25, 0.35 * H, p.head || 0);
  const zTop = Math.max(bb.max[2], zp) + headMin;
  const hEff = Math.max(10, zTop - zp);
  const feedsNeeded = metal.vshrink > 0.6;
  let riserD = clamp(5.6 * modulus, lowMelt ? 6 : 10, Math.max(12, 0.9 * Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1])));
  // hot spots
  const Tmax = a.maxWall || 1;
  const feedDist = Math.max(4.5 * Tmax, 2.5 * riserD, 25);
  const risers = [];
  if (feedsNeeded && p.risers !== false) {
    const cand = [...samples].sort((x, y) => y.t - x.t).filter((s) => s.t >= 0.7 * Tmax);
    for (const s of cand) {
      const c = V.sub(s.p, V.mul(s.n, s.t / 2));
      if (risers.some((r) => Math.hypot(r.x - c[0], r.y - c[1]) < feedDist)) continue;
      const hit = cast([c[0], c[1], bb.max[2] + 5], [0, 0, -1]);
      if (!hit) continue;
      risers.push({ x: c[0], y: c[1], zs: bb.max[2] + 5 - hit.t });
      if (risers.length >= 4) break;
    }
    const need = (vol * metal.vshrink) / 100 / 0.14;
    const per = (Math.PI / 4) * riserD * riserD * 1.5 * riserD;
    if (risers.length && per * risers.length < need) riserD = Math.cbrt(need / risers.length / ((Math.PI / 4) * 1.5));
  }
  const riserVol = risers.reduce((s, r) => s + (Math.PI / 4) * riserD * riserD * Math.max(1.5 * riserD, zTop - r.zs), 0);
  const estVol = vol * 1.35 + riserVol;
  const estKg = (estVol / 1e6) * metal.rho;
  const pourTime = Math.max(lowMelt ? 1 : 1.5, 1.8 * Math.sqrt(estKg) + (estKg > 2 ? 1 : 0));
  const vel = cd * Math.sqrt(2 * g * hEff);
  const Ach = estVol / (pourTime * vel);
  const dMin = p.process === "silicone" || p.process === "printed" || lowMelt ? 4 : 6;
  const Dch = clamp(Math.sqrt((4 * Ach) / Math.PI), dMin, 30);
  const AchR = (Math.PI / 4) * Dch * Dch;
  const Dtop = Dch * 1.35;
  const ratio = metal.ratio;
  const sr = Math.sqrt(ratio[1] * AchR);
  const spanX = bb.max[0] - bb.min[0];
  const nGates = p.gates > 0 ? Math.round(p.gates) : clamp(Math.round(spanX / 55) + 1, 1, 4);
  const tg = clamp(sr * 0.6, 1.5, Math.max(2, 0.8 * (a.medWall || sr)));
  const gateSpacing = spanX / nGates;
  const wg = clamp((ratio[2] * AchR) / nGates / tg, 3, Math.max(4, 0.8 * gateSpacing));
  const ventD = lowMelt ? 2.5 : 3.5;

  // --- layout (runner along -Y side, center-fed) ---
  const zr0 = below ? zp - sr : zp, zr1 = below ? zp : zp + sr;
  const zg0 = below ? zp - tg : zp, zg1 = below ? zp : zp + tg;
  const zgc = (zg0 + zg1) / 2;
  const gap = Math.max(6, sr);
  const yR = bb.min[1] - gap - sr / 2;
  const gx = Array.from({ length: nGates }, (_, i) => bb.min[0] + spanX * (nGates === 1 ? 0.5 : 0.15 + (0.7 * i) / (nGates - 1)));
  const pieces = [];
  const gates = [];
  for (const x of gx) {
    let hit = cast([x, yR, zgc], [0, 1, 0]);
    if (!hit) hit = cast([x, yR, zgc + (below ? -tg : tg)], [0, 1, 0]);
    if (!hit) continue;
    const yEnd = yR + hit.t + Math.min(1.5, tg * 0.5);
    gates.push(x);
    pieces.push(box(x - wg / 2, yR, zg0, x + wg / 2, yEnd, zg1));
  }
  if (!gates.length) throw new Error("Couldn't find a side of the part to gate into — try a different parting height");
  const xs = (Math.min(...gates) + Math.max(...gates)) / 2;
  pieces.push(box(Math.min(...gates) - sr * 1.5, yR - sr / 2, zr0, Math.max(...gates) + sr * 1.5, yR + sr / 2, zr1));
  const ys = yR - sr / 2 - Dtop / 2 - Math.max(4, Dch * 0.6);
  pieces.push(box(xs - sr / 2, ys, zr0, xs + sr / 2, yR, zr1));
  const cupH = Math.max(10, Dtop);
  const zTopAll = zTop + cupH + 1;
  pieces.push(cyl(Dch * 2, zr0 - Dch, zr1, xs, ys));
  pieces.push(coneSolid(Dch, Dtop, zTop - zr0, [xs, ys, zr0]));
  pieces.push(coneSolid(Dtop, Dtop * 2.6, cupH, [xs, ys, zTop]));
  pieces.push(cyl(Dtop * 2.6, zTop + cupH - 0.01, zTopAll, xs, ys));
  for (const r of risers) pieces.push(cyl(riserD, r.zs - 0.6, zTopAll, r.x, r.y));
  // vents on high points not already covered by a riser
  const vents = [];
  if (p.vents !== false) {
    const pts = [];
    const nx = 10, ny = 10;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = bb.min[0] + ((i + 0.5) / nx) * spanX, y = bb.min[1] + ((j + 0.5) / ny) * (bb.max[1] - bb.min[1]);
      const hit = cast([x, y, bb.max[2] + 5], [0, 0, -1]);
      if (hit) pts.push({ x, y, z: bb.max[2] + 5 - hit.t });
    }
    pts.sort((u, v) => v.z - u.z);
    const zMax = pts.length ? pts[0].z : bb.max[2];
    for (const q of pts) {
      if (q.z < zMax - Math.max(1, 0.15 * H)) break;
      if (risers.some((r) => Math.hypot(r.x - q.x, r.y - q.y) < riserD / 2 + 6)) continue;
      if (vents.some((v) => Math.hypot(v.x - q.x, v.y - q.y) < 18)) continue;
      vents.push(q);
      if (vents.length >= 3) break;
    }
    for (const v of vents) pieces.push(cyl(ventD, v.z - 0.6, zTopAll, v.x, v.y));
  }

  let gating = pieces[0];
  for (const s of pieces.slice(1)) gating = gating.fuse(s);
  let pattern = part.fuse(gating);
  const shrink = p.shrink !== false ? metal.shrink : 0;
  const k = 1 + shrink / 100;
  const pivot = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, bb.min[2]];
  if (shrink) pattern = pattern.scale(k, pivot);
  const zpS = pivot[2] + (zp - pivot[2]) * k;
  ctx.bodies.set(id, pattern);
  ctx.names.set(id, "Casting pattern");
  const patVol = R.measureVolume(pattern);
  const pbb = bboxOf(pattern);

  // --- molds ---
  let moldInfo = null;
  if (proc.mold && p.mold) {
    const wall = p.wall || 15;
    const big = R.makeBox([pbb.min[0] - wall, pbb.min[1] - wall, pbb.min[2] - wall], [pbb.max[0] + wall, pbb.max[1] + wall, pbb.max[2] - 1]);
    const mold = big.cut(pattern);
    const W = pbb.max[0] - pbb.min[0] + 2 * wall;
    const split = R.makeBox([pbb.min[0] - wall - 5, pbb.min[1] - wall - 5, pbb.min[2] - wall - 5], [pbb.max[0] + wall + 5, pbb.max[1] + wall + 5, zpS]);
    let drag = mold.intersect(split), cope = mold.cut(split);
    const kd = Math.min(10, wall * 0.6), kh = kd * 0.5;
    const corners = [[pbb.min[0] - wall / 2, pbb.min[1] - wall / 2], [pbb.max[0] + wall / 2, pbb.min[1] - wall / 2], [pbb.min[0] - wall / 2, pbb.max[1] + wall / 2], [pbb.max[0] + wall / 2, pbb.max[1] + wall / 2]];
    for (const [x, y] of corners) {
      drag = drag.fuse(coneSolid(kd, kd * 0.4, kh, [x, y, zpS - 0.01]));
      cope = cope.cut(coneSolid(kd + 0.6, kd * 0.4 + 0.6, kh + 0.3, [x, y, zpS - 0.01]));
    }
    drag = drag.translate([W + 20, 0, 0]);
    cope = cope.rotate(180, [pivot[0], pivot[1], zpS], [1, 0, 0]).translate([2 * (W + 20), 0, 0]);
    ctx.bodies.set(f.id + "-drag", drag); ctx.names.set(f.id + "-drag", "Mold — bottom half");
    ctx.bodies.set(f.id + "-cope", cope); ctx.names.set(f.id + "-cope", "Mold — top half");
    moldInfo = { size: [W, pbb.max[1] - pbb.min[1] + 2 * wall, pbb.max[2] - pbb.min[2] + wall] };
  } else if (proc.splitPattern && p.mold) {
    const split = R.makeBox([pbb.min[0] - 5, pbb.min[1] - 5, pbb.min[2] - 5], [pbb.max[0] + 5, pbb.max[1] + 5, zpS]);
    const lower = pattern.intersect(split), upper = pattern.cut(split);
    const W = pbb.max[0] - pbb.min[0];
    ctx.bodies.set(id, lower); ctx.names.set(id, "Pattern — drag half");
    ctx.bodies.set(f.id + "-cope", upper.translate([W + 20, 0, 0])); ctx.names.set(f.id + "-cope", "Pattern — cope half");
  }

  // --- report ---
  const castVol = vol * k * k * k;
  const metals = Object.entries(METALS).map(([key, mt]) => {
    const why = [], risk = [];
    if (mt.pour > proc.maxC) why.push(`mold can't take ${mt.pour} °C (max ~${proc.maxC} °C)`);
    if (mt.pour > (p.furnace || 1100)) why.push(`your heat source tops out at ${p.furnace} °C (needs ${mt.pour} °C)`);
    if ((proc.forbid || []).includes(key)) why.push("not suited to this process");
    if (p.process === "sand" && (key === "resin" || key === "wax")) why.push("sand is porous — use a silicone mold");
    if (p.process === "lostpla" && (key === "resin" || key === "wax")) why.push("investment is for molten metal");
    const minW = mt.wall[proc.key];
    if (a.minWall && a.minWall < minW) risk.push(`thinnest walls ~${a.minWall.toFixed(1)} mm, ${mt.name.split(" ")[0]} needs ≥ ${minW} mm to fill`);
    return { key, name: mt.name, pour: mt.pour, status: why.length ? "no" : risk.length ? "risky" : "ok", why: why.concat(risk), castG: (castVol / 1000) * mt.rho, pourG: ((patVol * 1.1) / 1000) * mt.rho, note: mt.note };
  });
  const warnings = [];
  const sel = metals.find((x) => x.key === p.metal) || metals[0];
  if (sel.status === "no") warnings.push(`${metal.name} won't work with this setup: ${sel.why.join("; ")}.`);
  else if (sel.status === "risky") warnings.push(`${metal.name}: ${sel.why.join("; ")}. Thicken walls or switch to a more fluid metal.`);
  if (!proc.undercutsOK && a.underPct > 0.5) warnings.push(`~${a.underPct.toFixed(1)}% of the surface is undercut for this parting line — the mold won't release. Try another parting height, rotate the part, or use Lost-PLA.`);
  if (proc.draft && a.vertPct > 5) warnings.push(`${a.vertPct.toFixed(0)}% of the surface is perfectly vertical — add ~${proc.draft}° of draft (Draft feature) so the pattern releases cleanly.`);
  if (a.minWall && a.maxWall / a.minWall > 4) warnings.push("Thick sections next to thin ones cool unevenly — risers were placed on the thick spots, but watch for shrink cracks where they meet.");
  if (!feedsNeeded) warnings.push(`${metal.name} barely shrinks, so no risers were needed.`);
  const yieldPct = (100 * castVol) / patVol;
  const flask = proc.key === "inv" ? { d: Math.hypot(pbb.max[0] - pbb.min[0], pbb.max[1] - pbb.min[1]) + 30, h: pbb.max[2] - pbb.min[2] + 30 } : null;
  ctx.report = {
    kind: "casting", process: proc.name, tip: proc.tip, metal: metal.name, metalKey: p.metal, metalNote: metal.note, pour: metal.pour, shrink,
    castG: sel.castG, pourG: sel.pourG, crucibleMl: Math.ceil((patVol * 1.3) / 1000), pourTime, Dch, Dtop, runner: sr, gates: gates.length, gateT: tg, gateW: wg,
    risers: risers.length, riserD, vents: vents.length, ventD, head: zTop - Math.max(bb.max[2], zp), parting: zp, modulus,
    minWall: a.minWall, maxWall: a.maxWall, underPct: a.underPct, vertPct: a.vertPct, yieldPct, flask, mold: moldInfo, metals, warnings,
  };
}

// ---------- tinker scene ----------
function ellipseDrawing(a, b) {
  if (Math.abs(a - b) < 1e-9) return R.drawCircle(a);
  return a > b ? R.drawEllipse(a, b) : R.drawEllipse(b, a).rotate(90, [0, 0]);
}
function tinkerLeaf(o) {
  const w = Math.max(0.05, o.w), d = Math.max(0.05, o.d), h = Math.max(0.05, o.h);
  const ext = (dr, opts) => dr.sketchOnPlane(TOP_PLANE()).extrude(h, opts);
  const taper = (e) => ({ extrusionProfile: { profile: "linear", endFactor: Math.max(0.005, e) } });
  const ring = (n, rx, ry, inner) => {
    const pts = [];
    const k = inner ? n * 2 : n;
    for (let i = 0; i < k; i++) {
      const t = (i / k) * Math.PI * 2 + Math.PI / 2, s = inner && i % 2 ? inner : 1;
      pts.push([Math.cos(t) * rx * s, Math.sin(t) * ry * s]);
    }
    return penFromPoints(pts);
  };
  let s;
  switch (o.kind) {
    case "box": {
      const r = Math.min(o.r || 0, w / 2 - 0.01, d / 2 - 0.01);
      s = r > 0.01 ? ext(R.drawRoundedRectangle(w, d, r)) : R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, h]);
      break;
    }
    case "cylinder": s = ext(ellipseDrawing(w / 2, d / 2)); break;
    case "cone": s = ext(ellipseDrawing(w / 2, d / 2), taper(o.top ?? 0)); break;
    case "pyramid": s = ext(R.drawRectangle(w, d), taper(o.top ?? 0)); break;
    case "sphere": s = R.makeEllipsoid(w / 2, d / 2, h / 2).translate([0, 0, h / 2]); break;
    case "dome": s = R.makeEllipsoid(w / 2, d / 2, h).intersect(R.makeBox([-w, -d, 0], [w, d, h * 2])); break;
    case "wedge": s = penFromPoints([[-w / 2, 0], [w / 2, 0], [-w / 2, h]]).sketchOnPlane(new R.Plane([0, d / 2, 0], [1, 0, 0], [0, -1, 0])).extrude(d); break;
    case "tube": {
      const t = Math.max(0.2, Math.min(o.wall || 2, Math.min(w, d) / 2 - 0.2));
      s = ext(ellipseDrawing(w / 2, d / 2).cut(ellipseDrawing(w / 2 - t, d / 2 - t)));
      break;
    }
    case "torus": {
      const r = Math.min(h / 2, w / 4 - 0.01), Rr = w / 2 - r;
      s = R.revolution(R.drawCircle(r).translate(Rr, 0).sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, -1, 0])).face(), [0, 0, 0], [0, 0, 1], 360).translate([0, 0, r]);
      break;
    }
    case "prism": s = ext(ring(Math.max(3, Math.round(o.sides || 6)), w / 2, d / 2)); break;
    case "star": s = ext(ring(Math.max(3, Math.round(o.sides || 5)), w / 2, d / 2, clamp(o.inner || 0.45, 0.1, 0.95))); break;
    default: throw new Error("Unknown shape " + o.kind);
  }
  const c = [0, 0, h / 2];
  if (o.rx) s = s.rotate(o.rx, c, [1, 0, 0]);
  if (o.ry) s = s.rotate(o.ry, c, [0, 1, 0]);
  if (o.rz) s = s.rotate(o.rz, c, [0, 0, 1]);
  return s.translate([o.x || 0, o.y || 0, o.z || 0]);
}
function tinkerNode(n) {
  if (n.kind !== "group") return { shape: tinkerLeaf(n), hole: !!n.hole };
  let sol = null, hol = null;
  for (const c of n.children || []) {
    const r = tinkerNode(c);
    if (!r) continue;
    if (r.hole) hol = hol ? hol.fuse(r.shape) : r.shape;
    else sol = sol ? sol.fuse(r.shape) : r.shape;
  }
  let s = sol ? (hol ? sol.cut(hol) : sol) : hol;
  if (!s) return null;
  if (n.rz) s = s.rotate(n.rz, [n.px || 0, n.py || 0, 0], [0, 0, 1]);
  if (n.tx || n.ty || n.tz) s = s.translate([n.tx || 0, n.ty || 0, n.tz || 0]);
  return { shape: s, hole: !!n.hole || !sol };
}
function tinkerBuild(ctx, f) {
  const errs = [];
  for (const n of f.params.objects || []) {
    try {
      const r = tinkerNode(n);
      if (!r) continue;
      const id = "t" + n.id;
      if (r.hole) ctx.ghosts.set(id, r.shape);
      else ctx.bodies.set(id, r.shape);
      ctx.names.set(id, n.name || (n.kind === "group" ? "Group" : n.kind[0].toUpperCase() + n.kind.slice(1)));
    } catch (e) { errs.push((n.name || n.kind) + ": " + cleanErr(e)); }
  }
  if (errs.length) ctx.report = { kind: "tinker", errors: errs };
}

BUILDERS.casting = castingBuild;
BUILDERS.tinker = tinkerBuild;

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
  for (const f of features) { prev = hash(prev + "|" + JSON.stringify(f)); keys.push(prev); }
  await prepImports(features);
  let start = 0;
  while (start < cache.length && start < features.length && cache[start].key === keys[start]) start++;
  cache.length = start;
  const base = start ? cache[start - 1] : { bodies: new Map(), tools: new Map(), failed: new Set(), names: new Map(), ghosts: new Map() };
  const ctx = { bodies: new Map(base.bodies), tools: new Map(base.tools), failed: new Set(base.failed), names: new Map(base.names), ghosts: new Map(base.ghosts), features };
  const status = {};
  for (let i = 0; i < start; i++) Object.assign(status, cache[i].status);
  for (let i = start; i < features.length; i++) {
    const f = features[i];
    const st = {};
    if (!f.suppressed) {
      const before = { bodies: new Map(ctx.bodies), tools: new Map(ctx.tools), names: new Map(ctx.names), ghosts: new Map(ctx.ghosts) };
      ctx.report = null;
      try {
        const t0 = performance.now();
        BUILDERS[f.type](ctx, f);
        st.ms = Math.round(performance.now() - t0);
        if (ctx.report) st.report = ctx.report;
      } catch (e) {
        ctx.bodies = before.bodies; ctx.tools = before.tools; ctx.names = before.names; ctx.ghosts = before.ghosts;
        ctx.failed.add(f.id);
        console.warn("feature failed", f.type, e && (e.stack || e.message || e));
        st.error = cleanErr(e);
      }
    }
    status[f.id] = st;
    cache.push({ key: keys[i], bodies: new Map(ctx.bodies), tools: new Map(ctx.tools), failed: new Set(ctx.failed), names: new Map(ctx.names), ghosts: new Map(ctx.ghosts), status: { [f.id]: st } });
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
        try { bodies.push({ id, name: ctx.names.get(id), ...meshBody(s) }); }
        catch (e) { bodies.push({ id, name: ctx.names.get(id), error: cleanErr(e) }); }
      }
      for (const [id, s] of ctx.ghosts) {
        try { bodies.push({ id, name: ctx.names.get(id), ghost: true, ...meshBody(s) }); } catch {}
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
