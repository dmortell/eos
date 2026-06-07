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

### Phase 4 — Viewport add-flow: type + source  ✅ (shipped)
**Goal:** adding a viewport prompts content **type** and **source** up front.

Shipped:
1. `AddViewportDialog.svelte` — two-step modal (pick **type** → bind **source** with proper controls: floor/room/face selects, a real **file dropdown** for floorplans, outlets/trunks toggles, text/image fields, optional label). Wired to menubar **Insert ▸ Viewport…** (full type step) and the sidebar palette (jumps straight to the source step for the clicked kind). Replaced the old "add blank → hunt in sidebar" flow (`addViewport`/`defaultSourceFor` removed; new `createViewport(source, label)`).
2. **Discovery — no new `floorplan-edit` kind needed.** Production's existing **`outlets`** viewport already renders the floorplan PDF underlay + `TrunkRenderer` trunks + outlet dots (read-only, calibration-aware). That IS the floorplan drawing, so the hybrid in-place editing target in Phase 5 is the **`outlets`** viewport (make it editable when activated) — not a new kind. The original plan's `floorplan-edit` idea is dropped.

Acceptance (met): every new viewport gets a correct, non-empty source up front; floorplan picks a real uploaded file.

### Phase 5a — World-scale + exact scale for the floorplan/outlets viewport  ✅ (shipped)
**Goal:** make `viewport.scale` (1:N) and `contentOffsetMm` actually drive the floorplan/outlets viewport.

Shipped:
- `OutletsViewport.svelte` previously used `object-contain` (fit-to-frame), ignoring scale + pan — the "world scale not implemented" gap. Now it renders the PDF page at natural px and applies `transform: scale(scaleFactor / viewport.scale) translate(pan)` so **1 real-world mm → (1/N) paper-mm** (true 1:N), panned by `contentOffsetMm`. `scale === 0` = fit-to-viewport, centred (the old behaviour, now the explicit "Fit" option).
- Exact scale is now end-to-end: menubar **View ▸ Viewport scale** presets + sidebar scale input set `viewport.scale`; Alt-wheel / active-wheel nudge it; the floorplan honours it on screen and (via the same transform) in print.
- New floorplan/outlets viewports default to **Fit** (`scale 0`) so they show the whole plan on add.

Mirrors the working pattern in `RackElevationViewport` (`innerScale = 2 / scale`, translate by `contentOffsetMm`). `FloorplanViewport` (plain PDF section, no calibration) stays fit-to-frame — true 1:N needs calibration, which only the `outlets` viewport carries.

> **Migration note:** existing `outlets` viewports saved with `scale = 100` now honour it (1:100 window) instead of fitting. Set them to **Fit to viewport** (View ▸ Viewport scale) if the old whole-plan look is wanted.

### Phase 5b — In-place editing inside an activated `outlets` viewport  ✅ (move-existing)
**Goal:** edit floorplan content in-place, writing to the live `outlets/{pid}_F{NN}` doc.

Shipped:
- `OutletsViewport` `active` mode: double-click in → SVG becomes interactive (`pointer-events`), and **left-drag repositions existing outlets *and* trunk nodes**, persisting straight to the live `outlets/{pid}_F{NN}` doc (`db.save` merge replaces just the outlets/trunks array). Client→mm uses the SVG `getScreenCTM()` (accounts for every canvas transform). Drag-on-element uses **mouse** events + `stopPropagation` so the frame's middle/right pan is suppressed; **middle/right-drag pans** the content (unified model); optimistic positions hold until the doc echoes back (no flash). Cyan **node handles** appear when active so trunk vertices are discoverable; outlets are already dots.

