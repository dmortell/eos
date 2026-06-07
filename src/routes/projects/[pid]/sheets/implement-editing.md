# Sheets — Tool Editing Implementation Plan

Builds on the completed read-only sheets tool (stages A–I). Two edit views over the **same** tool
content/editor:
1. **In-viewport quick edit** — edit directly inside the active viewport (as today). All
   viewports are editable by default (a per-viewport **lock** toggle to freeze one comes later).
2. **Model mode (full-screen toggle)** — like switching to model space in AutoCAD: **no page
   refresh**, the active viewport's content canvas is "raised" out of its viewport rect to fill
   the whole main content area (paper, margins, titleblock and other viewports hidden) with its
   own free pan/zoom for detailed work. Toggle back to return to the sheet (paper/layout) view.

Plus cross-cutting **layers, annotations, revisions, and text markup** that apply to every tool.

**Overriding constraint (from the spec):** keep each tool *lean*. Maximise re-use, minimise
lines per file. The lever is a **shared editing kernel** that every tool plugs into, so each
tool only contributes its data model + a thin set of mutations + a small handle/palette layer.

---

## 1. What already exists we build on

- **Read-only renders** (`tools/<tool>/*Render.svelte`) draw in **real-mm** inside an
  `<svg viewBox>`; they already compute fit/explicit-scale `viewBox` and report it via `onview`.
- **`Viewport.svelte`** hosts content; when *active* it pans/zooms the content (via
  `vps.setContentView`). Activation is the natural entry point for in-place editing.
- **Property windows** (`parts/Prop*.svelte`, `ViewportPropertiesWindow`) — the reusable field
  components and floating-window pattern carry straight over to edit panels.
- **The sample's `editor.svelte.ts` + `shapes.svelte.ts`** are a purpose-built *lean* headless
  model/view: a class owns `$state` objects + selection + drag, maps client→world via
  `svg.getScreenCTM().inverse()`, and attaches window drag listeners. **This is the template for
  every tool editor**, and the outlets editor is ~90% of it already.

Key enabling fact: because each render's `<svg>` has a real-mm `viewBox`,
`svg.getScreenCTM().inverse()` maps a screen point straight to **real-mm** — through the canvas
pan/zoom *and* the viewport scale, in one call. That single primitive is the foundation of all
editing and is written once.

---

## 2. The shared editing kernel (`sheets/edit/`) — build once, reuse everywhere

| File | Responsibility | ~lines |
|---|---|---|
| `surface.svelte.ts` | `SurfaceEditor` base class: `svg` ref, `toWorld(e)`/`toWorldXY`/`screenScale`, a generic selection set, drag-listener helpers (`startDrag`/`cancelDrag`), marquee, `onChange` hook. Tool editors **extend** it. | ~120 |
| `RenderFrame.svelte` | The `<svg>` host: owns the fit/explicit-scale **viewBox + `onview`** logic currently duplicated in all three renders. Slots in a tool *scene* + an optional *edit layer*. Used by viewports. | ~70 |
| `Handles.svelte` | Shared SVG handle primitives: `<Dot>`, `<SelectionBox>`, `<RotateHandle>`, `<EdgeStrip>` — counter-scaled to a steady on-screen size via the surface's `screenScale`. | ~80 |
| `Toolbar.svelte` | Floating in-content toolbar (mode buttons: select / add-X / annotate), portaled over the active viewport / model view. Reuses `$lib` Button/Icon. | ~60 |
| `persist.ts` | `docSaver(db, path)` → debounced merge-write; `$state.snapshot` unwrap. One helper for outlets/racks/risers/sheet docs. | ~30 |
| `ModelView.svelte` | Full-area host for **model mode**: own free pan/zoom (independent of the paper), mounts the **same** `<Scene>` + `<EditLayer>` + tool palette + panels. Mounted *in place* (a `$state` toggle in `SheetEditor`), **no route / no refresh** — it overlays the content area while the paper view is hidden. | ~90 |

**Refactor the renders into scene + frame (DRY + clean edit-layer compositing + reuse in model mode).**
Split each `*Render.svelte` into:
- `<Tool>Scene.svelte` — *pure drawing only* (children of an `<svg>`, draws in real-mm). No
  viewBox, no svg element. This is the read-only visual, reused by both hosts.
