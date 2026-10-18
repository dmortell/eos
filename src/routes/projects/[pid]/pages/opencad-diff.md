# OpenCad → EOS Pages gap analysis

**OpenCad** (`M:\dev\autocad`) is a separate SvelteKit + Three.js CAD web app — general-purpose 2D/3D drafting with a structured-cabling bent (outlet symbols, cable routes, racks, penetrations, conduit fill, takeoff/CSV). It shares its Firebase project with EOS (`sunny-jetty-180208`) but is otherwise unrelated code. Scan date: **2026-09-26**. Every claim below was verified by reading the actual source (file paths cited); OpenCad README/todo.md claims that couldn't be cross-checked in code are marked "per README."

EOS Pages is SVG-based (no WebGL/Three.js): plan/4-elevation/iso/perspective projections of a 3D model of walls, prisms, conduits/trunks; a full 2D drafting toolset; paper sheets; an AutoCAD-style command line; DXF export; and outlets/racks/risers domain features it already exceeds OpenCad on in several areas (dimension types, mirror, chamfer, array, join, align/distribute, audit, touch support, command line). This doc focuses on what OpenCad has that EOS genuinely lacks or does differently.

**20 numbered gap items** (O1–O20) below, grouped by area, followed by a Same/parity table and a recommended top-10 pick list.

---

## Drawing tools / entity types

**O1. Wall openings as real 3D solid holes** — **DONE 2026-09-26** (CHANGELOG round 10, commit 50d7f88)
OpenCad splits a wall into real header/sill/jamb panel solids around each door/window opening (`M:\dev\autocad\src\lib\scene\builders.ts` `case 'wall'`, `panel()`). EOS now does the same in the 3D / perspective view: opening boxes crossing a wall segment split it into panels (`3dview/projection.ts` `openingCuts` / `segmentGaps` / `wallBoxes`), and 3D picking sees through the hole. Plan / elevations keep their masked openings.

