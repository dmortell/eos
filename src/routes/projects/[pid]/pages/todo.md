# Pages tool — TODO / roadmap

Working notes for the Kestrel-style **Pages** workspace mockup
(`src/routes/projects/[pid]/pages/`). Self-contained mock today (local runes
state, no Firestore). This file tracks what's left to reach a real tool.

Legend: `[ ]` todo · `[~]` partial · `[x]` done · **(P1)** near-term · **(P2)**
after UX settles · **(P3)** later / needs design. `◧ decide` = needs your pick.

---

## 0. Bugs / quick wins  (P1)
### Reported 2026-09-20 (Dave) — batch 2
- [x] **Box line thickness changed with zoom** — like the handles, entity strokes now divide by
  `canvasZoom` (with `non-scaling-stroke`) so lineweights stay constant on canvas zoom.
- [x] **Dragging a box vertically in plan moved it in elevation** — box gained a `z0` (base
  elevation); elevation position is z0/height only, independent of the plan footprint depth (y).
  Elevation grips edit width + height + base; plan/model keep footprint grips.
- [x] **Polyline double-click added a zero-length segment** — the dbl-click's two clicks made a
  duplicate vertex; now deduped on add and the zero-length tail is trimmed on finish.
- [x] **Inline text editor hid the object text** — the on-canvas text now stays visible and shows
  the LIVE editor value; the textarea is transparent (caret only) over it. Multi-line works
  (Enter = newline, rendered as tspans; Ctrl/⌘-Enter or blur commits).
- [x] **ViewCube 3D-button label unreadable on white paper** — solid panel chip now, readable on
  any backdrop.
- [x] **Active view + selection lost on tab switch** — viewport activation is tracked per tab id
  (`activeVps`), selection was already per-doc; both restore when you return to a view.
- [x] **Viewport props / ViewCube polish** — ViewCube redesigned (TOP/FRONT/RIGHT faces + a 3D
  button beneath, shaded darker faces, rotated FRONT/RIGHT labels, no click outline, no panel
  background); WCS triad also background-free. Old commented-out in-viewport cube deleted.
- [x] **Border 'none' now shows a faint, non-printing dotted border** so an invisible-bordered
  viewport is still selectable (`print:!border-transparent`, and the print CSS already drops it).
- [x] **Prop bloat** — Viewport/PaperPage drafting flags (acad/navContent/grid/lwt/osnap/canvasZoom)
  collapsed into a single `env` object prop.

### Reported 2026-09-20 (Dave)
- [x] **Hit-test radius was huge** — `hit()` used an `8`-*model-unit* tolerance (enormous at scale);
  now a ~7px screen tolerance converted to model units via `hitTol()`.
- [x] **Handle border thickness changed with zoom** — `non-scaling-stroke` cancels SVG-internal
  transforms but not the ancestor CSS canvas zoom; handles now pass `strokeWidth = 1.2/canvasZoom`
  (and the paper frame grips also divide their size by canvasZoom).
- [x] **Elevation box didn't move/resize vertically** — grips sat on the footprint (depth), not the
  front face. Box grips are now **view-aware**: in elevation they sit on the face corners and edit
  **width + height** (top grips change height, bottom grips move the baseline); hit-test + marquee
  bbox use the face too. The face is anchored to the footprint front edge so body-drag moves it too.
  Shift-constrain works in elevation too (square face about the opposite face corner).
- [x] **WCS cube scaled with zoom** — it lived inside the zoomed canvas. Replaced with fixed-size
  PANE-level gizmos (`parts/ViewGizmos.svelte`): a **top-right ViewCube** (TOP/FRONT/3D faces →
  switch the pane's projection) and a **bottom-left x/y/z axis triad** (Kestrel `drawUCS` style,
  oriented per view). Old in-viewport cube left commented in `Viewport.svelte`.
