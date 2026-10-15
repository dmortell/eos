# cad todos

**Frozen 2026-10-03:** User's eight todo batches from the gap review, as dictated. Every item (T001–T168) has been merged
into `../plan/` (backlog, decisions or later; `plan-sources.md` maps the T ids). Add new todos there, not here.

**Already open in the phase docs:** Shift constraints during drags and the drag marquee fix (phase6.md, Todo);
Ctrl-drag duplicates shapes and devices (phase6.md, phase3.md); plan the rack-view interactions before building
(phase3.md); issue only saved sheets (phase4.md); 5.4 prices (phase5.md).

## From the gap review (User, 2026-10-03; read up to the Elevations section)

### Drawing and editing shapes
- [ ] **Disconnect segments at a node:** split trunks / walls / lines into separate shapes at a node, like legacy
  Outlets' "Split trunk here" (`outlets/parts/OutletCanvas.svelte:1932`), but WITHOUT a context menu.
- [ ] **Click to select the whole shape, click again for one segment:** the first click selects the whole trunk / line /
  wall, the second click selects the segment under the cursor.
- [ ] **Auto-merge:** a node dropped on another node joins the two shapes.
- [ ] **Shift = 15° steps** while drawing and dragging. This extends the phase 6 todo "Shift constraints during drags".
- [ ] **Undo / redo select what they changed**, so you can see what came back or went.
- [ ] **Consider removing "Rooms a trunk serves"** (`role.serves`). Routing uses it today to keep a room's outlets on
  that room's runs (`domain/routing.ts:114`), and the legacy import fills it from trunk `rooms`. Decide what replaces it,
  or whether routing does without.

### Objects
- [ ] **Maker / model fields** on devices, panels and other shapes where they're useful.
- [ ] **Front line on any object**, not just racks: a toggle, e.g. to show which side of a desk is the front.
- [ ] **Front / rear door swings on other objects.** Racks have them since phase 6 (`Rack.doors`).
- [ ] **Show fill % and cable count at penetrations.**

### Racks and patching
- [ ] **Device counts by type for the selected racks** (one or several racks).
- [ ] **Patch list limited to the selected room / racks.** The full list gets very long. Exports still cover everything,
  with a choice of all cords or only changes.
- [ ] **Consider a change log.** It means more Firestore writes; weigh that first.

### Patching and ports (User, 2026-10-03, second batch)
Terms: **links** = the rear ports of panels = structured cabling; **cords** = patch cords on the front.

**Test first:**
- [ ] **Test patching devices and interlinks** works end to end in the app.
- [ ] **Test the end-to-end connectivity list** (outlet → panel → cord → switch) still comes out right through
  interlinks.

**Cords:**
- [ ] **Do we need to select / edit patch cords?** Decide.
- [ ] **Dim the other cords when one is selected**, if it isn't complex.
- [ ] **Cord type from the port type?** Work out whether the panel / device port type can set the cord type. Either
  way there must be a way to set it, because servers and switches can mix port types.
- [ ] **Customisable cable types, colours and statuses?** Decide.
- [ ] **Patch bench?** Decide. Research first how professional apps patch between devices in different places (e.g. a
  clickable circuit bar).
- [ ] **Bulk patching:** select outlets / ports in a list and drag them onto a panel / device.
- [ ] **A tool to clear the rear links or the patch cords** of the selected ports.

**Ports and panels:**
- [ ] **Panel labels are unreadable:** fix. **Do we need the panel strip** (a readable close-up of a panel)?
- [ ] **Instant hover tips on ports:** label and usage, with no delay.
- [ ] **Drag from a port to select a block of ports; drag a device / panel to move it.** Today Shift-click selects
  ports, and only within one device / panel.
- [ ] **Search for a device / panel** in patching.
- [ ] **Lock / pin ports so allocation doesn't re-connect them** when outlets change. Placed links are auto-pinned
  today, so a re-allocate tool may be needed for when outlets change.

**Labels:**
- [ ] **Editable panel labels:** required.
- [ ] **Label template engine?** Only the port style can be set today. That may be enough, since outlets have
  Renumber. Decide.
- [ ] **Panel rendering:** look at Panduit's panel-labelling templates for ideas.
- [ ] **A printable view of panels with their labels**, to hand to the installer.

**Views:**
- [ ] **Editable floor / ceiling height lines per server room.** They often differ from the office floors.
- [ ] **Auto-labelled views for rack elevations and patch frame drawings?** Decide.
- [ ] **`?rack=<id>` URL** opens the elevation view at that rack.

### Racks, rows and catalogue (User, 2026-10-03, third batch; gaps read up to BOM)

