# cad: later

Postponed on purpose (2026-10-03): model3d / 3D viewer work (User: "not yet needed in cad"), items User marked later /
future / not essential, and phase items deferred by an earlier decision. Move an item to `backlog.md` when it's
wanted. *From:* ids as in `backlog.md`.

## Outlets, labels and numbering

- **Relabel from a pattern** — regenerate a selection's labels from `labelPatterns` with a preview (low priority). *From:* P048
- **Label check** — compare labels with a pattern / their data and list mismatches as warnings. *From:* P049

## Levels, plans and underlays

- **Underlays per view direction** — several PDF / image underlays per plan or elevation, with opacity, flip, z-order, drag / resize. *From:* G200
- **DXF import** — DXF as an underlay or as shapes. *From:* P056
- **Ceiling-fed floor and wall outlets** (W12, B44, B63) — in a building without underfloor containment a low outlet
  routes from the ceiling (down the wall) instead of "no route"; today a floor box needs a high drop plus a low run.
  Options were: fall back to the nearest high run with a drop; a per-level "fed from: underfloor / ceiling"; or tier
  from the run serving the area. User 2026-10-15: leave it (draw the drop + floor run by hand). *From:* W12
- **Re-align a new floorplan revision by two point pairs** — when the architect moved the drawing on the page, click
  two points on the old and the new and cad works out the move (and turn). W4 (2026-10-15) copies the calibration and
  says to check the Origin; build this only if moved revisions turn up. *From:* W4

## Ports, panels and allocation

- **Panel detail strip** — the constant-size, readable close-up of a panel; User deferred it until canvas zoom proves not enough. *From:* P012

## Containment, routing, risers and fill

- **Free fill sections** — FR-001-style fill sections not tied to drawn runs (User: "maybe later"). *From:* P032
- **Riser view extras** — horizontal positions for rooms / risers that aren't drawn (floor compression has moved to the backlog under Riser view control). *From:* P033

## Selection and editing

- **Rotate grip** — a round grip for rotate (waits for the "Rotate shapes?" decision). *From:* P039
- **Undo across reloads** — keep recent undo steps when the page reloads. *From:* P050
- **Group transform box** — one box to move / scale / rotate a multi-selection or a group. *From:* G202
- **Ctrl+arrow resize (model3d)** — check what legacy model3d does; select all and cut are in the clipboard entry. *From:* G203, T112
- **Copy to Pages** — Pages is retired; copying between projects is in the clipboard entry. *From:* G205

## Drafting commands and input

- **ORTHO / POLAR and F-keys** — ORTHO / POLAR (F8 / F10), F9 snap, F1 help; User: "osnap and grid snap only for now". *From:* P055

## Layers, styles, blocks and symbols

- **Model layers** — per-model layers from the model3d viewport (name, colour, active, per-viewport hide / lock). Covered by Layers when 3D comes. *From:* G204

## Sheets and viewports

- **Tables on paper** — outlet schedule, patch list and legend tables on sheets; later, not urgent (User). *From:* P026
- **Title block with shapes** — a title-block template that includes drawn shapes. *From:* P058
- **Linking marker** — a section / detail marker that links to another drawing, view or survey photo and shows sheet + viewport number (needs viewport numbers). *From:* T095

## Print and export

- **Prices and quote** — price list (`settings/cadPrices`, JPY, project overrides), prices in the BOM, material-only quote Excel (User: "a todo for later maybe"). *From:* P029
- **SVG export** — not needed (User). *From:* T159

## Shell, navigation and touch

- **Delete the legacy tools (7.6)** — remove legacy routes and legacy-only `lib` once cad is feature complete and User okays deleting `pages/` (Firestore data kept). *From:* P044

## 3D, elevations and sections

- **Hidden-line removal** — true hidden lines in elevations / sections; only needed for line-only DXF elevations. *From:* P007
- **3D view** — a read-only three.js view of a level (later per User). *From:* P035

## Maybe later

