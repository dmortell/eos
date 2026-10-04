# Phase 8: the backlog, built in batches

**Plan:** `../plan/backlog.md`, in the order of its "Suggested order" (Dave picks). Each batch is logged here and
ticked in the backlog.

## Batch 2: tiny wins (2026-10-03)

Dave chose Batch 2 first.

**Code-size split first:** `ui/Properties.svelte` was at 460 lines.
- The outlet fields (one outlet, and the shared fields of several) moved to a new `ui/OutletProps.svelte`, with no
  change in behaviour.
- Properties is now ~370 lines.

**Built:**
- **Usage on one outlet:** a Usage select in a single outlet's Properties. An imported usage that isn't in the list
  still shows.
- **Rack notes:** a Notes box in Rack Properties (`Rack.notes`, already imported).
- **Device counts by type:** `deviceCounts()` in `domain/devices.ts` (tested), e.g. "11 panels · 2 switches".
  It shows in Rack Properties and, for several racks, as "… in N racks".
- **Patch list:**
  - a **Notes** column, and Find also searches notes;
  - a cord picked elsewhere, or the cord on a picked port, is **highlighted and scrolled into view** (Dave: "scroll
    to the clicked port");
  - the scroll runs only when the pick changes, not on every edit.
- **Outlet Excel:** X / Y (mm) columns (unplaced outlets leave them blank).
- **U numbers:** a tick and a number on every U, on both rails.
  - A narrow frame (no margin beside the rails) numbers its left side only.
  - Numbers outside its right edge would land on the next rack.
- **Outlet symbols:** the label sits above the symbol and the usage below it (`{USAGE}`).
  - The AP symbol already reads "AP", so it shows no usage line.
  - The built-ins live in code, so every project changes at once.
- **Outlet size in elevations:** faceplates are now a true 86 mm, not 1.2 × 0.8 paper mm. The old size grew with the
  scale: 120 × 80 mm at 1:100, 240 × 160 mm at 1:200.
  - They stay boxes (bottom at the outlet's height), so they can still be dragged to a height.
- **Undo / redo select what they changed:** `project.undo()` / `redo()` return the ids they brought back or changed
  (levels, buildings and settings left out), and the shell selects them.
- **Cursor readout:** the corner shows the cursor's X / Y in the view's own terms:
  - plan / sheet: x, y (y down);
  - elevation / section / rack row: x and Z (up).
- **Page Up / Page Down:** pan one screen (90 %) down / up; with Shift, right / left.
- **Section view title:** a section viewport with no typed label reads "SECTION A–A′" (tested); a typed label wins.

**Sources** (`../archive/plan-sources.md`): G035, G106, G067, T011, T066, G143, T063, G054, G120, T096, T146, T005, G061,
G183, G314. These entries are removed from `../plan/backlog.md` now they're built.

**Checks:**
- 282 cad tests pass; svelte-check is back at its 10 old errors, none in cad.
- **Live on Test Project:**
  - label above / usage below on the plan;
  - Usage on one outlet: changed it, then Ctrl+Z restored it and re-selected the outlet;
  - rack Notes box and "1 panel" / "11 panels · 2 switches";
  - U numbers on both rails in IDF1;
  - PageDown / PageUp move the view one screen and back (sent as `PageDown` key events);
  - a cord picked on 4AR01 highlighted and scrolled its row into view in the patch list;
  - cursor readout;
  - no console errors on load.

## Batch 3 (part): Floor manager, Renumber, dark mode (2026-10-03 – 04)

**Dave's answers** (2026-10-03):
- **Renumber** covers outlets, racks and labelled shapes.
- **Floor manager scope:** the building's top and bottom floor, ticking off floors that don't exist (like GF),
  renaming the floor labels, and a heights editor.
  - Server rooms / tenant areas stay in the backlog.
  - So does floorplan picking (now "Level setup: floorplan").
- **Dark mode:** fix whatever becomes unreadable; the canvas can stay white (a dark canvas is not required).
- **Tested** with basements, with and without a GF.

**Floor manager** ("Floors…" in the Levels header → `ui/FloorManager.svelte`):
- **The building's range:** Lowest / Top, and a chip per floor; untick the ones that don't exist.
  - Name patterns: `{n}F`, basements `B{n}F`, ground `GF` (`{nn}` = two digits).
  - The building remembers its range, gaps and patterns (`Building.floors`).
- **"Apply floors":**
  - adds a level for every floor in the range that has none;
  - removes levels outside the range or unticked, but only empty ones (no content, sections or viewports);
  - keeps levels that have something on them, and names them in the message.
- **"Rename all from the pattern"** renames every level; area plans keep their suffix ("33F 3307").
- **Heights:** slab / raised floor / clear height / plenum per floor, plus a "Typical" row with "Apply to all".
  - A floor's area plans get the same heights.
  - The FFL column shows the stack.
- **"Heights from the old Risers tool":** reads the legacy `risers` docs (read-only). Floors it sets get their own
  heights; the rest get its default. Writes nothing when nothing changes.
- **Every change re-stacks the FFL elevations** (`domain/floors.ts`, tested):
  - floor 1 stays put;
  - each storey = clear + plenum + the next slab + its raised floor;
  - a floor with no level still takes a storey; an unticked floor doesn't.
  - Before this was fixed, the first draft treated "no level yet" as "doesn't exist" and would have dropped Test
    Project's 4F onto 1F.
- **Checked:** basements with and without GF, in unit tests and live on Test Project; all undone afterwards.
  - Without GF: B1F −3.800, B2F −7.600.
  - With GF: GF −3.800, B1F −7.600, B2F −11.400.
  - Unticking GF again removed the empty GF level.

**Renumber** (`domain/renumber.ts` tested, `editor/renumberTool.ts`, `ui/RenumberPanel.svelte`):
- **What it renumbers:** outlets (port labels follow), racks (name), and shapes with a label.
- **The Renumber tool (N):** click items in the order they should be numbered. Each click adds the item to the
  selection, Backspace drops the last, and Esc / right-click ends the tool.
- **Selecting several labelled items** with Select also shows the panel, collapsed.
- **Panel options:**
  - order: as picked / reading order / current labels;
  - which number group;
  - start (blank = the first item's own number);
  - step;
  - digits.
- **Before applying:** a preview (old → new), and a warning for labels someone else of the same type already has.
- **Applying** is one undo step; printed panels ask first (`project.relabel`).
- **Checked live:** picked 4 outlets, start 50 → A.050–A.053, then undone.

**Dark mode** (the app's Kestrel Dark theme):
- **Tokens:** `.shell` defines `--cad-panel / subtle / hover / strong / line / input / text / muted / faint / sel /
  pick / link`. They take the theme's `--t-*` when one is set, else today's light colours.
- **Panels:** every cad panel / list / dialog style block uses the tokens now (Properties, Port / Cord / Path / Sheet
  props, wall openings, patch list, outlet grid, sheets tab, rack / sheet lists, legend, trace, import notes, issue
  panel, title-block editor, the shell's tabs / menus / prompt).
- **Selected level row:** uses the token too (its `text-blue-900` wasn't remapped).
- **Not changed:** the canvas (Prims / ViewCanvas) stays white; the status chips stay pastel.
- **Checked live** in Kestrel Dark: outlet and rack Properties, level / rack selection, sheets tab and sheet
  Properties, patch list. Light mode looks as before.

**Checks:** 298 cad tests pass; svelte-check: the 10 old errors, no warnings in cad.

**Sources** (`../archive/plan-sources.md`): G013, G031, G173, G255, P001 (Renumber); T084 (dark mode).

## Batch 1 + Dave's follow-ups (2026-10-04)

**Dave's follow-ups on Batch 3:**
- **Renumber:**
  - every item takes the format of the FIRST item of its type: "A.037" first, then "A001", gives "A.038";
  - a rack in the same run keeps a rack's format;
  - port labels follow the new label as a prefix, or by their matching number for imported ones;
  - clicking an already-picked item goes back to it (the picks after it drop);
  - each pick shows its order number on the canvas.
- **Dark mode:**
  - grid rows (outlets, patch list, sheets) hover with the theme's colour, not a light blue;
  - the racks "⋯" menu lists its options in the theme's colours.
- **Notes in views get grips:**
  - a selected leader / cloud shows a grip per point, and dragging one moves just that point;
  - in view mm when the note is tied to a viewport, snapped 0.5 mm on paper;
  - a text note shows its anchor, and dragging it still moves the whole text.
- **Riser view, "Hide empty floors"** (Dave: a toggle that hides floors with no rooms):
  - floors with no server room squeeze into one break band (a zigzag line, labelled "3F – 20F not shown");
  - so does the space between levels where the building has floors with no level ("floors with no level", e.g.
    Journey 13F–29F);
  - rooms, risers and backbone lines move with the squeeze;
  - it's a button on the riser view (`?v=riser.compact`) and a "Risers (floors with server rooms)" choice for sheet
    viewports;
  - checked live on Journey: 12F, a break, 30F, a break, 33F.

**Batch 1:**
- **Delete asks before taking more than you picked** (`deleteImpact` / `impactText`, tested):
  - a rack's devices, a device's links and cords, a sheet's viewports and notes;
  - e.g. "Delete device PP1 with 24 links?" or "Delete rack P3A with 1 device and 24 links?".
  - Replaces the rack-only check.
  - Viewport Delete still doesn't ask (decision T124 (a)).
- **Live-checked the Delete fixes:**
  - port Delete says "none here" and keeps the device;
  - device / rack ask;
  - a viewport's Delete removes only it, and Undo brings it back.
- **A moved panel keeps its cord labels:** a test moves it to another U, then another rack.
- **Patch cords stay in one room:** `roomProblem` in `domain/cords.ts`, used by makeCord, repatch and bulkPatch
  (tested).
- **The circuit reads through an interconnect:** outlet → panel → cord → tie panel → tie cable → panel → cord → switch
  (domain test).
- **Live cord run:** the Cord tool on 4F made panel 24 → Arista 96, with the circuit shown; then undone. The live
  interconnect run is still to do (in the backlog).
- **"+ Server room"** in the racks list.
  - The list shows a level's empty server rooms too.
  - The Rack tool on a level with no room asks for one and makes it with the rack (`newServerRoom`).
  - Fixed on the way: the Rack tool copied the last rack even from ANOTHER level, so a rack could join a room on a
    different floor.
- **Move racks to another level:** a Level choice in Rack Properties, for one or several racks (`moveRacksToLevel`,
  tested).
  - A room whose racks all move goes with them, with its rows.
  - Otherwise the racks join the room of the same name there, or a new one.
  - They come off the plan; use Place there.
- **Maker / model:**
  - on racks, with Product (SKU) and Colour; on devices, with Width / Depth;
  - imported from the legacy racks / devices / library, and carried by device templates.
- **The panel's own name is readable** (Dave: "hidden behind all the ports"):
  - drawn after the ports, top left, with a halo;
  - not clickable, so the ports under it still take clicks.
  - The proper panel restyle comes with "Readable panel labels" (Panduit style).
- **48-port reservations:** checked against the legacy Frames engine, which keys cells by the panel's U: top row
  1–24, bottom 25–48. The import does the same, so no change.
- **Drag marquee:**
  - a window no longer misses a shape because its label sticks out (labels count only for text-only things);
  - on a sheet, a drag on the paper (or off it) windows the paper notes, and a click still selects the sheet;
  - tested.
- **A sheet's first fit:** waits for the pane's height. A fit into a 0-high pane clamped to the smallest zoom (the
  "speck in the corner"), was saved, and was restored forever. Saved cameras stuck at that zoom are now ignored.
  S001 opens fitted again.
- **"Download sheet PDF"** button label in Sheet Properties.
- **New sheets open fitted** (Dave: a new sheet still needed Fit after adding a viewport):
  - The real cause: when a pane switched to a view with no camera of its own, it kept the previous view's "fitted" flag.
  - Coming from a plan whose camera was RESTORED from the last session, the new sheet was never fitted and kept the
    plan's camera (paper as a speck).
  - Now such a view starts unfitted: the new sheet fits its paper, and re-fits when its first viewport's floorplan
    arrives.
  - Checked live: new sheet → fitted; Add viewport → the plan shows at once.
- **"+ New" sheet** makes "New sheet" straight away, with no title prompt (Dave); rename it in Properties.
- **No single-letter tool keys** (Dave: he pressed the Leader key by mistake).
  - O / L / T / C / W / H / Q / K / D / P / N / X / E / U no longer switch tools.
  - Esc still returns to Select.
  - Keys inside a tool (Enter, Backspace, R / V while drawing a run) are unchanged.
  - cad matches ADR 0005 again.

**Checks:** 308 cad tests pass; svelte-check: the 10 old errors, no warnings in cad. Live on Test Project / Journey as
above; every test edit undone.
- One console error was seen: "MIN_K is not defined". It came from the half-finished moment between two ViewCanvas
  edits (HMR); a fresh load is clean.

**Sources:** T035, T061, T060, T053, G019, P022, G051, G066, G084, G105, G070, G085, G114, T007, T028, P014, T015,
G074, G167, P038, T085, T105 (built, removed from the backlog); T014 (cord part; the interconnect run stays); G021 …
T076 (Riser view control: hide floors built, the rest stays). G030, G100,
G125 and G018 … G290 are partly built: their remainder is in the backlog.

## Quick fixes (2026-10-04, after commit 4d122ada)

Dave's next-5 list, item 1 (the two live checks — interconnect run, Make block — left for later).

- **Delete a sheet:**
  - a "Delete sheet" button in Sheet Properties, and "Delete" for the selected rows in the Sheets tab;
  - asks first with what goes too, e.g. "Delete sheet S001 … with 3 viewports and 6 notes?";
  - a pane showing a deleted sheet (or section) goes back to the plan.
- **Room dropdown in Rack Properties:** natural name order.
- **Port count on outlet symbols:** a small number to the right of every built-in outlet symbol (`{PORTS}`).
- **Wireless AP symbol:** a ring with a centre dot, usage below and port count like the others; no more "AP" in the
  middle.
- **An empty room's rack view** says "No racks in this room yet — draw them on the plan with the Rack tool".

**Checks:**
- 310 cad tests pass (new: symbol texts incl. the AP, the empty-room message).
- svelte-check: no warnings in cad.
- Live: port counts on the plan; Delete sheet asks (cancelled).

## Layers, Slices 1–4 (2026-10-04)

Plan and Dave's answers: `docs/plan/layers.md`.

**One list of layers:**
- System layers in code (`domain/layers.ts`), in drawing order: Floorplans, Walls, Drawing, Racks, Trunks, Trunks
  high, Risers, Backbone, Patch cords, Outlets, Outlets high, Notes, Sections.
  - Pairs sit together (Dave), so trunks draw over racks.
  - The panel lists them in this order: the first row draws at the bottom.
  - **Default colours** (Dave): each system layer's default is the colour its items already draw in, shown as a round
    dot.
    - The default isn't forced on the items: that would turn an unrouted backbone's red, or a rack's ports and U
      numbers, all one colour.
    - A colour you set shows as a square and does recolour; right-click goes back to the default.
    - New project layers take the next unused colour from a 10-colour palette, applied straight away (IDF layers come
      out different).
- Project layers are `Layer` records. A record with a system id restyles that layer (colour, order).
- Every item is on its own `layerId` if that layer exists, else its kind's default. No data migration.
- A trunk's drop sits on Risers. Labels go with their item.

**One filter after the drawing** (`views/layers.ts` `applyLayers`):
- Hidden layers drop out.
- A layer's colour applies where the item has no colour of its own (outline and text; the fill of circles and outlet
  symbols, never rack bodies).
- Locked layers are drawn and snap, but can't be picked.
- Plans paint in layer order. Elevations keep their depth order.
- Used in every pane and in the plan DXF. Riser and rack views obey it too (Dave, Q7).

**Per user** (`app/layerPrefs.svelte.ts`, this browser, per project):
- Eye, lock and current layer. Nobody else's view changes, and none of it is undoable.
- Hiding or locking a layer drops its items from the selection (Dave).
- Drawing a line, wall, trunk or rack onto a hidden or locked layer is refused, with a message.

**Stored:** `Viewport.frozen`. A frozen layer is left out of that viewport and its PDF; Shift = every viewport on the
sheet. The dead `ViewDef.hiddenLayers` field is removed.

**UI:**
- Layers list in the left sidebar (`ui/LayersPanel.svelte`): swatch (right-click clears), name, count, eye, lock, and
  snowflake while a viewport is picked.
  - Click a name to make it current; double-click to rename.
  - Delete only when the layer is empty.
  - Drag a row to change the paint order.
  - "+ Layer"; a search box once there are more than 16 layers.
- Properties → Layer moves shapes, outlets and racks (`ui/LayerPick.svelte`). Picking an item's default layer clears
  its `layerId`.
- New lines go on the current layer.
- DXF: items on a project layer go on a DXF layer of its name.

**Not done:**
- Hidden layers still snap on the plan.
- Tied sheet notes ignore freeze.
- Presets, groups and multi-select: a P3 backlog entry.
- Copy / paste must keep layers (Dave). This is written into the clipboard backlog entry; copy / paste isn't built
  yet.

**Checks:**
- 324 cad tests pass (+14: `views/layers.test.ts`).
- svelte-check: no warnings in cad.
- Live on Test Project:
  - hide Trunks high / Trunks / Outlets (labels go too; the riser stays);
  - a layer colour, then undone;
  - lock Outlets: A.001 can't be picked; unlocked, it can;
  - a hidden layer drops A.001 from the selection;
  - freeze Floorplans in S001's plan viewport, then undone.

**Sources:** G010, G039, G175, G176, G178, G179, G213, G217, G218, G219, G275, G279, G281, G282, G291, G302, G303,
T058, T113, T156 (built, removed from the backlog); G174, G177, P051 (presets / groups remain).

**After commit b7345cd4:** the current layer is highlighted like the open level (row background), not bold text.

## Copy / cut / paste (2026-10-04)

Backlog "Clipboard", part 2. `domain/clipboard.ts` is pure and tested; `app/clipboardEvents.ts` handles the browser's
copy / cut / paste events.

- **Ctrl+C / X / V use the system clipboard**, as JSON marked `eos-cad-clip/1`, so a copy pastes on another level, on
  another sheet, in another tab or in another project.
  - Text fields and selected page text keep the browser's own copy / paste.
- **What copies:**
  - plan items (shapes, outlets, racks with their devices) into a plan;
  - notes onto a sheet. A note tied to a viewport is copied as plain paper points.
  - Links and cords stay behind.
  - Other things, or a paste in the wrong kind of pane, are left out with a message.
- **A paste is as-is** (Dave, replacing the first build): the same coordinates and the same labels, on any level,
  sheet or project; you sort out overlaps and duplicate labels. The first build shifted copies 20 px and gave taken
  labels the next number (T142); both were removed.
- **References:**
  - Inside the copy they follow the new ids: a device's rack, a run attached to a copied outlet.
  - References the target lacks are dropped: zone / room / port server room on another level, an attachment to
    something not copied.
  - A rack on another level joins that level's server room of the same name, or a new one is made. Its panels' room
    follows.
- **Layers** (Dave): items keep their layer. Into another project, the layer comes along, or joins a layer of the same
  name.
- **Cut never asks** (Dave): it deletes straight away. The message says which links / cords a paste won't bring back;
  Undo does.
- **The pasted items are selected; a paste is one undo step.**

**Checks:**
- 335 cad tests pass (+10: `domain/clipboard.test.ts`).
- svelte-check: no warnings in cad.
- Live on Test Project:
  - copy A001 and paste on 1F → A002, shifted, selected;
  - paste on 4F → A001, in the middle of the view;
  - every paste undone.

**Sources:** G009 (part), G229, G230, G231, G256, T142, T039 (part). Ctrl-drag copy, select all / nudge,
multi-device drag and device-only copy remain in the backlog.