**Test:**
- [ ] **Test Delete with ports selected:** only the port settings / cord go, never the whole device (fixed 2026-10-02;
  check it live).
- [ ] **Test rack doors:** e.g. a full-height front door and a split rear door.

**Racks and rows:**
- [ ] **Nudge the rack order in a row.** The order comes from the floorplan, but racks / VCMs set at right angles to the
  main row need nudging or dragging to get the order right.
- [ ] **Allow U overlaps in some cases**, with warning markers instead of a refusal.
- [ ] **Drag / copy several selected items** in rack views.
- [ ] **Device list for the selected rack?** Decide.
- [ ] **Delete a row?** Decide. Maybe a row deletes itself when its last rack goes.
- [ ] **`RackRow.defaults` (RU, colour, depth)?** Decide.
- [ ] **Row containment checks?** Decide (hot / cold aisle settings limit which racks a row allows).
- [ ] **The Panduit row builder?** Decide.
- [ ] **Editable floor / ceiling lines per server room** (see Patching and ports, Views).

**Devices, catalogue and library:**
- [ ] **A server-room field on panels?** Decide.
- [ ] **Catalogue vs library:** with the device library, is a separate catalogue (and editor) needed? Or import the
  Panduit catalogue into the library?
- [ ] **Links to product spec sheets** from the catalogue / blocks? Decide.

**Patching:**
- [ ] **Check how cad shows the old ends of moved / deleted cords.**
- [ ] **Check how Elevations makes the Excel frames label sheets**, and match it.
- [ ] **A change log for racks / frames / patching edits?** Decide (see "Consider a change log" above).

**BOM:**
- [ ] **The BOM button opens a dialog first**, with the list, the settings for the Excel export, and an Export button.

**Safety:**
- [ ] **Delete buttons with a big impact** (racks, drawings …) use the sliding confirm / cancel component we had. Find
  it first: the nearest found is the inline Confirm / Cancel in `drawings/parts/DrawingList.svelte:405`.

### Fourth batch (User, 2026-10-03; gaps read up to the Sheets tool)

**Project structure:**
- [ ] **Plan several buildings in one project** (Tourney has 3 buildings plus a data centre).
- [ ] **Think through how to use `roomId`.**
- [ ] **Power and AV:** consider power outlets / cables / panels, and AV cables (HDMI, coax, speaker …).

**Outlets:**
- [ ] **Check that adding outlets supports zones and rack targets.**
- [ ] **Outlet colours per IDF** (IDF1 / IDF2): decide how, by layer, frame, assigned room, or type / usage.

**Racks and devices:**
- [ ] **0U PDUs:** drag them to a position in the rack; show their labels and inputs / outputs.
- [ ] **Moved panels / devices keep the right labels:** when a panel / device moves in racks / frames, its patch
  cords must still show the correct port labels.
