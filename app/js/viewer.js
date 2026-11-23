import * as THREE from "../vendor/three.js";
import { OrbitControls } from "../vendor/three.js";
import { outline } from "./geom2d.js";

const HOVER = new THREE.Color("#6ad1ff");
const PICKED = new THREE.Color("#ffd21f");
const SEL_PART = new THREE.Color("#7fd0ff");

export class Viewer {
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.localClippingEnabled = true;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000);
    for (const c of [this.persp, this.ortho]) c.up.set(0, 0, 1);
    this.camera = this.persp;
    this.camera.position.set(160, -220, 160);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.18;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.setMouseMode("model");

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.8);
    this.scene.add(this.sun);
    this.sun2 = new THREE.DirectionalLight(0xffffff, 0.5);
    this.scene.add(this.sun2);

    this.pickGroup = new THREE.Group();
    this.scene.add(this.pickGroup);
    this.handleGroup = new THREE.Group();
    this.scene.add(this.handleGroup);
    this.bodyGroup = new THREE.Group();
    this.sketchGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.bodyGroup, this.sketchGroup, this.overlayGroup);

    this.grid = null;
    this.gridScale = 0;
    this.axes = this.makeAxes();
    this.scene.add(this.axes);

    this.bodies = new Map(); // id -> {mesh, lines, data}
    this.hover = null;
    this.pickMode = null; // null | 'edges' | 'faces' | 'face-plane' | 'measure' | 'sketch'
    this.pickedEdges = [];
    this.pickedFaces = [];
    this.selectedPart = null;
    this.section = null;
    this.showEdges = true;
    this.wire = false;
    this.labels = [];
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "labels";
    el.appendChild(this.labelLayer);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.downAt = null;
    const dom = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.cb.onCaptureDown) return;
      if (this.cb.onCaptureDown(e)) {
        this.capturing = true;
        this.controls.enabled = false;
        dom.setPointerCapture?.(e.pointerId);
      }
    }, true);
    window.addEventListener("pointermove", (e) => { if (this.capturing) this.cb.onCaptureMove?.(e); });
    window.addEventListener("pointerup", (e) => {
      if (!this.capturing) return;
      this.capturing = false;
      this.controls.enabled = true;
      this.cb.onCaptureUp?.(e);
    });
    dom.addEventListener("pointerdown", (e) => this.onDown(e));
    dom.addEventListener("pointermove", (e) => this.onMove(e));
    dom.addEventListener("pointerup", (e) => this.onUp(e));
    dom.addEventListener("dblclick", (e) => this.cb.onDblClick?.(e));
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("pointerleave", () => this.setHover(null));
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.updateGrid(100);
    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this.sun.position.copy(this.camera.position).add(new THREE.Vector3(30, 10, 60));
      this.sun2.position.copy(this.camera.position).multiplyScalar(-1);
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
    };
    loop();
  }

  setMouseMode(mode) {
    const c = this.controls;
    if (mode === "sketch") {
      c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    } else {
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
  }

  updateOrtho() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    const d = this.camera === this.ortho ? this.orthoSize || 200 : 200;
    this.ortho.left = (-d * w) / h / 2; this.ortho.right = (d * w) / h / 2;
    this.ortho.top = d / 2; this.ortho.bottom = -d / 2;
    this.ortho.updateProjectionMatrix();
  }

  setOrtho(on) {
    if (on === (this.camera === this.ortho)) return;
    const target = this.controls.target.clone();
    const pos = this.camera.position.clone();
    if (on) {
      const dist = pos.distanceTo(target);
      this.orthoSize = 2 * dist * Math.tan((this.persp.fov * Math.PI) / 360);
      this.ortho.position.copy(pos);
      this.ortho.zoom = 1;
      this.camera = this.ortho;
      this.updateOrtho();
    } else {
      this.persp.position.copy(pos);
      const dist = (this.orthoSize / this.ortho.zoom) / (2 * Math.tan((this.persp.fov * Math.PI) / 360));
      const dir = pos.clone().sub(target).normalize();
      this.persp.position.copy(target.clone().add(dir.multiplyScalar(dist)));
      this.camera = this.persp;
    }
    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.controls.update();
  }

  makeAxes() {
    const g = new THREE.Group();
    const mk = (dir, col) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...dir)]);
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col }));
      return l;
    };
    g.add(mk([1, 0, 0], 0xff4d4d), mk([0, 1, 0], 0x4dff7a), mk([0, 0, 1], 0x4d8dff));
    return g;
  }

  updateGrid(size) {
    const step = Math.pow(10, Math.floor(Math.log10(Math.max(size, 1) / 4)));
    const total = step * 40;
    if (this.grid && this.gridScale === total) return;
    if (this.grid) this.scene.remove(this.grid);
    this.gridScale = total;
    const g = new THREE.GridHelper(total, 40, 0x5a6b80, 0x34404f);
    g.rotation.x = Math.PI / 2;
    g.position.z = -total * 1e-4;
    g.material.transparent = true;
    g.material.opacity = 0.55;
    g.material.depthWrite = false;
    g.renderOrder = -1;
    g.visible = this.gridVisible !== false;
    this.grid = g;
    this.scene.add(g);
    this.axes.scale.setScalar(step * 3);
  }

  setGridVisible(v) { this.gridVisible = v; if (this.grid) this.grid.visible = v; }

  // ---------- bodies ----------
  setBodies(list, parts) {
    const seen = new Set();
    let order = 0;
    for (const b of list) {
      seen.add(b.id);
      const meta = parts[b.id] || {};
      let cur = this.bodies.get(b.id);
      if (!cur || cur.data !== b) {
        if (cur) this.disposeBody(cur);
        cur = b.error ? { data: b } : this.buildBody(b);
        this.bodies.set(b.id, cur);
      }
      cur.color = new THREE.Color(b.ghost ? "#9aa9ba" : meta.color || "#9db4cc");
      cur.visible = meta.visible !== false;
      if (cur.mesh) {
        cur.mesh.visible = cur.visible; cur.lines.visible = cur.visible && this.showEdges;
        if (!b.ghost) cur.mesh.material.polygonOffsetUnits = 1 + (order++ % 24) * 0.75;
      }
      this.paint(b.id);
    }
    for (const [id, cur] of this.bodies) if (!seen.has(id)) { this.disposeBody(cur); this.bodies.delete(id); }
    this.applySection();
    this.applyWire();
    this.drawEdgeTubes();
  }

  buildBody(b) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(b.vertices, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(b.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(b.triangles, 1));
    const colors = new Float32Array(b.vertices.length);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mat = b.ghost
      ? new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
      : new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.08, roughness: 0.55, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    if (!b.ghost) mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n if(!gl_FrontFacing){ gl_FragColor.rgb = vec3(0.95,0.35,0.25); }"
      );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.bodyId = b.id;
    if (b.ghost) mesh.renderOrder = 2;
    // vertex ranges per face
    const idx = b.triangles;
    const faceVerts = b.faces.map((f) => {
      let mn = Infinity, mx = -1;
      for (let i = f.start; i < f.start + f.count; i++) { const v = idx[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      return [mn, mx];
    });
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute("position", new THREE.BufferAttribute(b.lines, 3));
    const lcol = new Float32Array(b.lines.length);
    lgeo.setAttribute("color", new THREE.BufferAttribute(lcol, 3));
    const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: !!b.ghost, opacity: b.ghost ? 0.5 : 1 }));
    lines.userData.bodyId = b.id;
    this.bodyGroup.add(mesh, lines);
    // edge segments: meshEdges gives polylines per edge as point pairs
    return { data: b, mesh, lines, faceVerts };
  }

  disposeBody(cur) {
    if (!cur.mesh) return;
    this.bodyGroup.remove(cur.mesh, cur.lines);
    cur.mesh.geometry.dispose(); cur.mesh.material.dispose();
    cur.lines.geometry.dispose(); cur.lines.material.dispose();
  }

  paint(id) {
    const cur = this.bodies.get(id);
    if (!cur || !cur.mesh) return;
    const b = cur.data;
    const col = cur.mesh.geometry.attributes.color;
    const sel = Array.isArray(this.selectedPart) ? this.selectedPart.includes(id) : this.selectedPart === id;
    const base = sel ? cur.color.clone().lerp(SEL_PART, 0.45) : cur.color;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, base.r, base.g, base.b);
    const paintFace = (fi, c) => {
      const [mn, mx] = cur.faceVerts[fi] || [];
      if (mn === undefined) return;
      for (let v = mn; v <= mx; v++) col.setXYZ(v, c.r, c.g, c.b);
    };
    for (const pf of this.pickedFaces) if (pf.body === id) { const fi = this.nearestFace(b, pf); if (fi >= 0) paintFace(fi, PICKED); }
    if (this.hover && this.hover.body === id && this.hover.kind === "face") paintFace(this.hover.index, HOVER);
    col.needsUpdate = true;
    const lc = cur.lines.geometry.attributes.color;
    const dark = new THREE.Color("#0d141c");
    for (let i = 0; i < lc.count; i++) lc.setXYZ(i, dark.r, dark.g, dark.b);
    const paintEdge = (ei, c) => {
      const e = b.edges[ei];
      if (!e) return;
      for (let v = e.start; v < e.start + e.count; v++) lc.setXYZ(v, c.r, c.g, c.b);
    };
    for (const pe of this.pickedEdges) if (pe.body === id) { const ei = this.nearestEdge(b, pe); if (ei >= 0) paintEdge(ei, PICKED); }
    if (this.hover && this.hover.body === id && this.hover.kind === "edge") paintEdge(this.hover.index, HOVER);
    lc.needsUpdate = true;
  }

  paintAll() { for (const id of this.bodies.keys()) this.paint(id); }

  edgePoints(b, ei) {
    const e = b.edges[ei], L = b.lines, pts = [];
    for (let v = e.start; v < e.start + e.count; v++) pts.push(new THREE.Vector3(L[v * 3], L[v * 3 + 1], L[v * 3 + 2]));
    return pts;
  }
  drawEdgeTubes() {
    for (const ch of [...this.pickGroup.children]) { this.pickGroup.remove(ch); ch.geometry.dispose(); ch.material.dispose(); }
    const box = this.modelBox();
    const r = Math.max(0.02, (box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length()) * 0.0035);
    const add = (pts, color) => {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
        if (len < 1e-9) continue;
        const g = new THREE.CylinderGeometry(r, r, len, 8, 1, true);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.pickGroup.add(m);
      }
    };
    for (const pe of this.pickedEdges) {
      const cur = this.bodies.get(pe.body);
      if (!cur || !cur.mesh) continue;
      const ei = this.nearestEdge(cur.data, pe);
      if (ei >= 0) add(this.edgePoints(cur.data, ei), 0xffd21f);
    }
    if (this.hover && this.hover.kind === "edge") {
      const cur = this.bodies.get(this.hover.body);
      if (cur && cur.mesh) add(this.edgePoints(cur.data, this.hover.index), 0xffffff);
    }
  }

  nearestEdge(b, pick) {
    let best = -1, bd = Infinity;
    b.edges.forEach((e, i) => {
      if (!e.m) return;
      const d = Math.hypot(e.m[0] - pick.p[0], e.m[1] - pick.p[1], e.m[2] - pick.p[2]);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  nearestFace(b, pick) {
    let best = -1, bd = Infinity;
    b.faces.forEach((f, i) => {
      if (!f.c) return;
      let d = Math.hypot(f.c[0] - pick.p[0], f.c[1] - pick.p[1], f.c[2] - pick.p[2]);
      if (pick.n && f.n) d += (1 - (f.n[0] * pick.n[0] + f.n[1] * pick.n[1] + f.n[2] * pick.n[2])) * 10;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  setPicked(edges, faces) {
    this.pickedEdges = edges || [];
    this.pickedFaces = faces || [];
    this.paintAll();
    this.drawEdgeTubes();
  }

  setSelectedPart(id) { this.selectedPart = id; this.paintAll(); }

  setEdgesVisible(v) { this.showEdges = v; for (const c of this.bodies.values()) if (c.lines) c.lines.visible = v && c.visible; }
  setWire(v) { this.wire = v; this.applyWire(); }
  applyWire() {
    for (const c of this.bodies.values()) if (c.mesh) { c.mesh.material.wireframe = false; c.mesh.material.transparent = this.wire; c.mesh.material.opacity = this.wire ? 0.25 : 1; c.mesh.material.depthWrite = !this.wire; }
  }

  setSection(sec) {
    this.section = sec;
    this.applySection();
  }
  applySection() {
    const planes = [];
    if (this.section) {
      const n = { X: [-1, 0, 0], Y: [0, -1, 0], Z: [0, 0, -1] }[this.section.axis];
      const v = new THREE.Vector3(...n);
      if (this.section.flip) v.negate();
      planes.push(new THREE.Plane(v, this.section.flip ? -this.section.offset : this.section.offset));
    }
    for (const c of this.bodies.values()) if (c.mesh) { c.mesh.material.clippingPlanes = planes; c.lines.material.clippingPlanes = planes; }
  }

  modelBox() {
    const box = new THREE.Box3();
    for (const c of this.bodies.values()) if (c.mesh && c.visible) box.union(c.mesh.geometry.boundingBox);
    return box;
  }

  // ---------- camera ----------
  fit(animate = true) {
    let box = this.modelBox();
    if (box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 50));
    const s = box.getBoundingSphere(new THREE.Sphere());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = s.radius / Math.sin((this.persp.fov * Math.PI) / 360) * 1.15;
    this.animateTo(s.center, s.center.clone().add(dir.multiplyScalar(dist)), s.radius * 2.4, animate);
  }

  view(name) {
    const dirs = {
      top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0],
      right: [1, 0, 0], left: [-1, 0, 0], iso: [1, -1, 0.85],
    };
    this.viewDir(new THREE.Vector3(...dirs[name]).normalize(), name === "top" ? new THREE.Vector3(0, 1, 0) : name === "bottom" ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1));
  }

  viewDir(dir, up = new THREE.Vector3(0, 0, 1), center) {
    let box = this.modelBox();
    if (box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 50));
    const s = box.getBoundingSphere(new THREE.Sphere());
    const c = center || s.center;
    const r = Math.max(s.radius, 20);
    const dist = r / Math.sin((this.persp.fov * Math.PI) / 360) * 1.15;
    this.animateTo(c, c.clone().add(dir.clone().multiplyScalar(dist)), r * 2.4, true, up);
  }

  animateTo(target, pos, orthoSize, animate = true, up) {
    const t0 = this.controls.target.clone(), p0 = this.camera.position.clone(), u0 = this.camera.up.clone();
    const u1 = up ? up.clone() : new THREE.Vector3(0, 0, 1);
    const start = performance.now(), dur = animate ? 380 : 0;
    if (this.camera === this.ortho) { this.orthoSize = orthoSize; this.ortho.zoom = 1; this.updateOrtho(); }
    const step = () => {
      const k = dur ? Math.min(1, (performance.now() - start) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      this.controls.target.lerpVectors(t0, target, e);
      this.camera.position.lerpVectors(p0, pos, e);
      this.camera.up.lerpVectors(u0, u1, e).normalize();
      this.controls.update();
      if (k < 1) requestAnimationFrame(step);
      else { this.persp.up.copy(u1); this.ortho.up.copy(u1); }
    };
    step();
  }

  alignToPlane(pl) {
    const n = new THREE.Vector3(...pl.n).normalize();
    const y = new THREE.Vector3().crossVectors(n, new THREE.Vector3(...pl.x)).normalize();
    this.viewDir(n, y, new THREE.Vector3(...pl.o));
  }

  // ---------- tinker helpers ----------
  setBodyMatrix(id, m) {
    const cur = this.bodies.get(id);
    if (!cur || !cur.mesh) return;
    for (const o of [cur.mesh, cur.lines]) {
      if (m) { o.matrixAutoUpdate = false; o.matrix.copy(m); }
      else { o.matrixAutoUpdate = true; o.position.set(0, 0, 0); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); }
    }
  }
  bodyBox(id) {
    const cur = this.bodies.get(id);
    return cur && cur.mesh ? cur.mesh.geometry.boundingBox.clone() : null;
  }
  setHandles(list) {
    for (const ch of [...this.handleGroup.children]) { this.handleGroup.remove(ch); ch.geometry.dispose(); ch.material.dispose(); }
    for (const hd of list || []) {
      const geo = hd.shape === "cone" ? new THREE.ConeGeometry(hd.size * 0.7, hd.size * 1.6, 16) : hd.shape === "ring" ? new THREE.TorusGeometry(hd.size * 2.2, hd.size * 0.22, 8, 40) : new THREE.BoxGeometry(hd.size, hd.size, hd.size);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hd.color, depthTest: false, transparent: true }));
      m.position.set(...hd.pos);
      if (hd.shape === "cone") m.rotation.x = Math.PI / 2;
      m.renderOrder = 10;
      m.userData.handle = hd.id;
      this.handleGroup.add(m);
    }
  }
  hitHandle(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const h = this.raycaster.intersectObjects(this.handleGroup.children, false)[0];
    return h ? h.object.userData.handle : null;
  }
  setPlacer(box) {
    if (this.placer) { this.scene.remove(this.placer); this.placer.geometry.dispose(); this.placer.material.dispose(); this.placer = null; }
    if (!box) return;
    const b = new THREE.Box3(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max));
    this.placer = new THREE.Box3Helper(b, 0xff9a40);
    this.placer.renderOrder = 9;
    this.scene.add(this.placer);
  }
  planeZ(e, z) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p) ? p.toArray() : null;
  }
  axisParam(e, origin, dir) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const r = this.raycaster.ray, o = new THREE.Vector3(...origin), d = new THREE.Vector3(...dir).normalize();
    const w0 = o.clone().sub(r.origin), a = d.dot(d), b = d.dot(r.direction), c = r.direction.dot(r.direction);
    const dd = d.dot(w0), ee = r.direction.dot(w0), den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    return (b * ee - c * dd) / den;
  }

  // ---------- sketches ----------
  setSketches(list, scale) {
    for (const ch of [...this.sketchGroup.children]) { this.sketchGroup.remove(ch); ch.geometry?.dispose(); ch.material?.dispose(); }
    const s = scale || 100;
    for (const sk of list) {
      const pl = sk.plane;
      const o = new THREE.Vector3(...pl.o), X = new THREE.Vector3(...pl.x).normalize(), N = new THREE.Vector3(...pl.n).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      const lift = N.clone().multiplyScalar(s * 0.0008);
      const to3 = (p) => o.clone().addScaledVector(X, p[0]).addScaledVector(Y, p[1]).add(lift);
      if (sk.active) {
        const gs = sk.gridSize || 10, half = Math.max(gs * 20, s * 1.5);
        const n = Math.min(400, Math.round((half * 2) / gs));
        const pts = [], major = [];
        for (let i = 0; i <= n; i++) {
          const v = -half + i * gs;
          const arr = Math.round(v / gs) % 10 === 0 ? major : pts;
          arr.push(to3([v, -half]), to3([v, half]), to3([-half, v]), to3([half, v]));
        }
        const mkGrid = (p, col, op) => {
          const g = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
          g.renderOrder = 1;
          this.sketchGroup.add(g);
        };
        mkGrid(pts, 0x3a8dde, 0.18);
        mkGrid(major, 0x3a8dde, 0.4);
        const ax = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([to3([-half, 0]), to3([half, 0]), to3([0, -half]), to3([0, half])]),
          new THREE.LineBasicMaterial({ color: 0x9ccfff, transparent: true, opacity: 0.7, depthTest: false }));
        ax.renderOrder = 2;
        this.sketchGroup.add(ax);
      }
      for (const shp of sk.shapes) {
        const pts = outline(shp);
        if (pts.length < 2) continue;
        const closed = shp.kind !== "poly" || shp.closed !== false || !sk.preview;
        const p3 = pts.map(to3);
        if (closed) p3.push(p3[0]);
        const sel = sk.selected && sk.selected.includes(shp.id);
        let color = shp.hole ? 0xff8a8a : 0x40b0ff;
        if (shp.construction) color = 0x8892a0;
        if (sel) color = 0xffb020;
        if (!sk.active) color = shp.hole ? 0xc06060 : 0x3a7ab8;
        if (shp.preview) color = 0xffd060;
        const geo = new THREE.BufferGeometry().setFromPoints(p3);
        const mat = shp.construction || shp.preview
          ? new THREE.LineDashedMaterial({ color, dashSize: s * 0.012, gapSize: s * 0.008, depthTest: !sk.active, transparent: true })
          : new THREE.LineBasicMaterial({ color, depthTest: !sk.active, transparent: true });
        const line = new THREE.Line(geo, mat);
        if (mat.isLineDashedMaterial) line.computeLineDistances();
        line.renderOrder = 3;
        this.sketchGroup.add(line);
      }
      if (sk.snap) {
        const p = to3(sk.snap.p);
        const m = new THREE.Mesh(new THREE.SphereGeometry(s * 0.006 * (sk.snap.kind === "point" ? 1.6 : 1), 10, 8), new THREE.MeshBasicMaterial({ color: sk.snap.kind === "point" ? 0xffd000 : 0xffffff, depthTest: false }));
        m.position.copy(p);
        m.renderOrder = 4;
        this.sketchGroup.add(m);
      }
    }
  }

  // ---------- overlays (measure markers) ----------
  setMarkers(points, lines) {
    for (const ch of [...this.overlayGroup.children]) { this.overlayGroup.remove(ch); ch.geometry?.dispose(); ch.material?.dispose(); }
    const s = this.modelBox().isEmpty() ? 100 : this.modelBox().getSize(new THREE.Vector3()).length();
    for (const p of points || []) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s * 0.006, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd000, depthTest: false }));
      m.position.set(...p); m.renderOrder = 6;
      this.overlayGroup.add(m);
    }
    for (const l of lines || []) {
      const g = new THREE.Line(new THREE.BufferGeometry().setFromPoints(l.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0xffd000, depthTest: false }));
      g.renderOrder = 6;
      this.overlayGroup.add(g);
    }
  }

  setLabels(list) {
    this.labels = list || [];
    this.labelLayer.innerHTML = "";
    for (const l of this.labels) {
      const d = document.createElement("div");
      d.className = "lbl " + (l.cls || "");
      d.textContent = l.text;
      l.el = d;
      this.labelLayer.appendChild(d);
    }
    this.updateLabels();
  }

  updateLabels() {
    if (!this.labels.length) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    for (const l of this.labels) {
      if (l.screen) { l.el.style.transform = `translate(${l.screen[0] + 14}px, ${l.screen[1] + 14}px)`; continue; }
      const v = new THREE.Vector3(...l.p).project(this.camera);
      l.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  // ---------- picking ----------
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return this.mouse;
  }
  worldPerPixel(point) {
    const h = this.el.clientHeight || 1;
    if (this.camera === this.ortho) return (this.ortho.top - this.ortho.bottom) / this.ortho.zoom / h;
    const d = this.camera.position.distanceTo(point || this.controls.target);
    return (2 * d * Math.tan((this.persp.fov * Math.PI) / 360)) / h;
  }

  hit(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const meshes = [], lines = [];
    for (const c of this.bodies.values()) if (c.mesh && c.visible) { meshes.push(c.mesh); lines.push(c.lines); }
    const fh = this.raycaster.intersectObjects(meshes, false).filter((h) => this.passSection(h.point));
    const near = fh[0];
    let edgeHit = null;
    if (this.pickMode !== "faces" && this.pickMode !== "face-plane") {
      const ref = near ? near.point : this.controls.target;
      this.raycaster.params.Line.threshold = this.worldPerPixel(ref) * 6;
      const lh = this.raycaster.intersectObjects(lines, false).filter((h) => this.passSection(h.point));
      for (const h of lh) {
        if (near && h.distance > near.distance + this.worldPerPixel(h.point) * 8) continue;
        edgeHit = h; break;
      }
    }
    if (edgeHit) {
      const id = edgeHit.object.userData.bodyId, b = this.bodies.get(id).data;
      const vi = edgeHit.index;
      const ei = b.edges.findIndex((g) => vi >= g.start && vi < g.start + g.count);
      if (ei >= 0) return { kind: "edge", body: id, index: ei, info: b.edges[ei], point: edgeHit.point.toArray() };
    }
    if (near) {
      const id = near.object.userData.bodyId, b = this.bodies.get(id).data;
      const ti = near.faceIndex * 3;
      const fi = b.faces.findIndex((g) => ti >= g.start && ti < g.start + g.count);
      return { kind: "face", body: id, index: fi, info: b.faces[fi], point: near.point.toArray() };
    }
    return null;
  }

  passSection(p) {
    if (!this.section) return true;
    const i = { X: 0, Y: 1, Z: 2 }[this.section.axis];
    return this.section.flip ? p.getComponent(i) >= this.section.offset : p.getComponent(i) <= this.section.offset;
  }

  planePoint(e, pl) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const N = new THREE.Vector3(...pl.n).normalize(), O = new THREE.Vector3(...pl.o);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(N, O);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    const X = new THREE.Vector3(...pl.x).normalize(), Y = new THREE.Vector3().crossVectors(N, X);
    const d = p.clone().sub(O);
    return { uv: [d.dot(X), d.dot(Y)], world: p, wpp: this.worldPerPixel(p) };
  }

  setHover(h) {
    const prev = this.hover;
    this.hover = h;
    if (prev) this.paint(prev.body);
    if (h && (!prev || prev.body !== h.body)) this.paint(h.body);
    if ((prev && prev.kind === "edge") || (h && h.kind === "edge")) this.drawEdgeTubes();
    this.renderer.domElement.style.cursor = h ? "pointer" : "";
  }

  onDown(e) {
    this.downAt = [e.clientX, e.clientY, e.button];
    if (this.pickMode === "sketch" && e.button === 0) this.cb.onSketchDown?.(e);
  }
  onMove(e) {
    if (this.pickMode === "sketch") { this.cb.onSketchMove?.(e); return; }
    if (e.buttons) return;
    const h = this.hit(e);
    let want = h;
    if (h && this.pickMode === "edges" && h.kind !== "edge") want = null;
    if (h && (this.pickMode === "faces" || this.pickMode === "face-plane") && h.kind !== "face") want = null;
    if (h && this.pickMode === "face-plane" && h.info?.t !== "PLANE") want = null;
    if ((!this.pickMode || this.pickMode === "tinker") && h) want = { ...h, kind: "face-none" };
    const key = (x) => (x ? x.kind + x.body + x.index : "");
    if (key(want) !== key(this.hover)) this.setHover(want);
    this.cb.onHoverInfo?.(h);
  }
  onUp(e) {
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]);
    const btn = this.downAt[2];
    this.downAt = null;
    if (this.pickMode === "sketch") { if (btn === 0) this.cb.onSketchUp?.(e, moved); return; }
    if (moved > 5 || btn !== 0) return;
    const h = this.hit(e);
    this.cb.onPick?.(h, e);
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}
