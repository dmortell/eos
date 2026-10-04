# Gap analysis: legacy tools → cad

**Status:** frozen 2026-10-03, with Dave's ticks (329 of 859 rows). Every ticked row has been merged into `../plan/`
(backlog, decisions or later); `plan-sources.md` maps the plan's G ids to rows here.

**What this is:** every legacy tool, and every viewport type of the Sheets tool, Drawings and Pages, compared feature by
feature with cad as of commit 930b8843. Eight read-only passes (one per tool group), merged here.

**How to use it:**
- Tick `[x]` what you want in cad. Leave it blank for "no". Add "(later)" after the name for "yes, not now".
- The same gap often shows up under several tools (e.g. "no layers UI" under Sheets, Pages and Edit 3D). §2 lists these
  shared themes once: ticking a theme there means "yes" to all its rows below, so you can skip them.
- Each row says what the legacy tool does, then *cad:*
  - **missing:** cad has nothing for it;
  - **partial:** cad has some of it, and the row says what's lacking;
  - **different:** cad meets the need another way, and the row says how (tick it only if you still want the old way).
- Each section ends with a collapsed **Covered in cad** list: items checked and found in cad, for reference only.
- Paths: legacy paths are relative to `src/routes/projects/[pid]/` (or `lib/…` = `src/lib/…`); `cad/…` = `src/lib/cad/…`.
- Imported data is not the same as a feature: cad may hold a field from the import with no way to see or edit it.
  Those rows say so.

## 1. Bugs and data risks found on the way (fix whatever you tick here; no feature decision needed)

- [x] **Delete on a selected viewport deletes the whole sheet.** Clicking a viewport selects its sheet plus the
  viewport (`cad/editor/tools.ts:156`); Delete then deletes the selection, i.e. the sheet (`cad/ui/CadShell.svelte:219`).
  Undo brings it back. Expected: delete only the viewport. **Fixed 2026-10-02:** Delete removes just the viewport; its
  tied notes go back on the paper (same as the Delete viewport button).
- [x] **A deleted sheet leaves its paper notes behind.** `deleteEntities` cascades links / cords / devices but not the
  shapes owned by the sheet (`cad/editor/commands.ts:39`), so the notes stay in the store, belonging to no sheet. **Fixed 2026-10-02:** a sheet's notes (and a view's own
  shapes) go with it, in the same undo step.
- [x] **Delete after clicking a port deletes the whole device** (with its links and cords). Clicking a port also selects
  its device (`cad/editor/tools.ts:186`). In Elevations, Delete on a port only cleared its reservation. Undo brings it
  back. **Fixed 2026-10-02:** Delete on selected ports clears their reservation, as in Elevations; with none, it says so
  and the device stays (click the device body to delete it).
- [x] **Delete on a rack deletes its devices, links and cords.** In legacy Outlets, Delete only took the rack off the
  plan. Undoable, but easy to do by mistake: consider asking first, as deleting a level does. **Fixed 2026-10-02:** Delete on racks that hold devices asks first
  ("Delete a rack with N devices and their links and cords?"); empty racks still go at once.
- [ ] **Port holds are not imported.** Elevations' holds (Alt+click reserves a port for VLAN / uplink) have no cad field
  and no importer, so that data would be lost when the legacy tools go. See Elevations below.
- [ ] **Imported cords show raw cable-type ids** ("uutp" etc.), because cad has no cable-type list. See Patching below.
- [x] **Single-letter tool keys** in cad (`cad/ui/CadShell.svelte:97`) go against ADR 0005 (command names, no single
  keys). Decide which one stands.

## 2. Shared themes (one tick covers the matching rows in every section)

**Shell and navigation**
- [x] **Help dialog** (how-to, shortcuts, F-keys): cad has none. *Workspace, Pages.*
- [ ] **Tabs, Ctrl+K quick switch, named views, History panel (jump to an undo step), URL restore.** *Workspace, Pages.*
- [x] **Touch:** two-finger pan / pinch zoom. *Outlets, Racks, Sheets, Pages.*
- [x] **Version history and change log:** save a named snapshot with notes, restore, delete, issue from it
  (VersionPanel); per-tool change logs. *Outlets, Racks, Frames, Elevations, Drawings, Packages.*

**Drafting and editing**
- [ ] **Command line with named commands, prompts with options, Enter / Space repeat.** *Pages.*
- [ ] **Drafting commands:** COPY, MIRROR, ARRAY, OFFSET, TRIM, EXTEND, STRETCH, MATCHPROP, ALIGN; RECT, CIRCLE, ARC,
  DIM. (ADR 0005 lists most as "in".) *Pages, Sheets.*
- [x] **Clipboard and selection:** copy / cut / paste / duplicate (also between sheets and projects), Ctrl-drag copy,
  select all, arrow nudge, multi-select, right-click menu(later). *Outlets, Elevations, Sheets, Drawings, Pages.*
- [ ] **Groups and draw order** (the `Group` record and `Shape.order` exist but nothing uses them). *Sheets, Pages.*
- [x] **Layers UI:** layers panel, current layer, show / lock, presets; per-viewport freeze / lock and viewport-only
  layers. (`Layer` exists in the domain, unused.) *Sheets, Drawings, Edit 3D, Pages ×2.*
- [x] **Shape style:** colour, fill, line type, lineweight per shape; project drawing defaults. (`Shape.style` exists,
  not drawn or edited.) *Sheets, Pages.*
- [x] **Markup kinds on paper and plan:** dimensions, rectangle, ellipse, arrows, symbols (north arrow, datum, detail
  bubble, elevation tag, photo marker), images. cad has text, leader, cloud on sheets only. *Sheets, Drawings, Pages.*

**Labels and numbering**
- [x] **Renumber by clicking / auto-number / next label** (`cad/domain/labels.ts` has the logic, no UI). Dave marked this
  high priority. *Outlets, Pages, Sheets.*
- [ ] **Generated port labels `FF.Z.NNN-SPP(-H)`** that follow server-room / high-level changes, with label settings
  (separator, zone / room, floor format) and templates / presets. cad stores plain text. *Frames, Elevations.*
- [x] **Edit a label in place** (double-click / F2) and Tab to the next label. *Pages, Outlets.*

**Cabling data**
- [ ] **Cable types:** an editor for types and diameters, the built-in list (U/UTP, S/FTP, OM3, DAC …), default type
  and colour. *Patching, Elevations.*
- [x] **Cord workflow:** re-route a cord end (F/T badges; `repatch()` exists, no UI), new cords as "installed", patch
  list sort / bulk Installed–Add–Restore / purge removed / per-room Excel. *Patching, Elevations.*
- [x] **Usage colours, port counts and hover tooltips** on outlets and ports. *Outlets, Frames, Elevations, Patching.*
- [x] **Usage list editable** (RS, FR, WC, LK, custom), not the fixed desk / AP / PR / TV / N/A. *Frames, Outlets.*

**Levels and floorplans**
- [x] **Add / edit levels and level heights; pick the floorplan file + page per level;** warn when a page has no
  calibration; use the crop set in Uploads. Today a level only gets these from the legacy import. *Outlets, Racks,
  Elevations.*
- [x] **New server room from the plan** (the Rack tool refuses on a level with no server room). *Outlets.*

**Views**
- [x] **Rack elevation context:** floor / ceiling / wall lines, the other face faded (not hidden), F to flip faces,
  view toggles. *Racks, Elevations, Sheets.*
- [x] **Riser view control:** floor range, hidden floors / breaks, EPS rooms, HIGH / LOW tags, more than one riser
  view, extend a riser to more floors. *Risers, Sheets.*
- [ ] **Fill:** type a section and its cables by hand (FR-001 …), edit inside size / wall, fill sections on sheets and
  in the PDF. *Fill rate, Sheets, Drawings.*
- [ ] **Boxes / prisms (furniture, equipment), 3D / iso view, ViewCube, elevation markers, section Z band.** *Pages,
  Edit 3D, Sheets.*

**Sheets and issue**
- [x] **Viewport handling:** multi-select, duplicate (Ctrl+D), nudge, wheel-to-scale, fit-to-content scale, edge snap
  to margin / title block / 5 mm, viewport numbers, viewport list, "open source". *Sheets, Drawings, Pages.*
- [x] **Viewport types cad can't place on a sheet:** patch schedule, fill sections, photo survey, image, a frame's port
  grid; a picker for one rack row and for the riser floor range. *Sheets, Drawings.*
- [x] **Organising sheets:** file under places, reorder, tree views, smart folders, tags, bulk edit, category,
  duplicate sheet, copy a sheet to another project. *Pages, Sheets.*
- [x] **Revisions and packages:** typed packages (Concept / RFP / Shop …) with codes `TYPE-001`, publish-update that
  supersedes, draft / published / superseded status, any revision code per issue (P1, C09 …), edit / delete / make
  current a revision, model versions, hand-ordered packages. cad has "First rev" per package and auto-numbered
  revisions. *Packages, Drawings, Sheets, Pages.*
- [ ] **Title block:** move it, Checked / Approved fields. *Drawings, Pages.*
- [ ] **DXF beyond the plan:** elevations, sections, sheets; blocks as BLOCK / INSERT, real DIMENSIONs, images. *Pages,
  Sheets.*

**Still to import (Phase 7, already planned):** Pages sheets (7.2), Sheets-tool sheets (7.3), Pages models (7.4).

## 3. Counts (rows to tick, before removing overlaps)

| Section | Missing | Partial | Different | Covered |
|---|---|---|---|---|
| Outlets + Workspace | 49 | 28 | 15 | 35 |
| Elevations | 48 | 34 | 10 | 48 |
| Racks + Frames | 33 | 31 | 14 | 31 |
| Patching + Risers + Fill rate | 24 | 28 | 17 | 31 |
| Sheets tool (+ 7 viewport types) | 62 | 37 | 33 | 58 |
| Drawings + Packages + Edit 3D | 38 | 24 | 23 | 43 |
| Pages: workspace, drafting, model | 114 | 42 | 14 | 69 (+20 dropped) |
| Pages: sheets, frames, issue | 57 | 33 | 13 | 62 (+2 dropped) |
| **Total** | **425** | **257** | **139** | **377** |

The Pages drafting list is the longest because cad has deliberately few drawing commands so far, not because Pages
data would be lost.

---

## Outlets (`routes/projects/[pid]/outlets/`)

### Floorplan file and floors
- [x] **Pick floorplan file and page** — the Plan tab picks any project PDF and its page for this floor; uncalibrated pages are disabled. *cad:* missing — a level only gets a floorplan through the legacy import; there is no picker. `outlets/Outlets.svelte:1925`
- [ ] **"Not calibrated" warning + link to Uploads** — a page without origin / scale shows an amber note and a link to Uploads (also a "Files" link). *cad:* missing — `pdf.problems` is recorded but never shown (`cad/app/pdf.svelte.ts:57`). `outlets/Outlets.svelte:1944`
- [x] **Floorplan crop** — the PDF is clipped to the crop set in Uploads. *cad:* missing — the whole page is drawn, crop is ignored (`cad/app/pdf.svelte.ts:52`). `outlets/parts/OutletCanvas.svelte:1711`
- [x] **Live recalibration** — the files list is a live subscription, so a new origin / scale in Uploads shows at once. *cad:* partial: the file is read once per session (`getDoc`), a reload is needed (`cad/app/pdf.svelte.ts:45`). `outlets/+page.svelte:67`
- [x] **Grayscale floorplan toggle** — B/W ↔ Color button for the PDF, kept per view. *cad:* missing — the underlay is always at 60 % opacity (`cad/views/plan.ts:34`). `outlets/parts/OutletCanvas.svelte:1658`
- [x] **Floor manager** — add floors (single or a lowest–top range), edit number / label, server-room count and room names, add / rename / delete tenant areas, delete a floor. *cad:* partial: levels can only be renamed / deleted; no new level, no area, no floor number edit (`cad/ui/CadShell.svelte:322`). `outlets/Outlets.svelte:2232`
- [ ] **Server rooms come with the floor** — a floor's room count gives rooms A–D, so racks can be made at once. *cad:* partial: a new server room is made only from a rack's Properties, and the Rack tool refuses on a level with no room (`cad/editor/tools.ts:413`). `outlets/Outlets.svelte:976`
- [ ] **Origin crosshair** — the calibrated origin is marked on the plan. *cad:* missing. `outlets/parts/OutletCanvas.svelte:1806`

### Placing and labelling outlets
- [ ] **Place unplaced locations** — Frames locations with no outlet are listed; click one, then the plan, and the outlet is born linked; the next one arms itself (Esc stops). *cad:* missing — outlets entered in the grid (or imported without a position) have no way onto the plan; the grid only shows "Placed" (`cad/ui/OutletGrid.svelte:185`). `outlets/parts/OutletPalette.svelte:113`
- [x] **Walk renumber** — "Renumber from here", then each clicked outlet gets the next number; ports follow; undo rolls the counter back. *cad:* missing — `renumber()` exists but has no UI (`cad/domain/labels.ts:91`, phase2 todo 1). `outlets/Outlets.svelte:820`
- [ ] **Zone picker** — buttons A–F set the zone used for the next outlet label. *cad:* missing — `zoneId` exists on outlets but nothing sets it (`cad/domain/types.ts:97`). `outlets/parts/OutletPalette.svelte:42`
- [ ] **Next label from the project template** — the next label follows `labelFormat.outletTemplate` (e.g. 4A013), max + 1 in the zone. *cad:* different: the next label is the last outlet's label + 1 (`cad/editor/tools.ts:363`); `labelPatterns` is not used yet. `outlets/Outlets.svelte:700`
- [x] **Defaults editor** — set ports / level / usage / mount / cable for the NEXT outlet before placing. *cad:* partial: the next outlet copies the last one; there is no editor for the defaults (`cad/editor/tools.ts:365`). `outlets/parts/OutletPalette.svelte:55`
- [ ] **Quick keys on selected outlets** — 1–9 port count, l / h level, c / s / m cable, w / f / b mount. *cad:* missing (and L / C / W are tool keys in cad). `outlets/Outlets.svelte:1852`
- [x] **Ctrl-drag copies outlets** — Ctrl while dragging leaves the originals (ghosted) and drops copies. *cad:* missing (todo in `cad/docs/phase6.md:199`). `outlets/Outlets.svelte:784`

### Outlet properties
- [x] **Cable type per outlet** — Cat5e / Cat6 / Cat6a / SM / MM fibre, single or multi edit. *cad:* missing — stored per port (`cad/domain/types.ts:123`) but no field anywhere in the UI. `outlets/parts/OutletProperties.svelte:212`
- [ ] **Room number** — free text room, shown under the symbol and in Excel. *cad:* partial: imported as `roomId` and in the schedule, but no field to edit it (`cad/domain/types.ts:98`). `outlets/parts/OutletProperties.svelte:228` 
- [x] **Usage on one outlet** — Usage select in the floating properties. *cad:* partial: only in the grid and in multi-select Properties, not in a single outlet's Properties (`cad/ui/Properties.svelte:245`). `outlets/parts/OutletProperties.svelte:180`
- [x] **Port count for many outlets** — Ports field works on a multi-selection. *cad:* partial: port count is single-outlet only (`cad/ui/Properties.svelte:268`). `outlets/parts/OutletProperties.svelte:147`
- [x] **Delete buttons** — Delete N in the toolbar, the properties window and the list. *cad:* partial: only the Delete key. `outlets/parts/OutletCanvas.svelte:1664`
- [ ] **Location link tools** — link / unlink / create a Frames location, "Link all" by label, "Sync from locations", ⚠ when ports or label differ. *cad:* different: an outlet IS the location (one record, ADR 0001), so there is nothing to link or sync. `outlets/parts/OutletProperties.svelte:111`

### Outlet symbols on the plan
- [ ] **Symbol colour by usage** — each usage (network, phone, AP, printer …) has its own colour. *cad:* missing — every outlet is blue (`cad/ui/Prims.svelte:86`). `outlets/parts/constants.ts:7`
- [x] **Port count inside the symbol** — the number of ports is drawn in the symbol. *cad:* missing — built-in blocks show only the label (`cad/domain/blocks.ts:24`). `outlets/parts/OutletShape.svelte:111`
- [ ] **Room number under the symbol** — shown on the plan. *cad:* missing. `outlets/parts/OutletShape.svelte:121`
- [ ] **Filled = low, outline = high** — fill shows the level. *cad:* different: high outlets get the ceiling symbol (`cad/domain/blocks.ts:40`). `outlets/parts/OutletShape.svelte:67`

