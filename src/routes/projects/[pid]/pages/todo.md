# Pages tool — TODO / roadmap

Working notes for the Kestrel-style **Pages** workspace mockup
(`src/routes/projects/[pid]/pages/`). Self-contained mock today (local runes
state, no Firestore). This file tracks what's left to reach a real tool.

> **Doc map (R11):** `README.md` = the file map + coordinate reference · `review.md` = the standing code
> review (§0a = done tracker) · `CHANGELOG.md` = curated milestones · `model-plan.md` = the
> 3D-engine port. This file keeps **open** items + decisions only; done items move to `CHANGELOG.md`
> (the old done-log is there under "Earlier work") — the full record is `git log`.

Legend: `[ ]` todo · `[~]` partial · `[x]` done · **(P1)** near-term · **(P2)**
after UX settles · **(P3)** later / needs design. `◧ decide` = needs your pick.

Kestrel code is in M:\dev\KestrelCad2

---

## 0. Bugs / quick wins  (P1)
### Reported 2026-09-27 (User)
- [ ] **REMINDER — finish importing the other tools' drawings into Pages** (Sheets sheets, register drawings, Outlets /
  Racks / Risers / Frames / Patching views → Pages sheets / models), so those tools can be DECOMMISSIONED and their
  leaves removed from the tree (see `tree-views-plan.md` §6). Today: Phase 8 imports exist per leaf (Import into Pages,
  risers into the building model); list what's left per tool, bulk-import, then hide the old leaves. (M)
- [ ] **Look at ConduitCAD** — https://wieslawsoltes.github.io/ConduitCAD/ — its 3D view and its MOBILE mode (touch
  UI) for ideas (like the OpenCad scan: note what's worth taking). (S)
- [ ] **Tree views follow-ups** (phases 1–3 DONE → CHANGELOG round 21): folder colours; tags on MODELS; offer the
  suggested kind / tags when a sheet is CREATED (today only in Properties); plan §6 "Show legacy tool drawings" toggle
  (old-tool drawings show only in By place). Test data left on Test Project: view "Test view" (folders), "Elevations"
  typed elevation + tag high-level, "4F floorplan" typed plan. (S–M)
- [ ] **DXF export in LibreCAD** (User tested): (a) the background image draws OVER the other layers (LibreCAD ignores
  entity order — try a SORTENTSTABLE / put images on a layer that sorts first); (b) outlet labels (block ATTRIBs) don't
  show — LibreCAD doesn't display attributes; option: also write the values as TEXT on a hidden-by-default layer.
  TrueView shows both fine. (S–M)
- [ ] **Editing-merge follow-ups** (phases 0–4 + multi-frame props / clipboard + mixed props DONE → CHANGELOG rounds
  15–18, `editing-merge-plan.md`): Ctrl-drag copy of a conduit keeps attachments only between copied items. Phase 5
  (paper annotations) optional. (S)
- [ ] **Live preview (ghost) for MOVE / COPY on paper** — the paper command target returns frame rects from `preview`,
  but nothing draws them: PaperPage should draw a pick's ghost like a viewport does. (S)
- [ ] **Change a viewport's MODEL** (User 2026-09-27) — Properties › VIEWPORT › Source: pick another model (another
  floor / zone / the building) for an existing frame, keeping its frame, scale and view direction (re-fit optional).
  NOTE: a basic Source select ALREADY exists (FrameProps, shown when the project has 2+ models) — what's open is
  checking it keeps the view sensibly (re-fit?), and the versions question below.
  Question: should this tie into VERSIONS / REVISIONS — a viewport showing a model at a saved version (frozen), vs the
  live model? Proposal: Source = model + "Live / Version ▾" (a frozen snapshot for issued sheets). (M)
- [ ] **DXF import** (User: "similar for dxf files") — nothing reads DXF today (export only; `src/lib/dev/dxfVerify.ts`
  wants `dxf-parser`, not installed). Plan: (1) Uploads accepts `.dxf` (stores the file + a `files` doc); (2) Insert ›
  From Uploads… lists it; (3) parse (dxf-parser) → a BLOCK-like group of Pages shapes (lines / polylines / arcs /
  circles / text / inserts, layers mapped or prefixed "DXF-"), units from $INSUNITS → mm, placed at the origin or by a
  picked base point; or (3b) an XREF-style reference shape that renders the DXF live (re-reads on change) — Replace…
  then works like a PDF. Decide 3 vs 3b. (M–L)
- [ ] **PEN (penetrations) doesn't work** (User) — the tool button + the command-list entry are removed; the script
  (`cmdScripts.ts` pen) and the penetration block stay. Fix and bring back, or delete the code. (S)

### OpenCad picks (User 2026-09-26) — from `opencad-diff.md` (OpenCad = `M:\dev\autocad`)
**Import / export**
- [ ] (LOW) **O13 DXF import** — LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC / ELLIPSE / SPLINE / TEXT / MTEXT / INSERT, unit-aware
  ($INSUNITS), blocks exploded or kept; OpenCad `src/lib/dxfImport.ts` (dxf-parser). Into a model as shapes on their DXF
  layers, or as an underlay. (L)
- [ ] **O14 Whole-project export / import as a file** (a portable JSON: models, sheets, places, blocks) — backup /
  migration / sharing outside Firestore; OpenCad `.opencad.json`. (M)
- [ ] **DXF export leftovers** (O15 / O16 / O17 done — CHANGELOG round 17): export shape colours; greyscale images
  ignored by older Safari; not yet opened in AutoCAD itself (checked with ezdxf).
**Takeoff / data**
- [ ] (LOW) **O18 Cable takeoff + pull schedule** — symbol counts by kind, route lengths by service / containment (+ drops
  and slack), penetration counts, rack counts, and each outlet → rack cable with its length; live panel + CSV
  (OpenCad `src/lib/takeoff.ts` `takeoffCsv`). (L)
