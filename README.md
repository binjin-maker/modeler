# Velocity

A parametric 3D CAD program, like Onshape but easier. You sketch, extrude, fillet, shell, pattern, and export for 3D printing, and the app **updates itself from this repo within seconds of every push**.

Built on **OpenCascade** (a real B-rep CAD kernel, via replicad), so you get exact solids, real fillets, and STEP export.

## Install (Windows)
1. Download [`dist/Velocity.ex_`](dist/Velocity.ex_).
2. Rename it to **`Velocity.exe`**.
3. Run it. The first launch downloads about 24 MB, then it opens in its own window.

It needs Microsoft Edge or Chrome, which every Windows 10/11 PC already has.

## Features
- **Sketching**: rectangles (with rounded corners), circles, polygons, slots, ellipses, polylines. Grid and point snapping, live dimensions, exact numeric editing, automatic holes, construction shapes, sketching on any flat face, and offset planes.
- **Solid features**: Extrude (distance, symmetric, through all, taper, twist), Cut, Revolve, Loft, Box, Cylinder, Sphere, Cone, Torus.
- **Modify**: Fillet and Chamfer (click edges, or quick-pick all / vertical / top / bottom), Shell, Draft.
- **Copy**: Linear and grid patterns, circular patterns, and mirror, for either features or whole parts.
- **Multi-part**: Move / Rotate / Copy, Scale, Combine (join / subtract / intersect), Split, Delete, plus STEP and STL import.
- **Parametric history**: edit any feature, suppress it, roll back, reorder, duplicate. Unlimited undo / redo.
- **Variables and math in every number box**: `width/2 + wall`, `sqrt(2)*10`, `2*inch`.
- **Tinker mode**: Tinkercad-style. Drop in boxes, cylinders, spheres, cones, pyramids, wedges, tubes, tori, domes, prisms, and stars. Drag to move, pull handles to resize, lift, or rotate. Turn shapes into holes, group/ungroup, align. The result is one feature you can keep editing in Pro.
- **Casting**: makes any part castable. It adds a basin, a tapered sprue and well, a center-fed runner, even gates, risers on the thick spots, vents, and a shrink allowance, and can build two-part molds with keys. It checks 13 metals and materials against your mold type and heat source (✓ / risky / ✕ with reasons) and gives you a pour plan (temperature, weights, crucible size, pour time).
- **Inspect**: measure distance, length, area, angle, and gap; section view; volume, surface area, and mass for 10 materials.
- **Export**: 3MF, STL, STEP, OBJ, PNG, plus **Send to Bambu Studio** with one click.
- Autosave, a dark or light theme, 5 example projects, and a full in-app guide (F1).

📖 **Full guide: [app/guide.md](app/guide.md)** (also built into the app; press F1)

## How fast updates work
`Velocity.exe` is a small launcher. It serves the app from a local cache and polls this repo's `main` branch every 10 seconds using conditional ETag requests. "Nothing changed" responses are free and don't count against GitHub's rate limit. When a new commit lands, it downloads only the files that changed (each one hash-checked against git) and swaps the folder atomically. Then it pushes an event to the open window, which reloads in place with your model, selection, and camera kept. The launcher also updates itself when `dist/launcher-version.txt` goes up.

## Repo layout
| Path | What |
|---|---|
| `app/` | The app (plain ES modules, no build step). This is what gets auto-updated. |
| `app/js/` | UI, viewport, sketcher, features, I/O |
| `app/worker/` | Geometry worker plus the bundled OpenCascade kernel |
| `launcher/` | Go source for `Velocity.exe` |
| `dist/` | Prebuilt launcher `Velocity.ex_` (`.ex_` so it downloads cleanly). `Modeler.ex_` is the same file, kept so older installs auto-upgrade. |
| `app/icons/` | App and exe icons (`tools/mkicon.py` builds the `.ico` + exe resource) |
| `build.sh` | `./build.sh launcher`, `./build.sh icon`, or `./build.sh kernel` |

To run in a browser without the launcher: `cd app && python -m http.server`, then open http://localhost:8000.