- The `<svg viewBox>` lives in the shared **`RenderFrame`** (viewport, viewBox = `vp.scale` /
  fit) and in **`ModelView`** (full area, free pan/zoom). Both render `<Scene>` + (when active and
  unlocked) an `<EditLayer>` **inside the same svg** — handles share the scene's exact real-mm
  space, and the editor binds that one `<svg>` for `toWorld`.

Net effect: viewBox/scale/onview logic lives in **one** file instead of three; the same scene +
edit layer + editor serve the small viewport **and** full-screen model mode unchanged.

**Tool editor pattern (each ~150–250 lines, mostly mutations):**
```
class <Tool>Editor extends SurfaceEditor {
  // $state slices of the tool doc (e.g. outlets, trunks, racks)
  // selection (inherited), tool-specific drag types
  // add / move / resize / delete / setProp mutations
  // onChange() → persist.docSaver writes the slice back to the source doc
}
```
Editors are headless (`.svelte.ts`); the `<EditLayer>` and `<Palette>` are thin DOM wiring,
mirroring the sample's `TrunkLayer` / `ShapeLayer` / `TrunkOverlay` split.

---

## 3. Editing integration — two views, one editor

Both views host the **same** `<Tool>Editor` instance + `<Scene>` + `<EditLayer>`; only the frame
around them differs, so the editor is written once.

- **In-viewport quick edit:** when a viewport is active (and not locked), `RenderFrame` mounts the
  `<EditLayer>` + a compact `Toolbar` inside the viewport; a small property strip (reusing
  `Prop*`) edits the selection. Pointer mapping while active:
  - **left-drag** → select / move / draw objects (the editor).
  - **middle/right-drag** → pan the **viewport content** (not the paper canvas). *This changes
    current behaviour:* the active viewport intercepts middle/right `mousedown` and
    `stopPropagation` so the outer Canvas no longer pans the paper; content pan moves to those
    buttons (freeing left for editing). Wheel still zooms the content.
  - **Esc** → deactivate. Per-viewport `locked` (later) disables the edit layer.
- **Model mode (full-screen toggle):** a "⤢ Model" button on the active viewport sets
  `SheetEditor.modelVpId` (a `$state`). While set, the paper view is hidden and `ModelView`
  fills the content area with the same scene/edit layer at its own free pan/zoom. No route, no
  refresh, no re-subscribe — same editor, just re-hosted. A "⤡ Sheet" button / Esc toggles back.

**Persistence:** editors mutate the **source tool docs** (`outlets/{id}`, `racks/{id}`,
`risers/{pid}`) — the single source of truth shared with the standalone tools and every sheet
that references them. `persist.docSaver` debounces merge-writes. (Layers list is project-scoped;
annotations/revisions are sheet/viewport-scoped — see §5.)

---

## 4. Per-tool editing (lean; reuse the sample + existing geometry)

### Stage E1 — Outlets editing  *(start here; the sample IS the lean outlets editor)*
- `OutletsEditor extends SurfaceEditor`: port the sample's `ShapeEditor` (outlets + rack
  placements: add/move/rotate/resize/delete, last-used defaults) and `TrunkEditor` (trunk
  nodes/segments: draw, drag, insert/delete node, merge/join, 15° snap, width/shape) **almost
  verbatim** — they already match the outlets data model. Adapt types to `tools/outlets/types.ts`,
  reuse `tools/outlets/geometry.ts`.
- `OutletsEditLayer.svelte` + `OutletsPalette.svelte` from the sample's `TrunkLayer`/`ShapeLayer`/
  `TrunkOverlay`, trimmed.
- Write-back: `outlets`, `trunks`, `rackPlacements` slices → `outlets/{docId}`.
- **Done when:** in an active outlets viewport you can add/move/delete an outlet, draw/edit a
  trunk, place a rack; changes persist to the outlets doc and show in the standalone tool.

### Stage E2 — Racks editing
- `RacksEditor`: add/move/relabel racks (elevation order + plan origin/rotation); add/move/delete
  **devices** (drag between U-slots, set positionU/heightU/mounting/offset); set device type;
  **port labels** on panels/devices; **patch lists / patch cords** shown in the elevation.