### Display, layers and status bar
- [x] **View menu layers** — toggle low / high outlets, low / high trunks, trunk fill labels, secondary routes, racks, legend, title block (hidden items can't be clicked). *cad:* missing — only a Fill toggle (`cad/ui/ViewCanvas.svelte:365`). `outlets/parts/OutletCanvas.svelte:134`
- [ ] **Layer presets in the URL** — `?lowOutlets=1&highTrunks=0` … *cad:* missing (never wired in legacy either). `outlets/+page.svelte:37`
- [x] **Grid size setting** — Grid mm box in the status bar (0 = off). *cad:* partial: fixed 10 mm grid, Alt = free (`cad/editor/snap.ts:10`). `outlets/Outlets.svelte:2216`
- [ ] **Zoom buttons and %** — − / % / + / Fit in the status bar; + / − keys. *cad:* partial: Fit button and Home only; no zoom % or +/− (`cad/ui/ViewCanvas.svelte:383`). `outlets/Outlets.svelte:2212`
- [ ] **Counts and hints** — outlets / racks / trunks counts, "1px = N mm", "Alt+drag to disconnect" hints. *cad:* partial: outlet count per level and mm/px only (`cad/ui/CadShell.svelte:320`). `outlets/Outlets.svelte:2198`
- [x] **Touch: two-finger pan and pinch zoom** — iPad support. *cad:* missing — no touch handling in `cad/ui/ViewCanvas.svelte`. `outlets/parts/OutletCanvas.svelte:1128`

### Trunks (containment)
- [ ] **Trunk catalogue** — pipe PF22 / PF28 / E51 and MK0–MK5, ladder, tray, rubber mat, custom. *cad:* missing — only W / H / Ø numbers (Dave: catalogue not required, `cad/docs/pages-features.md:59`). `outlets/trunks/constants.ts:3`
- [ ] **Pipe inner + outer size** — both diameters, inner used for fill. *cad:* partial: one Ø; `section.inner` exists but has no field (`cad/ui/PathProps.svelte:71`). `outlets/trunks/TrunkProperties.svelte:99`
- [x] **Location** — under floor / ceiling plenum / ceiling tray / wall. *cad:* different: tier + node Z + form (trunk / conduit / tray) (`cad/domain/shapes.ts:95`). `outlets/trunks/constants.ts:28`
- [ ] **Rooms a trunk serves** — A–D buttons; a trunk with rooms takes only those rooms' outlets. *cad:* partial: `serves` is imported and used by routing, but there is no field to set it (`cad/domain/shapes.ts:98`). `outlets/trunks/TrunkProperties.svelte:184`
- [ ] **Trunk colour** — colour picker + reset, per trunk or many. *cad:* missing — the imported colour is not drawn and can't be set. `outlets/trunks/TrunkProperties.svelte:164`
- [ ] **Trunk list** — every trunk with eye toggle, colour, label, node count and length; click / Ctrl / Shift select. *cad:* missing — no list of runs (lengths only in the BOM). `outlets/trunks/TrunkPalette.svelte:175`
- [ ] **Hide one trunk** — eye toggle; hidden trunks are skipped by routing. *cad:* missing. `outlets/Outlets.svelte:1404`
- [ ] **Trunk length shown** — length in m in properties and list. *cad:* missing in Properties (`cad/ui/PathProps.svelte:64`). `outlets/trunks/TrunkProperties.svelte:213`
- [x] **Multi-edit trunks** — shape / location / type / colour for several trunks at once. *cad:* missing — run Properties are single only. `outlets/trunks/TrunkProperties.svelte:53`
- [ ] **Split trunk at a node** — right-click → "Split trunk here", the far side becomes its own trunk. *cad:* missing. `outlets/Outlets.svelte:1740`
- [ ] **Disconnect a node** — right-click "Disconnect node", or Alt-drag a junction to pull it apart. *cad:* missing. `outlets/Outlets.svelte:1704`
- [ ] **Right-click menu on trunks** — split, disconnect, insert node, select full trunk, delete. *cad:* different: right-click = Esc; insert by double-click, delete by key (`cad/ui/ViewCanvas.svelte:289`). `outlets/parts/OutletCanvas.svelte:1919`
- [ ] **Auto-merge when drawn or dragged onto a matching trunk** — same spec joins into one trunk; a different spec only snaps. *cad:* different: runs stay separate shapes; routing joins ends within 50 mm. `outlets/Outlets.svelte:1253`
- [ ] **Shift = 15° steps** — while drawing and while dragging nodes (all segments at a junction). *cad:* missing (todo `cad/docs/phase6.md:180`). `outlets/parts/OutletCanvas.svelte:1226`
- [x] **Drag a whole segment** — dragging a segment moves both its ends. *cad:* missing. `outlets/parts/OutletCanvas.svelte:818`
- [x] **Select many nodes and delete** — Ctrl-click nodes, Del removes them and heals the run. *cad:* partial: one node at a time with ✕ in the node table. `outlets/Outlets.svelte:1339`
- [x] **Close a loop** — clicking the first node (3+ points) closes the run. *cad:* missing (not seen in `cad/editor/pathTool.ts`). `outlets/parts/OutletCanvas.svelte:1186`
- [x] **Joined nodes move together** — dragging a node also moves the other trunks' nodes at the same spot. *cad:* missing — each run's grip moves alone. `outlets/Outlets.svelte:1456`
- [ ] **Snap to rack edge middles** — trunk ends snap to the middle of each rack side. *cad:* different: snaps to the rack centre (`cad/editor/snap.ts:39`). `outlets/parts/OutletCanvas.svelte:1206`
- [x] **Trunk drawing style** — joins drawn as one outline with rounded inner corners; ceiling trunks dashed. *cad:* different: banded segments; high runs orange (`cad/ui/Prims.svelte:58`). `outlets/trunks/TrunkRenderer.svelte:165`
- [ ] **Default rooms for new trunks** — rooms set in the palette go on each new trunk. *cad:* missing. `outlets/trunks/TrunkPalette.svelte:159`

### Routes and fill
- [x] **Secondary routes** — a line from every outlet to its nearest trunk, coloured by server room, always shown. *cad:* different: real routes over the containment, shown only for the selection (`cad/ui/ViewCanvas.svelte:126`). `outlets/Outlets.svelte:157`
- [ ] **Fill labels at trunk nodes** — e.g. "12C6A 4FSM 35 %", summed towards the rack, green / amber / red. *cad:* partial: Fill overlay shows % per segment; cable counts by type only in run Properties (`cad/ui/ViewCanvas.svelte:111`). `outlets/trunks/TrunkRenderer.svelte:172`

### Racks on the plan
- [ ] **Delete key = remove from plan** — Del (and Remove) only takes the rack off the floorplan. *cad:* different: Del DELETES the rack with its devices, links and cords (undoable); "Unplace" is a button (`cad/editor/commands.ts:41`). `outlets/Outlets.svelte:1843`
- [ ] **R key rotates racks** — R turns selected racks 90°. *cad:* partial: ⟲ / ⟳ buttons only (`cad/ui/Properties.svelte:304`). `outlets/Outlets.svelte:1846`
- [x] **Drag racks from the list** — drag one or several unplaced racks onto the plan, spaced in a line. *cad:* different: "Place" then one click per rack (`cad/ui/RackList.svelte:61`). `outlets/parts/RackPalette.svelte:77`
- [ ] **Rack list details** — placed dot, U and W × D per rack. *cad:* partial: name + frame tag; size in the tooltip only. `outlets/parts/RackPalette.svelte:177`
- [x] **Rack maker / model** — editable in Rack Properties. *cad:* missing. `outlets/parts/RackProperties.svelte:85`
- [ ] **Rack look on plan** — outline in the room's colour, U count under the name, text kept upright. *cad:* partial: name, X and front line only (`cad/views/plan.ts:145`). `outlets/parts/OutletRack.svelte:43`
- [ ] **Adopt row layout** — place a room's unplaced racks from the old row schematic with one click. *cad:* missing (legacy-data helper). `outlets/Outlets.svelte:1038`

### Legend, print and versions
- [x] **Legend on the drawing** — draggable box with wall / floor / box counts and high / low trunk lines; position saved per floor; prints. *cad:* partial: a "Symbols" list with counts in the sidebar only, not on sheets (`cad/ui/Legend.svelte:27`). `outlets/parts/OutletCanvas.svelte:1815`
- [ ] **Print from the plan** — paper frame (A3 / A4, orientation, 1:N, margins) dragged over the plan, auto title block, browser print. *cad:* different: sheets with viewports, title block and PDF (`cad/views/sheet.ts`). `outlets/parts/OutletCanvas.svelte:1646`
- [x] **Version history** — save a version with notes, restore, make a revision from it, delete. *cad:* missing — only undo and sheet issue / revisions. `outlets/Outlets.svelte:2243`

### Export
- [x] **Outlet Excel with X / Y** — the outlet export has X and Y in mm. *cad:* partial: the outlet schedule has no position columns (`cad/render/outletSchedule.ts:10`). `outlets/parts/exportExcel.ts:20`

<details><summary>Covered in cad (24)</summary>

- Outlet tool, O key, place on click — `outlets/parts/OutletCanvas.svelte:742` → `cad/editor/tools.ts:350`
- Select, move with grid snap, one undo step — `outlets/Outlets.svelte:774` → `cad/editor/tools.ts:267`
- Ctrl-click toggle / marquee select — `outlets/parts/OutletCanvas.svelte:759` → `cad/editor/tools.ts:191` (marquee misses shapes: todo `cad/docs/phase6.md:182`)
- Undo / redo Ctrl+Z / Y — `outlets/Outlets.svelte:1821` → `cad/ui/CadShell.svelte:210`
- Esc cascade (stop drawing → clear → Select) — `outlets/Outlets.svelte:1826` → `cad/ui/CadShell.svelte:221`
- Delete key — `outlets/Outlets.svelte:1840` → `cad/ui/CadShell.svelte:212`
- Pan right / middle drag, wheel zoom at cursor, Home = fit — `outlets/parts/OutletCanvas.svelte:721` → `cad/ui/ViewCanvas.svelte:260`
- Camera kept per view in localStorage — `outlets/parts/OutletCanvas.svelte:308` → `cad/ui/ViewCanvas.svelte:165`
- Floor + area in the URL — `outlets/+page.svelte:142` → `cad/app/urlState.ts:43`
- Floor tabs / tenant area tabs — `outlets/Outlets.svelte:2137` → `cad/ui/CadShell.svelte:316` (areas = levels, `cad/domain/types.ts:44`)
- Outlet list, natural sort, Shift / Ctrl select — `outlets/parts/OutletPalette.svelte:136` → `cad/ui/OutletGrid.svelte:81`
- Multi-edit level / usage / mount — `outlets/parts/OutletProperties.svelte:165` → `cad/ui/Properties.svelte:198`
- Label edit, ports follow (.A / .B) — `outlets/parts/OutletProperties.svelte:81` → `cad/ui/OutletGrid.svelte:26`
- Position readout — `outlets/parts/OutletProperties.svelte:241` → `cad/ui/Properties.svelte:264` (editable X / Y)
- Outlet Excel export — `outlets/parts/exportExcel.ts:6` → `cad/render/outletSchedule.ts:38`
- Trunk tool T, click points, double-click / Enter / Esc finish, Backspace — `outlets/parts/OutletCanvas.svelte:1221` → `cad/editor/pathTool.ts:47`
- Trunk Z, width / height — `outlets/trunks/TrunkPalette.svelte:152` → `cad/ui/CadShell.svelte:245`
- Snap / attach to nodes, outlets, racks with a marker — `outlets/parts/OutletCanvas.svelte:1235` → `cad/editor/snap.ts:38`
- Insert a node on a segment — `outlets/parts/OutletCanvas.svelte:813` → `cad/editor/tools.ts:321` (double-click)
- Pipe vs rect — `outlets/trunks/TrunkProperties.svelte:53` → `cad/ui/PathProps.svelte:65`
- Trunk label — `outlets/trunks/TrunkProperties.svelte:45` → `cad/ui/PathProps.svelte:78`
- Rack move drags attached trunk ends — `outlets/Outlets.svelte:1129` → `cad/editor/tools.ts:280`
- Rack rotate / set rotation / sticky rotation / size edit / multi-edit — `outlets/parts/RackProperties.svelte:103` → `cad/ui/Properties.svelte:186`
- New rack in a room ("New rack here") — `outlets/Outlets.svelte:984` → `cad/editor/tools.ts:392`
</details>

## Workspace (`routes/projects/[pid]/workspace/`)

### Navigation
- [x] **Tabs** — many tabs, each a saved place (selection, view, pan / zoom), kept per project in localStorage. *cad:* missing — one or two panes (Split), no tabs (`cad/ui/CadShell.svelte:294`). `workspace/parts/TabStrip.svelte:62`
- [ ] **Tab actions** — drag to reorder, middle-click close, right-click: close / close others / close to the right / duplicate; "+" new tab. *cad:* missing. `workspace/parts/TabStrip.svelte:119`
- [ ] **Stale tab warning** — a tab whose item was deleted shows ⚠ in italics. *cad:* missing. `workspace/parts/TabStrip.svelte:64`
- [x] **Quick switcher (Ctrl+K)** — type to jump to a floor, room, row, rack, frames or risers; arrows + Enter. *cad:* missing. `workspace/parts/QuickSwitcher.svelte:129`
- [ ] **Project tree** — Floors › floor › Patch frames / Server room › Row › Rack; Building › Risers. *cad:* partial: Levels list + racks by room on the left; no rows, no tree (`cad/ui/RackList.svelte:43`). `workspace/parts/TreeNavigator.svelte:73`
- [ ] **Tree filter** — a filter box shows only matching nodes and their parents. *cad:* missing. `workspace/parts/TreeNavigator.svelte:175`
- [ ] **Tree keys** — ↑ / ↓, → / ← expand / collapse, Home / End, Enter / Space. *cad:* missing. `workspace/parts/TreeNavigator.svelte:241`
- [ ] **Open one rack or one row** — the canvas shows just the selected rack, its row, or the whole room. *cad:* partial: a room's racks open together; double-click a rack fits it (`cad/ui/ViewCanvas.svelte:266`). `workspace/parts/RackElevationView.svelte:97`
- [x] **Floor view presets** — Outlets (low) / Outlets (high) / Trunks / Fill rate on a floor. *cad:* partial: Plan + Fill toggle; no low / high filters (presets were not wired in legacy either). `workspace/state.svelte.ts:302`

### Layout and help
- [x] **Resizable panels** — drag the edges of left, right and bottom panels; sizes saved. *cad:* missing — fixed sizes (`cad/ui/CadShell.svelte:374`). `workspace/parts/ResizeHandle.svelte:22`
- [x] **Hide / show right and bottom panels** — "Patch list" and "Inspector" toggles. *cad:* missing. `workspace/Workspace.svelte:90`
- [x] **Shortcuts sheet (?)** — "?" opens a keyboard cheat sheet. *cad:* missing — no Help at all (phase2 todo 8). `workspace/parts/ShortcutsOverlay.svelte:6`
- [x] **Cursor readout** — status bar shows X / Y in mm and the zoom. *cad:* partial: scale and mm/px only (`cad/ui/ViewCanvas.svelte:383`). `workspace/Workspace.svelte:108`
- [ ] **Dark mode** — the shell follows dark mode. *cad:* missing. `workspace/Workspace.svelte:62`

### Labels and reading
- [x] **Hover label tip** — hovering any port shows its full label in a big bubble (setting). *cad:* missing — no tooltips on prims (`cad/ui/Prims.svelte:45`). `workspace/parts/LabelMagnifier.svelte:24`

### Inspector and library
- [x] **Device library drag** — drag a device from the Library tab onto a rack; a ghost shows the snapped U. *cad:* different: Device tool + template in the tool bar, click at a U (`cad/ui/CadShell.svelte:260`). `workspace/parts/InspectorLibrary.svelte:11`
- [x] **Ctrl-drag copies a device** — in the rack elevation. *cad:* missing (agreed todo, `cad/docs/phase3.md:595`). `workspace/parts/RackElevationView.svelte:421`
- [x] **Sideways device offset** — dragging sideways sets an offset in 25 mm steps. *cad:* partial: `offsetX` is drawn but can't be set (`cad/views/rackRow.ts:118`). `workspace/parts/RackElevationView.svelte:270`
- [x] **Rack colour, maker, model** — editable in the inspector. *cad:* missing. `workspace/parts/InspectorProperties.svelte:216`
- [x] **Devices by type** — the rack inspector counts devices per type. *cad:* partial: a total only (`cad/ui/Properties.svelte:348`). `workspace/parts/InspectorProperties.svelte:235`
- [x] **Row inspector** — rename a row; see its rack count, default height / colour, containment (HAC / CAC). *cad:* missing — rows can be made and picked, not renamed or edited. `workspace/parts/InspectorProperties.svelte:252`
- [x] **Server room summary** — floor, rows and racks counts. *cad:* missing. `workspace/parts/InspectorProperties.svelte:275`
- [x] **Device maker / model shown** — in the device inspector. *cad:* missing. `workspace/parts/InspectorProperties.svelte:180`

### Rack elevation canvas
- [ ] **Wheel pans** — plain wheel pans (Shift = sideways), Ctrl / Alt + wheel zooms. *cad:* different: the wheel always zooms (`cad/ui/ViewCanvas.svelte:306`). `workspace/parts/RackElevationView.svelte:241`
- [ ] **Reset view + zoom % + selected count** — small overlay in the canvas. *cad:* partial: Fit only. `workspace/parts/RackElevationView.svelte:518`

### Patch list and logging
- [x] **Patch list follows the tree** — the bottom panel shows the patches of the selected rack / row / room. *cad:* different: one project-wide list with status chips and Find (`cad/ui/PatchList.svelte:36`). `workspace/parts/PatchListBottomPanel.svelte:14`
- [ ] **Change log** — every edit in the workspace writes a log entry (`logs/{pid}/{tool}`). *cad:* partial: each record keeps who / when changed it, but no log list or viewer (`cad/persist/docs.ts:9`). `workspace/parts/RackElevationView.svelte:92`

<details><summary>Covered in cad (11)</summary>

- One shell for floor plan, racks, patching, risers — `workspace/parts/CanvasArea.svelte:49` → `cad/ui/CadShell.svelte:331`
- View buttons per selection — `workspace/parts/ViewStrip.svelte:14` → `cad/ui/ViewCanvas.svelte:353`
- URL keeps what is open — `workspace/+page.svelte:168` → `cad/app/urlState.ts:43` (no camera / selected item in the URL; cameras in localStorage)
- Level-of-detail labels at low zoom — `workspace/Workspace.svelte:47` → `cad/ui/Prims.svelte:11`
- Full label in the inspector — `workspace/parts/DisplaySettings.svelte:67` → `cad/ui/PortProps.svelte`
- Rack inspector: label, type (incl. desk / shelf / VCM), size — `workspace/parts/InspectorProperties.svelte:184` → `cad/ui/Properties.svelte:284`
- Device inspector: label, U, height, ports — `workspace/parts/InspectorProperties.svelte:152` → `cad/ui/Properties.svelte:349`
- Patch connection inspector — `workspace/parts/InspectorProperties.svelte:127` → `cad/ui/CordProps.svelte`
- Drag devices by U and into another rack — `workspace/parts/RackElevationView.svelte:407` → `cad/editor/tools.ts:252`
- Delete selected devices — `workspace/parts/RackElevationView.svelte:451` → `cad/ui/CadShell.svelte:212`
- Right / middle drag pans — `workspace/parts/RackElevationView.svelte:178` → `cad/ui/ViewCanvas.svelte:260`
</details>


## Elevations (`routes/projects/[pid]/elevations/`)

Note: Elevations also hosts parts from Racks, Patching and Frames (sidebar tabs, patch list, settings dialog). Those parts are
listed here only as they appear inside Elevations; the Racks / Patching / Frames sections cover the standalone tools.

### Patch cords in the rack view
- [x] **Re-route a cord end** — Inspector "Re-route From / To", then click the new port; an installed cord becomes "change" and remembers its old ends, and moving it back makes it "installed" again. *cad:* missing (the rule exists in `cad/domain/cords.ts:113` but no UI calls it; phase 3 todo). `elevations/parts/Inspector.svelte:153`, `elevations/editor.svelte.ts:1060`
- [ ] **Sticky status for new cords** — the toolbar picks Add or Installed for new cords, so as-built cords can be recorded directly. *cad:* missing: new cords are always `add` (`cad/domain/cords.ts:99`). `elevations/Elevations.svelte:951`
- [ ] **Unlabelled panel ports can be patched** — the cord refers to device + port and shows "rack-RU-port" until a label is allocated. *cad:* different: the gate refuses a panel port with no label (`cad/domain/cords.ts:35`). `elevations/editor.svelte.ts:913`
- [ ] **Clicking a patched port selects its cord** — in Select or Patch mode, a click on a patched port selects that cord (and clicking the armed port again disarms). *cad:* partial: Select picks the port and shows ⇄ in Port Properties; the Cord tool just says "already patched". `elevations/editor.svelte.ts:1504`, `elevations/editor.svelte.ts:918`
- [x] **Cords drawn as orthogonal routes** — port → drop → side channel at the rack edge → across → down into the other port. *cad:* partial: a straight line with a small sag (`cad/views/rackRow.ts:149`). `elevations/parts/CordsLayer.svelte:71`
- [ ] **Selected cord dims the rest** — other cords fade to 12 %; the selected cord still shows when the cords layer is off. *cad:* partial: the selected cord's circuit is drawn orange, others are not dimmed. `elevations/parts/CordsLayer.svelte:21`
- [ ] **Cord hover tooltip** — type · length · status on hover. *cad:* missing (no tooltips on the canvas). `elevations/parts/CordsLayer.svelte:109`
- [ ] **Type any cord length** — the length box takes any number and locks it. *cad:* partial: only stock lengths (0.3–30 m) in a list (`cad/ui/CordProps.svelte:47`). `elevations/parts/Inspector.svelte:126`
- [ ] **Custom cable types** — Patching settings dialog adds / edits / removes cable types (label, copper / fibre / other, colour). *cad:* missing: `settings.cableTypes` has no editor. `elevations/Elevations.svelte:1170` → `patching/parts/SettingsDialog.svelte:114`
- [ ] **Default cable type / colour / status** — set in the same settings dialog. *cad:* partial: project defaults exist and seed the Cord tool (`cad/ui/CadShell.svelte:177`) but can't be changed in the UI. `patching/parts/SettingsDialog.svelte:83`
- [ ] **Two cords on one port flagged** — a port with two cords gets a red ring. *cad:* different: one cord per port is enforced (`cad/domain/cords.ts:37`). `elevations/parts/PortsLayer.svelte:224`

<details><summary>Covered in cad (9)</summary>

- Click port A then port B, rubber band while armed — `elevations/editor.svelte.ts:902` → `cad/editor/cordTool.ts:34`, `cad/editor/cordTool.ts:84`
- Patch mode key P / Select V — `elevations/Elevations.svelte:551` → `cad/ui/CadShell.svelte:108`
- Sticky cable type for the next cord — `elevations/Elevations.svelte:940` → `cad/ui/CadShell.svelte:269`
- Auto length (U run, side channel, manager, rack to rack, depth, slack) — `elevations/editor.svelte.ts:942` → `cad/domain/cords.ts:47`
- Lock / unlock length, cord ID, notes, status — `elevations/parts/Inspector.svelte:124` → `cad/ui/CordProps.svelte:44`
- Soft delete (planned → gone, installed → remove) and Delete key on a cord — `elevations/editor.svelte.ts:1091` → `cad/editor/commands.ts:25`
- Bulk patch N ports, skipping busy / unlabelled ports — `elevations/parts/Inspector.svelte:167` → `cad/ui/PortProps.svelte:85`, `cad/domain/cords.ts:141`
- Dashed until installed — `elevations/parts/CordsLayer.svelte:114` → `cad/ui/Prims.svelte:149`
- Esc drops the armed port — `elevations/Elevations.svelte:569` → `cad/editor/cordTool.ts:79`
</details>

### Patch bench (Patching tab)
- [ ] **Bench of rack boards across rooms** — pick racks from every server room on the floor and lay them out side by side as boards. *cad:* missing: a rack view shows one room (split view gives two). `elevations/patching/PatchBench.svelte:226`, `elevations/patching/bench.svelte.ts:31`
- [ ] **Fixed-size port chips** — each board lists its port devices top-down with readable chips (short label, usage colour, patched dot) at any zoom. *cad:* missing (the panel strip was deferred, phase3 §9.5). `elevations/patching/RackBoard.svelte:104`
- [ ] **Device tree with search** — room → rack → device list; click a rack to add / remove its board, click a device to scroll to and flash it. *cad:* missing (the racks list has no devices and no search). `elevations/patching/DeviceTree.svelte:14`
- [ ] **Arrange boards** — move a board left / right, remove it, collapse device groups; the bench is saved per floor. *cad:* missing. `elevations/patching/RackBoard.svelte:69`, `elevations/patching/bench.svelte.ts:186`
- [ ] **Port filter** — text, usage chips and "free only" dim the other ports; Enter jumps to the next match. *cad:* missing. `elevations/patching/PatchBench.svelte:177`, `elevations/patching/bench.svelte.ts:545`
- [ ] **Port holds** — Alt+click a free port to hold it under a label (VLAN, uplink); held ports refuse cords until released (undoable). *cad:* missing, and holds are not imported. `elevations/patching/bench.svelte.ts:299`
- [ ] **Ordered bulk patch with preview** — Ctrl+click sources in any order, "Patch to…", click the same number of targets, then confirm a pair table. *cad:* partial: one device's ports onto consecutive ports from one start port, no preview (`cad/domain/cords.ts:141`). `elevations/patching/bench.svelte.ts:357`, `elevations/patching/PatchBench.svelte:295`
- [ ] **Patch by rule** — first N ports of each location, left / right halves to each switch's ranges, locations alternated across switches with a checkerboard offset, then the bulk preview. *cad:* missing. `elevations/patching/bench.svelte.ts:396`, `elevations/patching/PatchBench.svelte:334`
- [ ] **Clickable circuit bar** — the selected cord's full chain; clicking a node opens that device on the bench. *cad:* partial: a Trace list in Properties and an orange highlight; nodes can't be clicked (`cad/ui/Trace.svelte:9`). `elevations/patching/PatchBench.svelte:235`
- [x] **Cross-room cords refused** — a cord between rooms is refused ("use structured interconnects"). *cad:* different: no room check (`cad/domain/cords.ts:95`). `elevations/patching/bench.svelte.ts:270`
- [ ] **Instant hover tips** — chips show label, usage and what a click / Ctrl / Alt click does, with no delay. *cad:* missing. `elevations/parts/instantTip.ts:38`

<details><summary>Covered in cad (3)</summary>

- Patch list for all rooms — `elevations/patching/PatchBench.svelte:266` → `cad/ui/PatchList.svelte:34` (project-wide)
- Undo / redo, Delete on a cord, Esc cascade — `elevations/patching/PatchBench.svelte:62` → `cad/ui/CadShell.svelte:210`
- Sticky cable type / status per cord — `elevations/patching/PatchBench.svelte:160` → `cad/ui/CadShell.svelte:269` (type only; status is above)
</details>

### Allocation, labels and terminations
- [ ] **Port blocks across panels** — Ctrl+click or Ctrl+drag "paints" ports on any panels and racks, Ctrl+Shift+click adds a range. *cad:* partial: ports of one device only (click, Shift range, Ctrl toggle — `cad/editor/tools.ts:175`; phase 3 todo). `elevations/parts/PortsLayer.svelte:131`, `elevations/editor.svelte.ts:1175`
- [ ] **Select all panel ports** — of the selected racks (Inspector) or of one panel (detail strip). *cad:* missing. `elevations/parts/Inspector.svelte:288`, `elevations/parts/PanelDetailStrip.svelte:58`
- [ ] **Auto-generate locations from ports** — selected panel ports → new locations (zone, start number, ports per location, usage, HL, room no.), pinned in rack order. *cad:* missing: outlets are only made by placing them on the plan. `elevations/parts/AssignPortsDialog.svelte:137`, `elevations/editor.svelte.ts:1402`
- [ ] **Pin ports to a location / terminate to a location** — selected ports → an existing location ("To location…"), or the Frames tab's armed port / block → a location's free ports, from a list or a floorplan picker. *cad:* different: select outlets (grid or plan), "Assign → port…", click the first panel port; placed links are pinned (`cad/ui/OutletGrid.svelte:128`). `elevations/parts/AssignPortsDialog.svelte:252`, `elevations/frames/frames-editor.svelte.ts:366`, `elevations/frames/PlanPicker.svelte:91`
- [ ] **Drag a block of terminations** — drag selected rear ports to a free run; links, labels and pins move, cords and reservations stay; printed panels ask first. *cad:* missing (Assign can re-place outlets, but there is no drag in the rack view). `elevations/frames/frames-editor.svelte.ts:523`
- [ ] **Label template engine** — patterns with F Z N S P A R H tokens, zero padding, "quoted" text and [ ] optional groups. *cad:* missing: labels are plain text; `labelPatterns` is stored but the Relabel tool is not built (ADR 0002). `lib/elevation/labelTemplate.ts:1`, `elevations/parts/AssignPortsDialog.svelte:194`
- [ ] **Label format options** — built-in Standard / Periods / Hyphens with "include zone" and "room no." ticks, shown with an example. *cad:* partial: only the port suffix style 201.A / 201A / 201-A / 201.1 / 201-1 (`cad/ui/OutletGrid.svelte:130`). `elevations/parts/AssignPortsDialog.svelte:157`
- [ ] **Label format library** — save a custom template as a named preset for all projects, delete presets. *cad:* missing (not imported). `elevations/parts/AssignPortsDialog.svelte:72`
- [ ] **Outlet label template** — a pattern for outlet labels (e.g. FZNNN). *cad:* missing. `elevations/parts/AssignPortsDialog.svelte:211`
- [ ] **Sync labels dialog** — lists stale / orphaned / out-of-range baked labels, printed panels unticked by default, then re-bakes the ticked ones. *cad:* different: no baked labels; a printed panel flags changed ports and edits ask first (`cad/views/rackRow.ts:121`, `cad/app/project.svelte.ts:140`). `elevations/parts/SyncLabelsDialog.svelte:44`
- [ ] **Custom label override on any port** — a free-text label wins over the allocated one and is tagged "custom". *cad:* different: the label is edited where it lives, so editing a linked port renames the outlet port (`cad/ui/PortProps.svelte:74`). `elevations/parts/Inspector.svelte:218`
- [ ] **Termination map view** — Frames tab boards of panel rear ports: solid = linked, dashed = not, coloured by link kind and status. *cad:* partial: the rack view tints linked ports blue (`cad/views/rackRow.ts:131`); no rear termination board. `elevations/frames/RearRackBoard.svelte:92`
- [x] **Links table** — every link with its far end, run / tie, editable cable type and design / installed status, remove. *cad:* partial: no list of links and no UI for link status; cable type and length show per port (`cad/ui/PortProps.svelte:91`). `elevations/frames/FramesBench.svelte:284`
- [x] **Tie labels** — tie ports show "RackA~RackB:NN" on both ends, numbered per rack pair. *cad:* missing (a tie port shows its own label, if any). `elevations/frames/frames-editor.svelte.ts:156`
- [x] **Sticky cable type for new links** — Cat5e / Cat6 / Cat6a / OS2 / OM4 for terminations and ties. *cad:* partial: interconnects take the Cord tool's type; horizontal links take the outlet port's type. `elevations/frames/FramesBench.svelte:105`
- [ ] **Location coverage list** — each location with linked / total ports, expand to see free ports. *cad:* partial: the outlets grid "Panel" column per port, no counts. `elevations/frames/FramesBench.svelte:244`
- [ ] **Checks tab** — stale labels, unassigned location ports, orphaned links (remove), locations with nothing linked. *cad:* partial: the allocation issue list (`cad/ui/OutletGrid.svelte:138`); orphaned links can't occur (deletes cascade). `elevations/frames/FramesBench.svelte:195`
- [ ] **Reservation summary** — every reservation with its usage, port count, rack / U spots and orphaned ports, with remove. *cad:* missing (reservations are only seen per port). `elevations/Elevations.svelte:839`, `elevations/editor.svelte.ts:1249`
- [ ] **Clear floor** — wipe all locations, reservations, pins, labels, links and cords on a floor, outlets kept but unlinked. *cad:* partial: only "delete level" (everything) or Unallocate / Re-allocate per selection. `elevations/Elevations.svelte:795`, `elevations/editor.svelte.ts:707`
- [ ] **Auto-terminate / Bake allocation** — turn the engine's labels into stored labels and links. *cad:* different: Allocate writes links directly, with a preview (`cad/ui/OutletGrid.svelte:126`). `elevations/frames/frames-editor.svelte.ts:483`, `elevations/frames/frames-editor.svelte.ts:685`

<details><summary>Covered in cad (7)</summary>

- Reserve selected ports for a usage — `elevations/Elevations.svelte:1050` → `cad/ui/PortProps.svelte:115`
- Remove a reservation — `elevations/editor.svelte.ts:1284` → `cad/ui/PortProps.svelte:118`
- Unpin / pin (sticky assignments) — `elevations/editor.svelte.ts:1478` → `cad/ui/PortProps.svelte:112`
- Clear links of selected ports — `elevations/frames/frames-editor.svelte.ts:388` → `cad/ui/PortProps.svelte:111`
- Tie link between two panel ports — `elevations/frames/frames-editor.svelte.ts:325` → `cad/ui/PortProps.svelte:86`, `cad/domain/interconnect.ts:16`
- Allocation engine (server room, tier, reservations first, rack order, sticky) — `lib/elevation/portmap.ts:239` → `cad/domain/allocate.ts:71`
- Labels printed flag + warning — `elevations/parts/Inspector.svelte:345` → `cad/ui/Properties.svelte:390`
</details>

### Rack view and navigation
- [ ] **Focus a pair of racks** — Shift+double-click adds a rack to the focus, a breadcrumb lists them (× removes one), "Focus N racks" button. *cad:* partial: double-click fits one rack, double-click empty space shows the row (`cad/ui/ViewCanvas.svelte:208`). `elevations/Elevations.svelte:318`, `elevations/Elevations.svelte:1023`
- [ ] **Dim others on focus** — racks outside the focus fade. *cad:* missing. `elevations/Elevations.svelte:1109`
- [ ] **Fit keys** — 1 = fit row, 2 = fit focus, Esc leaves the focus. *cad:* partial: Home / Fit fits everything. `elevations/Elevations.svelte:549`
- [ ] **F flips front / rear** — keeps the same rack in the centre at the same zoom. *cad:* partial: "Racks front / rear" buttons, each face with its own camera, no key (`cad/ui/ViewCanvas.svelte:373`). `elevations/Elevations.svelte:329`
- [ ] **Row picker** — show one row of the room; add a row; delete a row with its racks (asks first). *cad:* partial: the rack view shows the whole room; rows come from "New row…"; no one-row view and no delete-row. `elevations/Elevations.svelte:904`, `elevations/editor.svelte.ts:1695`
- [x] **Room lines** — floor and ceiling lines (drag, or click to type FL+mm), left / right walls (drag), slab. *cad:* missing: the rack view draws only an FFL line (`cad/views/rackRow.ts:152`). `elevations/Elevations.svelte:494`, `racks/parts/RackElevationRenderer.svelte:131`
- [ ] **Title on the elevation** — "floor — room" drawn above the racks. *cad:* missing. `racks/parts/RackElevationRenderer.svelte:119`
- [x] **Other-face devices shown faded** — rear-only devices show at 50 % on the front view, named "(rear)". *cad:* missing: they are left out (`cad/views/rackRow.ts:104`). `elevations/parts/PortsLayer.svelte:175`
- [ ] **View menu** — toggle patch cords, port grids and labels, reservation marks, dim on focus; saved per project. *cad:* missing. `elevations/Elevations.svelte:976`
- [x] **Touch pan** — one-finger pan on a tablet. *cad:* missing: pan is right / middle drag only (`cad/ui/ViewCanvas.svelte:260`). `elevations/Elevations.svelte:1086`
- [x] **?frame= link** — a URL opens with that rack focused. *cad:* missing (the URL keeps level and panes only). `elevations/+page.svelte:22`
- [ ] **Status bar** — rack and device counts, zoom %, key hints. *cad:* partial: mm per px and tool hints. `elevations/Elevations.svelte:1203`

<details><summary>Covered in cad (5)</summary>

- Front / rear row elevation, rear order reversed — `elevations/editor.svelte.ts:167` → `cad/views/rackRow.ts:38`
- Double-click a rack (or device) fits it — `elevations/Elevations.svelte:1105` → `cad/ui/ViewCanvas.svelte:266`
- Pan / zoom saved per view — `elevations/Elevations.svelte:263` → `cad/ui/ViewCanvas.svelte:163`
- Print the elevation (A3 fit) — `elevations/Elevations.svelte:589` → `cad/views/sheet.ts:70` (rack-row viewports on sheets + PDF)
- Embedded floorplan tab, new rack from the plan — `elevations/Elevations.svelte:707` → `cad/ui/CadShell.svelte:106` (plan pane + Rack tool)
</details>

### Port display
- [ ] **Usage colour on ports** — each port is tinted by its outlet usage (desk, AP, printer …). *cad:* missing: ports are coloured only by linked / labelled / reserved / changed. `elevations/parts/PortsLayer.svelte:113`
- [ ] **Port tooltip** — label, usage, reservation, hold, device · port on hover. *cad:* missing. `elevations/parts/PortsLayer.svelte:120`
- [ ] **Patched dot** — a dot in the cord's colour on each patched port. *cad:* missing (cords are lines only). `elevations/parts/PortsLayer.svelte:220`
- [ ] **Pinned mark on the port** — a dark corner on pinned ports in the rack view. *cad:* partial: ◆ only in Port Properties and the outlets grid (`cad/ui/PortProps.svelte:126`). `elevations/parts/PortsLayer.svelte:231`
- [ ] **Reservation marks** — a usage bar on labelled reserved ports and the usage text in empty ones. *cad:* partial: dashed purple, only on unlinked ports (`cad/views/rackRow.ts:131`). `elevations/parts/PortsLayer.svelte:227`
- [ ] **Port numbers in empty cells** — unlabelled cells show a faint port number. *cad:* missing. `elevations/parts/PortsLayer.svelte:254`
- [ ] **Device name always readable** — constant screen size, moved to a side tag once port labels show. *cad:* partial: the name hides below 6 px (`cad/views/rackRow.ts:124`). `elevations/parts/PortsLayer.svelte:269`
- [ ] **Port grid position** — few-port devices put their ports top / bottom × left / centre / right. *cad:* partial: cells are capped and centred, no choice. `elevations/parts/portGeometry.ts:31`, `elevations/parts/Inspector.svelte:337`
- [ ] **Unpatchable ports greyed in Patch mode** — not-allowed cursor on ports that can't take a cord. *cad:* missing (the refusal shows only after a click). `elevations/parts/PortsLayer.svelte:194`
- [ ] **Panel detail strip** — a fixed-size row of the selected panel's ports under the canvas, clickable, with Select all. *cad:* missing (deferred, phase3 §9.5). `elevations/parts/PanelDetailStrip.svelte:51`

<details><summary>Covered in cad (4)</summary>

- Label LOD: short 2-line, full 3-line stack — `elevations/parts/PortsLayer.svelte:105` → `cad/views/rackRow.ts:135`
- 24 / 48-port grids (two rows) — `elevations/parts/portGeometry.ts:37` → `cad/views/rackRow.ts:58`
- Selected / armed port highlight — `elevations/parts/PortsLayer.svelte:217` → `cad/ui/ViewCanvas.svelte:90`
- Circuit highlight of a cord / port — `elevations/patching/bench.svelte.ts:153` → `cad/ui/ViewCanvas.svelte:97`
</details>

### Racks and devices
- [x] **Ctrl+drag copies a device** — drop a copy at the new U / rack. *cad:* missing (phase 3 todo). `elevations/Elevations.svelte:486`
- [x] **Device side offset** — drag or type offsetX, snapped to 25 mm. *cad:* partial: drawn when imported (`cad/views/rackRow.ts:118`), not editable. `elevations/Elevations.svelte:431`, `elevations/parts/Inspector.svelte:340`
- [x] **Rack maker, model, SKU, notes** — fields in the rack Inspector. *cad:* missing in Properties (`notes` is in the schema, no UI). `elevations/parts/Inspector.svelte:268`, `elevations/parts/Inspector.svelte:306`
- [ ] **Desk / shelf heights** — four shelf heights for desk and shelf racks. *cad:* missing. `elevations/parts/Inspector.svelte:259`
- [x] **Device maker, model, width, depth** — fields in the device Inspector. *cad:* missing. `elevations/parts/Inspector.svelte:333`, `elevations/parts/Inspector.svelte:352`
- [ ] **Panel server room** — a panel's own server room A–D. *cad:* missing in Properties (imported `serverRoomId` is kept; otherwise the rack's room). `elevations/parts/Inspector.svelte:344`
- [x] **Edit many devices at once** — label, height, ports, width, depth, mounting, port position, tier, room, printed, maker, model. *cad:* partial: face and tier only (`cad/ui/Properties.svelte:226`). `elevations/parts/Inspector.svelte:88`
- [x] **Devices list** — per rack, front then "Rear mount", click / Shift / Ctrl select, delete. *cad:* missing. `elevations/Elevations.svelte:759` → `racks/parts/RackDevices.svelte:46`
- [x] **Device library builder** — make or edit a template (label, type, U, ports, maker), search the palette. *cad:* partial: "Save as template…" from a placed device; no builder, edit, delete or search (`cad/ui/Properties.svelte:405`). `elevations/Elevations.svelte:764` → `racks/parts/DevicePalette.svelte:55`
- [x] **Catalog tab** — browse the Panduit catalogue (kind, maker, colour, RU, compatible with the row), add a rack, add / delete custom products. *cad:* missing (the rack BOM uses the seed only). `elevations/Elevations.svelte:774` → `racks/parts/CatalogBrowser.svelte:37`
- [ ] **Row builder** — row defaults (U, colour, depth), containment HAC / CAC with rules, mixed-row warning + "apply to all", fill / add N racks from a SKU in V-R-V order. *cad:* missing (Dave: no row builder; `RackRow.containment` has no UI). `elevations/Elevations.svelte:741` → `racks/parts/RowEditor.svelte:93`, `elevations/editor.svelte.ts:1614`
- [x] **On-screen BOM** — BOM list by current row, project (by row) or consolidated, with product links. *cad:* partial: BOM is an Excel export only (`cad/ui/CadShell.svelte:302`). `elevations/Elevations.svelte:873` → `racks/parts/BOMPanel.svelte:23`
- [x] **RU clash shown** — Us used by two devices are highlighted. *cad:* different: overlaps are refused (`cad/domain/devices.ts:98`). `elevations/editor.svelte.ts:217`
- [x] **Deleting racks asks first** — "devices go too" confirm. *cad:* different: deletes at once, undo brings it back (`cad/editor/commands.ts:25`). `elevations/Elevations.svelte:662`

<details><summary>Covered in cad (8)</summary>

- Place a device from the library at a U (rear view = rear mount) — `elevations/Elevations.svelte:416` → `cad/editor/deviceTool.ts:18`
- Drag a device by whole U / into another rack — `elevations/Elevations.svelte:474` → `cad/editor/tools.ts:252`
- Device name, U, height, ports, face, tier, printed — `elevations/parts/Inspector.svelte:326` → `cad/ui/Properties.svelte:349`
- Rack name, kind, U, width, depth, mm height, room — `elevations/parts/Inspector.svelte:249` → `cad/ui/Properties.svelte:284`
- Edit many racks at once — `elevations/parts/Inspector.svelte:75` → `cad/ui/Properties.svelte:186`
- Add rack / rack order — `elevations/editor.svelte.ts:395` → `cad/ui/CadShell.svelte:106` (Rack tool; order follows the plan, phase3 §9.7)
- Delete device / selection — `elevations/editor.svelte.ts:535` → `cad/editor/commands.ts:25`
- Project device library → global templates — `elevations/+page.svelte:154` → `cad/app/project.svelte.ts:64`
</details>

### Patch list and exports
- [x] **Bulk status on ticked rows** — Mark Installed, Mark Add, Restore, Delete for many cords. *cad:* partial: multi-select + Delete marks / deletes; no bulk Installed / Add / Restore. `patching/parts/PatchListPane.svelte:256` (used at `elevations/Elevations.svelte:1181`)
- [x] **Purge removed cords** — delete every cord marked "remove" in one go. *cad:* missing ("Removed on site" one cord at a time, `cad/ui/CordProps.svelte:58`). `patching/parts/PatchListPane.svelte:245`
- [x] **Sort by column** — From, To, Cable, Length, Status. *cad:* missing. `patching/parts/PatchListPane.svelte:121`
- [ ] **Filter by notes / cable type** — the filter also matches notes and type names. *cad:* partial: matches ends, labels and cord ID (`cad/ui/PatchList.svelte:36`). `patching/parts/PatchListPane.svelte:86`
- [ ] **Old ends in the list** — ↶ shows where a changed cord was. *cad:* partial: shown in Cord Properties only (`cad/ui/CordProps.svelte:35`). `patching/parts/PatchListPane.svelte:318`
- [x] **Resizable list panel** — drag to resize, height saved; collapsible. *cad:* missing (fixed bottom panel). `elevations/Elevations.svelte:1179`
- [x] **Frames-layout label sheets** — Excel drawn as rack grids (RU + 24 ports, usage colours), a sheet per room. *cad:* partial: a flat list per room (`cad/render/exports.ts:142`). `elevations/Elevations.svelte:210`

<details><summary>Covered in cad (5)</summary>

- Patch schedule + cable BOM Excel — `elevations/Elevations.svelte:1159` → `cad/render/exports.ts:47`
- Import vendor cord IDs — `elevations/Elevations.svelte:237` → `cad/render/exports.ts:97`
- Status chips with counts — `patching/parts/PatchListPane.svelte:231` → `cad/ui/PatchList.svelte:54`
- Row click selects the cord, Shift / Ctrl multi-select — `patching/parts/PatchListPane.svelte:146` → `cad/ui/PatchList.svelte:40`
- Unlabelled ends shown as rack / device / U / port — `patching/parts/PatchListPane.svelte:63` → `cad/domain/reports.ts:71`
</details>

### Locations tab
- [ ] **Generate N locations for a zone** — set a count per zone; new rows get 2 ports, desk, room A. *cad:* missing: outlets are made by placing them (phase3 §9.6: the outlets grid is enough). `elevations/Elevations.svelte:798`, `elevations/editor.svelte.ts:673`
- [ ] **Room number per location** — edited in the location rows (and used by the `R` label token). *cad:* missing in the outlets grid (`Outlet.roomId` has no column). `elevations/editor.svelte.ts:778`
- [x] **Unassigned location ports** — lists location ports with no panel port yet ("post-install additions"). *cad:* partial: the allocation issue list after Allocate (`cad/ui/OutletGrid.svelte:138`). `elevations/Elevations.svelte:828`

<details><summary>Covered in cad (3)</summary>

- Ports, usage, HL, server room per port — `elevations/editor.svelte.ts:768` → `cad/ui/OutletGrid.svelte:145`
- Multi-select edits all selected — `elevations/editor.svelte.ts:784` → `cad/ui/Properties.svelte:198`
- All zones in one list — `elevations/Elevations.svelte:808` → `cad/ui/OutletGrid.svelte:143` (the whole level)
</details>

### Project, history and keys
- [x] **Version history** — snapshots of rows / racks / devices / settings with restore. *cad:* missing. `elevations/Elevations.svelte:1257`
- [ ] **Change log** — every edit written to `logs/{pid}/racks|frames|patching`. *cad:* missing. `elevations/+page.svelte:223`
- [x] **Floor manager** — add / rename / delete floors, server room count, room names. *cad:* partial: levels can be renamed and deleted, not added (`cad/ui/CadShell.svelte:160`). `elevations/Elevations.svelte:1248`
- [x] **Delete with ports selected** — Delete removes the selected ports' reservation. *cad:* different, and risky: a port click selects its device, so Delete deletes the device (undoable) (`cad/editor/tools.ts:186`). `elevations/Elevations.svelte:554`

<details><summary>Covered in cad (4)</summary>

- Undo / redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) — `elevations/Elevations.svelte:535` → `cad/ui/CadShell.svelte:210`
- Saved / Saving status — `elevations/Elevations.svelte:1016` → `cad/ui/CadShell.svelte:309`
- Esc cascade (dialog → tool → selection) — `elevations/Elevations.svelte:566` → `cad/ui/CadShell.svelte:221`
- Floor / room / view in the URL — `elevations/+page.svelte:178` → `cad/app/urlState.ts:31`
</details>


## Racks (`routes/projects/[pid]/racks/`)

