# `edit3d` ↔ `sheets` — comparison & merge analysis

Comparison of the two sheet/drawing codebases:

- **`edit3d/`** — `src/routes/projects/[pid]/edit3d/` (the new tool, ~2,150 LOC, 16 files)
- **`sheets/`** — `src/routes/projects/[pid]/sheets/` (~10,500 LOC, ~80 files)

> TL;DR: **they solve different halves of the same problem.** `edit3d` is a **3D model authoring + projection engine** with a thin paper-space around it. `sheets` is a mature **paper-space compositor** that places 2D viewports referencing *other tools'* live data, with packages, annotations, layers, print-to-PDF, undo/redo. They overlap only in the paper-space shell (viewports on an A3 page). **Recommended direction: keep `sheets` as the host paper-space and bring `edit3d` in as a new viewport *source* ("3D model" tool), while adopting `edit3d`'s cleaner architectural patterns where `sheets` is rough.** Rationale at the bottom.

---

## 1. What each one fundamentally is

| | `edit3d` | `sheets` |
|---|---|---|
| Core idea | Author a **3D model** (mm), place **viewports** that *project* it (plan / 4 elevations / isometric) onto an A3 page | Compose an A3 page from **viewports** that *reference other tools'* 2D data (outlets, racks, risers, fillrate, text) + annotations |
| Geometry | **Authored here** — prisms, mitred walls, swept conduits, in 3D | **Not authored here** — comes from source tools; sheets adds only annotations |
| Dimensionality | **3D** (orthographic + isometric + hidden-line removal + sections/elevations) | **2D only** (no projection engine; rack/riser "elevations" are pre-drawn by those tools) |
| Mental model | Model space + a basic paper space | The real paper space (Revit/AutoCAD-style sheet sets) |
| Maturity | New, clean, focused | Large, feature-rich, battle-tested |

This is the key framing: **`edit3d` ≈ "model space", `sheets` ≈ "paper space".** In a CAD app these are two layers of one system, not competitors.

---

## 2. Architecture

| Aspect | `edit3d` | `sheets` |
|---|---|---|
| State | One `Sheet` `$state` class, passed as a prop everywhere | `ViewportEditor` (paper-space) + a `SurfaceEditor` subclass per tool (model-space) + `AnnotationEditor`; composables wire them |
| Purity | **`projection.ts` is a pure, testable module** (all 3D math); `types.ts` pure; reactive state isolated in `sheet.svelte.ts` | Geometry/editing logic mixed into editor classes; `Canvas` is a reusable pan/zoom engine |
| Component tree | Thin components reading derived state | Deeper: `SheetEditor` → `Canvas` → `Viewport` → `ViewportContent` → per-tool `*Viewport` → `*Render`/`*EditLayer`/`*EditPanel` |
| Plug-in pattern | n/a (single model type) | **`ViewportContent` switches on `source.kind`** — each tool is a self-contained `tools/<tool>/` folder. Adding a source = one folder. |
| Undo/redo | ✗ | ✓ (`edit/history.svelte.ts`, snapshot-based) |
| Touch / iPad | ✗ (pointer only) | ✓ (pinch, single-finger pan, `canPanAt` hit-test) |
| Lines of code | ~2,150 | ~10,500 |

**Verdict:** `edit3d`'s separation (pure projection module vs reactive store vs thin components) is genuinely cleaner and worth propagating. `sheets`'s architecture is bigger but its **per-tool plug-in pattern is exactly the seam a 3D model would slot into.**

---

## 3. Data model

