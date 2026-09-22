# Pages tool — code review 2

Reviewed 2026-09-22 (review 1 was 2026-09-20; ~110 commits since). Scope: everything under
`src/routes/projects/[pid]/pages/` at commit a927094, compared against the other EOS tools
(Sheets, Drawings, edit3d/model3d, Elevations, Outlets, Packages, Risers, `$lib`) and, in Phase 2,
against KestrelCad2 (`M:\dev\KestrelCad2`).

Method: full read of the Pages tree (`+page.svelte`, `ui/Viewport.svelte`, `ui/geometry.ts`,
`ui/panzoom.ts`, `3dview/*`, `parts/*`, the stores), `svelte-check` filtered to `pages/`
(`NODE_OPTIONS=--max-old-space-size=8192`, dev server stopped), grep verification of dead code and
duplicates, and one inventory per sibling tool (delegated reads, then compared here).
Tags: **[verified]** reproduced by a tool or grep · **[code]** high confidence from reading ·
**[design]** a judgement call.

Numbering: every finding/action has a stable id you can paste into `todo.md`:
`B` bugs · `R` refactor/manageability · `P` performance & tests · `X` cross-tool parity ·
`K` Kestrel parity (Phase 2). Items marked ◧ need Dave's decision.

---

## 0a. Verification log (fixes by the other session, checked here)

| Item | Commit | Verdict |
|---|---|---|
| B1 | 5ff6e16 | **Done.** Re-export removed, `Ent/Pt/View` imported from `ui/geometry`, `op` annotated. `svelte-check` (heap 8 GB, dev server stopped) reports 0 errors under `pages/` [verified]. |
| B2 | bf214ef | **Done.** `pxPerUnit = boxW ? PAPER_PX_PER_MM : BASE` drives `vbW/vbH` and `gripSize`; `modelUnitToPaperMm/Px` + `constants.test.ts` (5 tests, 58/58 green) [verified]. Follow-up already in B3: annotation sizes still come from `gripSize`. |
| B5 | 41dde5a | **Done with one gap.** `Section = {id, clip, dir, name?}` on `Model.sections`, per-model `sectionsForModel`, add/dir/delete record history, drags bracketed with `beginedit`/`modeledit`/`endedit` [verified by diff]. **Gap:** `onSecDragUp`/`onSecResizeUp` (`Viewport.svelte:895-913`) call `on.endedit` only when `moved` is true, and `cancelPointerDrag`'s `secDrag`/`secResize` branches (`:1424-1433`) never call it — a click on a section border (or a cancelled drag) leaves `gestureActive` true in `+page`, so every following edit folds into one undo step until some other gesture ends. Fix: unconditional `on.endedit?.()` on release/cancel (as `onModelGripUp` does). Minor: `onSection` resolves the model from `panes[focused]` — same class as B14. |
| B5 gap | cf5b529 | **Done.** `on.endedit` now fires unconditionally on section-drag release and in both cancel branches [verified by diff]. B5 closed. |
| B4 | 2652b69 | **Done.** One global `hist` (steps snapshot all models + every tab's frames), `undo/redo/jump`/HistoryPanel read it, `dropDoc` frees nothing per tab [verified by diff]. Side effect: **B14 is resolved** — the baseline is captured once globally, so the focused-pane race in `beginGesture` no longer exists. Two notes, not blockers: (a) the change log no longer says which tab a step belongs to — prefix labels with the tab title (or add `tab` to `HStep`) so "Edit rect" on a shared model is traceable; (b) `applyPtr` restores `docFrames` for tab ids that were closed since (harmless until B6 separates document state). |
| B6 | be560b8 | **Done with one gap.** Document state (`docFrames`/`docPaper`/`docScale`) is keyed by `didOf(tabId)` = the tab title; `dropDoc` frees only session/view state (`docSel`, `docView`, `docProj`, `docOrbit`, `selFrame`/`selSection`, activation) and `closeTab` calls it before removing the tab [verified by diff]. B4 note (b) is resolved: `applyPtr` now restores frames by drawing id. **Gap:** the preview-reuse path in `openDrawing` (`+page.svelte:621`) does `pv.title = d.title` *before* `dropDoc(pv.id)`, so `didOf` resolves to the NEW drawing and `dropDoc` frees the new drawing's frame view state instead of the old one's — the previewed drawing's frames keep their `activeVps`/`docView`/`docOrbit` entries (reopen shows them still activated) and a `selFrame` pointing at one of them survives, so Delete on the newly previewed sheet records a no-op "Delete viewport" step. Fix: call `dropDoc(pv.id)` before reassigning `pv.title`/`pv.kind`. Minor, pre-existing: `docCanvasView` (pane+tab keyed) is still never cleared, so the reused preview slot inherits the previous drawing's canvas pan/zoom. |

## 0. Status of review 1

| Review-1 item | State now |
|---|---|
| §2.1 fit, §2.2 print size, §2.4 text-editor zoom, §2.5 type error, §2.6 split keys, §2.7 per-doc undo, §2.8 delete/dirty/leaks/HistoryPanel/titleblock/ViewCube | fixed (todo §0) |
| §2.3 per-doc frame state | effectively done (`docFrames` per tab) but the old `FrameSel` path was left behind → **B11** |
| §4.1 DocEditor class | geometry extracted (`ui/geometry.ts` + 14 tests); the editor itself is still inline and has tripled in size → **R1** |
| §4.2 mm world units | done — but the paper↔model scale constant was not updated → **B2** |
| §4.3 reuse Sheets layers | not done; now two layer systems coexist → **B16/R5** |
| §2.8 leftovers (key tabs by id, frame drag threshold, uncontrolled inputs, coalescing) | open → **B19** |
| §5 snap/hit perf, §6 nits (circle, line/polyline, uid, a11y, CSS) | open → **P1, B13, R4** |

---

## 1. Summary

**Size.** Pages is now ~6.5k lines of code (+ ~1.7k of notes). `ui/Viewport.svelte` went from 774
to 2124 lines (148 KB); `+page.svelte` from 750 to 1270. The 3D engine (`3dview/`, 1.0k lines) is a
verbatim port of `sheets/tools/model3d` that has since gained features the original lacks.

**What's good since review 1.** The data-into-model migration (entities + guides live in `Model`,
so every view of a floor shares them and undo rides one snapshot); the model registry with
per-frame `modelId`; per-projection view keys; multi-viewport paper space with the primary folded
into one frames array; real dimensions/arrows/clouds/callouts; grid + object snap; rotated-shape
grips with a provably fixed anchor; the depth-snap for drawing conduits in elevations; tool
fly-outs with touch parity; and `geometry.ts` with unit tests. The pointer model (capture +
2-finger-only navigation) is still the best touch model in the app.

**What needs fixing first.**
1. **Printed drawings are not to scale** — the viewport scale constant is still the old mock value
   (B2) and annotation sizes are tied to the screen zoom (B3). Everything downstream (packages,
   titleblock "SCALE 1:100") is wrong until these land.
2. **Undo semantics are now unsafe** — history is per tab, but entities/objects/guides are per
   model and every step snapshots *all* models. Undo on one tab silently reverts edits made on
   another (B4). Sections aren't in history at all (B5).
3. **Closing a tab destroys the page** (frames, paper, scale) because open-tab state and document
   state are the same maps (B6, R2).
4. **`Viewport.svelte` is a 2100-line monolith** with 10 hand-rolled drag machines, 5 selection
   states and 3 hit-test tolerance conventions (R1, R3, B9). The "REFACTOR: unify editing" todo is
   right; this review turns it into a file plan.
5. **Two layer systems** (page layers vs model layers) — the Layers panel can't hide walls (B16, R5).
6. `svelte-check` is red again: 8 errors (B1).

**The big picture across tools.** EOS now has *three* sheet/page tools (Sheets 15k lines,
Drawings/page-editor 5k, Pages 6.5k) and *two* copies of the 3D engine (sheets/model3d and
pages/3dview, already diverging). Pages is the declared direction (ux-plan), so §5 lists what to
reuse from the others *now* (History, TransformBox, Prop* fields, symbols registry, DXF, print
route, versioning service) and what needs a migration plan rather than a rewrite (Sheets viewport
sources, Drawings publish/pin, Outlets trunks, Elevations racks, Risers).

---

## 2. Bugs