- [~] **Marquee vs disabled-cursor bug** — after a double-click, dragging a marquee showed a
  `not-allowed` cursor and left the marquee stuck. Cause: a native text/element-selection drag
  starting on the dblclick. Fix applied: `user-select:none` on `.canvas` / `.vp` / `.sheet-area`,
  `preventDefault` + pointer-capture on the paper marquee start (`.text-edit` keeps `user-select`).
  Intermittent — confirm it's gone in real use on the iPad/desktop.


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
- [x] **Shift-key constraints** while drawing: 15° ortho for lines/dims, square for
  rectangles/ellipses; applied live the instant Shift is pressed/released (not only on the
  next mouse-move). Also adopted for **moving** (ortho axis-lock), **resizing / handle-drag**
  (square about opposite corner), and **line-endpoint drag** (15° increments).
- [x] **Object snap (osnap)** — Kestrel-style: entities expose snap points (endpoints, midpoints,
  centres, quadrants; polyline vertices/segment-midpoints); while drawing or dragging a grip the
  nearest within ~10px wins and the point locks to it, with a marker (□ end · △ mid · ○ centre ·
  ◇ quad). Gated by the **OSNAP** status-bar toggle.
- [ ] **Grid snap** — round to a spacing, driven by the SNAP toggle (osnap done above).

### 1a. Mouse / touch: Pages vs Sheets  ◧ decide
> From a review of the Sheets tool. Tick the version you want for Pages per row
> (or write your own). The big divergences are the wheel, the draw gesture, the
> marquee, and the 1-finger touch.

| Interaction | **Pages (now)** | **Sheets (now)** | Prefer? |
|---|---|---|---|
| Wheel (no modifier) | **Zoom** at cursor | **Pan**; zoom needs Ctrl/Alt/Meta or right-btn | ✅ **ACAD toggle** picks |
| Pan (mouse) | Right- or middle-drag | Right- or middle-drag | _same_ |
| Draw a line/rect/circle | **Two clicks** (start, end) | **One press-drag-release** | ✅ **ACAD toggle** picks |
| Marquee select | **Window (L→R) vs Crossing (R→L)** | **Always crossing**, direction-agnostic | ✅ **Pages (Window/Crossing)** |
| Add to selection | not yet | **Shift/Ctrl-click, Shift-marquee** | → adopt |
| Ctrl-drag | not yet | **Duplicate the selection** | → adopt |
| Shift while **drawing** | ✅ square / 15° ortho | none | ✅ **done (Pages)** |
| Shift while **moving** | ✅ ortho / axis-lock | **Ortho / axis-lock** | ✅ **done (Pages)** |
| Shift while **resizing** | ✅ square about opposite corner | **Square / equal** | ✅ **done (Pages)** |
| Rotate | no rotate yet | snaps 15°, Shift = free | → adopt |
| Line-endpoint drag | ✅ Shift = 15° increments | Shift = 15° increments | ✅ **done (Pages)** |
| Handle screen size | ✅ constant (canvas + view zoom cancelled) | constant | ✅ **done (Pages)** |
| Handle cursor | ✅ crosshair (grips) vs move (body) | resize/ move | ✅ **done (Pages)** |
| **1-finger touch** | **Draw / select / edit** (never pans) | **Pans** empty bg, else object drag | ✅ **Pages (never pans)** |
| 2-finger touch | Pan + pinch-zoom | Pan + pinch-zoom | _same_ |
| Activate a viewport | Double-click | Double-click | _same_ |
| Pick a viewport frame | Border-click or marquee (not interior) | Border/marquee (not interior) | _same_ |
| Active-viewport pan/zoom | ~~Both live~~ → **off by default + "Pan content" toggle** | **Off by default**, toggled per-viewport | ✅ **done (Sheets-style)** |

Notes: Sheets does **not** constrain drawing with Shift (only moving/resizing/rotating),
and its marquee is always "crossing". Pages currently has the richer window/crossing
marquee and constant-lineweight draw, but no additive select / duplicate / move-ortho yet.

## 2. Drawing objects, tools & annotations
- [ ] ◧ **decide** — pick which Sheets insertable-object + annotation types to implement in
  Pages (**checklist below**).
