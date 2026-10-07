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

## Ctrl-drag copy, select all, nudge, rack devices (2026-10-04, after commit 8ed47b96)

- **Ctrl-drag copy:**
  - Ctrl-press on an item, then drag: copies of the selection (with that item) follow the mouse; the originals stay.
    It's the same as-is paste (`pasteClip` with a `d` offset), so it has the same labels, layers and references.
  - Letting go of Ctrl mid-drag moves instead.
  - A Ctrl click (no drag) still toggles the item in the selection.
  - The copies are selected; it's one undo step.
  - Works in plans, elevations (with height) and on sheets (notes).
- **Ctrl+A:** selects everything the active view shows that can be picked — visible, unlocked layers. In a rack row
  that's its devices; on a sheet, its notes.
- **Nudge** (`editor/nudge.ts`):
  - Arrow keys move the selection 50 mm, Shift 500 mm (Dave: 1 mm was too small), in the view's directions. On a
    sheet's paper it's 1 / 10 mm. In a rack row, Up / Down moves devices 1 U; off the rack is refused, with the reason.
  - Holding a key is one undo step; separate presses are separate steps.
- **Rack devices** (`editor/deviceDrag.ts`, split out of `tools.ts`):
  - Several selected devices dragged onto another rack all go into it, keeping their spacing. Devices from several
    racks only change U.
  - Ctrl-drag copies devices.
  - Ctrl+C on devices copies them on their own. Ctrl+V in a rack view puts them in the rack under the mouse, at their
    own U, refused if they'd overlap.
  - A copied rack pasted into a rack view puts its devices there.
- **Code splits:**
  - `editor/rackTool.ts` split out of `tools.ts`, unchanged (504 → 440 lines).
  - ViewCanvas's pointer capture is in try / catch, so synthetic pointers in tests and automation work.

**Checks:**
- 343 cad tests pass (+8: `editor/copyNudge.test.ts`).
- svelte-check: no warnings in cad.
- Live on Test Project:
  - Ctrl+A selected 24 items;
  - nudged A001 ×3 right and Shift+Up, at the first 1 / 10 mm steps (X −6391 → −6388, Y −2400 → −2410), undone
    back to the start;
  - Ctrl-drag copied A001 (original stayed), undone.
- Not tried live: device drags and pastes in a rack view (unit tests cover them).

**Not done:** copying one segment of a run (a P3 backlog entry). Inside a picked sheet viewport, Ctrl-drag still pans
its view (T126's Alt-drag isn't built).

**Sources:** G009, G033, G064 (most), G082, G112, G168, G170, G189, G193, G225, G227, T039, P024.

## Viewport Alt-drag / Alt+wheel, route highlight, undo selection (2026-10-04, after commit df504ee0)

- **Viewport content with Alt** (T126, decided earlier):
  - Alt-drag inside the selected viewport pans its view; Ctrl-drag there now copies, like everywhere else.
  - Alt+wheel over the selected viewport steps through the standard scales (1:50 → 1:100 → 1:200 …), one undo step
    per notch.
  - The status bar says what happened, e.g. "1:200 — Alt+wheel changes the viewport's scale, Alt-drag pans its
    view".
  - `SCALES` moved to `views/sheet.ts` and is shared with Sheet Properties.
- **Picking a viewport says** "Viewport locked — it can't be moved, resized or panned (Properties → Locked)" or, when
  unlocked, how to move / resize / pan / scale it (Dave).
- **"Clicking A.008 also selects a trunk"** (Dave): it didn't. Only the outlet was selected. The trunk showed the
  outlet's cable ROUTE (to its IDF), drawn in the same amber as the selection. The route is now green dashes, so it no
  longer reads as selected. Hitboxes are unchanged.
- **Undoing a copy or paste gives back the selection from before it** (Dave). An undo step can carry the selection
  from before the edit (`Step.sel`, passed to `transact` / `commit`); the app uses it when nothing the undo touched is
  left.
- **The Select tool's hint mentions Ctrl-drag copy.**
- **Undo / redo open the level they changed** (Dave). If what came back is on another level (an item's own level, or
  a device's rack's level), that level opens first, then it's selected. Sheets and the riser view stay put.
- **Notes tied to a viewport are clipped to its window** (Dave: zoomed in, S001's cloud flew off the top of the
  page). The cloud already scaled with the content (tested); it just wasn't clipped like the view.

**Checks:**
- 346 cad tests pass (+3: Ctrl-drag no longer pans and a locked viewport says so; undoing a copy returns the earlier
  selection; a tied cloud scales and is clipped).
- Live: nudge on 1F, open 4F, Ctrl+Z → back on 1F with A001 selected and restored.
- svelte-check: no warnings in cad.
- Live on S001:
  - the locked plan viewport says so and ignores Alt-drag / Alt+wheel;
  - the unlocked section viewport pans (centre 2488, −1712 → 488, −2112) and goes 1:100 → 1:200;
  - both undone.

## Backlog batch: Dave's picks 1 4 7 9 14 16 18 20 30 33 34 35 37 (2026-10-04)

