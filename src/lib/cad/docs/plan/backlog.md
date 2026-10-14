# cad backlog

**Status:** draft for Dave (2026-10-03). Built from the 329 gap rows Dave ticked, his 168 todos, and 58 items left over from
phases 1–7. All 555 are accounted for (each source id appears in exactly one entry here, in `decisions.md`, or in
`later.md`). `../archive/plan-sources.md` maps every id to its source: G = a gap row in `gap-analysis.md`, T = a todo
in `todo.md`, P = a phase-doc line.

**How to read an entry:** `- [ ] ⚡ ❓ **Name** — what to build. **P1 · S** (~40 lines). *cad today:* … *From:* ids`
- **P1** = a bug / data risk, something Dave called required, or a core job cad can't do at all. **P2** = ticked and
  useful. **P3** = nice to have.
- **S** ≤ ~60 lines of cad code, **M** ~60–250, **L** > 250. Estimates, from reading the cad code.
- **⚡** = quick win (P1 / P2 and S).
- **❓** = Dave ticked the gap but later asked "do we need / consider" about it: answer the question in
  `decisions.md` (top list) before building.
- Change a priority by editing the tag. When an entry is built, log it in the phase doc (`../phases/phase8.md`) and
  delete it here (a part built: shrink the entry to what's left).

**File size:** the ~500-line limit is RELAXED for now (Dave 2026-10-07: "relax on getting files under 500 lines").
CadShell, ViewCanvas and selectTool were split 2026-10-07; split again only when a file gets hard to work in.

**Remaining:** 14 entries (14 P3, every P1 / P2 done — W12 to later.md, Dave 2026-10-15; no ⚡ quick wins left) — Dave's todos of 2026-10-14 (10; the revision check done 2026-10-15) and the workflow walkthrough W1–W32 (32, next sections); Review 2 (section at the end) is done. **Batch 5 (Dave 2026-10-10):** layer line type ✓, Match properties ✓, viewport nudge / snap / fit scale ✓, copy one segment ✓, Find/replace into Renumber ✓, blocks drag to place ✓ — Batch 5 done. Port map for VLANs built 2026-10-11 (`port-map-plan.md`). **Low priority waits (Dave 2026-10-07): the P3 items are not looked at until the P1 / P2 ones are done.**

## Dave's todos (2026-10-14)

- [ ] **Edit file names on export** (Dave 2026-10-14 todo, ❓ consider) — let the user change the name an export
  will save under (Excel schedules, PDFs, DXF, backups) before it downloads; today it is fixed, e.g.
  `Patching-Workflow_test-L1.20_Rack_room-changes-20261014.xlsx`. Options: an editable name in each export dialog, or a
  project-wide file-name pattern (`{project}-{what}-{date}`). **P3 · S–M**.
- [ ] ❓ **Three bands: underlay, model, annotations** (Dave 2026-10-14 todo, consider) — group what a view draws into
  three bands, always in this order bottom to top: the **underlay** (floorplans, images, received drawings), the
  **model** (outlets, racks, runs, walls, boxes, blocks) and **annotations** (text, leaders, dimensions, clouds,
  legends, labels). Each band could be shown / hidden, faded or locked as a whole (per view and per sheet viewport), and
  draw order (Ctrl+] / [) would work inside a band, never across. To decide first:
  - Is a band a fixed group of the existing layers, or a property of each layer?
  - Does it replace the Floorplans layer's own toggle?
  - Should "fade" (e.g. the underlay at 50%) be per band?
  
  **P3 · M**. *cad today:* layers (system + project) with hide / lock / freeze per viewport; a draw order per shape;
  the floorplan at a fixed 0.6 opacity. *From:* Dave 2026-10-14 (walkthrough).
- [ ] **A scripting hook for AI assistants** (Dave 2026-10-14 todo, ❓ consider; the guide page `/cad/agent` is built)
  — `window.cad.read()` / `run(command)` so an assistant reads the model as data instead of from screenshots and
  clicks. **P3 · M–L**.
- [ ] **Navigator: drop the fixed view rows under each level** (Dave 2026-10-14 todo, ❓ "do we need plan /
  elevations under each floor model in the tree?") — each level lists Plan + Front / Rear / Left / Right elevation (5
  rows × every level) although a click on the level row already opens its plan and the view strip's Plan ·
  Elevation… switches. Proposal: leave them out; keep sections and server rooms (the level's own things); a search
  ("2F front") still finds the elevations; with an elevation open, the level row is the one marked.
  `domain/navTree.ts` + its test; Help's Navigator how-to. **P3 · S** (~20 lines).

## Workflow walkthrough (2026-10-14)

From `workflow-walkthrough.md`: a project built from scratch (Workflow test, Netflix SYD005) plus four installer
rounds. The B numbers are that doc's bottlenecks. Fixed already: B40 default settings, the package bug, B53 snap
to a riser's end, the riser reach, reload view, "(run gone)". Ordered by the walkthrough's ranking.

### Bugs

W1–W3 fixed 2026-10-14 (`../phases/phase8.md` "Walkthrough bug fixes"); built since: W5, W9 (with the Upload todo), W11, W18, W22, W4, W7, W6, W15, W16, W20, W19, W21, W25.

### Floorplans

- [ ] **W8 Flag what the new layout broke** (B10) — after a floorplan swap, list outlets / boxes that now sit in a wall
  or where a desk was. **P3 · M** ❓.

### First run and setup


### Sheets, packages and issue

- [ ] **W23 Show what changed since the last issue** (B28) — highlight the changed items on a sheet marked
  "Changed since". **P3 · M–L**.
- [ ] **W24 Smaller issue / sheet friction** — the Issue panel's "Package" is only a label (a real package needs
  Make package): one concept; issue PDFs listed apart from floorplans in Uploads (B51); the Sheets table's Issue state
  column on by default. **P3 · S**.

### BOM

- [ ] **W26 More BOM lines** (B24) — faceplates, back boxes, modules, fibre terminations, containment fittings and
  supports, fire-stopping, testing / labelling counts. **P3 · M** ❓ (which ones, from what).

### Risers, sections and wall kit

- [ ] **W27 A riser carries on on the other floor** (B37) — after V the run continues on the target level (switch
  the pane, or split), from the riser's top at that floor's tray height, not at FFL. **P3 · M**.
- [ ] **W28 Draft in sections** (B34) — Outlet / Trunk / Line in a section; a block placed in an elevation also shows
  in a section of the same wall. **P3 · M**.
- [ ] **W29 Wall-mounted equipment** (B32, B33, B57) — a wall-mount rack / panel kind with a Z height (the ACS panel
  is a plain box today), and AV kit (screens, speakers) as block templates. **P3 · M** ❓.
- [ ] **W30 Rooms and riser rooms** (B38, B39) — draw a room (space) boundary so EPS / riser rooms get names in the
  riser view; fill % and cable counts on the riser view. **P3 · M**.
- [ ] **W31 Ladder in the Kind list; cloud hint** (B13, B36) — "Ladder" offered as a kind (it shows as Tray); the
  Revision cloud hint says "On a sheet" but it works in every view. **P3 · S**.

### Small UI

- [ ] **W32 Small fixes** — each **S**:
  - a device dropped next to another in a rack goes to the nearest free U (it was silently refused) (B45);
  - Shift+click adds to a plan selection, as Ctrl does (it replaced it) (B49);
  - the bottom table stays as you left it when the view changes (it reopened every time);
  - a click inside a viewport on a sheet picks the viewport (it picked the sheet);
  - the riser view opens in its own tab, not over the plan's;
  - the allocation issue says "no high-level panel in L1.20" when there is none (B52);
  - the Blocks window's "On this level" doesn't count outlet symbols;
  - a Measure (distance) tool for checking scale. **P3**.

## Suggested order

Small, high-value work first; nothing big until Dave has answered the decisions it depends on.

1. ~~**Batch 1: safety and unblockers**~~ — built 2026-10-04; the live interconnect run done 2026-10-05 (`../phases/phase8.md`).
2. ~~**Batch 2: tiny P2 wins**~~ — built 2026-10-03; see `../phases/phase8.md`.
3. **Batch 3: P1 features, medium.** Renumber, the Floor manager (range, names, heights) and dark mode were built
   2026-10-03, deleting a section asks about its views 2026-10-05 (`../phases/phase8.md`). Still to do: the cord
   workflow (re-route, end badges, bulk status).
4. **Batch 4: large, after the decisions they need:**
   - Layers;
   - Shape style;
   - clipboard;
   - ~~import of Pages sheets (7.2) and Sheets-tool sheets (7.3)~~ — later (Dave 2026-10-12);
   - command line + drafting commands.

## Bugs and data safety

**Done** (fixed in commit d033eeb4, 2026-10-02): G001, G002, G003, G004, G092, G101, G318


## Outlets, labels and numbering

Note: the outlet fields now live in `ui/OutletProps.svelte` (moved in phase8 Batch 2).


## Levels, plans and underlays

- [x] **Embed Uploads in cad?** — the link is built (File › Uploads… opens it in a new tab, 2026-10-07). Still to decide: embed the Uploads tool (floorplan PDFs: upload, origin, scale, crop, masks, layers) in a cad window / dialog. **P3 · L** (Dave 2026-10-07: "consider"; Uploads is its own route with its own PDF viewer state). *From:* Dave 2026-10-07 **Dave 2026-10-13: build.** **Done 2026-10-13** (File › Uploads… dialog; the tool moved to $lib/uploads).

## Racks, devices and rack views


## Ports, panels and allocation


## Patching and cords


## Containment, routing, risers and fill


## Selection and editing

- [x] **Text to and from office apps** — Copied items go out as readable text; text pasted from Word / Excel becomes a note. **Dave 2026-10-12 todo: Ctrl+V after copying text in another app pastes a text box** (plain text → a text shape at the pointer, on the plan / sheet; `app/clipboardEvents.ts` paste today ignores non-cad text). **P3 · M** (~80 lines). *cad today:* missing (pictures paste; plain text does nothing). *From:* G234, Dave 2026-10-12 **Dave 2026-10-13: build.** **Done 2026-10-13** (Ctrl+V text → a note, Excel / HTML tables → a markdown table; Ctrl+C leaves readable words).

## Drafting commands and input

- [x] **Floor-tile grid** — A box draws a tile grid of N mm, with X / Y offset to line up with the real floor. **P3 · S** (~60 lines). *cad today:* missing. *From:* G162, G264 **Dave 2026-10-13: build.** **Done 2026-10-13** (a box’s Floor tiles: size + X / Y offset; screen, PDF, DXF).
- [x] **Markdown notes block** — A note with headings, bullet / numbered lists, tables and bold / italic, wrapped in a box; paste from Word / Excel. Answer to "how much code?": about 250 lines (layout into text lines, plus PDF / DXF output), on top of "Text that fills a box". **P3 · L** (~250 lines). *cad today:* `markdown` flag in the data, unused (`cad/domain/shapes.ts:73`). *From:* G184, G328, T143 **Dave 2026-10-13: build — markdown notes AND tables.** **Done 2026-10-13** (headings, lists, bold / italic, pipe tables; screen, PDF, DXF).

## Layers, styles, blocks and symbols

- [x] **Layer presets, groups, multi-select** — the parts of the Layers panel left out of the first build (`docs/plan/layers.md`): saved sets of shown layers, group headings with a group eye, Ctrl / Shift-click several rows. **P3 · M** (~120 lines). *cad today:* `ui/LayersPanel.svelte` has eye / lock / freeze / colour / order per layer, one row at a time. *From:* G174, G177, P051 **Dave 2026-10-13: build.** **Done 2026-10-13** (presets, groups with a group eye, Ctrl / Shift-click several).
- [x] **Shape style** — what's left: project drawing defaults for new shapes (color, line type, lineweight); DXF lineweights (the writer has no field) and a DXF hatch for fills. **P3 · S** (Dave 2026-10-06: low priority) (~60 lines). *cad today:* a shape's own color, fill, line type (solid / dashed / dotted / dash-dot) and lineweight (mm) in Properties (one or several, and plain lines), on screen, printed as set in PDF, line types in DXF (2026-10-05, `cad/ui/LineStyle.svelte`, `ownStyle` in `cad/views/plan.ts`). *From:* G011, G164, G283, T093 **Dave 2026-10-13: build.** **Done 2026-10-13** (Project settings › Drawing style; DXF lineweights and solid hatch).
- [x] **Linked symbols (URL / sheet link)** — an insert can link to a sheet or a web page; a badge shows on hover, double-click opens it. Store the link on the insert (each marker has its own target), not the block. **P3 · M** (Dave 2026-10-10: low priority) (~80 lines). *cad today:* missing. *From:* G257, T149 **Dave 2026-10-13: build.** **Done 2026-10-13** (Properties › Link to a sheet or a web page; hover badge; double-click opens).
- [x] **Blocks: front drawings** — what's left of the Blocks panel: a block's own FRONT drawing for elevations (today the plan symbol is drawn there, facing you). Drag to place was built 2026-10-10 (`../phases/phase8.md`). **P3 · M**. *cad today:* Blocks panel + Insert tool in plan / elevation / section, inserts have a height (2026-10-04, `cad/ui/BlockManager.svelte`, `cad/editor/insertTool.ts`). *From:* G284, P004 **Dave 2026-10-13: build.** **Done 2026-10-13** (made from shapes drawn in an elevation; plan inserts of blocks with a front show it in elevations).

## Sheets and viewports

- [x] **Viewport handling** — work with viewports like other shapes. Parts: (1) select several (Ctrl-click, marquee on empty paper; Delete removes them all); (2) copy / cut / paste / duplicate (Ctrl+C / X / V / D) with views and notes, across sheets and projects; (3) Ctrl-drag leaves a copy; (4)–(6) built 2026-10-10 (nudge, edge snap, Fit picks the scale — `../phases/phase8.md`); (7) scale and align the content with touch (the mouse is done: Alt-drag pans, Alt+wheel steps the scale); (8) viewport numbers, a viewport list and "open source view". **P3 · L** (Dave 2026-10-06: low priority) (~330 lines left). *cad today:* one viewport at a time (`cad/editor/tools.ts:142`, `cad/app/workspace.svelte.ts:116`), moves snap to 0.5 mm (`cad/editor/tools.ts:270`), Fit only re-centres (`cad/ui/SheetProps.svelte:101`), Alt-drag pans the content. *From:* G022, G152, G153, G154, G207, G215, G307, G308, G310, T086 **Dave 2026-10-13: build.** **Done 2026-10-13** (pick several, Ctrl-drag copy, copy / cut / paste / Ctrl+D, touch pan / pinch, numbers, the viewport list, Open source view).

## Revisions, issue and backups


## Print and export


## Shell, navigation and touch

- [x] **ACAD / EOS input mode** — a status-bar toggle: ACAD = wheel zooms, draw with two clicks (today's way); EOS = wheel pans, press-drag draws. Dave asked "consider" first, so agree the two modes before building. **P3 · M** (~100 lines; press-drag drawing touches every draw tool). *cad today:* wheel always zooms (`cad/ui/ViewCanvas.svelte:306`), tools take clicks. *From:* G221, T110 **Dave 2026-10-13: build.** **Done 2026-10-13** (status-bar toggle; EOS: wheel pans, press-drag draws runs / lines / dimensions).

## 3D, elevations and sections


## Review 2 (2026-10-12, second pass)

Six read-only passes over cad at fe9e4d4a…1988f5b8 (after the review-2026-10-12 fixes): bugs since that review, data /
output bugs, legacy parity (Outlets / Frames / Racks / Elevations / Patching · Sheets / Drawings / Pages / Packages /
palette), UI / UX, code health / tests / performance, plus a short live look. Only items NOT in
`review-2026-10-12.md`, this backlog, `later.md` or `decisions.md`; where a review item is only partly done, its R number
is given. Paths are relative to `src/lib/cad/` unless they start with `routes/` (= `src/routes/projects/[pid]/`) or
`lib/`. ✔ = confirmed in the code or by a script; *likely* = read, not run.

### Q-A. Bugs: data and output

- [x] **Q1 White racks order the black containment kit** — rack Color is now a hex picker (`ui/RackProps.svelte:154`) but the BOM compares the word "white" (`domain/rackBom.ts:19`), so `#fff` racks get `*-AC-KIT`, not `*-KITWH`. *Fix:* treat white / light hex as white; test. ✔ **P1 · S** **Done 2026-10-12** (white / light hex = the white kit (`isWhite`)).
- [x] **Q2 Changing a rack's room leaves its panels serving the old room (R27 part)** — `setRoom` / `named` (`ui/RackProps.svelte:48-68`) write only `spaceId` / `rowId`; allocation prefers `panel.serverRoomId` (`domain/allocate.ts:55`). With racks from several levels, Room uses `racks[0].levelId` (*likely*). *Fix:* move panels' `serverRoomId` in the same transaction; offer Room only for one level. ✔ **P1 · S** **Done 2026-10-12** (`racksToRoom` moves the panels; Room disabled for racks on several levels).
- [x] **Q3 Auto cord lengths wrong on column-numbered switches** — `cordLength` takes the column as `(port-1) % 24` (`domain/cords.ts:62-65`), ignoring `portNumbering` / `portGrid`; ports 13–36 of the built-in 48-port switch get the wrong side (BOM, cord orders). *Fix:* `portAt` / `portGrid`; test. ✔ **P1 · S** **Done 2026-10-12** (`portColumn` / `portSide` from portGrid / portAt).
- [x] **Q4 Floors settings never see building changes** — `building` is `$derived(project.store.ofType('building')[0])` with no `project.rev` (`ui/FloorsPanel.svelte:26`): after unticking a floor and Apply, a later height edit restacks with the old skip (floors above jump ~3.8 m); a project with no building gets a new one per Apply (`:113`). *Fix:* read `project.rev`. ✔ **P1 · S** **Done 2026-10-12** (reads `project.rev`).
- [x] **Q5 An outlet with no Z drops to the floor when moved vertically or pasted; three height rules** — `moveBy` / paste set `z: (e.z ?? 0) + dz` (`editor/behaviours.ts:36`, `domain/clipboard.ts:154`); the elevation draws by tier (`views/elevation.ts:125`, 2700 fallback), routing / Properties by mount (`domain/routing.ts:130` `outletZ`, 2600 / 300). Default heights are written in ~13 places (2600 / 2700, plenum 700 / 800); `DEFAULT_HEIGHTS` twice (`domain/floors.ts:7`, `persist/import/legacy.ts:33`). *Fix:* `outletZ(o, level)` everywhere; one `heightsOf(level)`. ✔ **P1 · S–M** **Done 2026-10-12** (Dave: the mount rule everywhere — `outletZ` / `heightsOf` in `domain/floors.ts`; the elevation's tier rule went; moves and pastes start from the mount height).
- [x] **Q6 Rotated centred / right-aligned text lands wrong in PDFs** — jsPDF shifts x for `align` before rotating (`render/pdf.ts:165`): every vertical / slanted dimension value, turned notes and rack labels print off position (R19 fixed only raster text). *Fix:* offset along the turned baseline, call with align left. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q7 Joining two runs drops the absorbed run's data and leaves references to it** — `domain/pathEdit.ts:139-146` keeps run a's role / label; b's hand cables, `serves`, tier and label are lost; links' `via`, `hostShapeId`, node `attach`, leaders and fill-section viewports still name b (`editor/dragParts.ts:91`, `editor/pathSel.ts:78`); `pieces()` (`:165`) the same. *Fix:* merge b's role data into a and re-point references in the same transaction. ✔ **P2 · M** **Done 2026-10-12** (`../phases/phase8.md`). **Dave 2026-10-12:** runs at different heights are not joined on the plan — the user joins them by hand in an elevation view (refuse with that message). **Built 2026-10-12:** `joinHeightProblem` — a plan join at different heights is refused with that message (`editor/pathSel.ts`, `editor/dragParts.ts`).
- [x] **Q8 Split on draw loses per-segment data on the new half** — `splitRunsAt` uses `insertNode` (`domain/pathEdit.ts:45`): hand cables tied to the segment (`HandCables.seg`) count on one half only; a penetration's `source.seg` may name the wrong half. *Fix:* copy per-segment `extra`, re-point the penetration. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q9 Lowering a device's port count leaves links and cords on ports that no longer exist** — `ui/DeviceProps.svelte:126` → `set()` checks placement only (outlets ask, `setPortCount`). *Fix:* list them, ask, delete in the same step. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q10 Allocation puts outlets on ports that already have a hand label or a labelled range** — `domain/allocate.ts:109/121` counts only links; a port labelled "UPLINK-1" or in a tie range can already be patched, and the outlet's label replaces it. *Fix:* skip (or report) labelled / grouped ports in `slotsOf` / `assignFrom`. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q11 A cable type used only by links can be deleted** — `domain/cableTypes.ts:11-18` doesn't count `ix.links`; then fill falls back to 7 mm copper, cores to 1, riser / BOM guess the media. *Fix:* count links. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q12 Explode is wrong in several cases (R17 part)** — `explodeInsert` (`domain/blocks.ts:183-192`) scales text by `scale × k` and the plan multiplies by k again (a datum's text drawn 20 m tall); leaves `{TAG}` texts unfilled; always uses the plan symbol (a framed elevation faceplate moves onto the plan ×100); `app/project.svelte.ts:172` uses k = 1 for viewport-tied inserts (≈ 1/N size). *Fix:* text × scale only, `fillAttrs`, `blockFace(b, faceFor(view))`, the viewport's scale for `vpId`; tests. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q13 `untie` skips lines, blocks, images and legends** — `editor/noteTool.ts:17-27`; deleting a level / viewport or retargeting a section puts tied lines and blocks metres off the paper. *Fix:* map path nodes, `insert.at` / scale, image centre / size. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q14 Copying viewport-tied boxes / circles gives the wrong size** — `mapPts` (`domain/clipboard.ts:26-44`) treats `rect.size` as a point and never scales `r`, `rx / ry`, text width or dimension offset (a 2000×1000 rect at 1:100 → 170×110). Ctrl-copy in Rotate / Mirror and paste at the cursor reach it. *Fix:* reuse the fixed `untie`. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q15 Mirror leaves outlets and inserts facing the wrong way** — `rot = 2θ − r` (`editor/behaviours.ts:113`, `domain/shapes.ts:319`); symbols point along ±y, so +180 is right (`keepFront`, as racks); the test expects the wrong value (`editor/transformTool.test.ts:112`). ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q16 Items on a section's plane vanish once the section moves** — `sameFrame` compares the frame's start (`domain/shapes.ts:400`); grips, Flip, Move, Rotate / Mirror change `a / b`, so notes, lines and framed inserts on it draw nowhere (inserts are also hidden on the plan). *Fix:* tie them to the section id, or re-frame them in the same transaction. ✔ **P2 · S–M** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q17 Deleting a room leaves runs and viewports pointing at it (R26 / R18 part)** — `deleteRoom` (`app/navActions.ts:40-50`) doesn't strip `role.serves` (a trunk serving only it then carries nobody, `domain/routing.ts:116`) nor take its viewports off; racks are counted before the question, so one added meanwhile survives. *Fix:* strip `serves`, take viewports off, count inside `go`. ✔ **P2 · S–M** **Done 2026-10-12** (`../phases/phase8.md`). **Dave 2026-10-12:** a run left serving no room (its only room deleted) serves every room — as built.
- [x] **Q18 Make block on elevation-plane shapes moves them onto the plan** — `ui/Properties.svelte:52` offers it; `domain/blocks.ts:171-176` puts the insert at (u, z) as a plan point. *Fix:* refuse, or make an elevation insert with a front. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q19 A rotated image keeps its picture unrotated** — the frame turns (`domain/shapes.ts:298`, `outlineOf`), the image prim has no rotation (`views/display.ts:20`, `views/plan.ts:150`); elevations squeeze it into the bounding box. *Fix:* `rot` on image prims (Prims, PDF, sheet), or refuse to rotate images. ✔ **P2 · S–M** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q20 Imported Sheets-tool sheets may print their legacy date forever** — `persist/import/drawings.ts:281` maps `date` into `titleBlock.fields.date`, which overrides the revision date (`views/sheet.ts:72-73`); no UI clears it. *Fix:* don't import `date` / `rev`; drop them on Journey's sheets (with Dave's OK). *likely* **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q21 A `{DATE}` field marks issued sheets "Changed since" at midnight** — `domain/fields.ts:25/38` + `frozenNow` (`app/issue.ts:36`); a back-dated issue prints today. *Fix:* freeze with the issue date; leave DATE out of the fingerprint. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q22 Renumber copies one label onto every item when the chosen number doesn't exist** — `domain/renumber.ts:55-59` (R02 → "R01", R03 → "R01"). *Fix:* leave out / refuse items without that group. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q23 Port layout still copied twice more (R30 part)** — `render/frameSheets.ts:46` `ceil(n / 24)` rows (a 72-port 1U panel writes ports 49–72 over the next U); `cordLength` (Q3). *Fix:* `portGrid` / `portAt`. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q24 DXF layer names can contain commas (R20 part)** — `render/dxf.ts:62`. *Fix:* add `,` to the class. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q25 A pasted / Ctrl-copied panel says its labels changed since printing** — `domain/clipboard.ts:167, 204-206` copy `labelsPrintedAt` / `printedLabels`. *Fix:* drop the printed state (and reservation ids) on paste. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q26 File names lose Japanese text** — `fileSafe` keeps `\w` only (`render/download.ts:12`). *Fix:* `/[^\p{L}\p{N}._-]+/gu`. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q27 The fill picture reports its 400-cable cap as "don't fit"** — `domain/fill.ts:124-127`, `views/fillSection.ts:49`. *Fix:* "first 400 drawn". ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q28 Smaller output items (likely)** — a multi-core cable across two panels is labelled with one panel's name (`domain/cableSchedule.ts:37`); the project BOM counts installed cords and cables as material (`domain/reports.ts:179, 184` — decide); patch-schedule viewports continuing from a fixed `#start` can drop a cord at the edge (`views/schedule.ts:50-60`); paste at the cursor mixes elevation (u, z) points into the plan centre (`domain/clipboard.ts:73-91`). **P3 · S each** **Dave 2026-10-12:** the project BOM leaves out cords / cables already installed (only add / replace are material). **Done 2026-10-12** (BOM leaves out installed; multi-core label and paste-at-cursor fixed; the schedule-viewport continuation is left).

### Q-B. Bugs: editing and input

- [x] **Q29 An error message stays for good and hides Saved / Saving…** — ~28 places set `project.error`, nothing clears it (`app/project.svelte.ts:58,126`); the menu bar shows it instead of the save state (`ui/CadShell.svelte:523-525`). *Fix:* errors as a dismissable toast, cleared on the next good write; save state always visible. ✔ **P1 · S** **Done 2026-10-12** (beside the save state, ✕ dismisses, a saving error clears after the next good writes).
- [x] **Q30 Enter anywhere answers the open question "yes"** — `ui/AskBox.svelte:16` listens on the window (capture) and steals focus when a question arrives (`:10`): typing in a search / cell / field and pressing Enter can confirm "Delete level 3F". *Fix:* answer only with focus in the box (or on the body); don't steal focus. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q31 Japanese IME: Enter / Esc during conversion commit or cancel the edit** — no `isComposing` / keyCode 229 check anywhere (`ui/TextEditBox.svelte:96`, `ui/tableKit.svelte.ts:149-150`, `ui/NameInput.svelte:23`, `ui/StatusBar.svelte:38`, `ui/Navigator.svelte:134`, settings add rows). *Fix:* one `composing(e)` guard in every key handler. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q32 Ctrl+X / Ctrl+V change the drawing behind an open dialog** — R32 guarded shell keys, but `oncopy / oncut / onpaste` (`ui/CadShell.svelte:384`, `app/clipboardEvents.ts:39-58`) skip only inputs. *Fix:* return while a `[role=dialog]` is open or the store is busy. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q33 Ctrl+A in the Outlets, Links or Sheets table selects the whole drawing** — only PatchList catches it (`ui/PatchList.svelte:87`); the next Delete removes every shape in the view. *Fix:* handle Ctrl+A in TableFrame / tableKit. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q34 Settings says "Undo brings it back" but Undo can't be reached there** — `ui/SettingsPanel.svelte:53,69`, `ui/FloorsPanel.svelte:80,139,169`; `shellKey` returns inside dialogs (`ui/shellKeys.ts:123`). *Fix:* let Ctrl+Z / Y through in Project settings, or an Undo link in the footer. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q35 Patch to… / P / drag-to-patch ignore the project's cord defaults** — defaults load only when the Cord tool is picked on the strip (`ui/CadShell.svelte:429-431`); `#armBulk` (`app/workspace.svelte.ts:245-249`) uses the hard-coded cat6a / blue. *Fix:* seed `ws.cordDefaults` on load. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q36 Delete messages are wrong** — an installed cord is only marked for removal but the message says "Deleted cord" (`app/selectionActions.ts:69-71`); raw type names ("Deleted shape", "Deleted link"); clearing a reservation says nothing. *Fix:* say what happened, in PropsHeader's kind words. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q37 Ctrl+K results: Enter and double-click don't work on devices / outlets** — Enter opens only tree matches (`ui/Navigator.svelte:134`); the first click clears `q` (`:49`), so double-click never fires; no ↑ / ↓; 15-hit cap silent, unplaced outlets skipped (`domain/navTree.ts:163-177`). *Fix:* Enter falls back to the first find; keep results for a double-click; ↑ / ↓; "N more". ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q38 Several plain lines get Color only (R67 part)** — every path is a 'run' (`ui/propsKit.ts:34`); `ui/RunsMultiProps.svelte:162-165`. *Fix:* LineStyle when no run has a role. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q39 Tool sizes reset each time the tool is picked** — `ws.setTool` overwrites Z / W / H (`app/workspace.svelte.ts:326-329`). *Fix:* remember per tool for the session. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q40 Smaller input bugs** — an arrow key during a mouse drag throws (busy guard misses arrows, `ui/shellKeys.ts:127-130`); clearing a run's Width / Height or node Z writes 0 (`ui/PathProps.svelte:72-77,186,188,253`), several boxes' Height clears to flat (`ui/ShapesMultiProps.svelte:90`), a viewport X / Y / size field to 0 (`ui/SheetProps.svelte:42`); a refused checkbox stays changed (`ui/fields/CheckField.svelte:18`); PropGroup fold state read once (`ui/PropGroup.svelte:92-93`); renumbering a floor commits the unapplied range (`ui/FloorsPanel.svelte:146-153`); a backwards riser range draws nothing useful (`ui/ViewStrip.svelte:43-48`); rotating a horizontal / vertical dimension changes what it measures (`domain/shapes.ts:283`); the bulk patch / link preview writes a stale plan (`editor/cordTool.ts:85,113`, *likely*); a remote delete during a drag is undone by the commit (`store/store.ts:105-109,182-186`, *likely*); TablesPanel misses `pointercancel` (`ui/TablesPanel.svelte:51-62`); Esc with tables maximised is taken from dialogs (`:82`); the patch list re-scrolls on every change (`ui/PatchList.svelte:93-106`). **P3 · S each** **Done 2026-10-13** (`../phases/phase8.md`).

### Q-C. Legacy parity

- [x] **Q41 Sheet notes ignore layers** — paper and tied notes skip `applyLayers` (`views/sheet.ts:150-157,189-194`, `ui/ViewCanvas.svelte:121`), though notes default to the Notes layer and NoteProps offers Layer / By-layer color; Pages hid them by eye and per-viewport freeze (`routes/pages/ui/vpView.svelte.ts:225-232`). ✔ **P2 · M** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q42 The title block ignores the Project details** — legacy read client, address, logos, company and the default author (`routes/sheets/parts/TitleBlock.svelte:66-82`); cad uses the name only (`views/sheet.ts:63-75`), a blank Drawn prints "—" (`initialsOf` unused), and cad's menu claims "the title block shows them" (`ui/cadMenus.ts:176`, `ui/SettingsDialog.svelte:61`); Checked / Approved one sheet at a time. *Fix:* Drawn falls back to the author / issuer; client / address auto fields; fix the text; Checked / Approved in SheetMultiProps. ✔ **P2 · S** **Dave 2026-10-12: yes** — client / address / company from Project details, blank Drawn → the author, Checked / Approved on several sheets. **Done 2026-10-12** (details → Client / Site / company, Drawn falls back to the author; logos still from the template).
- [x] **Q43 Monochrome PDFs only from File › PDF** — `ui/SheetProps.svelte:108`, `ui/SheetsTab.svelte:127` ignore `ws.monoPdf` (`app/shellActions.ts:29`); Help says every sheet PDF. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q44 Dimensions / leaders on a sheet don't snap to what a viewport shows** — paper points round to 0.5 mm (`editor/noteTool.ts:68-69`, `editor/dimTool.ts:25,32`); Pages snapped to the model (`routes/pages/ui/vpInteraction.svelte.ts:321-332`). *Fix:* snap through `fromPaper(vp)`. ✔ **P2 · M** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q45 Ctrl+K in cad also opens the app-wide palette; palette picks don't move cad** — `lib/palette/CommandPalette.svelte:101-106` ignores `defaultPrevented` (*likely*); a cad level / sheet picked there changes the URL but CadShell reads it once (`ui/CadShell.svelte:103`). *Fix:* palette skips handled Ctrl+K; hand picks to `ws.openInTab`. **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q46 No rack BOM for one room or level; a thinner workbook; maker / model ignored** — legacy BOM per floor / room / row (`routes/racks/parts/BOMPanel.svelte:18-31`) with Row BOM + Consolidated + Notice sheets (`routes/racks/parts/bomExcel.ts:74-128`) and maker-model lines (`bom.ts:107-109`); cad: whole project, one sheet, kind + size only (`domain/rackBom.ts:31,54,83`, `render/exports.ts:269-281`). ✔ **P2 · S–M** **Dave 2026-10-12:** a rack BOM for the selected rooms, on any levels (plus maker / model lines). **Done 2026-10-12** (rooms ticked by level; maker / model lines).
- [x] **Q47 Frame sheets and panel labels only one room at a time** — legacy exports the whole floor (`routes/frames/Frames.svelte:428-430`); cad only in each room's ⋯ menu (`ui/RackList.svelte:55-67`). *Fix:* File › Export "Frame label sheets / Panel labels — this level / all". ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q48 No estimated routes / fill before allocation** — legacy drops every outlet to the nearest trunk of its tier and room and sums fill (`routes/outlets/Outlets.svelte:157-362`); cad routes only links (`domain/routing.ts:240-252`). *Fix:* an "estimated" cable per unlinked outlet port to its room, dashed, counted in fill. ✔ **P2 · M** **Dave 2026-10-12: yes** — dashed estimated cables before allocation, counted in fill. **Done 2026-10-12** (`domain/estimates.ts`; dashed on Display › Routes, "N estimated" in fill). **Dave 2026-10-12, follow-up:** selecting an outlet whose room is set highlights its estimated route; estimates count in the BOM and the cable schedule (marked estimated). **Follow-up built 2026-10-12:** a selected outlet with a set room shows its estimated route dashed; estimates in the BOM and the cable schedule (dialog + Excel), marked estimated.
- [x] **Q49 Grid step can't be 600 mm (floor tiles) or 44.45 (1U)** — fixed list (`ui/StatusBar.svelte:17`); legacy had a free box. ✔ **P2 · S** **Dave 2026-10-12: yes** — a typed grid step, the usual ones offered. **Done 2026-10-12** (typed step, any positive mm).
- [x] **Q50 Smaller parity items** — VCM `frontProtrusionMm` stored but never used (`domain/types.ts:181`); the next outlet doesn't pick up edits to the last (`editor/outletTool.ts:26,53`); a second click on the armed port doesn't cancel the cord (`editor/cordTool.ts:125-126`); no Finish / Cancel chips for a path on touch; rack labels lost `name (ports)` and the turned label on narrow kit (`views/rackRow.ts:162,190-194`); the title block's Location ignores `placeId` and riser / project-wide viewports (`views/sheet.ts:65`); Make block not offered for sheet shapes (`ui/Properties.svelte:52`); dimension / leader text size and heads fixed (`views/plan.ts:208-226,421-426`); no 1:15 / 1:150 scales (`views/sheet.ts:29`); an image box doesn't keep the picture's ratio (`editor/shapeGrips.ts:96-106`); the project Titlebar links Racks / Frames / Floorplans but not CAD (`lib/ui/Titlebar.svelte:12-16`); revision cloud from two corners (only if wanted). **P3 · S each** **Done 2026-10-13** (`../phases/phase8.md`).

### Q-D. UI / UX

- [x] **Q51 Project-wide settings in the "your screen" Display menu again (R42 part)** — the riser Floors range (`ui/ViewStrip.svelte:43,133-135`) and Planning · Surveying (`ui/CordMode.svelte`) change the project for everyone without saying so. *Fix:* label "Project:" / move the range to the riser's Properties; CordMode says "for everyone". ✔ **P2 · S** **Dave 2026-10-12: yes** — the riser range moves to the riser view's Properties; CordMode says it is for everyone. **Done 2026-10-12** (in the riser view’s Properties).
- [x] **Q52 iPad: no long-press menus; resize handles and floating tables can't be dragged** — selection / tab menus need a right button (`ui/ViewCanvas.svelte:461-466`, `ui/TabStrip.svelte:44`); `ResizeHandle` 5 px without `touch-action: none` (`ui/ResizeHandle.svelte:50-64`, `ui/TablesPanel.svelte:86,118`). *Fix:* long-press = right-click; ⋮ on tabs; touch-action + 12–16 px hit areas. ✔ **P2 · M** **Dave 2026-10-12: yes, now** — long-press = right-click, ⋮ on tabs, touch-action + bigger handles. **Done 2026-10-12** (long-press = right-click, ⋮ on tabs, touch handles; not yet tried on an iPad; tabs can't be reordered by touch). **Dave 2026-10-12:** no need to move tabs by touch.
- [x] **Q53 Dark mode: fixed light colors in menus and the view strip** — `#dbeafe` hovers (`ui/MenuBar.svelte:84,91`, `ui/ContextMenu.svelte:47`), white / zinc hex in `ui/ViewStrip.svelte:148-161`, `ui/ChipPick.svelte:25`, Help's featured card. *Fix:* `--cad-*` tokens. ✔ **P2 · S** **Done 2026-10-12** (`../phases/phase8.md`).
- [x] **Q54 Help no longer matches the UI** — the layer message is a toast now and the chip says "by kind" (`ui/helpContent.ts:87`); "names are never typed in the status bar" vs the Rack tool's room name / Leader text (`:26`, `editor/rackTool.ts:37`, `editor/noteTool.ts:137`); the Sheets empty state assumes a left Navigator (`ui/SheetsTab.svelte:268`). ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q55 Smaller UI items** — the Window menu ticks Blocks / Device library while hidden for the view (`ui/cadMenus.ts:185`, R50 part); Help › a tool that doesn't work in the view silently does nothing (`ui/CadShell.svelte:279`); the "Drawn on … layer" toast fires on every draw though the chip shows the layer (`ui/CadShell.svelte:194-198`, R53 part); the view strip still clips in a split pane at 1366 px (`ui/ViewStrip.svelte:147`, R43 part, *likely*); labels still differ from the glossary ("Sheet register", "Fill overlay", "Floor manager", the raw tool id in "The insert tool doesn't work…"; R59 part); Archive and Outlet schedule export finish silently (`ui/Navigator.svelte:105-108`, `ui/Exports.svelte:26-28`); RoomProps has a second Delete in its body (`ui/RoomProps.svelte:115`, R66); Esc / arrows don't work in the Display popover, ContextMenu and MenuBar (no focus on open); the tool options row has no units (`ui/ToolOptions.svelte:47-49`, R68); Patch list "Purge removed" no longer asks though its tooltip says it does, and the selection bar can jump (`ui/PatchList.svelte:75`, R71); single / multi Properties gaps (insert Rotation / Scale / Explode, sheet Display / Margin, arc header icon and radius / angle fields; R67); rack Properties shows two "Height" rows, U and mm (seen live); outlet Usage chips start a line above their label (seen live). **P3 · S each** **Done 2026-10-13** (`../phases/phase8.md`).

### Q-E. Performance

- [x] **Q56 Routing still ~0.75 s per edit on a big project (R40 part)** — `routeLinks` re-runs after each commit while any reader is shown (Outlets / Links tables, Port Properties, sheet panes, riser); `buildGraph` 470 ms (`nodeAt` O(N²), tee cuts O(S·N), `domain/routing.ts:73-95`), `outletTap` scans every segment (`:136`); `fills` not held during drags. *Fix:* grid hash, segments by level, cached taps; later re-route changed levels only. ✔ **P2 · M** **Done 2026-10-12** (grids for nodes / tees / taps: 4,260 segments routeAll 2.6 s → 92 ms; fills held in drags).
- [x] **Q57 The port map takes ~1 s per edit** — `traceCircuit` per port rebuilds the link + cord graph (`domain/portMap.ts:46`, `domain/cords.ts:293-298`); 288 ports / 6,624 links / 2,000 cords = 1,023 ms. *Fix:* build the adjacency once per call. ✔ **P2 · S** **Done 2026-10-12** (842 ms → 6 ms).
- [x] **Q58 `naturalCompare` builds a collator per call** — `domain/labels.ts:135`, used in 71 places: 6,600 strings sort in 250 ms vs 9–18 ms; `linkRows` 120 ms on every rev, before the view filter (`ui/LinksTable.svelte:28-37`). *Fix:* one cached `Intl.Collator` (one line). ✔ **P2 · S** **Done 2026-10-12** (210 ms → 9 ms).
- [x] **Q59 Side panels rebuild on every drag frame** — `rev++` per gesture frame (`app/project.svelte.ts:98`) reruns Navigator, layer counts, tables, `floorplanPending`; 35 places spread `byId.values()` to filter by type. *Fix:* a `dataRev` for final changes only; typed lists on `ProjectIndex`. ✔ **P2 · M** **Done 2026-10-12** (dataRev / dataIndex for final changes; ProjectIndex.ofType).

### Q-F. Code health and tests

- [x] **Q60 No Firestore listener has an error handler** — `persist/firestore.ts:22`, `app/project.svelte.ts:95-97`, `app/restoreNotice.svelte.ts:44`, `app/projectFiles.ts:25`, `app/pdf.svelte.ts:101`, `ui/BackupsDialog.svelte:22`: a permission error stops a listener for good (blank drawing, or editing through someone's restore). *Fix:* an error callback that sets the error and clears loading. ✔ **P2 · S** **Done 2026-10-12** (every listener has an error callback; "Lost the live connection to …").
- [x] **Q61 Issuing prints sheets as they were when the Issue panel opened (R23 part)** — `ui/SheetsTab.svelte:167-175` → `app/issue.ts:114-128`; a revision code can be reused and another issue's frozen copy overwritten (`:56`); the preview re-runs per keystroke without a run token (`ui/IssuePanel.svelte:37-42`). *Fix:* re-read sheets at the start; a run counter. ✔ **P2 · M** **Done 2026-10-12** (fresh sheets at issue time, a revision frozen once, run token).
- [x] **Q62 Untested risky code** — backups / restore (`app/backups.ts`, 13 exports, none tested); sync moves and pending writes (the memory backend never sends "removed" to the old scope, so R89's guard and `persist/sync.ts:89` are unexercised); clipboard copy / cut / paste of cad items and the Ctrl+Shift+V window; patch schedule export ↔ cord-ID import round trip; the restore notice and timer paths (no fake timers anywhere); PDF clip save / restore balance (`render/pdf.ts:118-127,193`). **P2 · S each** **Done 2026-10-12** (backups, clipboard, patch round trip, PDF clips, sync moves, restore timers).
- [x] **Q63 Slow tests: imports inside test bodies** — 6 of the 7 slowest (270–344 ms): `overlap.test.ts:27`, `style.test.ts:37-38`, `exports.test.ts:81/96`, `drawing.test.ts:157`, `transmittalPage.test.ts:36`, `editor.test.ts:96-135`. *Fix:* top-level imports, exceljs in `beforeAll`. ✔ **P2 · S** **Done 2026-10-12** (imports at the top of the test files).
- [x] **Q64 Duplicated rules that drift** — two class → style tables (`ui/Prims.svelte` 136 classes, `render/pdf.ts` 100; `riser-break`, `room-line`, `run-label`, `device-pdu`, `fill-cable` differ or are missing); the cable-type lookup written six times with different fibre / Ø rules (`ui/CordProps:24`, `PatchList:110`, `PatchScheduleDialog:30`, `CordLabelsDialog:10`, `views/schedule.ts:36`, `views/riser.ts:41`, `domain/fill.ts:18`); `put` / `num` copies in 8 files (R86 part). *Fix:* one style table with a test; one `cableTypeOf`; propsKit everywhere. **P3 · S–M** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q65 Firestore data enters the store unchecked** — `persist/docs.ts:53` casts; `scopeOf` saves `sheet:undefined` for an ownerless shape (`:24`), which never loads again. *Fix:* `fromDoc` drops bad docs with a warning; `scopeOf` throws. ✔ **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q66 Layering, cycles and dead code** — `domain/fields.ts:11` / `domain/issue.ts:5` take `Prim` from `views/`; `views/portTip.ts:7`, `views/riser.ts:22` import `editor/pick`; `app/projectFiles.ts:8` imports from `routes/api/uploadthing`; cycles `domain/fields ↔ domain/blocks`, `views/plan → elevation → section → plan`, `import/legacy ↔ legacyOutlets`; test-only exports (`firstFreeU`, `fillByRun`, `riserRuns`, `frameLooking` / `frameRot` / `rackFrontFrame`, `makeBox / makeText / makeWall`), `dev/dryRun.ts listProjects`; a stale `ui/DockColumn.svelte` comment (`app/windows.svelte.ts:6`); `IMPORTED_AT` set at module load (`persist/import/legacyCabling.ts:13`); the as-issued floorplan cache leaks object URLs and never retries (`app/pdf.svelte.ts:272-292`, R39 part). **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).

### Q-G. Left over from the Review 2 fixes (2026-10-12)

- [x] **Q67 A patch-schedule viewport continued from a fixed "From cord" number drops or repeats a cord** when the viewport before it grows or shrinks (`views/schedule.ts`). *Fix:* "continue from viewport …" (a link to the previous viewport) instead of a number. **P3 · S–M** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q68 Title block logos only from the template** — Project details have no logo, or the details' logo isn't used (Q42 part). *Fix:* the company logo from the Project details when the template has none. **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q69 A section mirrored together with its notes can lose them from the view** — `mirrorEntity` builds the note's frame from the mirrored `a`, the section's new origin is the mirrored `b` (Q16 part). **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q70 Splitting a run leaves wall openings on the first half** — `insertNode` (`domain/pathEdit.ts`) keeps openings on the old segment; they should go to the half they sit on. **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q71 DXF export skips images** (`render/dxf.ts`). *Fix:* IMAGE entities (or a frame + name where the format can't carry it). **P3 · S–M** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q72 Whole-level label exports only in File › Export** — the Racks window's ⋯ still exports one room (Q47 part). *Fix:* "this level / all" in the Racks window too. **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).

### Q-H. Decisions on the Q50 / Q55 leftovers (Dave 2026-10-13)

- [x] **Q73 Faceplates show only on the view they were drawn on** — revert the 2026-10-13 change that ticks "show in elevations" when a block with a front drawing is placed on a plan; the 2026-10-10 rule stands (a block placed on a plan shows only on the plan, one placed in an elevation only there). **P2 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q74 Make block from shapes on a sheet** — blocks made from sheet shapes are usable anywhere (most often in viewports and models, not on paper). **P3 · S–M** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q75 An image box always keeps the picture's proportions** (every resize). **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q76 Finish / Cancel for a path on touch** — chips while drawing a run / line on a touch screen, and a double-tap finishes. **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- [x] **Q77 Purge removed asks before purging** (Patch list). **P3 · S** **Done 2026-10-13** (`../phases/phase8.md`).
- Not needed (Dave): VCM front depth (`frontProtrusionMm` is an offset the legacy Racks floorplan used, not needed in cad); settable dimension / leader text size and heads; a revision cloud from two corners. Rack labels (Dave): no port count after the name; kit 150 mm wide or less gets its name turned up its middle — built 2026-10-13 (`views/rackRow.ts` `NARROW_MM`).
