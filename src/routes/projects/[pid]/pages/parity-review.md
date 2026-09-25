# Pages parity review — pick list

Features that the Sheets and Outlets tools have, plus title-block features from the other tools, that Pages lacks or does differently. Items are de-duplicated across the three scans (for example, trunk editing appears in both Sheets and Outlets).
Tick `[x]` on anything you want built; leave the rest. **Size**: S = under half a day, M = one to two days, L = multi-day.
Source reports (2026-09-25): title-block comparison, Sheets feature scan, Outlets feature scan.

### Status — overnight 2026-09-25 (the ticked (S) items, low-priority ones skipped)
- **Done**:
  - Title block: A2, A5, A7, A8, A9.
  - Sheets: B3, B8, B10.
  - Annotations: D7, D8 (type a length), D9.
  - Outlets / editing: E11 (already true: shapes pick before model objects), E12.
  - Model objects: F8, I4, I7.
  - Layers: J2 (option: items go with the layer after a confirm), J5.
  - Keys and prompts: K2, K4.
  - Your notes: Pan/Orbit latched (one finger pans when Pan is on); repeated clicks select the shapes underneath.
- **Not done**:
  - E6 (single-key property shortcuts): would clash with the planned command line. Alt+key or a later command-line binding instead?
  - J1, J3: marked low priority.
  - Every (M) / (L) item.

### Status — 2026-09-25, the ticked (L) and (M) items (low-priority / "rethink" / "?" ones skipped)
- **Done**:
  - Title block: A1, A4, A6.
  - Sheets: B1, B2, B5, B6, B7.
  - Export: C1 (DXF), C2 (outlet schedule).
  - Annotations: D1–D6, D10, D13.
  - Outlets: E1, E2, E3, E8 (simplified), E9 (the allocate list).
  - Conduits: F3, F5, F6, F9, F10, F12.
  - Racks: G4 (a rack row model).
  - Views: I1, I2, I5, I6.
- **Not done**:
  - Low priority: D12, E10, F11, J1, J3.
  - Marked "rethink", "?" or "maybe": G1, G2, G3, D11, E7, F4, F7, H1, H2, K3.
  - E6: needs the command-line decision first.
  - Unticked items.
- **Worth knowing**:
  - G4 and E8 are untested live, because Test Project has no rack rows.
  - I6's live sync is unit-tested only. Floorplans attached from now on are live; older ones opt in under
    Properties › Calibration.
  - F6: connection points are plan-only (x, y), and a node keeps its own height.
  - I1: the cut band filters whole objects that reach into it; it does not trim them.

## A. Title block
- [x] A1 **Logo images** (client + company), resizable, saved per project — Pages has a text `logo` only (M)
- [x] A2 **Company block**: name, address, contact (S)
- [ ] A3 **Checked / Approved / Client** per-sheet fields (S)
- [x] A4 **Revision history table** in the title block (code + date + note rows) (S–M)
- [x] A5 **Hide the title block** per sheet (S)
- [x] A6 Layout templates: vertical / compact / horizontal (Pages has a fixed right strip) (M)
- [x] A7 Section toggles per project (company / client / site / revisions / approvals) (S)
- [x] A8 Frame drag-snap to title-block edges (S)
- [x] A9 Printed margin border (hairline); today the Pages margin guide is screen-only (S)

## B. Sheets & sheet management
- [x] B1 **Duplicate sheet** (deep-copies frames, view-scoped shapes, overrides; "(copy)", slotted after) (S–M)
- [x] B2 **Frame copy / cut / paste / duplicate** (Ctrl+C/X/V/D), across sheets (and projects via localStorage) (M)
- [x] B3 **Viewport labels print** (the `.vp-tag` is hidden in print today) + editable Label / number override in Properties (S)
- [ ] B4 Viewport numbering in **reading order** (rows, then left→right), renumbered on move — Pages uses creation order (S)
- [x] B5 "File" sheets: a register row that opens another tool (Patching / Frames) at a floor or room; printed as a placeholder in a package (M)
- [x] B6 Editable revision list: free-form codes (P1, C1…), edit date/note, delete, choose the current revision (M)
- [x] B7 **Package print**: print every sheet of a package, one per page, with mixed paper sizes; reorder in-tool (M–L)
- [x] B8 Block-move a multi-selection of sheets in the tree (S)
- [ ] B9 Tools menu linking to the other project tools (S)
- [x] B10 PageUp / PageDown page-pans the sheet (S)

