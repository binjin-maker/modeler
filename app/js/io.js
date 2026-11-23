// Storage + export. Uses the desktop launcher API when present, else falls back to the browser.
const H = { "X-Modeler": "1" };
export const io = {
  desktop: false,
  version: "dev",
  async init() {
    try {
      const r = await fetch("/api/ping", { headers: H });
      if (r.ok) { const j = await r.json(); this.desktop = true; this.version = j.version || "?"; this.launcher = j.launcher; this.info = j; }
    } catch {}
    return this.desktop;
  },
  async list() {
    if (this.desktop) return (await fetch("/api/projects", { headers: H })).json();
    const idx = JSON.parse(localStorage.getItem("dm.index") || "[]");
    return idx;
  },
  async load(name) {
    if (this.desktop) {
      const r = await fetch("/api/project?name=" + encodeURIComponent(name), { headers: H });
      if (!r.ok) throw new Error("Couldn't open " + name);
      return r.json();
    }
    const s = localStorage.getItem("dm.p." + name);
    if (!s) throw new Error("Not found");
    return JSON.parse(s);
  },
  async save(name, data) {
    const body = JSON.stringify(data);
    if (this.desktop) {
      const r = await fetch("/api/project?name=" + encodeURIComponent(name), { method: "POST", headers: H, body });
      if (!r.ok) throw new Error(await r.text());
      return;
    }
    localStorage.setItem("dm.p." + name, body);
    const idx = JSON.parse(localStorage.getItem("dm.index") || "[]").filter((x) => x.name !== name);
    idx.unshift({ name, modified: Date.now() });
    localStorage.setItem("dm.index", JSON.stringify(idx));
  },
  async remove(name) {
    if (this.desktop) { await fetch("/api/project?name=" + encodeURIComponent(name), { method: "DELETE", headers: H }); return; }
    localStorage.removeItem("dm.p." + name);
    localStorage.setItem("dm.index", JSON.stringify(JSON.parse(localStorage.getItem("dm.index") || "[]").filter((x) => x.name !== name)));
  },
  autosave(data) {
    const s = JSON.stringify(data);
    try { localStorage.setItem("dm.autosave", s); } catch {}
    if (this.desktop) fetch("/api/autosave", { method: "POST", headers: H, body: s }).catch(() => {});
  },
  async loadAutosave() {
    if (this.desktop) {
      try { const r = await fetch("/api/autosave", { headers: H }); if (r.ok) return await r.json(); } catch {}
    }
    try { return JSON.parse(localStorage.getItem("dm.autosave")); } catch { return null; }
  },
  // returns {path} on desktop, or triggers a download
  async exportFile(filename, data) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    if (this.desktop) {
      const r = await fetch("/api/export?name=" + encodeURIComponent(filename), { method: "POST", headers: H, body: blob });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return null;
  },
  async openPath(path, app) {
    if (!this.desktop) return;
    const r = await fetch("/api/open?path=" + encodeURIComponent(path) + (app ? "&app=" + app : ""), { method: "POST", headers: H });
    if (!r.ok) throw new Error(await r.text());
  },
  heartbeat() {
    if (!this.desktop) return;
    const beat = () => fetch("/api/heartbeat", { method: "POST", headers: H }).catch(() => {});
    beat();
    setInterval(beat, 3000);
  },
  listenUpdates(onUpdate, onStatus) {
    if (!this.desktop) return;
    const es = new EventSource("/api/events");
    es.addEventListener("update", (e) => onUpdate(JSON.parse(e.data)));
    es.addEventListener("status", (e) => onStatus?.(JSON.parse(e.data)));
  },
};

// ---------- mesh writers ----------
export function toOBJ(meshes, scale = 1) {
  let out = "# Velocity\n", base = 1;
  for (const m of meshes) {
    out += `o ${m.name.replace(/\s+/g, "_")}\n`;
    const v = m.vertices;
    for (let i = 0; i < v.length; i += 3) out += `v ${v[i] * scale} ${v[i + 1] * scale} ${v[i + 2] * scale}\n`;
    const t = m.triangles;
    for (let i = 0; i < t.length; i += 3) out += `f ${t[i] + base} ${t[i + 1] + base} ${t[i + 2] + base}\n`;
    base += v.length / 3;
  }
  return out;
}

export function to3MF(meshes, scale = 1) {
  const enc = new TextEncoder();
  let objs = "", items = "";
  meshes.forEach((m, k) => {
    const id = k + 1;
    const v = m.vertices, t = m.triangles;
    const vs = [], ts = [];
    for (let i = 0; i < v.length; i += 3) vs.push(`<vertex x="${(v[i] * scale).toFixed(5)}" y="${(v[i + 1] * scale).toFixed(5)}" z="${(v[i + 2] * scale).toFixed(5)}"/>`);
    for (let i = 0; i < t.length; i += 3) ts.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
    objs += `<object id="${id}" name="${esc(m.name)}" type="model"><mesh><vertices>${vs.join("")}</vertices><triangles>${ts.join("")}</triangles></mesh></object>`;
    items += `<item objectid="${id}"/>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Velocity</metadata><resources>${objs}</resources><build>${items}</build></model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipStore([["[Content_Types].xml", enc.encode(types)], ["_rels/.rels", enc.encode(rels)], ["3D/3dmodel.model", enc.encode(model)]]);
}
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

let crcT;
function crc32(b) {
  if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "model/3mf" });
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
