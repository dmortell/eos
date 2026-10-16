# A project from scratch in cad: workflow walkthrough

**Status:** 2026-10-14. Part 1 is a desk study, written from the code and the Help. Part 2 (at the end) is a live run on
a new project with User's floorplans: action counts, new bottlenecks B40–B52 and the re-ranked list. Nothing here is
decided. Fixes User agrees to go into `backlog.md`.

User's brief: start from a new project; then
- upload plans;
- add outlets, racks and routes;
- mark up other trades' drawings;
- prepare packages for a cabling RFP, installation and client review;
- make a BOM for cabling and rack quotes;
- mark changes, re-issue and track them;
- draw AV and server room wall elevations with wall-mounted kit and riser ladders;
- run cabling and risers between two floors.

**New floorplans keep arriving throughout the project** as desk and room layouts change. This is treated as a
recurring stage (2b), not a one-off.

Paths are under `src/lib/cad/` unless they start with `routes/`. Size estimates follow `backlog.md`: S ≤ ~60 lines,
M ~60–250, L > 250.

## The workflow today, stage by stage

### 1. New project

**Today:**
1. Projects › New Project (`routes/projects/Projects.svelte:118`) opens the Project details dialog: codes, name,
   client, author, address, logos, your company, members.
2. Save returns to the projects list.
3. Open the project, then CAD.
4. cad opens on "No cad data … Preview import" (`ui/ImportPanel.svelte`). On a new project the import finds nothing
   to import.
5. The real first step is Project › Floors…: set the range and name patterns, Apply floors, then fill in the heights.

**Bottlenecks:**
- **B1 Dead end on the first open.** A new project lands on an import panel that does nothing. Nothing points to
  Floors….
- **B2** Save in New Project doesn't open the project. Logos can't be uploaded until the project exists (likely).
- **B3** Floors live in two places: the old `project.floors` and cad's levels.

### 2. First floorplans

**Today:**
1. File › Uploads… opens the old Uploads tool in a dialog. Drop the PDF there.
2. Calibrate it in that tool (origin, scale, crop, masks, PDF layers, hide markups), or later on the plan from
   Floors › Plans & floorplans (Origin / Scale / Crop).
3. Pick "file p.N" for each floor in Plans & floorplans.

**Bottlenecks:**
- **B4** Three places for one job: Uploads, the Floors dialog's page pick, and calibration in either.
- **B5** Uploads accepts DXF / DWG but cad can't use them.
- **B6** No opacity or rotate UI, although the `Underlay` type has `rot` and `opacity`.
- **B7 Layer hiding is per file.** PDF layers, masks and "hide markups" are set on the file, so they are the same
  on every level, sheet and project. You can't hide markups on the working plan but show them on a check-back
  sheet.

### 2b. Revised floorplans (recurring)

**Today:**
- **Same file name:** the upload overwrites `files/{name}` and keeps its calibration. Every level, sheet and project
  using it redraws (`app/issueGuard.ts:9-19`).
  - **But** if issued sheets use the old file, the new one is saved beside it as "plan (2).pdf", with no calibration,
    masks or hidden layers (`lib/uploads/Uploads.svelte:141-143`).
  - Architects usually rename revisions (…_revC.pdf), which also gives a new, uncalibrated file.
- **Re-point:** Floors › Plans & floorplans' select keeps the underlay's name and X / Y offset, but not origin, scale
  or crop (they belong to the file). So Origin / Scale / Crop and the hidden layers, masks and markups are redone per
  page, in Uploads. There is no "copy calibration from the old file", no align by point pairs and no replace action
  in Uploads.
- **Compare:** none.
  - Workaround: add the new page as a second floorplan on the level ("+ Another page…").
  - Both draw at 0.6 opacity on the one Floorplans layer (`views/plan.ts:49-55`), so neither can be hidden alone.
- **Fixing what moved:** by eye. Window select, Select similar, Move with a base point or `@dx,dy`, nudge; runs follow
  moved outlets and racks; estimates and fill update.
- **Sheets:** viewports show the new plan at once. Issued revisions keep theirs: frozen copies hold a file reference
  plus a snapshot of its settings (`app/issue.ts:72-98`), and files used by issues can't be deleted.
- **History:** none, apart from Undo, backups and the Uploads file list.

**Bottlenecks:**
- **B8 No "replace with a new revision".** It should keep origin, scale, crop and masks (or re-align by two point
  pairs when the architect moved the drawing on the page) and swap the file on every floor in one step. Today a
  renamed revision means calibrating from scratch, page by page.
- **B9 No compare.** There is no old/new overlay in two colors, no toggle and no blink, so changes are found by eye.
- **B9a** Two floorplans on one level can't be shown or hidden one at a time (one Floorplans layer, fixed 0.6
  opacity).
- **B9b (likely, read not run)** Editing a file's masks or hidden layers may not mark issued sheets "Changed since":
  the fingerprint holds the file reference, not its settings.
- **B10 Nothing flags model items the new layout made wrong.** An outlet now inside a wall or a desk that has gone
  isn't flagged.
- **B11 No record of which floorplan revision a sheet issue used.** The cache keeps the picture, not a "Floorplan rev
  C" line on the transmittal.

### 3. Outlets, racks, routes, allocation, patching, fill

**Today:**
- **Outlets:** the Outlet tool numbers each click. Its options bar sets ports, tier, usage, mount, zone, server room
  and cable. Then Renumber, Find / replace, and Ports from label.
- **Racks:** + Server room, then the Rack tool, one click per rack (A01 → A02). Rows, then devices dragged from the
  Device library. F4 repeats a device edit.
- **Runs:**
  - The Trunk and Conduit tools draw them.
  - R rises or drops; V makes a riser.
  - Tray and ladder are set later in Properties.
  - Serves ticks rooms.
- **Before allocation:** estimated cables count in fill, the BOM and the schedule.
- **Allocate:** this level / selected / drag to a port.
- **Patch:** P / L, then a preview, then the cords. Cord status and Surveying mode track the changes.
- **Fill:** View › Fill, plus fill sections that can go on sheets.

