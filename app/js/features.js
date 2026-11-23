// Feature registry: defaults + property-panel layout for each feature type.
import { METALS, PROCESSES, FURNACES } from "./castingdb.js";
const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONS = {
  sketch: ic('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'),
  extrude: ic('<path d="M5 15l7 4 7-4-7-4z"/><path d="M5 15V8l7-4 7 4v7"/><path d="M12 11V4"/>'),
  cut: ic('<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M9 9V4h6v5"/><path d="M9 14h6" stroke-dasharray="2 2"/>'),
  revolve: ic('<path d="M12 3v18"/><path d="M7 7c-3 1-3 9 0 10"/><path d="M17 7c3 1 3 9 0 10"/><path d="M15 5l2 2-2 2"/>'),
  loft: ic('<rect x="4" y="16" width="16" height="4" rx="1"/><circle cx="12" cy="6" r="3"/><path d="M4 16l5-8M20 16l-5-8"/>'),
  box: ic('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  cylinder: ic('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>'),
  sphere: ic('<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/>'),
  cone: ic('<path d="M12 3L5 18"/><path d="M12 3l7 15"/><ellipse cx="12" cy="18" rx="7" ry="3"/>'),
  torus: ic('<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="11.5" rx="3.5" ry="1.6"/>'),
  fillet: ic('<path d="M4 20V10a6 6 0 016-6h10"/><path d="M4 4h4M4 4v4" stroke-dasharray="1.5 2"/>'),
  chamfer: ic('<path d="M4 20V10l6-6h10"/><path d="M4 4h4M4 4v4" stroke-dasharray="1.5 2"/>'),
  shell: ic('<path d="M4 8v11h16V8"/><path d="M7 8v8h10V8"/>'),
  draft: ic('<path d="M6 20l3-16h6l3 16z"/>'),
  pattern_linear: ic('<rect x="3" y="9" width="5" height="6"/><rect x="10" y="9" width="5" height="6" stroke-dasharray="2 1.5"/><rect x="17" y="9" width="4" height="6" stroke-dasharray="2 1.5"/>'),
  pattern_circular: ic('<circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/><circle cx="12" cy="5" r="2"/><circle cx="18" cy="15.5" r="2"/><circle cx="6" cy="15.5" r="2"/>'),
  mirror: ic('<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 17h5z"/><path d="M15 7l5 10h-5z"/>'),
  move: ic('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  scale: ic('<rect x="3" y="11" width="10" height="10"/><path d="M13 11l8-8M15 3h6v6"/>'),
  boolean: ic('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
  split: ic('<path d="M5 5h14v14H5z"/><path d="M3 12h18" stroke-dasharray="2 2"/>'),
  remove: ic('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  import: ic('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>'),
  measure: ic('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
  section: ic('<path d="M4 6l8-3 8 3v12l-8 3-8-3z"/><path d="M2 12h20" /><path d="M12 3v18" stroke-dasharray="2 2"/>'),
  vars: ic('<path d="M7 4c-2 0-2 2-2 4s-2 4-2 4 2 2 2 4 0 4 2 4M17 4c2 0 2 2 2 4s2 4 2 4-2 2-2 4 0 4-2 4"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  undo: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  redo: ic('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>'),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4"/><path d="M12 17h.01"/>'),
  save: ic('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>'),
  open: ic('<path d="M3 7h6l2 2h10v10H3z"/>'),
  newdoc: ic('<path d="M6 3h8l4 4v14H6z"/><path d="M12 11v6M9 14h6"/>'),
  export: ic('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>'),
  printer: ic('<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'),
  eye: ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeoff: ic('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 004.5-1.1"/>'),
  select: ic('<path d="M5 3l14 8-6 2-2 6z"/>'),
  line: ic('<circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="5" r="1.5"/><path d="M6 18L18 6"/>'),
  rect: ic('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  crect: ic('<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M12 11v2M11 12h2"/>'),
  circle: ic('<circle cx="12" cy="12" r="8"/><path d="M12 11v2M11 12h2"/>'),
  polygon: ic('<path d="M12 3l8 6-3 10H7L4 9z"/>'),
  slot: ic('<rect x="3" y="8" width="18" height="8" rx="4"/>'),
  ellipse: ic('<ellipse cx="12" cy="12" rx="9" ry="5.5"/>'),
  check: ic('<path d="M4 12l5 5L20 6"/>'),
  trash: ic('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  fit: ic('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  grid: ic('<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16"/>'),
  cube: ic('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  edges: ic('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/>'),
  wire: ic('<path d="M4 8l8-4 8 4v8l-8 4-8-4z" stroke-dasharray="2 2"/><path d="M12 12v8M12 12l8-4M12 12L4 8" stroke-dasharray="2 2"/>'),
  persp: ic('<path d="M3 6l7 2v8l-7 2zM10 8l11-3v14l-11-3"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
  examples: ic('<path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
  casting: ic('<path d="M3 5h9l-1.5 4H4.5z"/><path d="M10.5 9c1.5 2 2 3.5 2 5"/><path d="M12.5 14v1"/><path d="M6 17h12v4H6z"/><path d="M9 17v-2h2v2"/>'),
  tinker: ic('<rect x="3" y="12" width="8" height="8" rx="1"/><circle cx="17" cy="16" r="4"/><path d="M12 3l4 6H8z"/>'),
  pro: ic('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M3 4h7M3 8h4"/>'),
  wedge: ic('<path d="M4 19h16L4 7z"/>'),
  pyramid: ic('<path d="M12 4l8 15H4z"/><path d="M12 4v15"/>'),
  dome: ic('<path d="M3 18a9 9 0 0118 0z"/>'),
  tube: ic('<ellipse cx="12" cy="6" rx="7" ry="3"/><ellipse cx="12" cy="6" rx="3.5" ry="1.4"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>'),
  prism: ic('<path d="M7 4h10l4 8-4 8H7l-4-8z"/>'),
  star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  group: ic('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4v4M13 17H9v-4" stroke-dasharray="2 2"/>'),
  ungroup: ic('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
  hole: ic('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/>'),
  floor: ic('<path d="M3 20h18"/><path d="M12 4v11M8 11l4 4 4-4"/>'),
  copy: ic('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>'),
};

export const OPS = [["new", "New part"], ["add", "Add (merge)"], ["cut", "Remove (cut)"], ["intersect", "Intersect"]];
const AXIS3 = [["X", "X axis"], ["Y", "Y axis"], ["Z", "Z axis"]];
const opField = { key: "op", label: "Result", type: "seg", options: OPS };
const targetField = { key: "target", label: "Merge scope", type: "body", auto: true, show: (p) => p.op !== "new" };
const posFields = [
  { key: "x", label: "Position X", type: "num" },
  { key: "y", label: "Position Y", type: "num" },
  { key: "z", label: "Position Z", type: "num" },
];

export const FEATURES = {
  sketch: {
    label: "Sketch", hint: "Draw 2D shapes on a plane, then Extrude or Revolve them.",
    defaults: () => ({ planeName: "Top", offset: 0, plane: null, shapes: [] }),
    fields: [],
  },
  extrude: {
    label: "Extrude", hint: "Pull a sketch into 3D.",
    defaults: (c) => ({ sketch: c.lastSketch, dist: 10, mode: "one", flip: false, op: c.hasBodies ? "add" : "new", target: "auto", taper: 1, twist: 0 }),
    fields: [
      { key: "sketch", label: "Sketch", type: "sketch" },
      { key: "mode", label: "Depth", type: "seg", options: [["one", "Distance"], ["sym", "Symmetric"], ["through", "Through all"], ["through2", "Through both"]] },
      { key: "dist", label: "Distance", type: "num", show: (p) => p.mode === "one" || p.mode === "sym" },
      { key: "flip", label: "Flip direction", type: "bool" },
      opField, targetField,
      { key: "taper", label: "End scale (taper)", type: "num", adv: true, tip: "1 = straight. 0.5 = top is half the size." },
      { key: "twist", label: "Twist°", type: "num", adv: true },
    ],
  },
  revolve: {
    label: "Revolve", hint: "Spin a sketch around an axis (lathe).",
    defaults: (c) => ({ sketch: c.lastSketch, axis: "sy", angle: 360, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [
      { key: "sketch", label: "Sketch", type: "sketch" },
      { key: "axis", label: "Axis", type: "select", options: [["sx", "Sketch horizontal axis"], ["sy", "Sketch vertical axis"], ["X", "World X"], ["Y", "World Y"], ["Z", "World Z"]] },
      { key: "angle", label: "Angle°", type: "num" },
      opField, targetField,
    ],
  },
  loft: {
    label: "Loft", hint: "Blend between two sketches on different planes.",
    defaults: (c) => ({ sketchA: c.prevSketch, sketchB: c.lastSketch, ruled: false, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [
      { key: "sketchA", label: "From sketch", type: "sketch" },
      { key: "sketchB", label: "To sketch", type: "sketch" },
      { key: "ruled", label: "Straight sides (ruled)", type: "bool" },
      opField, targetField,
    ],
  },
  box: {
    label: "Box", hint: "A rectangular block.",
    defaults: (c) => ({ w: 40, d: 30, h: 20, x: 0, y: 0, z: 0, centered: true, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [
      { key: "w", label: "Width (X)", type: "num" }, { key: "d", label: "Depth (Y)", type: "num" }, { key: "h", label: "Height (Z)", type: "num" },
      ...posFields, { key: "centered", label: "Centered on X/Y", type: "bool" }, opField, targetField,
    ],
  },
  cylinder: {
    label: "Cylinder", hint: "A round rod or disc.",
    defaults: (c) => ({ dia: 20, h: 30, x: 0, y: 0, z: 0, axis: "Z", op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [{ key: "dia", label: "Diameter", type: "num" }, { key: "h", label: "Height", type: "num" }, { key: "axis", label: "Points along", type: "seg", options: AXIS3 }, ...posFields, opField, targetField],
  },
  sphere: {
    label: "Sphere", hint: "A ball.",
    defaults: (c) => ({ dia: 30, x: 0, y: 0, z: 15, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [{ key: "dia", label: "Diameter", type: "num" }, ...posFields, opField, targetField],
  },
  cone: {
    label: "Cone", hint: "Cone or truncated cone (set top to 0 for a point).",
    defaults: (c) => ({ d1: 30, d2: 0, h: 30, x: 0, y: 0, z: 0, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [{ key: "d1", label: "Bottom diameter", type: "num" }, { key: "d2", label: "Top diameter", type: "num" }, { key: "h", label: "Height", type: "num" }, ...posFields, opField, targetField],
  },
  torus: {
    label: "Torus", hint: "A donut / ring.",
    defaults: (c) => ({ R: 20, r: 5, x: 0, y: 0, z: 5, op: c.hasBodies ? "add" : "new", target: "auto" }),
    fields: [{ key: "R", label: "Ring radius", type: "num" }, { key: "r", label: "Tube radius", type: "num" }, ...posFields, opField, targetField],
  },
  fillet: {
    label: "Fillet", hint: "Round off edges. Click edges in the viewport, or use a quick selection.",
    defaults: () => ({ radius: 2, sel: "picked", edges: [], body: "last" }),
    fields: [
      { key: "radius", label: "Radius", type: "num" },
      { key: "sel", label: "Edges", type: "select", options: [["picked", "Picked edges (click them)"], ["all", "All edges"], ["vertical", "All vertical edges"], ["horizontal", "All horizontal edges"], ["top", "Top edges"], ["bottom", "Bottom edges"]] },
      { key: "edges", label: "Picked", type: "picks", pick: "edges", show: (p) => p.sel === "picked" },
      { key: "body", label: "Part", type: "body", show: (p) => p.sel !== "picked" },
    ],
  },
  chamfer: {
    label: "Chamfer", hint: "Bevel edges at 45°.",
    defaults: () => ({ dist: 1, sel: "picked", edges: [], body: "last" }),
    fields: [
      { key: "dist", label: "Distance", type: "num" },
      { key: "sel", label: "Edges", type: "select", options: [["picked", "Picked edges (click them)"], ["all", "All edges"], ["vertical", "All vertical edges"], ["horizontal", "All horizontal edges"], ["top", "Top edges"], ["bottom", "Bottom edges"]] },
      { key: "edges", label: "Picked", type: "picks", pick: "edges", show: (p) => p.sel === "picked" },
      { key: "body", label: "Part", type: "body", show: (p) => p.sel !== "picked" },
    ],
  },
  shell: {
    label: "Shell", hint: "Hollow a part out. Click the face(s) to open up.",
    defaults: () => ({ thickness: 2, faces: [], outward: false }),
    fields: [
      { key: "thickness", label: "Wall thickness", type: "num" },
      { key: "faces", label: "Open faces", type: "picks", pick: "faces" },
      { key: "outward", label: "Grow walls outward", type: "bool" },
    ],
  },
  draft: {
    label: "Draft", hint: "Tilt faces (for molds / easy printing). Pick side faces.",
    defaults: () => ({ angle: 3, faces: [] }),
    fields: [{ key: "angle", label: "Angle°", type: "num" }, { key: "faces", label: "Faces", type: "picks", pick: "faces" }],
  },
  pattern_linear: {
    label: "Linear Pattern", hint: "Repeat a feature (e.g. a hole) or a part in a row/grid.",
    defaults: (c) => ({ ref: c.lastTool, dir: "X", count: 3, spacing: 20, dir2: "Y", count2: 1, spacing2: 20, merge: true }),
    fields: [
      { key: "ref", label: "Copy", type: "ref" },
      { key: "dir", label: "Direction", type: "seg", options: AXIS3 }, { key: "count", label: "Count", type: "num" }, { key: "spacing", label: "Spacing", type: "num", tip: "Negative flips the direction" },
      { key: "count2", label: "2nd row count", type: "num" },
      { key: "dir2", label: "2nd direction", type: "seg", options: AXIS3, show: (p) => +p.count2 > 1 },
      { key: "spacing2", label: "2nd spacing", type: "num", show: (p) => +p.count2 > 1 },
      { key: "merge", label: "Merge copies into the part", type: "bool", show: (p) => String(p.ref).startsWith("body:") },
    ],
  },
  pattern_circular: {
    label: "Circular Pattern", hint: "Repeat a feature or part around an axis (bolt circles, spokes).",
    defaults: (c) => ({ ref: c.lastTool, axis: "Z", cx: 0, cy: 0, cz: 0, count: 6, angle: 360, merge: true }),
    fields: [
      { key: "ref", label: "Copy", type: "ref" },
      { key: "axis", label: "Axis", type: "seg", options: AXIS3 },
      { key: "count", label: "Count (total)", type: "num" }, { key: "angle", label: "Total angle°", type: "num" },
      { key: "cx", label: "Center X", type: "num" }, { key: "cy", label: "Center Y", type: "num" }, { key: "cz", label: "Center Z", type: "num" },
      { key: "merge", label: "Merge copies into the part", type: "bool", show: (p) => String(p.ref).startsWith("body:") },
    ],
  },
  mirror: {
    label: "Mirror", hint: "Mirror a feature or a whole part across a plane.",
    defaults: (c) => ({ ref: c.lastTool, plane: "YZ", offset: 0, merge: true }),
    fields: [
      { key: "ref", label: "Mirror", type: "ref" },
      { key: "plane", label: "Across plane", type: "seg", options: [["YZ", "YZ (flip X)"], ["XZ", "XZ (flip Y)"], ["XY", "XY (flip Z)"]] },
      { key: "offset", label: "Plane offset", type: "num" },
      { key: "merge", label: "Merge with original", type: "bool", show: (p) => String(p.ref).startsWith("body:") },
    ],
  },
  move: {
    label: "Move / Rotate", hint: "Move, rotate, or copy a part.",
    defaults: () => ({ body: "last", tx: 0, ty: 0, tz: 0, axis: "Z", angle: 0, cx: 0, cy: 0, cz: 0, copy: false }),
    fields: [
      { key: "body", label: "Part", type: "body" },
      { key: "tx", label: "Move X", type: "num" }, { key: "ty", label: "Move Y", type: "num" }, { key: "tz", label: "Move Z", type: "num" },
      { key: "angle", label: "Rotate°", type: "num" }, { key: "axis", label: "Rotate about", type: "seg", options: AXIS3 },
      { key: "cx", label: "Pivot X", type: "num", adv: true }, { key: "cy", label: "Pivot Y", type: "num", adv: true }, { key: "cz", label: "Pivot Z", type: "num", adv: true },
      { key: "copy", label: "Make a copy", type: "bool" },
    ],
  },
  scale: {
    label: "Scale", hint: "Resize a whole part uniformly.",
    defaults: () => ({ body: "last", factor: 2 }),
    fields: [{ key: "body", label: "Part", type: "body" }, { key: "factor", label: "Scale factor", type: "num" }],
  },
  boolean: {
    label: "Combine", hint: "Join, subtract, or intersect two parts.",
    defaults: (c) => ({ target: c.prevBody || "last", tool: "last", op: "cut", keepTool: false }),
    fields: [
      { key: "op", label: "Operation", type: "seg", options: [["add", "Join"], ["cut", "Subtract"], ["intersect", "Intersect"]] },
      { key: "target", label: "Keep part", type: "body" }, { key: "tool", label: "Tool part", type: "body" },
      { key: "keepTool", label: "Keep tool part", type: "bool" },
    ],
  },
  split: {
    label: "Split", hint: "Slice a part in two with a plane (great for printing in halves).",
    defaults: () => ({ body: "last", axis: "Z", offset: 10 }),
    fields: [{ key: "body", label: "Part", type: "body" }, { key: "axis", label: "Plane normal", type: "seg", options: AXIS3 }, { key: "offset", label: "At position", type: "num" }],
  },
  remove: {
    label: "Delete Part", hint: "Remove a part from the model.",
    defaults: () => ({ body: "last" }),
    fields: [{ key: "body", label: "Part", type: "body" }],
  },
  casting: {
    label: "Casting", hint: "Turns a part into a castable pattern: auto sprue, runners, gates, risers & vents, shrink allowance, optional mold halves — and tells you which metals work.",
    defaults: () => ({ body: "last", process: "sand", metal: "aluminum", furnace: 1100, autoParting: true, parting: 0, head: 0, gates: 0, risers: true, vents: true, shrink: true, mold: false, wall: 15 }),
    fields: [
      { key: "body", label: "Part", type: "body" },
      { key: "process", label: "Process", type: "select", options: Object.entries(PROCESSES).map(([k, v]) => [k, v.name]) },
      { key: "metal", label: "Pour", type: "select", options: Object.entries(METALS).map(([k, v]) => [k, `${v.name} (${v.pour} °C)`]) },
      { key: "furnace", label: "Your heat source", type: "select", num: true, options: FURNACES.map(([v, l]) => [v, l]) },
      { key: "mold", label: "Make mold halves", type: "bool", show: (p) => PROCESSES[p.process]?.mold },
      { key: "mold", label: "Split pattern at parting line", type: "bool", show: (p) => PROCESSES[p.process]?.splitPattern },
      { key: "wall", label: "Mold wall", type: "num", show: (p) => PROCESSES[p.process]?.mold && p.mold },
      { key: "autoParting", label: "Auto parting line (widest section)", type: "bool", adv: true },
      { key: "parting", label: "Parting height Z", type: "num", adv: true, show: (p) => !p.autoParting },
      { key: "gates", label: "Gates (0 = auto)", type: "num", adv: true },
      { key: "head", label: "Min. sprue head", type: "num", adv: true, tip: "Height of the sprue above the part. 0 = auto." },
      { key: "risers", label: "Risers (feeders)", type: "bool", adv: true },
      { key: "vents", label: "Vents", type: "bool", adv: true },
      { key: "shrink", label: "Shrinkage allowance", type: "bool", adv: true },
      { key: "report", label: "", type: "report" },
    ],
  },
  tinker: {
    label: "Tinker scene", hint: "Shapes placed in Tinker mode. Switch to Tinker (top bar) to edit them.",
    defaults: () => ({ objects: [] }),
    fields: [],
  },
  import: {
    label: "Import", hint: "Bring in a STEP (or STL) file as a part.",
    defaults: () => ({ fileName: "", data: "", scale: 1, op: "new", target: "auto" }),
    fields: [{ key: "fileName", label: "File", type: "file" }, { key: "scale", label: "Scale", type: "num" }, opField, targetField],
  },
};

export const NUM_FIELDS = {};
for (const [t, def] of Object.entries(FEATURES)) NUM_FIELDS[t] = def.fields.filter((f) => f.type === "num").map((f) => f.key);

export const TOOL_TYPES = new Set(["extrude", "revolve", "loft", "box", "cylinder", "sphere", "cone", "torus", "pattern_linear", "pattern_circular", "mirror", "import"]);

export const PLANES = {
  Top: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
  Front: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] },
  Right: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] },
};

export function planeFor(p) {
  if (p.planeName === "Face" && p.plane) return p.plane;
  const base = PLANES[p.planeName] || PLANES.Top;
  const off = +p.offset || 0;
  return { o: base.n.map((v) => v * off), x: base.x, n: base.n };
}
