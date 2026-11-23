// Tinker mode: Tinkercad-style shape modeling. Shapes live in a single "tinker" feature.
import * as THREE from "../vendor/three.js";

export const SHAPES = {
  box: { label: "Box", d: { w: 20, d: 20, h: 20, r: 0 } },
  cylinder: { label: "Cylinder", d: { w: 20, d: 20, h: 20 } },
  sphere: { label: "Sphere", d: { w: 20, d: 20, h: 20 } },
  cone: { label: "Cone", d: { w: 20, d: 20, h: 20, top: 0 } },
  pyramid: { label: "Pyramid", d: { w: 20, d: 20, h: 20, top: 0 } },
  wedge: { label: "Wedge", d: { w: 20, d: 20, h: 20 } },
  tube: { label: "Tube", d: { w: 20, d: 20, h: 20, wall: 3 } },
  torus: { label: "Torus", d: { w: 20, d: 20, h: 5 } },
  dome: { label: "Dome", d: { w: 20, d: 20, h: 10 } },
  prism: { label: "Prism", d: { w: 20, d: 20, h: 20, sides: 6 } },
  star: { label: "Star", d: { w: 20, d: 20, h: 6, sides: 5, inner: 0.45 } },
};
const EXTRA = {
  r: ["Corner radius", 0], top: ["Top size (0–1)", 0], wall: ["Wall", 0.2], sides: ["Sides", 3], inner: ["Star depth (0–1)", 0.1],
};
const COLORS = ["#e8553f", "#f2a531", "#f2d531", "#5cc157", "#3fa7e8", "#8a6ee8", "#e86ec8", "#9db4cc"];