- [x] **Ellipses** — Ellipse tool (Shift = circle); render/hit/grips/Properties.
- [x] **Polylines** — the Line tool draws a **polyline** in ACAD mode (keep clicking to add
  segments; Enter / double-click to finish, Esc cancels); EOS press-drag still makes a single
  segment. New `polyline` entity with per-vertex grips, per-segment hit-test, and snap points.
- [x] **Edit-in-place text** — double-click a text object opens an inline editor.
- [ ] **Real drawing scale (mm)** — DECIDED: model units are **millimetres, integers**, scaled
  the same way as Sheets floorplans. The viewport is still abstract viewBox units (mock plan
  0..400 × 0..250), so "width 100" reads huge and the "1:100" titleblock text is cosmetic. To
  make it real: treat model space as mm, apply the plan's mm-per-unit scale, show/accept
  integer mm in Properties, and render true lineweights. (Implementation pending.)
- [ ] **Blocks + block library** — define, instance, place; a browsable library panel (P2).
- [ ] **Trunks & conduits** (from Sheets): node/segment graph with handle editing (drag
  node, dbl-click segment to add a point, Ctrl-drag to branch, Shift = 15°). Sheets stores
  **one width + one bend-radius per trunk**; your ask = **width per segment** + **bend radius
  per corner** with handles — that's beyond the 2D outlets trunk, but the model3d **conduit**
  already has per-segment `w/h/edges`, so borrow that model (P2).
- [ ] **Edit-in-place for text** objects (inline editing, not a dialog) (P1).
- [x] **3D cuboid (`box`) + per-view projection** — a Box tool draws a footprint (a,b) + height
  (mm); it renders per view kind: **plan** = footprint rect, **elevation** = front face standing
  on the ground line, **model** = oblique (cabinet) cuboid. Grips edit the footprint; Height edits
  in Properties. A demo box is seeded into the plan/sheet/elevation/model starter tabs to test the
  views. (Mock oblique projection — not a real 3D engine.)
- [x] Kestrel **WCS orientation cube** — an oblique reference cube with an x/y/z triad in each
  viewport's top-right corner; the face matching the view (plan → top, elevation → front) is
  highlighted. (Static per view kind; no interactive re-orientation yet.)
- [ ] Section / elevation views generated from floorplans → richer **3D data** (true extrusion,
  cuts) beyond the mock box (P3).
- [ ] **Ellipse draw origin** — optional status-bar toggle for centre-out vs corner-to-corner
  ellipse/circle drawing (AutoCAD ELLIPSE defaults corner/axis, with a `C` Center option).
  Currently corner-to-corner (Shift = square about opposite corner) (P2).
- [ ] **Titleblock editing** — edit the titleblock **style** (template/layout) and its
  **contents** (project/sheet fields, logo, revision table) per sheet / per package (P2).
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
- [~] Right-side **Layers panel** — nested groups, eye toggles, swatches, View-Preset picker;
  **New Layer, rename (dbl-click), colour picker, add-sub / delete** all work (mock state).
- [x] **Layer settings dialog** — the colour swatch is now a colour+line button that opens a
  dialog (name, colour, draw-as fill/line, line type, thickness in mm, **lock**, **delete**).
- [x] **Lockable layers** — lock toggle on group rows + in the settings dialog (mock).
- [ ] **Draggable layers** — reorder layers/groups in the manager by dragging (P2).
- [ ] **Draw order** — bring-forward / send-to-back (and to-front / to-back) so images and
  solid-filled objects can be stacked/overlapped predictably (P2). Ties into the same
  ordering used by draggable layers.
- [ ] **Wire the View-Preset manager button** — the preset picker's manage/gear button is a
  no-op; make it create / rename / delete presets and save layer-visibility sets.
- [ ] **Find / identify an object's layer** — select an object → highlight its layer in the
  panel (and a "select all on layer" / "isolate layer" action).