- [ ] (LOW) **O20 Periodic local snapshots** (User 2026-09-27: "that may be enough" instead of the op-based history
  below) — every ≥ 5 min keep a snapshot of the model (last ~12) in the browser, restorable from a list,
  independent of undo (OpenCad `src/lib/snapshots.ts`). NOT implemented yet: today every edit saves to Firestore
  (debounced ~0.5 s, `store/saver.ts`), so a refresh keeps the drawing but LOSES the undo history (it is memory only). (M)
- [ ] **Incremental (op-based) history** instead of full copies — undo steps store the change (the edited objects'
  before / after, or an op) rather than a whole-model snapshot; pairs with the backend item in §12. (M–L)
  Consider what happens on a PAGE REFRESH: the history is in memory only (lost on reload) — decide whether undo
  should survive a refresh (persist the recent steps per doc, e.g. IndexedDB) or whether O20's snapshots are enough.
**Drawing / editing**
- [ ] **O5 STRAIGHTEN** — square selected walls / lines to horizontal / vertical and re-weld their corners and T
  junctions (OpenCad `editor.svelte.ts straightenSelection`); a clean-up after tracing an underlay / DXF. (S–M)
- [ ] (LOW) **O10 Underlay dark-pixel snap** — snap to the nearest dark pixel of a PDF / image underlay within a radius
  (OpenCad `src/lib/underlaySnap.ts`), a toggle next to OSNAP; for tracing floorplans. (M)
- [ ] **O12 Named views saved in the model** (not localStorage), so they follow the drawing to other devices /
  people. (S)
- [ ] **HIGH — Named shape GROUPS in a library** (vs blocks; User 2026-09-27: HIGH) — think it through: a saved group that is COPIED into the drawing
  as ordinary shapes / objects (resize and edit freely after placing — custom racks, openings, furniture), vs a block
  (an instance of a shared definition). Library UI, naming, thumbnails, 2D + 3D content, per-project vs global. (M)
- [ ] **O1b + test**: EOS openings are free boxes (User prefers that). Test an opening drawn THINNER than the wall, or
  off-centre, or partly outside it, in plan / elevation / 3D, and compare with OpenCad's on-wall openings; fix what
  doesn't read as a hole. Maybe add OpenCad's click-a-wall placement + slide-along-the-wall grip as an option. (S–M)
- [ ] **Vertical (top-bottom) holes/openings** (User 2026-09-27) — today an opening cuts a box along one horizontal
  axis (front-back or left-right); support a vertical opening too, cutting top-to-bottom (e.g. a floor/ceiling
  penetration through a box/slab), same panel-split approach as the existing horizontal cut. Needs: an axis field
  on the opening (or auto-pick from its own orientation/rotation), the panel-cut logic extended to split along Z,
  and correct read in plan (a vertical hole shows as an outline, not a cut edge) / elevation / 3D. (S–M)
**Rendering**
- [~] **Racks like OpenCad** (2D + 3D) — 2D DONE 2026-09-27 (X + front line 40 mm out, CHANGELOG round 17); [ ] the
  3D rack look (OpenCad `scene/builders.ts` 'rack'). (S–M)
- [ ] **Section follow-ups** (sections at any angle + elevation tool, phases 1–6 DONE → CHANGELOG rounds 17–19): a
  wall CROSSING the cut line is kept whole (the part in front of the cut also hides things — cut it at the line);
  drawing walls / trunks / guides in an angled view is still off; plan views keep the old painted hidden-line render;
  with Hidden lines = Hide an elevation doesn't draw the racks' / objects' LABELS (R311 …) that Show draws. (S–M)
- [ ] **HIGH — Edit objects + shapes IN the 3D view** (User 2026-09-27: a callout to a ceiling-mounted TV, added in the
  floorplan, points its leader at the floor in 3D). Select + move / grip-edit 3D objects and 2D shapes in iso /
  perspective, incl. callout leaders — drag a leader tip onto a 3D face and it takes that point's height. First step
  DONE (round 18): plan shapes have a height `Ent.z` (Properties › Z; drag up / down in an elevation) and 3D draws a
  callout at it. Open: picking a 3D point (face hit → x, y, z) for the leader tip; the tip's own z (the box may sit
  elsewhere); moving / grips in 3D; notes / plain text still use the old iso path (first line, fixed size — one line
  in `isoFacing`). (M–L)
- [ ] (LOW, User 2026-09-27) **Better hidden-line / draw order in 3D** — EOS sorts faces by their centre depth, which sometimes paints the
  wrong one on top (OpenCad uses a real depth buffer, Three.js). Options: split faces that straddle, BSP / pairwise
  overlap tests, or a canvas / WebGL depth pass for the iso view. (M–L)
**Navigation / keys**
- [ ] **More function keys** — only ones browsers leave alone (not F1 in some, F3 find, F5 reload, F6 address bar,
  F7 caret browsing in Chrome, F11 fullscreen, F12 devtools). DONE so far: F1 help, F8 ORTHO, F9 SNAP, F10 POLAR (Help lists
  them). Candidates: F2 (e.g. the command history), Shift / Alt + F-keys for OSNAP / GRID / LWT. (S)
**Grid**
**Printing**
- [ ] **Check printing in User's older apps (e.g. inv2026)** — paper size + orientation worked there; compare and fix
  Pages' print (@page size / landscape). (S)
