# Velocity — Full Guide

Velocity is a parametric 3D CAD program, like Onshape but stripped down so it's quicker to learn. You build a part from a list of **features** (sketch it, extrude it, round the edges, cut some holes). Every feature stays editable. Change a number anywhere and the whole model rebuilds.

Under the hood it runs **OpenCascade**, a real B-rep CAD kernel. Your models are exact solids, not meshes, so fillets come out truly round, STEP exports open in Onshape, Fusion, or SolidWorks, and volume and mass numbers are accurate.

> Press [[F1]] any time to open this guide. Click a heading on the left to jump to it.

---

## Installing and updates

1. Download **`dist/Velocity.ex_`** from the GitHub repo.
2. Rename it to **`Velocity.exe`** and put it wherever you want (Desktop, a tools folder, etc).
3. Double-click it. The first launch downloads the app (about 24 MB, mostly the CAD kernel). After that it starts instantly.

The app opens in its own window (an Edge or Chrome "app window" with no tabs or address bar). Closing that window shuts down the launcher too.

### How auto-update works
- While the app is open, the launcher checks GitHub **every 10 seconds** for a new commit.
- When a new version shows up, it downloads **only the files that changed**, checks each file's hash, and swaps them in.
- The app then reloads itself instantly and **keeps your model, selection, and camera view**. You'll see "Updated to the latest version ✓".
- The launcher updates itself too. That kind of update applies the next time you start it.
- If you're offline, it runs the last version it downloaded.
- To get "Update ready" with a Reload button instead of instant reloads, go to **Settings → Apply app updates instantly** and turn it off.

The version shows in the top-right corner (green dot plus a short commit ID).

