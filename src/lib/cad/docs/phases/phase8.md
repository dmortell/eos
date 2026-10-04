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