- Sub-stages by weight: (a) racks + devices basic; (b) catalog/library picker (reuse a Prop
  dropdown backed by the existing catalog subscription); (c) port labels; (d) patch cords.
- Reuse the RU/positionU math already in `RacksScene`. Write-back to `racks/{docId}`.

### Stage E3 — Risers editing
- `RisersEditor`: edit floor heights; add/move server & EPS rooms; add/move ladders (x, floor
  span, level); **cable route editor** (hop list: room → ladder → room, per-hop level). Reuse the
  pure `engine.ts` for geometry; the editor only mutates the doc. Write-back to `risers/{pid}`.
- Cable routing is the heaviest piece — a small hop-editor panel (reuse Prop components), not a
  freehand tool.

---

## 5. Cross-cutting features (built once, used by every tool)

### Layers  (`sheets/layers/`)
- **Project-scoped layer list** (`projects/{pid}.layers` or a `layers/{pid}` doc): `{ id, name,
  color, defaultVisible, defaultLocked }[]`. Project scope (not per-model) so layers are defined
  once and reused on every floor/drawing — no re-creating "Outlets / Trunks / Annotations" on each
  one.
- Every editable object carries `layerId?` (a default layer per object kind so existing data Just
  Works).
- **Per-viewport overrides, independent of the model and of other viewports:** each
  `SheetViewport` stores `layerOverrides: Record<layerId, { hidden?: boolean; locked?: boolean }>`.
  So a viewport can hide *or* **lock** a layer without affecting the underlying model, the project
  list, or any other viewport. Scenes filter by effective visibility; the edit layer ignores
  hit-tests on locked (or hidden) layers.
