# Pages tool — TODO / roadmap

Working notes for the Kestrel-style **Pages** workspace mockup
(`src/routes/projects/[pid]/pages/`). Self-contained mock today (local runes
state, no Firestore). This file tracks what's left to reach a real tool.

Legend: `[ ]` todo · `[~]` partial · `[x]` done · **(P1)** near-term · **(P2)**
after UX settles · **(P3)** later / needs design. `◧ decide` = needs your pick.

---

## 0. Bugs / quick wins  (P1)
- [x] **Closing the last page tab no longer spawns "Untitled"** — panes fall to a "No page
  open" empty state (with an icon + New-page button); open a drawing from the sidebar.
- [x] `navFit` now uses a **bound per-pane canvas ref** (`canvasEls[pi]`) instead of
  `querySelectorAll('.canvas')[focused]`. (Print still targets `.pane.focused .paper` —
  class-based, reliable.)
- [x] Shared constants extracted to **`pages/constants.ts`** (`BASE`, `HANDLE_PX`,
  `PAPER_W/H`); Viewport/PaperPage/+page import them (paper size now inline-styled).

## 1. Interaction parity with the Sheets tool  (P1)
- [ ] ◧ **decide** — Mouse/touch model: choose whether Pages matches Sheets or keeps its
  current model. **Comparison table below** — mark the column you want per row.
- [ ] **Shift-key constraints** while drawing (match Sheets): ortho/45° for lines,
  square for rectangles, from-centre / equal-radius for circles. Wire to a live
  modifier read during draft + preview.
- [ ] Snapping: grid snap + object snap (osnap) driven by the status-bar toggles (see §9).

### 1a. Mouse / touch: Pages vs Sheets  ◧ decide
> From a review of the Sheets tool. Tick the version you want for Pages per row
> (or write your own). The big divergences are the wheel, the draw gesture, the
> marquee, and the 1-finger touch.

| Interaction | **Pages (now)** | **Sheets (now)** | Prefer? |
|---|---|---|---|
| Wheel (no modifier) | **Zoom** at cursor | **Pan**; zoom needs Ctrl/Alt/Meta or right-btn | ☐ / ☐ |
| Pan (mouse) | Right- or middle-drag | Right- or middle-drag | _same_ |
| Draw a line/rect/circle | **Two clicks** (start, end) | **One press-drag-release** | ☐ / ☐ |
| Marquee select | **Window (L→R) vs Crossing (R→L)** | **Always crossing**, direction-agnostic | ☐ / ☐ |
| Add to selection | not yet | **Shift/Ctrl-click, Shift-marquee** | → adopt |
| Ctrl-drag | not yet | **Duplicate the selection** | → adopt |
| Shift while **drawing** | none | none | _same (neither constrains)_ |
| Shift while **moving** | none | **Ortho / axis-lock** | → adopt (§1) |
| Shift while **resizing** | none | **Square / equal** | → adopt (§1) |
| Rotate | no rotate yet | snaps 15°, Shift = free | → adopt |
| Line-endpoint drag | free | Shift = 15° increments | → adopt |
| **1-finger touch** | **Draw / select / edit** (never pans) | **Pans** empty bg, else object drag | ☐ / ☐ |
| 2-finger touch | Pan + pinch-zoom | Pan + pinch-zoom | _same_ |
| Activate a viewport | Double-click | Double-click | _same_ |
| Pick a viewport frame | Border-click or marquee (not interior) | Border/marquee (not interior) | _same_ |
| Active-viewport pan/zoom | Both live, by cursor position | **Off by default**, toggled per-viewport | ☐ / ☐ |

Notes: Sheets does **not** constrain drawing with Shift (only moving/resizing/rotating),
and its marquee is always "crossing". Pages currently has the richer window/crossing
marquee and constant-lineweight draw, but no additive select / duplicate / move-ortho yet.

## 2. Drawing objects, tools & annotations
- [ ] ◧ **decide** — pick which Sheets insertable-object + annotation types to implement in
  Pages (**checklist below**).
- [ ] **Ellipses** (P1).
- [ ] **Blocks + block library** — define, instance, place; a browsable library panel (P2).
- [ ] **Trunks & conduits** (from Sheets): node/segment graph with handle editing (drag
  node, dbl-click segment to add a point, Ctrl-drag to branch, Shift = 15°). Sheets stores
  **one width + one bend-radius per trunk**; your ask = **width per segment** + **bend radius
  per corner** with handles — that's beyond the 2D outlets trunk, but the model3d **conduit**
  already has per-segment `w/h/edges`, so borrow that model (P2).
