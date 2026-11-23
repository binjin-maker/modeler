#!/usr/bin/env python3
# Builds app/icons/velocity.ico and launcher/rsrc_windows_amd64.syso (exe icon + version info) from PNGs.
# usage: tools/mkicon.py <png dir containing icon-<size>.png>
import struct, sys, os

SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "app", "icons")
pngs = [(s, open(os.path.join(src, f"icon-{s}.png"), "rb").read()) for s in SIZES if os.path.exists(os.path.join(src, f"icon-{s}.png"))]

# .ico
ico = struct.pack("<HHH", 0, 1, len(pngs))
off = 6 + 16 * len(pngs)
body = b""
for s, d in pngs:
    ico += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(d), off + len(body))
    body += d
open(os.path.join(root, "app", "icons", "velocity.ico"), "wb").write(ico + body)

# version info (VS_VERSIONINFO)
def vs_block(key, value=b"", children=b"", text=False):
    k = (key + "\0").encode("utf-16le")
    hdr_len = 6 + len(k)
    pad1 = (4 - hdr_len % 4) % 4
    v = value
    vlen = len(value) // 2 if text else len(value)
    blk = k + b"\0" * pad1 + v
    blk += b"\0" * ((4 - (6 + len(blk)) % 4) % 4)
    blk += children
    out = struct.pack("<HHH", 6 + len(blk), vlen, 1 if text else 0) + blk
    return out + b"\0" * ((4 - len(out) % 4) % 4)

def s(key, val):
    return vs_block(key, (val + "\0").encode("utf-16le"), text=True)

ver = (1, 0, 0, 0)
fixed = struct.pack("<13I", 0xFEEF04BD, 0x00010000, (ver[0] << 16) | ver[1], (ver[2] << 16) | ver[3], (ver[0] << 16) | ver[1], (ver[2] << 16) | ver[3], 0x3F, 0, 0x40004, 1, 0, 0, 0)
strings = b"".join(s(k, v) for k, v in [
    ("CompanyName", "binjin-maker"), ("FileDescription", "Velocity"), ("FileVersion", "1.0.0.0"),
    ("InternalName", "Velocity"), ("OriginalFilename", "Velocity.exe"), ("ProductName", "Velocity"), ("ProductVersion", "1.0.0.0")])
sfi = vs_block("StringFileInfo", children=vs_block("040904B0", children=strings), text=True)
vfi = vs_block("VarFileInfo", children=vs_block("Translation", struct.pack("<HH", 0x0409, 0x04B0)), text=True)
versioninfo = vs_block("VS_VERSION_INFO", fixed, sfi + vfi)

manifest = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
<assemblyIdentity type="win32" name="Velocity" version="1.0.0.0"/>
<application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware></windowsSettings></application>
</assembly>'''

# resources: (type, id, data)
RT_ICON, RT_GROUP_ICON, RT_VERSION, RT_MANIFEST = 3, 14, 16, 24
res = []
grp = struct.pack("<HHH", 0, 1, len(pngs))
for i, (sz, d) in enumerate(pngs, 1):
    res.append((RT_ICON, i, d))
    grp += struct.pack("<BBBBHHIH", sz % 256, sz % 256, 0, 0, 1, 32, len(d), i)
res.append((RT_GROUP_ICON, 1, grp))
res.append((RT_VERSION, 1, versioninfo))
res.append((RT_MANIFEST, 1, manifest))

types = sorted({t for t, _, _ in res})
by_type = {t: sorted([(i, d) for tt, i, d in res if tt == t]) for t in types}

# layout: root dir, type dirs, name dirs (each -> lang dir), lang dirs, data entries, data
def dir_size(n): return 16 + 8 * n
pos = dir_size(len(types))
type_off = {}
for t in types:
    type_off[t] = pos; pos += dir_size(len(by_type[t]))
lang_off = {}
for t in types:
    for i, _ in by_type[t]:
        lang_off[(t, i)] = pos; pos += dir_size(1)
entry_off = {}
for t in types:
    for i, _ in by_type[t]:
        entry_off[(t, i)] = pos; pos += 16
data_off = {}
for t in types:
    for i, d in by_type[t]:
        pos = (pos + 7) & ~7
        data_off[(t, i)] = pos; pos += len(d)
size = (pos + 7) & ~7

sec = bytearray(size)
def put_dir(at, entries):
    struct.pack_into("<IIHHHH", sec, at, 0, 0, 0, 0, 0, len(entries))
    for k, (ident, target, is_dir) in enumerate(entries):
        struct.pack_into("<II", sec, at + 16 + 8 * k, ident, target | (0x80000000 if is_dir else 0))
put_dir(0, [(t, type_off[t], True) for t in types])
relocs = []
for t in types:
    put_dir(type_off[t], [(i, lang_off[(t, i)], True) for i, _ in by_type[t]])
    for i, d in by_type[t]:
        put_dir(lang_off[(t, i)], [(0x0409, entry_off[(t, i)], False)])
        struct.pack_into("<IIII", sec, entry_off[(t, i)], data_off[(t, i)], len(d), 0, 0)
        relocs.append(entry_off[(t, i)])
        sec[data_off[(t, i)]:data_off[(t, i)] + len(d)] = d

# COFF object
hdr_size, sh_size = 20, 40
raw_ptr = hdr_size + sh_size
rel_ptr = raw_ptr + size
sym_ptr = rel_ptr + 10 * len(relocs)
coff = struct.pack("<HHIIIHH", 0x8664, 1, 0, sym_ptr, 1, 0, 0)
coff += struct.pack("<8sIIIIIIHHI", b".rsrc\0\0\0", 0, 0, size, raw_ptr, rel_ptr, 0, len(relocs), 0, 0x40000040)
coff += bytes(sec)
for r in relocs:
    coff += struct.pack("<IIH", r, 0, 3)  # IMAGE_REL_AMD64_ADDR32NB against symbol 0
coff += struct.pack("<8sIhHBB", b".rsrc\0\0\0", 0, 1, 0, 3, 0)
coff += struct.pack("<I", 4)
open(os.path.join(root, "launcher", "rsrc_windows_amd64.syso"), "wb").write(coff)
print(f"icon: {len(pngs)} sizes, syso {len(coff)} bytes")