- Shared `LayersPanel.svelte` (floating window): per layer, a **visibility** toggle and a **lock**
  toggle (both writing the active viewport's overrides), plus add/rename/recolor of the
  project-level layers.

### Annotations  (`sheets/annotations/`)
- One shared model + editor + layer for: `text box`, `callout`, `arrow line`, `revision cloud`,
  `dimension line`, `symbol`. **Annotations live inside viewports (model-space)** — they pan/zoom
  with the content. (Each annotation carries `space?: 'model' | 'paper'`, defaulting to `model`;
  a per-object paper-space toggle is a later option, not v1.) Stored per-viewport.
- `AnnotationEditor extends SurfaceEditor`, `AnnotationLayer.svelte`, `AnnotationToolbar.svelte`.
  Symbols are a small registry (`symbols/registry.ts`) so new symbols are data, not code.
- **Linked symbols:** a symbol may carry a `link` — `{ kind:'drawing', sheetId/ref }` (section
  markers) or `{ kind:'photo', surveyId, photoId }` (photo markers, with position+direction).
  Click-through navigates; the registry renders the glyph. Survey-photo linkage reuses the
  existing surveys collection.

### Revisions  (`sheets/revisions/`)
- `SheetDoc.revisions: { code, date, note, by }[]` + `currentRevision`. Titleblock already reads a
  `revision` field — feed it the current code. A `RevisionsPanel` adds/edits entries; detailed
  notes are tracked but not drawn unless a "revision table" annotation is placed.

### Text viewport markup  (`tools/text/`)
- Upgrade `TextViewport` to a lightweight markup renderer: numbered headings, bold/italic,
  columns, simple tables. Prefer an existing tiny markdown-ish parser over a heavy editor; render
  to styled HTML inside the viewport (already HTML-based, so it prints fine).

---

## 6. Target file layout (additions)

```
sheets/
  edit/
    surface.svelte.ts        # SurfaceEditor base (coords, selection, drag, marquee)
    RenderFrame.svelte       # viewport <svg viewBox> host (fit/scale + onview) + edit-layer slot
    ModelView.svelte         # full-area model-mode host (free pan/zoom); in-place toggle, no route
    Handles.svelte           # Dot / SelectionBox / RotateHandle / EdgeStrip
    Toolbar.svelte           # in-content mode toolbar
    persist.ts               # debounced doc saver
  layers/        LayersPanel.svelte, layers.svelte.ts
  annotations/   AnnotationEditor.svelte.ts, AnnotationLayer.svelte, AnnotationToolbar.svelte, symbols/registry.ts
  revisions/     RevisionsPanel.svelte
  tools/<tool>/
    <Tool>Scene.svelte       # pure visual (split out of current *Render.svelte)
    <tool>-editor.svelte.ts  # <Tool>Editor extends SurfaceEditor
    <Tool>EditLayer.svelte   # handles + hit-areas, bound to the editor (edit-only)
    <Tool>Palette.svelte     # add/tool toolbar + selected-object property strip
```
Each `*Render.svelte` shrinks to `<RenderFrame>` wrapping its `<Scene>` (+ edit layer); the bulk
moves into the shared kernel and a small per-tool editor.

---

## 7. Sequence & dependencies

| Stage | Deliverable | Depends on |
|---|---|---|
| **K** | Shared kernel: `surface`, `RenderFrame` (+ edit-layer slot + middle/right content-pan), `Handles`, `persist`; split renders into Scene+Frame (no behavior change) | — |
| **M** | Model mode: `ModelView` full-area host + `modelVpId` toggle + ⤢/⤡ buttons (read-only scene first) | K |
| **E1** | Outlets editing (port sample editors) — proves the edit→persist loop in both views | K, M |
| **L** | Layers (project list + per-viewport visibility **and lock** overrides + panel) | K |
| **E2** | Racks editing (racks→devices→port labels; **catalog/patch deferred to a later phase**) | E1 |
| **E3** | Risers editing (floors→rooms→ladders→cable routes) | E1 |
| **A** | Annotations (shared model/editor/layer/toolbar + symbol registry, model-space) | K |
| **A2**| Linked symbols (section→drawing, photo→survey) | A |
| **R** | Revisions (SheetDoc + panel + titleblock wiring) | — |
| **T** | Text markup viewport | — |

Recommended order: **K → M → E1**, validate the edit→persist loop in both views, then **L** (cheap,
high value), then **E2/E3**, then **A/A2**, then **R/T**. Racks (devices) and Annotations are the
largest surfaces; the rack catalog + patch-cord machinery is explicitly a **later phase**.

---

## 8. Leanness tactics (how we hit the line-count goal)

- **One coordinate/selection/drag implementation** (`SurfaceEditor`) instead of per-tool copies —
  removes ~150 duplicated lines per tool.
- **One viewBox/scale/onview host** (`RenderFrame`) instead of three — and one place to composite
  the edit overlay; the scene + edit layer + editor are reused as-is in **model mode**, so the
  full-screen view costs only a thin `ModelView` host, not a second editor.
- **Reuse the sample's editors verbatim** for outlets; reuse `geometry.ts`/`engine.ts` (pure) for
  the math — no re-derivation.
- **Shared handle + Prop + Window components** for every palette/panel.
- **Annotations/layers/revisions written once**, tool-agnostic.
- Headless editors (`.svelte.ts`) keep DOM files tiny; scenes stay pure (no editing code on the
  read-only/print path).

---

## 9. Decisions (locked) & remaining questions

**Decided (incorporated above):**
1. **Two edit views, same editor:** in-viewport quick edit + a **model-mode full-screen toggle**
   (in place, no route/refresh — the canvas is re-hosted out of the viewport to fill the content
   area). All viewports editable by default; a per-viewport **lock** toggle comes later.
2. **Edits write to the shared source doc** (outlets/racks/risers) — single source of truth across
   the standalone tools and all sheets.
3. **Annotations live inside viewports (model-space)**; per-object model⇄paper toggle is a later
   option, not v1.
4. **Layers: project-scoped list**, with **per-viewport visibility *and* lock** overrides that are
   independent of the model and of other viewports.
5. **Pointer mapping:** active viewport — left-drag edits; **middle/right-drag pans the content**
   (intercepted so the paper canvas no longer pans); wheel zooms content.
6. **Rack catalog + patch lists/cords: deferred to a later phase.** Racks v1 = racks + devices +
   port labels.

**Still open:**
- **Object selection across layers/kinds:** a single shared selection model in `SurfaceEditor`, or
  keep tool-specific selection shapes (sample uses tool-specific)? *Lean toward a generic
  `selected: {kind,id}[]` in the base, tools narrow it.*
- **Where to store the project layer list:** a field on `projects/{pid}` vs a dedicated
  `layers/{pid}` doc. *Lean toward `layers/{pid}` to avoid bloating the project doc.*