**Low priority**
- [ ] (LOW) **O6 Isolate selection** + Show all. (S)
- [ ] (LOW) **O7 Legend by symbol / block kind** (how many data vs power outlets), besides by layer. (S)
- [ ] (LOW) **O8 Perpendicular snap** while drawing. (S)
- [ ] (LOW) **O11 Quad view** — plan + 3D + front + side at once, framed on the selection. (M)
- [ ] (LOW) **Nudge by the grid step** — arrow keys move by the SNAP step (not 1 mm); Shift × 10 (OpenCad). (S)
- [ ] (LOW) **Ctrl+drag in 3D moves vertically** (height only) — OpenCad. (S–M)
- [ ] (LOW) **Alt+click picks one shape inside a group; repeated Alt+clicks cycle overlapping shapes** — OpenCad. (S–M)
- [ ] (LOW) **OpenCad letter aliases** where free (Q = PEN, G = MATCHPROP, X = SECTION, B = box, N = window, O = door) — flag clashes with AutoCAD aliases. (S)
### Command line — commands NOT yet built (pick list, 2026-09-25)
Built so far: see CHANGELOG.md "Command line" and "Command line, round 2" (the ticked items moved there).
Tick the ones you want. Size: S = under half a day, M = one to two days, L = multi-day. [K] = in Kestrel's list.
**Interaction upgrades to what exists**
- [ ] (LOW) **Keypad coordinate entry** — accept `100..200` as `100,200`, since the number pad has no comma, so points
  can be typed on the keypad alone. Parse `..` as the X/Y separator in `parseCoord` (ui/commands.ts); a single `.`
  is still a decimal point (`100.5..200` = 100.5,200). Also allow the keypad `+` / `-` without zooming while the
  command line has text. Consider a keypad-friendly prefix for relative input in place of `@` (e.g. a leading `*`
  or `/`). (S)
**Draw**
- [ ] (LOW) **SPLINE** — a new entity. [K] (M)
- [ ] (LOW) **POINT** — a point marker. [K] (S)
- [~] PARTLY DONE 2026-09-26 (CHANGELOG round 10: 2D line patterns) — **HATCH** — fill a closed boundary with a pattern (a pattern library, and DXF HATCH). [K] (L)
- [ ] (LOW) **Viewport zoom ↔ scale** (User 2026-09-25): zooming inside a sheet viewport should change its SCALE (the label
  shown = what prints), not a hidden content zoom. Concerns: (1) scales are usually standard (1:50 / 1:100 …) — snap
  to them, or allow any 1:N while zooming and round on release? (2) text / dims / symbols are annotative (paper-sized),
  so they stay the same size while the geometry scales — correct CAD behaviour but a visible change from today;
  (3) existing frames with view.zoom ≠ 1 need a one-time fold into their scale; (4) model-space tabs have no paper
  scale, so there zoom stays a plain view zoom. (M)
- [ ] **Outlet → rack link in Properties** (User 2026-09-26): an outlet's Properties can pick the rack it's cabled to
  (a rack id — any rack object in the project), shown on the outlet, carried to schedules / the E8 allocation. (S–M)
- [ ] (LOW) **Outlet / rack / trunk LISTS** (E10) — wanted once there are frame + patching viewports. (M)
- [ ] **Faster PDF rendering** (User 2026-09-26): floorplan PDFs render noticeably slower than they used to.
  Profile first (pdf.js worker running? the page re-rendered on every pan / zoom or view switch? cached bitmaps
  thrown away? several viewports each rendering the same page? a big render scale?). Likely fixes: a per-file,
  per-page bitmap cache shared by viewports and tabs; render at stepped scales and reuse the nearest one while
  zooming; cancel stale render tasks; check `git log` on the PdfState / underlay code for the change that slowed it. (M)
- [ ] (LOW) **TABLE** (a full table editor) — a grid of text cells on a sheet. (L) Open question: a NOTE's markdown table already covers
  simple schedules (Excel paste → cells). A real TABLE would add: cell grid editing (Tab / arrows), column widths
  and row heights by drag, merged cells, per-cell alignment / bold, and fields linked to data (e.g. a live outlet
  schedule). Lean: build it only when a live schedule is wanted; until then the markdown table is enough.