## C. Export
- [x] C1 **DXF export** of a frame or model from File menu (real mm, layers → ACI colours); File › Export is a stub today (L)
- [x] C2 **Outlet schedule to Excel**: label, ports, mount, cable, level, usage, X/Y, room, port labels, plus a totals row (S–M)

## D. Annotations & symbols (these should be implemented as 'intelligent' blocks)
- [x] D1 **Legend** annotation: auto-lists layers with swatches and optional live counts, per-layer exclude (M)
- [x] D2 **Floor-tile grid** annotation: tile size, offset from the building origin (S–M)
- [x] D3 **Symbol library**: section / elevation tag (1–4 arms) / detail / photo marker / north arrow / faceplate / door (M–L)
- [x] D4 Symbol **links** to a drawing (ref + sheet picker; click navigates) (M)
- [x] D5 **Block library panel**: search, drag-to-place, **save selection as block** (M)
- [x] D6 **Auto-number** dialog for text/attributes to renumber selected shapes (start, step, `###`, prefix/suffix, order by x-y / y-x) (M)
- [x] D7 **Line / arrow text label** (start / mid / end) (S)
- [x] D8 **Dimension units** (mm / m / none, project default + per-sheet), dim font size, type-a-length (S–M) (just type a length for now is fine)
- [x] D9 Callout border style: none / underline / box (S)
- [x] D10 **Drawing defaults** dialog (project-wide colour, font, arrowheads, dash, dim unit) (S–M)
- [?] D11 **Single-key tool hotkeys** (T text, L line, R rect, E ellipse, D dim, C cloud, O outlet…) (S) - no, this would conflict with command line, but we could implement these using Alt+key combinations
- [x] D12 Right-click **context menu** (Group, Ungroup, Duplicate, Copy, Paste, Delete, Auto number, plus conduit items from F4) (M) - this was difficult to implement before, so low priority
- [x] D13 Group transform box: scale / rotate a multi-selection with handles (M) - this rotates selected shapes around barycenter. To rotate all selected shapes individually in one go, enter value into rotate property

## E. Outlets
- [x] E1 **Outlet place tool** (O key not wanted; wires up Insert › Outlet) with **sticky defaults** from the last edit (M)
- [x] E2 **Automatic next label** on placement (template-aware, e.g. `4A013`; zone prefix) (S–M)
- [x] E3 **Walk renumber**: seed from a label, then each click takes the next number; Esc stops; undo rolls back (M)
- [ ] E4 **Real outlet fields**: level (low/high), **cable type**, usage as a choice list that recolours the symbol; the import keeps them (M)
- [ ] E5 Multi-select outlet mass edit with "— mixed —" (S–M)
- [x] E6 Single-key property shortcuts: `1–9` ports, `l`/`h` level, `c`/`s`/`m` cable, `w`/`f`/`b` mount (S) - if no conflict with command line
- [?] E7 **Per-port labels** (`.A/.B`), derived or edited, plus baked labels from Frames (M) - only really need this for a new Frames tool
- [x] E8 **Link outlet ↔ Frames location**: picker, mismatch warnings, link all by label, sync from locations, create location, unlink (L) - just want a simplified version that allows dropping a bunch of outlets from a list onto a frames panel to allocate outlet ports to the panel ports
- [x] E9 Unplaced-locations list + "place next" (M) - list outlets that havent yet been assigned in a frame
- [x] E10 **Object list** in the sidebar (outlets / conduits): sort, select, per-item show/hide, counts (M) - low priority
- [x] E11 Outlets pick ahead of trunks under the cursor (S)
- [x] E12 Ctrl-drag copies get a "-copy" / next-number label instead of duplicate labels (S)

