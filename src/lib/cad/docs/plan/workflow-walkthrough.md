# A project from scratch in cad: workflow walkthrough

**Status:** desk study, 2026-10-14. It was written from the code and the Help, not from use. Part 2, a live run on a
new project with Dave's floorplans, comes next and will add counts and timings. Nothing here is decided. Fixes Dave
agrees to go into `backlog.md`.

Dave's brief: start from a new project; then
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
1. Upload the new PDF.
2. Calibrate it again from nothing.
3. Re-pick it on every floor that used the old one.
4. Find what moved by eye. There is no overlay, compare or "what changed" aid.
5. Move outlets, desks and runs one by one or by marquee.
6. Sheets show the new plan at once. Issued revisions keep theirs: frozen copies plus the as-issued floorplan cache.

**Bottlenecks:**
- **B8 No "replace with a new revision".** It should keep origin, scale, crop and masks and swap the file on every
  floor in one step. Today it is a fresh upload and calibration each time.
- **B9 No compare.** There is no old/new overlay in two colors, no toggle and no blink, so changes are found by eye.
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
| 1 | **Replace floorplan with a new revision**: keep calibration, crop and masks; swap it on every floor; record the floorplan revision with the issue. | B8, B11 | M |
| 2 | **Floorplan compare**: old / new overlay in two colors, plus a toggle. Also works for other trades' drawings. | B9, B16 | M |
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

## Part 2: live run (next)

On a new project ("Workflow test" unless Dave names it), using Dave's two floorplans from a smaller project:
1. Go through stages 1 → 10 plus a 2b round with a changed floorplan.
2. Count clicks, dialogs and retyped values per stage; note dead ends, wrong defaults and anything a contractor or
   client would ask for.
3. Re-rank the table above with the counts.

Writes only to the new project (and Test Project). Uploads go to UploadThing as usual.