**Bottlenecks:**
- **B12 Outlets one click each.** Desks come in blocks of 4–8 with the same outlet pattern. There is no array, no
  "outlet per desk" and no Excel import of an outlet list.
- **B13** Tray and ladder aren't tools of their own, and "Ladder" isn't in the Kind list (it shows as Tray,
  `ui/PathProps.svelte:157-161`).
- **B14** Rack product is a typed SKU (the Catalogue is now in the backlog).

### 4. Marking up other trades' drawings

**Today:**
1. Put the PDF page under a level as a floorplan, or on a sheet / plan / elevation with Insert › Image… (PDF page
   pick).
2. Mark it up with Text, Leader, Revision cloud, Dimension, Line and Legend.
3. Use Layers for cad's own items.

**Bottlenecks:**
- **B15** No markup set: no layer group per received drawing or per round of comments that can be shown or hidden
  as one ("Electrical rev B comments").
- **B16** No compare of two revisions of the received drawing (the same as B9).
- **B17** Check-backs and stamps happen outside cad (decided, `decisions.md:136`).
- **B7** again: the drawing's own markups and layers are set per file.

### 5. Sheets and packages (RFP, installation, client review)

**Today:**
- New sheet / From this view / To sheet…; viewports for plan, elevation, rack view, port grid, patch schedule and
  fill section.
- Title block from Project details.
- Tables › Sheets: category, tags, Number…, order.
- Packages: from a list or from chips (a rule).
- Issue…: purpose, revision codes, change notes, cover, backup.
- Then the PDF in Uploads, plus Transmittal and Issue register Excel.

**Bottlenecks:**
- **B18 Sheets made one at a time.** There is no "a plan sheet for every level" or "a rack elevation sheet for every
  server room" from a template sheet. That is the biggest manual job on a new project.
- **B19 A package is PDFs only.** An RFP needs the BOM, cable schedule and outlet schedule with the drawings; today
  they are exported one by one and attached by hand.
- **B20** The outlet schedule can't go on paper ("Tables on paper", `later.md`).
- **B21** One revision series per sheet. A client-review set and a construction set of the same drawing need
  duplicate sheets.
- **B22** No DRAFT stamp (open decision) and no review state (D3, later).

### 6. BOM for quotes

**Today:** File › Export › Bill of materials… opens a preview, then Excel ("BOM" + "Rack BOM").
- Cables in metres: routed length + slack + waste.
- Outlets and jacks.
- Containment metres.
- Cords.
- Rack SKUs and containment kits.

**Bottlenecks:**
- **B23** The material BOM is for the whole project only: no per level / room / zone, which a phased tender needs.
  The rack BOM can do it.
- **B24 Lines a quote needs are missing:**
  - faceplate / back box / module SKUs;
  - fibre terminations;
  - containment fittings and supports;
  - fire-stopping;
  - testing and labelling counts.
- **B25** The workbook header has no client, revision, date or notes sheet, and the BOM can't go into an issue
  package (same as B19).

### 7. Mark changes, re-issue

**Today:**
1. Draw revision clouds.
2. Type change notes per sheet.
3. Changed since shows in the register's state column and as a ● in the Navigator.
4. Issue… or Re-issue… (unchanged sheets keep their revision).
5. The title block's revision table fills itself.

**Bottlenecks:**
- **B26 Clouds aren't tied to a revision.** There is no delta tag, and clouds aren't cleared or hidden at the next
  issue, so they are deleted by hand on every sheet.
- **B27** Change notes are typed per sheet. There is no "same note on these 12 sheets", and nothing suggests notes
  from what changed.
- **B28** "Changed since" says yes / no, never where. There is no highlight of the changed items on the sheet.
- **B29** A wrong issue can't be voided (open decision). The title block shows the last 5 revisions (a setting was
  decided, then parked).
- The cloud tool's hint says "On a sheet" but it works in every view (`ui/toolHints.ts:32`): an S fix.

### 8. Tracking changes

**Today:**
- Docs keep only their last `updatedBy` / `updatedAt`, and nothing shows them.
- Undo is per session.
- Patching has real tracking: cord status, "Was:" ends, changes-only patch schedule.
- A backup restore previews counts.

**Bottlenecks:**
- **B30 No "who changed what".** There is no activity list, per-item history or diff between issues. The decision is
  inconsistent: `decisions.md:131` "A change log?" is open, while review R9 says "no log, backups cover it".
- **B31** Backups are manual (the issue tick is off by default) and never pruned.

### 9. AV and server room wall elevations

**Today:**
- An elevation of the whole level (front / rear / left / right) with a depth band.
- One wall: draw a **Section** across the room, set its depth and flip it, then To sheet.
- Wall-mounted kit:
  - Box tool in an elevation or section;
  - blocks with front drawings (placed in an elevation they show only there);
  - trunks drawn in an elevation on the work plane.

**Bottlenecks:**
- **B32 No wall-mount rack.** A rack always stands on the floor (no Z, no wall-mount kind) and the Rack tool is
  plan-only.
- **B33** No AV kit (screens, speakers, panels) other than boxes and hand-made blocks; no AV library.
- **B34 A section is a view, not a drafting space.** Outlet, Trunk, Conduit and Line don't work in a section
  (`app/workspace.svelte.ts:50`; Help says Line does). A block placed in an elevation doesn't show in a section of
  the same wall.
- **B35** "Elevation of this wall" takes a section drawn by hand. Room elevations A–D are in `later.md`; they need
  room boundaries.
- **B36** Riser ladders on a wall: there is no Ladder kind (B13).

### 10. Cabling and risers between two floors

**Today:**
1. Set floor heights.
2. Line up the plans' X / Y offsets.
3. Draw a trunk and press V plus a level number: a riser to that floor's FFL that ends the run.
4. Open the other floor and Ctrl-drag on.
5. Backbone: Port › Link to… across rooms. Lengths come from 3D routes.
6. The riser view draws bands, shafts, EPS boxes and grouped backbone.
7. Fill per segment.