**Outlets:**
- **Several outlets:** Ports (removed ports' links asked about first, as for one) and Room.
- **Room field, one or several outlets:** the level's numbered rooms, with "New room…". Rooms are `room` spaces; the
  importers make them from room numbers. Until now there was no UI for an outlet's room. (`ui/OutletProps.svelte`)
- **Next-outlet defaults:** with the Outlet tool on, the tool bar sets Ports / Tier / Usage / Mount / Cable for the
  next outlet. Blank = as the last one placed, as before; a set value sticks. (`ui/OutletOptions.svelte`,
  `ws.outletNext`)
- **"No panel yet" filter** in the outlet grid: only outlets with a port not on a panel port.

**Racks and devices:**
- **Several devices** (`ui/DeviceMultiProps.svelte`): name, face, height, ports, numbering, width, depth, maker,
  model, and tier for panels. An edit that would overlap is refused, with the reason.
- **Drop ghost:** the Device tool draws a dashed outline where the device will land (red where it can't).
- **Racks have no grey fill** (Dave), on screen and in the PDF. They're still picked by their whole body.
- **Rack doors live check:** R303 is now a cabinet (Dave: leave it) with a split front and a single rear door. Both
  swings show on the plan. The PDF check is left in the backlog (a download).

**Ports and patching:**
- **Port Properties:** "Remove links (n)" (any kind) and "Remove cords (n)" for the selected ports. One undo step,
  no question.
- **Patch list "All rooms / <room>":** the room is the open rack view's, else the selected rack's / device's /
  cord's. The Excel follows the choice, with a "changes only" tick (add / change / remove).

**Selection:**
- **Click-cycle:** clicking the same spot again selects the next item stacked under it, round and round
  (`pickStack`). A drag still moves the current one.

**Sheets:**
- **Sheets renumber with the shared Renumber:** select several in the Sheets tab, then Properties → Renumber. The
  register's own pattern renumber is gone, so a prefix change ("S" → "EL-") is now a find / replace by hand.

**Shell:**
- **Panels** (`app/panels.svelte.ts`, `ui/ResizeHandle.svelte` copied from the workspace tool):
  - The left, right and bottom panels hide / show from three tool-bar buttons.
  - They resize by dragging their edge.
  - Sizes and visibility are kept per user in this browser.
  - The split bar between two views isn't resizable yet (backlog).
- **`?rack=<id>`** opens the rack's room in the rack view, selected and zoomed to it (`ws.focus` in the view's fit
  step). The param is then dropped from the URL. Rack Properties has "Copy link".

**Blocks:**
- **Make block, live:** it adds the block to the global `settings/cadBlocks` (merge, by id) with its shapes relative
  to their centre, and puts one insert in their place. The test block was then removed from the global doc and the
  drawing undone; the existing "Test block (cad)" was left alone.

**Code splits:** the Export menu moved out of CadShell (`ui/ExportMenu.svelte`; CadShell 493 → ~455 lines).
`$lib` Icon gained `panelLeft` / `panelBottom`.

**Checks:**
- 348 cad tests pass (new: click-cycle, sheets in the shared Renumber, next-outlet defaults).
- svelte-check: no warnings in cad.
- Live on Test Project: panels hide / show / resize (then reset); the Outlet tool bar; `?rack=` to R312; doors;
  Make block.

## Backlog batch: Dave's picks 4 6 7 8 10 11 13 23 24 25 30 31 (2026-10-04)

**Floorplans and racks:**
- **Live recalibration:** each floorplan file is watched (`onSnapshot` on `files/{id}`). A new origin / scale /
  crop / layers in Uploads redraws its pages at once; the old image stays up until the new one is ready.
  (`app/pdf.svelte.ts`, stopped with the project)
- **Rack view:**
  - a caption under each rack name: "42U 4-post", "1200 mm desk"; "· REAR" from behind;
  - a title over the elevation: "4F — IDF2 · front", and "· Row A" for one row.
- **Several racks:** kind, maker, model and notes join the shared fields.
- **Server room summary:** the room name's tooltip in the racks list, e.g. "4F · 2 rows · 13 racks · 13 devices —
  click to rename".
- **Open one row:** an "All rows / Row …" picker in the rack view's header (only when the room has rows).
- **Sideways device offset:**
  - "Offset X (mm)" in Device Properties, for devices narrower than their rack;
  - dragging moves them sideways in 25 mm steps, kept inside the rack, mirrored from the rear;
  - dropped into another rack, a device keeps its offset;
  - two narrow devices side by side at one U are still refused as an overlap (the check is by U).
- **Rack BOM:** desks and shelves are listed too ("no catalogue SKU"), with their own "Desks & shelves" category in
  the project BOM. Every rack's notes show on its line.

**Selection and editing:**
- **Crossing window:** a box dragged right → left selects whatever it touches (real geometry: segments, filled
  shapes, circles), drawn as a dashed green box. Left → right still selects what it encloses (solid blue).
  (`pickTouching`)
- **Range select in the racks list:** Shift-click selects every rack from the last one clicked; Ctrl adds / drops one.
- **Delete buttons:** "Delete" in the tool bar and "Delete N" at the foot of Properties. Both are the Delete key's
  own action (`ws.remove`), so the same confirms apply.

**Sheets:**
- **Shift = square viewport:** Shift while dragging a viewport corner keeps it square (the longer side wins; the
  opposite corner stays put).
- **Sheet register Excel:** a date column per revision code, in the order first issued (P1, P2, C1 …), giving when
  each sheet got it (`revisionColumns`).

**Backlog housekeeping:**
- Lowered to P3 (Dave): "Zones and server rooms when placing outlets" and "Grayscale floorplan toggle".
- Closed (Dave): "Outlets / Trunks toggles per viewport" — per-viewport layer freeze covers it.
- The backlog's per-theme counts table is replaced by one "Remaining" line (Dave).

**Checks:**
- 353 cad tests pass (+5: captions / title, desks in the BOM, crossing box, square viewport, revision columns).
- svelte-check: no warnings in cad.
- Live on 4F: the IDF2 desk is captioned "1200 mm desk" under the title "4F — IDF2 · front"; Server room A shows the
  rows picker; the room tooltip shows its summary.
- Not tried live: recalibration (needs an Uploads edit), the Excel files (downloads).

## 19" = 450 mm, rack view header, tower PC ports, a row on a sheet (2026-10-04)

**A 19" device is 450 mm** (Dave: servers ~430–451 mm, patch panels 462 mm without ears) — `RACK_DEVICE_W` in
`domain/devices.ts`:
- Devices with no width are drawn 450 mm wide.
- The rack's mounting frame is drawn 450 mm wide, leaving more room beside it for 0U PDUs and U numbers.
- Anything narrower (`narrowDevice`) can be offset sideways (Properties, and the drag); 19" devices can't.
- The cord-length estimate keeps the physical 482.6 mm rail spacing.

**Stored data moved to 450** (a one-off migration, written as remote edits — `updatedBy: migration:19in-450`):
- devices of 440–490 mm: 23 in Test Project (20 × 445, 3 × 460) and 68 in Journey (all 445);
- all 9 global device templates (480 / 460 / 445).
- LR's 154 devices have no width and were left as they are; narrow devices (200, 377 mm, PDU strips) too.

**Fixes:**
- **Ports on narrow devices:** the port grid now sits on the device's own front. A 200 mm tower PC's ports were
  drawn left of the PC, from a 19" panel's port area (Dave: R311). Test added.
- **Rack view header:** a solid strip over the pane, above the drawing — labels no longer show through the buttons.
- **The row picker's open list** no longer shows every option highlighted (the options inherited the blue "on" look).
- **Properties fields are closer together:** 0.25 rem between fields instead of 0.75 rem; the title block's rows have
  no extra padding.

**Sheets:** a viewport's View picker lists each room's rows ("Server room A · Row A racks front"). Sheet **S004
"4F Server room A — Row A racks"** was made on Test Project (Dave): 4AR01–4AR06 front, at 1:20.

**Backlog:** "Logos picked from Uploads" now includes uploading a new image in the same dialog (Dave).

**Rack views show the storey** (Dave), from the level's heights, drawn under the racks:
- the slab under the raised-floor void;
- the ceiling line ("CEILING +2600");
- the plenum ("PLENUM 700");
- the next floor's slab above.

They're in the PDF too. Per-server-room heights (rooms often differ) stay in the backlog's "Rack elevation context".
Test added (354 pass).

**Checks:**
- 353 cad tests pass (+1: a narrow device's ports stay on it).
- svelte-check: no warnings in cad.
- Live: R311's tower PC ports on the PC; the header strip; S004.

## 2026-10-04 — rack view polish, floorplans, runs, blocks

**Rack views:**
- **Storey as lines** (Dave): a thin dashed ceiling line "CEILING FFL+2700"; the slab is a slightly thicker solid line,
  top of the floor slab ("SLAB FFL-300") and underside of the slab above ("SLAB FFL+3500"). No more grey rects.
- **The other face's devices** are drawn faint (dashed, no fill) and named "(rear)" / "(front)", e.g. P3C U42 on the front.
- **96-port switches** show all their ports: a 2U device gets up to 4 rows of 24 (it showed 48).
- **Readable panel labels** (P1): a two-part label ("01A.014A") is stacked on two lines, about twice the size of one
  line; the device's name over its ports hides once the port labels can be read (it covered them, P3C U32 / U37).
- **Minus signs** are plain ASCII "-" (the Unicode minus was swapped in the PDF only; now there's nothing to swap).

**Plans:**
- **Back line on any box** (Dave changed "front line"): a box shape has a "Back line" checkbox, a thick line on its
  back edge. Racks draw the same thick line on their REAR edge instead of the thin line near the front.
- **Floorplan per level** (P1): the Floor manager has a Floorplan column: any page of a project PDF; pages not
  calibrated in Uploads are listed but disabled ("calibrate in Uploads"). Picking another replaces it, "—" removes it,
  one undo step each.
- **The Uploads crop is applied:** the floorplan is clipped to it, on the plan and in sheet viewports.

**Runs:** a **Location** select in a run's Properties: under floor / ceiling plenum / below ceiling / on wall, with the
Z each gives on this level. It moves the run's main height (drops keep their ends) and sets the tier, one undo step.

**Racks / devices:**
- **Row properties:** the rack's Row line shows the row's name, rack count, Rename… and Containment
  (none / HAC / CAC / combined; the rack BOM uses it).
- **More default devices:** 48-port 2U switch, 1U server, fibre enclosure (24 LC), tower PC (200 mm, 9U), 27"
  monitor; "enclosure" is in the Kind list.
- **Tie labels:** a tie port with no label of its own shows "RackA~RackB:NN", numbered per rack pair. Tests added.

**Blocks:** four built-in faceplates (data / power, single / dual gang). **Delete block…** in an insert's Properties
(or the ✕ in the legend) retires a custom block: hidden from pickers, inserts already placed keep drawing.

**Other:**
- Clicking a layer name makes it current (any layer, not only drawing layers).
- The status bar shows the zoom level.
- Backlog: marked P3 (Dave): cable type per outlet, segment lengths, cord BOM on screen, grid size setting. Added:
  front / rear mounting on purpose, review the device template picker.

**Checks:** 359 cad tests pass; svelte-check clean in cad; live: slab / ceiling lines, faint P3C U42, stacked P3C labels,
1F floorplan cropped, Floor manager Floorplan column.

**After commit 3a370697:**
- **Panel names over ports** (Dave): normal size until zoomed in far enough to read the port labels, then small (a 1U
  48-port panel's label size) and see-through in the top-left corner. Same switch in the PDF. Test updated.
- **Doors on several racks:** the Doors / Hinge fields show for a multi-selection (`ui/RackDoors.svelte`, shared with the
  single-rack Properties): the shared value or "mixed"; an edit sets that field on every cabinet in the selection.
- **Plain hyphens** (Dave): a section viewport's automatic title is "SECTION A-A" (was an en dash and a prime, which the
  PDF fonts lack).
- **Front / rear mounting** (backlog, Dave: P3C U42): a device has an optional `mount` (front / rear). A front-and-rear
  device (a panel) mounted on one side takes only that side of its Us, so it shares them with a device on the other
  side, unless both depths are known and add up to more than the rack's. Set it in Properties (Mount, for 'both'
  devices) or in the Device tool's toolbar before placing. The overlap message says which Mount to set. In the rack
  view a device mounted on the far side is drawn faint where a device on this side shares its U. Test added.
- **Section → sheet** (backlog "Drop a section as a viewport"): the section's Properties (now `ui/SectionProps.svelte`)
  have a Sheet select + "Put on sheet": a new viewport at the largest standard scale (1:20 or further out) that fits
  the drawing area, sized to the cut, top-left; the sheet opens with it selected. Test added.
- **Floorplan zones** (Dave): the Floor manager's Floorplan cell is a list: each floorplan has a zone name (when there
  are several), its page, an X / Y offset (`Underlay.origin`) and ✕; "+ Add zone…" adds another. Several floorplans
  on ONE level — whether zones should rather be separate area levels (as Journey's 33F 3307 is) is in decisions.md.
- **VCMs have doors** too (Dave).
- Backlog: P3 (Dave): review the device template picker, dim the other cords, set any cord status, line grid. Added:
  floorplan zones rotate / drag, blocks in elevations and sections, outlet → block, protect issued uploads.
  Decisions added: zones one model or separate; racks vs cabinets.

**Blocks, node joining, sidebar (Dave):**
- **Blocks panel + Insert tool** (`ui/BlockManager.svelte`, `editor/insertTool.ts`): the block library by category
  with search and previews; click a block, then click in a view to place it (the "Block" tool; stays on, Esc
  stops). Plan: at the click. Elevation / section: the click gives the height (`insert.z`, new), and the block goes
  on the face of the nearest wall behind the click (within a section's depth), turned to face the viewer — a wall
  faceplate; no wall → on the work plane. Inserts draw in elevations / sections at their height, facing you (the
  plan symbol; a separate front drawing is backlog). Insert Properties get Height (Z). An outlet symbol placed as a
  block shows no `{LABEL}` / `{PORTS}` / `{USAGE}` placeholders (`insertAttrs`). Tests added. Live: a power
  faceplate on the IDF1 wall in 1F Section B at Z 900 (Test Project).
- **Join nodes:** a path node dragged onto another node of the same path joins it (`mergeNode` / `joinDropped`):
  dropping a run's end on its start closes it (a triangle / polygon); a node dropped on its neighbour removes the
  segment between them. Shows while dragging; one undo step. The dragged node now snaps to the path's OTHER nodes
  and to the midpoints of segments it doesn't move (it used to skip the whole path, so it couldn't land on one).
  Tests added.
- **Sidebar sections fold:** Levels, Sheets, Racks, Symbols, Blocks and Layers each have a ▾ / ▸ title
  (`ui/SideSection.svelte`), remembered per browser.
- **Checks:** 364 cad tests pass; svelte-check clean in cad.

## 2026-10-05 — editing runs, BOM dialog, logos, issued uploads

**Editing runs** (`editor/pathSel.ts`, `domain/pathEdit.ts`; Dave: a trunk's node dropped on another trunk's node did
not connect them):
- **Two runs join** when a node is dropped on a node of another run of the same kind (trunk + trunk, wall + wall,
  line + line): one run, the dragged one's id; a backbone that chose the other run as its riser (`via`) follows.
  Runs that already TOUCH at the dragged node join as soon as it is dragged (Dave's two trunks near R311, now one
  trunk with three segments). Unlike runs (a wall and a trunk) don't join; their nodes just move together.
- **Joined nodes move together:** other runs' nodes on the dragged point (same x / y and height) move with it;
  Alt-drag moves the node alone. A drag that comes back to its start lands exactly there (no grid shift); a click
  on a grip no longer counts as a tiny drag.
- **Pick a node / segments:** click a node grip → the node is picked; click the selected run again → the segment
  under the cursor (Ctrl adds / drops one). Picked ones show blue. Delete removes just them (a node heals the run;
  segments may split it into separate runs). Dragging a picked segment moves it whole (with other runs' nodes on it).
- **Disconnect** (Properties, a picked node): the segments meeting there separate — the run splits into separate
  runs at that node.
- Tests (`editor/pathSel.test.ts`). Live: the R311 trunks joined; Disconnect split them in three; undone.

**Snaps and readout:**
- **Centre snap** on the plan: circles, arcs, boxes, polygons (corner average), images and blocks (insertion
  point); shown as a small circle. Test added.
- **Length · angle · ΔX / ΔY (ΔZ)** in the status bar (Dave: not at the cursor) while drawing a run / line (from its
  last point) and while dragging (from where the drag started).

**Deleting a section shown on sheets** asks: "Delete, keep viewports as elevations" (the named direction nearest the
section's, same window and scale, recentred) or "Delete with its viewports" — one undo step either way. The question
bar can now offer two answers. Tests added.

**BOM dialog** (`ui/BomDialog.svelte`; Export → "Bill of materials…"): the materials list and the rack BOM — all racks
together or row by row (`rackBom` takes a row) — with totals and product links; tick what goes in the workbook, then
"Export to Excel". Test added (row by row).

**Logos from Uploads** (`ui/LogoPicker.svelte`): a logo slot's "Choose…" opens the project's images to pick from, and
"Upload…" — a new image is also listed in the project's Uploads (under a free name), so it can be picked again.

**Protect issued uploads** (`app/issueGuard.ts`, Uploads): a file an issue uses — a floorplan in a frozen sheet, or
the package PDF — can't be deleted (the toast names the issues); a same-name upload of such a file is kept beside it
("plan (2).pdf") instead of replacing it. Other same-name uploads still replace (keeping their calibration).
Checked live, read-only: L3303's plan is used by "Test issue 1" and "Tender1".

**Backlog:** low priority (Dave): title block approvals / site, Tabs, Help. Not required (Dave): "Outlet → block".

**Checks:** 376 cad tests pass; svelte-check clean.

(Committed bc081a29; a stray generated `src/lib/cad/.svelte-kit/` folder went in with it and was removed in 57b77cd5.)

## 2026-10-05 (2) — shapes, Shift, closing runs, issues, cable schedule, logos as fields

**Shape tool** (`editor/shapeTool.ts`, "Shape" in the tool bar): RECTANGLE (corner to corner), ELLIPSE (in that box) or
regular POLYGON (3–12 sides; centre, then a corner — or an edge's middle when circumscribed). Click-click or
press-drag-release; Shift = square / circle / 15° steps. On a plan: the level's model (current layer). On an elevation
/ section: the level's model ON the view's vertical plane at the work depth (points in (u, z)); drawn in elevations /
sections, not on the plan (shapes on a vertical plane move along it). On a sheet: the paper, or tied to the viewport it
starts in (follows it; untied back to the paper when the viewport is deleted). New `ellipse` geometry. Tests.

**Shift constraints** (`editor/constrain.ts`): 15° steps drawing runs (from the last point; no object snap while held)
and dragging a node (about the node at the other end of its segment) or a branch; H / V moving things and segments.
Junctions keeping all their segments on 15° is left (backlog, P3).

**Runs:** C (or a click back on the first point, 3+ points) CLOSES a run — a room's walls, a loop. A picked
segment's own width / height (a reducer, a taller wall panel) in the picked box of the run's Properties; "as run" drops
it. Tests.

**Title block logos are FIELDS** (Dave): "Our logo" / "Client logo" are rows in the field list — dragged into place
like any field, full or half width; they print only the image (a full-width row is as tall as its logo). "Add a
field…" offers them; ✕ removes the field and its image. Templates from before keep their logos, as the first rows.
The Logo section keeps the logo text. Tests.

**Issues:** each issue has a number (1, 2, 3 …; older ones count in date order), editable in the Issues list, in the
transmittal and in the package PDF's / reprint's file name ("Issue 03"). Sheet Properties list a sheet's issued
revisions, each with "Print" — that sheet exactly as issued (its frozen copy). Tests.

**Cable schedule** (Export → "Cable schedule…", `ui/CableScheduleDialog.svelte`, `domain/cableSchedule.ts`): one row
per link — label, kind, from, to, cable, route m, slack, installed length, the 90 m flag / no route — with totals and
"Problems only"; then Excel. Tests.

**Split:** the Outlet tool moved out of `editor/tools.ts` into `editor/outletTool.ts` (tools.ts was over the size limit).

**Checks done (backlog test tasks):**
- **Rack doors in the PDF:** S003's sheet PDF, made in the page and viewed without downloading, shows R303's split
  front door and single rear door swings (and the R31x cabinets' doors).
- **Patch changes in the patch schedule:** an add, a move (re-patch) and a removal each land in their group in work
  order (remove → change → add) with "Was From / Was To" for the moved / removed cords — a test.
- **Live interconnect run:** R311 U39 ports 23–24 (1F IDF2) → 4AR01 U21 ports 1–2 (4F Server room A): two BACKBONE
  links, ports in step, "choose the riser in Port Properties". To r1 (4F Server room B) only one fitted (port 24 + 1
  ran off the panel: skipped with the reason) and its route said "the far panel is not in a placed rack". Routes:
  "the runs at the two ends are not connected" — Test Project's 1F IDF2 trunks and 4F racks aren't joined to Riser A
  by containment (a data matter). Links undone afterwards.
- "Rack BOM by row" closed (Dave): the BOM dialog's row-by-row view covers it.

**Checks:** 387 cad tests pass; svelte-check clean. Live: a rectangle drawn on the 1F plan (then undone).

**Resize grips on shapes** (Dave; `editor/shapeGrips.ts`): a selected rectangle shows its 4 corners (the opposite
one stays; Shift = square) and 4 edge middles (that side moves; a turned rectangle along its own axes); an ellipse its
4 axis ends (the centre stays; Shift = a circle); a circle 4 radius grips; a polygon its corners. Shown on the plan,
on the elevation / section a shape was drawn on, and on sheets (also for shapes tied to a viewport); snapped like any
point. One undo step per drag. Tests (`editor/shapeGrips.test.ts`, 393 pass). Live: a rectangle on 1F resized by its
corner, then undone.

## Batch: notes everywhere, dimensions, groups, several runs, cable lists (Dave 2026-10-05: "do 4 6 12 15 16 22")

Import Pages sheets (7.2) and import Sheets-tool sheets (7.3) marked P3 (Dave).

**Notes on plans and diagrams:** Text / Leader / Cloud now work on plans (in the level's model, current layer) and
on elevations / sections (on the view's plane, like the Shape tool), as well as sheets. Note Properties
(`ui/NoteProps.svelte`, split out of Properties) add Colour (all notes) and Background (text: a filled box behind
it). The riser view is generated from the data and has no editable model, so notes don't go there.
`editor/noteTool.ts` exports `placeNote` / `notePoint`, which the Dim tool shares.

**Dimensions** (`editor/dimTool.ts`, "Dim" button; `ui/DimOptions.svelte`): click the two points (snapped), then
where the dimension line goes. It measures along the points, or only horizontally / vertically. It reads in mm below
1 m, else m; extension lines, 45° ticks and the text upright. Works on plan, elevation / section and sheet /
viewport. Properties: what it measures, and a text override. A viewport's dimension that goes back onto the paper
keeps its real length as text.

**Group / ungroup** (`domain/groups.ts`): Ctrl+G groups the selected shapes (old groups they leave and that end up
empty go), Ctrl+Shift+G ungroups; Group / Ungroup buttons in Properties. A click, Ctrl-click or window on one member
selects the whole group, so it moves as one. Deleting all of a group's shapes deletes the group; a copy of a group
pastes as a new group.

**Several runs at once** (`ui/RunsMultiProps.svelte`; the rules shared with one run's Properties moved to
`domain/runEdit.ts`): kind, width / height (or diameter), location (each run from its own level's heights), tier and
colour. A field shows the value the runs share, or "mixed"; each edit is one undo step. Runs now draw in their own
colour on the plan, and a segment's own size draws (a reducer) — both were stored but not shown before.

**Cables (n)** (sidebar, `ui/CableList.svelte`; `domain/cableList.ts` `cableGroups`): the backbone and tie cables,
one row per panel pair and cable type, lowest floor first. Each row shows a jacket-colour swatch (OS2 yellow, OM3 /
OM4 aqua, OM5 lime, OM1 / OM2 orange, copper grey), "n × type" and "1F → 4F (2 transit)". A click selects the links,
and their routes light up on the plan.

**Links tab** (bottom, `ui/LinksTable.svelte`; `linkRows`): every permanent link with kind (run / tie / backbone
chips), panel end, other end, label, cable type (editable, suggests the types in use), length, status (design /
installed, editable) and ✕ remove (undoable). Find, kind and status filters; a click selects (Ctrl / Shift add). The
first 500 rows show, then "narrow it".

**Checks:** 405 cad tests pass (new: `editor/dimTool.test.ts`, `domain/groups.test.ts`, `domain/runEdit.test.ts`,
`domain/cableList.test.ts`); svelte-check clean. Live check not done: Chrome stopped responding.

Committed as 849148b4. Also: blank space in the side and bottom panels no longer selects text on a drag (tables
still do).

## Batch: blocks legend, nodes, issues, print order, several shapes, draw order, points, text, cable types (Dave 2026-10-05: "(a) … do 7 11 12 14 16 17 18 19 22")

Marked P3 (Dave): the cord workflow (was P1), own cable type for new links, port hover tips, re-allocate pinned ports,
show all routes, snap to rack corners, layer line type / lineweight, finish the soft retire.

**Blocks and Symbols merged** (Dave chose (a)): the Symbols list is gone (`ui/Legend.svelte` deleted). The Blocks panel
has Library / "On this level (n)": the blocks the open level uses (outlet symbols and inserts) with counts. Each has
a "show in the legend" checkbox (Dave), stored per project as `settings.legendOmit`, ready for "Legend on the
drawing".

**Several nodes:** Ctrl-click node grips adds / drops them (Ctrl-DRAG still branches). Delete removes them all and heals
the run, one step. The picked box says "n nodes picked".

**Section Properties → On sheets:** the viewports that show the section; a click opens that sheet with the viewport
selected.

**Edit an issue:** Edit / Done on an issue row makes its name, note, purpose (suggested list shared with the Issue
panel, `ISSUE_PURPOSES`) and recipient editable. The frozen copies and the PDF stay as issued. The note now shows under
the name.

**Print order:** the register's "#" column (sortable) and ▲ / ▼ to move the selected sheets as a block
(`moveInPrintOrder`, renumbering 10, 20 …). The table sorts by # when you move; the PDF follows the table.

**Several shapes at once** (`ui/ShapesMultiProps.svelte`): colour, text size (the texts among them), Z (shapes and
inserts on the plan), height (boxes), "mixed" where they differ. A shape's own colour now draws for EVERY kind of shape
(`ownColour` in `views/plan.ts`; it was notes only).

**Draw order:** Ctrl+] / Ctrl+[ bring forward / send backward, with Shift to the front / back (`reorderShapes`). Only
the moved shapes are written (no renumbering of a level's shapes). Plans and sheets draw shapes in that order; on an
elevation it orders notes on the same plane.

**Points of notes:** leaders, clouds and dimensions have grips everywhere they show (plan, the elevation they're on,
sheet / viewport) through the shape-grip code; this replaces the old sheet / plan note point grips. A dimension also
has a grip on its line's middle that sets the offset. Shift = 15° from the neighbouring point. Dragging a leader's tip
lets go of what it pointed at. A two-point line / run has a Length field (the second end moves along it).

**Text options:** multi-line text (one line under another, background box around all of them). Align left / centre /
right on its point, size in mm or pt, and a multi-line Text field in Properties. Double-click a text (or a leader's
words), or F2 with it selected, to edit it in place (`ui/TextEditBox.svelte`): Enter saves, Shift+Enter is a new line,
Esc cancels.

**Cable types** (Levels header → "Cable types…", `ui/CableTypesDialog.svelte`, `domain/cableTypes.ts`; the two
backlog entries merged): label, media, colour, outer diameter (fill uses it), the defaults for new outlets / cords, add,
delete (refused while outlet ports or cords use it, or it's a default — the reason on hover). One undo step each.

**Checks:** 416 cad tests pass (new: `domain/drawOrder.test.ts`, `domain/cableTypes.test.ts`, print order, several
nodes, note points, multi-line text); svelte-check clean.

Live (Test Project, 1F):
- Blocks "On this level" listed 7 blocks with counts and ticked legend boxes.
- Cable types: Cat6A 114 ports and Cat6 60 ports can't be deleted, OS2 2 cords can't, MPO-12 can.
- The register shows "#".
- A text placed, double-clicked: the box opened on it. The first save hit a bug: the shape was read after the edit
  state cleared; fixed. Then F2 made it two lines, drawn one under the other. Both undone.

## Fixes and follow-ups (Dave 2026-10-05)

- **Legend checkboxes removed** from the Blocks panel (and `settings.legendOmit`): each legend will choose its own
  symbols / layers ("Legend on the drawing" updated).
- **Fill color** for rectangles, circles, ellipses and polygons. Single and multi Properties have Color (By layer) and
  Fill (None). A fill draws as a `shape-fill` prim under the outline, on screen and in PDF; DXF gets the outline only.
  It also draws on regions on an elevation's plane, and stays visible while selected. `withStyle` / `withFill` are in
  `domain/shapes.ts`.
- **Color dropdown everywhere** (`ui/ColorPick.svelte`, wrapping `$lib/ui/ColorPicker` in cad's theme):
  - Used by notes, shapes, several shapes, several runs, racks, cords, the cord tool bar and cable types.
  - Palette = the Sheets layer palette plus a bright yellow and white, 7 per row.
  - Layer swatches in the Layers panel stay as they were (a compact swatch, not a field).
  - Labels say "Color" (Dave); data fields like `cord.colour` keep their names.
- **TR1's fill rows** (Dave: "3 segments, only the first can be selected"): the Fill list's rows were not clickable and
  the section picture always showed the fullest segment. A row click now picks that segment in the run and shows its
  section; picking a segment in the view shows it too. (Clicking and segment-picking all three on the plan worked
  live.)
- **Double-click on a text** works in Select. With the Text tool still active, a click on a text placed another one;
  the Text tool now edits a text it's clicked on.
- **New text:** no tool-bar prompt. The text goes down as "Text" with its box open and the word selected to type
  over. Leaders still ask for their words in the tool bar.
- **Dialogs closing on a drag:** a drag-select that started in a field and ended outside the dialog closed it. All five
  dialogs (BOM, cable schedule, cable types, floors, logos) now close only on a click that starts and ends on the
  backdrop (`ui/backdrop.ts`).

Checks: 417 cad tests pass; svelte-check clean. Live (Test Project 1F), each test edit undone:
- Cable types survives a drag ending on the backdrop, and closes on a real backdrop click.
- A rectangle filled yellow from the dropdown (27 swatches).
- The Text tool opens "Text" selected, with no prompt.

## Batch: callouts, wrapping text, move / copy, attributes, labels in place, usages, find, re-issue, sections list, elevation edges (Dave 2026-10-05: "do 3 4 5 7 8 10 12 14 16 17 21 22")

Image opacity / crop / greyscale marked P3. New P3 todo: a fill-rate drawing as a viewport from a trunk's Properties.
The resizable split bar (#26) is NOT done: the two panes are a fixed 50 / 50.

**Fixes first:**
- **Double-click in Select did nothing** (F2 worked). There were two causes:
  - The box opened on the press, and the click's own mousedown then took its focus, so it saved and closed. It now
    opens on release.
  - Clicks were counted by HANDLING time. After the first click selects something heavy (an outlet: Properties, the
    grid), the second press was handled more than 400 ms later and counted as a single click. ViewCanvas `pressCount`
    now uses `e.timeStamp`.
  - A double-click's pointer-down no longer selects words on the drawing either.
- **The edit box** follows centre / right alignment, and grows with its lines (`field-sizing: content`, rows / cols
  fallback).

**Built:**
- **Callouts:** a leader can have a border round its words: none / underline / box (Properties). Pressing at the tip and
  dragging to where the words go makes a two-point callout. Leader words can have several lines.
- **Leader words on the drawing:** no tool-bar prompt; the in-place box opens at its end.
- **Text that fills a box:** Box width in Properties. The text wraps at spaces (and between any CJK characters) and an
  unturned one is clipped to the box; the background box takes that width. Also in PDF. `wrapLine` is in
  `views/plan.ts`.
- **Move / Copy** (`editor/moveTool.ts`, tool-bar buttons):
  - Click a base point (snapped), then the second point: snapped, Shift 15°, or typed `@dx,dy`.
  - Move goes once, one undo step.
  - Copy keeps placing copies (each an undo step) until Enter / Esc, using the clipboard's clone (new groups,
    references).
  - A ghost of the selection follows the cursor.
- **Block attributes on inserts** (`ui/InsertAttrs.svelte`, `blockAttrDefs`):
  - Every attribute the block declares or uses as `{TAG}`, with its value, for one insert or several ("mixed").
  - "Shown" unticked hides it: the value is kept as data but not drawn (`insert.hidden`). Defaults come from the block.
- **Edit a label in place** (`domain/labelEdit.ts`, `ui/TextEditBox.svelte`):
  - Double-click or F2 on an outlet (label; its ports follow, asking first for printed panels), a rack (name), a run's
    label (double-click on its words), a text or a leader.
  - Enter saves. Tab / Shift+Tab save and go to the next / previous of the same kind in reading order. Esc cancels.
- **Usages** (Levels → "Settings…", which now has Usages and Cable types tabs, `ui/SettingsDialog.svelte`;
  `domain/usages.ts`):
  - Code, label and color, with what uses each. Add a code. Delete is refused while outlets or panels use it.
  - The legacy import now adds every usage code it meets (RS / FR / WC / LK / custom), with the old tools' colors.
- **Find a device / panel** (top of Racks): matches by name / model / rack, project-wide. Enter opens its room's rack
  view on its side, zoomed to its rack, with it selected. `ws.focus` is now reactive and the fit effect tracks it; set
  after the view switch, or the old plan view took it.
- **Re-issue…** on an issue row: its sheets (those still here and not archived) are selected in the register and the
  Issue panel opens.
- **Sections (n)** in the sidebar: every section by level, with how many sheets show it. A click opens it, going to its
  level, and selects it, so Properties → Put on sheet makes a viewport. (Run fill sections aren't entities, so they're
  not listed.)
- **Wall / opening edges in elevations** (`editor/elevHandles.ts`):
  - A selected wall seen side-on has squares on each segment's top (height) and bottom (Z; the top stays).
  - Each opening has its top (height) and sill (Z; the top stays).
  - 10 mm steps, Alt free. A slab-to-slab wall has no top square.

**Checks:** 434 cad tests pass (new: `editor/moveTool.test.ts`, `editor/elevHandles.test.ts`, `domain/usages.test.ts`,
`domain/labelEdit.test.ts`, wrap / callout tests); svelte-check clean.

Live (Test Project):
- Find "PP2" opened 4F Server room A with 4AR01 centred and PP2 selected.
- Sections (2) listed.
- Settings → Usages showed each usage's outlets / panels.
- A real double-click on outlet A.003 opened its box; Tab went to A.002; Esc.
- No edits were saved.

## Split bar, label-edit hints, sorted lists, title block items as fields (Dave 2026-10-05)

- **Resizable split bar:** a bar between the two split views; drag to share the width (15–85 %, kept per browser in
  `Panels.split`), double-click for equal.
- **Edit in place, made known:** opening the box says "Enter saves · Tab / Shift+Tab: save and edit the next /
  previous outlet (rack, run, text) · Esc cancels"; the Select hint mentions it; the Help backlog entry must feature it.
- **Cable types and usages A → Z** in the Settings dialog and every dropdown (`sortedCableTypes`, `sortedUsages`).
- **Title block** (Dave: "where did the client logo field go?" — a logo was only listed once it had an image):
  - The two logo images, the logo text and the company block are always in the field list, so each is dragged into
    place like a field.
  - They can't be removed: clear them, or switch their section off.
  - A logo can be half width (two side by side); the logo text and company block are full width.
  - Templates from before keep their top-to-bottom order (logos, logo text, company, then fields) until something is
    dragged. The separate logo / company sections are gone from the drawing code: they're cells (`kind`).

Checks: 434 cad tests pass; svelte-check clean. Live: the split dragged to 30 / 70 and back with a double-click; S001's
title block editor lists Client logo, Logo text, Company, Our logo, then the fields.

## Batch: overlaps, legend, box tool, new layers hidden, sheet from a view (Dave 2026-10-05: "do 4 10 13 17 18")

Marked P3 (Dave): issue register for the PM, devices list per rack, usage colors / port counts / hover tips, drag racks
from the list, hover a cord.

- **U overlaps with a warning** (`overlapAllowed`, `clashUs` in `domain/devices.ts`):
  - Two devices on the same side may share Us when either is a shelf, or has "May overlap" ticked (device Properties
    → Overlap). Otherwise the overlap is refused as before.
  - The rack view marks the shared Us: the numbers bold red with "!" (screen and PDF).
- **Legend** (Legend tool; `domain/legend.ts`, `views/legend.ts`, `ui/LegendProps.svelte`; a `legend` shape kind):
  - Click to place it on a plan (it lists that level) or a sheet's paper (it lists the levels its viewports show).
  - A framed table: title, then a row per symbol (the block's own drawing, its name and count) or layer (a color
    swatch, its name and item count).
  - Each legend picks its own rows in Properties (ticks; All symbols / None); by default it shows every symbol in use.
  - It redraws itself from the data, so screen, PDF and DXF match. It sits on the Notes layer.
  - Block previews (here and in the Blocks panel) no longer show their `{TAGS}`.
- **Box / desk tool** (the Shape tool as `box`, plan only):
  - Footprint rectangle / ellipse / polygon, with Height (750 by default) and Z in the tool bar.
  - A single region on the plan now has Height and Z in Properties.
  - Boxes show in elevations and sections.
- **New layers start hidden in existing drawings** (Dave's version of "Hide in new viewports"; `freezeInExisting`): adding
  a layer freezes it in every existing viewport, in the same undo step, so issued / finished sheets don't change when
  something is drawn on it. Viewports made later show it.
- **A sheet from the current view:** each non-sheet pane bar has "To sheet…".
  - "New sheet from this view", or "On S00x" for an existing sheet.
  - Makes a viewport centred where you're looking, at the largest standard scale it fits at (`viewViewport`).
  - The sheet opens with the viewport selected. One undo step.
  - The spec is snapshotted: the store freezes it, and a `$state` proxy can't be frozen. The first live try threw on
    that and nothing was saved.

Checks: 441 cad tests pass (new: `domain/legend.test.ts`, `domain/overlap.test.ts`); svelte-check clean. Live (Test
Project 1F), all undone:
- A legend listed 7 of the 14 rows (the symbols, with counts).
- A box got Height 750 / Z 0.
- "New sheet from this view" made S006 with the plan at 1:50.

## Boxes in elevations, then: box widths, doors on boxes, shape style, lineweights in print, logo grips, PDUs (Dave 2026-10-05)

**Boxes in elevations** (Dave: couldn't drag a box up / down or resize it there):
- A box at Z 0 has no `plane`, and a move only changed Z when a plan plane was already there; `moveBy` now gives it
  one (and an insert its own Z).
- A selected box has top / bottom squares (height; Z with the top kept) in elevations and sections.
- On "walls block everything": a wall-last / smallest-first pick rule was tried, then taken out. Dave will use sections
  for vertical edits.

Marked P3 (Dave): quick switcher, Project Properties, Floor manager, Journey tidy-up (was P1), section top / bottom +
hatching, connection points on boxes, RCP, riser view control.

- **Box grips in elevations, the rest:** left / right squares at the box's sides as seen: drag one, the other stays.
  Rectangles change their local axis nearest the view (also from angled views), ellipses that radius, circles their
  radius (`widthDrag`).
- **Doors on boxes:**
  - Rectangles have `doors` like racks: front / rear single or split, and the hinge side.
  - Drawn open on the plan by the shared `doorPrims` (racks use it too).
  - The Doors row (RackDoors) works for boxes, one or several.
- **Shape style:**
  - Line type (solid / dashed / dotted / dash-dot) and lineweight (mm) per shape (`style.dash` / `style.weightMm`):
    in Properties for one or several shapes and for plain lines (which also get Color).
  - `ownStyle` puts them on the prims (`weight`, `dash`); text takes only the colour.
  - On screen a lineweight shows as mm × 3.78 px, CAD-style.
  - DXF gets DASHED / DOTTED / DASHDOT linetypes at the plot scale. It has no lineweights: the writer has no field.
- **True lineweights in print:** the PDF uses a shape's own lineweight (mm) and dash pattern.
- **Logo grips on the paper:** with a sheet selected, each title-block logo has a square on its bottom edge. Drag it to
  set the logo's printed height (3–60 mm, the project's template) (`editor/logoHandles.ts`). Dragging / resizing
  IMAGES waits for the image tool (moved into Markup kinds part 4).
- **0U PDUs:**
  - A PDU has a side (left / right as seen from the front; mirrored from the rear), power inlets (drawn red at its
    bottom) and sockets (along the strip). Its name runs up the strip.
  - Dragging it across the rack switches sides; up / down moves it as before.
  - Device Properties has Side / Inlets / Sockets.

Checks: 450 cad tests pass (new: `views/style.test.ts`, PDU / box width / box handle tests); svelte-check clean. Not
tried live: the logo grips and PDUs (the Test Project rack view checked has no PDU).

## Box grips, cord BOM, select similar, panel PDF, viewport tool (Dave 2026-10-06: "do 1 14 16 27 30")

Marked P1 (Dave): cords drawn along the cable channels. Marked P3 (Dave): LR import notes, old cord ends check, riser
floor / ceiling check, version-model ADR, shape style, label format, rack order, device library builder, port drag
select, more snaps, DXF for every view, revisions and packages, viewport handling, more viewport types (its one-row
picker was already built).

- **Box grips in elevations look like the plan's** (Dave: "nothing like the grips on floorplans"): a box's top / bottom
  / side grips were the blue-and-white handle squares; they're now the amber shape-resize grips, at the size of a
  rectangle's edge-middle grips on the plan (a new `'grip'` handle shape, `editor/elevHandles.ts`).
- **Cord BOM on screen** (`ui/CordBomDialog.svelte`, `cordBom` in `domain/reports.ts`): the patch list's "Cord BOM…"
  opens a dialog of cords by type × length, a column per status, with totals; All rooms / the room; "changes only".
  "Export to Excel" (the patch schedule + BOM) moved into it from the patch list's tool bar. The Excel's BOM sheet now
  counts with the same `cordBom`.
- **Select similar** (`domain/similar.ts`; Properties → Select similar): selects everything the active view shows
  like the selection — the same block; the same role / drawn kind on the same layer; racks / devices of the same kind;
  otherwise the same type. `selectAll` and it share `pickable()` in ViewCanvas.
- **Printed panels with their labels** (`views/panelSheets.ts`, `downloadPanelSheets` in `app/sheetsPdf.ts`): Racks →
  a room's ⋯ → "Print panels with labels (PDF)…": A4 landscape pages, each panel a 24-across grid of its ports with the
  port number and the label stacked as large as it fits; panels in fill order (`panelsInFillOrder`, shared with the
  label Excel), as many to a page as fit; then the same "Mark printed" offer as the Excel.
- **Viewport tool** (`editor/viewportTool.ts`, `boxViewport` in `views/sheet.ts`): on a sheet, drag (or click two
  corners) a box, whole mm, at least 20 × 20. It shows the other pane's view, else the last plan / elevation / rack
  view looked at, else the level's plan — centred on its content at the largest standard scale that fits. One undo
  step; the viewport is selected; back to Select.

Checks: 459 cad tests pass (new: `domain/similar.test.ts`, `views/panelSheets.test.ts`, `editor/viewportTool.test.ts`,
cord BOM test); svelte-check: none in cad. Live (Test Project 1F): a box in the Front elevation showed 4 amber 6 px
grips; Select similar picked the 4 rectangles on Walls; the Cord BOM dialog listed 7 lines (43 cords); a dragged
viewport on S003 came out 73 × 48 mm showing Elevation front, then undone. Not tried live: the Excel and PDF downloads
(the panel PDF is rendered in a test).
- **Logo grip only when the logo is picked** (Dave: "why is logo resize grip permanently on? and why is it different
  from all other grips?"): it showed whenever the sheet was selected, which is any click on the paper, and it used
  the blue / white handle style. Now a click on a logo picks it (a dashed amber outline; "Logo: drag the grip…"), and
  only then its bottom-edge grip shows, as an amber resize grip; a press anywhere else drops it
  (`logoBoxes` / `logoAt` / `logoHandles(…, key)` in `editor/logoHandles.ts`). Live (S001): clicking the title block
  showed no grip; clicking the logo showed the outline and one amber grip.

## UX remediation, Phase A: quick fixes (Dave 2026-10-06: "implement as much as you can in all phases", `../plan/ux-review.md`)

- **UX09 The selection follows the view:** showing another view in a pane lets go of whatever neither pane draws
  (`setPane` in CadShell asks each canvas `draws(id)` after the switch). Live: a sheet selected, then Plan → Properties
  "Nothing selected".
- **UX13 Fit means the content:** Fit / Home and the first fit leave out the datum lines (`contentBounds` in
  ViewCanvas); a restored camera that shows none of the content fits once instead. Live: the IDF rack view opened with
  every rack on screen.
- **UX10 Lists follow the canvas:**
  - the outlet grid scrolls to the selected outlet (as the patch list does);
  - the open level's row is outlined, not filled, while a sheet or the riser view is open ("not showing");
  - the bottom panel follows the view kind — sheet → Sheets, rack view → Patch list, else Outlets — and a tab you pick
    in a kind of view is kept for that kind. Live: plan → Outlets, S001 → Sheets, rack view → Patch list; Links picked
    on S001 came back on S001.
- **UX24 Words:** Racks list "Elevation" → "Rack view"; the Block tool button → "Insert"; "Dim" → "Dimension"; "Is a"
  → "Kind"; "rack elevation" → "rack view" in hints and titles.
- **UX20 Location presets in the tool options:** Trunk / Conduit options have the level's Locations (under floor,
  ceiling plenum, below ceiling, on wall) beside Z, as Properties does. The tool options moved out of CadShell into
  `ui/ToolOptions.svelte` (the first part of the shell split).
- **UX01** waits for the windows (S2), as the screen direction says.

Checks: 459 cad tests pass; svelte-check: none in cad.

## UX remediation, Phase B: the shell (`../plan/ux-review.md`)

- **B0 The split:** `SelectTool` moved to `editor/selectTool.ts` (`editor/tools.ts` 600 → 120 lines: the interfaces and
  helpers); CadShell lost its tool options (`ui/ToolOptions.svelte`), tool buttons (`ui/ToolStrip.svelte`), prompt /
  hint / question (`ui/StatusBar.svelte`, `ui/AskBox.svelte`); ViewCanvas lost its view strip (`ui/ViewStrip.svelte`)
  and its corner readout.
- **UX05 Status bar** under the panes: the prompt (a number, a name, a typed point; Enter / Esc) or the latest message
  or the tool's hint; length · angle while drawing; X / Y (Z); **SNAP** (F9) with the grid step (1–1000 mm),
  **OSNAP** (F3), **GRID** (F7, a line grid every step, ×10 coarser until lines are 8 px apart, every 5th darker; plans,
  elevations, sections); scale · zoom; Fit. The switches are kept per browser (`ws.drafting`). The grid step now
  drives every model snap and move (`ToolCtx.grid`; OSNAP off = `SnapOpts.noObjects`). Alt still skips snaps once.
- **UX04 Questions over the drawing:** "Delete … ?" is a box at the top middle of the drawing, Enter = the first
  answer, Esc = Cancel (`AskBox`). Esc also closes an open prompt. Live: delete-level on 4F asked there; Esc → nothing
  deleted.
- **UX06 Hover:** the Select tool shows what a click would take — a light-blue outline (a port: just its cell) — and
  the cursor says what a press does: crosshair on a grip, move on what moves, pointer on the rest. Live: an outlet
  outlined under the pointer, cursor "move".
- **UX07 / Q5 One selection colour (Dave: as the Sheets tool):** selection blue `#2563eb` (was amber; orange is high
  runs, amber the cord trace); every grip white with a blue edge, 8 px, a picked node filled blue; round grips
  (swing, depth) the same look, round. Selected viewports blue.
- **UX03 Tool strip (Dave: icons + groups):** icons (Pages' names) in fixed groups — Select / modify · Draw · Annotate
  · Building · Cabling · Sheet; a tool that doesn't work here is greyed with "works in …" in its title, so nothing
  moves. Undo / Redo / Delete / Split / panel switches became icons.
- **UX12 (part) Views:** the strip over each pane has back / forward (‹ ›, Alt+← / Alt+→, per pane, a deleted sheet
  skipped), a breadcrumb (1F · 1F › IDF1 · S001 New sheet; the level is a link back to its plan), and only the
  buttons that fit the view (a rack view: Racks front / rear, rows; a sheet: its paper).

Live check (Test Project): two racks deleted by test clicks (no devices, so no question) were undone at once; the
project saved. No other writes.

Checks: 459 cad tests pass; svelte-check: nothing in cad.

## UX remediation, S2 windows + S4 menu bar (+ Help, the title block dialog) (`../plan/ux-review.md`)

- **S2 Windows** (`app/windows.svelte.ts`, `ui/CadWindow.svelte`; Dave: the Sheets tool's floating windows):
  - Navigator (levels, sheets, sections), Properties, Layers, Blocks, Racks, Cables are windows.
  - A window is closed, docked in the left / right column (stacked, sharing the height — today's side panels) or
    floating over the drawing. Drag a floating window by its title; drop it on the drawing's left / right edge (a blue
    bar shows) to dock it; drag a docked one's title out (or ⇱) to float it. Fold (▴ / double-click the title),
    resize a floating one by its corner, × closes it; it comes to the front on a press. Esc never closes a window.
  - Default: Navigator docked left, Properties docked right, the rest closed. Blocks opens with the Insert tool, Racks
    in a rack view — unless you closed them this session.
  - Ctrl+. (or the ⤢ button) hides every window and the tables, and brings them back. Window › Reset layout.
  - Kept per browser. Floating windows stay reachable when the browser or the drawing area shrinks (a resize
    observer clamps them: the title stays in, at least 120 px of it across; too big ones are cut to fit).
  - Not `$lib/ui/Window.svelte`: it's the Sheets tool's (bug-fix only), keys its storage by title and has no close,
    docking columns or front-to-back order; the cad window copies its frosted look.
  - Limitation: dragging a docked window out pops it out under the pointer; drag it again to place it.
- **S4 Menu bar** (`ui/MenuBar.svelte`, `ui/cadMenus.ts`): File (exports, PDF of all sheets) · Edit (undo / redo,
  cut / copy / paste, delete, select all / similar, group, draw order) · View (fit, split, back / forward, the tables
  Ctrl+,, hide all windows Ctrl+., fill, SNAP / OSNAP / GRID) · Insert · Cabling (tools, the tables, cord BOM, cable
  schedule, BOM) · Sheets (new, from this view, title block, register, PDF) · Project (Floors, Settings) · Window
  (each window with its tick, hide all, reset) · Help. Items show their keys and a tick when on; Esc closes a menu.
  The old Export menu is now `ui/Exports.svelte` (headless: its functions and dialogs), with the cord BOM added.
  "Saved" sits at the menu bar's right. Paste says to use Ctrl+V (the browser allows paste only from the keyboard).
- **UX22 Help** (F1, ? for the keys; `ui/HelpDialog.svelte`, `ui/helpContent.ts`): how-to answers — label editing
  with F2 / Tab first and marked "very useful" — keys and mouse, function keys, typing points, and every tool with
  its hint (click one to pick it); one search box.
- **UX11 (part) Title block in a dialog** (`ui/TitleBlockDialog.svelte`, decision (a)): Sheets › Title block…, or the
  "Title block template…" button in a sheet's Properties (the ~25 template rows left sheet Properties).
- CadShell back to 500 lines: the Delete / draw order / group actions went to `app/selectionActions.ts`, the tool
  hints to `ui/toolHints.ts`, the levels list to `ui/Navigator.svelte`.

Live (Test Project): Window › Layers floated; Dock on the left stacked it under the Navigator; hide-all left only the
drawing; F1 opened Help with the label-editing answer first; Sheets › Title block… opened the dialog; Reset layout
put the defaults back. No data written.

Checks: 464 cad tests pass (new: `app/windows.test.ts`); svelte-check: nothing in cad.

## UX remediation, S5: editing inside viewports (UX17) + the viewport chip (UX18) (`../plan/ux-review.md`)

- **Edit the model through a viewport** (`views/vpFrame.ts`, ViewCanvas; Dave: "editing inside viewports, from both
  Pages and Sheets"):
  - Double-click a viewport (or its chip's "Edit inside") to enter it. The paper dims round it, its frame turns blue,
    the status bar says "editing Plan at 1:50", and the tool strip offers that view's tools (plan, elevation, section,
    rack row).
  - Inside, the tools work in the viewport's view: clicks go through `fromPaper` to the view's mm, picking / snapping
    / hover use the view's own prims (the user's frozen layers left out), tolerances scale with 1:N; previews, grips
    and the selection are drawn back onto the paper (`onPaper`, clipped to the window). Undo, Delete, Properties,
    copy / paste (to its level) work as in the view itself.
  - Leave with Esc (the first Esc clears the selection), a double-click outside the window, Done on the chip, or by
    showing another view in the pane. Clicks outside the window do nothing while inside (frame-only picking, decided
    (c)). Entering opens the viewport's level.
  - Not yet: the in-place label editor (double-click / F2) inside a viewport — edit those labels in the view itself.
- **The viewport chip** (`ui/ViewportChip.svelte`, UX18; Dave: "Alt is not intuitive, I prefer the pan/zoom content
  toggle"): on the selected (or edited) viewport's corner, at screen size: its scale (pick 1:N), **Pan / zoom
  content** (on: a drag inside the viewport pans its view and the wheel steps its scale — no Alt; Alt still works
  once), and Edit inside / Done.
- ViewCanvas's overlays (selected ports, circuit trace, fill bands, routes, the other pane's work plane) moved to
  `views/overlays.ts`.

Live (Test Project, S001): a double-click on empty plan inside the viewport entered it (dimmed paper, blue frame, chip
"Done", 20 tools); a click picked a dimension in the model (Properties: Dimension, grips drawn on the paper); Esc,
Esc left it with the viewport selected. No data written.

Checks: 464 cad tests pass; svelte-check: nothing in cad.

## UX remediation, S3: the Navigator tree (`../plan/ux-review.md`)

- **One tree for the model and the sheets** (`domain/navTree.ts`, `ui/Navigator.svelte`; Dave: "Pages' tree is the
  right idea, but it must make models and drawings easier to find"):
  - Buildings › levels (with their outlet count) › Plan, Front / Rear / Left / Right elevation, the level's sections,
    its server rooms (n racks) › rows and racks; then the riser view; then Sheets (n), grouped by place when there's
    more than one, each sheet unfolding to its viewports (with 1:N).
  - A click opens the row's view in the active pane (its level first); a rack opens its room's rack view zoomed to it
    and selected; a sheet, rack or section is selected.
  - The search box (Ctrl+K, View › Find…) filters as you type: matches with their parents, all unfolded.
  - The open view's row is marked and its branch unfolds; folds are kept per project in this browser.
  - Row actions on hover: level ✎ / ✕; Floors… / Settings… on the building; + New / PDF all on Sheets.
- Replaces the Levels / Sheets / Sections lists (`SheetList.svelte`, `SectionList.svelte` removed). The Racks window
  stays for room actions (+ Server room, Place, labels, Find a device).

Live (Test Project): "R31" left Test Project › 1F › IDF2 › R311 / R312 / R313; clicking R312 opened the IDF2 rack
view (marked) with R312 selected. No data written.

Checks: 466 cad tests pass (new: `domain/navTree.test.ts`); svelte-check: nothing in cad.

## UX remediation, Phase C: Properties, right-click menu, typed angles, grips (`../plan/ux-review.md`)

- **UX11 Properties header and groups** (`ui/PropsHeader.svelte`, `ui/PropGroup.svelte`): a header with the kind's
  icon and word (Rack, Trunk, Box, Viewport, n items …), its name / label and layer, and Select similar + Delete as
  icons (the bottom Delete button and the per-kind title lines are gone). Racks, devices and drawn shapes have
  folding groups — rack: General · Position and size · Room, row, level · Product and notes; device: General ·
  Position · Product and size · Ports and labels; shape: General · Style — remembered per kind of thing in this
  browser. (Outlets, runs, sheets, cords and notes keep their own panels for now.)
- **UX21 Right-click menu** (`ui/ContextMenu.svelte`; Dave: "ok for context-menu, but keep right-click = Esc while
  drawing"): a right-click on something SELECTED (Select tool) opens its commands with their keys — Edit label (F2),
  Cut, Copy, Delete, Select similar, Group / Ungroup and draw order for shapes, Properties. Anywhere else, and while
  drawing, a right-click is still Esc.
- **UX19 Length, Tab, angle:** in the typed-point box, a length then Tab gives `@length<` — type the angle, Enter.
- **UX07 Grips:** the grip under the pointer draws larger (and pale blue), so you see what a press takes.
- **Windows:** Blocks and Racks now open docked under the Navigator (they open by themselves, and a floating Racks
  window covered the drawing); the saved layout key moved to `cad-windows:2`, so every browser starts from the defaults.
- OutletGrid / PatchList: their row maps are `$state` (a dev warning on every row).

Live (Test Project, synthetic pointer events — the automation's clicks landed off target in this tab): R311 selected →
header "Rack R311" with the four groups; a right-click on it listed Edit label [F2], Cut, Copy, Delete, Select
similar, Properties. No data written.

Checks: 466 cad tests pass; svelte-check: nothing in cad.

## UX remediation, D2: a depth band on elevations, to test (UX14; Dave: "currently prefer sections, but I would like to test depth bands")

- An elevation's strip has **Band**: on, the elevation shows only what lies near its work depth — `front` mm towards
  you (default 1000) and `back` mm away (default 4000) round the work depth (`at`, blank = the middle of the floor).
  Nearer things are left out (as a section cuts them away), things beyond the band are drawn faded (`.far`).
- In Split with the plan, the plan draws the band's two edges (dashed violet) either side of the work-plane line.
- For the session only (`ws.band`), and not on sheet viewports — it's a test; sections stay the way to put a cut on
  a sheet. Not yet: dragging the band's edges on the plan.

Live (Test Project, 1F front): Band on → 138 drawn elements → 78, 6 of them faded. No data written.

Checks: 467 cad tests pass (new: the depth band test in `views/elevation.test.ts`); svelte-check: nothing in cad.
- **One drag undocks and places a window** (Dave: "the initial dragging … gets interrupted, so it takes two drags"):
  the title drag listens on the browser window, so it carries on after the window comes out of its dock (drawn in a
  new place); the dock-edge marker moved to the shell (`layout.dropSide`). Live: one drag took the Navigator from the
  left dock to the middle of the drawing. Dave's answers to the other decisions are in `../plan/ux-review.md`.

## Second UX review, group 1: seeing the selection, space, bugs (`../plan/ux-review.md` "Second review")

- **V1 Selection halo** (Dave: "difficult to see selected outlets"): every selected line, outline or circle gets a
  wide pale-blue halo behind it, constant on screen (9 px), so blue outlets show as picked too (`ui/Prims.svelte`).
  Bands turn blue whole and texts go bold as before. (Dimming everything else is a question for Dave.)
- **V2 One selected-row style** in every table: the drawing's selection blue with a blue bar on the left (was a
  near-white amber).
- **R1 Right-click menu on Windows:** the browser's own `contextmenu` arrives after the button is let go and landed
  on the new menu's backdrop, closing it at once; the backdrop now ignores that first one (400 ms).
- **R4 Patch list in a rack view** starts on the open room ("All rooms" one click away).
- **L1 More room:** the tables start closed (`cad-panels:2`, so every browser starts that way) and Racks no longer
  opens by itself in a rack view (the Navigator lists rooms and racks; Window › Racks for its tools). With the
  Navigator and Properties docked, the drawing is ~78 % of the width here (1708 of 2188 px) and the full height.
- **T1–T3 The tables panel** (`ui/TablesPanel.svelte`; Dave: "float"): one title bar with horizontal tabs (Outlets ·
  Patch list · Sheets · Links), a summary ("Outlets · 47 · 12 selected"), fold to the bar, **maximise** over the
  drawing (Esc back), **float** over the drawing (move by the bar, resize by the corner, kept on screen) or dock under
  it, and close. Rows 20 px. Ctrl+, opens / closes it.

Live (Test Project): tables closed at start (drawing 1708 × 975); Ctrl+, opened them (1708 × 751); folded → 946;
floated → 975; maximised and Esc back; docked; closed. No data written.

Checks: 467 cad tests pass; svelte-check: nothing in cad.
- **Delete / rename a server room** (Dave: "how to delete unused items in levels tree, like SER-B?"): the Navigator's
  room rows have ✎ and ✕ on hover. A room goes with its rows and racks (and their devices, links, cords); it asks
  first when racks go too or outlet ports name it as their server room, and an empty room just goes. In Help.

## Second UX review, group 2: drawing tabs (D1, D2)

- **Drawing tabs** (`app/tabs.svelte.ts`, `ui/TabStrip.svelte`; Dave: shared by both panes, with a preview tab):
  - One strip over the drawing; each tab is a level + a view (plan, elevation, section, rack room, riser, sheet).
    A click shows it in the active pane; in Split the shown tabs are marked 1 / 2.
  - A single click in the Navigator (or Enter in its search) opens the view in the **preview** tab (italic), which the
    next single click reuses; a double-click (Ctrl+Enter), a double-click on the tab, or an edit made in it keeps it.
    A view that's already open just selects its tab. New sheets open in a kept tab.
  - Back / Forward (‹ › and Alt+← / →) now move inside the tab (each tab has its own history; the per-pane history is
    gone). The pane strip's view buttons change the current tab's view.
  - × on hover, a middle-click or **Alt+W** closes (Ctrl+W / Ctrl+Tab belong to the browser); Alt+PgUp / PgDn the
    previous / next tab; Alt+1…9 a tab by position. A right-click: Keep it open, Close, Close others, Close to the
    right, Open in the other pane, Put this view on a sheet. ⌄ lists every tab.
  - Kept per project in this browser; a deleted sheet's / section's tabs close.
  - The viewport chip has **Open view**: the viewport's model view in its own tab.
- **D2** The Navigator marks rows that have an open tab (a dot).
- Fixes: View menu's Back / Forward read the old per-pane history (`hist is not defined`, Dave); svelte-check's
  "used before its declaration" errors in CadShell / ViewCanvas (my svelte-check filter had been missing cad's
  double-backslash paths — fixed; checks below are with the right filter). The right-click / tab menus moved to
  `ui/cadMenus.ts` (CadShell 596 → 574 lines).

Live (Test Project): Front elevation → preview tab; Rear elevation reused it; double-click kept it; Plan selected its
existing tab; Navigator dots on the open views; × closed the rear tab.

Checks: 471 cad tests pass (new: `app/tabs.test.ts`); svelte-check: 10 errors (the baseline, none in cad), no cad
warnings.
- **L4 Navigator row menus** (Dave: "the hidden buttons beside project name in tree are hard to spot"): no more
  hover-only buttons. Every row with commands has a faint ⋮ (stronger on hover), and the same menu on right-click:
  level — Open plan · Rename… (F2) · Delete level…; room — Open rack view · Rename… · Delete room…; sheet — Open ·
  Rename… · Renumber… · PDF · Archive; section — Open · Rename… · Delete section; Sheets — New sheet · PDF of all
  sheets; the project row — Floors… · Settings…. "+ New" on the Sheets row is always shown. Delete lives only inside
  the menus. Rows are focusable; F2 renames the focused row. Project menu: Rename / Delete this level…. The level /
  room rename and delete moved to `app/navActions.ts`.

## Second UX review, group 3: the tables (T4–T7)

- **T4 Settings out of the Outlets bar:** the port-label format, Slack and Waste moved to Project › Settings… ›
  **Lengths & labels** (with the "relabel existing ports?" offer); the Length column's title says the slack
  ("Length (+0.5 m)"). The bar keeps actions and filters; "49 no route" is a chip that lists those outlets.
- **T5 Sort and filter:** Outlets, Patch list and Links sort by any column (click the header; again reverses; a third
  time goes back), remembered per table, and each has a Find box (`ui/tableKit.svelte.ts`, `ui/SortTh.svelte`).
- **T6 One scope rule:** each has **This view · Selection · All** (`ui/ScopeSelect.svelte`): Outlets — this level /
  the selected outlets (any level, with a Level column) / every level; Patch list — the open rack view's room (else
  all) / the selected cords and those on selected devices or ports / all; Links — links with an end on this level /
  selected links or ends / all. Remembered per table.
- **T7 Counts and keys:** "n of N · m selected"; with the table focused, ↑ / ↓ move the selection (and the drawing's),
  Ctrl+C copies the shown rows as tab-separated text for Excel.

Live (Test Project, Outlets): "47 of 47"; Label header sorted A.001… then reversed; Find "A.00" → 12 of 47; a row
click then ↓ selected the next outlet; Selection scope → "1 of 1 · 1 selected". No data written.

Checks: 474 cad tests pass (new: `ui/tableKit.test.ts`); svelte-check: 10 (baseline), no cad warnings.

## Second UX review, group 4: selection count, cameras, loading, labels, outlet Properties, menus

- **V3 How many are selected:** the status bar shows "12 selected (outlets)" (one kind) / "5 selected"; a click on it
  — or **Shift+Home**, View › Zoom to selection — fits the selection (what this view draws of it, inside an edited
  viewport too) with a margin.
- **R2 Old cameras:** a saved camera comes back only for the view a pane opens with (a refresh of the same URL); any
  other view opened later fits its content, then keeps its camera for the session.
- **R3 Loading:** while a floorplan is still rendering, the status bar shows a spinner and "floorplan…". (In a hidden
  browser tab pdf.js pauses, so it can stay on until the tab is seen.)
- **L3 Labels on the plan:** a run's label sits at the middle of its longest segment on the level (it was at the first
  node, on top of the racks / risers there); run and riser labels that overlap a label already placed move down a
  line at a time (up to four); rack and outlet labels stay on their symbols (`declutter` in `views/plan.ts`).
- **Outlet Properties grouped:** General (label, usage, tier, mount, symbol) · Position (height, X, Y, room) · Ports ·
  Circuit, remembered per kind. A blank Height shows the default it uses ("300 — wall default").
- **Menus give the keys back:** a menu closed by Esc, a pick or a click outside blurs its button, so the next keys go
  to the drawing (the View button stayed outlined).
- Still open for Dave: the Racks window (keep for its tools, or retire into the Navigator — L2) and dimming the rest
  while something is selected (V1.3).

Live (Test Project): R311 selected → "1 selected (rack)", 4 halo outlines; the chip zoomed 182 % → 869 % onto it;
the spinner showed while the floorplan rendered. No data written.

Checks: 475 cad tests pass (new: the declutter test); svelte-check: 10 (baseline), no cad warnings.
- **Fixes (Dave):** "clicking tabs does nothing" — showing a tab cloned its view with `structuredClone`, which throws
  on a `$state` proxy (the tab list is state); Back / Forward and the chip's Open view had the same; now
  `$state.snapshot`. Live: clicking 1F plan / 1F front elevation tabs switched the view. "S006: ports unreadable due
  to the white background of panel labels when zoomed in; panel labels too faint" — a panel's name over its ports no
  longer has a white halo, and its small (zoomed-in) form is full strength, dark and semi-bold (screen and PDF).
  Live: S006 at 1323 %: names halo-free and solid over 134 readable port labels.
- **Viewports and layers (Dave: "in viewport, hiding layers does not hide them"):** the Layers eye (hide, only for
  you) now hides the layer inside sheet viewports too, on screen (`SheetOpts.hidden`); what prints is still each
  viewport's ❄ freeze. The ❄ column also shows while editing inside a viewport. Live: Walls' eye on S001 → 22 wall
  prims → 0 → 22.
- **Viewports are picked by their frame only** (Dave: "too easy to drag viewports around page by mistake … only on the
  frame border, like Pages and Sheets"): the frame isn't filled for picking any more, so a click in a viewport's middle
  is the paper (or a note there); its border picks and drags it, a corner resizes it, a double-click anywhere inside
  edits inside it. Help updated. (While testing, a ❄ on S001's viewport was clicked by mistake and clicked back — no net
  change.)
- **Selected labels readable when zoomed in** (Dave: "outlet labels are unreadable on plans when selected and zoomed
  in, the blur is bad"): `.sel`'s blue stroke also outlined selected TEXT, and a text stroke isn't screen-constant, so
  it grew with the zoom and smeared the label; selected text is now bold blue with no outline.
- **The selection box shows while editing inside a viewport** (Dave: "the select marquee is not visible"): it was
  drawn in the viewport's view mm on the paper (off the page); it's mapped onto the paper now. The box is a little
  stronger everywhere (1.5 px, 12 % fill). Live (S001, inside the plan viewport): the box sat inside the frame and
  selected 30 items; selected labels: no stroke, blue, 600.
- **Usage can be cleared** (Dave: "most outlets don't need to display it, just specific ones"): Usage has "— none (not
  shown)" in outlet Properties (one or several) and "—" in the outlet table. A blank usage draws nothing under the
  symbol, takes a general panel in allocation (like before) and counts as "other" in the schedule totals.
- **Port counts in the middle of the outlet** (Dave: "port numbers should be shown in the center of the outlet"; they
  were to the right): centred in every built-in outlet symbol. A text wholly inside a filled shape of its block
  (`onSolid` in `views/blocks.ts`) is white (`on-fill`, over the layer colour and the selection); a port count on an
  outline symbol (ceiling, faceplates) is dark with a halo sized in em, so it doesn't grow with the zoom. The AP's
  centre dot became a disc (r 0.95) to carry its number. The PDF fills outlet symbols blue like the screen (they were
  light grey, which white digits wouldn't show on). Tests: `views/blocks.test.ts` (3). Live (1F plan): 9 counts white
  on filled symbols, 7 haloed on ceiling outlets.
- **Properties groups for the rest** (UX review, after outlets): the header names the kind, so the panels lost their
  own titles and fold into groups, remembered per kind — sheet: General (number, title, drawn, title block) · Paper ·
  Viewports · Issued revisions, then PDF / Delete; viewport: View (level, view, scale, label) · Window (window,
  centre, frame, lock), then Delete; cord: Ends (status, from / to, was, Installed / Remove / Revert) · Cable (type,
  colour, length, ID, notes) · Circuit; note: its words (Text / Leader / Cloud / Dimension) · Style; run / line:
  General (kind, label, length) · Size and height (section, location) · Style (a plain line) · Nodes. Live: S001 →
  General · Paper · Viewports · Issued revisions.
- **Labels edited inside a viewport** (backlog "Edit labels in place" follow-up): double-click / F2 on a label while
  editing in a viewport opens the box where the words show on the paper (`TextEditBox` takes the viewport's space,
  prims and view → paper mapping). Live (S001): A003's box sat on its label (490,799 vs 487,797), Esc left it.
- **Cords along the cable channels** (backlog P1, Dave: "a toggle to switch between the current cord rendering and
  using the side channels"): `views/cordRoute.ts` ports the legacy patching tool's `computeRoute`
  (`patching/parts/cableUtils.ts`) to view mm — each end drops below its port and runs to the channel on its side
  (along the panel edges, outside the port area); a cord changing sides in one rack crosses through the horizontal
  manager nearest the middle of its ports; between racks it leaves on the facing side (through the manager nearest
  the port when the port is on the far side), runs across at mid-height and enters the same way. New over the
  legacy one: each cord has its own lane (3.5 mm apart, 5 lanes), so parallel cords don't overlap. The toggle is
  **Cord channels** in a rack view's strip — a project setting (`settings.cordRoute`, stored as 'channels' /
  'straight' so a merge-save can't revert it), followed by sheets, PDFs and issued copies. Tests:
  `views/cordRoute.test.ts` (5). Live (Test Project, IDF2 front, all rows): 19 cords, all orthogonal; left ON there.
- **Selection drawn as Pages / Sheets do** (Dave: "the halo is enough [no dimming], but I prefer the selection
  rendering of Pages and Sheets"): no halo, no recolouring — a selected item keeps its own colour and weight; a thin
  blue line (1.75 px) is drawn over its lines and circles, and a dashed blue box (padded 4 px) goes round each
  selected symbol, box or text (a run or wall — open lines only — gets just the line). Grips were already the Sheets
  look. Live (1F plan): 24 picked → 24 dashed boxes, 62 lines, no halo.
- **Download buttons checked** (backlog P2 quick win; live, Test Project, files caught in the page — nothing saved to
  disk): Outlet schedule this level (11 KB) / all levels (12 KB), plan DXF (44 KB), BOM (9 KB), cable schedule
  (15 KB), cord BOM / patch schedule (13 KB), PDF of all sheets (6 pages, 681 KB), sheet register Excel (7 KB),
  transmittal (7 KB), reprint (391 KB PDF), a sheet "as issued" (S001 rev B, 401 KB PDF), panel labels Excel (IDF2,
  360 labels, 16 KB), panels PDF (13 panels, 2 pages, 15 KB) — every one made its file with the right name and type.
  The "Mark printed" offers were cancelled. Opening the files (are their contents right?) is still for Dave.
- **Touch pass** (backlog P2 quick win; synthetic touch pointers, no iPad): a tap selects; a one-finger drag on empty
  space does nothing; a pinch does nothing; the canvas is `touch-action: auto`, so an iPad scrolls / zooms the whole
  page. Findings moved into the "Touch: pan and pinch zoom" backlog entry.
- **Plan: organising sheets and issue packages** — `../plan/sheets-organising.md` (categories, derived level / room
  / issue-state columns, group / sort / filter, bulk edit, packages as a list or a rule, re-issue diff, cover page;
  9 slices, ~1,300 lines; questions D1–D9 for Dave).
- **Device library: drag onto a rack** (backlog P2): a Device library section in the Racks window — every template
  (built-in and global ★), a find box, grouped by kind with its U. Drag one over a rack view: the Device tool's ghost
  follows at the snapped U (red when it overlaps or runs off the rack); the drop adds it (one undo step, selected),
  and the tool you had comes back when the drag ends. A click arms the Device tool with it instead. Help updated.
  Live (IDF2 front): "Fibre panel 24 LC" dragged onto R313 → ghost, PP4 added and selected, Select back; undone.
- **Device library in its own window** (Dave: "it might get very long"): Window › Device library, docked under Racks;
  it opens with the Device tool (as Blocks opens with Insert). The Racks window is back to racks only.
- **F4 repeats the last device edit** (Dave, like Excel): a field changed on a device (or several) in Properties is
  remembered as the change itself (`domain/repeatEdit.ts`); select other devices, F4 puts it on them, one undo step.
  Not repeated: name, U (per device) and the printed-label record; a panel change carries only the changed panel
  fields (another panel keeps its reservations / printed labels); a device the change won't fit is skipped and named.
  Help (keys + how-to) updated. Tests: `domain/repeatEdit.test.ts` (3). Live (IDF2): Maker "F4TEST" on one switch,
  F4 on another → "Repeated "Device maker" on 1 device"; both undone.
- **Sheets plan decisions** (Dave 2026-10-07) recorded in `../plan/sheets-organising.md`: categories GLOBAL
  (`settings/cadSheetCategories`, retire not delete), discipline kept, review flag and DRAFT stamp later, cover page
  at the first sheet's size, packages by list or rule, rev codes typed per issue first, recipients on the package,
  "Make package" for old issues.

## Sheets organising (plan `../plan/sheets-organising.md`)

- **Slice 1 — register split + derived columns:** the Issues view moved to `IssuesList.svelte`; the register gets
  **Category** (its own, else derived from its viewports — all plans → Plans, rack rows → Rack elevations, risers →
  Risers, sections / elevations → Sections and elevations, a mix → General; grey "(auto)"; `domain/sheetCategories.ts`
  with the built-in list), **Level** (its place, else its viewports'; a riser view names none; sorted and grouped in
  level order) and **Room** (its place when a room, else its rack-row viewports' rooms). Filter **chips** Category /
  Level / Room / Tag (`ChipPick.svelte`: any pick in a chip, every chip), group by category / level / room too
  (a sheet under each of its levels / rooms), a click on a group header selects its sheets, ↑ / ↓ and Ctrl+C as in
  the other tables. The Kind column became Category (a picker: Auto or a category; old typed kinds still show). The
  register Excel has Category / Level / Room instead of Place / Kind. Tests: `sheetList.test.ts` (+4). Live (Test
  Project): 6 sheets → Rack elevations ×3, Plans ×2, Sections ×1, all auto; group by level 1F 3 · 4F 3; chips Rack
  elevations → 3, + 4F → 2.
- **Slice 2 — the category list, GLOBAL (Dave D1):** `settings/cadSheetCategories` (`{ categories }`, replaced whole
  on save), read by `CadProject` like the device templates; the built-in list while it's empty. Project › Settings ›
  **Sheets** (`SheetCategoriesTab.svelte`): rename, code (the Renumber prefix), order ▲▼, how many sheets here use
  it; ✕ RETIRES a category (other projects may use it: it still names their sheets, it isn't offered any more),
  Restore brings it back; typed categories on this project's sheets not in the list get "+ add". Not on the
  project's undo history (a global doc, like templates). The register's pickers and chips use the list. Tests:
  `sheetCategories.test.ts` (4). Live: Details ▲ then ▼ — saved to the global doc and back in the built-in order
  (the doc now exists, equal to the defaults).
- **Slice 6 — packages:** a `package` entity (`SheetPackage` in `domain/drawing.ts`): name, purpose, recipients
  (Dave D8), note, and EITHER a list of sheet ids OR a rule (category / level / room / tag / discipline ids — D6);
  `issue.packageId` links an issue to it. `domain/packages.ts`: members now (a list in its order, gone / archived
  sheets left out; a rule in print order, never archived), rule from the chips, rule in words, freeze to list, last
  issue, since then (added / withdrawn / never issued), a package from an old issue, recipients as lines. Sheets tab ›
  **Packages** (`PackagesList.svelte`): + From selection (a list) / + From chips (a rule), Show, Issue… (the Issue
  panel on its sheets, name / purpose / recipients filled, the issue linked), Edit (purpose, recipients, note; a list:
  ± selected sheets; a rule: Freeze to list; Duplicate; Archive / Restore). Issues › **Make package** on an issue
  from before packages (D9) — a list of its sheets, the issue linked; Re-issue of a linked issue opens it as the
  package. (Navigator "group by package" comes with slice 4.) Tests: `packages.test.ts` (5). Live: chips Rack
  elevations → + From chips "Rack set TEST" = 3 sheets, 2 not issued; Issue… filled from it (cancelled); Make package
  on Issue 04 → linked, nothing since; both undone.
- **Slice 7 — re-issue diff + change notes:** the Issue panel is a table — per sheet its new revision (from → code,
  the code editable; "Set all to…" for P01 → C01, Dave D7) and **what changed** (prefilled with the purpose), or "stays
  B (unchanged since issued)"; **By** (initials, remembered in this browser). Issuing a package marks sheets **added**
  since its last issue and lists the **withdrawn** ones (recorded on the issue: `issue.withdrawn`). A typed code that
  is blank or one the sheet already has is refused before anything is written (`withCodes`, `revCodeProblem` in
  `domain/issue.ts`). Revisions keep `desc` and `by`; the title block's revision table shows the description, else
  the purpose (old revisions print exactly as before — their fingerprints don't change). Tests: `issue.test.ts` (+2).
  Live: S001 / S006 / 2 → C / A / A; "B" on S001 refused, Issue disabled; cancelled.
- **Slice 8 — cover page + transmittal:** `views/transmittalPage.ts` draws the cover as display lists on the package's
  first sheet's paper with the project title block (Dave D5) — project, "TRANSMITTAL — Issue 05 · name", purpose,
  date, To (the package's recipients, D8), note, then the register (No., title, rev, size, New revision / As last
  issued / Withdrawn in red); a long register flows onto more pages ("page 2 of 3"). The Issue panel's **Cover page**
  (on by default) puts it first in the package PDF; the cover is frozen with the issue (`cover-<issueId>`, rev = page
  number; `issue.cover` = how many pages), so Reprint shows it exactly as issued. The Excel transmittal lists the
  withdrawn sheets too. Tests: `transmittalPage.test.ts` (3: size / content / order, flow onto more pages, PDF with
  no picture text). Checked as a real PDF (rendered in a scratch test): A3, the title block on the right, 15 rows.
  Not checked live: issuing uploads a real PDF — first real issue of a package will show it.
- **Slice 3 — bulk edit, duplicate, number a group:** 2+ sheets selected → Properties **SheetMultiProps** (category,
  discipline, drawn, a tag + / −, paper size and orientation, Add to package, Duplicate, Archive / Restore; "(mixed)"
  where they differ; one undo step each). **Duplicate** (`domain/sheetEdit.ts` + `app/sheetActions.ts`): a copy with
  its viewports and paper notes under new ids, "(copy)", no number, no revisions, right after the original — in the
  register's bar, sheet Properties, multi Properties and the Navigator's sheet ⋮. **Number…** on a register group
  header: the group's sheets in print order from a pattern prefilled with the category's code ("RE-01" → RE-01,
  RE-02 …; the shared Renumber needs numbers already in the labels). Tests: `sheetEdit.test.ts` (2). Live: 2 sheets →
  General · Paper, tag T1 on both; Duplicate → 6 → 8 "(copy)"; Rack elevations › Number… "RE-01" → RE-01…03; all undone.
- **Slice 4 — drag reorder + Navigator group-by:** sorted by #, register rows drag (the selection if the dragged row
  is in it, else that row) to just before the drop row — one undo step, print order renumbered 10, 20 …
  (`moveBefore` in `domain/sheetList.ts`); a blue line marks the drop. The Navigator's Sheets ⋮ gets **Group by place
  / category / level / package** (remembered per project in this browser; `NavOpts.sheetsBy` in `domain/navTree.ts`):
  categories in the list's order, levels in level order (a sheet under each of its levels), packages in their order
  then "Not in a package"; group rows show a count. Tests: `navTree.test.ts` (+1), `sheetList.test.ts` (+1). Live:
  Group by category → Plans · Rack elevations · Sections and elevations (put back to place); S004 dragged onto the
  first row → first; undone.
- **Slice 5 — issue state:** `issueState` (`domain/issue.ts`): Not issued / Issued B / Changed since B / Superseded
  (archived after issue) — derived, never stored. `app/issueStates.svelte.ts` works out each issued sheet's
  fingerprint in the background (floorplans placed, one sheet at a time, a pause between), only while something asks
  (`want()`), again ~1 s after an edit; one per project. The register's **Issue state** box adds the column (coloured)
  and a State chip; the Navigator shows an amber ● on a sheet changed since its last issue (when known). The DRAFT
  stamp is later (Dave D4). Tests: `issue.test.ts` (+1). Live (Test Project): 2, S006 Not issued; S001 / S003 / S004 /
  S005 Changed since — true: this week's drawing changes (port counts in outlets, run labels, cord channels) change
  how they print, so the next issue gives them new revisions; 4 dots in the Navigator.
- **Slice 9 — history:** sheet Properties › **Issued in** — every issue that included it, newest first, at which
  revision, "new" when it got that revision there, the package PDF (`issuesOfSheet`); a package's Edit row lists its
  issues (newest first, how many new revisions, the PDF). Tests: `issue.test.ts` (+1). Live: S001 → Issue 03 B new ·
  Issue 02 A · Issue 01 A new. **The plan is built** (the backlog's "Organising sheets" and "Revisions and packages"
  entries are done; review / approval, the DRAFT stamp and version history stay for later).
- **Fixes (Dave 2026-10-07):** an auto category (worked out from the viewports) is plain grey "(auto)", not italic;
  the tables in the bottom panel are as wide as their content, from the left (the register was stretched to the
  panel: Category 228 px, an empty Tags 144 px, Level 49 px) — the register's edit boxes and category picker fit
  their text (`field-sizing: content`), long patch-list notes are cut with … (full text on hover). Live: register
  1229 → 738 px. Backlog: "Uploads from inside cad" (link or embed) added.

## Batch (Dave 2026-10-07): 1 2 3 4 5 6 10 13 14 23 30

- **1 — oversized files split** along real seams, no behaviour change: CadShell 609 → 497 (`WindowBody.svelte` the
  windows' insides, `SplitBar.svelte`, `ui/shellKeys.ts` the keys with a context like the menus', `app/shellActions.ts`
  new sheet / PDFs / F4 / "n selected" / view titles / drafting toggle); ViewCanvas 608 → 492 (`ui/canvasInfo.ts`
  grid lines, readout, `CameraMemory`, `ClickCounter`; `ui/viewportEdit.ts` enter / leave / Alt+wheel scale / library
  drop; `viewToSheet` in `app/sheetActions.ts`; `viewportHighlight` / `pickableIn` in `views/overlays.ts`;
  `snapDragged` in `editor/snap.ts`; `visibleArea` in `editor/camera.ts`); selectTool 532 → 482
  (`editor/dragParts.ts`: `dragViewport`, `dragNodesInto`). 510 tests pass; live: windows, F9, Shift+Home, Esc, split.
- **2 — backlog pruned:** "Tabs (left pane only)" (built as the shared drawing tabs) and "Review the device template
  picker" (the Device library window) gone; "Usage colours…" shrunk to what's left; the size warning updated.
- **3 — File › Uploads…** opens the Uploads tool in a new tab; embedding it stays a backlog question.
- **4 — Cable type per outlet:** a Cable picker in outlet Properties (one and several), from the project's cable types;
  it sets every port ("mixed" when the ports differ).
- **5 — Port hover tips:** in a rack view, at once beside the pointer: the port's place and full label, the cable in it
  (→ outlet port and level, or a tie / backbone's far panel) and its cords (far end, length, status) —
  `views/portTip.ts` + `PortTip.svelte`; hidden while dragging. Tests: `portTip.test.ts` (3). Live (IDF2): P3C 48-port
  : 1 → 01A.002A · cable → outlet A.002 port 1 (1F) · cord → 24-port : 8 · 0.3 m · add.
- **6 — Set any status:** the cord's status in Properties is a picker (add / change / remove / installed), to fix
  mistakes; the workflow buttons stay.
- **10 — Grayscale floorplan:** **B/W** in a plan's strip draws floorplans in black and white on screen (this browser;
  `drafting.grayPlan`), so coloured markup stands out. Live: filter grayscale(1) on / off.
- **13 — Approvals and Site in the title block:** new auto fields **Checked**, **Approved** (set per sheet in its
  Properties, like Drawn) and **Site** (the template's own address, typed beside the field in Title block template…;
  full width). Added to a template like any field, removed to switch them off — a template without them prints exactly
  as before (so issued sheets don't turn "changed"). Tests: `titleBlock.test.ts` (+1).
- **14 — Own cable type for new links:** while an interconnect is armed, the Cord tool's bar shows **Link type** —
  kept as last chosen (`ws.linkType`), separate from the cords' type (which stays for patch cords). Not live-checked
  (needs an armed interconnect; three lines in `cordTool.ts` / `ToolOptions.svelte`).
- **23 — Touch: pan and pinch zoom** (`editor/touch.ts`, `TouchNav` + `pinchCamera`): two fingers pan and pinch-zoom
  in every view (about the fingers' midpoint; a tool's half-done press is cancelled; the finger left after a pinch
  does nothing until all are up); with Select one finger on empty space pans (a sheet's paper counts as empty) and a
  tap there clears the selection; on a thing, or with a drawing tool, one finger is a mouse press. The canvas is
  `touch-action: none` (the browser no longer scrolls / zooms the page). Tests: `touch.test.ts` (3). Live (synthetic
  touch): one-finger pan +100 / −50 px, pinch 1247 % → 4364 %, tap an outlet → selected, tap empty → cleared. A real
  iPad pass is still worth doing.
- **Docs:** `../local-storage.md` lists every key cad keeps in the browser (12 in localStorage, 1 in sessionStorage):
  what each holds, per project or not, which file writes it, and how to add one. The ~500-line file limit is relaxed
  for now (Dave) — backlog note updated.
- **30 — Issue register for the PM:** Sheets › Issues › **Issue register (Excel)** — a row per sheet that went out
  (by number), a column per issue (in issue order, "Issue 03 name" + date) with the revision it went at (bold = new in
  that issue, red "withdrawn"); **latest only** = one column, each sheet's last revision · issue · date
  (`issueRegister` in `domain/issue.ts`, `render/issueRegister.ts`). Tests: `issue.test.ts` (+2). Live: both files made
  (7 KB each). Help: touch, port tips, B/W and the register added.
- **10, revised (Dave: "B/W should toggle for printing too"):** B/W is now a PROJECT setting (`settings.grayFloorplans`,
  stored true / false; one undo step), like Cord channels: floorplan image prims carry `gray`, so the screen, sheet
  viewports, sheet PDFs and issued copies all follow it — the PDF loader draws a gray image in grayscale before
  embedding it (kept apart from the same image in colour), and the frozen copy keeps the flag (switching B/W is a real
  change to an issued sheet). The per-browser `drafting.grayPlan` is gone. Tests: `pdf.test.ts` (+1). Live: B/W on →
  plan and S001 gray → back off.

## Batch (Dave 2026-10-07, second): 1 5 7 9 10 12 13 20 23 24

- **Backlog:** not needed → `later.md` (snap to rack corners, dim other cords, check old cord ends, F8 / F10, selectable
  Japanese PDF text, per-viewport port-label / cord toggles — replaced by the Port labels layer); low priority (P3, and
  P3 waits until P1 / P2 are done): show all routes, finish the soft retire, track cord labels.
- **1 — Port labels layer:** a system layer "Port labels" (after Patch cords): a device's `port-label` texts go on it
  (`primLayer`), so the eye hides them on screen and a viewport's ❄ freeze hides them in print — apart from the racks
  and ports (hiding Racks no longer hides them). Tests: `layers.test.ts` (+1).
- **5 — Segment lengths:** run / wall Properties › **Segments**: each segment (node n–m) with its 3D length (a drop
  counts its height, marked ↕), and the total in mm and m (`segmentLengths` in `domain/pathEdit.ts`). Tests:
  `pathEdit.test.ts` (1).
- **7 — Re-allocate pinned ports too:** the Outlets table's **incl. pinned** box beside Re-allocate… re-allocates the
  pinned (hand-placed, imported) links as well, for when the outlets changed; patched panel ports still stay
  (`AllocOpts.includePinned`). Tests: `allocate.test.ts` (+1).
- **12 — Rack tree and row views:** the Racks window is a room › row › rack tree (rows in order, each with its rack
  count and **Row view**; racks in no row under "No row"; a room with no rows stays flat). In a rack view
  **Shift+double-click** on a rack fits it and the rack beside it (a pair), and **Esc** with nothing selected goes back
  to the whole row (`unfocus`). Live (Test Project): IDF1 › IDF1 Row 1 (6), IDF2 › Row A (6) · Row B (0); pair 718 →
  869 %, Esc → 718 %.
- **9 — Riser view floor / ceiling lines:** checked against the old Risers tool (`../plan/riser-lines-check.md`); fixed
  what it found: the slab was drawn straight under FFL — it now sits under the raised floor (ADR 0004: slab top at
  FFL − raised floor); the raised-floor void and the ceiling plenum are shaded strips (`riser-void`, screen + PDF);
  the slab above a storey is drawn when no floor sits on it (the top floor, one under a break or a gap); server-room
  boxes fill the storey to the ceiling (were a fixed 2200). EPS rooms, HIGH / LOW tags (→ "High / low cables in the
  riser view"), walls and grid left as the check suggests. Tests: `riser.test.ts` (+1). Live (Test Project): 3 slabs,
  4 void strips, rooms to the ceiling.
- **10 — Version model:** `../adr/0008-version-model.md` (Proposed): two kinds of history — sheet REVISIONS (what was
  issued, frozen; built) and project VERSIONS (named snapshots of every `cadEntities` doc, in `cadVersions`); no
  major / minor model versions; issuing auto-saves a version (`issue.versionId`); restore = the whole project as one
  undo step, keeping the live issue history; what Version history / Revert / Issue gate / Change history then need;
  six questions for Dave.
- **13 — Bulk patching by drag:** a drag that ARMS a tool (`ws.startDrag` / `endDrag`, the Device library's drag
  generalised): drag outlet rows from the Outlets table (the selection when the row is in it) onto a panel port in a
  rack view — Assign from there (pinned); drag Port Properties' "Patch … to…" / "Interconnect to…" onto the first port
  on the other device — bulk patch / interconnect from there. The drop is the tool's click on that port; the tool you
  had comes back when the drag ends (an unused arming is undone). Help added. Live: outlet 201 dragged onto a free
  panel port → its 6 ports linked (66 → 72), undone.
- **20 — Any annotation can belong to a viewport:** shapes (rect / ellipse / polygon) and dimensions already tied to
  the viewport they start in; now the **Line** tool and **Insert** (blocks) work on sheets too and do the same
  (`placeNote`): on the paper, or — started / dropped inside a viewport — tied to it in its view mm, so they move,
  copy (Duplicate sheet) and are untied with it like notes; a block on a sheet is paper size. (There's no image tool
  yet.) Tests: `sheet.test.ts` (+2: a tied line in view mm, drawn back where it was drawn; a paper line; a tied block).
- **23 — DXF blocks as BLOCK + INSERT:** prims drawn from a block carry their placement (`ins`: block, point,
  rotation, scale incl. the annotative k, attribute values); the plan DXF writes each block ONCE (`blockDefinition`:
  its lines, circles and fixed texts in block mm, {TAG} texts as ATTDEFs; entities on layer 0) and each outlet /
  insert as one INSERT on its layer with its ATTRIBs (LABEL, USAGE, PORTS …; a repeated tag → TAG_2) — so AutoCAD can
  count them. A hidden attribute is written empty (the writer can't set the invisible flag). Without the library the
  output is as before. Tests: `render.test.ts` (+1). Checked the file's structure: INSERT 66=1, ATTRIBs, SEQEND each.
- **24 — Open project (Ctrl+O):** File › Open project… / Ctrl+O — the Pages tool's dialog ported
  (`OpenProjectDialog.svelte`, cad's colours): every project (trashed hidden), search over name / codes / client,
  "My projects", newest first, ↑ / ↓ / Enter; picking one opens it in cad (the route is keyed by project, so the
  workspace starts fresh). Help: Ctrl+O. Live: Ctrl+O → Project Journey, Test Project (open), LR; Esc closed it.
- **Riser voids white (Dave):** the raised-floor void and ceiling plenum are no longer shaded (`riser-void` strips
  and their styles removed); slabs, FFL and ceiling lines unchanged. Live: S007 shows 0 voids, 5 slabs.
- **Dave 2026-10-07 follow-ups:**
  - Rack pair focus removed (Shift+double-click, Esc back to the row): not needed. Double-click a rack still fits it.
  - Annotations on sheets go on the VIEW only: Text / Leader / Cloud / Dimension used inside a viewport being edited
    leave it first, so the note is tied to the viewport (never written into the model from a sheet). Help entry.
    Live: S001, editing a viewport, Text click → edit mode left, text on the sheet (undone).
  - Selected / traced port labels readable: their labels are redrawn over the highlight cell (white on a solid blue
    selected cell, dark on the amber traced ones), with zoom LOD. Hovering a port outlines the cell only (the blue
    copy of its label — both LOD forms at once — looked blurred). The tool preview layer gets the zoom for LOD.
  - Patch to… easier to find: the selected ports' section is at the TOP of Device Properties (boxed), Patch to… /
    Interconnect to… are blue buttons with their keys; P / I arm them; right-click a selected port → Patch to… /
    Interconnect to… first in the menu. Help: keys + the patching answer. Live: all three, P armed the Cord tool.
- **Dave 2026-10-07, second round:**
  - Annotation tools (Text / Leader / Cloud / Dimension) are enabled while ANY viewport is being edited (a rack or
    riser view had them greyed out, so they couldn't be used): `toolWorksIn(id, kind, onSheet)`, `ANNOTATION_TOOLS`.
    Live: S006 rack viewport in edit mode → Text / Leader / Dimension on, Line off.
  - Selecting a port no longer hides the panel's name drawn over its ports: the selected / traced cells are a tint
    again (blue 30 % / amber 35 %), and the port labels AND the panel name are redrawn over them. The selected port
    itself isn't also amber (blue over amber read grey).
  - Hovering a device (a cable manager) no longer shows its name twice (blue copy over black): hover outlines a
    thing's shapes and leaves its words as drawn; a text alone still turns blue.
  - "Interconnect" → "Link" in every label, menu, message and help (Link to…, key L); code names unchanged.
