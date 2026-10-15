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
- **10 — Version model:** `../adr/0008-backups.md` (Proposed): two kinds of history — sheet REVISIONS (what was
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

## Backups (Dave 2026-10-08; ADR `../adr/0008-backups.md`, plan `../plan/backups-plan.md`)

Called **backups**, not versions (Dave: clearer to a new user). Dave's answers: no automatic backup when issuing (a
tick), the project owner only restores, a 30 s countdown, models (levels) only, keep until deleted by hand.

- **1 — What a model holds** (`domain/backupParts.ts`): `inParts` — a level, its spaces, outlets, underlays, plan
  shapes, sections, racks with their rows, devices and cords, the groups its shapes are in; a link / cord with one end
  inside CROSSES the edge (kept, its outside end noted). `floorsOf` groups area plans by floor (33F = 3303 + 3307),
  `partsLabel` ("33F 3307 + 32F", a whole floor reads "33F"). The file format is the existing `eos-cad` one
  (`persist/file.ts`) with `by`, `parts` and `library.blocks` (the global blocks it draws; devices copy a template's
  data, so no templates); a crossing link's outside end isn't reported as an error. Tests: `backupParts.test.ts` (6),
  `file.test.ts` (+2).
- **2 — Restore plan** (`domain/restorePlan.ts`): put back what differs, add back what was deleted, remove what was
  made since — inside the parts only; an entity moved to another model since is left alone; a crossing link comes back
  only if its outside end exists and that port is free (else skipped, with why); issues and sheets' `revisions[]` are
  never rolled back; `restoreSummary` ("1F: 1 changed, 1 removed" + skipped lines); `canRestore` (owner, or anyone
  when `ownerId` is unset); `canDeleteBackup` (its maker or the owner). Tests: `restorePlan.test.ts` (8).
- **3 — Collect and apply** (`app/backups.ts`): a backup is taken from the STORE (every level's data loads with the
  project) once the chosen models are loaded and nothing is pending; restore = ONE undo step, owner only, same
  project only, missing global blocks added back (`CadProject.addMissingBlocks`). The route passes `ownerId` and the
  user's name.
- **4 — As a file:** File › **Download backup…** (whole project or ticked models → gzipped `.eoscad`) and **Restore
  from file…** (greyed for a non-owner): choose a file, pick its models (`ui/PartsPicker.svelte`), Compare, Restore.
  A file from another project is refused. Live (Test Project): 1F = 227 items, 11 kB; a copy with A.003 relabelled and
  a text removed → "1F: 1 changed, 1 removed" → restored → Ctrl+Z → both back (checked in Firestore).
- **5 — The restore notice** (`app/restoreNotice.svelte.ts`, `ui/RestoreNotice.svelte`): `projects/{pid}/cadMeta/restore`
  pending → running → done / cancelled, one at a time (a transaction), abandoned after 10 min. Others see the 30 s
  countdown, are read-only while it runs (`EntityStore.readOnly`: edits, drags, undo / redo refused with the reason
  in the status bar; remote changes still arrive), then a done banner, and their undo history is cleared; a cancelled
  one shows only to those who saw it coming. The restorer's dialog counts down with Cancel. Tests: `store.test.ts`
  (+1). Live, two tabs: B saw the countdown, "editing is paused" (a tier change refused, nothing stored), the done
  banner; A's restore undone.
- **6 — Stored backups:** Project › **Backups…** (`ui/BackupsWindow.svelte`): Back up now (name, note, parts), the
  list with sizes and the total, newest or largest first; per backup Restore… (owner), Download, Rename, Delete (its
  maker or the owner), tick several → Delete N (a confirm bar). Stored as `cadBackups/{id}` + `chunks/{n}` (chunks
  first, the head last; chunking shared with `cadIssued` in `persist/chunks.ts`). "Back up the current state first"
  before a restore now makes a stored backup. Live: "Test 1F" backed up (227 items, 53 kB), a tier edit, restored
  from it (with "Before restore — Test 1F"), both deleted (heads and chunks gone).
- **7 — Issues:** the Issue panel's **Back up the project with this issue** (off; ticked it shows the size, "about
  98 kB" on Test Project) makes a whole-project backup "Issue NN: name" FIRST and records `Issue.backupId`; the Issues
  list shows **Restore its backup…** on such an issue (owner only); deleting the backup clears `backupId`. Not issued
  live (an issue uploads a PDF): the tick and warning checked, cancelled.
- Help: back up / restore a file, keep and clean up backups, the issue tick.

## Batch: shapes per elevation, file storage, multi-core cables (Dave 2026-10-09: "do 5 2 12")

- **Shapes that belong to one elevation** (backlog P2, G266): a FLAT shape drawn on an elevation's / section's plane —
  text, leader, cloud, dimension, a flat Shape-tool shape, and now a LINE — belongs to that view (`ownFrame` /
  `sameFrame` in `domain/shapes.ts`): drawn only in views with the same frame (that elevation / section and its
  viewports), never on the plan or the other elevations (notes used to show mirrored in the rear and edge-on in the
  sides). The Line tool in an elevation / section stores the line with the view's vertical plane; its nodes stay model
  points on the plane, so moving, grips and snapping work as before. Trunks, conduits, walls and boxes with a depth
  stay model items seen everywhere. Kept in the LEVEL's scope (not the unused `viewId` owner: elevations aren't
  entities, and level ownership keeps loading, backups and the clipboard as they are). Plan snapping no longer offers
  points of shapes on an elevation plane. Images wait for "Images on the model" (no image tool yet). Tests:
  `elevation.test.ts` (+2). Live (Test Project 1F): a line on the Front elevation, absent from the Rear; undone.
- **Default file storage per project** (backlog P2, T151): Project › Settings… › **Files**: "New uploads go to"
  UploadThing (absent = the default, as before) or Firebase Storage — `ProjectSettings.fileStorage`, one undo step,
  for everyone on the project. One upload path for cad's own files, `storeFile` in `app/projectFiles.ts` (replaces
  `saveProjectImage`): UploadThing's route, or Firebase at `projects/{pid}/uploads/{nanoid}_{name}` as Uploads lays
  it out; either way a `files/{id}` doc with its `provider`, so Uploads lists it. Issue PDFs (`app/issue.ts`) and
  title-block logos (`TitleBlockEditor`, incl. "Move to storage") use it; files already uploaded stay where they are.
  Live (Test Project): the Files tab; a 1 px PNG through `storeFile` to Firebase → `files` doc (provider firebase,
  path, type, projectIds), its URL loads; object and doc deleted. The setting flipped to Firebase (stored) and undone
  (field gone).
- **Multi-core cables** (backlog P2, T079): a multi-core cable is its cores' LINKS (one per core, port ↔ port, as
  before) sharing `Link.cable`; a cable type's **Cores** (Settings › Cable types, blank = 1) says how many it holds
  (`domain/multicore.ts`: `cableKey`, `coresOf`, `cablesOf`, `intoCables`, `coreLabels`). Link to… on a multi-core
  type puts the picked ports, in order, into cables of that many cores (18 ports on 12-core → a 12 and a 6; the tool
  bar says "in 2 × 12-core cable(s)"). Counted ONCE: fill (one cable's d² per segment), the BOM metres, the cable
  schedule (one row per cable: "PP1 : 1–12 → PP2 : 2–13", "os2 (12 of 12 cores)"; totals say cables), the sidebar
  cable list ("2 × os2 · 18 cores") and the riser view label ("2 × os2 (18 cores)"). The Links table shows "core 3
  of 12" and a type / status change goes to all the cable's cores; Port Properties' riser and hand length too, and
  its length / total count a cable once. Validation warns when a cable has more cores linked than its type holds.
  Not built: cable labels / ids of their own, splitting a cable, a core count on non-link (outlet) cables. Tests:
  `multicore.test.ts` (3). Live (Test Project): OS2 fibre given 12 cores; 4AR01's U21 panel ports 1–18 → Link to…
  → P3C-36 in IDF2: 18 backbone cores in 2 cables; the schedule showed 2 rows (164 cables); the Links table "core n
  of 12"; installing core 1 installed its 12 (not the 6); all undone (links back to 162) and the cores cleared.
  Also: the schedule's totals line lost its spaces before "· N without a route" (fixed).

## Batch: change history, fill by hand, text fields, routes by hand, frame label Excel (Dave 2026-10-09: "do 1 2 3 4", then "do 12 as well")

Also: floorplan zones rotate / drag and several buildings marked not required (→ `../plan/later.md`).

- **Change history per drawing** (backlog P2, T102): "what changed" per revision and who issued it were already
  recorded at issue (sheets-organising slice 7). Added: **Sheet Properties › Changes since last issue** — notes
  between issues: what changed and who asked for it, dated the day they're added, editable, × removes (one undo
  step each; `Sheet.changes`, `SheetChange`). Issuing a sheet at a NEW revision moves its notes onto the revision
  (`issuedRevision` in `domain/issue.ts`): the Issue panel's What changed defaults to them (placeholder; its tip lists
  them with who asked) and the title block's revision table shows that text; the sheet starts empty again. A sheet
  issued "as last issued" keeps its notes. Issued revisions in Properties show what changed (else the purpose); the
  tip adds who issued it and the notes. Duplicate drops the notes. Issue stays as it was. Tests: `issue.test.ts` (+1).
  Live (Test Project): notes added on S001 and S003; S003 retitled so it would get a new revision → the Issue panel
  defaulted What changed to "Added AP-12" with the notes in its tip; cancelled (nothing issued); all three edits
  undone.
- **Fill by hand** (backlog P2, T080): a run's containment role keeps `extra` rows (`HandCables`: `n` × `type`, own
  Ø `d`, one segment `seg` else the whole run). `fillBySegment` adds them to the routed cables (a segment with only
  hand cables now has a fill too); `SegFill.hand` / `.od` say which and their Ø, so the section picture packs them at
  their size. Run Properties › Fill › **Cables by hand**: count, type (the cable types as suggestions, or any name),
  Ø (placeholder = the type's), whole run / seg N, × — one undo step each; Add puts the row on the picked segment.
  The BOM doesn't count them (they aren't links). Tests: `fill.test.ts` (+1). Live (Test Project 1F, TR1 50×50
  tray): Add → 1 × cat6a on every segment; changed to 4 × power Ø10 on seg 3 → 13.7 % → 29.7 %, the picture packed
  four Ø10 cables; all five edits undone.
- **Text fields linked to data** (backlog P2, T092): `domain/fields.ts` — `{PROJECT}`, `{LEVEL}`, `{SHEET}`,
  `{SHEET_TITLE}`, `{DATE}` and `{COUNT:name}` (inserts of that block — by name or id — plus outlets drawn with it,
  on the view's level) in any text, leader or block text, filled when drawn and never stored (`fieldCtx` +
  `withFields`, the last step of a view): plan / elevation / section / riser in `ViewCanvas`, each viewport and the
  paper notes in `sheetDisplayList` (so PDFs and issues too; a viewport reads its level, a paper note its viewports'
  levels and the sheet), the plan DXF. A field with nothing to show (no sheet in a plan) stays as typed. Block
  attributes leave data fields out (`blockAttrDefs`), so an insert doesn't blank them. Not done: a DXF block ATTRIB
  keeps a data field as typed (plain texts are filled). Text / Leader in Properties list the fields in their tip.
  Tests: `fields.test.ts` (2). Live (Test Project 1F): "{PROJECT} {LEVEL}: {COUNT:Wireless AP} APs" drew "Test
  Project 1F: 2 APs" (1F has two placed APs); undone.
- **Set a cable's route by hand (diverse routes)** (backlog P2, G148, T078): `Link.via` is now the runs to pass
  through IN ORDER from the panel end — one id as before (old data and older tabs keep working), several an array
  (`viaList` / `viaValue` in `domain/routing.ts`). Routing (`throughRuns`): legs that don't use the runs they connect,
  and ALONG each run a search over directed pieces that never turns straight back (`alongRun`), so a cable told to go
  through a loop goes round it instead of up one leg and back; the far end's Dijkstra doesn't use the last run either.
  The Dijkstra core is shared (`dijkstra`, with runs to skip). No route says which run: "can't reach TR3 (in the
  order given)" or "can't go on from TR3 to its other end (a dead end?)". Port Properties › **Route through** (every
  cable kind now, was Riser on backbone / tie only): a list of runs and risers (`containmentRuns`: risers first, then
  by level — "TR1 · 1F", "Riser A (riser)"), change / × / "+ then…", mixed selections show (mixed) + clear; one undo
  step, all cores of a multi-core cable. Joining runs rewrites the list (`dragParts`). Tests: `routing.test.ts` (+1:
  a loop gone round, 17 m not 11 m up-and-back; a missing run). Live (Test Project, P3C-37 rear port 3 → A.001):
  9 m shortest; through TR2 15 m; TR2 → TR3 and TR3 alone: no route — TR3 (the short run by IDF2) isn't joined to
  the trunks; everything back to Shortest (an HMR reload mid-check had cleared undo; the edits were net zero).
- Fix (found while testing): cancelling the Issue panel switched the Sheets tab to its Issues view; now only a
  finished issue goes there, Cancel stays where you were (`IssuePanel` `onclose(issued)`). Live: Sheets → Issue… →
  Cancel → still Sheets.
- **Frame label sheets in Excel (grid layout)** (backlog P2, G097 / G131 / T050; Dave "do 12 as well"): the Frames
  export (`frames/parts/exportExcel.ts`) ported onto cad's racks — `render/frameSheets.ts`: `frameRacks` (pure: a
  room's patch frames, else racks holding a panel, in row order; each device a block from its top U; a panel's ports
  24 a row in its numbering, each cell the port label + the usage of the outlet it reaches, or the usage a
  reservation holds it for; other devices one block; PDUs left out; a front device wins a U shared with a rear one)
  and `frameWorkbook` (ExcelJS: 2 rows per U, RU column, port-number header, usage colours from Settings as a light
  tint + darker text, reserved = italic with a dotted border, device blocks merged and shaded, block / rack borders,
  A3 landscape fit to one page, footer file name + page; a sheet per frame, or one per room with the racks side by
  side, bottoms aligned). Racks window › room ⋯ → "Frame label sheets (Excel), a sheet per frame / one sheet for
  the room". Tests: `frameSheets.test.ts` (2). Live (Test Project IDF2, one sheet for the room; the download caught
  in the page and read back, nothing saved): one sheet "1F IDF2", R312 and R311 (42U) start 3 U lower than P3C
  (45U), labels coloured by usage (desk blue, others green), managers as merged blocks, A3 landscape fit, footer.

## Batch: menu fix, rack elevation context, markup kinds (Dave 2026-10-09)

Dave: the Racks window's room ⋯ menu "looks weird with labels centered"; rack elevation context = the server room's
own floor / ceiling lines and the view toggles (draggable walls a maybe → `../plan/later.md`); markup = arrowheads,
images, and blocks for datum, detail and elevation tags (no north arrow).

- **Room ⋯ menu**: the native select (centred labels) is now the app's own menu (`ContextMenu`, as right-click),
  opened under the button — left-aligned, padded, with a separator before the frame sheets. `ContextMenu` now mounts
  itself on cad's root (`.shell`): inside a floating window (backdrop-filter) a fixed menu was placed relative to the
  window. Live: opens right under ⋯.
- **Rack elevation context** (backlog P2 → the rest P3): a server room's own floor and ceiling — `Space.floorMm` /
  `ceilingMm`, mm above the level's FFL, typed in a rack's Properties › Room, row, level (one undo step, the room's).
  Its racks stand on its floor everywhere (`roomFloor` in `domain/devices.ts`): the rack view lifts racks, devices
  and cords (`liftPrim`), `rowHit` and the Device tool's ghost follow, the level elevations draw the rack on it, and
  routing's rack drop starts from it. The rack view draws "IDF2 FLOOR FL+150" / "IDF2 CEILING FL+2400" (the room's
  ceiling replaces the level's) beside the slab lines. **Toggles:** two new system layers, Room lines (the floor /
  ceiling / slab / FFL lines) and Other face (the faint devices of the other face), found by class since they have
  no source (not pickable) — `primLayer`; the rack view strip has Room lines / Other face buttons (your layer eye),
  and a sheet viewport freezes them like any layer. Not built: F to flip, dragging the lines (backlog, P3); walls
  (later.md, maybe). Tests: `rackRow.test.ts` (+1). Live (IDF2): floor 150, ceiling 2400 → the lines and labels, the
  level's ceiling line gone; Room lines off → none drawn, on → back; both undone.
- **Markup: line end marks** (backlog "Markup kinds" part 2): `style.ends` `{ a?, b? }` (`LineEnd` = arrow / dot /
  tick) on a plain line — `a` at its first point, `b` at every other loose end — drawn by `lineEnds` (views/plan.ts)
  pointing out along the last segment: a filled 3 × 2 paper-mm arrow, a Ø1.6 dot, a 3 mm 45° tick, in the line's
  colour (solid even on a dashed line), on plans, sheets and elevations (`endItems`), screen and PDF. Properties ›
  Start / End for one or several plain lines (LineStyle). Tests: `plan.test.ts` (+1). Live (1F): a line given an arrow
  and a tick → one head, one tick drawn; undone.
- **Markup: drawing symbols** (backlog "Markup kinds" part 5; no north arrow — Dave): built-in annotative blocks in a
  Symbol group (`drawingSymbols` in domain/blocks.ts) — Datum (level): a quartered target on its line, "{NAME}
  {HEIGHT}" (FFL +0); Detail callout: a split bubble, {NUMBER} over {ON_SHEET}; Elevation tag: the bubble with a
  filled pointer on its edge (turn the insert to aim it). Their words are block attributes with defaults (Properties
  › Attributes per insert). A symbol's solid parts are filled in its line colour: a new `ink` class (screen and PDF;
  line end marks use it too) — before, a solid shape in a plain insert filled light grey. Tests: `blocks.test.ts`
  (+1). Live (S001): the three placed from the Blocks panel — "1 / A-201", "1 / A-501", "FFL +0", the pointer and the
  datum's quarters dark; deleted afterwards (an HMR reload had cleared undo).