**Bottlenecks:**
- **B37 A riser stops at the next floor's FFL** and the run ends. Carrying on there is a second manual run from the
  other plan.
- **B38 EPS rooms can't be named or drawn.** There's no space / room boundary tool; boundaries only come from
  imports.
- **B39** The riser view has no fill % or cable counts and can't be arranged by hand. There is no penetration tool
  or fill at penetrations (`later.md`).

## The biggest wins (draft ranking)

The ranking is by how often the job happens × how much hand work it costs today.

| # | Fix | Bottlenecks | Size |
|---|-----|-------------|------|
| 1 | **Replace floorplan with a new revision**: keep calibration, crop and masks (or re-align by two point pairs); swap it on every floor; record the floorplan revision with the issue. | B8, B11 | M |
| 2 | **Floorplan compare**: old / new overlay in two colors, plus a toggle; each floorplan shown / hidden on its own. Also works for other trades' drawings. | B9, B9a, B16 | M |
| 3 | **Sheets from a template**: one sheet per level / server room / riser from a chosen sheet (viewports re-pointed, numbered from the category). | B18 | M |
| 4 | **First-run path**: a new project opens cad on "Set up floors", then "Add floorplans", not the import panel. Save in New Project opens the project. | B1, B2 | S |
| 5 | **Clouds tied to revisions**: a delta tag with the revision code; at issue, clouds from older revisions hide (kept, not deleted). | B26 | S–M |
| 6 | **Package attachments**: the BOM, cable and outlet schedules (Excel) issued with the PDFs and listed on the transmittal. | B19, B25 | M |
| 7 | **Outlets per desk / array**: place an outlet pattern on every selected desk (block), or an array along a line. | B12 | M |
| 8 | **BOM per level / room / zone**, plus a header with client, revision and date. | B23, B25 | S–M |
| 9 | **Riser continues on the other floor**: after V, carry on drawing on the target level (split pane or switch). | B37 | M |
| 10 | **Draft in sections**: Outlet / Trunk / Line in sections; blocks shown in every view that sees their wall. | B34 | M |
| 11 | **Wall-mount rack**: a rack kind with a Z height (and AV kit as block templates). | B32, B33 | M |
| 12 | **Show what changed since the last issue** on the sheet (highlight the changed items). | B28 | M–L |
| 13 | **Change log decision**: settle "A change log?" (R9 says no; decisions.md is open). | B30 | — |
| 14 | **Ladder in the Kind list** and the cloud-hint fix. | B13, B36 | S |
| 15 | **Check B9b**: does a mask / layer edit on a floorplan file mark issued sheets "Changed since"? (verify, then fix if not) | B9b | S |

## Part 2: live run (2026-10-14)

**Setup.** A new project "Workflow test" with three of User's outlet plans (a client office):
GF, L1 and L2, A3 at 1:100, with no dimensions on them. User set the L1 / L2 origins. Writes went only to this project.

**Not run live:**
- Stage 4: there was no other-trade drawing.
- Stage 8: there is no UI for it to try.
- Stage 9: wall elevations.

The desk study stands for these three.

### What it took

Actions are clicks, keys and typed fields, counted by hand.

| Stage | What was done | Actions | Verdict |
|---|---|---|---|
| 1 New project | New Project dialog (8 fields), open project → CAD | ~20 | OK; dead-end import panel (B1); "Your company" retyped |
| 1 Floors | Lowest 0 / Top 2 / `L{n}` / GF → Apply | ~8 | Good |
| 1 Settings | **none existed** — Usages / Cable types / Sheets empty (B40) | — | **Fixed** (1635f8a1) |
| 2 Upload | File › Uploads…, pick 3 PDFs | 3 | OK, but not from Plans & floorplans (B4, todo added) |
| 2 Scale | per file: Scale tool, drag the line across the page, type 41 986 mm (computed), Save | ~6 × 3 | Slow: no "1:100 on A3" option (B41) |
| 2 Origin | per floor: Floors › Origin, zoom ~20 ticks to a column, click | ~6 × 3 | Slow; can't check the floors line up (B43) |
| 2 Assign / crop | 3 selects; crop is another trip per floor | 3 + ~6 / floor | Crop undone by a stale bar (B42) |
| 3 Room + racks | + Server room, Rack tool 3 clicks | ~6 | OK; racks not bayed |
| 3 Devices | drag from library; a drop next to a device is silently refused → type U | ~4 / device | B45 |
| 3 Outlets | Outlet tool 9 clicks + ~10 option changes (ports, mount) | ~20 | Defaults wrong for wall / ceiling (B44) |
| 3 Usage / tier | Ctrl-select, usage button, tier select | ~8 | Shift doesn't add to a selection (B49) |
| 3 Trunk | 6 clicks + Enter from a rack | 7 | Good: height from the level, fill estimates at once |
| 3 Allocate | Outlets table ⋯ › Allocate this level | 2 | Good; 15 "no route" (B44) |
| 3 Patch | zoom, select ports 1–18 (missed twice), P, first switch port, preview, OK | ~10 | Preview good; port picking fiddly (B46) |
| 5 Sheet | New sheet from this view, scale, W / H, crop trip, Fit, title | ~15 | Poor defaults (B47) |
| 5 Issue | Issue…, package name, purpose, Issue | ~5 | Good |
| 6 BOM | File › Export › Bill of materials… | 3 | Unpriced "no route" lines (B48) |
| 7 Change + re-issue | move an outlet, cloud (5), change note, Issue… B | ~12 | Good; the cloud stays (B26) |
| 2b New floorplan | upload "…revB.pdf", re-point L1 | 4 | **Live sheet broke at once** (B8) |
| 10 Riser | trunk from a rack, V, Enter (prompt "Riser to level [2]") | 4 | Good; stops at L2 FFL (B37) |

### What worked well

