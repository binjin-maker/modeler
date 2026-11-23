// Example projects, built from plain feature lists.
let n = 0;
const id = () => "ex" + (++n).toString(36) + Math.random().toString(36).slice(2, 5);
const F = (type, name, params) => ({ id: id(), type, name, params });
const proj = (name, features, extra = {}) => ({ version: 1, name, units: "mm", material: "PLA", variables: [], features, parts: {}, rollback: null, ...extra });

export const EXAMPLES = [
  {
    name: "Tinker: keychain tag",
    desc: "Tinker mode — a rounded plate, a star on top, and a hole grouped in for the key ring.",
    mode: "tinker",
    build() {
      const o = (kind, extra) => ({ id: id(), kind, name: kind[0].toUpperCase() + kind.slice(1), x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, hole: false, ...extra });
      const plate = o("box", { name: "Plate", w: 50, d: 30, h: 4, r: 6 });
      const ring = o("cylinder", { name: "Key hole", x: -17, w: 7, d: 7, h: 4, hole: true });
      const tag = { id: id(), kind: "group", name: "Tag", children: [plate, ring], tx: 0, ty: 0, tz: 0, rz: 0, px: 0, py: 0, hole: false };
      const star = o("star", { name: "Star", x: 8, w: 22, d: 22, h: 3, z: 4, sides: 5, inner: 0.45 });
      const t = F("tinker", "Tinker scene", { objects: [tag, star] });
      return proj("Keychain tag", [t], { parts: { ["t" + tag.id]: { color: "#3fa7e8", visible: true }, ["t" + star.id]: { color: "#f2d531", visible: true } } });
    },
  },
  {
    name: "Cast aluminum flange",
    desc: "Casting — sand-cast flange with auto sprue, runner, gates, riser and vents, plus the metal check.",
    build() {
      const base = F("cylinder", "Flange", { dia: 90, h: 12, x: 0, y: 0, z: 0, axis: "Z", op: "new", target: "auto" });
      const boss = F("cone", "Boss", { d1: 50, d2: 44, h: 28, x: 0, y: 0, z: 0, op: "add", target: "auto" });
      const bore = F("cylinder", "Bore", { dia: 24, h: 100, x: 0, y: 0, z: -10, axis: "Z", op: "cut", target: "auto" });
      const c = F("casting", "Casting", { body: "last", process: "sand", metal: "aluminum", furnace: 1100, autoParting: true, parting: 0, head: 0, gates: 0, risers: true, vents: true, shrink: true, mold: false, wall: 15 });
      return proj("Cast flange", [base, boss, bore, c], { material: "Aluminum" });
    },
  },
  {
    name: "Storage box",
    desc: "Sketch → Extrude → Fillet → Shell. Uses variables so you can resize it.",
    build() {
      const sk = F("sketch", "Base outline", { planeName: "Top", offset: 0, shapes: [{ id: "s1", kind: "rect", x: 0, y: 0, w: "length", h: "width", r: 8, a: 0, hole: false }] });
      const ex = F("extrude", "Body", { sketch: sk.id, dist: "height", mode: "one", flip: false, op: "new", target: "auto", taper: 1, twist: 0 });
      const fi = F("fillet", "Round bottom", { radius: 3, sel: "bottom", edges: [], body: "last" });
      const sh = F("shell", "Hollow", { thickness: "wall", faces: [{ body: ex.id, p: [0, 0, 40], n: [0, 0, 1] }], outward: false });
      return proj("Storage box", [sk, ex, fi, sh], {
        variables: [{ name: "length", expr: "80" }, { name: "width", expr: "60" }, { name: "height", expr: "40" }, { name: "wall", expr: "2" }],
      });
    },
  },
  {
    name: "Flange with bolt holes",
    desc: "Cylinders, a cut, a circular pattern of holes, and a chamfer.",
    build() {
      const base = F("cylinder", "Flange", { dia: 90, h: 10, x: 0, y: 0, z: 0, axis: "Z", op: "new", target: "auto" });
      const boss = F("cylinder", "Boss", { dia: 44, h: 30, x: 0, y: 0, z: 0, axis: "Z", op: "add", target: "auto" });
      const sk = F("sketch", "Bolt hole", { planeName: "Top", offset: 0, shapes: [{ id: "h1", kind: "circle", x: "bolt_circle/2", y: 0, d: 8, hole: false }] });
      const cut = F("extrude", "Cut hole", { sketch: sk.id, dist: 10, mode: "through2", flip: false, op: "cut", target: "auto", taper: 1, twist: 0 });
      const pat = F("pattern_circular", "Bolt pattern", { ref: cut.id, axis: "Z", cx: 0, cy: 0, cz: 0, count: "bolts", angle: 360, merge: true });
      const bore = F("cylinder", "Bore", { dia: 24, h: 100, x: 0, y: 0, z: -10, axis: "Z", op: "cut", target: "auto" });
      const ch = F("chamfer", "Edge break", { dist: 1, sel: "top", edges: [], body: "last" });
      return proj("Flange", [base, boss, sk, cut, pat, bore, ch], { variables: [{ name: "bolt_circle", expr: "70" }, { name: "bolts", expr: "6" }], material: "Aluminum" });
    },
  },
  {
    name: "Wall bracket",
    desc: "Polyline sketch on the Front plane, symmetric extrude, mirrored holes.",
    build() {
      const sk = F("sketch", "L profile", { planeName: "Front", offset: 0, shapes: [{ id: "p1", kind: "poly", pts: [[0, 0], [60, 0], [60, 6], [6, 6], [6, 50], [0, 50]], hole: false }] });
      const ex = F("extrude", "Bracket", { sketch: sk.id, dist: 30, mode: "sym", flip: false, op: "new", target: "auto", taper: 1, twist: 0 });
      const h1 = F("cylinder", "Base hole", { dia: 5, h: 20, x: 40, y: 8, z: -5, axis: "Z", op: "cut", target: "auto" });
      const m1 = F("mirror", "Mirror hole", { ref: h1.id, plane: "XZ", offset: 0, merge: true });
      const h2 = F("cylinder", "Wall hole", { dia: 5, h: 20, x: -5, y: 8, z: 35, axis: "X", op: "cut", target: "auto" });
      const m2 = F("mirror", "Mirror hole 2", { ref: h2.id, plane: "XZ", offset: 0, merge: true });
      const fi = F("fillet", "Inside corner", { radius: 4, sel: "picked", edges: [{ body: ex.id, p: [6, 0, 6] }], body: "last" });
      return proj("Wall bracket", [sk, ex, h1, m1, h2, m2, fi]);
    },
  },
  {
    name: "Vase",
    desc: "Revolve a profile around an axis, then shell it with an open top.",
    build() {
      const sk = F("sketch", "Profile", { planeName: "Front", offset: 0, shapes: [{ id: "p1", kind: "poly", pts: [[0, 0], [30, 0], [38, 40], [24, 90], [28, 120], [0, 120]], hole: false }] });
      const rv = F("revolve", "Revolve", { sketch: sk.id, axis: "sy", angle: 360, op: "new", target: "auto" });
      const sh = F("shell", "Hollow", { thickness: 2, faces: [{ body: rv.id, p: [0, 0, 120], n: [0, 0, 1] }], outward: false });
      return proj("Vase", [sk, rv, sh]);
    },
  },
  {
    name: "Knob",
    desc: "Polygon grip, extrude with taper, sphere cap, D-shaft hole.",
    build() {
      const sk = F("sketch", "Grip", { planeName: "Top", offset: 0, shapes: [{ id: "g", kind: "polygon", x: 0, y: 0, r: 20, n: 12, a: 0, hole: false }] });
      const ex = F("extrude", "Grip body", { sketch: sk.id, dist: 18, mode: "one", flip: false, op: "new", target: "auto", taper: 0.85, twist: 0 });
      const cap = F("sphere", "Dome", { dia: 34, x: 0, y: 0, z: 10, op: "add", target: "auto" });
      const trim = F("box", "Trim bottom", { w: 80, d: 80, h: 30, x: 0, y: 0, z: -30, centered: true, op: "cut", target: "auto" });
      const sk2 = F("sketch", "Shaft", { planeName: "Top", offset: 0, shapes: [{ id: "c", kind: "circle", x: 0, y: 0, d: 6.2, hole: false }, { id: "f", kind: "rect", x: 0, y: 2.6, w: 8, h: 1.6, r: 0, a: 0, hole: true }] });
      const cut = F("extrude", "Shaft hole", { sketch: sk2.id, dist: 12, mode: "one", flip: false, op: "cut", target: "auto", taper: 1, twist: 0 });
      return proj("Knob", [sk, ex, cap, trim, sk2, cut]);
    },
  },
];