| | `edit3d` | `sheets` |
|---|---|---|
| Sheet | `drawings/{pid}/sheets/{id}` = `{ name, views[] }` | `projects/{pid}/sheets/{id}` = `SheetDoc` (title, drawingNumber, sortOrder, paper, titleBlock, viewports[], revisions, link) |
| Shared geometry | `drawings/{pid}` = `{ models[] }` (project-shared 3D models) | none — content lives in each source tool's own docs |
| Viewport | `View` = frame `(fx,fy,fw,fh)` + `(mx,my,scale)` + `direction` + optional `yaw/pitch/clip` | `SheetViewport` = `(x,y,w,h)` + `source` (discriminated union) + `scale` + `contentOffsetMm` + `border` + `annotations[]` + `layerOverrides` + `version` |
| What a viewport shows | a **projection of a shared model** | a **reference to another tool's doc** (`outletsDocId`, `racksDocId`, …) |
| Object primitives | `Prism`, `Wall`, `Conduit` (+ `Layer`, recent) | none (annotations only: text/line/rect/cloud/symbol/callout/dimension/image) |
| Packages / drawing sets | ✗ | ✓ `SheetPackage` (`projects/{pid}/sheetPackages/{id}`) — ordered sheet ids, multi-page print |
| Revisions | ✗ | ✓ `SheetRevision[]` |
| Title block | static SVG placeholder | data-driven `TitleBlockConfig` (templates, project defaults via Firestore merge, logos) |
| Units | model mm; paper mm; multi-space projection | 1mm world unit throughout, 2D |

**Overlap:** both have "an A3 sheet doc holding an array of viewports with mm geometry, persisted to Firestore, with multi-sheet support." `edit3d` recently grew this (persist.svelte.ts, sheet tabs, layers) — **partially re-implementing what `sheets` already has.** That duplication is the strongest argument to merge rather than continue in parallel.

---

## 4. Feature matrix

Legend: ✓ = has it, ~ = partial/placeholder, ✗ = missing.

| Feature | `edit3d` | `sheets` |
|---|---|---|
| **Model authoring (3D)** | ✓ prisms / mitred walls / swept conduits | ✗ |
| **Projection: plan + 4 elevations** | ✓ | ✗ |
| **Isometric / 3D view** | ✓ orbit (yaw/pitch) | ✗ |
| **Hidden-line removal** | ✓ painter's algorithm | ✗ |
| **Sections / elevations from a plan** | ✓ draw box → cropped elevation, live marker | ✗ (only planned in `_todo.md`) |
| Object edit: move/resize, conduit path edit | ✓ | n/a |
| Layers | ~ (types added, panels placeholder) | ✓ project-wide, per-viewport overrides, lock |
| Viewport insert / move / resize / marquee | ✓ | ✓ (+ snap to margins/grid/title-block) |
| Multi-select viewports | ✓ | ✓ (+ shift/ctrl additive) |
| Content pan/zoom within a viewport | ✓ | ✓ |
| Maximize / model mode | ✓ transient camera | ✓ full-area model mode |
| Copy/cut/paste/duplicate viewports | ✗ | ✓ (clipboard survives sheet nav) |
| Snapping (edges, grid, margin) | ✗ | ✓ |
| Undo / redo | ✗ | ✓ |
| Annotations / markup (text, dims, clouds, symbols…) | ✗ | ✓ rich |
| **Per-tool live source viewports** (outlets/racks/risers/fillrate/text) | ✗ | ✓ (the headline feature) |
| **Packages / drawing sets** | ✗ | ✓ |
| **Print to true-scale PDF** | ~ (single sheet, A3 CSS) | ✓ (1mm→1mm, multi-sheet, mixed paper) |
| Multiple named sheets | ✓ (recent) | ✓ (list, renumber, reorder, file rows) |
| Title block | ~ static | ✓ data-driven |
| Revisions panel | ✗ | ✓ |
| Properties floating windows | ~ placeholder panels | ✓ sheet + viewport property windows |
| Project settings dialog | ✗ | ✓ |
| Touch / iPad | ✗ | ✓ |
| Firestore real-time sync | ✓ (debounced, de-duped) | ✓ |
| Insert palette (walls/conduits/furniture/rack/outlet/annot/PDF) | ~ stubs (`todo:true`) | partial via sources |

**Net:** `edit3d` is **uniquely strong** at the one thing `sheets` entirely lacks — **3D authoring + projection + sections + hidden-line**. `sheets` is **uniquely strong** at everything *around* the drawing — packages, print/PDF, annotations, layers, per-tool sources, undo, touch, properties UI.