### B1. `svelte-check` errors (8)  **[verified]**
`PaperPage.svelte:10`, `PropertiesPanel.svelte:7`, `+page.svelte:14` import `Ent`/`View`/`Pt` from
`../ui/Viewport.svelte`, which re-exports them from its *instance* script
(`export type { Pt, Ent, View } from './geometry'`, `Viewport.svelte:25`). Type re-exports from an
instance `<script>` aren't resolvable by svelte-check (types *declared* there — `Env`, `VpOn`,
`SectionMarker` — are fine). Also `PropertiesPanel.svelte:46` (`p` implicit any ×2) and
`+page.svelte:116` (`op` implicit any).
**Action:** import `Ent/Pt/View/ElevDir` from `../ui/geometry` everywhere; delete the re-export;
annotate `op: 'front'|'back'|'forward'|'backward'`. Then keep `pnpm check` green as a commit gate
(see P5).

### B2. Viewport scale is off by ×0.805 — a "1:100" frame prints at ≈1:124  **[code, computed]**
A frame's viewBox is `boxW / BASE` model units across `boxW` *paper* px (`Viewport.svelte:143`), so
one model mm occupies `BASE · dscale` paper px. Paper px per paper mm is `PAPER_PX_PER_MM =
960/420 = 2.2857` (`constants.ts:15`). For 1:N to be true, `BASE` must equal `PAPER_PX_PER_MM`;
it is still the mock value `1.84` (`constants.ts:5`), so 1 model mm = 0.805/N paper mm. Sheets
gets this right (1 world unit = 1 mm, `Canvas.svelte:311` `PX_PER_MM = 96/25.4` at print).
**Action:** on paper, derive the viewBox from `PAPER_PX_PER_MM` (`vbW = boxW / (PAPER_PX_PER_MM)`),
keep `BASE` only for the full-size (screen) layout, and add a unit test: "a 1000 mm object in a
1:100 frame is 10 mm on A3". Check the titleblock scale text and the scale dropdown after.

### B3. Annotation sizes depend on the screen zoom, so print output depends on how far you were zoomed  **[code]**
`gripSize` (`Viewport.svelte:1292`) divides by `view.zoom` and `canvasZoom` — correct for grips,
wrong for geometry. Of its ~16 uses, these size *drawing content*: dimension text (`:1987`), arrowheads
(`arrowPts` `:1314`), extension ticks (`:1976`), default `dimOff` (`:1977`), cloud bump diameter
(`cloudPath` `:1323`), callout leader arrow, section labels (`:1780`, via `hitTol`), iso ground
text (`:1916`). Two frames of the same sheet at the same scale but different content zoom print
different arrowheads; zoom in before Ctrl-P and the dims shrink.
Text has the related problem: `PT = 96.25` mm/pt (`geometry.ts:49`) makes 8 pt = 770 mm in model
space = **7.7 mm on paper at 1:100 (a true 8 pt is 2.8 mm)** and 30.8 mm at 1:25 — text isn't
annotative.
**Action:** introduce one `paperMm` unit in the Viewport (`= 1/dscale` model mm per paper mm) and
size all annotation geometry from it: `fontPx = fontPt · 0.3528 · paperMm`, arrow length
`3 · paperMm`, tick `1.5 · paperMm`, cloud bump `4 · paperMm`. Keep `gripSize` for grips, snap
markers, the crosshair and preview strokes only. This is the "annotative" behaviour Sheets has by
storing annotations in paper mm.

### B4. Per-tab history vs per-model data: undo on one tab reverts edits made on another  **[code]**
`docHist` is keyed by tab id (`+page.svelte:370`) but every step stores `snapModels()` — the
*entire* registry (`:377,:383`). Scenario: draw a rect on "3303 Outlets" (t2), then move a desk
on "3303 Floorplan" (t1), then Ctrl-Z on t2 → `applyPtr` restores t2's last snapshot, which
predates the desk move: the desk jumps back with no history entry on t1 and no way to redo it
there. With sheets hosting frames of *different* models (floor + rack), a t2 undo also rewinds
the rack. The todo notes this as "a known mock limitation"; with entities now in the model it is
the normal case, not an edge case.
**Action (◧ decide):** (a) **one global linear timeline** for the workspace — simplest, matches
AutoCAD/Kestrel (one undo stack per document) and the HistoryPanel already shows a single log; or
(b) per-model history + per-page history, with the HistoryPanel showing the focused viewport's
model. Either way steps should record *what* changed (`{modelId, label}`) and snapshot only that
model (also fixes P3). Recommend (a) now, (b) when Firestore makes models independent docs.

### B5. Sections are not undoable and are global  **[code]**
`onSection`, `moveSection`, `setSectionDir`, `deleteSection` (`+page.svelte:146-182`) never call
`recordEdit`, and `docClip/docSecDir/docSecName` aren't in `HStep`; undoing a "Drop section
viewport" step leaves the marker, deleting a section can't be undone. `sectionMarkers` is derived
from *all* clips and passed to every plan viewport regardless of model (`:994`, `:1009`), so a cut
drawn on the 33F plan appears on the Rack A plan.
**Action:** move sections into the model like guides (`Model.sections: Section[]` with
`{id, clip, dir, name}`) so they ride `snapModels`, are model-scoped, and are Firestore-stable;
`on.section*` callbacks then become model edits.

### B6. Closing a tab (or reusing the preview tab) deletes the page's content  **[code]**
`dropDoc` (`+page.svelte:451-473`) deletes `docFrames[id]`, `docHist`, `docPaper` (and
`docScale` is never cleaned). `closeTab` and the preview-reuse path in `openDrawing` (`:600`) both
call it, so closing "3303 Outlets" throws away its viewport frames; single-clicking another
drawing while a sheet is previewed does the same. In a real tool a tab is a *view* onto a
document; closing it must not touch the document. Root cause is R2 (tab state and document state
share the same maps) plus the missing stable drawing id (todo §0 "Stable per-DRAWING id").
**Action:** see R2. Short-term: make `dropDoc` clear only view state (`docSel`, `docView`,
`docOrbit`, `docCanvasView`, activation) and keep document state (`docFrames`, `docPaper`,
`docScale`, `docHist`).

### B7. Hit-test order disagrees with paint order  **[code]**
`hit()` scans `entities` from the end (`Viewport.svelte:476`) but rendering sorts by layer order
first (`paintEnts`, `:465`). An object on a lower layer that was added later wins the click over
the object actually drawn on top of it.
**Action:** `for (let i = paintEnts.length - 1; …)`. Same for `entSnaps` priority and marquee
(cosmetic there).

### B8. Edit menu Cut / Copy / Paste / Delete are no-ops  **[verified]**
`menuAction` (`+page.svelte:532-548`) has no branch for them; `deleteSelection()` (`:307`) is
never called (only the Delete *key* works). Review 1 §2.8 recorded this as fixed.
**Action:** route the four menu items to `copyEnts/cutEnts/pasteEnts/deleteSelection` (and to
model/section/frame deletion — see R3). Also File › Save/Export/Open are silent no-ops; disable
them or show "not yet".

### B9. Three pick-tolerance conventions  **[code]**
Entity/section/guide/node hits convert screen px → *unscaled* model mm (`hitTol(px)/dscale`,
`:475,:613,:718,:963`), but `hitModel` uses raw `hitTol(4)` (`:562`, viewBox-scaled units) for
prism AABBs and the wall/conduit centreline band (`graphHit`, `:549`). At 1:100 that slack is
100× too small: a wall is only pickable inside its own thickness, a thin pipe (80 mm = 0.8 mm at
1:100) practically not at all.
**Action:** one `tolMm(px)` helper (screen px → model mm at the current view) used by every hit
and snap function; delete the `/(dscale||1)` sprinkles (11 sites).

### B10. Tilted prisms (rotX/rotY, commit a927094) render as hulls but pick/grip as upright boxes  **[code]**
`prismRect`/`prismCorners`/`hitModel` (`:501,:781,:560`) ignore `rotX/rotY`, so a tilted object's
grips and hit box sit on the untilted footprint while `project()` draws the leaning silhouette.
**Action:** derive the pick polygon and grips from `project(o, dir)` (the same outline Model3d
draws) — see R7.

### B11. Dead paper-frame plumbing  **[verified]**
`FrameSel` (`PaperPage.svelte:21`), `viewportSel`/`onFrame` (`+page.svelte:616-620`),
`frame:` in `VpOn` (`Viewport.svelte:38`, never invoked), and the `viewport` branch of
`PropertiesPanel` (`:253-270`, with `MIN 90` clamps) are unreachable since frames moved to
`docFrames`. **Action:** delete (~40 lines) and drop the `viewport` prop.

### B12. Other dead code  **[verified]**
`StatusBar` `layout` bindable prop + `.layout-tabs button.on` CSS; `palette.LAYERS`
(`palette.ts:35`, unused — PropertiesPanel reads the store); `PAPER_W/H` only as PaperPage
defaults that are always overridden; `+page.svelte:1204-1208` `.side-body*` CSS;
`HistoryPanel.svelte:88` `.hp-row.rev:hover`; `MMPU`-scaled elevation ground line
(`Viewport.svelte:1740`, `8*MMPU…392*MMPU` — a legacy 400-unit mock extent). 10 a11y warnings
(`Handle`, `LayersPanel`, `ViewGizmos`, `Viewport` section arrows/toolbar).

