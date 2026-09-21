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
- [ ] **Rotated-shape resize handles are wonky** (Dave, 2026-09-20) — corner/edge grips on a rotated
  object don't drag cleanly: the shift-square constrain (`constrainGrip`) still works in WORLD axes, and
  a corner drag should resize along the object's LOCAL (rotated) axes about the opposite corner. Fix by
  doing the resize math entirely in the un-rotated local frame (we've solved this in other tools / older
  CAD — reuse that approach). Likely also wants **per-axis rotation (X/Y/Z°)** for real 3D shapes rather
  than the single Z angle we have now.

Suggested order in review.md §7.

- [x] **Pan-content zoom re-scales the view** (Dave, 2026-09-20) — with a viewport active + "Pan
  content" on, wheel-zoom now folds into the DRAWING SCALE (like a CAD viewport) instead of a free
  zoom: the scale label/dropdown update live (e.g. 1:100 → 1:84 → 1:70 zooming in) and the cursor's
  model point stays fixed. `on.scale` callback + the dropdown tolerates computed 1:N values.

### Reported 2026-09-21 (Dave) — batch 6
Done:
- [x] **Guides get undo/redo** — alignment guides are now snapshotted into each page history step
  (`snapGuides`/`setGuides` in `guides.svelte`, mirroring models' snap/set). Guide add (Guide tool)
  and delete (Delete/Backspace) record a step via a new `on.guideedit` callback (begin/edit/end,
  one step each). Verified: place guide → Ctrl+Z removes it → Ctrl+Shift+Z restores it; guide also
  falls off correctly in a multi-step undo. *Caveat:* guides are still module-global (shared across
  docs) while history is per-doc — same known limitation as the global `models` store; fix when
  guides become per-model.
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
  renders solid with correct occlusion). [ ] Still: entity flats (lines/rects) show no depth ordering
  vs the model; per-face shading (light/dark) for a stronger 3D read.
- [ ] **Tools floating window: merge related tools into pop-out groups** (Dave, 2026-09-21) — the tool
  strip is getting long; group tools that share a mode into ONE button with a fly-out: **conduits**
  (Wall / Trunk / Pipe — all graph tools), **lines** (Line / Polyline), **2D shapes** (Rectangle /
  Circle / Ellipse / …). Each group button shows the last-used tool + a pop-out to switch; ties into the
  editing refactor (these already share code paths).
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
  plan centre (nudge in plan afterwards). Furniture/Section/Opening stay plan-only. [ ] Follow-up: let
  the user pick the depth (e.g. snap onto a wall) instead of the centre default.
- [ ] **Multi-direction section (arrows on all 4 sides)** (Dave, 2026-09-21) — a section box could show
  an arrow on each of its 4 sides, each spawning that direction's elevation (front/rear/left/right from
  one cut). Today one box = one direction (the dropdown). Arrows now sit INSIDE the rect at the edge the
  observer looks from (front = bottom edge looking up, etc.) so 4 arrows fit naturally. Needs the section
  model to carry a set of active directions + one elevation view per direction.
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
- [ ] **Select + DELETE graph nodes** (Dave, 2026-09-21) — let a single wall/conduit NODE be selected and
  deleted, with the connected segments handled by degree: **1 segment → delete that segment**; **2
  segments → join them into one** (drop the node, merge the two segments); **3+ segments → keep the FIRST
  TWO segments joined into one and delete the rest** (Dave's spec 2026-09-21). Needs a node-level
  selection (today selection is whole-object; grips are per-node but not individually selectable).
  Branch-from-node is now **Ctrl-drag** (done 2026-09-21; was Alt).
- [ ] **Audit + minimise Alt-key functions** (Dave, 2026-09-21 — rarely uses Alt) — list every Alt-*
  binding in the Pages tool and move the useful ones to Ctrl/other or a visible control. Known Alt uses:
  panzoom Alt+wheel = zoom (`ui/panzoom.ts`); (node-branch moved off Alt → Ctrl). Grep `altKey` across
  `pages/` and decide each.
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
- [ ] **Callout toggle** — let a text box become a **callout** (leader + box). Seems useful.
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
Annotes are identical to model objects, just stored in view instead of model, and can be moved between model and view to make them global or per view.
Symbols are identical to annotes.
- [ ] text 
- [ ] line 
- [ ] arrow (add props to line for arrowheads)
- [ ] rect 
- [ ] **ellipse** 
- [ ] **cloud** (revision cloud)
- [ ] callout (leader + text box) 
- [ ] dimension 
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
  resize/activate/delete all work). **Follow-up:** [ ] **Section elevation → drop as a viewport frame**
  — now that sheets take multiple viewports, a section's clip+dir should be placeable as a frame on the
  current sheet (source `{ proj: dir, clip }`) instead of only spawning an elevation tab. **Follow-up:**
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
- [ ] **Draggable layers** — reorder layers/groups in the manager by dragging. **(P1 — part of the
  image-import test below; the drag order sets the background draw z-order.)**