### Rows and the row builder
- [ ] **Row defaults (RU / colour / depth)** — Row Builder sets a row's RU (45 / 52), colour (Black / White) and depth (30" / 36" / mm); they seed new racks and are the baseline for checks. *cad:* missing (`RackRow.defaults` is in the schema but nothing sets or uses it). `racks/parts/RowEditor.svelte:105`
- [ ] **Row containment (HAC / CAC / combined)** — pick a row's aisle containment; options a rack can't support are disabled and the reasons listed. *cad:* partial: containment is imported and drives the rack BOM, but there is no picker and no restriction check. `racks/parts/RowEditor.svelte:167`
- [ ] **Row homogeneity warning** — lists racks whose RU / colour / depth differ from the row defaults; "Apply row defaults to all" forces them. *cad:* missing. `racks/parts/RowEditor.svelte:195`
- [ ] **Compose row: add N racks / VCMs from a SKU** — adds N racks or VCMs of a catalogue SKU (R01…, V01…), interleaved V-R-V-R the Panduit way. *cad:* missing (Dave: no row builder; racks are drawn one by one with the Rack tool). `racks/Racks.svelte:700`
- [ ] **Quick-fill a row with a SKU** — "↺ Fill" applies one catalogue product to every rack (or every VCM) already in the row. *cad:* missing. `racks/Racks.svelte:652`
- [x] **Rename a row** — row name edited in Row Builder. *cad:* missing (a row gets its name only when made with "New row…"). `racks/parts/RowEditor.svelte:96`
- [ ] **Delete a row** — × on a row pill deletes the row with its racks and devices, after a confirm. *cad:* missing (no row delete; only deleting the whole level removes rows). `racks/parts/RoomSelector.svelte:85`
- [x] **One row at a time** — row pills pick the active row; the elevation and lists show only its racks. *cad:* different: a room's elevation shows every row side by side with a gap; the view spec can hold one row but nothing opens it. `racks/Racks.svelte:167`
- [x] **Reorder racks by drag** — drag one or several racks in the list to change their order in the row. *cad:* different: the order comes from the racks' plan positions along the row. `racks/parts/RackList.svelte:76`

### Catalogue
- [ ] **Catalogue browser** — racks / VCMs / accessories with search, maker, colour, RU filters and "compatible with this row only". *cad:* missing. `racks/parts/CatalogBrowser.svelte:139`
- [ ] **Add a rack from the catalogue** — "+ Add" makes a rack with the product's size, SKU, colour, depth range, front protrusion and containment caps. *cad:* missing (no way to link a rack to a product; only the imported `catalogId`). `racks/Racks.svelte:405`
- [ ] **Custom catalogue products** — create and delete your own products (maker, SKU, kind, colour, RU, W, D), shared by all projects. *cad:* missing (the cad BOM reads only the Panduit seed). `racks/parts/CatalogBrowser.svelte:52`
- [ ] **Product page link** — opens the maker's page for a product. *cad:* partial: the link is only in the Rack BOM Excel. `racks/parts/CatalogBrowser.svelte:231`
- [x] **Rack maker / model / SKU / colour** — shown and edited in rack properties. *cad:* missing (Rack has `catalogId` and `color` but no UI, and no maker / model). `racks/parts/PropertiesPanel.svelte:73`

### Racks
- [ ] **Add a rack from a form** — label, U, type, width, maker, with no plan position. *cad:* different: the Rack tool (K) draws a rack on the plan like the last one; Unplace takes it off again. `racks/parts/RackList.svelte:116`
- [x] **Rack notes** — free notes per rack, also printed in the row BOM. *cad:* missing (the field is imported but has no UI). `racks/parts/PropertiesPanel.svelte:91`
- [ ] **Desk / shelf heights** — four shelf or tray heights for desk and shelf types, drawn and labelled in the elevation. *cad:* missing. `racks/parts/PropertiesPanel.svelte:64`
- [x] **Edit many racks at once** — label, type, U / mm, width, depth, maker, model, notes for a multi-selection. *cad:* partial: room, row, width, depth, height, rotation, patch frame; not kind or notes. `racks/parts/PropertiesPanel.svelte:36`
- [x] **Range select in the rack list** — Shift-click selects every rack between. *cad:* partial: Shift / Ctrl add or drop one rack; no range. `racks/parts/RackList.svelte:39`

