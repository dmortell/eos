# cad backlog

**Status (2026-11-24):** the open cad work, numbered in the Consolidated todo list below; the User picks each batch by
number. Built items are ticked here and logged in `../phases/phase8.md`; the numbers stay fixed. The older detailed
entries that were built, closed or superseded (and Review 2, Q1–Q77) are in `../archive/backlog-done.md`; the
original 555-id map is `../archive/plan-sources.md`.

**Tags:** **P1** = a bug / data risk or a core job cad can't do; **P2** = useful; **P3** = nice to have (waits until
the P1 / P2 work is done — User 2026-10-07). **S** ≤ ~60 lines, **M** ~60–250, **L** > 250. ⚡ = quick win.

## Consolidated todo list (2026-11-22)

Every open todo from the app's docs in one numbered list. Sources: this backlog, `later.md`, `decisions.md`,
`outside-review.md`, `workflow-walkthrough.md`, `sheets-organising.md`, `design-log.md`, plus the docs outside cad (root
`*.md`, `docs/`, `src/routes/**/*.md`). Tick by number; the numbers stay fixed (don't renumber when one is done). ⚡ =
suggested quick win. A–E are to work on; F is accounted for only. "Notes for open items" at the end holds 3's full
review; 8's is in `outside-review.md`.

### A. Open backlog
- [x] **1. Redo the tool icon buttons** — closed 2026-11-23 (User: keep the tool buttons as they are).
- [x] **2. Tool strip options 1 / 3** — closed 2026-11-23 (User: close the tool-button reviews).
- [ ] **3. Menus options 1 / 3** — review still open (User 2026-11-23: keep the menu review open); plus a Plan / Elevation / Section / Riser switch in View, and where Rename / Delete level go. P3
- [x] **4. Hover a device: its border only** — done 2026-11-22 (`phase8.md`).
- [x] **5. Tooltips: wait once, then instant** — done 2026-11-22 (`phase8.md`).
- [x] **6. Containment between 33F 3303 and 33F 3307** — DONE 2026-11-23: whole-floor plan 33F (33F-Model.pdf), 3303 and 3307 placed, a high-level conduit on 33F joins them; the 24 P3A → 3307-R2 backbones route at 71 m (`phase8.md`). Was:  — 24 backbone cables have "No route"; plan first (entry below). P2 · M? **Proposal 2026-11-22 (User: a whole-floor PDF, mark where 3303 and 3307 are, draw the runs between): see the reply that day — place each area plan on a whole-floor plan by two point pairs, show the areas ghosted there, draw the link run on the whole floor, routing joins the three through the placements.**
- [x] **7. (closed 2026-11-22, User: not needed) Data: patch the 33IDF2 TVs to 33IDF1** (Journey, 33F 3303 — User 2026-11-22: it means 33F’s IDF2; the 30F IDF2 room was deleted that day) — confirm the ports first.
- [ ] **8. Outside review and markup** — ready to build (20 answered 2026-11-23): Release › Import review… reads a
  reviewer's marked-up release PDF (anyone on the team may import) → an overlay per reviewer on each sheet, printable
  (a toggle); its comments wait in an inbox, each accepted (→ a Log change) or dismissed; a verdict OK / Revise per
  sheet; no guest accounts — reviews always come back as PDFs by email. P? · L
- [x] **9. (done 2026-11-22) Tidy this backlog's "Suggested order"** — still lists built / moved work (cord workflow, Batch 4).

- [x] **52. A selected box hides its own border color** — done 2026-11-22: a halo under the item (`phase8.md`) (User 2026-11-22 todo) — with a rectangle (or other shape)
  selected, the blue selection outline covers its border, so a Color / line type change in Properties can't be seen
  until it's deselected. E.g. draw the selection offset outside the shape, or as a thin dashed halo, leaving the
  border's own color showing. P2 · S
- [ ] **52b. Selection halo on other kinds** (User 2026-11-23: "check if we need to fix other shapes / lines / 3D items
  too") — check circles, arcs, polygons, plain lines, runs, walls, boxes / 3D items, text and blocks in plan,
  elevation and sheet: wherever the selection still hides the item's own color / line type, use the same halo.
- [ ] **53. Data: a fibre tie between 33IDF1 and 33IDF2** (Journey, 33F 3303; User 2026-11-22 todo) — a fibre
  enclosure / panel in each room, linked (Link to…, a tie within the floor); which racks, U, core count and connector
  to confirm with the User first.

### B. Smaller cad bugs and nits (walkthrough)
- [x] **10. Riser view Floors range** (already built 2026-10-21: a floor list with Shift-click ranges) — only floors with a model are listed, so you can't narrow to e.g. 1F–10F with Hide empty off (`workflow-walkthrough.md:792`).
- [x] **11. New sheet from an empty floor's plan** (already built, e56a5cad) gets a thin 283 × 105 mm viewport (`workflow-walkthrough.md:687`).
- [x] **12. Release name doubled** (fixed in e56a5cad; backup label 2026-11-22) — typing "03 …" gives "Release 03 03 …" in the file name (`workflow-walkthrough.md:703`).
- [x] **13. (done 2026-11-22) Use as default, then Undo** — the tool bar's Usage / Mount stay adopted until a reload (`workflow-walkthrough.md:748`).
- [x] **14. Hidden layers still snap on the plan** (done 2026-11-22) — no layer filter in `editor/snap.ts` (`layers.md:12`).
- [x] **15. (closed 2026-11-22, User: the rack elevations look fine) Rack-row viewport frame too loose** — takes in slab / ceiling lines; a tighter frame fits two rows at one scale (`workflow-walkthrough.md:865`).
- [x] **16. UX nits** (all done 2026-11-24) (`workflow-walkthrough.md:763-960`):
  - [x] 16a. Fill rates greyed in elevation (fill rates in elevations built, e56a5cad)
  - [x] 16b. (done 2026-11-22) Backups Delete buttons sit next to the question's Delete
  - [x] 16c. (already built 2026-10-15: CSL / ceiling / FFL / FSL in every elevation and section — checked on Workflow test, Section IDF 1 A) Section of a room with no walls shows FFL only
  - [x] 16d. (already built 2026-10-17: cut in the middle, the end shown) Tab titles truncated
  - [x] 16e. (done 2026-11-24: the interior-elevation symbol, under the name) Room-elevation marker over the room name
  - [x] 16f. (already fixed: the tool hint gives way to the bulk one) Double hint in bulk patch
  - [x] 16g. (done: the other pane outlines since Round 10; the tip’s halo 2026-11-22) Hover outline only in the active pane; + tip has no halo
- [ ] **17. Data on live projects** — 30F IDF1 "48P Rack Tie" panels have no cables; 81 import notes on Journey to clear; 161 LR import notes to review; Tourney tidy-up (`later.md:75-76`, `phase8.md:4306, 4421`). **User 2026-11-23:** review LR's 161 import notes and report (no changes); leave the rest for now.
- [ ] **18. Port loupe / magnifier** for tiny ports (deferred).
- [x] **19. (done 2026-11-22) Stale status** — README status line (2026-10-03); tick "Change log" in `decisions.md:131` (edit history built 2026-10-17).

### C. Decisions for the User
Answered 2026-11-23 (User). A decided item that needs building has a "→ build" line; the build is its own todo.
- [x] **20. Outside review** — anyone on the team imports; comments go to an inbox, accepted one by one (→ Log
  change); verdict per sheet; the overlay can print; no guest accounts (PDFs by email). → build: 8.
- [x] **21. Racks vs cabinets** — one kind with options: frame kinds only (2-post / 4-post / VCM / desk / shelf) with
  "Doors" (front / rear) and "Enclosed" (side panels + roof); existing cabinets migrate to 4-post + enclosed + doors.
  → build: 54.
- [x] **22. Rack BOM products** — count custom products too (templates with a product), not only the Panduit seed. → build: 55.
- [x] **23. Zones on one floor** — skipped here: being built in another session (see 6, the whole-floor plan).
- [x] **24. Import Pages models (7.4)?** — CLOSED 2026-11-24 (User: "we don’t need to import any more models"; counts in 56).
- [x] **25. Plan Z-cuts** — no band; use the low / high layers.
- [x] **26. Power, AV, security, EMS** — no separate models: the same outlets, runs, routes, fill and rendering code as
  structured cabling, but each kept as its own CATEGORY (separate contractors) with its own socket types and cable
  types, and separable in drawings (layers / filters) and BOMs. Needed only now and then. → build: 57.
- [x] **27. DRAFT stamp** — none.
- [x] **28. Deleting / voiding a release** — the newest release can be deleted (its revisions come off the sheets, its
  frozen copies go, the PDF stays in Uploads); older ones can only be marked void. → build: 58.
- [x] **29. A list of all views** — Ctrl+K also finds viewports (with their sheet); no viewport rotation. → build: 59.
- [x] **30. Revisions per sheet** — as today (each sheet steps its own revision).
- [x] **31. Depth band** — drop it (rely on sections). → build: 60.
- [x] **32. Legacy tools** — not yet: no deleting until cad is feature complete.

### C2. Built from the decisions (2026-11-23)
- [ ] **54. Racks and cabinets as one kind** (21) — Doors / Enclosed options, migration of cabinet racks, BOM names. P3 · M
- [x] **55. Rack BOM counts custom products** (22) — done 2026-11-24 (`phase8.md`). P3 · S
- [x] **56. Count what Pages models hold per project** (24) — done 2026-11-24: counts in `phase8.md`; 24 closed (no more model imports). P3 · S
- [x] **57. Cabling categories: power, AV, security, EMS** (26) — done 2026-11-24 (`phase8.md`) — a category on usages / cable types / socket types;
  draw, filter (layers) and BOM by category; same routing and fill code. P2 · M
- [ ] **58. Delete the newest release, void older ones** (28). P3 · S–M
- [x] **59. Ctrl+K finds viewports** (29) — already built: the search shows matching viewports under their sheet (checked 2026-11-24). P3 · S
  **Findings (2026-11-24, for reference):** the Navigator tree (`domain/navTree.ts`) gives every sheet a child row per
  viewport — label = the viewport's own label, else its view's name (`viewName`: "1F plan", "1F · 33IDF2 racks · Row A",
  "Section IDF2 A" …), detail = its scale ("1:20"). The search box (Ctrl+K) filters label + detail (`filterTree`) and
  keeps each match's parents, so a viewport shows under its sheet and that sheet's place / category group. A click opens
  the VIEW (the model view the viewport shows), not the sheet. Checked on Test Project: "racks" lists S006 › "1F ·
  33IDF2 racks · Row A", S002 › "4F · Server room B racks" …; "1:50" found nothing (no viewport at 1:50 there).
  Not there (not asked for): Enter on a viewport row opening its sheet with the viewport selected; a sheet's number in
  the viewport row itself (it's in the parent row).
- [x] **60. Drop the depth band** (31) — done 2026-11-24 (`phase8.md`) — remove its UI and per-view setting; elevations / sections take depth from sections. P3 · S–M

### D. Features not yet in cad (from other docs)
- [ ] **33. DXF import** — an uploaded `.dxf` → shapes or an XREF (`pages/todo.md:46`, `kestrel-adoption.md`)
- [x] **34. Ctrl+K command palette and document tabs** — done 2026-11-24: the palette (`phase8.md`); the tabs were already there — Kestrel adoption first picks (`kestrel-adoption.md`)
- [ ] **35. Command line, OFFSET / ARRAY / SCALE / STRETCH, ORTHO / POLAR, rotate grip, group transform box** (`later.md:35-43, 99-100`)
- [ ] **36. Trunk auto-routing** and route length over the graph (`outlets/trunk-implement.md:385`)
- [ ] **37. Whole-project JSON export / import** — check against cad backups (`pages/todo.md:60`)
- [ ] **38. Sheets workflow leftovers** — For review / Approved gate, revert to a release, typed / superseded packages, copy a sheet to another project, drag sheets in the Navigator, nested groups, send a package, all-releases register, sheet-number templates (`sheets-organising.md:244-252`)
- [ ] **39. Port labels readable in print** — callouts or a port schedule in the rack viewport (`elevations-plan.md:744`)
- [ ] **40. Fallback labels for unlabelled panel ports** (`R04-U33-P07`) (`elevations-plan.md:738`)

### E. App-wide and other pages
- [x] **41. Uploads subscribes to the whole global `files` collection** — by design: the list offers other projects’ files to share in (2bbb8405) — per-project query commented out (`routes/projects/[pid]/uploads/+page.svelte:24`, `docs/firestore-structure.md:142`)
- [ ] **42. `deleteFloor` misses patching docs and area outlets docs**; room letters hard-coded A–D (`docs/firestore-structure.md:115-117`)
- [ ] **43. Firestore loose ends** — basement `F-1` ids fail `_F(\d+)`; stray floor `3307` and registry drawings on floors 1 / 200; two drawings stores and two 3D stores; `IssueDoc.status` untyped and unread (`docs/firestore-structure.md:118-145`)
- [ ] **44. Raw `history.pushState`** in frames / outlets / patching / racks pages (or retire with 32)
- [ ] **45. Touch / trackpad pan-zoom in the older tools** — Outlets / Uploads buggy; Frames / Patching / Risers none (`mac-support.md:108-140`)
- [ ] **46. Kanban** (`/tasks`) — testing checklist never ticked; optional: shortcuts, in-column reorder, subtasks, activity log, bulk ops (`dashboard/parts/kanban-implementation-plan.md:482-548`)
- [ ] **47. Survey** — auto compass heading, QR / email share, OCR of labels, photo sync, move under `/projects/[pid]` (`survey/implement.md`, `survey/README.md`)
- [ ] **48. Versioning phase 5** — backfill, audit logging, large-snapshot warning; probably superseded by cad releases / backups (`versioning-implement.md:455`)

### F. Parked or superseded (accounted for, not to work on)
- [ ] **49. cad `later.md`** — RCP, 3D view, riser extras, free fill sections, label check / relabel, prices / quote, Pages / Sheets sheet import (7.2 / 7.3), DXF for every view, and its "not needed" list.
- [ ] **50. Pages (bug-fix only)** — §4A fixes (demo models, per-user layer visibility, save dirty models only), P1 bugs (PEN penetrations, DXF image order, no move ghost on paper); the XP / XE / parity wish-lists (`docs/pages-analysis.md:322`, `pages/todo.md`, `pages/review.md`, `pages/parity-review.md`).
- [ ] **51. Legacy tool docs** — Sheets `_todo`, outlets trunks, risers phase 4, patching, frames, edit3d, drawings page editor, `elevations-plan.md`: mostly rebuilt in cad; what's still missing is in D.

## Notes for open items

- [ ] **3. Menus: review options 1 and 3 later** (User 2026-10-15: "I like all 3, try 2 for now, review the others
  later"). The review found: tools with no menu (Line, Shape, Box, Wall, Opening, Room, Section, Guide, Measure, Move,
  Copy); exports twice (File › Export and Cabling › Schedules; sheet PDFs in File and Sheets; Tables in Window and
  Cabling); File › Export 15 items with this level / all levels pairs; releases in no menu (only the Sheets table);
  Edit had Array / Rotate / Mirror but not Move / Copy; View mixed navigation with the SNAP / OSNAP / GRID toggles and
  can't switch Plan / Elevation / Section / Riser; Rename / Delete this level in Project.
  1. **Tidy in place** — keep the 9 menus; drop the duplicates (exports in File › Export only), level pairs as a
     submenu, Release… / Releases / Packages into Sheets, Move / Copy into Edit, a Drafting submenu in View.
  2. **CAD-style — BUILT 2026-10-15** (`phase8.md`): File · Edit · View · Draw · Modify · Annotate · Cabling ·
     **Drawings** (User's name) · Project · Window · Help, with option 1's tidy-ups.
  3. **Workflow-based** — File · Edit · View · Building (walls, openings, rooms, sections, floors) · Cabling (outlets,
     runs, racks, devices, allocation, patching) · Drawings · Reports (every Excel / PDF / DXF) · Window · Help:
     follows the walkthrough stages, friendlier to non-CAD users, but splits drawing tools by trade.
  Still open whichever stays: a Plan / Elevation / Section / Riser switch in View; where Rename / Delete this level
  belong (Navigator only?). **P3 · S–M**.