- **Markup: images** (backlog "Markup kinds" part 4, and the plan / sheet half of "Images on the model"): Insert ›
  Image… (`ImagePickDialog`): "From this computer…" (stored with `storeFile` per Settings › Files, listed in Uploads)
  or a picture / PDF page already in Uploads; then the Image tool (the Shape tool's `image` kind) drags its box on a
  plan or a sheet (an elevation says not yet). The image geometry draws as a `picture:fileId#page` reference fitted
  centred in its box (`fit: 'centre'`), plus an unseen `image-frame` that takes clicks and the selection; grips resize
  it like a box (`regionGrips` / `dragRegionGrip`). The reference resolves when shown (`PdfCache.picture`: an image
  file as is, a PDF page rasterised; the shell provides it to `Prims` as the `cad-picture` context) or printed
  (`pictureLoader` for sheet PDFs, `frozenImages` for issues) — display lists and frozen issues keep the reference,
  never a blob url. Properties › Image shows the file, page and size (no line style). The "Markup kinds" entry is
  done; "Images in elevations" stays (P2). Tests: `plan.test.ts` (+1). Live (S001): eire-logo.png and 3PAGE.pdf
  page 2 placed by dragging, both drawn (the PDF page rasterised), the logo resized by its corner grip; both removed
  (undo, and a delete for one placed before an HMR reload).
- **PDF of this sheet** (Dave 2026-10-09: "I can't find it"): File and Sheets menus › PDF of this sheet — the sheet
  open in the active pane (greyed when none). It was already on the Navigator's right-click (PDF), the sheet's
  Properties (Download sheet PDF) and Tables › Sheets (PDF of the selection); Help gains "Make a PDF of a sheet". Live:
  the item shows, enabled on S001 (not clicked: a download).
- **Lines on sheets: selection and grips** (Dave 2026-10-09: "lines inside views show selection and grips nicely,
  but lines on sheets don't"): the sheet canvas highlighted nothing (the paper and its windows share the sheet's id),
  so a selected paper line, note or shape had no blue line / box — now everything selected but the sheet itself is.
  A line drawn inside a viewport is tied to it in its view mm, but the Select tool gripped it as paper mm (grips off
  the line, drags wrong): `#pathSpace` in selectTool.ts takes its points through the viewport (`gripSpace`) for grips,
  node / segment drags, segment picks and double-click node insert; a sheet's line gets no grips in other views.
  Live (S001): a line drawn in the viewport — blue, grips on its ends, its end grip dragged to where it was dropped;
  undone.
- **Images in elevations** (backlog P2, done): the Image tool works in elevations and sections — the box goes on the
  view's vertical plane at the work depth (as a flat shape there: points in (u, z)), so it shows only in that view
  (`ownFrame`). views/elevation.ts draws it as the picture fitted in its box plus the unseen `image-frame`; moving,
  copying and the 8 resize grips come from the vertical-plane shape code already there. Insert › Image…, the picker,
  the tool hint and Help say where it goes. Tests: `elevation.test.ts` (+1). Live (1F front elevation):
  eire-logo.png dragged in, drawn, selected with its 8 grips, moved and resized by its right-edge grip (4240 → 5970
  mm, left edge kept); removed (an undo, then a delete after a reload had cleared undo).
- **Work plane grip** (Dave 2026-10-10: "should the green dashed work plane be movable?" — yes): with a plan and an
  elevation split, the green work-plane line in each pane gets a green grip where it starts by the drawing, its value
  beside it ("Work depth −8180 (auto)" / "Work Z +1040"). Dragging it (Select tool) sets the elevation's work depth
  (plan) or the plan's Z (elevation) in 10 mm steps (Alt: free); a double-click on the plan's grip sets the depth back
  to auto. A grip, not the line: at Z 0 the line lies on the floor line, where most things are clicked.
  `workPlaneGrip` / `workPlaneAt` in views/overlays.ts (tested in the new `overlays.test.ts`), ViewCanvas the drag and
  the grab cursor; Help "Set where drawing in an elevation goes". Live (1F front + plan): depth −8180 → −5990 by a
  drag, double-click → auto; Z dragged to +1040 and back to 0.
- **Cloud preview** (backlog ⚡, Dave 2026-10-09): the Revision cloud tool's rubber band is scalloped as the cloud will
  be drawn — one bumpy edge for two points, then the closed cloud (`cloudPts` exported from views/plan.ts; bumps 6
  printed mm: paper mm on a sheet, × the plot scale elsewhere). Tests: `notes.test.ts` (+1). Live (1F plan): one
  scalloped edge, then a closed cloud following the cursor; dropped with Esc. Backlog: penetration fill and linked
  symbols moved to P3 (Dave: low priority) — no P1 / P2 left.
- **Plan things not in elevations** (Dave 2026-10-10: "when outlets, symbols, 2d blocks, dimensions etc are placed on a
  plan, they should not be displayed on elevations"): elevations and sections now show only outlets and block inserts
  placed IN an elevation / section (new `inElevations` flag, set by the Outlet and Insert tools there), and no flat
  plan drawing (`planDrawing` in views/elevation.ts: a line, box, circle or polygon with no height, role or vertical
  plane; a line that rises still shows). Plan text and dimensions already didn't. Outlets / blocks placed in an
  elevation before this have no flag, so they now show on the plan only: re-place them in the elevation. Tests:
  `elevation.test.ts` (+1, fixtures' outlets marked as placed on walls), `insertTool.test.ts`. Live (1F front + plan):
  the elevation shows no outlets (the plan's 32 still drawn); a faceplate placed in the elevation shows there; undone.
  Help: "What a plan shows in elevations".
- **Show in elevations tickbox** (Dave 2026-10-10): Properties › Elevations "show in elevations" sets `inElevations`
  on an outlet or a block insert (plan / elevation inserts; not sheet ones) — one, or several at once (mixed =
  indeterminate). Fixes outlets / blocks placed in elevations before the flag, and shows a plan-placed wall outlet
  there. Live (1F): ticked outlet A003 → it showed in the front elevation; undone → gone, box unticked. Help updated.

### Batch 5 (Dave 2026-10-10: "do 2 5 6 7 10. do the blocks drag")

- **Layer line type and lineweight** (backlog ⚡): Layers › the line sample on a row opens Line type + Lineweight
  selects (undoable; a system layer gets its record on first change). `applyLayers` (views/layers.ts) puts them on
  lines and circles that set none of their own — not on text, pictures, note backgrounds, shape fills, run bands, or
  (line type) arrowheads / ticks; PDF and DXF read the same prim fields. Tests: `views/layers.test.ts` (+1). Live
  (1F plan): Drawing → Dashed 0.5 mm, its two boxes drew dashed and heavier; both undone. Help entry.
  Note: the Chrome tab was in the background, so the floorplan PDF didn't render (pdf.js waits for a visible tab) —
  not a bug.
- **Match properties** (backlog G247): Edit › Match properties, or right-click one shape › Match properties…, arms the
  `match` tool (editor/matchTool.ts) with the selected shape as the source (none: the first click picks it); each
  click on another shape gives it the source's layer (as drawn: its own or its kind's default) and style (colour,
  fill, line type, lineweight; a line's end marks stay), a text the source text's size — one undo step each
  (domain/match.ts). Plan, elevation, section, sheet. Tests: `domain/match.test.ts` (3). Live (1F plan): a Walls box
  → a Drawing box moved it to Walls (Walls 20 → 21, Drawing 7 → 6); boxes already on Walls said "It already
  matches"; undone. Help entry, tool hint.
- **Viewport handling parts 4–6** (backlog): (4) arrow keys move a picked viewport's window 1 mm (Shift 10 mm), a
  burst one undo step, a locked one refused (`Nudge.pressViewport`); (5) dragging a viewport (move, or a corner
  resize) snaps its edges to the paper edge, the margin, the title block's outline and the other viewports' frames
  within the pick tolerance, else to a 5 mm grid — Alt free, Shift-square resizes unsnapped (`viewportSnapLines` /
  `snapViewportDrag` in editor/dragParts.ts, lines taken once per drag from the sheet's prims); (6) Properties › Fit
  also picks the largest standard 1:N at which the view fits the window (`fitViewport`, views/sheet.ts; an empty view
  keeps its scale). Tests: `editor/viewportHandling.test.ts` (5). Live: not checked — the Chrome tab was in the
  background, where the panes don't redraw on a tab switch.
- **Copy one segment of a run** (backlog G064 part): Ctrl-drag on a PICKED segment of the selected run copies just the
  picked segments as a new run (`copySegs`, domain/pathEdit.ts: section, role, layer and style kept, new ids, a
  wall's openings on them come along, nodes not attached, no label; disconnected segments give a run each), moved
  by the drag and selected; the run stays. A Ctrl-click (no drag) still drops the segment from the pick. Tests:
  `pathSel.test.ts` (+1). Live (1F plan): the diagonal trunk segment Ctrl-dragged down — a copy of that segment only,
  the run untouched; undone. (A quick second click on a selected run is a double-click: it adds a point — undone.)
- **Find / replace in the Renumber panel** (backlog P021): the Renumber panel (Properties, several labelled things or
  the Renumber tool) has Renumber / Find / replace tabs. Find / replace changes text in their labels (outlets' ports
  follow, as a rename) or, for outlets, in their PORT labels only; plain text replaces every match, "regular
  expression" takes a pattern with `$1` … groups; a bad pattern says why; preview old → new, empty labels refused,
  labels already used listed (`replaceInLabels`, domain/renumber.ts). The outlet grid's Find/replace… now selects the
  outlets (the selected, else the shown) and opens it; the mode resets when the selection clears. Tests:
  `renumber.test.ts` (+3). Live (1F plan, 8 outlets): A0 → Z0 previewed 5; port labels with `-A(\d+)$` → `/$1` turned
  L01.003-A01 into L01.003/01, applied, undone; "(" said "Not a valid pattern …". Help entry.
- **Blocks: drag to place** (backlog G284 part): a block in the Blocks list can be dragged onto a plan, an elevation /
  section or a sheet (not a rack view, not inside an edited viewport): over the view it arms Insert with that block
  (its ghost follows), the drop is Insert's click there (on the wall behind it in an elevation), then the tool and
  block you had come back. The drag-arm (`ws.startDrag`) can now name its tool; `dropTakes` (ui/viewportEdit.ts)
  decides which views take a drag (a named tool: where it works; else rack views, as before). Tests:
  `ui/libraryDrop.test.ts` (3). Live (1F plan): "Faceplate - power, single" dragged in with HTML drag events — ghost
  shown, the insert placed and selected, Select back; undone. Left in the backlog: a block's own front drawing.

Batch 5 done (Dave's 2, 5, 6, 7, 10 + blocks drag).

### Follow-ups (Dave 2026-10-10)

- **Say the layer a drawing went on** ("a toast might be a good idea"): `domain/layers.ts` `drawnOn(created, layers)` —
  "Drawn on the Walls layer" for new plan / view shapes (paper shapes: nothing); `CadShell` subscribes to the store
  and says it after a local edit or a finished gesture, unless the tool is Select / Move / Copy / Match (paste and copies
  keep their layers). Help: "Which layer did that go on?". Test in `views/layers.test.ts`.
- **0U PDU selection box too wide:** `primBounds` measured the PDU's turned name (rot −90) as flat text, so the box
  was as wide as the name is long. Turned text is now measured turned (also tightens picking and zoom-to-fit).
  Test: `views/display.test.ts`.
- **Rack order round a corner (Journey IDF1):** R301–R303 face up (180°); round the corner P3A faces right (270°) and
  its two VCMs left (90°). Runs were grouped by exact rotation and ranked along the FIRST rack in the data (a VCM), so
  the view read R301 R302 R303 then P3A. `racksInOrder` now groups a run by its line (rotation mod 180), orders each run
  from the facing with the most width, and ranks runs along the widest run: VCM P3A VCM R301 R302 R303 (Dave: P3A left
  of R301). IDF 2 unchanged. Allocation follows the same order, but existing links stay. Help: "Change the order of
  racks in a rack view". Test in `views/rackRow.test.ts`.
- **Server room rack counts leave out VCMs:** the Navigator's "N racks" beside a server room skips `kind: 'vcm'`;
  the managers are still listed under it. Test in `domain/navTree.test.ts`.
- **Labelled port ranges on a panel (Dave: option A — P3A U41, top 24 → R301, bottom 24 → R302):**
  `PanelInfo.groups` = `{ from, to, label }[]`; `domain/portGroups.ts`: `groupPortLabel` ("P3A-R302:01" for the 25th
  port, numbered within the range), `groupsProblem` (off the panel / back to front / overlapping), `splitPanel` (In two:
  each half labelled "<rack>-<the rack its cables go to>", else "<panel>-A / -B"). `ProjectIndex.portLabel`: own label,
  then a range label on this panel or the far end's, then the rack-pair tie label — so both ends of a tie read the same.
  Rack view: each range's label over its first port instead of the panel name. Properties › Ports and labels › Split
  labels (In two, edit from / to / label, + Range, ✕). Help: "Give half a panel its own label". Tests:
  `domain/portGroups.test.ts` (5). Not tried live: Test Project has no 48-port panel with ties.
- **Drag tabs to reorder (Dave):** `Tabs.move(id, target, after)` (the panes keep their tabs; saved with the list);
  the strip uses `$lib` DragReorder, a blue line on the side the tab goes. Help: "Work with the drawing tabs". Test in
  `app/tabs.test.ts`. Live: a tab dragged to the front and back with drag events — order changed, views unchanged.
  Off the backlog.
- **Duplicate tabs (Dave: "why are there duplicate tabs shown?"):** switching a tab's view in place (the view bar's
  Plan / Front …, a level picked elsewhere, Back / Forward) never checked for another tab open on that view; only the
  Navigator's open did. `Tabs.go` / `sync` / `nav` now show that open tab instead (the current tab is left as it was),
  and duplicates saved before merge on load (the first kept, panes moved to it). Test in `app/tabs.test.ts`. Live:
  Test Project's two "IDF2 racks · Row A" and two "1F plan" tabs merged — 7 tabs, all different.
- **Unlink several panels at once (Dave: P3A's panels U4–U10 in Journey):** `domain/ports.ts` `cablesOnDevices`;
  `ui/DeviceCables.svelte` — Remove links (N) / Remove cords (N) for one device (Properties › Ports and labels) or
  several (DeviceMultiProps); asks first, one undo step. Test in `domain/ports.test.ts`.
- **Shift-click a range of devices (Dave: select U10, Shift-click U4):** `domain/devices.ts` `devicesBetween` — the
  rack's devices shown on this face whose Us fall between the two, top down (0U PDUs left out); `SelectTool` keeps the
  last device clicked (body or port) as the anchor, and a Shift-click on another device of that rack selects the range
  (a Shift-click on the same device still selects a port range). Help: "Select a run of devices in a rack, and unlink
  them". Test in `editor/racks.test.ts`. Not clicked live: Dave was working in the tab.
- **Drag outlet rows onto a panel itself (Dave: Journey, rows from the bottom panel to a panel to allocate):** this
  already worked onto a PORT; `AssignTool` now takes a drop (or click) on the panel's body too — from its first free
  port. Hints and Help say so (and that a rack view opens the tables on the Patch list: pick Outlets). Test in
  `editor/racks.test.ts`. Live (Test Project): an outlet row dragged onto PP3's edge linked its 4 ports; undone.
- **Closed tables keep their tab bar (Dave):** closed, the tables leave their bar under the drawing — the four tabs and
  an open button; a tab opens the panel on it (`TablesPanel` `closed`, `CadShell` `tablesBar`; not when Ctrl+. hides
  everything). Help: "Open, move and dock windows". Live: ✕ left the 28 px bar; Outlets opened it on the outlet table.
- **Gap under the status bar (Dave):** the shell was `100vh − 3rem` (42 px) under a 28 px title bar, leaving 14 px
  empty. The cad page's Titlebar is now `height={28}` and the shell `100dvh − 28px`. Live: the status bar ends at the
  window's bottom, no page scroll.
- **Outlet drag refused in a real browser (Dave: outlets 201–257 onto the U10 panel, "drop remains disabled"):** the
  table starts the drag with `effectAllowed = 'link'` and the view answered every dragover with `dropEffect = 'copy'`;
  a drop effect the source doesn't allow makes the browser show "no drop" and never fire `drop`. Synthetic drag events
  (the earlier live checks) skip that check. `dropEffectFor(effectAllowed)` now answers in kind. Test in
  `ui/libraryDrop.test.ts`.
- **The picked table survives a refresh (Dave: "refresh resets bottom panel tab to Patch List"):** the table picked per
  kind of view was kept for the session only; it's now `Panels.tableFor`, saved with the panel layout in this browser.
  Live: Outlets picked in the rack view, page reloaded — Outlets again.
- **Panel ports showing 001 / 046–056 for outlets 201–257 (Dave, Journey P3A):** not the drag. A Renumber at 08:31
  UTC renamed 56 outlets on 33F 3303 to 201–257; 12 kept their old port labels (201: 001.A…, 245: 056.A …) because
  those port labels didn't contain the outlet's old label — the legacy Outlets import keeps the old tool's port labels
  as they were (Dave: 001–078 came from it). The drag at 08:44 linked them; a panel port shows the outlet PORT's label.
  Journey has 25 such outlets, all on 33F 3303 (some — TV01…08 with ports 058… — may be meant). Repair, chosen by
  Dave per selection: `domain/labels.ts` `portsFromLabel` and, in outlet Properties, a warning with Ports from label
  (ports that contain the label are left alone; through `relabel`: asks for printed panels; undoable). Help: "A panel
  port shows the wrong outlet number". Tests in `domain/labels.test.ts`. Journey not changed by me.
- **Outlets picked in the list show their panel ports (Dave):** `views/overlays.ts` `outletPortCells` — the ports
  linked to selected outlets drawn as selected ports in rack views (added to ViewCanvas's port highlight). Test in
  `views/overlays.test.ts`. Live (Test Project): an outlet linked to PP3, its row clicked — 4 ports lit; undone.
- **Drag picked panel ports to another panel (Dave: "if not patched, drag them to the first port to start allocating
  from"):** `domain/allocate.ts` `movePorts` — the picked ports' outlets, in port order, onto free ports from the drop
  port (`assignFrom`, pinned); ports with a cord stay and are reported. `SelectTool`: a press on a picked port of a
  PANEL whose picked ports carry outlets starts it (a switch, or ports with no outlets, still drag the device — the
  old "Select drags a device" test caught that); the release on a panel moves them and picks them there; a click
  picks that port alone. Help: "Move outlets from one panel to another". Test in `editor/racks.test.ts`. The drag
  itself not tried live (synthetic pointer drags on the canvas); the tool test runs the real Select tool.
- **Split labels named from the cables, always (Dave: Journey P3A U41 read P3A-R301A / P3A-R301B):** "In two" was
  clicked before the ties existed, so it stored the fallback "<panel>-A / -B" (the panel is named P3A-R301). A range's
  `label` is now optional: none = `rangeLabel` works it out from its cables each time ("<rack>-<far rack>", else
  "<panel>-A…"; cached per index); a typed label wins; clearing it goes back. "In two" and "+ Range" store no label;
  the Properties field shows the worked-out one in grey. Tests in `domain/portGroups.test.ts`. Checked on Journey's
  data in memory (nothing written): with its two labels cleared, P3A U41 reads P3A-R301:01–24 / P3A-R302:01–24, and
  R302-P3A's ports P3A-R302:NN. Dave clears the two typed labels himself.
- **Split label boxes out of sight (Dave: "I can't see the split label fields"):** with ranges, each line (from, to,
  label, ✕) sat in the 2nd column of the 6.5rem / 1fr row; the number boxes and ✕ left the label box 10 px wide. Each
  range is now its own full-width line under "Split labels" (`.range` grid: 3rem – 3rem 1fr ✕); + Range sits on the
  header row. Live (Test Project, PP3 "In two", undone): label boxes 110 px, PP3-A / PP3-B shown in grey.
- **Kind for several devices (Dave: "need to be able to edit Kind in props for multi-selected devices/panels"):**
  `DeviceMultiProps` has a Kind select ("mixed" where they differ), one undo step, F4 repeats it. Help: "Make the
  same change to more devices".
- **Link several panels to a switch, labelled by the switch port (Dave: Journey P3A U13–U24 → the three 96-port
  switches 33NACC1–3; "Link to" missing with 4 panels selected; the panels didn't show the switch label; "they could
  probably just show port numbers 1 to 96"):** `bulkInterconnect` takes `a.more` (further panels; each carries on
  from where the one before stopped on the target). Several panels selected: Properties › "⟷ Link N panels to…" or L
  arms it (`ws.interconnectPanels`, top panel first by rack then U); the hint counts every port. `portLabel`: a
  device ↔ device link with a SWITCH at one end reads the switch port at both ends — its own label, else "01"–"96"
  (after the panel's own labels and split ranges; before the rack-pair tie label). 33NACC2 / 33NACC3 were kind
  panel; Dave set them to switch. Help: "Link several panels to a switch". Test in `domain/interconnect.test.ts`.
- **Switch ports numbered down each U (Dave: "those Arista switches have ports in an odd order, port 2 is below port
  1, and ports 49 and 50 are on rows 3 and 4 below port 2"):** "Down (2 under 1)" ran down all four rows of a 96-port
  2U switch (1–4 in the first column). It now goes down each U's pair of rows: 1–48 on rows 1–2, 49–96 on rows 3–4.
  One helper, `portAt` (domain/devices.ts), for the rack view, the frame sheets and the panel label sheets (each had
  its own copy). 1–2-row devices are unchanged; the only 3+-row devices numbered down in any project are Journey's
  three CCS-720XP-96 (checked read-only). Help: "Number a switch's ports down". Test in `views/rackRow.test.ts`.
- **Patch to… / Link to… hand the tool back (Dave: "after linking … the cursor remains a crosshair — what will
  clicking further ports do?"):** the armed bulk was made on the click, but the Cord tool stayed, so two more port
  clicks made a patch cord. Arming (`ws.#armBulk`) remembers the tool you had; the cord tool calls `done` once the
  bulk is made or Esc'd and the workspace puts that tool back. Picking the Cord tool yourself still makes cord after
  cord. Help: "Link several panels to a switch". Test in `editor/racks.test.ts`. Live (Test Project): L → Cord tool,
  Esc → Select again; nothing written.
- **No dashed box round a selected run (Dave: "the dashed select rect around trunks looks odd"):** runs were meant to
  get the blue line only, but a labelled run's name (text) or a riser symbol brought the box back round the whole run.
  `Prims.svelte` now never boxes an item drawn as a run (`run…` / `riser…` / `run-label` prims). Live (Test Project
  1F plan): TR2 selected shows its grips and blue line, no box.
- **Layer up in a run's General group (Dave: "in trunk props, Layer appears way down below nodes and segments"):** the
  Layer row is drawn once at the end of Properties; for one run / line it's now in PathProps' General group (Kind,
  Label, Length, Layer) and not repeated at the bottom. LayerPick's row now matches the other Properties rows (6.5rem
  label, same box) — it had its own narrower, muted one. Live (Test Project TR2): Layer under Length, aligned.
- **An outlet next to a tiny stub joins the real run (Dave: Journey TV06 "not connected, there is a high level trunk
  beside it"):** TV06 (high) took its nearest high run, conduit 5m3-h8C-JYJ1 — but the nearest part was a 38 mm end
  bit, shorter than JOIN_MM (50), so both its ends merged into one graph node and it had no pieces: a route starting
  on it went nowhere ("the runs at the two ends are not connected"). `outletTap` and `rackTaps` now skip a segment with
  no pieces; the outlet joins the segment beside it (38 mm further). Test in `domain/routing.test.ts` (fails without
  the fix). Journey in memory, nothing written: TV06.A / .B → 20 m.
- **Edit which server rooms a run serves (Dave: Journey TV07 / TV08 not connected; "allow editing which rooms a
  conduit / trunk serves. Do vertical risers also need it across floors?"):** `role.serves` came only from the legacy
  Outlets import and nothing showed it; every high conduit on 33F 3303 served 33IDF1 only, so 33IDF2's high outlets
  (TV07, TV08, CCTV01–04, AP01, TEL01) found no run ("no high run within 10 m … serving its room"). Run Properties ›
  General › Serves: a box per server room on the run's levels (and any it serves already); none = every room
  (`servableRooms` / `toggleServes`, domain/runEdit.ts). Risers: no — serving only gates where a cable JOINS (outlet
  drop, rack); the walk uses any run. Tests in `domain/runEdit.test.ts`. Journey in memory, nothing written: with
  33IDF2 ticked on 5m3-h8C-JYJ1 all 8 route (4–23 m). Live (Test Project TR2): ticked 33IDF1, Edit › Undo, back to
  none (checked in Firestore). Help: "Which server rooms a run serves".
- **A tick under the middle of the ports (Dave: "cable outlet ports on the left of the frame to switch ports on the
  left, and same for the right"):** a device or panel with 24 ports or more gets a short tick at the centre of its port
  grid, from its bottom edge up to the ports (6 mm at most; class `port-mid`, also in PDF / DXF). Tried 10 mm up into
  the gap between the middle ports — Dave: the ~3 mm one looked fine. Test in `views/rackRow.test.ts`. Live (Test
  Project 33IDF2 racks): ticks on the 24-port panels, fibre enclosure, 48- and 96-port switches. Help: "Find the
  middle of a panel's or switch's ports".
- **Cord-end grips, a + on a selected port, a green edge on patched ports, a shorter drop (Dave: "grips on each end of
  a selected patch cord would be great for repatching …"):** a selected cord in a rack view shows a grip on each end
  (the ends of its drawn line); dragging one onto another port re-patches that end (`repatch`, which now also refuses
  the cord's own other end; an installed cord becomes a `change`). The drop takes the NEAREST port cell — the topmost
  within the tolerance was the next port along (live: dropped on 16, landed on 17). A click on the grip picks the port.
  A selected port with no cord shows a + at its cell's top-right: a panel port with a link → Patch to… (cord tool
  armed), with none → Link to…, a switch / other device → Patch to… (Link to… is a panel's only, as in Port
  Properties); mixed or patched ports → no +. Pure helpers in `editor/portGrips.ts`; `ToolCtx.armPorts`. Ports with a
  cord in (not one being removed) get `port-patched`: a green 2 px edge (also in PDF). Channel cords drop half as far
  under a port (3 mm + half the lane step) — on a 48-port 1U panel the drop covered the port below. Tests in
  `editor/racks.test.ts`, `views/rackRow.test.ts`, `views/cordRoute.test.ts`. Live (Test Project 33IDF2, P3C): green
  edges; cord P3C-37:15 → P3C-35:15 dragged to 17 and back to 15 (as before: ADD, 1 m); + on P3C-35:18 armed a patch,
  on P3C-36:3 a link, Esc back to Select each time. Help: "Re-patch a cord, or start one from a port".
- **Patched outlet ports in the Outlets table (Dave: "indicate which ports of each outlet have been patched (maybe
  change the pinned indicator to green?)"):** the Panel column's "P3C U37:15" reads green (bold) when that panel port
  has a cord in (not one being removed) — the rack view's green edge; its tooltip says where the cord goes. The whole
  entry rather than only the ◆: pinned and patched are separate (an unpinned port can be patched), so the ◆ stays
  "pinned". Header: "Panel (◆ pinned · green patched)". Live (Test Project 1F): A.004 U37:15, A.005 U37:17, A.008
  U37:6 / U37:7 green — the green-edged ports on P3C-37. Help: in "Re-patch a cord, or start one from a port".
- **Cable schedule sorted by label (Dave 2026-10-11):** the dialog and its Excel export list cables by label, in
  natural order (O2 before O10), unlabelled last; ties by kind, then the panel end (was: kind, then panel end).
  Test in `domain/routing.test.ts`.
- **Patch list management, Slice 1 — the status rules (`docs/plan/patch-list-plan.md`, Dave's D1–D8 2026-10-11):**
  - A `change` moved back onto its old ends is `installed` again, with no history (legacy rule). A cord marked
    `remove` doesn't move ("restore it first").
  - Removing a `change` (a move not yet made on site) takes the cord out from its OLD ends, so Restore gives the
    installed cord back where it is.
  - `setStatus` (the Properties status box, to fix a mistake) never deletes: installed / add forget the history,
    remove remembers ends + status (Restore brings it back). Revert and the status box now write the whole cord —
    the patch over `c` kept `previous`, so a reverted cord still showed "Was: …".
  - Device / Port › Remove cords follow the install workflow (`removeCords`): installed cords are marked `remove`,
    planned ones deleted ("2 marked for removal, 1 deleted (never installed)"); cords already marked aren't counted.
  - D3: deleting a device or rack with installed cords still takes them, and the confirm says how many were
    installed ("export the changes first", `installedCordsGoing`).
  - D2: only moving an end makes a `change` (type / colour / length don't); a manual REPLACE status → backlog.
  - Tests in `domain/cords.test.ts`, `editor/racks.test.ts`. Live (Test Project 33IDF2, cord P3C-37:15 → P3C-35:15):
    Installed; end dragged to 16 → CHANGE with "Was"; back to 15 → INSTALLED, no Revert; Remove → REMOVE; Revert →
    INSTALLED with no "Was"; status box → ADD — Firestore: add, no `previous`, 1 m (as before). Help: "Cord status:
    add, change, remove, installed".
- **Patch list management, Slice 2 — act on the selected cords (`patch-list-plan.md`):** `cordAction` (domain/cords.ts)
  = Installed (a `remove` cord's record goes) · Add · Remove (the workflow) · Restore · Delete (records out, no
  removal work); `withCableType` (a type brings its colour — legacy; D5: no status change, D2). `ui/cordActions.ts`
  runs one as an undo step (asks first when records go) and makes the right-click items; `ui/CordActions.svelte` =
  the buttons with counts + Type / Color. In the patch list: a bar over the table, ALWAYS shown (a hint when nothing
  is selected) — it first appeared on the first pick, pushed the rows down, and a Shift-click then landed on the
  wrong row (live); right-click on the rows; Ctrl+A selects the shown rows; Purge removed (N) by the status chips;
  `remove` rows struck through; ↶ on a moved end of a `change` (`PatchRow.wasFrom / wasTo`, hover = where it was).
  Properties: several cords selected → a "Cords" group with the same. The Type box lists a cord's own type when the
  project's list lacks it (as Cord Properties does). Tests in `domain/cords.test.ts`, `domain/reports.test.ts`. Live
  (Test Project, all rooms): P3C-37:6 + :7 Shift-selected → bar + Properties "Cords"; Installed (2) → INSTALLED;
  right-click → Add (2) / Remove (2) / Delete (2); Add (2) → back to ADD (as before). Help: "Mark cords installed,
  restore or remove several at once".
- **Patch list management, Slice 3 — the export (`patch-list-plan.md`):** the Cord BOM dialog is now
  `ui/PatchScheduleDialog.svelte` ("Patch schedule · cord BOM"; the list's button reads Export…, the menus "Patch
  schedule / cord BOM…"). Which cords: All rooms — **a sheet per room** (D4) — or any room that has cords (not only the
  open one), or the list's selected rows, or the rows it shows; "changes only" as before (all rooms + changes = every
  changed patch). `render/exports.ts`: `cordRoom`, `orderForSchedule` (status group, then the From place — D7: review
  after testing), `scheduleSheets`, `sheetName` (Excel's 31 characters / no `:\/?*[]` / unique), and
  `exportPatchSchedule(ix, name, sheets, typeLabel, tag)` — the BOM sheet counts every sheet's cords. Import cord IDs
  reads every sheet but the BOM (Key match; the "#" fallback only for an old one-sheet file). Tests in
  `render/exports.test.ts`. Live (Test Project): the picker lists All rooms / 33IDF2 / Server room A / the rows shown
  (35); 33IDF2 + changes only → 11 cords (8 add, 3 remove), as the list shows. Not exported (a download). Help:
  "Export the patch schedule (all, a room, the changes)".
- **Patch list management, Slice 4 — Planning · Surveying (D1, Dave: "an obvious toggle for engineer inventorying a
  built site, or designer planning a new install"):** project setting `newCordStatus: 'add' | 'installed'` (stored
  both ways); `ui/CordMode.svelte` = the two-way toggle, in the Patch list bar ("New cords Planning · Surveying"), the
  Cord tool's option bar (so it shows while patching — also after a port's + or Patch to…) and Settings › Cable
  types ("start as"). `CordDefaults.status` → `makeCord` / `bulkPatch`; `ws.newCordStatus` (CadShell keeps it in step
  with the setting) feeds the cord tool; the status line says "… added as INSTALLED (surveying)". Test in
  `domain/cords.test.ts`. Live (Test Project 33IDF2): Surveying; P3C-37:16 selected → + → P3C-35:16 → INSTALLED
  cord, message shown; then Delete (1) → confirm, Planning — Firestore: 35 cords (32 add, 3 remove) as before;
  `newCordStatus: 'add'` is now stored (was unset — same meaning). Help: "Record the cords of a built site
  (Surveying)". **Slices 1–4 of `patch-list-plan.md` done.**
- **Patch list follow-ups (Dave 2026-10-11):** (1) the Planning · Surveying toggle was unnoticeable — the picked side is
  now primary blue (as the view strip's Racks front / rear). (2) **D7 reviewed:** the patch schedule sorts inside each
  status group by the **From label** (blanks last, ties by From place), or by the dialog's "sort by" (From rack / U /
  port, To label, cord ID) — `ScheduleSort`, `SCHEDULE_SORTS`, `orderForSchedule(ix, cords, by)`. (3) Columns per end:
  **Device, Label, Rack, U, Face, Port** (U and Face split); the Status / Cord ID columns are found by header name
  (the import's fallback too; its old-file "#" fallback keeps the place order). (4) **Inline editing** in the patch
  list (Dave's note on the plan): double-click Cord ID / Status / Notes; Enter / Shift+Enter = save + the same cell
  on the next / previous row, Tab / Shift+Tab = the next / previous cell (Cord ID → Status → Notes → next row), Esc
  cancels, leaving saves (only the cell still being edited — a key that moved on has saved it already); the status
  goes through `setStatus` and is saved on leaving (arrow keys on a closed select would otherwise save each step).
  Ctrl+A in the list ignores the edit box. Tests in `render/exports.test.ts`. Live (Test Project): T-1 Enter T-2 Tab
  Tab → in row 2's Notes; Shift+Tab ×2, cleared, Shift+Enter, cleared, Enter, Esc — Firestore: no cord IDs, 32 add /
  3 remove as before. **Exported** (Dave OK'd): `Patching-Test_Project-20261011.xlsx` — sheets 33IDF2 (3 remove, 8
  add), Server room A (24 add), Bill of Materials; the new header; rows by From label (4A001-01, 4A001-02, 4A002-01 …).
  Help: "Import cord IDs from a returned patch schedule", "Edit cord IDs, status and notes in the patch list"; the
  export entry. Backlog: cord label batches are typed by hand (no generating).
- **Port map for VLANs, Slice 1 — the list (`port-map-plan.md`, Dave 2026-10-11):** `domain/portMap.ts`
  `portMapRows(ix, deviceIds)` / `portMapDevices` — every port of the chosen panels / switches (room → rack → top U
  down): its label, the outlet(s) at the ends of its circuit (`traceCircuit`; both for a panel-to-panel cross-connect)
  and where they are, **Patched To** = the other end of this port's cord with its label, **Far End** = a device port
  beyond, the cord's ID and status. `render/exports.ts` `exportPortMap`: one sheet, a heading row per device, an empty
  highlighted VLAN column. File › Export and Cabling › "Port map (VLAN) of the selected devices" (`Exports.svelte`
  `portMap`: selected devices, a rack's devices, or a port pick's device; none → says so). First cut put the
  cross-connect's far panel under "Via" with Patched To empty (both circuit ends were outlets) — Patched To is now the
  cord's other end, whatever the circuit. Tests in `domain/portMap.test.ts`. Live (Test Project, P3C-37 selected):
  48 ports; :6 → P3C-35:6, :15 → outlets 01A.004A / 01A.031B, patched to P3C-35:15 · 01A.031B; :17 → Patch Panel HL
  :14. Help: "Port map for VLANs (Excel for network engineers)". The drawing (Slice 2) waits for P1–P4.
- **Port map for VLANs, Slice 2 — the drawing (`port-map-plan.md`; Dave's decisions P1–P4):** a new view kind
  `{ kind: 'portmap'; deviceIds }` (`domain/drawing.ts`) drawn by `views/portMap.ts` `portMapDisplayList` — each device
  like its faceplate, its ports where they are (the rack view's rows and numbering), every port with its number / own
  label small in the top-left corner and the far item's label stacked as big as fits (paper mm at 1:1). The far item
  (`PortMapRow.far`, `domain/portMap.ts`): the circuit's end across the port's cord (a switch port → the outlet
  through the panel; a panel port → the switch port), unpatched → the other end of its cable. Cabling › "Port map
  view of the selected devices" opens it as a tab (`portMapPick`: devices, a rack's devices, a port pick's device);
  its strip: the name, Excel (VLAN), To sheet…. Wired through `specKey` / `specLabel` / `spaceOf` (no model, like the
  riser), the URL (`portmap.<id>~<id>`), tabs (no level), `viewName`, `viewTitle` / `viewExists`, the sheet viewport
  content and picker, ToolStrip (Select only), CadShell (level changes leave it alone). The Excel's columns are now Room
  · Rack · U · Port · Device · Port label (Dave). VLANs stay in the Excel (P1). Tests in `views/portMap.test.ts`,
  `app/urlState.test.ts`. Live (Test Project 33IDF2): Patch Panel LL + 24-Port Patch Panel + Network Switch 48p → the
  view: switch :3 → 01A.022B, :22 → 01A.035A, :28 → 01A.025A (bottom row), the panel's outlet labels; To sheet › New
  sheet → S008 at 1:1, viewport Properties "Port map · …"; undone — Firestore: sheets S001–S007, 35 cords (32 add, 3
  remove) as before. Help: "Port map drawing of switches and panels (for VLANs)". Backlog entry removed (built).
- **Usage buttons (backlog, G128; Dave 2026-10-11 "do 6"):** `ui/UsageButtons.svelte` — one button per usage of the
  project's list in its colour, the picked one filled, "—" = none; a code the list lacks shows as its own button; with
  several outlets that differ none is filled. In Outlet Properties for one outlet and for several (replacing the
  selects). The Outlet tool's bar ("as last" blank, one line) and the Outlets table keep their selects. Live (Test
  Project): A.002 shows Desk filled; Printer → set, Undo → Desk. Help: "Set an outlet's usage".
- **Segment width grip (backlog, G253; "do 33"):** `editor/handles.ts` `segWidthHandles(shape, segIds, minHalf)` — a
  run with a section, its picked segments: a bar along each one's edge (w/2 from the centre line, its left side), on the
  plan. Dragging sets every picked segment's width to twice the pointer's distance from that centre line: 10 mm steps,
  **Shift 50 mm**, Alt free; back at the run's width the segment drops its own `section`. No bar on a vertical segment,
  a sheet's line, or when the edge is within 1.5 × the pick tolerance of the centre line (it would take the segment's
  drag — zoom in). `Handle.drag(p, free, coarse)` gained Shift; the select tool adds the bars to the plan handles when
  the selected run has picked segments. Tests in `editor/handles.test.ts`. Live (Test Project, TR2 300 mm): picked
  segment 1–3, dragged the bar 20 px → W 680 on that segment only (Properties), the other 300; Undo → Firestore: TR2
  300 × 100, no per-segment section. Help: "Add a point to a run, or pick one segment".
- **Bend radius (backlog, G270; "do 26"):** `domain/bends.ts` `corners(shape)` — a node where exactly two level
  segments of the run meet (not straight on): its radius = the node's own `radius` (0 = sharp) else the run's new
  `ContainmentRole.bendRadius`, cut to what fits (tangent points within half of each side); the arc as points, the
  tangent points, the bisector. The plan (`views/plan.ts` `runPrims`) draws each segment to its tangent points
  (`trimmedEnds`) and the arc between, in the run's width / colour. Properties › Size and height › **Bend radius**
  (containment runs). `editor/handles.ts` `bendHandles(shape, gap)`: a round grip on each corner's bisector, `gap`
  (2 × the pick tolerance, or half the width) in from the arc's middle so a sharp corner's grip is off its node grip;
  dragged along the bisector it sets that node's `radius` (10 mm, Shift 50, Alt free; capped at what fits, on the
  step), dropped again at the run's default. Lengths / routing / fill still measure to the corner. Tests in
  `domain/bends.test.ts` (+ the segment-width test's types fixed). Live (Test Project, the 1F high trunk): Bend radius
  300 → the L-corner drawn as an arc, its grip dragged in → 383 mm (= the most that fits, before the cap was put on
  the step). **The undo didn't run:** editing handles.ts mid-test hot-reloaded the shell and emptied its history; the
  trunk was put back in-page with `db.replace` (no `bendRadius`, no node radius) and checked. Memory saved. Help:
  "Round a run's corners (bend radius)".
- **Rack order in a row (backlog, G104 / T037; "do 12"):** `Space.rackOrder` — a server room's racks put in order by
  hand, per row (key: the row's id, `none` = racks in no row). `racksInOrder` ranks listed racks first in that order
  (the plan's order after, so a new rack goes last); `nudgeRack(ix, id, ±1)` writes the row's whole order with the two
  swapped; `planOrder(space, key)` drops it. Racks window: ▲ / ▼ on a hovered rack, "↺ plan order" on a row that has
  a hand order (also a "No row" header then); a row in hand order lists in that order (not unplaced-first) so ▲ / ▼
  move what you see. Allocation's fill order and the rack view follow it. Tests in `views/rackRow.test.ts`. Live (Test
  Project 33IDF2 Row A): ▲ on V05 → stored `rackOrder` for the row, V05 above R311; "↺ plan order" → the order back and
  the field gone (Firestore). (A first click missed the 9 px button — screenshot px ≈ 0.8 × CSS px here.) Help:
  "Change the order of racks in a row".
- **Device library builder (backlog, G088 / G110; "do 14"):** `ui/TemplateDialog.svelte` — a template's name, kind,
  U, ports, port type / numbering, face, width / depth, maker, model; a built-in opened in it is saved as a new one
  ("… (copy)"). Device library: **+ New** by Find, and on a hovered template ✎ (edit; a built-in: ⧉) and ✕ (delete,
  asks first — global, no undo). Find matches maker / model too. `CadProject.putTemplate` writes the template WHOLE
  (`updateDoc` with `FieldPath('templates', id)`; a merge would keep a cleared maker) and `deleteTemplate` uses
  `deleteField()`. Live (the global `settings/cadDeviceTemplates`): + New "ZZ Test template (Claude)", maker TestMaker
  → listed ★ under Patch panels; ✎ → 2U, maker cleared → stored 2U with no maker; ✕ → gone; the templates map equals
  what it was before the test. (The form's `autofocus` didn't take — a `use:focus` action now; the first typing went
  to the page, no effect seen.) Help: "Make, edit or delete a device template".
- **Drag to select a block of ports (backlog, T025; "do 17"):** in a rack view a press on a port picks it and a drag
  from there picks the ports from it to the one under the pointer (same numbering range as Shift-click; one device);
  the device no longer moves from a port — drag it by its body (the edge beside the port grid, its name strip), or
  **Alt-drag from a port**. Unchanged: a press on an already-picked panel port that carries outlets drags those outlets
  to another panel; Shift / Ctrl clicks. `editor/selectTool.ts` `#portRange`. Tests in `editor/racks.test.ts` (the
  device-drag tests now press on the body beside the ports). Live (Test Project 33IDF2): a drag along the 48-port
  switch's top row → "Ports 5–12 (front)" in Properties, the switch stayed (no writes). Help: "Pick ports, or move a
  device, in a rack view".
- **Trunk drawing style (backlog, G048 / G187; "do 25"):** the legacy outlets tool's look. `domain/runOutline.ts`
  (ported from `routes/.../outlets/trunks/geometry.ts`): `outlineLoops(edges)` walks bands (segment + width) as a graph
  — nodes merged within 0.5 mm, neighbours by angle, half-edges — into closed loops with mitred joins (bevel past a
  4× mitre); `roundCorners(loop, r, sharp)` rounds them (arcs as points), `endCorners` keeps a run's square ends.
  `views/plan.ts` `runBodies`: the level segments of all containment runs (trimmed to bends + their arcs), bucketed by
  layer · tier · colour · primary — one outline per joined group, corners r = ¼ of the width, closed + filled, class
  `run-body` (+ `run-high run-ceiling` for high runs: dashed; + `run-primary`: stronger), carrying `layer` and no
  source. The runs' own bands stay as `run run-hit` — invisible (opacity 0; PDF skips; DXF skips) but they still pick,
  hover and select the run. `applyLayers` takes a source-less prim's own `layer` (hide / freeze / colour). Screen
  (`Prims.svelte`): fill 20 % of the colour, 1.25 px edge (primary 2.5 px, 32 %), ceiling dashed. PDF: `fillOpacity`
  (fill apart from the stroke), the run's colour fills too. A ring of runs fills its hole (rare; noted). Elevations
  unchanged. Tests in `domain/runOutline.test.ts`, `views/plan.test.ts`. Live (Test Project 1F): the high trunk cross
  → one dashed orange outline, arms joined, corners rounded; TR2 a faint blue band with its edge; clicking TR2 still
  selects it. Help: "How runs (trunks, trays, conduits) are drawn on the plan".
- **Paste a screenshot or picture (backlog, G233; "do 31"):** `app/clipboardEvents.ts` — a paste with no cad items but an
  image file on the clipboard goes to the new `image` hook (the browser's own paste stopped); `CadShell.pastePicture`:
  where the Image tool works (plan, elevation, section, sheet) it stores the file like Insert › Image's uploads
  (`storeFile`, the project's storage; named "Pasted YYYY-MM-DD HH.MM.SS.png") and arms the Image tool with it — drag
  its box (Esc: leave it out). Elsewhere (a rack view) it says where pictures go. `typing()` guards `Element` (node
  tests). Tests in `app/clipboardEvents.test.ts`. Live (Test Project, a synthetic paste of a generated PNG): in the rack
  pane → refused, nothing uploaded; in the plan → uploaded, the tool armed, a box dragged → the picture on the plan
  (Properties: Image "Pasted 2026-10-12 00.13.36.png"); Undo → gone; the upload deleted (UploadThing via
  `/api/uploadthing/delete`, then its `files` doc) and checked. Help: "Paste a screenshot or a picture".
- **Calibrate an image in place (backlog, G289; "do 10" — as Pages / Uploads do it):** `editor/calibrateTool.ts`, a plan
  tool armed from **Project › Floors… › Origin · Scale · Crop** on a floorplan (CadShell `oncalibrate`: that level's plan
  in the active pane). Origin: one click → that page point becomes plan 0, 0. Scale: two clicks, then the real
  distance (the prompt shows what it measures now) → mm per point (3 dp), the line kept as Uploads' dimension record
  (x1…y2, distance; measured straight, where Uploads measures along x or y). Crop: two corners → a page-point box.
  `toPage` inverts the placement (zone offset, origin, mm per point). It writes `files/{id}.pages[n].origin | scale |
  crop` (`CadProject.setPageCalib`, Uploads' units), so Uploads, Pages and every project using the file follow (the
  PDF cache already redraws on a file change) — **a file used by another project asks first** (`fileProjects`). Not in
  the drawing's undo: each change offers "Put it back". An uncalibrated page is now shown as if drawn at 1:100 (amber
  buttons) so it can be scaled in place (`PROVISIONAL_SF`; `PdfCache.calib` keeps each page's calibration as placed).
  Tests in `editor/calibrateTool.test.ts`. Live (Test Project 1F): **every Test Project floorplan file is shared with
  Journey**, so nothing was saved: Floors… › Scale → the plan, two clicks, "it measures 25295 mm", 20000 → "This
  floorplan file is also used by 1 other project — its scale changes there too" → Cancel; the file's calibration
  checked unchanged (35.281 mm/pt, origin 240, 676, crop 45, 35, 764 × 779). (A Ctrl+A meant for the prompt went to the
  plan and selected all — no writes.) Help: "Calibrate a floorplan on the plan (origin, scale, crop)".
- **Fixes (Dave 2026-10-12):** the Racks window shows a nameless rack as its kind (and model) in grey italics, and Find a
  device shows a nameless device as its kind (search matches the kind too). New / edit device template: the "Saved to
  the device library…" note sits on its own line above the buttons.
- **A ring of runs stays clear inside (Dave 2026-10-12, "see 1F plan"):** `domain/runOutline.ts` `nestLoops` sorts the
  outline's loops into outsides and their holes (a loop inside an odd number of others is a hole of the smallest one
  round it); a closed line prim takes `holes` — screen: one `<path>` with even-odd fill; PDF: the holes as more
  subpaths, `fillEvenOdd` / `fillStrokeEvenOdd`; DXF: each hole its own closed polyline. Kept by the sheet, rack-row
  and issue copies of a display list. Test in `domain/runOutline.test.ts`. Live (Test Project 1F): the high trunk loop
  → its middle clear, the floorplan showing through.
- **Pasted pictures: once, and placed while they upload (Dave 2026-10-12):** `app/pictureUploads.svelte.ts`
  `PictureUploads.add` hashes the picture (SHA-256, kept on its file doc as `sha256`; `storeFile` takes `extra` fields);
  the same bytes → the same file, from this session (even mid-upload) or the project's files (a `sha256` query, kept to
  the project's own) — not uploaded again. A new one gets its file id at once (`freeFileId`, ids handed out this
  session skipped), is shown from its own bytes (`PdfCache.showPicture`, an object URL) and the Image tool is armed
  straight away; the upload goes on meanwhile — "Uploading picture…" with a spinner by Saved (`pending`); a failed
  upload says so (Undo removes what was placed). Tests in `app/pictureUploads.test.ts`. Live (Test Project 1F, a
  synthetic paste of a generated PNG): the spinner, a box dragged at once (shown from the blob), the upload done in
  ~3 s; the same picture again → "already in Uploads … (not uploaded again)"; the `sha256` lookup finds it (a fresh
  session's path); Undo → gone; the upload deleted (UploadThing + its `files` doc) and checked.
- **Server rooms and rows in the Racks window, not the status bar (Dave 2026-10-12):** "+ Server room" opens a form at
  the top of the list — Floor (every level, top first; the open one marked and picked) and Name (`nextRoomName` for
  that floor until typed over) — Add room / Enter, Cancel / Esc; added on another floor → says so. Room and row names
  rename in place (new `ui/InlineName.svelte`: click → an input, Enter / clicking away saves, Esc keeps it).
  Help: "Add or rename a server room or a row of racks". Live (Test Project 1F): the form (1F (open) picked, IDF 3;
  4F → IDF 4; Esc), "IDF Test" added and renamed in place, a row renamed, all undone.
- **REPLACE status for a cord (backlog, D2 of `patch-list-plan.md`; "do 20"):** `replace` joins the cord statuses
  (`CORD_STATUSES`, shared by the Patch list, its Status cell, Cord Properties and the schedule dialog), set by hand
  only. `setStatus(c, 'replace')` keeps the cord there now in `previous` (+ its `cableType`, `colour`, `lengthM`);
  `replacedText` = "was CAT6 · blue · 2 m" (what differs). `revertCord` brings those back too; Remove on a replace →
  the old cord comes out (as a change does); Installed confirms the new one; moving an end → a change (keeping the
  swapped-out cord). Schedule: its own REPLACE group (purple) after REMOVE, "was …" in Was From; cord BOM counts it.
  Rack views: its own dash. Tests in `domain/cords.test.ts` (+ the BOM test). Live (Test Project 33IDF2, P3C switch
  :22): status → replace in the list (chip "replace 0" → the row purple), Properties "Replaces the cord there now: set
  the new type…", length 1 → 5 → "— was 1 m" there and on the list's ↶; both undone. Help: "Cord status".
- **Rack elevation context: what was left (backlog, G020 / G078 / G079 / G117 / G192 / T032 / T045; "do 15"):** **F** in a
  rack view shows the other face (front ↔ rear; `shellKeys.ts` `flipFace`, CadShell swaps the pane's face). The room's
  **floor and ceiling lines drag**: `views/rackRow.ts` marks them (`sub` `room-floor` / `room-ceiling`; FFL is the floor
  until the room has its own, the level's ceiling until it has its own); `editor/elevHandles.ts` `roomLineHandles` →
  bars whose drag writes `Space.floorMm` / `ceilingMm` (10 mm, Shift 50, Alt free; ceiling ≥ floor + 300; the floor
  back on FFL = none). The select tool takes them where nothing else is under the pointer (a rack's foot stays the
  rack's): hover → a blue bar and ↕ cursor, press-drag → one undo step "IDF: room floor / ceiling". Tests in
  `editor/elevHandles.test.ts`. Live (Test Project 1F, 33IDF2): F → rear and back; the level ceiling dragged →
  "33IDF2 CEILING FL+2490"; FFL dragged up → "33IDF2 FLOOR FL+50", the racks on it; both undone. Help: the room
  floor / ceiling entry, keys (F).
- **Cord label batches by type, length and colour (backlog, T070; "do 19"; labels typed by hand, Dave 2026-10-11):**
  `CordBatch` (type, length, colour, first / last label, ordered, delivered) in `ProjectSettings.cordBatches` (undoable
  settings writes). `domain/cordBatches.ts`: `labelRange` (same prefix, a number counting up, its width kept),
  `batchUse` (the cords whose Cord ID is in the range — not ones being removed —, free, last used, next free; a cord of
  another type / length / colour with its label → `wrong`), `labelNeeds` (per type × length × colour: cords, labels
  ordered — default the range's count —, delivered, short, the next order's first label = after the highest bought).
  `ui/CordBatches.svelte` under the cord BOM in the Patch schedule dialog (now 58rem wide): a row per batch, edited in
  place; "+ Batch" starts from a kind still short, at its next label; the needs table; the wrong-label warning. Tests in
  `domain/cordBatches.test.ts`. Live (Test Project): + Batch, 2AR-0001 … 2AR-0100 → 100 labels, 0 used, next 2AR-0001;
  Cat6A · 1 m: 1 cord, 100 labels, next order 2AR-0101; uutp kinds short 2 / 12 / 17; undone (3 steps). Assigning a free
  label to a cord from its batch is not built (offered). Help: "Record the patch cords bought (label batches)".
- **The Patching tab (Dave 2026-10-12, "users may not find export / label batches"):** the bottom table "Patch list" is
  now **Patching** (Cabling › Patching (patch list)). Its bar ends with a group of the files and records: **Patch list…**
  (was Export…: the schedule as Excel + the cord BOM), **Cord labels…** (the label batches, now their own dialog —
  `ui/CordLabelsDialog.svelte`, also Cabling › Cord label batches…; out of the schedule dialog, back to 40rem) and
  Import cord IDs…. Help: the tab's new names. Live: the tab, the three buttons, the Cord labels dialog.
- **Names typed where they show, not in the status bar (Dave 2026-10-12):** new `ui/NameInput.svelte` (focused and
  selected; Enter / clicking away saves, Esc cancels; `create` saves a suggested name as is). **Renames by an action
  button** (a click on a name selects, Dave): Navigator — ✎ on hover (and F2, ⋮ › Rename… / Renumber…, Project ›
  Rename this level…) swaps the row's label for the box (`ws.navRename`, unfolded to it; `navActions.applyRename` for
  levels, rooms, sections, a sheet's title / number); Layers — ✎ on hover (double-click rename gone); Properties ›
  Row › Rename (RowProps). **New things in a box by their field:** Properties › Room › New server room… and Row › New
  row… (suggested name; one or several racks), Outlet › Room › New room…, Layers › + Layer (a row at the end),
  Packages › + From selection / + From chips (in its bar), Sheets › Number… (in the group's heading), Make block (under
  its button). **Save as template…** opens the template dialog filled in from the device (a new template —
  `TemplateDialog` `fresh`; `CadProject.saveTemplate` gone). Only drawing commands still ask in the status bar (typed
  points, leader text, the Rack tool's room) — that prompt now **stands out**: the bar's top edge amber, the block
  amber with a darker edge, pulsing twice as it opens, a bold question, a ringed input. The device Face field's tip now
  says what it is (the side it faces / is drawn on, not how it is fixed — Mount is that). Live (Test Project): a level
  renamed from ✎ and undone (a `{@const}` read after clearing the state lost the id — fixed by reading it first); a
  sheet's ✎ + Esc; + Layer "Test layer", ✎ → "Test layer 2", undone; Properties New server room box + Esc; New row
  "Row 2" (as suggested) → the rack in it, Rename → "Row 2 renamed", undone; Save as template → "New device template"
  filled in, Cancel; Make block box + Esc; Number… → "P-01" + Esc; + From selection box + Esc; outlet New room box +
  Esc; the Line tool's point prompt in its new look.
- **Zones and server rooms when placing outlets (backlog, T057; "do 3"):** Outlet Properties › **Zone** (the level's
  zone spaces; New zone… adds one in a box under the field, the outlets join it). The Outlet tool's bar gets **Zone**
  and **Server room** (the open level's rooms first; "as last" = like the last outlet) — `OutletNext` in
  `editor/outletTool.ts`; a port beyond the last outlet's count takes its first port's room; the **first outlet on a
  level** takes the level's server room when it has exactly one. Test in `editor/editor.test.ts`. Live (Test Project
  1F): the bar's Zone / Server room lists; an outlet's Zone → Zone A, undone. Help: "An outlet's zone and server room".
- **Drag racks to reorder in the Racks window (backlog, Dave 2026-10-12; "do 10"):** the ▲ / ▼ buttons are gone; a rack
  drags up / down its row (`DragReorder`, a ⠿ grip on hover, a drop line). `domain/devices.ts` `moveRack(ix, id,
  target, after)` (replaces `nudgeRack`) writes the row's whole hand order; another row → refused with a hint.
  Test in `views/rackRow.test.ts`. Live (Test Project 1F, IDF1 Row 1, synthetic drag events): R303 dropped on R301 →
  R303, R301, R302 (drop line shown); undone. Help: "Change the order of racks in a row".
- **Show all routes (backlog, G049; "do 13"):** a **Routes** toggle on the plan strip (by Fill; `ws.showRoutes`, for the
  session) draws every cable's route — `views/overlays.ts` `allRoutesOf`: each run segment once per server room (the
  link's panel end's room), in that room's colour (8 in turn, rooms by name), rooms sharing a segment side by side 60
  mm apart; the strip shows the key (a swatch per room). Over the plan, under the selected outlet's green route. Test
  in `views/overlays.test.ts`. Live (Test Project 1F): 4 segments in 33IDF2's colour, the key "33IDF2"; toggled off.
  Help: "See every cable route on a plan".
- **Usage colours and outlet tips (backlog, G016 / G038 / G062 / G137 / T024; "do 4"):** `domain/usages.ts`
  `usageColour` (the settings entity's list). Plan: an outlet's symbol prims (not its label) take its usage colour
  (`views/plan.ts`; the same rule as a layer colour: outlet symbols fill with it). Rack views: a port cabled to an
  outlet gets a tint of that outlet's usage colour inside its edge (`port-usage`, 35 %, unpickable, drawn over the
  cell under its label; the patched / linked edges stay) — screen and PDF. Plan tip: `views/portTip.ts`
  `outletUnder` / `outletTip`, `ui/OutletTip.svelte` (Select tool, at once, the port tip's look): label, usage · tier ·
  mount, each port → its panel port or "not allocated". Tests in `views/portTip.test.ts`. Live (Test Project 1F):
  the tip on A.002 ("Desk · low · wall", 01A.002A → P3C · P3C-37 : 28 (rear) …); 58 tinted ports on 33IDF2 in three
  usage colours. Help: "Usage colours and outlet tips".
- **Shift constraints: junctions (backlog, G188 / G197 / …; "do 18"):** Shift on a dragged node now keeps EVERY segment
  it has on 15° (it turned only about its first segment's far end). `editor/constrain.ts` `angleStepAll`: the
  intersections of each pair of neighbours' 15° lines (plus each one's own step), scored by how many segments land on
  a step, then nearest the pointer (within the junction's reach); one neighbour = `angleStep` as before. Select tool
  `#neighbours` (all of the grip's segments). Tests in `editor/constrain.test.ts`. Live (Test Project 1F, the high
  trunk's 4-way junction, a Shift drag by pointer events): −15°, −90°, 90° on steps (the 4th can't be: its far ends
  weren't on a common step to start with — −1°, −179.7°); undone, checked as before. Help: keys (Shift).
- **Align / distribute (backlog, G248; "do 27"):** `editor/align.ts` — `alignMoves` (pure): left / centre / right / top
  / middle / bottom of all the boxes, or equal gaps across / down (three or more; first and last stay); `applyAlign`:
  the boxes from the active view's prims (a group = one box), the moves through the view's space (`moveBy`, tied
  notes scaled, attached shapes follow), one undo step. ViewCanvas `align` (not inside a viewport / in rack or riser
  views); `ws.align`; Properties header: an **Align** row of 8 icon buttons when two or more movable things are
  picked (lucide align / distribute icons added to `$lib/ui/Icon.svelte`). Tests in `editor/align.test.ts`. Live
  (Test Project 1F, three outlets): the row (distribute off — one of them isn't placed), Align left → "1 moved",
  undone. Help: "Align or distribute things".
- **Outlets by usage or by layer colour (Dave 2026-10-12):** a project setting `outletColour` ('usage' — unset — or
  'layer', stored both ways) switched by **Usage colours** on the plan strip (by B/W; one undo step); `views/plan.ts`
  skips the usage colour when 'layer' (the layer's colour, else the class's, as before). Panel port tints in rack views
  are unaffected. Test in `views/portTip.test.ts`. Live (Test Project 1F): on → three usage colours; off → none;
  undone. Help: "Usage colours and outlet tips".
- **Dimension text and extension-line grips (backlog "Dimension text and grips", G259 — the grips; `<>` and units →
  later, Dave 2026-10-12):** a dimension's geometry gets `textAt` (its text dragged there; unset = centred off its
  line) and `gapA` / `gapB` (each extension line's gap from its point; unset = 1 paper mm); drawn by
  `dimensionPrims`, carried by moves, elevations' plane mapping and a viewport note put back on paper. Grips 3–5
  (`shapeGrips.ts` `dimGrips`, found in the view's prims since they're paper-sized): the text (drag = `textAt`) and
  each extension line's start (slid along it, 0 … its line). The select tool now takes the NEAREST grip in reach
  (`nearestIn`; the text grip sits close to the line's middle one). Properties: "Text and gaps back as drawn" once
  moved. Tests in `editor/shapeGrips.test.ts`. Live (Test Project 1F, the "1.07 m" dimension): the text dragged off its
  line, the lower extension line's start slid; both undone. Help: "Edit a dimension".
- **Floor manager: level numbers and area plans (backlog, G030 / G100 / G125; "do 7" — its server-room part is covered by
  the Racks window's + Server room / in-place renames and the Navigator's delete):** a **No.** column renumbers a floor
  (`domain/floors.ts` `renumberFloor`: its area plans follow; a number another floor has, or not a whole number, is
  refused; the form's range widens to take it, written to the building; FFL restacked). **+ Area** on a floor adds an
  AREA plan (`newAreaLevel`: the floor's number, elevation and heights, "<floor> <area>", order floor + 0.5) named in a
  box; area plans are listed under their floor (rename; their own floorplans, Origin / Scale / Crop — the floorplan
  cell is now a snippet shared by both rows; ✕ deletes an empty one with its floorplans, else points to the
  Navigator's Delete level…). Tests in `domain/floors.test.ts`. Live (Test Project): + Area "T1" on 2F → "2F T1"
  (FFL 3.800, in the Navigator), renamed "2F Tenant T1", ✕ deleted; 3F → 4 refused ("4F is already floor 4"); 4F → 5
  (FFL 15.200, the range 5F…), undone. Help: "Floors: range, names, heights, numbers, area plans".
- **Dimension text in mm up to 10 m; Reset handles; the Floor manager in two tabs (Dave 2026-10-12):** `dimensionPrims`
  writes the length in mm below 10 m (was 1 m), then "12.5 m"; the Properties placeholder too. The dimension's
  "Text and gaps back as drawn" link is now a **Reset handles** button. The Floor manager (one wide table that mixed
  "+ Area" with "+ Add zone…" and scrolled sideways) is split: **Floors & heights** (range, names, heights, No., FFL;
  a "+n area" hint by a floor with area plans) and **Plans & floorplans** (a card per floor: "Whole floor" and each
  area plan — tagged Area, renamed, ✕ — with its floorplans: name, PDF page, X / Y, Origin / Scale / Crop, ✕;
  "Choose a floorplan…" / "+ Another page…"; "+ Area plan" per floor; a short explanation of plan / floorplan / area
  plan on top). Extra floorplans on a plan are named "Floorplan n" (was "Zone n"). Live (Test Project): both tabs
  without a sideways scrollbar; + Area plan → its name box, Esc cancels. Help: "Floors…", "Edit a dimension".
- **No "Heights from the old Risers tool" in the Floor manager (Dave 2026-10-12):** the button and its handler are gone
  (and `persist/import/legacyHeights.ts` with its test, removed). Live (Test Project): the dialog opens
  without it.
- **Paste at the cursor (backlog, G232; Dave 2026-10-12):** Ctrl+Shift+V pastes with the middle of what was copied
  (`domain/clipboard.ts` `clipCentre`: its points' box — outlets / racks at, path nodes, outlines, text points) on the
  pointer: `pasteClip` gets the move `d`. The paste event doesn't carry Shift, so `clipboardEvents` `key` notes a
  Ctrl+Shift+V keydown (1 s) and ViewCanvas `pasteCursor` gives the pointer in the target's points (a viewport being
  edited: its view mm). A rack target pastes devices as before; no pointer over the pane = in place, with a message.
  Test in `domain/clipboard.test.ts`. Live (Test Project 1F): the "1070" dimension copied, Ctrl+Shift+V with the
  pointer to its left → the copy there; undone. Help: "Move, copy or nudge things", Keys. Backlog: 20 / 21 (import
  Pages / Sheets-tool sheets) → `later.md` (Dave).
- **Riser view control, group label / colour, high / low hops (backlog, G021 G145–G149 G194 G195 G277 G315 T073 T076;
  Dave 2026-10-12 "do 4 5 6"):** `views/riser.ts`:
  - **Floors lowest – top** on the riser strip: `settings.riser.from / to` (floor numbers; one riser view, so its sheet
    viewports show the same; one undo step each). Floors outside aren't drawn, risers are cut at the range's slab
    ends, rooms off it drop out (a group with an end off it isn't drawn).
  - **EPS rooms:** a dashed box round each riser on every shown floor it passes (not where it rises inside a server
    room drawn there), named after a space of kind "EPS" whose boundary holds it, else "EPS".
  - **HIGH / LOW** after a riser's label (its containment tier).
  - **Group label and colour:** `settings.riser.groups[backboneKey]` (its two racks + cable type — stable while routes
    change); Properties › Backbone (`ui/BackboneProps.svelte`, a backbone link picked — the riser view's line) sets
    Riser label / Riser colour; default colour by cable type (`mediaColour`: its media in settings, else guessed from
    the name — fibre amber, copper blue; unknown keeps purple).
  - **High / low hops:** each end's horizontal hop runs in the ceiling plenum where the group's routes take high runs on
    that floor (their flat segments), in the floor void for low runs, else through the room as before; the line drops
    / rises from the rack to it.
  - **Extend a riser:** a run's Properties › Riser › Reaches (`PathProps`): the far end's floor — every node on that
    level moves to the new one.
  Tests in `views/riser.test.ts`. Live (Test Project riser view): EPS boxes on 2F / 3F, "Riser A · HIGH"; Floors 2F –
  3F → only those (settings checked in Firestore after the undos: no `riser`); Riser A Reaches 3F → shortened, undone;
  the 33IDF1–IDF4A backbone: Properties › Backbone, label "BB-1 test" shown, undone. High / low hops not seen live (that
  group has no route) — the unit test covers them. Help: "The riser view: floors, EPS rooms, high / low, cable groups".
- **A run drawn to the middle of another splits it (backlog "More snaps", the part folded in from "Join runs on draw";
  Dave 2026-10-12):** a trunk / conduit whose first or last point lies ON another containment run on the level (a
  segment within 0.5 mm in plan) joins it, with no key needed (as ending on a node already did): `domain/pathEdit.ts`
  `splitRunsAt` gives that run a node exactly there (two segments for one), so the junction moves both
  (`followersOf`); when the heights differ, `runZAt` finds the run's height and the new run gets a drop / rise to it
  at that end first (on a plan only — an elevation draws its heights as meant). One undo step with the drawing; "Joined
  to TR1 (a node added there)". Routing already treated
  such a tee as joined. Tests in `domain/pathEdit.test.ts`. Live (Test Project 1F): a trunk at Z 2950 from TR1's
  midpoint (TR1 at 2590) → joined, a drop added; dragging the junction moved both; both undone. Help: "Draw a run".
- **Arc (backlog, G241; Dave 2026-10-12: "add arc to the shape dropdown for the rect tool"):** Shape tool › Shape: **Arc
  (3 points)** (not in the Box tool's footprints) — click its start, a point it passes through, its end; the preview
  follows. `domain/shapes.ts` `arcThrough` (the circle through three points; clockwise on screen from start to end, or
  the other way round when the middle point says so; null when in a line), `arcPoints` (start / middle / end), `arcPts`
  (a polyline, ~5° steps). Drawn by `shapePrims` (plan, sheets, PDF / DXF through the prims); on an elevation's plane
  `viewGeom` re-fits it through its three points as seen there; a viewport's note put back on paper scales its radius.
  Grips (`shapeGrips.ts`): start, middle, end — one dragged, the arc goes through the other two (Shift on an end: 15°).
  Tests in `editor/shapeTool.test.ts`. Live (Test Project 1F): an arc over a desk row, its middle grip dragged up
  (rounder), both undone. Help: "Draw an arc"; the tool's tooltip says arc.
- **Project details (backlog "Project Properties", G301; decision "Where should the project details editor go?" = (b) a
  dialog):** Project › **Project details…** opens the projects page's `ProjectSettingsDialog` (name, description,
  codes, client, address, logos, company, members) — hosted by the cad ROUTE (`routes/projects/[pid]/cad/+page.svelte`,
  which already watched `projects/{pid}`; now it keeps the whole doc) and passed to CadShell as `projectDetails`, so
  `lib/cad` doesn't import a route (the Sheets tool does the same). cad's own title block stays its template (its Site
  field is the template's). Live (Test Project): the menu item opens the dialog over cad with the project's details;
  closed unsaved. Help: "Project details".

## Review fixes (`../plan/review-2026-10-12.md`, Dave 2026-10-12: "start fixing the bugs")

- **R15 Issued PDFs keep styles:** `domain/issue.ts` `freeze` keeps each prim's colour, lineweight and line type (it
  kept line colour only), so issue PDFs print dashed / weighted / layer-coloured items as File › PDF does, and a
  style-only change marks a sheet changed. Sheets issued before this read "Changed since" once (Dave: he'll handle
  it). Test in `domain/issue.test.ts`.
- **R31–R34 Keys and pointers during a drag / under a dialog:**
  - `store/store.ts`: `busy` while a drag is open; `undo` / `redo` refuse then (the drag's restore would undo the
    undo and lose the step), and a `transact` made mid-drag (async work finishing) is queued and runs when the drag
    commits or rolls back, instead of throwing.
  - `ui/shellKeys.ts`: no shell keys while a dialog is open; mid-drag, Esc cancels the drag (it cleared the selection
    and the drag still committed), Delete / Ctrl+Z / Ctrl+Y wait; a nudge burst ends first.
  - Dialogs focus themselves when they open (`ui/backdrop.ts` `dialogFocus`), so Esc closes them at once.
  - `ui/ViewCanvas.svelte`: `pointercancel` / lost pointer capture roll the press back (they committed it); `cancel()`
    also rolls back a viewport pan and the work-plane grip.
  - Tests in `store/store.test.ts`. Live (Test Project): Project › Settings opens focused, Esc closes it.
- **R35–R39, R24a Editor fixes:**
  - The Outlet tool numbers and fills in from the last outlet only while on its level (on 4F it made "3-011" with
    3F's zone and server room); the Rack tool's ghost likewise (`editor/outletTool.ts`, `editor/rackTool.ts`).
  - The restore notice's 15 s tick bumps `project.rev` only when read-only / history really changed (it rebuilt
    every view every 15 s); a preview tab is kept by this user's own edits only, not by any change
    (`app/restoreNotice.svelte.ts`, `ui/CadShell.svelte`).
  - Arrow nudges inside an edited viewport use the model view's step and directions (an elevation's up = z); typed
    points treat y as height in sections too (`ui/ViewCanvas.svelte`).
  - Floorplans: hiding markups in Uploads redraws open cad views; a re-rendered page frees the old image; a page
    that failed to render is tried again when its file changes (`app/pdf.svelte.ts`).
  - Smaller: Backspace with no points drawn reaches Delete; a locked item picked with Ctrl, then Ctrl let go,
    no longer drags the runs on it; a leader / cloud double-click adds no 0-length edge; a section's ends can't meet;
    items someone else deletes leave the selection (and an open text box).
- **R17, R20, R21 Data and output fixes:**
  - Explode draws the shapes as the insert was: turned, scaled (× the drawing scale for annotative blocks), with
    the insert's owner (a sheet / viewport insert exploded into shapes with no owner, never drawn or reloaded), layer
    and height (`domain/shapes.ts` `placeGeometry`, `domain/blocks.ts` `explodeInsert`).
  - DXF: a project layer's name is made safe (no `< > / \ " : ; ? * | = `` — AutoCAD refused the file) and unique
    ignoring case; a text of several lines goes out as one TEXT per line, block texts / attributes on one line
    (`render/dxf.ts`).
  - A transaction that throws puts back what it wrote (it left the store half-changed, unsaved, with no undo step)
    (`store/store.ts`).
  - Tests in `domain/blocks.test.ts`, `render/dxf.test.ts`.
- **R37 follow-up:** the Outlet tool bar's zone / server room apply only on the level they belong to (spaces are per
  level), so on another floor the next outlet takes that floor's own (`editor/outletTool.ts`).
- **R25 Fill against the inside size (Dave 2026-10-12: a 3 mm wall default + a field):** `domain/fill.ts`
  `insideOf` — a run's own inside size, else its outside less a 3 mm wall each side (the legacy Fill rate tool's
  default), used for fill % and the packed-cables picture; every run's fill % goes up a little (a 50×30 tray with
  10 × Ø8: 43 % → 61 %, as legacy). Run Properties › Size and height › **Inside** W × H (a conduit: Ø), the default
  shown greyed; a side cleared goes back to the wall. Tests in `domain/fill.test.ts`. Live (Test Project TR1, 50×50):
  Inside shows 44 × 44; 40 typed and undone. Help: "Set a run's inside size for fill".
- **R18 Deleting a level** also takes its sections and saved views, and its viewports come off their sheets (notes
  tied to them go back on the paper), in the same undo step; the question says how many viewports on how many sheets
  (`editor/commands.ts` `levelContents`, `levelViewports`, `levelViewportsOff`; `app/navActions.ts`). Test in
  `editor/notes.test.ts`.
- **R24b A fresh PDF can be used as a floorplan from cad:** the Floors dialog's picker offers uncalibrated pages (shown
  as if 1:100 until Origin / Scale / Crop there calibrate them) and PDFs the Uploads viewer never opened (no page
  count yet: page 1); issue PDFs (`issue-…`) stay out (`app/projectFiles.ts`, `ui/FloorManager.svelte`). Help:
  "Calibrate a floorplan on the plan".
- **R53 (part) "Drawn on the … layer" is a toast** (Dave 2026-10-12): `ws.notify` shows it at the bottom of the
  drawing for 2.5 s, so the status line keeps the tool hint, the "Editing inside the viewport —" prefix and a tool's
  own message posted after it ("Joined to TR1 …") (`app/workspace.svelte.ts`, `ui/CadShell.svelte`). Live (Test
  Project): a line drawn → the toast, the hint stays; undone.
- **R42 B/W, Usage colors and Cord channels: per user on screen, per sheet on paper (Dave 2026-10-12):** the plan /
  rack-view strip's buttons are this user's screen only, kept in the browser (`ws.screen`, `app/workspace.svelte.ts`;
  no undo step, nobody else's view changes); each sheet has its own in Properties › **Display** (`Sheet.gray /
  outletColour / cordRoute`, `views/sheet.ts` `sheetLook` — used for the sheet on screen, edited viewports, PDFs and
  issues). A sheet without its own keeps the project's old setting, so existing sheets print as before. Test in
  `views/sheet.test.ts`. Live (Test Project): B/W on the plan strip toggles with no undo step. Help: the three entries.
- **R40, R41 Performance:** cable routes hold their last result while a drag is open (the whole project was
  re-routed on every pointer move) and a plan reads them only with something selected (`app/project.svelte.ts`,
  `ui/ViewCanvas.svelte`); the fit effect works out the content's bounds only when it may fit; an elevation's
  default work depth comes from the level's outlets / racks / points, not a whole plan display list; `ofType` doesn't
  copy the whole store first; a delete maps groups once (was O(groups × shapes)); allocation sorts by a slot index
  (was `indexOf` in the sort, ~3×10⁸ steps at 6,600 ports). Live (Test Project): plan ⇄ front elevation, no errors.
- **R19 Turned Japanese text in PDFs:** text the PDF fonts can't show goes in as a picture; a turned one (a rotated
  note, slanted dimension text, a turned label) was printed level and off its place — now the picture turns about the
  text's anchor, as real text does (`render/pdf.ts`). Test in `render/pdf.test.ts`.
- **R16 Large writes:** a write of more than 500 docs commits all its batches at once, in order (it awaited each
  before building the next, so an edit made meanwhile landed first and was then overwritten, and one failed batch
  left the rest unsent) (`persist/firestore.ts`); a failed write stops waiting for its echoes, so "Saving…" clears and
  other people's changes to those items apply again, and the error is reported (`persist/sync.ts`). Test in
  `persist/sync.test.ts`.
- **R22 Someone else's change during your drag:** the store holds a remote change to what the drag is moving until
  the drag ends (the next frame put the drag's start back over it, and Esc then showed the pre-drag copy while the
  server kept theirs); rolled back, it applies; committed, the drag wins (it's written after) — a change to anything
  else applies at once (`store/store.ts`). Tests in `store/store.test.ts`.
- **R23 Writes made from an old copy:** issuing puts each new revision on the sheet as it is when the issue is
  recorded (it wrote copies taken before the frozen saves, PDF and upload, so edits made meanwhile were lost); a
  restore is planned after the missing blocks are added; deleting a level takes what is on it when Delete level is
  pressed, not when it was asked (`app/issue.ts`, `app/backups.ts`, `app/navActions.ts`).
- **R30, R61 Smaller fixes:** Renumber's clash warning checks outlet labels on their own level only (another floor
  may use the same; `domain/renumber.ts`); the frame workbook's sheet names use `sheetName` (legal, unique ignoring
  case — a clash was built from the raw name and exceljs threw; `render/frameSheets.ts`); backup / issue chunks never
  cut a character outside the BMP in half (`persist/chunks.ts`); one port-grid layout (`domain/devices.ts` `portGrid`)
  for the rack view, port map and printed panel labels (a 72-port 1U panel printed 3 × 24 but showed 2 × 36; 0U gave
  ∞ columns) — the label sheet's cells shrink when a row has more than 24; a remote doc that differs only in key order
  isn't a change (`persist/sync.ts` uses `sameEntity`); Ctrl+] / Ctrl+[ (draw order) go by the character typed, so they
  work on a JIS keyboard (`ui/shellKeys.ts`). Tests in `domain/renumber.test.ts`, `persist/chunks.test.ts`.
- **R26–R29 Data tidiness:** a delete lets go of what points at the deleted things, in the same undo step — a link's
  chosen runs, a run node's / leader's attachment, an outlet's host wall, a port's / panel's server room
  (`editor/commands.ts` `unlinkFrom`); racks moved into another room take their panels' "serves" room with them
  (`domain/devices.ts`); a saved view's own shapes load and confirm (its scope is watched; `app/project.svelte.ts`);
  the backup check uses the rack's own overlap rules (mount side, shelves, "may overlap"), skips 0U PDUs for fit and
  checks rack by rack (`domain/validate.ts`). Test in `editor/notes.test.ts`.
- **R55 Right-click on something not selected** (Select tool, nothing being drawn) selects it and opens its menu (it
  cleared the selection); on empty space it is still Esc (`ui/ViewCanvas.svelte`). Help: Keys.
- **Import legacy drawings (Dave: a FEW Journey drawings, once, by choice — not a bulk importer):** File › **Import
  legacy drawings…** (`ui/LegacyDrawingsDialog.svelte`) reads, read-only (`persist/import/legacyDrawings.ts`), the
  project's Pages models, Sheets-tool sheets, `models3d/{pid}` and `sheetLayers`; lists models (boxes / walls ticks, a
  level each, preselected from the name: "Zone 3303" → 33F 3303) and sheets (a level each, from the Outlets doc's
  floor or the model3d model's name); previews counts + notes; Import = ONE transaction. Pure mapping in
  `persist/import/drawings.ts` (+ `drawingsPages.ts`, `drawingsSheets.ts`, tests in `drawings.test.ts`): a prism → a box
  (corner → centre, rot kept; n-gon → polygon), a wall → a wall path (segment overrides → segment sections), layers by
  name (Walls = sys:walls; missing ones made and frozen in existing sheets); rack prisms left out. A sheet → a cad sheet
  (number, title, paper, title-block Drawn / Checked / Approved, revisions), its outlets / model3d viewport → a plan /
  named elevation viewport at the same rect, scale and pan (Sheets-tool real mm = cad view mm, so no transform; a
  fitted model3d viewport frames its clip box; a fitted Outlets one uses cad's fit), hidden fixed layers → frozen; its
  annotations → notes tied to the viewport (dimension, rect, ellipse, text, callout → leader, line, cloud, legend,
  elevation tag / detail / outlet → built-in symbol inserts, faceplate / door / north → shapes); hidden-layer ones,
  grids, images and photo markers are left out and listed. Stamped `importedFrom` (Shape, Sheet), so a re-import skips
  what's there. Dry run on Journey's real data: Zone 3303 → 60 boxes (R01 left out) + 3 walls, new layers Furniture /
  Openings; the 5 sheets → 99 of their 100 annotations (the legend is on a layer hidden in its viewport). Help: "Bring
  in a drawing from Pages or the Sheets tool".
- **Several runs › Location › "each by its tier"** (Dave 2026-10-12, for the Journey repair): high runs to the ceiling
  plenum, low runs under the floor, wall runs on the wall — each from its own level's heights, one undo step
  (`ui/RunsMultiProps.svelte`). **Journey repaired with it** (review R13b), after a whole-project backup "Before
  run-height repair (review R13b)": its 14 imported runs sat at Z −300 — 30F (6) and 33F 3303 (8) each selected with
  Ctrl+A → 9 high at Z 2950, 5 low at Z −150 (checked in Firestore). Help: "Put several runs at their heights at once".
- **R43 The view strip and the tool row no longer overflow (Dave 2026-10-12: Display ▾ popover; options on their own
  row):** a building view's strip is Plan · Elevation… (Front / Rear / Left / Right) · Riser · Section… · **Display ▾**,
  with To sheet… pinned at the right; Display ▾ holds what that view shows on your screen — a plan: B/W floorplans,
  Usage colors, Fill, Routes (its key under it); an elevation: the depth band; the riser view: Hide empty floors and
  its floors; a rack view: Cord channels, Room lines, Other face (`ui/ViewStrip.svelte`). The active tool's options
  and its hint have a row of their own under the tools (the Outlet tool's 7 fields and the Cord tool's sentence pushed
  Undo / Redo off the row); the status bar keeps its line for prompts and messages (`ui/CadShell.svelte`). Live (Test
  Project): the strip fits; Display ▾ opens with the plan's four; the Outlet tool's options on the new row. Help: the
  entries that named strip buttons.
- **R49 (part) Tool libraries float (Dave 2026-10-12):** Blocks (Insert tool) and the Device library (Device tool) open
  floating at the top-left of the drawing, not docked under the Navigator (which they halved); a layout saved before
  carries over with those two closed until their tool opens them (`app/windows.svelte.ts`, layout key `cad-windows:3`).
  Live (Test Project): after a reload the Navigator has its height back; the Insert tool opens Blocks floating.
- **R75 No window inside a window:** Layers, Blocks, Racks and Cables lost their old sidebar header ("▾ LAYERS" under
  the window's own LAYERS title, whose fold left an empty window); their links (+ Layer, + Server room) stay at the
  right (`ui/SideSection.svelte`). The Cables window says how to get cables when there are none (it was blank;
  `ui/CableList.svelte`). Live (Test Project): Layers / Racks / Blocks windows checked.
- **R58 One icon per meaning:** Split = two columns, Hide every window = eye-off, float a window / the tables =
  picture-in-picture, maximise the tables = maximise, Select similar = sparkles (they shared panels / expand / copy with
  the Viewport tool, the Copy tool and each other) (`$lib/ui/Icon.svelte` + `columns`, `maximize`, `pip`).
- **Import legacy drawings — Dave's answers:** a clipped model3d elevation (the comms elevations) → a cad SECTION on
  its clip box (`drawingsSheets.ts` `clipSection`: the cut along the box's near face as seen from that direction, a → b
  the way the named elevation's u runs so it looks the same way unflipped, depth = the box's depth), named from the
  sheet title ("Comms1 elevation" → Comms1, "3303 Comms 2 Elevation" → Comms 2, unique per level), stamped
  `sheets:<sheet>:<viewport>` so a re-import reuses it; the viewport shows the section and it and its tied notes shift
  by the constant u offset (tested: a near-face point and a note on it land on the same paper point in all four
  directions). Pages opening boxes → real openings in the imported wall segment under their footprint centre
  (`drawingsPages.ts` `openingIn`: width = the side along the segment, z / h kept; h ≥ 1800 → a door, hinge side and
  swing face from Pages' doorGeom), stamped `importedFrom` on the Opening (also counted by `importedKeys`), a box in no
  imported wall stays a box with a note; walls from an earlier import host them too. Odd viewport scales snap to the
  nearest standard scale by ratio (1:20.16 → 1:20, 1:35.74 → 1:50), centre kept; notes keep the sizes they were drawn
  at. A sheet whose viewport's floor doesn't match a level goes by its title ("3307 Sensaphone" → 33F 3307).
- **Journey: legacy drawings imported (Dave 2026-10-12, review R1–R5):** File › Import legacy drawings… run on
  Journey — Pages model Zone 3303's boxes and walls onto 33F 3303 (58 boxes, 3 walls, the door and hole as openings in
  them, new layer Furniture; rack box R01 left out) and the Sheets-tool sheets 3303 Sensaphone (→ 33F 3303), 3307
  Sensaphone (→ 33F 3307), 30F Sensaphone (→ 30F), Comms1 elevation and 3303 Comms 2 Elevation (sections Comms1 / Comms 2
  on 33F 3303, at 1:20 and 1:50), 105 tied notes — one undo step. Checked: the Comms1 sheet shows its section with the
  walls, furniture and red notes. Everything else in Journey's Pages / Sheets / Drawings / model3d data stays behind
  (Dave: not needed).
- **R48 Tab titles tell drawings apart:** a rack view's tab names its level, room, row and a rear face ("1F · 33IDF2
  racks (rear)"), a section's its level; a tab whose level / room is gone says so; a plan tab with no level of its own
  reads "Plan (current level)" (`domain/navTree.ts` `viewName`, also the Navigator and the tab list). Live (Test
  Project): the racks tabs now differ.
- **R45, R44 (part), R61 (part), R97 Menus:** menus can have submenus (`MenuItem.children`, opening to the side on
  hover — `ui/MenuBar.svelte`); **File › Export ▸** holds every export (outlet schedules, plan DXF, BOM, cable
  schedule, patch schedule · cord BOM, port map Excel, sheet PDFs); **Edit › Arrange ▸** the four draw-order items;
  Cabling = its tools, Tables ▸, Cord label batches…, Port map view, Schedules ▸; Hide all windows only in Window
  (it was in View too), and the Tables panel is in Window with the windows; **File › Photo surveys…** opens the
  project's photo surveys (their only way in was the old project page). Clicking another menu's title while one is
  open now opens it (it closed both: the hover had already switched); the right-click menu shows ✓ for a choice that's
  on (the Navigator's "Group by …") (`ui/ContextMenu.svelte`). Live (Test Project): File › Export ▸ opens; File → Edit
  switches. Help: menu paths.
- **R84 (part) Help fixes:** stale tool hints ("pick it in Blocks, left", "Racks list → Rack view") corrected; Keys gains
  Alt+W / Alt+PgUp / PgDn / Alt+1…9, Shift+Home, Ctrl+Shift+Z, Backspace = delete, and F / P / L move from "Function
  keys" to Keys; the two "order of racks" entries are one (`ui/toolHints.ts`, `ui/helpContent.ts`). (Its "File ›
  Export" now exists.)
- **R59, R107 Docs:** the glossary has "Area plan", "Floorplan" (an underlay page; extra ones "Floorplan 2…") and
  "Zone" told apart; plan-doc slips fixed — `decisions.md` (the right-click menu is built; no one-letter tool keys),
  `later.md` (T145 answered; North arrow's wrong G id), `backlog.md` (the riser floor range is settled: one
  project-wide range), ADR 0004 (rack placement comes from `rackPlacements`), `docs/firestore-structure.md` (Pages
  models, Pages sheets, global blocks).
- **R56 Ctrl+K finds devices and outlets too:** the Navigator search lists matching devices (by name / model) and
  outlets (by label) under the tree's matches, "Devices and outlets"; a click opens the device's rack view on its
  side zoomed to its rack, or the outlet's plan zoomed to it, with it selected (double-click keeps the tab)
  (`domain/navTree.ts` `findItems`, `ui/Navigator.svelte`). Live (Test Project): "A.00" lists six outlets; A.001
  opens 1F's plan on it, selected.
- **R11 cad no longer imports from the Uploads route:** `PdfState` moved to `$lib/pdf/PdfState.svelte.ts`; the old
  `uploads/parts/PdfState.svelte.ts` re-exports it so the older tools (Pages, Sheets, Outlets, Drawings, surveys) keep
  working (`app/pdf.svelte.ts`). (Drawings' use of `lib/versioning` stays — it goes with Drawings.) Live: cad's
  floorplan, Uploads and Outlets load.
- **R24c Issued sheets reprint their floorplans as issued:** a frozen copy keeps a snapshot of each floorplan file's
  settings (url, pages with their masks, PDF layers, markups) and a reprint — a package with an unchanged sheet, an
  issue's PDF again, a sheet's revision — draws the floorplan from that, not from whatever is masked / hidden since
  (`app/issue.ts` `saveFrozen` / `loadFrozen`, `app/pdf.svelte.ts` `imageAsWas`). Copies frozen before today have no
  snapshot and reprint as before. (R24d left as is: cad measures a calibration line along its length, which is right;
  Uploads measures along x or y.)
- **Power faceplates from the front (Dave 2026-10-12):** the built-in power faceplate blocks get a FRONT drawing in
  real mm (`domain/blocks.ts` `Block.front`, `powerFront`): a 70 × 115 plate, a 50 × 90 frame for the sockets, each
  socket two upright prong lines over an earth circle (single: one socket; dual: two, one above the other). An insert
  placed on a wall in an elevation / section draws it (`frontOf` in `views/elevation.ts`, and the Insert tool's ghost
  there); the plan keeps the edge-on plan symbol. Data faceplates too (Dave, same day): the same plate and frame, a
  14 × 12 rectangle per RJ45 socket (`plateFront`, `power` / `rj45`). Test in
  `domain/blocks.test.ts`. Live (Test Project 1F front elevation): power dual and data dual placed — plate, frame, two
  sockets each;
  undone. (Help not touched: another session was editing helpContent.ts.)
- **R85 step 1 (Dave: step by step) — one list of keyboard commands:** `ui/shellKeys.ts` `KEY_COMMANDS` (label, keys,
  group, when, run), in the old else-if order; the shell runs the first that matches, and Help's Keys and Function
  keys are built from it plus a list of mouse gestures and drawing-time keys (`ui/helpContent.ts`), so what Help shows
  is what the keys do. Menus and tooltips still have their own strings (steps 2 / 3). Test in `ui/shellKeys.test.ts`.
- **R89, R87 (part):** a doc that leaves one scope's query because it moved to another scope (an item moved to
  another level) is no longer deleted locally by the old query's "removed" (`persist/sync.ts`). Dead code gone: the
  panels' unused `columns` / `rows` getters, ViewStrip's empty module script, reports' copy of `levelElevation` (it uses
  routing's). (labels.ts `renumber` / `renumberOutlets` stay: their tests document the label rules.) Help: a
  faceplate's front in elevations (for eos-d9's blocks change).
- **Faceplate fronts on sheets and in the Blocks window (Dave 2026-10-12, Journey sheet 010 Comms1 elevation):** a block
  put inside an elevation / section VIEWPORT on a sheet (a sheet note tied to it, `vpId`) now draws its front drawing
  too (`views/sheet.ts` `notePrims`, at the viewport's scale: a plate is 3.5 × 5.75 mm at 1:20); the Insert tool's
  ghost over such a viewport shows it; the Blocks window shows a block's front when it has one
  (`views/blocks.ts` `blockPreview`). Test in `views/sheet.test.ts`. Seen on Journey's sheet 010 (view only, nothing
  written): its five faceplates now show plate, frame and sockets. Placed at their old insertion points, they are
  larger than the old symbols, so a few may want moving.
- **R73 / R74 / R71 One Project settings dialog:** Project › Floors…, Project › Settings… and Sheets › Title block… are
  now deep links into one dialog, Project settings (`ui/SettingsDialog.svelte`), with a tab list: Floors & heights ·
  Plans & floorplans (`ui/FloorsPanel.svelte`, the old FloorManager's body) · Usages · Cable types · Lengths & labels ·
  Sheets (categories + the title block template) · Files (`ui/SettingsPanel.svelte`, the old Settings body plus the
  old TitleBlockDialog's editor), and Project details… under the tabs (closes it and opens the route's dialog).
  FloorManager.svelte and TitleBlockDialog.svelte are gone. Calibrate (Origin / Scale / Crop) hides the dialog — no
  dialog role while hidden, so Esc reaches the tool — and it comes back as it was when the tool ends. R74: the floor
  range and the name patterns wait for Apply floors; changed, that section is tinted amber with "not applied" and a dot
  on the tab, Apply floors is greyed when there's nothing to apply (enabled too when the levels don't match the range),
  and closing asks "Apply the floor range?" (Apply / Discard / Cancel). Heights / No. / names save at once (labelled
  so). Usages and cable types add the same way: type the code / name first, then Enter or + Add (a usage's code is
  what outlets store and can't be renamed, so a placeholder code would stick; a duplicate is refused with a message).
  R71 in these tabs: every delete here is undoable and happens at once with "— Undo brings it back" (floorplan ✕, empty
  area plan ✕, usage / cable type ✕, floors removed by Apply, Rename all, Apply to all); nothing irreversible goes
  without asking (sheet categories only retire; calibration has "Put it back"). A question asked from the dialog (the
  relabel-ports offer, the close question) and the status message now show inside it — the drawing's question box and
  status line sit under the backdrop. "New cords start as" stays in both Cable types and the Patching bar (same
  setting, but a Patching-tab button Dave asked for). Help updated. Live (Test Project, worktree server): deep links,
  tabs, the not-applied tint + close question, calibrate hide / return, Project details… checked.
- **R96 The global palette (title bar's Find) shows cad:** a "CAD" entry first; the project's cad levels ("1F plan") and
  sheets open in cad (`?v=plan&level=…`, `?v=sheet.…`), read once by type from `cadEntities`; the older tools stay at
  the end as "… (old tool)"; the legacy Sheets-tool sheets and Outlets floor links are gone from it
  (`$lib/palette/CommandPalette.svelte`). Type-checked; not seen live (the shared browser was busy with the agents'
  dev servers).
- **R77–R81, R52 The tables (Dave 2026-10-12: "Dialogs + tables"):**
  - **R80 look:** headers, row lines and grey text from the `--cad-*` tokens (`ui/TablesPanel.svelte`; they were
    Tailwind zinc, unreadable in Kestrel Dark), a selected row in the dark theme uses `--cad-sel`; `SortTh` has a real
    button (Tab reaches it, Enter sorts); one `ui/StatusChip.svelte` for cord statuses, link kinds, issue states and
    the filter chips (the CSS was copied in CordProps / PatchList / Links / Sheets; Cord Properties' status box uses its
    `toneStyle`); Links shows "N more not drawn … Show all (N)" instead of stopping silently at 500 rows.
  - **R77 Sheets on `tableKit`:** remembered sort, a third header click goes back to the print order, All /
    Selection scope (`TableState` takes a default column and the scopes a table offers), Active / Archived as chips.
    Packages and Issues stay views of the Sheets tab — not tabs of their own: they share the register's selection,
    chips and the Issue panel, and issuing / re-issuing jumps between them — each on one bar starting with the
    Sheets · Packages · Issues switch.
  - **R78 one inline-edit model** (`ui/tableKit.svelte.ts`): `RowPick` (click / Shift range / Ctrl toggle — Links
    toggled on Shift) and `CellEdit` (double-click or F2 / Enter on the selected row edits a cell; Enter / Tab save and
    move on (`nextCell`), Esc cancels, leaving saves once; the table gets the focus back) — the patch list's model, now
    in Outlets (label, usage, tier, server room), Sheets (number, title, category, discipline, tags; a double-click
    elsewhere on a row still opens the sheet) and Links (cable type, status), which show text until edited. So a
    click on an Outlets cell selects the row (it started editing). Handled ↑ / ↓ / F2 / Enter stop at the table (an
    arrow also reached the shell, which — by reading the code — nudged the newly picked item on the plan); Enter on a
    focused button presses it.
  - **R79 one bar** (`ui/TableFrame.svelte`): `[scope] [Find] [chips] · count | selection actions (a hint without a
    selection) | ⋯` (`ui/MoreMenu.svelte`, the right-click menu's look), fixed over the scrolling table (its header
    row sticks under it). Outlets: Allocate N / Re-allocate… / Assign N → port… / Find/replace… on the selection; ⋯
    Allocate / Re-allocate this level, Re-allocate pinned links too, Find / replace in the shown; No panel yet and
    no-route chips. Patching: status chips; the cord actions on the selection; New cords (Planning · Surveying) and
    Patch list… stay visible (Dave: easy to find); ⋯ Cord labels…, Import cord IDs…, Purge removed (N). Sheets: ▲▼,
    PDF, Issue…, Duplicate, Archive / Restore, Delete on the selection; ⋯ PDF / Excel of the rows shown, Issue state
    column, Group by. Links: design / installed chips (were a select), Remove N on the selection. Packages: + From
    selection on a register selection, ⋯ + From chips. Issues: ⋯ Issue register (all / latest only).
  - **R81 (tables):** the Links row ✕ shows on a selected or focused row too; row buttons, filter chips, cord actions
    and Planning · Surveying get a 20 px hit area.
  - **R52 pick in a table → on the drawing:** `editor/camera.ts` `reveal` (null when in view; else the same zoom
    centered on it, or a fit when it's bigger than the view); `ws.selectAndReveal` bumps `ws.reveal`, the shell runs the
    active view's `revealSelection` — Outlets, Patching and Links picks (click, ↑ / ↓), not picks on the drawing.
  - Tests in `ui/tableKit.test.ts` (default sort / scopes, RowPick, nextCell, CellEdit) and `editor/editor.test.ts`
    (reveal). Not checked live (the worktree's dev server has no signed-in session). Help: "The tables' bar", "Edit
    cells in the tables", the Tables keys in Shortcuts, and the paths that moved into ⋯.
- **R98a Monochrome PDFs and copy view (decisions T121 (a), T160 (a)):** File › Export › **Monochrome PDFs** (a tick per
  browser): sheet PDFs with all ink black, fills light grey, floorplans and pictures grey, "(mono)" in the file name
  (`render/pdf.ts` `mono`, `app/sheetsPdf.ts`); View › **Copy view as picture**: the active view as on screen onto the
  clipboard as a PNG — the SVG copied with its computed styles and its floorplan as a data url, drawn on a canvas at up
  to 2× (`ui/ViewCanvas.svelte` `copyPicture`). Live (Test Project): "Copied the view as a picture (1499 × 565 px)".
  Help: two entries.
- **R53 Always-on chips:** the options row starts with the active tool's name, a **Layer** picker (where new lines,
  notes and blocks go — "by kind", Walls, Drawing and the project's own layers; `ws.layers.setCurrent`) and, while
  editing inside a viewport, an amber "Editing in a viewport ✕" that leaves it (the hint no longer carries that
  prefix) (`ui/CadShell.svelte`). With the toast for "Drawn on …" (earlier today), the status line keeps prompts and
  messages only.
- **Blocks drawn one way; elevation blocks only in their elevation (Dave 2026-10-12):** how a view draws a block — its
  plan symbol or its front — is decided once (`domain/blocks.ts` `faceFor(viewKind)` / `blockFace`) and every path
  draws through `shapePrims(…, face)`: the plan, an elevation / section (its insert branch now only projects the point
  into the view, then `shapePrims(…, 'front')`), a note in a viewport (`notePrims`: the viewport's face), the Insert
  ghost (the view's, or the viewport's under it on a sheet, at its scale) and the Blocks window (`blockPreview(b,
  face)`). A block placed from the Blocks list in an elevation / section records that view (`insert.frame`) and shows
  ONLY there: not on the plan (unless unticked from "show in elevations"), not in other elevations. Older elevation
  inserts (no frame) still show in every elevation and on the plan. Tests in `editor/insertTool.test.ts`. Help: "What
  a plan shows in elevations".
- **R61 (part) Edit › Paste works:** it reads the clipboard on request and pastes cad items as Ctrl+V does (it only
  said "press Ctrl+V") (`app/clipboardEvents.ts` `pasteText`, `ui/CadShell.svelte`).
- **R86 Properties field kit (step 1, the foundation):** `ui/propsKit.ts` — `shared(list, f)` → `{ value, mixed }`
  (one meaning of "the value they share"; it replaces the `same()` / `shared()` / `'*'` helpers of Properties,
  OutletProps, DeviceMultiProps, SheetMultiProps, LineStyle, InsertAttrs, RunsMultiProps, ShapesMultiProps, RackDoors
  and PortProps), one `MIXED` word ("mixed" — no more "(mixed)"), `put` / `putMany` (one undo step, "Label (3
  racks)"), `num` / `text` / `whole`; tests in `ui/propsKit.test.ts`. Shared fields in `ui/fields/`: `Field` (the
  6.5rem label column, "Label (unit)", the label's id for the control's `aria-labelledby`), `NumberField` (unit, the
  default as the placeholder, blank → default when allowed; the box shows the data again after a refused edit),
  `TextField`, `SelectField` ("mixed" option, extra options), `CheckField` (half-ticked when mixed), `ColorField`
  (ColorPick). The `.row` / `.inp` / `.btn` / `.acts` look is `ui/props.css`, imported once by Properties (wrapper
  class `cad-props`, `:where()` so a component's own rule still wins); the copies in 12 Props files are gone. Several
  racks' fields are the first built from the kit.
- **R62 / R63 / R64 Properties groups (step 2), and Properties as a dispatcher (R86's last part):** `ui/Properties.svelte`
  (565 → ~110 lines) only picks the kind's component; the inline editors became `RackProps` (one rack or several:
  the same four groups), `DeviceProps` (one device or several — it replaces `DeviceMultiProps`), `InsertProps` and
  `ShapeProps`; "Make block…" with its name box is `MakeBlock`. Every field is in a group: a shape's Height / Z / Back
  line / Doors in **Box**, its Color / line type / Fill in **Style**; an insert's Rotation / Scale / Z / Elevations in
  **Position**, Attributes and Explode in their own groups; Make block in **General**; the **Layer** row in General
  for every kind that has one (outlets, racks, shapes, notes, legends, runs). A run's **Fill** and **Cables by hand**
  (`RunFill`) and a wall's **Height and openings** (`WallOpenings`) come before Segments / Nodes, inside PathProps.
  Legends and sections are grouped too (their duplicate titles went). Several selected: one group per kind ("3 racks",
  "5 outlets"; `propsKit` `selectionKinds`, tested) with the same inner groups as one item — multi-outlets now in
  one outlet's groups and order — then **Group and block** (Group / Ungroup / Make block); a single kind has no outer
  group. The header says "3 racks · 5 outlets" instead of "8 items" (`PropsHeader`). The Renumber group renders
  after the header (it sat above it, so the header jumped). `PropGroup` takes an `id` for remembering its fold when
  the title carries a count. Help: "Edit several things at once (Properties)".
- **R65 Rooms and rows have their own Properties (Dave agreed 2026-10-12):** a server room or a row of racks is
  selected from the Navigator (its room / row row — `domain/navTree.ts` gives them `select`, tested; the rack view
  still opens), the Racks window's room header (new **Properties** button) or a rack's **Room … ›** link (it replaces
  the rack's "for every rack in …" Room floor / ceiling fields). The shell keeps such a selection when a view opens
  (they aren't drawn; `CadShell` `setPane`). `ui/RoomProps.svelte`: General (name, code — the server-room letter of
  port labels, level) · Floor and ceiling (`Space.floorMm` / `ceilingMm`) · Rows (rename, containment, ▲ ▼ order, ✕,
  + Row; the count selects the row) · Summary (racks and how many aren't on the plan, devices, panels, panel ports
  used / free, outlets it serves and their ports) · Open rack view, Place racks on the plan (opens the plan, arms the
  first unplaced), Delete room… (`app/navActions.ts` `deleteRoom`, asks when racks go). `ui/RackRowProps.svelte`:
  name, containment, a link to its room, its racks in the rack view's order (a click selects one), Open row view.
  Delete (key / header) on a room = `deleteRoom`, on a row = new `deleteRow` (its racks stay, in no row; its hand order
  goes). The Racks window keeps its own controls. Help: the room / row and floor / ceiling how-tos.
- **R68 / R67 / R69 Same labels, same fields for one and many, rotation (step 3):**
  - Labels carry their unit and "Z" means height above the floor: a run's Width / Thickness / Diameter (mm), Height
    (mm), Inside (mm), Bend radius (mm), "Z, all nodes (mm)" (it now shows their shared Z, "mixed" otherwise); an
    outlet's and a block's "Height (Z…)" → **Z (mm)**; a note's Box width (mm); Lineweight (mm); racks' Rotation (°).
    One MIXED word everywhere in Properties (Layer, cord type, segment sizes had "(mixed)" / own copies); run tiers
    read Low / High / Wall as elsewhere.
  - The Layers panel's color is cad's ColorPick (the grid + Custom, as in Properties) instead of the browser's color
    input — `ColorPick` `compact` (the swatch alone, its grid opening to the right); By layer = back to the default,
    the round "default" dot kept.
  - One sheet's General has **Category** (Auto shows what it works out), **Discipline** and **Tags** (chips with ×, a
    box that adds on Enter), in the order several sheets show them (Category · Discipline · Tags · Drawn). Outlets,
    devices (Mount, PDU side / inlets / sockets now for several) and racks (Product, Color now for several) were made
    one-for-1-and-n in step 2.
  - **Rotation (°)** for rectangles (boxes) and ellipses — one (ShapeProps › Position, with a box's Z) or several
    (ShapesMultiProps › Position, each about its own centre). Images: left — the image prim has no rotation, so the
    screen / PDF can't draw a turned picture yet.
  - Help: "Give a layer a color", "Turn a rectangle, box or ellipse"; the sheets how-to names the single sheet's
    Category / Discipline / Tags.
- **R66 (P1) / R70 Library actions out of Properties, one Delete, quieter panels (step 4):**
  - A placed block's Properties no longer has **Delete block…** (it deleted the library block for every project, no
    undo, a few px from the header's Delete): its Block group has Explode and a **Blocks window ›** link
    (`ws.openWindow`, set by the shell). Deleting stays in the Blocks window (✕, asks first); its ✕ now also shows on
    keyboard focus and on the picked block, not only on hover.
  - **Save as template** belongs to the Device library: with one device selected the library shows **+ From <its
    name>** (the template form filled in from it, a new template); the device's Properties keep a small "Save as
    template…" link in Product and size.
  - Body Delete buttons that repeated the header's went: SheetProps' **Delete sheet** and **Delete viewport** (the
    header's bin / the Delete key do both, asking as before). A cord's button is the install workflow's and stays,
    relabelled **Mark for removal**, and is gone for a planned (add) cord, which Delete just deletes. A room's Delete
    room… stays in its actions (the R65 brief asked for it).
  - Static help lines became tooltips: the port selection hint (on the Ports heading), a sheet's viewport hint (on the
    count), the legend's "it updates itself" (on its count); the "Drag to move · Delete removes it" lines of notes,
    legends and sections went (Help says it). Section and legend titles that repeated the header went in step 2.
  - One rename gesture for a row under a rack's Row field: click its name (`InlineName`, as in the Racks window), no
    separate Rename link.
  - **Nothing selected**: Properties shows the active view's basics (`ui/ViewBasics.svelte`) — a level's name, FFL and
    heights with **Floors…**, or a sheet's number, title, paper and viewports with **Select sheet**.
  - Help: "Delete a block from the library", the device-template how-to (+ From …), the cord how-to (Mark for
    removal), the Properties how-to (empty state, one Delete), the row rename.
- **R92 Rotate and Mirror:** two base-point tools beside Move / Copy (tool strip Select / modify group; Edit › Rotate /
  Mirror; plans and sheets). Rotate: select, click the pivot, then a point — the turn is its angle from +x as seen
  (snaps; Shift 15°) — or type degrees, positive = anticlockwise as the polar input (a new `Tool.typedText` hook lets a
  tool read a bare number before it's parsed as a point; `typedLabel` changes the typing box's prompt). Mirror: click
  the line's two points (Shift 15° / H / V); the originals are replaced. Ctrl on the last click keeps the originals (a
  turned / mirrored copy, via the clipboard's paste). One undo step each; a ghost follows the cursor; runs attached to
  what moved follow (`followAttachedMap`); locked outlets are left. `domain/shapes.ts` `rotateGeometry` /
  `mirrorGeometry` (+ `rotatePt`, `mirrorPt`, `lineDeg`) for every kind: a dimension keeps its side (a quarter turn
  swaps horizontal / vertical, other angles make an aligned one of the same length); a mirrored arc swaps its ends;
  mirrored text and images stay readable / upright (text's left / right alignment swaps). `editor/behaviours.ts`
  `rotateEntity` / `mirrorEntity`: outlets / racks turn `at` and `rot`; a rack or a box with a back line / doors keeps
  its front facing the mirrored way with the door hinge swapped; wall doors open to the mirrored face; a section swaps
  its ends; a shape on an elevation plane turns / mirrors its frame; notes tied to a viewport turn about the pivot in
  that viewport's view mm. Icons: `rotateRight` (lucide RotateCw, already mapped) and a new `flip` (FlipHorizontal2).
  Hints, Help ("Rotate or mirror items"). Tests: `domain/shapes.test.ts`, `editor/transformTool.test.ts`.
- **R95 More viewport types (backlog "More viewport types" + "Fill-rate drawing as a viewport from a trunk"):** three
  new PAPER views (`views/space.ts` `isPaperSpec`, with the port map: paper mm at 1:1, no level of their own, no
  model, no scale on the viewport label or in the title block's Scale), drawn by one switch (`views/paper.ts`) in a
  pane and in a sheet viewport alike, so the sheet PDF prints them (DXF still exports the plan only, as before).
  `{ kind: 'ports', rackId, deviceId? }` — a rack's patch panels (a "frame", the old Drawings tool's Frame detail)
  top U down, or one device, each port with its number and label as the printed panel sheets draw them
  (`views/panelSheets.ts` `portGridDisplayList`). `{ kind: 'schedule', table: 'patch', spaceId?, start? }` — the
  patch list as a ruled table (`views/schedule.ts`): the Excel's cords, order and cells (`render/exports.ts`
  `patchScheduleRows`), grouped remove → installed under colored status headings, columns sized to their text (face,
  cord ID, notes and the "was" ends only when some cord has one); it shows the rows that fit its window and ends
  "… N more cords: from #k", and Properties › From cord starts another viewport there. `{ kind: 'fill', shapeId,
  segId }` — a run segment's inside with its cables packed in at a true scale (1:1 – 1:20 to fit 80 × 60 mm), its % in
  the fill tone, inside size and cables by type in the colors Properties › Fill uses (`domain/fill.ts` `cableColor`,
  shared now) (`views/fillSection.ts`). Sheet Properties › View offers each server room's racks with panels as
  "… port grid" (+ Panel: all / one device) and each room's (or every room's) patch schedule; switching to or from
  paper fits it (1:1 from the window's top-left; back to a model view: a scale that fits). Properties › Fill › Put on
  sheet… puts the shown segment on a new or chosen sheet (`views/sheet.ts` `paperViewport`: 1:1, sized to what it
  draws, in the drawing area's corner); a pane's To sheet… does the same for any paper view. Also wired: tabs, URL
  (`ports.` / `schedule.patch.` / `fill.`), Navigator names, the strip's crumb, Select in these views. Tests:
  `views/schedule.test.ts` (each cord's from / to, the "… more" split and its continuation), `views/fillSection.test.ts`
  (the % is fillBySegment's), `panelSheets.test.ts` / `sheet.test.ts` (port grid, 1:1 placement, no scale). Help
  updated. Left: a survey photo viewport (backlog).
- **R51, R61, R83, R88 (part):** a tool group with nothing that works in the view folds to one faint "⋯" (its title
  lists the group) instead of a row of greyed icons (`ui/ToolStrip.svelte`); clicking SNAP / OSNAP / GRID in the status
  bar says it, as F9 / F3 / F7 do (`ui/StatusBar.svelte`); the Patching tab's button is "Patch schedule · cord BOM…",
  the same name as the menu and the dialog (`ui/PatchList.svelte`, Help); a test that a throwing transaction leaves
  nothing behind (`store/store.test.ts`).
- **R85 step 2 — one table of key labels:** `ui/shellKeys.ts` `KEYS` (undo, redo, group, draw order, F-keys, tabs,
  view keys …); the keyboard list (and so Help) and every menu / right-click / tab menu key read it
  (`ui/cadMenus.ts`), so a key named in a menu is the key the shell runs. Step 3 (button tooltips) next.
- **R47 A level per pane (Dave agreed: "area plans make it more useful: 3303 beside 3307"):** `app/workspace.svelte.ts`
  keeps `paneLevels` (one per pane) and `pane` (the active one); `levelId` is now a getter / setter on the ACTIVE
  pane's entry, so everything that reads or sets the open level (Properties, the tools' ToolCtx via each canvas's own
  `levelId`, the Outlets table, Navigator current, Floors, Project › Rename this level…, Find, undo's level switch)
  works on the pane you're in without changes. `setPaneCount`: Split starts the new pane on the same level; unsplit
  keeps the active pane with its level. `ui/CadShell.svelte`: each `ViewCanvas` gets its pane's level; a click in a
  pane makes it active (its level becomes `ws.levelId`); `showTab` / Back / Forward set THAT pane's level (Open in the
  other pane no longer changes the active one); the tab-sync effect uses each pane's own level, so a "3F plan" tab in
  pane 2 no longer turns into 2F after a click in pane 1; a pane whose level was deleted shows the active pane's. The
  other pane's work plane (green line / grip) shows only when both panes are on one level; a new viewport takes the
  other pane's view with ITS level (or the last model view with the level it was on). URL (`app/urlState.ts`):
  `level` stays the active pane's; `levels=<id0>,<id1>` is added only when two panes show two levels (`paneLevelsOf`
  reads either; old links open both panes on `level`). Help: a "Put two levels side by side" entry; the work-plane
  entry says "of the same level". Tests: `app/workspace.test.ts`, `app/tabs.test.ts` (two panes on two levels keep
  their tabs and histories), `app/urlState.test.ts` (levels round-trip; one level → no param).
- **R50:** the Navigator scrolls the open view's row into sight as well as unfolding its branch (`ui/Navigator.svelte`);
  the Blocks and Device library windows step aside (still open) in a view where their tool can't work, docked or
  floating (`ui/CadShell.svelte` `offHere`); Help.
- **R57:** the view strip's breadcrumb goes (the tab names the view); a rack view and a port map, which have no Plan
  button, get "↑ 1F plan" (`ui/ViewStrip.svelte`). The other ways between views keep their roles: Navigator finds and
  opens, tabs are the open set, the strip switches between siblings.
- **R93 Bulk patch preview, port use per device:** Patch to… on several ports (or P / Properties › Patch all … ports
  to… on a whole device), then the first port on the other device, no longer writes at once: `editor/cordTool.ts`
  plans with `domain/cords.ts` `bulkPatch` and `ui/PatchPreview.svelte` lists each cord (port → port, with labels) and
  the ports skipped with their reasons; OK = one transaction (one undo step), Cancel / Esc = nothing. `bulkPatch` now
  maps IN STEP by default (the i-th port → start + i; a pair skipped when either port is refused; it stops at the
  target's last port) or `fill` (the old behavior: the target's taken ports are passed over); the dialog's "Fill free
  ports only" is sticky (`ws.patchFill`) and Ctrl on the click flips it for that time. One port onto a free port
  still patches at once. `portUse` / `portUseByDevice` count each device's ports patched (a non-removed cord), linked
  (a permanent cable), used (either) and free; shown in Device Properties › Ports and labels ("24 ports · used 20
  (patched 12, linked 18) · free 4"), the rack view's port tip (foot line) and a rack's tooltip in the Racks list.
  Tests: `domain/cords.test.ts` (in step / fill / the end of the target, port use), `editor/racks.test.ts` (nothing
  written before OK, one undo step, Fill and Ctrl, Cancel), `views/portTip.test.ts`. Help updated.
- **R85 step 3:** button tooltips that name a key read it from `KEYS` — status bar, tool strip, tab ✕, Back / Forward,
  the Navigator's search, the tables' open / close, Undo / Redo, Group / Ungroup (dialogs' "Close (Esc)" stay as they
  are). R85 done: one table of keys behind the shell, Help, the menus and the tooltips.
- **R72 One `CadDialog`:** `ui/CadDialog.svelte` { title, label?, hint?, width, height?, top?, flush?, hidden?, locked?,
  outside?, onclose, onescape?, onkeydown?, head? / bar? / footer? snippets, children } is the one modal shell: the
  backdrop (`backdropClose`), `dialogFocus`, `role="dialog"` + `aria-modal`, Tab kept inside, Esc closes (its own Esc
  only, not a dialog opened from it), the header with the title and ✕ (20 px), a scrolling body, an optional bar
  (the export options) and footer, one z-index (90: above the menu bar and floating windows, under the right-click
  menu; RestoreNotice 92 stays over it). It moves itself to cad's root, so a dialog opened from a floating window
  (TemplateDialog from the Device library) covers the screen, not the window. The 13 dialogs use it: BOM, Cable
  schedule, Cord labels, Image, Logo picker, Patch schedule, Project settings, Device template, Backup / Restore,
  Backups (was `BackupsWindow`, now `BackupsDialog`), Help (its search box in the `head` snippet), Import legacy
  drawings, Open project. Kept: Project settings hides while a floorplan is calibrated (`hidden`: no dialog role, so
  the drawing gets Esc) and asks before closing on an unapplied floor range; Backup / Backups ignore the backdrop and
  everything while a job runs (`outside={false}`, `locked`), Backups' Esc steps back (question → rename → close);
  Device template's Enter saves.
- **R71 One confirmation rule (the rest of the UI):** an undoable action that changes only what's picked happens at
  once and the status line says what went, ending "— Undo brings it back" (them); it asks first only when it can't be
  undone (a library block / template, a stored backup, printed panel labels, a floorplan file other projects use) or
  more goes with it than what's selected (a rack's devices, a sheet's viewports, a level's contents, a section's
  viewports, Purge removed). Changed: Remove links / Remove cords on a device act at once, as on selected ports
  (`ui/DeviceCables.svelte`); the cord actions Delete and Installed-on-removal no longer ask (`ui/cordActions.ts`,
  the note in the message); Allocate fills free ports at once and asks only when existing (unpinned, or with
  "pinned too" pinned) links would be replaced (`ui/OutletGrid.svelte`); Delete sheet asks only when viewports /
  notes go with it (`ui/SheetsTab.svelte`); an empty level shown nowhere just goes (`app/navActions.ts`); plain
  Delete (an item, an opening, a viewport — via the header's Delete — a row, an empty room) and Delete layer now say
  so. Help updated (unlinking a run of devices, cord actions, allocation, deleting a level / room).
- **R81 (rest) Hover-only actions outside the tables:** the row actions that showed on hover only now also show on a
  row with the focus (`:focus-within`, so Tab reaches them), on the picked / current / selected row, and always on a
  touch screen (`@media (hover: none)`, iPad), with 20 px hit areas: Blocks' ✕ (`BlockManager`), the Device library's
  ✎ / ⧉ / ✕ (now `visibility`, so the row no longer jumps), Layers' ✎ (and every layer icon 20 px), RackList's drag
  grip (+ 20 px ⋯ / Place / Rack view buttons), and the Navigator's ✎ (+ 20 px row actions). Help: "hover (or
  select) the row", "Hover (or tab to) a template".
- **R82 Fields with no real label:** the div rows with a bare text label (Color / Fill / Background / Usage / Riser
  color / Length / Tags / Window / Centre) are `ui/fields/Field.svelte` rows now (its label's id → the control's
  `aria-labelledby`): CordProps, OutletProps (one and several), PathProps, NoteProps, RunsMultiProps,
  ShapesMultiProps, BackboneProps, SheetProps, SheetMultiProps. Inputs in repeated rows that had only a `title` or a
  placeholder get an `aria-label` naming the row: PathProps' node Z / ↕ / ✕ and the picked segments' size, PortProps'
  and OutletProps' port label (and server room) rows and Route through, RunFill's cables-by-hand rows, SheetProps'
  change notes, custom scale and tag ×, the title-block editor's fields (logo height, company lines, labels, Remove)
  and its Layout / Add rows (`<label>`) and Show chips (a labelled group), RackDoors' second select, Layers' line type
  / lineweight, the status bar's grid step; the Color pickers in the cord bar and tool options are labelled groups.
  ("Riser colour" reads "Riser color".)
- **R60:** "colour" → "color" in every comment, string and piece of markup text under `src/lib/cad` (63 files; done
  with the TypeScript scanner so identifiers were never touched). Stored field names stay (`Cord.colour`,
  `Sheet.outletColour`, `usageColour` …), as do a few local names.
- **R84:** Help's how-tos come in seven groups — Drawing and editing; Views, tabs and windows; Plans: runs, outlets and
  routes; Racks, ports and patching; Sheets and issuing; Layers and blocks; Project, floors and files (`HOWTO_AREAS`;
  every how-to names its `area`, so a new one can't be left out). The two "order of racks" answers are one; the two
  port map answers are named apart ("a drawing" / "the Excel for VLANs"). Keys come from `KEYS` (R85).
- **Fix — a "Plan (current level)" tab that wouldn't open:** cad opened without a level in the URL (the palette, a plain
  `/cad` link) made a tab for the plan before the levels loaded, so it had no level; once the level came the pane went
  to that level's own tab, and a click on the orphan bounced back there. A level-bound view with no level never
  becomes a tab now, and one saved like that is dropped on load (`app/tabs.svelte.ts` `unplaced`; test).
- **Review follow-ups (Dave 2026-10-12: 16, 19, 20, 21, 22; 18 = keep the selection):** Link to… lists its cables
  before making them, like Patch to… (`editor/cordTool.ts`, `ui/PatchPreview.svelte` takes a title / OK label and
  no fill choice; test); undo / redo of something on the other pane's level makes that pane active (`ui/CadShell.svelte`
  `showHistory`); a tab's ✕ shows on shown / focused tabs and on touch screens (`ui/TabStrip.svelte`); dialog footer
  buttons share one look (`ui/CadDialog.svelte` `.btn` / `.btn.go` / `.keys`); the sheet and keys tests import up
  front (an import inside a test ran past its timeout under load).
- **R106 — any cord length:** a cord's Length (Properties) and a label batch's length are typed fields with the standard
  lengths offered (a datalist), not a fixed list; a typed length locks (`ui/CordProps.svelte`, `ui/CordBatches.svelte`);
  Help. The estimate from the racks still rounds up to a standard length.

## Review 2 fixes (backlog.md "Review 2")

- **Q1** a white rack (the word, or a light, unsaturated hex from the Color picker) orders the white containment kit
  (`domain/rackBom.ts` `isWhite`; test).
- **Q2** racks moved to another room (Room, New server room…) take their panels' served room with them; Room is off for
  racks on several levels (`domain/devices.ts` `racksToRoom`, `ui/RackProps.svelte`; test).
- **Q3** auto cord lengths take a port's column as the rack view draws it — column-numbered switches went to the wrong
  cable channel (`domain/cords.ts` `portColumn` / `portSide`; test).
- **Q4** Floors settings read `project.rev` for the building (stale skip after Apply; a new building per Apply).
- **Q29** an error shows beside Saved / Saving…, with ✕; a saving error clears once the next writes go through
  (`app/project.svelte.ts`, `ui/CadShell.svelte`).
- **Q5** one height rule for an outlet with no Z (Dave): by mount — ceiling = the level's clear height, wall = 300,
  else 0 — in the elevation (it went by tier), routing, Properties, moves (`moveBy` takes a lookup for the level) and
  pastes. One table of default level heights: `heightsOf(level)` / `DEFAULT_HEIGHTS` (`domain/floors.ts`), used by the
  elevation, riser, section, openings, the draw tools' defaults and the legacy importer; tests.
- **Q9** fewer ports on a device take the links and cords on the ports that go, in the same step — asked first, saying
  how many (installed cords named); F4 repeating a port count asks the same (`domain/devices.ts` `beyondPorts`,
  `ui/DeviceProps.svelte`, `app/shellActions.ts`; test).
- **Q10** allocation, Assign → port… and dragging ports leave a panel port with a hand label or in a labelled range of
  ports free (it's for something else; the outlet's label would replace what it shows), and say which (an allocation
  issue "N free panel ports left free …"; Assign / drag name the ports passed over) (`domain/allocate.ts`
  `labelledPort`; Help; tests).
- **Q11** a cable type that only links (outlet cables, ties, backbone) use can't be deleted — it was, and fill, cores,
  the riser and the BOM then guessed; Settings › Cable types' Used by counts links too (`domain/cableTypes.ts`
  `cableTypeUses` / `cantDelete`, `ui/SettingsPanel.svelte`; test).
- **Q17** deleting a server room takes the sheet viewports showing it off their sheets (its rack view, its patch
  schedule, its racks' port sheets; tied notes back on the paper) and takes it off the rooms runs serve (a run that
  served only it serves every room again — any delete lets go of `serves`, in `unlinkFrom`); the racks and rows go as
  they are when Delete is clicked, not when asked; the question says how many runs / viewports (`editor/commands.ts`
  `roomViewports` / `roomViewportsOff`, `app/navActions.ts` `deleteRoom`; test).
- **Q20** a Sheets-tool sheet's date no longer prints forever: the title block shows the latest revision's date once
  there is a dated one, over a stored date field (only the importer ever wrote one — so Journey's sheets need no
  clean-up); the importer puts the date on the current revision when that has none, and keeps it as a field only on a
  sheet with no revisions (`views/sheet.ts` `titleBlockContext`, `persist/import/drawings.ts`; tests).
- **Q35** the project's cord type and color are taken in when the project loads (and again when they change in
  Settings), not when the Cord tool is first picked — Patch to…, P and drag-to-patch made cat6a / blue cords before
  that; a type / color picked in between stays (`app/workspace.svelte.ts` `seedCordDefaults`, `ui/CadShell.svelte`;
  test).
- **Q36** Delete says what it did: in the Properties header's words ("Deleted trunk T1", "Deleted cable", "Deleted
  2 racks · 3 outlets" — not "shape" / "link" / "N items"; the question asks in the same words); an installed cord is
  "marked for removal — it comes out on site", one already marked says so (and points at Purge removed); clearing a
  port reservation says which ports. The header's kind words moved to `ui/propsKit.ts` `kindOf` so both use one list
  (`app/selectionActions.ts` `deletedText`; test).
- **Q30** Enter answers the open question only with the focus in its box or on the page, and the box takes the focus
  only when no field is being typed in — Enter in a search, a cell or a field no longer says yes to "Delete level 3F?";
  Esc cancels unless a field is being typed in (`ui/keyGuards.ts` `askKey`, `ui/AskBox.svelte`; test).
- **Q31** Japanese IME: Enter / Esc (and ↑ / ↓, Tab) mid-conversion are the IME's — one `composing(e)` guard
  (`isComposing` or keyCode 229) and `enterKey(e)` in `ui/keyGuards.ts`, used by the shell keys, the question box, every
  dialog (CadDialog), the cell editor and table keys (tableKit), the in-place text box, name inputs, the status-bar
  prompt, the Navigator / Find device / Open project searches, the settings and sheet add-rows, the title block, the
  new-room form and the tables' Esc; tests.
- **Q32** Ctrl+C / Ctrl+X / Ctrl+V leave the drawing alone while a dialog is open or mid-drag (the store's gesture is
  open), as the shell keys do — a cut behind Project settings deleted the selection unseen (`app/clipboardEvents.ts`; test).
- **Q33** Ctrl+A in the Outlets, Links, Sheets (and Patch list) table picks its shown rows (`selectAllRows` in
  `ui/tableKit.svelte.ts`); TableFrame keeps Ctrl+A from the shell in every table (Packages, Issues too) — it selected
  the whole drawing, and the next Delete removed every shape in the view; Help; test.
- **Q34** Project settings has its own Undo in the footer (its tooltip names the step; the status line says what was
  undone): the dialog's messages said "Undo brings it back" while the shell's Undo (keys, button, menu) sat behind the
  backdrop (`ui/SettingsDialog.svelte`); Help. No test (a button calling `project.undo()`).
- **Q37** Ctrl+K: ↑ / ↓ move a highlight over everything the search shows that opens (tree rows, then the devices and
  outlets found), Enter opens it — a search that matched only a device opened nothing; a click on a find no longer clears
  the search, so the double-click (keep the tab) works; unplaced outlets are found (their plan opens, selected; no fit);
  "N more" past the 15 shown (`domain/navTree.ts` `findItems` / `searchHits`, `ui/Navigator.svelte`); Help; tests.
- **Q38** several plain lines selected get the line's style fields — line type, lineweight, start / end marks — not only
  Color, as one line has (`ui/RunsMultiProps.svelte`; `plainLines` in `ui/propsKit.ts`, shared with LineStyle; test).
- **Q39** the Z / W / H typed for a drawing tool (trunk, conduit, wall, line, opening) come back when it is picked again
  this session — W / H per tool, Z per tool and level; `setTool` reset them at every pick (`app/workspace.svelte.ts`);
  Help; test.
- **Q6** turned text in PDFs that is centred or right-aligned (vertical / slanted dimension values, turned notes, rack
  labels) starts back along its turned baseline: jsPDF shifted x for `align` before turning, so it printed off its
  anchor (`render/pdf.ts`; test reads the text matrix).
- **Q7** two runs joined into one keep the absorbed run's data: its hand cables (its "every segment" ones tied to its
  own segments unless both runs had the same), the rooms either serves (either open to any = any), primary, its label
  when the kept run has none, its bend radius on its own corners; the kept run's tier stays (a run has one). What named
  the absorbed run — a cable's chosen runs, nodes / leaders attached to it, outlets / shapes hosted on it, a
  penetration's source, a fill-section viewport — names the joined run in the same step (`domain/pathEdit.ts`
  `joinShapes` / `repointRefs`, `editor/dragParts.ts`). A run split into pieces (Delete / Disconnect on picked nodes or
  segments) sends its segment-tied hand cables, penetrations and fill sections with their segment's piece (`pieces`,
  `pieceRefs`; tests).
- **Q8** a run split where another run is drawn to the middle of a segment (or a node double-clicked in) keeps the
  hand cables tied to that segment on both halves, and a penetration accepted on it names the half it lies on
  (`domain/pathEdit.ts` `insertNode` / `splitSegRefs`, `editor/pathTool.ts`, `editor/selectTool.ts`; test).
- **Q12** Explode draws what the view drew: texts keep their size (× the insert's scale only — an annotative datum's
  text was scaled by the drawing scale twice, 20 m tall), `{TAG}` texts are filled from the insert (a blank one goes),
  a note in a viewport uses that viewport's scale and face, and a level's insert placed in an elevation / section (or
  shown there and exploded there) becomes its FRONT drawing on that view's plane at its height — it went onto the plan
  as the plan symbol (`domain/blocks.ts` `explodeInsert`, `app/project.svelte.ts` `explode` takes the active view;
  tests).
- **Q13** a note untied from its viewport (the viewport deleted, its level deleted, its section retargeted) stays where
  it showed at its printed size for every kind: lines (their nodes), blocks (the point; a symbol keeps its scale, a
  model block shrinks by the drawing scale), pictures and legends were left in view mm — metres off the paper. `untie`
  now lives in `domain/sheetEdit.ts` (`editor/noteTool.ts` re-exports it; `annotativeIn` in `domain/blocks.ts`; tests).
- **Q14** copying notes tied to a viewport (Ctrl+C, Ctrl-copy in Move / Rotate / Mirror, paste at the cursor) keeps
  their printed size: the clip used to move only their points, so a 2000 × 1000 box at 1:100 came out 170 × 110 and
  circles, ellipses, text widths and dimension offsets kept their view-mm sizes; it now uses `untie`
  (`domain/clipboard.ts`; test).
- **Q15** Mirror leaves outlets and block inserts facing the mirrored way: their symbols point along local ±y, so the
  mirrored rotation is 2θ − r + 180 (as racks), not 2θ − r — that turned them to face back across the line
  (`editor/behaviours.ts` `mirrorEntity`, `domain/shapes.ts` `mirrorGeometry`; the tests expected the wrong value;
  Help).
- **Q16** notes, dimensions, lines, flat shapes and blocks drawn on a section's plane follow the section when it moves
  (Move, drag, nudge, Align), turns or is mirrored, has an end dragged, or is flipped: they are re-framed on its new
  plane in the same step, keeping their place in the building (a flip mirrors where a note is, not its letters).
  They belonged to the old frame, which no view has, so they drew nowhere (`editor/behaviours.ts` `followSection` /
  `followSections`, called from the move tools, the Select tool's drag and section grips, Rotate / Mirror and the
  section's Flip; test).
- **Q18** Make block refuses shapes drawn on an elevation / section's plane (Properties says why instead of offering
  it): a block's insert point is a plan point, so their (u, z) points landed on the plan (`domain/blocks.ts`
  `blockProblem`, `ui/Properties.svelte`, `app/project.svelte.ts` `makeBlock`; test).
- **Q19** a turned image shape draws its picture turned with its frame — on plans, sheets, in the PDF and in
  elevations (where it was squeezed into the turned frame's bounding box): image prims take `rot`, turned about the
  box's centre (`views/display.ts`, `views/plan.ts`, `views/elevation.ts`, `ui/Prims.svelte`, `render/pdf.ts`; tests).
  The DXF still skips images.
- **Q52a** iPad: a long press is a right-click. A finger (or pen) held still 500 ms, drifting less than 8 px, sends a
  `contextmenu` (a PointerEvent with the press's `pointerType`) to what it's on, so every right-click menu opens
  unchanged — tabs, Navigator rows, Patching rows, the drawing. A second finger, more movement, a drag lifting first or
  the browser's own long-press menu (Android) cancels it; once a menu opened, the lift's click is swallowed. One action
  on the shell (`ui/longPress.ts`: the `LongPress` timer + the `longPress` action; fake-timer test). The drawing: a
  touch / pen press given to the tool sends it no moves until it has gone further than 8 px (so a held finger never
  drags or starts a box first); the long press drops that press (rolled back) and, with Select on a thing, selects it
  (if it wasn't) and opens its menu — the right-click's code, now one `menuAt` (`ui/ViewCanvas.svelte`). Touch screens
  (`hover: none`): no iOS callout / word selection on a long press (tables included; fields keep theirs), and tabs
  aren't draggable (the system's drag lift fired on the same press). Help. Not tried on a device.
- **Q52b** ⋮ on a tab opens its menu under it (the right-click's: close others / to the right, other pane, To sheet):
  shown on the active tab, and on every tab of a touch screen (`@media (hover: none)`) (`ui/TabStrip.svelte`); Help.
- **Q52c** a finger drags the resize handles and the floating tables: `touch-action: none` on the panel-edge handles
  (`ui/ResizeHandle.svelte`) and the floating tables' bar and corner (`ui/TablesPanel.svelte`; the window title, its
  corner and the split bar had it). On a touch screen (`any-pointer: coarse`) the 5 px edge handles and split bar are
  grabbed by a wider invisible strip (~15 px, mostly towards their own panel — a dock clips what sticks out), the
  corners are 16 px, a window's title bar 30 px with 24 px buttons. Every one of these drags is pointer events and now
  ends on `pointercancel` too (a palm / system gesture left the tables' drag listening) (`ui/CadWindow.svelte`,
  `ui/SplitBar.svelte`); Help. Not tried on a device.
- **Q48** estimated cables before allocation: every outlet port with no link yet gets an estimated cable to its server
  room, routed as a link (same graph, `outletTap`: its tier, its room's runs, 10 m reach), ending at the room's patch
  frames (every placed rack when none is marked; the room outline's centre when none is placed) — one Dijkstra per room
  from all its frames' `rackTaps`, shared by its estimates. The room: the port's own, else another port's of the outlet,
  else its zone's most common, else the level's only server room, else the one room the nearest run serves. Links and
  estimates come from ONE routing pass over one graph (`routeAll` in `domain/estimates.ts`; `routeLinksOn`, `bestEnd`
  shared from `domain/routing.ts`); `project.routing` holds both through drags. Fill counts them as `SegFill.est`
  (Properties › Fill "12 × cat6a (4 estimated)" / "12 cables · 4 estimated", the fill section on paper, the plan's
  bands "35% · 4 est."); Display ▾ › Routes draws a room's estimate-only segments dashed and lighter. A port's estimate
  goes when it is linked. Usage N/A and unplaced outlets get none. Perf: 1000 outlets × 2 ports over 800 segments,
  2000 estimates ≈ 0.1 s on top of a 30 ms graph (2000 links over the same graph: 0.18 s). Help; tests.
- **Q28** the project BOM counts what is to be bought: cables already installed and cords already in place (or only
  moved / taken out) are left out — only cords to add or replace count (Dave 2026-10-12; the dialog says so;
  `domain/reports.ts` `bom`, `cableMetres(…, only)`). Also: a multi-core cable whose cores end on two panels names
  each panel with its own ports in the cable schedule (it named the first core's panel with every core's ports;
  `domain/cableSchedule.ts`); Ctrl+Shift+V / Ctrl-copy of notes drawn on an elevation centre on their plan places and
  move along the plane and up, as Move does (their (u, z) points were taken as plan points; `domain/clipboard.ts`).
  Left: a schedule viewport continued from a fixed "From cord" still drops / repeats a cord when the one before it
  grows or shrinks (needs "continue from viewport …" instead of a number). Tests.
- **Q42** the title block fills in from the Project details (the projects page's dialog, handed to the shell by the
  route as `details`; `project.sheetBase` = name + template + details for every sheet render, PDF, issue and new
  viewport): a new Client auto field (the client), Site falls back on the address, the company block on the details'
  company when the template has none, and a blank Drawn shows the author (a name / email as initials, initials as
  typed), else who issued the latest revision (`domain/titleBlock.ts` `withDetails` / `drawnFallback`,
  `views/sheet.ts`; logos' grips get the same block). Logos stay the template's. The Project details menu / settings
  tooltips say what the block takes. Drawn / Checked / Approved can be set on several sheets at once (SheetMultiProps);
  Drawn's placeholder shows the fallback. An issued sheet with a blank Drawn shows as changed once the details have an
  author (it now prints one). Help; test.
- **Q46** the rack BOM for the rooms ticked, on any levels: the BOM dialog lists the rooms with racks grouped by level
  (all ticked at first; a level's box ticks its rooms) when there is more than one; the rack BOM, its row-by-row
  blocks and the row accessories follow, and the Excel sheet names the rooms (`domain/rackBom.ts` `rackBom(…, { rooms })`
  / `bomRooms`, `render/exports.ts` `exportBom`, `ui/BomDialog.svelte`). A rack with no catalogue product is listed by
  its maker / model (SKU = the model, "maker model (kind size)"), as the Racks tool did — racks of the same size but
  another model are no longer one line; devices with no catalogue id the same in the project BOM. Not the legacy Row /
  Consolidated / Notice sheets. Help; tests.
- **Q49** the grid step beside SNAP is typed (any positive mm, to 0.01) with the usual steps offered in a list
  (1 … 1000, plus 44.45 = 1U and 600 = a floor tile), as the cord length field is; a bad entry is refused and the box
  shows the step again. Snapping lands on the line without float dust (3 × 44.45 = 133.35), and the drawn grid counts
  lines by number (`editor/snap.ts` `onGrid` / `gridStepOf` / `GRID_STEPS`, `editor/tools.ts` `snapPt`,
  `ui/canvasInfo.ts` `gridLines`, `ui/StatusBar.svelte`; a bad stored step loads as 10). Help; test.
- **Q51** the riser view's floor range left the per-person Display ▾ menu: it is in the riser view's Properties with
  nothing selected (Riser view › Floors lowest – top, "for everyone on this project (sheets too)"; the undo step says
  "(for everyone)"); Display keeps Hide empty floors (the view's own) and a line saying where the floors went
  (`ui/ViewBasics.svelte`, `views/riser.ts` `withRiserEnd`, `ui/ViewStrip.svelte`). Planning · Surveying says "for
  everyone" beside the toggle, in its titles and its undo step (`ui/CordMode.svelte`). Help; test.
- **Q7 follow-up (Dave):** on a plan, runs at different heights are not joined — dropping a node on another run's
  node at another height says "join them in an elevation view"; one that would have been absorbed just moves along
  (`domain/pathEdit.ts` `joinHeightProblem`, `editor/pathSel.ts`, `editor/dragParts.ts`, `editor/selectTool.ts`); test; Help.
- **Q48 follow-up (Dave 2026-10-12): the selected outlet's estimated route, estimates in the BOM and the cable schedule.**
  Selecting an outlet whose server room is SET on a port (`Estimate.roomSet` in `domain/estimates.ts` — not one guessed
  from the zone / level / nearest run) draws its estimated routes with the selection highlight, finer green dashes
  (`routesOf` in `views/overlays.ts`, class `trace-route-est` in `ui/Prims.svelte`). The BOM counts estimates
  (`bom(ix, catalog, routes, estimates)`, `estimateMetres`): per cable type, a line "... - estimated, not allocated yet
  (incl. N% waste)" in metres (+ a box note for copper) and a "no route" count; they are always to buy (a linked port's
  estimate is gone, an installed link is still left out). The cable schedule (`cableSchedule(..., estimates)`) adds
  `estimated` rows after the real ones (from = the room, to = the outlet port, italic, note "estimated"); `scheduleTotals`
  stays the real cables', `estimatedTotals` is the estimated ones, shown beside it in the dialog and in the Excel
  (Status column, a totals line). Help; tests (`domain/estimates.test.ts`).
- **Q43** every sheet PDF honours File › Export › Monochrome PDFs: the sheet's Properties “PDF” button and the Sheets tab's
  PDF button pass `ws.monoPdf` to `downloadSheetsPdf` as File › PDF always did (`ui/SheetProps.svelte`, `ui/SheetsTab.svelte`).
- **Q53** dark mode: the fixed light blues / zinc greys in the menus, context menu, tab strip, tool / status / table bars,
  chips, Help's featured card and the view strip became `--cad-*` tokens; new tokens `--cad-sel-line`, `--cad-sel-text`,
  `--cad-feature` (light + Kestrel Dark in `ui/CadShell.svelte`); the shell's top bars use `--cad-panel` / `--cad-line`.
  Solid blue accents (primary buttons, focus rings) and the drawing canvas keep their colors.
- **Q47** frame label sheets and panel labels for a whole level or the whole project: File › Export › “Frame label sheets — this level / all levels (Excel)” (a sheet per frame, every server room) and “Panel labels — this level / all levels (Excel)” (then the Mark printed offer) (`render/exports.ts` `roomsWithRacks`, `panelLabelRows(ix, room, level)`, `exportPanelLabels(…, room, level)`; `ui/Exports.svelte` `frameSheets` / `panelLabels`; `ui/cadMenus.ts`). The per-room ⋯ items in the Racks window stay. Help; test.
- **Q45** Ctrl+K inside the cad page is only cad’s Find: the app-wide palette skips it (a Ctrl+K cad already handled, or any key press on the `/projects/<pid>/cad` route). A level or sheet picked in that palette on the cad page is sent to the open CadShell as a `cad-open` window event (the URL query) and opened with `ws.openInTab`, not by changing the URL only (`lib/palette/CommandPalette.svelte`, `ui/CadShell.svelte` `openFromPalette`). Help. No unit test (UI event wiring; the URL decoding is `readViewState`, already tested).
- **Q41** sheet notes follow the layer rules: paper notes and legends go through `applyLayers` with your eye (`SheetOpts.hidden`), notes tied to a viewport also with its ❄ freeze, and a note whose color is By layer takes its layer’s color — in `sheetDisplayList` / `notePrims` (`views/sheet.ts`), so the PDF (freeze only) and the screen agree with plan items. A locked layer’s sheet items are no longer picked either (`ui/ViewCanvas.svelte`). Help; tests (`views/sheet.test.ts`).
- **Q44** notes, leaders and dimensions drawn on a sheet snap (OSNAP) to what the viewport under the pointer shows: the paper point is looked up in the viewport’s view (a plan: outlets, racks, shape centres, run nodes; other views: the drawn vertices) and the snap comes back through `toPaper`; outside a viewport, or with Alt / OSNAP off, the 0.5 mm paper rounding as before (`editor/noteTool.ts` `snapThroughViewport` / `notePoint`, `ToolCtx.sheetSnap` supplied by `ui/ViewCanvas.svelte`). Help; test (`editor/notes.test.ts`).
- **Q58** `naturalCompare` uses one cached `Intl.Collator` (`domain/labels.ts`) instead of `localeCompare` with options, which
  builds a collator per call: sorting 6,600 labels 210 ms -> 9 ms (same order; the existing natural-sort test covers it).
- **Q57** the port map builds the link + cord adjacency once per call (`circuitEdges` in `domain/cords.ts`, passed to
  `traceCircuit`) and indexes the first live cord per port, instead of rebuilding both for every port: 288 ports /
  6,624 links / 2,000 cords 842 ms -> 6 ms, rows byte-identical to before. Test with a generated project
  (`bench/gen.ts` `bigPortProject`).
- **Q56** routing no longer scans everything per node / outlet (`domain/routing.ts`): `buildGraph` merges nodes through a
  hash of JOIN_MM cells and finds a segment's tee candidates through a plan grid of the nodes (candidates taken in node
  order, so the pieces are the same); `outletTap` searches a plan grid of the joinable segments (not risers / stubs) ring by
  ring, lowest segment on a tie; `rackTaps` walks the level's joinable segments only; `routeLinksOn` shares an outlet's tap
  between its ports; `fills` is held during a drag like the routes (`app/project.svelte.ts`). Generated project, 1,000
  outlets / 700 links / 4,260 segments: `buildGraph` 579 -> 43 ms, 1,000 `outletTap`s 1,015 -> 14 ms, `routeAll` (links +
  1,300 estimates) 2,563 -> 92 ms; at 840 segments 305 -> 44 ms. Routes, estimates and fills are byte-identical
  (`bench/genRoute.ts`; `domain/routingSpeed.test.ts` compares the graph and every outlet's tap with the plain scans).
  Left: the Dijkstra per rack / panel height, and re-routing only the changed levels.
- **Q59** side panels no longer rebuild on each drag frame: `project.dataRev` / `project.dataIndex` change on final
  changes only (`settles(change, busy)` in `store/store.ts`: a commit, undo, remote edit, or a rollback after its gesture
  ended — a 60-frame drag settles once). The Navigator tree and finds, the Layers panel counts, the Tables bar count,
  the Sheets tab lists and `floorplanPending` read them. `ProjectIndex.ofType(type)` is a typed list built with the
  index; 21 of the `[...byId.values()].filter(type)` spreads (Issues / Packages / Sheets lists, rack rows, navTree, …)
  use it (copy before sorting). Measured on 12,400 entities: a sheets list 0.13 ms -> 0.01 ms; the real saving is the
  panels not re-running per frame (a drag over a 1,000-outlet project re-ran navTree, layer counts and every list
  each frame). Left: layer counts / tables that show live drag values still read `index`; the other
  `byId.values()` loops (legend, layers, plan) are single passes over everything on purpose.
- **Q60** every Firestore listener has an error callback (a permission error stops a listener for good). `Backend.subscribe`
  takes `onError`; `Sync` reports it (`onListenError(e, scopes)`, and `watch`'s third argument) and `CadProject` shows
  "Lost the live connection to …" in `project.error` and ends Loading (`loaded` / `loadedScopes` are set, so there is no
  spinner for ever). The global block / template / category docs, `RestoreNotices` (a restore elsewhere would not pause
  this tab), the project file lists (`watchProjectPdfs` / `watchProjectImages` take `onError`: FloorsPanel,
  ImagePickDialog, LogoPicker), the PDF watcher (`problems['watch:<file>']`), BackupsDialog and OpenProjectDialog
  (`db.subscribeMany` got an optional `onError`) do the same. `MemoryBackend` gets `failListeners()` and now sends
  "removed" to the old scope when a doc moves (so R89's guard is exercised). Tests: `persist/sync.test.ts`,
  `persist/firestore.test.ts`, `app/restoreNotice.test.ts` (fake timers).
- **Q61** issuing starts from the sheets as they are now: `issuePackage` re-reads them (`freshSheets`; a sheet deleted
  meanwhile stops it), refuses a revision a recorded issue already froze before the backup or any write, and
  `saveFrozen` checks that inside a transaction (a copy left by a run that was never recorded is replaced, so a retry
  can reuse the code); the sheets' revisions are checked once more just before the issue is recorded. The Issue panel's
  preview re-reads the sheets and ignores a stale run (`app/runToken.ts`). `ui/SheetsTab.svelte` is unchanged: its
  selection copy is only the list of ids, everything is re-read at issue time. Test: `app/issue.test.ts`.
- **Q62** tests for the risky code: `app/backups.test.ts` (settle / timeouts, stored backup round trip, incomplete and
  garbled backups, rename / delete, restore as one undo step, owner and other-project refusals, gzip file),
  `persist/sync.test.ts` (scope moves in both listener orders, pending writes, failed writes),
  `app/restoreNotice.test.ts`, `app/clipboardFlow.test.ts` (copy / cut / paste through the real store, the
  Ctrl+Shift+V window), `render/patchRoundTrip.test.ts` (patch schedule export -> filled Cord ID column -> import, one
  sheet and a sheet per room), `render/pdf.test.ts` (clip save / restore balance). No bug found in the code under test.
- **Q63** imports moved out of test bodies to the top of the file: overlap, drawing, editor, style, transmittalPage,
  exports (exceljs), and elevation, plan, pictureUploads. None of those files uses `vi.mock`, so there is no ordering
  constraint.

## Backlog P3 fixes

- **Q21** a `{DATE}` field no longer marks issued sheets "Changed since" at midnight: `frozenNow` passes the sheet's last issue date as `fieldDate` (`views/sheet.ts`), so the fingerprint is stable and the issue freezes the issue date. Test in `views/sheet.test.ts`.
- **Q22** Renumber with a number group the first label doesn't have (e.g. group 2 of "R01") no longer copies that label onto every item: `renumberEntities` leaves such a type out. Test in `domain/renumber.test.ts`.
- **Q23** the Frames workbook (`render/frameSheets.ts`) used its own `ceil(n / 24)` rows (a 72-port 1U panel wrote ports 49-72 over the next U); it now takes `portGrid` / `portAt` like the rack view, and a rack's sheet is as wide as its widest panel (`FrameRack.cols`). `cordLength` already used them (Q3). Test in `render/frameSheets.test.ts`.
- **Q24** DXF layer names: `,` joins the characters `ownName` replaces (`render/dxf.ts`). Test in `render/dxf.test.ts`.
- **Q25** a pasted / Ctrl-copied panel no longer carries the original's `labelsPrintedAt` / `printedLabels` (it said its labels changed since printing), and its port reservations get new ids (`fresh()` in `domain/clipboard.ts`, used by both paste paths). Test in `domain/clipboard.test.ts`.
- **Q26** `fileSafe` (`render/download.ts`) kept `\w` only, so a Japanese project name became underscores in every download name; it now keeps letters and digits of any script (`/[^\p{L}\p{N}._-]+/gu`). Test in `render/download.test.ts`.
- **Q27** the fill picture counted cables past its 400 cap as "don’t fit". `packCables` now returns `capped` (never tried) apart from `dropped` (tried, no room); the sheet legend and Properties › Fill say "first N drawn". Test in `domain/fill.test.ts`.
- **Q40** (part) an arrow key mid-drag is ignored (`shellKeys.ts`); a cleared run Width / Height / node Z, box Height or viewport X / Y / size keeps the value; a refused checkbox snaps back; `PropGroup` re-reads its fold state when its key changes; renumbering a floor widens the APPLIED range, not the unapplied one; a backwards floor range is swapped on Apply.
- **Q50** (part) a second click on the armed port cancels the cord; the next outlet follows edits to the last; the title block Location uses the sheet’s `placeId` (riser viewports: "All floors"); 1:15 and 1:150 scales; Titlebar links CAD.
- **Q54** Help: the layer note, the "names never typed in the status bar" line and the Sheets empty state match the UI.
- **Q55** (part) Window menu ticks follow the view (and say why a click does nothing); Help › an unusable tool says so; the layer toast only when the shapes left the chip’s layer; "Fill", "Sheets table" labels; Archive / Outlet schedule say they finished.
- **Q68** `withDetails` fills a missing title-block logo from the Project details (`logoUrl`, `companyLogoUrl` and heights). Test in `domain/titleBlock.test.ts`.
- **Q69** `followSection(…, moved)`: a note mirrored with its section is re-described on the section’s new frame. Test in `editor/moveTool.test.ts`.
- **Q72** the Racks window’s room ⋯ menu has panel labels / frame sheets for this level and all levels.
- **Q67** a patch-schedule viewport continued from a typed "From cord" number dropped or repeated a cord when the viewport before it changed size. New `after` on the schedule spec (Properties › Continue from): the viewport starts where the previous one stops (`scheduleStart` in `views/sheet.ts`, `patchScheduleLayout().next`). A start past the end now shows an empty table. Test in `views/sheet.test.ts`; Help updated.
- **Q70** splitting a wall (`insertNode`, also used by `splitRunsAt`) left every opening on the first half, whatever its position; openings past the cut now move to the new second segment with `at` measured from its start. Test in `domain/pathEdit.test.ts`.
- **Q71** DXF export skipped images silently (only a count). DXF can only reference an image file, and a floorplan here is a rendered page, so each image is now kept as a closed frame and a note on layer `A-IMAGE` (counted in `skippedImages`; the Exports message says the picture isn’t included). No real IMAGE entity: it would need a file. Test in `render/render.test.ts`.
- **Q64** one cable type lookup: `cableTypeOf` / `cableTypeLabel` / `cableMedia` in `domain/cableTypes.ts` replace the
  ten hand-written ones (a type is found by id, then label; the fibre guess is one regex; an unlisted fibre-ish name
  gets the fibre Ø in `cableOd`). `render/styleDrift.test.ts` checks that every class `ui/Prims.svelte` styles is in
  `render/pdf.ts`'s table (or listed screen-only) and that the colors agree; it found `riser-break` missing on paper
  (added). `room-line`, `run-label`, `device-pdu` and `fill-cable` are marker classes with no look, on screen or paper.
  propsKit `put` / `num` replace the local copies in CordProps, NoteProps, OutletProps, RowProps, SheetsTab (the
  other `num`s round or clamp, so they stay).
- **Q65** `fromDoc` returns null with a console warning for a doc without a string id / type or a numeric rev, and
  `Sync` skips it; `scopeOf` throws for an ownerless shape, `Sync` reports it through `onError` and saves the rest.
  Tests in `persist/sync.test.ts`.
- **Q66** `Prim` and its companions moved to `domain/prim.ts` (`views/display.ts` re-exports them), so `domain/fields`
  / `issue` no longer import `views/`; `inPolygon` / `primDist` / `segDist` moved to `views/primGeom.ts` (`editor/pick`
  re-exports), so `views/portTip` and `riser` don't import `editor/`; the upload router moved to
  `$lib/files/uploadRouter.ts` (the route file re-exports it). Runtime cycles gone (checked with a small import-graph
  script: `fields <-> blocks` via `DATA_FIELDS` / `isDataField` now in `blocks`, `plan -> elevation -> section -> plan`
  via the new `views/sectionMarks.ts`, `legacy <-> legacyOutlets` via `domain/floors`). Left: four type-only cycles
  (portGroups/project, restoreNotice/project, pdf/panelSheets/paper/sheet, ViewStrip/ViewCanvas/shellKeys) and
  `domain/navTree -> views/space`, `views/overlays -> editor/tools` (type or unlisted). Test-only exports are marked
  "(Used by tests only.)"; `dev/dryRun.listProjects` and the stale DockColumn comment removed; `IMPORTED_AT` is
  computed per import run. Not done: the as-issued floorplan cache (`app/pdf.svelte.ts`, R39 part).

## Features (Dave 2026-10-13)

- **Uploads in cad** — File › Uploads… opens `ui/UploadsDialog.svelte` (a large CadDialog) hosting the Uploads tool. The tool moved to `$lib/uploads/` (`Uploads.svelte`, `PdfViewer.svelte`, `DimensionLine`, `provider.ts`, `uploader.ts`, new `deleteFile.ts`), with `embedded` (no title bar, fills its box) and `onopen` (Uploads) props; the `/uploads` route and its `[fileid]` page use the same components, and `uploads/provider.ts` / `uploader.ts` re-export so the older tools keep working. A file opens in the viewer inside the dialog; Esc steps back (viewer tool, file list, close). Same Firestore `files/{id}` docs, so edits show in cad at once.
- **ACAD / EOS input mode** — a status-bar button (`ws.inputMode`, kept per browser in localStorage `cad-input-mode`; no key). ACAD = today. EOS = the wheel pans (Shift+wheel sideways; Ctrl / Alt / Meta or right-button + wheel zooms), and line / trunk / conduit / wall / dimension draw on a press-drag. The logic is in two pure files: `editor/inputMode.ts` (`wheelAction`) and `editor/pressDrag.ts` (`PressDrag` / `PressDragInput`: press = first click, release after a drag = second click; mid-run the release adds the segment, a plain click is delivered at the release); `ui/ViewCanvas.svelte` only routes events to them, the tools are unchanged. Rectangle / ellipse / box / image already draw on a press-drag in `ShapeTool`; an arc stays three clicks. Tests: `editor/inputMode.test.ts`.

## Features (Dave 2026-10-13)

- **Text to and from office apps:** Ctrl+V of plain text copied in another app pastes a text shape at the pointer (`app/clipboardEvents.ts` `note` hook to `ViewCanvas.pasteNote` to `pasteTextNote` in `editor/noteTool.ts`; the Text tool's 2.5 mm size and the current layer; the middle of the view when the pointer is elsewhere; Edit > Paste too). Ctrl+C of cad items puts their words on the clipboard (`readableClip` in `domain/pasteText.ts`), one per line; cad's own JSON waits in localStorage (`cad.clip`, shared by tabs) and is used on paste only while the clipboard still holds exactly those words.
- **Pasted tables:** tab-separated cells (Excel) and an HTML `<table>` (Word, a web page) become a markdown table note (`pastedNote`, `parseTsv`, `htmlTable`).
- **Markdown notes:** a text with the `markdown` flag (Properties > Markdown) is laid out by `views/markdown.ts` `layoutMarkdown` (pure: headings, bullets, numbered lists, bold / italic, pipe tables with alignment, word-wrapped to the box width) and becomes ordinary text and line prims (`markdownPrims`, called from `views/plan.ts`), so the screen, PDF (bold / italic via `note-b` / `note-i`) and DXF (TEXT per run, polylines for table lines) need no new code paths.
- Not done: italic is not drawn in DXF; run widths are estimated (0.6 em Latin, 0.66 bold, 1 em CJK) as everywhere else, so bold runs can sit a little off in a PDF; a markdown note that rotates is laid out unrotated and turned about its point.

## Features (Dave 2026-10-13)

- **Layer presets, groups, multi-select** (`ui/LayersPanel.svelte`, `app/layerPrefs.svelte.ts`, `domain/layers.ts`):
  - Presets: a "Presets…" menu above the list; **+** saves the current eye states under a name, picking one shows exactly that set, the bin deletes it. Kept per user and project in this browser with the other layer settings (`LayerPrefs.presets`).
  - Groups: `Layer.group` (a heading) or, failing that, the name's prefix before a "/" ("IDF1/Outlets"); `groupLayers` lists the ungrouped first, then each group, drawing order kept. A group heading has an eye that hides or shows all its layers.
  - Multi-select: Ctrl-click / Shift-click names pick several; the eye, lock, color, line type and lineweight then change every picked layer, the project-level ones in ONE transaction (one undo step). **Group…** files the picked layers under a heading ("-" ungroups). Pure helpers `targetIds` / `togglePick` / `rangePick` / `withPreset`, tested in `views/layers.test.ts`.
- **Shape style** (`domain/shapeDefaults.ts`, Project settings › Drawing style, `render/dxf.ts`):
  - `ProjectSettings.shapeStyle` (color, line type, lineweight; stored whole, '' / 0 = by kind). New lines, boxes, circles, ellipses, polygons and arcs start with it (`styleProp` in `shapeTool` / `pathTool`), except for what the target layer sets itself.
  - DXF lineweights: group 370 in hundredths of a mm, the nearest standard weight, written by wrapping the entity's `dxfy` (the writer has no option); `dxfLineweight` exported.
  - DXF hatch: a region's fill (`shape-fill`) is a solid HATCH of its color (polygon boundary; a circle as an arc edge). Tests in `render/dxf.test.ts`, `domain/shapeDefaults.test.ts`.
- **Floor-tile grid** (`domain/tiles.ts`): `Shape.tiles { mm, dx, dy }` on a box (rect). Properties › Box › Floor tiles (default 600 mm; the size is read with `gridStepOf`, like the status bar's grid step). Lines every `mm` from the box's top-left corner in its own turned frame, shifted by X / Y; drawn by `views/plan.ts` as `tile-line` prims (screen, PDF, DXF layer `A-FLOR-TILE`). More than 300 lines across one axis is left off (Properties says so). Test in `domain/tiles.test.ts`.

## Features (Dave 2026-10-13)

- **Viewport handling (1)-(3)** several viewports can be picked on a sheet: Ctrl-click a frame (on a picked one drops it), or drag a window on the empty paper (left to right: enclosed; right to left: touched). `ws.viewportId` stays the first, `ws.vpMore` holds the rest (`pickedViewports`). A drag, the arrow keys and Delete act on all of them (`deleteViewports`, one undo step, "Undo brings it back"). Properties shows a "Viewports picked" note. Ctrl-drag leaves the originals and moves copies (with their views and tied notes); the copies are picked.
- **Viewport handling (2)** copy / cut / paste / duplicate: a clip can carry `viewports` (+ `levelNames`) and the notes tied to them, which stay tied (`makeViewportClip`, `pasteClip` in `domain/clipboard.ts`, `app/clipboardEvents.ts`). Pasted onto another sheet or into another project: the same level, else the level of the same name, else the first; a room, section, rack or run the project lacks makes the viewport show a plan (the paste says so: Fit in Properties). The same sheet without a position (Ctrl+V, Ctrl+D) puts the copy 10 mm to one side. Ctrl+D (`duplicateViewports`, `KEYS.duplicate`) duplicates the picked viewports only. Tests in `editor/sheet.test.ts`.
- **Viewport handling (7)** touch: two fingers inside the viewport being edited (or the picked one with Pan / zoom content on) pan and scale its view instead of the camera (`TouchNav` host `content`, `pinchContent` / `settleScale` in `editor/touch.ts`, `contentGesture` in `ViewCanvas`). One undo step; the scale settles on the nearest standard 1:N within 10 percent. Tests in `editor/touch.test.ts`.
- **Viewport handling (8)** `Viewport.number` (Properties › View › Number) is drawn as a small circle above the window's top-left (`views/sheet.ts`, class `viewport-no`, no new style needed). The sheet's Properties (and a picked viewport's, and several picked) list the viewports with number, label or view, and scale: a click picks, Ctrl-click adds, "Open" opens its view in a tab; "Open source view" is also in the viewport's Properties (the chip's "Open view" already was). Test in `views/sheet.test.ts`.
- **Blocks: front drawings** the rest of eos-d9's work (`faceFor` / `frontOf` / `Block.front`, 250bfadb: a block's front is drawn in elevations, sections and elevation viewports) was authoring: shapes drawn in an elevation or section now become a block's front. `frontProblem` / `frontFromShapes` / `frontBlock` (`domain/blocks.ts`): real mm, y down, centred on the middle of the shapes (a text's size x the plot scale); a NEW block gets a plain box of the front's width as its plan symbol, or one of your own blocks takes the front (`CadProject.makeBlockFront`, `ui/MakeBlock.svelte`: Make block... and "Add as the front of..."); one insert replaces the shapes in that elevation at the same place and height. The Insert tool now sets `inElevations` on a plan insert of any block that HAS a front (a change from 2026-10-10's "plan symbol only", for blocks with a front only; untick in Properties). The Blocks window tags such blocks "front". Tests in `domain/blockFront.test.ts`, `editor/insertTool.test.ts`.
- **Linked symbols** `link?: InsertLink` (`{ kind: 'sheet', sheetId } | { kind: 'url', url }`, `domain/links.ts`) on the insert's geometry, so each marker has its own target. Properties › Link (`ui/InsertProps.svelte`) picks Nothing / A sheet / A web page (`linkUrl` accepts http, https and mailto only, adds https:// to a bare host; scripts never open). The Select tool's hover shows a badge "↗ target · double-click opens" (screen only, class `draft-label`); a double-click calls `ToolCtx.openLink` -> `Workspace.openLink`: a sheet in a tab, a URL via `window.open(url, '_blank', 'noopener,noreferrer')`. Outlets (not inserts) take no link. Tests in `domain/links.test.ts`, `editor/linkedSymbols.test.ts`.

## Decisions (Dave 2026-10-13)

- **Q73 Faceplates show only on the view they were drawn on** the Insert tool no longer sets `inElevations` for a plan insert of a block with a front: the 2026-10-10 rule stands (a block placed on a plan shows only on the plan, one placed in an elevation only there; the tick in Properties still shows a plan insert's front in elevations). Test in `editor/insertTool.test.ts`.
- **Q74 Make block from shapes on a sheet** Properties › Make block now takes sheet shapes (`blockable` allows `sheetId`; `blockProblem` refuses mixing places). Shapes tied to a viewport (`vpId`) are in that view’s mm: the block is in model mm, the insert keeps `vpId` and the layer. Untied paper shapes (paper mm) are scaled × the sheet’s FIRST viewport scale (`paperBlockScale`), the insert on paper gets `scale: 1/N` (same printed size); no viewport = paper size. `ws.say` tells which. Tests in `domain/blocks.test.ts`.
- **Q75 An image box always keeps the picture's proportions** `Geometry` image gets `ratio` (width ÷ height), measured when the picture is picked or pasted (`CadShell.measurePick` → `ws.imagePick.ratio`; a PDF page as rendered). The Image tool fits the dragged box to it (`shapeGeom`), and the corner / edge grips (`dragRegionGrip`) keep it: a corner takes the larger pull, an edge moves the other side with it about the edge's middle. An older image without `ratio` keeps its box's proportions. There are no W / H fields for images. Tests in `editor/shapeGrips.test.ts`, `editor/shapeTool.test.ts`.
- **Q76 Finish / Cancel for a path on touch** `Workspace.touchInput` (the last press was a finger, set in `ViewCanvas.onDown`) and `Workspace.pathPending` (points in the run being drawn, kept by the active canvas) show Finish and Cancel chips in `CadShell`'s options row (`ViewCanvas.finishPath` / `cancelPath`, the same as Enter / Esc). A double-tap already finished a path (`PathTool.down` on `count >= 2`); `ClickCounter.press` now takes a tolerance and a touch press gets 24 px (a finger wobbles more than 5). Tests in `ui/canvasInfo.test.ts`.
- **Q77 Purge removed asks before purging** the Patch list's ⋯ › Purge removed (N) now asks (`ws.ask2`, `PatchList.purgeRemoved`): it names how many cords go and that the installer's list can't bring them back; yes runs the same `runCordAction(... 'installed')`, ONE undo step. The Installed action on a selection that includes cords marked for removal is unchanged (it says what went, Undo brings them back).

## Layers per viewport and per sheet (Dave 2026-10-13)

- **A viewport's layers are its own** `viewportContent` and tied notes hide only `Viewport.frozen` — the user's eye
  (`ws.layers.hidden`) no longer reaches a viewport, so the screen shows what prints (Dave: section lines printed with the
  Sections layer turned off). With a viewport picked or edited, the Layers panel's eyes (and a group's eye, several picked
  layers, presets) set that viewport's list (Shift: every viewport on the sheet); the separate ❄ button is gone. Drawing
  inside a viewport is refused on a layer hidden in that viewport (`toolBlock` gets the viewport's list).
- **A sheet's own paper** `Sheet.frozen` hides layers among the sheet's paper notes and legends; with a sheet in the
  active pane (`ws.activeSheet`, set by CadShell) and no viewport picked, the eyes are the sheet's. `SheetOpts.hidden` is
  gone: nothing on a sheet follows a per-user setting, so the PDF, an issue and the screen draw the same list.
- **New layers start hidden in existing viewports** as before for + Layer and import; now also for a layer that comes
  with a paste from another project (`pasteClip` → `freezeInExisting`).
- **Several viewports picked (Dave 2026-10-14, options 1 + 2)** the panel works on every picked viewport
  (`ws.pickedViewports`): one eye per layer, `eyeState` = on / off / mixed (a faint eye; a click shows it in all), and
  presets / group eyes / multi-picked layers set them all. Layers none of them draws on (`viewportLayers`: the view's
  content with nothing hidden, plus its tied notes, on `dataIndex`) fold under "Not in these views (N)", still settable.

## One drawing per 2D block (Dave 2026-10-14)

- A 2D block is ONE drawing, drawn the same in every view (an insert still shows only in the view it was placed in):
  `Block.front`, `frontOf`, `BlockFace`, `faceFor`, `blockFace` are gone; `shapePrims`, `blockPreview`, the Insert ghost,
  `explodeInsert` and `annotativeIn` take no face. The faceplates keep only the 70 × 115 mm plate (real mm, not
  annotative), so a faceplate on a plan is the same plate as in an elevation.
- Make block on shapes drawn in an elevation: an ordinary block of those shapes (`elevationProblem` /
  `elevationShapes` / `elevationBlock`, through `makeBlock`), its insert in that elevation; "Add as the front of…" is
  gone. A stored block that still has a `front` reads as that drawing (`oneDrawing`, in `project.blocks`).

## 3D blocks (Dave 2026-10-14)

- A block with a box (a region with `extent`) is 3D (`is3d`): Make block on boxes files it under Furniture, its heights
  from the lowest one's bottom (the insert keeps that Z). Its inserts are model: `placed3d` turns one into shapes on its
  level (moved, turned, lifted by the insert's Z, `{TAG}`s filled, all carrying the insert's id), and the plan and the
  elevation / section generators draw those as any box / line — in every view, whatever `frame` / `inElevations` say.
- What each view shows (Dave's rule): boxes always; lines unless they collapse to a point there (a line straight up on a
  plan, one running away from the viewer in an elevation); labels (`{TAG}` texts, `isLabel`) everywhere, in an elevation
  centred over the block's top; flat regions and plain texts only on plans (edge-on elsewhere).
- Default Z 0; drag it in an elevation to lift it (`behaviours.ts` already moves an insert's z). Explode → the boxes
  where they stand.
- Dropped from the Blocks window into an elevation / section on a wall, a 3D block faces the viewer with its back on the
  wall's face (`backOf` = how far it reaches behind its point), not its middle; no `inElevations` / `frame` stored.
- Furniture defaults (Dave 2026-10-14): a 3D block's insert goes on the project layer "Furniture" (`ensureLayer`: made
  the first time, in the same undo step, frozen in existing viewports like any new layer) — from Make block when the
  boxes had no layer of their own, from the Insert tool when the current layer is Drawing.

## Markdown strikethrough and underline (Dave 2026-10-14)

- `~~text~~` strikes through, `__text__` underlines (it was a second bold; `**text**` is the only bold now); `\~`
  escapes. `emit` adds each struck / underlined stretch's line as a `rule` item (through at −0.3 × size, under at
  +0.15 × size, word to word, not past a trailing space), so the screen, PDF and DXF draw it as a table's rules.

## AutoCAD zoom keys (Dave 2026-10-14)

- Z, then E (extents = Home) · W (zoom window) · P (zoom previous); any other key, or 5 s, ends the wait
  (`shellKeys.ts` `zoomPending`). Window: two clicks in ACAD input, a press-drag in EOS (a click + click works there
  too), drawn as the marquee in screen px, the view fitted to it (`ViewCanvas.zoomWindow`); Esc drops it.
- Previous: `ZoomHistory` (editor/camera.ts) — each view's camera, recorded once a zoom or pan has paused 400 ms, up to
  20; P steps back through them.

## Default settings for a new project (walkthrough 2026-10-14)

- Found in the workflow walkthrough: a project made from scratch had no settings entity (only the legacy import made
  one), so Project settings › Usages, Cable types, Lengths & labels, Sheets (title block) and Files said "This project
  has no settings yet", and nothing could be added.
- `domain/settings.ts` `defaultSettings()` (Dave 2026-10-14): usages AP, TV, CCTV (and none); cable types CAT6A, CAT6,
  OS2, OM4; new outlets and cords CAT6A. "Apply floors" puts them in the same undo step when the project has none; a
  project already without them gets a "Start with the default settings" button in those tabs.
- The Outlet tool's first outlet has no usage (was "desk"); its tool bar Usage gains "(none)" ('' = as last).

## A guide for AI assistants (/cad/agent)

- Dave 2026-10-14: "is there sufficient instructions in Help for another LLM … to control the browser and develop
  project designs?" — no (Help is written for a person who sees the screen), so a plain-text page at `/cad/agent`
  (`src/routes/cad/agent/+server.ts`, outside the sign-in screen) serves `ui/agentGuide.ts`: ground rules (only the
  named project, ask before deleting / importing / issuing / downloading, never sign in), what a project holds, the
  screen, the URL scheme, typed coordinates (y down on a plan, height in an elevation), focus, how to check each step,
  nine recipes, gotchas — then the tools with their hints, the keys and every Help how-to, generated from the same
  lists as Help (`ui/toolGroups.ts`, split out of ToolStrip.svelte so a server route can import it), with a test that
  each one is listed. Help gains "Let an AI assistant work in cad for you". Tried recipe 2 (typed walls) in the Test
  Project as the page says it: it made the closed room; undone.

## Walkthrough bug fixes (2026-10-14)

- **W1 Stale confirm bars** (B42): the floorplan calibration's "… saved in the floorplan's file — Put it back" is now an
  offer, not a question (`ws.offerRevert`, `confirm.revert`): Enter never answers it and its button never takes the
  focus (AskBox and the Project settings copy — the copy's focused button used to take a later Enter as a click), the
  key hint says "Esc"; CadShell closes it when the dialog opens / closes, calibrating starts / ends, or the level,
  pane or view changes (`askCtx`). Help's calibration answer says so. Tried live in Workflow test (GF floorplan, used by no other project):
  Origin set → Enter left it (focus stayed on the dialog) → "Put it back" restored it; set again → closing the dialog
  closed the offer; the origin was then set back exactly (697, 554) and Esc dismissed that offer.
- **W2 Server room from the tool bar on other floors** (B53): the Outlet tool kept the tool bar's server room only
  when it was on the open level, though the bar lists every floor's rooms (with the floor) — so GF / L2 outlets with
  L1.20 set came out with none. Now the bar's server room always applies (while it exists); its zone still only on its
  own level (zones are per level). Built wider than the backlog's "when the level has no room of its own": the bar
  shows the room it will use, so what it shows is what you get. Test in `editor/editor.test.ts`.
- **W3 Mask / layer edits and "Changed since"** (B9b) — checked: the other way round from the backlog's worry. A sheet's
  frozen list keeps a floorplan as a file reference plus its placement, so origin / scale / crop already changed the
  print, but masks, hidden PDF layers and hidden markups (which change the printed picture) did NOT — an issued sheet
  stayed "Issued" after them. Now `domain/issue.ts` `sheetPrint` adds each floorplan's look (`pageLook`: masks of that
  page, hidden layers, hideMarkups) to the fingerprint, only when one is set — sheets whose floorplans have none keep
  their print, so nothing flips at deploy; a sheet issued earlier over a masked floorplan shows "Changed since" once.
  PdfCache keeps each page's look and bumps `lookRev` when one changes; the register's states re-check on it (a mask
  edit isn't a project edit). Issue and preview use the same print (`app/issue.ts` `printNow`). Tests in
  `domain/issue.test.ts`. Not covered: a re-uploaded file under the same id (its url) — that's W4.
- W1 follow-up (Dave 2026-10-14: "Undo and Keep"): the calibration offer's buttons are **Undo** (was "Put it back")
  and **Keep** (was "Cancel", which read as undoing it but kept the change); Esc = Keep. Help updated.

## Walkthrough P2 quick wins (2026-10-14)

- **W5 Paper-scale calibration** (B41): Project › Floors… › Plans & floorplans has a **1:** field after Origin ·
  Scale · Crop — type the title block's scale (100, 1:100) and Enter: mm per point straight from the PDF page
  (`editor/calibrateTool.ts` `paperScaleRecord`, 1:100 → 35.278). "100 A1" when the scale is for another paper size
  than the PDF page (× that paper ÷ the page, long sides; A0–A4). Saved like Scale (Uploads' record, with a round-metre
  dimension line across the page and `paper: '1:100'`), with the same "other projects" ask and Undo / Keep offer. The
  field's placeholder shows the scale the page is at now; another floor's floorplan is rendered first (its page size
  comes from the render: `PageCalibUsed.page`). Tested live in Workflow test on L2 (2F, A3): "Scaled: drawn at 1:100
  (an A3 page)", then Undo. Tests in `editor/calibrateTool.test.ts`; Help's calibration answer updated.
- **W9 First-run path** (B1, B2, B4; with Dave's todo "Upload from Settings › Plans & floorplans"):
  - Projects › New Project › Save opens the new project in cad (`Projects.svelte` `onsaved` → `goto`).
  - An empty project's page (ImportPanel) is now "Start {project}": the three steps and **Set up floors…** (Project
    settings on Floors & heights); the legacy import is folded under "Or bring in a project from the older tools".
  - Floors & heights: once floors are applied and no floor has a floorplan, **Next: add floorplans →** goes to Plans &
    floorplans.
  - Each floor's row there has **Upload…** (and takes a dropped PDF): `storeFile` to the project's Uploads (Settings ›
    Files' storage), then page 1 becomes that floor's floorplan; the status says to set 1: and Origin next.
  - Uploads lists this project's folder first and open even before it has a file ("No files in this project yet").
  - Help: new "Start a new project" answer. Seen live: the Upload buttons on Workflow test's rows. NOT tried live: a
    real upload (it would add a file to Uploads), the New Project → cad hop and the Start page (needs a new project).
- **W11 Outlet defaults by mount** (B44, B56), `editor/outletTool.ts`:
  - A new mount starts from its own height and tier: Ceiling = High with no Z (the level's clear height, `outletZ`),
    Wall = Settings › Usages "New wall outlets at" (`defaults.wallOutletMm`, 300), Floor / Box = Low at 0, Desk = as
    the last. The same mount as the last outlet keeps its Z and tier (sticky, as before). The tool bar still wins.
  - A label continues the last outlet of the SAME usage on the level (also its ports / cable type); a usage with none
    there yet starts "<usage> <floor>-001" (the first outlet on an empty level stays "<floor>-001").
  - `defaultOutletBlock`: a wall outlet is a wall plate whatever its tier (was "Outlet – ceiling" when High); a High
    floor-mount one (imported high ports) stays a ceiling symbol. Existing High wall outlets on Auto change symbol.
  - Tests in `editor/editor.test.ts`, `domain/blocks.test.ts`; Help: "A new outlet's label, height and tier".
- **W18 A better "New sheet from this view"** (B47), `views/sheet.ts` `viewViewport`: a PLAN zoomed out further than
  fits the drawing area at 1:100 (the whole floor on screen — it used to give 1:150 in a quarter of the paper) goes on
  at the plan's own 1:100 (`PLOT_SCALE`), the window filling the drawing area, centred on the level's floorplan crops
  (`floorplanBounds`; else the middle of the pane). Zoomed in (a server room), as before: the largest scale that
  fits, sized to it. `viewToSheet` passes the floorplan placements. Test in `domain/legend.test.ts`. Tried live in
  Workflow test on GF: S004 at 1:100 filling the A3 drawing area on the crop; Undo removed it.
- **W22 Fill views on sheets** (B55, B61):
  - Placement: a viewport put on a sheet ("Put on sheet…" / To sheet…, paper views and zoomed-in views) goes to the
    first free spot of the drawing area, row by row, 5 mm clear of the others (`views/sheet.ts` `freeSpot`); none free
    = the top-left as before.
  - Title: a riser segment (vertical, between two levels: `domain/fill.ts` `riserLevels`) is "Fill · Riser L1 ↕ GF"
    (with the run's label in front when it has one) on the paper, in the View list / tabs (`navTree`) and the status.
  - Segment: Properties › Fill shows (and puts on a sheet) the picked segment, else the riser segment, else the
    fullest. B61's "puts the fullest, not the one you picked" was the riser case: a picked segment was already used.
  - Tests in `views/fillSection.test.ts`, `domain/legend.test.ts`. Seen live: Workflow test's S003 now reads "Fill ·
    Riser L1 ↕ GF" / "Fill · Riser L2 ↕ L1".
- **Revision compare check** (Dave's todo): desk-checked, written up in `../plan/workflow-walkthrough.md` Round 5;
  it shaped W4 and W7.
- **W4 A new revision of a floorplan** (B8, B11):
  - Plans & floorplans: each floorplan row has **New revision…** (Upload the new PDF…, or a PDF already in Uploads).
  - `project.copyFileLook(old, new)`: each page's record (origin, scale, crop, masks), hidden PDF layers and
    hideMarkups go into the new file — only where the new file has none of its own (a page with a scale stays).
  - Then every floorplan of this project on the old file points at the new one: one undo step ("New floorplan
    revision: …"). The old file is kept (issued sheets print from it); W3 marks their sheets "Changed since".
  - The issue records `floorplans` (the files its frozen pages are drawn over, `domain/issue.ts` `floorplansIn`) and
    the transmittal prints "Floorplans: …" under the note.
  - Not built: re-align by two point pairs (moved drawing) → `later.md`.
  - Tried live in Workflow test: L1 → revB (uncalibrated) — calibration copied, the plan lined up with the racks and
    grid; Undo put L1 back on 20240516. revB's file keeps the copied calibration. Tests in
    `views/transmittalPage.test.ts`.
- **W7 Floorplan compare** (B9, B9a, B16):
  - Each floorplan row: a Show tick (`Underlay.hidden`: not drawn on the plan or any sheet) and a fade (100 / 60 /
    35 / 15 %, `Underlay.opacity`, 60 % = unset as before) — saved, undoable, printed.
  - Compare… on the row: another PDF drawn in red UNDER it (`PlanOpts.compare`, image `tint: 'red'` via an SVG
    feColorMatrix: dark lines red, white stays white; no `src`, so not pickable). Screen only, not kept
    (`ws.compareOn` / `ws.compareWith`); the plan's Display › Compare floorplans toggles it. W4 now records
    `prevFileId`, listed first as "(previous)" and the default when Compare is on.
  - Not per viewport (the revision check's call). Test in `domain/legend.test.ts`. Seen live: L1 compared with revB
    — the ghost draws in red under it, lined up (the two revisions match there).
- **W6 Set up each floor in one pass** (B43): Plans & floorplans › **Set up each floor…** runs Origin then Crop on
  every shown floorplan of the main floors, lowest first (CadShell `setupFloors`): each step opens its level's plan
  and says "GF (1 of 3): …"; from the second floor up the floor below's file is drawn in red under it (W7's Compare,
  restored after). The Calibrate tool now tells how it ended (`done(ok)`, `ws.onCalibDone`): set → the next step at
  once (no tick, so the dialog stays hidden); Esc → "Floor setup stopped"; another tool → the pass ends. Each step's
  Undo / Keep offer stays up into the next step. Scale isn't a step (1: in the dialog first, W5). Tried live in
  Workflow test: GF origin clicked → on to GF Crop with the offer up → Undo restored it → Esc stopped the pass and
  the dialog came back. Not seen live: the L1 ghost step.
- **W15 Patch without pixel hunting** (B46, B54):
  - A panel's Properties › Ports and labels › **Select the N allocated ports not patched yet** (`domain/cords.ts`
    `allocatedUnpatched`: an outlet cable on the port, no cord that isn't being removed) — then P / Patch to… as for any
    picked ports. Shown whether or not ports are picked; hidden when there are none.
  - In a rack view a click on a cord where it crosses a port cell takes the PORT (`editor/pick.ts` `preferPort`, in the
    select tool's hover and press); off the ports the cord is picked as before. Cords are still drawn over the ports
    (so you see where they land) — picking, not drawing, was the problem.
  - Tests in `domain/cords.test.ts`, `editor/editor.test.ts`. Seen live in Workflow test's L1.20 rack view: a click on
    PP1 port 32 under the cords picked port 32 (was a cord); PP1 has all 40 allocated ports patched, so no button.
    Note: the select tool is created once — a code edit needs a reload to take effect in an open tab.
- **W16 Switch-port reservations** (B59):
  - A switch's picked ports get **Reserve for…** (PortProps), stored on the device (`Device.reservations`; a panel
    keeps `panel.reservations`). `domain/ports.ts` `reservationsOf` / `reservedFor` read either; `reservePorts` writes
    the right one; Delete on picked ports clears either; the rack view marks reserved switch ports as it does panels'.
  - `bulkPatch` (Patch to…, P, drag-to-patch, fill): an A port whose outlet's usage has ports reserved on the target
    goes to the first free one of those (wherever the run started; "no free ACS port left" when they're used up); any
    other A port passes over reserved ports in fill, or is skipped in step ("port 5 is reserved for CCTV").
  - Tests in `domain/cords.test.ts`, `domain/ports.test.ts` (a switch now takes reservations — the old "not a panel →
    null" check is replaced). Seen live: SW1 port 96 offers Reserve for… (ACS / AP / CCTV / TV).
- **W20 Revision clouds tied to a revision** (B26):
  - A cloud drawn on a sheet gets `geom.rev` = the revision being prepared (`domain/issue.ts` `draftRev`: after the
    last issued code, 'A' first); Properties › Revision edits it (blank = untagged).
  - Its DELTA TAG (`views/plan.ts` cloud prims): a triangle with the code off its top-right point, same layer / color.
  - `cloudShown`: untagged, the last issued revision or a code not issued yet → drawn; an EARLIER issued revision →
    kept but not drawn on the sheet (its own frozen issue copy still has it).
  - At an issue, the sheet's clouds still on a draft code take the code it goes out as (`tagDraftClouds`, written
    before the sheet is frozen, its own undo step "Revision clouds on S001: C"), so a typed code (P01) can't leave
    them on a guess.
  - Clouds on plans (not sheets) and clouds from before stay untagged. Tests in `domain/issue.test.ts`,
    `views/sheet.test.ts`. Tried live on Workflow test S001 (issued A, B): a new cloud came out "C" with its delta;
    Undo removed it. Not tried live: an issue retagging and hiding (it uploads a PDF).
- **W19 Sheets from a template** (B18): a sheet's Properties › **A copy for each…** › other floor / other server room
  (`app/sheetActions.ts` `sheetsForEach`, `domain/sheetEdit.ts` `sheetsFromTemplate`):
  - The template's floor / room = what most of its viewports show (`templateOf`). Each other main floor (or server
    room) without a copy from it yet (`Sheet.fromTemplate`) gets `duplicateSheet` (notes too): viewports of the
    template's floor → that floor; for a room, its row / schedule / port views → that room on its floor (row / rack /
    device ids dropped, row views fitted to its racks).
  - Title: the template's floor / room name replaced; "Level 1" → "Level 2" (floor 0 → its name, "GF"); else
    " — <name>" added. Number: on from the template's past numbers in use (E-101 → E-103 when E-102 is taken). Print
    order right after it. One undo step; the copies selected.
  - "Riser" in the backlog line: the riser view is building-wide, so there's nothing per riser to copy for — left out.
  - Tests in `domain/sheetEdit.test.ts`. Tried live in Workflow test: S001 "Level 1 outlet plan" → S004 "GF outlet
    plan" + S005 (L2); Undo took both out.
- **W21 Package attachments** (B19, B25):
  - The Issue panel's **With:** Bill of materials / Cable schedule / Outlet schedule (none ticked by default).
  - Each export now builds its workbook apart from the download (`render/exports.ts` `bomFile`, `cableScheduleFile`,
    `render/outletSchedule.ts` `outletScheduleFile`; File › Export unchanged). `issuePackage` builds the ticked ones as
    they are at that moment (the BOM: materials + the whole rack BOM), uploads each beside the PDF (`files/issue-…`, so
    they stay out of the floorplan list) as "<project> Issue 03 Cable schedule.xlsx", and records
    `Issue.attachments`.
  - The cover page says "Also enclosed: … (Excel)"; the Issues list links each file under the PDF.
  - Test in `views/transmittalPage.test.ts`. Seen live: the Re-issue panel shows the three ticks (cancelled). NOT tried
    live: an issue with them ticked (it uploads files) — worth one real run on Workflow test.
- **W25 BOM for a quote** (B48, B23, B25), `domain/reports.ts` `bom`:
  - Cable types by label everywhere in it (jacks, cable, patch cords): CAT6A, not cat6a.
  - A cable with no route is priced at the ROUTED AVERAGE of its type, waste in ("CAT6A — no route, estimated at 37 m
    each (the routed average, incl. waste)", note "21 cables × 37 m"); "length unknown" (ea) only when none of its type
    is routed. Estimated (unallocated) ones the same, from the estimates' own average.
  - `scope.rooms`: only what serves those server rooms — outlets with a port to one, devices in their racks, cables /
    cords with an end there, estimates to them, runs on those floors serving them (or any room). The BOM dialog's room
    ticks now scope the materials as well as the rack BOM ("BOM for:", shown whenever there are 2+ rooms). Per ZONE:
    not built (the room ticks cover the phased-tender case; ask if zones are wanted).
  - Workbook header: "Client: … Revision: … Date: …" (client from Project details; Revision and Note typed in the
    dialog) and the room scope in the title.
  - Tests in `domain/reports.test.ts` (the "length unknown" check now expects the average). Seen live in Workflow
    test's BOM dialog: CAT6A labels, "estimated at 37 m each … 777 m (21 cables × 37 m)".

## Backlog P3s (2026-10-15)

Dave 2026-10-15: every P1 / P2 done (W12 to later.md) → "P3s in order", skipping the ❓ ones.

- **Guides** (Dave's todo, T155): the **Guide** tool (Draw group, crosshair): a click places a cross, or only a
  vertical / horizontal guide (tool bar › Place), through the snapped point (typed points too); press on a guide to
  drag it (it snaps); Delete removes the one under the cursor; tool bar › Clear N takes this view's off.
  - Kept per view (`levelId|specKey`; inside an edited viewport, its view's) in this browser
    (`ws.guides`, localStorage `cad-guides`) — the decision: "screen only" = this user's aid, not drawing data, so
    no schema change and never printed. Drawn as a cyan dash across the view (`guide` class, screen-only in
    styleDrift).
  - Snap (every tool, `ViewCanvas` ctx snap): onto a guide (square onto it) or a crossing of two, with OSNAP on and
    no Alt, unless an object snap is nearer (`domain/guides.ts` `guideSnap`). Guide × object intersections: not built
    (no intersection snap exists).
  - Tests in `domain/guides.test.ts`. Tried live on Workflow test GF: a cross placed, "Clear 2" took it off.
- **Catalogue, with links to product specs** (G089, T048): Cabling › **Product catalogue…** (`ui/CatalogueDialog.svelte`):
  - The built-in Panduit seed + the global custom products (`$lib/catalog/service.ts`, the `catalog` collection, as
    the old Racks tool), filtered by kind / maker / RU / search (SKU, description, family, color); ↗ = its spec sheet.
  - **Draw racks** on a rack / VCM: `ws.drawProduct` arms the Rack tool with `rackFromProduct` (`domain/rackBom.ts`:
    VCM / cabinet / 2-post / 4-post, its RU and size, maker + SKU as model, catalogue id, spec link) until the Rack
    button is picked again. **+ Custom product** / ✕ (custom only, a second click confirms).
  - Spec sheets: `productUrl` on Rack, Device, DeviceTemplate and blocks (BlockDef). Properties: Rack › Spec sheet (or
    its catalogue product's), Device › Spec sheet (template carries it to placed devices; Template dialog field),
    Insert › Block › Spec sheet (saved on the block, `project.setBlockUrl`). The rack BOM already linked SKUs.
  - "Fits the row" filter: not built (RU covers it); one list with the device library: kept apart (the library is
    templates; a template keeps a catalogId as before).
  - Test in `domain/rackBom.test.ts`. Seen live: 162 products, ↗ links, Draw racks → "each click on the plan draws a
    Panduit AR4P" (Esc, nothing drawn).
- **Discipline from a fixed list** (D2): one GLOBAL list `settings/cadDisciplines` (`{ list: string[] }`;
  `project.disciplines`, `DEFAULT_DISCIPLINES` ICT / Electrical / Mechanical / Architectural while it's empty), edited
  in Settings › Sheets › **Disciplines** (`ui/DisciplinesTab.svelte`: chips with ‹ › order, ✕, + Add, "+ X" for values
  on this project's sheets not on the list). Sheet Properties and several-sheets Properties pick from it (a select); a
  value not on the list shows "(not on the list)", flagged amber, until changed. Sheets still store the label string,
  so the Sheets table, packages' discipline rule and the sheet list / DXF read it unchanged. Seen live: S001's
  Discipline offers — / ICT / Electrical / Mechanical / Architectural.
- **Recipients from project contacts** (D8): `ProjectSettings.contacts` (`Contact`: id, name, org, email — project
  data, undoable), edited in Settings › Sheets › **Contacts** (`ui/ContactsTab.svelte`; how many packages use each).
  - A package's recipients: contacts ticked (`{ name, org, contactId }` — the name / org kept for a contact deleted
    later) plus **Others** typed for that package only; **+ To contacts** turns its typed ones into contacts
    (`domain/packages.ts` `contactsFromPackages`, matching name + org reused).
  - Printed (cover / transmittal, the Issue panel's To, the packages list) through `resolveRecipients`: a contact as
    it is now.
  - Migration: not automatic (no write on open) — Contacts shows "N recipients typed on packages … Add them as
    contacts" (one undo step).
  - Tests in `domain/packages.test.ts`. Seen live: the Contacts section in Workflow test (no packages to migrate).
- **Shift constrains dimensions** (Dave's todo): the Dimension tool's SECOND point with Shift held is kept level or
  plumb with the first (`axisLock`, `editor/constrain.ts`), in the preview and the click; the third click (where the
  line sits) is free. Test in `editor/dimTool.test.ts`; the hint and Help say so.
- **Fewer gotchas in /cad/agent** (Dave's todo):
  1. Drawn onto a layer this user has HIDDEN (CadShell's drawn-on effect, `layerOf` of each new entity): that layer is
     shown again, toast "Outlets high was hidden — shown again, so you see what you drew".
  2. A greyed tool clicked (strip, Help, menus' tool entries): `pickTool` — a tool that works on plans opens this
     level's plan in the pane and arms it ("Outlet: on the L1 plan …"); others say where they work. The strip's
     greyed buttons now click through (their tooltip says "a click opens the plan").
  3. Properties (`Properties.svelte` root): Enter in a one-line field keeps the value and Esc puts back what it had on
     entering; both then blur the field, so the keys reach the drawing again (a field's own Enter / Esc runs first;
     textareas, checkboxes untouched; IME composing ignored).
  4. "No run …" (routing + estimates, `noRunProblem`): "… — draw a low run within 10 m, or tick its server room in a
     run's Serves (Properties)".
  - The /cad/agent guide's Gotchas updated to match. Seen live: the rack view's greyed Outlet → the L1 plan with
    Outlet armed. Not tried live: 1 and 3 (unit-tested parts: routing message).
- **W10 Company details and datum defaults** (B50):
  - New Project's "Your company" (name, logo, address, contact) starts as on this user's most recent project that has
    one (`Projects.svelte` `lastCompany` → `ProjectSettingsDialog`).
  - Datum: Floors & heights › **FFL 0 at** [floor] (`Building.floors.datum`; `restack(levels, skip, datum)` anchors
    that floor at 0, else floor 1 stays where it is as before; Apply floors keeps it).
  - The "J" placeholder: NEW projects' settings get the default title block without it (`defaultSettings`). The
    built-in default keeps it for existing projects — dropping it would change every issued sheet's print ("Changed
    since" everywhere); clear it in the title block editor there.
  - Tests in `domain/floors.test.ts`, `domain/settings.test.ts`. NOT tried live (Chrome was being restarted).
- **W13 Outlets per desk / array** (B12):
  - Right-click › **Copy outlets onto the other desks** (selection = outlets + 2 or more blocks): the outlets on one desk
    (the selected block nearest their middle) onto every other selected desk of the same block, where they sit on it,
    turned with the desk; desks in reading order (`domain/outletArray.ts` `outletsOntoDesks`).
  - **Array** tool (strip beside Copy, Edit › Array): base point, type the count + Enter (kept for the session), click
    the step to the first copy → all copies in one undo step, ghosts of each (`MoveTool('array')`, `arrayCopies`).
  - Both NUMBER ON the copied outlets (`numberOn`: each continues its usage's series on the level, skipping labels in
    use; ports follow) — a paste stays as-is. Help entry added. Tests `domain/outletArray.test.ts`.
  - Seen live on Test Project (undone): 2 outlets onto a second desk (A012 / A013), Array of 2 (A014–A017).
  - Noticed: on the plan a 3D desk block's fill hides the floor outlets under it unless they are selected (draw order).
- **W14 Racks side by side**: the Rack tool bays the next rack: a click beside the last rack drawn (along its row,
  within about a rack width of the next slot, not more than ¾ of its depth off the line) puts it flush against it on
  that side, lined up; farther off it goes where clicked (a new row); Alt = exactly where clicked; a slot another rack
  fills is left to the click. The ghost shows where it will go; widths can differ (a catalogue product). `bayAt` in
  `editor/rackTool.ts`, tests in `editor/racks.test.ts`, tool hint updated. Seen live on Test Project (undone):
  R305 flush against R304 from an off-line click, R306 free well to the left.
- **W17 Re-patch in bulk** (B60):
  - The Patching table's **To** cell is editable (double-click; last in the Tab order, so F2 / Enter still open Cord ID):
    type `Switch 1:41`, `R301 · SW1 : 41`, or `41` (same device); Enter runs down the column.
  - **Re-patch…** (the bar's button, right-click; also Properties with several cords — the shared CordActions bar):
    type the first port; the first cord goes there, the rest to the next free ports of that device (a port the batch
    leaves counts as free). On each cord the end on the same kind of device as the port typed moves (`endFor`: its
    switch end, whichever column — Test Project has switches in From), else To. One undo step, all or nothing.
  - Every move goes through `repatch` (installed → change, one room, labelled panel ports). `domain/repatchText.ts`
    (`portFromText`, `repatchRun`, `endFor`), `ui/cordActions.ts` (`repatchFrom`, `askRepatch`); Help entry added;
    tests `domain/repatchText.test.ts`.
  - Seen live on Test Project (undone): To cell → "port 40 has no label yet" (a panel, rightly refused); Re-patch… moved
    a From switch end 22 → 30; two cords from 30 → 30, 31.
- **W23 Show what changed since the last issue** (B28): Sheet Properties › Issued revisions › **Show changes since C**
  draws over the sheet what is new or changed since its last issue (orange) and what has gone (red dashed), on screen
  only, worked out again as the sheet is edited (`ViewCanvas` `changePrims`: `frozenNow` vs the issued frozen copy,
  `app/issue.ts` `lastIssued`).
  - `domain/issue.ts` `primChanges`: marks matched by what is drawn and where, NOT their look (class / color / weight /
    dash / clip) — a sheet issued a week earlier lit up entirely from styling changes alone. `movedWithViewport`: a
    viewport moved since the issue shifts all its marks; the shift most of a window's marks share with an identical
    issued mark is taken as the move and those marks count as `moved` (not marked; the status line counts them).
    Floorplan pictures are only flagged (`floorplans`), not marked. `changeOverlay`: outlines in `chg-new` /
    `chg-gone` (screen-only classes, listed in `styleDrift.test.ts`).
  - Seen live on Test Project S001 (rev C, 2026-10-07): first 363 / 272 marks (style + a moved viewport), after the
    two fixes the moved viewport's frame, trunks, some symbols and notes. Nothing written. Help entry added; tests in
    `domain/issue.test.ts`.
- **W24 Smaller issue / sheet friction**:
  - Uploads: issue package PDFs (`issue-…`) are listed after the floorplans under "Issued sheets (package PDFs)",
    marked "Issue PDF" instead of the amber "Set origin" (B51; the shared `$lib/uploads/Uploads.svelte`). Seen live.
  - The Sheets table's Issue state column is on by default (⋯ hides it). Seen live.
  - The Issue panel's "Package" field is now "Issue name" (it only ever named the issue; a package is made in Packages
    › + From selection — its tooltip says so); issuing a package shows "of package X". NOT built: making a package
    automatically from an issued selection (a design choice for Dave).
  - Noticed: pictures (logos, pasted screenshots) are still flagged "Set origin" in Uploads — left, as an image can be
    a floorplan.
- **Dave 2026-10-15 on the above:** W24b closed — issuing a selection does NOT make a package (the Issues list's Make
  package button does, when wanted). Outlets must draw over desks → noted under the ❓ "Three bands" entry. New todos
  in backlog.md: "Keep a drawn item's settings for the next ones" (or a Use as default button) and "Another word for
  Issue" (both ❓).
- **W27 A riser carries on on the other floor** (B37): V → level N now ends the riser at that floor's tray height (the
  middle of its ceiling void, as the Trunk tool starts; a run at floor level: its FFL) instead of always FFL; in a
  plan the pane then shows that floor, CENTRED on the riser (zoom kept: `ws.centreOn`), and the tool carries on from
  the riser's top — the next clicks draw the new floor's run, which joins the riser (routing's coincident nodes).
  `PathTool.riserTo`, `ToolCtx.openLevel(id, at)` → `ws.openLevel` (the shell's openLevel). Tests: drawing.test.ts
  (riser + carry on), typing.test.ts (riser end Z). Hint + Help updated. Seen live on Test Project (undone): 1F
  conduit, V → 2, 2F opened centred, the 2F run started on "Riser 1F ↕ 2F".
- **W28 Draft in sections** (B34): Outlet, Trunk, Conduit and Line work in sections (`TOOL_VIEWS`; on the work plane
  — by default the cut line — like elevations). A block placed in an elevation / section (`geom.frame`) now shows in
  every elevation / section LOOKING THE SAME WAY (`sameWay`: same across direction, any origin — the section's depth
  and width keep it local), not only the exact view it was placed in; side / back views still don't show it (edge-on
  / mirrored). Notes and lines drawn on one view stay that view's (`ownFrame` + `sameFrame` unchanged). Test in
  `editor/insertTool.test.ts` (a section of that wall shows it; flipped or too shallow doesn't). Help updated. Seen
  live: Outlet in 1F Section B (undone).
- **W30 (part) Fill and cables on the riser view** (B39): each riser segment is labelled beside it with what it
  carries — "48 cables · 32%" (`cableCountText` + fill %; amber near the limit, red over it, as a per-mark color so a
  sheet prints it). The riser view takes `fills` (project.fills, with estimates; a sheet viewport passes its own;
  absent → worked out from the routes), `riserShafts` returns each riser's segment id. Test in `views/riser.test.ts`.
  Live: the riser view renders (Test Project and Workflow test have no riser runs to label just now).
- **W30 (rest) Rooms and EPS rooms** (B38): a **Room** tool (tool strip › Building, after Wall; plans): click the
  corners (snaps, Shift 15°, typed points), Enter / C / a click on the first corner closes it, then the name (asked;
  empty = the default). Drawn round a riser (`riserInside`: a run's vertical segment to another level, on this floor)
  it is an EPS ("EPS 1", kind `eps`) — the riser view's EPS box takes its name. Rooms draw on the plan as a dashed
  outline + name (`shape room-bound` / `note room-name`, existing print styles), picked as the space → Properties
  (RoomProps: + a Kind select Room / EPS for non-server rooms; Delete as before). New system layer **Rooms**
  (`sys:rooms`, order 25 — between Walls and Drawing, no other order moved); spaces default to it, so imported room
  boundaries now show on the plan too. `editor/roomTool.ts` + test; plan test in it. Hint + Help.
  - Seen live on Test Project (undone): Room 2 drawn, named, Properties Kind = Room, dashed outline + label.
  - Gotcha hit: an edit that used `segKey` hot-reloaded before its import line → Vite kept serving that broken
    riser.ts (same `?t=`) across full reloads until the file was edited again.
- **W31 Ladder in the Kind list; cloud hint** (B13, B36): "Ladder" is a run kind of its own in Properties' Kind list
  (one run and several) — a ladder used to show as Tray (`RunKind` + `kindOf`, test in `runEdit.test.ts`). The
  Revision cloud hint now says it works on a sheet, a plan, an elevation or a section. Not tried live (a list option
  and a hint).
- **W32 Small fixes**:
  - A device placed (or dropped from the library) on a taken U goes to the NEAREST free U (a tie goes up) and says so;
    the drop ghost shows that spot, red only when the rack has no room (B45: it was refused, silently on a drop).
    `nearestFreeU` (domain/devices.ts), DeviceTool down / preview; tests in `editor/racks.test.ts`.
  - Shift+click (and a Shift window) ADDS to the selection outside rack views, as Ctrl does (B49: it replaced it);
    rack views keep Shift for ranges, and a Shift-drag still moves with the H / V lock. `selectTool` `add`; test in
    `copyNudge.test.ts`; Help "Select several things".
  - The bottom table staying as you left it: no longer happens — checked live: folded, and closed, both stay so across
    plan → sheet → plan → riser view (nothing reopens the panel since the closed-bar redesign). No change.
  - A click inside a viewport on a sheet picks that viewport (B49: it picked the sheet / nothing) — on the paper or on
    the model drawn in it; it is still moved by its frame (a drag inside only picks it, then windows as before), Ctrl
    keeps its add / drop. `selectTool` (sheet branch); test in `sheet.test.ts` updated. Seen live on S001.
  - The view strip's Riser button opens the riser view in its OWN tab (the existing one if open), not over the plan's
    tab (`ws.openInTab`, as the Navigator does). Seen live: 1F plan → Riser went to the "Riser view" tab, 1F plan kept.
  - Allocation: high-level ports put on floor panels in a room with NO high-level panel now say "there is no
    high-level panel in L1.20", not "the high-level panels are full" (B52). Test in `allocate.test.ts`.
  - The Blocks window's "On this level" already counts outlet symbols (by their block, placed outlets) — checked live
    on 1F (Outlet - ceiling 3, desk / box 5, floor box 2, wall 3, Wireless AP 2). No change.
  - A **Measure** tool (tool strip › Draw, after Dimension; plans, elevations, sections): two clicks (snaps, Shift 15°)
    → the distance beside the line and in the status line with its X / Y (along / up) parts; nothing is drawn.
    `editor/measureTool.ts` + test; hint + Help. Seen live on 1F.
- **Hover grip after Delete** (Dave 2026-10-15): the larger grip under the pointer stayed drawn after its shape was
  deleted, until the pointer moved. `selectTool.ts` now keeps the selection it was found on (`#hovFor`) and draws it
  only while that selection is the same and still exists. Test in `editor/pathSel.test.ts`; seen live on Test Project
  (a rectangle drawn, a corner hovered, Delete: the grip went with it).
- **Help › Walkthrough** (Dave 2026-10-15): Help menu › "Walkthrough: a project from start to issue" opens Help on a
  new Walkthrough section (`helpContent.ts` `WALKTHROUGH`, nine stages of short numbered steps: new project,
  floorplans, server rooms and racks, outlets, containment and risers, allocation and patching, sheets, issue and
  package, exports and backups); it sits folded at the top of Help otherwise, and search reaches it.
  `HelpDialog`'s `keys` prop is now `start: 'keys' | 'walk'`.
- **Keys & mouse layout** (Dave 2026-10-15): long key / mouse texts wrap in their own column (they ran across the
  other one: `kbd` was nowrap); Function keys now come first, then an ACAD / EOS input tip (replacing its one-line
  row), then Keys & mouse. Seen live.
- **EPS boxes slab to slab** (Dave 2026-10-15), `views/riser.ts`: a riser carrying on to the floor above draws that
  floor's EPS box up to the slab above (through the plenum); one coming from the floor below, down to this floor's
  slab (through the raised floor). A riser that only turns in this floor's ceiling stays FFL → ceiling. Test in
  `views/riser.test.ts`; seen live on Test Project's riser view.
- **Use as default** (Dave 2026-10-15: the button, kept with the project; backlog "Keep a drawn item's settings for
  the next ones"): one item selected → Properties › **Use as default** (under its name) saves its settings as its
  tool's starting point in `ProjectSettings.toolDefaults` (`domain/toolDefaults.ts` `useAsDefault`), one undo step:
  - a rack → the Rack tool: kind, size, height, rotation (square too), doors, color, product — over "like the last
    one" (room, row and name still follow the last rack); a product picked in the catalogue still wins;
  - a trunk / tray / ladder → new trunks' W / H and kind; a conduit → its diameter; a wall → its thickness
    (`ws.setTool` reads them, `ws.adoptDefaults` drops this session's typed sizes so the new default shows at once);
  - a box → the Box tool's height and Z; a text → the Text tool's size (and pasted text);
  - a line / rectangle / circle … → the project drawing style (`shapeStyle`, Settings › Drawing).
  - Outlets: none (the Outlet tool bar already carries on from the last one). Tests in
    `domain/toolDefaults.test.ts`, `editor/racks.test.ts`; Help how-to + the Rack hint. Tried live on Test Project:
    R301 → Use as default → a rack drawn on 4F came out 4-post, 45U, 750 × 1070, turned 180°; both undone (checked in
    Firestore).
- **Export file names** (Dave 2026-10-15: "both" — a project pattern, and each export editable; then "dont use
  statusbar for inputs like filenames, use a dialog"): every export now saves through `render/download.ts`
  `saveFile(data, name, type, { what, scope })`, which asks the page's namer first: CadShell opens **Save as**
  (`ui/FileNameDialog.svelte`), filled from `ProjectSettings.fileNamePattern` (`patternName`: {project} {what} {scope}
  {date}; an empty token drops its separator) or the export's own name; Enter / Save saves, Esc / Cancel saves
  nothing (the export returns null / false and its caller says nothing; the BOM / cable / patch dialogs stay open).
  Settings › Files › **Export file names** sets the pattern, with an example. Covered: patch schedule, panel labels
  (Excel + PDF), port map, BOM, cable schedule, frame sheets, outlet schedule, sheet list, sheet PDFs, DXF, backups
  (download + from the list). The release reprint / transmittal names come with the Release rename merge. Tests in
  `render/download.test.ts` (the old fileSafe test kept), `render/patchRoundTrip.test.ts` mocks saveFile. Tried live
  on Test Project: the outlet schedule's Save as with its own name, then with the pattern
  ("Test_Project_Outlet_schedule_4F_20261015"); Esc saved nothing; the BOM dialog's Save as cancelled leaves the
  dialog open; the pattern cleared afterwards (checked in Firestore).
- **"Issue" becomes "Release"** (Dave 2026-10-15): every word a user sees or gets in a file — Release… / Releases /
  Re-release… / Released revisions / Released in / Changed since last release / Not released, the Release panel and
  list, undo labels, Help (area "Sheets and releases"), the agent guide, Settings, Uploads ("Released sheets",
  "Release PDF"), `issueTag` → "Release 03" (file names, cover, transmittal "Release No." / "This release"), the
  register (`ReleaseRegister_….xlsx`, "Release register"). Data names unchanged (`'issue'` type, `issueId`, state keys,
  `issue-` file ids). Kept: "issues" meaning allocation / import problems. One-offs: PropGroup fold state of the two
  renamed groups resets once; files already uploaded keep their "Issue NN" names. The reprint, revision PDF,
  transmittal and register downloads now go through the Save as dialog too. Built by an agent in a worktree, merged
  there (helpContent / SettingsPanel conflicts resolved), tests 1156 pass, svelte-check clean in cad.
- **Walkthrough window** (Dave 2026-10-15: "so useful … a floating / dockable window so the user can keep it open"):
  Help › Walkthrough now opens a **Walkthrough** window (`WinId 'walkthrough'`, floating 360 × 520 by default; docks
  left / right like the others; Window › Walkthrough toggles it). `ui/Walkthrough.svelte` draws the stages (each folds
  on its heading) for both the window and Help's section, which keeps Help's search and gains **Open in a window**.
  HelpDialog's `start: 'walk'` is gone. Seen live: the menu opens it with 9 stages, it docked right under Racks, Help's
  button opens it and closes Help; closed again afterwards.
- **Leader → Callout** (Dave 2026-10-15): the tool, menu, Properties title, undo label, messages, Help and the agent guide say Callout; the tool id / geom kind stay `leader`.
- **Help: no Walkthrough window button** (Dave 2026-10-15): Help's walkthrough section no longer has Open in a window (Help › Walkthrough and the Window menu open it).
- **{revision} / {version} in export names** (Dave 2026-10-15): `{revision}` = the export's own revision (a single sheet PDF's last revision, a revision PDF's code, the BOM's typed Revision); `{version}` = the release number, 2 digits (a release's reprint / transmittal: its own; else the project's latest). Unknown = left out with its separator. Settings › Files and Help list them; tests in `render/download.test.ts`. Tried live: "{project} {what} {revision} R{version}" → "Test_Project_S001_Test_sheet_cad_4.1_C_R05" for S001's PDF (cancelled); pattern cleared.
- **Use as default, every drawing tool** (Dave 2026-10-15: "can it be expanded to the other drawing tools?"): also an
  outlet (the Outlet tool bar: usage, mount, ports, cable type), a box's shape (rect / ellipse / polygon + sides), a
  text's alignment, a callout's frame, a revision cloud's arc size, a dimension's kind, a legend's text size, a
  section's depth. The Box / Dimension / Outlet tool bars take the defaults once a session (`ws.#seed`), and a Use as
  default on one of them applies at once (`adoptDefaults(td, tool)` — only that tool, so a rack default no longer
  resets the box tool bar). Not offered: blocks, pictures, viewports, rooms (nothing a tool starts from). Tests in
  `domain/toolDefaults.test.ts`, `app/workspace.test.ts`; Help how-to rewritten. Tried live: the 1F callout (Box frame)
  → saved `callout: { border: 'box' }`; Undo took it out (checked in Firestore).
- **Navigator: no elevation rows** (Dave 2026-10-15: "drop the elevations, the user should be using sections
  instead"): each level lists Plan, its sections and its server rooms (`domain/navTree.ts`); with an elevation open its
  level row is the marked one (`Navigator.svelte` isCurrent). Help's Navigator answer says so. Generic rooms in the tree
  (AV / meeting / EPS …, Dave "consider") not built yet — asked first (imported room outlines could flood it).
- **W26 More BOM lines** (B24; Dave 2026-10-15 picked them), `domain/reports.ts` `bom`, by rule from the model
  (descriptions, no SKUs yet):
  - Outlets: a box per outlet by mount — "Back box (wall)", "Surface box (ceiling)", "Floor box" (floor / box);
    desk outlets: "Spiral / mesh tubing to desk outlets" at `DESK_TUBING_M` = 1.5 m each (note "N desk outlets ×
    1.5 m"). Faceplates and modules were already there ("N-port outlet (mount)", "Jack / module …").
  - Fibre terminations: a connector / pigtail at each end of each fibre core to buy.
  - Testing & labelling: a copper permanent-link test per copper link, a fibre test per core, cable labels and port
    labels at both ends — links to buy plus estimated cables (ports not linked yet).
  - Not now (Dave): containment fittings / supports, fire-stopping. Tests in `domain/reports.test.ts`; Help's BOM
    answer. Seen live in Test Project's BOM: Back box (wall) 3, Floor box 55, tubing 2 m (1 desk outlet), 183 tests,
    366 cable / port labels.
- **Desk tubing 2 m** (Dave 2026-10-15: height-adjustable desks are common): `DESK_TUBING_M` 1.5 → 2.
- **Walkthrough EN / 日本語; not in Help** (Dave 2026-10-15): the Walkthrough window has an EN / 日本語 switch (`WALKTHROUGH_JA`, menu and button names left in English as on screen; the choice kept in this browser, `cad-walkthrough-lang`); a test keeps both versions the same shape. Help (F1) no longer carries the walkthrough — Help › Walkthrough only.
- **W33 Floors without a model** (Dave 2026-10-15: "2F and 3F don't need to appear in the Navigator but should still be
  in riser views"; no new setting): a level is the floor's model, the building's range is the stack.
  - `domain/floors.ts` `floorsWithoutLevel`: the building's floors with no level as stand-ins (`floor:<n>`) in their
    storey (`restack` already gave them one — 4F stays put), named from the pattern, the heights of the floor below.
  - The riser view draws them (FFL, slab, name); "Hide empty floors" hides them like any floor without a server room.
  - **Apply floors** adds levels only for floors NEW to the range (`planFloors` `before` = the applied range), so a
    deleted level isn't brought back, and such floors don't make Apply "stale"; Floors & heights lists them under the
    chips: "No model: **+ 2F model**" makes one again (named, the nearest floor's heights, stacked).
  - Tests in `domain/floors.test.ts`, `views/riser.test.ts`.
- **W34–W36 Deleting sheets and levels** (walkthrough Round 6, Dave 2026-10-15 "build them"):
  - W34: deleting a RELEASED sheet (`selectionActions.ts`) says "Released: S001 (A, B, C). It is in “Initial package”."
    and offers **Archive instead** (status archived) beside **Delete**.
  - W35: the delete-level question counts what goes (`commands.ts` `contentsText`: "7 outlets, 1 run, 1 floorplan").
  - W36: `levelContents` no longer takes runs of OTHER floors that merely reach the level (the whole run used to be
    deleted); `levelRisers` names them in the question, and the delete ends each riser on the nearest floor with a model
    between its other end and the deleted floor (tray height; FFL for a low run), else cuts it back to its own floor
    (`withoutLevelNodes`) — Dave: "trim them back to the next available floor". The Floors dialog still counts such a
    level as not empty (Apply keeps it). Help: two new how-tos.
  - Tests in `editor/notes.test.ts`. Live in Test Project (Dave: 1F and 4F are the only floors in use): deleted the 2F
    (asked: "1 run from other floors … a run on 1F", cut back to 1F — no floor in between) and 3F (empty, just went)
    levels; the Navigator lists 1F / 4F; the riser view still draws 2F (FFL 3.80) and 3F (7.60) with their EPS boxes;
    Floors shows "No model: + 2F model + 3F model" and Apply stays off; + 2F model made it again at 3800 (Undo took it
    out). The released-sheet question was seen on S001 and cancelled. **Left as is on purpose**: Test Project without
    the 2F / 3F levels.
- **Navigator: the rooms you drew** (Dave 2026-10-15: "list all rooms the user creates"): under each level, after its
  server rooms, every room with an outline (Room tool: EPS, AV, meeting, machine rooms …; detail "EPS" or its kind),
  rename / delete in its ⋮; a click opens the plan with the room selected and panned into view. Zones, areas and
  imported room numbers (no outline — imports never make one) stay out, so no flag is needed. Test in
  `domain/navTree.test.ts`; seen live in Test Project ("Room 2" drawn on 1F, listed; undone).
- **Menus, option 2** (Dave 2026-10-15: "try 2 for now … rename 'Sheets & releases' to Drawings"): the menu bar is
  File · Edit · View · **Draw** · **Modify** · **Annotate** · Cabling · **Drawings** · Project · Window · Help
  (`ui/cadMenus.ts`). Every tool is in one menu (Draw: Line, Shape, Box, Image…, Wall, Opening, Room / EPS, Section,
  Measure, Guide lines; Modify: Move, Copy, Array, Rotate, Mirror, Match properties, Renumber; Annotate: Text, Callout,
  Revision cloud, Dimension, Legend, Block…). Exports only in File › Export (Cabling › Schedules and the Sheets menu's
  PDFs gone), the this level / all levels pairs as submenus. Drawings: New sheet, New sheet from this view, Viewport,
  Sheets table, **Packages**, **Releases**, **Release…** (opens the Sheets table there — `ws.sheetsAsk`; Release…
  releases the picked sheets or says to pick them), Title block…. View: a Drafting submenu for SNAP / OSNAP / GRID.
  Help, hints, the agent guide and the walkthrough name the new paths. Options 1 and 3 documented in the backlog for a
  later review. Seen live: the bar, Drawings › Packages opening the Packages view.
- **Small changes** (Dave 2026-10-15): View › **Fill rates** (was Fill); Match properties is **Format painter** (menu,
  right-click, undo label, Help); the first outlet on a level is a **Box** at Z 0, Low, no usage (was Floor), drawn
  with the built-in symbol now named **Outlet - box** (was Outlet - desk/box); default usages: a new project AP, **AV**
  (was TV), CCTV; a project imported from the old tools AP (was Wireless AP), CCTV (new), Printer, AV (was TV / AV),
  Not used — no Desk: an imported outlet whose usage was "desk" (or none) gets no usage. Existing projects keep their
  usage lists. Tests: `domain/settings.test.ts`, `editor/editor.test.ts`.
- **Tools: flyouts in a floating palette** (tool strip options 2 + 4, Dave 2026-10-15 "try 2 inside the floating
  palette"): `ui/toolGroups.ts` `TOOL_FAMILIES` — 19 buttons for the 32 tools, the groups as the menus (Select / modify ·
  Draw · Annotate · Building · Cabling · Drawings; Dimension now under Annotate, Renumber and Format painter under
  Modify). A family button shows the tool in use from it, else the last one picked (kept in this browser,
  `cad-tool-flyouts`); a click uses it, the corner mark or a right-click opens the family (`ToolStrip.svelte`). The
  strip lives in `ToolPalette.svelte`, two columns floating over the drawing area, dragged by its grip (position kept,
  `cad-tool-palette`, kept inside the area); ⤒ or Window › **Tools as a floating palette** puts it back in the top bar
  as a row (`cad-tools-float`). Help: a new how-to; the tool-strip mentions now point at the families / menus. Seen
  live: the palette, the Text flyout → Callout (the family then shows Callout), the drag, the dock to the top bar (19
  buttons, ~550 px instead of ~900); test settings cleared afterwards.
- **Tools regrouped; shape / box kinds as flyouts** (Dave 2026-10-15): the tools are back in the top bar by default
  (Window › Tools as a floating palette still floats them — "some users may like it"). Groups: Select / modify · Draw
  (Line, Shape) · **Build (3D)** (Box, Wall, Opening) · **Spaces and views** (Room, Section) · Annotate (Dimension /
  Measure / Guide lines now one family; Text / Callout / Cloud; Legend / Block) · Cabling · Drawings — 18 buttons.
  Flyout items can be a tool's kind (`toolGroups.ts` VARIANTS): Shape → Rectangle, Polygon, Ellipse, Arc (the options
  bar's Shape list in the same order); Box → Box / desk, Cylinder, Polygon box (the Box tool's Footprint list is gone).
  Icons: Opening = a door, Room = a dashed square, Section = an elevation mark (Kestrel), Polygon / Cylinder / Arc /
  Ellipse glyphs. Touch: a long press opens a family, a click on the family in use opens it too, the corner mark's hit
  area is larger. Menus follow: Draw › Shape ▸ / Box ▸ kinds, Measure and Guide lines under Annotate. Also: Project ›
  **New project…** (the projects page opens on New Project — `/projects?new=1`; the Walkthrough's first step says so);
  the **Outlet - floor box** symbol's circle touches the square (r 0.9 → 1.5); the status bar's X / Y show the grid
  point a click takes when SNAP is on (guides did snap to the grid — the readout didn't). Seen live: the bar, the Box
  flyout → Cylinder (a second click reopened it), the Shape flyout order, New project… opening Create Project (closed
  unsaved).
- **Room elevations A–D; Viewport only on sheets** (Dave 2026-10-15, "do the 2 grouping ideas"):
  - The Section button is a family: **Section** (a cut line) · **Room elevations (A–D)** (`ws.sectionMode`; Draw ›
    Section ▸ the same). A click inside a room drawn with the Room tool (the smallest one there) makes four sections
    (`domain/roomElevations.ts`): "<room> A" … "D" — A looks to −y (up the plan), then B +x, C +y, D −x — each cut
    through the room's middle, as wide as the room, `depth` = to its wall + 300 mm (`PAST_WALL_MM`); square to the
    outline's box; names already on the level skipped; one undo step, selected. Removes later.md's "Room elevations".
  - The Drawings group (Viewport) shows only while a sheet is open (it's last, so nothing moves).
  - Tests: `domain/roomElevations.test.ts` (each section's looking direction checked through `sectionFrame`). Help: a
    new how-to; the Section hint.
  - Live in Test Project (Dave: "draw a room around IDF2"): a room **IDF2** drawn with the Room tool round R311–R313
    and P3C (typed corners from the floorplan's walls: −4100, −11450 → −1280, −6330); Room elevations inside it made
    IDF2 A–D; IDF2 D opened on P3C / V05 / V06. **Kept** (the room was asked for; the four sections to look at).
- **Section grips and marks** (Dave 2026-10-15: "the grips don't obey shift … labels and arrowheads should be smaller"): a section's end grips take Shift — 15° steps from the other end, so a cut stays level / plumb (`editor/handles.ts`; test in `handles.test.ts`); its arrowheads and names on the plan are 2.5 paper mm (were 4 and 3.5). "IDF2 C much too wide": its cut line had been dragged to −340 … −4130 (3.79 m, past the room's right wall at −1280) with its ends 10 mm out of level — the section shows what's between the line's ends, so it widened with the drag.
- **Section names not bold** (Dave 2026-10-15: "the font looks very thick and large"): weight 400 on screen (was 700) and not bold in PDFs, 2 paper mm (was 2.5 → 3.5 before). Test Project's IDF2 C put back wall to wall (−1280 → −4100, level at −8060; its depth left as Dave set it, 1400) — a direct write, at Dave's request.
- **Room outlines editable; a section's width is its cut line's** (Dave 2026-10-15: "can I edit room rects?"; "why does
  extending C 750 mm beyond the right wall make the view 16 m wide?"):
  - A selected room drawn with the Room tool has grips on the plan (`editor/handles.ts` `roomHandles`): a square on each
    corner (Shift: 15° from the corner before) and a bar along each side that slides the whole side square to itself;
    10 mm steps (Alt: free); one undo step "Edit room …". Help's room-elevations answer says so. Dave dragged IDF2's
    right side live (automated drags don't reach the canvas). Test in `handles.test.ts`.
  - The 16 m: a long run crossing the section's band (Test Project's 16 m trunk TR1, reached once C ran past the wall)
    was drawn clipped to the cut line's ends, but its FULL length set the datum lines (FFL / CLG / SSL) and the view's
    extents / fit. `primBounds` now respects a prim's clip and the datums are sized from it (`views/display.ts`,
    `views/elevation.ts`), so the view is the cut line's width. Test in `views/section.test.ts`.
