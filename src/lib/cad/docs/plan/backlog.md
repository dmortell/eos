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

**Remaining:** 40 entries (0 P1 · 0 P2 · 40 P3; 1 ⚡ quick win). **Batch 5 (Dave 2026-10-10):** layer line type ✓, Match properties ✓, viewport nudge / snap / fit scale ✓, copy one segment ✓, Find/replace into Renumber ✓, blocks drag to place ✓ — Batch 5 done. Port map for VLANs built 2026-10-11 (`port-map-plan.md`). **Low priority waits (Dave 2026-10-07): the P3 items are not looked at until the P1 / P2 ones are done.**

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
   - import of Pages sheets (7.2) and Sheets-tool sheets (7.3);
   - command line + drafting commands.

## Bugs and data safety

**Done** (fixed in commit d033eeb4, 2026-10-02): G001, G002, G003, G004, G092, G101, G318


## Outlets, labels and numbering

Note: the outlet fields now live in `ui/OutletProps.svelte` (moved in phase8 Batch 2).

- [ ] **Zones and server rooms when placing outlets** — check result: the Outlet tool copies zone and server room from the last outlet, but nothing can set a zone (only the import does), and a first outlet on a level has no server room. Add a Zone select (the level's zone spaces) to outlet Properties and to the next-outlet defaults. **P3 · S** (~30 lines; Dave 2026-10-04: low priority). *cad today:* `zoneId` carried over in `cad/editor/tools.ts:371`, server room per port at `:374`; no zone field in the UI. *From:* T057
- [ ] **Usage colours and outlet tips** — outlets on the plan and panel port cells tinted by usage colour; an instant tip (no delay) on an outlet showing its full label and usage. **P3 · M** (Dave 2026-10-05: low priority) (~80 lines). *cad today:* the port count is drawn inside the outlet symbol (2026-10-06) and port tips come with "Port hover tips"; usage colours exist in settings but nothing draws them. *From:* G016, G038, G062, G137, T024

## Levels, plans and underlays

- [ ] ❓ **Embed Uploads in cad?** — the link is built (File › Uploads… opens it in a new tab, 2026-10-07). Still to decide: embed the Uploads tool (floorplan PDFs: upload, origin, scale, crop, masks, layers) in a cad window / dialog. **P3 · L** (Dave 2026-10-07: "consider"; Uploads is its own route with its own PDF viewer state). *From:* Dave 2026-10-07
- [ ] **Floor manager: server rooms, tenant areas, level numbers** — in the Floor manager, add / rename / delete each level's server rooms and tenant areas, and edit a level's number. **P3 · M** (Dave 2026-10-05: low priority) (~120 lines). *cad today:* the Floor manager (`cad/ui/FloorManager.svelte`, phase8 Batch 3) sets the range, gaps, names and heights; server rooms come only from the import or a rack's Properties. *From:* G030, G100, G125 (the range part is built)

## Racks, devices and rack views

- [ ] ❓ **Devices list per rack** — a sidebar list for the selected rack: front, then "Rear mount", each "U12: name · type"; click / Ctrl / Shift to select, Delete to remove. **P3 · M** (Dave 2026-10-05: low priority) (~100 lines, new component). *cad today:* missing. *From:* G087, G109, T040
- [ ] **Drag racks to reorder in the Racks window** — *(Dave 2026-10-12)* drag a rack up / down its row in Window › Racks to set the rack view's order, instead of the ▲ / ▼ buttons (which go). **P3 · S** (~50 lines; DragReorder as the Layers panel uses it, writing `Space.rackOrder` like `nudgeRack`). *cad today:* ▲ / ▼ on hover and ↺ plan order (`cad/ui/RackList.svelte`). *From:* Dave 2026-10-12
- [ ] **Drag racks from the list onto the plan** — drag one or several unplaced racks onto the plan; several land spaced in a line. **P3 · M** (Dave 2026-10-05: low priority) (~100 lines). *cad today:* "Place", then one click per rack (`cad/ui/RackList.svelte:61`). *From:* G050
- [ ] **Catalogue tab** — browse the Panduit catalogue (kind, maker, colour, RU, fits the row), add a rack from it, add / delete custom products. **P3 · L** (~300 lines). *cad today:* missing; the rack BOM reads the built-in Panduit seed only. Decide "Catalogue vs library" (below) first. *From:* G089

## Ports, panels and allocation


## Patching and cords


## Containment, routing, risers and fill

- [ ] ⚡ **Show all routes** — *(Dave 2026-10-07: low priority — after the P1 / P2 items)* a "Routes" toggle on the plan (like Fill) draws every outlet's route, coloured by server room. **P3 · S** (Dave 2026-10-05: low priority) (~40 lines). *cad today:* real routes over the containment, drawn only for the selection (`cad/ui/ViewCanvas.svelte:125`). *From:* G049
- [ ] **Riser view control** — From / To floor; EPS rooms; HIGH / LOW tags; extend a riser to more floors (edit its far-end level). Dave: one riser view for now (no per-viewport floor choice). **P3 · M** (Dave 2026-10-05: low priority) (~150 lines). *cad today:* "Hide empty floors" is built (phase8 Batch 1): floors with no server room, and floors with no level, squeeze into break bands (`cad/views/riser.ts`, a riser-view toggle and a sheet viewport choice); node far-end levels are set only when drawing (`cad/editor/pathTool.ts:55`). *From:* G021, G145, G146, G194, G195, G277, G315, T073, T076
- [ ] **Cable label and colour (riser view)** — an optional label and colour per backbone cable group (defaults: fibre amber, copper blue). **P3 · S** (~40 lines). *cad today:* groups are labelled "count × type · length" in one style (`cad/views/riser.ts:7`). *From:* G147
- [ ] **High / low cables in the riser view** — each hop drawn at ceiling-plenum or floor-void height. **P3 · M** (~80 lines). *cad today:* the plans use real run heights, but the riser view draws groups at one fixed height. *From:* G149

## Selection and editing

- [ ] **Shift constraints: junctions** — what's left: dragging a junction node with Shift keeps ALL its segments on 15° (today it turns about the node at the other end of its first segment). **P3 · M** (~60 lines). *cad today:* Shift = 15° steps drawing runs and dragging nodes / branches, H / V moving things and segments, square / circle / 15° in the Shape tool (2026-10-05, `cad/editor/constrain.ts`). *From:* G188, G197, G251, T004, G169, G228, P037
- [ ] **Paste at the cursor** — Ctrl+Shift+V centres the paste on the cursor. Build after the clipboard. **P3 · S** (~15 lines after that). *cad today:* missing. *From:* G232
- [ ] **Join runs on draw** — A run drawn from another run's node is stored as joined and follows it. "Joined nodes move together" and "Split and join runs" may cover this; check after them. **P3 · M** (~80 lines). *cad today:* routing joins runs whose nodes touch, without storing a join (`cad/domain/routing.ts:2`). *From:* G271
- [ ] **Text to and from office apps** — Copied items go out as readable text; text pasted from Word / Excel becomes a note. **P3 · M** (~80 lines). *cad today:* missing. *From:* G234

## Drafting commands and input

- [ ] **More snaps** — Intersection, perpendicular and nearest. **P3 · M** (Dave 2026-10-06: low priority) (~100 lines). *cad today:* node / midpoint / outlet / rack centre / grid only (`cad/editor/snap.ts`). *From:* P002
- [ ] **Floor-tile grid** — A box draws a tile grid of N mm, with X / Y offset to line up with the real floor. **P3 · S** (~60 lines). *cad today:* missing. *From:* G162, G264
- [ ] **Arc** — Arc through three points; snapped, gripped, moved like any shape. **P3 · M** (~80 lines). *cad today:* arc geometry exists but is not drawn (`cad/views/plan.ts:95` falls to `default`). *From:* G241
- [ ] **TRIM** — Click part of a line to cut it back to the shapes that cross it. **P3 · M** (~100 lines). *cad today:* missing. *From:* G245
- [ ] **EXTEND** — Grow a line end to the next shape. **P3 · M** (~80 lines, shares the crossing code with TRIM). *cad today:* missing. *From:* G246
- [ ] **Align / distribute** — Left / centre / right / top / middle / bottom, equal gaps. **P3 · M** (~80 lines). *cad today:* missing. *From:* G248
- [ ] **Dimension text and grips** — Text override (`<>`), text offset grip, extension-line grip, units mm / cm / m. Build after Dimension. **P3 · M** (~100 lines). *cad today:* missing. *From:* G259
- [ ] ❓ **Markdown notes block** — A note with headings, bullet / numbered lists, tables and bold / italic, wrapped in a box; paste from Word / Excel. Answer to "how much code?": about 250 lines (layout into text lines, plus PDF / DXF output), on top of "Text that fills a box". **P3 · L** (~250 lines). *cad today:* `markdown` flag in the data, unused (`cad/domain/shapes.ts:73`). *From:* G184, G328, T143

## Layers, styles, blocks and symbols

- [ ] **Layer presets, groups, multi-select** — the parts of the Layers panel left out of the first build (`docs/plan/layers.md`): saved sets of shown layers, group headings with a group eye, Ctrl / Shift-click several rows. **P3 · M** (~120 lines). *cad today:* `ui/LayersPanel.svelte` has eye / lock / freeze / colour / order per layer, one row at a time. *From:* G174, G177, P051
- [ ] ❓ **Shape style** — what's left: project drawing defaults for new shapes (color, line type, lineweight); DXF lineweights (the writer has no field) and a DXF hatch for fills. **P3 · S** (Dave 2026-10-06: low priority) (~60 lines). *cad today:* a shape's own color, fill, line type (solid / dashed / dotted / dash-dot) and lineweight (mm) in Properties (one or several, and plain lines), on screen, printed as set in PDF, line types in DXF (2026-10-05, `cad/ui/LineStyle.svelte`, `ownStyle` in `cad/views/plan.ts`). *From:* G011, G164, G283, T093
- [ ] ❓ **Linked symbols (URL / sheet link)** — an insert can link to a sheet or a web page; a badge shows on hover, double-click opens it. Store the link on the insert (each marker has its own target), not the block. **P3 · M** (Dave 2026-10-10: low priority) (~80 lines). *cad today:* missing. *From:* G257, T149
- [ ] **Image opacity, crop, greyscale** — Properties for an underlay / image: opacity slider (for tracing), crop, greyscale (so coloured markup stands out). **P3 · M** (Dave 2026-10-05: low priority) (~80 lines). *cad today:* `Underlay.opacity` and `crop` fields exist and opacity is drawn (default 0.6), but there is no UI (`cad/domain/types.ts:79`, `cad/views/plan.ts:34`). *From:* G288
- [ ] **Blocks: front drawings** — what's left of the Blocks panel: a block's own FRONT drawing for elevations (today the plan symbol is drawn there, facing you). Drag to place was built 2026-10-10 (`../phases/phase8.md`). **P3 · M**. *cad today:* Blocks panel + Insert tool in plan / elevation / section, inserts have a height (2026-10-04, `cad/ui/BlockManager.svelte`, `cad/editor/insertTool.ts`). *From:* G284, P004

## Sheets and viewports

- [ ] **Import Pages sheets (7.2)** — Pages sheets become cad sheets (frames → viewports by direction / scale / level, clip), `revLog` → revisions, the Pages title block → settings, global Pages blocks → cad blocks. **P3 · L** (Dave 2026-10-05: low priority; ~500 lines + tests). *cad today:* not imported; the importer is in `cad/persist/import/` (outlets, cabling, templates only). Journey's 8 Pages sheets are the check. *From:* P040
- [ ] **Import Sheets-tool sheets (7.3)** — viewports from outlets → plan, racks → rack row, risers → riser view, text → paper text, model3d → plan / section, fillrate → a note; title, number, paper, revisions (no history into Issues, per Dave). **P3 · L** (Dave 2026-10-05: low priority; ~400 lines + tests). *cad today:* not imported. Journey's 19 sheets are the check. *From:* P041
- [ ] **Viewport handling** — work with viewports like other shapes. Parts: (1) select several (Ctrl-click, marquee on empty paper; Delete removes them all); (2) copy / cut / paste / duplicate (Ctrl+C / X / V / D) with views and notes, across sheets and projects; (3) Ctrl-drag leaves a copy; (4)–(6) built 2026-10-10 (nudge, edge snap, Fit picks the scale — `../phases/phase8.md`); (7) scale and align the content with touch (the mouse is done: Alt-drag pans, Alt+wheel steps the scale); (8) viewport numbers, a viewport list and "open source view". **P3 · L** (Dave 2026-10-06: low priority) (~330 lines left). *cad today:* one viewport at a time (`cad/editor/tools.ts:142`, `cad/app/workspace.svelte.ts:116`), moves snap to 0.5 mm (`cad/editor/tools.ts:270`), Fit only re-centres (`cad/ui/SheetProps.svelte:101`), Alt-drag pans the content. *From:* G022, G152, G153, G154, G207, G215, G307, G308, G310, T086
- [ ] **Fill-rate drawing as a viewport from a trunk** — in a run's Properties → Fill, "Put on sheet…" makes a viewport of that segment's fill section (the packed-cables picture, with its % and cable list) on a chosen sheet. **P3 · S** (Dave 2026-10-05: low priority; ~60 lines, after "More viewport types" adds the fill-section view). *cad today:* Properties → Fill draws the section of the picked / fullest segment (`cad/ui/RunFill.svelte`); no viewport kind for it. *From:* Dave 2026-10-05
- [ ] **More viewport types** — put on a sheet: a single frame's / rack's port grid, the riser view for a floor range, a patch schedule, fill sections, a survey photo and an image. **P3 · L** (Dave 2026-10-06: low priority) (~330 lines). *cad today:* the picker offers plan, 4 elevations, whole rooms' racks, one row of a room's racks, sections and the full riser (`cad/ui/SheetProps.svelte`). *From:* G023, G210, G211

## Revisions, issue and backups


## Print and export

- [ ] **DXF for every view and sheet** — export the active pane as DXF whatever it is (plan, elevation, wall / room elevation, section, rack row, riser), and a sheet as DXF (paper space, viewports clipped). Dave wants wall / room elevations; rack elevations and risers come free from the same display list. **P3 · M** (Dave 2026-10-06: low priority) (~120 lines). *cad today:* "This plan (DXF)" only (`cad/ui/CadShell.svelte:150`, `cad/render/dxf.ts:30`). *From:* T107, T120

## Shell, navigation and touch

- [ ] **Project Properties** — edit the project's name, codes, client, address and description in Properties (needed by the title block's Site section). **P3 · M** (Dave 2026-10-05: low priority) (~80 lines). *cad today:* missing; cad only reads the name from `projects/{pid}` (`routes/projects/[pid]/cad/+page.svelte`). Where it lives is the open question "Where should the project details editor go?" below. *From:* G301
- [ ] **Floor view presets** — quick buttons on a plan: Outlets (low), Outlets (high), Trunks, Fill rate. **P3 · M** (~80 lines). *cad today:* a Fill toggle only (`cad/ui/ViewCanvas.svelte`); presets were never wired in legacy either. *From:* G057
- [ ] ❓ **ACAD / EOS input mode** — a status-bar toggle: ACAD = wheel zooms, draw with two clicks (today's way); EOS = wheel pans, press-drag draws. Dave asked "consider" first, so agree the two modes before building. **P3 · M** (~100 lines; press-drag drawing touches every draw tool). *cad today:* wheel always zooms (`cad/ui/ViewCanvas.svelte:306`), tools take clicks. *From:* G221, T110

## 3D, elevations and sections

- [ ] **Section top / bottom and hatching** — sections get top / bottom limits, and cut walls and slabs draw hatched. **P3 · M** (Dave 2026-10-05: low priority) (~150 lines). *cad today:* depth and flip work; cut walls are plain solid (`cad/views/section.ts:40`). *From:* P036
- [ ] **Connection points on boxes** — centre + edge midpoints by default, or your own (U / V), shown as × marks, for routing to desks. **P3 · M** (Dave 2026-10-05: low priority) (~150 lines, after the Box tool). *cad today:* missing. *From:* G272