### B13. Six id generators, one of them per-instance  **[verified]**
`newId` (`+page.svelte:312`), `uid` (`Viewport.svelte:122`, **per viewport instance** — two frames
of the same model in split view can collide within one ms), `mUid` (`:918`), `guideId`
(`guides.svelte.ts:13`), `layers.svelte.ts:79,88`, and `graph.ts newId(prefix)` (counter + clock,
the good one). **Action:** export `newId(prefix)` from one module and use it everywhere.

### B14. Model-edit gestures started in the unfocused split pane capture the wrong baseline  **[code]**
`beginGesture` calls `ensureHist(panes[focused].activeId)` (`+page.svelte:284`) but focus only
moves to the clicked pane in the *parent's* delegated `pointerdown`, which runs after the
Viewport's `onDown` has already called `on.beginedit`. For model edits the store is mutated
*before* `recordEdit(a.id)` → `pushStep` → `ensureHist(a.id)`, so the new tab's baseline is the
already-mutated state and the first undo there is a no-op. Entity edits are safe because
`updateEnt` calls `ensureHist` before mutating.
**Action:** `beginedit: () => beginGesture(a.id)` — pass the tab (or in R1, the editor) instead
of reading `focused`.

### B15. The same types defined three times  **[verified]**
`SheetFrame` in `+page.svelte:190`, `PaperPage.svelte:25`, and as `SheetFrameProp` in
`PropertiesPanel.svelte:16`; `Proj` (`+page.svelte:59`) ≡ `Dir` (`3dview/types.ts:103`); the
`projKind` 'plan'→'floorplan' rename exists only because `Viewport.kind` predates `Dir`;
`SCALES` vs `SCALE_OPTS`; `PROJ_LABEL` vs `PROJ_OPTS` vs `DIR_LABEL`. **Action:** one `types.ts`
in `pages/` (`SheetFrame`, `Tab`, `View`, `Snap`, re-export `Dir`/`DIR_LABEL`); make `Viewport`
take `dir: Dir`.

### B16. Two layer systems; the Layers panel can't see model layers  **[code]**
`layers.svelte.ts` (`PLayer`, global, ids like `anno`/`a-wall`) governs entities; `Model.layers`
(`Layer`, per model, ids `walls`/`furniture`/`trunks`/`openings`) governs objects. `LayersPanel`
lists only the first, so walls/furniture/trunks can't be hidden or locked from the panel and
"A-WALL" in the panel has nothing to do with the walls on screen. `PropertiesPanel` shows a
different Layer dropdown per selection type (`:174` vs `:368`). View presets only cover page
layers. → **R5**.

### B17. Module-level singletons will leak between projects  **[code]**
`models`, `modelSel`, `layers`, `presets`, `layerUI`, `imgEdit` are module `$state` — shared by
every `+page` instance and surviving client-side navigation between projects. Fine for the mock;
a trap the moment Firestore seeds them. **Action:** instantiate per page and pass via context (or
own them in the R1 editor objects).

### B18. Tab dedup by title, tab ids by open order  **[code]** (carry-over)
`openDrawing` matches `tabs.find(t => t.title === d.title)` (`+page.svelte:596`); tab ids are a
session counter; per-tab localStorage view keys therefore drift between sessions. Already in
todo §0 ("Stable per-DRAWING id") — listed here because B6/R2 depend on it.

### B19. Review-1 carry-overs still open  **[code]**
- PaperPage frame drag has no move threshold: `drag.moved = true` on the first pointermove
  (`PaperPage.svelte:74`), so a jittery click records "Move viewport". Sheets uses 4 px.
- Properties inputs are uncontrolled (`value=` + `onchange`) — a half-typed value survives a
  selection change (`PropertiesPanel.svelte` throughout). Sheets mirrors into a `form` `$state`.
- `PropertiesPanel.bbox` (`:45-51`) duplicates the Viewport's with a fixed 40×10 text box
  (should use `textBox`).
- `Ctrl-D` duplicate offsets by `8` model units = 8 mm (invisible at 1:100); paste offsets by
  `10 · pasteN`. Offsets should be paper-relative (e.g. 5 paper mm).
- Text edit ignores `rot`, `align`, `valign` (`startTextEdit` `:324`): the textarea sits at the
  left anchor of a centred or rotated text.

---

## 3. Refactoring for manageability

### R1. Split `Viewport.svelte` along its natural seams  **[design, do first]**
Today the file holds: coordinate mapping (`:126-166`), 10 drag state machines (`scaleDrag`,
`guideDrag`, `mDrag`, `mGrip`, `secDrag`, `secResize`, `orbitDrag`, `drag`, `marquee`,
press-draw — each with its own add/remove-listener boilerplate, and `cancelPointerDrag` `:1360`
enumerating them all), hit-testing for 5 object families (`hitEnt`, `hitModel`, `hitModelIso`,
`hitSection`, `hitGuide`), two grip systems (`gripsFor` vs `modelGrips`), snapping (object, grid,
node, depth), placement (`place`, `placeGraph`, `placePrism`, `placeGuide`), text editing,
image calibration, section toolbar geometry, prompts, and ~500 lines of render snippets.
The `todo.md` "REFACTOR: unify editing" item is the right call; this is the file plan:

| New module | Moves out of Viewport | Lines (approx.) |
|---|---|---|
| `ui/gestures.ts` — `beginPointerDrag(e, host, {onMove, onUp, onCancel})`: pointer capture, window listeners, `moved` flag, `suppressClick`, a cancel registry (`cancelAll()` replaces `cancelPointerDrag`) | the 10 machines' boilerplate | −250 |
| `ui/mapper.ts` — `Mapper` built **once per event** from `svg.getBoundingClientRect()` + view + dscale: `toModel`, `toClient`, `tolMm(px)`, `paperMm` | `vbMap/clientToVB/toLocalXY/localToClient/hitTol/gripSize` | −60, fixes B9 + P1 |
| `ui/hit.ts` — `hitEnt`, `bbox`, `hitModel`, `hitModelIso`, `hitSection`, `hitGuide`, `pickAt(mapper, p) → {kind,id,grip?}` in one priority order | `:389-620, 1337-1349` | −300, testable |
| `ui/grips.ts` — `Grip` type, `gripsLocal/gripsFor/constrainGrip`, `modelGrips/applyPrismGrip`, `rotGripLocal`, section grips | `:1105-1287, 769-837` | −250, testable |
| `ui/snap.ts` — `entSnaps/findSnap`, `snapToGrid/snapDelta`, `snapNode`, `elevDepthSnap` | `:1051-1103, 524-546, 993-1015` | −150, testable |
| `ui/place.ts` — `place/placeGraph/placePrism/placeGuide/finishPolyline` (pure builders returning `Ent`/`Obj`) | `:201-223, 1017-1049` | −100 |
| `ui/render/EntRender.svelte` (+ `DimRender`, `TextRender`, `ImageRender` if wanted) with `paperMm` prop | `drawn`/`drawnGround`/`preview` snippets `:1908-2062` | −180 |
| `ui/annotations.ts` — `arrowPts`, `cloudPath`, `sectionArrowFor` (pure, take `paperMm`) | `:1312-1332, 656-669` | −50 |

Viewport.svelte keeps: props, the `Mapper` per event, `onDown/onMove/onClick/onDblclick/onKey`
dispatch, the SVG skeleton. Target ≤ 600 lines. Each extracted module gets a Vitest file (P5).
Do this *before* the command line (K-items) or block library — both add more gestures.

### R2. Separate document state from session/view state in `+page.svelte`  **[design]**
Thirteen parallel `Record<string, …>` maps keyed by tab, pane:tab, pane:view:proj or `sec` id:
`docCanvasView`, `cvCache`, `docProj`, `docPaper`, `docScale`, `docOrbit`, `docClip`,
`docSecDir`, `docSecName`, `docFrames`, `docSel`, `docView`, `docHist` — plus `activeVps`,
`selFrame`, `selSection`, `treeNode`, `viewportSel`. `dropDoc` has to know every one (B6).
Group them into three objects with one owner each:
- **Document** (persisted, keyed by *drawing id*): `PageDoc = { id, title, kind, paper, scale,
  frames, revisions }` for sheets; a model-view tab is `{ id, modelId, dir }`. Sections/guides/
  entities/objects belong to the `Model` (B5).
- **ViewState** (per pane × view × projection, localStorage): `{ pan, zoom, orbit, proj, canvas }`
  — today's `vkey` maps, in one `Map<string, ViewState>` with a `viewKey()` helper.