- [ ] **Wire to the canvas** — real show/hide/lock, active layer, per-object layer assignment,
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
- [x] **Viewport-frame properties** — selecting a viewport frame (paper space) shows its props
  in the Properties panel: Name, Type, X/Y/W/H (live, editable), and **border style**
  (dashed / solid / none, applied to the frame). Most-recent selection wins over tree-node props.
- [ ] **Per-view content config** — the rest of a view's props: source model/floorplan, scale,
  crop/clip, layer-visibility preset per view. (Frame position/size/border done above.)
- [ ] **View types like the Sheets tool** — Pages views should support the same set of view
  kinds (list to be confirmed alongside §2a).
- [ ] Multiple views of one model at different scales/crops on a sheet (viewport frames
  already support this — needs per-view content config).

## 6. Annotations  (P2)
- [ ] ◧ **decide / design** — **annotation = object model.** Dave's model: an annotation
  (callout, cloud, text, dimension…) is the *same kind of thing* as a model object; the only
  difference is **where it's stored** — in a **layer/paper-space** vs in **model space**. You
  should be able to draw callouts/clouds/etc in **both** model and views, and **move them
  between** the two. **Does this conflict with AutoCAD/DXF?** No — it aligns:
  - AutoCAD already splits **model space** vs **paper-space layouts**; annotations can live in
    either, and **annotative** objects auto-scale per viewport. DXF stores every entity with a
    `layer` (group code 8) and a space flag (code 67 = model vs paper), plus per-layout blocks.
  - So "stored in a layer" and "model vs view" are **orthogonal** in DXF too: an entity has BOTH
    a layer AND a space. Our model just needs an object to carry `{ layerId, space: 'model' |
    'view:<id>' }`; moving view→model = flipping `space` (+ reposition). No conflict.
  - **DECIDED (Dave, 2026-09-20):** a **model-space** annotation just **appears in ALL views of
    that model** — no "subset of views" needed; if you don't want it in a view, **turn its layer
    off**. That's exactly DXF's *model-space-shown-through-viewports*, so no conflict and simpler:
    an object is either **model space** (shown in every view, layer-gated) or **view/paper space**
    (that one view). No per-view allow-lists.
- [ ] Unify annotations with drawn objects (one entity model, `space: 'model' | 'view:<id>'` +
  `layerId`); model-space objects render in every view, hidden per-view only by layer visibility.
- [ ] Move an annotation / object view→model (and back) = change its `space`.

## 7. Properties panel  (P1–P2)
- [x] **Two-way binding + multi-select editing** — `parts/PropertiesPanel.svelte` edits the
  focused doc's selected entities (single → X/Y + rect W/H / circle radius / text; several →
  group bbox, X/Y move the whole selection). Nothing selected → page/general props.
- [x] **Place properties from the tree** — selecting a tree node shows editable place props
  in this panel (replaces the old tree-label→property links). See §8.
- [ ] Add layer / colour / line-weight editing once entities carry those props (§3 wiring).

## 8. Project tree ↔ Pages linkage  (P2)
> Design target: the reference image's **Drawing Navigator** (left) — a location tree
> (Floors / Server Rooms / Data Center / Racks) whose leaves are drawings/views that open
> as tabs. **UI built** (`parts/DrawingNavigator.svelte`, mock tree; clicking a leaf opens
> a tab). Also mirrors the reference top bar: Package / Version / Revision selectors + a
> Ctrl-K command palette.
- [~] **Drawing Navigator UI** — done, now the Project › Building › Floor › Zone › Room ›
  Row hierarchy with drawing/view leaves that open tabs.
- [x] Top-bar **Package / Version / Revision** selectors (mock).
- [x] **Command palette** (Ctrl-K) — `parts/CommandPalette.svelte`, searches drawings/places.
- [x] **Preview tabs (VSCode-style)** — single-clicking a drawing in the tree opens it in a shared
  *italic* preview tab that the next single-click reuses; double-clicking it (or editing the doc)
  promotes it to a kept tab. Command-palette picks open as kept tabs.
- [x] **Folders selectable → place properties** — clicking a place (building/floor/zone/room/
  row) shows its props in the right Properties panel (mock fields per kind); the **project
  name is now a label above the tree** (not the tree root) and opens project props on click.