- [ ] **Edit-in-place for text** objects (inline editing, not a dialog) (P1).
- [ ] Section / elevation views generated from floorplans → **objects need 3D data**
  (heights/extrusion) so cuts can be produced (P3).
- [ ] Kestrel **WCS orientation cube** (liked) (P2).
- [ ] More Kestrel tools, surfaced through the **menubar** first; move to a **ribbon** only
  if menus get unwieldy (P2).
- [ ] Optional **Kestrel command line** for AutoCAD users (low priority — Dave doesn't use it) (P3).

### 2a. Insertable objects & annotation types from Sheets  ◧ decide
> The full Sheets set — tick the ones to bring into Pages. (Pages already has
> line, rect, circle, dimension, text.)

**Annotation kinds** (Sheets stores these _per-viewport_):
- [ ] text · [ ] line · [ ] arrow · [ ] rect · [ ] **ellipse** · [ ] **cloud** (revision cloud)
- [ ] callout (leader + text box) · [ ] dimension · [ ] image (raster) · [ ] **grid** (floor-tile, origin-aligned)
- [ ] **legend** (auto-lists layers w/ swatches + counts) · [ ] symbol (see below)

**Symbols** (the `symbol` kind, from the registry):
- [ ] section marker (linkable to a drawing) · [ ] elevation/section tag (up to 4 arms) · [ ] detail marker
- [ ] photo marker (linkable to a photo) · [ ] north arrow · [ ] outlet · [ ] faceplate/wall-outlet · [ ] door

**Tool-objects** (placed inside a source viewport, live in the tool's own data):
- [ ] outlet · [ ] trunk · [ ] rack · [ ] (racks devices / risers / model3d prisms-walls-conduits render read-only on a sheet)

**Blocks / library:** Sheets has a **Shape Library** — built-in + custom shapes (saved
globally in Firestore `library`), drag-to-place; it **copies geometry** (no true "block
instance that updates all copies"). Also a separate **rack device library**.
- [ ] Shape/annotation library (built-in + custom, drag-to-place)
- [ ] **True blocks** (instances update together) — *beyond Sheets; your explicit ask*

**Text editing:** Sheets edits annotation text in the **side panel** (double-click / F2
jumps focus there), *not* in-place. Your ask = **in-place canvas text** → an improvement
over Sheets.

**Imported backgrounds:** Sheets shows **one** PDF/image page per outlets viewport
(`fileId`+`pageNum`, with origin/scale/crop from the `files/{id}` doc); model3d supports
several **underlays** per direction. **No DXF import** (DXF is export-only). Your asks
(multiple swappable backgrounds; DXF import; set origin/crop in-viewport) are **beyond
Sheets** — see §3/§4.

**Revisions:** Sheets has a title-block **revision table**, the **cloud** annotation, and
in-session **undo/redo** snapshots — but **no diff/compare between revisions**. Your ask
(revision points you can switch between to see differences for clouding) is **beyond
Sheets' basic version** — see §10.

## 3. Layers  (P1)
> Design target: the annotated reference image (`src/routes/ui/ChatGPT Image …png`) —
> a right-side LAYERS panel with **View Presets**, nested groups, eye toggles, colour/line
> swatches. **UI built** (`parts/LayersPanel.svelte`); wiring is the remaining work.
- [~] Right-side **Layers panel UI** — done (nested groups, eye toggles, swatches, View
  Preset picker, New Layer). Mock state only.
- [ ] **Wire it up** — real show/hide/lock, active layer, per-object layer assignment,
  layer of new objects; apply a **View Preset** = a saved set of layer visibilities.
- [ ] **Background layers** — import one or more PDF / image / DXF files as background
  layers that can be toggled/swapped (e.g. compare floorplan vs RCP). Replaces the
  Sheets "one background PDF" limitation.

## 4. Imported files / floorplans  (P1–P2)
- [ ] Upload & manage many floorplan drawings per project — **electrical, furniture, AV,
  etc.**, with **versions / checkbacks** (we receive many revisions).
- [ ] Set **origin, scale, crop, masks** of an imported file **inside the Pages viewport**
  (no switch to the Uploads tool).
- [ ] Supported inputs: **PDF, image, DXF**.
- [ ] Produce various floorplan **views**: data-outlet locations, desk numbering, trunk
  routes, penetration & conduit requests (these are the output deliverables).

## 5. Views  (P2)
- [ ] **View types like the Sheets tool** — Pages views should support the same set of view
  kinds (list to be confirmed alongside §2a).
- [ ] Multiple views of one model at different scales/crops on a sheet (viewport frames
  already support this — needs per-view content config).

## 6. Annotations  (P2)
- [ ] Annotation objects, with a distinction between **per-view** annotations and ones
  **promoted to model space** so they appear across multiple views.
- [ ] Move an annotation view→model (and back).

## 7. Properties panel  (P1–P2)
- [ ] **Multi-select editing** — the Properties sidepanel edits the **common props of all
  selected objects** (mixed values shown appropriately).
- [ ] Live two-way binding to the selected entities (currently mock inputs).

## 8. Project tree ↔ Pages linkage  (P2)
> Design target: the reference image's **Drawing Navigator** (left) — a location tree
> (Floors / Server Rooms / Data Center / Racks) whose leaves are drawings/views that open
> as tabs. **UI built** (`parts/DrawingNavigator.svelte`, mock tree; clicking a leaf opens
> a tab). Also mirrors the reference top bar: Package / Version / Revision selectors + a
> Ctrl-K command palette.
- [~] **Drawing Navigator UI** — done (location tree → drawing leaves → open tab).
- [ ] Wire the tree to real project data + uploaded floorplans (scope a view to a place).
- [ ] Top-bar **Package / Version / Revision** selectors + package content preview.
- [ ] **Command palette** (Ctrl-K) — search drawings/floors/rooms/racks.
- [ ] **Drawing packages** + **master drawing list** management.

## 9. Status bar wiring  (P1)
- [ ] Wire up **GRID / SNAP / ORTHO / OSNAP / LWT** toggles to real behaviour (grid render,
  snapping, ortho constraint, lineweight display).
- [ ] Model / Sheet layout tabs, coord readout already live; hook the rest.

## 10. Undo / redo / history / revisions  (P2)
- [ ] **Undo / redo** stack.
- [ ] **Change history** log.
- [ ] **Revision points** — snapshot all changes so far; **switch between revisions** to see
  differences (basis for **clouding**). Sheets has a basic version to build on.

## 11. Incorporate the other EOS tools  (P3, needs design)
- [ ] ◧ **design** — surface **Risers, Rack Elevations, Frames, Patching** within Pages
  (as view types? embedded editors? linked pages?). Decide the integration model.

## 12. Backend  (P2, after UX settles)
- [ ] Wire the **Firestore** backend once the mockup UX is agreed — schema for pages,
  views, entities, layers, imported files, revisions.

## 13. Codebase & repo health  (P1)
- **Git history is fine** — `.git` is ~9 MiB (packed ~7), no large blobs, so history
  cleanup is **not** the fix. (`node_modules` 732 MiB is the bulk on disk — normal.)
- [ ] Minor: a couple of stray committed files inflate the tree — `static/3PAGE.pdf`
  (~2.6 MiB test PDF) and `src/routes/ui/ChatGPT Image ….png` (~700 KiB, oddly sitting in
  a **routes** dir). Remove/gitignore if they're not needed.
- [ ] **`pnpm check` OOMs** — this is a **Node-heap** issue: svelte-check type-checks
  ~5.7k files and runs out of the default heap, made worse when the dev server is also up.
  Try:
  - `NODE_OPTIONS=--max-old-space-size=6144 pnpm check` (raise the heap).
  - Run `pnpm check` with the dev server **stopped**.
  - Trim `svelte-check`/`tsconfig` scope (exclude generated dirs / mockup files not meant
    to ship) and consider `svelte-check --threshold`/incremental in CI only.
- [ ] **VSCode slowness** — likely the TS language server over a big project; check the TS
  server memory setting and `files.watcherExclude` for `.svelte-kit`, `node_modules`.
- [ ] Split the 860-line `+page.svelte` shell into `parts/` (TreeNavigator, LayersPanel,
  PropertiesPanel, Menubar) to match the Viewport/PaperPage/Handle componentization —
  smaller files also ease the editor/type-checker load.

---

### Done this session (for context)
- [x] Kestrel-style viewport drawing (line/rect/circle/dim/text), rubber-band preview,
  constant lineweights, per-view tool/selection.
- [x] Handles to move/edit shapes & points; shared `Handle.svelte` (entity + frame grips,
  consistent size).
- [x] Fixed-scale viewport window (resize crops, doesn't rescale); infinite canvas.
- [x] AutoCAD-style paper/model space: double-click enter, border-select or marquee, corner
  resize, movable off-paper; pane-level Exit; Esc ladder.
- [x] Kestrel selection box (window/crossing).
- [x] Touch: 2-finger navigate / 1-finger draw+edit; 2-finger aborts an entity drag; both
  canvas & viewport zoom live by cursor position.
- [x] Ctrl+P prints only the focused A3 sheet.