### Devices and the library
- [x] **Devices list** — a sidebar list per rack, front then "Rear mount", "U12: name · type", with delete and Shift range select. *cad:* missing. `racks/parts/RackDevices.svelte:46`
- [x] **Custom device builder** — make a template from scratch (label, type, U, ports, maker), click a template to load it and edit it, search the palette. *cad:* partial: "Save as template…" from a placed device only; templates can't be edited, deleted or searched. `racks/parts/DevicePalette.svelte:83`
- [x] **Default palette items** — includes a Tower PC (200 mm wide), a 27" monitor, a fibre enclosure, a 2U 48-port switch and a 1U server. *cad:* partial: 11 built-ins, none of these; the Kind picker has no "enclosure". `racks/parts/constants.ts:35`
- [x] **Ctrl-drag copies a device** — Ctrl while dragging drops a copy, with a ghost left at the original. *cad:* missing (a phase 3 todo). `racks/Racks.svelte:850`
- [x] **Sideways offset (offsetX)** — devices drag sideways in 25 mm steps, and offsetX is a field (for non-19" items). *cad:* partial: offsetX is drawn but can't be set or dragged. `racks/Racks.svelte:788`
- [ ] **Device width / depth** — editable width (monitors, PCs) and depth. *cad:* partial: they come from the template only; no field. `racks/parts/DeviceProperties.svelte:43`
- [x] **Device maker / model** — text fields per device. *cad:* missing. `racks/parts/DeviceProperties.svelte:53`
- [ ] **Panel server room** — a panel's server room (A–D) set per panel. *cad:* partial: `panel.serverRoomId` exists but has no field; the rack's room is used. `racks/parts/DeviceProperties.svelte:51`
- [x] **Edit many devices at once** — label, height, ports, width, depth, mounting, tier, room, maker, model for a multi-selection. *cad:* partial: face and panel tier only. `racks/parts/DeviceProperties.svelte:18`
- [x] **Overlaps allowed and flagged** — devices may overlap; the U numbers go bold with a red "!" cell. *cad:* different: a place, move or edit that would overlap is refused with the reason. `racks/parts/RackFrame.svelte:122`
- [x] **Other-face devices shown faded** — a rear-mounted device shows at 50 % in the front view (and the reverse), drawn underneath. *cad:* missing: devices on the other face are hidden. `racks/parts/RackElevationRenderer.svelte:71`
- [ ] **Per-project device library** — templates stored per project (`racks/{pid}_library`). *cad:* different: templates are global (`settings/cadDeviceTemplates`); the old libraries were imported once. `racks/+page.svelte:114`

### Rack elevation drawing
- [ ] **Floor, ceiling, slab and walls** — the elevation draws them per room; floor / ceiling levels drag or click-to-type, the walls drag, mirrored in the rear view. *cad:* missing: the rack view draws only an FFL line, and level heights have no editor anywhere. `racks/parts/RackElevationRenderer.svelte:131`
- [x] **Room title** — "L01 — Room A" over the elevation. *cad:* missing in the rack view (the level name sits in the pane corner). `racks/parts/RackElevationRenderer.svelte:119`
- [x] **Rack caption** — "42U 4-post" / "1600mm desk" beside the name, and "REAR" in the rear view. *cad:* partial: the name only. `racks/parts/RackFrame.svelte:36`
- [x] **U numbers on every U, both rails** — *cad:* partial: a tick every U, numbers every 5 U, on one side. `racks/parts/RackFrame.svelte:113`
- [ ] **VCM and desk / shelf drawings** — a VCM with finger channels and hatching; a desk or shelf with tray lines and their heights. *cad:* missing: plain rectangles. `racks/parts/RackFrame.svelte:56`
- [x] **Drop ghost** — a dashed outline shows where a device will land while dragging it in from the palette or moving it. *cad:* partial: the rack and U under the cursor show in the status line; no ghost. `racks/parts/RackElevationRenderer.svelte:270`
- [ ] **Print the elevation (A3 landscape)** — browser print fits the room (walls, ceiling, slab) to A3 with a "project - floor - room Elevation" title. *cad:* different: put the room's racks in a sheet viewport at 1:N, then print / PDF the sheet. `racks/Racks.svelte:909`

### Plan view and room objects
- [ ] **Schematic rack plan** — rows drawn from a row origin with an outline, a FRONT line and colours / hatching by rack type (read-only now). *cad:* different: racks stand at real positions on the floorplan with a front line and door swings. `racks/parts/RackPlanRenderer.svelte:394`
- [ ] **Door object** — click to place a 900 mm door; rotation 0 / 90 / 180 / 270, swing left / right. *cad:* different: a door is an opening in a wall, with its swing (Opening tool, H). `racks/parts/RackPlanRenderer.svelte:192`
- [ ] **Labelled rectangle** — drag out a rectangle with a label in the middle; corner grips resize it. *cad:* partial: no rectangle tool; a Line with a label is the nearest. `racks/parts/RackPlanRenderer.svelte:210`

### BOM
- [x] **On-screen BOM panel** — BOM in the sidebar, scope Current row / Project by row / Consolidated, with totals and product links. *cad:* partial: Excel only, project-wide. `racks/parts/BOMPanel.svelte:55`
- [x] **BOM by row in Excel** — a "Row BOM" sheet (each row's lines), "Consolidated", and a "Notice" sheet (project, scope, date, disclaimer). *cad:* partial: one consolidated "Rack BOM" sheet beside the project BOM; no per-row sheet, no notice. `racks/parts/bomExcel.ts:75`
- [x] **Desks / shelves and notes in the BOM** — every rack is listed, desks and shelves too, with its notes and "no catalog SKU". *cad:* partial: desks and shelves are skipped and rack notes aren't shown. `racks/parts/bom.ts:107`

### Floors, history, canvas
- [x] **Floor manager** — add floors (number + room count), renumber, label, server-room count 1–4, room names, areas, delete. *cad:* partial: levels can be renamed and deleted, server rooms made from rack Properties and renamed in the racks list; no add level, no floor-number edit. `lib/components/FloorManagerDialog.svelte:100`
- [x] **Version history** — Versions panel: named snapshots of the floor / room, restore one. *cad:* missing (undo / redo only). `racks/Racks.svelte:1172`
- [ ] **Change log** — each save writes what changed (with user, floor, room) to `logs/{pid}/racks`. *cad:* missing. `racks/+page.svelte:187`
- [ ] **Touch pan / pinch zoom** — one-finger pan and two-finger pinch on an iPad; a tap clears the selection. *cad:* missing. `racks/parts/Canvas.svelte:113`
- [ ] **Wheel pans, Ctrl-wheel zooms** — plain wheel pans, Shift-wheel pans sideways, Ctrl / Alt / Meta-wheel zooms. *cad:* different: the wheel zooms; pan with a right / middle drag. `racks/parts/Canvas.svelte:52`

<details><summary>Covered in cad (19)</summary>

- Rack name / kind / U / width / depth / mm height — `racks/parts/PropertiesPanel.svelte:51` → `cad/ui/Properties.svelte:287`
- Rack server room picker — `racks/parts/PropertiesPanel.svelte:55` → `cad/ui/Properties.svelte:311`
- Rack in a row (new row) — `racks/Racks.svelte:382` → `cad/ui/Properties.svelte:317`
- Rack kinds (2-post, 4-post, cabinet, desk, shelf, VCM) — `racks/parts/types.ts:25` → `cad/ui/Properties.svelte:288`
- Delete a rack with its devices — `racks/Racks.svelte:423` → `cad/editor/commands.ts:45`
- Place a device at a U (first free U, palette) — `racks/Racks.svelte:469` → `cad/editor/deviceTool.ts:18`
- Placing in the rear view mounts at the rear — `racks/Racks.svelte:575` → `cad/editor/deviceTool.ts:23`
- Drag a device by U / into another rack — `racks/Racks.svelte:836` → `cad/editor/tools.ts:258`
- Device name / kind / U / height / ports / mounting / tier — `racks/parts/DeviceProperties.svelte:32` → `cad/ui/Properties.svelte:353`
- Delete a device — `racks/parts/DeviceView.svelte:51` → `cad/ui/CadShell.svelte:219`
- 0U PDUs — `racks/parts/constants.ts:31` → `cad/views/rackRow.ts:105`
- Front / rear elevation, rear order reversed — `racks/Racks.svelte:204` → `cad/views/rackRow.ts:38`
- 19" frame and U ticks — `racks/parts/RackFrame.svelte:101` → `cad/views/rackRow.ts:89`
- Labels printed flag — `racks/parts/types.ts:101` → `cad/ui/Properties.svelte:401`
- Panduit rack BOM rules (caps, kits, blanking, end panels) — `racks/parts/bom.ts:79` → `cad/domain/rackBom.ts:30`
- Walls on the plan (draw, drag ends, thickness) — `racks/parts/RackPlanRenderer.svelte:178` → `cad/editor/pathTool.ts:90`
- Esc / Delete on the plan — `racks/parts/RackPlanRenderer.svelte:373` → `cad/ui/CadShell.svelte:212`
- Autosave + live remote sync — `racks/Racks.svelte:320` → `cad/persist/sync.ts:25`
- Pan / zoom kept per view; floor / room / view in the URL — `racks/Racks.svelte:134` → `cad/ui/ViewCanvas.svelte:163`, `cad/ui/CadShell.svelte:76`
</details>

## Frames (`routes/projects/[pid]/frames/`, engine `lib/elevation/frames/`)

### Locations (outlet entry)
- [ ] **Generate N locations for a zone** — pick zone A–Z, type a count, Generate makes 001…N (2 ports, desk, room A) without drawing anything. *cad:* missing: outlets are made only by the Outlet tool on the plan. `frames/Frames.svelte:286`
- [ ] **Zones** — locations are listed per zone, or all zones together ("All zones"). *cad:* missing: `zoneId` is imported, but there is no zone column, picker or filter. `frames/parts/ConfigPanel.svelte:53`
- [ ] **Room number per location** — a 4-character room ref, which can go into the label. *cad:* missing (`roomId` is imported; no UI). `frames/parts/LocationRow.svelte:93`
- [ ] **Port count in the list (1–99)** — *cad:* partial: in outlet Properties only (1–48), not in the grid, not for many outlets at once. `frames/parts/LocationRow.svelte:84`
- [ ] **Per-port server room buttons** — "P01:A" toggles A↔B; "50/50", "All A", "All B". *cad:* partial: a select per port in Properties and one for all ports in the grid; no 50/50 split. `frames/parts/LocationRow.svelte:139`
- [x] **Edit many locations at once** — a change on one selected row (ports, type, HL, room, server rooms) applies to every selected row. *cad:* partial: multi-outlet Properties sets tier, usage, mount, server room, height; not port count or room. `frames/Frames.svelte:322`
- [x] **Usage buttons** — one click per type: desk, AP, PR, RS, FR, WC, TV, LK, N/A and custom types. *cad:* partial: a usage select with desk, AP, PR, TV, N/A only; imported RS / FR / WC / LK show as raw codes. `frames/parts/LocationRow.svelte:117`
- [x] **Custom location types** — add or remove short codes (e.g. CAM) in Settings. *cad:* missing: the usage list can't be edited. `frames/parts/SettingsDialog.svelte:93`
- [ ] **List ↔ frame selection** — clicking a port selects its location and scrolls the list to it; selecting a location scrolls to its ports and rings them. *cad:* partial: a selected port names its outlet in Properties, but the outlet isn't selected or scrolled to in the grid. `frames/Frames.svelte:405`

### Labels
- [ ] **Generated port labels `FF.Z.NNN-SPP(-H)`** — built from floor, zone, (room), location number, server-room letter and port, `-H` for high-level, and they follow any change to those parts. *cad:* different: labels are stored text (ADR 0002); a new outlet takes the next label plus port suffixes; changing server room or tier doesn't relabel; Relabel-from-pattern is a later todo. `lib/elevation/frames/engine.ts:14`
- [x] **Label format settings** — separator (default / all periods / all hyphens), include zone, include room, a live preview, or an Excel-style template. *cad:* partial: a Port labels format (201.A / 201A / 201-A / 201.1 / 201-1) that can relabel existing ports; the imported `labelPatterns` aren't used. `frames/parts/SettingsDialog.svelte:179`
- [ ] **Floor format L01 / 01F / 01** — how floors show in labels, tabs and Excel. *cad:* different: level names are free text (✎ rename). `frames/parts/SettingsDialog.svelte:156`

### Frame view
- [ ] **Frame termination map** — per frame, every RU top-down: panels as 24-column grids (2 rows for 48 ports), device slots named by type, empty RUs, HL badge, port column numbers. *cad:* partial: the rack elevation shows ports with zoom-dependent labels; the readable panel strip is deferred (phase 3 §9.5). `frames/parts/FrameDrawing.svelte:209`
- [ ] **Port cells coloured by usage** — plus a ring for ports going to server room B. *cad:* missing: cells show only linked / labelled / reserved. `frames/parts/PortCell.svelte:16`
- [ ] **Port tooltip** — the full label, and the reservation, on hover. *cad:* missing. `frames/parts/PortCell.svelte:40`
- [ ] **"Rear panel" marker** — an empty RU says when a panel sits there on the other face. *cad:* missing (other-face devices are hidden). `frames/parts/FrameDrawing.svelte:271`
- [ ] **Frame picker and info** — a tab per frame, grouped and coloured by room when there are more than 6; info shows room, RU, floor / HL panel ranges, slots. *cad:* partial: the racks list groups by room with an Elevation button; no per-frame info. `frames/parts/FrameToolbar.svelte:41`
- [ ] **Sidebar / stacked layout** — a toggle puts the location list beside or above the frame. *cad:* missing (one fixed layout). `frames/Frames.svelte:656`

### Reservations (block assign)
- [ ] **Window-select ports** — drag a rectangle over port cells, across panels and frames; Shift adds, Ctrl toggles. *cad:* partial: click / Shift range / Ctrl toggle within one device; the window select is a todo. `frames/parts/FrameDrawing.svelte:119`
- [ ] **Block assign bar** — the port count, one coloured button per usage, Remove and Deselect. *cad:* partial: Port Properties "Reserve for…" with "(clear reservation)". `frames/parts/BlockAssignBar.svelte:20`
- [ ] **Esc / Delete on selected ports** — Esc deselects; Delete / Backspace removes their reservation. *cad:* missing (Delete acts on the selected entities, not on reservations). `frames/Frames.svelte:472`
- [ ] **Reserved cells show the usage** — an empty reserved port is tinted in its usage colour with the code; a filled one gets a colour bar. *cad:* partial: dashed purple, the same for every usage. `frames/parts/PortCell.svelte:55`

### Allocation
- [ ] **Live allocation** — the frames refill from the location list on every edit. *cad:* different: Allocate / Re-allocate with a preview, sticky links and pins, Assign by hand. `frames/Frames.svelte:180`
- [ ] **Overflow onto the last frame** — labels beyond a room's capacity are pushed onto its last frame. *cad:* different: what doesn't fit is reported, never squeezed in. `lib/elevation/frames/engine.ts:327`

### Excel and print
- [x] **Frame Excel (grid layout)** — one sheet per frame or per room (a setting); RU rows × 24 port columns coloured by usage, reserved cells, merged device slots, racks side by side with bottoms aligned, A3 landscape fit-to-page, footer with file name and page. *cad:* partial: "Export panel labels" is a flat list (room, rack, panel, U, port, label, outlet), then offers Mark printed. `frames/parts/exportExcel.ts:24`
- [ ] **Print the frame drawing** — browser print hides the location pane and prints the frames. *cad:* different: rack elevations go on sheets and print to PDF. `frames/Frames.svelte:716`

### History and floors
- [ ] **Change log dialog** — edits with time, floor, user name and a field-level description; Refresh; delete an entry after a confirm. *cad:* missing. `frames/parts/LogsDialog.svelte:104`
- [x] **Version history** — snapshots of the floor, restore one. *cad:* missing (undo / redo only). `frames/Frames.svelte:704`
- [ ] **Floor manager and floor tabs** — add floors, server-room count 1–4, room names; tabs switch floor. *cad:* partial: as in Racks (levels list: rename / delete only). `frames/Frames.svelte:563`

<details><summary>Covered in cad (12)</summary>

- High-level flag (HL) → tier — `frames/parts/LocationRow.svelte:106` → `cad/ui/OutletGrid.svelte:164`
- Usage per location — `frames/parts/LocationRow.svelte:117` → `cad/ui/OutletGrid.svelte:158`
- Server room per port — `frames/parts/LocationRow.svelte:139` → `cad/ui/Properties.svelte:274`
- Shift / Ctrl multi-select of locations — `frames/Frames.svelte:374` → `cad/ui/OutletGrid.svelte:81`
- Ports go to panels of their own server room — `lib/elevation/frames/engine.ts:309` → `cad/domain/allocate.ts:111`
- High-level ports to high-level panels — `lib/elevation/frames/engine.ts:332` → `cad/domain/allocate.ts:121`
- Panels filled top U down — `lib/elevation/frames/engine.ts:111` → `cad/domain/allocate.ts:59`
- Reserved ports take their usage first — `lib/elevation/frames/engine.ts:128` → `cad/domain/allocate.ts:116`
- N/A locations get no port — `lib/elevation/frames/engine.ts:50` → `cad/domain/allocate.ts:75`
- Frames come from the racks' panels, front / rear face — `frames/Frames.svelte:76` → `cad/views/rackRow.ts:76`
- Short label without the floor prefix — `frames/parts/PortCell.svelte:29` → `cad/views/rackRow.ts:69`
- Autosave, floor / frame in the URL — `frames/Frames.svelte:242` → `cad/persist/sync.ts:25`, `cad/ui/CadShell.svelte:76`
</details>


## Patching (`routes/projects/[pid]/patching/`)

Note: the legacy route redirects to the Elevations Patching tab unless `?legacy=1` (`patching/+page.svelte:14`).

### Cord drawing and display (rack elevation)
- [x] **Re-route an end (F / T)** — select a cord, click "Re-route From" or "Re-route To", then click the new port; an installed cord becomes a `change`. *cad:* missing: `repatch()` exists in the domain but there is no UI to move an end (phase3.md says "not yet"). `patching/parts/ElevationView.svelte:439`
- [x] **F / T end badges** — the two ends of the selected cord get amber "F" and violet "T" badges and rings. *cad:* missing (the trace highlights the circuit in orange, with no end marks). `patching/parts/ElevationPort.svelte:96`
- [x] **Cords drawn along cable channels** — cords run orthogonally down to the side channels and through the nearest horizontal manager when they cross sides. *cad:* partial: cords are drawn as a straight line with a sag (`cad/views/rackRow.ts:150`); the length maths uses managers but the drawing does not. `patching/parts/cableUtils.ts:206`
- [ ] **Cable labels on the drawing** — settings toggles show the cable type and / or length at each cord's midpoint. *cad:* missing. `patching/parts/CableOverlay.svelte:98`
- [x] **Hover a cord** — hovering a cord thickens it, dims all others and shows a tooltip "from → to, type, length, status". *cad:* missing (no hover state or tooltip on cords). `patching/parts/CableOverlay.svelte:127`
- [x] **Port tint by usage** — each panel port cell is tinted by its outlet's usage (location type) colour. *cad:* missing: port cells show only linked / labelled / reserved / stale (`cad/views/rackRow.ts:131`). `patching/parts/ElevationPort.svelte:35`
- [ ] **Port cord dot and tooltip** — a patched port shows a dot in the cord's colour, and its tooltip gives the label, cable type, length and status. *cad:* partial: no cord dot on the port; the port label shows in the cell and in Port Properties. `patching/parts/ElevationPort.svelte:44`
- [ ] **Duplicate port warning** — a port used by more than one cord gets a pulsing red dot and "DUPLICATE" in its tooltip. *cad:* different: the gate refuses a second cord on a port (`cad/domain/cords.ts:35`), but duplicates that came in from an import are not flagged. `patching/parts/elevationUtils.ts:117`
- [ ] **Refresh length button** — the info bar has a button that re-estimates the selected cord's length and unlocks it. *cad:* different: untick "lock" in Cord Properties, which sets the auto length (`cad/ui/CordProps.svelte:51`). `patching/parts/ElevationView.svelte:433`

### Cord defaults and settings
- [ ] **Default status for new cords** — a sidebar toggle (and the settings / bulk panel) makes new cords start as "Add" or "Installed" (for recording existing cords as built). *cad:* missing: new cords are always `add` (`cad/domain/cords.ts:99`). `patching/Patching.svelte:466`
- [x] **Custom cable types** — settings dialog to add, rename, recolour, set category (copper / fibre / other) and delete project cable types. *cad:* missing: `settings.cableTypes` has no editor; only legacy custom types come in by import (`cad/persist/import/legacyCabling.ts:175`). `patching/parts/SettingsDialog.svelte:116`
- [ ] **Built-in cord types** — U/UTP, S/FTP, F/UTP, U/FTP, OS2, OM3, OM4 and DAC with their colours. *cad:* partial: cad's list is Cat6A / Cat6 / OS2 (`cad/persist/import/legacy.ts:94`); imported cords with the legacy built-in ids show the raw id (e.g. "uutp"). `patching/parts/constants.ts:10`
- [ ] **Saved project defaults** — default cable type, colour and new-cord status are saved in the patching doc. *cad:* partial: the cord tool's type / colour are sticky for the session only (`cad/app/workspace.svelte.ts:59`); `settings.defaults` has no editor. `patching/parts/SettingsDialog.svelte:88`

### Patch list (bottom pane)
- [x] **Sort by column** — click From / To / Cable / Len / Status headers to sort up or down. *cad:* missing (fixed order). `patching/parts/PatchListPane.svelte:284`
- [x] **Bulk status actions** — tick rows, then Mark Installed / Mark Add / Restore / Delete for all of them at once. *cad:* partial: Delete works on a multi-selection (`cad/editor/commands.ts:25`); Installed, Revert and status changes are one cord at a time in Cord Properties. `patching/parts/PatchListPane.svelte:256`
- [x] **Purge removed** — one button hard-deletes every cord marked `remove`. *cad:* missing: each cord needs "Removed on site" in its Properties (`cad/ui/CordProps.svelte:58`). `patching/parts/PatchListPane.svelte:245`
- [x] **Set any status** — the row editor has a free Status select (add / change / remove / installed). *cad:* different: only workflow buttons (Installed, Remove / Delete, Revert) (`cad/ui/CordProps.svelte:57`). `patching/parts/PatchListPane.svelte:441`
- [ ] **Checkbox selection** — row checkboxes, a select-all-visible header box and an "N selected · Unselect" bar. *cad:* partial: Shift / Ctrl-click select rows (`cad/ui/PatchList.svelte:40`), but no checkboxes or select-all. `patching/parts/PatchListPane.svelte:276`
- [ ] **Notes column and search** — the list shows notes, and the filter also matches cable type and notes. *cad:* partial: no notes column; Find matches ends, labels and cord ID only (`cad/ui/PatchList.svelte:36`). `patching/parts/PatchListPane.svelte:85`
- [ ] **Change marks in rows** — a ↶ next to an end that was moved, with "Was: …" on hover; removed rows are struck through. *cad:* partial: "Was" shows in Cord Properties only (`cad/ui/CordProps.svelte:35`); list rows have a status chip, no ↶ or strike. `patching/parts/PatchListPane.svelte:318`
- [x] **Scroll to selection** — a cord selected in the elevation scrolls its row into view. *cad:* missing (the row is highlighted but not scrolled to). `patching/parts/PatchListPane.svelte:188`
- [ ] **Orphan warning** — a banner counts cords whose rack or device no longer exists, and their rows are highlighted amber. *cad:* different: deleting a device deletes its cords (`cad/editor/commands.ts:40`); the importer skips orphans with an import note (`cad/persist/import/legacyCabling.ts:179`). `patching/Patching.svelte:761`

### Bulk patching and the device sidebar
- [ ] **Bulk patch form** — click a From device and a To device in the sidebar, then set from-port, to-port, count, cable type and status, and create; used ports are skipped. *cad:* partial: select ports, then "Patch N ports to…" and click the first target port (`cad/ui/PortProps.svelte:85`); no typed count / start ports and no status choice. `patching/Patching.svelte:593`
- [ ] **Device tree with port use** — racks → devices with U, name and "used / total" ports, colour-marked FROM / TO. *cad:* partial: the racks list shows rooms and racks (`cad/ui/RackList.svelte:47`), not devices or port counts. `patching/Patching.svelte:507`
- [ ] **Summary tab** — totals for cords, ports used / total, and counts per status. *cad:* partial: the patch list's status chips show counts (`cad/ui/PatchList.svelte:54`); no ports used / total. `patching/Patching.svelte:556`
- [x] **On-screen cord BOM** — the summary tab lists cords by type, then by length with quantities. *cad:* partial: the same table is only in the Excel BOM sheet (`cad/render/exports.ts:79`). `patching/Patching.svelte:566`

### Exports
- [ ] **Patch schedule per room** — Export writes the schedule for the open floor + room, named and titled "F{n} Room {r}". *cad:* partial: the Excel button exports every cord in the project (`cad/ui/PatchList.svelte:16` passes no room, though `patchScheduleRows` takes one at `cad/render/exports.ts:35`). `patching/parts/exportExcel.ts:131`

### Floors, saving, history
- [ ] **Floor / room switcher** — buttons per floor and per server room (A–D), kept in the URL. *cad:* different: levels list on the left and an Elevation button per room in the racks list (`cad/ui/RackList.svelte:54`). `patching/Patching.svelte:673`
- [ ] **Manage floors** — the + button opens the shared floor manager (add / delete floors, room counts, labels, areas). *cad:* partial: levels can be renamed and deleted (`cad/ui/CadShell.svelte:160`); no add level and no room count per floor. `patching/Patching.svelte:683`
- [ ] **Change log** — every edit is written to `logs/{pid}/patching` with who, what and the floor / room. *cad:* partial: each doc keeps only its last `updatedBy` / `updatedAt` (`cad/persist/docs.ts:9`); there is undo but no history log. `patching/+page.svelte:156`

<details><summary>Covered in cad (19)</summary>

- Cord tool: click a port, then another; Esc cancels — `patching/parts/ElevationView.svelte:222` → `cad/editor/cordTool.ts:58`
- Cable type picker while patching, sticky — `patching/parts/ElevationView.svelte:385` → `cad/ui/CadShell.svelte:267`
- Unlabelled panel port gate (can't patch until labelled) — `patching/parts/ElevationPort.svelte:42` → `cad/domain/cords.ts:34`
- Estimated length (U run, side channel, manager detour, rack to rack, front↔rear depth, 2U / 5U slack, snapped up to stock) — `patching/parts/cableUtils.ts:68` → `cad/domain/cords.ts:46`
- Length lock / manual length — `patching/parts/PatchListPane.svelte:411` → `cad/ui/CordProps.svelte:47`
- Install workflow: planned delete vs installed → `remove` (soft delete) — `patching/Patching.svelte:350` → `cad/domain/cords.ts:106`
- Moving an installed cord makes it `change` and remembers the old ends — `patching/Patching.svelte:324` → `cad/domain/cords.ts:117`
- Restore a removed / changed cord — `patching/Patching.svelte:376` → `cad/domain/cords.ts:124`
- Mark installed (clears the old ends) — `patching/Patching.svelte:393` → `cad/domain/cords.ts:131`
- Delete / Backspace on the selected cord (ignored in inputs) — `patching/parts/ElevationView.svelte:468` → `cad/ui/CadShell.svelte:212`
- Cord line styles by status (dashed until installed) — `patching/parts/CableOverlay.svelte:91` → `cad/ui/Prims.svelte:139`
- Click a cord or a patched port to select it; list ↔ drawing selection — `patching/parts/ElevationView.svelte:264` → `cad/ui/PatchList.svelte:40`
- Cord editor: type, colour, length, cord ID, notes, "was" ends — `patching/parts/PatchListPane.svelte:362` → `cad/ui/CordProps.svelte:37`
- Patch list: status chips with counts, find box, from / to labels with rack / device / U fallback — `patching/parts/PatchListPane.svelte:231` → `cad/ui/PatchList.svelte:54`
- Patch schedule Excel (status groups, coloured headers, struck-through removals, was-from / to, frozen header, cord BOM sheet) — `patching/parts/exportExcel.ts:128` → `cad/render/exports.ts:25`
- Import cord IDs from the returned sheet (cad matches by a hidden Key, falls back to "#") — `patching/parts/exportExcel.ts:68` → `cad/ui/PatchList.svelte:19`
- Racks side by side with U numbers; pan / zoom; zoom fit — `patching/parts/ElevationView.svelte:141` → `cad/views/rackRow.ts:76`
- Save indicator and live sync from other tabs — `patching/Patching.svelte:752` → `cad/persist/sync.ts:82`
- PDUs and VCMs (filtered out in legacy as broken) are drawn and patchable — `patching/Patching.svelte:81` → `cad/views/rackRow.ts:105`
</details>

## Risers (`routes/projects/[pid]/risers/`)

Note: cad replaces the hand-drawn riser diagram with a generated riser view (`cad/views/riser.ts`); Dave asked for "data only for now".

### Floors shown
- [ ] **Floor range** — From / To pickers limit the drawing to part of the building. *cad:* missing: the riser view always shows every level. `risers/parts/RiserToolbar.svelte:174`
- [x] **Hide floors** — a "Visible n/m" menu with a checkbox per floor, Shift-click ranges, "Hide empty" (floors with no server room) and "Show all". *cad:* missing (phase5.md: floor compression "later, if needed"). `risers/parts/RiserToolbar.svelte:188`
- [x] **Compression breaks** — hidden floors leave a half-height hatched gap reading "N floors hidden", with double break lines across each ladder. *cad:* missing. `risers/Risers.svelte:1126`
- [ ] **Floor bands in full** — each floor draws plenum, ceiling line, clear height, raised-floor void and top, slab, a roof slab, and the floor name in the margin. *cad:* partial: slab, FFL and ceiling line with "name FFL x.xx" (`cad/views/riser.ts:58`); no raised-floor void, plenum or roof slab. `risers/parts/FloorBand.svelte:24`
- [ ] **Building extent and skipped floors** — the floor manager sets the building's bottom / top floor and floors that don't exist (e.g. no 4F). *cad:* partial: levels come from data; cad can rename / delete levels (`cad/ui/CadShell.svelte:160`) but not add one or edit its elevation and heights. `risers/+page.svelte:163`

### Riser drawings
- [ ] **Several riser drawings** — a picker to switch, create, rename and delete riser drawings per project, kept in the URL (`?d=`). *cad:* missing: one building-wide riser view (it can be placed on several sheets). `risers/parts/DrawingPicker.svelte:56`
- [ ] **Drawing register entry** — each riser drawing is registered for versioning. *cad:* different: the riser view goes on sheets, which have revisions and issues (`cad/views/sheet.ts:71`). `risers/+page.svelte:136`

### Rooms
- [ ] **EPS rooms** — an EPS tool drops EPS rooms (named EPSnn-A) on a floor; transit hops are expected to be EPS rooms. *cad:* missing: the riser view only shows server rooms (`cad/views/riser.ts:44`). `risers/Risers.svelte:698`
- [ ] **Place server rooms by hand** — the Server tool drops a room on a floor (named IDFnn-A), even with no racks. *cad:* different: a server room appears at the x of its placed racks; rooms with no placed rack are left out (`cad/views/riser.ts:46`). `risers/Risers.svelte:701`
- [ ] **Move rooms** — drag a room sideways, or up / down onto another floor. *cad:* different: position comes from the racks on the plan. `risers/Risers.svelte:761`
- [ ] **Room properties** — label, kind (server / EPS), X, width and colour. *cad:* partial: the name is edited in the racks list (`cad/ui/RackList.svelte:47`); no kind, width or colour on the riser view. `risers/parts/PropertiesPanel.svelte:34`

### Ladders (risers)
- [ ] **Ladder tool** — drag across floors to draw a ladder (named EPS-n, 450 mm wide, high + low). *cad:* different: a riser is drawn once on a plan with Trunk / Conduit + V to another level (`cad/editor/pathTool.ts:53`) and shows on every floor it passes. `risers/Risers.svelte:738`
- [ ] **Stretch a ladder** — top / bottom handles drag the ladder to more floors. *cad:* missing: a drawn riser's levels can't be changed afterwards (Properties edit section, label and Z only, `cad/ui/PathProps.svelte:72`). `risers/parts/Ladder.svelte:147`
- [ ] **Ladder service level** — High only / Low only / Both, shown as a HIGH / LOW tag. *cad:* missing. `risers/parts/PropertiesPanel.svelte:99`
- [ ] **Ladder properties** — label, from / to floor, X, width, colour. *cad:* partial: label and section width are editable (`cad/ui/PathProps.svelte:78`); no colour, floors fixed, X via the plan. `risers/parts/PropertiesPanel.svelte:88`

### Cables
- [ ] **Draw a cable route by hand** — Cable tool: click the first room, a ladder, then the next room; it commits itself, Enter commits, Esc cancels. *cad:* different: backbone cables are made with "Interconnect to…" between panels (`cad/ui/PortProps.svelte:86`) and routed automatically through drawn risers. `risers/Risers.svelte:541`
- [ ] **Multi-core cable spec** — a cable is one item with free text "OM4 48-core", parsed into media, spec, count and unit (core / port / pair). *cad:* partial: cad has one link per port with a cable type, grouped on the view as "24 × cat6a" (`cad/views/riser.ts:108`); no single multi-core cable or core count. `risers/parts/CableEditor.svelte:48`
- [x] **Cable label and colour** — an optional label and a colour per cable (defaults: fibre amber, copper blue). *cad:* missing: groups are labelled by count × type · length, in one style. `risers/parts/CableEditor.svelte:85`
- [x] **Route editor** — list of hops: room, "exits at" / "enters at" high or low, via ladder; insert, move up / down, remove hops. *cad:* different: routes are derived; you can only force which riser to use (`cad/ui/PortProps.svelte:95`). `risers/parts/CableEditor.svelte:104`
- [x] **High / low level of a cable** — each hop runs in the ceiling plenum or the floor void and the drawing shows it at that height. *cad:* missing on the riser view (routes use real run heights on the plans, but the view draws groups at a fixed height). `risers/parts/engine.ts:451`
- [ ] **Transit rooms** — a cable can pass through intermediate rooms (shown as "(n transit)"). *cad:* different: a cable runs panel to panel; transit is either through the containment graph or a separate link per hop. `risers/parts/CableList.svelte:26`
- [ ] **Route checks** — warns when a hop changes floor without a ladder, the ladder doesn't reach both floors, or a transit room isn't an EPS. *cad:* different: an unrouted link gets a "no route" reason (`cad/domain/routing.ts:250`). `risers/parts/engine.ts:202`
- [x] **Cable list** — "Cables (n)" with colour, label / type and "A/F → B/F (n transit)", plus "+ New". *cad:* missing: no list of backbone cables; you see them per panel in Port Properties → Cable. `risers/parts/CableList.svelte:30`

### Annotation and layout
- [x] **Text labels on the diagram** — Label tool: multi-line text with font size, wrap width, colour, background, X / Y, dragged into place. *cad:* partial: Text / Leader / Cloud notes exist, but only on sheets, and with no font size / colour / background fields. `risers/parts/RisersSidebar.svelte:63`
- [ ] **Building width** — drag the left / right building walls to resize the drawing (contents shift with the left wall). *cad:* different: the view's width comes from the rooms and risers placed in plan. `risers/Risers.svelte:813`
- [ ] **Colours per item** — rooms, ladders and cables each take a colour. *cad:* missing (fixed styles). `risers/parts/RoomBox.svelte:43`
- [ ] **Status bar** — shows the floor range, total stack height (m), the current tool's hint and a zoom % button that fits. *cad:* partial: tool hints and Home / Fit exist (`cad/ui/CadShell.svelte:222`); no stack height. `risers/Risers.svelte:1243`
- [ ] **Change log** — edits are written to `logs/{pid}/risers` with before / after values. *cad:* partial: last writer per doc only (`cad/persist/docs.ts:9`). `risers/+page.svelte:152`

<details><summary>Covered in cad (7)</summary>

- A building elevation of floors with server rooms, risers and backbone cables — `risers/Risers.svelte:1107` → `cad/views/riser.ts:39`
- Floor stacking from per-floor heights (slab / raised floor / clear / plenum, defaults 200 / 300 / 2600 / 700) — `risers/parts/engine.ts:63` → `cad/persist/import/legacy.ts:32`
- Parallel cables laid side by side in lanes through a shared riser — `risers/parts/engine.ts:397` → `cad/views/riser.ts:94`
- A label on each cable / riser — `risers/parts/CablePath.svelte:86` → `cad/views/riser.ts:72`
- Select an item; Delete removes it; Esc clears — `risers/Risers.svelte:995` → `cad/ui/CadShell.svelte:212`
- Pan (right / middle drag), wheel zoom, touch, fit — `risers/parts/Canvas.svelte:28` → `cad/ui/ViewCanvas.svelte:216`
- Print — `risers/parts/Canvas.svelte:120` → `cad/views/sheet.ts:71` (riser view on sheets and PDF)
</details>

## Fill rate (`routes/projects/[pid]/fillrate/`)

Note: cad computes fill on drawn runs from routed cables (Dave: "only drawn runs, the simplest version; free sections maybe later").

### Sections
- [ ] **Free fill sections** — FR-001, FR-002 … sections not tied to any drawing, each a containment size plus cable groups typed by hand. *cad:* missing (phase5.md §6a.4: maybe later). `fillrate/FillRate.svelte:76`
- [ ] **Cable groups by hand** — rows of quantity × diameter (mm), add / remove rows. *cad:* different: cables come from links routed through the run, by cable type (`cad/domain/fill.ts:38`). `fillrate/parts/SectionEditor.svelte:98`
- [ ] **Cable diameters** — each group's outer diameter is typed in. *cad:* partial: diameters come from the cable type's `diameterMm` or a built-in table (`cad/domain/fill.ts:15`); there is no UI to set `diameterMm`. `fillrate/parts/SectionEditor.svelte:104`
- [ ] **Wall thickness** — a rectangular section's wall (default 3 mm) is taken off each side to get the inside area. *cad:* partial: fill uses `section.inner` when set (`cad/domain/fill.ts:23`), but it is only set by the conduit import; Properties edit the outer width / height only (`cad/ui/PathProps.svelte:72`). `fillrate/parts/SectionEditor.svelte:76`
- [ ] **Non-data cables** — any cable (power, coax …) can be counted, since groups are typed by hand. *cad:* missing: only routed links count; cords and undrawn cables don't. `fillrate/parts/constants.ts:63`
- [ ] **Section list** — a sidebar of all sections with label, size, cable count and fill % in colour, plus Add, Delete, reorder ↑ ↓ and rename. *cad:* partial: each run shows its fill in Properties and the plan's Fill overlay (`cad/ui/ViewCanvas.svelte:367`); no list of all runs with their fill. `fillrate/FillRate.svelte:128`

### Calculation and display
- [ ] **Calc method per section** — toggle cable area as d² (rectangular) or πr² (circular). *cad:* different: always d² (Dave's decision, `cad/domain/fill.ts:55`). `fillrate/parts/SectionEditor.svelte:55`
- [ ] **Fill bands and status text** — colours at 40 / 60 / 100 % and a status line ("Low – plenty of space" … "Overfilled – exceeds capacity!"). *cad:* different: one 40 % limit, amber from 30 %, red over (`cad/domain/fill.ts:73`); no status text. `fillrate/parts/constants.ts:74`
- [ ] **Section drawing details** — the canvas shows the outer and inner wall, the size "W × H mm (tN)" or "Ø D mm", the fill %, and each cable's diameter written in it. *cad:* partial: the packed picture shows the wall and cables coloured by type with the inside size (`cad/ui/RunFill.svelte:41`); no outer wall, no diameters in circles. `fillrate/parts/SectionCanvas.svelte:81`

### Output
- [ ] **Print all sections (A3)** — Print lays every section card out on A3 landscape under "Containment Fill Rates". *cad:* missing: the fill picture is only in Properties, and the Fill overlay is not in the sheet / PDF display list (`cad/ui/ViewCanvas.svelte:112`). `fillrate/FillRate.svelte:117`
- [ ] **Change log** — edits are written to `logs/{pid}/fillrate`. *cad:* partial: last writer per doc only (`cad/persist/docs.ts:9`). `fillrate/+page.svelte:38`

<details><summary>Covered in cad (5)</summary>

- Round and rectangular containment — `fillrate/parts/SectionEditor.svelte:49` → `cad/domain/fill.ts:24`
- Fill % = cable area ÷ inside area — `fillrate/parts/constants.ts:51` → `cad/domain/fill.ts:59`
- Packed-cable picture (largest first, gravity packing) — `fillrate/parts/packing.ts:20` → `cad/domain/fill.ts:78`
- Run labels (FR-style names) — `fillrate/parts/constants.ts:47` → `cad/ui/PathProps.svelte:78`
- Save indicator and live sync — `fillrate/FillRate.svelte:61` → `cad/persist/sync.ts:82`
</details>


## Sheets tool (`routes/projects/[pid]/sheets/`)

Note: the legacy Sheets tool EDITS tool data inside its viewports (double-click a viewport → the Outlets / Racks / Risers / 3D editor runs in place). cad draws viewport content read-only and edits in the view panes (`cad/views/sheet.ts:3`), so most "edit inside a viewport" items are listed as *different* and the editing itself is judged against cad's plan / rack / riser views. The sheets tool's own drawing sets (`sheetPackages`, `sheets/packages/[pkgId]/print`) are covered here; the separate `packages/` and `drawings/` tools are in 06.

### Viewports on the sheet
- [x] **Copy / cut / paste / duplicate viewports** — Ctrl+C / X / V / D on selected viewports; the clipboard is in localStorage so it pastes on another sheet or in another project (a 3D viewport brings its model along). *cad:* missing. `sheets/viewports.svelte.ts:42`, `sheets/viewports.svelte.ts:279`, `sheets/SheetEditor.svelte:239`
- [x] **Select several viewports** — marquee (crossing) on empty paper, Shift / Ctrl-click a frame to add; Delete removes them all. *cad:* missing: one viewport at a time (`cad/editor/tools.ts:142`). `sheets/viewports.svelte.ts:325`, `sheets/Viewport.svelte:44`
- [x] **Edge snapping while moving / resizing** — frame edges snap to the paper edge, margin, title-block edges and a 5 mm grid; Alt turns it off. *cad:* partial: moves snap to 0.5 mm only (`cad/editor/tools.ts:270`). `sheets/Viewport.svelte:23`, `sheets/SheetEditor.svelte:95`
- [ ] **Viewport numbers** — with 2+ viewports each gets a number in reading order (top-down, then left-right), or a manual number; shown before the label for cross-references. *cad:* missing. `sheets/viewports.svelte.ts:19`, `sheets/parts/ViewportPropertiesWindow.svelte:179`, `sheets/Viewport.svelte:300`
- [ ] **Fit scale** — scale 0 = auto-fit the content into the window, shown as "1:N (fit)". *cad:* partial: always a fixed 1:N; Fit only re-centres (`cad/ui/SheetProps.svelte:104`). `sheets/Viewport.svelte:25`, `sheets/viewports.svelte.ts:203`
- [ ] **Wheel zoom inside an active viewport** — toggle "pan/zoom content", then wheel changes the viewport scale about the cursor and right / middle drag pans. *cad:* partial: Ctrl-drag pans the view (`cad/editor/tools.ts:152`); scale only from Properties. `sheets/Viewport.svelte:193`, `sheets/Viewport.svelte:324`
- [ ] **Edit content in place** — double-click a viewport to activate it and edit its tool data (outlets, racks, risers, 3D) and markup inside the frame. *cad:* different: content is not pickable on the sheet; you edit in a plan / rack / riser pane, side by side via Split (`cad/views/sheet.ts:3`, `cad/ui/CadShell.svelte:294`). `sheets/SheetEditor.svelte:220`
- [ ] **Model mode** — "Open in model mode" fills the window with one viewport's content (own pan / zoom, saved per viewport); Esc returns to the sheet. *cad:* different: open the view in a pane. `sheets/Viewport.svelte:327`, `sheets/edit/ModelView.svelte:16`
- [x] **Insert a viewport by dragging a box** — Insert ▸ Viewport, then drag the rectangle (min 20 mm). *cad:* different: "Add viewport" fills the drawing area, then resize by corner grips (`cad/ui/SheetProps.svelte:127`). `sheets/SheetMenubar.svelte:49`, `sheets/viewports.svelte.ts:315`
- [ ] **Pick by frame only** — a viewport is grabbed by thin edge strips so the inside stays click-through. *cad:* different: the whole window picks (`cad/views/sheet.ts:122`). `sheets/Viewport.svelte:360`

<details><summary>Covered in cad (8)</summary>

- Move a viewport by dragging — `sheets/Viewport.svelte:44` → `cad/editor/tools.ts:218`
- Resize by corner handles — `sheets/Viewport.svelte:373` → `cad/editor/tools.ts:218`
- Scale list + custom 1:N — `sheets/Viewport.svelte:340` → `cad/ui/SheetProps.svelte:84`
- Label (printed with the viewport) — `sheets/parts/ViewportPropertiesWindow.svelte:178` → `cad/views/sheet.ts:126`
- Printed border on / off — `sheets/parts/ViewportPropertiesWindow.svelte:185` → `cad/ui/SheetProps.svelte:108`
- Delete viewport (Delete key) — `sheets/viewports.svelte.ts:154` → `cad/ui/SheetProps.svelte:110`
- Undo / redo of viewport moves / adds / deletes — `sheets/viewports.svelte.ts:121` → `cad/ui/CadShell.svelte:210`
- Content clipped to the window, overlapping windows hide what's under — `sheets/Viewport.svelte:291` → `cad/views/sheet.ts:122`
</details>

### Markup (annotations) — the kinds
- [x] **Free line / arrow** — line or arrow with start / end heads (none / arrow / dot / tick) and an optional label along it. *cad:* partial: a Line tool in plan / elevation only, no heads, nothing on paper (`cad/app/workspace.svelte.ts:24`). `sheets/annotations/AnnotationLayer.svelte:254`, `sheets/edit/AnnotationControls.svelte:246`
- [x] **Dimension** — two-point dimension with auto length label in mm / m / km / none, label at start / middle / end, typed length. *cad:* missing (the `dimension` geometry exists, no tool: `cad/domain/shapes.ts:74`). `sheets/annotations/AnnotationLayer.svelte:261`, `sheets/edit/AnnotationControls.svelte:219`
- [x] **Rectangle and ellipse** — boxes / ellipses with stroke, fill, dash; Shift-drag makes a square / circle. *cad:* missing: no rect / circle tool. `sheets/annotations/AnnotationLayer.svelte:159`, `sheets/edit/TransformBox.svelte:48`
- [x] **Callout** — leader + text box with border none / underline / box; press at the tip, drag to the text. *cad:* partial: Leader with optional text, no border styles (`cad/views/plan.ts:198`). `sheets/annotations/AnnotationLayer.svelte:126`, `sheets/annotations/annotations.svelte.ts:137`
- [ ] **Section / detail marker** — circle symbol with a drawing ref, linked to another sheet. *cad:* partial: section cut marks with a name on the plan, no sheet link (`cad/views/section.ts:69`). `sheets/annotations/symbols/registry.ts:5`, `sheets/edit/AnnotationControls.svelte:323`
- [ ] **Elevation / section tag** — centre circle = drawing no., up to 4 arrows (N / E / S / W) each with its own viewport ref. *cad:* missing. `sheets/annotations/AnnotationLayer.svelte:204`, `sheets/edit/AnnotationControls.svelte:310`
- [ ] **Photo marker linked to a survey photo** — pick survey then photo. *cad:* missing. `sheets/annotations/AnnotationLayer.svelte:168`, `sheets/edit/AnnotationControls.svelte:332`
- [ ] **North arrow** — symbol with "N". *cad:* missing. `sheets/annotations/AnnotationLayer.svelte:171`
- [ ] **Outlet symbol as markup** — triangle in square / circle by mount, filled = low, port count, label above, usage abbreviation below, room; free-standing (not project data). *cad:* different: outlets are data, drawn by blocks (`cad/views/plan.ts:185`). `sheets/annotations/AnnotationLayer.svelte:174`, `sheets/edit/AnnotationControls.svelte:281`
- [ ] **Door symbol** — leaf + swing arc, flip for hinge side. *cad:* different: openings in walls with swing (`cad/domain/openings.ts:26`). `sheets/annotations/AnnotationLayer.svelte:227`, `sheets/edit/AnnotationControls.svelte:279`
- [x] **Faceplate symbol** — wall outlet faceplate. *cad:* different: outlets draw as faceplates in elevations (`cad/views/elevation.ts:90`). `sheets/annotations/AnnotationLayer.svelte:199`
- [x] **Image** — an image from a URL or data URL, fitted in a box. *cad:* missing (the `image` geometry exists, no tool: `cad/domain/shapes.ts:78`). `sheets/annotations/AnnotationLayer.svelte:235`, `sheets/edit/AnnotationControls.svelte:192`
- [x] **Floor-tile grid** — tiles of N mm in a box, offset X / Y to line up with the real floor, drawn in its layer colour. *cad:* missing. `sheets/annotations/AnnotationLayer.svelte:134`, `sheets/edit/AnnotationControls.svelte:223`
- [x] **Legend on the drawing** — titled box listing the layers (swatch + name + item count), layers can be excluded. *cad:* partial: an on-screen Legend panel of blocks used, not placed on sheets (`cad/ui/Legend.svelte:13`). `sheets/annotations/AnnotationLayer.svelte:145`, `sheets/edit/AnnotationControls.svelte:232`
- [ ] **Markup anywhere in a viewport's model space** — every kind above can be drawn inside any viewport, stored per viewport. *cad:* partial: Text / Leader / Cloud on sheets only (tied to a viewport when drawn in one) (`cad/app/workspace.svelte.ts:27`). `sheets/types.ts:79`, `sheets/edit/EditBackground.svelte:27`

<details><summary>Covered in cad (3)</summary>

- Text note — `sheets/annotations/annotations.svelte.ts:125` → `cad/editor/noteTool.ts:56`
- Revision cloud — `sheets/annotations/geometry.ts:58` → `cad/views/plan.ts:94`
- Markup tied to a viewport follows it (stored in the viewport's mm) — `sheets/types.ts:79` → `cad/views/sheet.ts:104`
</details>

### Markup — properties and editing
- [x] **Style per item** — colour, fill, stroke width (mm), dash (solid / dashed / dotted / dash-dot). *cad:* missing in UI (`style` exists on shapes: `cad/domain/shapes.ts:162`). `sheets/edit/AnnotationControls.svelte:254`, `sheets/edit/AnnotationControls.svelte:354`
- [x] **Text options** — multi-line text, font pt, align left / centre / right, F2 / double-click jumps to the text box. *cad:* partial: one-line text and size only (`cad/ui/Properties.svelte:425`). `sheets/edit/AnnotationControls.svelte:196`, `sheets/edit/AnnotationControls.svelte:84`
- [ ] **Resize and rotate box** — 8 handles + rotate handle (15° steps, Shift free); exact W / H in mm. *cad:* missing for notes (drag to move only). `sheets/edit/TransformBox.svelte:60`, `sheets/edit/AnnotationControls.svelte:261`
- [x] **Line end points** — drag either end; set a line's length. *cad:* partial: leader / cloud points can't be grip-edited after drawing; no length. `sheets/annotations/annotations.svelte.ts:284`
- [x] **Marquee select markup** — crossing box, Shift / Ctrl adds; hidden / locked layers skipped. *cad:* partial: window select exists but is a known todo ("drag marquee doesn't pick shapes", phase 6). `sheets/annotations/annotations.svelte.ts:471`, `sheets/edit/surface.svelte.ts:164`
- [x] **Ctrl-drag duplicates, Ctrl-click toggles** — *cad:* partial: Ctrl-click toggles; Ctrl-drag duplicate is a todo. `sheets/edit/surface.svelte.ts:240`
- [x] **Shift-drag constrains to H / V** — *cad:* missing (todo "Shift constraints while dragging"). `sheets/edit/surface.svelte.ts:209`
- [x] **Copy / paste markup** — between viewports and sheets; a paste off-screen lands in the view centre. *cad:* missing. `sheets/annotations/annotations.svelte.ts:436`, `sheets/edit/surface.svelte.ts:53`
- [ ] **Duplicate (Ctrl+D)** — offset copy of the selection. *cad:* missing. `sheets/annotations/annotations.svelte.ts:275`
- [ ] **Arrow-key nudge** — arrows move the selection (Shift = bigger step). *cad:* missing. `sheets/annotations/annotations.svelte.ts:355`
- [x] **Group / ungroup** — Ctrl+G / Ctrl+Shift+G; a click or marquee on one member selects the group. *cad:* missing in UI (the `Group` record exists: `cad/domain/drawing.ts:98`). `sheets/edit/selection.ts:50`, `sheets/edit/surface.svelte.ts:99`
- [x] **Edit several at once** — common colour, font, text, layer (and outlet props) for a multi-selection. *cad:* missing for notes. `sheets/edit/AnnotationControls.svelte:135`, `sheets/annotations/annotations.svelte.ts:252`
- [ ] **Smallest item wins the click** — hit order sorted by footprint so a small item inside a big box stays selectable. *cad:* missing. `sheets/annotations/AnnotationLayer.svelte:38`
- [ ] **Drawing defaults (project-wide)** — default colour, font pt, line heads, dimension heads, dash, dimension unit for new markup. *cad:* missing. `sheets/DrawingDefaultsDialog.svelte:18`, `sheets/SheetMenubar.svelte:33`
- [ ] **Single-key markup hotkeys** — C cloud, T text, N callout, L line, A arrow, D dim, R rect, E ellipse, G grid; O outlet, S section, V elevation tag, P photo. *cad:* partial: X text, E leader, U cloud (`cad/ui/CadShell.svelte:109`). `sheets/edit/hotkeys.ts:9`, `sheets/edit/hotkeys.ts:23`
- [ ] **Quick tool buttons (recently used)** — 4 quick buttons, the last slot = last picked from the ▾ menu. *cad:* missing. `sheets/edit/AnnotationControls.svelte:4`, `sheets/edit/AnnotationControls.svelte:60`
- [ ] **Shape library** — built-in shapes + custom shapes saved globally from a selection, search, drag onto the view to place, delete custom. *cad:* partial: blocks (global) and "make block from shapes" exist in the domain, no library window or insert tool (`cad/domain/blocks.ts:71`). `sheets/annotations/ShapeLibrary.svelte:54`, `sheets/annotations/shapes/library.ts:23`
- [x] **Auto-number dialog** — start, step, ### format, overwrite / prefix / suffix / fill-#, order (selection / value / X-Y / Y-X) on outlets + text. *cad:* partial: `renumber` exists in the domain, no UI except sheet numbers (`cad/domain/labels.ts:91`). `sheets/tools/model3d/RenumberDialog.svelte:1`, `sheets/annotations/annotations.svelte.ts:319`
- [ ] **Right-click menu** — Group, Ungroup, Auto number…, Duplicate, Copy, Paste, Delete. *cad:* missing (right-click = Esc). `sheets/tools/model3d/Model3dViewport.svelte:332`

<details><summary>Covered in cad (4)</summary>

- Move markup by dragging — `sheets/annotations/annotations.svelte.ts:223` → `cad/editor/tools.ts:270`
- Text / arrow sizes follow the drawing scale (paper mm) — `sheets/annotations/annotations.svelte.ts:89` → `cad/views/sheet.ts:104`
- Delete selected — `sheets/edit/AnnotationControls.svelte:356` → `cad/ui/CadShell.svelte:212`
- Undo / redo of markup — `sheets/edit/history.svelte.ts:13` → `cad/ui/CadShell.svelte:210`
</details>

### Layers
- [x] **Project layers** — fixed defaults (Outlets, Trunks, Racks, Devices, Rooms, Risers, Cables, Annotations) plus custom layers. *cad:* missing in UI (a `Layer` record exists: `cad/domain/drawing.ts:87`). `sheets/layers/layers.ts:18`, `sheets/viewports.svelte.ts:234`
- [x] **Custom layer editing** — add (filed under the active layer's group), rename, colour swatch / custom colour, drag onto another group, delete only when empty and not active. *cad:* missing. `sheets/layers/LayersPanel.svelte:84`, `sheets/layers/LayersPanel.svelte:49`, `sheets/layers/LayersPanel.svelte:91`
- [x] **Active layer** — new objects / markup land on it (if it fits their group), else a toast. *cad:* missing. `sheets/layers/LayersPanel.svelte:147`, `sheets/annotations/annotations.svelte.ts:95`
- [x] **Per-viewport hide / lock** — each viewport has its own layer visibility and lock (so one sheet can show only one routes layer). *cad:* missing (`hiddenLayers` / `overrides` fields exist, unused: `cad/domain/drawing.ts:26`, `cad/domain/drawing.ts:83`). `sheets/viewports.svelte.ts:221`, `sheets/layers/LayersPanel.svelte:205`
- [ ] **Object colour from a custom layer** — tool objects on a custom layer draw in its colour. *cad:* missing. `sheets/layers/layers.ts:70`
- [x] **Hidden / locked layer blocks adding** — "Layer is hidden — can't add to it". *cad:* missing. `sheets/layers/layers.ts:76`
- [x] **Move selection to a layer** — Layer dropdown for markup and objects. *cad:* missing. `sheets/edit/AnnotationControls.svelte:142`

### Sheet properties and title block
- [ ] **Per-sheet Checked / Approved / Date / Client overrides** — typed per sheet, blank = project default. *cad:* partial: only "Drawn" per sheet; Date comes from the last revision; client only as a fixed custom field (`cad/ui/SheetProps.svelte:132`). `sheets/parts/SheetPropertiesWindow.svelte:139`
- [x] **Approvals and Site sections** — Drawn / Chk / App row and a growing Site (address) section, each switchable. *cad:* partial: no approvals or site; custom text fields instead (`cad/domain/titleBlock.ts:8`). `sheets/parts/TitleBlock.svelte:115`, `sheets/parts/TitleBlock.svelte:110`
- [ ] **Sheet scale field** — a paper scale on the sheet, printed in the title block. *cad:* different: taken from the viewports ("As shown" when they differ) (`cad/views/sheet.ts:45`). `sheets/parts/SheetPropertiesWindow.svelte:116`
- [ ] **Per-sheet dimension unit** — mm / m / km / hidden for dimension labels on this sheet. *cad:* missing (no dimensions). `sheets/parts/SheetPropertiesWindow.svelte:124`
- [ ] **Logo resize by dragging** — click a logo, drag handles to set its height. *cad:* different: a height (mm) field (`cad/ui/TitleBlockEditor.svelte:24`). `sheets/parts/TitleBlock.svelte:233`
- [ ] **Project details dialog** — File ▸ Project details edits the project name / client / address / logos used by the title block. *cad:* different: the title-block template editor in sheet Properties (`cad/ui/SheetProps.svelte:134`); project name not editable there. `sheets/SheetMenubar.svelte:32`

<details><summary>Covered in cad (8)</summary>

- Title and drawing number — `sheets/parts/SheetPropertiesWindow.svelte:103` → `cad/ui/SheetProps.svelte:113`
- Paper size and orientation (cad adds A0–A2) — `sheets/parts/SheetPropertiesWindow.svelte:108` → `cad/ui/SheetProps.svelte:118`
- Margins + margin guide — `sheets/parts/SheetPropertiesWindow.svelte:121` → `cad/ui/SheetProps.svelte:125`
- Show / hide the title block — `sheets/parts/SheetPropertiesWindow.svelte:134` → `cad/ui/SheetProps.svelte:133`
- Drawn by — `sheets/parts/SheetPropertiesWindow.svelte:138` → `cad/ui/SheetProps.svelte:132`
- Three layouts (vertical / compact / horizontal) — `sheets/types.ts:178` → `cad/domain/titleBlock.ts:37`
- Company block + client / company logos, section toggles — `sheets/parts/TitleBlock.svelte:91` → `cad/domain/titleBlock.ts:44`
- Revision table in the title block — `sheets/parts/TitleBlock.svelte:112` → `cad/domain/titleBlock.ts:44`
</details>

### Revisions
- [ ] **Add / edit / delete revisions by hand** — code, date, note per row; next code A, B, …; delete. *cad:* different: revisions are made only by Issue (changed sheets get the next rev) (`cad/domain/issue.ts:62`). `sheets/revisions/RevisionsPanel.svelte:22`
- [ ] **Pick the current revision** — a radio sets which revision the title block shows. *cad:* different: always the last issued revision (`cad/views/sheet.ts:41`). `sheets/revisions/RevisionsPanel.svelte:40`

### Sheet list (register)
- [x] **Duplicate sheet** — copies viewports, their layer settings and markup, lands after the original, clears the number, "(copy)" title; also File ▸ Duplicate sheet. *cad:* missing. `sheets/data.ts:94`, `sheets/parts/SheetList.svelte:118`, `sheets/SheetMenubar.svelte:35`
- [ ] **Drag to reorder** — drag a row (or the whole selection) to set the sheet order. *cad:* missing: column sort only (`cad/ui/SheetsTab.svelte:136`). `sheets/parts/SheetList.svelte:159`
- [ ] **"File" rows** — a list row that opens another tool (Patch list, Patch frames) at a floor / room, for documents exported from there; in a package it prints a reminder page. *cad:* missing. `sheets/parts/SheetList.svelte:11`, `sheets/packages/[pkgId]/print/+page.svelte:151`
- [ ] **Renumber keeps each sheet's prefix and padding** — continues from the sheet before when the first has no number. *cad:* different: one pattern for the selection (`S{n:3}`) (`cad/domain/sheetList.ts:60`). `sheets/data.ts:148`
- [ ] **Delete a sheet (with confirm)** — *cad:* different: Archive / Restore in the Sheets tab (`cad/ui/SheetsTab.svelte:101`). `sheets/parts/SheetList.svelte:357`
- [ ] **Viewport count column** — *cad:* missing (minor). `sheets/parts/SheetList.svelte:256`

<details><summary>Covered in cad (5)</summary>

- New sheet — `sheets/data.ts:30` → `cad/ui/SheetList.svelte:42`
- Edit number / title in the list — `sheets/parts/SheetList.svelte:47` → `cad/ui/SheetsTab.svelte:146`
- Multi-select with Shift ranges — `sheets/parts/SheetList.svelte:136` → `cad/ui/SheetsTab.svelte:145`
- Renumber the selection — `sheets/parts/SheetList.svelte:178` → `cad/ui/SheetsTab.svelte:99`
- Paper / scale columns — `sheets/parts/SheetList.svelte:186` → `cad/domain/sheetList.ts:60`
</details>

### Sheet packages (drawing sets) and printing
- [ ] **Saved packages you curate** — create / rename / delete named packages; add, remove, add-all sheets; order by drag or ↑ / ↓; open a sheet from the package. *cad:* different: select sheets in the register → Issue…; the issue is the package (`cad/ui/SheetsTab.svelte:104`). `sheets/parts/PackageManager.svelte:84`, `sheets/parts/PackageManager.svelte:56`, `sheets/parts/PackageManager.svelte:66`
- [ ] **Print a package** — one print preview, a page per sheet, mixed paper sizes, browser print / Save as PDF. *cad:* different: PDF of the selection, a page per sheet at its own size (`cad/render/pdf.ts:19`). `sheets/parts/PackageManager.svelte:96`, `sheets/packages/[pkgId]/print/+page.svelte:82`
- [ ] **Print = browser print at true mm** — vector text via CSS zoom, Ctrl+P works. *cad:* different: jspdf download at true mm (`cad/render/pdf.ts:78`). `sheets/parts/Canvas.svelte:313`, `sheets/SheetMenubar.svelte:21`
- [ ] **PDF title = sheet title** — the browser tab title is the sheet / package name, so a saved PDF is titled. *cad:* missing (no PDF metadata title). `sheets/[sheetId]/+page.svelte:57`

### DXF export
- [ ] **DXF of the active viewport** — File ▸ Export DXF for an outlets floorplan, a rack elevation, a riser diagram or a 3D model plan (layers, ACI colours). *cad:* partial: DXF of the open plan only (`cad/ui/CadShell.svelte:149`); no rack, riser, section or sheet DXF. `sheets/SheetMenubar.svelte:38`, `sheets/dxf/racks.ts:18`, `sheets/dxf/risers.ts:22`

<details><summary>Covered in cad (1)</summary>

- Outlets floorplan DXF — `sheets/dxf/outlets.ts:25` → `cad/render/dxf.ts:30`
</details>

### Sheet editor: canvas, menus, touch
- [x] **Touch (iPad)** — one finger on empty paper pans, a tap deselects; two fingers pan + pinch zoom, also inside an active viewport. *cad:* missing: pointer events only, no pinch / two-finger pan (`cad/ui/ViewCanvas.svelte:336`). `sheets/parts/Canvas.svelte:210`, `sheets/Viewport.svelte:215`
- [x] **Page Up / Page Down** — pan the sheet by a screen (Shift = sideways). *cad:* missing. `sheets/SheetEditor.svelte:228`
- [ ] **Tools menu** — jump to Outlets, Frames, Patching, Fill rates, Uploads, Surveys. *cad:* different: one tool; n/a. `sheets/SheetMenubar.svelte:12`

<details><summary>Covered in cad (5)</summary>

- Live sync of sheet edits from other tabs — `sheets/SheetEditor.svelte:129` → `cad/persist/sync.ts:1`
- Wheel zoom, right / middle drag pan — `sheets/parts/Canvas.svelte:127` → `cad/ui/ViewCanvas.svelte:307`
- Fit the sheet (button) — `sheets/SheetMenubar.svelte:63` → `cad/ui/CadShell.svelte:222`
- Pan / zoom remembered per sheet — `sheets/parts/Canvas.svelte:299` → `cad/ui/ViewCanvas.svelte:165`
- Status-bar hints per mode — `sheets/StatusBar.svelte:11` → `cad/ui/CadShell.svelte:114`
</details>

### Viewport: empty
- [ ] **Empty viewport with a type picker** — a new viewport starts empty ("choose Viewport type & source"), then Type = Text / Outlets / Racks / Risers / Fill rate / 3D model. *cad:* different: a new viewport shows the open level's plan; View picks plan / elevations / racks / section / risers (`cad/ui/SheetProps.svelte:75`). `sheets/TextViewport.svelte:81`, `sheets/parts/ViewportPropertiesWindow.svelte:169`

### Viewport: text
- [x] **Text block with markdown** — headings (# ## ###), bullet and numbered lists, `|` tables with header row, **bold** / *italic*. *cad:* missing (`markdown` flag on text exists, unused: `cad/domain/shapes.ts:73`). `sheets/TextViewport.svelte:35`
- [x] **Text fills a box** — wraps and clips to the viewport's rectangle, font in pt. *cad:* partial: a one-line note with a size in mm (`cad/editor/noteTool.ts:56`). `sheets/TextViewport.svelte:16`, `sheets/parts/ViewportPropertiesWindow.svelte:190`

### Viewport: outlets
- [x] **Floorplan crop** — the PDF underlay is clipped to the Uploads crop rectangle. *cad:* partial: `crop` field exists, not applied (`cad/domain/types.ts:79`, `cad/views/plan.ts:18`). `sheets/tools/outlets/OutletsRender.svelte:64`
- [ ] **Underlay file / page per viewport** — the viewport can override which file and page underlay it shows. *cad:* missing: one underlay per level, only from the legacy import (`cad/persist/import/legacyOutlets.ts:23`). `sheets/types.ts:93`
- [ ] **Outlet symbol details** — port count inside the symbol, room number under it, usage colour, low = filled / high = outline, label kept ≥ 2.5 mm on paper. *cad:* partial: blocks show the label only; tier changes the block (`cad/domain/blocks.ts:24`, `cad/domain/blocks.ts:51`). `sheets/tools/outlets/OutletsRender.svelte:196`, `sheets/tools/outlets/OutletsRender.svelte:200`, `sheets/tools/outlets/OutletsRender.svelte:126`
- [x] **Trunk look** — filled band in the trunk's colour, rounded inner bends (bend radius), primary runs stronger. *cad:* partial: bands of the real width by tier class, no per-run colour or rounded bends (`cad/views/plan.ts:116`). `sheets/tools/outlets/OutletsRender.svelte:108`
- [ ] **Rack colour by server room** — placed racks tinted by room A–D. *cad:* missing. `sheets/tools/outlets/OutletsRender.svelte:163`
- [ ] **Trunk split / disconnect** — right-click a node: Split trunk here (two trunks), Disconnect (separate ends); Delete segment. *cad:* missing (node delete only in Properties). `sheets/tools/outlets/OutletsContextMenu.svelte:22`, `sheets/tools/outlets/OutletsContextMenu.svelte:23`
- [ ] **Join trunks by dropping a node on another** — merges nodes or two trunks into one graph. *cad:* partial: snap / attach while dragging, no merge of two runs (`cad/editor/grips.ts:30`). `sheets/tools/outlets/outlets-editor.svelte.ts:499`
- [x] **Shift = 15° while drawing and dragging nodes** — junctions solve to keep every segment on 15°. *cad:* missing (no angle constraint; drag constraints are a todo). `sheets/tools/outlets/outlets-editor.svelte.ts:181`
- [ ] **Trunk properties** — shape rect / pipe, location floor / ceiling / wall, catalogue type, server rooms A–D it serves, colour, bend radius, run length. *cad:* partial: kind, size, label, Z (`cad/ui/PathProps.svelte:65`); no serves / colour / bend / length in UI (catalogue dropped by decision). `sheets/tools/outlets/OutletsEditPanel.svelte:195`, `sheets/tools/outlets/OutletsEditPanel.svelte:216`, `sheets/tools/outlets/OutletsEditPanel.svelte:234`
- [ ] **Trunk picker** — dropdown to select a trunk where they overlap. *cad:* missing. `sheets/tools/outlets/OutletsEditPanel.svelte:84`
- [x] **Ctrl-drag duplicates** — outlets, racks, or selected trunk segments (to a new trunk). *cad:* missing (todo). `sheets/tools/outlets/outlets-editor.svelte.ts:223`, `sheets/tools/outlets/outlets-editor.svelte.ts:335`
- [ ] **Arrow nudge (50 / 500 mm) and Ctrl+D** — *cad:* missing. `sheets/tools/outlets/OutletsViewport.svelte:191`
- [ ] **Outlet ↔ Frames location link** — link / unlink an outlet to a Frames location, warn on port-count mismatch. *cad:* different: an outlet IS the location (one record). `sheets/tools/outlets/OutletsEditPanel.svelte:157`, `sheets/tools/outlets/OutletsEditPanel.svelte:145`
- [ ] **Free floorplan racks with maker / model** — drag out a W × D rack not in any racks doc; maker and model fields. *cad:* different: racks are data; catalogue id instead of maker / model (`cad/domain/types.ts:139`). `sheets/tools/outlets/outlets-editor.svelte.ts:580`, `sheets/tools/outlets/OutletsEditPanel.svelte:253`

<details><summary>Covered in cad (9)</summary>

- Floor picker → level — `sheets/tools/outlets/OutletsProperties.svelte:26` → `cad/ui/SheetProps.svelte:70`
- Calibrated PDF underlay (hidden PDF layers honoured) — `sheets/tools/outlets/OutletsViewport.svelte:147` → `cad/app/pdf.svelte.ts:48`
- Racks on the plan with a front edge — `sheets/tools/outlets/OutletsRender.svelte:168` → `cad/views/plan.ts:145`
- Place an outlet, sticky defaults — `sheets/tools/outlets/outlets-editor.svelte.ts:259` → `cad/ui/CadShell.svelte:99`
- Drag / multi-select / marquee outlets — `sheets/tools/outlets/outlets-editor.svelte.ts:223` → `cad/editor/tools.ts:296`
- Multi-edit tier / usage / mount — `sheets/tools/outlets/OutletsEditPanel.svelte:110` → `cad/ui/Properties.svelte:42`
- Draw trunks by clicks, auto label T1… — `sheets/tools/outlets/outlets-editor.svelte.ts:275` → `cad/ui/CadShell.svelte:101`
- Double-click a segment to insert a node, Ctrl-drag a node to branch — `sheets/tools/outlets/OutletsEditLayer.svelte:45` → `cad/editor/tools.ts:138`
- Place an unplaced real rack on the plan — `sheets/tools/outlets/OutletsViewport.svelte:120` → `cad/ui/RackList.svelte:61`
</details>

### Viewport: racks
- [ ] **One row in a viewport** — Row = all rows or one row. *cad:* partial: the row view supports `rowId` but the sheet View list offers whole rooms only (`cad/ui/SheetProps.svelte:79`). `sheets/tools/racks/RacksProperties.svelte:51`
- [ ] **Show walls** — room shell around the elevation: slab, ceiling slab, side walls, plus a dashed ceiling line. *cad:* partial: FFL datum only (`cad/views/rackRow.ts:154`). `sheets/tools/racks/RacksProperties.svelte:60`, `sheets/tools/racks/RacksRender.svelte:156`
- [ ] **Colour devices toggle** — devices by type colour, or plain grey. *cad:* partial: coloured by kind, no toggle (`cad/views/rackRow.ts:123`). `sheets/tools/racks/RacksProperties.svelte:61`
- [x] **Port labels / patch cords toggles** — per viewport on or off. *cad:* different: always drawn, labels by level of detail (`cad/views/rackRow.ts:135`). `sheets/tools/racks/RacksProperties.svelte:62`, `sheets/tools/racks/RacksProperties.svelte:63`
- [x] **Cords routed down side channels** — drop, out to the rack edge, across, back in; dashed until installed; removed cords hidden. *cad:* partial: a sagging line, removed ones faded (`cad/views/rackRow.ts:145`). `sheets/tools/racks/PortsCordsOverlay.svelte:104`, `sheets/tools/racks/PortsCordsOverlay.svelte:157`
- [x] **Other-face devices shown faded** — a rear-only device shows at 40 % on the front. *cad:* different: hidden on the other face (`cad/views/rackRow.ts:104`). `sheets/tools/racks/RacksRender.svelte:42`
- [ ] **Rack "plan" face** — rows laid out by row origin / rotation with room walls, doors and boxes; drag a row's origin. *cad:* different: racks on the level plan at their own positions (`cad/views/plan.ts:145`). `sheets/tools/racks/RacksRender.svelte:117`, `sheets/tools/racks/RacksEditLayer.svelte:88`
- [ ] **Reorder racks by drag** — Racks window sets the elevation left-to-right order. *cad:* different: order follows plan position (`cad/views/rackRow.ts:27`). `sheets/tools/racks/RacksWindow.svelte:18`
- [x] **Ctrl-drag duplicates a device; drag a multi-selection across racks** — *cad:* missing (todo for Ctrl-drag). `sheets/tools/racks/RacksEditLayer.svelte:38`, `sheets/tools/racks/RacksEditLayer.svelte:48`
- [ ] **Per-room custom device library** — add / edit / remove custom devices in a modal, drag a library item onto a rack at a U. *cad:* different: global templates; "Save as template" from a device; Device tool places the chosen template (`cad/ui/Properties.svelte:405`). `sheets/tools/racks/DeviceLibrary.svelte:29`, `sheets/tools/racks/DeviceLibrary.svelte:56`
- [ ] **DXF of the rack elevation** — *cad:* missing. `sheets/tools/racks/RacksEditPanel.svelte:19`

<details><summary>Covered in cad (7)</summary>

- Floor + room picker, front / rear — `sheets/tools/racks/RacksProperties.svelte:48` → `cad/ui/SheetProps.svelte:79`
- RU numbers both sides — `sheets/tools/racks/RacksRender.svelte:173` → `cad/views/rackRow.ts:142`
- Port grid with stacked labels — `sheets/tools/racks/PortsCordsOverlay.svelte:74` → `cad/views/rackRow.ts:135`
- Patch cords on the elevation — `sheets/tools/racks/PortsCordsOverlay.svelte:121` → `cad/views/rackRow.ts:145`
- Rack properties (label, U, width, type), add / delete — `sheets/tools/racks/RacksEditPanel.svelte:60` → `cad/ui/Properties.svelte:42`
- Device properties (label, type, U, height, face), drag to a new U — `sheets/tools/racks/RacksEditPanel.svelte:88` → `cad/editor/deviceTool.ts:19`
- Multi-select devices, set type — `sheets/tools/racks/RacksEditPanel.svelte:104` → `cad/ui/Properties.svelte:42`
</details>

### Viewport: risers
- [x] **Floor range** — From floor / To floor per viewport. *cad:* missing: the riser view is always the whole building (`cad/views/riser.ts:39`). `sheets/tools/risers/RisersProperties.svelte:14`
- [ ] **Pick a riser drawing** — several riser drawings per project. *cad:* different: one riser view built from data. `sheets/parts/ViewportPropertiesWindow.svelte:209`
- [x] **Hidden floors (compression)** — skipped floors drawn as a hatched gap "N floors hidden". *cad:* missing (phase 5 "later if needed"). `sheets/tools/risers/RisersRender.svelte:35`
- [ ] **EPS rooms** — server and EPS rooms with SER / EPS tags, set width. *cad:* partial: server rooms with placed racks only (`cad/views/riser.ts:19`). `sheets/tools/risers/RisersRender.svelte:184`, `sheets/tools/risers/RisersEditPanel.svelte:65`
- [ ] **Ladder high / low level** — each riser ladder tagged HIGH or LOW. *cad:* missing. `sheets/tools/risers/RisersRender.svelte:149`
- [ ] **Free text labels on the riser diagram** — *cad:* different: paper notes on the sheet. `sheets/tools/risers/RisersRender.svelte:190`
- [ ] **Hand-drawn diagram** — drag a box to add a room, drag floor-to-floor to add a riser, drag rooms between floors, resize room edges, drag ladders sideways (snapped). *cad:* different: generated from levels, risers drawn on plans and backbone links (`cad/views/riser.ts:24`). `sheets/tools/risers/risers-editor.svelte.ts:117`, `sheets/tools/risers/risers-editor.svelte.ts:129`, `sheets/tools/risers/RisersEditLayer.svelte:52`
- [ ] **Hand-routed cables** — + Cable, type, copper / fibre, hops (room, level, ladder). *cad:* different: routes derived from links over drawn containment. `sheets/tools/risers/RisersEditPanel.svelte:43`, `sheets/tools/risers/RisersEditPanel.svelte:103`
- [ ] **DXF of the riser diagram** — *cad:* missing. `sheets/tools/risers/RisersEditPanel.svelte:18`

<details><summary>Covered in cad (3)</summary>

- Floor bands (slab, raised floor, ceiling, plenum) with floor names — `sheets/tools/risers/RisersRender.svelte:124` → `cad/views/riser.ts:39`
- Cables laid side by side in lanes — `sheets/tools/risers/RisersRender.svelte:53` → `cad/views/riser.ts:9`
- Riser shafts with labels — `sheets/tools/risers/RisersRender.svelte:147` → `cad/views/riser.ts:24`
</details>

### Viewport: fillrate
- [ ] **Fill section on a sheet** — pick a Fill-rate tool section; draws the packed cables in the containment with cable Ø labels and a caption "label · size · Fill %", coloured by fill. *cad:* partial: the packed section shows only in a run's Properties on screen (`cad/ui/Properties.svelte:434`); no sheet viewport; free sections not tied to a run are dropped for now. `sheets/parts/ViewportPropertiesWindow.svelte:242`, `sheets/tools/fillrate/FillrateViewport.svelte:29`, `sheets/tools/fillrate/FillrateViewport.svelte:85`
- [ ] **Fill colours on a sheet plan** — *cad:* partial: the Fill overlay is a plan-pane toggle, not drawn in sheet viewports (`cad/ui/ViewCanvas.svelte:111`). `sheets/tools/fillrate/FillrateViewport.svelte:77`

### Viewport: model3d
- [ ] **Isometric 3D view** — iso direction, drag to orbit (yaw / pitch), hidden-line faces. *cad:* missing (6.4 "later"). `sheets/tools/model3d/types.ts:79`, `sheets/tools/model3d/Model3dViewport.svelte:30`, `sheets/tools/model3d/Model3dRender.svelte:68`
- [ ] **Black & white render** — monochrome per viewport or section. *cad:* missing. `sheets/tools/model3d/Model3dProperties.svelte:119`, `sheets/tools/model3d/Model3dRender.svelte:39`
- [ ] **Cuboids / prisms** — drag out a box in plan or elevation; x / y / z / w / h / d, 3–24 edges (cylinders), rotation with a 15° rotate handle, corner resize. *cad:* missing: region + extent exist in the model, no box tool (`cad/domain/shapes.ts:67`). `sheets/tools/model3d/Model3dEditPanel.svelte:51`, `sheets/tools/model3d/Model3dEditPanel.svelte:109`, `sheets/tools/model3d/Model3dEditLayer.svelte:75`
- [ ] **Conduit n-gon sections** — 3–24 edges per conduit and per segment. *cad:* partial: rectangular or round (`cad/domain/shapes.ts:31`). `sheets/tools/model3d/Model3dEditPanel.svelte:113`
- [ ] **Segment list with overrides** — list segments, Ctrl / Shift multi-select, per-segment thickness / height / W / H / edges, reset to default, delete segments. *cad:* partial: per-segment section exists in the model, Properties lists nodes only (`cad/domain/shapes.ts:59`). `sheets/tools/model3d/Model3dEditPanel.svelte:126`, `sheets/tools/model3d/Model3dEditPanel.svelte:145`
- [x] **Disconnect a junction / join on drop** — tap a handle to split a tee into ends; drop a node on another to merge objects. *cad:* missing. `sheets/tools/model3d/Model3dEditLayer.svelte:111`, `sheets/tools/model3d/model3d-editor.svelte.ts:321`
- [x] **Shift = 15° while drawing walls / conduits** — *cad:* missing (no angle constraint in `cad/editor/pathTool.ts`; typed `@d<a` works). `sheets/tools/model3d/model3d-editor.svelte.ts:597`
- [x] **Wall height edge in elevations** — drag a wall's top edge in an elevation. *cad:* missing. `sheets/tools/model3d/Model3dEditLayer.svelte:85`
- [x] **Multi-edit Height / Base Z / Layer** — *cad:* partial: "All nodes Z" for one path (`cad/ui/PathProps.svelte:79`). `sheets/tools/model3d/Model3dEditPanel.svelte:73`
- [x] **Underlays per view direction** — several PDF / image underlays per plan or elevation: file, page, opacity slider, flip, z-order, drag / resize on the canvas, reset; a Background layer to hide / lock them. *cad:* missing: one plan underlay per level from import, no UI (`cad/persist/import/legacyOutlets.ts:23`). `sheets/tools/model3d/Model3dProperties.svelte:54`, `sheets/tools/model3d/Model3dEditLayer.svelte:193`, `sheets/tools/model3d/Model3dEditPanel.svelte:253`
- [x] **Plan cut (z-band)** — Bottom Z / Top Z on the plan viewport hides objects outside, Fit height to slabs, remove cut. *cad:* missing: the plan shows the whole level. `sheets/tools/model3d/Model3dEditPanel.svelte:271`, `sheets/tools/model3d/model3d-editor.svelte.ts:533`
- [ ] **Section → elevation box** — drag a box on the plan; a new clipped elevation viewport appears on the sheet. *cad:* different: Section tool (cut line + depth), then pick "Section A" in a viewport (`cad/views/section.ts:34`, `cad/ui/SheetProps.svelte:80`). `sheets/tools/model3d/Model3dViewport.svelte:76`, `sheets/tools/model3d/Model3dEditPanel.svelte:56`
- [ ] **Section box editing** — section tags on the plan, box handles, delete with an Undo toast; per-section label, view dir, scale, Bottom / Top Z, Fit to slabs, layer, hidden lines, B/W. *cad:* partial: name, depth, flip, move the ends (`cad/domain/drawing.ts:144`); no top / bottom Z, layer or B/W. `sheets/tools/model3d/Model3dEditPanel.svelte:219`, `sheets/tools/model3d/Model3dEditPanel.svelte:233`, `sheets/tools/model3d/Model3dViewport.svelte:116`
- [ ] **Floating elevation preview** — selecting an object on the plan opens a small auto-fit elevation (pick direction) to drag heights, culled to the object's depth. *cad:* different: Split view, plan beside an elevation (`cad/ui/CadShell.svelte:294`). `sheets/tools/model3d/Model3dElevationPreview.svelte:10`, `sheets/tools/model3d/Model3dElevationPreview.svelte:20`
- [x] **Group transform box** — one box to move / scale / rotate a multi-selection or group (oriented to a shared angle). *cad:* missing. `sheets/tools/model3d/Model3dViewport.svelte:316`
- [x] **Select all (Ctrl+A), cut (Ctrl+X), Ctrl+arrow resize** — *cad:* missing. `sheets/tools/model3d/Model3dViewport.svelte:224`, `sheets/tools/model3d/Model3dViewport.svelte:239`
- [x] **Model layers** — per-model layers (name, colour, active, add, delete only when empty), per-viewport hide / lock; markup can file onto model layers. *cad:* missing. `sheets/layers/LayersPanel.svelte:26`, `sheets/tools/model3d/Model3dViewport.svelte:153`
- [ ] **Several named models per project** — pick / new / rename / delete a model. *cad:* different: one model per level. `sheets/tools/model3d/Model3dProperties.svelte:80`, `sheets/tools/model3d/Model3dProperties.svelte:36`
- [x] **Copy to Pages / across projects** — copied objects go to the system clipboard in Pages format; a pasted 3D viewport imports its model into another project. *cad:* missing (Pages is retired, so the Pages format is moot). `sheets/tools/model3d/pagesClip.ts:8`, `sheets/SheetEditor.svelte:187`
- [ ] **Precise marquee** — picks an object only when its projected outline touches the box. *cad:* partial: window select is a known todo. `sheets/tools/model3d/model3d-editor.svelte.ts:824`
- [ ] **DXF of the model** — plan with layers mapped to ACI colours. *cad:* partial: plan DXF from the display list, no layer colours (`cad/render/dxf.ts:30`). `sheets/tools/model3d/dxfExport.ts:94`, `sheets/tools/model3d/dxfExport.ts:26`

<details><summary>Covered in cad (5)</summary>

- Plan + front / rear / left / right views — `sheets/tools/model3d/types.ts:79` → `cad/ui/SheetProps.svelte:78`
- Level datum lines in elevations (slab, raised floor, ceiling) — `sheets/tools/model3d/Model3dProperties.svelte:101` → `cad/views/elevation.ts:60`
- Walls drawn on the plan with height / thickness — `sheets/tools/model3d/Model3dEditPanel.svelte:52` → `cad/ui/CadShell.svelte:103`
- Conduits drawn in plan or elevation — `sheets/tools/model3d/Model3dEditPanel.svelte:53` → `cad/ui/CadShell.svelte:102`
- Node drag, insert node, branch from a node — `sheets/tools/model3d/Model3dEditLayer.svelte:111` → `cad/editor/tools.ts:138`
</details>


## Drawings (`routes/projects/[pid]/drawings/`)

### Sheet register (Master Drawing List)
- [ ] **Source views as drawings** — any tool view (Racks floor/room, Frames, Outlets, Patching, Fill Rate, Survey, Risers + a view preset) can be registered as a drawing with No., title, size, scale. *cad:* missing: only sheets are in the register; views are not stored as drawings (`ViewDef` is unused). `drawings/parts/DrawingList.svelte:117`
- [ ] **Open a source view with its preset** — clicking a source-view row opens its tool at that floor / room with the preset's layer flags in the URL. *cad:* missing: views open from the tree into a pane; no stored presets. `lib/versioning/adapters/index.ts:77`
- [ ] **Revision history columns** — one column per revision (Rev A, Rev B …) with its issue date. *cad:* partial: the register shows only the current rev; the title block shows the last 5. `drawings/parts/DrawingList.svelte:364`
- [x] **Excel with revision dates** — export has #, No., Title, Tool, Size, Scale and a date column per revision. *cad:* partial: Excel has the current Rev only, no dates or history. `lib/versioning/export.ts:19`
- [ ] **Typed size and scale** — Size and Scale are free text per drawing. *cad:* different: size comes from the paper, scale from the viewports ("As shown" when mixed). `drawings/parts/DrawingList.svelte:340`
- [ ] **"In Pkg" flag** — per-sheet checkbox that decides which pages "Auto-add all pages" publishes. *cad:* different: you select the sheets in the register, then Issue…. `drawings/parts/DrawingList.svelte:389`

<details><summary>Covered in cad (6)</summary>

- Inline edit of No. / Title — `drawings/parts/DrawingList.svelte:60` → `cad/ui/SheetsTab.svelte:146`
- Delete = archive (with confirm) — `drawings/parts/DrawingList.svelte:140` → `cad/ui/SheetsTab.svelte:101`
- New page — `drawings/parts/DrawingList.svelte:149` → `cad/ui/SheetList.svelte:42`
- Click a row to open — `drawings/parts/DrawingList.svelte:85` → `cad/ui/SheetsTab.svelte:145`
- Draft / "Rev X" status — `drawings/parts/DrawingList.svelte:379` → `cad/ui/SheetsTab.svelte:151`
- Register Excel export — `drawings/parts/DrawingList.svelte:145` → `cad/render/sheetList.ts:18`
</details>

### Sheet editor: viewport frames
- [ ] **Add-viewport dialog** — pick one of 11 kinds, then bind its source (floor / room / face / file / survey …) before the viewport is made. *cad:* different: Add viewport makes a plan viewport; its level and view are then picked in Properties. `drawings/parts/AddViewportDialog.svelte:120`
- [ ] **Viewport list** — sidebar list of every viewport: click selects, double-click opens its source, kind tag, pinned-rev badge. *cad:* missing: viewports can only be picked on the paper. `drawings/pages/[pageId]/+page.svelte:673`
- [ ] **Duplicate viewport** — Ctrl+D (or Edit menu) copies the selected viewport 10 mm down-right. *cad:* missing. `drawings/pages/[pageId]/+page.svelte:305`
- [ ] **Arrow-key nudge** — arrows move the selected viewport 1 mm, Shift 10 mm. *cad:* missing. `drawings/pages/[pageId]/+page.svelte:473`
- [ ] **Delete key removes the viewport** — Del deletes only the selected viewport. *cad:* partial: only the Properties button deletes a viewport; Del with a viewport picked deletes the whole sheet (it is the selection; undo restores it). `drawings/pages/[pageId]/+page.svelte:461` → `cad/editor/tools.ts:156`, `cad/ui/CadShell.svelte:212`
- [ ] **Rotate content** — 0 / 90 / 180 / 270° buttons turn the view inside a fixed frame. *cad:* missing. `drawings/parts/ViewportFrame.svelte:306`
- [x] **Fit to viewport (scale)** — "Fit to viewport" works out the 1:N that fits the frame, then locks it. *cad:* partial: Fit only re-centres; the scale is not changed. `drawings/parts/viewports/OutletsViewport.svelte:148`
- [ ] **Wheel changes viewport scale** — in an entered viewport the wheel zooms the content about the cursor (changes 1:N). *cad:* missing: type the scale. `drawings/parts/ViewportFrame.svelte:180`
- [ ] **Enter a viewport** — double-click enters it; middle / right drag pans its content, left edits. *cad:* different: Ctrl-drag inside a selected viewport pans it; editing is done in a model pane. `drawings/parts/ViewportFrame.svelte:279`
- [ ] **Click-then-drag guard** — first click only selects; a move needs a second press past 4 px. *cad:* different: press picks and drags at once. `drawings/parts/ViewportFrame.svelte:157`
- [ ] **Label size** — viewport label with its own font size (pt). *cad:* partial: label is a fixed 3.5 mm and always adds "1:N". `drawings/pages/[pageId]/+page.svelte:795` → `cad/views/sheet.ts:126`
- [ ] **Open source** — link button jumps to the owning tool at that floor / room / face (or the Uploads file page). *cad:* missing: no jump from a viewport to its view. `drawings/pages/[pageId]/+page.svelte:139`
- [ ] **Stale-source badge** — a viewport pinned to a source revision shows "N revs behind". *cad:* different: viewports always draw live data; Issue freezes what was sent. `drawings/parts/ViewportFrame.svelte:62`
- [ ] **Per-kind source fields** — after creation each kind keeps its own fields (row id, frame id, file id + page, survey id, riser floors …). *cad:* partial: only Level + View (plan / elevation / room racks / section / risers). `drawings/pages/[pageId]/+page.svelte:869` → `cad/ui/SheetProps.svelte:75`

<details><summary>Covered in cad (10)</summary>

- Drag to move — `drawings/parts/ViewportFrame.svelte:215` → `cad/editor/tools.ts:157`
- Corner resize, 10 mm min — `drawings/parts/ViewportFrame.svelte:251` → `cad/editor/tools.ts:149`
- X / Y / W / H fields — `drawings/pages/[pageId]/+page.svelte:802` → `cad/ui/SheetProps.svelte:93`
- Scale 1:N (typed + presets) — `drawings/pages/[pageId]/+page.svelte:830`, `drawings/parts/DrawingMenubar.svelte:108` → `cad/ui/SheetProps.svelte:84`
- Content offset X / Y — `drawings/pages/[pageId]/+page.svelte:836` → `cad/ui/SheetProps.svelte:100` (centre)
- Lock — `drawings/parts/ViewportFrame.svelte:395` → `cad/ui/SheetProps.svelte:109`
- Label — `drawings/pages/[pageId]/+page.svelte:790` → `cad/ui/SheetProps.svelte:107`
- Delete viewport button — `drawings/pages/[pageId]/+page.svelte:1139` → `cad/ui/SheetProps.svelte:110`
- Undo / redo (frame moves only) — `drawings/pages/[pageId]/+page.svelte:400` → `cad/ui/CadShell.svelte:210` (every edit)
- Esc leaves placement / deselects — `drawings/pages/[pageId]/+page.svelte:441` → `cad/ui/CadShell.svelte:221`
</details>

### Sheet editor: title block, print, publish
- [ ] **Move the title block** — drag it anywhere; its position and size are stored per page. *cad:* missing: fixed layouts (strip / band / compact). `drawings/parts/TitleBlock.svelte:187`
- [ ] **Checked / Approved** — per-page Chkd and App fields in the block. *cad:* missing: a sheet sets only "Drawn"; custom fields are fixed text for the whole project. `drawings/pages/[pageId]/+page.svelte:1188`
- [ ] **Per-page Date / Drawing No. override** — typed date and number in the block. *cad:* partial: date comes from the last revision, number is the sheet number. `drawings/pages/[pageId]/+page.svelte:1203`
- [ ] **Template per page** — each page picks Standard / Compact / Vertical. *cad:* different: one layout for the whole project's template. `drawings/pages/[pageId]/+page.svelte:1164` → `cad/domain/titleBlock.ts:31`
- [ ] **Client / address from the project** — identity cell with logo, project, client, address from the project doc. *cad:* different: template company block, custom fields and uploaded logos. `drawings/parts/TitleBlock.svelte:55`
- [ ] **Browser print at true size** — Print makes the canvas the print root at real mm. *cad:* different: PDF download at true scale (jspdf). `drawings/parts/PageCanvas.svelte:245` → `cad/ui/SheetProps.svelte:128`
- [ ] **Publish revision** — prompts a title, makes a page version + revision, and auto-makes rev A on each source tool and pins it. *cad:* different: Issue… on the register bumps changed sheets and freezes their display lists. `lib/pages/publish.ts:103` → `cad/app/issue.ts:72`
- [ ] **Zoom 100%** — reset to 1 px = 1 mm. *cad:* partial: Home / Fit fits the paper; no 100% zoom. `drawings/parts/PageCanvas.svelte:164`

<details><summary>Covered in cad (5)</summary>

- Page title — `drawings/pages/[pageId]/+page.svelte:617` → `cad/ui/SheetProps.svelte:114`
- Hide / show the title block (keeps values) — `drawings/pages/[pageId]/+page.svelte:104` → `cad/ui/SheetProps.svelte:133`
- Rev / scale / size / title / number auto fields — `drawings/parts/TitleBlock.svelte:289` → `cad/views/sheet.ts:38`
- Delete page — `drawings/pages/[pageId]/+page.svelte:555` → `cad/ui/SheetsTab.svelte:101` (archive) / Del
- Zoom to fit — `drawings/parts/PageCanvas.svelte:171` → `cad/ui/CadShell.svelte:222`
</details>

### Sheet editor: paper annotations
- [x] **Text colour, multi-line, edit in place** — text in pt with a colour picker; double-click edits it on the paper. *cad:* partial: text has a size (mm) only, one line from a prompt, edited in Properties; no colour. `drawings/parts/AnnotationLayer.svelte:220` → `cad/ui/Properties.svelte:423`
- [x] **Dimension on paper** — drag start→end; label shows the length in mm / m. *cad:* missing: no dimension tool (the geometry kind exists but is not drawn). `drawings/parts/AnnotationLayer.svelte:158`
- [ ] **Symbols** — north arrow, level / datum, detail bubble with size, rotation and colour. *cad:* missing. `drawings/parts/AnnotationLayer.svelte:118`
- [ ] **End-point handles** — drag either end of an arrow / dimension or a cloud corner. *cad:* partial: notes move as a whole; no point grips. `drawings/parts/AnnotationLayer.svelte:205`
- [ ] **Annotation colour** — colour on text, arrows, dims, clouds, symbols. *cad:* missing. `drawings/pages/[pageId]/+page.svelte:722`
- [ ] **Arrow** — drag a straight arrow. *cad:* different: Leader tool (click points, optional text). `drawings/parts/AnnotationLayer.svelte:155` → `cad/editor/noteTool.ts:25`
- [ ] **Rectangle revision cloud** — drag a box. *cad:* different: cloud is a clicked polyline with arc size. `drawings/parts/AnnotationLayer.svelte:40` → `cad/editor/noteTool.ts:25`

<details><summary>Covered in cad (3)</summary>

- Select and drag annotations — `drawings/parts/AnnotationLayer.svelte:67` → `cad/editor/tools.ts:270`
- Delete key removes an annotation — `drawings/pages/[pageId]/+page.svelte:451` → `cad/ui/CadShell.svelte:212`
- Notes print with the page — `drawings/parts/PageCanvas.svelte:325` → `cad/views/sheet.ts:131`
</details>

### Viewport: Rack Elevation
- [x] **One row only** — optional row id shows just that row (empty = all rows). *cad:* partial: the view spec takes a row, but the picker only offers whole rooms. `drawings/parts/viewports/RackElevationViewport.svelte:42` → `cad/ui/SheetProps.svelte:79`

<details><summary>Covered in cad (2)</summary>

- Front / rear of a room's racks, rows in order with a gap — `drawings/parts/viewports/RackElevationViewport.svelte:42` → `cad/views/rackRow.ts:27`
- Floor / room / face pickers — `drawings/pages/[pageId]/+page.svelte:872` → `cad/ui/SheetProps.svelte:70`
</details>

### Viewport: Rack Plan
- [ ] **Server-room rack plan** — read-only plan of a room's rack rows and room objects, filterable by row ids. *cad:* different: a plan viewport of the level, scaled and centred on the room; no row filter. `drawings/parts/viewports/RackPlanViewport.svelte:26` → `cad/views/plan.ts:27`

### Viewport: Frame Detail
- [x] **Single-frame port grid** — one frame (by Frame ID) drawn by the Frames engine: port labels, high-level ports, reserved-port hatching. *cad:* partial: the rack-row view shows labels and reserved ports, but for a whole room; no single frame / rack pick. `drawings/parts/viewports/FrameDetailViewport.svelte:113` → `cad/views/rackRow.ts:129`

### Viewport: Floorplan
- [ ] **Any file page** — any uploaded file and page number, fitted to the frame. *cad:* partial: a plan viewport shows the level's calibrated underlay; no free file / page viewport. `drawings/parts/viewports/FloorplanViewport.svelte:26`

### Viewport: Outlets / Trunks
- [x] **Outlets / Trunks toggles** — show or hide all outlets or all trunks in this viewport. *cad:* missing: no per-viewport visibility. `drawings/pages/[pageId]/+page.svelte:1006`
- [x] **Layer toggles** — Outlets Low / High, Trunks Primary / Secondary, Ceiling / Floor per viewport. *cad:* missing (`hiddenLayers` exists in the types, no UI). `drawings/parts/viewports/OutletsViewport.svelte:164`
- [ ] **Cable routes with length** — route polylines with waypoint dots and a length pill (m). *cad:* missing on drawings: routes and lengths are computed but not drawn on the plan. `drawings/parts/viewports/OutletsViewport.svelte:450`
- [ ] **Edit in the viewport** — entered viewport: drag outlets and trunk nodes, "+ Outlet" tool. *cad:* different: edit in the plan pane (split beside the sheet). `drawings/parts/viewports/OutletsViewport.svelte:245`
- [ ] **Disconnect node** — trunk right-click menu splits a junction onto a new node. *cad:* missing (insert / delete node exist). `drawings/parts/viewports/OutletsViewport.svelte:350`

<details><summary>Covered in cad (3)</summary>

- Floorplan + outlets + trunks at true scale — `drawings/parts/viewports/OutletsViewport.svelte:129` → `cad/views/sheet.ts:73`
- Insert node on a trunk — `drawings/parts/viewports/OutletsViewport.svelte:342` → `cad/editor/tools.ts:140`
- Delete node / delete trunk — `drawings/parts/viewports/OutletsViewport.svelte:366` → `cad/ui/PathProps.svelte:50`, `cad/ui/CadShell.svelte:212`
</details>

### Viewport: Patching
- [ ] **Patch schedule on paper** — table of #, From, To, Cable, m, Status (coloured) for a room; labels fall back to the Frames engine. *cad:* missing on sheets: Patch list tab + Excel only (tables on paper are "later"). `drawings/parts/viewports/PatchingViewport.svelte:170` → `cad/render/exports.ts:35`

### Viewport: Risers
- [ ] **Floor range / hidden floors** — From / To floor and per-floor hide in the riser viewport. *cad:* missing: the riser view always draws every floor. `drawings/pages/[pageId]/+page.svelte:1080` → `cad/views/riser.ts:39`
- [ ] **Risers-tool drawing** — draws the Risers tool's own rooms, ladders, cable lanes, labels, compression breaks; pick one of several riser drawings. *cad:* different: the riser view is generated from levels, risers and routes. `drawings/parts/viewports/RisersViewport.svelte:131`

### Viewport: Photo Survey
- [ ] **Survey photos** — album grid with annotation-count badges, or one photo with its drawn annotations. *cad:* missing. `drawings/parts/viewports/SurveyViewport.svelte:68`

### Viewport: Fill Rate
- [ ] **Fill sections on paper** — grid of cross-sections with fill % (red over 50 %). *cad:* missing on sheets: fill shows in run Properties and a screen-only plan overlay. `drawings/parts/viewports/FillrateViewport.svelte:46` → `cad/ui/ViewCanvas.svelte:111`

### Viewport: Text
- [ ] **Text box** — a framed block that wraps, with pt size and left / centre / right align. *cad:* partial: paper Text is one line at a point; width / align exist in the geometry but have no UI. `drawings/parts/viewports/TextViewport.svelte:13` → `cad/domain/shapes.ts:73`

### Viewport: Image
- [ ] **Image by URL** — picture fitted contain / cover in the frame. *cad:* missing: image shapes exist in the model but there is no tool. `drawings/parts/viewports/ImageViewport.svelte:11`

## Packages (`routes/projects/[pid]/packages/` + `lib/versioning/`)

### Packages and builder
- [ ] **Persistent typed package** — a named package with a type (Concept, Schematic, Detailed, RFP, Shop, As-built, Custom) and a description, kept and re-issued. *cad:* different: each Issue is a one-off package with free "purpose" text. `packages/parts/PackageList.svelte:9` → `cad/ui/IssuePanel.svelte:318`
- [x] **Edit package details** — rename and re-describe a package later. *cad:* missing: no edit UI for an issue. `packages/parts/PackageList.svelte:146`
- [ ] **Package status** — draft / published / superseded badges. *cad:* missing: issues have no status. `packages/parts/PackageList.svelte:19`
- [ ] **Pick any revision** — add a chosen (sheet, revision) pair, including older revisions. *cad:* missing: a sheet goes at its current state (bumped if changed). `packages/parts/PackageList.svelte:76`
- [ ] **Order and remove items** — move sheets up / down, remove them. *cad:* partial: order follows the selection; the transmittal sorts by number; no reorder. `packages/parts/PackageList.svelte:96`
- [ ] **Auto-add all pages** — publishes every "include" page and adds the new revisions. *cad:* different: select all in the register, then Issue…. `lib/pages/publish.ts:159`

### Publishing an issue
- [ ] **Issue code and sequence** — publish makes `TYPE-001`, `TYPE-002` … per package. *cad:* missing: an issue has a name and date, no code. `lib/versioning/service.ts:482`
- [ ] **Publish Update / supersede** — re-publishing the same package supersedes the previous issue. *cad:* missing: no link between issues. `lib/versioning/service.ts:438`
- [ ] **Immutable issue** — a published issue can't be edited or deleted. *cad:* partial: an Issue is a normal entity; undo removes it (the frozen copies and PDF stay). `packages/parts/PublishDialog.svelte:23` → `cad/app/issue.ts:72`

### Versions and revisions (`parts/VersionPanel.svelte`, used by Outlets, Racks, Frames, Elevations and drawing pages)
- [ ] **Save version** — snapshot of the whole tool doc with optional notes. *cad:* missing: undo history only, no named snapshots. `parts/VersionPanel.svelte:53`
- [ ] **Version list** — versions with number, date, notes. *cad:* missing. `parts/VersionPanel.svelte:178`
- [ ] **Restore a version** — restores as a new version and applies it to the tool. *cad:* missing. `parts/VersionPanel.svelte:65`
- [ ] **Delete a version** — with confirm. *cad:* missing. `parts/VersionPanel.svelte:115`
- [ ] **Issue revision from a version** — typed code (next by default), title, description; locked; a used code is refused. *cad:* partial: revisions only come from Issue; the code is the next by rule (first rev settable), the note is the purpose; no title / description. `parts/VersionPanel.svelte:84` → `cad/domain/issue.ts:10`
- [ ] **Revisions tab** — list of code, title, description, date, from-version, lock icon. *cad:* partial: only the title block's revision table (last 5: code, date, note). `parts/VersionPanel.svelte:218`
- [ ] **Revisions of tool views** — racks / frames / outlets docs get drawings and revisions of their own (auto-made on first use). *cad:* missing: only sheets have revisions. `lib/versioning/service.ts:101`

<details><summary>Covered in cad (3)</summary>

- Print the package (each sheet from its revision, mixed paper sizes in one job) — `packages/[pkgId]/print/+page.svelte:146` → `cad/app/issue.ts:112` (Reprint, frozen)
- Revision codes A … Z, AA — `lib/versioning/service.ts:309` → `cad/domain/issue.ts:10`
- Package = list of sheets at revisions — `lib/versioning/service.ts:388` → `cad/domain/issue.ts:62`
</details>

## Edit 3D (`routes/projects/[pid]/edit3d/`)

### Sheets and viewports
- [ ] **ISO direction** — a viewport can look plan / front / rear / left / right / ISO, refitting on change. *cad:* partial: plan, elevations, sections; no ISO. `edit3d/parts/Sidebar.svelte:87`
- [ ] **Model per viewport** — each viewport picks one of the shared models. *cad:* different: a viewport picks a level. `edit3d/parts/Sidebar.svelte:78`
- [x] **Marquee select viewports** — drag a box on empty paper to select several; Delete removes them all. *cad:* missing: one viewport at a time. `edit3d/parts/sheet.svelte.ts:86`
- [ ] **Pan / zoom mode** — hand button: drag pans, wheel zooms the view's content at the cursor. *cad:* partial: Ctrl-drag pans; no wheel zoom of a viewport. `edit3d/parts/sheet.svelte.ts:561`
- [ ] **Maximize a view** — fill the canvas with one view (own camera), restore button. *cad:* different: open the view in a pane / split. `edit3d/parts/sheet.svelte.ts:585`
- [ ] **Browser print A3** — prints the paper at true A3 size. *cad:* different: PDF download. `edit3d/+page.svelte:126`

<details><summary>Covered in cad (5)</summary>

- Named sheets: pick, rename, new, delete — `edit3d/parts/persist.svelte.ts:109` → `cad/ui/SheetList.svelte:23`
- Frame move / corner resize — `edit3d/parts/sheet.svelte.ts:519` → `cad/editor/tools.ts:149`
- View name, scale, pan fields — `edit3d/parts/Sidebar.svelte:72` → `cad/ui/SheetProps.svelte:84`
- Page pan / zoom, Fit sheet — `edit3d/parts/sheet.svelte.ts:140` → `cad/ui/ViewCanvas.svelte:306`
- Delete viewport — `edit3d/parts/sheet.svelte.ts:507` → `cad/ui/SheetProps.svelte:110`
</details>

### 3D view
- [ ] **ISO orbit** — drag orbits yaw / pitch; wheel zooms. *cad:* missing (3D view is optional, later). `edit3d/parts/sheet.svelte.ts:573`
- [ ] **Hidden-line toggle** — ISO draws opaque faces far→near (View ▸ Hidden-line 3D). *cad:* missing. `edit3d/parts/ViewObjects.svelte:47`

### Sections
- [ ] **Box section** — drag a box on a plan to make a front elevation clipped to it, auto-fitted. *cad:* different: Section tool draws a cut line with depth and flip. `edit3d/parts/sheet.svelte.ts:247` → `cad/editor/sectionTool.ts:23`

<details><summary>Covered in cad (1)</summary>

- Section marker on the plan: drag to move, handles to resize, view follows — `edit3d/parts/PaperView.svelte:62` → `cad/editor/handles.ts:110`
</details>

### Objects and editing
- [ ] **Edit inside a sheet viewport** — double-click a view, then click / drag its objects on the paper. *cad:* different: viewport content isn't pickable; edit in plan / elevation panes. `edit3d/parts/PaperView.svelte:38` → `cad/views/sheet.ts:4`
- [ ] **Prisms (boxes, cylinders)** — n-gon (3–24 edges) footprint pushed up: X / Y / Z / W / D / H / Edges fields, corner resize handles. *cad:* partial: rect / circle / polygon regions with extent are drawn, but there is no tool, no properties and no handles. `edit3d/parts/Sidebar.svelte:12` → `cad/views/plan.ts:88`
- [ ] **Wall height handle** — in an elevation, drag the wall top to set its height. *cad:* partial: set Height in Properties. `edit3d/parts/ViewObjects.svelte:83`
- [ ] **Typed point X / Y** — wall and conduit points have X / Y (/ Z) fields. *cad:* partial: node Z is editable; X / Y are read-only. `edit3d/parts/Sidebar.svelte:57` → `cad/ui/PathProps.svelte:86`
- [ ] **Polygon conduit section** — conduit section of 3–24 edges. *cad:* partial: round (conduit) or rectangle (trunk) only. `edit3d/parts/Sidebar.svelte:53`
- [x] **Delete key on a point** — Del removes the selected conduit point. *cad:* different: "Delete point" in Properties. `edit3d/parts/sheet.svelte.ts:472` → `cad/ui/PathProps.svelte:50`

<details><summary>Covered in cad (5)</summary>

- Walls (z, height, thickness) — `edit3d/parts/Sidebar.svelte:29` → `cad/ui/PathProps.svelte:72`
- Move objects in plan / elevation — `edit3d/parts/sheet.svelte.ts:373` → `cad/editor/tools.ts:270`
- Insert a point mid-segment — `edit3d/parts/sheet.svelte.ts:443` → `cad/editor/tools.ts:140`
- Extend from an end point — `edit3d/parts/sheet.svelte.ts:459` → `cad/editor/tools.ts:138` (Ctrl-grip branch)
- Delete object (Del) — `edit3d/parts/sheet.svelte.ts:497` → `cad/ui/CadShell.svelte:212`
</details>

### Layers
- [x] **Layers panel** — per-model layers: add, rename, delete (objects move to the first layer). *cad:* missing: a Layer entity exists, no UI. `edit3d/parts/sheet.svelte.ts:207` → `cad/domain/drawing.ts:87`
- [x] **Layer colour / show / lock** — objects draw in the layer colour; hidden layers vanish; locked ones can't be edited. *cad:* missing. `edit3d/parts/Panels.svelte:38`
- [x] **Assign to layer** — "→" puts the selected object on a layer. *cad:* missing. `edit3d/parts/sheet.svelte.ts:223`


## Pages — workspace, drafting, model (`routes/projects/[pid]/pages/`)

Note: the sheets / viewports / title block / print / DXF / drawing management / issue side of Pages is in the other Pages file. Here "model" means a Pages model (a floor's walls, boxes, conduits, shapes), which cad replaces with a level's plan.

### Command line and typed input
- [ ] **Command line** — a line above the status bar: typing anywhere over the drawing lands there, Tab completes, ↑ / ↓ recall, the last lines of output show. *cad:* partial: typing a digit, `@`, `-` or `.` while a drawing tool is on opens a one-line point box; no command names, output, history or completion (`cad/ui/CadShell.svelte:197`). `pages/parts/CommandLine.svelte:2`
- [ ] **Commands by name and alias** — about 110 commands typed by name or alias (L, REC, M, CO, AR …), with suggestions as you type. *cad:* missing: tools have single-letter keys instead (`cad/ui/CadShell.svelte:97`), which ADR 0005 says should not exist. `pages/ui/commands.ts:12`
- [ ] **Prompts with clickable options** — "Specify base point [Close/Undo]"; the options in brackets are buttons. *cad:* partial: one fixed hint per tool in the tool bar (`cad/ui/CadShell.svelte:114`). `pages/parts/CommandLine.svelte:62`
- [ ] **Command scripts with base point, rubber band and ghost** — commands ask for points, numbers, options or text; clicks are snapped and show a rubber band and a preview. *cad:* missing. `pages/ui/cmdScripts.ts:74`
- [ ] **Enter / Space repeats the last command** — an empty Enter (or Space in ACAD mode) finishes a draw or repeats the last command. *cad:* missing. `pages/+page.svelte:1313`
- [ ] **Scripted input with `;` and `;;`** — several steps on one line, `;;` = Enter (AutoCAD script style). *cad:* missing. `pages/ui/commands.ts:186`
- [ ] **C closes, U undoes a point** — typed while drawing a line or run. *cad:* partial: Backspace drops the last point (`cad/editor/pathTool.ts:48`); paths can't be closed. `pages/ui/commands.ts:176`
- [x] **Length / angle readout by the cursor** — length, angle, Δx / Δy while drawing; W × H for boxes; Δ while dragging or in MOVE / COPY; segment width while gripping. *cad:* missing (ADR 0005 keeps it). `pages/ui/vpInteraction.svelte.ts:290`
- [x] **ACAD mode toggle** — on: wheel zooms, draw with two clicks; off: wheel pans, press-drag draws. *cad:* missing: the wheel always zooms, tools take clicks. `pages/parts/StatusBar.svelte:55`

<details><summary>Covered in cad (2)</summary>

- Typed points `x,y` · `@dx,dy` · `d<a` · `@d<a` · a bare distance towards the cursor — `pages/ui/commands.ts:160` → `cad/editor/input.ts:64`
- Typed points for the outlet tool (`@1200,0` from the last outlet) — `pages/ui/cmdScripts.ts:74` → `cad/editor/tools.ts:356`
</details>

### Selection, keys and clipboard
- [x] **Crossing window** — drag right → left selects what the box touches; left → right only what it encloses. *cad:* partial: window (enclosed) only, both ways (`cad/editor/pick.ts:58`). `pages/ui/itemEdit.svelte.ts:2`
- [x] **Click-cycle through stacked items** — repeat clicks on the same spot step down to the item underneath. *cad:* missing: the top item always wins. `pages/ui/vpInteraction.svelte.ts:838`
- [x] **Select a run, then one segment** — a second click on a selected wall / run selects that segment; Delete removes just it. *cad:* missing. `pages/ui/vpView.svelte.ts:260`
- [x] **Select all** — Ctrl+A / SELECTALL: every shape and object on visible, unlocked layers. *cad:* missing. `pages/ui/vpInteraction.svelte.ts:1071`
- [x] **Select similar** — SELECTSIMILAR: every shape of the same type and layer (or block). *cad:* missing. `pages/ui/cmdScripts.ts:474`
- [x] **Ctrl-drag copy** — Ctrl while dragging leaves a copy; pressing / releasing Ctrl mid-drag switches copy ↔ move. *cad:* missing (phase 6 todo; Ctrl-drag on a grip branches instead). `pages/ui/vpInteraction.svelte.ts:1058`
- [x] **Shift axis lock while moving** — Shift (or ORTHO) locks a move to H or V, live. *cad:* missing (phase 6 todo). `pages/ui/itemEdit.svelte.ts:55`
- [x] **Arrow-key nudge** — arrows move the selection 1 mm (Shift = 10), one undo step per burst. *cad:* missing. `pages/ui/vpInteraction.svelte.ts:1087`
- [x] **Copy / cut / paste** — Ctrl+C / X / V of shapes and 3D objects; new ids, attachments kept, layers matched by name; Edit menu too. *cad:* missing. `pages/ui/clipboard.ts:11`
- [x] **Paste in another tab or project** — copies go to the system clipboard as marked JSON. *cad:* missing. `pages/ui/clipboard.ts:86`
- [x] **Paste at the cursor** — Ctrl+Shift+V centres the paste on the cursor (Ctrl+V keeps the position). *cad:* missing. `pages/+page.svelte:749`
- [x] **Paste a screenshot or picture** — an image on the clipboard is uploaded and inserted as an image shape. *cad:* missing. `pages/+page.svelte:751`
- [x] **Text to and from office apps** — copied shapes go out as readable text / HTML; text pasted from Word / Excel becomes a text or a note. *cad:* missing. `pages/ui/clipboard.ts:147`
- [ ] **Duplicate** — Ctrl+D copies the selection 5 paper mm aside. *cad:* missing. `pages/ui/vpInteraction.svelte.ts:1073`
- [x] **Group / ungroup** — Ctrl+G / Ctrl+Shift+G; groups select and move as one. *cad:* missing: the `Group` record exists with no UI (`cad/domain/drawing.ts:98`). `pages/ui/vpInteraction.svelte.ts:1083`
- [x] **Draw order** — Ctrl+] / Ctrl+[ (Shift = to front / back), DRAWORDER. *cad:* missing: `Shape.order` is never set or used (`cad/domain/shapes.ts:160`). `pages/ui/vpInteraction.svelte.ts:1078`
- [x] **Common fields for any multi-selection** — layer, colour, base Z, height … for shapes and 3D objects together; "mixed" where they differ. *cad:* partial: common fields for racks, outlets and devices only (`cad/ui/Properties.svelte:165`). `pages/parts/props/ModelObjsProps.svelte:39`
- [x] **Edit a label in place** — double-click (or F2) edits an outlet / block label, box / rack name, text, dimension or line label on the drawing. *cad:* missing: labels are edited in Properties or the grid. `pages/ui/vpInteraction.svelte.ts:1064`
- [x] **Tab to the next item** — Tab / Shift+Tab in the label editor saves and moves to the next item of the same kind in reading order. *cad:* missing. `pages/ui/render/VpWidgets.svelte:65`

<details><summary>Covered in cad (8)</summary>

- Click selects, Ctrl+click toggles (Shift kept for constraints by decision) — `pages/ui/selection.ts:43` → `cad/editor/tools.ts:191`
- Window selection (drag on empty space) — `pages/ui/itemEdit.svelte.ts:46` → `cad/editor/tools.ts:294`
- Drag-move as one undo step, attached run ends follow — `pages/ui/vpModelEdit.ts:76` → `cad/editor/tools.ts:267`
- Alt while dragging = no snap — `pages/ui/snap.ts:215` → `cad/editor/tools.ts:99`
- Delete / Backspace deletes the selection (with cascade) — `pages/ui/vpInteraction.svelte.ts:1086` → `cad/ui/CadShell.svelte:212`
- Esc ladder (end draft → Select → clear selection) — `pages/ui/vpInteraction.svelte.ts:1094` → `cad/ui/CadShell.svelte:221`
- Right-click ends a draw, then goes back to Select — `pages/ui/vpInteraction.svelte.ts:1022` → `cad/ui/ViewCanvas.svelte:283`
- Undo / redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) — `pages/+page.svelte:1305` → `cad/ui/CadShell.svelte:210`
</details>

### Drawing commands
- [x] **Rectangle** — RECT from two corners; CEN draws it from the centre out. *cad:* missing: rect geometry exists in the model but no tool makes one (`cad/domain/shapes.ts:67`). `pages/ui/place.ts:28`
- [ ] **Circle** — CIRCLE: centre + radius or Diameter. *cad:* missing (ADR 0005 lists it). `pages/ui/cmdScripts.ts:323`
- [x] **Arc** — ARC through three points; drawn, snapped, gripped, moved like any shape. *cad:* missing (ADR 0005 lists it). `pages/ui/cmdScripts.ts:316`
- [x] **Polygon** — POLYGON: sides, centre, inscribed / circumscribed, radius. *cad:* missing. `pages/ui/cmdScripts.ts:334`
- [ ] **Text in the model** — TEXT on a plan or elevation. *cad:* partial: the Text tool works on sheets only (`cad/app/workspace.svelte.ts:27`); plan text is drawn if it exists. `pages/ui/commands.ts:30`
- [ ] **Leader / callout in the model** — LEADER: arrowhead, landing, text, as a callout on the plan. *cad:* partial: Leader on sheets only (`cad/editor/noteTool.ts:25`). `pages/ui/cmdScripts.ts:348`
- [ ] **Revision cloud modes** — REVCLOUD from two corners, from points, or round an existing rect / closed polyline. *cad:* partial: point by point, on sheets only (`cad/editor/noteTool.ts:25`). `pages/ui/cmdScripts.ts:674`
- [ ] **Measure a distance** — DIST / the Measure button: two clicks, distance and angle in the command line. *cad:* missing. `pages/ui/cmdScripts.ts:278`

<details><summary>Covered in cad (7)</summary>

- Line / polyline (LINE, PLINE) — `pages/ui/commands.ts:14` → `cad/editor/pathTool.ts:17`
- Wall (WALL) — `pages/ui/place.ts:67` → `cad/editor/pathTool.ts:90`
- Trunk (TRUNK) — `pages/ui/place.ts:93` → `cad/editor/pathTool.ts:91`
- Pipe / conduit (PIPE) — `pages/ui/commands.ts:33` → `cad/editor/pathTool.ts:99`
- Outlet (OUTLET) — `pages/ui/outletPlace.svelte.ts:33` → `cad/editor/tools.ts:350`
- Rack (RACK) — `pages/ui/cmdScripts.ts:591` → `cad/editor/tools.ts:392`
- Section line at any angle (SECTIONLINE) — `pages/ui/place.ts:140` → `cad/editor/sectionTool.ts:23`
</details>

### Modify commands
- [x] **MOVE with a base point** — pick a base point, then a second point or a typed offset. *cad:* partial: drag only; no base point or typed offset (`cad/editor/tools.ts:267`). `pages/ui/cmdScripts.ts:251`
- [x] **COPY** — base point, then as many copies as you place until Enter. *cad:* missing. `pages/ui/cmdScripts.ts:258`
- [ ] **ROTATE** — the command (base point + angle) and Properties › ROTATE (⟲ ⟳ 90°, 180°, any angle) for shapes, boxes, racks, blocks, images, walls, runs; several turn about their middle. *cad:* partial: racks ⟲ ⟳ and rotation fields on racks and block inserts only (`cad/ui/Properties.svelte:304`). `pages/ui/cmdScripts.ts:267`
- [ ] **SCALE** — base point + factor. *cad:* partial: a Scale field on block inserts only (`cad/ui/Properties.svelte:442`). `pages/ui/cmdScripts.ts:273`
- [ ] **MIRROR** — about a two-point line, keep or erase the source; blocks flip, text stays readable. *cad:* missing. `pages/ui/cmdScripts.ts:454`
- [ ] **ARRAY** — rectangular (columns × rows × spacing) or polar; outlet copies get the next free labels. *cad:* missing (ADR 0005 lists it, also along a path). `pages/ui/cmdScripts.ts:431`
- [ ] **OFFSET** — parallel copy of lines, polylines, rects, ellipses, arcs. *cad:* missing. `pages/ui/cmdScripts.ts:356`
- [x] **TRIM** — click the part of a line to cut back to crossing shapes. *cad:* missing. `pages/ui/cmdScripts.ts:372`
- [x] **EXTEND** — grow a line end to the next shape. *cad:* missing. `pages/ui/cmdScripts.ts:383`
- [ ] **STRETCH** — a crossing window: inside moves, crossing shapes stretch. *cad:* missing. `pages/ui/cmdScripts.ts:491`
- [x] **MATCHPROP / format painter** — copy one shape's layer and style (colour, fill, lineweight, line type, font, align) onto others. *cad:* missing. `pages/ui/cmdScripts.ts:462`
- [x] **ALIGN / DISTRIBUTE** — left / centre / right / top / middle / bottom, equal gaps; shapes and 3D objects; also Properties › ARRANGE. *cad:* missing. `pages/ui/arrange.ts:23`
- [ ] **EXPLODE** — a block, polyline, rectangle or group into its parts. *cad:* partial: block inserts only (`cad/domain/blocks.ts:88`). `pages/ui/explode.ts:12`
- [ ] **Group transform box** — rotate the selection about its middle or scale it from a corner, one undo step. *cad:* missing. `pages/ui/groupXf.ts:28`
- [ ] **PURGE** — delete custom blocks no model uses (asks; warns the library is shared). *cad:* missing. `pages/ui/cmdScripts.ts:530`
- [ ] **AUDIT** — finds missing blocks, broken wall / conduit nodes and segments, loose connections, stale rack allocations, and offers a fix. *cad:* missing (import checks only, `cad/domain/validate.ts:1`). `pages/3dview/graphAudit.ts:83`

<details><summary>Covered in cad (1)</summary>

- ERASE / Delete — `pages/ui/commandRunner.svelte.ts:173` → `cad/editor/commands.ts:25`
</details>

### Snaps, grips and constraints
- [x] **Centre snap** — centres of circles, ellipses, rects and boxes. *cad:* partial: path ends / midpoints and outlet / rack centres only (`cad/editor/snap.ts:32`). `pages/ui/snap.ts:40`
- [x] **Snap to box corners and edges on the plan** — 3D object corners and edges are snap points. *cad:* partial: elevations snap to any drawn vertex (`cad/editor/snap.ts:20`); the plan does not snap to rack corners. `pages/ui/snap.ts:112`
- [ ] **SNAP / OSNAP toggles** — status-bar buttons (F9 for SNAP) turn snapping off for good. *cad:* partial: only Alt held while clicking / dragging (`cad/editor/tools.ts:99`). `pages/+page.svelte:1304`
- [ ] **Snap step choice** — 1 / 5 / 10 / 25 / 1U / 50 … 1000 mm. *cad:* partial: fixed 10 mm (`cad/editor/snap.ts:10`). `pages/parts/StatusBar.svelte:14`
- [ ] **Visible grid** — GRID: a line grid at the snap step that fades with zoom, never printed. *cad:* missing. `pages/ui/grid.ts:51`
- [ ] **ORTHO** — F8: lines, walls, runs horizontal / vertical. *cad:* missing (ADR 0005: later). `pages/ui/snap.ts:228`
- [ ] **POLAR** — F10: the rubber band snaps to 15° rays with a tracking line. *cad:* missing (ADR 0005: later). `pages/ui/snap.ts:237`
- [x] **Shift-constrain while drawing** — Shift gives 15° lines, H / V runs, square rects, live as Shift goes up / down. *cad:* missing (ADR 0005 relies on it; phase 6 todo). `pages/ui/annotations.ts:17`
- [ ] **Rotate handle** — on every shape and box (plan), Shift = 15° steps. *cad:* missing. `pages/ui/grips.ts:73`
- [ ] **Resize grips on rotated rects and boxes** — the opposite corner stays put; sizes snap along the shape's own axes. *cad:* missing. `pages/ui/grips.ts:104`
- [x] **Alt-drag a node** — splits a run at that node, or pulls a node off a run it is joined to. *cad:* missing. `pages/ui/modelEdit.ts:138`
- [x] **Segment width grip** — drag a bar on a selected segment's edge to set that segment's width (Shift = 50 mm). *cad:* missing. `pages/ui/grips.ts:87`
- [x] **Delete a node with the Delete key** — select a node of a wall / run and press Delete (2 segments join). *cad:* different: ✕ in the Properties node table, healed the same way (`cad/ui/PathProps.svelte:49`). `pages/ui/modelEdit.ts:50`
- [ ] **Depth snap for drawing in an elevation** — the drawn point takes the depth of the visible segment under it (or of a selected plan guide). *cad:* different: a Depth field, and the other pane's work-plane line (`cad/ui/CadShell.svelte:241`). `pages/ui/snap.ts:330`

<details><summary>Covered in cad (7)</summary>

- End and midpoint snaps with a snap marker — `pages/ui/snap.ts:159` → `cad/editor/snap.ts:32`
- Node grips on walls / runs; a vertical stack is one grip — `pages/ui/grips.ts:79` → `cad/editor/grips.ts:100`
- Double-click a segment to add a node (plan and elevation) — `pages/ui/modelEdit.ts:91` → `cad/editor/tools.ts:322`
- Ctrl-drag a node to branch — `pages/ui/modelEdit.ts:127` → `cad/editor/tools.ts:139`
- A run end snapped onto an outlet / rack attaches and follows it — `pages/3dview/connect.ts:100` → `cad/editor/snap.ts:38`
- Grid snap of moves (Alt = free) — `pages/ui/snap.ts:25` → `cad/editor/tools.ts:270`
- Node drag in an elevation changes its height — `pages/ui/snap.ts:281` → `cad/editor/grips.ts:132`
</details>

### Labels and numbering
- [x] **Renumber by clicking** — from a selected outlet, click the others in order; each takes the next label; Esc stops. *cad:* missing: the renumber function exists without UI (`cad/domain/labels.ts:91`; phase 2 todo, high priority). `pages/parts/props/EntProps.svelte:349`
- [ ] **Auto-number a selection** — template (`R-###`), start, step, which attribute, rows or columns order. *cad:* missing (shapes have `label`, nothing numbers them). `pages/ui/autoNumber.ts:53`
- [x] **Copies take the next free label** — pasted / arrayed outlets get unused labels. *cad:* missing (no copy). `pages/ui/clipboard.ts:178`
- [ ] **Line labels** — a line's text drawn along it at its start, middle or end. *cad:* partial: a run's label is drawn at its first node; lines and walls show none (`cad/views/plan.ts:137`). `pages/ui/annotations.ts:62`
- [x] **Linked symbols** — a marker block can link to a sheet or a URL; a badge shows on hover, click or double-click opens it. *cad:* missing. `pages/ui/blocks.ts:88`

<details><summary>Covered in cad (2)</summary>

- Next label on placing an outlet (never reusing one on the level) — `pages/ui/outletPlace.svelte.ts:33` → `cad/editor/tools.ts:363`
- Sticky outlet defaults (ports, usage, height) — `pages/ui/outletPlace.svelte.ts:19` → `cad/editor/tools.ts:365`
</details>

### Text, dimensions and annotation in the model
- [x] **Dimension tool** — DIM with Aligned / Linear / Horizontal / Vertical (bar, or A / L / H / V while drawing); DIMLINEAR, DIMALIGNED. *cad:* missing: dimension geometry exists but is not drawn (`cad/views/plan.ts:95`). `pages/ui/dimSpec.svelte.ts:31`
- [ ] **Rotated linear dimension** — measures along a set angle; turning an H / V dim keeps it linear. *cad:* missing. `pages/parts/props/EntProps.svelte:286`
- [ ] **Chain and baseline dimensions** — DIMCONTINUE, DIMBASELINE (stacked, with extension lines). *cad:* missing. `pages/ui/cmdScripts.ts:163`
- [ ] **Radius / diameter dimensions** — DIMRADIUS, DIMDIAMETER on arcs and circles. *cad:* missing. `pages/ui/cmdScripts.ts:195`
- [ ] **Angular dimension** — DIMANGULAR between two lines. *cad:* missing. `pages/ui/cmdScripts.ts:632`
- [x] **Dimension text and lines** — `<>` text override, text offset grip in paper mm, slide along the line, extension-line grip, unit mm / cm / m. *cad:* missing. `pages/ui/geometry.ts:87`
- [x] **Type a line's length** — Properties › Length sets a line's length. *cad:* missing. `pages/parts/props/EntProps.svelte:283`
- [ ] **Wrapped markdown notes** — NOTE: headings, lists, tables, bold, wrapped to a width, optional frame; a big editor with preview; paste from Word / Excel keeps formatting. *cad:* missing. `pages/ui/noteLayout.ts:35`
- [x] **Text style** — font size in pt, left / centre / right and top / middle / bottom align. *cad:* partial: a size in mm on sheet text only (`cad/ui/Properties.svelte:425`). `pages/parts/props/EntProps.svelte:467`
- [x] **Callout frame** — box, underline or none. *cad:* missing. `pages/ui/geometry.ts:57`
- [x] **Line end heads** — arrow, dot or tick at each end of a line. *cad:* missing. `pages/ui/annotations.ts:48`
- [x] **Floor-tile grid** — a rect draws a tile grid at a set size, offset to line up with the building. *cad:* missing. `pages/ui/annotations.ts:85`
- [x] **Legend on the drawing** — LEGEND: a block listing the layers in use with swatches and counts, updating itself. *cad:* different: a left-panel Symbols list with counts, not placed on the drawing (`cad/ui/Legend.svelte:1`). `pages/ui/legend.ts:13`
- [x] **Shapes that belong to one elevation** — text, lines, images drawn in an elevation's own plane, shown only there. *cad:* partial: view-owned and vertical-plane shapes exist in the model, but no tool draws them (`cad/domain/shapes.ts:19`). `pages/ui/hit.ts:54`

<details><summary>Covered in cad (1)</summary>

- Plan shapes have a height and show edge-on in elevations (drag up / down there) — `pages/ui/hit.ts:69` → `cad/views/elevation.ts:142`
</details>

### Outlets
- [ ] **Height presets and High / Low default height** — Floor / +300 / +1200 / Plenum / Ceiling buttons; picking High sets Z to mid-plenum, Low to the floor. *cad:* partial: Tier and Z fields; Tier doesn't change Z (`cad/ui/Properties.svelte:249`). `pages/ui/hiLo.ts:68`
- [ ] **High / Low on shapes and boxes** — the same Level field on any shape or 3D box. *cad:* missing. `pages/ui/hiLo.ts:48`
- [ ] **Outlet block fields** — NOTE and TYPE attributes, symbol scale and mirror, per outlet or for several. *cad:* partial: symbol choice only (`cad/ui/Properties.svelte:257`). `pages/ui/blocks.ts:123`
- [ ] **Counts in the status bar** — outlets / conduits / racks in the model, or in the selection (SEL). *cad:* partial: outlet count per level in the levels list (`cad/ui/CadShell.svelte:320`). `pages/parts/StatusBar.svelte:58`

<details><summary>Covered in cad (6)</summary>

- Outlets drawn by a block with `{LABEL}` / `{PORTS}` filled in — `pages/ui/blocks.ts:123` → `cad/views/plan.ts:185`
- Low outlets filled, high outlined — `pages/ui/hiLo.ts:48` → `cad/views/plan.ts:187`
- Edit several outlets together ("mixed") — `pages/parts/props/EntProps.svelte:361` → `cad/ui/Properties.svelte:198`
- Outlet schedule to Excel (with height) — `pages/store/outletSchedule.ts:1` → `cad/render/outletSchedule.ts:1`
- Allocate outlets to panel ports (AllocateDialog) — `pages/parts/AllocateDialog.svelte:2` → `cad/ui/OutletGrid.svelte:61`
- Outlets in elevations at their height — `pages/ui/hiLo.ts:37` → `cad/views/elevation.ts:90`
</details>

### Trunks, conduits, walls, openings, boxes
- [x] **Run location presets** — under floor / ceiling plenum / below ceiling / on wall / custom Z, heights from the floor's levels. *cad:* partial: each tool starts at a preset Z from the level heights (`cad/app/workspace.svelte.ts:131`); no choice of location. `pages/ui/trunkSpec.svelte.ts:29`
- [ ] **Run position X / Y / Z** — move a whole wall / run in Properties; Z = its lowest point, slopes and drops kept. *cad:* partial: "All nodes Z" flattens every node to one Z; no X / Y (`cad/ui/PathProps.svelte:79`). `pages/ui/graphPos.ts:17`
- [ ] **Node X / Y / Z** — edit a selected node's position. *cad:* partial: node table edits Z; X / Y are read-only (`cad/ui/PathProps.svelte:86`). `pages/ui/graphPos.ts:28`
- [x] **Per-segment width / height** — one segment of a wall or run thicker / taller than the rest. *cad:* partial: the model and plan honour a segment's own section (`cad/views/plan.ts:70`), but nothing sets it. `pages/parts/props/ModelObjProps.svelte:220`
- [x] **Segment lengths** — Properties lists each segment with its length and the total. *cad:* missing. `pages/parts/props/ModelObjProps.svelte:195`
- [x] **Bend radius** — a conduit's default corner radius, overridden per corner with a handle. *cad:* missing: `PathNode.radius` is never drawn or edited (`cad/domain/shapes.ts:50`). `pages/3dview/types.ts:54`
- [x] **Join runs** — a run drawn from another run's node joins it (or attaches to a box's connection point) and follows it. *cad:* different: routing joins runs whose nodes touch, without storing a join (`cad/domain/routing.ts:2`); nodes attach to outlets / racks only. `pages/3dview/graphJoin.ts:95`
- [x] **Connection points on boxes** — centre + edge midpoints by default, or your own (U / V, Place…), shown as × marks. *cad:* missing. `pages/3dview/connect.ts:40`
- [ ] **Cables listed per conduit** — type × qty per conduit, its fill %. *cad:* different: fill comes from the routed links (`cad/domain/fill.ts:38`), as Dave chose. `pages/3dview/fill.ts:33`
- [x] **Box / furniture tool** — BOX: draw a footprint, give it a height. *cad:* missing: boxes (rect + extent) are drawn in elevations but no tool or Properties make them (`cad/views/elevation.ts:142`). `pages/ui/place.ts:118`
- [ ] **Round and many-sided boxes** — 3 to 24 edges (cylinders, ellipses). *cad:* missing. `pages/3dview/types.ts:14`
- [ ] **Box Properties** — X / Y / Z, W / D / H, rotation, label, own colour, layer. *cad:* missing. `pages/parts/props/ModelObjProps.svelte:109`
- [x] **Box grips in elevations** — resize height / width and base in any elevation, also angled ones. *cad:* missing. `pages/ui/grips.ts:114`
- [ ] **WIRE pick mode** — boxes pick only on their outline, so things under a table top can be picked. *cad:* missing. `pages/ui/hit.ts:257`
- [ ] **Holes through boxes (desk legs)** — an opening across a box splits it into legs and top in elevations and 3D. *cad:* missing. `pages/3dview/projection.ts:565`
- [ ] **Door / window / hole kinds** — door leaf + arc, window glazing + sill line, plain hole; dragged across the wall as a box. *cad:* different: one hole with W / Z / H and an optional swing, placed by a click (Dave, 2026-10-02) (`cad/editor/openingTool.ts:10`). `pages/ui/openingSpec.svelte.ts:6`
- [ ] **Rack presets** — Server / Network / Deep / Wall / Custom sizes when placing. *cad:* partial: each new rack copies the last one drawn (`cad/editor/tools.ts:410`). `pages/ui/cmdScripts.ts:142`
- [ ] **Turn racks while placing** — L / R turns the next rack 90°, kept for the next. *cad:* partial: turn after placing with ⟲ / ⟳ (`cad/ui/Properties.svelte:304`). `pages/ui/cmdScripts.ts:139`
- [ ] **Penetration tool** — PEN: diameter and wall / slab once, then click each; tags count on P01, P02 …. *cad:* partial: a penetration role and BOM line exist, no tool and no auto-detect yet (`cad/domain/shapes.ts:114`). `pages/ui/cmdScripts.ts:575`

<details><summary>Covered in cad (11)</summary>

- Trunk / pipe drawn at a width and height — `pages/ui/trunkSpec.svelte.ts:44` → `cad/ui/CadShell.svelte:245`
- Wall thickness and height — `pages/ui/place.ts:67` → `cad/ui/PathProps.svelte:72`
- Rise / drop at a point while drawing — `pages/ui/place.ts:93` → `cad/editor/pathTool.ts:49`
- A run up to another floor (riser) — `pages/store/risersImport.ts:105` → `cad/editor/pathTool.ts:65`
- Runs drawn as bands at their real width on the plan; vertical parts as riser symbols — `pages/3dview/projection.ts:732` → `cad/views/plan.ts:116`
- Line ⇄ wall ⇄ trunk ⇄ conduit (convert) — `pages/3dview/types.ts:33` → `cad/ui/PathProps.svelte:26`
- Door swing on the plan (leaf + arc, hinge side, flip) — `pages/3dview/projection.ts:705` → `cad/domain/openings.ts:55`
- Openings drawn as holes in elevations — `pages/3dview/projection.ts:606` → `cad/views/elevation.ts:110`
- Fill % and the packed cross-section of a run — `pages/parts/FillSection.svelte:2` → `cad/ui/RunFill.svelte:1`
- Rack on the plan with its front line — `pages/3dview/projection.ts:718` → `cad/views/plan.ts:145`
- Ends attached to an outlet / rack follow it when it moves — `pages/3dview/connect.ts:108` → `cad/editor/behaviours.ts:37`
</details>

### Model views: elevations, sections, 3D
- [ ] **ViewCube** — a cube in the pane corner (TOP / FRONT / RIGHT + 3D) switches the view. *cad:* different: Plan / Front / Rear / Left / Right / Risers buttons per pane (`cad/ui/ViewCanvas.svelte:353`); Dave had chosen a ViewCube on model tabs. `pages/parts/ViewGizmos.svelte:4`
- [ ] **Keep your place across views** — switching plan ↔ elevation re-centres on the same 3D point at the same zoom. *cad:* partial: each view keeps its own camera (`cad/ui/ViewCanvas.svelte:159`). `pages/+page.svelte:644`
- [ ] **3D view** — perspective / iso / wireframe, orbit about the view middle (Shift = 15°). *cad:* missing (phase 6.4: "later option"). `pages/3dview/projection.ts:254`
- [ ] **Select objects in 3D** — click the front-most face. *cad:* missing. `pages/ui/hit.ts:279`
- [ ] **Doors and windows as real holes in 3D** — jambs, header, sill; you see through them. *cad:* missing (no 3D). `pages/3dview/projection.ts:606`
- [ ] **Callouts and legends face you in 3D** — at paper size, leaders to their 3D tip. *cad:* missing. `pages/ui/isoAnno.ts:25`
- [ ] **Section box** — an axis-aligned box on the plan with arrows on four sides; each drops that direction. *cad:* different: section lines only (`cad/editor/sectionTool.ts:23`). `pages/ui/place.ts:128`
- [ ] **Section height band** — Z↓ / Z↑ in Properties and as handles in an elevation. *cad:* missing (Dave: low priority). `pages/parts/props/SectionProps.svelte:39`
- [ ] **Sections seen from the side** — other sections show as dashed bands in an elevation; click to select, drag to set the band. *cad:* missing. `pages/ui/sectionElev.ts:26`
- [ ] **Elevation marker** — a point + the way it looks, numbered callout ("1 / A-201"), width × depth band, turn / width / depth grips. *cad:* missing. `pages/ui/elevMarker.ts:162`
- [x] **Section markers on a layer** — hide, freeze or lock the markers like anything else. *cad:* missing. `pages/3dview/migrate.ts:38`
- [ ] **Exact hidden lines** — every edge clipped against nearer faces, seen through openings; for line-only output. *cad:* partial: items painted far → near with opaque fills (`cad/views/elevation.ts:3`); line-only removal skipped for now (Dave). `pages/3dview/hiddenLines.ts:137`
- [x] **Storey heights editor** — per-floor slab / raised floor / clear height / plenum, "All floors", floors re-stack. *cad:* partial: levels carry heights from the import, nothing edits them (`cad/domain/types.ts:40`). `pages/parts/HeightsDialog.svelte:2`
- [x] **Riser drawing with hidden floors** — floors can be collapsed; shapes stay editable and write back real heights. *cad:* different: a generated, read-only riser view of every floor (`cad/views/riser.ts:1`). `pages/3dview/storeyMap.ts:29`
- [x] **Model versions** — 1.0, 1.1 …; a major keeps a full copy you can restore, a minor is a note; "edited since". *cad:* different: no model versions; issuing freezes each sheet's display list (`cad/domain/issue.ts:1`). `pages/store/versions.ts:27`
- [ ] **A model per place** — floor, zone, room, rack and building models, each its own drawing space. *cad:* different: one plan per level; a floor area is its own level (`cad/domain/types.ts:41`). `pages/3dview/models.svelte.ts:44`

<details><summary>Covered in cad (10)</summary>

- Plan and front / rear / left / right elevations, per pane — `pages/3dview/types.ts:174` → `cad/ui/ViewCanvas.svelte:43`
- Split plan + elevation; each shows the other's work plane — `pages/ui/commands.ts:98` → `cad/ui/ViewCanvas.svelte:145`
- Move things up / down and along in an elevation — `pages/ui/vpModelEdit.ts:51` → `cad/editor/tools.ts:270`
- Section line at any angle; looks left of A → A′, Flip — `pages/ui/sectionLine.ts:70` → `cad/views/section.ts:69`
- Section end grips, depth handle, drag to move — `pages/ui/sectionLine.ts:105` → `cad/editor/handles.ts:110`
- Section view clipped to its depth and the line's length — `pages/3dview/projection.ts:444` → `cad/views/section.ts:34`
- Section name / depth in Properties; open the section — `pages/parts/props/SectionProps.svelte:47` → `cad/ui/Properties.svelte:411`
- Structure lines in elevations (slab, raised floor, ceiling, slab above) — `pages/ui/vpView.svelte.ts:507` → `cad/views/elevation.ts:154`
- Floor datum FL±0 = top of the raised floor — `pages/ui/levels.ts:8` → `cad/domain/types.ts:39`
- Risers show on every floor they pass — `pages/store/risersImport.ts:105` → `cad/views/plan.ts:101`
</details>

### Layers, styles and lineweights
- [x] **Layers panel** — eye / lock / colour per layer, groups (Model, Background, Architectural …), drag to reorder (paint order), search, delete with its items. *cad:* missing: a `Layer` record exists, no UI and no shape uses it (`cad/domain/drawing.ts:87`). `pages/parts/LayersPanel.svelte:2`
- [x] **Layer settings** — name, colour, line type, lineweight, lock, delete. *cad:* missing. `pages/parts/LayersPanel.svelte:97`
- [x] **Current layer** — new items go on it; ✓ in Properties or LAYMCUR makes a shape's layer current; nothing is drawn onto a hidden / locked layer. *cad:* missing. `pages/layers.svelte.ts:43`
- [x] **Layer presets** — saved sets of visible layers. *cad:* missing. `pages/layers.svelte.ts:50`
- [ ] **Several layers at once** — Ctrl / Shift+click layers, then show / hide / lock / colour / delete them together. *cad:* missing. `pages/parts/LayersPanel.svelte:53`
- [ ] **Layer commands** — NEWLAYER, LAYMCUR, LAYOFF, LAYFRZ, LAYON. *cad:* missing. `pages/ui/commands.ts:107`
- [x] **Shape style** — colour, fill, line type (solid / dashed / dotted / dash-dot), lineweight, ByLayer; objects' own colour. *cad:* missing: `Shape.style` exists but isn't drawn or edited (`cad/domain/shapes.ts:162`). `pages/ui/lineweight.ts:62`
- [ ] **Lineweights on screen** — true paper mm (0.00–2.11) with an LWT toggle; walls / boxes / runs by their layer's weight. *cad:* missing (print weights are in the sheets file). `pages/ui/lineweight.ts:15`
- [ ] **Drawing defaults** — colour, text size, lineweight and dimension unit for new shapes (Format menu). *cad:* missing. `pages/ui/drawingDefaults.ts:8`

### Blocks and images
- [x] **Blocks panel** — the global library by category with search and previews; click or drag a block to place it. *cad:* missing: no way to insert a block (only Make block creates an insert) (`cad/ui/Properties.svelte:152`). `pages/parts/BlocksPanel.svelte:2`
- [ ] **Symbol set** — north arrow, section / detail / photo markers, elevation tags, faceplate, door. *cad:* partial: built-ins are outlet symbols and a WiFi AP (`cad/domain/blocks.ts:24`). `pages/ui/blocks.ts:158`
- [x] **Delete a custom block** — from the Blocks panel (built-ins can't be). *cad:* missing. `pages/blocks.svelte.ts:23`
- [x] **Block attributes on an insert** — edit an insert's attributes (shared ones on several), hidden attributes. *cad:* missing: attributes are filled from outlets only (`cad/domain/blocks.ts:51`). `pages/parts/props/EntProps.svelte:318`
- [ ] **Mirror an insert** — flip left ↔ right (a door's hinge side). *cad:* missing. `pages/parts/props/EntProps.svelte:354`
- [ ] **ByBlock colour** — block shapes take the insert's colour / fill. *cad:* missing. `pages/ui/blocks.ts:93`
- [x] **Insert an image** — from this computer, from Uploads (any project), or dragged from the desktop; uploaded to Uploads first. *cad:* missing. `pages/ui/pdfFiles.ts:49`
- [x] **Image crop, opacity, greyscale** — crop %, opacity for tracing, greyscale behind coloured markup. *cad:* missing: an underlay `opacity` field exists with no UI (`cad/domain/types.ts:81`). `pages/parts/props/EntProps.svelte:384`
- [x] **Calibrate an image in place** — origin point, 2-point scale to a real distance, crop handles. *cad:* missing: calibration is done in Uploads only (`cad/app/pdf.svelte.ts:13`). `pages/imageEdit.svelte.ts:9`
- [x] **Replace the floorplan** — Properties › Replace… picks another uploaded PDF page or picture, placed by its calibration. *cad:* missing. `pages/parts/UploadPicker.svelte:2`
- [ ] **Floorplan follows Uploads live, or Fixed** — a live floorplan moves when its calibration changes in Uploads. *cad:* partial: calibration is read when the page renders, not live; no Fixed choice (`cad/app/pdf.svelte.ts:52`). `pages/ui/floorplanLink.ts:23`
- [x] **Floorplan on a lockable Background layer** — hidden / locked like any layer so the plan can't be grabbed. *cad:* missing (it is never pickable, and can't be hidden). `pages/floorplans.svelte.ts:18`
- [ ] **Missing-file placeholder** — a deleted upload shows a red "Missing file" box and Properties says so. *cad:* partial: a floorplan that fails is recorded and left out (`cad/app/pdf.svelte.ts:57`). `pages/ui/render/fileWatch.svelte.ts:4`
- [x] **Images in an elevation** — an image inserted in an elevation stands on its ground line. *cad:* missing. `pages/pageActions.ts:3`

<details><summary>Covered in cad (5)</summary>

- Global block library (built-ins + shared custom blocks) — `pages/blocks.svelte.ts:29` → `cad/domain/blocks.ts:24`
- Save the selection as a block — `pages/ui/blocks.ts:76` → `cad/app/project.svelte.ts:116`
- Explode a block insert — `pages/ui/explode.ts:12` → `cad/app/project.svelte.ts:126`
- Annotative symbols (constant paper size) — `pages/ui/blocks.ts:65` → `cad/views/blocks.ts:1`
- Floorplan PDF placed from its Uploads calibration — `pages/floorplans.svelte.ts:30` → `cad/app/pdf.svelte.ts:13`
</details>

### Workspace shell and navigation
- [x] **Tabs** — several drawings open as tabs, VSCode-style preview tab (single click reuses it), a tab menu, close. *cad:* missing: each pane switches its view in place. `pages/parts/Pane.svelte:81`
- [x] **Resizable split and panel toggles** — drag the split bar; hide the left / right panels. *cad:* partial: Split gives two equal panes (`cad/ui/CadShell.svelte:52`); panels are fixed. `pages/+page.svelte:984`
- [ ] **Place tree** — building › floor › zone › room, with add / rename / drag / delete, sheets filed under places. *cad:* partial: a flat Levels list with rename / delete (`cad/ui/CadShell.svelte:316`); no adding levels, zones or rooms. `pages/parts/DrawingNavigator.svelte:200`
- [ ] **Buildings** — create a building, drag floors into it, reorder. *cad:* missing. `pages/projectData.svelte.ts:116`
- [ ] **Tree views** — By place / drawing type / level / category / discipline, switched per user. *cad:* partial: the Sheets register groups by place / kind / discipline / tag (`cad/ui/SheetsTab.svelte:97`). `pages/store/treeViews.ts:21`
- [ ] **Custom views and smart folders** — your own folders shared with the team, items in several folders, smart folders that fill from a filter. *cad:* missing. `pages/store/treeViews.ts:222`
- [ ] **Tags** — chip picker, a global tag list across projects, ✦ suggestions from a sheet's views, bulk tags with "2/5". *cad:* partial: tags edited in the register; no shared list or suggestions (`cad/ui/SheetsTab.svelte:1`). `pages/store/tags.ts:42`
- [ ] **Items panel** — every kind of item in the view's model (outlets, trunks, racks, walls, doors, boxes, blocks, text, dims, images), filters by layer / level / usage, "In this view", double-click zooms to it. *cad:* partial: Outlets grid for the level, racks list, patch list (`cad/ui/OutletGrid.svelte:1`). `pages/parts/ItemsPanel.svelte:2`
- [x] **Find a drawing (Ctrl+K)** — palette over drawings, rooms and floors. *cad:* missing. `pages/parts/CommandPalette.svelte:2`
- [x] **Open project (Ctrl+O)** — pick another project without leaving the tool. *cad:* missing. `pages/parts/OpenProjectDialog.svelte:2`
- [x] **Help** — F1 / ?: how-to answers, keys and mouse, F-keys, the command line, every command (click to run), one search box. *cad:* missing (phase 2 todo). `pages/parts/HelpDialog.svelte:2`
- [ ] **History panel** — the undo list; click a step to jump there, undone steps faded. *cad:* missing: step labels are kept but not shown (`cad/store/store.ts:54`). `pages/parts/HistoryPanel.svelte:2`
- [ ] **Named views** — VIEW: save / restore / delete a zoom + pan. *cad:* missing. `pages/ui/cmdScripts.ts:616`
- [x] **Touch** — two-finger pinch / pan, one finger draws and selects. *cad:* missing. `pages/ui/panzoom.ts:74`
- [ ] **Latched Pan tool** — a left drag (or one finger) pans until Esc. *cad:* missing. `pages/+page.svelte:1469`
- [ ] **Zoom keys and ZOOM options** — + / − keys, zoom window, to the selection, previous. *cad:* partial: wheel zoom and Fit (Home) only (`cad/ui/CadShell.svelte:222`). `pages/ui/cmdScripts.ts:306`
- [ ] **Cursor coordinates** — the status bar shows the cursor's x, y in mm. *cad:* missing. `pages/parts/StatusBar.svelte:44`
- [x] **Menus** — File / Edit / View / Insert / Format. *cad:* different: a tool bar and an Export menu (`cad/ui/CadShell.svelte:296`). `pages/parts/Menubar.svelte:5`
- [x] **Function keys** — F1 help, F2 edit label, F8 ORTHO, F9 SNAP, F10 POLAR. *cad:* missing. `pages/+page.svelte:1301`

<details><summary>Covered in cad (6)</summary>

- Split into two panes — `pages/ui/commands.ts:98` → `cad/ui/CadShell.svelte:52`
- The URL restores what is open, and works as a share link — `pages/+page.svelte:1220` → `cad/app/urlState.ts:1`
- Each view keeps its own pan / zoom, also after a reload — `pages/viewState.svelte.ts:1` → `cad/ui/ViewCanvas.svelte:163`
- Pan with right / middle drag; wheel zooms at the cursor — `pages/ui/panzoom.ts:6` → `cad/ui/ViewCanvas.svelte:260`
- Fit (Home) — `pages/+page.svelte:1314` → `cad/ui/CadShell.svelte:222`
- Undo / redo buttons — `pages/parts/HistoryPanel.svelte:17` → `cad/ui/CadShell.svelte:291`
</details>

### Project data, places and imports
- [x] **Project Properties** — name, codes, client, address, description edited in Properties. *cad:* missing. `pages/projectProps.ts:29`
- [ ] **Place names in Properties** — building, floor, tenant area, zone and server-room names. *cad:* partial: rename a level; make a new server room from a rack's Properties (`cad/ui/Properties.svelte:81`). `pages/projectProps.ts:95`
- [ ] **Live read of the other tools' data** — the project doc, risers, racks and the drawings registry, kept live. *cad:* different: a one-shot import into cad entities (`cad/persist/import/legacy.ts:1`). `pages/projectData.svelte.ts:1`
- [ ] **Risers-tool import into a building model** — riser rooms, ladders and cables as editable 3D objects. *cad:* different: the riser view is generated from levels and runs (`cad/views/riser.ts:1`). `pages/store/risersImport.ts:105`

<details><summary>Covered in cad (3)</summary>

- Outlets-tool import (outlets + trunks into the floor's drawing) — `pages/store/outletsImport.ts:64` → `cad/persist/import/legacyOutlets.ts:1`
- Racks import (rows, racks, devices) — `pages/store/racksImport.ts:38` → `cad/persist/import/legacy.ts:9`
- Floorplan attached once from the floor's Outlets / Uploads data — `pages/floorplans.svelte.ts:30` → `cad/persist/import/legacyOutlets.ts:1`
</details>

<details><summary>Dropped by decision (20)</summary>

- Object tracking (OTRACK) — ADR 0005 — `pages/ui/snap.ts:184`
- AutoCAD DYN editable boxes at the cursor (typed input stays) — ADR 0005 — `cad/docs/adr/0005-drafting-scope.md:49`
- FILLET / CHAMFER — ADR 0005, "ok to drop" — `pages/ui/cmdScripts.ts:211`
- BREAK — `pages/ui/cmdScripts.ts:394`
- JOIN — `pages/ui/cmdScripts.ts:697`
- LENGTHEN — `pages/ui/cmdScripts.ts:402`
- HATCH (incl. ladder rungs) — `pages/ui/annotations.ts:111`
- ELLIPSE — `pages/ui/commands.ts:16`
- AREA — `pages/ui/cmdScripts.ts:284`
- Quick select (QSELECT / FILTER) — `pages/ui/cmdScripts.ts:505`
- Isolate (LAYISO / LAYUNISO) — `pages/ui/cmdScripts.ts:482`
- Guide lines and plane inset (split view + Z / Depth instead) — `pages/guides.svelte.ts:18`
- Editing in 3D / iso, tilted boxes, oblique-only edits — ADR 0004 — `pages/3dview/types.ts:20`
- Site view from OpenStreetMap — `pages/parts/SiteView.svelte:2`
- Trunk / pipe spec bar and catalogue (PF22, MK …) — "not required" — `pages/ui/trunkSpec.svelte.ts:13`
- Latched Orbit tool ("no orbit") — `pages/ui/commands.ts:89`
- SVGOUT / PNGOUT of a view — ADR 0005 — `pages/ui/cmdScripts.ts:739`
- Demo / mock data (models m1–m4, mock tree, mock presets) — `pages/mock/data.ts:1`
- Per-tab history (one global timeline) — `pages/history.svelte.ts:25`
- `img:` session-only image keys — `pages/imageStore.ts:15`
</details>


## Pages — sheets, frames, issue (`routes/projects/[pid]/pages/`)

### Viewports: options every frame type has
- [ ] **Auto viewport numbers** — each viewport gets a sequence number as its default printed label, renumbered in reading order as viewports move. *cad:* missing. `pages/ui/frameNumber.ts:6`
- [ ] **Printed viewport tag** — the number prints top-left and the effective scale top-right; on screen the tag also shows the direction (PLAN / FRONT · 1:50). *cad:* partial: one "label  1:N" line under the window, only when a label is typed; no direction. `pages/ui/Viewport.svelte:119` · `cad/views/sheet.ts:126`
- [ ] **Fit scale** — Fit picks the whole 1:N that shows all of the visible model and centres it. *cad:* partial: Fit only re-centres; the scale stays. `pages/parts/props/FrameProps.svelte:67` · `cad/ui/SheetProps.svelte:104`
- [ ] **Border style** — solid / dashed / none (none = a faint border that doesn't print). *cad:* partial: printed on / off only. `pages/parts/props/FrameProps.svelte:71` · `cad/ui/SheetProps.svelte:108`
- [ ] **Black-and-white viewport** — Colour / B/W per viewport: everything in black for mono prints. *cad:* missing. `pages/parts/props/FrameProps.svelte:84`
- [ ] **Hidden lines Show / Hide** — true hidden-line removal per viewport (edges cut by nearer faces, seen through openings); on by default for dropped sections. *cad:* different: opaque far → near fills hide what's behind on screen and in PDFs; true removal skipped for now (phase6 §6a.3). `pages/parts/props/FrameProps.svelte:78`
- [x] **VP Freeze** — with a viewport active, the Layers eye hides a layer in that viewport only (Shift = everywhere); LAYFRZ too. *cad:* missing: cad has no layer UI (`ViewDef.hiddenLayers` is unused). `pages/types.ts:34` · `cad/domain/drawing.ts:26`
- [x] **VP Lock** — lock a layer in one viewport only (shown there, not pickable). *cad:* missing. `pages/types.ts:36`
- [ ] **Viewport-only layers** — a layer made while a viewport is active shows only in it (VP tag; click = show everywhere). *cad:* partial: notes drawn in a viewport belong to it (`vpId`), but there are no layers. `pages/layers.svelte.ts:27`
- [x] **Hide in new viewports** — a layer setting so viewports made later start with it frozen (New VP Freeze). *cad:* missing. `pages/+page.svelte:437`
- [x] **Any annotation can belong to a viewport** — lines, rects, dims, images, blocks and notes drawn inside a viewport belong to it, and copy / delete with it. *cad:* partial: only text, leader and cloud can be tied to a viewport. `pages/pagesProject.svelte.ts:587` · `cad/editor/noteTool.ts:34`
- [ ] **Several viewports at once** — Shift-click / marquee several; Properties › VIEWPORTS sets scale / border / hidden lines / colour / lock on all in one step ("mixed" shown). *cad:* missing: one viewport at a time. `pages/parts/props/FramesProps.svelte:23`
- [ ] **Delete key removes the viewport** — Delete removes the selected viewport(s), even with another one active. *cad:* partial: only the Properties button does; the Delete key with a viewport picked deletes the whole sheet (the selection is the sheet; undo brings it back). `pages/+page.svelte:460` · `cad/ui/CadShell.svelte:219`

<details><summary>Covered in cad (9)</summary>

- View picker (plan, elevations, rack rows, section, risers) — `pages/parts/props/FrameProps.svelte:56` → `cad/ui/SheetProps.svelte:75`
- Source model → the Level picker — `pages/parts/props/FrameProps.svelte:40` → `cad/ui/SheetProps.svelte:70`
- Scale list + custom 1:N — `pages/parts/props/FrameProps.svelte:63` → `cad/ui/SheetProps.svelte:84`
- Label override — `pages/parts/props/FrameProps.svelte:32` → `cad/ui/SheetProps.svelte:107`
- Lock (can't move / resize) — `pages/parts/props/FrameProps.svelte:122` → `cad/ui/SheetProps.svelte:109`
- X / Y / W / H in paper mm — `pages/parts/props/FrameProps.svelte:127` → `cad/ui/SheetProps.svelte:93`
- Delete viewport (its notes go back on the paper) — `pages/parts/props/FrameProps.svelte:136` → `cad/ui/SheetProps.svelte:25`
- Content clipped to an opaque window — `pages/types.ts:17` → `cad/views/sheet.ts:122`
- A viewport changes direction from Properties (no ViewCube on sheets) — `pages/parts/props/FrameProps.svelte:58` → `cad/ui/SheetProps.svelte:36`
</details>

### Viewports: working on the paper
- [x] **Viewport tool** — draw a new viewport as a rectangle (two clicks or press-drag), snapped to the paper. *cad:* different: "Add viewport" fills the drawing area with the open level's plan at 1:100; you resize it after. `pages/+page.svelte:450` · `cad/ui/SheetProps.svelte:59`
- [ ] **New sheet gets a fitted viewport** — a new sheet seeds one plan viewport of its place, scale fitted to the content. *cad:* partial: new sheets start empty; Add viewport centres at 1:100 without fitting the scale. `pages/+page.svelte:441` · `cad/views/sheet.ts:137`
- [ ] **Enter a viewport to edit** — double-click a viewport to draw / edit the model inside it at its scale; Exit / Esc; Full-size fills the pane. *cad:* different: content isn't editable on the sheet; you edit in the plan / elevation pane (split view beside the sheet). `pages/parts/Pane.svelte:131`
- [ ] **Zoom = scale** — Alt+wheel steps a viewport's scale to a whole 1:N about the cursor, one undo step per burst. *cad:* missing: scale only from Properties. `pages/ui/Viewport.svelte:77`
- [ ] **Pan content without entering** — Alt+drag pans any viewport's content. *cad:* different: Ctrl-drag inside the selected viewport pans it. `pages/ui/Viewport.svelte:75` · `cad/editor/tools.ts:152`
- [ ] **Snap on paper** — moves / resizes snap to paper edges, margin, drawing-area and title-block edges and a 5 mm grid (Alt = free). *cad:* partial: whole-mm steps only. `pages/ui/snap.ts:310` · `cad/editor/tools.ts:216`
- [ ] **Paper grid** — a 5 mm grid (major 50 mm) on the sheet, screen only. *cad:* missing. `pages/ui/snap.ts:296`
- [x] **Ctrl-drag copy** — Ctrl-drag a viewport border to leave a copy (with its view and notes); Ctrl pressed / released mid-drag switches copy ↔ move. *cad:* missing (Ctrl-drag pans instead). `pages/parts/PaperPage.svelte:187`
- [x] **Arrow-key nudge** — arrows nudge the selected viewports 1 mm (Shift 10 mm). *cad:* missing. `pages/parts/PaperPage.svelte:194`
- [x] **Shift = square resize** — Shift keeps a viewport square while resizing. *cad:* missing (Shift constraints are a phase 6 todo). `pages/CHANGELOG.md:350`
- [x] **Copy / cut / paste / duplicate viewports** — Ctrl+C / X / V / D on paper, with views and notes, across sheets and (system clipboard) other tabs or projects. *cad:* missing. `pages/ui/frameClip.ts:15`
- [ ] **Command line on paper** — with no viewport active, MOVE / COPY / ARRAY / ALIGN / DIST / ERASE act on the selected viewports in paper mm. *cad:* missing. `pages/ui/paperCmd.ts:36`
- [ ] **PageUp / PageDown** — page-pan the sheet (Shift = sideways). *cad:* missing. `pages/+page.svelte:1318`

<details><summary>Covered in cad (3)</summary>

- Drag a viewport to move it; a locked one stays — `pages/parts/PaperPage.svelte:112` → `cad/editor/tools.ts:159`
- Corner grips resize, the drawing stays still on the paper — `pages/parts/PaperPage.svelte:112` → `cad/editor/tools.ts:150`
- Sheet open in a pane beside a plan (split view) — `pages/types.ts:70` → `cad/ui/CadShell.svelte:336`
</details>

### Frame: plan
- [ ] **Plan cut band** — Z↓ / Z↑ per plan viewport (only objects in that band show) and "Fit to floor" (slab to slab). *cad:* partial: a plan viewport shows one level (a floor); no height band inside it. `pages/parts/props/FrameProps.svelte:89`

<details><summary>Covered in cad (2)</summary>

- A level's plan at 1:N — `pages/parts/props/FrameProps.svelte:56` → `cad/views/sheet.ts:73`
- Floorplan PDFs show in plan viewports only — `pages/CHANGELOG.md:368` → `cad/views/sheet.ts:73`
</details>

### Frame: elevation (front / rear / left / right)

<details><summary>Covered in cad (2)</summary>

- The four whole-floor elevations on a sheet — `pages/types.ts:15` → `cad/ui/SheetProps.svelte:78`
- Left / right as seen on the y-down plan — `pages/CHANGELOG.md:96` → `cad/views/sheet.ts:74`
</details>

### Frame: section line (A–A′, any angle)
- [x] **Drop as viewport** — one click drops the section onto the open sheet as a new linked viewport, sized to the cut and fitted (again = another viewport). *cad:* partial: pick "Section A" in a viewport's View list; not sized or fitted. `pages/+page.svelte:307` · `cad/ui/SheetProps.svelte:80`
- [x] **Linked viewports list** — the section's Properties / toolbar list the viewports it drives; a click opens that sheet with the viewport selected. *cad:* missing. `pages/parts/props/SectionProps.svelte:100`
- [x] **Delete asks first** — deleting a section that drives viewports asks: keep them as plain elevations (last view kept) or delete them too. *cad:* missing: its viewports just go blank. `pages/parts/SectionDeleteDialog.svelte:1` · `cad/views/sheet.ts:72`
- [ ] **Height band** — Z↓ / Z↑ of what the section sees (unset = every height). *cad:* missing: `SectionCut` has no top / bottom. `pages/parts/props/SectionProps.svelte:38` · `cad/domain/drawing.ts:144`
- [ ] **Sections seen from the side** — in an elevation, other sections show as dashed bands; drag their Z↑ / Z↓ handles. *cad:* missing. `pages/ui/sectionElev.ts:26`
- [x] **View title** — the section viewport's ground line reads "SECTION A–A′". *cad:* missing: the label is typed by hand. `pages/+page.svelte:298`
- [ ] **Markers on a layer** — section and elevation markers sit on a "Sections" layer (hide / freeze / lock them, or move one to another layer). *cad:* missing. `pages/parts/props/SectionProps.svelte:49`
- [ ] **Flip by the end arrow; length / angle shown** — click an end arrow to flip; Properties shows length, angle and A's point. *cad:* partial: a Flip button in Properties only. `pages/parts/props/SectionProps.svelte:82` · `cad/ui/Properties.svelte:416`
- [ ] **Depth before drawing** — the Section bar sets Depth for the next section. *cad:* partial: always 5 m, change it after. `pages/parts/SectionSpecBar.svelte:15` · `cad/editor/sectionTool.ts:11`

<details><summary>Covered in cad (5)</summary>

- Cut line at any angle, two clicks or typed points — `pages/ui/sectionLine.ts:40` → `cad/views/section.ts:16`
- A / A′ marks with arrows on the plan, also on sheets / PDFs — `pages/ui/sectionLine.ts:70` → `cad/views/section.ts:69`
- Depth grip, end grips, drag the line — `pages/ui/sectionLine.ts:98` → `cad/editor/handles.ts:51`
- Name / depth / flip in Properties — `pages/parts/props/SectionProps.svelte:82` → `cad/ui/Properties.svelte:411`
- A viewport follows its section live — `pages/types.ts:25` → `cad/views/sheet.ts:72`
</details>

### Frame: elevation marker
- [ ] **Elevation marker** — a point + the way it looks (any angle, Shift = 15°) with a width × depth band, drawn as a numbered callout; drives linked viewports. *cad:* partial: a section cut line gives the same view; there is no marker or callout. `pages/ui/elevMarker.ts:110`
- [ ] **Sheet reference on the callout** — a linked marker shows its viewport number over its sheet number ("1 / A-201"). *cad:* missing: section marks show only the name. `pages/ui/elevMarker.ts:94` · `cad/views/section.ts:69`
- [ ] **Marker Properties** — number, title, look ↑ → ↓ ← or a typed angle, Turn round, width, depth, height band, + Drop. *cad:* missing. `pages/parts/props/SectionProps.svelte:57`

### Frame: section box
- [ ] **Section box with four arrows** — a plan box whose arrows each drop that direction's elevation, clipped to the box and linked live. *cad:* different: replaced by section cut lines (one per direction). `pages/parts/props/SectionProps.svelte:94`

### Frame: rack elevation
- [ ] **One rack row in a viewport** — a rack row (imported as its own rack model) as a viewport source. *cad:* partial: the View list offers each server room's racks front / rear, not one row (the spec has `rowId`, the picker doesn't). `pages/store/racksImport.ts:38` · `cad/ui/SheetProps.svelte:79`

<details><summary>Covered in cad (1)</summary>

- Racks front / rear with devices and U numbers on a sheet — `pages/store/racksImport.ts:38` → `cad/views/sheet.ts:70`
</details>

### Frame: riser / building elevation
- [x] **Visible floors** — a building elevation viewport shows only the ticked floors; the rest collapse to a break. *cad:* missing: the Risers viewport always shows every floor. `pages/parts/props/FrameProps.svelte:107` · `cad/views/riser.ts:21`

<details><summary>Covered in cad (1)</summary>

- The building's risers and backbone on a sheet (generated, not drawn) — `pages/types.ts:44` → `cad/ui/SheetProps.svelte:81`
</details>

### Frame: fill-rate cross-section
- [ ] **Fill viewport** — a viewport shows one conduit's cross-section with its cables packed in and the fill %. *cad:* partial: the run's packed section shows in Properties only, not on sheets. `pages/parts/props/FrameProps.svelte:47` · `cad/ui/RunFill.svelte:1`

### Frame: 3D / iso
- [ ] **3D viewport** — perspective / ISO / WIRE viewport on a sheet, orbit kept per viewport. *cad:* missing: a 3D view is a later option (phase6 §6a.2). `pages/viewState.svelte.ts:19`

### Sheets
- [ ] **Sheets filed under places** — each sheet has one place; new sheet from a place; drag in the tree to re-file; manual order. *cad:* missing: `Sheet.placeId` / `order` exist but have no UI; the list is flat. `pages/store/pagesStore.svelte.ts:142` · `cad/ui/SheetList.svelte:14`
- [x] **Duplicate sheet** — a copy right after it, with its viewports and their notes; "(copy)", no number, never issued. *cad:* missing. `pages/pagesProject.svelte.ts:577`
- [x] **Pages between projects** — Copy page / Paste page here (system clipboard), with viewports and notes; missing models flagged. *cad:* missing. `pages/pagesProject.svelte.ts:603`
- [x] **Delete sheets** — delete (click again) takes the viewports' notes too, with Undo on the message; hard delete from the archived list. *cad:* partial: Delete with the sheet selected removes it (undo works), with no confirm, and its paper notes stay behind as orphans. `pages/pagesProject.svelte.ts:698` · `cad/editor/commands.ts:25`
- [ ] **Drawing fields in Properties** — Type (fixed list), Discipline, Category, Tags (chip picker) on the open sheet. *cad:* partial: kind / discipline / tags are free text in the register only; no category. `pages/parts/props/PageProps.svelte:42` · `cad/ui/SheetsTab.svelte:149`
- [ ] **Auto-suggest** — type / category / tags suggested from the sheet's title and viewports, applied on a click. *cad:* missing. `pages/store/tags.ts:42`
- [ ] **Shared tag list** — tags used in any project are suggested in every project (`settings/pagesTags`). *cad:* missing. `pages/store/globalTags.svelte.ts:9`
- [ ] **Link sheets** — a register row that opens Elevations / Patching / Outlets / Risers at a floor / room; prints as a placeholder page. *cad:* different: those views are in cad itself (rack rows, riser view). `pages/pagesProject.svelte.ts:642`
- [ ] **In the shared drawings registry** — sheets are `drawings/{id}` entries (`toolType: 'pages'`) so the app's Packages / publish pages list them. *cad:* different: sheets are cad entities with cad's own Issues. `pages/store/schema.ts:131`

<details><summary>Covered in cad (8)</summary>

- New sheet — `pages/pagesProject.svelte.ts:567` → `cad/ui/SheetList.svelte:23`
- Title and drawing number — `pages/parts/props/PageProps.svelte:34` → `cad/ui/SheetProps.svelte:113`
- Paper size + orientation (A4–A2 → A0–A4) — `pages/constants.ts:56` → `cad/views/sheet.ts:20`
- Margin — `pages/parts/StatusBar.svelte:20` → `cad/ui/SheetProps.svelte:125`
- Hide the title block on one sheet — `pages/parts/props/PageProps.svelte:36` → `cad/ui/SheetProps.svelte:133`
- Archive / restore — `pages/pagesProject.svelte.ts:686` → `cad/ui/SheetsTab.svelte:55`
- An emptied sheet stays empty (no re-seeded viewport) — `pages/store/schema.ts:178` → `cad/views/sheet.ts:118`
- Share a link to a sheet (URL) — `pages/CHANGELOG.md:369` → `cad/app/urlState.ts:14`
</details>

### Tree views of sheets
- [ ] **Sheet tree** — places with their sheets nested; models and sheets marked apart (cube / MODEL pill vs paper icon + number). *cad:* missing: a flat Sheets list in the left panel. `pages/parts/DrawingNavigator.svelte:649` · `cad/ui/SheetList.svelte:45`
- [ ] **View switcher** — By place / By drawing type / Outlets-trunks by level / Elevations by category / By discipline, remembered per user per project. *cad:* missing. `pages/store/treeViews.ts:21`
- [ ] **Custom views** — team-shared views of your own folders (nest, reorder, rename, delete; items are references, Ctrl-drag copies). *cad:* missing. `pages/store/treeViews.ts:203`
- [ ] **Smart folders** — a saved filter (type, tags, discipline, category, place) that fills itself. *cad:* missing. `pages/parts/SmartFilterEditor.svelte:1`
- [ ] **Drop on a group sets the field** — in a grouped view, dropping sheets on a folder sets their type / discipline / category / tag. *cad:* missing. `pages/store/treeViews.ts:184`
- [ ] **Tree multi-select** — Ctrl / Shift-click sheets and places; drag them as a block; ⋮ › Tags… / Delete on all. *cad:* missing. `pages/parts/DrawingNavigator.svelte:262`

### Drawing register
- [x] **Filters** — kind, discipline and tag drop-downs beside the search. *cad:* partial: text search and Active / Archived only. `pages/parts/DrawingsDialog.svelte:157` · `cad/domain/sheetList.ts:25`
- [x] **Category** — a column, a filter for bulk set and a grouping. *cad:* missing: no category field. `pages/store/drawingList.ts:47`
- [ ] **Updated column** — last-edited date, sortable. *cad:* missing. `pages/parts/DrawingsDialog.svelte:41`
- [ ] **Place path** — building › floor › zone. *cad:* partial: the filed place's name, else the viewports' level names. `pages/store/drawingList.ts:14` · `cad/domain/sheetList.ts:16`
- [ ] **Bulk edit** — on the selection: set kind / discipline / category, add / remove a tag. *cad:* missing: edit row by row. `pages/parts/DrawingsDialog.svelte:169`
- [ ] **Renumber preview** — pattern + start fields show the first numbers live; numbers follow the grouped order. *cad:* partial: two prompts, no preview; numbers follow the sorted order, not the groups. `pages/parts/DrawingsDialog.svelte:103` · `cad/ui/SheetsTab.svelte:44`
- [ ] **Select all shown** — a header checkbox. *cad:* missing: click / Shift / Ctrl only. `pages/parts/DrawingsDialog.svelte:201`
- [ ] **Models tab** — every model, the sheets / viewports using it, archive / restore, viewports showing a missing model. *cad:* different: viewports show levels; there is no "used by" list per level. `pages/parts/DrawingsDialog.svelte:285`
- [ ] **Draft package from the selection** — a registry package of the selected sheets at their latest revisions, managed on the app's Packages page. *cad:* different: Issue… makes a package with its PDF and a transmittal. `pages/pagesProject.svelte.ts:845` · `cad/ui/SheetsTab.svelte:104`

<details><summary>Covered in cad (10)</summary>

- Register table, click a heading to sort — `pages/parts/DrawingsDialog.svelte:202` → `cad/ui/SheetsTab.svelte:136`
- Inline edit of number / title / kind / discipline / tags — `pages/parts/DrawingsDialog.svelte:211` → `cad/ui/SheetsTab.svelte:146`
- Search — `pages/parts/DrawingsDialog.svelte:156` → `cad/ui/SheetsTab.svelte:95`
- Group by place / kind / discipline / tag / size — `pages/store/drawingList.ts:50` → `cad/domain/sheetList.ts:46`
- Renumber by pattern (`S{n:3}`) — `pages/store/drawingList.ts:64` → `cad/domain/sheetList.ts:60`
- Excel (the selection, else the rows shown) — `pages/store/drawingListExport.ts:20` → `cad/render/sheetList.ts:19`
- Archived sheets listed and restored — `pages/parts/DrawingsDialog.svelte:265` → `cad/ui/SheetsTab.svelte:96`
- Double-click opens the sheet — `pages/parts/DrawingsDialog.svelte:209` → `cad/ui/SheetsTab.svelte:145`
- Shift-click range — `pages/parts/DrawingsDialog.svelte:89` → `cad/ui/SheetsTab.svelte:34`
- PDF / print of the selection — `pages/parts/DrawingsDialog.svelte:184` → `cad/ui/SheetsTab.svelte:100`
</details>

### Title block
- [ ] **Drawn = the creator's initials** — empty Drawn shows the sheet creator's initials. *cad:* partial: Drawn is typed per sheet; `initialsOf` is ported but unused. `pages/pagesProject.svelte.ts:742` · `cad/domain/titleBlock.ts:86`
- [ ] **Location = place path** — building › floor › zone of the sheet's place. *cad:* partial: the viewports' level names. `pages/pagesProject.svelte.ts:754` · `cad/views/sheet.ts:40`
- [ ] **Date before the first issue** — shows today until issued. *cad:* partial: blank until issued. `pages/pagesProject.svelte.ts:757` · `cad/views/sheet.ts:47`
- [ ] **Scale field** — the first viewport's scale. *cad:* different: the one scale, else "As shown". `pages/pagesProject.svelte.ts:758` · `cad/views/sheet.ts:45`

<details><summary>Covered in cad (8)</summary>

- One template per project; auto + custom fields — `pages/titleBlock.ts:8` → `cad/domain/titleBlock.ts:8`
- Editor: relabel, full / half width, drag to reorder, remove, add — `pages/parts/TitleBlockEditor.svelte:19` → `cad/ui/TitleBlockEditor.svelte:3`
- Sections on / off, printed margin border — `pages/parts/TitleBlockEditor.svelte:100` → `cad/ui/TitleBlockEditor.svelte:17`
- Layouts: strip / band / compact — `pages/titleBlock.ts:37` → `cad/views/titleBlock.ts:89`
- Company + client logos in file storage, height, Move to storage — `pages/parts/TitleBlockEditor.svelte:89` → `cad/ui/TitleBlockEditor.svelte:116`
- Company block (name / address / contact) — `pages/titleBlock.ts:18` → `cad/views/titleBlock.ts:44`
- Revision table (last 5) — `pages/titleBlock.ts:55` → `cad/views/titleBlock.ts:31`
- Title block drawn over the viewports, on the margin — `pages/CHANGELOG.md:372` → `cad/views/sheet.ts:129`
</details>

### Model versions, revisions and issue
- [x] **Model versions** — Save minor (a dated note) / major (a full copy) per model; restore a major; "edited since" state. *cad:* missing. `pages/parts/HistoryPanel.svelte:76`
- [x] **Issue gate** — issuing needs every shown model at an unedited major version (Overwrite / Open per model). *cad:* different: a changed sheet gets the next rev by fingerprint; "issue only saved sheets" is a phase 4 todo. `pages/store/versions.ts:57` · `cad/domain/issue.ts:62`
- [ ] **Any code per issue** — the code field is prefilled with the next (A, P1, C09 …), editable; a taken code is refused. *cad:* partial: "First rev" per package; later revs follow `nextRev`. `pages/parts/HistoryPanel.svelte:123` · `cad/ui/IssuePanel.svelte:47`
- [ ] **Overwrite the current revision** — re-issue the sheet as it is now under the same code. *cad:* missing. `pages/parts/HistoryPanel.svelte:125`
- [ ] **Edit a revision** — its description and date. *cad:* missing. `pages/parts/HistoryPanel.svelte:142`
- [ ] **Delete a revision** — *cad:* missing. `pages/parts/HistoryPanel.svelte:137`
- [ ] **Make a revision current** — the title block's Rev / Date follow the one picked. *cad:* missing. `pages/parts/HistoryPanel.svelte:132`
- [ ] **Edited since issue** — the sheet shows "Rev B · issued … · edited since". *cad:* partial: only the Issue panel's preview says changed / unchanged. `pages/parts/HistoryPanel.svelte:102` · `cad/ui/IssuePanel.svelte:53`
- [ ] **Revision description** — free text per revision. *cad:* partial: the revision's note is the package's purpose. `pages/parts/HistoryPanel.svelte:119` · `cad/app/issue.ts:79`

<details><summary>Covered in cad (5)</summary>

- Next code A → B, P1 → P2, C09 → C10 — `pages/store/versions.ts:75` → `cad/domain/issue.ts:10`
- Issue one sheet — `pages/parts/HistoryPanel.svelte:124` → `cad/ui/SheetsTab.svelte:104`
- An issue keeps what went out (better: frozen display lists + reprint) — `pages/store/versions.ts:52` → `cad/app/issue.ts:112`
- Packages of sheets at their revisions (plus PDF in Uploads and a transmittal) — `pages/pagesProject.svelte.ts:845` → `cad/app/issue.ts:72`
- Title block Rev / Date from the latest revision — `pages/pagesProject.svelte.ts:756` → `cad/views/sheet.ts:47`
</details>

### Printing and PDF
- [ ] **Browser print at true size** — Ctrl+P / PLOT prints the focused sheet at true mm through the browser (vector, text selectable). *cad:* different: a PDF download drawn with jspdf. `pages/printing.ts:176` · `cad/app/sheetsPdf.ts:16`
- [x] **Print book order** — move the selected sheets up / down before printing. *cad:* partial: pages follow the register's sort. `pages/parts/PrintBook.svelte:33`
- [x] **Selectable Japanese text** — browser print keeps CJK as text. *cad:* partial: drawn as ~300 dpi pictures (not selectable). `pages/printing.ts:129` · `cad/render/pdf.ts:165`
- [x] **True lineweights in print** — per-shape / per-layer lineweights in mm always print. *cad:* partial: a fixed class → width table. `pages/CHANGELOG.md:125` · `cad/render/pdf.ts:31`
- [ ] **SVG / PNG export** — SVGOUT / PNGOUT of the active view (PNG at 2×). *cad:* missing. `pages/ui/cmdScripts.ts:739`

<details><summary>Covered in cad (4)</summary>

- Several sheets in one job, each at its own paper size — `pages/printing.ts:152` → `cad/render/pdf.ts:94`
- One sheet or all sheets — `pages/parts/DrawingsDialog.svelte:184` → `cad/ui/SheetList.svelte:17`
- Screen-only things left out (margin guide, hidden borders) — `pages/printing.ts:141` → `cad/render/pdf.ts:33`
- Floorplans in the PDF — `pages/ui/render/pdfRaster.svelte.ts:1` → `cad/app/sheetsPdf.ts:10`
</details>

### DXF export
- [ ] **Any view as DXF** — the active view or viewport: plan, elevation, section / marker (oblique), iso wireframe. *cad:* partial: Export › "This plan (DXF)" only. `pages/exportDxf.ts:5` · `cad/ui/CadShell.svelte:149`
- [ ] **At the viewport's scale** — text, dims and arrows sized for the viewport's 1:N. *cad:* partial: always 1:100. `pages/exportDxf.ts:9` · `cad/ui/CadShell.svelte:151`
- [ ] **Layers from the drawing** — one DXF layer per layer with ACI + true colour, lineweights per entity / layer, BYBLOCK in blocks. *cad:* partial: fixed layers by prim class (E-OUTLETS, A-WALL …). `pages/dxfEntities.ts:13` · `cad/render/dxf.ts:8`
- [x] **Blocks as BLOCK + INSERT** — each block written once, with ATTDEF / ATTRIB (hidden ones kept invisible), so they can be counted. *cad:* missing: inserts go out as plain lines and text. `pages/exportDxf.ts:287`
- [ ] **Real DIMENSIONs** — aligned / rotated DIMENSION entities with their geometry block and a dimstyle per scale. *cad:* missing. `pages/dxfEntities.ts:5`
- [ ] **Images in a ZIP** — PDF pages / pictures rasterised, cropped and placed as IMAGE entities; the .dxf and images zipped. *cad:* missing: images skipped and reported. `pages/exportDxf.ts:210` · `cad/render/dxf.ts:71`
- [ ] **Opens on the drawing** — $EXTMIN / $EXTMAX and the *Active view set from the content. *cad:* missing. `pages/exportDxf.ts:193`
- [ ] **Visible edges only** — an elevation with Hidden lines = Hide writes only the visible edges. *cad:* missing. `pages/exportDxf.ts:7`

### Paper annotations, legends, symbols
- [x] **Legend** — a placed legend of the layers in use (swatch + count, title, layers left out) that updates itself, also in DXF. *cad:* partial: the left panel lists the blocks used on the level with counts; it can't go on a sheet. `pages/ui/legend.ts:13` · `cad/ui/Legend.svelte:13`
- [x] **Notes block / tables** — NOTE: wrapped markdown (headings, lists, tables, bold), paste from Word / Excel, a big editor. *cad:* missing (tables on paper are "later", phase4 §6.5). `pages/ui/noteLayout.ts:35`
- [x] **Dimensions on paper** — dims drawn on a sheet / in a viewport, sized for paper. *cad:* missing ("dimensions on paper wait for a request", phase4 §3). `pages/CHANGELOG.md:197`
- [ ] **Symbols** — north arrow, section / detail / photo markers, elevation tags from the Blocks panel. *cad:* missing: built-in blocks are outlet symbols only. `pages/parts/BlocksPanel.svelte:11` · `cad/domain/blocks.ts:24`
- [ ] **Markers that open a sheet** — a marker block can link to a sheet or a URL; double-click or its badge opens it. *cad:* missing. `pages/ui/blocks.ts:88`

<details><summary>Covered in cad (4)</summary>

- Text on paper — `pages/ui/commands.ts:30` → `cad/editor/noteTool.ts:34`
- Leader with arrowhead and text — `pages/ui/cmdScripts.ts:348` → `cad/editor/noteTool.ts:34`
- Revision cloud (rect or polygon) — `pages/ui/cmdScripts.ts:674` → `cad/editor/noteTool.ts:34`
- Notes in a viewport follow its move / scale / pan — `pages/pagesProject.svelte.ts:587` → `cad/views/sheet.ts:104`
</details>

### Imports
- [ ] **Pages sheets into cad** — paper, viewports (direction / scale / model → level), revLog, the title-block template, global blocks. *cad:* missing (phase 7.2 planned). `pages/store/schema.ts:131` · `cad/docs/phase7.md:50`
- [ ] **Sheets-tool sheet import** — one at a time into a place; outlets viewports mapped with their annotations; others "Not mapped yet"; a list of what didn't map; import again. *cad:* missing (phase 7.3 planned). `pages/store/sheetsImport.ts:156`
- [ ] **Register drawing → one-viewport sheet** — another tool's drawing, tree ⋮ › Import into Pages. *cad:* missing. `pages/projectImports.svelte.ts:90`
- [ ] **Missing model / Not mapped placeholders** — a viewport whose model is archived or unmapped says so on the sheet. *cad:* different: viewports point at levels; nothing is imported yet. `pages/ui/Viewport.svelte:124`

<details><summary>Dropped by decision (2)</summary>

- View-direction preview chip (Keep / Revert) on sheet viewports — pages-features: "no preview chip" — `pages/types.ts:142`
- Editing 3D objects inside angled section / elevation viewports — pages-features: "Editing objects in 3D / iso, tilted boxes, oblique views: drop" (ADR 0004) — `pages/CHANGELOG.md:170`
</details>