- **Allocation** is one action, with clear chips: routed, no route, issues.
- **Patching:** the patch preview explains a skipped port. 18 cords took about 10 actions.
- **Trunks:** they take the level's ceiling-plenum height and show fill (estimated cables) as soon as they're drawn.
- **Issue and re-issue:** the change notes carry into the revision, the title block fills in, and "Changed since" shows
  at once in the Navigator.
- **Risers:** V plus a level number makes a labelled riser, and the riser view draws it straight away.
- **Undo:** one Ctrl+Z put back a wrong floorplan swap and selected what changed.

### New bottlenecks (B40–B52)

- **B40 A new project had no settings.** Only the legacy import made them, so Usages, Cable types, Lengths, the title
  block and Files were empty and could not be added. **Fixed 2026-10-14** (1635f8a1):
  - defaults on the first Apply floors;
  - a button for projects already in that state;
  - User's lists: AP / TV / CCTV and CAT6A / CAT6 / OS2 / OM4.
- **B41 Scale needs a known distance.** These plans have none, only "1/100".
  - cad knows the PDF page size, so a **"paper scale 1:___"** field would calibrate in one step (A3 width → 42 m at
    1:100).
  - Today you drag a line across the page and type a computed number.
- **B42 Stale confirm bars (P2 bug).**
  - After Origin or Crop, the "Origin set / Cropped … Put it back / Cancel" bar stays on screen in other views, and
    even comes back over a sheet after its Cancel was pressed in the dialog.
  - **Enter answers it with "Put it back"**: a later Enter silently undid the L1 crop (checked in Firestore).
  - Fix: close the bar when the view or dialog changes, and never make the revert the Enter default.
- **B43 Floors are aligned and checked by eye.**
  - Origin and Crop are separate trips per floor, and the architect's grid can't be snapped to.
  - Nothing shows the floor below as a ghost, so you can't check they line up. I checked by reading Firestore.
- **B44 Outlet defaults don't fit the building.**
  - A new outlet is a floor box at Z 0, tier Low, so wall faceplates and ceiling rosettes need Mount changed each time.
  - A ceiling outlet keeps tier Low and Z 0.
  - In a ceiling-fed building (AU / UK offices, no raised floor) every wall outlet is "no route" until a low trunk
    exists. Tier should follow the mount (ceiling → high), and a wall outlet could be fed from the ceiling.
- **B45 Device drop refused silently.** Dropping a library device just under another in a rack does nothing, with no
  message and no snap to the nearest free U.
- **B46 Patching needs pixel hunting.**
  - At fit, a 48-port panel's rows are about 4 px tall, so my clicks hit the wrong row twice.
  - Proposed fix: **"patch all allocated ports"** on a selected panel, or "select used ports".
- **B47 "New sheet from this view" gives a poor sheet.**
  - It sets 1:150 (not the plan's 1:100) and fills a quarter of the paper.
  - It centres on the whole PDF page, including the architect's title block and legend.
  - It took about 15 actions plus a crop trip to make it usable.
- **B48 BOM gaps for a quote.**
  - Unrouted cables appear as "cat6a — no route: 15 ea", with no length to price; they need an estimate.
  - Cable lines show the type id (`cat6a`), not its label (CAT6A).
- **B49 Selection and panel friction.**
  - Shift+click replaces the selection on the plan (Ctrl adds).
  - The bottom table reopens on every view change (collapsed it 5 times).
  - Clicking inside a viewport selects the sheet.
  - The riser view replaced the plan's tab.
- **B50 Identity typed per project.** "Your company" is entered for every new project, and the title-block logo box
  shows a placeholder "J".
- **B51 Issue PDFs mixed in with the floorplans.** They are listed in Uploads beside the floorplans, flagged "Set
  origin". Floorplans went to Firebase and issue PDFs to UploadThing.
- **B52 Misleading allocation issue.** "3 high-level port(s) went to floor panels — the high-level panels are full",
  when the room has no high-level panel at all.

### Re-ranked (live counts + the desk study)

| # | Fix | Bottlenecks | Size |
|---|-----|-------------|------|
| 1 | **Replace floorplan with a new revision** (keep calibration / align 2 points, every floor, record the revision): a renamed revision broke the live sheet at once and costs ~15 actions per floor to redo. | B8, B11 | M |
| 2 | **Stale confirm bars**: close on view / dialog change; Enter never reverts. A silent data loss. | B42 | S |
| 3 | **Paper-scale calibration** ("1:100 on A3" from the PDF page size), plus origin / crop in one floor-setup pass with a ghost of the floor below. | B41, B43 | S–M |
| 4 | **Better "New sheet from this view"**: the plan's scale, fill the drawing area, centre on the crop, then **sheets from a template** (one per level / room). | B47, B18 | M |
| 5 | **Outlet defaults by mount** (wall / ceiling heights and tier) and routing for ceiling-fed buildings. | B44 | S–M |
| 6 | **First-run path**: new project → Floors → Floorplans (with upload). | B1, B2, B4 | S |
| 7 | **Clouds tied to revisions** (hide at the next issue). | B26 | S–M |
| 8 | **Patch all allocated ports** on a panel. | B46 | S |
| 9 | **Floorplan compare** (old / new overlay, toggle). | B9 | M |
| 10 | **BOM for quotes**: estimate unrouted lengths, labels not ids, per level / room, header. | B48, B23, B25 | S–M |
| 11 | Small fixes: device drop to the nearest free U, Shift adds to a selection, the table stays closed, allocation wording, company details from the last project. | B45, B49, B50, B52 | S each |

Then, from the desk study:
- package attachments (B19);
- outlets per desk (B12);
- riser continues on the next floor (B37);
- drafting in sections (B34);
- wall-mount racks (B32);
- change highlight (B28);
- the change-log decision (B30).

### Round 2 (User's installer tasks, 2026-10-14)

Tasks: patch schedule export, mark installed, GF / L2 outlets, the riser down to GF, patch the new outlets, change
export, rack elevations and riser fill on sheets, an installer package, an ACS panel (800 × 1200 × 200, 1000 off the
floor) with a floor-to-ceiling riser, and the ACS outlet patched.

**Worked well:**
- Exports: the patch schedule (a sheet per room plus a cord BOM) and the "changes only" export (22 ADD).
- Marking 18 cords installed: Ctrl+A, then right-click › Installed.
- Risers: V + 0 down to GF, with an EPS box in the riser view; R + 2600 for the vertical riser.
- The ACS panel with the Box tool: height 1200, Z 1000, a corner click and `800,200` typed. It shows in the front
  elevation.
- To sheet from the rack view makes a "Rack elevations" sheet.

**Bug fixed:** Packages › + From selection made no package; the store froze a `$state` proxy. Fixed in 782836ee.

**New findings:**
- **B53 Outlets on another floor lose the server room.** Outlets on GF / L2 came out with no server room, though the
  tool bar's Server room was set to L1.20 (the building's only room). They had to be set in Properties before
  allocating.