export function createTinker(A) {
  const { S, viewer, h, ICONS, toast } = A;
  const T = { sel: [], grid: 1, placeHole: false, drag: null, clip: null };

  const tf = () => S.project.features.find((f) => f.type === "tinker");
  const objs = () => tf()?.params.objects || [];
  const node = (id) => objs().find((o) => o.id === id);
  const bodyId = (id) => "t" + id;
  const snap = (v, g = T.grid) => Math.round(v / g) * g;
  const r2 = (v) => +(+v).toFixed(3);
  const changed = () => { A.commit(true); A.rebuild(0); A.renderAll(); };

  function ensure() {
    let f = tf();
    if (!f) {
      f = { id: A.uid(), type: "tinker", name: "Tinker scene", params: { objects: [] } };
      S.project.features.splice(A.activeCount(), 0, f);
      if (S.project.rollback != null) S.project.rollback++;
      A.commit(true);
    }
    return f;
  }

  function freeSpot(w, d) {
    const t = viewer.controls.target;
    let x = snap(t.x), y = snap(t.y);
    const boxes = objs().map((o) => viewer.bodyBox(bodyId(o.id))).filter(Boolean);
    for (let k = 0; k < 40; k++) {
      const clash = boxes.some((b) => x - w / 2 < b.max.x && x + w / 2 > b.min.x && y - d / 2 < b.max.y && y + d / 2 > b.min.y);
      if (!clash) break;
      x = snap(x + w + 5);
      if (k % 6 === 5) { x = snap(t.x); y = snap(y - d - 5); }
    }
    return [x, y];
  }

  function add(kind) {
    const f = ensure();
    const def = SHAPES[kind].d;
    const [x, y] = freeSpot(def.w, def.d);
    const n = f.params.objects.length;
    const o = { id: A.uid(), kind, name: SHAPES[kind].label, x, y, z: 0, rx: 0, ry: 0, rz: 0, hole: T.placeHole, ...structuredClone(def) };
    f.params.objects.push(o);
    S.project.parts[bodyId(o.id)] = { color: COLORS[n % COLORS.length], visible: true };
    T.sel = [o.id];
    changed();
  }

  // ---------- transforms ----------
  function leafBoxCenter(o) { return [o.x, o.y, o.z + o.h / 2]; }
  function translateNode(o, dx, dy, dz) {
    if (o.kind === "group") { o.tx = r2((o.tx || 0) + dx); o.ty = r2((o.ty || 0) + dy); o.tz = r2((o.tz || 0) + dz); }
    else { o.x = r2(o.x + dx); o.y = r2(o.y + dy); o.z = r2(o.z + dz); }
  }
  function rot2(x, y, deg) { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
  function rotateNode(o, deg, cx, cy) {
    if (o.kind === "group") {
      const p = [o.px || 0, o.py || 0], t = [o.tx || 0, o.ty || 0];
      const [qx, qy] = rot2(p[0] + t[0] - cx, p[1] + t[1] - cy, deg);
      o.tx = r2(qx + cx - p[0]); o.ty = r2(qy + cy - p[1]);
      o.rz = r2(((o.rz || 0) + deg) % 360);
    } else {
      const [qx, qy] = rot2(o.x - cx, o.y - cy, deg);
      o.x = r2(qx + cx); o.y = r2(qy + cy);
      o.rz = r2(((o.rz || 0) + deg) % 360);
    }
  }
  // bake a group's transform into a child (rotation about pivot, then translate)
  function bake(child, g) {
    const rz = g.rz || 0, px = g.px || 0, py = g.py || 0, tx = g.tx || 0, ty = g.ty || 0, tz = g.tz || 0;
    if (child.kind === "group") {
      const cp = [child.px || 0, child.py || 0], ct = [child.tx || 0, child.ty || 0];
      const [qx, qy] = rot2(cp[0] + ct[0] - px, cp[1] + ct[1] - py, rz);
      child.tx = r2(qx + px + tx - cp[0]); child.ty = r2(qy + py + ty - cp[1]); child.tz = r2((child.tz || 0) + tz);
      child.rz = r2(((child.rz || 0) + rz) % 360);
    } else {
      const [qx, qy] = rot2(child.x - px, child.y - py, rz);
      child.x = r2(qx + px + tx); child.y = r2(qy + py + ty); child.z = r2(child.z + tz);
      child.rz = r2(((child.rz || 0) + rz) % 360);
    }
  }
  function cloneNode(o) {
    const c = structuredClone(o);
    const re = (n) => { n.id = A.uid(); if (n.children) n.children.forEach(re); };
    re(c);
    return c;
  }
  function selBox(ids = T.sel) {
    const b = new THREE.Box3();
    for (const id of ids) { const bb = viewer.bodyBox(bodyId(id)); if (bb) b.union(bb); }
    return b;
  }

  // ---------- commands ----------
  const cmd = {
    del() {
      if (!T.sel.length) return;
      const f = tf();
      f.params.objects = f.params.objects.filter((o) => !T.sel.includes(o.id));
      T.sel = [];
      changed();
    },
    dup() {
      if (!T.sel.length) return;
      const f = tf(), out = [];
      for (const id of T.sel) {
        const o = node(id), c = cloneNode(o);
        translateNode(c, 10, -10, 0);
        f.params.objects.push(c);
        S.project.parts[bodyId(c.id)] = { ...(S.project.parts[bodyId(o.id)] || {}) };
        out.push(c.id);
      }
      T.sel = out;
      changed();
    },
    hole() {
      if (!T.sel.length) return;
      const allHole = T.sel.every((id) => node(id).hole);
      for (const id of T.sel) node(id).hole = !allHole;
      changed();
    },
    group() {
      if (T.sel.length < 2) return toast("Select 2 or more shapes (Shift-click) to group them");
      const f = tf(), b = selBox();
      const kids = f.params.objects.filter((o) => T.sel.includes(o.id));
      const solidKid = kids.find((k) => !k.hole);
      const g = { id: A.uid(), kind: "group", name: "Group", children: kids, tx: 0, ty: 0, tz: 0, rz: 0, px: r2((b.min.x + b.max.x) / 2), py: r2((b.min.y + b.max.y) / 2), hole: !solidKid };
      const idx = f.params.objects.findIndex((o) => T.sel.includes(o.id));
      f.params.objects = f.params.objects.filter((o) => !T.sel.includes(o.id));
      f.params.objects.splice(idx, 0, g);
      S.project.parts[bodyId(g.id)] = { ...(S.project.parts[bodyId((solidKid || kids[0]).id)] || {}), visible: true };
      T.sel = [g.id];
      changed();
    },
    ungroup() {
      const f = tf(), out = [];
      for (const id of T.sel) {
        const g = node(id);
        if (!g || g.kind !== "group") continue;
        const i = f.params.objects.indexOf(g);
        for (const c of g.children) { bake(c, g); out.push(c.id); }
        f.params.objects.splice(i, 1, ...g.children);
      }
      if (!out.length) return toast("Select a group to ungroup");
      T.sel = out;
      changed();
    },
    floor() {
      for (const id of T.sel) { const b = viewer.bodyBox(bodyId(id)); if (b) translateNode(node(id), 0, 0, -b.min.z); }
      changed();
    },
    rotate(deg) {
      if (!T.sel.length) return;
      const b = selBox(), cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
      for (const id of T.sel) rotateNode(node(id), deg, T.sel.length > 1 ? cx : node(id).kind === "group" ? cx : node(id).x, T.sel.length > 1 ? cy : node(id).kind === "group" ? cy : node(id).y);
      changed();
    },
    nudge(dx, dy, dz) { for (const id of T.sel) translateNode(node(id), dx, dy, dz); changed(); },
    align(axis, where) {
      if (T.sel.length < 2) return;
      const all = selBox(), k = axis;
      const target = where === "min" ? all.min[k] : where === "max" ? all.max[k] : (all.min[k] + all.max[k]) / 2;
      for (const id of T.sel) {
        const b = viewer.bodyBox(bodyId(id));
        if (!b) continue;
        const cur = where === "min" ? b.min[k] : where === "max" ? b.max[k] : (b.min[k] + b.max[k]) / 2;
        const d = target - cur;
        translateNode(node(id), k === "x" ? d : 0, k === "y" ? d : 0, k === "z" ? d : 0);
      }
      changed();
    },
    copy() { T.clip = T.sel.map((id) => structuredClone(node(id))); toast(`Copied ${T.clip.length}`); },
    paste() {
      if (!T.clip) return;
      const f = ensure(), out = [];
      for (const o of T.clip) { const c = cloneNode(o); translateNode(c, 10, -10, 0); f.params.objects.push(c); out.push(c.id); }
      T.sel = out;
      changed();
    },
  };

  // ---------- handles ----------
  function handles() {
    if (S.mode !== "tinker" || T.sel.length !== 1 || T.drag) { if (!T.drag) viewer.setHandles([]); return; }
    const o = node(T.sel[0]);
    const b = viewer.bodyBox(bodyId(o?.id));
    if (!o || !b) return viewer.setHandles([]);
    const c = b.getCenter(new THREE.Vector3());
    const sz = viewer.worldPerPixel(c) * 11;
    const list = [];
    const top = [c.x, c.y, b.max.z];
    list.push({ id: "lift", shape: "cone", pos: [top[0], top[1], top[2] + sz * 3], size: sz, color: 0x2a6df4 });
    list.push({ id: "rot", shape: "ring", pos: [c.x, c.y, b.min.z], size: sz, color: 0xff9a40 });
    if (o.kind !== "group" && !o.rx && !o.ry) {
      const a = ((o.rz || 0) * Math.PI) / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)];
      const cz = o.z + o.h / 2;
      list.push({ id: "+x", pos: [o.x + ux[0] * o.w / 2, o.y + ux[1] * o.w / 2, cz], size: sz, color: 0xffffff });
      list.push({ id: "-x", pos: [o.x - ux[0] * o.w / 2, o.y - ux[1] * o.w / 2, cz], size: sz, color: 0xffffff });
      list.push({ id: "+y", pos: [o.x + uy[0] * o.d / 2, o.y + uy[1] * o.d / 2, cz], size: sz, color: 0xffffff });
      list.push({ id: "-y", pos: [o.x - uy[0] * o.d / 2, o.y - uy[1] * o.d / 2, cz], size: sz, color: 0xffffff });
      list.push({ id: "+z", pos: [o.x, o.y, o.z + o.h], size: sz, color: 0xffffff });
    }
    viewer.setHandles(list);
  }

  // ---------- mouse ----------
  function captureDown(e) {
    if (S.mode !== "tinker") return false;
    const hid = T.sel.length === 1 ? viewer.hitHandle(e) : null;
    if (hid) {
      const o = node(T.sel[0]);
      const b = viewer.bodyBox(bodyId(o.id)), c = b.getCenter(new THREE.Vector3());
      const d = { kind: hid, o, orig: structuredClone(o), b, c, x0: e.clientX, y0: e.clientY };
      if (hid === "lift" || hid === "+z") { d.axisO = [c.x, c.y, b.max.z]; d.axis = [0, 0, 1]; }
      else if (hid === "rot") { const p = viewer.planeZ(e, b.min.z); d.a0 = p ? Math.atan2(p[1] - c.y, p[0] - c.x) : 0; }
      else {
        const a = ((o.rz || 0) * Math.PI) / 180, ux = [Math.cos(a), Math.sin(a), 0], uy = [-Math.sin(a), Math.cos(a), 0];
        const u = hid[1] === "x" ? ux : uy, sgn = hid[0] === "+" ? 1 : -1;
        d.axis = u.map((v) => v * sgn);
        d.axisO = [o.x, o.y, o.z + o.h / 2];
      }
      if (d.axis) d.t0 = viewer.axisParam(e, d.axisO, d.axis) ?? 0;
      T.drag = d;
      viewer.setHandles([]);
      return true;
    }
    const hit = viewer.hit(e);
    if (!hit || !String(hit.body).startsWith("t")) return false;
    const id = hit.body.slice(1);
    if (!node(id)) return false;
    if (e.shiftKey) T.sel = T.sel.includes(id) ? T.sel.filter((x) => x !== id) : [...T.sel, id];
    else if (!T.sel.includes(id)) T.sel = [id];
    const z0 = hit.point[2];
    T.drag = { kind: "move", z0, p0: viewer.planeZ(e, z0), x0: e.clientX, y0: e.clientY, ids: [...T.sel], dx: 0, dy: 0 };
    A.renderTree(); A.renderProps(); paintSel();
    return true;
  }

  function captureMove(e) {
    const d = T.drag;
    if (!d) return;
    const m = new THREE.Matrix4();
    if (d.kind === "move") {
      const p = viewer.planeZ(e, d.z0);
      if (!p || !d.p0) return;
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4 && !d.moving) return;
      if (!d.moving) viewer.setHandles([]);
      d.moving = true;
      d.dx = snap(p[0] - d.p0[0]); d.dy = snap(p[1] - d.p0[1]);
      m.makeTranslation(d.dx, d.dy, 0);
      for (const id of d.ids) viewer.setBodyMatrix(bodyId(id), m);
      label(e, `Δ ${fmtN(d.dx)}, ${fmtN(d.dy)}`);
      return;
    }
    const o = d.o, id = bodyId(o.id);
    if (d.kind === "rot") {
      const p = viewer.planeZ(e, d.b.min.z);
      if (!p) return;
      let deg = ((Math.atan2(p[1] - d.c.y, p[0] - d.c.x) - d.a0) * 180) / Math.PI;
      deg = e.shiftKey ? Math.round(deg) : Math.round(deg / 15) * 15;
      d.deg = deg;
      const cx = o.kind === "group" ? d.c.x : o.x, cy = o.kind === "group" ? d.c.y : o.y;
      m.makeTranslation(cx, cy, 0).multiply(new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, 0));
      viewer.setBodyMatrix(id, m);
      label(e, `${deg}°`);
      return;
    }
    const t = viewer.axisParam(e, d.axisO, d.axis);
    if (t == null) return;
    const delta = snap(t - d.t0);
    d.delta = delta;
    if (d.kind === "lift") {
      m.makeTranslation(0, 0, delta);
      label(e, `Z ${fmtN((o.kind === "group" ? d.b.min.z : o.z) + delta)}`);
    } else {
      const dimKey = d.kind[1] === "x" ? "w" : d.kind[1] === "y" ? "d" : "h";
      const size0 = d.orig[dimKey], size = Math.max(T.grid, size0 + delta);
      d.size = size;
      const k = size / size0;
      const ax = new THREE.Vector3(...d.axis);
      const anchor = new THREE.Vector3(...d.axisO).addScaledVector(ax, -(dimKey === "h" ? 0 : size0 / 2));
      if (dimKey === "h") anchor.set(o.x, o.y, o.z);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ax);
      const R = new THREE.Matrix4().makeRotationFromQuaternion(q), Ri = R.clone().invert();
      m.makeTranslation(anchor.x, anchor.y, anchor.z).multiply(R).multiply(new THREE.Matrix4().makeScale(k, 1, 1)).multiply(Ri).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
      label(e, `${{ w: "Width", d: "Depth", h: "Height" }[dimKey]} ${fmtN(size)}`);
    }
    viewer.setBodyMatrix(id, m);
  }

  function captureUp() {
    const d = T.drag;
    T.drag = null;
    viewer.setLabels([]);
    if (!d) return;
    if (d.kind === "move") {
      if (d.moving && (d.dx || d.dy)) { for (const id of d.ids) translateNode(node(id), d.dx, d.dy, 0); changed(); }
      else { for (const id of d.ids) viewer.setBodyMatrix(bodyId(id), null); handles(); }
      return;
    }
    const o = d.o;
    if (d.kind === "rot") {
      if (d.deg) { rotateNode(o, d.deg, o.kind === "group" ? d.c.x : o.x, o.kind === "group" ? d.c.y : o.y); changed(); }
      else { viewer.setBodyMatrix(bodyId(o.id), null); handles(); }
      return;
    }
    if (!d.delta) { viewer.setBodyMatrix(bodyId(o.id), null); handles(); return; }
    if (d.kind === "lift") translateNode(o, 0, 0, d.delta);
    else {
      const dimKey = d.kind[1] === "x" ? "w" : d.kind[1] === "y" ? "d" : "h";
      const grow = d.size - d.orig[dimKey];
      o[dimKey] = r2(d.size);
      if (dimKey !== "h") { o.x = r2(o.x + (d.axis[0] * grow) / 2); o.y = r2(o.y + (d.axis[1] * grow) / 2); }
      if (o.kind === "torus" && dimKey !== "h") { o.w = o.d = r2(d.size); }
    }
    changed();
  }

  function label(e, text) {
    const r = viewer.renderer.domElement.getBoundingClientRect();
    viewer.setLabels([{ screen: [e.clientX - r.left, e.clientY - r.top], text, cls: "dim" }]);
  }
  const fmtN = (v) => String(+(+v).toFixed(2));

  function pick(hit) {
    if (!hit) { T.sel = []; A.renderTree(); A.renderProps(); paintSel(); }
  }
  function paintSel() {
    viewer.setSelectedPart(T.sel.map(bodyId));
    handles();
  }

  // ---------- UI ----------
  function ribbon(r) {
    const grp = (title, ...items) => h("div", { class: "grp" }, h("div", { class: "items" }, ...items), h("div", { class: "gt" }, title));
    const b = (icon, label, fn, opts = {}) => A.btn(icon, label, fn, opts);
    r.append(
      grp(T.placeHole ? "Add shape (as HOLE)" : "Add shape", ...Object.entries(SHAPES).map(([k, s]) => b(k, s.label, () => add(k), { tip: `Add a ${s.label.toLowerCase()}`, cls: T.placeHole ? "holebtn" : "" }))),
      grp("Add as",
        b("box", "Solid", () => { T.placeHole = false; A.renderRibbon(); }, { active: !T.placeHole }),
        b("hole", "Hole", () => { T.placeHole = true; A.renderRibbon(); }, { active: T.placeHole, tip: "New shapes are holes — group them with a solid to cut" })),
      grp("Edit",
        b("group", "Group", cmd.group, { key: "Ctrl+G", tip: "Combine selected — holes cut the solids" }),
        b("ungroup", "Ungroup", cmd.ungroup, { key: "Ctrl+Shift+G" }),
        b("hole", "Hole/Solid", cmd.hole, { key: "H" }),
        b("copy", "Duplicate", cmd.dup, { key: "Ctrl+D" }),
        b("floor", "Drop", cmd.floor, { key: "D", tip: "Drop to the workplane" }),
        b("revolve", "Rotate 90°", () => cmd.rotate(90), { key: "]" }),
        b("trash", "Delete", cmd.del, { key: "Del" })),
      grp("Snap", h("label", { class: "rsel" }, "Grid", h("select", { onchange: (e) => (T.grid = +e.target.value) }, ...[0.1, 0.5, 1, 2, 5, 10].map((g) => h("option", { value: g, selected: T.grid === g }, g + " mm"))))),
    );
  }

  function tree(el) {
    el.innerHTML = "";
    const list = objs();
    if (!list.length) el.append(h("div", { class: "empty" }, "Click a shape in the ribbon to add it."));
    for (const o of list) {
      const meta = S.project.parts[bodyId(o.id)] || {};
      el.append(h("div", { class: "fi" + (T.sel.includes(o.id) ? " sel" : ""), onclick: (e) => { T.sel = e.shiftKey ? (T.sel.includes(o.id) ? T.sel.filter((x) => x !== o.id) : [...T.sel, o.id]) : [o.id]; tree(el); A.renderProps(); paintSel(); } },
        h("span", { class: "ic", html: ICONS[o.kind === "group" ? "group" : o.kind] || ICONS.box }),
        h("span", { class: "nm" }, o.name || o.kind, o.kind === "group" ? h("small", { class: "muted" }, ` (${o.children.length})`) : null),
        o.hole ? h("span", { class: "chip on" }, "hole") : h("span", { class: "dot", style: `background:${meta.color || "#9db4cc"}` }),
        h("button", { class: "mini", html: meta.visible !== false ? ICONS.eye : ICONS.eyeoff, onclick: (e) => { e.stopPropagation(); const m = A.partMeta(bodyId(o.id)); m.visible = m.visible === false; viewer.setBodies(S.build.bodies, S.project.parts); A.commit(true); tree(el); } })));
    }
  }

  function props(el) {
    el.innerHTML = "";
    const head = (icon, t, sub) => h("div", { class: "ph" }, h("span", { class: "ic", html: ICONS[icon] }), h("div", {}, h("div", { class: "pt" }, t), sub ? h("div", { class: "ps" }, sub) : null));
    if (!T.sel.length) {
      el.append(head("tinker", "Tinker mode", "Build by stacking simple shapes"),
        h("div", { class: "tips" }, h("ol", {},
          h("li", {}, "Click a shape in the ribbon to drop it in."),
          h("li", {}, h("b", {}, "Drag"), " a shape to move it. Drag the ", h("b", {}, "white boxes"), " to resize, the ", h("b", {}, "blue cone"), " to lift, the ", h("b", {}, "orange ring"), " to rotate."),
          h("li", {}, "Make a shape a ", h("b", {}, "Hole"), ", Shift-click it together with a solid, then ", h("b", {}, "Group"), " to cut it out."),
          h("li", {}, "Switch to ", h("b", {}, "Pro"), " to fillet, cast, or export the result.")),
          h("p", {}, "Left-drag empty space orbits · right-drag pans · wheel zooms. Arrows nudge, D drops to floor, H = hole.")));
      return;
    }
    if (T.sel.length > 1) {
      el.append(head("group", `${T.sel.length} shapes selected`, "Shift-click to add/remove"));
      el.append(h("button", { class: "btn primary wide", onclick: cmd.group }, h("span", { class: "ic", html: ICONS.group }), " Group (holes cut solids)"));
      el.append(h("div", { class: "row" }, h("button", { class: "btn", onclick: cmd.hole }, "Hole/Solid"), h("button", { class: "btn", onclick: cmd.dup }, "Duplicate"), h("button", { class: "btn danger", onclick: cmd.del }, "Delete")));
      el.append(h("div", { class: "sh" }, "Align"));
      for (const [ax, lab] of [["x", "X"], ["y", "Y"], ["z", "Z"]]) {
        el.append(h("div", { class: "fl" }, h("span", {}, lab), h("div", { class: "seg" },
          ...[["min", ax === "z" ? "Bottom" : "Min"], ["mid", "Center"], ["max", ax === "z" ? "Top" : "Max"]].map(([w, l]) => h("button", { onclick: () => cmd.align(ax, w) }, l)))));
      }
      return;
    }
    const o = node(T.sel[0]);
    if (!o) return;
    const meta = A.partMeta(bodyId(o.id));
    const num = (label, get, set, unit = true) => h("label", { class: "fl" }, h("span", {}, label), h("div", { class: "numwrap" },
      A.numInput(get, (v) => { const n = A.num(v, NaN); if (isFinite(n)) { set(n); A.commit(); A.rebuild(); } }), unit ? h("em", {}, S.project.units) : null));
    el.append(head(o.kind === "group" ? "group" : o.kind, o.name || o.kind, o.kind === "group" ? `Group of ${o.children.length}` : SHAPES[o.kind]?.label));
    el.append(h("label", { class: "fl" }, h("span", {}, "Name"), h("input", { value: o.name || "", onchange: (e) => { o.name = e.target.value; A.commit(true); A.rebuild(); A.renderTree(); } })));
    el.append(h("label", { class: "fl" }, h("span", {}, "Type"), h("div", { class: "seg" },
      h("button", { class: o.hole ? "" : "on", onclick: () => { o.hole = false; changed(); } }, "Solid"),
      h("button", { class: o.hole ? "on" : "", onclick: () => { o.hole = true; changed(); } }, "Hole"))));
    if (!o.hole) el.append(h("label", { class: "fl" }, h("span", {}, "Color"), h("div", { class: "row" },
      ...COLORS.map((c) => h("button", { class: "swatch" + (meta.color === c ? " on" : ""), style: `background:${c}`, onclick: () => { meta.color = c; viewer.setBodies(S.build.bodies, S.project.parts); A.commit(true); props(el); A.renderTree(); } })),
      h("input", { type: "color", value: meta.color || "#9db4cc", oninput: (e) => { meta.color = e.target.value; viewer.setBodies(S.build.bodies, S.project.parts); A.commit(); } }))));
    if (o.kind === "group") {
      el.append(h("div", { class: "sh" }, "Move"));
      num("Move X", () => o.tx || 0, (v) => (o.tx = v)); num;
      el.lastChild && null;
      el.append(num("Move X", () => o.tx || 0, (v) => (o.tx = v)), num("Move Y", () => o.ty || 0, (v) => (o.ty = v)), num("Move Z", () => o.tz || 0, (v) => (o.tz = v)), num("Rotate Z°", () => o.rz || 0, (v) => (o.rz = v), false));
      el.append(h("div", { class: "row" }, h("button", { class: "btn primary", onclick: cmd.ungroup }, "Ungroup"), h("button", { class: "btn", onclick: cmd.dup }, "Duplicate"), h("button", { class: "btn", onclick: cmd.floor }, "Drop"), h("button", { class: "btn danger", onclick: cmd.del }, "Delete")));
      return;
    }
    el.append(h("div", { class: "sh" }, "Size"));
    el.append(num("Width (X)", () => o.w, (v) => (o.w = Math.max(0.05, v))), num("Depth (Y)", () => o.d, (v) => (o.d = Math.max(0.05, v))), num("Height (Z)", () => o.h, (v) => (o.h = Math.max(0.05, v))));
    for (const k of Object.keys(EXTRA)) if (k in o) el.append(num(EXTRA[k][0], () => o[k], (v) => (o[k] = Math.max(EXTRA[k][1], v)), k === "r" || k === "wall"));
    el.append(h("div", { class: "sh" }, "Position"));
    el.append(num("X (center)", () => o.x, (v) => (o.x = v)), num("Y (center)", () => o.y, (v) => (o.y = v)), num("Z (bottom)", () => o.z, (v) => (o.z = v)));
    el.append(h("div", { class: "sh" }, "Rotation"));
    el.append(num("Tilt X°", () => o.rx || 0, (v) => (o.rx = v), false), num("Tilt Y°", () => o.ry || 0, (v) => (o.ry = v), false), num("Turn Z°", () => o.rz || 0, (v) => (o.rz = v), false));
    el.append(h("div", { class: "row" }, h("button", { class: "btn", onclick: cmd.dup }, "Duplicate"), h("button", { class: "btn", onclick: cmd.floor }, "Drop to floor"), h("button", { class: "btn danger", onclick: cmd.del }, "Delete")));
  }

  function key(e) {
    if (S.mode !== "tinker") return false;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, g = e.shiftKey ? T.grid * 10 : T.grid;
    if (ctrl && k === "g") { e.preventDefault(); e.shiftKey ? cmd.ungroup() : cmd.group(); return true; }
    if (ctrl && k === "d") { e.preventDefault(); cmd.dup(); return true; }
    if (ctrl && k === "c") { cmd.copy(); return true; }
    if (ctrl && k === "v") { cmd.paste(); return true; }
    if (ctrl && k === "a") { e.preventDefault(); T.sel = objs().map((o) => o.id); A.renderAll(); paintSel(); return true; }
    if (ctrl) return false;
    if (e.key === "Delete" || e.key === "Backspace") { cmd.del(); return true; }
    if (e.key === "Escape") { T.sel = []; A.renderAll(); paintSel(); return true; }
    if (!T.sel.length) return false;
    const nud = { ArrowLeft: [-g, 0, 0], ArrowRight: [g, 0, 0], ArrowUp: [0, g, 0], ArrowDown: [0, -g, 0], PageUp: [0, 0, g], PageDown: [0, 0, -g] }[e.key];
    if (nud) { e.preventDefault(); cmd.nudge(...nud); return true; }
    if (k === "h") { cmd.hole(); return true; }
    if (k === "d") { cmd.floor(); return true; }
    if (e.key === "]") { cmd.rotate(e.shiftKey ? 1 : 15); return true; }
    if (e.key === "[") { cmd.rotate(e.shiftKey ? -1 : -15); return true; }
    return false;
  }

  function afterBuild() {
    T.sel = T.sel.filter((id) => node(id));
    if (S.mode === "tinker") paintSel();
  }

  return { T, ensure, add, ribbon, tree, props, key, captureDown, captureMove, captureUp, pick, afterBuild, handles, cmd, tf };
}
