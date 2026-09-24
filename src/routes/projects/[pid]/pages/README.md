# Pages tool — file map

An AutoCAD / Kestrel-style paper-space workspace: sheets with draggable viewport frames onto a shared
3D-ish model, plus 2D annotations, a drawing navigator, split panes and a title block. **Mock** — state
is in-memory (Svelte 5 runes), no Firestore yet (§12 in `todo.md`).

## Where things live

| File | Role |
|---|---|
| `+page.svelte` | The shell + orchestration: tabs, split panes, the drawing navigator, the global undo timeline, document vs view vs session state, the tool strip, printing, and all the callback wiring to the panels. |
| `pagesProject.svelte.ts` | The PROJECT side (`PagesProject`, built by `+page` with a `ProjectHost`): the live Firestore data (`ProjectSource` + `store/pagesStore`), the navigator tree, places, place models + floorplans, the Outlets import, stored sheets, the title block, and the drawings dialog handlers. |
| `store/` | Firestore schema + mappers, the debounced `DocSaver`, `PagesStore`, places / tree building, the Outlets import, the drawing list (dialog data + Excel export). All pure parts unit-tested. |
| `titleBlock.ts` · `blocks.svelte.ts` (+ `ui/blocks.ts`) | The per-project title-block template + fill; the global block library (outlet symbols) and insert helpers. |
| `parts/DrawingsDialog.svelte` · `TitleBlockEditor.svelte` | The drawing management dialog (sheets / archived / models); the title-block template editor. |
| `ui/Viewport.svelte` | The canvas editor for ONE viewport — a 90-line shell: props, DOM event wiring, SVG skeleton. |
| `ui/vpView.svelte.ts` · `ui/vpInteraction.svelte.ts` | The Viewport's view model (mapping, pan/zoom, ctx, layers, selection, picking, grips) and its pointer/key state machine (drafting, drags, marquee, text edit, image calibration). |
| `ui/hit.ts` · `grips.ts` · `snap.ts` · `place.ts` · `mapper.ts` · `gestures.ts` · `annotations.ts` · `modelEdit.ts` · `selection.ts` · `editor.ts` | Pure, unit-tested editing logic the Viewport and PaperPage share (all take an explicit `ViewCtx`, `view.ts`). |
| `ui/render/` | `EntRender` (one entity), `VpMarks` / `VpOverlays` / `VpWidgets` (guides + sections, grips/snap/marquee, HTML widgets), `UnderlayImage` (floorplan PDF). |
| `ui/geometry.ts` | Pure 2D helpers + the `Ent` (annotation) type: dist/segDist, textBox, box elevation/iso faces, elevation projection (`elevU`), style + unit constants. Unit-tested (`geometry.test.ts`). |
| `ui/panzoom.ts` | The pan/zoom Svelte action (pointer events, 2-finger-only navigation — the tool's touch model). |
| `parts/PaperPage.svelte` | A sheet in paper space: lays out the viewport frames, each mounting a `Viewport`; frame select/drag/resize. |
| `parts/PropertiesPanel.svelte` · `LayersPanel` · `HistoryPanel` · `StatusBar` · `Menubar` · `DrawingNavigator` · `ViewGizmos` · `CommandPalette` · `Handle` | Sidebar / chrome components. |
| `types.ts` | Shared Pages types + option lists (`Proj`≡`Dir`, `SheetFrame`, `SCALES`, `PROJ_OPTS`). |
| `constants.ts` | Viewport scale (`BASE`, `PAPER_PX_PER_MM`), handle size, paper sizes, the true-scale helpers. Unit-tested. |
| `ids.ts` | The one id generator (`newId(prefix)`, nanoid). |
| `layers.svelte.ts` | The page-layer store (entities' layers + view presets). NOTE: model objects use a *separate* layer list on the model (see B16/R5 in `review.md`). |
| `guides.svelte.ts` | Alignment-guide helpers over a model's `guides` array. |
| `imageEdit.svelte.ts` | Image-underlay calibration mode (origin / scale / crop). |
| `palette.ts` | Colour swatches for the pickers. |
| `3dview/` | The ported model engine: `types.ts` (Model/Obj/Prism/Wall/Conduit/Section/Guide/Dir), `projection.ts` (plan/elevation/iso projection + `prismRings`), `graph.ts` (node/segment graph), `models.svelte.ts` (the model registry store), `migrate.ts`, `Model3d.svelte` (renders the model in a viewport). |

## Coordinate systems (quick reference)

- Model space = real millimetres. Plan is y-DOWN. The plan pivot is `PLAN_CX/PLAN_CY`.
- A viewport shows the model at a drawing scale `1:N` (`dscale = 1/N`). On a **paper frame** 1 model mm =
  1 paper mm at 1:1 (`PAPER_PX_PER_MM`); a standalone/full-size viewport uses the on-screen `BASE`.
- `gripSize` = a length that renders at a **constant SCREEN size** (grips, handles, snap marks).
- `paperMm` = a length that is a **constant size ON PAPER** (annotations: dims/text/arrows) — scales with
  zoom like the drawing. See B2/B3.

## The other docs

- `todo.md` — open work + decisions (and a large historical done-log).
- `CHANGELOG.md` — a curated, readable history of the major milestones.
- `review.md` — the standing code review (`§0a` tracks which items are done); maintained by the review session.
- `model-plan.md` — how the 3D engine was ported in.
- `drawings-plan.md` — how sheets, models and places are stored, versioned and managed (the tree + the drawing management dialog).