- **B54 Cords cover the ports.** Cords drawn over a panel's lower row hide its ports. Patching more ports meant hiding
  the Patch cords layer; my misclicks once started a "Link 0 backbone cables" dialog.
- **B55 Fill sheets stack and share a title.**
  - A second "Put on sheet" lands exactly on top of the first fill viewport.
  - Both are titled "Fill · Run · seg 1"; a riser has no label, so "Riser L1↕GF" would be clearer.
- **B56 A new outlet continues the last outlet's label.** The ACS outlet became "CAM 1.03". A wall outlet's symbol says
  "Auto: Outlet – ceiling".
- **B57 Wall-mounted equipment is a plain box.** There is no panel / cabinet kind, the same as B32 / B33.
- **B58 Export file names are fixed** (User's todo, now in the backlog).

### Round 3: switch ports for ACS / CCTV (User, 2026-10-14)

Task: assign the switch's first 2 columns to ACS and CCTV.
- SW1 is a 2U, 96-port switch, numbered down the columns: column 1 = ports 1, 2, 49, 50; column 2 = 3, 4, 51, 52.
- Column 1 → ACS; column 2 → CCTV. An ACS usage was added in Settings.
- The 4 desk cords on ports 1–4 were moved to ports 41–44 and became CHANGE, with "Was:" shown. The ACS cords (ADD)
  went to ports 1–2 and CAM 1.02 to port 3 (CHANGE).

**Findings:**
- **B59 Switch ports can't be reserved.** "Reserve for…" exists only on panel ports, so the columns were marked with
  port labels (ACS-1…4, CCTV-1…4). Nothing stops a later Patch to… from filling them with desk ports, and Ctrl-click
  "fill free ports" starts at port 1.
  - Proposed: switch-port reservations by usage, which Patch to… honours by sending each outlet's usage to its
    reserved ports. That would have done this whole round in one step.
- **B60 Re-patching is one cord at a time.** Each cord took: find it in the table, select it, then drag its end grip
  onto a ~12 px port (the view pans on every row pick). Nine actions per cord, with misses.
  - Proposed: the table's To cell editable (type "SW1:41"), or "move these cords' switch ends to the next free ports".

### Round 4: GF routes and riser fill (User, 2026-10-14)

User: "GF outlets need route to the patch frame, the fill rate shows 0% usage for the riser."

**Found and fixed in 6de22121:**
- **The GF trunk missed the riser.** It was started by eye 57 mm from where the L1 → GF riser lands; runs join within
  50 mm. The riser belongs to the L1 plan, so its GF end was never a snap point on GF. It is now.
- **A riser picked up cables from the wrong floor.** A riser's TOP end, on its own floor, met L2's trunk 3.8 m above
  it, so L2's cables went up the L1 → GF riser. Only a riser's far end reaches into the floor it lands on now.
- **A hot reload went back to the first view** (S001). The view was read from `page.url`, which keeps the URL the
  page loaded with. It now comes from the address bar.

**GF floor boxes:** these were low tier with only ceiling containment on GF. I added a drop at the end of the GF
ceiling trunk and a floor-level run past the floor boxes. All 11 GF ports now route (24–44 m).

**Riser fill:**
- L1 → GF: 11 cables, 21.5%.
- L1 → L2: 3 cables, 5.9%. Its sheet view was re-made on segment 2: "Put on sheet" takes the run's fullest segment,
  which was the horizontal piece in the rack room.

**Findings:**
- **B61 "Put on sheet" puts the run's fullest segment, not the one you picked.** You have to click the segment row in
  Fill first. On a riser, the vertical segment is the one you want.
- **B62 A fill view of an unnamed run read "(run gone)"** in the View list. It now reads "Run" (6de22121).
- **B63 Feeding a floor box under ceiling-only containment needs two runs:** a drop (high) and a floor run (low). An
  outlet only joins a run of its own tier.

**Live updates:** a second tab on S003 showed each change from the first tab within about 2 s, with no reload. Sheets
do update in real time.

### Round 5: comparing two floorplan revisions (desk check, 2026-10-15)

User's todo: how hard is it to switch a plan, or one sheet's viewport, between two PDF floorplans of the same floor
to see what the designer changed? Checked against the code as it is after W5 / W9 (Workflow test already holds
the 1F outlet plan revB (2024-10-14) beside the 2024-05-16 L1 plan).

**Today, to bring in revB and look at it:**

| Step | Where | Actions |
|---|---|---|
| Upload revB | Plans & floorplans › L1 › Upload… (W9; or File › Uploads…) | 2 |
| Calibrate revB | 1: 100 (W5), then Origin (zoom to the same column, click), then Crop (2 clicks) | ~10 |
| Masks / hidden PDF layers again | Uploads viewer: redraw each mask, untick each layer | n per mask / layer |
| Point L1 at it | the L1 row's select → revB | 1 |
| Flip back to compare | the select again (dialog open, the plan re-renders each time) | 2 per flip |

**What it can't do:**
- **Nothing is carried over.** revB starts uncalibrated: origin, scale, crop, masks and hidden layers are all done
  again by hand, though it is the same drawing moved by a few mm at most (B8 / B11 → W4).
- **No side-by-side or overlay.** "+ Another page…" puts revB on L1 as a second floorplan, but both draw at the
  fixed 0.6 opacity on the one Floorplans layer: one can't be hidden, faded or colored on its own. It is then
  removed again by hand (B9 → W7).
- **One view only isn't possible.** A viewport shows its level's floorplans; there is no per-viewport floorplan, so
  pointing L1 at revB changes every L1 sheet at once, issued ones included ("Changed since" on all of them).
- **No record of the swap.** Nothing says which revision a sheet was drawn on, or when it changed.

**Proposed (folded into W4 and W7):**
1. **W4 "New revision…"** on a floorplan's row: upload (or pick) the new PDF; cad copies the old page's calibration
   (origin, scale, crop, masks, hidden layers) into the new file and re-points every floorplan of this project that
   used the old page, in one undo step. The old file stays (issued sheets print from it). Re-align by two point pairs
   when the architect moved the drawing on the page: later, only if needed.
2. **W7 per floorplan Show / Fade** on its row (the `Underlay.opacity` field exists, nothing sets it), and
   **Compare with the previous revision**: the old page drawn as a red ghost under the new one, toggled with one
   button, never printed.
3. Per-viewport floorplans: not proposed — a revision is the floor's, and W4's re-pointing plus W3's "Changed since"
   already say which sheets moved.

### Round 6: deleting sheets and floor models (live, Workflow test, 2026-10-15)

User: "do a walkthrough of deleting sheets and floor models". Everything below was undone afterwards (checked in
Firestore: 3 levels, 3 sheets, 3 floorplans, 40 links, 40 cords as before).

**Deleting a sheet** — Sheets table: pick the row, Delete → "Delete sheet S002 with its 1 viewport? Undo brings them
back." → Delete: gone from the table, the Navigator and its tab; Undo restored it. Good.
- **D1** S001 has been released twice (A, B) and is in a package, but its question says only "Delete sheet S001 with 1
  viewport and 1 note?". Nothing says it was released, that it drops out of the package, or that **Archive** (already
  on the Sheets bar) keeps the record. A released sheet should say so and offer Archive first.