- **Import Pages sheets (7.2)** — Pages sheets become cad sheets (frames → viewports by direction / scale / level, clip), `revLog` → revisions, the Pages title block → settings, global Pages blocks → cad blocks. **P3 · L** (~500 lines + tests). Later (User 2026-10-12). *cad today:* not imported; the importer is in `cad/persist/import/` (outlets, cabling, templates only). Tourney's 8 Pages sheets are the check. *From:* P040
- **Import Sheets-tool sheets (7.3)** — viewports from outlets → plan, racks → rack row, risers → riser view, text → paper text, model3d → plan / section, fillrate → a note; title, number, paper, revisions (no history into Issues, per User). **P3 · L** (~400 lines + tests). Later (User 2026-10-12). *cad today:* not imported. Tourney's 19 sheets are the check. *From:* P041
- **Devices list per rack** — a sidebar list for the selected rack: front, then "Rear mount", each "U12: name · type"; click / Ctrl / Shift to select, Delete to remove. **P3 · M** (User 2026-10-05: low priority) (~100 lines, new component). *cad today:* missing. *From:* G087, G109, T040 — later (User 2026-10-12).
- **Dimension: `<>` in the text and units** — the measured value kept inside an override ("<> to wall"), and units mm / cm / m (today: mm under 10 m, m above). Later (User 2026-10-12); the text and extension-line grips were built. *From:* G259
- **Tourney data tidy-up (for User)** — Set server rooms on Tourney outlet ports, place the IDF1 / IDF2 racks and VCMs, mark P3A / P3C as patch frames, delete the stray second `building` doc. **P3 · S** (User 2026-10-05: low priority) (data work in cad, no code). *cad today:* without server rooms these ports can't be allocated. *From:* P019 — later (User 2026-10-12).
- **Review the LR import notes** — Go through the 161 notes the LR import left and fix what is wrong. **P3 · S** (User 2026-10-06: low priority) (reading; fixes as found). *cad today:* the notes are listed, not reviewed. *From:* P047 — later (User 2026-10-12).
- **Label format settings** — separator (default / all periods / all hyphens), include zone, include room, with a live preview, applied to new outlets and (on request) existing ones. A full template engine is T029's decision, below. **P3 · M** (User 2026-10-06: low priority) (~100 lines). *cad today:* a Port labels format select (201.A / 201A / 201-A / 201.1 / 201-1) that can relabel existing ports (`cad/ui/OutletGrid.svelte:111`); imported `labelPatterns` are unused (`cad/domain/types.ts:268`). *From:* G130 — later (User 2026-10-12).
- **RCP (reflected ceiling plan)** — a plan view of a level that shows the ceiling: high runs, ceiling outlets / APs, risers, with floor-level items faded or hidden; can go on a sheet. **P3 · M** (User 2026-10-05: low priority) (~100 lines, a filter on the plan generator). *cad today:* one plan view per level; high runs are drawn on top (`cad/views/plan.ts:43`) but nothing filters by height. *From:* T083 — later (User 2026-10-12).
- **Fill % and cable count at penetrations** — a penetration shows the cables through it and its fill. **P3 · M** (User 2026-10-10: low priority) (~80 lines). *cad today:* the `penetration` role exists with a `source` run segment (`cad/domain/shapes.ts:114`) and the BOM counts it (`cad/domain/reports.ts:162`); there is no tool and no fill on it. T145 is answered (auto-detect + manual PEN, `decisions.md`). *From:* T010 — later (User 2026-10-12).
- **Finish the soft retire (7.5)** — *(User 2026-10-07: low priority — after the P1 / P2 items)* the title-bar menu stops linking Racks / Frames / Floorplans, the command palette stops offering old tools, and old routes show a "retired — use cad" banner. **P3 · S** (User 2026-10-05: low priority) (~40 lines across files outside cad). *cad today:* only the project page is done; the menu is in `lib/ui/Titlebar.svelte:13`. *From:* P043 — later (User 2026-10-12).
- **Walls beside the racks in the rack view** — left / right walls of the server room, dragged into place, to see the clearance at the row ends. A maybe for later (User 2026-10-09). *From:* T119

## Not needed (User 2026-10-07)

- **North arrow symbol** — not needed (User 2026-10-09; datum, detail and elevation tags were built). *From:* (North arrow — `plan-sources.md` lists G258 as the Dimension tool; the id here was wrong)

- **Hover a cord** — thicker on hover, the others dimmed, a "from → to, type, length, status" tip; not needed (User 2026-10-12). *From:* G136, T064
- **Dim the other cords when one is selected** — not needed (User 2026-10-07). *From:* T017
- **Check how old ends of moved / removed cords show** — not needed (User 2026-10-07). *From:* T049
- **Snap to rack corners on the plan** — not needed (User 2026-10-07). *From:* G250
- **Port labels / patch cords toggles per viewport** — replaced by a "Port labels" layer (the ❄ freeze hides it per viewport; cords already have a layer) (User 2026-10-07). *From:* G190
- **Selectable Japanese text in PDF** — not needed (User 2026-10-07). *From:* G324, P027
- **Function keys** — not needed (User 2026-10-07). *From:* G300
- **Floorplan zones: rotate and drag** — not required (User 2026-10-09); zones keep the typed X / Y offset in the Floor manager. *From:* User 2026-10-04
- **Several buildings in one project** — not required (User 2026-10-09: "I'll make a different project per building"). *From:* T054

## From the review of 2026-10-12 (`review-2026-10-12.md`; User: "later")

- **Command line** (R91) — commands by name, aliases, Space repeats (Pages had ~110). P052. *From:* review R91
- **OFFSET / ARRAY / SCALE / STRETCH** (R92) — Rotate and Mirror are being built; the rest later. *From:* review R92, P054
- **Labels and presets** (R98b) — auto labels for generated views ("RACKS 3F SR-1 FRONT", T033), named height presets
  for any item (T147), revision rows as a project setting (T129), reserved-port count and "reserved for X" in the port
  tip, a section's linked-viewports list (G312), penetration tool (T145), Kanban "New task" (T122), the outlet table's
  Room / Zone column (T055), new cord color from its cable type, default cord color editor. *From:* review R98
