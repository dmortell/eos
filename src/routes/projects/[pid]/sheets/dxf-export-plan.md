# DXF Export — plan

## Reference implementation (proven — read first)
`M:\dev\autocad\docs\dxf-export.md` — the user's other CAD app (OpenCAD) already ships DXF export
with the **same library and the same real-mm / y-up / 1:1 model-space approach**, verified by
round-tripping its own output through `dxf-parser`. Reuse its mapping decisions + gotchas (below);
its `src/lib/dxfExport.ts` (`modelToDxf(model)` sync + `modelToDxfBundle(model)` async) is the shape
to mirror. It proved:
- The **mapping layer (our shapes → DXF entities) is the real work and is library-agnostic** — the
  writer choice is cheap to change later.
- `@tarikjabiri/dxf` **has NO VIEWPORT entity** (only `addPaperSpace()` without viewports) → a real
  paper-space sheet layout at scale is **blocked** with this lib. This *confirms* our headline =
  model-space export; a paper "as-drawn" DXF (Phase 3) would need geometry flattening or a lib fork.

## Goal (decided)
Export **real-world model geometry** as a DXF that a draftsman can **open in AutoCAD as a model**
(model space, true millimetres) and keep working on. This is the headline mode — NOT a
paper "as-drawn" reproduction of the sheet. Underlays (raster PDF floorplans) are **omitted** for now.

## Library (decided)
`@tarikjabiri/dxf` (installed via pnpm). Modern TS DXF writer with layers/blocks/entities.
- **Format target: AutoCAD 2007 (`AC1021`, a.k.a. R2007)** — the library's default. NOTE this is
  NOT the same as R2000 (`AC1015`); 2007 is newer (truecolor etc.) and read by all current AutoCAD.

## Coordinate & unit contract
- DXF units = **mm** (`$INSUNITS = 4`). Our geometry is already real-mm.
- **DXF is Y-up.** Per-source Y convention:
  - outlets/trunks/racks/risers: `SheetViewport.version === 1` is Y-DOWN (legacy outlets),
    `version 2` is Y-UP (default). Flip Y for v1.
  - model3d: `project()` returns drawing-plane (u,v) with v-up, then flips to y-down for SVG —
    so for DXF we take (u, v) directly (Y-up), no extra flip.
- Because the headline is "a model", each export is in **model space at 1:1 true mm**; no paper
  scaling, no title block. (Sheet "as-drawn" paper-space export is a later, separate mode.)

## Source of geometry: reuse the existing pure helpers (no SVG parsing)
The renderers already compute geometry with pure functions — call the SAME functions so the DXF
matches the drawing:
- **model3d** (primary, richest): `project(obj, dir, yaw, pitch, cx, cy) → Shape[]` where
  `Shape = { pts: {u,v}[]; closed: boolean }`. Each shape → `LWPOLYLINE` (closed or open).
  Level datums → `LINE`; labels → `TEXT`. Honour the viewport `clip` (trimToClip) + hidden layers.
- **outlets**: `OutletConfig.position` + symbol → `INSERT` of a per-symbol BLOCK (Phase 2) or
  CIRCLE/POLYGON + `TEXT` (Phase 1). `TrunkConfig` via `generateTrunkPolygons()` → `LWPOLYLINE`
  (rounded corners: straight in Phase 1, bulge-arcs later). `RackPlacement` → rect polyline.
- **racks**: `buildElevation()` / `deviceBox()` → rect `LWPOLYLINE` + `TEXT`; door swing → `ARC`.
- **risers**: `buildFloorBands()` (bands → lines/rects), `cablePolylinePoints()` (cables →
  `LWPOLYLINE`), rooms → rect polyline, labels → `TEXT`.
- **annotations**: line/arrow/rect/ellipse/text/dim/cloud. Geometry is partly procedural in
  `AnnotationLayer.svelte`; Phase 1 may serialize these from the SVG DOM, or extract the geometry
  helpers (`geometry.ts`) — decide during build.

## Layers → DXF layers (1:1)
`layers/layers.ts` `LAYERS` + project custom layers map straight to DXF `LAYER` table entries
(name + truecolor). Every object resolves its layer via `objLayerOf(layerId, kindDefault, layers)`;
emit each entity on that layer. Hidden layers are skipped (or exported frozen — decide).

## Entity mapping (summary)
| Source | DXF |
|---|---|
| model3d shape | `LWPOLYLINE` (closed/open) |
| model3d datum / riser band | `LINE` |
| trunk / cable / room / rack rect | `LWPOLYLINE` |
| outlet symbol | `INSERT`(block) or CIRCLE/POLYGON + `TEXT` |
| door swing / arrowhead | `ARC` (Phase 2; polyline approx Phase 1) |
| text / labels | `TEXT` |
| PDF underlay | **omitted** |
| title block | omitted in model mode |

