# DXF Export — plan

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