- **Smaller partials** (R99) — riser lanes that fit the shaft, per-floor hide, a riser text tool; all fill sections in
  one list, the section drawing's wall and Ø; crop Clear / handles; label along a line; copy a sheet to another
  project; node X / Y editable; Frame Excel rear face. *From:* review R99

## Not needed (User 2026-10-13) — from the backlog

- **Drag racks from the list onto the plan** — drag one or several unplaced racks onto the plan; several land spaced in a line. **P3 · M** (User 2026-10-05: low priority) (~100 lines). *cad today:* "Place", then one click per rack (`cad/ui/RackList.svelte:61`). *From:* G050 **Not needed (User 2026-10-13).**
- **More snaps** — Intersection, perpendicular and nearest. (The split of a run drawn from / to the middle of another's segment was built 2026-10-12 — it works with these snaps once they exist.) **P3 · M** (User 2026-10-06: low priority) (~100 lines). *cad today:* node / midpoint / outlet / rack centre / grid only (`cad/editor/snap.ts`). *From:* P002 **Not needed (User 2026-10-13).**
- **TRIM** — Click part of a line to cut it back to the shapes that cross it. **P3 · M** (~100 lines). *cad today:* missing. *From:* G245 **Not needed (User 2026-10-13).**
- **EXTEND** — Grow a line end to the next shape. **P3 · M** (~80 lines, shares the crossing code with TRIM). *cad today:* missing. *From:* G246 **Not needed (User 2026-10-13).**
- **Image opacity, crop, greyscale** — Properties for an underlay / image: opacity slider (for tracing), crop, greyscale (so coloured markup stands out). **P3 · M** (User 2026-10-05: low priority) (~80 lines). *cad today:* `Underlay.opacity` and `crop` fields exist and opacity is drawn (default 0.6), but there is no UI (`cad/domain/types.ts:79`, `cad/views/plan.ts:34`). *From:* G288 **Not needed (User 2026-10-13).**
- **More viewport types: a survey photo** — put a photo survey's photo (with its pins) on a sheet as a viewport. **P3 · M** (User 2026-10-06: low priority). *cad today:* the picker offers plan, 4 elevations, whole rooms' racks, one row of a room's racks, sections, the riser and, on paper (1:1), a rack's / panel's port grid and a room's patch schedule; a run's Properties › Fill puts a fill section on a sheet (2026-10-12, review R95, `cad/ui/SheetProps.svelte`, `cad/views/paper.ts`); a plain image goes on the paper with the Image tool. *From:* G023, G210, G211 **Not needed (User 2026-10-13).**
- **DXF for every view and sheet** — export the active pane as DXF whatever it is (plan, elevation, wall / room elevation, section, rack row, riser), and a sheet as DXF (paper space, viewports clipped). User wants wall / room elevations; rack elevations and risers come free from the same display list. **P3 · M** (User 2026-10-06: low priority) (~120 lines). *cad today:* "This plan (DXF)" only (`cad/ui/CadShell.svelte:150`, `cad/render/dxf.ts:30`). *From:* T107, T120 **Not needed (User 2026-10-13).**
- **Floor view presets** — quick buttons on a plan: Outlets (low), Outlets (high), Trunks, Fill rate. **P3 · M** (~80 lines). *cad today:* a Fill toggle only (`cad/ui/ViewCanvas.svelte`); presets were never wired in legacy either. *From:* G057 **Not needed (User 2026-10-13).**
- **Section top / bottom and hatching** — sections get top / bottom limits, and cut walls and slabs draw hatched. **P3 · M** (User 2026-10-05: low priority) (~150 lines). *cad today:* depth and flip work; cut walls are plain solid (`cad/views/section.ts:40`). *From:* P036 **Not needed (User 2026-10-13).**
- **Connection points on boxes** — centre + edge midpoints by default, or your own (U / V), shown as × marks, for routing to desks. **P3 · M** (User 2026-10-05: low priority) (~150 lines, after the Box tool). *cad today:* missing. *From:* G272 **Not needed (User 2026-10-13).**
- **Box: draw from the middle** — a modifier to draw a box outwards from its centre. User 2026-10-14: not needed.

## Later (User 2026-10-15) — from the backlog's ❓ list

- **Three bands: underlay, model, annotations** — draw everything in three bands, bottom to top (underlay, model,
  annotations), each shown / hidden / faded / locked as one, draw order only inside a band; and a fixed order inside the
  model band so cabling draws over furniture (**outlets over desks**: a desk block's fill hides floor outlets on the
  plan, found in W13). Open questions: band per layer vs by kind vs fixed groups; replacing the Floorplans toggle; fade
  per band. User 2026-10-15: "leave this for later, needs more thought". *From:* User 2026-10-14 / 15.
- **W8 Flag what a new floorplan broke** (B10) — after New revision…, list outlets / boxes now in a wall or where a desk
  was. The red Compare overlay (W7) shows what moved meanwhile. User 2026-10-15: later.
