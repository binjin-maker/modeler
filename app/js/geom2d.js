// Shared 2D sketch geometry. Used by the viewport (display) and the worker (solid building).
export const SHAPE_KINDS = {
  rect: { label: "Rectangle", fields: ["x", "y", "w", "h", "r", "a"] },
  circle: { label: "Circle", fields: ["x", "y", "d"] },
  polygon: { label: "Polygon", fields: ["x", "y", "r", "n", "a"] },
  slot: { label: "Slot", fields: ["x1", "y1", "x2", "y2", "w"] },
  ellipse: { label: "Ellipse", fields: ["x", "y", "rx", "ry", "a"] },
  poly: { label: "Polyline", fields: [] },
};

export const FIELD_LABELS = {
  x: "Center X", y: "Center Y", w: "Width", h: "Height", r: "Radius", a: "Angle°",
  d: "Diameter", n: "Sides", x1: "Start X", y1: "Start Y", x2: "End X", y2: "End Y",
  rx: "Radius X", ry: "Radius Y",
};

const D2R = Math.PI / 180;
const rot = (p, a, cx = 0, cy = 0) => {
  if (!a) return [p[0] + cx, p[1] + cy];
  const c = Math.cos(a * D2R), s = Math.sin(a * D2R);
  return [p[0] * c - p[1] * s + cx, p[0] * s + p[1] * c + cy];
};

export function polygonPoints(s) {
  const n = Math.max(3, Math.round(s.n));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + Math.PI / 2;
    pts.push(rot([Math.cos(t) * s.r, Math.sin(t) * s.r], s.a, s.x, s.y));
  }
  return pts;
}

function arcPts(cx, cy, r, a0, a1, seg) {
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const t = a0 + (a1 - a0) * (i / seg);
    out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return out;
}

// Closed outline as a list of points (for display / hit testing)
export function outline(s) {
  switch (s.kind) {
    case "rect": {
      const hw = s.w / 2, hh = s.h / 2;
      const r = Math.max(0, Math.min(s.r || 0, hw - 1e-3, hh - 1e-3));
      let pts;
      if (r > 0) {
        pts = [
          ...arcPts(hw - r, hh - r, r, 0, Math.PI / 2, 8),
          ...arcPts(-hw + r, hh - r, r, Math.PI / 2, Math.PI, 8),
          ...arcPts(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, 8),
          ...arcPts(hw - r, -hh + r, r, Math.PI * 1.5, Math.PI * 2, 8),
        ];
      } else pts = [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
      return pts.map((p) => rot(p, s.a, s.x, s.y));
    }
    case "circle":
      return arcPts(s.x, s.y, s.d / 2, 0, Math.PI * 2, 72).slice(0, -1);
    case "polygon":
      return polygonPoints(s);
    case "ellipse": {
      const pts = [];
      for (let i = 0; i < 72; i++) {
        const t = (i / 72) * Math.PI * 2;
        pts.push(rot([Math.cos(t) * s.rx, Math.sin(t) * s.ry], s.a, s.x, s.y));
      }
      return pts;
    }
    case "slot": {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const ang = Math.atan2(dy, dx), r = s.w / 2;
      return [
        ...arcPts(s.x2, s.y2, r, ang - Math.PI / 2, ang + Math.PI / 2, 16),
        ...arcPts(s.x1, s.y1, r, ang + Math.PI / 2, ang + Math.PI * 1.5, 16),
      ];
    }
    case "poly":
      return s.pts.map((p) => [p[0], p[1]]);
  }
  return [];
}

// Snap/handle points for a shape
export function keyPoints(s) {
  switch (s.kind) {
    case "rect": {
      const hw = s.w / 2, hh = s.h / 2;
      return [[0, 0], [hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh], [hw, 0], [-hw, 0], [0, hh], [0, -hh]].map((p) => rot(p, s.a, s.x, s.y));
    }
    case "circle":
      return [[s.x, s.y], [s.x + s.d / 2, s.y], [s.x - s.d / 2, s.y], [s.x, s.y + s.d / 2], [s.x, s.y - s.d / 2]];
    case "polygon":
      return [[s.x, s.y], ...polygonPoints(s)];
    case "ellipse":
      return [[s.x, s.y], rot([s.rx, 0], s.a, s.x, s.y), rot([0, s.ry], s.a, s.x, s.y)];
    case "slot":
      return [[s.x1, s.y1], [s.x2, s.y2], [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]];
    case "poly":
      return s.pts;
  }
  return [];
}

export function translateShape(s, dx, dy) {
  const t = structuredClone(s);
  if (t.kind === "slot") { t.x1 += dx; t.y1 += dy; t.x2 += dx; t.y2 += dy; }
  else if (t.kind === "poly") t.pts = t.pts.map((p) => [p[0] + dx, p[1] + dy]);
  else { t.x += dx; t.y += dy; }
  return t;
}

export function distToOutline(s, p) {
  const pts = outline(s);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    best = Math.min(best, segDist(p, a, b));
  }
  return best;
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function shapeSummary(s) {
  const f = (v) => +(+v).toFixed(2);
  switch (s.kind) {
    case "rect": return `${f(s.w)} × ${f(s.h)}`;
    case "circle": return `Ø${f(s.d)}`;
    case "polygon": return `${Math.round(s.n)}-gon R${f(s.r)}`;
    case "ellipse": return `${f(s.rx * 2)} × ${f(s.ry * 2)}`;
    case "slot": return `L${f(Math.hypot(s.x2 - s.x1, s.y2 - s.y1))} W${f(s.w)}`;
    case "poly": return `${s.pts.length} points`;
  }
  return "";
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