**O1b. Door / window placing + editing ON the wall** — Different
OpenCad stores openings on the wall (`WallOpening`: offset along the wall, width, height, sill, swing `flip`, `hinge`) — click a wall with the door (O) / window (N) tool to punch one; with the wall selected every opening gets grips: the centre slides it along the wall, the edge grips set its width; swing and hinge flip independently (`types.ts`, `grips.ts`, `components/PropertyPanel.svelte`). EOS openings are free boxes on an openings layer, dragged as a footprint (Opening tool) and moved like any box — they don't snap to / slide along a wall, and the width is the box's size. Suggested approach: an Opening tool that clicks ONTO a wall (sets the box across the wall's thickness, centred on the click, default door 900×2100 / window 1200×1200 sill 900) + a grip drag constrained along the wall's axis. Size: **M**.

**O2. Penetration / core-drill symbol** — Missing
OpenCad has a dedicated `pen` tool: a Ø + through-wall/through-slab marker with auto-numbered tag (`M:\dev\autocad\src\lib\editor.svelte.ts` `nextPenTag()`, `types.ts` `PenShape`), rendered as a ring+crosshair (`cablingBuilders.ts` `buildPen`), and rolled into the takeoff (count + tags grouped by through|diameter). EOS has no equivalent entity/tool for tracking floor/wall cable penetrations. Approach: add a `pen`-style entity + tool (reuse the OUTLET auto-tag pattern), feed it into a takeoff report (see O18). Size: **S**.

**O3. Outlet/device symbols: fixed enum vs block-based** — Different
OpenCad symbols are 8 hardcoded kinds (`data/data2/power/wap/cctv/tel/fibre/floorbox`, `types.ts` `SymbolKind`) drawn from baked-in glyph code (`cablingBuilders.ts` `buildSymbol`). EOS outlets are true block inserts (rosette/wall/floorbox definitions in the shared block library, `ui/blocks.ts`), so new symbol types don't need a code change. No action needed — EOS's approach is a superset; mention only for completeness. Size: **–**.

**O4. Section line: arbitrary-angle cut vs axis-aligned marker** — Different
OpenCad's `section` shape is two freely-placed points at any angle (`types.ts` `SectionShape`), producing an oblique section/elevation camera in a sheet viewport (`paper\render.ts`). EOS's SECTION tool drops a box marker whose 4 fixed arrows generate the N/S/E/W elevation view as a viewport frame (`ui/commands.ts` `sectionDropAsFrame`) — arbitrary-angle (non-cardinal) building sections were not confirmed to be supported. Suggested approach: extend SECTION to accept a drawn 2-point line at any angle, reusing the existing `trimToClip` 3D-cut logic. Size: **M**.

---

## Editing / grips / modify commands

**O5. Straighten (axis-align + reweld corners/T-junctions)** — Missing
OpenCad's `straightenSelection()` (`editor.svelte.ts:1078-1159`) snaps selected walls/lines to the nearest horizontal/vertical and re-welds shared corners and T-junctions — a one-click cleanup after tracing an underlay or DXF import. No equivalent found in EOS's `ui/modify.ts`. Useful precisely because EOS's walls are a node graph already (welding is structural, not heuristic) — the axis-snap half is the missing piece. Size: **S–M**.

**O6. Isolate selection** — Missing
OpenCad can temporarily hide everything except the current selection, with a one-click "Show all" restore (`editor.svelte.ts` `isolateSelection()`/`showAll()`, HUD chip in `Viewer.svelte:1513-1517`) — a render/pick filter, not a layer change. EOS's closest equivalent (Layers panel "View Presets") is a saved layer-visibility set, not an ad-hoc per-selection isolate. Size: **S**.

**O7. Legend generation basis: symbol/block kind vs layer** — Different
OpenCad's auto-legend lists distinct `SymbolKind`s actually used in the model (+ a penetration row), i.e. "what device types appear and how many" (`takeoff.ts`, `placeLegend()`). EOS's LEGEND (`ui/legend.ts`) lists the model's **layers** as colour swatches + counts — useful for a layer key, but doesn't answer "how many data outlets vs power outlets are on this floor." Suggested approach: add a second legend mode driven by block/symbol usage counts. Size: **S**.

---

## Snapping

**O8. Perpendicular snap while drawing** — Missing
OpenCad locks the draw cursor onto the perpendicular foot of a nearby wall/line while sketching from a point (`geometry.ts` `perpOffset`, toggle `editor.perpSnap`). EOS's OSNAP (`ui/snap.ts`) covers endpoint/midpoint/centre/quadrant + model-object points but no perpendicular-foot snap. Useful for square cable drops off a trunk/wall. Size: **S**.

**O9. Object-snap alignment tracking (auto guide rays)** — Missing
OpenCad draws dashed alignment rays to the x/y of nearby snap points while drawing (`editor.svelte.ts:321-357`, `editor.alignSnap`) — AutoCAD-style object-snap tracking, automatic. EOS has POLAR tracking (angle-based, every 15°, `ui/snap.ts`) and manual GUIDE/XLINE construction lines, but no automatic point-alignment tracking. Size: **M**.

**O10. Underlay dark-pixel snapping** — Missing
OpenCad can snap the cursor onto the nearest dark pixel in a PDF/image underlay within a radius (`underlaySnap.ts` `snapToUnderlay`, luminance-threshold scan, toggle `editor.underlaySnap`) — lets you trace a scanned floorplan quickly without eyeballing line intersections. EOS's underlay calibration (Properties›IMAGE›Calibrate: Origin/Scale/Crop) has no equivalent pixel-snap. High practical value for tracing architect-supplied PDFs. Size: **M**.

---

## 3D model & rendering

**O11. Quad view (plan + 3D + front + side, simultaneous, auto-framed)** — Different
OpenCad's "quad" HUD toggle splits the canvas into 4 live, synchronized scissor-viewports (plan/3D/front/side) that auto-frame to the current selection, with direct grip-editing inside the elevation panes (`scene\scene3d.ts` quad-cam logic, `Viewer.svelte:1535-1539`). EOS's Split editor gives 2 independently-configured panes (`SPLIT`/`VPORTS`) — you choose each pane's view manually rather than getting all 4 standard directions at once. EOS's normal elevation tabs are already fully editable (so the *editing* capability exists), it's the *simultaneous 4-way* layout that's missing. Size: **M**.

---

## Views / navigation

**O12. Named views: cloud-synced vs local-only** — Different
OpenCad's named views are part of the `CadModel` (`types.ts` `NamedView`), so they save/sync through the same Firestore project doc as everything else. EOS's `VIEW` command stores named views in **browser localStorage**, keyed per project+drawing+viewport (`ui/view.ts`) — they don't follow the drawing to another device or collaborator. Suggested approach: move named views into the model doc alongside guides/sections. Size: **S**.

*(3D navigation — orbit, perspective toggle, view-cube-equivalent gizmo, hidden-line removal, true 3D section clip — EOS already matches or exceeds OpenCad here; see Same table.)*

---

## Sheets / printing / title blocks

No significant gaps found — EOS's sheet/viewport/title-block/revision system (per-frame layer freeze, PrintBook, auto-filled revision table, sheet registry) is a superset of OpenCad's. EOS's SVG-native rendering also means every print output is true vector (plan, elevation, *and* iso), where OpenCad falls back to ~200dpi raster PNG for iso/section viewports. See Same table.

---

## Import / export

**O13. DXF import** — Missing
OpenCad reads LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC/ELLIPSE/SPLINE/TEXT/MTEXT/INSERT via `dxf-parser`, unit-aware ($INSUNITS), with block-exploding and round-tripping of its own exported symbol blocks (`dxfImport.ts`). EOS's `exportDxf.ts` is **export-only** — no DXF import exists at all (confirmed absent in `todo.md`). This is the single biggest gap: fit-out designers routinely receive architect DXFs to trace/build on, and today that only enters EOS as a flattened PDF/image underlay. Size: **L**.

**O14. Whole-project export/import as a portable file** — Missing
OpenCad can export/import an entire project as a `.opencad.json` file, independent of the cloud backend (`project/[id]/+page.svelte` `exportProject()`/import). EOS has no equivalent full-project file export — its persistence is Firestore-only. Useful for backup, migration, or sharing a project outside the shared Firestore/collaborator model. Size: **M**.

**O15. DXF export: underlay/traced images bundled as sidecar files** — Missing
OpenCad's `modelToDxfBundle()` can package underlay raster images as sidecar PNG/JPG files zipped alongside the .dxf (`dxfExport.ts`, `IMAGE`/`IMAGEDEF` entities). EOS's `exportDxf.ts` explicitly does **not** export images (counted under `skipped`) — a DXF handoff loses any traced floorplan/reference image entirely. Size: **M**.

**O16. DXF export: true BLOCK/INSERT for symbols vs flattened geometry** — Different
OpenCad exports each distinct symbol kind as a real DXF `BLOCK` with `INSERT` instances (`dxfExport.ts`, canonical 100mm glyphs) — the docs call this "the highest-value mapping" because recipients can count/filter outlets by block name in their own CAD software. EOS's `exportDxf.ts` **explodes block inserts to shapes + attribute text** on export, so outlet/rack counts aren't recoverable from block references downstream. Suggested approach: export outlet/rack/marker blocks as real DXF BLOCK+INSERT (with attributes as ATTDEF/ATTRIB) instead of exploding. Size: **M**.

**O17. DXF export: associative DIMENSION entities vs flattened lines+text** — Different
OpenCad writes real DXF `DIMENSION` entities via `addLinearDim()` so a recipient's CAD app can restyle/re-associate them. EOS exports dimension extension lines and text as flattened geometry. Lower value (most recipients just view the geometry) but a genuine interop gap. Size: **S**.

---

## Library / blocks

No significant gaps — EOS's block system (shared global library, true attribute-carrying block definitions, categorized panel, purge/audit) is already a superset of OpenCad's flat per-user library + 4 starter blocks. See Same table.

---

## Takeoff / markup / measurement

**O18. Project-wide cable takeoff & pull-schedule (BOM/CSV export)** — Missing
OpenCad's `takeoff.ts` computes a full quantity takeoff — symbol counts by kind, route totals by service/containment (including drops+slack), penetration counts by through/diameter, rack counts — **and** a cable pull-schedule matching each route to its outlet and rack with computed length, exportable as a formatted CSV (`takeoffCsv()`), surfaced live in the property panel. EOS has per-outlet Excel schedule export (`store/outletSchedule.ts`) and a more advanced per-conduit *fill%* check (`3dview/fill.ts`), but explicitly no general BOM/quantity takeoff or outlet↔rack pull-schedule (confirmed absent in `todo.md`). This is the most domain-relevant gap for a cabling design tool — directly needed for material ordering and install-crew handoff. Size: **L**.

**O19. AREA / perimeter inquiry command** — Missing
Neither app has a literal "AREA" command in the strict AutoCAD sense in OpenCad's own toolset either — but OpenCad's takeoff and property panel give running length totals; EOS's `todo.md` explicitly lists AREA/ID/LIST inquiry commands as not built. Useful for quick room-area costing in a fit-out context. Size: **S**.

---

## Data / sync / persistence

**O20. Local periodic snapshot safety net (independent of the undo stack)** — Missing
OpenCad keeps up to 12 localStorage snapshots per project, one every ≥5 minutes ("≈ the last hour of active work"), independent of and surviving past the 50-step undo stack, restorable from a timestamped list (`snapshots.ts`, `maybeSnapshot()`/`listSnapshots()`/`loadSnapshot()`). EOS's `history.svelte.ts` is a single 100-step undo/redo timeline — once 100 edits pass, earlier states are gone, and EOS's own `todo.md` flags the whole-model-doc persistence approach as a scaling/safety risk under active investigation. A lightweight periodic local snapshot (independent of the edit-count-capped undo stack) would be a low-cost mitigation while the bigger backend rework is pending. Size: **M**.

---

## UI / UX

No gaps found. EOS's command line, command palette, Help dialog, Layers panel (view presets, nested groups), Drawing Navigator tree, and touch/gesture support are all more developed than anything in OpenCad, which has no command-line/palette at all — commands are toolbar buttons and letter-hotkeys only.

---

## Other

Auth: EOS already supports Google/GitHub/Microsoft vs OpenCad's Google-only. Print workflow (browser `window.print()` to PDF) is the same approach in both apps. Both share the same Firebase project (`sunny-jetty-180208`) but are otherwise independent codebases.

---

## Same / already in EOS (compact)

| Area | Feature | Note |
|---|---|---|
| Drawing | Line, polyline, rect, circle, ellipse, arc, text | Parity; EOS notes/text are a superset (markdown, callout) |
| Drawing | Dimensions | EOS superset — linear/angular/continue/baseline/radius/diameter vs OpenCad's single linear-only type |
| Drawing | Leader | Parity (EOS also has MLEADER) |
| Drawing | Wall/box/rack 3D prisms | Parity; EOS rack rendering (mount-face gating, RU numbers) exceeds OpenCad's wireframe-only rack |
| Drawing | Cable routes/conduits | EOS superset — true swept 3D tube geometry, bend-radius fillets, catalogue specs vs OpenCad's flat dashed line |
| Editing | Move/copy/rotate/scale/group/delete | Parity |
| Editing | Mirror | EOS superset — any 2-point axis vs OpenCad's vertical-through-centre only |
| Editing | Fillet | EOS superset — also has Chamfer, which OpenCad lacks |
| Editing | Offset/trim/extend/break/explode | Parity (both limited to lines/walls for trim/extend) |
| Editing | Array (rect + polar), Match properties, Select similar | Parity |
| Editing | Join, Align/Distribute, Draw order, Audit | EOS-only extras, not in OpenCad |
| Editing | Direct distance entry while drawing | Parity — EOS command line's bare-number input |
| Editing | Corner/vertex node welding | EOS superset — structural (shared graph node) vs OpenCad's heuristic endpoint match |
| Snapping | Grid snap, endpoint/midpoint/centre/quadrant, ortho | Parity |
| Snapping | Polar/angle tracking | Parity (15° increments both) |
| Snapping | Trackpad/touch gestures | EOS superset — full touch input model vs OpenCad's trackpad toggle |
| Selection | Click/shift-select, marquee window vs crossing, select-similar | Parity |
| 3D/rendering | Orbit navigation, perspective toggle, hidden-line removal | Parity; EOS's HLR runs live in plan/elevation, OpenCad's only on print output |
| 3D/rendering | View-cube-style navigation gizmo | EOS has one (ViewCube); OpenCad has none |
| 3D/rendering | Section/clip view | EOS superset — true live 3D cut vs OpenCad's paper-viewport-only section |
| Sheets | Viewports, scale, title block, revisions, multi-sheet print | EOS superset (richer revision/title-block system, PrintBook) |
| Sheets | Vector print output | EOS superset — all views print as true SVG vector; OpenCad rasters iso/section at ~200dpi |
| Import/export | DXF export (base capability) | Both have it; see O15–O17 for specific gaps |
| Library | Block library, attributes, insert scaling, purge/audit | EOS superset — categorized panel + larger built-in symbol set |
| Takeoff | Conduit/cable fill % check | EOS superset — full packing sim by cable type vs OpenCad's simple ratio |
| Data | Underlay/image offload to non-document storage | Parity — EOS uses UploadThing, OpenCad uses Firebase Storage |
| Auth | Sign-in providers | EOS superset — Google/GitHub/Microsoft vs OpenCad's Google-only |
| UI | Command line / palette / help / layers / navigator | EOS superset — OpenCad has none of these (toolbar + hotkeys only) |

---

## Recommended picks (~10 highest value for a cabling/network fit-out design tool)

1. **O13 — DXF import** (L). Biggest single gap; unlocks importing architect floorplans directly instead of raster-tracing.
2. **O18 — Project-wide cable takeoff & pull-schedule** (L). Directly serves the domain: material counts + outlet↔rack cable schedule for ordering and install.
3. **O2 — Penetration/core-drill tool** (S). Small to add, needed input for #2 and for coordination with builders.
4. **O10 — Underlay dark-pixel snapping** (M). Large practical speedup when tracing PDF floorplans.
5. **O20 — Local periodic snapshot safety net** (M). Cheap insurance while the bigger persistence rework is pending.
6. **O8 — Perpendicular snap** (S). Precision for cable drops and square-offs from walls/trunks.
7. **O16 — DXF export as true BLOCK/INSERT** (M). Lets consultants/contractors count outlets/racks in their own CAD software.
8. **O9 — Object-snap alignment tracking** (M). Faster precise placement without manual XLINE guides.
9. **O19 — AREA/perimeter command** (S). Quick room-area costing.
10. **O14 — Whole-project export/import as a file** (M). Backup/migration/offline-sharing independent of Firestore.

*(O1, wall openings as real 3D holes, is DONE — see above. O1b, placing / sliding openings on a wall, is a strong add-on to it.)*