## Proven details & gotchas (from the OpenCAD reference)
- **Coordinates:** real-mm, y-up → **1:1, no transforms**. Set `Units.Millimeters`. Put each shape's
  height in the **z** coordinate (harmless in 2D, meaningful in 3D viewers). (For our y-down v1
  outlets, flip y first.)
- **Layers:** sanitise names (AutoCAD rejects ``<>/\":;?*|=` ,``); map our default layer onto DXF's
  built-in layer **`0`** (don't redefine it); **skip hidden layers entirely**.
- **Colours:** layers use **ACI indices (1–255), not RGB** — nearest-match a small curated palette;
  map near-white → **7** (AutoCAD auto-inverts 7 for the background). Per-shape override via
  `colorNumber`, or `trueColor` if exact colour matters.
- **Linetypes:** `addLType(name, preview, dashElements)` **before** use; gaps negative; ~2.5 mm
  dashes read well.
- **Smooth/rounded polylines (trunk corners, clouds):** `SPLINE` needs **≥ 4 control points**
  (degree 3). For 3-point curves, export a **sampled Catmull-Rom as LWPOLYLINE** instead. Simplest:
  approximate all rounded corners as short polyline segments for MVP.
- **Rotated rects:** precompute rotated corners into a closed LWPOLYLINE (don't use rotation attrs).
- **Walls (model3d):** a **centreline `LWPOLYLINE` with `constantWidth: thickness`** renders a solid
  wall band and stays editable — far simpler than outline polygons. Openings: split the centreline +
  jamb `LINE`s; door = leaf `LINE` + quarter `ARC` at the hinge.
- **Ellipse:** centre + **major-axis endpoint as a relative vector** + minor/major ratio (≤1).
- **Text:** DXF `TEXT` is single-line → one `TEXT` per line, step down `1.4 × size`; matches on-screen
  layout better than `MTEXT`.
- **Dimensions:** `addLinearDim(a, b, { angle, offset })` emits a **real associative DIMENSION**
  (library builds the geometry block); flip `offset` sign for the other side.
- **Symbols (highest value):** one **`BLOCK` per symbol type** (draw at a canonical size, e.g. 100 mm
  half-height) + **`INSERT`** per instance with `rotationAngle` + `scaleFactor` — so recipients can
  count/filter blocks and their schedules work.
- **Underlays (later):** DXF references rasters **by file path** (`IMAGEDEF`) — decode data-URL →
  `underlay-N.png`, insertion = bottom-left after rotation, scale = realWidthMm/pixelWidth, then ship
  a **zip** (`fflate`) of dxf + images. (Omitted for now.)

## Verification (don't skip — caught real bugs in OpenCAD)
Add `pnpm add -D dxf-parser`. A **dev-only** module (`src/lib/dev/dxfVerify.ts`, imported only from
the browser console so it's excluded from the bundle) round-trips our output:
1. Parse our DXF; assert layer names, `$INSUNITS`, block names, entity-type counts.
2. **Spot-assert exact geometry** with known fixtures (a line at x=40000, a wall width 150, an INSERT
   at 45°/scale 1.5) — this is what caught the SPLINE-min-points crash and sign conventions.
3. `dxf-parser` silently skips IMAGE — regex the raw text for `^IMAGE$`/`^IMAGEDEF$`.
4. Final eyeball in LibreCAD / DWG TrueView / sharecad.org (text anchoring + linetype scale).

## Phasing
1. **MVP — model3d → DXF (real-world mm, model space).** Add `@tarikjabiri/dxf`; a `toDxf(model,
   direction?, clip?, layers)` builder that walks `project()` shapes → LWPOLYLINE on mapped layers,
   plus datums/labels; a **"Export DXF"** action (menu / viewport context) that downloads a `.dxf`
   Blob. Verify it opens in AutoCAD as editable model geometry. (model3d is the natural "model".)
2. **Phase 2 — the other tools + fidelity.** Outlets/trunks/racks/risers via their geometry
   helpers; symbol **BLOCKS** for outlets/devices; bulge-arcs for rounded corners & doors;
   annotation geometry extracted (drop SVG fallback); multi-viewport / whole-model export.
3. **Phase 3 (optional) — paper "as-drawn" sheet DXF.** A real AutoCAD **paper-space LAYOUT** with
   the title-block lines/text and a paper-space VIEWPORT windowing the model at the sheet scale;
   DIMENSION entities; optional IMAGE xref for underlays.

## Open decisions (to confirm as we build)
- Hidden layers: skip vs export **frozen** (kept but off)?
- Outlet/device symbols: **blocks** (cleaner, reusable in CAD) vs exploded geometry for MVP.
- Text: `TEXT` (simple) vs `MTEXT` (wrapping) — start `TEXT`.
- Rounded trunk corners & door arcs: polyline approximation vs true `ARC`/bulge — start polyline.