---

## 5. Code-quality notes

- `edit3d` strengths worth keeping app-wide: pure `projection.ts`; the single documented coordinate-space model; screen-constant handle sizes; wide transparent hit-lines; whole-mm drag stepping; robust seeding/de-dup persistence; concise components.
- `sheets` strengths worth keeping: the per-tool plug-in seam; `Canvas` print transform (`PX_PER_MM`); `.dwg-line`/`.cad-thin` hairline system; `SurfaceEditor`/history/annotation infrastructure; URL-state mirroring; identity-guarded effects against save loops.
- `sheets` rough edges (`implement.md`/`_todo.md`): tool-object layer assignment incomplete; rack-property editors not unified; legacy `version:1` y-down conversion pending; **PDFs broken on real iPad** (`URL.parse`); 3D viewer explicitly deferred (this is exactly what `edit3d` provides).

---

## 6. Recommendation: merge `edit3d` → `sheets` (sheets as host)

**Make `edit3d`'s 3D model + projection engine a new viewport source kind in `sheets` (a `tools/model3d/` plug-in), and retire `edit3d`'s paper-space shell in favour of `sheets`'.**

Why this direction (despite `edit3d` having the nicer code):

1. **The expensive, hard-to-rebuild assets live in `sheets`** — packages, true-scale multi-sheet PDF, annotations, layers, per-tool live sources, undo/redo, touch, properties windows. Rebuilding those on `edit3d` is ~10k LOC of risk. Re-doing `edit3d`'s value on `sheets` is much smaller: its crown jewel (`projection.ts` + the model editor) is a **self-contained pure module** that ports as a tool.
2. **`sheets` was literally designed for this** — `ViewportContent` already dispatches on `source.kind`; a `model3d` source (referencing `drawings/{pid}` models, with a `direction`/`yaw`/`pitch`/`clip` param) is one more folder following the existing pattern. The `edit3d` concept "a View = a projection of a model" maps cleanly onto "a viewport with a model3d source + projection params."
3. **It removes the duplication you're already accruing** — `edit3d` just grew its own Firestore persistence, sheet tabs, and layer types that re-implement `sheets`. Continuing in parallel doubles that.
4. **One paper-space for the whole app** — consistency: every tool (outlets, racks, risers, *and the 3D model*) shows up the same way on sheets, prints the same way, packages the same way.
5. **It unblocks a real `sheets` gap** — `_todo.md` defers a 3D viewer and wall-elevation/section work; `edit3d` delivers exactly that.

The cost is that `edit3d`'s nicer sheet-level UX (its menubar/sidebar/marquee/section tool) gets subsumed — but most of that maps onto existing `sheets` equivalents, and the *model-space* editing UX (object handles, conduit path editing, section box, iso orbit) is what you actually port and keep.