- [ ] **Deleting a device / panel:** it should ask first, then delete the connected cords and disconnect or
  re-allocate its links. Do we also need warnings for cords whose device no longer exists? (Today `deleteEntities`
  deletes a device's links and cords without asking.)
- [ ] **Do we need the Frame termination map?** Decide.

**Patching:**
- [ ] **Scroll to the clicked port in lists?** Consider.
- [ ] **Hover tips on patch cords?** Decide.
- [ ] **Cable labels on drawings?** Decide whether we'd ever want them.
- [ ] **A Notes column in the patch list.**
- [ ] **Check that patch changes show correctly in the exported patch plan.**
- [ ] **A bulk patching dialog, and a device tree with port use.** Consider.
- [ ] **Ports used / total** in a summary somewhere. Consider.
- [ ] **Patch cord BOM:** track and edit the cord labels used / assigned, for cords ordered and delivered.

**Risers:**
- [ ] **Floor / ceiling lines in the riser view:** check they're enough compared with the Risers tool.
- [ ] **Layers on riser drawings?** Decide.
- [ ] **A different floor selection per riser viewport?** Decide.
- [ ] **Risers to floors with no racks:** can they be drawn?
- [ ] **Riser rooms:** drag them (across / up-down)? Do they need labels, or are notes enough?
- [ ] **Edit the floors a vertical riser reaches:** check whether cad supports it.
- [ ] **Risers across floors:** how do they work, and can one be edited while an in-between floor is open?
- [ ] **Diverse routes:** cad routes interconnects automatically, but we likely need to set the route / trunks by hand
  (e.g. diverse paths).

**Cables and fill:**
- [ ] **Multi-core cables**, with their panel ports / terminations.
- [ ] **Fill-rate drawings by hand**, before cable routes exist, or to add non-data cables (power, coax …).
- [ ] **A UI to edit cable diameters by type** (see "Customisable cable types" above).

**Views and drawings:**
- [ ] **A list of all sections** (elevation / fill), to make viewports from.
- [ ] **RCP** (reflected ceiling plan) drawings.

**UI:**
- [ ] **Fix the cad dark-mode theme.**

### Fifth batch: sheets (User, 2026-10-03; gaps read up to DXF)

**Sheets and viewports:**
- [ ] **A new sheet fits itself once** its margin and title block exist. Today the first zoom is wrong, so inserted
  views are hard to find.
- [ ] **Scale and align a viewport's content with the mouse / touch.** Today: pick a scale from the dropdown, then drag
  the frame's corner grips.
- [ ] **Edit the model from a sheet:** a view / model mode toggle, or model mode inside the viewport or in a split.
  Today only paper notes can be edited on a sheet.
- [ ] **How a viewport is picked:** keep cad's click-anywhere, or AutoCAD's click / drag on the frame? Decide.
- [ ] **Test picking items under other items** by clicking again (click-cycling).

**Drawing tools:**
- [ ] **Regular polygons:** a number of sides on the Rectangle tool (triangle up to 12 sides), or a separate polygon
  tool.
- [ ] **Callouts drag like the Sheets tool's.**
- [ ] **Text fields linked to data**, for blocks that update themselves (e.g. legends with counts).
- [ ] **Drawing defaults** for lines, colours etc. Consider (see "Shape style" in the gap list).
- [ ] **A right-click menu?** Consider.
- [ ] **Future: a linking marker:** an interactive section / detail marker that holds a link to another drawing / view
  or a survey photo, and shows the sheet number plus the viewport number / letter (needs viewport numbers).

**Symbols:**
- [ ] **Outlet symbols: usage below, label above.**
- [ ] **Faceplate blocks:** data / power, single / dual gang.

**Title block and project details:**
- [ ] **Title block properties in a dialog or floating window**, since they affect every drawing in the project.
  Consider.
- [ ] **Logos picked from Uploads.**
- [ ] **Logos / images resizable, and images draggable.**
- [ ] **Where should the project details editor go?** Rethink.

**Revisions and issue:**
- [ ] **An edit history per drawing:** what changed, when, and who asked for it. Its dates / revision numbers fill
  the title block's revision table. (cad's Issues are good and simple; keep them that way.)
- [ ] **Renumber sheets** with the same tool as outlets / shape labels.
- [ ] **Named issues kept like a package:** check whether issues can be named and saved in the history. Ideally the
  next Issue starts from the last list of drawings, so the user only makes small changes.

**Printing and export:**
- [ ] **The PDF button in Sheet properties** must make clear it exports the drawing as a sheet, or move it to the
  Export menu.
- [ ] **Ctrl+P to print**, instead of downloading a PDF first (e.g. make the PDF in memory). Consider. See "Plan
  printing selected sheets" below.
- [ ] **Check that DXF export works for every sheet.** It's plan-only today (gap list, Pages: DXF).

### Sixth batch (User, 2026-10-03; gaps read through the Sheets tool, next: Drawings)
Model3d views aren't needed in cad yet; User ticked some model3d rows in the gap list for later.

**Navigation and input:**
- [ ] **Test and review navigation and editing on touch devices.**
- [ ] **AutoCAD zoom commands?** Maybe.
- [ ] **An ACAD / EOS toggle like Pages'?** Consider.
- [ ] **Remove Ctrl+D duplicate?** It isn't essential, since copy / paste or Ctrl-drag do the same. Consider.
- [ ] **Check legacy model3d:** does Ctrl+arrow resize items, multi-selected items or groups? Not essential.

**Underlays:**
- [ ] **Background layers instead of the PDF underlay:** PDF, image or DXF.
- [ ] **PDF underlays for elevations too**, not just plans. Consider.

**Editing:**
- [ ] **Multi-select segments of a trunk.** Do we need a list of segments?
- [ ] **Drag a wall's / opening's top or bottom edge** to change its height.
- [ ] **A floating elevation preview, focused on the selected 3D object(s),** for adjusting heights (or a plan preview
  when editing in an elevation). A split view is simpler, but walls may get in the way. Consider.
- [ ] **Plan z-cuts?** Consider.

**Views and output:**
- [ ] **Walls on either side of the racks** in rack elevations.
- [ ] **DXF of wall / room elevations:** wanted. **DXF of rack elevations and risers?** Decide.
- [ ] **Black-and-white rendering for sheets?** Consider.

**Other:**
- [ ] **Kanban tasks from the drawing area:** quick access for adding / editing tasks (the board is at
  `routes/tasks/+page.svelte`). Consider.

### Seventh batch: Drawings tool gaps (User, 2026-10-03)
Photo Surveys stays a separate tool.

