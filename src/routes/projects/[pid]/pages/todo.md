# Pages tool — TODO / roadmap

Working notes for the Kestrel-style **Pages** workspace mockup
(`src/routes/projects/[pid]/pages/`). Self-contained mock today (local runes
state, no Firestore). This file tracks what's left to reach a real tool.

Legend: `[ ]` todo · `[~]` partial · `[x]` done · **(P1)** near-term · **(P2)**
after UX settles · **(P3)** later / needs design. `◧ decide` = needs your pick.

Kestrel code is in M:\dev\KestrelCad2

---

## 0. Bugs / quick wins  (P1)
### Code review follow-ups (see `review.md`, 2026-09-20)
Fixed from the review: 

- [x] §2.1 fit off-centre (paper pinned at 0,0 — margins now equal),
- [x] §2.4 text-editor zoom double-scale (already fixed batch-4), 
- [x] §2.5 type error (cast),
- [x] §2.6 split-view keys (only the focused pane's viewport handles keys), 
- [x] §2.7 undo global across docs (now per-doc stacks)
- [x] §2.8 no Delete (Delete/Backspace + Edit menu, with undo),
- [x] §2.8 dropDoc leaked undo/proj/paper/activation, 
- [x] §2.8 dirty never set, 
- [x] §2.8 HistoryPanel prop mutation (→ onnote callback), 
- [x] §2.8 titleblock SIZE hardcoded, 
- [x] §2.8 ViewCube→layout one-way (TOP now restores Sheet), 
- [x] §2.3 partial (emit onframe(null) on unmount).
- [x] §2.2 print honours the selected paper size/orientation (`@page` from the focused tab's paper) and prints at TRUE size — the paper is `zoom`ed by (96/25.4)/PAPER_PX_PER_MM so content + titleblock scale together (CSS zoom, vector text); 
- [x] §4.4 shared wheel-normalise/zoom-clamp + touchcancel; 
- [x] adopt list — additive select, group move, duplicate (Ctrl-D), select-all, nudge.
- [x] §4.1 (partial) extracted pure geometry to `ui/geometry.ts` (dist/segDist/translate/textBox/boxElev/boxElevSet/boxFaces + box constants), shared with Viewport + PropertiesPanel;
- [x] §5 added `ui/geometry.test.ts` (8 Vitest tests, `pnpm test --project=server` green).
- [ ] §2.3 full per-doc frame state,
- [ ] §4.1 full `DocEditor` headless class (geometry.ts done), 
- [x] §4.2 **mm world units** (2026-09-20) — model space is now real **millimetres**. Turned out NOT
  invasive: the mapping already treats `CX,CY` as the model centre + scale pivot, so the equations are
  unchanged — just scaled the constants (PLAN_CX/CY, GROUND, DEFAULT_BOX_H, PT) to mm, wrapped the
  decorative backdrop in a `scale(MMPU=70)` group (→ mm, no renumbering), sized the demo box in mm,
  set grid snap to **100 mm**, and defaulted the scale to **1:100** (fits the ~28 m demo plan). Verified:
  plan renders at 1:100, drawn rects have mm coords (×100-snapped), selection + elevation all correct.
- [ ] §4.3 reuse Sheets `layers.ts`,
- [ ] §2.8 key tabs by node id (not title), frame drag threshold+undo, z0 clamp mismatch, uncontrolled Properties inputs, coalescing merges unrelated edits, outline-only rect hit,
- [ ] §5 snap/hit perf (cache the CTM/bbox), 
- [ ] §6 nits (dead `circle` type (will be used later), unify line/polyline, uid collision, unused CSS, a11y). 
- [x] **Rotated-shape resize handles are wonky** (fixed 2026-09-22) — corner/endpoint grips on a ROTATED
  rect / ellipse / box / line now resize along the object's LOCAL (rotated) axes about the opposite
  corner, which stays world-fixed. A grip carries its opposite corner as `anchor` + a `resize(dragged,
  anchor)` builder; for a rotated shape `gripsFor` computes the new centre = midpoint(anchorWorld,
  pointer), un-rotates the pointer about it to get the dragged corner, mirrors to the opposite → the
  anchor provably stays put (`rotatePt(F, cn, θ) == anchorWorld`). Shift-square is done in the LOCAL frame
  (square the offset from the anchor before un-rotating), so `constrainGrip` now bypasses its old
  WORLD-axis square for any rotated shape. **Verified in-browser (quantitative):** a 40°-rotated rect,
  drag a corner → opposite corner moved **0 px**, corner angle stayed **90°**, opposite sides equal,
  rotation preserved at 40°; clean console. [ ] Still wanted (separate): **per-axis rotation (X/Y/Z°)**
  for real 3D shapes rather than the single Z angle.

Suggested order in review.md §7.

- [x] **Pan-content zoom re-scales the view** (Dave, 2026-09-20) — with a viewport active + "Pan
  content" on, wheel-zoom now folds into the DRAWING SCALE (like a CAD viewport) instead of a free
  zoom: the scale label/dropdown update live (e.g. 1:100 → 1:84 → 1:70 zooming in) and the cursor's
  model point stays fixed. `on.scale` callback + the dropdown tolerates computed 1:N values.

### Reported 2026-09-21 (Dave) — batch 6
Done:
- [x] **Guides get undo/redo + moved INTO THE MODEL** (refactored 2026-09-21) — guides now live in
  `Model.guides` (not a separate global store), so they are model-scoped (shown across every view of the
  model) and their **undo/redo ride the model history snapshot (`snapModels`) for free** — like
  walls/prisms. `guides.svelte.ts` is now a thin API over `models[0].guides` (dropped the global `$state`
  store, `snapGuides`/`setGuides`, `guideSel`, `on.guideedit`, and the `HStep.guides` field). Guide
  **selection reuses `modelSel`**; add/move/delete record via `on.modeledit(label)` (model history);
  **delete goes through `deleteModelSel`** (which now also filters `mdl.guides`). Verified in-browser:
  place → renders; Ctrl+Z/Ctrl+Shift+Z remove/restore (via snapModels); drag repositions + is selected
  (`sel` class from modelSel); Delete removes + undo restores. Field names kept Firestore-stable
  (`{id,plane,orient,pos}`) — see the schema memory. *This is step 1 of the data-into-model migration (§5/§6).*
- [x] **Entity schema for data-into-model — `plane` + `space` scope** (step 2a, 2026-09-21) — decided with
  Dave: an entity carries BOTH a drawing **`plane`** (`'plan'|'front'|'rear'|'left'|'right'` — which
  projection plane its coords live in; drives projection/view-gating) AND a **`space`** scope
  (`'model'|'view:<frameId>'` — model-scoped shows in every view, view-scoped shows only in that frame),
  orthogonal like DXF layer+space. Renamed the old `Ent.space` (which meant the plane) → `Ent.plane`
  (`drawSpace`→`drawPlane`, `isPlanSpace`→`onPlanPlane`, `inThisView` now also checks `inScope`); added
  the `space` scope (default 'model'); `Viewport` gains a `frameId` prop (from the sheet frame) so
  view-scoped filtering works. Guides' plane field also renamed `space`→`plane` for consistency. Field
  names locked for Firestore. Verified: entities + guides render, clean console.
- [x] **Entities moved INTO THE MODEL** (step 2b, 2026-09-21) — the big one: `docEnts[tabId]` (per-tab) →
  **`Model.ents`** (shared). Every view of the floor now shares its annotations, and entity undo/redo
  **rides `snapModels`** — so `HStep.snap`/`snapDoc` are gone (entities are in `HStep.model`). All the
  CRUD (`addEnt`/`updateEnt`/`deleteEnts`/`group`/`ungroup`/`reorder`/`copy`/`paste`) now go through
  `mdlEnts()`/`setMdlEnts()`; `entsOf(tab)` returns the model's ents (tab arg is just the history key);
  revisions snapshot `Model.ents` (Snap = `Ent[]`); `dropDoc` no longer clears ents (they're the
  model's). `Model.ents: Ent[]` imports `Ent` from geometry (no cycle). **Verified in-browser:** drew a
  rect on the 3303 Outlets sheet → it ALSO appears on the 3303 Floorplan tab (same model — cross-view
  sharing, the whole point); Ctrl+Z removes it (model history), Ctrl+Shift+Z restores; border-select +
  grips work. Clean console. *Known limitation (same as the model objects/guides): history is per-tab
  while the model is shared, so undo on a different tab won't reach an edit made on another — a global
  model history is the real fix, deferred with the model registry (§5).* **Next in §5/§6:** the multi-
  model registry (rack/frame/riser models + a Model/Source picker per viewport), then view-scoped
  (`space:'view:<frameId>'`) annotations, then the HIGH-PRIORITY image-import test.
- [x] **Polyline/line pick tolerance widened to ~7px total** (~3.5px either side) — `hit()` was
  passing the raw `hitTol(7)` (viewBox-scaled units) to edge-distance tests whose coords live in
  UNSCALED drawing space, so at 1:25 the effective pick band shrank to ~0.3px. Now `hitTol(3.5)/dscale`
  → a true ~3.5px half-width at any scale. Verified by bracketing: a click ~2px off the line selects,
  ~5px off does not. (See the hit-tolerance/dscale note — this was exactly that trap in `hit()`.)
- [x] **Unfilled closed shapes select by their OUTLINE only** (CAD-standard) — rect/ellipse/circle/
  box-footprint with `fill:none` no longer treat the empty interior as a hitbox; a filled one still
  picks anywhere inside (new `isFilled`/`inBox` in `hitEnt`). Verified: interior click on an unfilled
  rect does nothing; a border click selects it. *Note:* the 3D **model prisms** (furniture boxes) are a
  separate system (`hitModel`) and stay interior-selectable as solids — the border-only rule is for
  drawn Pages entities, which is what "rect" referred to.
- [x] **Right-click also REVERTS a drawing tool to Select** (Dave prefers right-click over Esc) — with a
  drawing tool selected and NO active draft, a right-CLICK switches back to Select; a right-DRAG still
  pans (guarded: only reverts when the pointer barely moved since right-down). Kept the tool STICKY after
  each draw (CAD convention — repeat placement) rather than auto-reverting. *Gotcha found + fixed:* Svelte
  delegates `pointerdown` to the root, but panzoom's own listener `stopPropagation()`s right/middle presses,
  so the delegated `onDown` never saw them → `rDownPt` was never set → the guard always reverted (even on a
  pan). Fix: capture `rDownPt` in the CAPTURE phase (`onpointerdowncapture`). Verified via synthetic events:
  right-drag keeps the tool, right-click reverts.
- [x] **Right-click ends a multi-point draw** — polyline / Wall / Trunk / Pipe now finish on
  right-click (same as Enter / dbl-click); the browser context menu is only suppressed when a draft
  is actually consumed, otherwise it passes through. (`onContext` on the `.vp` div.)
- [x] **Drawing regression fixed** — after the primary-viewport removal, a pointerdown inside an
  ACTIVE frame bubbled to the sheet and started a paper-space marquee, hijacking the draw (cursor
  flipped to arrow, no shape/guide created). `onSheetDown` now ignores presses landing inside
  `.vp.active` (except the Viewport tool, which needs the sheet press to place a new frame).
- [x] **Model name at top-centre of the canvas** on model-layout tabs (e.g. "3303 Floorplan",
  "Rack A Elevation") — screen-space, non-interactive label; sheet layout keeps its titleblock.
- **Decision (frame schema ≈ model-shape schema):** Dave — viewport frames in a page model, though
  they carry special draw/content-management behaviour, "should be practically identical to shapes
  in other models in terms of schema." Fold into the **page-MODEL object** work (§2): make a frame
  just another model entity (id/layer/groupId + geometry) with a `viewport` role, rather than the
  bespoke `SheetFrame` type. No objection seen.
- **Decision (seeding):** OK to seed a default full-bleed viewport on new page creation, and equally
  OK to create pages with NO viewport and let the user draw one. Keep current seed-on-first-measure
  for now; revisit when the page-model object lands.

### Reported 2026-09-21 (Dave) — batch 5
Done:
- [x] **Shift-click no longer moves the object** — a Shift body-press is selection-only (never
  starts a move drag); it toggles on release.
- [x] **Ctrl/⌘-drag duplicates** the selection (copies dropped on first move, then dragged); a
  Ctrl-click still toggles. ([ ] refine: toggle the duplicate on/off if Ctrl is pressed/released
  DURING the drag — currently decided at press time.)
- [x] **ViewCube independent per split pane** (keyed by pane+tab) — plan in one, side in the other.
- [x] **Status-bar coords are world units (mm)** from the active viewport (not canvas px).
- [x] **Tool prompt + inline-edit help moved to the PANE bottom-centre** (screen space) so they stay
  readable when zoomed in (were in the viewport badge/hint that scaled with zoom).
- [x] **Removed the redundant Revision dropdown from History** (the revisions list covers it).
- [x] **One history entry per drag/nudge gesture** (Viewport signals begin/end; +page snapshots
  only the first mutation of an open gesture; nudge bursts coalesce).
- [x] **Text property is a multiline textarea** in the Properties panel.
- [x] **Active-viewport bar** gains a **scale dropdown** (1:20..1:500) + **Full-size** button (like
  Sheets); the **status-bar Full-size toggle is commented out** (paper size/orientation stay).
- [x] **Flat objects (rect/ellipse/circle) project as ground lines in elevation** (render+hit+bbox).
- [x] **Page title uses a standard hyphen** so Save-as-PDF filenames are valid.

Batch-5c done (2026-09-21):
- [x] **WCS triad rotates WITH the 3D (iso) view** (2026-09-22, Dave asked) — the bottom-left axis
  triad was a STATIC per-projection lookup (`TRIAD.iso` fixed dimetric); now for the iso view it
  projects each world axis (x/y/z unit vectors) through the SAME orbit camera the model uses
  (`isoR(axis, yaw, pitch)`), normalised to a fixed pixel length, so it reorients live as you drag-orbit
  (an axis edge-on to the viewer → a dot). `ViewGizmos` gained `yaw`/`pitch` props (wired from the active
  viewport's `orbitOf(...)` in `+page.svelte`); ortho views keep the fixed `TRIAD` table. Verified
  in-browser: orbiting the Rack A 3D model swung the triad's x/y axes to match (z stays up), read straight
  off the `.wcs` SVG line coords + a visual. (Svelte flushes the triad async, so a synchronous before/after
  DOM read in one JS call looks unchanged — read across calls.)
- [x] **WCS triad gizmo doubled** in size (52→104px).
- [x] **Removed the faint vertical mock grid** in front/right elevations (kept just the ground line);
  those lines were decorative mock, not real gridlines.
- [x] **Bundled the ~13 viewport callbacks into one `on` object** (Viewport/PaperPage) — Dave flagged
  the prop count creeping up again. This is a step toward the **headless editor class** Dave suggested
  (`Part`-style `.svelte.ts` with `$state`); the full **DocEditor** (§4.1) is still the end goal and is
  now Dave-endorsed. env + on together drop the Viewport prop list from ~30 to ~12.
- [ ] **Print orientation**: add a **one-time in-app hint** telling the user how to get correct
  orientation to PDF (Ctrl-P → More settings → Print using system dialog → orientation). See §10.

Batch-7 done (2026-09-20) — object-style follow-ups:
- [x] **Object rotation** (`rot`, degrees) — Properties gains a ROTATION · degrees row (Position / Size /
  Rotation, per Dave's preferred layout from the old Transform mockup). Render wraps the entity in a
  `rotate(deg, cx, cy)` about its view-bbox centre; hit-test un-rotates the point; grips rotate with it
  (drag un-rotates the pointer). Verified: 30° rotates the rect + grips, still selectable.
- [x] **Text vertical align** (top/middle/bottom) added alongside L/C/R; middle uses a central baseline
  so single lines respond, block-offset handles multi-line. `valign` on the entity.
- [x] **Delete/Backspace in a Properties field no longer deletes the selection** — the viewport's
  onKey bails when the keystroke targets an input/textarea/select.
- [x] **Weight now actually affects lines/rect borders** — an explicit weight always renders (was
  zeroed to 0.5 when the LWT display toggle was off) AND is visible while selected.
- [x] **Colour/weight visible while an object is selected** — selection is shown by grips, not by
  recolouring/thickening the stroke (so style edits preview live).
- [x] **Colour grid picker** — shared **`$lib/ui/ColorPicker.svelte`** (swatch grid + custom + By
  layer/None) replacing the native colour input; used for object colour, fill, AND layer colours.
  Palette in `pages/palette.ts` includes Kestrel-style subdued architectural tones (A-WALL … A-CLNG),
  also added as an "Architectural" layer group.
- [x] **Object Layer is a dropdown** (from `palette.LAYERS`); **Position/Size are 3D one-row vectors**
  (X/Y/Z · W/D/H, model3d-panel style); **Enter / Shift-Enter moves to the next/prev prop field**;
  the text-property **textarea auto-resizes**.

Batch-6 done (2026-09-20):
- [x] **Copy/paste + group/ungroup** (Ctrl-C/X/V, Ctrl-G / Ctrl-Shift-G) — see §2.
- [x] **Layer lock beside the eye** on every sub-layer row — see §3.
- [x] **Per-pane layout** — switching plan/elevation in a split no longer refits/offsets the
  OTHER pane (layout was global; now per-pane, only the changed pane refits).
- [x] **Split mirrors the current pane** (same active tab + layout) instead of forcing a
  different tab.
- [x] **Fixed dblclick-to-activate regression** — PaperPage's dblclick handlers referenced bare
  `onactivate`/`ondeactivate` dropped in the callback-bundling refactor; added the `$derived`
  aliases. (For an event handler, inline `on.activate?.()` would work identically — the alias is
  just to match the file's existing pattern.)

Batch-5b done:
- [x] **Esc from a drawing tool returns to Select** first (then clears selection, then exits view).
- [x] **Page title = active drawing name** (clean Save-as-PDF filename), reactive to tab change.
- [x] **Status-bar zoom updates on wheel** (tracks the canvas zoom when a viewport is active but
  Pan-content is off; was stuck showing the view zoom / 100%).
- [x] **ViewCube hover** is a distinct amber (was ~the selected teal).
- [x] Dropped the redundant **100%** from the pane status.
- [x] Scale dropdown has the full **1:1 … 1:500** list.
- [x] **Elevation flattens ALL flat objects** (lines/polylines/dims too, not just rects) to a ground
  line — "plan lines no longer appear as plan lines in the front view" (verified with a diagonal line).

New todos (design / bigger):
- [x] **View SCALE now renders** (Dave, 2026-09-21) — a `dscale = 1/denom` scales the viewport
  content about the plan centre, threaded through the coordinate mapping (toLocalXY / localToClient /
  grip size / text-edit) so hit-testing still works. **1:1 is the default** (= as-drawn), so the
  mock is unaffected until you pick a scale; e.g. at 1:10 a 1000-unit object draws 100 wide (verified
  244px → 24px, still selectable). [ ] **Follow-up (§4.2):** put the demo content in real **mm** so a
  realistic default like 1:100 looks right (right now 1:100 shrinks the abstract-unit demo a lot).
- [x] **True FRONT / REAR / LEFT / RIGHT views** (2026-09-20) — real orthographic projection via an
  `ELEV_BASIS` table in `geometry.ts` (Kestrel `camera.setView` / Sheets model3d `BASIS` convention,
  cross-checked against `M:\dev\KestrelCad2`): **front +x · rear −x · right +y · left −y**, vertical
  always +z. `elevU`/`elevUInv` project a footprint coord to the drawing horizontal (mirrored per dir,
  re-centred on the plan centre); threaded through render, hit-test, grips, marquee bbox, move, and
  coords. ViewGizmos gains a 6-view triad (computed to match drawUCS) + Rear/Left/3D buttons; a box
  now projects its x-extent in front/rear and its y-extent in left/right (verified 137px vs 85px in
  the browser). Tests in `geometry.test.ts` (14 total). **Forward-compat:** the BASIS is the discrete
  form of a yaw/pitch camera, so a future free-3D orbit/walk mode drops in without changing the named
  views (see the geometry.ts note). [x] **Iso SOLID / hidden-line render** (2026-09-20) — the iso view
  now draws depth-sorted opaque white FACES (`faces3d` + `isoDepthR` painter's algorithm) instead of
  wireframe, so nearer faces occlude farther ones — walls/furniture/trunks read as solid objects.
  Openings are skipped in iso (a true 3D boolean hole is future work). Verified in-browser (the room
  renders solid with correct occlusion). **[x] per-face shading (2026-09-22)** — iso faces now fill with a
  two-sided Lambert shade (`faceShade`: world normal · a fixed up-front light, `abs` so it's winding-
  independent, ambient floor) → tops read lightest, sides darker, via `style:fill` (beats the old CSS
  `fill:#fff`). Verified: the Rack A 3D model shows a lit top + shaded sides (solid read); clean console.
  **[x] tinted by layer colour (2026-09-22)** — `faceShade` now mixes a light tint (k=0.2) of the object's
  layer colour (`hexRgb`) into the shade, so walls read tan / furniture green / trunks teal in iso while
  keeping the top-light/side-dark modulation. Verified in-browser on the floor iso.
  [ ] Still: entity flats (lines/rects) show no depth ordering vs the model.
- [x] **Tools floating window: merge related tools into pop-out groups** (2026-09-22) — the left tool
  strip now groups tools that share a mode into ONE button with a hover FLY-OUT (15 buttons → 11):
  **Shapes** (Rectangle / Ellipse / Box) and **Conduits** (Wall / Trunk / Pipe — the graph tools). A
  group button shows + re-activates the group's **last-used** tool (a corner ▟ caret marks it as a
  group), and hovering pops out the variants to the right (a transparent `::before` bridge spans the gap
  so the hover doesn't drop); clicking a variant selects it and becomes the new last-used. Driven by a
  `STRIP` array (single | group) + `groupTool` state + `iconOf(name)`, replacing the flat `{#each TOOLS}`.
  Verified in-browser: both groups render with carets, fly-outs reveal on hover, clicking Box highlighted
  the Shapes button + swapped its icon, clean console. (Line stays standalone — there's no separate
  Polyline tool; the Line tool draws polylines in ACAD mode.) Ties into the editing refactor (§ graph
  tools already share code paths). [x] **Touch: tap-to-open the fly-out** (2026-09-22) — a `.grp` button now
  sets `openGroup` on click so the fly-out stays open without hover (`.flyout.open`), a window
  pointerdown-capture handler closes it on any press outside a `.grp`, and picking a member selects it +
  closes. Verified in-browser (click opens + holds after the cursor leaves; member-click closes). Mouse
  hover still works too.
- [ ] **Orbit tool icon in the zoom-tools floating window** (Dave, 2026-09-20) — add an **orbit**
  button to the bottom-right nav floating window (`navtools` in `+page.svelte`, beside Zoom in/out /
  Fit / Pan). Drag-orbits the 3D (iso) view. Blocked on the **real 3D orbit camera** (the ELEV_BASIS
  yaw/pitch forward-compat above): today iso is a fixed oblique projection, so orbit has nothing to
  drive yet. When the camera lands the button feeds it yaw/pitch (and the ViewCube corners snap to
  named views). Parked here until then rather than shipping a dead icon.
### 3D model editing follow-ups (Dave, 2026-09-20)
- [x] **Select shapes in the 3D (iso) view** (Dave, 2026-09-21) — click a shape in the iso view → it
  selects (amber) and Properties shows its props. `hitModelIso` reproduces Model3d's iso projection
  (isoR + shared `isoBounds` centring), point-in-polygon per 3D face, frontmost by TRUE depth AT the
  click point (affine-interpolated so a big far face can't beat a nearer small one). Model selection now
  auto-switches the panel to Props. Geometry editing (grips) in iso stays deferred — selection only.
- [x] **Section arrow ↔ direction dropdown mismatch** (Dave, 2026-09-21) — the arrow was 90° off; it now
  points along the elevation's sight axis from ELEV_BASIS (front=up, rear=down, right=right, left=left),
  matching the dropdown and the elevation shown.
- [ ] **REFACTOR: unify editing across 2D/3D + plan/elevation, and across line/wall/trunk/pipe** (Dave,
  2026-09-21) — big, deliberate (NOT a rushed change). Today there are ~5 near-duplicate pointer-drag
  state machines in `Viewport.svelte` (`drag` for entities, `mDrag` model-move, `mGrip` model-resize,
  `secDrag`/`secResize` sections, `orbitDrag`) each with their own add/remove-listener boilerplate, and
  two grip systems (`gripsFor` for 2D entities vs `modelGrips` for 3D objects). Plan: (a) one generic
  `beginPointerDrag({onMove,onUp})` helper to collapse the boilerplate; (b) a `Handle`/grip abstraction
  shared by entities and model objects (a grip = {pos, apply}); (c) a `line` entity and a wall/trunk/
  pipe conduit already share node/segment math via `graphNodeApply` — extend so the **Line tool builds a
  graph too** (drop the separate `polyline` entity path) so add/insert/delete-node/edge is ONE code path
  for line/wall/trunk/pipe. This is the `DocEditor`-class direction from review.md §4.1 — do it as a
  focused session, with the geometry already extracted to `ui/geometry.ts` as the seam. **Include:** the
  **Viewport-frame creation** (drag a rect on the paper) should reuse the SAME rect-drawing gesture as
  the Rectangle tool (ACAD two-click / EOS press-drag) instead of PaperPage's bespoke marquee (Dave,
  2026-09-21) — a paper-space rect is the same primitive.
- [x] **Draw trunks/pipes/walls in ELEVATIONS** (Dave, 2026-09-21) — needed for vertical wall conduits.
  Wall/Trunk/Pipe tools now work in elevation views (not just plan): each drawn point → on-axis coord
  (`projUInv`) + z (`GROUND − y`); the off-axis DEPTH is unknown in an elevation so it defaults to the
  plan centre (nudge in plan afterwards). Furniture/Section/Opening stay plan-only. [x] **Follow-up —
  depth SNAP onto a wall/conduit (2026-09-22):** `elevDepthSnap(p)` finds the model wall/conduit segment
  the drawn point is nearest **in MODEL space** (on-axis coord + z, both exact via `projUInv`/`GROUND` — so
  no screen-projection/centring mismatch) and takes its off-axis coord as the DEPTH. Priority: a selected
  plan guide (explicit) > wall-snap > plan centre. A live amber marker highlights the segment being snapped
  onto (`depthSnapMark`, graph tools in elevation). Verified in-browser: a pipe point placed on the trunk
  in a FRONT elevation landed at the trunk's y-depth in plan (coincident with the trunk), while a point in
  empty space stayed at centre; clean console. (First cut matched in screen space and missed — model-space
  match fixed it.)
- [x] **Multi-direction section — arrows on all 4 sides drop onto the current sheet** (2026-09-22, revised
  per Dave) — a section is now a **standalone plan marker** (`docClip`/`docSecDir`/`docSecName` keyed by a
  `sec` id — NOT an elevation tab; `onSection` no longer creates a tab). The marker shows its primary
  sight arrow always; when SELECTED all 4 arrows show, each clickable → **`sectiondropdir` drops that
  direction's elevation as a viewport FRAME on the current sheet** (focused pane's sheet, else the first
  sheet), then focuses the sheet + selects the frame. No new tabs per direction (Dave preferred "same
  sheet"). Toolbar = drop-primary + primary-direction dropdown + delete. Arrows interactive only in Select
  mode; `onDown`/`onClick` bail on a `.section-arrow.pick` target (Svelte delegates the SVG pointerdown so
  its `stopPropagation` alone didn't stop the section-draw/deselect — same gotcha as rDownPt). Verified
  in-browser: draw a section on the plan → NO tab created; clicking the front arrow switched to 3303
  Outlets and made a "Front 1:25" viewport frame (Source 33F / View Front); the marker also shows on the
  sheet's plan frame to drop more directions; clean console.
- [x] **Insert nodes in ELEVATION views** (2026-09-20) — node-insert (dbl-click a wall/conduit segment)
  now works in elevations too, not just plan: the new node takes its on-axis coord from `projUInv(p[0])`
  and z from `GROUND − p[1]`, keeping the off-axis coord of its neighbour. `onDblclick` gate widened
  `isPlan`→`modelEditable`.
- [x] **Branch a node with 2+ segments** (2026-09-20) — **Alt-drag a wall/conduit node** sprouts a NEW
  segment + node (a junction/tee) and drags the new node out; a plain drag still moves the node. Built
  as `branchNode()` + the Alt path in `onDown`'s grip handler; a no-drag Alt-press cleans up its stray
  zero-length segment. `graph.ts` handles the junction in its sweep. Verified in-browser (2-node trunk →
  Alt-drag → 3 nodes, new branch follows the cursor; the tee renders correctly). **Gotcha:** the pushed
  node must be re-read from the `$state` store (deep-proxied) — mutating the raw literal via the drag
  closure is a silent no-op. [[svelte-state-proxy]]
- [x] **Trunk/pipe node SNAP + DISCONNECT** (2026-09-20) — snap done (2026-09-20); DISCONNECT now works:
  `snapNode` takes the drag `origin` and skips any candidate within a break radius of it, so a node that
  starts coincident with a partner can be pulled cleanly off it instead of re-snapping forever. (This is
  also what lets a fresh Alt-branch node separate from the node it sprang from.)
- [x] **Select + DELETE graph nodes** (2026-09-22) — a single wall/conduit NODE can now be selected (click
  its grip without dragging → teal filled highlight; `nodeSel`, cleared on any fresh press, valid only
  while its object is selected) and DELETED, with incident segments handled by DEGREE per spec:
  **1 → delete that segment**; **2 → join into one** (connect the two far ends); **3+ → keep the first two
  joined, delete the rest**. `deleteGraphNode` rebuilds the segment list, prunes any node left with no
  segments (the deleted one + orphaned far ends), and removes the whole object if nothing remains (clears
  selection). One undo step (beginedit/modeledit/endedit, rides snapModels). Delete key checks `nodeSel`
  before whole-object `deleteModelSel`. **Verified in-browser** on a 4-node/3-seg wall: delete mid node →
  SEGMENTS 3→2 merged + still connected; delete end node → 2→1; delete last → object removed + selection
  cleared; clean console. Branch-from-node is Ctrl-drag (done earlier).
- [x] **Audit + minimise Alt-key functions** (audited 2026-09-22; Dave rarely uses Alt) — grepped
  `altKey`/`e.alt` across all of `pages/`. **Result: exactly ONE Alt binding remains** — `ui/panzoom.ts`
  `Alt+wheel = zoom` (in the `zoom = ... || e.ctrlKey || e.altKey || e.metaKey || right-btn` modifier
  chain). It is **fully redundant**: Ctrl+wheel, Meta+wheel AND right-button+wheel already zoom, so no
  capability is Alt-only. (The old Alt-drag node-BRANCH is already Ctrl-drag — see the graph-node grip at
  `Viewport.svelte` ~1289.) So there is nothing that *needs* relocating. **Resolved 2026-09-22 (Dave):
  dropped `e.altKey`** from the panzoom wheel-zoom OR-chain → **Pages is now fully Alt-free**. Ctrl / Meta
  / right-button+wheel still force zoom, so no capability was lost.
- [ ] **Touch: Guide tool button pop-out for H/V** (Dave, 2026-09-21) — on touch there's no Shift to pick
  vertical, so the Guide toolbar button should pop out an **H / V** selector. Fits the tools-pop-out-groups
  todo (a tool button that fans out its variants).
- [ ] **Stable per-DRAWING id for tab dedup + persistence** (Dave, 2026-09-21) — tab ids are an ephemeral
  session counter (`'t'+seq`; the 4 seeded tabs are hardcoded t1–t4, dynamic ones get t5+ by OPEN ORDER),
  and `openDrawing` dedupes by TITLE. So the per-tab localStorage canvas view (and any future per-tab
  persisted setting) only recovers reliably for the seeded tabs — a drawing opened as t5 this session may
  be t7 next session, and same-title drawings collide (review §2.8). Fix: carry a **stable drawingId**
  (the navigator node id / real document id) on each Tab, dedupe + key persistence by it, not the
  ephemeral tab id. (Split-pane keys use `paneId` — p1 stable, p2+ depends on split history; the canvas
  view is really per-drawing, so persist by drawingId and keep paneId only for live split independence.)
- [x] **ViewCube: don't fullscreen a sheet; re-orient in place** (2026-09-20) — `ViewGizmos onset` no
  longer flips a sheet to fullscreen model layout; it just sets `docProj`, so the cube re-orients the
  view's content in place, INCLUDING a paper sheet's viewport (PaperPage now threads `kind/clip/yaw/
  pitch` into its Viewport). Full-size button still does fullscreen. Verified in-browser (clicking 3D on
  the Trunk Routes sheet re-oriented the paper viewport to iso; paper + titleblock stayed).
- [x] **Fullscreen (model layout) shows an ugly white paper + titleblock** (2026-09-20) — resolved by the
  ViewCube change above: a sheet only reaches `layout='model'` via the explicit Full-size button, which
  renders the clean `.vp-fill` Viewport (no paper, no titleblock) — the cube no longer forces it.
- [ ] **Maintain focus across view switches (full)** — the elevation-centring fix (below) keeps content
  on-screen, but a PANNED focal point doesn't fully carry between projections. Track a 3D focal point and
  re-project it into each view's pan on switch (incl. shifting left↔right so the same point stays centred).
- [ ] **Structural slabs / floors / ceilings in ELEVATIONS** (Dave, 2026-09-20) — draw the building
  fabric in elevation (and section) views: **raised floors** (access floor void above the structural
  slab), the **floor slab** and **ceiling slab**, and **ceiling tiles** (suspended grid below the
  ceiling slab). `mdl.levels` already carries `ceilingTile` / `ceilingSlab` heights (used for trunk/pipe
  default z + section z-extent); extend it with floor-slab / raised-floor / structural levels and render
  the horizontal bands in elevations + sections. Ties into the room/level model.
- [ ] **Kestrel command line** — implement a command line (enter offsets while drawing, and other
  useful Kestrel cmd-line commands). (Was P3 "optional"; Dave now wants it.)
- [ ] **Models: one model per floor**, with **separate stores** for detail views (rack elevations,
  frames, patching). Ties into the model-registry design (§5).
- [x] **Object props parity + defaults** (2026-09-20) — entities gained `color / fill / weight /
  fontPt / align` (mirrors the Sheets annotation model); the Properties panel STYLE section edits them
  across the whole selection: Colour (+ ByLayer reset), Weight, Fill (checkbox + colour) for shapes;
  Font (pt) + L/C/R Align for text. Renderer honours all of them (stroke/fill/lineweight, `fontPt·PT`
  text with `text-anchor` from align); the inline text editor + `textBox` hit-box size with the font.
  Unset falls back to `STYLE_DEFAULTS` = **Sheets' defaults** (8pt, left, weight 1.2, fill none), so a
  new object matches Sheets. Verified in-browser (stroke/fill/weight round-trip; 16pt→22u, centre→
  text-anchor middle). [ ] Later: real ByLayer colour resolution + mm lineweights (§3/§4.2).
- [x] **Callout toggle** (2026-09-22) — a text box can become a **callout** (boxed text + a leader line to
  a target). `Ent` gains `callout?: boolean` + `leader?: Pt` (Firestore-stable). Properties (TEXT section)
  has a **Callout checkbox** that seeds the leader tip below-left on enable and keeps it across off/on. The
  text render draws a rounded box around `textBox(e)` (padded) + a leader from the box side nearest the tip
  to `leader`, with a dot at the tip; a leader-tip GRIP (added to the text grips when callout) drags the
  target. Verified in-browser: toggling on drew the box + leader + tip; dragging the tip grip moved the
  leader to the target; clean console. (Leader is a single segment for now; a shoulder/arrowhead could come
  later.)
- [x] **Change-log UX** (2026-09-20) — refactored undo from two stacks to a **per-doc linear timeline
  with a pointer** (`docHist`; steps snapshot state AFTER each edit, gesture folds into one step). The
  History change log lists every step newest-first, highlights the **current** one, **fades future
  (undone)** steps (strikethrough), and **click any row to jump** (undo or redo to that exact point).
  Verified: 2 rects → jump back to 1 (top step faded) → click it to redo to 2.
- [x] **Group / ungroup** selected shapes (Ctrl-G / Ctrl-Shift-G) — `groupId` on entities;
  `expandGroup()` so a group selects, marquees, and moves as one. Verified in-browser.
- [x] **Copy / paste / cut** (Ctrl-C/X/V) — clipboard of entities; paste drops offset copies
  (group ids remapped so a pasted group stays its own group). Verified in-browser.
- [ ] **System-clipboard copy/paste — items, views & whole pages** (Dave, 2026-09-20) — today the
  clipboard is an in-memory JS array (one tab, this session only). Back it with the real OS clipboard
  so you can paste into **another page, another browser tab, or another window** (and survive a
  reload). Approach: on copy write a JSON payload (with a mime tag, e.g. `web application/eos-pages+json`
  via the async Clipboard API `ClipboardItem`) AND a plain-text fallback; on paste, read the clipboard,
  detect our payload, remap ids/groups, and place. Scope grows by unit: **entities** (selection) →
  **views** (a viewport + its source/scale/crop) → **whole pages** (sheet + viewports + annotations).
  Watch-outs: clipboard permission prompts, only readable on a user gesture, size limits for big
  selections, and versioning the payload. Also wire the browser Edit-menu copy/paste, not just Ctrl-C/V.
- [ ] **Print orientation bug** — printing **landscape** to **PrimoPDF** yields a **portrait PDF
  rotated 90° CCW** even though the print preview is landscape. Dave's workaround (2026-09-21): Ctrl-P
  → **More settings** → **Print using system dialog** → set the orientation there. Fix ideas: try a
  named `@page size` (e.g. `A3 landscape`) instead of explicit mm, or detect and show a **one-time
  in-app hint** telling the user to use the system dialog for correct orientation. (Related to the
  Chrome/@page vs virtual-printer interaction; the in-app print CSS is already correct in preview.)

### Reported 2026-09-20 (Dave) — batch 4
- [x] **Inline editor floated off the text + ballooned when zoomed in** — it was positioned in
  SCREEN px inside the CSS-zoomed canvas, so the zoom double-applied. Now positioned + sized in
  `.vp`-LOCAL px, so the canvas transform scales it exactly like the SVG text (verified: left
  aligned to 0px, no ballooning).
- [x] **Text annotations use a monospaced font** (Consolas/mono) like the Sheets tool — render + editor.
- [x] **Inline-edit usage hint** — a pinned "Enter = new line · Ctrl/⌘+Enter = commit · Esc = cancel"
  banner shows while editing.
- [x] **Paper size/orientation is per-tab** (`docPaper` keyed by tab id) and **no longer jumps the
  view** — the paper rect just resizes in place; only split/unsplit/layout refit. Verified the
  canvas transform is unchanged across orientation + size changes.
- [x] **Revisions store + show a date** (dd Mon yyyy) in the History list, and the **titleblock**
  now shows REV + DATE + the real paper SIZE (e.g. "A3 L").
- Re: **paper only on the sheet tab** — that's by design: only *sheet*-kind tabs render the paper;
  plan/elevation/model tabs are model views (no paper). Use **Full-size** to drop the paper on a
  sheet. (The "resizes with browser" was the tab being in Full-size — confirmed.)

### Reported 2026-09-20 (Dave) — batch 3
- [x] **Where do package/version/revision belong?** DECIDED: **Package + Version** are drawing-SET
  context (apply to everything) → stay in the titlebar. The per-drawing **Revision** letter is a
  property of the drawing → moved to the **History panel** header (revisions' natural home).
- [x] **Couldn't type newlines in the text editor** — the `.vp`'s own Enter handler was
  `preventDefault`-ing Enter before the textarea saw it; the editor now `stopPropagation`s keydown.
  Enter = newline, Ctrl/⌘-Enter or blur commits.
- [x] **Editor text unreadable / only last line shown / bad overlay** — the editor is now an opaque
  dark-on-white box that **auto-sizes to its content** (width + height from the value), positioned
  on the text baseline; SVG text uses the same Inter font for alignment.
- [x] **Could only double-click the first ~4 chars to edit text** — the text hit-box is now the
  real text extent (per line width × line count), so a click anywhere on it opens the editor.
- [x] **Dragging a box vertically in plan moved it in elevation** — see batch-2 `z0`. (Confirmed
  the elevation face stays put through a plan vertical drag.)
- [x] **Revision restore reverted ALL docs** — now restores only the **current tab's** doc.
- [x] **ViewCube state now per tab** (`docProj` keyed by tab id) — remembered per view and shared
  across split panes; the WCS triad also follows the per-tab projection.
- [x] **Split-mode paper looked portrait / mis-fit** — `fitPane(idx)` fits each pane's sheet with
  correct centring from the real paper dims; refit on split/unsplit and on paper change.
- [x] **Full-size button did nothing** — works (Sheet ↔ full viewport); a status-bar class-name
  collision (`.paper`) had only fooled testing — renamed to `.paper-sel`.
- [x] **Paper size + orientation** — status bar now has an A4/A3/A2 selector and a portrait/
  landscape toggle; the sheet resizes (px from mm) and all panes refit.

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
- [x] **Marquee vs disabled-cursor bug** — after a double-click, dragging a marquee showed a
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
- [x] ◧ **decide** — Mouse/touch model: choose whether Pages matches Sheets or keeps its
  current model. **Comparison table below** — mark the column you want per row.
- [x] **Shift-key constraints** while drawing: 15° ortho for lines/dims, square for
  rectangles/ellipses; applied live the instant Shift is pressed/released (not only on the
  next mouse-move). Also adopted for **moving** (ortho axis-lock), **resizing / handle-drag**
  (square about opposite corner), and **line-endpoint drag** (15° increments).
- [x] **Object snap (osnap)** — Kestrel-style: entities expose snap points (endpoints, midpoints,
  centres, quadrants; polyline vertices/segment-midpoints); while drawing or dragging a grip the
  nearest within ~10px wins and the point locks to it, with a marker (□ end · △ mid · ○ centre ·
  ◇ quad). Gated by the **OSNAP** status-bar toggle.
- [x] **Grid snap** (completed 2026-09-22) — round to a spacing (SNAP_STEP = 100 mm), driven by the SNAP
  status-bar toggle. Was already wired for DRAWING (`drawPoint`→`snapToGrid`) and MODEL objects (`rndSnap`);
  added the missing ENTITY paths: a grip-resize snaps the (constrained) pointer to grid, and a body/group
  move snaps via `snapDelta` (rounds the delta so the entity's defining point — a / centre / first vertex —
  lands on grid, keeping shape; a group snaps rigidly by its first member). Verified in-browser with SNAP
  on: after a corner-drag the rect read x/y/w/h all exact 100 mm multiples (23600 / −1200 / 6100 / 14100),
  and a select-move snapped x/y to grid; clean console. Object-snap (OSNAP) was already done.

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
| Add to selection | ✅ Shift/Ctrl-click, Shift/Ctrl-marquee | **Shift/Ctrl-click, Shift-marquee** | ✅ **done (Pages)** |
| Duplicate | ✅ Ctrl-D (offset +8) | Ctrl-drag | ✅ **done (Pages, via Ctrl-D)** |
| Group move | ✅ drag any selected → moves all | drag selection | ✅ **done (Pages)** |
| Select all / nudge | ✅ Ctrl-A, arrow keys (Shift = ×10) | Ctrl-A, arrows | ✅ **done (Pages)** |
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

> **Real 3D floor MODEL (walls/openings/furniture/pipes/rect-trunks) + sections → elevations:** see
> **`model-plan.md`** — a phased port of the mature `sheets/tools/model3d/` engine (projection/graph/
> types/migrate are pure, drop-in) onto Pages' editor, plus the net-new gaps (doors/windows/openings,
> multi-direction sections, rect-trunk UX, vertical-run editing). Borrow from model3d, NOT edit3d.
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
- [~] **Trunks & conduits** — node/segment graph with handle editing (drag node, dbl-click segment to add a
  point, Ctrl-drag to branch, Shift = 15° — all done). **Per-segment WIDTH: done** (the model3d `CondSeg`
  carries `w?/h?/edges?`, `conduitRuns` renders per-segment profiles, and Properties has per-segment w/h
  inputs). **[x] Per-corner BEND RADIUS (2026-09-22):** added `bend?` to `GNode` + a `bend?` default on
  `Conduit`; `roundPath` inserts a short quadratic-bezier fillet at each interior node with a radius (trims
  both segments, curves through the corner) so the swept tube rounds in EVERY view; a "Bend r" input in the
  conduit Properties sets the default (a node's own `bend` overrides). Verified in-browser: an S-shaped
  trunk's two sharp corners rounded smoothly when Bend r was set; clean console. **[ ] Still:** DRAG
  HANDLES for width (segment midpoint) and per-node bend (today both are Properties number inputs).
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
- [x] **Draw shapes + annotations directly ON elevations — v1** (2026-09-20) — objects drawn in an
  elevation view carry `space = that ElevDir` (a wall/rack label, leader, dimension); they render
  natively there (not collapsed to the ground line), are hit/grip-editable there, and are hidden in
  other views. Floor/plan objects keep `space` = undefined/'plan' and still project to the ground line
  in elevations. This matches how the Sheets tool stores annotations **per-viewport** (ref:
  `sheets/…` sheet with plan + elevation annotes). Verified: a rect drawn in FRONT shows in FRONT,
  hidden in RIGHT/plan, reappears in FRONT.
- [ ] **v2 — true 3D construction-plane annotations** (Dave, 2026-09-20) — upgrade v1 so a 2D shape is
  positioned in 3D (**x/y/z** + size **w/h/d**, with the unused plane dimension = 0) and oriented on a
  construction plane by rotating about x/y/z. Then each view PROJECTS it: face-on in its own plane's
  elevation (readable), edge-on (a line) elsewhere, foreshortened in iso — instead of hidden. The
  projector generalises the current floor→ground-line projection (a `to3`/`proj3` pair: plan-local
  (u,v) → world → view drawing coords). Scope: render + hit + grips per view; ellipse/circle
  foreshortening + iso are the hard parts.
  - [~] **plan 2D shapes appeared AS-IS (unprojected) in the 3D iso viewport** (Dave, 2026-09-22) — a
    rect/line/text drawn on the plan floated at its raw plan (x,y) coords in iso. **HIDDEN for now
    (2026-09-22):** `inThisView` returns false for plan-plane non-`box` entities when `kind==='iso'` (box
    is a real 3D cuboid and still projects). This gates render + hit + grips + marquee (all use
    `inThisView`/`pickable`). Verified: a plan rect vanished in the iso view and reappeared in plan (hidden,
    not deleted). [ ] **Proper fix (v2):** project them onto the ground plane via `isoR` (foreshortened)
    instead of hiding.
- [x] **Ellipse draw origin** (2026-09-22) — a **CEN** status-bar toggle draws rectangles + ellipses
  **centre-out** (first click = centre; drag = a bbox corner) vs the default corner-to-corner. `env.cen` →
  `centerDraw`; `place()` and the draw `preview` remap the corners via `centerCorners(c, p) = [2c−p, p]` for
  Rectangle/Ellipse (other tools unaffected). Also gave every status-bar toggle a tooltip (TOGGLE_TITLES).
  Verified in-browser: with CEN on, an ellipse's centre mapped exactly to the first click, not the midpoint;
  clean console. (Shift = square about opposite corner still applies.)
- [ ] **Titleblock editing** — edit the titleblock **style** (template/layout) and its
  **contents** (project/sheet fields, logo, revision table) per sheet / per package (P2).
- [ ] More Kestrel tools, surfaced through the **menubar** first; move to a **ribbon** only
  if menus get unwieldy (P2).
- [ ] Optional **Kestrel command line** for AutoCAD users (low priority — Dave doesn't use it) (P3).

### 2a. Insertable objects & annotation types from Sheets  ◧ decide
> The full Sheets set — tick the ones to bring into Pages. (Pages already has
> line, rect, circle, dimension, text.)

**Annotation kinds** (Sheets stores these _per-viewport_): 
Annotes are identical to model objects, just stored in view instead of model, and can be moved between model and view to make them global or per view.
Symbols are identical to annotes.
- [ ] text 
- [ ] line 
- [x] arrow (2026-09-22) — a line carries `arrow?: 'none'|'start'|'end'|'both'`; the render draws a filled
  arrowhead triangle (constant screen size via `gripSize`, so it stays an arrow at any zoom) at the chosen
  end(s). Properties gains a LINE section with an Arrows dropdown. The shared `arrowPts()` helper also
  replaced the callout leader's dot with a proper arrowhead. Verified in-browser: Arrows=Both drew heads at
  both ends; clean console.
- [ ] rect 
- [ ] **ellipse** 
- [x] **cloud** (revision cloud) (2026-09-22) — a rect carries `cloud?: boolean`; when set the render
  draws a scalloped outline (outward semicircle bumps along each edge, CW winding + **sweep-flag 1** —
  matching the proven Sheets `cloudPath` in `sheets/annotations/geometry.ts`; bump size ~constant on screen
  via `gripSize`) via `cloudPath()`. Reuses the Rectangle tool's draw/hit/grips — just a Properties (RECT
  section) "Revision cloud" checkbox. Verified in-browser: outward bumps on all edges; clean console.
  (First cut used sweep-flag 0 → bumps drew inward; Dave caught it, fixed to match Sheets.)
- [ ] callout (leader + text box) 
- [x] dimension — real measured DIMENSION (2026-09-22): the Dimension tool now renders a proper dim —
  dim line + outward ARROWHEADS (shared `arrowPts`) + perpendicular EXTENSION TICKS at each end + the
  measured length (mm) set above the line, aligned to it (flips when upside-down), at a constant on-screen
  size (`gripSize`-based, not the old tiny 9-unit text). Verified in-browser. [ ] Later: aligned vs H/V
  dims, a settable text offset, unit formatting.
- [ ] image (raster) 
- [ ] **grid** (floor-tile, origin-aligned)
- [ ] **legend** (auto-lists layers w/ swatches + counts) 
- [ ] table (see Kestrel)
- [ ] symbol (see below)

**Symbols** (the `symbol` kind, from the registry):
- [~] section marker (linkable to a drawing) — **first pass done 2026-09-20**: a section cut drawn on
  the plan now leaves a persistent MARKER on the plan (dashed teal box + a direction arrow + the
  elevation's label), rendered by the Viewport from a `sections` prop (all `docClip` entries, shown only
  in a plan view). Clicking a marker border opens (re-focuses) its elevation; closing the elevation tab
  removes the marker (dropDoc clears its clip). Verified in-browser (draw → marker renders → click opens
  the elevation, no duplicate → close tab → marker gone). **MOVE + RE-DIRECTION done 2026-09-20:** drag
  the marker box border → the cut translates and the linked elevation re-clips live; click the direction
  arrow → cycles front→right→rear→left (the arrow relocates to the viewed edge and the elevation
  re-projects via projOf's `docSecDir` fallback, unless a pane pinned a ViewCube projection). Verified
  in-browser (drag left 120px → box moved, size kept; arrow click front→right → arrow jumps to the
  bottom edge and the opened elevation reads RIGHT). **SELECTION + RESIZE + TOOLBAR done 2026-09-21
  (Dave's feedback):** a section no longer jumps to its elevation when drawn — it stays on the plan and
  SELECTS the marker (`selSection`). A selected marker shows corner RESIZE grips, a solid highlight, a
  status/instructions line, and a floating TOOLBAR: a LINK button opens the elevation (replaces
  click-to-open), a direction DROPDOWN re-aims the cut (clearer than clicking the arrow), and a delete
  button (Delete key / Esc-deselect too). Verified (draw → stays on plan, selected; resize grew the box;
  dropdown → arrow moved; link → opened the elevation). **Follow-ups:** the full symbol-registry tag form
  (up to 4 arms). NB: a section-marker BORDER hit needs `hitTol()/dscale` (unscaled model units) — plain
  `hitTol()` is off by the drawing scale for an edge-distance test (only area/inside tests like
  `hitModel` get away with raw `hitTol`).
- [x] **Multiple viewports per sheet (AutoCAD paper space)** (Dave, 2026-09-21) — a sheet now holds
  extra viewport FRAMES besides its primary one, each a window onto the shared model with its own
  projection + scale + border + geometry. A "Viewport" paper-space tool drags out a frame; select it →
  Properties VIEWPORT (View plan/front/rear/left/right/3D · Scale · Border · X/Y/W/H · Delete); move by
  the band, resize by corner grips, double-click to edit inside. Extra frames live per tab (`docFrames`)
  with view/orbit/activation keyed by the frame id (reusing docView/docOrbit/activeVps); entity edits
  still target the tab's shared entities. Primary viewport unchanged (tab-keyed) → no regression.
  Verified in-browser (drag a viewport → renders the model; change View Plan→3D → solid iso; move/
  resize/activate/delete all work). **Follow-up:** [x] **Section elevation → drop as a viewport frame**
  (2026-09-22) — the selected section's floating toolbar gains a "drop as viewport" button (panels icon)
  → `on.sectiondrop` → `sectionDropAsFrame`: adds a FRAME (proj = section dir, clip = the section box, a
  copy) to a sheet — the focused pane's sheet, else the first sheet tab — then focuses that sheet + selects
  the new frame (sized to the clip aspect) for repositioning; one page-history step. A frame already
  carried proj + clip, so no schema change. Verified: dropping a Front section switched to 3303 Outlets
  and made a "Front 1:25" viewport onto the 33F model (Properties: Source 33F / View Front); the sheet's
  plan frame shows the section marker, staying in sync; clean console. **Follow-up:**
  [ ] per-frame CROP + a real source config (drawing id) when Pages gets multiple models/drawings.
- [~] **Unify PRIMARY viewport into the frames array + a PAGE MODEL** (Dave; core done 2026-09-21) — the
  sheet is now ONE array of viewport frames (no special primary); the default page seeds a full-bleed
  frame[0]. Every frame is uniform: frame-keyed view/orbit/activation/proj/scale/geometry, border-select,
  double-click to edit inside, corner grips resize; the ViewCube re-aims the active frame; frame add/move/
  resize/delete are on the page history. Verified in-browser. **Still to do:** (a) the true **page MODEL
  object** (`docFrames` is still a per-tab array — wrap it as a page model that also carries the
  titleblock + page annotations, persisted/undone as one unit); (b) label frame[0] from the drawing (it
  reads "Plan" now); (c) minor — ViewCube TOP-face back-to-plan needs a check; (d) the full **PaperPage↔
  Viewport merge** (below). **Also list + reconcile PaperPage vs Viewport differences** (below) as part of this.
  - **PaperPage vs Viewport — differences to reconcile** (for the merge): PaperPage works in **paper px**
    (screen space, `sheetEl.getBoundingClientRect`), Viewport in **model mm** (viewBox + dscale);
    PaperPage owns frame **geometry/selection/drag** (band + corner grips) while Viewport owns
    **content pan/zoom + drawing + entity/model grips**; PaperPage's new-frame drag is a **bespoke
    marquee** vs Viewport's **rect gesture** (ACAD two-click / EOS press-drag) — should be one; PaperPage
    renders the **titleblock**; both have their own **marquee** + **Handle grips** (share `Handle.svelte`
    already). A merge = one surface that hosts nested viewports, each a Viewport, with paper-space vs
    model-space just a coordinate mode.
- [~] **Set the DEPTH PLANE via GUIDE LINES** (Dave's design; core done 2026-09-21) — guide lines
  (`guides.svelte.ts`): a **Guide tool** drops a full-view horizontal line (Shift = vertical) in the
  current view's space (plan or elevation); they render as magenta dashed lines, are selectable
  (border-priority) + deletable. Drawing a Wall/Trunk/Pipe in an ELEVATION takes its off-axis **depth
  from the selected PLAN guide** (h→y for front/rear, v→x for left/right); no guide → model centre + a
  toast/instruction-line nudge. Verified: trunk in a Front viewport lands on the selected plan guide.
  **Follow-ups:** [x] **DRAG a guide** to reposition (2026-09-21) — in Select mode, press near a guide to
  grab + drag it (one history gesture 'Move guide'; hover shows the move cursor; priority below entities/
  grips, above sections/model/marquee); [ ] fallback should be
  **snap-to-geometry** (draw on a wall centreline → inherit its depth) rather than the model centre; [ ]
  **vice-versa** — an ELEVATION guide fixes the z/height when drawing in the plan; [ ] use guides as a
  general **drawing snap** (not just conduit depth). How CAD frames the same idea: AutoCAD UCS; Revit
  work planes / pick-a-wall-face.
- [ ] **RISERS tool** (Dave, 2026-09-21) — like an elevation but spanning **multiple floors** of the
  building: server / IDF / EPS rooms on each floor, connected by **risers, trunks and cable routes**
  running vertically between floors. A riser diagram is a multi-floor section: stack each floor's
  relevant rooms at their true z, draw the vertical backbone conduits + horizontal ties, label
  floor/room/cable counts. Builds on the model (levels/z, conduit graphs with vertical runs — already
  supported) + the section/elevation projection; a riser is essentially a tall section clipped to the
  riser shafts across all floors.
- [ ] **Door swing SIDE + type parity** (Dave, 2026-09-21) — the door `flip` picks the hinge JAMB;
  add a toggle for which SIDE of the wall the leaf swings into (in/out), and a swing-angle handle exists
  (drag the leaf tip). Windows currently draw a single glazing line — add sill/head + mullions in
  elevation. (Openings now: Type dropdown Door/Window/Hole + Swing° + Hinge in Properties; door
  leaf+arc in plan; frame+floor-swing in the 3D view — all done 2026-09-21.)
- [ ] elevation/section tag (up to 4 arms) 
- [ ] detail marker
- [ ] photo marker (linkable to a photo) 
- [ ] north arrow 
- [ ] outlet 
- [ ] faceplate/wall-outlet 
- [ ] door

**Tool-objects** (placed inside a source viewport, live in the tool's own data):
- [ ] outlet 
- [ ] trunk  
- [ ] rack
- [ ] (racks devices / risers / model3d prisms-walls-conduits render read-only on a sheet)

**Blocks / library:** Sheets has a **Shape Library** — built-in + custom shapes (saved
globally in Firestore `library`), drag-to-place; it **copies geometry** (no true "block
instance that updates all copies"). Also a separate **rack device library**.
- [ ] Shape/annotation library (built-in + custom, drag-to-place)
- [ ] **True blocks** (instances update together) — *beyond Sheets; your explicit ask*

[x] **Text editing:** Sheets edits annotation text in the **side panel** (double-click / F2
jumps focus there), *not* in-place. Your ask = **in-place canvas text** → an improvement
over Sheets.

[ ] **Imported backgrounds:** Sheets shows **one** PDF/image page per outlets viewport
(`fileId`+`pageNum`, with origin/scale/crop from the `files/{id}` doc); model3d supports
several **underlays** per direction. **No DXF import** (DXF is export-only). Your asks
(multiple swappable backgrounds; DXF import; set origin/crop in-viewport) are **beyond
Sheets** — see §3/§4.

[ ] **Revisions:** Sheets has a title-block **revision table**, the **cloud** annotation, and
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
- [x] **Lockable layers** — lock toggle on group rows, on **each sub-layer row (beside the eye)**,
  and in the settings dialog (mock; tinted when locked).
- [x] **Draggable layers** (2026-09-21) — layer rows in the LayersPanel are `draggable`; dropping one
  onto another reorders the `layers` array (`moveLayer`), which now IS the draw z-order (below). Drop
  indicator on the target row. Verified via synthetic DnD: dragging Background 2 onto Background 1 swaps
  their order and restacks their objects.
- [x] **Draw order** (2026-09-20) — array position = paint order (later = on top). `reorderEnts`
  moves the selection: front/back jump to the array ends; forward/backward step past one non-selected
  neighbour (block-safe). Wired to **Ctrl+] / Ctrl+[** (± Shift = to front/back) and a Properties
  **ARRANGE** row (⤓ ▽ △ ⤒), recorded to history. Verified front/back and forward (A past B).
  [x] **Paint by (layer order, then intra-layer order)** (2026-09-21) — the Viewport now sorts entities
  by `layerOrder(e.layer)` (array position in the layers store) first, then their own array index. So a
  layer's z-position drives its objects' draw order; `reorderEnts` still restacks within a layer. No
  layer / unknown → paints on top (tool default). Verified: red rect (Background 1) vs blue rect
  (Background 2) — bg-2 on top, then reordering the layers put bg-1 on top.
- [x] **View Presets** (2026-09-20) — a preset is a named set of visible layer ids (`presets` in the
  store). Selecting one applies it (shows exactly its layers); the ⋮ menu does Re-apply / Update /
  Save-current-as-new / Rename / Delete; a "• modified" flag shows when visibility drifts from the
  saved preset. Verified: applying "Trunk Routes" hid the outlet layers and showed the trunks.
- [~] **Find / identify an object's layer** — the selected object's layer already shows in the Properties
  **Layer** dropdown (Dave: enough for now). [ ] remaining (lower priority): highlight it in the panel +
  a "select all on layer" / "isolate layer" action.
- [x] **Wire to the canvas** (2026-09-20) — shared reactive store `layers.svelte.ts` (single source of
  truth). Objects carry `layer`; new objects take the **active layer** (clicked in the panel). The
  Viewport hides objects on hidden layers, blocks pick/marquee/grips on locked layers, and resolves
  **ByLayer** colour from the layer. LayersPanel rebuilt on the store (grouped eye/lock/colour, active
  highlight, settings dialog); Properties Layer dropdown reads it. Verified in-browser (hide→vanish,
  lock→unselectable, active-switch→new object's ByLayer colour follows). [ ] Still open: **View Preset**
  = a saved set of layer visibilities (apply/save); per-object → highlight its layer in the panel.
- [~] **Background layers** (2026-09-21) — a **Background** layer group (Background 1/2) sits at the top
  of the layers array (draws first = behind everything), toggled independently of view presets. Import
  an image onto the active layer via **Insert › Image…** (reads a data-URL; a real backend uploads +
  stores a fileId — §4). `image` Ent type renders in its a→b rect (selectable/resizable). [ ] still:
  PDF/DXF import, swap/compare, per-file origin/scale/crop.
- [x] **HIGH PRIORITY — image-import → layer z-order test** (2026-09-21) — the acceptance mechanism is
  built + verified: an `image` entity type + **Insert › Image…** (file → data-URL → image on the active
  layer), a **Background** layer category, **paint-by-layer-order**, and **drag-to-reorder layers**.
  Verified in-browser (using two filled rects on Background 1/2, since the native file picker + real DnD
  can't be automation-driven): bg-2's object drew ON TOP of bg-1's, then dragging Background 2 above
  Background 1 flipped the z-order so bg-1's object came on top. Images ride the same `paintEnts` path.
  *Still to browser-test with a real image file + real mouse drag (both blocked in the automated
  browser): the `<image>` render and the native picker path — both code-complete + type-clean.*
- [x] **Layer drag-reorder direction fix** (Dave, 2026-09-21) — dropping onto a layer inserted BEFORE it,
  so dragging a layer DOWN onto the next one was a no-op (Dave: "first onto second doesn't change order").
  Now direction-aware: dragging down drops AFTER the target, up drops BEFORE (with a top/bottom drop line).
- [x] **Image resize handles PRESERVE ASPECT RATIO** (2026-09-22) — `lockAspect` prop on the image ent
  (**true by default** for imports); corner-resize keeps the source aspect, **Shift** = free stretch.
  Verified with a real image: resizing kept W/H ratio 1.236.
- [ ] **Plan images shouldn't appear on ELEVATIONS / 3D** (Dave, 2026-09-21 — "I'll think about this") —
  an `image` on the plan plane currently follows the "plan projects into every view" rule, so a raster
  background bleeds into elevations/iso nonsensically. Options: restrict an image to ONLY its own plane's
  views (plan image → plan only; a `front` image → front only); or a per-image "show in: this view / all"
  toggle. Decide, then gate `image` in `inThisView`.

## 4. Imported files / floorplans  (P1–P2)
- [ ] Upload & manage many floorplan drawings per project — **electrical, furniture, AV,
  etc.**, with **versions / checkbacks** (we receive many revisions).
- [~] Set **origin, scale, crop, masks** of an imported file **inside the Pages viewport** (2026-09-22) —
  matched the **Uploads-tool model** (Dave). A **Properties → IMAGE › Calibrate** row has three modes that
  drive Viewport interactions on the selected image:
  - **Origin** — click a point inside the image → stored normalized on the ent (`origin{x,y}`); shown as a
    crosshair; it's the anchor scale keeps fixed and (future) the point to align a re-imported version by.
  - **Scale** — click 2 points across a known distance → an inline "Real distance (mm)" entry → the image
    (a→b) is resized so that measurement is correct in model mm, scaled **about the origin/centre**.
  - **Crop** — drag the crop **window's** corner handles (crop = a normalized sub-rect of the placement;
    the trimmed area dims; per-viewport `clipPath` id so multi-viewport sheets clip independently). Plus
    Crop X/Y/W/H % fields + Reset, and an **Opacity %** (for tracing).
  **Now VERIFIED end-to-end with a real image** (2026-09-22, via a dev hook `window.__pagesAddImage(url)`
  that injects a URL image into the running model, since the native picker can't be automation-driven):
  the JPG renders; interactive crop trims + dims + updates the % live; **resize handles sit on the CROPPED
  extent** (was a bug — grips were at the full placement); aspect-lock resize keeps the ratio; scale =
  instruction line + 2 clicks + **draggable endpoints** + inline "real mm" entry → resized ×1.844 keeping
  aspect; origin drops a crosshair anchor. [ ] still: **masks**, re-import version alignment by origin,
  interactive origin/scale on a rotated image, and a nicer scale entry than the inline box.
- [ ] Supported inputs: **PDF, image, DXF**.
- [ ] Produce various floorplan **views**: data-outlet locations, desk numbering, trunk
  routes, penetration & conduit requests (these are the output deliverables).

## 5. Views  (P2)
- [x] **Model REGISTRY + per-viewport model reference** (2026-09-21) — `models` is now a registry of
  coherent sources (seeded: **33F** floor + **Rack A** rack). A viewport references a model by id: a
  sheet FRAME carries `modelId`, a model-layout TAB carries `modelId` (defaults to the floor). `Viewport`
  gets a `modelId` prop and resolves `mdl = modelById(modelId)`; entities/guides/objects all come from
  that model; editing targets the ACTIVE viewport's model (`modelIdOf(tabId)` — the active frame's model,
  else the tab's). PaperPage passes each frame its model's ents via an `entsForModel` resolver. Verified:
  the Rack A tabs render the rack; a sheet shows floor + rack in two viewports at once.
- [x] **Wire up model selection** (2026-09-21) — a **Model/Source** dropdown in the selected viewport
  frame's Properties (lists the registry's models) re-points its `modelId` live. Verified in-browser:
  switching a frame's Source from 33F → Rack A re-renders it as the rack. (ViewCube still sets projection.)
- [x] **Viewport-frame properties** — selecting a viewport frame (paper space) shows its props
  in the Properties panel: Name, Type, X/Y/W/H (live, editable), and **border style**
  (dashed / solid / none, applied to the frame). Most-recent selection wins over tree-node props.
- [ ] **Per-view content config** — the rest of a view's props: source model/floorplan, scale,
  crop/clip, layer-visibility preset per view. (Frame position/size/border done above.)
- [ ] **View types like the Sheets tool** — Pages views should support the same set of view
  kinds (list to be confirmed alongside §2a).
- [ ] Multiple views of one model at different scales/crops on a sheet (viewport frames
  already support this — needs per-view content config).
- [~] ◧ **Per-viewport pan/zoom(scale) SAVED PER PROJECTION + multi-user** (Dave, 2026-09-21) — each
  viewport should remember its pan/zoom (scale) **per view direction** (plan / front / rear / left /
  right / 3D), so flipping the ViewCube restores each view's own framing. **Per-projection keying DONE
  (2026-09-22):** content pan/zoom (`docView`) AND iso orbit (`docOrbit`) are now keyed by
  `paneId:viewId:proj` (new `vkey` helper), threaded through `vpOn` (model-layout tabs, via
  `projOf`/`activeProj`), `vpOnFrame` (sheet frames, via `frame.proj`), the `frameView`/`frameOrbit`
  resolvers, and the nav zoom/fit helpers; `dropDoc` cleanup matches keys by their viewId segment.
  Flipping a viewport's projection now leaves each direction's framing intact instead of carrying one
  across all. Type-check clean at baseline; projection switch renders with a clean console. NB: this is
  the **content** view (active vp + "Pan content"); the per-tab CANVAS zoom (`cvCache`, localStorage)
  is deliberately shared across projections (the paper/canvas isn't a projection). **Still open (the
  ◧ decision):** the **multi-user persistence model** — if framing lives in the backend and one user
  re-frames a view it moves for everyone. Options: (a) a **lock** toggle per viewport (frozen vs
  free-look), (b) a **Save view** button (otherwise pan/zoom stays local per user), (c) per-user view
  overrides. Today `docView`/`docOrbit` are in-memory only (reset on reload) — decide before persisting.
- [x] **Rotate handle on ALL shapes** (2026-09-22) — rects / ellipses / images / lines now get a rotate
  HANDLE (a distinct **circle** above the bbox top-centre with a connector line, vs the square resize
  grips), like the furniture prism's. `rot` already existed on `Ent` (render/hit/grips honour it) — this
  exposes it as a draggable handle: `ROTATABLE` set + `canRotate()` (excludes flat-elev floor projections
  and an image mid-CROP), `rotGripLocal()` (angle-from-centre + 90°, matching the prism/model handle), a
  `rotate?` flag on `Grip` so `gripsFor` rotates the handle's POSITION with the shape but passes the RAW
  pointer to its apply, and `constrainGrip` bails on a rotate grip (no square/ortho constrain).
  **Verified in-browser:** drew a rect on the floorplan → selected → the circle handle renders above it →
  dragging it rotated the rect ~35° about its centre with the corner grips following, clean console.
  Pairs with the rotated-resize-handles fix (§0). **Shift = snap to 15°** (2026-09-22) — the rotate apply
  reads live `shiftDown`, so pressing/releasing Shift re-snaps in real time via `reconstrain` (no mouse
  move needed), like ortho/square. Verified: a free rotate drag with Shift landed on exactly 75°.
  [x] **Added to `box`** (2026-09-22) — `canRotate` now includes `box` **in plan** (its footprint; in
  elevation box keeps its boxElev face grips). Verified: a plan box shows the rotate handle.

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
- [x] **`space: 'model' | 'view:<frameId>'` scope on entities** (2026-09-21) — an entity carries a
  `space` scope: model-space shows in every view of its model (layer-gated); `view:<frameId>` shows only
  in that viewport frame. A **Scope** dropdown in the entity Properties (Model / This viewport) sets it.
  Verified: a rect scoped "This viewport only" shows in its frame but is hidden on another view of the
  same model. Also carries an orthogonal `plane` (which projection plane its coords live in).
- [ ] Move an annotation / object view→model (and back) — the Scope dropdown does model↔this-viewport;
  still to do: an in-canvas "push to model / pull to this view" gesture + moving between two view scopes.

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
- [x] Top-bar **Package / Version** selectors (mock); the per-drawing Revision moved to History.
- [ ] **Package / Version switching should show different content** (Dave, 2026-09-20) — Package can
  operate on all docs, but switching **Version** must let you check different issued packages
  (version-controlled content per drawing set). Needs versioned storage.
- [ ] **Per-floor / per-drawing versions + revisions** (Dave, 2026-09-20) — designers send different
  *versions* of a floorplan per floor, each needing its own *revisions*. So version is not purely
  set-wide: a drawing may track its own source version + revision chain. Leave for now; revisit with
  the model registry (§5) and versioned storage.
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
- [x] Wire **SNAP / ORTHO / OSNAP / LWT** (2026-09-20) — **SNAP** rounds draw points to a 10-unit grid
  (object snap still wins); **ORTHO** forces line-draw + move to H/V, with **Shift toggling** it
  (XOR); **OSNAP** + **LWT** were already wired. `snap`/`ortho` flow through `env` from the status
  toggles. Verified: SNAP on → coords ×10, off → raw; ORTHO → horizontal line (dy=0). Ctrl-K palette
  now autofocuses its search input (used:action via tick, not the unreliable `autofocus` attr).

## 10. Undo / redo / history / revisions  (P2)
- [x] **Undo / redo** (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Edit menu) — snapshot-based, coalesces
  a drag into one step. **Change log** + **revision snapshots** in `parts/HistoryPanel.svelte`
  (right "History" tab): New revision, restore a revision, **editable description note per revision**.
- [ ] **Diff between revisions** → generate revision **clouds** from the changes (the real
  payoff; Sheets has only a manual cloud annotation).
- [ ] **Reverted revisions are read-only** (Dave, 2026-09-20) — restoring an older revision should
  NOT make it editable; only the **latest** revision is editable. To edit an old one, the user must
  **make a copy** (branch) or explicitly unlock it. Needs a revision-state model (latest vs
  historical) + a lock on the doc when viewing a historical revision.
- [x] **Each revision saves a date** (shown in History + titleblock; see §0 batch 4).
- [ ] **Titleblock revision TABLE** — list all revisions (letter · date · note) in the titleblock,
  not just the current one.
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

- Read-only reverted revisions (only latest editable) — todo added.
- Package/Version version-switching and per-floor versions+revisions — todos added.
- Print A-size/scaling (§2.2), a DocEditor refactor (§4.1), mm world units (§4.2), reuse Sheets' layer model (§4.3), shared pan/zoom helpers (§4.4), and assorted nits.

These are the ones where I think your input matters more than my guessing:
- §4.1 full DocEditor class — the geometry is extracted; the full headless-editor refactor of Viewport/+page is large and best reviewed.
- §4.3 reuse Sheets layers.ts — a real integration (the Pages layer panel is still a mock); ties into the layer-wiring work.
- §2.3 full per-doc frame state — I did the important partial (no dead Properties handle on unmount); moving frame geometry/border into per-doc state is a moderate PaperPage refactor I'd rather you sign off on.