**Modify**
- [ ] (LOW) **TRIM / EXTEND / BREAK on arcs, rects and ellipses** — today these (and TRIM's cutting target) work on lines /
  polylines only; OFFSET and LENGTHEN already handle arcs. (M)
**Inquiry**
- [ ] (LOW) **ID** — the coordinates of a point. (S)
- [ ] (LOW) **LIST** — the properties of the selection as text. (S)
**Layers / selection**
- [ ] (LOW) **PURGE / AUDIT for LAYERS** — PURGE unused layers; AUDIT dangling layer ids. (S)
**View / display**
- [ ] **WIREFRAME / SHADED / SHADEDGES / XRAY** — visual styles for the 3D viewport. [K] (M)
- [ ] (LOW) **REGEN**, and **THEME** (light / dark). [K] (S) — "not needed" (User 2026-09-26)
**3D (Kestrel solids — only if Pages needs them)**
- [ ] **BOX / CYLINDER / SPHERE / CONE / TORUS / EXTRUDE / REVOLVE / UNION / SUBTRACT / INTERSECT / TRANSFORM3D**
  — generic solids. Pages has typed model objects (walls, boxes, conduits) instead; probably skip. [K] (L)
**File / project**
- [ ] (LOW) **SVGOUT / PNGOUT of a whole SHEET** (paper + title block + every viewport). Today they export the active
  viewport; a sheet goes to PDF through print. Images that aren't data: URLs come out blank in the PNG. (M)
- [ ] **DWGOUT** — Kestrel has a DWG codec. [K] (L)
- [ ] (LOW) **UNITS** — display units (mm / m) and precision. [K] (S–M)
- [ ] (LATER) **XREF / ATTACH** — attach another model or DXF as an underlay. (L)

### Parity pick-list — every item NOT yet built (from parity-review.md, 2026-09-25)
Size: S = under half a day, M = one to two days, L = multi-day. User's notes in quotes.
- [ ] (LOW) **A3** Checked / Approved / Client per-sheet fields in the title block (S).
- [ ] (LOW) **B9** A Tools menu linking to the other project tools (S).
- [ ] **D11** Single-key tool hotkeys (T text, L line, R rect …) (S). "no — conflicts with the command line; maybe
  Alt+key." → covered by command-line aliases (below).
- [ ] (LOW) **D12** Right-click context menu (group, ungroup, duplicate, copy, paste, delete, auto-number, conduit items)
  (M). "low priority".
- [ ] **E4** Real outlet fields (M) — "low priority" (User 2026-09-25):
  - level (low / high);
  - cable type;
  - usage as a choice list that recolours the symbol;
  - the import keeps them.
- [ ] **E6** Single-key property shortcuts (1–9 ports, l / h level, c / s / m cable, w / f / b mount) (S). "only if no conflict with the command line".
- [ ] (LOW) **E10** Object list in the sidebar (outlets / conduits): sort, select, per-item show / hide, counts (M). "low
  priority".
- [ ] (LOW) **F2** Pipe inner vs outer diameter (M).
- [ ] (LOW) **F4 follow-up**: split / disconnect a node from the context menu (D12) too — Alt-drag does it today (CHANGELOG).
- [ ] **F7** Trunk rooms restriction (A–D) (S). "I don't understand this" — from the Outlets tool: a trunk tagged
  with the rooms (server rooms A–D) it may carry cables to; a routing filter.
- [ ] **F11** Automatic secondary routes (outlet → nearest same-level trunk, coloured by server room) (L). "low
  priority — for checking outlets reach the right trunk / rack, and cable-length estimates for the BOM".
- [ ] **G1** Import rackPlacements onto floor models as linked rack objects (M). "let me rethink this".
- [ ] **G2** Rack palette: unplaced racks by room, drag onto the plan, "New rack here", adopt the row layout
  (M–L). "rethink this".
- [ ] (LOW) **G3** Rack properties write back to the racks doc (U, W × D, type, maker, model, rotation) (M). "maybe".
- [ ] **Riser cable media + counts per hop** (from H1) — a riser cable run carries its media (copper / fibre / …) and
  cable count per hop (segment), shown in Properties and labelled on the drawing. (M)
- [ ] **H2** Automatic cable-lane layout (M). "already implemented?" — the Risers import lays cables out in lanes;
  check whether an editable re-layout in Pages is still wanted.
- [ ] **I3** Floating elevation preview of the plan selection (M). "don't need now that we have split tabs".
- [ ] **J3** Outlet / trunk low vs high layers on import (S). "low priority".
- [ ] (LOW, User 2026-09-27) **J4** A project-wide layer list shared across models (L, a big model change).

### Reported 2026-09-25 (User) — after the L / M parity batch
- [ ] (LOW) **Title-block annotations per sheet.** The template is shared by every sheet, but some sheets need extra
  text (a note, a stamp, a "preliminary" line).
  - Options:
    - (a) per-sheet extra fields on the sheet doc, rendered after the template's;
    - (b) free annotations placed anywhere on the paper (paper-space text / shapes);
    - (c) the title block as a viewport-like frame of its own.
  - (c) could simplify things: the block becomes paper-space content, and one sheet can add shapes on top.
  - It costs a paper-space entity layer (which we don't have yet) plus print / DXF support.
  - Lean: (b) paper-space annotations, which also cover stamps and revision clouds on the paper.
- [ ] (LOW) **Mitering at nodes with 3+ segments** (T / cross junctions of walls / conduits): review how the swept
  profiles join. Today each pair is mitred, which can leave overlaps / gaps at a branch.
- [ ] (LOW) **Help follow-ups** (the Help dialog is done — CHANGELOG): keep its "How do I…" list (`parts/HelpDialog.svelte`)
  current as features land; maybe context help (a ? next to a Properties section opens its entry).
- [ ] **Test rack rows live** (G4 / E8): import a rack row, edit devices, allocate outlets to a panel. Test Project
  has no rack rows; use a copy of a real project.
- [ ] (LOW) **Image / PDF crop across views:** check whether cropping an image or PDF in one viewport changes every other
  view of it. Today crop is on the shape, so yes. Decide whether a per-viewport crop is needed (like VP freeze).
- [ ] **Look at the IFC format for drawings** (User 2026-09-25). Candidate uses:
  - import / export of the building model (storeys, walls, openings, rooms, cable trays / conduits, racks as IfcFurnishing);
  - an exchange path to Revit / ArchiCAD alongside DXF (C1).
  - Check first: web-ifc (WASM) for parsing / writing in the browser; IFC4 entities for storeys (IfcBuildingStorey), cable carriers (IfcCableCarrierSegment) and outlets (IfcOutlet); what our Model / Obj shapes would need to round-trip.

### Code review follow-ups (see `review.md`, 2026-09-20)
Still open from the review (the fixed items are in CHANGELOG, "Earlier work"):

- [ ] (LOW) review leftovers not confirmed done (User 2026-09-27: the rest of §2.3 / §4.1 / §4.3 / §2.8 / §6 were
  checked and closed — B11, R1, R5, B18 / B19, R4, B13): §2.8 "z0 clamp mismatch"; §6 unused CSS (a11y: its own item).

Suggested order in review.md §7.

### Reported 2026-09-24 (User) — parity reviews  ◧ decide
- [ ] **Title block comparison:** compare the Pages title block (phase 5: `titleBlock.ts`, per-project
  template) with the title blocks in the other tools (Sheets, and any others that print one). List every
  difference (fields, layout, logo, revision table, auto-filled values, editing), then User picks which to
  implement.
- [ ] **Sheets + Outlets functionality scan:** a detailed scan of what the Sheets tool and the Outlets tool
  can do, listing every feature Pages lacks or does differently, then User picks which to implement.
  (Supersedes the partial Sheets lists in §1a / §2a once done.)

### Building model / riser drawings — follow-ups (2026-09-24)
- [ ] **Building canvas** ◧ decide — what the canvas shows when a BUILDING place is selected (ideas, 2026-09-24):
  - **Location map**: OpenStreetMap tiles (free, no key) + Nominatim geocoding of the project address; a
    draggable pin to fix the GPS point; optional north arrow + sun path.
  - **3D massing / iso** of the building model, with each floor model (walls, trunks) stacked at its storey
    height — builds on the iso engine; later the orbit camera.
  - **Stacking plan**: one bar per floor, coloured by zone / tenant, with server rooms, outlet / port counts
    and drawings per floor; click a floor to open it.
  - **Riser summary**: cable runs with lengths (segment L), ladders, fill.
  - **Dashboard tiles**: floors, outlets, racks, open issues, the latest issued revision.
  - (Suggested first: stacking plan + a small location map.)

### Reported 2026-09-22 (User)
Open:

### Reported 2026-09-21 (User) — batch 6
(Done items → CHANGELOG, "Earlier work".)
- **Decision (frame schema ≈ model-shape schema):** User — viewport frames in a page model, though
  they carry special draw/content-management behaviour, "should be practically identical to shapes
  in other models in terms of schema." Fold into the **page-MODEL object** work (§2): make a frame
  just another model entity (id/layer/groupId + geometry) with a `viewport` role, rather than the
  bespoke `SheetFrame` type. No objection seen.
- **Decision (seeding):** OK to seed a default full-bleed viewport on new page creation, and equally
  OK to create pages with NO viewport and let the user draw one. Keep current seed-on-first-measure
  for now; revisit when the page-model object lands.

### Reported 2026-09-21 (User) — batch 5
- [ ] **3D (iso) view:** entity flats (lines/rects) show no depth ordering vs the model.
- [ ] (LOW) **Print orientation**: add a **one-time in-app hint** telling the user how to get correct
  orientation to PDF (Ctrl-P → More settings → Print using system dialog → orientation). See §10.

### 3D model editing follow-ups (User, 2026-09-20)
- [ ] **REFACTOR: unify editing across 2D/3D + plan/elevation, and across line/wall/trunk/pipe** (User,
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
  the Rectangle tool (ACAD two-click / EOS press-drag) instead of PaperPage's bespoke marquee (User,
  2026-09-21) — a paper-space rect is the same primitive.
- [~] **Structural slabs / floors / ceilings in ELEVATIONS** (User, 2026-09-20) — first pass done 2026-09-25
  (CHANGELOG round 6: slab bands + raised-floor lines on A-FLOR, ceiling lines on A-CLNG, from the storeys).
  [ ] Still open: plan cut / sections through them, ceiling-void hatching.
- [ ] (LOW) **Print orientation bug** — printing **landscape** to **PrimoPDF** yields a **portrait PDF
  rotated 90° CCW** even though the print preview is landscape. User's workaround (2026-09-21): Ctrl-P
  → **More settings** → **Print using system dialog** → set the orientation there. Fix ideas: try a
  named `@page size` (e.g. `A3 landscape`) instead of explicit mm, or detect and show a **one-time
  in-app hint** telling the user to use the system dialog for correct orientation. (Related to the
  Chrome/@page vs virtual-printer interaction; the in-app print CSS is already correct in preview.)

## 1. Interaction parity with the Sheets tool  (P1)
(all done — see CHANGELOG; the decision table stays below for reference)

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
- [ ] Section / elevation views generated from floorplans → richer **3D data** (true extrusion,
  cuts) beyond the mock box (P3).
- [ ] **v2 — true 3D construction-plane annotations** (User, 2026-09-20) — upgrade v1 so a 2D shape is
  positioned in 3D (**x/y/z** + size **w/h/d**, with the unused plane dimension = 0) and oriented on a
  construction plane by rotating about x/y/z. Then each view PROJECTS it: face-on in its own plane's
  elevation (readable), edge-on (a line) elsewhere, foreshortened in iso — instead of hidden. The
  projector generalises the current floor→ground-line projection (a `to3`/`proj3` pair: plan-local
  (u,v) → world → view drawing coords). Scope: render + hit + grips per view; ellipse/circle
  foreshortening + iso are the hard parts.
- [ ] More Kestrel tools, surfaced through the **menubar** first; move to a **ribbon** only
  if menus get unwieldy (P2).

### 2a. Insertable objects & annotation types from Sheets  ◧ decide
> The full Sheets set. (Audited 2026-09-27: Pages now has every annotation kind and symbol below except a
> standalone table object — see CHANGELOG.)

**Annotation kinds** (Sheets stores these _per-viewport_):
Annotes are identical to model objects, just stored in view instead of model, and can be moved between model and view to make them global or per view.
Symbols are identical to annotes.
- [~] table — markdown tables inside a TEXT / NOTE (R8, Excel / Word paste); no standalone Kestrel table object

**Symbols** (the `symbol` kind, from the registry):
- [ ] **Viewport frames:** per-frame CROP + a real source config (drawing id) when Pages gets multiple models/drawings.
- [~] **Unify PRIMARY viewport into the frames array + a PAGE MODEL** (User; core done 2026-09-21 — one array of
  uniform frames, CHANGELOG). **Still to do:** (a) the true **page MODEL object** (`docFrames` is still a per-tab
  array — wrap it as a page model that also carries the titleblock + page annotations, persisted/undone as one unit);
  (b) label frame[0] from the drawing (it reads "Plan" now); (c) minor — ViewCube TOP-face back-to-plan needs a
  check; (d) the full **PaperPage↔Viewport merge** (below). **Also list + reconcile PaperPage vs Viewport
  differences** (below) as part of this.
  - **PaperPage vs Viewport — differences to reconcile** (for the merge): PaperPage works in **paper px**
    (screen space, `sheetEl.getBoundingClientRect`), Viewport in **model mm** (viewBox + dscale);
    PaperPage owns frame **geometry/selection/drag** (band + corner grips) while Viewport owns
    **content pan/zoom + drawing + entity/model grips**; PaperPage's new-frame drag is a **bespoke
    marquee** vs Viewport's **rect gesture** (ACAD two-click / EOS press-drag) — should be one; PaperPage
    renders the **titleblock**; both have their own **marquee** + **Handle grips** (share `Handle.svelte`
    already). A merge = one surface that hosts nested viewports, each a Viewport, with paper-space vs
    model-space just a coordinate mode.
- [~] **Set the DEPTH PLANE via GUIDE LINES** (User's design; core done 2026-09-21 — Guide tool, draggable guides,
  depth from the selected plan guide, wall / conduit depth snap as the fallback; CHANGELOG). [ ] **vice-versa** — an
  ELEVATION guide fixes the z/height when drawing in the plan; [ ] use guides as a general **drawing snap** (not just
  conduit depth). How CAD frames the same idea: AutoCAD UCS; Revit work planes / pick-a-wall-face.
- [ ] (LOW) **Door swing SIDE + type parity** (User, 2026-09-21) — the door `flip` picks the hinge JAMB;
  add a toggle for which SIDE of the wall the leaf swings into (in/out), and a swing-angle handle exists
  (drag the leaf tip). Windows currently draw a single glazing line — add sill/head + mullions in
  elevation. (Openings now: Type dropdown Door/Window/Hole + Swing° + Hinge in Properties; door
  leaf+arc in plan; frame+floor-swing in the 3D view — all done 2026-09-21.)
- [ ] **Photo marker:** pick from project photos.

**Tool-objects** (placed inside a source viewport, live in the tool's own data): all done — see CHANGELOG.

**Blocks / library:** Sheets has a **Shape Library** — built-in + custom shapes (saved
globally in Firestore `library`), drag-to-place; it **copies geometry** (no true "block
instance that updates all copies"). Also a separate **rack device library**.
- [~] **True blocks** — inserts reference the definition by id (edits propagate); [ ] no BEDIT / redefine UI for a block yet

[~] **Imported backgrounds:** (2026-09-27: multiple PDF / picture underlays, live Uploads calibration, Replace… /
From Uploads done, R17; [ ] DXF import.) Sheets shows **one** PDF/image page per outlets viewport
(`fileId`+`pageNum`, with origin/scale/crop from the `files/{id}` doc); model3d supports
several **underlays** per direction. **No DXF import** (DXF is export-only). Your asks
(multiple swappable backgrounds; DXF import; set origin/crop in-viewport) are **beyond
Sheets** — see §3/§4.

[~] **Revisions:** (2026-09-27: rev table, clouds, sheet revisions + model versions done; [ ] visual diff / compare
between revisions.) Sheets has a title-block **revision table**, the **cloud** annotation, and
in-session **undo/redo** snapshots — but **no diff/compare between revisions**. Your ask
(revision points you can switch between to see differences for clouding) is **beyond
Sheets' basic version** — see §10.

## 3. Layers  (P1)
> Design target: the annotated reference image (`src/routes/ui/ChatGPT Image …png`) —
> a right-side LAYERS panel with **View Presets**, nested groups, eye toggles, colour/line
> swatches. **UI built** (`parts/LayersPanel.svelte`); wiring is the remaining work.
- [~] Right-side **Layers panel** — nested groups, eye toggles, swatches, View-Preset picker;
  **New Layer, rename (dbl-click), colour picker, add-sub / delete** all work (mock state).
- [~] **Find / identify an object's layer** — the selected object's layer already shows in the Properties
  **Layer** dropdown (User: enough for now). [ ] remaining (lower priority): highlight it in the panel +
  a "select all on layer" / "isolate layer" action.
- [~] **Background layers** (2026-09-21) — a Background layer group + Insert › Image… onto the active layer done;
  PDFs, the Uploads calibration and Replace… since (CHANGELOG round 17). [ ] still: DXF import, swap/compare.

## 4. Imported files / floorplans  (P1–P2)
- [ ] Upload & manage many floorplan drawings per project — **electrical, furniture, AV,
  etc.**, with **versions / checkbacks** (we receive many revisions).
- [~] Set **origin, scale, crop, masks** of an imported file **inside the Pages viewport** — origin / scale / crop /
  opacity done 2026-09-22 (Properties › IMAGE › Calibrate, matching the Uploads tool; CHANGELOG). [ ] still:
  **masks**, re-import version alignment by origin, interactive origin/scale on a rotated image, and a nicer scale
  entry than the inline box.
- [ ] Supported inputs: **PDF, image, DXF**.
- [ ] Produce various floorplan **views**: data-outlet locations, desk numbering, trunk
  routes, penetration & conduit requests (these are the output deliverables).

## 5. Views  (P2)

- [~] **3D button → pop-out** (User, 2026-09-23) — the pop-out with **3D** (perspective) / **ISO** / **WIRE** is DONE
  (CHANGELOG). [ ] Still: **SHADED** = a three.js rendering of the model (openings as gaps in the wall run, not CSG;
  its own renderer fed by the same Model; `project()` stays the source for 3D / WIRE). (M)
- [ ] **Per-view content config** — the rest of a view's props: source model/floorplan, scale,
  crop/clip, layer-visibility preset per view. (Frame position/size/border done above.)
- [ ] **View types like the Sheets tool** — Pages views should support the same set of view
  kinds (list to be confirmed alongside §2a).
- [ ] Multiple views of one model at different scales/crops on a sheet (viewport frames
  already support this — needs per-view content config).
- [~] ◧ **Per-viewport pan/zoom(scale) SAVED PER PROJECTION + multi-user** (User, 2026-09-21) — per-projection
  keying done 2026-09-22 (content pan/zoom + orbit keyed `paneId:viewId:proj`; CHANGELOG). **Still open (the
  ◧ decision):** the **multi-user persistence model** — if framing lives in the backend and one user
  re-frames a view it moves for everyone. Options: (a) a **lock** toggle per viewport (frozen vs
  free-look), (b) a **Save view** button (otherwise pan/zoom stays local per user), (c) per-user view
  overrides.

## 6. Annotations  (P2)
- [ ] ◧ **decide / design** — **annotation = object model.** User's model: an annotation
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
  - **DECIDED (User, 2026-09-20):** a **model-space** annotation just **appears in ALL views of
    that model** — no "subset of views" needed; if you don't want it in a view, **turn its layer
    off**. That's exactly DXF's *model-space-shown-through-viewports*, so no conflict and simpler:
    an object is either **model space** (shown in every view, layer-gated) or **view/paper space**
    (that one view). No per-view allow-lists.
- [ ] Move an annotation / object view→model (and back) — the Scope dropdown does model↔this-viewport;
  still to do: an in-canvas "push to model / pull to this view" gesture + moving between two view scopes.

## 7. Properties panel  (P1–P2)

## 8. Project tree ↔ Pages linkage  (P2)
> Design target: the reference image's **Drawing Navigator** (left) — a location tree
> (Floors / Server Rooms / Data Center / Racks) whose leaves are drawings/views that open
> as tabs. **UI built** (`parts/DrawingNavigator.svelte`, mock tree; clicking a leaf opens
> a tab). Also mirrors the reference top bar: Package / Version / Revision selectors + a
> Ctrl-K command palette.
- [~] **Drawing Navigator UI** — done, now the Project › Building › Floor › Zone › Room ›
  Row hierarchy with drawing/view leaves that open tabs.
- [ ] **Package / Version switching should show different content** (User, 2026-09-20) — Package can
  operate on all docs, but switching **Version** must let you check different issued packages
  (version-controlled content per drawing set). Needs versioned storage.
- [ ] **Per-floor / per-drawing versions + revisions** (User, 2026-09-20) — designers send different
  *versions* of a floorplan per floor, each needing its own *revisions*. So version is not purely
  set-wide: a drawing may track its own source version + revision chain. Leave for now; revisit with
  the model registry (§5) and versioned storage.
- [ ] Package **content preview** + **master drawing list** management.

## 9. Status bar wiring  (P1)
(all done — see CHANGELOG)

## 10. Undo / redo / history / revisions  (P2)
- [ ] **Diff between revisions** → generate revision **clouds** from the changes (the real
  payoff; Sheets has only a manual cloud annotation).
- [ ] **Reverted revisions are read-only** (User, 2026-09-20) — restoring an older revision should
  NOT make it editable; only the **latest** revision is editable. To edit an old one, the user must
  **make a copy** (branch) or explicitly unlock it. Needs a revision-state model (latest vs
  historical) + a lock on the doc when viewing a historical revision.
- **Undo memory** (User's Q, 2026-09-20): steps are full state **snapshots, not diffs**. A normal
  edit now snapshots only the ONE doc it changed (per-doc, `snapDoc`); a revision restore snapshots
  all docs. So memory ≈ (entities in the changed doc) × up to 100 steps — fine for the mock, but a
  real tool should be **command/inverse-op based** (store what changed, not the whole doc). [ ] do this.

## 11. Incorporate the other EOS tools  (P3, needs design)
- [ ] ◧ **design** — surface **Risers, Rack Elevations, Frames, Patching** within Pages
  (as view types? embedded editors? linked pages?). Decide the integration model.

## 12. Backend  (P2, after UX settles)
- [ ] **Investigate Turso (libSQL) as the backend database** (User 2026-09-26):
  - **Why:** today every model change rewrites the WHOLE model doc — `shapes` / `objects` arrays — in one Firestore doc
    (`projects/{pid}/models/{mid}`, `db.replace`). That's write-heavy, runs up against Firestore's 1 MiB doc limit on
    big floors, and gives no per-object history or queries (e.g. "all outlets on 33F").
  - **Idea:** a control plane (tenants / projects / users, billing) plus a **database per tenant** (Turso's
    multi-db model), with ROWS per shape / object (`model_id, id, type, layer, data JSON, rev, updated_at`), so an edit
    writes only the changed rows. Plus an edit log (per-change undo / audit) and sync (Turso embedded replicas or
    change feeds) in place of Firestore's live listeners.
  - **Check:**
    - cost: Turso's pricing per active db / storage / row reads + writes, vs Firestore's per-document writes at our
      edit rate (an autosave per gesture);
    - real-time: how clients get other users' edits (no built-in listeners — polling, a websocket relay, or
      embedded-replica sync);
    - auth: tokens per tenant db from a server route (Vercel);
    - offline behaviour;
    - migration of the existing Firestore data (models, sheets, places, files metadata), and whether the other tools
      (Outlets / Frames / Racks) move too or stay on Firestore for now.
  - (LOW) **Nearer-term alternative, even on Firestore:** split each model into per-object docs (a subcollection) or
    chunked docs, so an edit writes one small doc instead of the whole array. (M–L, a design spike first)

## 13. Codebase & repo health  (P1)
- **Git history is fine** — `.git` is ~9 MiB (packed ~7), no large blobs, so history
  cleanup is **not** the fix. (`node_modules` 732 MiB is the bulk on disk — normal.)
- [ ] Minor: a couple of stray committed files inflate the tree — `static/3PAGE.pdf` - ok to leave this
  (~2.6 MiB test PDF) and `src/routes/ui/ChatGPT Image ….png` (~700 KiB, oddly sitting in
  a **routes** dir). Remove/gitignore if they're not needed. Leave this sample UI

- **Dev notes** (from the retired `HANDOFF.md`):
  - IDE/LSP diagnostics lag badly after multi-edit sequences. Trust `pnpm check:pages` / `pnpm test`, not the squiggles.
  - Tests for Pages only: `npx vitest run "src/routes/projects/[pid]/pages"` (quote the brackets in bash).
  - Live checks on a sheet: double-click an EMPTY area of a frame to activate it. Double-clicking on an
    entity is flaky. Model tabs are always active.
  - The :5173 dev server serves the working tree, so keep the tree quiet while someone live-gates.

---

### New todos
- [ ] Implement File > Package Manager which opens a package manager that allows pages and version to be grouped and ordered into a named package that can be printed to hardcopy or pdf for distribution
- [ ] File > Open should allow user to open & create & delete(archive) Projects
  - OPEN done (eos-07, 2026-09-23 — CHANGELOG "Real project data"). Still to do: create + archive (delete) from the dialog; per-project stores (B17 → X4) so the mock tree / models don't carry over.
- [ ] File > Save should work like History save revision, allowing a version/revision point to be saved
- [ ] (LOW) **Grid snap base point** (not critical) — the SNAP grid counts from 0; let a picked point be the grid
  origin (AutoCAD SNAPBASE), e.g. a rack's first U so the 1U step lands on U boundaries. Also: the SNAP step
  is one session value — consider per drawing.
- [ ] **Faster PDF rendering + tiling** (User, 2026-09-24) — floorplan PDFs take seconds to rasterise
  (`ui/render/pdfRaster.svelte.ts` renders each page ONCE per session, whole page at scale 2, on the main
  thread). Look at: caching the raster across sessions (IndexedDB / an uploaded preview image), rendering
  in a worker (OffscreenCanvas), and TILING — render the visible area at the current zoom in tiles (like a
  map) so zooming in stays sharp instead of one fixed-resolution bitmap going blurry.
- [ ] **Rooms / racks in the tree open their model** (not critical) — IDF1 / Row A → Rack A's model tab, the
  same way a floor opens `<floor> · Model`.
- [ ] **"+" New page picks a model** (not critical) — a New page is a blank plan tab on 33F (FLOOR_MODEL_ID);
  ask for / infer the model (the focused tab's, or a picker).
- [ ] **Marquee can't start on the titleblock strip** (not critical) — a press on the paper's titleblock does
  nothing; let a paper marquee start there too.
- [ ] **Not yet exercised live** (review 2026-09-23): section → viewport drop after the R8-lite / B18 changes,
  touch on sheets, the real print dialog (the print setup itself is verified), B30's frame-orbit reset.
- [ ] **a11y warnings (B12 rest, moved from review.md)** (not critical) — ~10 svelte-check a11y warnings
  (click handlers on non-interactive elements, e.g. the navigator folder rows, dialog backdrops); the agreed
  fix is real keyboard handlers / proper roles, not `svelte-ignore`.


layer managers? Only Sheets has a full one (sheets/layers/LayersPanel.svelte + layers.ts, 8 default layers with visibility/colour/lock). The others are partial: model3d uses per-model layers for symbols, outlets/model3d tag objects with a layerId, and Uploads only toggles a PDF's built-in OCG layers (hiddenLayers). So Pages would be the second real layer manager in the app, closest in spirit to Sheets

These are the ones where I think your input matters more than my guessing:
- §4.1 full DocEditor class — the geometry is extracted; the full headless-editor refactor of Viewport/+page is large and best reviewed.
- §4.3 reuse Sheets layers.ts — a real integration (the Pages layer panel is still a mock); ties into the layer-wiring work.
- §2.3 full per-doc frame state — I did the important partial (no dead Properties handle on unmount); moving frame geometry/border into per-doc state is a moderate PaperPage refactor I'd rather you sign off on.


What's next? The candidates are:
1. B18: key each drawing by its navigator node id, not the tab title. Today, renaming a drawing loses its content.
2. B28: on a sheet, the status-bar zoom buttons ignore "Pan content". Quick fix.
3. R5: one layer model per model, plus layers for the sheet page itself.
4. R7: one projection path shared by drawing and editing, with P2 (fewer hover hit-tests) and P4 (reuse iso faces).
5. R8 / R9: merge PaperPage into Viewport, and split +page.svelte. R9 also fixes B17.
6. P3: undo history copies every image in full on every step.
7. K2 → K1: a command catalogue, then a command line.
8. X1 ◧: needs your decision on which sheet tool and which 3D engine to keep.

For your batched live review, eos-18 asked that these be clicked through:
- open, close and promote tabs
- every tool-strip button and fly-out
- split editor
- a sheet tab and a model-layout tab
- the active-viewport bar
- Fit and zoom
- the ViewCube



X1 pick lists (in §X1; pick by id)
XP1–XP49: paper and viewports, from Sheets and Drawings. S = hours, M = a day, L = several days.
- Titleblock and sheet setup:
  - XP1: titleblock filled from real project data (M)
  - XP4: titleblock templates (M)
  - XP6: sheet properties panel (M)
  - XP8: revisions table (M)
  - XP9: sheet list with renumbering (M)
- Viewports:
  - XP12: viewports showing other tools' documents: racks, outlets, risers, PDF floorplans (L)
  - XP21: rotation (M)
  - XP26: frame size in mm (S)
- Annotations:
  - XP27: symbol library: section and elevation tags, north arrow, outlets, doors (L)
  - XP29: shape library (M)
  - XP30: legend (M)
  - XP38: renumber labels (M)
  - XP39: annotations on the paper (M)
- Editing:
  - XP40: 8-handle transform box (M)
  - XP41: single-letter hotkeys (S)
  - XP42: frame multi-select, duplicate and copy (M)
- Output and import:
  - XP43: packages and multi-sheet print (L)
  - XP44: publish and pin (L)
  - XP45: DXF export (M)
  - XP47: PDF underlays (M)

XE1–XE42: the 3D engine, from Sheets' 3D tool, the frozen edit3d tool and KestrelCad2. Pages' engine is already ahead in geometry and rendering. The gaps are mostly Sheets' 3D editing features and Kestrel's rendering.
- Object kinds:
  - XE1: slabs and floors from any closed outline (M)
  - XE2: level datum lines in elevations (S)
  - XE3: openings attached to their wall (M)
  - XE4: openings as real holes in 3D (M)
- Editing (mostly Sheets' 3D tool):
  - XE11: join and merge walls and conduits into one mitred junction (M)
  - XE13: select and edit single segments (S–M)
  - XE29: multi-select, marquee and group move for model objects (M)
  - XE30: group transform box (M)
  - XE31: copy, paste, duplicate and nudge for model objects (S)
  - XE33: place boxes in elevations (S)
  - XE35: section cut heights and a plan cut plane (S–M)
  - XE36: floating elevation preview of the selection (S–M)
- Rendering:
  - XE21: GPU renderer, WebGL or three.js (L); there's none anywhere in the repo yet
  - XE22: correct hidden surfaces (M)
  - XE23: hidden lines in elevations (M)
  - XE24: wireframe, hidden-line, shaded and x-ray styles (S); this covers your "racks as wireframe"
- Other:
  - XE19: clash and clearance checks (M)
  - XE20: measure and quantities (S–M)
  - XE38: DXF export (S)
  - XE40: glTF, OBJ or IFC export (M / L)
  - XE42: save to Firestore (M)
