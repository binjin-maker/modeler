# DOOG Modeler

A parametric 3D CAD program, like Onshape but easier. You sketch, extrude, fillet, shell, pattern, and export for 3D printing, and the app **updates itself from this repo within seconds of every push**.

Built on **OpenCascade** (a real B-rep CAD kernel, via replicad), so you get exact solids, real fillets, and STEP export.

## Install (Windows)
1. Download [`dist/Modeler.ex_`](dist/Modeler.ex_).
2. Rename it to **`Modeler.exe`**.
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
- **Inspect**: measure distance, length, area, angle, and gap; section view; volume, surface area, and mass for 10 materials.
- **Export**: 3MF, STL, STEP, OBJ, PNG, plus **Send to Bambu Studio** with one click.
- Autosave, a dark or light theme, 5 example projects, and a full in-app guide (F1).

📖 **Full guide: [app/guide.md](app/guide.md)** (also built into the app; press F1)

## How fast updates work
`Modeler.exe` is a small launcher. It serves the app from a local cache and polls this repo's `main` branch every 10 seconds using conditional ETag requests. "Nothing changed" responses are free and don't count against GitHub's rate limit. When a new commit lands, it downloads only the files that changed (each one hash-checked against git) and swaps the folder atomically. Then it pushes an event to the open window, which reloads in place with your model, selection, and camera kept. The launcher also updates itself when `dist/launcher-version.txt` goes up.

## Repo layout
| Path | What |
|---|---|
| `app/` | The app (plain ES modules, no build step). This is what gets auto-updated. |
| `app/js/` | UI, viewport, sketcher, features, I/O |
| `app/worker/` | Geometry worker plus the bundled OpenCascade kernel |
| `launcher/` | Go source for `Modeler.exe` |
| `dist/` | Prebuilt launcher (`.ex_`, so it downloads cleanly) |
| `build.sh` | `./build.sh launcher` or `./build.sh kernel` |

To run in a browser without the launcher: `cd app && python -m http.server`, then open http://localhost:8000.

---
DOOG unincorporated
