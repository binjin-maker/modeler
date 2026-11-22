// Number fields accept math + variables, e.g. "width/2 + 3" or "sqrt(2)*10".
const FN = {
  sin: (d) => Math.sin((d * Math.PI) / 180), cos: (d) => Math.cos((d * Math.PI) / 180), tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (v) => (Math.asin(v) * 180) / Math.PI, acos: (v) => (Math.acos(v) * 180) / Math.PI, atan: (v) => (Math.atan(v) * 180) / Math.PI,
  sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  pi: Math.PI, PI: Math.PI, inch: 25.4, mm: 1,
};
const cache = new Map();

export function evalExpr(src, vars) {
  if (typeof src === "number") return src;
  if (src === undefined || src === null || src === "") throw new Error("empty");
  const s = String(src).trim();
  if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return parseFloat(s);
  if (!/^[\w\s+\-*/%().,^]*$/.test(s)) throw new Error("bad characters");
  const names = Object.keys(vars);
  const key = names.join(",") + "|" + s;
  let fn = cache.get(key);
  if (!fn) {
    const body = s.replace(/\^/g, "**");
    const ids = body.match(/[A-Za-z_]\w*/g) || [];
    for (const id of ids) if (!(id in vars) && !(id in FN)) throw new Error(`unknown name "${id}"`);
    fn = new Function("__v", "__f", `with(__f){with(__v){return (${body});}}`);
    cache.set(key, fn);
  }
  const v = fn(vars, FN);
  if (typeof v !== "number" || !isFinite(v)) throw new Error("not a number");
  return v;
}

export function evalVariables(list) {
  const vars = {}, errors = {};
  for (const v of list || []) {
    if (!/^[A-Za-z_]\w*$/.test(v.name || "")) { errors[v.name] = "Name must be letters/numbers/_"; continue; }
    try { vars[v.name] = evalExpr(v.expr, vars); }
    catch (e) { errors[v.name] = e.message; }
  }
  return { vars, errors };
}

export function fmt(n, d = 3) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  return String(+n.toFixed(d));
}