### What to keep from `edit3d` regardless of direction
- `projection.ts` (verbatim — it's pure and portable)
- the model/object types (`Prism`/`Wall`/`Conduit`/`Layer`) and the geometry editing interactions
- the section-box → elevation flow (it answers `sheets`'s deferred section-reference item)
- the architectural patterns: pure-module separation, the single coordinate-space doc, constant-size handles

### Concrete merge path (incremental, low-risk)
1. Add a `model3d` source to `sheets` `ViewportSource`: `{ kind:'model3d', modelId, direction, yaw?, pitch?, clip? }`. Models stay at `drawings/{pid}` (already project-shared).
2. Port `projection.ts` unchanged into `tools/model3d/`. Write `Model3dRender.svelte` (read-only projection, reusing `edit3d`'s `ViewObjects` rendering) following the `*Render` contract (`onview` reports scale).
3. Add `Model3dEditLayer.svelte` + an editor extending `SurfaceEditor` for in-viewport object/handle editing (move/resize, conduit path, iso orbit) — reusing `edit3d`'s `sheet.svelte.ts` interaction logic adapted to the `SurfaceEditor` mapping.
4. Add a `Model3dProperties.svelte` (direction, model, hidden-lines, clip) to `ViewportPropertiesWindow`.
5. Move the **section-box** flow in as a paper-space action that creates a `model3d` viewport with a `clip` + `direction` (mirrors `edit3d`'s `createSectionView`).
6. Freeze `edit3d/` once parity is reached; migrate any saved `drawings/{pid}/sheets` data into `SheetDoc`s (a thin script).
7. Opportunistically refactor the touched `sheets` code toward `edit3d`'s cleaner patterns (don't rewrite wholesale).

### When the other direction would win
Merging `sheets` → `edit3d` (a as host) only makes sense if you intend to **rewrite the whole sheets system** on a cleaner base and can afford to re-build packages/annotations/print/per-tool-sources/undo. Given `sheets` already works and is large, that's high cost / high risk for mostly aesthetic gain. Not recommended unless a ground-up rewrite is already on the table.

---

## 7. One-line summary

> Treat `edit3d` as **model space** and `sheets` as **paper space**: port `edit3d`'s pure projection engine and model editing into `sheets` as a `model3d` viewport source, retire `edit3d`'s duplicate paper-space shell, and lift `edit3d`'s cleaner module boundaries into `sheets` as you touch it.

---

## 8. Editor unification plan (wall / conduit / outlets-trunk)

**Insight:** wall, conduit, and the outlets *trunk* are the same primitive — a
cross-section profile swept along a polyline path. Only the profile differs:

| | path | profile |
|---|---|---|
| conduit | 3D polyline | n-gon `w × h` (round pipe / rect trunk) |
| wall | 2D polyline @ base z | rectangle `thickness × height` |
| outlets trunk | 2D polyline | width |

So the *path-editing operations* are identical (vertex insert / move / delete,
endpoint extend, segment select / delete, per-segment properties); the geometry
is the only variable.

**Done (stepping stone):** walls now reuse the conduit path logic in
`model3d-editor` — `startVertex` / `startInsert` / `startExtend` / `deleteSel`
and the edit-layer handles branch on `conduit || (wall && plan)` and operate on
`o.path` (conduit) or `o.pts` (wall). Wall path editing is plan-only; elevations
keep the single height handle.

**Next (deliberate, needs a data change):**
1. Extract a shared **swept-path editor** that owns path topology + handles; each
   tool supplies its profile + the property fields it exposes.
2. Add **segment selection** + **per-segment properties** (a wall/conduit whose
   thickness/height varies per run) — this changes the data model from one
   profile per object to an optional per-segment profile. The outlets trunk
   editor is the reference for segment-select + add-point-on-segment + branch.
3. Fold the outlets trunk onto the same editor once 1–2 land.

---

## 9. model3d backlog (gaps vs edit3d + new asks)

edit3d's Insert palette (`parts/insert.ts`) listed these but most were `todo:true`
stubs — never built. So they're gaps in BOTH tools, now tracked for model3d:

**Object creation (Insert palette)** — biggest gap. You can edit/duplicate/branch
existing objects but can't *originate* a new prism/wall/conduit from scratch.
Needs: a place-tool (click/drag to draw a wall/conduit path; click to drop a
prism) feeding the editor. Touch: tap-to-place.

**Sections / clip → cropped elevation** — `Clip` type exists; no UI. A section box
in plan → auto-framed cropped elevation/section viewport (cull via `inClip`).

**Annotations** (new ask) — none yet:
- **Legend** — keyed list of layers/symbols with swatches (auto from model layers).
- Dimensions (linear/aligned), text labels, leaders/callouts, symbols/tags.
- These likely belong to the sheet annotation layer, not the model.

**Iso orbit-by-drag** — yaw/pitch are fixed source params; add drag-to-orbit.

**Grid / snapping** — snap to grid + endpoints/midpoints while editing (precision).

**Done since this doc:** graph model + branching (§8), per-segment props, layers
merged into the sheet Layers window (per-viewport), underlays, undo/redo,
duplicate/copy/paste (ctrl-drag, Ctrl+D/C/X/V, touch buttons).