- **Session**: `tabs`, `panes`, `focused`, `previewId`, the selection (R3), `activeVps`.
Closing a tab drops Session + ViewState entries only. This is the "page MODEL object" todo, made
concrete; it is also what §12 (Firestore) needs — a `PageDoc` is one document.

### R3. One selection model  **[design]**
Five selection states with exclusivity rules spread over `onClick`/`onDown`: `docSel[tab]`
(entities), `modelSel` (objects **and** guides, global), `selSection`, `selFrame`, `nodeSel`
(`Viewport.svelte:243-253, 1491-1546`; `+page.svelte:175, 420, 616`). Delete alone has four
branches (`:365-368`) and Properties has five (`PropertiesPanel.svelte:135-286`).
**Action:** `Selection = { kind: 'ent'|'obj'|'guide'|'section'|'node'|'frame'; id; sub? }[]` on
the editor with `selectOnly/toggle/clear`, one `pickAt()` (R1 `hit.ts`) returning the same
shape, and one `deleteSelection()`. Sheets' `SelectionCoordinator` is the same idea; Pages
doesn't need the multi-editor part because one editor owns the model.

### R4. Retire the second 3D box and the second line type  **[design]**
`Ent.type 'box'` (mock cuboid) duplicates `Prism`: its own elevation face (`boxElev`,
`boxElevSet`), oblique iso faces (`boxFaces`, `ISO = 0.6` — a *different* projection from the
model's orbit camera), elevation grips, z0 handling, Properties fields, and 4 test cases. The
Furniture tool already makes a prism. **Action:** delete `box` (and the `ISO`/`boxFaces` path);
if a "sketch box" annotation is wanted, it's a prism on an annotation layer. `'line'` vs
`'polyline'` (todo §6) and `'circle'` (dead) go at the same time: Line makes a 2-point polyline;
Ellipse+Shift is the circle.

### R5. One layer model, per model, with page-space layers for sheets  **[design]**
Adopt `3dview/types.ts Layer` (id/name/color/visible/locked/weight/opening) as the *only* layer
type, add `group?: string` (panel grouping) and `dash?`. Entities and objects share the model's
layer list; a sheet has its own small list for paper-space annotations. `LayersPanel` shows the
focused viewport's model layers + the page layers; View Presets become per-viewport
`layerOverrides` (Sheets `effectiveLayers()`), which also gives "hide walls in this frame only".
Delete `layers.svelte.ts`/`palette.LAYERS`; keep `palette.COLORS`. Reuse from Sheets:
`layerBlockReason` (lock toasts), `annTargetLayer/objTargetLayer` (which layer a new object lands
on), the `base` category idea for custom layers. Fixes B16 and unblocks the legend annotation (X2).

### R6. Shrink the callback bundle  **[design]**
`VpOn` has 28 callbacks (`Viewport.svelte:34-46`); `vpOn`/`vpOnFrame` rebuild it per render.
After R1/R3 the Viewport receives an `editor` (model ops: add/update/delete/select/group/
clipboard/reorder/modeledit/section ops) and keeps `on` for *view* events only (`activate`,
`deactivate`, `view`, `orbit`, `scale`, `status`, `coords`, `tool`). ~20 fewer indirections.

### R7. One projection path for render and edit  **[design]**
`Model3d.svelte` draws through `project()` + a per-direction `xform`; the Viewport re-derives the
same mapping by hand for hit/grips (`prismRect`, `graphNodeDraw`, `hitModelIso`, `isoGround`,
`elevU`), with comments promising they "match". B10 is the first divergence.
**Action:** add to `projection.ts` a `viewMap(dir, cx, cy, ground, yaw, pitch, isoBox)` returning
`{ toDraw(p3) → Pt, fromDraw(pt, depth) → P3 }` (the affine `xform` encodes) and build both
`Model3d`'s transform and the Viewport's pick/grip geometry from it. Then `hitModel` = point in
`project(o, dir)` outline, which handles rotation and tilt for free.

### R8. Merge `PaperPage` into `Viewport` (paper as a coordinate mode)  **[design]** (todo item, spelled out)
PaperPage owns frame geometry/selection/drag in *paper px* with its own marquee, drag machine and
`Handle`s; the Viewport owns the same operations in *model mm*. After R1 (gestures, grips, hit
are modules) and B2 (paper px ↔ mm is a known constant), a sheet becomes a Viewport with
`space: 'paper'`, unit = paper mm, entities = frames (role `viewport`, per Dave's "frame ≈ shape"
decision) + page annotations + titleblock cells, and the Viewport tool = the Rectangle gesture.
Sheets' `Viewport.svelte` frame snap (paper edges/margins/titleblock/5 mm grid, Alt disables) then
plugs into `snap.ts`.

### R9. Split `+page.svelte`  **[design]**
Extract `parts/Pane.svelte` (tab bar + canvas + tool strip + active-viewport bar + gizmos + status,
`:872-1044`), `parts/ToolStrip.svelte` (`TOOLS/STRIP/groupTool/openGroup` + fly-outs,
`:661-703, 924-955`), `printing.ts` (`:761-803`), and the tab-strip menu. With R2 the page is
~300 lines of wiring.

### R10. Move mock data out of components  **[design]**
`DrawingNavigator.TREE`, `paletteItems`, `PACKAGES/VERSIONS/REVISIONS`, `NODE_FIELDS`
(PropertiesPanel), the demo models, seeded layers/presets, the seeded test image → `pages/mock/`.
Then §12 (Firestore) replaces one folder instead of touching six components.

### R11. Doc hygiene  **[design]**
`todo.md` is 1080 lines and mixes decisions, done logs and open items; `model-plan.md` is mostly
"DONE" preambles. Suggest: `todo.md` keeps open items + decisions only; move done-logs to
`pages/CHANGELOG.md`; add a 40-line `pages/README.md` file map once R1 lands (Sheets has 11 `.md`
files next to code and nobody can tell which are current — don't repeat that).

---

## 4. Performance and tests

### P1. One layout read per snap point per pointer move  **[code]** (carry-over)
`findSnap` → `localToClient` → `vbMap` → `getBoundingClientRect` per snap point (a rect has 9);
`pick` does it per grip; `pickModelGrip`/`pickSectionGrip` too. 20 entities ≈ 180 forced layout
reads per move. R1's `Mapper` (built once per event) removes all of it.

### P2. `hoverBody` runs three full hit passes per pointer move  **[code]**
`onMove` (`Viewport.svelte:280-283`) calls `hit()`, `hitModel()`, `hitGuide()` just to pick a
cursor. Reuse `pickAt()` from R1 and throttle to animation frames.

### P3. History snapshots deep-clone every model including base64 images  **[code]**
`snapModels()` on every step (`+page.svelte:377,383,389`) clones all models; the seeded
background image is a data-URL `src` inside `Model.ents`, so each step copies it. A 2 MB photo ×
100 steps = 200 MB. **Action:** short term exclude `src` (store images by `fileId`, X7); long term
command/inverse-op history (todo §10) — `$lib/history/HistoryStore` is the command-based store
Elevations and Outlets already use.

### P4. `hitModelIso` recomputes every face of every object per click  **[code]**
`Model3d` already has the depth-sorted `isoFaces`; expose it (or compute once per orbit change in
R7's `viewMap`) instead of re-projecting in the Viewport.

### P5. Tests  **[design]**
Only `ui/geometry.test.ts` (14 tests). After R1 add: `hit.test.ts` (outline-vs-fill, rotated
rect, tolerance in mm at 1:1 and 1:100), `grips.test.ts` (the verified 40° anchor invariance,
Shift-square in the local frame), `snap.test.ts` (`snapDelta` keeps shape, osnap priority over
grid), `marquee` window/crossing, `paper-scale.test.ts` for B2/B3 (1000 mm at 1:100 = 10 paper mm;
8 pt = 2.82 paper mm at any scale), and `3dview/projection.test.ts` (`trimToClip`, `graph.runs`
junction breaking, `roundPath`, `doorGeom` — the ported engine has no tests in either copy).
Elevations' `editor.*.svelte.test.ts` shows how to test a rune-based editor class. Make
`pnpm check` + `pnpm test --project=server` the pre-commit gate for `pages/`.

### P6. Small reactivity costs  **[code]**
`gripsFor(e)` is recomputed per grip render *and* per pick; `modelGrips` per render;
`{#each … as g, i (i)}` on grips re-keys on reorder; `paintEnts` re-sorts on any entity change.
Memoise grips per selection change (a `$derived` map) when R1 moves them out.

---

## 5. Cross-tool comparison

### 5.1 Inventory (code lines, architecture, shared primitives)

| Tool | Lines | Editor logic | Undo | Persistence | Pan/zoom | Print | Layers | Tests |
|---|---|---|---|---|---|---|---|---|
| **Pages** | 6.5k | inline (`Viewport`/`+page`) + pure `geometry.ts`, ported `3dview/` | per-tab snapshot timeline (B4) | none (mock) | own `ui/panzoom.ts` action (pointer events, 2-finger nav) | own `@page` + CSS zoom, focused sheet only | own store + model layers (B16) | 14 |
| Sheets | 15.3k | headless classes: `ViewportEditor`, `SurfaceEditor` base, `SelectionCoordinator`, `History`, `useViewportEditing` | per-viewport `History` (debounced snapshot) + sheet-level | `docSaver` 400 ms + JSON echo guards | `parts/Canvas.svelte` + `$lib/ui/panzoom-controller` helpers; 3 nested pan/zooms | `Canvas.svelte` `@page` + zoom; package print route | `layers/layers.ts` (8 defaults + custom w/ base, per-vp overrides) | 0 |
| Drawings (page editor) | 5.1k | inline `+page.svelte`; viewport components wrap other tools' renderers | frame geometry only | `pages/{pid}_{pageId}` + 250 ms `persistLive`, no echo guard | own, in `PageCanvas.svelte` | own `@page` + `scale(96/25.4)`; `packages/[pkgId]/print` multi-sheet | per-viewport source toggles only | 0 |
| edit3d (frozen) → **model3d** (in Sheets) | 2.2k → 3.4k | `Model3dEditor extends SurfaceEditor` | Sheets `History` | shared `drawings/{pid}` model store | Sheets | Sheets | model `Layer[]` + per-vp overrides | 0 |
| Elevations | 7.7k | `ElevationsEditor` class (1.7k) + `BenchEditor` + `FramesEditor` | `$lib/history/HistoryStore` (commands) | `$lib/autosave/AutoSave` (`shouldApplyRemote`) ×3 docs | `$lib/panzoom/PanZoomCanvas.svelte` | reuses frames/patching Excel exports | — | 3 files |
| Outlets | 7.2k | `Outlets.svelte` state + `OutletCanvas.svelte` + pure `trunks/geometry.ts` | `HistoryStore` (commands) | `AutoSave` 300 ms, `untrack` remote-apply | own, in `OutletCanvas` (touch buggy) | `$lib/ui/print/*` (the shared module) | `viewFlags` bitmask + PDF OCG | 0 |
| Packages | 0.8k | none (Firestore CRUD via `$lib/versioning/service`) | — | direct writes | — | `[pkgId]/print` mixed-paper multi-sheet | — | 0 |
| Risers | 5.0k | inline `Risers.svelte` + pure `engine.ts` (lane routing) | none | 400 ms + JSON echo guard | `$lib/ui/panzoom-controller` `PanZoomInputAdapter` | none | none | 0 |

Shared primitives that exist today and their adopters: `$lib/ui/panzoom-controller` (8 tools,
three different ways), `$lib/ui/print/*` (drawings, outlets, sheets, packages), `HistoryStore` +
`AutoSave` (elevations, outlets), `$lib/versioning/service` (drawings, packages, outlets, risers,
racks, frames), `$lib/elevation/*` (the only `$lib` code with tests), `ColorPicker`/`DragReorder`/
`palette` (Pages only).

### 5.2 Findings

### X1. Three page/sheet tools and two 3D engines — decide the survivor ◧  **[design]**
Sheets (viewports onto tool docs, per-viewport annotations, shape library, DXF, packages),
Drawings' page editor (11 viewport source kinds wrapping other tools' renderers, publish/pin,
package print), and Pages all implement "paper with viewports + annotations + title block". The
model3d engine exists in `sheets/tools/model3d` and `pages/3dview`; the Pages copy has since added
bend radius, prism tilt, `doorGeom`, `isoBounds`, face shading — the copies have diverged after two
days. Pages is the declared direction (ux-plan), so:
**Action:** (1) make `pages/3dview` the canonical engine at `$lib/model3d/` and point
`sheets/tools/model3d` at it (or accept the fork explicitly and stop back-porting); delete
`edit3d/` (its merge-analysis says it's frozen; nothing marks it dead). (2) Write a one-page
"Pages absorbs Sheets + Drawings" plan: which tool owns paper space long-term, and the migration
of Sheets' `ViewportSource` kinds (X9/X10) and Drawings' publish/pin (X6) into Pages. Don't grow
all three.

### X2. Reuse from Sheets now (low-risk, concrete)  **[design]**
- `sheets/edit/history.svelte.ts` `History` (`register/touch/commit/undo/redo`, snapshot-based,
  selection captured with the frame, no-op steps skipped) replaces `beginGesture/endGesture/
  pushStep/updateStep/applyPtr` (~70 lines) — or, once R1 makes ops explicit,
  `$lib/history/HistoryStore` (command-based, what Elevations/Outlets use; also fixes P3).
- `sheets/edit/transform.ts` + `TransformBox.svelte` (8 handles + rotate, Shift = square) and
  `PointHandles.svelte` (endpoints, 15° snap): Pages has 4 corner grips + a rotate handle; edge
  handles are missing.
- `sheets/parts/Prop*.svelte` (`PropText/PropTextarea/PropSelect/PropCheck/PropColor`) +
  `$lib/formNav` replace `PropertiesPanel`'s ad-hoc inputs and its own `fnav` (B19 too).
- `sheets/annotations/symbols/registry.ts`: section marker, elevation/section tag (4 arms +
  drawing-no link), detail marker, photo marker, north arrow, outlet, faceplate, door — todo §2a
  lists all of these as "[ ]"; import the registry rather than redraw.
- `sheets/annotations/shapes/library.ts` + `ShapeLibrary.svelte` (built-in + custom shapes in the
  global `library` collection, drag-to-place) for "Shape/annotation library" (§2a).
- `sheets/dxf/dxf.ts` + `model3d/dxfExport.ts`: Pages has no DXF export; the engine's is ~100
  lines and already handles walls/conduits/prisms.
- `layers/layers.ts` `effectiveLayers/layerBlockReason/annTargetLayer` (R5).
- `edit/hotkeys.ts` single-letter tool hotkeys (X12).

### X3. Three pan/zoom implementations in `$lib`/tools  **[design]**
`$lib/ui/panzoom-controller` (`PanZoomInputAdapter`, Risers/Sheets helpers), `$lib/panzoom/
PanZoomCanvas.svelte` (Elevations), and Pages' `ui/panzoom.ts` action (pointer events, 2-finger
only, `wheelZoom` toggle — the smallest and the only Alt-free one). Outlets/Drawings/Uploads
hand-roll a fourth. **Action:** promote Pages' action to `$lib/ui/panzoom-action.ts` as the
standard for new canvases (with the `pointers` Set cancel pattern from `Viewport.svelte:1359`),
and note it in the touch memory; don't add a fifth when R8 merges PaperPage.

### X4. Persistence pattern for §12 — copy Outlets/Elevations, not Sheets  **[design]**
`$lib/autosave/AutoSave` (`shouldApplyRemote` ring buffer, 300–500 ms) + a remote-apply effect that
reads only the doc prop and wraps everything else in `untrack` (Outlets.svelte:454-475 is the
reference; see the memory note) + `HistoryStore` commands. Sheets' JSON-string echo guards work
but are repeated per tool by hand. `pages/3dview/models.svelte.ts` becomes a `ModelStore` class
(`sheets/tools/model3d/models.svelte.ts` is 90 lines and already does seed/migrate/save).
Firestore shape: `models3d/{pid}` per model-plan §6 plus `pages/{pid}/{pageId}` for `PageDoc`
(R2). Field names are already locked (memory: plane/space/guides).

### X5. Print: reuse the package print route instead of a third print path  **[design]**
Pages prints the focused sheet only (`+page.svelte:761-803`, its own `@page`/`beforeprint`).
`packages/[pkgId]/print/+page.svelte` already prints N sheets with mixed paper sizes (named
`@page` rules), pinned to published revisions, by rendering Drawings' `ViewportFrame` +
`TitleBlock`. `$lib/ui/print/print-handler.ts triggerPrint` exists too. **Action:** give Pages a
read-only `SheetRender.svelte` (paper + frames + titleblock, no editing chrome — R8 makes this
natural) and let the package route render Pages sheets; drop Pages' own print CSS. Also extend
`$lib/ui/print/types` `PaperSize` with A2 (A1/A0) so `constants.ts PAPER_SIZES` can go.

### X6. Versioning: map PACKAGE/VERSION/REVISION to the existing schema  **[design]**
`$lib/versioning/service` + `types/versioning` already define `DrawingDoc`, `VersionDoc`,
`RevisionDoc`, `PackageDoc`/items, `IssueDoc` (immutable manifests, supersede), `sourcePin`
(Drawings publish pins a viewport's source revision), `nextRevisionCode`, and the Master Drawing
List (`drawings/+page.svelte`). Pages' titlebar selectors, `revisions[]` snapshots, `makeRevision`
('Rev C…' from a counter, unrelated to the `rev` shown in the titleblock) and the todo §8/§10 asks
(package/version switching shows different content; read-only historical revisions; per-drawing
revision chains; revision table in the titleblock) all fit that schema. **Action:** Pages
revisions = `RevisionDoc` snapshots of the `PageDoc`; "restore" = open read-only + "branch"
(todo's decision); the History panel's Revisions section reads the drawing's revisions
subcollection; PACKAGE/VERSION selectors bind to `PackageDoc`/`VersionDoc`. Diff-to-cloud (§10)
then diffs two `RevisionDoc` snapshots — Sheets has no diff either, so this is net-new.

### X7. Underlays: use `files/{id}` + `PdfState`, not data-URL entities  **[design]**
Outlets and Drawings render PDF pages through `uploads/parts/PdfState.svelte.ts` with the
file's per-page `origin/scale/crop/masks` and OCG `hiddenLayers`; the ported `3dview/types.ts`
already has `Underlay { fileId, pageNum, dir, rect, flip, opacity }` and `Model.underlays` — Pages
ignores it and stores images as base64 `src` on an `image` Ent (P3). Pages' origin/scale/crop
calibration UI (deliberately modelled on Uploads) is good; back it with `fileId` and reuse
`PdfState` for PDFs (§4: PDF/image/DXF import; masks; version swap/compare). `PdfState` should
move to `$lib` first — Outlets/Drawings import it by relative path from `uploads/parts`.

### X8. Trunks/conduits: Outlets is the richer model — plan the mapping, don't reimplement  **[design]**
Outlets `trunks/` has the catalog (PF22/PF28/E51 pipes, MK0-5/ladder/tray ducts), per-segment spec,
floor/plenum/tray/wall location, angle-snap least-squares (`snapNodeAngles`), split/merge/
disconnect, room-exclusive routing, and the fill-rate BFS from the rack root
(`nodeFillMap`) — the deliverable Pages §4 calls "trunk routes / conduit requests". Pages'
`Conduit` (`w/h/edges/bend`, graph nodes, per-seg overrides) is the model3d one. **Action:** for
todo §11, write the adapter `TrunkNode/TrunkSegment ↔ GNode/GSeg + spec` (both are node/segment
graphs — Outlets' geometry.ts even says its miters were "adapted from Walls4"), lift
`snapNodeAngles` and the fill computation into pure `$lib` functions, and give `Conduit` a `spec`
field pointing at the catalog. Outlets' outlet↔Frames label linking (`locationId`, "Link all",
"Sync from locations") is the other capability Pages' outlet symbol will need.

### X9. Racks: host the Elevations renderer read-only first  **[design]**
`$lib/rack` (RackElevation renderer), `$lib/elevation/portmap` (canonical port map), and
`ElevationsEditor` are the source of truth for rack content; Pages' "Rack A" (prisms) is a stand-in.
Drawings shows the cheap path: `RackElevationViewport.svelte` wraps the renderer with a synthetic
view state. **Action:** a Pages viewport source kind `rack-elevation`/`rack-plan` that mounts the
same renderer (read-only), *then* decide whether racks become real 3D models (§11). Same recipe
for `frame-detail`, `patching`, `fillrate`, `survey` (Drawings has wrappers for all).

### X10. Risers: embed, don't re-derive  **[design]**
Todo §2 wants a Risers view as a "tall section across floors". The Risers tool (5k lines) already
has the multi-floor band model, hidden-floor compression, ladders, cable lane routing and a
`bare` prop for embedding (used by `workspace/`). It lacks undo and print — which Pages provides.
**Action:** a `risers` viewport source (Drawings' `RisersViewport.svelte` reuses `risers/parts/*`),
and later feed its floor bands from `Model.levels`.

### X11. Touch: Pages is the reference implementation  **[design]**
1-finger draw/select, 2-finger navigate, pointer capture, second-finger cancels a drag
(`pointers` Set). Sheets' `ModelView` has no touch; Outlets/Uploads are buggy (memory). Promote
with X3 and record in the touch memory so the other tools converge on it.

### X12. Hotkeys  **[design]**
Sheets `edit/hotkeys.ts`: c/t/n/l/a/d/r/e/g + o/s/v/p symbols, F2 text focus, PageUp/Down pan;
Outlets: R rotate, T trunk, O/1-9/L/H/C/S/M/W/F/B. Pages has only Ctrl-combos, Esc, Enter, Delete,
arrows. **Action:** a `hotkeys.ts` table (tool letters + Kestrel aliases from Phase 2) rendered
into the tool-strip tooltips.

### X13. Tests across tools  **[verified]**
Elevations (3 editor-class test files), `$lib/elevation/*.test.ts`, Pages (14). Sheets, Drawings,
Outlets, Risers, edit3d, model3d: zero. Pages' 3dview tests (P5) would cover the engine for
Sheets too if X1 makes it shared.

### X14. Dead/stale siblings that confuse "what to borrow"  **[verified]**
`edit3d/` (frozen, superseded — delete or add a README), `sheets/_todo.md` + 10 more `.md` files
next to code, Outlets' 9 planning `.md` files (some reference a deleted `KimiPlanner.svelte`),
`TrunkPalette.svelte` `{#if 0 && …}` 180-line dead block, `risers.md` describing components that
were never built. Not Pages' job, but every one of them was a false lead during this review.

### X15. Explicit z-order is a Pages advantage  **[design]**
Neither Sheets nor Drawings has bring-to-front/send-to-back; Pages has it (Ctrl+]/[, Arrange
row, layer-order painting). Keep it and push it into the shared annotation model when X1 merges.

---

## 6. Suggested order (Phase 1)

1. **Hour-sized:** B1, B8, B11, B12, B13, B14, B15 — green `pnpm check`, no dead paths.
2. **Scale correctness:** B2 + B3 with the `paper-scale.test.ts` from P5. Do this before any more
   annotation kinds; every dim/text/cloud drawn until then is sized wrong on paper.
3. **State model:** R2 (document vs view vs session) + B6 + B18 (stable drawing ids), then B4/B5
   (history per model, sections in the model). This is the design work that §12 depends on.
4. **Viewport split:** R1 (gestures → mapper → hit → grips → snap → place → render) with P1/P2/P5
   riding along; then B9, B10, R7.
5. **Unify:** R3 (selection), R5 (layers), R4 (drop `box`/`line`/`circle`), R6, R9, R10.
6. **Cross-tool:** X1 decision, X2 reuse (History/TransformBox/Prop*/symbols/DXF), X3 promote
   panzoom, X5 print route, X4/X6/X7 when §12 starts, X8–X10 for §11.

---

## 7. Phase 2 — Pages vs KestrelCad2

Source: `M:\dev\KestrelCad2` (`notes.md` UI audit of 2026-09-13, `README.md`, `docs/*.md`,
`bugs.md`, and `src/*.js` — `app.js` 180 KB holds the tool state machines, grips and dialogs;
`model.js` the document + transactional undo; `geometry.js` snaps; `exchange.js` DXF;
`production.js` blocks/dims/layouts/UCS). Kestrel is a *generic* 2D drafting + 3D mesh/B-rep
app: it has **no** cabling/AV domain features (grep for rack/outlet/cable/conduit finds nothing),
~214 commands across 14 ribbon tabs, and its own roadmap gaps (no on-screen paper space, no
title blocks, no image/PDF insert — `bugs.md`, `notes.md` §8.4). So the comparison is about
*drafting mechanics*, and each K-item says whether Pages should **adopt**, **later**, or **skip**.

### 7.1 Where Pages is already ahead (don't chase Kestrel here)
On-screen paper space with draggable viewport frames, titleblock, per-frame scale/projection;
section boxes that drive live elevations; hidden-line + shaded iso; revision clouds and callouts
(Kestrel has neither); a layers panel with groups and view presets; image underlays with
origin/scale/crop calibration (Kestrel can't insert images at all); touch; a visible undo
timeline; drawing navigator + split panes; the model registry (a floor and a rack as separate
models in one sheet); a real 3D wall/conduit graph with mitres and bends. Kestrel's paper space is
"edit a LAYOUT as raw JSON, plot to SVG".

### 7.2 Findings

### K1. Command line  **adopt (Dave asked)**
Kestrel: a command dock under the canvas; any printable key focuses it; aliases (`L`, `LINE`,
`PL`, `C`/`CLOSE`, `U`); coordinate entry **absolute `100,50`**, **relative `@25,0`**,
**relative-polar `@100<45`** (`parsePoint`, UCS-aware); numeric entry for the active tool
(`acceptNumber` — radius, angle, scale factor); Enter/Space finish, Esc cancel, Enter on an empty
line repeats the last command; `;` chains commands; F2 opens the history.
Pages has the state machine already (`draft`, `cur`, `drawPoint`, `place`, `finishPolyline`);
what's missing is a text entry that feeds it. **Action:** `parts/CommandLine.svelte` at the pane
bottom (where `pane-status` is) + `commands/parse.ts` (`parsePoint(text, last)` → absolute/
relative/polar in model mm, `parseNumber`) + `acceptPoint(p)`/`acceptNumber(n)` on the editor
(R1). Tools that take a number after a base point: Line/Wall/Trunk length, Rotate angle, Scale
factor, Offset distance, Array counts (K4). Include the prompt text (already computed in
`prompt`) as the line's placeholder, like Kestrel.

### K2. One command catalogue  **adopt (prerequisite for K1)**
Kestrel drives ribbon, palette (Ctrl-K searches all commands by label/alias/description),
context menu, hotkeys and the command line from one `commands[]` table of
`[id, label, alias, description, icon]`. Pages has four separate lists: `TOOLS`/`STRIP`
(`+page.svelte:661-694`), `Menubar.MENUS`, `paletteItems` (drawings only), and the key handlers.
**Action:** `pages/commands.ts` `{ id, label, alias?, keys?, icon, group, run(ctx) }`; the tool
strip, menubar, Ctrl-K (drawings *and* commands), tooltips ("Line (L)") and the command line all
read it. This also gives K11's F-keys and X12's letter hotkeys one home.

### K3. Entity kinds  **adopt some**
Kestrel: LINE, POLYLINE (+rect/polygon wrappers), CIRCLE, ARC, ELLIPSE (axes), SPLINE, POINT,
TEXT, MTEXT, DIMENSION (7 kinds), LEADER, HATCH (+ associative islands), BLOCK/INSERT (+attributes,
dynamic), TABLE, MESH/solids, SECTION.
Pages: line, polyline, rect, ellipse, (circle dead), dim (aligned), text (+callout), image, box,
plus model prism/wall/conduit/opening.
- **Blocks + attributes — adopt (P1, todo §2 "true blocks" is Dave's ask).** Kestrel's model is
  the right one: `BlockDef { id, name, base: Pt, ents, objects? }` in the model registry;
  `Ent.type 'insert' { blockId, pos, rot, scale, attrs: Record<string,string> }`; BEDIT edits the
  definition and every insert follows; attributes are per-instance text (an outlet's label, a
  rack's name — exactly the EOS symbol need, and what Outlets' `locationId` link would attach
  to). Skip Kestrel's dynamic blocks (JSON-authored parameters); Pages' Properties panel covers
  "typed params".
- **Arc + polyline arc segments — later (P2).** Needed once conduit bends / door swings are
  drawn as annotations; the model already rounds conduits (`roundPath`).
- **Hatch — later (P2).** Room/zone fills and legend swatches; SVG `<pattern>` is enough.
- **Table — later (P2)** together with fields (K8): outlet schedules, cable counts, the revision
  table in the titleblock (todo §10). Sheets' `legend` annotation is the first table.
- **Spline, polygon, point, MTEXT, mesh/solids — skip.**

### K4. Modify commands  **adopt the ones a cabling plan needs**
Kestrel: move/copy/rotate/scale/mirror with base point + numeric entry, offset, trim/extend,
fillet/chamfer, rectangular + polar array, erase, join, explode, group, stretch, break, align,
match properties, divide/lengthen/reverse.
Pages: move (drag/nudge), duplicate (Ctrl-D, Ctrl-drag), rotate (handle only), delete, group,
z-order, clipboard.
- **Array (rect + polar) — P1.** Desk rows, outlets along a wall, racks in a row — the most
  repetitive EOS placement. Dialog like Kestrel's `arrayDialog` (cols/rows/dx/dy or count/angle)
  or command-line `AR`.
- **Mirror — P1.** Symmetric rooms and rack rows; trivial on `Ent` (negate about an axis), needs
  care on graphs (node coords) and `flip` for doors.
- **Offset — P1.** Parallel trunk runs, wall faces; `wallOffsets` in `projection.ts` already does
  the mitred offset — expose it.
- **Numeric move/rotate/scale from a base point — P1 with K1** (`M` → pick base → `@1200,0`).
- **Trim/extend, fillet (for 2D lines), join, explode (groups/blocks), match properties — P2.**
- **Stretch, break, align, chamfer, divide/lengthen/reverse — skip.**

### K5. Precision aids  **adopt**
Kestrel: osnap modes endpoint/midpoint/center/quadrant/node/insertion/**intersection/
perpendicular/nearest/extension**; ORTHO (F8); **POLAR tracking (F10)**; grid (F7) + grid snap
(F9); OSNAP (F3); **dynamic input** tooltip at the cursor (length/angle/radius); UCS (2D work
plane); units mm/cm/m/in/ft.
Pages: end/mid/center/quad (entities only), ORTHO, SNAP (100 mm), OSNAP, Shift 15°, CEN, guides as
a depth plane.
- **Snap to model geometry — P1.** `entSnaps` (`Viewport.svelte:1062`) ignores walls/prisms/
  conduits/openings, so you can't snap a dimension or an outlet to a wall corner. Add snaps from
  `project(o, dir)` outlines (R7) and graph nodes.
- **Intersection, perpendicular, nearest — P1** (nearest is what "draw a pipe onto this wall
  face" needs; the depth-snap in elevations is already a nearest-snap in one axis).
- **Polar tracking with alignment lines + dynamic input — P1 with K1.** Todo's "live spacing
  readout: Δ 1200 mm" *is* dynamic input; do it once for all tools (length + angle + Δx/Δy).
- **Extension, insertion (block base point) — P2** (insertion with K3 blocks).
- **UCS — skip**; Pages' guides + ELEV_BASIS are the work-plane equivalent. **Units — skip**
  (mm everywhere; only formatting like Sheets' `fmtDim` mm/m).

### K6. Selection  **parity, two adds**
Both: window vs crossing by drag direction, Shift-click add/remove, groups, Ctrl-A. Kestrel adds
**QSELECT / Select by filter** (by type/layer/property) and a properties-palette quick-action row.
Neither has fence/lasso/cycling. **Action (P2):** "Select similar" / "Select all on layer" /
"Isolate layer" (todo §3 mentions the last two) and **selection cycling** for stacked objects
(Tab or repeated click; Sheets does a second pass by footprint — the small-inside-large case).

### K7. Grips  **parity; edge grips via X2**
Kestrel `entityGrips()`: `translate` (line midpoint, circle centre), `point`, `radius` at the
four quadrants, arc `startAngle/endAngle`, ellipse `axisX/axisY`, `dim-offset`, spline
`control`; 7 px screen tolerance; capped at 60 selected entities for performance.
Pages: corner/endpoint/vertex grips, rotate handle, dimOff grip, callout tip, crop window, node
grips, door swing, prism corners. Missing: **edge (midpoint) resize grips** — take Sheets'
`TransformBox` (X2); ellipse axis grips (only if K3 arcs land); the 60-entity cap is a good idea
for `pick()` when Ctrl-A selects a whole floor (P6).

### K8. Annotation  **adopt linear dims + dimstyle; fields later**
Kestrel: dimensions aligned / **linear (H/V projected)** / angular / radius / diameter /
ordinate / centre-mark, **DIMSTYLE** (arrow size, text height, extension offsets); TEXT (height,
rotation, align) + MTEXT; LEADER (`bugs.md` suggests renaming it Callout); HATCH; **FIELDS**
(text bound to drawing properties, counts, formulas; `FIELDTABLE` linked schedules); TABLE;
FIND/REPLACE. No revision cloud.
Pages: aligned dim with arrows/ticks/text offset; text with pt/align/valign/rot; callout; cloud;
arrows on lines.
- **Linear H/V dimensions — P1** (todo already lists "aligned vs H/V"): a `dimKind:
  'aligned'|'h'|'v'` and the offset grip.
- **Dimension style = project defaults — P1, together with B3.** Text height, arrow length, tick
  size and offset in *paper mm* (B3's `paperMm`) stored once (project or sheet level, like
  Sheets' `DrawingDefaultsDialog`), so every dim on every sheet matches.
- **Radius/diameter — P2** (with arcs). **Angular/ordinate — skip.**
- **Fields — P2.** A `text` with `field: '{sheet.title}' | '{sheet.scale}' | '{count:layer=data}'`
  evaluated at render: the titleblock cells (TITLE/SCALE/REV/DATE are already computed values),
  the legend counts (Sheets' `legend` kind), and outlet schedules. Keep it to a fixed set of
  keys — no formula language.
- **Find/replace text — P3.**

### K9. Organisation  **adopt: layer linetype, saved views, block-of-model**
Kestrel layers: name/color/visible/locked/**linetype** (Continuous/Dashed/Center)/**lineweight
(mm)**, a layer-manager table dialog, per-layout-viewport `frozenLayers`, layer states
save/restore (= Pages view presets), ByLayer resolution for color/lineweight; blocks with
attributes and nested-layer visibility; groups; xref as a *local snapshot* of another drawing;
no named views; LAYOUT = paper mm + viewports `{center, scale 1:N, locked, frozenLayers}` edited
as JSON; PLOT to SVG.
- **Layer linetype + mm lineweight rendered — P2.** `PLayer.dash/weight` exist but the Viewport
  ignores `dash`, and weights are screen px; with R5 make `Layer { dash, weight_mm }` and render
  `stroke-dasharray`/`stroke-width` in paper mm (B3 unit). Todo §3 "mm lineweights".
- **Per-frame frozen layers — P2** = Sheets `layerOverrides` (R5). Kestrel and Sheets agree here.
- **Saved views — P2** (`{ name, proj, pan, zoom, orbit, layerPreset }`; todo §5 "Save view"
  button is the multi-user answer too).
- **Insert another model as a block — P2.** A rack model placed on the floor is Kestrel's xref /
  block-of-drawing; Pages' registry already references models per *frame* — add an `insert`
  of a model into a model (position + rotation), rendered through `project()` recursively.
- **Layout/plot — skip**, Pages is ahead; **plot styles/sheet sets — skip**, Packages covers it.

### K10. Viewing  **adopt visual style per frame; orbit button**
Kestrel: wheel zoom, middle-drag pan, Shift+middle orbit, fit, 7 standard views (adds bottom/
back), simplified ViewCube (3 faces + WCS iso button — same simplification Pages chose),
visual styles **wireframe / shaded-edges / shaded / xray**, perspective toggle, SECTION of solids.
Pages: drag-orbit in iso (no button — todo), 5 views + iso, ViewCube + live WCS triad (Pages'
triad rotates with the orbit; Kestrel's is static), shaded iso only.
- **Per-frame visual style — P2** `style: 'hidden' | 'shaded' | 'wireframe'`; `Model3d` already
  has both the face pass and the edge pass — expose the switch (Sheets' `hiddenLines`/`bw`
  source flags are the same idea).
- **Orbit button + Shift+middle-drag orbit — P2** (todo has it; Kestrel's binding is a good
  default so a right/middle drag stays a pan).
- **Bottom/back views, perspective — skip.**

### K11. UI conventions  **adopt F-keys + POLAR + tool-active context menu**
Kestrel: status toggles GRID SNAP ORTHO POLAR OSNAP LWT with F7/F9/F8/F10/F3; F1 help, F2
history; Delete/Backspace erase, Enter/Space finish, Esc cancel; context menu idle
(copy/paste/move/erase/fit/palette) vs tool-active (**finish / close / cancel**); properties
palette with quick actions; command palette over all commands; dynamic input; theme toggle.
Pages: GRID SNAP ORTHO OSNAP LWT CEN + ACAD, Ctrl combos, Esc ladder, right-click = finish or
revert to Select, no context menu, palette over drawings only.
- **F3/F7/F8/F9/F10 + POLAR toggle — P1** (one table via K2).
- **Tool-active right-click menu (Finish / Close / Cancel) — P2.** Compatible with Dave's
  right-click-to-finish preference: a *click* still finishes; the menu appears only when there
  is a choice (e.g. Close a polyline/wall loop). Idle menu with copy/paste/delete/fit — P2.
- **Space = finish/repeat — P1** (trivial, matches Kestrel/AutoCAD muscle memory).
- **Help (F1) — P3. Ribbon — decided no.**

### K12. Import / export / print  **adopt DXF import (port), SVG export**
Kestrel: `.kcad` native; **DXF read + write** (ASCII + binary, R2000 subset, `exchange.js` 639
lines: LINE/POLYLINE/ARC/CIRCLE/ELLIPSE/SPLINE/TEXT/MTEXT/INSERT/BLOCK/HATCH/DIMENSION/LEADER/
TABLE/LAYER/DIMSTYLE) plus an original-file-preservation path (`source-document.js`); DWG via an
optional local LibreDWG bridge; SVG export; PNG capture; PLOT = layout → physically sized SVG.
Pages: browser print of one sheet; no import/export. Sheets: DXF *write* only.
- **DXF import — P2 (todo §4 "PDF, image, DXF").** Port `exchange.js readRecords` → `Ent`/`Obj`
  mapping (plain JS, IIFE-namespaced, needs TS types): lines/polylines/arcs/text/inserts onto a
  Background layer, optionally walls from a `WALL`-named layer into the model. This is the one
  Kestrel module worth lifting wholesale; the writer can come from Sheets `dxf/dxf.ts` (X2).
- **SVG export — P2** (the paper is already an SVG/HTML tree; serialise the `SheetRender` of X5).
- **DWG — skip** (needs the local bridge). **PDF — via print (both).**

### K13. Do not copy
Mesh/B-rep solids and CSG booleans, the OpenCascade kernel bridge, parametric/assembly
constraints, dynamic-block JSON authoring, the WebGPU renderer, MTEXT/bidi engine, SHX fonts,
field formulas, the 45 duplicated ribbon placements `notes.md` §6 documents. Kestrel's own
`notes.md` §7.1 tiers ("Tier A core 2D drafting") is the right filter: Pages needs Home + View +
Drafting(blocks, dims, layouts) + the command line, nothing from Solids/Parametric/Assembly/
Exchange/Productivity beyond QSELECT and layer states.

### 7.3 Kestrel adoption order
| Priority | Items |
|---|---|
| **P1 (next)** | K2 command catalogue → K1 command line + coordinate entry; K5 snap-to-model + intersection/perpendicular/nearest + polar tracking + dynamic input; K4 array, mirror, offset, numeric move/rotate/scale; K3 blocks + attributes; K8 linear H/V dims + dimension style (with B3); K11 F-keys, POLAR, Space |
| **P2** | K3 arc, hatch, table; K4 trim/extend, fillet, join, explode, match properties; K6 select-similar/by-layer, cycling; K7 edge grips (TransformBox); K8 radius/diameter dims, fields; K9 layer linetype + mm weights, per-frame frozen layers, saved views, insert-model-as-block; K10 visual style, orbit button; K11 context menus; K12 DXF import, SVG export |
| **P3 / skip** | K8 angular/ordinate, find/replace; K10 bottom/back/perspective; K11 help; K13 |

---

## 8. Numbered index (for todo.md)

B1 svelte-check errors · B2 viewport scale ×0.805 · B3 zoom-dependent annotation sizes + PT ·
B4 per-tab history vs per-model data · B5 sections not undoable/global · B6 tab close deletes
page · B7 hit vs paint order · B8 Edit menu no-ops · B9 tolerance units · B10 tilted prism
pick/grips · B11 dead FrameSel path · B12 dead code/CSS/a11y · B13 id generators · B14 gesture
baseline in unfocused pane · B15 duplicate types · B16 two layer systems · B17 module
singletons · B18 tab dedup by title · B19 review-1 carry-overs.
R1 split Viewport (gestures/mapper/hit/grips/snap/place/render) · R2 document vs view vs
session state · R3 one selection model · R4 retire box/line/circle · R5 one layer model ·
R6 shrink VpOn · R7 one projection path · R8 PaperPage into Viewport · R9 split +page ·
R10 mock data folder · R11 doc hygiene.
P1 mapper per event · P2 hover hit passes · P3 snapshot size (base64) · P4 iso faces reuse ·
P5 tests + check gate · P6 grip memoisation.
X1 three sheet tools/two engines ◧ · X2 reuse from Sheets · X3 one panzoom · X4 persistence
pattern · X5 print route · X6 versioning schema · X7 underlays via files/PdfState · X8 trunks
mapping · X9 racks renderer · X10 risers embed · X11 touch reference · X12 hotkeys · X13 tests ·
X14 dead siblings · X15 z-order advantage.
K1 command line · K2 command catalogue · K3 entities (blocks/arc/hatch/table) · K4 modify
commands · K5 precision aids · K6 selection · K7 grips · K8 annotation · K9 organisation ·
K10 viewing · K11 UI conventions · K12 import/export · K13 do not copy.