- [ ] Wire the tree to real project data + uploaded floorplans (scope a view to a place);
  persist the place-property edits.
- [ ] Package **content preview** + **master drawing list** management.

## 9. Status bar wiring  (P1)
- [x] **Model / Sheet** views now differ: Sheet = A3 paper + viewport frame; Model = drawing
  fills the pane (no paper). **GRID** toggle shows/hides the viewport grid.
- [ ] Wire **SNAP / ORTHO / OSNAP / LWT** to real behaviour (grid snap, ortho constraint,
  object snap, lineweight display). (ORTHO could reuse the Shift-constrain path.)

## 10. Undo / redo / history / revisions  (P2)
- [x] **Undo / redo** (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Edit menu) — snapshot-based, coalesces
  a drag into one step. **Change log** + **revision snapshots** in `parts/HistoryPanel.svelte`
  (right "History" tab): New revision, restore a revision, **editable description note per revision**.
- [ ] **Diff between revisions** → generate revision **clouds** from the changes (the real
  payoff; Sheets has only a manual cloud annotation).
- **Undo memory** (Dave's Q, 2026-09-20): steps are full state **snapshots, not diffs**. A normal
  edit now snapshots only the ONE doc it changed (per-doc, `snapDoc`); a revision restore snapshots
  all docs. So memory ≈ (entities in the changed doc) × up to 100 steps — fine for the mock, but a
  real tool should be **command/inverse-op based** (store what changed, not the whole doc). [ ] do this.

## 11. Incorporate the other EOS tools  (P3, needs design)
- [ ] ◧ **design** — surface **Risers, Rack Elevations, Frames, Patching** within Pages
  (as view types? embedded editors? linked pages?). Decide the integration model.

## 12. Backend  (P2, after UX settles)
- [ ] Wire the **Firestore** backend once the mockup UX is agreed — schema for pages,
  views, entities, layers, imported files, revisions.

## 13. Codebase & repo health  (P1)
- **Git history is fine** — `.git` is ~9 MiB (packed ~7), no large blobs, so history
  cleanup is **not** the fix. (`node_modules` 732 MiB is the bulk on disk — normal.)
- [ ] Minor: a couple of stray committed files inflate the tree — `static/3PAGE.pdf` - ok to leave this
  (~2.6 MiB test PDF) and `src/routes/ui/ChatGPT Image ….png` (~700 KiB, oddly sitting in
  a **routes** dir). Remove/gitignore if they're not needed. Leave this sample UI
- [ ] **`pnpm check` OOMs** — this is a **Node-heap** issue: svelte-check type-checks
  ~5.7k files and runs out of the default heap, made worse when the dev server is also up.
  Try:
  - `NODE_OPTIONS=--max-old-space-size=6144 pnpm check` (raise the heap).
  - Run `pnpm check` with the dev server **stopped**. This works.
  - Trim `svelte-check`/`tsconfig` scope (exclude generated dirs / mockup files not meant
    to ship) and consider `svelte-check --threshold`/incremental in CI only.
- [ ] **VSCode slowness** — likely the TS language server over a big project; check the TS
  server memory setting and `files.watcherExclude` for `.svelte-kit`, `node_modules`.
- [~] **Split `+page.svelte`** — done for the shell: DrawingNavigator, LayersPanel,
  PropertiesPanel, HistoryPanel, CommandPalette, StatusBar, Menubar are now components;
  `+page` is ~660 lines (was ~860). The editor-area (panes/tabs/canvas) stays inline as the
  tightly-coupled core — extract a `Pane`/`Canvas` component when it next grows.

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



layer managers? Only Sheets has a full one (sheets/layers/LayersPanel.svelte + layers.ts, 8 default layers with visibility/colour/lock). The others are partial: model3d uses per-model layers for symbols, outlets/model3d tag objects with a layerId, and Uploads only toggles a PDF's built-in OCG layers (hiddenLayers). So Pages would be the second real layer manager in the app, closest in spirit to Sheets