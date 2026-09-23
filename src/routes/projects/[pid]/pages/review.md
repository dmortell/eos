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
| B6 gap | 79bf6dc | **Done.** `dropDoc(pv.id)` now runs before the preview tab is retitled [verified by diff]. B6 closed. Carry into **B18**: the drawing id is the tab *title*, so a future rename orphans `docFrames/docPaper/docScale`; switch to the navigator node id when B18 lands. |
| B8 | 512ee31 | **Done.** Edit › Cut/Copy/Paste/Delete route to `cutEnts/copyEnts/pasteEnts/deleteSelection`; File › Open/Save/Export show a status hint [verified by diff]. Note for **R3**: the menu Delete only removes *entities* — the Delete key also handles model objects, graph nodes, sections and frames; the unified `deleteSelection()` in R3 should back both. |
| B7 | 15a81c2 | **Done.** `hit()` scans `paintEnts` top-most first [verified by diff]. Add the overlapping-layer case to `hit.test.ts` when R1 step 3 lands (P5). |
| B9 | 193573e | **Done.** One `tolMm(px) = hitTol(px)/dscale` for every hit/snap/grip pick, including `hitModel` (was raw `hitTol(4)`) [verified by diff]. |
| B3 | 73a44be | **Done.** `paperMm = 1/dscale` sizes dim text/arrows/ticks/offset, cloud bumps, callout leader, section labels and text (`fontPt · PT_MM · paperMm`, `PT_MM = 0.3528`); `textBox(e, mmPerPt)` gained an optional factor so hit-box and edit overlay match; `gripSize` is grips-only [verified by diff]. Two leftovers, filed as **B3 follow-ups**: (a) `PropertiesPanel.setCallout` (`:86`) still seeds the leader tip with the world-sized `PT` (96.25 mm/pt → ~2.3 m from the text at 8 pt) — leave `leader` undefined and let the Viewport's `paperMm` default place it, then delete `PT` from `geometry.ts`; (b) the iso ground-text size (`Viewport.svelte:2001`, `gripSize * 2`) is still screen-constant. |
| B3 (a) | 5b2eec7 | **Done.** `setCallout` sets `callout: true` and leaves `leader` undefined so the Viewport's `paperMm` default places the tip; unused `PT` import dropped [verified by diff]. `PT` stays in `geometry.ts` as `textBox`'s world-sized default (tests exercise it). (b) kept as intentional: iso is a model view, not a print target, so screen-constant ground text is fine. **B3 closed. B1–B12 + B14 all closed.** |
| B13 | 713ca20 | **Done.** `pages/ids.ts` `newId(prefix) = prefix + nanoid(8)`; `+page`, `Viewport` (`uid/mUid`), `graph.ts` (kept as a wrapper with its `'n'` default), `guides`, `layers` all route through it [verified by diff]. |
| B15 | da70b78 | **Done.** `pages/types.ts` owns `Proj` (= `Dir`), `SheetFrame` (was 3×), `SCALES`, `PROJ_OPTS` (derived from `DIR_LABEL`); `+page`/`PaperPage`/`PropertiesPanel` import them [verified by diff]. Remaining from B15, now under **R1 step 3**: `Viewport.kind` still uses `'floorplan'` where everything else says `'plan'` (`projKind`). |
| R11 | 1a673b8 | **Done** (light version): `pages/README.md` file map + coordinate reference, doc-map header on `todo.md`; git history is the changelog. No todo.md rewrite — fine. |
| R1 step 1 | 7562f8c | **Done** for `arrowPts`(size arg)/`cloudPath`(bump arg)/`groundPts`/`centerCorners`/`orthoPt` + `annotations.test.ts` (6 tests) [verified by diff]. Still in Viewport from the plan's §1 list: `sectionArrowFor` and `constrainPt(tool, …)` — move with step 3 or 6. |
| B16 | ec3cdb3 | **Done as an interim**: LayersPanel gets a "Model" section for the active model's layers with working eye + lock, and `modelLayerLocked` gates `hitModel`/`hitModelIso` [verified by diff]. The two systems still coexist (different id namespaces, presets cover page layers only) — that is **R5**, unchanged. |
| B17 | — | **Deferred into R1/R9 by agreement (2026-09-22).** A standalone reset of the module stores (`models/layers/imgEdit/modelSel`) is not enough: SvelteKit reuses the `+page` instance across a project→project navigation, so `tabs/panes/docFrames/hist` in `+page` would persist too. Complete fix = per-instance ownership (R1 editor + R9 workspace object keyed by pid). Interim guard if X4 (Firestore) lands first: `{#key page.params.pid}` around the shell in `+page`/`+layout` **plus** a `resetWorkspace(pid)` on the module stores — ~20 lines, not a band-aid, but only needed once real data is seeded. |
| R11 cont. | 53b3835 | **Done.** `CHANGELOG.md` (curated milestones), `model-plan.md` marked historical, README points at both. R11 closed. |
| R10 part 1 | e020836 | **Done** for the UI mock data: `mock/data.ts` (`NAV_TREE/NAV_PROJECT`, `PACKAGES/VERSIONS/REVISIONS`, `PALETTE_ITEMS`, `NODE_FIELDS`) [verified by diff]. Part 2 open: the demo model/layer/preset/image seeds in `3dview/models.svelte.ts` and `layers.svelte.ts`. |
| R4 part 1 | 7831a8c | **Done.** `'circle'` Ent type + `c/r` fields + every branch removed; grep confirms no remaining reference [verified]. Open: `'line'` → 2-point `'polyline'`, and the `'box'` Ent. **◧ Dave:** retiring `box` is a feature change (the Box tool creates a live cuboid annotation; 14 branches in Viewport + `boxElev/boxFaces/boxElevSet` + 4 tests). Options: (a) retire — Box tool becomes "prism on the annotation layer" (one 3D path, R7 benefits); (b) keep it as a lightweight sketch box. Review recommends (a); the other session deliberately left it for a focused pass. **Decided (Dave, 2026-09-22): remove `box`.** No annotation-typed prism (3D object annotations aren't expected) and no extra styles on prisms (they follow their layer). Passed to the other session. **R4 part 2 done (a9778ab):** `'box'` Ent + `h/z0` fields + `DEFAULT_BOX_H/ISO/boxElev/boxElevSet/boxFaces` + all Viewport/hit/Properties branches + 5 test blocks removed; Box tool dropped from the strip; grep shows only icon-name uses of "box" remain [verified; svelte-check 0 pages errors]. Viewport is 2086 lines. Still open in R4: `'line'` → 2-point `'polyline'`. (59a4eff adds `HANDOFF.md`, a working-state note.) |
| B19 part 1 | **7debfb6 on main** (was a4dd452 on `b19-props-textbox`, rebased, fast-forward; by session eos-12) | **Landed.** `constants.ts` gains `scaleDenom('1:N')` + `PT_MM`; `+page` derives `propsScaleN` (active extra frame's scale, else the tab's — same choice as the viewport bar); `PropertiesPanel` takes `scaleN` and uses `textBox(e, PT_MM · scaleN)` for text only [verified by diff; 83/83 tests in the worktree]. **Browser-verified** in the worktree (Vite needed an `fs.allow` override because the worktree's `node_modules` symlinks into `M:\dev\eos`): an 8 pt text on the 3303 Outlets sheet reads **W 169.3 / H 66.5 at 1:25** and **W 677.3 / H 257 at 1:100** in Properties — exactly `textBox(e, PT_MM·N)` — and tracks the drawn text (glyph bbox width 172.7 / 690.9; height differs only by textBox's own baseline-based estimate, same as the Viewport hit box). No console errors. **Merge note:** a9778ab (box removal) also edited `+page.svelte` and `PropertiesPanel.svelte`; rebase the branch onto main before landing (conflicts are in different spots). Remaining B19 bullets (PaperPage 4 px drag threshold, uncontrolled inputs, paper-relative paste/duplicate offsets, text-edit rot/align) stay with the R1 chain. |
| R1 step 3, slice 3 | cb41247 (+ a68cc5f HANDOFF) | **Done.** Model-object hit-testing in `hit.ts`: `prismRect/prismTilted/prismOutline/graphNodeDraw/graphHit/hitModel(ctx, p, thrMm, mlayers)/hitModelIso(ctx, p, mlayers)` with `convexHull/inPoly` internal; `ViewCtx` gained `mdl/yaw/pitch`; model-layer predicates passed as an arg like entity `pickable`'s; Viewport keeps four wrappers and dropped its `faces3d/isoDepthR/prismRings` imports; `hit.test.ts` +2 (prism hit/miss, layer gating) [verified by diff]. Viewport is now **1984 lines** (from 2124), `hit.ts` 222. Remaining in step 3 (agreed): `hitSection/sectionCorners`, `hitGuide`, `marqueeSelect` (sections/guides passed as args so they stay testable), then `pickAt`. |
| R1 step 3, slice 4 | a5c6a2a (+ 5c15f95 HANDOFF) | **Done.** `sectionCorners` (pure), `hitSection(ctx, sections, p, thrMm)`, `hitGuide(guides, p, thrMm)`, `marqueeSelect(ctx, ents, a, b, isPickable)` in `hit.ts`; section/guide lists passed as args (testable with literals); `onMarqueeUp` calls `marqueeSelect` and keeps group expansion; `hit.test.ts` +4 → 19 hit tests [verified by diff]. Viewport **1958 lines**. Step 3 is now complete except **`pickAt`**, which orchestrates the grip picks (`pickModelGrip/pickSectionGrip/gripsFor`) still in Viewport — agreed: do it **after step 4 (grips.ts)** rather than by passing those in as args, as a fresh careful pass. |
| R1 step 4, slices 1–2 | 55a0742, bda942e (+ 1d38f15 HANDOFF) | **Done.** `ui/grips.ts`: `resizeSectionClip`, `pickSectionGrip(m, sel, clientX, clientY)`; `MGrip`, `prismCorners(ctx, o)`, `applyPrismGrip(ctx, o, gi, p, anchor, rnd)`, `modelGrips(ctx, o, {rnd, applyNode})`, `pickModelGrip(m, grips, clientX, clientY)`. Both pick functions take a `Mapper` built once per press — the **P1 grip-loop leftover is now closed for section + model grips**; `modelGrips` takes `rnd/applyNode` via opts so there is no grips↔snap cycle and the mutate-in-place contract stays; `grips.test.ts` 4 tests [verified by diff]. Viewport **1884 lines**, `grips.ts` 112. Remaining in step 4: the entity grips (`Grip`, `ROTATABLE/canRotate`, `rotGripLocal`, `setFlatX`, `gripsLocal`, `gripsFor`, `constrainGrip`) threaded via `opts {gripMm, shift, imgCropId}` per plan §4, then `pickAt` (which also closes P1 for entity grips via `pick`). |
| R1 step 4, slice 3 + P1 | e694e94, 9b5c448 (+ f9d53f4 HANDOFF) | **Done — step 4 (grips.ts) complete.** Entity grips in `grips.ts`: `Grip`, `canRotate(ctx, e, imgCropId)`, `rotGripLocal(ctx, e, gripMm, shift)`, `setFlatX`, `gripsLocal/gripsFor(ctx, e, GripOpts)`, `constrainGrip(ctx, base, gi, p, shift, opts)` with `GripOpts {gripMm, shift, imgCropId}`; `grips.test.ts` 9 tests; `pick` builds one mapper per press → **P1 closed for all three grip pickers** [verified by diff]. The other session's browser was down for these two, so the interactive check was done here on the main dev server (5173): drew a rect on the 3303 Outlets sheet, selected it by its outline (4 corner grips + rotate handle shown), dragged the BR grip → `12700,7700 2100×1700` became `2800×2100` with the **top-left fixed** (grid-snapped), then dragged the rotate handle a quarter turn → `rotate(88 14100 8750)`; no console errors; 0 pages svelte-check errors, 90/90 tests. **Caveat closed.** Viewport **1729 lines** (−395 since the review), `grips.ts` 276. Only **`pickAt`** remains in steps 3–4; deferred until an interactive gate is available (HANDOFF has the spec) — this session can run that gate the same way when it lands. |
| R1 step 3 final — `pickAt` | 90373e7 (+ 8cf5239 HANDOFF) | **Done — R1 steps 3 + 4 complete.** `onDown`'s decision cascade is a pure `pickAt(clientX, clientY, p) → Pick` union (`mgrip \| sgrip \| grip \| ent \| guide \| section \| obj \| null`) in the original priority order; `onDown` switches on it and the gesture-start blocks are transcribed verbatim; `hoverBody` (P2) deliberately untouched. Gated **live here before commit** (the other session's browser was down) on the 5173 main-tree server, 3303 Outlets sheet, all with zero console errors: entity grip resize (anchor fixed) · entity body move · model grip resize · model body move+select · marquee window vs crossing · section border move + corner resize · guide place + drag. Diff re-read: routing only moved. Viewport **1730 lines**; `hit.ts` 264, `grips.ts` 276, `mapper.ts` 44, `annotations.ts` 46. Remaining R1: steps 5 (`snap.ts`), 6 (`place.ts`), 7 (`gestures.ts`), 8 (`render/EntRender.svelte`), 9 (delete the ctx wrappers, re-measure) + mop-ups (`'floorplan'`→`'plan'`, `constrainPt`/`sectionArrowFor` → annotations.ts, shared `PT_MM`, P2 `hoverBody`). |
| R1 step 5, slice 1 | bc5615f | **Done.** `ui/snap.ts`: `SNAP_STEP`, `snapToGrid(p, step)`, `snapDelta(dx, dy, base, step)`, `entSnaps(ctx, e)` (+ `snap.test.ts` 3 tests); `findSnap` calls the imported `entSnaps` and still writes `snapMark` (moves next slice) [verified by diff]. **OSNAP re-gated live here** (other session's browser still down): 3303 Outlets, viewport active, OSNAP on, Line tool hovered ~6 px off a rect's BR corner → the □ endpoint marker sat exactly on the corner (14000, 8700) and the placed polyline's first point was (14000, 8700); no console errors. Note the entity-only scope is unchanged (K5 "snap to model geometry" remains open — desks/walls don't offer snap points yet). 0 pages errors, 93/93 tests. Remaining in step 5: `findSnap/drawPoint` return the mark, `snapNode/graphNodeApply`, `elevDepthSnap`. |
| R1 step 5, slices 2–4 — **step 5 complete** | e4bccb0, c0828bd, 2eda177 (+ ff5aabe HANDOFF; by session eos-34, tests partly by eos-18) | **Done.** `snap.ts` now owns `findSnap/drawPoint` (return the `SnapHit`; Viewport wrappers assign `snapMark`), `snapNode/graphNodeApply` (+ `rndTo`; node mutation in place, mark returned) and `elevDepthSnap(ctx, p, tolMm, ml)`; `constrainPt(tool, a, p, shift)` moved to `annotations.ts` (closes the step-1 leftover); `snap.test.ts` grown to the full module [verified by diff]. **Live gates (5173, zero console errors):** OSNAP — marker + first point exactly on a rect corner (14000, 8700); ORTHO line axis-locked; Shift line exactly −15.000° with SNAP off (−14.62° with SNAP on = the pre-existing constrain-then-grid order in `drawPoint`, not a regression — see B19 follow-ups); node-snap — dragging a wall node within 6 px of another coincides them with the □ mark mid-drag, pulling it 50 px away disconnects; Front node drag moves vertically only by 294 mm (300 mm grid within px rounding); depth-snap — a Pipe whose first point is placed on the trunk's projected line in FRONT lands at plan y = 5300 (the trunk's depth), second point falls back to the centre (8750), and the amber `depthSnapMark` highlights the trunk when the next point hovers it. Independent check: 0 pages errors (the 10 repo errors are all pre-existing in `sheets/*` and `lib/dev/dxfVerify`), 181/181 tests. Viewport **1659 lines**. Remaining R1: steps 6 (`place.ts`), 7 (`gestures.ts`), 8 (`render/EntRender.svelte`), 9 (wrapper cleanup) + mop-ups (`'floorplan'`→`'plan'`, `sectionArrowFor` → annotations.ts, shared `PT_MM`, P2 `hoverBody`). |
| **B23** (new, observed during the step-5 gate) | — | **In an elevation a wall/conduit is pickable only near its BASE centreline, not across its drawn face.** `graphHit` (hit.ts) tests distance to the segment between `graphNodeDraw(a)`/`(b)`, which in an elevation is the node line at `GROUND − z` (z = 0 for walls) with slack `thickness/2 + tol` — so a 2800 mm-tall wall face has to be clicked within ~50 mm of its base to select it (that is what the gate had to do). Fix with **R7**: in elevation, point-in-polygon against the projected outline (`project(o, dir)`), as `hitModelIso` already does for faces. |
| R1 step 6 — `place.ts` builders | 56c85ad (eos-18; new files only, Viewport not yet wired) | **Done (additive).** `ui/place.ts`: `drawPlane`, `resolveLayer`, `buildEnt(ctx, tool, a, b, {centerDraw, uid})`, `PRISM_TOOL`, `trimTail`, `polylineEnt`, `GRAPH_TOOL`, `graphObj(ctx, tool, pts, GraphOpts)`, `prismObj`, `guideObj`, `imageWithOrigin`, `imageScaled`, `moveEnt(ctx, en, dx, dy)` + `place.test.ts` 25 tests [verified by diff; 25/25; 0 pages errors]. Accepted deviations from plan §6 (recorded in the commit): `drawPlane` returns `ElevDir \| undefined`; `prismObj` takes a pre-bound `uid` and resolves the layer from `ctx.mdl`; `graphObj`'s uid takes the prefix; `buildEnt` returns null for Furniture/Opening/Section/Text (prism specs live in `PRISM_TOOL`). Wiring the Viewport onto these is eos-34's follow-up commit; gate placement (rect/line/text/wall/pipe/furniture/opening/section/guide) then. Surfaced **B24** below. |
| **B24** (new; found by eos-18's `place.ts` port, **live-confirmed 2026-09-23**) | — | **An entity drawn natively in an elevation cannot be moved vertically, and is mirrored in the opposite view.** `moveEnt` (`Viewport.svelte:1052`, ported as-is to `place.ts`) tests flatness by *kind* (`FLAT.has(type)`) instead of `isFlatElev(ctx, e)`, so a rect/line/dim with `plane: 'front'` is treated like a plan flat: the drag's `dy` is dropped and `dx` is multiplied by the view sign. Live: in FRONT, a rect drawn there and body-dragged +60/+60 px moved `x 12300 → 13000`, `y` unchanged. Fix (behaviour change, separate commit, whoever wires `moveEnt`): `if (ctx.isElev && isFlatElev(ctx, en))` for the axis-lock branch; a native elevation entity falls through to the plain `translate`. Update the pinning test in `place.test.ts` accordingly. |
| R1 step 7 (slices 1–6) — **`gestures.ts`, step 7 complete** | d36f5b8, 72af7b5, b901686, f070ffc, d8d8f1c, 200a3e9 (eos-34) | **Done — PASS.** `ui/gestures.ts` `beginPointerDrag` + `DragRegistry` (`noteDown/noteUp/forget/multiTouch/cancelAll`) now carry every press-drag in the Viewport: iso orbit, section move/resize, guide drag, image scale-line endpoint, model body/grip, press-draw + marquee, entity move/grip/duplicate; `cancelPointerDrag = reg.cancelAll + draft abort`; the hover probe is skipped during any registry drag. `svelte-check` 0 errors under `pages/`, `pnpm test --project=server` 218/218, Viewport 1544 lines (at 200a3e9; tree quiet at 17b5be8, Viewport untouched). **Live-gated 2026-09-23 on 5173 (fresh load, mouse + touch pointer events):** (1) iso: plain drag orbits with no history step and nothing selected afterwards; Shift-drags of 5 px and 8 px land on the same 15° step while a plain 8 px drag differs; a 2nd pointerdown freezes the orbit and the next drag works. (2) section: no-move border click selects (class `sel`) with no undo step; border drag → `Move section` (size kept); corner grip → `Resize section` (opposite corner fixed); one step each. (3) guide: single click places, drag → `Move guide`; a 2nd (touch) pointer mid-drag stops it after ~110 mm of a would-be 980 mm move, no step, next drag works. (4) image scale mode (Background 1 shown, image selected, Props → Calibrate → Scale): two clicks place the line, `Real distance` pre-fills 2000; dragging the right endpoint moves only that point; 2nd pointer freezes it; next drag works. (5) model in plan: prism body drag → one `Edit model` step, Ctrl+Z restores; wall node grip drag moves the shared node of both walls with the □ osnap marker visible; Ctrl-drag from a node → a 5th wall segment from that node, undo removes it; Ctrl-press with no move → no stray segment, geometry unchanged; plain no-move node click + Delete → `Delete node` (its two walls join into one segment), undo restores. (6) EOS mode (ACAD off): press-drag → `Add rect` 2000×1000 exactly; marquee L→R selects only the fully enclosed rect, R→L crossing selects both, Shift-marquee adds to the selection, a 2 px marquee acts as a click. (7) entities: body drag → `Edit rect` (+500/+200 mm, grid-snapped), grip drag grows w/h, Ctrl-drag → `Add rect` copy with the original untouched, Shift-press+move moves nothing, the click after a drag keeps the selection; 2nd pointerdown mid entity-drag reverts the partial move (x 12100 → 11500), leaves no open step (next Ctrl+Z undoes the previous edit), and the next drag works. Zero console errors. **Gate notes (not regressions):** History panel lists at most 10 rows, so `newest` + undo/redo were the evidence; Shift-press then move only toggles the entity if the release point still hits it (`onClick` does the toggle by hit-test at release — same at 653eed6; see **B25**). |
| **B25** (minor, pre-existing) | — | **Shift-press + move on an entity toggles nothing if the pointer is released off the entity.** `onDown` returns early for a Shift-press on a body ("selection-only, toggles on release") but the toggle lives in `onClick`, which hit-tests the *release* point, so a slight Shift-drag off the outline (30 px in the gate) neither moves nor toggles. Same behaviour at 653eed6 (not step 7's). Fix when convenient: remember the pressed id and toggle it on pointerup regardless of where the pointer ends. |
| B13 (completion) | e55f96d (eos-18) | **Done — B13 closed.** `+page.svelte`'s last counters go through `newId`: `'sec'` (secSeq only numbers "Section A/B…"), `'vf'`, `'p'`, `'t'` (seq only numbers "Untitled N"); `ids.test.ts` (4 tests: prefix + 8-char URL-safe suffix, never `':'` — the pane/view keys split on it —, unique over 10 000). 218/218 server tests. Nothing else in `pages/` mints ids by clock/counter (`Viewport.clipNs` is a per-instance `<clipPath>` namespace, not an entity id; `place.ts` takes an injected `uid`). Live: sections, split pane (`Split editor right` → 2 panes) and entity duplicates all minted without error on 5173. |
| R1 step 8 — `ui/render/EntRender.svelte` | 17b5be8 (eos-18; new file only, unwired) | **Done (additive) — diff PASS.** Compared element-for-element against the `drawnGround` / `drawn` snippets at 653eed6 `Viewport.svelte:1387–1487` and the paint-loop dispatch at `:1269` (ground-in-iso → ground poly/text; `e.rot` → `<g rotate>`; else plain): every element, attribute, class and `clipPath` id matches. Agreed differences: `style` prop (`lwt/canvasZoom/paperMm/gripSize/ink/sel/layerColor`), `selected` for `seld`, `imgCrop` for `imgEdit.mode==='crop' && id`, `ctx.ground` for `GROUND`, `PT_MM` from `constants.ts` (same 0.352778), `isoGround` prop, and a scoped `text.anno` monospace rule (the Viewport's `.vp-svg text.anno` can't reach a child). `style.gripSize` is kept only for the iso ground text (`2 × gripSize`, the B3 switch point). svelte-check: no diagnostics on the file. **Wiring note for eos-34:** build `style` once as a `$derived` object in the Viewport and pass the same reference to every `<EntRender>` (not an inline literal per entity), and keep the loop's filter (`editText`, hidden layer, `inThisView`) in the caller as the header says; gate = paint identical before/after (screenshot diff of Plan/Front/3D), then step 6 wiring. |
| R1 step 6 wiring — Viewport onto `place.ts` | 806dccd (eos-34) | **Done — PASS (behaviour-preserving).** `place()` → `buildEnt` / `PRISM_TOOL` + `prismObj` / section (still inline, B5); `finishPoly` → `polylineEnt` / `trimTail` + `graphObj(ctx, tool, pts, {guide, depthSnap, uid, layerId})`; `placeGuide` → `guideObj`; origin/scale → `imageWithOrigin` / `imageScaled`; `moveEnt` → `place.moveEnt` (B24 carried over, pinned test kept); `layerId` → `resolveLayer`. Viewport 1544 → 1500 [verified by diff]. **Live 2026-09-23 on 5173 (fresh loads):** EOS press-drag Line / Rect / Ellipse / Dim (`Add line/rect/ellipse/dim`, exact snapped geometry) and CEN rect centre-out (500×300 → 1000×600 about the first point); ACAD polyline by 3 clicks + double-click → 3 points, zero-length tail dropped; Furniture footprint → prism on the Furniture layer; Opening → prism on the Openings layer (`#334155`, `opening: true`; door default per `prismObj` + test); Wall in plan → new 100-thick segment on the walls layer; guides H + Shift-V in plan (`Add guide`); guide in FRONT lands on the front plane (`Add guide`, y 8743) and in 3D does nothing (no step); Pipe in FRONT without a guide: first node depth-snapped onto the trunk (plan y 5300), second fell back to the plan centre (8750), toast "No depth guide — points snap onto nearby walls…" shown; image Origin click → anchor marker at (10000, ≈5000), Scale line 2000 → 4000 → image doubled about that anchor (9000,4400 10000×7150 → 7999,3810 19996×14297, `Edit image`); a rect drawn natively in FRONT (`Add rect`) body-dragged +60/+60 px moved x 12000 → 12700 with y unchanged (B24 behaviour preserved) and is not shown in plan; a plan polyline dragged +60 px in REAR moved x 10500 → 9800 (mirrored). Not live-covered: Pipe in FRONT *with* a selected plan guide (my harness lost the guide selection on the view switch; `graphObj` pins `guide.pos` for every node in `place.test.ts` and the wiring passes `selectedPlanGuide(...)` unchanged). Zero console errors. Harness notes for later gates: elevation views flip y inside `.m3d` (`scale(1,-1)`), so map clicks from the trunk bbox top ↔ z 2675; the Shapes button is titled `Rectangle` (not `Shapes — Rectangle`) once Ellipse was last used. |
| R1 step 8 wiring + mop-ups — `<EntRender>` paint loop; `FLAT`/`PT_MM`/`sectionArrowFor` shared | 29745b7 (eos-34), 8564e64 (eos-18), 6542d5b (eos-34) | **Done — PASS, paint identical.** Paint loop → `<EntRender {e} {ctx} selected style={entStyle} {isoGround} imgCrop {clipNs}/>` with `entStyle` one `$derived`; `drawn`/`drawnGround` snippets and their orphaned CSS deleted; `hit.ts` exports `FLAT`/`isFlat` (place.moveEnt imports them), `PT_MM` from `constants.ts` everywhere (pinned by a bbox-vs-textBox test), `annotations.sectionArrowFor(clip, dir, size)` with the Viewport wrapper passing `tolMm(11)`. Viewport 1394 lines; svelte-check 0 errors under `pages/`; server tests 224/224 [verified by diff]. **Paint diff 2026-09-23:** the same scripted document (line, rect, ellipse, dim, 3-point polyline, section marker; states: nothing selected / LWT on / dim selected; Front; 3D) was built on HEAD 6542d5b (5173) and on a 9b2fb3a worktree (5177, pre-wiring); the normalised `.vp-svg` markup (svelte hashes, clipPath ids and float noise stripped) hashed **identical in all five states** (plan 3315 chars ×3, front 2498, iso 13021) — so rect/ellipse/polyline/dim (teal `#0e7490` when selected, `#0e766e` otherwise), LWT (0.52 display line ↔ default weight) and layer colour are byte-for-byte the pre-wiring output. Also checked on HEAD: multi-line text (2 `tspan`s) + callout (rounded rect + leader + arrowhead), image in crop mode (faint 0.35 full image + clipped image + dashed window rect, 1 `clipPath`), iso ground shapes as projected polygons/polylines + iso text; line arrows and cloud rects are covered by the element-for-element diff of the component (row above). Section arrows: unselected = the active direction only (front, bottom edge, pointing up); selected = 4 `pick` arrows — rear top edge pointing down, right at the right edge pointing right, left at the left edge pointing left — with the inactive ones at 20 % fill; points identical to the baseline. Zero console errors. |
| R1 step 9 part 1 — dead / single-call-site wrappers | 36270d8 (eos-34) | **Done — PASS.** `inScope`/`prismRect` wrappers (dead) deleted; `constrainPt(tool, …)`, `drawPlane(ctx)`, `groundInIso(ctx, e)`, `rotCenter(ctx, e)`, `hitModelIso(ctx, p, mlayers)`, `sectionArrowFor(clip, d, tolMm(11))`, `constrainGrip(ctx, …, gripOpts())` inlined at their one call site; `snapNode` is an inline arrow in `graphNodeApply`'s opts; `layerId` dropped for `graphObj`'s `resolveLayer` default (same `mdl`). Viewport 1365 lines; svelte-check 0 errors under `pages/`; server tests 224/224 at 36270d8 (235/235 at 8324721) [verified by diff]. **Live 2026-09-23 on 5173:** ACAD Line rubber band with SNAP/OSNAP off — hover at 20.03° reads 20.03° plain and exactly 15.00° with Shift (pointermove `shiftKey` + Shift keydown); Text placed in FRONT shows in Front and not in Plan (`plane: 'front'`); 3D click on a desk selects the prism (6 amber faces); section marker selected → the same 4 arrows as the previous gate (points identical); Shift-drag of a rect's corner grip → 2100×2100 square (`constrainGrip`); a wall node dragged to 3 px from the room corner shows the □ marker at (18000, 12000) and lands exactly on it (inline `snapNode`); Wall drawn in plan → walls layer stroke (`resolveLayer` default). Zero console errors. |
| K5 prep — `snap.objSnaps(ctx, o, ml)` | fa982e7 + 8324721 (eos-18; `snap.ts` + `snap.test.ts` only, **unwired**) | **Reviewed by diff — OK, additive.** Model-object snap candidates as the analogue of `entSnaps`: nothing in iso or on a hidden layer (locked objects still snap, like locked entities); prism → corners + edge midpoints + centre of its drawn face — `prismRect` AABB when upright, the AABB corners rotated about the footprint centre with `hit.rotatePt` for a plan prism with `rot` (8324721 closed the AABB gap eos-18 flagged; elevation keeps the AABB face regardless of `rot`, pinned as intended), `prismOutline` for a tilted prism (B10); wall/conduit → every node as `end` + segment midpoints as `mid`, no `center`. `findSnap` untouched apart from a FUTURE note, so no behaviour change anywhere; `Viewport` has no reference. Wiring (and whether entity snaps win over model snaps) is K5 proper and waits on Dave. Note for the wiring: `prismRect` inherits **B21** (odd-`edges` prisms), so those corners will be off until B21 is fixed. |
| R1 mop-up — Viewport kind `'floorplan'` → `'plan'` (**R1 mop-up list closed**) | eaaf50b (eos-34) | **Done — PASS.** `Viewport.kind` prop/default/`tagIcon`/`viewSpace`/`ctx.isPlan`, `+page projKind` (now identity), `PaperPage VKind` + the plan-only sections gate, `view.ts ViewCtx.dir`, four test fixtures; `Model3d` takes `dir={kind}`. Only prose mentions of "floorplan" remain in the tool (comments in `+page`, `3dview/types.ts`, one Viewport comment). Viewport 1364 lines; svelte-check 0 errors under `pages/`; server tests 235/235 [verified by diff + grep]. **Live 2026-09-23 on 5173:** Top / Front / Rear / Left / Right / 3D each render the model (9 polygons in the elevations, 54 in 3D, the 4 room walls with identical points in plan before and after the round-trip) and accept an edit (`Add rect` in every kind, undone); a plan-drawn section marker shows in plan (1) and in none of the other kinds (0); the plan tag icon is still `map-pin` (elevations `server`, 3D `box`); split editor right → the right pane set to Front keeps `Front1:25` after focusing the left pane and back, and after switching its tab away and back (`docProj`/`projKey` intact). Zero console errors. |
| R1 close-out (docs) | 9bb7cff (eos-18; `refactor-plan.md` §11 only) | **Noted — R1 steps 0–9 done, list of commits/deviations recorded there.** Read and agreed with the framing: Viewport 2209 → 1364 lines, still far from §9's ≤ 600 target; §11 measures what remains (event handlers 318 lines, ctx wrappers 216, section/guide/image/orbit UI 170, model-store mutations 100) and names **B5** (sections into the model, ~65 lines of marker UI) and **R6** (shrink `VpOn` + the drag-state union / `onDown` dispatch) as the moves that get there — both are already numbered items here, so the todo transfer needs no new number. The four plan deviations (`drawPlane` returning `undefined` for plan, `PRISM_TOOL` table instead of a second builder, injected `uid`, explicit `opts` for `graphNodeApply`) all match what the §0a rows above accepted; `gestures.thresholdPx` exists but is unused until **B19** part 2 decides which drags debounce. |
| **B24 — FIXED** | 18ade46 (session eos-07, who reports Dave approved B24/B25/K5 together; I did not see that approval myself) | **Done — PASS.** `place.moveEnt` tests flatness with `isFlatElev(ctx, en)` instead of the kind set, so only a PLAN-plane flat is axis-locked in an elevation; an elevation-native shape translates freely; the pinned test is rewritten to the intended behaviour (+ a native line case). `place.ts`/`place.test.ts` only. svelte-check 0 errors under `pages/`; server tests 238/238 [verified by diff]. **Live 2026-09-23 on 5173:** the B24 repro — a rect drawn natively in FRONT body-dragged +60/+60 px — now moves `x 12000 → 12700, y 8200 → 8900`; a rect drawn natively in REAR dragged +60/+60 px moves `x 13500 → 14200, y 8000 → 8700` in its own drawing coords (no mirror) and is not shown in Front; a plan-drawn polyline dragged +60 px in REAR still mirrors x only (`10500 → 9800`, y unchanged). |
| **B25 — FIXED** | 07a0195 (eos-07) | **Done — PASS.** `onDown` records `shiftPressId` on a Shift-press over an entity body (and clears it on every press); `onClick`'s additive branch toggles that id instead of hit-testing the release point. Viewport +7 lines [verified by diff]. **Live:** Shift-press on an unselected rect, drift 40 px off it, release → the rect is selected (4 grips) and unmoved; the same gesture again → deselected; a plain click on the toggled rect keeps it selected; Shift-press-drag on empty space still runs the marquee (the rect inside it gets selected). |
| **K5 — model-object OSNAP wired** | 9be21a6 (eos-07; `snap.ts` + `snap.test.ts` + 2 Viewport lines) | **Done — PASS.** `findSnap`/`drawPoint` take `objs` + `ml`; the Viewport passes `mdl.objects` + `mlayers`, so `objSnaps` candidates (prism corners `end` / edge mids `mid` / centre `center`, wall + conduit nodes and segment mids) compete with entity snaps on the same nearest-wins terms (tie → the entity found first); 3 new tests incl. hidden layer → no snap. svelte-check 0 errors; 238/238 [verified by diff]. **Live:** Line tool hovering a desk corner (11500, 6200) shows □, its top-edge midpoint △, its centre ○, and the room's wall node (10000, 5000) □; a click near the corner then a far click lands the polyline start at exactly `11500,6200`; a rect's corner grip dragged to 4 px off the wall node (18000, 12000) shows □ and lands exactly there (rect 14000,6000 → 4000×6000); with the Furniture model layer hidden the desk corner gives no marker while the wall node still snaps, and it returns when the layer is shown; entity OSNAP unchanged (□ at the polyline's own endpoint). Zero console errors. **Notes:** (1) `prismRect` inherits **B21** (odd-`edges` prisms) — those corners are off until B21 lands (eos-07 noted it in the commit); (2) perf: every pointer move with OSNAP on now recomputes `objSnaps` for every model object (prism outline / graph node projection each time) — fine for the mock's ~10 objects, worth a per-view cache keyed on `(mdl, kind)` before models get large (P1 family; no number yet — fold into **P1** if it shows up in profiling). |
| **B5 (Viewport side) — sections are model edits** | 5db346f (eos-07) | **Lifecycle PASS; one blocking bug → B26 below — B5 stays open until it lands.** Sections are created / moved / re-aimed / deleted inside the Viewport on `mdl.sections` bracketed by `beginedit → modeledit(label) → endedit` (like guides); the `sections` prop, `SectionMarker` type and the `section/sectionmove/sectionsetdir/sectiondelete` callbacks are gone (+page keeps `selSection/selectSection/dropSectionDir/findSection`); new `place.sectionObj` (plan-only clip floor→ceiling slab, default `front`) + `sectionName` (first FREE letter per model — a deleted letter is re-used; behaviour change from the old global counter, accepted). Viewport 1380, +page 1239; svelte-check 0 errors under `pages/`; server tests 240/240 [verified by diff]. **Live 2026-09-23 on 5173 (from the second section onward — see B26 for the first):** cut → `Add section`, marker selected with toolbar; next cut → `Section B`; select A + Delete → `Delete section`, selection + toolbar cleared; cut again → `Section A` re-used; border drag → `Move section` (13300,9300 → 13752,9752) as one step; corner grip → `Resize section` (3500×2500 → 3950×2835) as one step; toolbar direction → `Set section direction` with the right-edge arrow now active; toolbar trash → `Delete section` + cleared; four undos walk back delete → direction → resize → move exactly, four redos return; the active arrow drops a Front frame on the sheet (1 → 2 viewports); the plan frame shows its model's section (1), the Front frame none (0); the Rack model tab shows none. Zero console errors. |
| **B26** (new, **blocking B5**; found gating 5db346f, live-confirmed twice) | — | **The first section — and the first guide — added to a model that has no `sections` / `guides` array yet is silently lost.** `(mdl.sections ??= []).push(sec)` (`Viewport.svelte:198`) and `(mdl.guides ??= []).push(g)` (`:509`): `x.y ??= []` evaluates to the RAW `[]` that was assigned, not the `$state` proxy now stored at `mdl.sections`, so the push mutates the raw array behind the proxy's back — the proxy's `length` signal stays 0, nothing renders, `sectionName` sees no sections, and the NEXT push (through the proxy) writes index 0 over the lost one. Live: fresh load, one Section cut → history `Add section` but no marker, no toolbar; second cut → a single marker named `Section A` at the second box; undo/redo of the first step shows nothing. Same on the Rack model with the Guide tool: click 1 → `Add guide` but 0 lines, click 2 → 1, click 3 → 2 (this is the "first guide is flaky" I had written off as harness noise in earlier gates — it was this). Fix (2 lines, both sites): `if (!mdl.sections) mdl.sections = []; mdl.sections.push(sec)` — re-read through the proxy after creating the array (or seed `sections: []`/`guides: []` in `migrateModels` as well, belt and braces). See memory note "Svelte $state proxy trap". Re-gate: fresh load → first cut renders `Section A` with toolbar; first guide on the Rack model renders. |
| **B26 — FIXED; B5 CLOSED** | c4b364c (eos-07; Viewport only) | **Done — PASS.** Both `??=` pushes replaced by create-then-re-read-through-the-proxy (`if (!mdl.sections) mdl.sections = []; mdl.sections.push(sec)`, same for guides); no other `??= [])` in `pages/` (grep). svelte-check 0 errors under `pages/`; server tests 240/240. **Live 2026-09-23, fresh load:** the first Section cut renders `Section A` selected with its toolbar and one `Add section` step; undo removes it, redo restores it; the second cut is `Section B` (2 markers); the first Guide on the floor model (no `guides` array in the mock either) renders with `Add guide`. With this, **B5 is closed** on both sides (sections live in the model as `Section[]`/`Clip`, edited in the Viewport, per-model). |
| **B20 — FIXED** | 41d12f8 (eos-18; `3dview/projection.ts` + test; approval relayed by eos-07) | **Done — PASS by diff + tests.** `trimToClip`'s wall test is now the exact extruded-face test: XY segment-vs-clip-rectangle overlap (`segInXY`, slab clipping) AND z-band overlap `[min z, max z + h] ∩ [c.z0, c.z1]`, so a clip box strictly between a wall's base and top catches it; conduits keep the exact 3D `segIn` (a diagonal-in-z conduit with overlapping XY/Z ranges but a non-intersecting line must still miss — pinned by a new test). The `it.fails` from the B20 filing now passes as a normal test. Server tests 246/246 at HEAD 7cc3a50; svelte-check 0 errors under `pages/`. Not live-driven (no UI to set a section clip's z-range yet — clips come from `sectionObj` as floor→slab). |
| **B21 — FIXED** | b31ec37 (eos-18) | **Done — PASS.** `boxFootprint` normalises by the polygon's actual per-axis min/max (translate + scale into the box) instead of max\|cos\|/max\|sin\|; even edge counts are numerically identical to the old formula (pinned to 9 dp in the test); odd counts now fill the box; `prismRings`/`prismOutline` (render, hit, grips) and K5's `objSnaps` corners inherit the fix. **Live 2026-09-23:** the desk prism set to `Sides` 3 renders `13100,7000 11500,6600 13100,6200` — spanning its full 11500..13100 × 6200..7000 footprint — and the Line tool snaps □ exactly on its vertex (13100, 7000); undo restores the 4-sided desk. The K5-row caveat is closed. |
| **B23 — FIXED** | 2b91b3d (eos-07; `hit.ts` + 5 tests) | **Done — PASS.** `graphHit` in an elevation tests point-in-polygon against each segment's `project()` box mapped with Model3d's elevation xform (centreline test kept as fallback; plan unchanged). Pick order unchanged: last object in the list whose face contains the point wins (no depth sort), same rule prisms already follow. **Live in FRONT:** a click on the front wall at z 1400 selects it (4 amber faces), a click above its top (z 3300) selects nothing, a click on the trunk face at z 2600 selects the trunk; in plan the wall centreline click still selects. |
| **B19 part 2 — FIXED** | 7cc3a50 (eos-07) | **Done — PASS.** PaperPage frame drag on `beginPointerDrag` with `thresholdPx: 4`; PropertiesPanel body under `{#key selKey}` so inputs remount on a selection change; Ctrl-D = 5 paper mm and paste = 5 paper mm × N per paste (model mm = paper mm × scale); the inline text editor honours align / valign / rot. Viewport 1386, PaperPage 223, PropertiesPanel 420 [verified by diff]. **Live 2026-09-23:** a 3 px press-release on the sheet frame's band moves nothing and leaves the frame selected with its 4 grips; a 5 px drag moves it 5 px and a 40/20 px drag 40/20 px, two undos put it back; Ctrl-D on a rect in the 1:25 frame offsets the copy by exactly 125 mm (= 5 paper mm × 25); Ctrl-C then Ctrl-V twice stacks copies at 125 and 250 mm; a centred text (`text-anchor: middle`) double-clicked opens the textarea over the text's box. Properties: typing `1` then `12` into the selected frame's W and blurring commits once (`Edit viewport`, clamped to the 60 minimum) and the input then shows the committed value; the remount-on-selection-change itself is verified by diff only — my harness could not reach an entity numeric input to type into (the rect's Weight row has no plain input), so "type 5, click another entity, its value untouched" is not live-covered. Rotated-text editor placement also diff-only (no rotation control found for text in Props). |
| R6 commit 1 — `ui/modelEdit.ts` (region 7 store mutations) | 2937573 (eos-18; eos-07 diff-reviews only) | **Done — PASS (behaviour-preserving).** `addModelObj / deleteModelSel / deleteGraphNode / insertGraphNode / branchNode (pure) / addGuide / addSection / setSectionDir / deleteSection / setSectionClip` take `(mdl, edit: EditScope {begin, mark, end}, …)`; the Viewport builds `edit` once from `on.beginedit/modeledit/endedit` and keeps thin wrappers (selection stays a view concern); the dead `sectionById` helper is gone; B26-safe pushes; `modelEdit.test.ts` with a recording `EditScope` pins bracket order + labels. Viewport 1386 → 1343; svelte-check 0 errors under `pages/`; server tests 267/267 [verified by diff]. **Live 2026-09-23 on 5173, fresh load, one step each with the same labels as before:** Furniture prism → `Edit model`; Wall → `Edit model`; double-click on the wall → node inserted (grips 2 → 3) `Edit model`; degree-2 node + Delete → `Delete node` (grips back to 2); Section → `Add section`; direction set to the SAME value → **no step** (history unchanged); set to Right → `Set section direction`; trash → `Delete section`; Guide → `Add guide`; prism + Delete → `Delete`; twelve undos return the model to 9 polygons / 0 guides and twelve redos to 10 / 1. Degree-1 node (end of the standalone wall) + Delete → `Delete node`, segment and object gone (walls 5 → 4); Ctrl-drag a branch from the room corner (`Edit model`, 5 walls) then delete that degree-3 node → `Delete node`, first two segments joined into one, the branch dropped (5 → 3), undo restores 5 then 4. Zero console errors. Commit 2 (the `VpOn` split) may start. |
| R6 commit 2 — `VpOn` split into 8 view events + `Editor` (**R6 closed**) | dd4a67c (eos-18; eos-07 diff-reviews only) | **Done — PASS.** `ui/editor.ts`: `Editor = { ents: add/update/delete/select/copy/cut/paste/group/ungroup/reorder, edit: EditScope, sections: select/dropDir }` + `noopEditor` default (every method a no-op, so the Viewport calls `editor.ents.x(…)` with no `?.`); `VpOn` keeps only `activate/deactivate/view/orbit/scale/status/coords/tool` (the `on.` survivors grep to exactly those); `+page` `vpOn` → `vpView(a, pane)` + `vpEditor(a)` (the same editor object for every frame on a tab — entities aren't frame-scoped — and per-frame `vpFrameView`); PaperPage takes `makeFrameEditor`. Viewport 1336 lines, +page 1244; svelte-check 0 errors under `pages/`; server tests 270/270 [verified by diff]. Not memoised: `vpView`/`vpEditor` are still built per render like the old `vpOn` (no regression, no gain — R9 territory). **Live 2026-09-23 on 5173:** no errors on mount or at any point (window error listener empty); dbl-click activates and Esc deactivates; pointer moves update the status bar coords ("14000, 8748 mm"); with "Pan content" on, a right-drag inside the active frame pans only that frame's content and Ctrl-wheel zooms only it (frames and the other frame's model unmoved; with it off the SHEET pans/zooms — by design, the vab toggle); 3D drag orbits; the scale dropdown `1:25 → 1:1 → 1:25` retags the frame; tool switch via toolbar. Editor through frame 1: `Add rect`, select (4 grips), Delete → `Delete`, undo restores. Section (`Add section`) → Select tool → active arrow → a second (Front) frame is dropped (1 → 2); through frame 2: `Add rect` (front-native), select, `Delete`, undo, `Add guide` — same labels and one step each; the plan frame keeps its marker, the Front frame shows none. Commit 1's model ops unchanged (only the call routing moved). Harness notes: a section's `pick` arrows need the Select tool active; the second frame's `.vp-interior`/`.vp-band` are siblings of its `.vp`, not children. |
| R2 commit 1 — `viewState.svelte.ts` (pan/zoom, orbit, projection, canvas) | 767d6b8 (eos-18; eos-07 diff-reviews only) | **Done — PASS (behaviour-preserving).** Five `+page` maps (`docCanvasView`, `cvCache`, `docProj`, `docOrbit`, `docView`) → one `Map`-backed store with typed accessor pairs (`getView/setView`, `getOrbit/setOrbit` at pane × view × projection; `getProj/setProj`, `getCanvas/setCanvas` at pane × tab) + `drop(ids)` matching `dropDoc` exactly; `viewState.svelte.test.ts`. **Semantic call (eos-18 asked):** the two key granularities are real — pan/zoom/orbit are per projection, the projection choice and paper-canvas position are per tab — so typed accessors over one store are the right shape; do NOT force a single `get/set(pane, view, proj)` signature. +page 1244 → 1232; svelte-check 0 errors under `pages/`; server tests 270/270 [verified by diff]. **Live 2026-09-23 on 5173 (Pan content on):** a plan pan (wall 11 → 71 px), a Front pan (trunk 59 → 19 px) and a 3D orbit each survive flipping through the other projections and come back exactly; split editor right → a pan in the right pane's viewport (8 → 78 px) leaves the left pane's untouched (105) and both keep their state on refocus; the sheet canvas pan writes `eos.pages.canvasView` (per tab id) and the status-bar `+` zooms the sheet with Pan content off. Two pre-existing gaps surfaced, filed below as **B27** and **B28** (neither introduced here). Commit 2 (`doc.ts` / `PageDoc`) may start; B27's fix belongs there. |
| **B27** (new, pre-existing; found gating 767d6b8) | — | **The persisted sheet canvas view is dead weight.** (1) `refitAll()` runs on mount (`$effect … mounted … refitAll()`, same at e7d6bfb), so the view loaded from `localStorage` is overwritten by the fit before the user sees it — live: a sheet panned/zoomed to 48 % came back at 97 % after a reload and the stored entry was rewritten to the fit; (2) the cache is keyed by TAB id, and tab ids are minted fresh per session (B13), so an entry can never match after a reload anyway, and `drop()` never prunes it (eos-18 preserved `dropDoc`'s behaviour) — `localStorage` accumulates one orphan per opened tab. Fix in R2 commit 2 once `PageDoc` exists: key the canvas view by DRAWING id, skip the mount fit for a drawing that has a persisted view (fit only when there is none), and prune on close; or drop the localStorage layer if per-session is all Dave wants. **Decision (Dave via eos-07, 2026-09-23): option (a)** — keyed by drawing id, mount fit skipped when a persisted view exists, pruned on close; folded into R2 commit 2. Gate there: pan/zoom → reload → same view; a fresh sheet still fits; a closed drawing's entry is pruned. |
| **B28 — FIXED** (new, pre-existing, minor) | c101442 (eos-18; not live-gated, see below) | **On a sheet the status-bar zoom `+`/`−`/Fit ignore "Pan content".** `zoomsContent(p.activeId)` tests `isVpActive(tabId)`, but on a sheet the active viewport is a FRAME id (`activeVpOf` already knows this), so the content branch is never taken and `+` zooms the paper even with the toggle on (live: 48 → 60 % with Pan content on; wheel/drag inside the frame do honour it). Fix: `zoomsContent = (p) => navContent && !!activeVpOf(p.activeId)` and route to that frame's view. **Fix (eos-18):** `zoomsContent` now takes the pane and resolves the real active viewport id via a new `activeViewportId(p)` (= `activeVpOf(p.activeId)`); `dispZoom`/`navZoom` index `viewOf`/`setView` by that id, not `p.activeId`. Found + fixed the SAME root cause in two more spots while in there: `activeProj(p)` always called `projOf` (tab-level, viewState-backed) even for a sheet with an active frame, so it silently ignored the frame's own `.proj` (e.g. reporting 'plan' while a 'front' elevation frame was active) — now resolves the active frame's `.proj` for sheets, `projOf` only as the no-frame-active fallback; `fitPane`'s Fit-vs-fit-paper branch had the identical `isVpActive(p.activeId)` bug, now `activeViewportId(p)`. Left AS-IS (flagged as a separate, not-yet-reported gap in a code comment, not touched): `fitPane`'s orbit-reset line still keys by `p.activeId` unconditionally, so a sheet's active-frame orbit isn't reset by Fit — same `p.activeId`-vs-`activeVpOf` family of bug, for orbit rather than zoom, out of scope for B28. No unit test: the routing logic reads `+page.svelte`-local component state (`session`, `framesOf`, `activeVpOf`) throughout, same as every other helper in that file — not extractable to a pure function without a larger refactor, so (per Dave's routing-helper caveat) none was added; verified via svelte-check + the existing 340/340 suite (no regressions) only. Not live-gated per Dave's process change — for the batched review: confirm on a sheet, with Pan content ON and a frame active, that `+`/`−`/the status % zoom the frame's content (not the paper) and Fit resets that frame's view to 100%/centred; with Pan content OFF or no frame active, `+`/`−`/Fit should zoom/fit the paper exactly as before. |
| **B28 follow-up — FIXED** (found reviewing c101442) | 136580b (eos-18) | **eos-07 caught in diff review:** `fitPane`'s new content-reset branch fired for a SHEET whenever a frame was active, regardless of "Pan content" — but `fitPane` is also the auto-refit path (mount, split/unsplit resize, the Full-size layout toggle), not just an explicit Fit. So an explicit Fit with Pan content OFF reset the frame to 100% instead of fitting the paper (backwards from B28's intent), and every automatic refit silently reset the active frame's pan/zoom too. **Fix:** `fitPane` takes a new `explicit` opt, passed only by `navFit()` (the toolbar button + Edit-menu Fit — the two user-initiated triggers). Content-reset now requires `av === p.activeId` (a model-layout tab, unconditional — matches every pre-B28 trigger, that case never touched a sheet) OR (`opts.explicit && zoomsContent(p)`) — a sheet frame only resets on a deliberate Fit with Pan content on. Full suite 340/340, svelte-check unchanged. Not live-gated. |
| **B30** (new, filed per eos-07, not fixed, harmless) | — | **`fitPane`'s orbit-reset line writes under the wrong key for a sheet's active frame.** It stays keyed by the TAB id unconditionally (deliberately left alone by the B28 fix — resetting a model-layout tab's own orbit on Fit, active or not, is pre-existing behaviour); with a sheet frame active, `activeProj(p)` now correctly resolves the FRAME's own `.proj`, so this line writes the tab-keyed orbit entry under (tab id, frame's proj) instead of the frame's own orbit key (paneId, FRAME id, proj). Harmless — nothing reads that (tab id, frame's proj) combination — but noted so it isn't lost. Fix (when picked up): key the orbit reset by `activeViewportId(p) ?? p.activeId` instead of `p.activeId` alone. |
| R2 commit 2 — `doc.svelte.ts` (`PageDoc`) + **B27 fix** | 57d2653 (eos-18; eos-07 diff-reviews only) | **Done — PASS; B27 FIXED.** `docs` store: `PageDoc { id, title, kind, paper, scale, frames, revisions?, modelId?, dir? }` keyed by DRAWING id (today the tab title — B18's fragility noted in the file), replacing `docFrames/docPaper/docScale`; `allFrames()/restoreFrames()` keep the history snapshot shape (frames only; full replace, so undoing past a frame's creation removes it — pre-existing); `dropDoc` never touches `docs` (B6). B27: the canvas seed is keyed by drawing id, `hasCanvas()` lets the mount-time `refitAll({ skipIfPersisted })` skip a drawing with a persisted view (an explicit Fit still refits), `drop(ids, drawingId)` prunes the seed on close. Latent bug fixed in passing: `paperOf/scaleOf` fell through wrongly for an empty id (`&&`/`??` mix) — now explicit ternaries. +page 1235; svelte-check 0 errors under `pages/`; server tests 270/270 (`doc.svelte.test.ts` + extended `viewState` tests) [verified by diff]. **Live 2026-09-23 on 5173:** sheet panned + Ctrl-wheeled to 81 % → the entry is stored under `"3303 Outlets"` (drawing id) → reload → **81 %, frame at the same offset (10, 10, width 616)** — the mount fit is skipped; the status-bar Fit still refits to 97 %; a paper-size change (A3 → A4 via the status-bar select) survives switching to another tab and back; a section arrow drops a second frame, Ctrl+Z removes it (2 → 1 frames), Ctrl+Y restores it; closing the sheet's tab removes its `localStorage` entry; a newly opened sheet ("33F — High Level Outlets") fits to paper at 100 % with no stored entry to skip. Zero errors. **Not live-covered:** reopening the SAME closed drawing (the mock's "3303 Outlets" isn't in the Ctrl+K search catalogue, so I could not reopen it) — B6's "frames/paper/scale survive close + reopen" rests on the diff (`dropDoc` drops `viewState` only, `docs` untouched) + the doc store tests. Note: pre-B27 `localStorage` entries keyed by old tab ids (e.g. `t2`) are never pruned — harmless, one-off manual clear or a version bump on the key. |
| R2 commit 3 — one `session` object (**R2 closed**) | fa8d38e (eos-18; scripted rename + hand-fixed collateral; eos-07 diff-reviews only) | **Done — PASS.** `+page` only: `tabs/panes/focused/previewId/activeVps/selFrame/selSection/treeNode` become one `session` `$state` object (~210 call sites); `docSel` deliberately left for R3. Reviewed the rename's risk points: no bare references to the old names remain in the script (only prose comments), no `session` collateral in `<style>` or `class="…"` strings, `activeVps` is still a `Set` that is REASSIGNED on activate/deactivate (so it stays reactive inside the proxy), and the preview-reuse / `dropDoc` / `closeTab` hunks read as pure renames. +page 1252; svelte-check 0 errors under `pages/` (warnings back to the 130 baseline per eos-18); server tests 270/270 [verified by diff]. **Live 2026-09-23 on 5173, fresh load, zero errors:** activate (dbl-click) / deactivate (Esc); draw a rect → `Add rect`; **New page** → "Untitled 5" opens and focuses; back to the sheet the rect is still there; Ctrl+Z removes it, Ctrl+Y restores it (global history intact); **Split editor right** → 2 panes sharing the 5 tabs, the right pane's viewport activates independently; **Close this split** → 1 pane, rect intact; the **All pages** overflow menu lists every tab + New page and picks one; closing "Untitled 5" leaves the sheet's rect and its `1:25` scale intact (only session + view state freed); **preview-tab reuse (B6):** a single click on a navigator leaf opens an italic preview tab, a single click on another leaf REPLACES it (tab count stays +1), the first reopens by title, closing the preview returns to 4 tabs. Not covered: `treeNode` → Properties (no tree row selectable in the mock DOM I could find) — pure rename, low risk. **R2 (three commits) closed**; R3 next. |
| R3 commit 1 — `ui/selection.ts` (pure helpers, unwired) | 67f3368 (eos-18) | **Reviewed by diff + tests — OK, additive.** `SelItem = { kind: 'ent' \| 'obj' \| 'guide' \| 'section' \| 'node' \| 'frame'; id; sub? }`, `Selection = SelItem[]`; `selOnly` (replace), `selToggle` (additive ONLY for `'ent'` — group toggle all-in → remove, any-out → add; any other kind replaces; empty items = no-op), `selClear`, `idsOfKind`, `singleOfKind`, `groupByKind` (the per-kind `delete()` dispatch shape). 15 tests; server tests 285/285; nothing imports it yet. Exclusivity rules were derived from the current code and match it: `'ent'` is the only multi/additive kind; obj/guide/section/frame/node are single and mutually exclusive; `'node'` (`id` = parent object, `sub` = node id) replaces a plain `'obj'` of the same object. **Notes for the wiring (commit 2):** (1) the derived read-only `modelSel` for Model3d must include a `'node'` item's PARENT id (`id`) so the object keeps its highlight and grips while a node is selected — today `nodeSel` rides on top of `modelSel`; (2) per Dave's amendment the stored `Selection` is per viewport (frame id / tab id), retained across activation switches and shared by two panes on the same viewport; (3) `selToggle` with a current non-`'ent'` selection and `'ent'` items drops the non-ent item — that is the intended exclusivity, pin it once in the wiring tests too. |
| R3 commit 2a — `Editor.sel` + per-viewport `selStore` (entity + model-object/guide) | e5dda75 (eos-18) | **Done — PASS.** `selStore.svelte.ts` keyed by VIEWPORT id (sheet frame id / model-layout tab id — the same id space as `viewState`/`activeVps`, so two panes on the same viewport share one selection, per Dave's amendment); `Editor.sel = { get, only, toggle, clear, delete }` wired in `+page` (`deleteSelAt` dispatches ent → `deleteEnts`, obj/guide → `deleteModelSel`); Viewport's `sel`/`modelSel` are local derived reads of `editor.sel.get()` (the `sel` prop and the global `modelSel` store are gone; Model3d gets the derived ids); section/node/frame stay on their old mechanisms until 2b. Disclosed behaviour changes: placing a model object clears a stray entity selection; Esc clears an object/guide selection too; entity + obj/guide Delete are one dispatch. svelte-check 0 errors under `pages/`; server tests 287/287 (55-line `selStore` test + the added exclusivity pin) [verified by diff]. **Live 2026-09-23 on 5173, zero errors:** rect selected in the plan frame (4 grips, Properties shows the rect); a section arrow drops a Front frame; deactivate by double-clicking the paper → activate the Front frame → its own rect selected there (4 grips, plan frame shows none) → paper double-click → reactivate the plan frame → **the plan rect is still selected with its grips and Properties shows it**, while the Front frame's rect stays in that frame's own selection; Delete in the plan frame removes only its rect (`Delete`), the Front frame's rect survives; the room wall selected (4 amber faces, Properties shows the object) → Esc clears it and the viewport stays active; wall + Delete → `Delete`, undo restores; rect selected → Furniture drag → the rect's grips are gone and the new prism is selected; split editor right on the same sheet → selecting the rect in the left pane shows its 4 grips in the right pane's copy too (shared per viewport). Observation, not a defect: an inactive viewport does not draw its retained selection (grips appear once it is active again) — same as before. Harness note: Esc on a viewport with a selection clears the selection first (by design), so frame switches in a gate must go through the paper double-click. 2b may start. |
| R3 commit 2b — sections + nodes into the Selection model | c9d6ff0 (eos-18) | **FAIL (one regression) — otherwise PASS; re-gate on the fix.** `session.selSection` and the local `nodeSel` are gone; `'section'`/`'node'` are Selection kinds in the per-viewport store; `editor.sections` keeps only `dropDir`; the Esc and Delete ladders each collapse to one branch; `deleteSelAt` keeps the pre-R3 rule that a node delete which only joins/prunes leaves the parent object selected. svelte-check 0 errors under `pages/`; server tests 287/287 [verified by diff]. **Live 2026-09-23 on 5173, zero errors — PASS:** section cut selects it with the toolbar; click on empty space clears; border click re-selects (4 pick arrows); the selection survives paper double-click + reactivation; Delete key → `Delete section` and the toolbar goes; trash → `Delete section`; Esc clears a section and the viewport stays active; wall + inserted middle node → grip click shows the node selection with the parent still highlighted (2 amber faces) and gripped (3 grips); it survives paper double-click + reactivation; Esc from a node clears the whole selection in one step (2a's Esc rule extended — pre-R3 Esc didn't touch a model selection at all, so this is a change, not a regression; demotion node → object still happens on a fresh press). **FAIL — B29:** with a node selected, **Delete records `Delete` and removes the WHOLE wall object** (standalone wall with 2 segments: 6 → 4 wall polygons, selection cleared) instead of `Delete node` joining the two segments — the same click sequence gave `Delete node` at R6 commit 1 and at 2a. Cause (read from the code): the no-move node-grip release calls `selectNode(...)` (`Viewport.svelte:638`), but the synthetic `click` that follows runs `onClick`'s Select cascade, whose `hitModel(p)` at the grip position hits the wall and calls `selectObj(mid)` (`:265`), REPLACING the `'node'` item with `'obj'` before Delete runs. Pre-R3 that same cascade wrote `modelSel = [obj]` while `nodeSel` was separate state riding on top, so the node survived. Fix: suppress the click after a no-move grip release (`suppressClick = true` on that path, as the entity-drag path does), or have the cascade keep a current `'node'` selection whose `id === mid`. Re-gate: mid-node click + Delete → `Delete node`, object survives and stays selected (2 grips, amber); end-node (degree 1) + Delete → `Delete node`, object removed, selection cleared. |
| **B29 — FIXED; R3 commit 2b PASS** | 713422f (eos-18; Viewport only: `suppressClick = true` on the no-move node-grip release, the pattern every other no-move gesture already uses) | **Done — PASS.** svelte-check 0 errors under `pages/`; server tests 287/287 [verified by diff]. **Live 2026-09-23 on 5173, fresh load, zero errors:** standalone wall with an inserted middle node → middle grip click → Delete: the two segments join into one (6 → 5 wall polygons) and the object stays selected (2 grips, highlighted); end grip click → Delete: the object is removed (5 → 4) and the selection is cleared; two undos restore 6; smoke: section border-select + Delete removes the marker, rect select + Delete removes it, room wall select + Esc clears with the viewport still active. With this R3 commit 2b is closed; commit 3 (Properties by kind + frame selection) may start. |
| R3 commit 3 — frame selection into the Selection model (**R3 closed**) | ca7f2cb (eos-18) | **Done — PASS.** `session.selFrame` gone; PaperPage takes a page-level `editor` prop whose `sel` holds the `'frame'` kind (stored under the TAB id in `selStore`, alongside the per-frame viewport selections); `paperEditor(a)` wraps `vpEditor` so a frame-border pick also clears the tab's ACTIVE frame's own selection (a frame and a viewport selection never both show "selected"); `activateFrame` clears the frame selection on entry (symmetric with the paper double-click exit, which cleared it pre-R3 too — "not retained across activation", accepted); frame Delete (paper-space key + Properties button) routes through the same `deleteSelAt`. PropertiesPanel props left as resolved objects (its truthy chain is now correct because the data is exclusive) — internal-only refactor skipped, agreed; guides/sections still fall through to the general Properties view (unchanged, never had UI). svelte-check 0 errors under `pages/`; server tests 287/287 [verified by diff]. **Live 2026-09-23 on 5173, fresh load, zero errors:** frame band click → frame selected (4 corner grips) with the VIEWPORT properties (Source / View / Scale + X Y W H); double-click into it → frame selection cleared, viewport active; a rect selected inside → paper double-click → frame band click → frame selected while the rect's viewport selection stays stored and reappears only when that frame is active again (never both at once); typing `77` into a rect's X field then picking the wall leaks nothing (B19 remount); a Front frame dropped from a section → its band selected → Delete removes it (2 → 1) and Ctrl+Z restores it; split editor right → the frame selection shows in both panes (per tab). **R3 (commits 1, 2a, 2b + B29 fix, 3) closed.** |
| R4 part 3 — `'line'` retired → 2-point `polyline` + `migrateEnt` | 840ff65 (eos-18) | **Done — PASS.** `'line'` is out of the `Ent` type union; a straight shape is `polyline` with two points; `migrateEnt` (3dview/migrate.ts, run by `migrateModels`) converts a legacy line at load keeping every other field, idempotent (4 tests); every `'line'` branch in geometry / hit / annotations / grips / snap / place / EntRender / Properties dropped; a 2-point polyline gets the endpoint grips + rotate handle + Shift-15° that `'line'` had (`grips.is2PtPolyline`) while 3+-point polylines keep plain per-vertex grips; arrows now render on any polyline (fixes the silent no-arrows on ACAD 2-click lines, which were already polylines). Leftover, harmless: `PropertiesPanel STROKE_TYPES` still lists `'line'` (dead entry — drop in part 4). svelte-check 0 errors under `pages/`; server tests 294/294 [verified by diff]. **Live 2026-09-23 on 5173, zero errors:** EOS press-drag Line → `10500,5500 12500,5500` as `Add polyline`; ACAD two-click Line + double-click → a second 2-point polyline; a 3-click polyline shows 3 vertex grips; the 2-point one shows 2 endpoint grips plus the rotate-handle circle; Properties `Arrows` → both → 2 arrowhead polygons (`Edit polyline`); with the Line tool the endpoint snaps □ and the midpoint △; a Shift-drag of an endpoint toward 20° lands on exactly **15.00°** (`10500,5500 → 12556.4,6051.0`); undo restores. **Not live-covered:** the load-time migration of a legacy `'line'` (the mock has none and models load at module init) — rests on the 4 `migrate.test.ts` cases (convert + preserve fields, non-line untouched by reference, idempotent, empty model). |
| P5 — 3dview engine tests | **ae87b63 on main** (cherry-picked from a30123d; by session eos-18) | **Landed** — 54/54 green on main. Test-only: `3dview/graph.test.ts` (9), `migrate.test.ts` (8), `projection.test.ts` (37 incl. one `it.fails`) — 54 tests, all green in the worktree; the engine sources (`projection/graph/migrate/types.ts`) are byte-identical to main tip, so the results apply to main [verified]. The branch is *behind* main (no grips/snap slices), so land by **cherry-pick onto main tip**, not a branch merge. The tests surface two engine defects, filed below as **B20/B21**; both also exist in `sheets/tools/model3d` (same code — X1). |
| **B20** (new) | — | **`trimToClip` misses a wall when the clip's z-range lies strictly between the wall base and top** (`projection.ts` `trimToClip`: `segIn` is probed only at `z` and `z+h`; a clip `z 1000..2000` on a 3000-high wall drops it). Encoded as `it.fails` in `projection.test.ts` so it flips green when fixed. Fix: test the wall segment as a z-extruded quad — xy slab test plus `[z, z+h]` overlapping `[clip.z0, clip.z1]`. Low impact today (sections default to `modelZRange`), bites the first user-narrowed section box. |
| **B21** (new) | — | **`boxFootprint` only fills the bounding box for even edge counts** — the max\|cos\|/max\|sin\| normalisation centres point-symmetric polygons only; a 3-gon on a 400-wide box spans x 0..300. Affects odd-`edges` prisms in plan/elevation render, hit and grips (B10's `prismOutline` inherits it). Fix: normalise by the polygon's actual min/max per axis (translate + scale to the box). Test pins current behaviour; update it with the fix. |
| **B22** (by session eos-18 at eos-34's request; live-confirmed 2026-09-22) | **08512dd — FIXED** (eos-34; `snap.ts` + `snap.test.ts` only). **Live-gated after the fix (5173, zero console errors):** in FRONT the Line tool hovering the plan line's raw coords (13200, 9600) now shows **no** marker; its ground-line ends (13200, 10250) and mid (14000, 10250) snap; a plan **rect** in an elevation now offers the 3-point ground line (ends + mid) instead of the old 9-point ground ± 2 box (probing the old box corner returns the ground end); a rect drawn native to FRONT offers nothing in REAR (raw or mirrored). Plan-view OSNAP unchanged (rect corner + edge midpoint exact). 0 pages errors, tests green. **B22 closed.** Original report: | **`entSnaps` offers PHANTOM snap points for flat plan-plane lines / polylines / dims in an elevation, and `findSnap` considers entities that are not in this view.** Live repro (5173, 3303 Outlets, OSNAP on): a plan Line with first point (13200, 8400); in the FRONT frame the Line tool hovering at drawing (13200, 8400) — 1850 mm above the ground line, empty space — shows a □ marker exactly there, while hovering the collapsed position (13200, 10250) where the line is actually drawn offers no snap. Code evidence: the render collapses any `isFlatElev(e)` entity to `<line y={GROUND}>` over `flatXSpan(e)` (`Viewport.svelte` `{#if isFlatElev(e)}` branch) and `hit.bbox` does the same, so rect / ellipse / image snaps (which go through `bbox`) land on the ground line — but `entSnaps` returns the raw `a` / `b` / `pts` for `line` / `polyline` / `dim` regardless of `ctx`, and the Viewport wrapper passes the FULL `entities` list to `findSnap` (`Viewport.svelte` `findSnap` wrapper, `sFindSnap(ctx, m, entities, …)`). In a Front elevation a plan line `(100,200)→(300,200)` is drawn at `y = 10250` from `x 100..300` but snaps at `(100,200)` / `(300,200)` / `(200,200)`: with OSNAP on the □/△ marker appears ~10 m above the drawn line in empty space and the placed point lands there. Second symptom: an entity native to another plane (`plane: 'rear'`) or scoped to another frame offers snap points in a Front view since nothing filters by `inThisView`. Current behaviour is pinned by `snap.test.ts` "lines and polylines ignore the view ctx…" (c0828bd). **Fix (snap.ts only, behaviour change, separate commit after step 5):** (1) at the top of `entSnaps`: `if (isFlatElev(ctx, e)) { const [x0, x1] = flatXSpan(ctx, e); return [{ point: [x0, ctx.ground], type: 'end' }, { point: [x1, ctx.ground], type: 'end' }, { point: [(x0 + x1) / 2, ctx.ground], type: 'mid' }] }` — this also replaces the odd 9-point `ground ± 2` box that rect / ellipse currently get in an elevation with the 3-point ground line the user sees; (2) in `findSnap`, skip `!inThisView(ctx, e)` (import both from `./hit`). **Exact test changes (`snap.test.ts`):** replace the "lines and polylines ignore the view ctx" test with `it('in an elevation a flat plan line / polyline snaps on the GROUND line: ends + mid of its x-span')` expecting `entSnaps(elevCtx('front'), line(100,200→300,200))` `toEqual([{ point: [100, 10250], type: 'end' }, { point: [300, 10250], type: 'end' }, { point: [200, 10250], type: 'mid' }])` and, for the polyline `[[0,0],[100,0],[100,100]]` in `elevCtx('right')` with `u0 = cx + (0 − cy)`, `u1 = cx + (100 − cy)`, `toEqual([{ point: [u0, 10250], type: 'end' }, { point: [u1, 10250], type: 'end' }, { point: [(u0 + u1) / 2, 10250], type: 'mid' }])`; change the "in a FRONT elevation a flat rect collapses…" test from 9 points at `ground ± 2` to `toEqual([{ point: [0, 10250], type: 'end' }, { point: [200, 10250], type: 'end' }, { point: [100, 10250], type: 'mid' }])` and the RIGHT-elevation rect test likewise (`[u0, 10250]`, `[u1, 10250]`, mid); the "NATIVELY in an elevation" test stays as is (a `plane: 'front'` rect is not `isFlatElev`). Add to `findSnap`: `expect(findSnap(elevCtx('front'), ident, [ent({ id: 'x', type: 'line', a: [500, 500], b: [600, 500], plane: 'rear' })], 501, 501)).toBe(null)`. Live check to run before landing (needs an authenticated browser — eos-f8): 3303 Outlets, a Front elevation frame active, OSNAP on, a plan-drawn Line at plan y ≈ 200; hover the Line tool at plan `(100, 200)` in the elevation → today a □ marker appears there in empty space; after the fix it appears only on the ground line. |
| R1 step 2 | 4ebef85 | **Done** (additive): `ui/mapper.ts` `makeMapper({rect, vbW, minX, minY, cx, cy, view, dscale})` → `{toModel, toClient, tolMm}`, faithful to `toLocalXY/localToClient/hitTol/dscale`; `mapper.test.ts` (3 tests, round-trip + tolerance at 1:1 vs 1:100) [verified by diff]. Viewport still uses its inline wrappers. Next sub-step (per plan §2/§9): build one Mapper per event in `onDown/onMove/onClick/onDblclick` and the drag handlers (delivers **P1**), and extend `MapperArgs` with `pxPerUnit`/`paperMm`/`gripMm` so B3's sizes come from the same object. |
| R1 step 2 wiring + P1 | 5206eb4 | **Done (P1 mostly).** `toLocalXY/localToClient/tolMm` delegate to `makeMapper`; `findSnap` builds one mapper per pass and reuses `m.toClient` per snap point — the big P1 cost (9 layout reads per rect per move) is gone [verified by diff]. **P1 leftover:** `pick` (`:1379`), `pickModelGrip` (`:890`) and `pickSectionGrip` (`:676`) still call `localToClient` per grip, i.e. one `getBoundingClientRect` per grip of the selected object on every press/move — same one-mapper-per-pass treatment, a few lines each. Plan deviation accepted: `MapperArgs` not extended with `pxPerUnit/paperMm/gripMm` since render/grips use the reactive deriveds; revisit only if `EntRender` (step 8) needs them as props. |
| R10 part 2 | b7e1158 | **Done.** `mock/models.ts demoModels()` (floor + rack + seeded image) and `mock/layers.ts DEFAULT_LAYERS/DEFAULT_PRESETS`; the stores clone the seeds into `$state` and keep only registry + mutators [verified by diff]. **R10 closed.** Firestore (§12/X4) now replaces one folder: `mock/`. Note for B17/R1: the stores still seed at module load; once per-instance ownership lands, seeding moves into the workspace constructor. |
| R1 step 3 | in progress | Agreed cadence: verified slices (3a `ViewCtx` + `ctx` derived → 3b leaf predicates/`bbox`/`hitEnt` (+ `PropertiesPanel.bbox` dedup, B19) → model/section/guide hits → `pickAt` last), one commit each, browser re-verified. `pickAt` may land in a later session; that is fine — each slice is independently useful and the plan's step 4 (grips) only needs 3b. |
| R1 step 3, slice 1 | 84c53a0 | **Done.** `ui/hit.ts` with the ctx-free primitives `rotatePt/isFilled/inBox/onPlanPlane` + `hit.test.ts` (6 tests); Viewport imports them, behaviour identical [verified by diff]. Two agreed deferrals: the `'floorplan'`→`'plan'` rename of `Viewport.kind` is a separate mop-up (not needed to move functions; `ctx.dir = kind`); and **B19's `PropertiesPanel.bbox`** is *not* a straight duplicate — it is view-agnostic and only the text box is crude (fixed 10×40 units). Follow-up under B19: pass the focused viewport's scale denominator `scaleN` to the panel and use `textBox(e, PT_MM · scaleN)` for text; no `ViewCtx` needed in the panel. |
| R1 step 3, slice 2 | 530ec40 | **Done.** `ui/view.ts ViewCtx` (`dir/isPlan/isElev/isIso/elevDir/cx/cy/ground/frameId/paperMm`) and the ctx cluster in `hit.ts`: `inScope/inThisView/groundInIso/isFlatElev/flatXSpan/bbox/rotCenter/hitEnt/pickable(ctx, e, layerPreds)`; Viewport builds `ctx` once (`$derived`) plus thin wrappers so ~36 call sites are untouched; `hit.test.ts` now 13 tests [verified by diff]. This is the unblock for **step 4 (grips)**. Housekeeping note: `Viewport.svelte` is still ~2127 lines because every moved function left a one-line wrapper behind — expected; the line count drops at plan step 9 when call sites take `ctx` directly and the wrappers go. Queued for next session (agreed): `hitModel/hitModelIso`, `hitSection/sectionCorners`, `hitGuide`, `marqueeSelect`, then `pickAt` (+ the grip-loop P1 fold-in, and `constrainPt`/`sectionArrowFor` from step 1). |
| B11 | 15a6984 | **Done.** `FrameSel`, `viewportSel/onFrame`, `VpOn.frame` and the dead Properties `viewport` branch removed (−35 lines); the live `frameObj` path untouched [verified by diff]. |
| B12 | fb83f36 | **Done** for the dead-code part: `palette.LAYERS/LayerDef`, StatusBar `layout` prop + commented button + unused import + CSS, `+page` `.side-body*`, HistoryPanel `.hp-row.rev:hover` [verified by diff]. Deliberately left, agreed: the ~10 a11y warnings (want real keyboard handlers, not `svelte-ignore` — fold into R9/R1 when those components are touched) and the `MMPU` elevation ground line (live but fixed 400-unit extent — make it span the model/viewBox when R7's `viewMap` lands). |
| B10 | 15a81c2 | **Done.** `prismTilted/prismOutline` (tilted rings → view drawing coords → convex hull) drive `hitModel`; tilted prisms keep only the rotate handle [verified by diff]. Notes for **R7**: `convexHull`/`inPoly` now duplicate `projection.ts hull()` and `hitModelIso`'s in-polygon test — fold into the shared `viewMap`; `inPoly` has no pick slack (`thr`) so a thin tilted prism is only pickable inside its silhouette. |

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
(`guides.svelte.ts:13`), `layers.svelte.ts:79,88`, and `graph.ts newId(prefix)` (counter + clock).
**Action (Dave, 2026-09-22): use `nanoid`** — already a dependency (`package.json`), already what
`sheets/data.ts` and `uploads` use. One `pages/ids.ts` with `newId = (prefix = '') => prefix +
nanoid(10)`; replace all six generators, including `graph.ts newId` (keep its `prefix` argument so
node/segment ids stay readable). Collision-free across viewport instances, sessions and users —
which the clock+counter schemes are not once Firestore lands.

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
**Close-out (eos-18, 2026-09-23):** landed as commit 1 (`67f3368`, pure model) → 2a (`e5dda75`,
entity + obj/guide wiring, per-viewport `selStore`) → 2b (`c9d6ff0` + fix `713422f` for B29) →
commit 3 (`ca7f2cb`, section/node/frame folded in, `deleteSelAt` is the one `deleteSelection()`).
**Deliberate deviation from the original Action, accepted by eos-07:** `PropertiesPanel.svelte`
keeps its five separate resolved-object props (`ents`/`modelObj`/`frameObj`/`node`) rather than
taking `Selection` + resolvers — its existing truthy-chain already resolves to the right branch
per kind now that the underlying data is genuinely mutually exclusive (commit 3's `paperEditor`
fix), so reshaping the props would be a purely internal refactor with no behaviour change. Revisit
only if a future kind (e.g. a dedicated guide/section Properties view) needs the panel to branch
on something the resolved objects can't express.

### R4. Retire the second 3D box and the second line type  **[design]**
`Ent.type 'box'` (mock cuboid) duplicates `Prism`: its own elevation face (`boxElev`,
`boxElevSet`), oblique iso faces (`boxFaces`, `ISO = 0.6` — a *different* projection from the
model's orbit camera), elevation grips, z0 handling, Properties fields, and 4 test cases. The
Furniture tool already makes a prism. **Action:** delete `box` (and the `ISO`/`boxFaces` path);
if a "sketch box" annotation is wanted, it's a prism on an annotation layer. `'line'` vs
`'polyline'` (todo §6) and `'circle'` (dead) go at the same time: Line makes a 2-point polyline;
Ellipse+Shift is the circle.
**Decision (Dave via eos-07, 2026-09-23) for the remaining half (R4 parts 3–4, eos-18 after R3):**
`prism` stays the only cuboid but is CALLED "Box" in the UI and docs (code keeps `prism`);
`'line'` is retired in favour of a 2-point `polyline` with a load-time `migrateEnt` (arrows must
survive on 2-point polylines); `'circle'` is already gone (part 1). Two seams stay documented for
later: command-line `LINE` → 2-point polyline, and the DXF `LINE`/`LWPOLYLINE` mapping. Gate: old
`'line'` seeds render identically after migration (paint diff), and arrows / snaps (end, mid) /
grips / Shift-15° on 2-point polylines, plus the Line tool, Properties and EntRender no longer
mentioning `line`.
**Part 3 (`840ff65`) — gated PASS (review.md §0a `3829768`).** One leftover eos-f8 flagged for part
4: `PropertiesPanel.svelte`'s `STROKE_TYPES` still listed `'line'`.
**Part 4 (eos-18, 2026-09-23):** `PropertiesPanel`'s `MODEL_TYPE_LABEL` now reads `prism: 'Box'`
(display only — `modelTypeLabel()`'s opening-layer override to "Opening" is unchanged); the
`STROKE_TYPES` leftover fixed. No other user-visible `'Prism'`/`'prism'` text existed anywhere else
in the UI (toolbar/prompts/Layers only ever said "furniture"/"wall"/"conduit", never "prism") — so
this is the only label change. `'circle'` was already fully gone (the one hit, `+page.svelte`'s
Ellipse tool icon name `'circle'`, is a Lucide icon id, not the retired entity type — left as-is).
Both documented seams added as code comments: the CLI `LINE` seam in `ui/place.ts` (`buildEnt`,
next to where the Line tool itself builds a 2-point polyline) and the DXF `LINE`/`LWPOLYLINE` seam
in `ui/geometry.ts` (on the `Ent` type, next to `pts`). **Per Dave's process change (via eos-f8,
2026-09-23): eos-f8 is not live-gating further small commits — landing on main with tests/
svelte-check green and noting gate-relevant details in the commit message, for one batched review
once all of R4 (and whatever follows) is complete.** Full suite 340/340, svelte-check unchanged
(10/130) — no behaviour change, so no new tests.

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
singletons · B18 tab dedup by title · B19 review-1 carry-overs · B20 trimToClip z-span (engine) ·
B21 odd-edge boxFootprint (engine) · B22 phantom elevation snap points (snap) · B23 walls pickable only
at their base in an elevation (hit) · B24 elevation-native entities can't move vertically — FIXED 18ade46 · B25 Shift-press+move toggles nothing when released off the entity — FIXED 07a0195 · B26 first section/guide pushed into a model without that array is lost (`??=` returns the raw array, not the proxy) — FIXED c4b364c; B5 closed · B27 persisted sheet canvas view was dead weight — FIXED 57d2653 (keyed by drawing id, mount fit skipped, pruned on close) · B28 status-bar zoom/Fit ignore "Pan content" on a sheet frame (minor) — FIXED c101442 (activeViewportId routes by the active frame id, not the tab id; also fixed activeProj ignoring a sheet frame's own proj), follow-up regression (Fit reset a frame's pan/zoom on automatic refits / with Pan content off) — FIXED 136580b (`explicit` opt, only navFit passes it) · B29 (R3 2b) node-grip click overwritten by the following click's object pick — FIXED 713422f · B30 fitPane's orbit-reset keys by the tab id even with a sheet frame active, writing under (tab id, frame's proj) instead of the frame's own orbit key — harmless, not fixed.
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