Still outstanding (later):
- **Adding** new outlets/trunks and other edits (disconnect/insert) inside the viewport — needs a small tool palette + mode in the viewport. The heavier alternative (mount the full `OutletCanvas` in the viewport — it's self-contained: no context/stores) remains possible but brings tool/legend/print chrome; deferred.

Risk: realised medium. Acceptance (met): drag an outlet or trunk node inside a drawing viewport → it moves in the Outlets tool too.

### Phase 6b — Trunk editing extras (outlets tool)  ✅ (shipped)
**Goal:** adopt the POC's *extra* trunk-editing UX in the `outlets` editing tool.

Shipped:
1. **Context menu** on right-clicking a trunk node/segment (`OutletCanvas`): node → *Disconnect node* (if junction) / *Select full trunk* / *Delete trunk*; segment → *Insert node here* / *Select full trunk* / *Delete trunk*. Portaled to `<body>` (`outlets/trunks/portal.ts`) so it escapes the canvas transforms; a `panMoved` flag suppresses the menu that trails a right-drag pan, so right-drag still pans. Replaces the old immediate right-click-disconnect (now an explicit menu item).
2. **Multi-segment angle snap**: `snapNodeAngles` (least-squares) ported to `outlets/trunks/geometry.ts`; Shift-dragging a junction node now snaps **every** connected segment to 15° (single-neighbour still falls back to `constrainAngle`).
3. **Snap-ring** already existed in production (`dragSnapHighlight`, `OutletCanvas`) — no change needed.

Risk: realised low–medium. Acceptance (met): right-click menu offers the four actions incl. select-full-trunk; junction Shift-drag snaps all legs; snap-ring shows.

### Phase 6a — Viewport layers  ✅ (shipped)
**Goal:** per-viewport control of what shows on a floorplan/outlets viewport.

Shipped:
- `OutletsLayers` added to the outlets `ViewportSource` (`$lib/types/pages.ts`): `{ outletsLow, outletsHigh, trunksPrimary, trunksSecondary, ceiling, floor }`, all default visible. `showOutlets`/`showTrunks` remain the master toggles.
- `OutletsViewport.svelte` filters outlets by `level` (low/high) and trunks by `isPrimary` (primary/secondary) + `location` (ceiling-* vs floor/wall) before rendering; the filtered trunk list feeds `TrunkRenderer`.
- Sidebar (outlets viewport): a **Layers** section with checkboxes — Outlets Low/High, Trunks Primary/Secondary/Ceiling/Floor — gated under the relevant master toggle.

Acceptance (met): one page can show low-level + floor trunks while another shows high-level + ceiling, from the same source doc.

### Phase 7 — Annotations  ◑ (text + arrow shipped)
**Goal:** the missing annotation system.

Shipped:
- Data: `Page.annotations?: Annotation[]` (page-space mm). `Annotation` carries `kind: 'text' | 'arrow'` (+ `endMm` for arrows); room for dimension/revision-cloud/symbol.
- `AnnotationLayer.svelte` renders **text** as HTML divs (pt→mm font, inline edit) and **arrows** as an SVG line + arrowhead with `vector-effect="non-scaling-stroke"` (crisp hairline at any zoom + PDF; a transparent wide hit-line makes thin arrows easy to grab).
- **Menubar Insert ▸ Text / Arrow annotation** arms placement. A copy-cursor **capture overlay** sits above the whole paper (so placing works even **over a viewport** — the fix this round): text = click to place; arrow = **drag start→end** with a live dashed preview. Select + drag (4px threshold) to move (arrow moves both ends); double-click text to edit inline; Del removes; Esc cancels/deselects. Zero-length arrows are ignored.
- Persists to the page doc; included in version restore; print-safe (selection chrome `print:*`, cleared in `handlePrint`).

Still outstanding (next):
- **dimension, revision-cloud, symbol** kinds; arrow **endpoint** editing (move whole arrow only for now); a sidebar editor for font size / colour / arrow style.

Risk: realised low–medium. Acceptance (met): place/move/edit/delete text + arrows, incl. over viewports; crisp in PDF; selection hidden in print.

---

## Print fix (post-Phase-8)  ✅
The page editor printed the whole pan/zoom canvas as-is. Reworked `PageCanvas.doPrint` to the `src-sample/Canvas.svelte` technique: on print the **canvas becomes the print-root** (`position:fixed`, sized to the paper `@page`), and its content wrapper (`.panzoom-content`) is **scaled by `PX_PER_MM`** so 1 world-unit (1mm at zoom 1) maps to a real millimetre — the paper sheet alone fills the page. Injected CSS uses `!important`, overriding the live pan/zoom, so no save/restore of view state. Chrome stays hidden via its own `print:hidden`.

### Phase 8 — Title block + print polish  ✅ (shipped)
**Goal:** dev-tunable title block; thin lines in PDF.

Shipped:
1. **Data-driven title block** — production `TitleBlock.svelte` rewritten onto the POC's section-config engine: a single `sections` array (relative row heights `h`, `0`=grow; per-section `cols` with relative widths `w`; cell kinds incl. an `identity` block) drives **both** the text grid and the divider lines. All three templates (standard / compact / vertical) are now just different section configs — a dev tunes a drawing's layout by editing the array. Same fields/priority resolution as before.
2. **Crisp hairlines** — every divider + the outer frame is an SVG overlay of `vector-effect="non-scaling-stroke"` `.dwg-line` strokes (shared class now in `layout.css`), replacing per-template CSS borders. The **page margin** frame (`PageCanvas`) switched from a dashed `print:hidden` guide to the same non-scaling `.dwg-line` rect — so it prints as a thin, crisp drawing border. Constant weight at any zoom and in PDF; tune via `--dwg-w` / `--dwg-c`.
3. **Print chrome** — `DrawingMenubar` + `StatusBar` carry `print:hidden`; sidebar is `sidebar-area` (hidden by the print-handler); selection handles/active node handles are gated off because `handlePrint` clears selection+active before printing. Title block + margin intentionally print.

Risk: realised low. Acceptance (met): sections editable in code; printed borders are hairline-thin; no UI chrome in the PDF.

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

-1. **Pan/zoom consistency — unify input methods.**  ✅ (resolved)
   Unified model shipped across the drawing surfaces (`PageCanvas` + `ViewportFrame`):
   - **Wheel = zoom at cursor**, everywhere — the page canvas when no viewport is active; the active viewport's *content* when one is (its handler stops propagation so the page doesn't also zoom). **Any** wheel zooms: plain wheel (AutoCAD-style, the primary model) *and* right/middle-button-held wheel (kept for habit). In the outlets tool a right-held wheel is treated as activity so it doesn't pop the trunk context menu on release.
   - **Middle- or right-drag = pan**, everywhere — pans the page, or the *active viewport's content* when one is active. The active `ViewportFrame` now intercepts middle/right-drag and `stopPropagation`s, **fixing the bug** where right-drag over an active viewport panned the whole page.
   - **Left = interaction only** — drag a *selected* frame to move it; edit content in an *active* viewport (left swallowed so it can't deselect); click empty page to deselect.
   - **Dropped** Alt+drag / Alt+wheel on inactive viewports (the disliked inconsistency). To pan/zoom a viewport's content you double-click in first.
   **Outlets editing tool aligned too:** `OutletCanvas` now zooms on plain wheel at the cursor (was Ctrl/right-button-gated, with plain-wheel scroll-pan) — pan stays middle/right-drag. The whole app now shares the wheel=zoom / middle-right-drag=pan model.
0. **Selection model — revisit for annotations.** Phase 2 shipped *select-first + 4px threshold* (a click anywhere on the viewport selects; a deliberate drag moves). The eos2 POC actually selects **only** when clicking/marquee-dragging across the *frame border* — clicking the content does **not** select. We left it as-is because Ctrl-Z undo covers accidental moves well. **Revisit** if/when annotations land: editing annotations inside a viewport will likely need clicking content to *not* select/move the frame, so we may want the POC's frame-border-only selection (+ marquee) then.
1. Annotation coordinate space: page-level vs viewport-level vs both? (affects whether annotations pan with an activated viewport).
2. Should `floorplan-edit` viewports allow editing racks/outlets too, or trunks only in v1?
3. Layer presets — per-project default layer sets, or per-viewport only?
4. World-scale interaction: should wheel-zoom inside an active viewport be purely transient, or should it *redefine* the locked scale on release?



Titlebar currently only has a Home button, but I think a back-button (left-chevron or left-arrow icon) would work better for deeper routes, and we can then remove the "Back to drawings" link in the pages\[pageid]\+page.svelte sidebar.

Add a note that I'm not keen on having different methods of pan/zoom (right-wheel and right-drag for most drawings, and alt+wheel/drag for viewport contents when not active, and wheel/drag on active viewports). We need to be consistent (middle or right-wheel/drag is my preference).

On active viewports right-wheel correctly zooms, but right-drag drags the whole canvas around instead of the active viewport contents.

Show the current viewport scale (1:10 or 1:100, etc) in the hint message below the viewport for debugging. The scale shown in sidebar seems off, 1:5 is shown for a floorplan instead of a more realistic 1:50 or 1:100.

When I resize a viewport, the content changes size to fit. This should not happen, content should remain at the scaled/zoom size.