## F. Trunks / conduits
- [ ] F1 **Trunk spec at draw time**: catalog (PF22/PF28/E51, MK0–5, ladder, tray…), location (under floor / ceiling plenum / tray / wall), size, Z (M)
- [ ] F2 Pipe **inner vs. outer diameter** (M)
- [x] F3 **Merge / join**: a new draw joins a compatible conduit it touches; drop a node on another to merge (M–L)
- [?] F4 **Split at node**, Disconnect node, Delete segment, Select full trunk (via the context menu D12) (M) - click trunk to select segment, dblclick to select the full trunk
- [x] F5 Coincident nodes of different conduits **move together** (Alt = detach) (M)
- [x] F6 Node connections to outlets / racks (coloured rings; moving a rack drags its nodes) (M–L) - maybe allow user to define connection points on a selected shape (like Visio, which shows connection points as a small x)
- [?] F7 Trunk **rooms restriction** (A–D) (S) - I dont understand this?
- [x] F8 Colour override UI for a conduit (`Obj.color` already exists) + multi-select conduit edit (S) - multi-select edits should be standard on all shapes
- [x] F9 Per-node bend radius UI / drag handles (S–M) -  already semi-implemented
- [x] F10 **Cable fill calculation** + per-node fill labels (green / amber > 40 % / red > 60 %) (L, needs E4 + F1/F2 + F6) - ux similar to a section/elevation view, but focused on a trunk/conduit (advanced: calculate qty/type of cables in conduit automatically?)
- [x] F11 **Automatic secondary routes** (outlet → nearest same-level trunk, coloured by server room) (L) - low priority, used for checking outlets connect to the right trunk going to the right rack, for better estimations of cable run lengths in cabling BOM
- [x] F12 **Fill-rate viewport** (trunk cross-section packed with cables) (M, needs F10)

## G. Racks on the floor model
- [x] G1 Import `rackPlacements` onto floor models as linked rack objects (M) - let me rethink this
- [x] G2 Rack palette: unplaced racks by room, drag onto the plan, "New rack here", adopt row layout (M–L) - rethink this
- [?] G3 Rack properties write back to the racks doc (U, W×D, type, maker, model, rotation) (M) - maybe
- [x] G4 Rack **elevation** views (front / rear, devices, library, port labels / cords) — the whole Racks tool, so it may belong to the Elevations tool plan (L+) - this could be a standard view, just with a separate model to allow detailed editing of rack properties and devices in a row of racks

## H. Risers (building model)
- [?] H1 Edit risers in Pages: rooms (kind, floor, width), ladders (from/to), **cables as hops** with media (L) - low priority
- [?] H2 Automatic cable-lane layout (M) - already implemented?

## I. Model views
- [x] I1 **Plan cut** z-band (bottom/top Z, fit to slabs) and section cut Z (M) - in case I add floor/ceiling slabs
- [x] I2 Per-viewport **Hidden lines** toggle + **B/W monochrome** (S–M)
- [ ] I3 Floating elevation preview of the plan selection (quick height edits) (M) - dont need now that we have split tabs
- [x] I4 Multi-object Height / Base Z / Layer edit (S)
- [x] I5 Several underlays per direction: z-order, flip, file/page picker for the floorplan (M) - done for plans, test for elevations (like AV system wall mount designs)
- [x] I6 Live link to the Uploads calibration (origin/scale/crop) instead of copying it once; origin crosshair (M) - mostly done 
- [x] I7 Greyscale floorplan toggle (S)

## J. Layers
- [x] J1 **Per-viewport layer lock** (Pages has per-viewport freeze only) (S–M) - low priority
- [x] J2 Block deleting a layer that is active or has items (show a count) (S) - or after confirmation, ensure all items are deleted with the layer
- [x] J3 Outlet / trunk **low vs. high** layers on import (today one layer each) (S) - low priority, import wont be needed much longer once we import Hibiya/LR sheets
- [ ] J4 Project-wide layer list shared across models (a big model change; weigh against per-model) (L)
- [x] J5 Refuse / warn when drawing onto a hidden or locked layer (S)

## K. Counts & misc
- [ ] K1 Status-bar counts (outlets / conduits / racks) (S)
- [x] K2 `+` / `-` / Home zoom keys (S)
- [?] K3 Text viewport (markdown subset: headings, lists, tables) for notes/schedules on sheets (M) - implement as shapes, not as a VP
- [x] K4 Point counter + status hints while drawing conduits (S)

### Deliberately different (no action suggested)
Pages already handles these another way, and the scans rated that approach equal or better:
- one-finger touch (Pages draws; Sheets pans) - rethink this, obey pan/rotate icons in zoom window
- global undo timeline
- window vs. crossing marquee
- sheets at true 1:N instead of plan-print frames
- model tabs instead of model mode
- place tree instead of floor/area tabs
- model versions + issued revisions instead of snapshot restore
- Fit sets a fixed scale
- paint-order hit testing - but implement repeated clicks to select shapes underneath
