# Drawings & Viewports — POC Incorporation Plan

Bringing the `eos2` proof-of-concept's drawing/viewport experience into production `eos`.

> **Sources analysed**
> - POC: `M:\dev\eos2\src\routes\projects\[pid]\drawings\` (+ `trunks/`, `viewports.svelte.ts`, `lib/db.svelte.ts`, `uploads/`, `Projects.svelte.ts`)
> - Production: `M:\dev\eos\src\routes\projects\[pid]\{drawings,outlets,racks,uploads}\`, `src\lib\{ui/print,types/pages.ts,db.svelte.ts}`

---

## 0. Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Reconcile POC vs production drawings editor | **Evolve the existing editor** — keep production's `Page` / `Viewport` / `ViewportSource` data model + versioning/packages, graft the POC's interaction layer on top. |
| D2 | Editing locus inside viewports | **Hybrid** — cross-tool viewports (rack elevation, frame detail, fillrate, patching…) stay read-only windows; a native **`floorplan`** viewport supports in-place trunk/outlet/shape editing (POC-style), writing to the owning tool's Firestore doc. |
| D3 | Floorplan Y-axis inversion (positive = up) | **Design-only** — build new coordinate code axis-agnostic, document the migration in an appendix, flip the switch later. No data migration in this plan. |

### Guiding principles
1. **Production wins where it's already better.** Keep production's miter-polygon pipe rendering, toggle-button tool switchers, per-viewport scale, sticky defaults, print pipeline, toast, archiving. Do **not** import the POC's `<select>` switchers or round-cap "cylinder" pipe rendering.
2. **The POC contributes interaction, not data.** Frame-select threshold, dblclick-activate pan/zoom, menubar, statusbar, copy-cursor, snap-ring, context menus, dev-tunable title block.
3. **Each phase ships standalone value** and is independently revertable. Low-risk infra wins go first.
4. **Reuse, don't fork.** New drawing canvas reuses `$lib/ui/print`, `TrunkRenderer`, `OutletCanvas` editing primitives, `db.svelte.ts`.

---

## 1. Feature reconciliation — where each item stands today

### ✅ Things you liked → status & action

| POC feature you liked | Production status | Action |
|---|---|---|
| Add/edit/select viewports; **drag-to-select** avoids accidental drag | Production `ViewportFrame` has move/resize/lock/alt-pan but **no frame-strip selection + anti-nudge threshold** | **Adopt** POC's frame-strip + 4px threshold (Phase 2) |
| **Dblclick to activate** viewport → nested pan/zoom | Absent (viewports are static windows) | **Adopt** activate/deactivate + nested Canvas (Phase 2) |
| **Menubar** (AutoCAD-like) | Absent (production uses toolbars/tabs) | **Build new** `DrawingMenubar`, incremental (Phase 3) |
| Adding racks UX with **sticky settings** | Production already has **row-level defaults** (`RackRow.defaults`) that cascade to new racks | **Keep production's** (better); no port needed |
| Adding outlets | Production has full outlet add + **sticky defaults** (`stickyDefaults`) | **Keep production's**; expose inside floorplan viewport (Phase 5) |
| Trunk editing: context menus (insert/disconnect node, **select full trunk**), **snap indicators** | Production has angle-snap, right-click disconnect, snap-to-nearby, undo — but **no context-menu UI, no "select full trunk", no snap-ring** | **Selectively adopt** POC's context menu + snap-ring + multi-seg snap (Phase 6) |
| Copy cursor for add mode; **status bar** | Absent | **Adopt** both (Phase 2) |
| Trunk **angle constraints** when drawing/dragging | Production has single-neighbor `constrainAngle` (15°) | **Keep**, add POC's least-squares multi-segment `snapNodeAngles` (Phase 6) |
| Refactored trunk rendering code | Production `OutletCanvas` is monolithic (~1800 lines); POC splits Layer/Overlay/Shape + headless editor | **Optional refactor** (Phase 6, quality-only) |
| Title block: dev easily adjusts section sizes | Production has `TitleBlock` too | **Port** POC's section-config + `vector-effect` thin lines (Phase 8) |
| Thin margin/title-block lines even in PDF | Production print uses `stroke-width={1/zoom}`; POC uses `vector-effect="non-scaling-stroke"` | **Adopt** `non-scaling-stroke` where crisper (Phase 8) |
| Print to PDF (hides menus/tools/selection) | Production `$lib/ui/print` already does this | **Keep + reuse**; just tag new chrome `print:hidden` |
| Toast notifications | Production already integrates svelte-sonner globally | **Keep**; use `import { toast } from 'svelte-sonner'` |
| Files uploadable to Firestore as UploadThing alternative; record provider | Production is **UploadThing-only, no `provider` field** | **Build** Firebase Storage upload + `provider` field + backfill (Phase 1) |
| Project details editor + archiving | Production already has soft-delete archiving + editor | **Keep production's** |

### 🔧 Dislikes / missing → action

| Item | Action | Phase |
|---|---|---|
| `<select>` for trunks/outlets/racks is poor UX | Use production's **toggle buttons** (already exist) | — (keep) |
| Cylindrical pipe rendering looks odd | Use production's **miter-polygon `TrunkRenderer`**; drop POC's round-cap lines | — (keep) |
| New viewports need **type (floorplan/elevation/fillrate) + source (floor/racks)** selection | Production already has `ViewportSource` pickers; expose at **add-time** + add `floorplan` kind | Phase 4 |
| **Annotations** missing | Build annotation layer (text/leader/dimension/rev-cloud/symbol) | Phase 7 |
| **Layers** for viewports (hi/lo outlets, trunks) | Extend `ViewportSource` + Layers panel | Phase 6 (data) / Phase 4 (UI) |
| **Exact scale (1:10, 1:100)** in addition to wheel zoom | Reconcile view-zoom vs locked content-scale | Phase 5 |
| **World scale** not fully implemented | Define world-scale as single source of truth across canvas + activated pan/zoom + print | Phase 5 |

---

## 2. Architecture target

```
drawings/pages/[pageId]/+page.svelte        (KEEP — page state, sidebar, persistence)
 ├─ DrawingMenubar.svelte          (NEW  — AutoCAD-like menus; Phase 3)
 ├─ PageCanvas.svelte              (EVOLVE — add activate/deactivate, copy-cursor; Phase 2)
 │   ├─ PrintPaper (reuse $lib/ui/print)
 │   ├─ ViewportFrame.svelte       (EVOLVE — frame-strip select + threshold; Phase 2)
 │   │   └─ viewports/*.svelte     (read-only renderers — KEEP)
 │   │       └─ FloorplanViewport  (EVOLVE → in-place editable when activated; Phase 4)
 │   └─ AnnotationLayer.svelte     (NEW  — Phase 7)
 ├─ StatusBar.svelte               (NEW  — Phase 2)
 └─ LayersPanel.svelte             (NEW  — Phase 6)

outlets/                            (source of truth for floorplan data — trunks/outlets/racks)
 ├─ parts/OutletCanvas.svelte       (editing primitives reused by FloorplanViewport)
 └─ trunks/{geometry,TrunkRenderer} (KEEP rendering; add context-menu + snapNodeAngles; Phase 6)
```

**Data ownership rule (D2 hybrid):** a `floorplan` viewport edits the *live* `outlets/{pid}_F{NN}` doc directly (same doc the Outlets tool uses). The drawing page stores only the *viewport* (position/size/scale/clip/layers), never a copy of the floorplan data. Versioning pins the source on publish (mechanism already exists via `sourcePin`).

---

## 3. Phased implementation

> Ordering favours independently-shippable, low-risk work first, then the interaction core, then new capabilities.

### Phase 1 — File provider field + Firebase Storage upload  *(independent, ship first)*
**Goal:** files can be uploaded to Firebase Storage as an alternative to UploadThing, and every file records its provider.

Steps:
1. Add to `FileDoc` (`outlets`/`uploads` `files` collection): `provider?: 'uploadthing' | 'firebase'`, and for Firebase: `path` (gs path) replacing reliance on UploadThing `key`.
2. **Backfill migration**: one-off script setting `provider: 'uploadthing'` on all existing `files/*` docs (they're all UploadThing today). Run via a guarded admin route or a `db.getMany('files')` → `saveBatch` loop.
3. Add a Firebase Storage upload path in `uploads/` (port POC `uploads/+page.svelte` `uploadBytesResumable` flow → `projects/{pid}/uploads/{id}_{name}`, `getDownloadURL`, write `provider:'firebase'`).
4. Provider chooser in the uploads UI — **toggle buttons** (not the POC `<select>`).
5. Resolve provider on delete: `provider==='uploadthing'` → UTApi delete; else `deleteObject`.

Risk: low. Files: `uploads/Uploads.svelte`, `uploads/+page.svelte`, `lib/db.svelte.ts` (if a storage helper is added), new migration script. Acceptance: upload via both providers; existing files show a provider badge; delete works for both.

### Phase 2 — Drawing canvas interaction layer  *(the heart)*
**Goal:** PageCanvas/ViewportFrame gain the POC's praised feel.

Steps:
1. **Frame-strip selection + anti-nudge** in `ViewportFrame.svelte`: clicks land on thin edge strips (`pointer-events:auto`), interior is `pointer-events:none` until active. Movement only begins after a **4px** screen-distance threshold (`Math.hypot` guard). Shift/Ctrl-click = additive multi-select.
2. **Activate/Deactivate**: dblclick a frame → `activeViewportId`; clears selection. Dblclick empty / Esc → deactivate. (Mirror POC `Drawing.onDbl` → `vps.activate/deactivate`.)
3. **Nested pan/zoom**: when a viewport is active, its interior becomes interactive and pans/zooms independently of the page canvas, persisted per-viewport (`contentOffsetMm` + a per-viewport view-zoom). Reuse production's existing pan/zoom pattern; the page canvas ignores wheel while a viewport is active.
4. **Copy cursor**: page canvas cursor = `crosshair` in insert mode; floorplan interior cursor = `copy` when in add-shape/add-trunk mode.
5. **StatusBar.svelte**: contextual instruction strip at canvas bottom, derived from current mode (insert / activated-idle / drawing-trunk / placing-shape / N-selected). Port POC `StatusBar.svelte` messages. Tag `print:hidden`.
6. **Undo (Ctrl/⌘-Z) for viewport frame edits** *(user request)*: every viewport move/resize is reversible. The user still moves viewports by accident; the 4px threshold reduces it, undo is the safety net. Maintain an undo stack of viewport-geometry snapshots (`positionMm`/`widthMm`/`heightMm`/`rotationDeg` per viewport) pushed on drag/resize **commit** (not per-mousemove); Ctrl/⌘-Z pops and restores. Redo (Ctrl/⌘-Shift-Z) optional. Gate the key handler to skip when an input/textarea is focused. Scope v1 to frame geometry (position/size/rotation); extend to add/delete/source edits later.

Risk: medium (pointer-event layering). Acceptance: can't accidentally drag a viewport; dblclick enters; wheel zooms inside; status bar tracks mode; **Ctrl-Z reverts an accidental move/resize**; nothing of this prints.

### Phase 3 — DrawingMenubar (AutoCAD-like, incremental)
**Goal:** a real menubar, expandable over time.

Steps:
1. New `DrawingMenubar.svelte` (reuse the shadcn/bits Menubar already available in `lib/components/ui`). Tag `print:hidden`.
2. v1 menus:
   - **Insert** → Viewport (opens type+source picker, Phase 4), Text, Image, Shape ▸ (Rack/Outlet), Trunk, Annotation ▸ (Phase 7)
   - **View** → Zoom Fit, Zoom 100%, Scale presets (1:10/1:50/1:100…), Toggle Layers panel
   - **File** → Print, Export Package (PDF), Save state
   - **Edit** → Undo/Redo (wire to existing history), Delete, Duplicate
3. Insert items are context-gated: viewport-content items enabled only when a viewport is active (mirror POC `armShape`/`armTrunk`).

Risk: low–medium. Acceptance: menus drive existing actions; disabled states correct; hidden in print.

### Phase 4 — Viewport add-flow: type + source + native floorplan kind
**Goal:** adding a viewport prompts content **type** and **source**; add the editable `floorplan` kind.

Steps:
1. Add-viewport flow (from menubar/palette) opens a small picker: **type** (floorplan, rack-elevation, rack-plan, frame-detail, fillrate, outlets, patching, risers, survey, text, image) and **source** (floor, room, face, file/page as applicable). Production's sidebar already renders these per-kind pickers — reuse that logic at add-time instead of after-the-fact.
2. Add `floorplan` to the `ViewportSource` union: `{ kind:'floorplan-edit'; outletsDocId; fileId; pageNum; layers:{…} }` (distinct from the read-only `floorplan` PDF-section kind).
3. `FloorplanViewport.svelte`: read-only PDF underlay + `TrunkRenderer` + outlet/rack render by default; when its viewport is **activated**, mount the editing primitives (Phase 5).

Risk: medium. Acceptance: every new viewport gets correct type+source up front; a floorplan viewport shows live outlets data.

### Phase 5 — In-place floorplan editing + scale/world-scale
**Goal:** edit trunks/outlets/racks inside an activated floorplan viewport; finalize scale model.

Steps:
1. When a `floorplan-edit` viewport is active, reuse `OutletCanvas` editing primitives (`hitTestNode/Segment`, `constrainAngle`, `snapToNearby`, add/move/disconnect) operating on the **live** `outlets/{pid}_F{NN}` doc. Keep production's toggle-button tool switch (outlets/racks/trunks) — not a `<select>`.
2. **Exact scale**: viewport already has `scale` (1:N / 0=fit). Define the model:
   - `scale` = locked content scale (1mm world → (1/scale)·1mm paper).
   - Wheel inside an active viewport adjusts a **transient view-zoom** for comfort, but a "Set scale 1:N" (menubar/sidebar) re-locks content scale. A small readout shows the current effective scale.
3. **World scale**: make world-scale the single source of truth — same mm→paper factor used by (a) the static viewport render, (b) the nested activated pan/zoom, and (c) print (`PX_PER_MM`). Remove ad-hoc zoom-only scaling so 1:100 is exact on screen and on paper.

Risk: high (coordinate correctness + write-path to source doc). Acceptance: draw a trunk inside a drawing viewport → it appears in the Outlets tool; printed sheet measures true 1:100.

### Phase 6 — Trunk editing enhancements + Layers (data)
**Goal:** adopt the POC's *extra* trunk UX; add layer visibility.

Steps:
1. **Context menu** on trunk node/segment (in `OutletCanvas` + floorplan viewport): Insert node (at click), Disconnect node (if junction), **Select full trunk**, Delete node/segment. Port POC `TrunkOverlay` menu + `portal.ts`.
2. **Multi-segment angle snap**: add POC `snapNodeAngles` (least-squares) to production `outlets/trunks/geometry.ts`, used when dragging a junction node (Shift); keep `constrainAngle` for single-neighbor.
3. **Snap-ring indicator**: render a ring at the merge-target node while dragging (port POC `TrunkLayer` snap circle + `nearestNode`).
4. **Layers data**: extend the outlets `ViewportSource` (already has `showOutlets`/`showTrunks`) with `layers:{ outletsLow, outletsHigh, trunksPrimary, trunksSecondary, ceiling, floor }`. `TrunkRenderer`/outlet render gate groups by these.
5. *(Optional, quality)* Refactor `OutletCanvas` toward POC's Layer/Overlay/Shape + headless editor split.

Risk: medium. Acceptance: right-click gives the four actions incl. select-full-trunk; junction drag snaps all legs; snap-ring shows; layer flags hide/show groups.

### Phase 7 — Annotations
**Goal:** the missing annotation system.

Steps:
1. Data: `Page.annotations?: Annotation[]` (page-space mm) and/or `Viewport.annotations` (viewport-space). Types: `text`, `leader`, `dimension`, `revision-cloud`, `symbol`.
2. `AnnotationLayer.svelte` renders in SVG with `vector-effect="non-scaling-stroke"` (print-crisp). Select/move/edit; menubar Insert ▸ Annotation arms placement (copy-cursor).
3. Print-safe (selection chrome `data-no-print`).

Risk: medium. Acceptance: place/edit each annotation type; thin in PDF; selection hidden in print.

### Phase 8 — Title block + print polish
**Goal:** dev-tunable title block; verified thin lines in PDF.

Steps:
1. Port POC `TitleBlock.svelte` section-config (easy size/section adjustment) into production `drawings/parts/TitleBlock.svelte`; keep production's field/templating.
2. Use `vector-effect="non-scaling-stroke"` + `.dwg-line` weights for title-block + margin borders.
3. Verify `triggerPrint` hides `DrawingMenubar`, `StatusBar`, `LayersPanel`, selection/snap chrome (all tagged `print:hidden`/`data-no-print`).

Risk: low. Acceptance: dev can retune sections in code quickly; printed borders are hairline-thin; no UI chrome leaks into PDF.

---

## 4. Dependencies & sequencing

```
Phase 1 (files)         ── independent, ship anytime
Phase 2 (interaction)   ── foundation for 3,4,5,7
Phase 3 (menubar)       ── needs 2 (actions to drive)
Phase 4 (add type/src)  ── needs 2; enables 5
Phase 5 (edit+scale)    ── needs 4; highest risk
Phase 6 (trunk UX+layers) ── partly independent (outlets tool); layer-UI needs 4
Phase 7 (annotations)   ── needs 2 (+menubar 3)
Phase 8 (titleblock/print) ── needs 2; light
```

Recommended cut lines: **MVP** = Phases 1–4 (better drawing feel + correct add flow). **V1** = +5,6,8. **V1.1** = +7.

---

## Appendix A — Y-axis inversion (design-only, D3)

Goal later: floorplans use **positive-up** like elevations. For now, build so the flip is a one-line switch + a migration, never a scatter of sign changes.

- Centralize axis handling in one module (e.g. `lib/geometry/axis.ts`) exposing `worldToScreenY(y)` / `screenToWorldY(y)` and a `Y_UP` flag. All new canvas/viewport/annotation coordinate math goes through it.
- Do **not** invert stored data now. Document the migration: when flipping, run a one-off that negates `y` for floorplan-space records (outlet positions, trunk node `position.y`, room objects) per `outlets/{pid}_F{NN}` doc, gated by a `coordSchema: 'y-up'` marker so it's idempotent and old docs render correctly until migrated.
- Elevations already y-up — leave untouched.

## Appendix B — File provider migration (Phase 1 detail)

- Idempotent backfill: for each `files/*` without `provider`, set `provider:'uploadthing'`. Safe to re-run.
- New Firebase uploads store `{ provider:'firebase', path:'projects/{pid}/uploads/{id}_{name}', url:<downloadURL> }`. UploadThing keeps `{ provider:'uploadthing', key, url }`.
- Display/download read `url` uniformly; delete branches on `provider`.

## Appendix C — Do-not-port list (production already better)

- POC `<select>` tool switchers → use production toggle buttons.
- POC round-cap "cylinder" pipe rendering → use production miter-polygon `TrunkRenderer`.
- POC `ViewportConfig` (id/x/y/w/h only) → keep production's richer `Viewport` + `ViewportSource`.
- POC standalone project/toast/archiving → production equivalents already shipped.

## Appendix D — Open questions for later

1. Annotation coordinate space: page-level vs viewport-level vs both? (affects whether annotations pan with an activated viewport).
2. Should `floorplan-edit` viewports allow editing racks/outlets too, or trunks only in v1?
3. Layer presets — per-project default layer sets, or per-viewport only?
4. World-scale interaction: should wheel-zoom inside an active viewport be purely transient, or should it *redefine* the locked scale on release?