**Deleting a floor model** — Navigator: right-click L2 › Delete level… → "Delete level L2 and everything on it (9
items: outlets, racks + devices, links, cords, drawing, floorplan, rooms, sections, views)? Undo brings it back." →
gone from the Navigator; Undo restored all of it (one step).
- **D2** The question lists every KIND of thing a level can hold, not what this one holds — "9 items: 7 outlets, 1 run,
  1 floorplan" would say what is lost.
- **D3** L1's riser up to L2 stays: the riser view draws it rising past L1's slab to a floor that has gone ("Riser ·
  HIGH" at the top), its cables gone with L2's outlets. The question doesn't mention runs on other floors that end on
  this one.
- **D4** The floor stays in the building: Project › Floors… still shows the L2 chip (white = a floor with no level) and
  its heights row is gone. **Apply floors** would bring L2 back as an empty level. So the building already knows "a
  floor that exists but has no model" — but the riser view only draws floors that have a level (a floor with none is a
  gap, or "floors with no level" when empty floors are hidden), and nothing says what Apply will do to it.

**User's question (Test Project: only 1F and 4F are used; 2F / 3F not needed in the Navigator but still in riser
views).** No new setting is needed: a LEVEL is the floor's model, the building's floor range is the stack. Delete the
2F / 3F levels (they leave the Navigator; the building keeps them, D4), and make the riser view draw a building floor
with no level as a plain floor (FFL line, slab, name, the building's typical heights), and make Apply floors leave
such floors without a level unless asked ("Create its model" on the chip). → backlog W33 (asked first).
## Into the backlog (2026-10-14)

User: "add the walkthru findings / improvements / fixes to backlog". They are now `backlog.md` § Workflow walkthrough,
W1–W32 (1 P1, 17 P2, 14 P3). Already fixed, so not listed there:
- B40: default settings;
- the package bug;
- B53: the riser-end snap;
- the riser reach;
- the reload view;
- B62: "(run gone)".

Left where they already are:
- B30: the change log decision (`decisions.md`);
- B17: check-backs, which are outside cad;
- B21 / B22: revision series and the DRAFT stamp (decisions);
- B35: room elevations (`later.md`);
- B31: automatic backups;
- B58: export file names (User's todo).

## Round 7: a 20-floor building, the client on 1–3 (live, 2026-10-16)

User: "re-run the walkthru (clear the project, keep the PDF floorplans, reset origins and scales / crops) and look for
UX improvements, in particular how hard it is to find tools / buttons without switching focus between menus,
Properties, toolbar, status bar". The project was backed up first (Project › Backups…), then cleared; the floorplans'
origin / scale / crop were reset. Three outlet plans only, so the GF plan stands in for 3F.

| Stage | What it took | Actions |
|---|---|---|
| Floors | Top 20 → Apply (20 models) → Remove empty floor models (19) → + 2F model, + 3F model | ~7 |
| Floorplans | pick 3 PDFs; type 100 + Enter + Keep on each; Set up each floor (origin, 2 crop corners × 3) | ~25 |

**Found (R7-n) and what was done:**
1. No direct "the client uses 1–3": the chips mean "the floor exists". → **Tenant floors** field ("3-8, 12"), built.
2. Layout shifts made clicks miss: the Undo / Keep bar pushed the Plans list down; the No-model list moved the buttons.
   → bar floats at the foot; list under the buttons — built.
3. The same 1:100 typed for each floorplan. → "Scale of all n: 1:" — built.
4. Set up each floor's steps were only in the status bar (bottom left) while the eye is on the drawing and the Undo /
   Keep bubble (top). → the step shows in the bubble ("Next: …") — built.
5. The plan jumped about a second after Origin (the redraw), so crop corners clicked quickly landed in the wrong place.
   → the view follows the floorplan — built.
6. Re-cropping showed only the old crop, Fit fitted it, and there was no way to remove a crop. → whole page while
   cropping, ✕ removes a crop — built.
7. "Hide all windows" can leave no panels with no hint why; the two unlabeled layout icons (top right) were tried first
   → a Navigator (tree) button at the top left shows / hides the tree (and brings hidden windows back); an amber
   "Windows hidden · Show" chip on the tool bar while they are hidden.
8. "+ Server room" only in Window › Racks (not open at first). → Cabling › New server room… and the floor's menu in the
   Navigator — built.
9. "(level gone) plan" tabs stayed after their floor went. → closed — built.

**Second half (after the fixes above), on 1F:**

| Stage | What it took | Actions | Where the controls were |
|---|---|---|---|
| Server room | Cabling › New server room… → Add (name offered) | 2 | menu → dialog |
| Racks | Rack tool, 3 clicks (bayed, in IDF 1 by itself) | 4 | tool bar → plan |
| Devices | Properties › Open rack view; Cabling › Device; 2 panels + switch, one library pick | ~7 | Properties → menu → floating library → rack |
| Outlets | Outlet tool, 4 clicks; then Ctrl-select 3 › AP, Mount ceiling | ~9 | tool bar row → plan → Properties |
| Trunk | Cabling › Trunk, 3 points + Enter (attached to R02, plenum Z) | 5 | menu → plan |
| Allocate | Outlets table › ⋯ › Allocate this level | 2 | bottom table, its ⋯ (far right) |
| Patch | panel › Select the 8 … not patched › P › first switch port › Patch 8 | 4 | Properties → key → rack → dialog |
| Sheet | Drawings › New sheet from this view | 1 | menu |
| Release | Sheets bar › Release… › name, BOM › Release | 5 | bottom table bar (inline form) |

Each stage crosses 3–4 places (menu or tool bar, the drawing, Properties on the right, the tables at the bottom).
The two that are hard to find: **Allocate** (a ⋯ menu at the far end of the bottom table) and **Release** (the
Sheets table's bar; also Drawings › Release…).

**Found:**
10. Esc during Set up each floor first answers the Undo / Keep offer (Keep), a second Esc stops the pass.
11. Rack tool: good — the room is picked by itself, racks bay.
12. In the rack view Device sits in the Rack tool's flyout; the Device library opens floating over the first rack
    (covering R01) and stays open after the tool ends.
13. Mount → ceiling leaves Z 0 (the outlet default's Z 0 is kept), so a ceiling outlet sits on the floor in elevations.
14. Allocate: "8 no route" in the table with "?" lengths; why (no run within 10 m of the outlet) and what to do is only
    in a port's Properties.
15. Bulk patch: the switch's first port is hard to hit at Fit zoom (port 3 was taken); the preview shows it, but can't
    change the first port.
16. New sheet from this view: the viewport is the part of the plan on screen (262 × 97 mm), not the floor; its title is
    "New sheet".

**Third part (after fixes 10–16): risers, a second floor, desks, a new revision, a second release.**

| Stage | What it took | Actions |
|---|---|---|
| Riser 1F → 2F | Cabling › Trunk, R03, a point, V, 2 + Enter (2F opens), 2 points, Enter | 8 |
| 2F outlets | Outlet tool, 3 clicks; Server room / AP / ceiling in Properties | ~7 |
| Allocate 2F | the new **Allocate this level (6 ports)** button | 1 |
| Patch 2F | panel › Select the 6 … › P › a switch port › **Start at port** 11 › Patch 6 | 6 |
| Riser view | Display › Hide empty floors (+ Fit) | 2 |
| Desks | Insert block ×2, outlet on one, outlet + the other desk › right-click › Copy outlets onto the other desks | ~8 |
| New revision | Plans & floorplans › 1F › New revision… › revB; Compare… › previous | 3 |
| Release + changes | sheet › **Release…** › name › Release; Revision cloud (4 clicks + Enter); Show changes since A | ~10 |

**Found:**
17. V (riser to another floor) asks the level number in the status bar, bottom left, while the cursor is on the
    drawing — open.
18. 2F's first outlets, served from 1F's IDF 1, got no server room (so nothing to allocate). → the building's only
    server room — built.
19. The riser view of a 20-floor building with the client on 1–3 shows 20 storeys, the riser a speck at the bottom;
    Hide empty floors is off by default — open (default it on when tenant floors are set?).
20. Hide empty floors didn't refit the view. → refits — built.
21. Hide empty floors also hid 2F (no server room), where the riser goes. → floors a riser starts / ends on stay — built.
22. Copy outlets onto the other desks needed the desk the outlets sit on selected too (and gave no hint). → found by
    itself — built.
23. A click on an outlet sitting on a desk selects the desk (the desk draws over it) — open (the parked draw-order item;
    a pick priority for outlets over furniture would do).
24. Plans & floorplans shows a floorplan's 1:N and its crop ✕ only after that floor has been drawn this session — open.
25. Release… in an open sheet's Properties needed Select sheet first. → in the sheet's basics too — built.
26. Show changes since A: 3 marks (the cloud, the revision) — good.

Not run this round: Re-patch, exports (downloads), room elevations / a section on a sheet, Array / Renumber.

**Last part (after fixes 17, 19, 23, 24): the stages not run before.**

| Stage | What it took | Actions |
|---|---|---|
| Re-patch | 2 cords in the Patching table › Re-patch… › "SW1:41" › Enter (a dialog) | 3 |
| Exports | File › Export ▸ › Bill of materials… (preview checked, not downloaded) | 3 |
| Room elevations | Draw › Room / EPS, 4 corners, C, name; Draw › Section ▸ › Room elevations, click in the room | ~9 |
| Section on a sheet | open Section A › To sheet… › New sheet from this view (1:25) | 2 |
| Array | select › Modify › Array › base, 3 + Enter, step | 5 |
| Renumber | the 3 copies › Properties › Renumber 3 › Start 21 › Renumber 3 | 4 |

**Found:**
27. Submenus (File › Export, Draw › Section) open only from their ▸ — not on hover or a click on the name — built.
28. A Room drawn round IDF 1's racks becomes a second room ("Room 1") beside the server room IDF 1 — the one-space-two-
    rooms case again (IDF2 / 33IDF2) — built: it offers "IDF 1's outline".
29. A sheet from a section was titled "1F Section". → the section's name ("1F Room 1 A") — built.
30. An outlet on a desk is still drawn under the desk's fill (invisible; a click now takes it, R7-23) (the
    parked draw-order item: draw outlets over furniture) — built (furniture blocks under the cabling).
31. The room's name is asked in the status bar — built (a dialog).
Good: Re-patch, the BOM preview (16 lines, estimates for unrouted ports), Room elevations A–D in two clicks, Array
numbering on, Renumber with port labels following.

## Round 8: the less-used functions (live, 2026-10-16)

User 2026-10-16: "walkthru again and look for more improvements, especially in more obscure functions". Run on
Workflow test (backup first); nine areas, roughly most likely to turn up problems first. Fixed as found where small;
the rest listed for review.

### 8.1 Buildings

Add building (Projects page › + Building, "Annex") → it opens in cad, empty; Set up floors 1–3; Project › Copy
settings from › Building 1; a sheet; Ungroup; Group with another project (back in); Delete this building (Archived).

**Found:**
1. The empty project's start card said "Start Workflow test" in every building. → "Start Workflow test – Annex" —
   built.
2. The Navigator's top row said "WORKFLOW TEST" in every building of the group. → "Workflow test – Annex" — built.
3. The title block printed "Workflow test" on every building's sheets (the default template has no Building field).
   → with no Building field the Project cell reads "Workflow test – Annex" — built (`fillTitleBlock`).
4. A standalone project's ⋯ says "Group with another project…" but the dialog was titled "Move to another project". →
   titled to match — built.
5. A sheet from an empty floor's plan gets a thin viewport strip (283 × 105 mm) at the top of the paper — open (minor:
   an empty floor has nothing to frame; the whole drawing area would read better).
Good: Add building copies the details and settings and opens it; Copy settings from is one click with Undo; Ungroup /
Group back / Delete (to Archived, Restore) each one dialog with what happens in words.

### 8.2 Releases

Released S001 + S002 as B ("03 Round 8", a note per sheet); the Releases register; Make package on it; Delete on the
released S001 in the Sheets table → Archive instead → Archived 1 → Restore. (Revision clouds and Compare: Round 7.)

**Found:**
6. The Releases register listed three releases of one day as 1, 3, 2 (by date, then by their random ids). → newest
   first by number — built (`IssuesList`).
7. The Sheets table's Delete deleted a released sheet (in a package too) with the plain "Delete sheet S001 with 1
   viewport?" — W34's "Released: … Archive instead" came only with the Delete key. → the button uses the same delete —
   built (`SheetsTab`).
8. Typing "03 …" as the release name gives "Release 03 03 Round 8" in the file name (the number is added anyway) —
   noted only (the placeholder says "e.g. Tender release 1").
Good: the release bar (a revision and "what changed" per sheet), the register's links to each release's PDF, Make
package naming the package after the release, Archive / Restore.

### 8.3 Changes on site

Patching table: four cords Installed (row menu, then a range); Re-patch… one installed cord to SW1:20 → CHANGE (↶,
"Was …" in Properties); Remove on another installed one → REMOVE (struck through); Patch schedule · cord BOM (counts by
status, "changes only"); Properties › Removed on site → its record goes.

**Found:**
9. With only REMOVE cords picked, the table's button and row menu said "Installed (1)" (it does take them out) while
   Properties says "Removed on site". → "Removed on site (1)" there too — built (`cordActions`).
Good: the status chips with counts, Re-patch in a dialog, the strike-through for removals, Revert in Properties, the
cord BOM by status.

### 8.4 Inside a sheet

S002: double-click into its viewport (Editing in a viewport ✕ / Done), a trunk picked and its Properties; Esc out; the
viewport selected (scale, window, Fit); the Text tool inside the viewport (a note tied to it); Drawings › Title block….

**Found:**
10. The Text tool's new note, typed into and then Esc'd ("Esc cancels" in the hint), stayed behind reading "Text". →
    Esc takes a just-placed note away (its step is undone) — built (`TextEditBox`; read `at` before clearing
    ws.textEdit — it derives from it).
11. Drawings › Title block… opened the Sheets tab on its categories; the title block was below categories, disciplines
    and contacts. → it scrolls to the Title block section — built.
12. A selected viewport said "1 selected (sheet)" in the status bar (Properties: Viewport). → "1 selected (viewport)"
    — built (`selectedText`).
13. A click on a magenta symbol inside the viewport picked nothing — it was the floorplan PDF's own drawing, not an
    outlet (only the walkthrough's own outlets are cad objects) — not a bug; noted for anyone testing on these PDFs.
Good: editing in a viewport (the chip and Done), picking model items through the paper, notes tied to their viewport,
the title block's Project cell now naming the building.

### 8.5 Editing helpers

1F plan: a desk block selected (corner grips), R (turn 90°), a corner grip dragged; outlet 1-021 › Use as default,
then Undo. (Renumber and Copy outlets onto desks: Round 7.)

**Found:**
14. Turning (or moving) a desk leaves the outlet on it where it was — it ends up on the desk's edge. Outlets aren't tied
    to the desk they sit on — open (a design question: should an outlet placed on a desk move / turn with it?).
15. A block's corner grip scaled about the block's insert point: both sides moved, the block grew by twice the drag
    (a 30 px pull gave × 2.05). → it scales about the opposite corner, which stays put — built (`insertScaleHandles`).
16. Undo of Use as default puts the project's defaults back, but the tool bar's Usage / Mount stay as adopted until the
    page is reloaded — open (minor).
Good: R / Shift+R turn the selection and Properties shows the angle; Use as default says what it keeps (usage, mount,
ports, cable type).