- [x] **Draw order** (2026-09-20) — array position = paint order (later = on top). `reorderEnts`
  moves the selection: front/back jump to the array ends; forward/backward step past one non-selected
  neighbour (block-safe). Wired to **Ctrl+] / Ctrl+[** (± Shift = to front/back) and a Properties
  **ARRANGE** row (⤓ ▽ △ ⤒), recorded to history. Verified front/back and forward (A past B).
  [ ] Later: paint by (layer order, then intra-layer order) once layers get a draw order.
- [x] **View Presets** (2026-09-20) — a preset is a named set of visible layer ids (`presets` in the
  store). Selecting one applies it (shows exactly its layers); the ⋮ menu does Re-apply / Update /
  Save-current-as-new / Rename / Delete; a "• modified" flag shows when visibility drifts from the
  saved preset. Verified: applying "Trunk Routes" hid the outlet layers and showed the trunks.
- [ ] **Find / identify an object's layer** — select an object → highlight its layer in the
  panel (and a "select all on layer" / "isolate layer" action).
- [x] **Wire to the canvas** (2026-09-20) — shared reactive store `layers.svelte.ts` (single source of
  truth). Objects carry `layer`; new objects take the **active layer** (clicked in the panel). The
  Viewport hides objects on hidden layers, blocks pick/marquee/grips on locked layers, and resolves
  **ByLayer** colour from the layer. LayersPanel rebuilt on the store (grouped eye/lock/colour, active
  highlight, settings dialog); Properties Layer dropdown reads it. Verified in-browser (hide→vanish,
  lock→unselectable, active-switch→new object's ByLayer colour follows). [ ] Still open: **View Preset**
  = a saved set of layer visibilities (apply/save); per-object → highlight its layer in the panel.
- [ ] **Background layers** — import one or more PDF / image / DXF files as background
  layers that can be toggled/swapped (e.g. compare floorplan vs RCP). Replaces the
  Sheets "one background PDF" limitation.
- [ ] **HIGH PRIORITY — image-import end-to-end test** (Dave, 2026-09-21) — *do this once the
  **PaperPage↔Viewport merge** and the **page-MODEL object** (§2) are finished.* Import files
  (**images first**; PDF/DXF later), **assign each to a layer** (typically grouped under a
  **Background** layer category), then **drag layers in the Layers list to set the draw z-order**
  and confirm one background correctly overlaps the other. Depends on **Draggable layers** (§3) +
  Background layers (above). This is the acceptance test that ties file-import + layers + z-order
  together.

## 4. Imported files / floorplans  (P1–P2)
- [ ] Upload & manage many floorplan drawings per project — **electrical, furniture, AV,
  etc.**, with **versions / checkbacks** (we receive many revisions).
- [ ] Set **origin, scale, crop, masks** of an imported file **inside the Pages viewport**
  (no switch to the Uploads tool).
- [ ] Supported inputs: **PDF, image, DXF**.
- [ ] Produce various floorplan **views**: data-outlet locations, desk numbering, trunk
  routes, penetration & conduit requests (these are the output deliverables).

## 5. Views  (P2)
- [ ] ◧ **design — where a model lives + how to pick one per viewport** (Dave's Q, 2026-09-20).
  **Suggestion:** a project-level **model registry** — each *model* is a coherent source (a floor's
  plan model, a rack elevation model, a 3D model) holding its own entities/layers/origin/scale,
  stored separate from pages. A **page** is a sheet of **viewports**, and each viewport references a
  model by id **+ a view config**: `{ modelId, projection (top/front/right/3D — the ViewCube),
  scale, crop, layerPreset }`. Selecting the model: when a viewport frame is selected, add a
  **Model / Source** dropdown to its Properties (next to the border/type fields already there),
  listing the project's models. This dovetails with the per-viewport props (done) and the ViewCube
  (done). Alternative considered: "each tab IS a model, viewports reference a tab" — rejected because
  one sheet needs viewports of *different* models, so an explicit registry is cleaner.
- [ ] **Wire up model selection** on the viewport once the registry exists (dropdown → re-point the
  viewport's `modelId`; the ViewCube sets `projection`).
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