**Viewports:**
- [ ] **A list of all views**, to find a view without opening each drawing. Would it be useful? Consider.
- [ ] **Delete with a viewport selected:** since 2026-10-02 it deletes only that viewport (undoable), no longer the
  sheet. Should it also ask first? Decide.
- [ ] **Rotate viewports?** Probably not needed.
- [ ] **Alt+drag / wheel to pan / zoom a viewport's contents?** Decide.
- [ ] **Double-click a viewport to open its model view?** Then how do you get back to the sheet? Consider (see
  "Edit the model from a sheet" in the fifth batch).
- [ ] **The click-then-drag guard?** Decide whether it's needed.

**Title block and revisions:**
- [ ] **How many revisions the title block lists:** cad lists the last 5. Make the number editable per sheet?
  Consider.
- [ ] **A DRAFT label toggle** on drawings, so nothing goes out by accident before it's approved / complete.
  Consider.
- [ ] **Version numbers on issues**, as well as the date.
- [ ] **1.1-style numbering** (major.minor), keeping only the major releases? Consider.
- [ ] **Deleting an issue:** decide what happens to its frozen copies / PDF.
- [ ] **An issue list for the PM**, with or without history, that can be shared.
- [ ] **Old versions:** check whether cad can show historical / issued versions of drawings and models.
- [ ] **A sheet whose viewports have different versions / changes:** how to handle it. Consider.

**Checkbacks:**
- [ ] **Plan checkbacks:** architects / MEP send multi-page drawings; we mark up changes or approve them and send them
  back.

**Levels and zones:**
- [ ] **Tourney 3303 / 3307:** check how cad holds the two zones' models. Are both on level 33? How would risers go
  to other floors from each zone, and between the zones?

**Drawing and shapes:**
- [ ] **Close a polyline:** add ways to do it. Consider.
- [ ] **A line grid that fades with zoom**, if not complex.
- [ ] **Rotate shapes / objects?** It complicates grips and resizing. Decide.
- [ ] **Copies: keep the label, or take the next free number?** Decide.
- [ ] **Wrapped markdown text:** how much code would it add?
- [ ] **Boxes / desks:** can cad draw them? Probably a rect with an extent is fine. A wall can't be reused, and a new
  shape type would be needed only for its own grips and connection points. Decide.
- [ ] **Penetrations.** Consider. The `penetration` role exists in the domain and the BOM counts it
  (`domain/reports.ts:162`), but there's no tool or auto-detect yet. The decision in `pages-features.md` was
  auto-detect + manual.

**Heights:**
- [ ] **Outlet blocks look large in elevations:** check their height; consider 0, unless they need dragging to a
  height.
- [ ] **Height presets or H / L for all items.** Consider.

### Eighth batch (User, 2026-10-03; gap review finished)

**Layers, blocks and storage:**
- [ ] **Lineweights per layer, and drawing defaults.** Consider.
- [ ] **A URL field on blocks**, linking to drawings or external pages. Consider.
- [ ] **Deleting a block only marks it unavailable** (instances keep working).
- [ ] **A project setting for the default storage** to use.

**Shell:**
- [ ] **Tabs on the left side of the split only** (repeats the item under Sheets and drawings).
- [ ] **A latched Pan tool** (mainly for touch)? Decide.
- [ ] **A menu bar for cad?** Decide.
- [ ] **Guides?** Decide (dropped in `pages-features.md`; re-check).

**Viewports and sections:**
- [ ] **Viewport lock, if views are read-only?** And how is a layer locked while other users edit on it? Decide.
- [ ] **A list of the viewports linked to each section?** Decide.

**Versions:**
- [ ] **Revert to an earlier issue or drawing**, after saving the current state if it has changes. Check whether cad
  can.

**Export:**
- [ ] **No SVG export** (not needed).
- [ ] **PNG export, or copy the current view to the clipboard.** Consider.
- [ ] **DXF scale:** must text, dimensions and arrows be sized for each viewport's 1:N, or is today's fixed 1:100 OK?
  Decide.
- [ ] **How much code would DXF export / import add?** Check.

### Sheets and drawings
- [ ] **A sheet from the current view:** make a new sheet with a viewport of the current model view, or copy the view
  and paste it as a viewport on an existing sheet.
- [ ] **Plan printing selected sheets** (think it through before building).
- [ ] **Simplify drawing versions.**
- [ ] **Tabs for quick access to drawings**, on the LEFT side of the split only (both sides is too complex), instead of
  jumping around the tree / list.
- [ ] **Drawing list: categories, tags, filter, sort.**
- [ ] **Consider the tree** (a tree navigator for drawings).