### Where your files go
| What | Where |
|---|---|
| Saved projects (`.velocity`) | `Documents\Velocity\` |
| Exports (STL, 3MF, STEP, OBJ, PNG) | `Documents\Velocity\Exports\` |
| Autosave and app cache | `%LOCALAPPDATA%\Velocity\` |

Your work is **autosaved constantly**. If the app closes unexpectedly, you'll find your model as you left it the next time you open it.

---

## The screen

| Area | What it's for |
|---|---|
| **Top bar** | Project name (click to rename), New / Open / Save / Export, Undo / Redo, units (mm or in), Examples, Help, Settings, version |
| **Ribbon** | Every tool, in groups: Sketch, Create, Shapes, Modify, Copy, Parts, Inspect. In sketch mode it switches to drawing tools. |
| **Features** (left) | Your build history, top to bottom. This *is* your model. |
| **Parts** (left, bottom) | Every solid body. Set its color, show or hide it, click to see its size and mass. |
| **Viewport** (center) | The 3D view. View buttons are in the top-right corner. |
| **Properties** (right) | Settings for whatever's selected. Edits show up live. |
| **Status bar** | Rebuild time, warnings, hints, and what's under your mouse |

---

## Moving around the 3D view

| Action | Mouse |
|---|---|
| Orbit (spin) | **Left-drag** |
| Pan (slide) | **Right-drag** |
| Zoom | **Scroll wheel** (zooms toward the cursor) |
| Select or pick | **Left-click** (without dragging) |

The view bar has: **Iso / Top / Front / Right** views, **Zoom to fit**, **Perspective ↔ Orthographic**, **Edges**, **X-ray**, and **Grid**.

Keys: [[0]] iso, [[1]] top, [[2]] front, [[3]] right, [[F]] zoom to fit.

**In sketch mode**, the left mouse button draws. Use **right-drag** to pan, **middle-drag** to orbit, and the wheel to zoom.

---

## The big idea: features

Everything you do is a **feature** in the list on the left. The model gets rebuilt from the top of the list down. That means you can:

- **Click any feature** to change its settings. Everything after it updates.
- **Right-click** (or the ⋯ button) for: Edit, Rename, Suppress, Roll back to here, Duplicate, Move up/down, Delete.
- **Suppress** a feature to skip it without deleting it.
- **Roll back** to insert new features in the middle of the history. Click the orange bar to roll forward again.

If a feature turns **red with a "!"**, it couldn't build (for example, a fillet that's too big). Hover over it to see why. The rest of the model keeps working, and the broken feature just gets skipped until you fix it.

---

## Your first part (2 minutes)

1. Click **Sketch** (or press [[S]]) → choose **Top**.
2. The **Rectangle** tool is already on. Click once for one corner, then click again for the opposite corner.
3. In the right panel, type exact sizes: **Width 60**, **Height 40**.
4. Pick **Circle** ([[C]]). Click in the middle of the rectangle, then click again to set the size. Because it's inside the rectangle, it automatically becomes a **hole** (drawn in red).
5. Click **Finish Sketch** (or press [[Enter]]).
6. Click **Extrude** ([[E]]) and set **Distance 15**.
7. Click **Fillet**, then click the 4 vertical corner edges in the 3D view (they light up yellow). Set **Radius 5** and click **Done**.
8. Click **Export → 3MF** and open the file in Bambu Studio.

Now click **Extrude 1** in the feature list and change the distance. Everything after it updates.

---

## Tinker mode (the easy way)

Click **Tinker** in the top bar for a Tinkercad-style modeler. There are no sketches and no feature list: you just stack and cut simple shapes.

1. Click a shape in the ribbon, such as **Box**, **Cylinder**, **Sphere**, **Cone**, **Pyramid**, **Wedge**, **Tube**, **Torus**, **Dome**, **Prism**, or **Star**. It drops onto the workplane in a free spot.
2. **Drag** a shape to slide it around. It snaps to the **Grid** in the ribbon.
3. With one shape selected, use its handles:
   - **White boxes**: resize (width, depth, height). The opposite side stays put.
   - **Blue cone**: lift the shape up or down.
   - **Orange ring**: rotate in 15° steps (hold Shift for 1° steps).
4. To cut a hole, make a shape a **Hole** (the ribbon's *Add as → Hole*, the **Hole/Solid** button, or [[H]]). Holes show up see-through.
5. To combine shapes, Shift-click several (or [[Ctrl+A]]) and click **Group** ([[Ctrl+G]]). Solids merge, and every hole in the group cuts into them. **Ungroup** ([[Ctrl+Shift+G]]) splits them apart again, and you can group groups.
6. The right panel has exact numbers: size, position, tilt and turn, color, and shape extras like corner radius, sides, wall thickness, star depth, and top size.

| Key | Action |
|---|---|
| Arrows | Nudge one grid step (Shift: ×10) |
| [[PgUp]] / [[PgDn]] | Move up / down |
| [[D]] | Drop to the workplane |
| [[H]] | Toggle hole / solid |
| `[` / `]` | Rotate −15° / +15° (Shift: 1°) |
| [[Ctrl+D]] | Duplicate |
| [[Ctrl+C]] / [[Ctrl+V]] | Copy / paste |
| [[Ctrl+G]] / [[Ctrl+Shift+G]] | Group / ungroup |
| [[Del]] | Delete |

With multiple shapes selected, the right panel also has **Align** (min, center, or max on X, Y, and Z).

**Tinker + Pro:** everything you build in Tinker is saved as a single **Tinker scene** feature. Switch to **Pro** and you can keep going: fillet the edges, shell it, pattern it, run **Casting** on it, or export it. While you're in Tinker mode, any Pro features that come after the scene are hidden until you switch back.

---

## Sketching

A sketch is a set of 2D shapes on a flat plane. Shapes that enclose an area become the **profile** that Extrude, Revolve, and Loft turn into 3D.

### Starting a sketch
- **Sketch** → **Top** (XY, the floor), **Front** (XZ), or **Right** (YZ).
- Or **Pick a flat face on the model** to sketch right on a part. The sketch keeps world-aligned X/Y coordinates.
- Use **Offset** in the sketch panel to lift the sketch plane up or out, for example to draw the top shape of a loft.
- **Move to a face…** moves an existing sketch onto a face.

### Drawing tools
| Tool | Key | How |
|---|---|---|
| Select | [[Esc]] | Click a shape to select it, drag to move it, Shift-click to select several, [[Del]] to delete |
| Line (polyline) | [[L]] | Click points. Click the first point again, double-click, or press [[Enter]] to close the shape |
| Rectangle | [[R]] | Click a corner, then the opposite corner |
| Center Rect | | Click the center, then a corner |
| Circle | [[C]] | Click the center, then a point on the edge |
| Polygon | [[P]] | Click the center, then a corner. Set **Sides** in the ribbon |
| Slot | [[O]] | Click the start, then the end. Set the width in the panel |
| Ellipse | | Click the center, then a corner of its bounding box |

### Snapping
- **Snap** ([[G]]) locks to the grid. Change the **Grid** size in the ribbon.
- Corners, centers, and midpoints of existing shapes, plus the origin, always snap (yellow dot).
- Lines snap horizontal or vertical when you're close.
- The label next to the cursor shows the live size and coordinates.

### Exact numbers
Select a shape (in the panel list or by clicking it) and type into its fields: center X/Y, width, height, corner radius, angle, diameter, and so on. Every field accepts **math and variables**, like `40/2`, `width+5`, or `bolt_circle/2`.

Polylines show a **Points** box with one `x, y` per line. Edit it directly to place points exactly.

### Holes and reference shapes
- Shapes drawn **inside** another shape automatically become **holes** (red).
- Toggle **hole** on any shape in the list. Turn on **Hole: ON** in the ribbon ([[H]]) to force new shapes to be holes.
- **ref** marks a shape as construction geometry. It shows up dashed and grey but isn't used in the solid.
- Overlapping solid shapes **merge** together. Draw a rectangle and a circle overlapping and you get one combined outline.

### Other sketch tricks
- **Duplicate**, **Mirror ↔**, and **Mirror ↕** buttons appear under a selected shape.
- **Ctrl+A** selects all shapes.
- **Look at** turns the view to face the sketch.
- Sketches show in the 3D view until a feature uses them. Click the 👁 icon in the feature list to force one visible or hidden.

---

## Feature reference

### Extrude [[E]]
Pulls a sketch straight out into 3D.
- **Depth**: *Distance*, *Symmetric* (half each way), *Through all* (cuts all the way through the model), or *Through both* (all the way through in both directions).
- **Flip direction** goes the other way.
- **Result**:
  - *New part* makes a separate body.
  - *Add* merges into the part(s) it touches.
  - *Remove* cuts away.
  - *Intersect* keeps only the overlap.
- **Merge scope**: *Auto* affects any part the new shape touches, or pick one specific part.
- *More options*: **End scale (taper)**, where 0.8 makes the far end 80% of the size, and **Twist°** (great for vases and knobs).

### Cut [[X]]
A shortcut for Extrude set to *Remove* + *Through all*. When the sketch is on a face, it cuts *into* the part automatically.

### Revolve [[V]]
Spins a sketch around an axis, like a lathe.
- **Axis**: the sketch's horizontal or vertical axis, or world X / Y / Z.
- **Angle**: 360 gives a full solid. Less gives a partial sweep.
- Tip: sketch on **Front**, keep the profile on one side of the vertical axis (x ≥ 0), then revolve around *Sketch vertical axis*.

### Loft
Blends smoothly from one sketch to another (for example, a circle at the bottom and a square 30 mm higher). Make two sketches on parallel planes using **Offset**. Turn on **Straight sides** for flat faces between the two profiles.

### Box, Cylinder, Sphere, Cone, Torus
Ready-made shapes with size and position fields. You don't need a sketch for these. Each one has a **Result** setting, so a Cylinder set to *Remove* makes a quick hole, and a Box set to *Remove* trims a part flat.
- Box: **Centered on X/Y** puts the center at the position; Z is always the bottom.
- Cylinder: **Points along** X, Y, or Z.
- Cone: set **Top diameter** to 0 for a point.

### Fillet [[Shift+F]]
Rounds edges.
- **Edges → Picked edges**: click edges in the 3D view (they turn yellow). Click again to un-pick. **Clear** removes them all.
- Quick picks: *All edges*, *All vertical edges*, *All horizontal edges*, *Top edges*, *Bottom edges*.
- While you're picking, the view shows the model **before** the fillet so the edges are still there to click. Tick **Preview result** to see the result, or click **Done**.
- Picked edges are remembered by position, so they usually survive later edits to sizes.

### Chamfer
Same as Fillet, but it cuts a flat 45° bevel instead of a round.

### Shell
Hollows a part out, leaving walls of the **thickness** you set. Click the face(s) to **remove** (the opening). The top face is picked for you when you create one. **Grow walls outward** keeps the inside size and builds the walls outward.

### Draft
Tilts side faces by an angle, for molds or for easier removal from a print bed or mold. Pick the faces to tilt.

### Linear Pattern
Repeats something in a row or grid.
- **Copy**: a *feature* (like a hole cut or a boss) or a *whole part*.
  - Patterning a feature repeats its effect: a cut hole becomes a row of holes.
  - Patterning a part copies the solid, either merged into it or as new parts.
- Set **Direction**, **Count**, and **Spacing** (negative goes the other way). Set **2nd row count** above 1 to make a grid.

### Circular Pattern
Repeats around an axis, for bolt circles, spokes, and gear teeth. Set the **Axis**, the **Count** (total, including the original), the **Total angle** (360 for evenly spaced all the way around), and the **Center**.

### Mirror [[M]]
Mirrors a feature or a part across the YZ, XZ, or XY plane (with an optional **offset**). Mirroring a part can merge the copy with the original, which is useful for symmetric parts: model one half, then mirror it.

### Casting
Turns a part into a ready-to-cast **pattern** and tells you which metals your setup can pour. Pick the part, then choose:

- **Process**:
  | Process | Mold survives | Notes |
  |---|---|---|
  | Sand casting | ~1700 °C | Two-part flask (cope and drag). Needs draft and no undercuts. Can split the pattern at the parting line. |
  | Lost-PLA (investment) | ~1200 °C | Print the gated pattern, invest it, burn out the PLA, pour. Any shape works. |
  | Plaster mold | ~1100 °C | Two-part plaster mold, which can be generated for you. Must be bone-dry. |
  | High-temp silicone | ~320 °C | Two-part mold, which can be generated. Flexes, so small undercuts are OK. |
  | 3D-printed mold | ~90 °C | Print the mold halves directly. Field's metal, resin, and similar only. |
- **Pour**: the metal or material you plan to use. All the sizing is based on it.
- **Your heat source**: hot water, stove/torch, small propane furnace, big furnace, or induction.

What it generates automatically:
- **Pouring basin** and a **tapered sprue**, sized with Bernoulli flow so the metal doesn't suck in air. There's a **sprue well** at the bottom to soften the drop.
- A **center-fed runner** that splits evenly to **1–4 gates**. Each gate is cut to exactly reach your part, so the metal arrives at the same time from every side. Gating uses a calm 1 : 2 : 2 ratio for aluminum and similar metals.
- **Risers (feeders)** on the **thickest sections**, found by firing rays through your part. They're sized with Chvorinov's rule (the riser freezes after the casting) and checked against the metal's shrink volume.
- **Vents** at the high points, so trapped air can escape.
- **Shrink allowance**: the pattern is scaled up by the metal's shrinkage (aluminum +1.3%, bronze +1.5%, and so on).
- A **parting line** at the widest cross-section (or set it yourself under *More options*).
- **Mold halves** (plaster, silicone, or printed) with **alignment keys**, laid out next to each other ready to print. For sand, you can **split the pattern** at the parting line instead.

What it tells you (in the panel):
- **What can you pour?** Every metal gets ✓ works, **!** risky, or ✕ won't work, with the reason: the mold can't take the heat, your heat source isn't hot enough, or the walls are too thin for that metal to fill. Click a metal to switch to it.
- **Pour plan**: pour temperature, casting weight, metal to melt (including the gating), crucible size, pour time, and yield.
- **Gating sizes**, wall thickness range, parting height, and flask or mold block size.
- **Warnings**: undercuts that won't release, vertical walls that need draft, thick-next-to-thin sections, and metals that won't fill.

> Safety: molten metal plus moisture can explode violently. Pre-heat tools and molds, keep everything bone dry, wear leather boots, gloves, and a face shield, and never cast zinc or brass without good ventilation.

### Move / Rotate
Moves and/or rotates a whole part. Set **Rotate°** and **Rotate about** (with an optional pivot under *More options*). Tick **Make a copy** to leave the original in place.

### Scale
Scales a part uniformly around its bottom-center.

### Combine
Joins, subtracts, or intersects two existing parts. **Keep part** is the result; **Tool part** gets used up unless you tick **Keep tool part**.

### Split
Slices a part with a plane at a position along X, Y, or Z, giving two parts. Good for printing tall things in two halves.

### Delete Part
Removes a part from the model at that point in the history.

### Import
Brings in a **STEP** (`.step` / `.stp`) or **STL** file as a part. It's stored inside your project file. You can Scale it, and use *Add / Remove / Intersect* with it like any other shape. STEP gives exact solids; STL gives a mesh shape, which is fine for booleans but has no true edges to fillet.

---

## Parts (multi-body)

A project can hold several solid **parts**, like a box and its lid.
- Each **New part** result creates one.
- Click a part (in the list or in the 3D view) to see its **size, volume, surface area, and mass**, or to export just that part.
- Rename parts and pick their colors. The eye icon hides a part (hidden parts are left out of exports).

---

## Variables and math

Click **Variables** in the ribbon to name values, like `width = 80`, `wall = 2`, or `hole = 3.2 + 0.2`. Then type the name into **any number box**. Change it once and the whole model follows.

Every number box accepts math: `+ - * / ^ ( )`, `sqrt`, `abs`, `min`, `max`, `round`, `floor`, `ceil`, `sin` / `cos` / `tan` (in degrees), `pi`, and `inch` (= 25.4, so `2*inch` works in mm projects).

Variables can use earlier variables, like `inner = width - 2*wall`. A red box means the expression has an error.

In a number box, [[↑]] and [[↓]] nudge the value by 1 (Shift: 10, Alt: 0.1).

---

## Measuring and inspecting

- **Measure** ([[Q]]): click a face to get its area, click an edge to get its length, or click two things to get the distance plus ΔX / ΔY / ΔZ. Two flat faces also give the gap between them (if parallel) or the angle between them. Edge ends snap. Click empty space to clear, [[Esc]] to exit.
- **Section**: cuts the view along X, Y, or Z with a slider, so you can see inside. The inside walls show up red. It only changes the view, not the model.
- **Model panel** (click empty space): overall size, volume, and mass. Pick the **Material** (PLA, PETG, ABS, Aluminum, Steel, and more) to get mass in grams. The mass assumes a fully solid part; real prints with infill weigh less.
- Hover over anything to see its type and coordinates in the status bar.

---

## Saving and opening

- **Save** ([[Ctrl+S]]) saves to `Documents\Velocity\<name>.velocity`. [[Ctrl+Shift+S]] saves under a new name.
- **Open** ([[Ctrl+O]]) lists your projects, newest first. You can also open a `.velocity` file from anywhere, or save a copy.
- **New** starts an empty project. The old one is still in your saved projects if you saved it.
- An orange dot next to the name means there are unsaved changes. Autosave protects you anyway, but use **Save** to keep named versions.

---

## Exporting and 3D printing

Click **Export** in the top bar:

| Format | Use it for |
|---|---|
| **3MF** | Bambu Studio, PrusaSlicer, Cura. Keeps parts as separate objects. **Best for printing.** |
| **STL** | Any slicer. Tick "One STL file per part" for separate files. |
| **STEP** | Exact CAD geometry for Onshape, Fusion 360, SolidWorks, or CNC/CAM |
| **OBJ** | Blender and game engines |
| **PNG** | A screenshot of the current view |

- **Mesh detail**: *Draft* (small files), *Normal*, or *Fine* (smooth curves, bigger files).
- **Send to Bambu Studio** appears when Bambu Studio is installed. It exports a 3MF and opens it in Bambu Studio for you.
- After an export, the message has **Show in folder** and **Open in Bambu Studio** buttons.
- Inch projects get converted to mm on export, which is what slicers expect.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| [[S]] | New sketch |
| [[E]] | Extrude |
| [[X]] | Cut (through all) |
| [[V]] | Revolve |
| [[B]] | Box |
| [[Shift+F]] | Fillet |
| [[M]] | Mirror |
| [[Q]] | Measure |
| [[F]] | Zoom to fit |
| [[0]] [[1]] [[2]] [[3]] | Iso / Top / Front / Right view |
| [[Ctrl+Z]] / [[Ctrl+Y]] | Undo / Redo |
| [[Ctrl+S]] / [[Ctrl+O]] | Save / Open |
| [[Del]] | Delete the selected feature (or the selected sketch shapes) |
| [[Esc]] | Cancel / deselect / exit |
| [[F1]] | This guide |
| **In a sketch:** [[L]] [[R]] [[C]] [[P]] [[O]] | Line, Rectangle, Circle, Polygon, Slot |
| [[H]] / [[G]] | Toggle hole mode / grid snap |
| [[Enter]] | Close the polyline, or finish the sketch |

---

## Tips and troubleshooting

**A fillet or chamfer fails.** The radius is probably bigger than the space it has. Try a smaller value. Fillets also can't go on edges where two faces already meet smoothly (tangent edges, like where a rounded rectangle's arc meets its straight side). Fillet the sharp edges instead.

**"Sketch has no solid shapes."** Every shape is a hole or a ref. Un-toggle **hole** on the outer shape.

**Polyline errors.** A line that crosses itself can't make a profile. Fix the points in the Points box.

**Cut doesn't do anything.** The cut direction may point away from the part. Tick **Flip direction**, or use **Through both**.

**Shell fails.** The wall may be thicker than a thin area of the part, or the part has very small details. Try a thinner wall or shell earlier in the history (before small fillets).

**Revolve fails.** The profile probably crosses the axis. Keep it entirely on one side.

**Slow rebuilds.** Large patterns of fillets are expensive. Put fillets last, or suppress them while you work on other things. Set **Settings → Display quality → Fast** to speed up the display.

**Picking the wrong edge.** Zoom in. Hovered edges light up white before you click, and the status bar shows what's under the cursor.

**First launch stuck downloading.** It needs internet access to github.com and raw.githubusercontent.com. After that it works offline.

**"GitHub rate limit."** GitHub allows about 60 update checks per hour from one internet connection. The launcher uses free "no change" checks, so you should almost never hit it, but if you do it just waits a few minutes. Nothing breaks.

---

## For developers

- `app/` is the whole app: plain ES modules, no build step for app code. Edit, commit, and push to `main`, and every open copy updates within about 10 seconds.
- `app/worker/kernel.js` and `replicad_single.wasm` are the bundled CAD kernel (replicad + OpenCascade). They rarely change.
- `launcher/` is the Go source for `Velocity.exe`. Run `./build.sh launcher` to rebuild `dist/Velocity.ex_`. Bump `LauncherVersion` in `main.go` **and** `dist/launcher-version.txt` to push a launcher self-update.
- To run in a browser for testing: `cd app && python -m http.server` and open `http://localhost:8000`. Saving uses browser storage in that mode.
