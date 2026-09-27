# Pages tool — changelog

A readable, curated history of the major milestones (R11). For the exact, per-commit record use
`git log -- 'src/routes/projects/[pid]/pages/'`; `todo.md` keeps the long historical done-log and the
open items; `review.md §0a` tracks which review findings are closed.

## Round 17 (2026-09-27) — multi-select in lists
- **One list multi-select rule** (`$lib/ui/listSelect.ts`, unit-tested): Ctrl/⌘+click toggles, Shift+click takes the
  range from the last item (in the order shown), Ctrl+Shift adds the range.
- **Layers**: select several; the eye / lock of any selected layer sets them all (in a sheet viewport the eye freezes them
  there); dragging one moves them all (order kept); a bar shows / hides / locks / unlocks / colours / deletes them (the
  active layer stays; click again when they hold items). A plain click still makes a layer active.
- **Drawings tree**: places AND sheets multi-select (was sheets only); dragging one moves the block (rows inside a
  selected place go with it); the ⋮ menu of a selected row deletes them all (sheets first, then places deepest first —
  a place still holding things stays and says why).
- **File › Drawings**: Shift+click a checkbox selects the range.
- **Tool strip regrouped** into sections (draw · building · services · annotate · modify): Door, Window and Hole are
  tools of their own (the Opening tool with that type) in an Openings group with Penetration; Wall stands alone;
  Box (the Furniture tool — the old 2D Box was merged into it in R4) + Rack; Trunk + Pipe; Dimension + Measure + H / V
  guides in one group. Insert menu lists the same tools (Box, Wall, Door, Window, Hole, Penetration, Trunk, Pipe,
  guides, Section — Trunk / Rack there now work); DOOR / WINDOW commands.
- Strip follow-up: Text before Line; Wall + Trunk + Pipe one group again; the box is just "Box"; Penetration removed
  (PEN didn't work — todo). **Alt while dragging** a shape / 3D object (move or grip) turns grid + object snap off.
- **Fix — duplicate place models**: a closing project load could drop models from the registry AFTER a re-opened
  load had them (a late async cleanup), so opening a place found "no model" and created + stored an empty duplicate
  (Test Project got a second, empty "4F"). The registry now tracks which load owns each model, and a place's model is
  looked up in the store's own list before one is ever created.
- **Replace / insert PDFs and pictures from Uploads** (`ui/pdfFiles.ts`, `parts/UploadPicker.svelte`): Properties ›
  IMAGE › File › Replace… swaps an image's PDF page / picture for another uploaded one (this project's first, then other
  projects' — only referenced), placed by its Uploads calibration (else keeping the size); layer, opacity, live stay.
  Insert › From Uploads… adds one (a PDF follows its calibration live; in an elevation it stands on the ground line).
  Tested: Test Project › 4F's floorplan replaced with Project Journey's "L3303 Plan Clean-EIRE.pdf".
- **Pictures / PDFs from this computer are saved**: Insert › Image… (several, pictures or PDFs), a paste (Ctrl+V a
  screenshot — at the cursor) and a drag-and-drop from the OS onto a viewport (at the drop point) all upload the file
  to the project's Uploads (a `files` doc under a free name — never overwriting another file) and insert it on the
  active layer; before, Image… kept it only until a reload and pastes never showed in Uploads. A drop outside a
  viewport no longer makes the browser open the file.
- **Ctrl+A / SELECTALL** selects every shape AND 3D object on visible, unlocked layers (was shapes only).
- Fix: splitting / unsplitting the editor no longer resets a MODEL tab's pan / zoom / orbit (only paper sheets refit).
- Fix: a model view's content stays put ON SCREEN when its pane is resized (split, the split bar, side panels) — the
  pane reveals / covers more of the drawing instead of sliding it (Viewport.svelte resize compensation).

## Round 16 (2026-09-27) — the editing merge, phases 3–4 (done)
- **3D objects run on the engine** (walls, boxes, conduits in plan / elevation): body move with grid snap anchored on
  the first object, Ctrl-drag copy, arrow nudge, Ctrl+D, and the selection box now takes objects too. Shapes and
  objects can be selected TOGETHER (Shift / Ctrl+click or a box) and move / copy / nudge / delete as one undo step.
  Rack devices still slide only up / down their rack; attached conduit ends still follow. The old `MDrag` path is gone.
- **The command line works on paper** (`ui/paperCmd.ts`): with no viewport active, MOVE / COPY (multiple) / ARRAY
  (rectangular) / ALIGN / DIST / ERASE / select-by-point act on the selected viewport frames in paper mm (Y up), each
  one undo step, through the same engine as the mouse; ROTATE / SCALE / drawing commands say "Not on paper — enter a
  viewport". Clicked points go to the running command.
- **Viewport tool uses the Rectangle gesture**: ACAD on = click one corner, click the other (the box follows the
  cursor); EOS = press-drag. Corners snap to the paper lines (Alt off); Esc cancels.

## Round 15 (2026-09-27) — the editing merge, phases 0–2
- **One editing engine** (`ui/itemEdit.svelte.ts`, `editing-merge-plan.md`): move / grip / Ctrl-drag copy / Shift-ORTHO
  axis lock / marquee (window / crossing) / arrow nudge / Ctrl+D are written ONCE and driven through an ItemSource per
  kind. Shapes run on it (no behaviour change); unit-tested.
- **Sheet viewports run on the same engine**: move and corner-resize (paper snaps, Alt off, Shift square), Ctrl-drag
  leaves a copy (with its view), Shift+click borders / a marquee select SEVERAL, arrow keys nudge (1 mm, Shift 10 mm),
  Delete removes all selected — each one undo step. PaperPage's own drag / marquee code is gone.

## Round 14 (2026-09-26) — view-direction previews, layer fixes
- **Direction changes on a sheet viewport are previews**: the ViewCube / 3D popout change shows a "Preview · was
  FRONT — Keep / Revert" chip under the ViewCube; Keep makes it stick (one undo step), Revert — or leaving the viewport
  / switching tab — puts the old direction back.
- **Layers**: with a viewport active the eye IS the VP freeze now (a snowflake in the eye when frozen there; Shift+click
  = everywhere) — the separate snowflake column is gone. LAYMCUR / the Layers crosshair pick walls, boxes and trunks too.
  The ✓ beside Properties › Layer sits on the same line.
- **Delete** removes a selected sheet viewport even while another viewport is active.
- Elevation / 3D views on paper have a white background; the viewport scale label no longer prints.

## Round 13 (2026-09-26) — sheet viewports, sections, sharing, print
- **Viewport copies**: Ctrl-drag a sheet viewport's border to leave a copy behind; copy / paste / duplicate carry the
  content view (pan / zoom + 3D orbit), so the copy shows the same thing. Switching a viewport to a projection it has
  no view for yet centres its content at the viewport's scale (instead of carrying a point that could be empty).
- **Plan images** (floorplan PDFs) show only in the plan — not in elevations / 3D.
- **Share links**: the URL carries the selected tree item (`?node=` a place, `?doc=` a drawing); opening the link
  selects / opens it (before the one remembered in the browser).
- **Print**: the viewport number sits top-left and its EFFECTIVE scale (1:N ÷ content zoom) top-right, as plain text
  when printed; the title block sits ON the margin border; new sheets default to a 5 mm margin.
- **Layers on paper**: with a sheet viewport active the eye hides the layer in THAT viewport only (VP freeze, teal
  eye); Shift+click hides it everywhere. **Make a shape's layer current**: ✓ beside Properties › Layer, or the
  crosshair in the Layers panel (LAYMCUR).
- **Sections**: the floating toolbar sits on the selected box again on a zoomed sheet; "drop" makes a viewport sized
  to the elevation (along × height), fitted to the cut, and LINKED to the section (`SheetFrame.section`) — editing the
  box updates it live; the elevation's ground line spans the cut and its label is 2.5 paper mm.

## Round 12 (2026-09-26) — 3D popout, opening bar, desk holes, WIRE, paste at cursor
- **3D popout** under the ViewCube: 3D = perspective (now the default), ISO = parallel iso, WIRE = see-through
  wireframe (per viewport; PERSPECTIVE on the command line switches 3D / ISO).
- **Opening bar** (the Opening tool): Door / Window / Rect hole, height and sill — the next opening box takes them
  (`ui/openingSpec.svelte.ts`). Round holes aren't offered (walls are cut into box panels).
- **Holes through furniture**: an opening that runs right through a plain box (its full depth or width) splits it
  into solid parts — a desk's legs and top — in 3D and elevations (`projection.ts prismPanels`); openings that
  don't cross a wall show as a dashed outline instead of a masked hole.
- **WIRE** (status bar): boxes pick only on their outline in plan / elevation, so shapes under or inside them can be
  picked (OpenCad's wire).
- **Zoom to the selection**: ZOOM › Object (Z, Enter with something selected).
- **Paste at the cursor**: Ctrl+Shift+V centres the pasted content on the cursor (Ctrl+V keeps the position).
- **Sheet viewports**: Alt+wheel steps the scale, Alt+drag pans the contents — without entering the viewport.
- **Measure** button (runs DIST). Icons: the tool strip shows OpenCad's icons again (a stale compile), Opening = a box
  with diagonals; connection-point × marks are half the size.

## Round 11 (2026-09-26) — OpenCad picks: icons, penetrations, alignment tracking, steadier orbit
- **Icons from OpenCad** (lucide): Wall = brick wall, Box = box, Opening = door, Dimension = ruler, plus new tool
  buttons **Arc** (in Shapes, runs ARC) and **Format painter** (runs MATCHPROP). The Guide tool moved to a crosshair.
- **Penetrations** (O2): the PEN command / the Penetration button (Openings group) places core-drill symbols —
  diameter and through wall / slab asked once, then click each; tags count on (P01, P02 …). A built-in annotative
  block (`penetration`: ring + crosshair, TAG / DIA / THROUGH attributes).
- **Alignment tracking** (O9, OTRACK in the status bar, on by default): while drawing / placing, the cursor lines up
  with a nearby snap point it is level with (same x and / or y) and a dashed guide shows it; Shift / ORTHO and a
  real object snap take precedence; the free axis still grid-snaps.
- **Orbit without wobble**: the 3D view now centres on the projection of the content's 3D centre (a fixed point), and
  an orbit drag pans so the point in the middle of the view stays there — you orbit around what you're looking at.
- **Function keys**: F8 = ORTHO, F9 = SNAP (AutoCAD's), with F1 / F10; the Help dialog lists them (and the browser's
  own F-keys Pages leaves alone).

## Round 10 (2026-09-26) — extension lines, edit in place, more connection points, perspective, hatch
- **DIMBASELINE** stacks draw real **extension lines** back to the measured points (`dimExt`, signed mm); any
  dimension can have them (Properties › Ext. lines); DXF too.
- **Edit in place**: double-click a dimension to edit its text override (empty = the length), or a line's label;
  double-click a wrapped text (Shift+double-click a plain one) to open the large editor. The editor has a plain
  mode for unwrapped text, and the Properties pencil opens the same dialog (`ui/textDialog.svelte.ts`).
- **Connection points** beyond boxes and outlets: a wall's nodes and segment midpoints, another conduit's free ends
  (a trunk feeding a pipe of another size), and faceplate / custom blocks. Dragging a wall / conduit node or
  resizing a box carries what's attached to it. A run never attaches to itself, and a compatible run's end still
  joins instead.
- **Faster snapping / picking** (§5): shape bounding boxes, snap points and note layouts are cached per shape; the
  hover pick and the object snap skip shapes whose box is out of reach.
- **Shift / ORTHO** now constrain Wall, Trunk and Pipe drawing (15° steps / H-V), as they did lines.
- **Keep your place across views**: switching plan ↔ elevations (the ViewCube) re-centres the new view on the same
  3D point at the same zoom (the height comes from the last elevation you looked at).
- **Perspective 3D**: a **Persp** button under the ViewCube in the 3D view (and the PERSPECTIVE command) switches
  that viewport between the parallel iso and a perspective camera aimed at the model's content; picking follows it.
- **Trunk / Pipe spec bar** (F1): arming Trunk or Pipe shows a bar over the pane: a catalogue (PF / E conduit,
  trunking, cable tray, cable ladder, or Custom), Rect / Round, W × H (Ø for round), location (under floor, ceiling
  plenum, below ceiling, on wall, custom Z) and the resulting underside height from the floor's levels. Remembered per
  tool (`ui/trunkSpec.svelte.ts`); new runs are drawn with it.
- **Copy / paste 3D objects** (walls, boxes / furniture / racks, trunks / pipes): Ctrl+C / X / V and Edit › Copy /
  Cut / Paste carry the selected model objects too, over the system clipboard, so they paste into another model,
  tab or project. A paste gives them new ids — offset 5 paper mm only when pasted back into the model they came from (into any other model, tab or project they keep their exact position, shapes too) — keeps attachments between copied
  things and lets go of the rest, and matches each object's layer by id, then by name.
  **From the Sheets tool:** Ctrl+C (or Copy) in a Sheets 3D viewport also puts the objects on the system clipboard in
  this format, mirrored from Sheets' y-up plan to Pages' y-down (`sheets/tools/model3d/pagesClip.ts`).
- **Doors / windows are real holes in 3D** (after OpenCad's wall builder): in the 3D / perspective view each wall
  segment an opening box crosses is built as solid panels around it — jambs either side, a header above and (a
  window) a sill below — so you see through the hole and its reveals. Picking in 3D goes through the hole too.
  Plan / elevations keep their masked openings. (`3dview/projection.ts` openingCuts / segmentGaps / wallBoxes)
- **HATCH (2D)**: a rect, ellipse or closed polyline can carry a line pattern (horizontal, vertical, grid, diagonal,
  diagonal cross) at a spacing in model mm (default 300, e.g. cable-ladder rungs). Properties › HATCH; DXF as lines.

## Round 9 (2026-09-26) — status-bar counts, NOTE → TEXT, graph AUDIT
- **Status-bar counts** (K1): Outlets / Conduits / Racks totals for the active model. With a selection, they
  count only the selection, tagged SEL.
- **NOTE merged into TEXT**: a note is now a TEXT with a wrap width (`noteW`, `isNote()`); stored / copied
  `type: 'note'` shapes migrate on load. Properties › TEXT has a **Wrap** switch (on = wrapped markdown with a width
  and an optional frame, off = plain lines that can be a callout). The NOTE command and pasted multi-line text make
  a wrapped text. Labels stay a plain field on other objects.
- **AUDIT** also checks the active model's walls / conduits (`3dview/graphAudit.ts`): segments naming missing nodes,
  zero-length and duplicate segments, nodes on top of each other, orphan nodes, empty runs, ends attached to a box /
  outlet that's gone, devices in a missing rack, panel ports allocated to a missing outlet. It lists them and
  offers a fix (one undo step).
- **New sheet here** fits the viewport to the place's plan: 3D objects plus the plan's shapes and floorplan image
  (a zone far from the drawing centre used to open half off the frame).

## Round 8 (2026-09-26) — notes blocks, rack presets, pasted images to storage
- **NOTE** (K3): a notes block shape — markdown (# headings, - bullets, 1. lists, | tables | with a |---| header row,
  **bold**) laid out in paper mm and wrapped to its width (`ui/noteLayout.ts`); annotative, optional frame. Grips
  move it / set the width. Properties › NOTE edits the text; DXF as TEXT + lines.
- **NOTE editor** (the pencil beside Properties › NOTE): markdown on the left, a live preview on the right. Pasting
  from Word / Google Docs / a web page keeps headings, bold (inline too), lists and tables (`ui/htmlToMd.ts`); Excel
  cells become a table.
- **Text with office apps**:
  - copied shapes also go out as readable text + HTML (Word / Notepad get the words; Excel gets a note's table as
    cells), with our shapes hidden in the HTML;
  - text pasted from another app into a view becomes a text shape or a NOTE at the cursor.
- **RACK presets** (Server / Network / Deep / Wall / Custom) + a Rack button in the tool strip's Boxes group.
- **A pasted image** goes to file storage (UploadThing); the image shape points at its URL on the active layer.
- **Typing** reaches the command line from anywhere but a text field (after a tree click it stayed with the tree).

## Round 7 (2026-09-25) — racks, pages between projects, fixes
- **RACK**: U / width / depth (remembered), then click centres. Each is a real rack object (Box + rack data, R01,
  R02 …) with devices in Properties; plan only.
- **Pages between projects**: tree › a sheet › Copy page, then tree › a place › Paste page here (another project /
  tab / browser). Copies the sheet, its frames and their annotations; a frame whose model isn't there shows Missing
  model.
- **Viewport resize** keeps the drawing still on the paper.
- **Number inputs**: small right padding, and an empty field types from the left (the caret hid against Chrome's
  spin arrows).
- **Structure lines** in elevations are 1 px screen-constant, in darker tones (they had shrunk to hairlines in 1:100
  viewports).
- **Draw tools** show their step in the command line; a Properties field commits before a press re-selects.

## Round 6 (2026-09-25) — angles, named views, polyline corners, viewport clipboard, structure
- **DIMANGULAR**: two lines, then where the arc goes (which of the four angles). The result is an arc plus its
  figure, grouped.
- **VIEW** (named views): save / restore / delete a drawing's zoom + pan + scale. Stored per project + drawing +
  viewport, in this browser.
- **FILLET / CHAMFER on a polyline corner**: pick its two segments; the arc is sampled into the polyline
  (`modify.cornerInPolyline`).
- **Viewport frames on the system clipboard**: copying a frame on paper also writes it out, so Ctrl+V on paper can
  take frames from another tab or browser.
- **Building structure in elevations**, from the storeys: slab bands + raised-floor lines on layer A-FLOR, ceiling
  lines on A-CLNG — shown while those layers are on (`vpView.structure`).
- A Properties field being edited commits before a press on the drawing re-selects (it used to save onto the newly
  clicked shape).

## Round 5 (2026-09-25) — clouds, dimensions, stretch, quick select, blocks audit, system clipboard
- **Draw tools prompt in the command line** ("Line: specify next point" [Close/Undo] — clickable).
- **REVCLOUD**: two corners, Polygonal (points; Enter closes) or Object (a rect / closed polyline). Clouds now
  work on closed polylines too, bulging outward whichever way the outline winds (`cloudPathPts`).
- **DIMCONTINUE / DIMBASELINE** (from the selected or picked dimension; baseline stacks 8 paper mm apart),
  **DIMRADIUS / DIMDIAMETER** on arcs and circles. A dimension's Text is a template: `<>` = the length (R<>, Ø<>).
- **STRETCH**: a crossing window. What's wholly inside moves; points / edges inside a crossing shape move
  (`modify.stretchEnt`).
- **QSELECT / FILTER**: every shape here of a type, layer, colour or block.
- **PURGE** (unused custom blocks — it asks, and warns that the library is shared by every project) and **AUDIT**
  (block inserts whose block is missing; the ones in view get selected).
- **System clipboard**: Ctrl+C writes the shapes as marked JSON text as well, so Ctrl+V pastes them in another
  browser tab or project (the paste event reads it with no permission prompt). Ctrl+V with an image on the
  clipboard (a screenshot) inserts it as an image shape.
- A right + wheel zoom (or a right-drag pan) no longer counts as a right-click, so it doesn't cancel a draw.

## Round 4 (2026-09-25) — more drafting commands, riser editing, POLAR
- **JOIN**: lines that meet end to end → one polyline. **EXPLODE**: a block → its shapes + attribute texts; a
  polyline → its segments; a rectangle → 4 lines; a group → ungrouped (`ui/explode.ts`).
- **FILLET** (Radius; 0 = a clean corner, else a tangent arc) and **CHAMFER** (two distances). Both take two
  2-point lines, picked on the side to keep (`modify.corner`).
- **LAYOFF / LAYFRZ / LAYISO / LAYUNISO / LAYON**. LAYFRZ is VP Freeze in the active viewport, else off.
- **POLAR tracking** (status bar POLAR, F10, the POLAR command): the rubber band slides onto the nearest 15° ray
  (within 4°), with a dashed tracking line.
- **Command line**:
  - a prompt's [options] are clickable;
  - ▴ expands the whole history;
  - PLAN / FRONT / … on a sheet need an active viewport (they no longer re-aim the first one).
- **B4**: a sheet's viewports are numbered in reading order and renumbered as they move (`ui/frameNumber.ts`).
- **F4**: Alt-drag a node inside a run splits it there. The selected segment's end comes away; otherwise the segment
  pointing the way you drag (`modelEdit.splitNode`).
- **Riser frames with hidden floors**: shapes are selectable and editable again (click / marquee / grips). The view
  works on the drawn heights and writes the real ones back (`storeyMap.unmap`).

## Round 3 (2026-09-25) — layout tools, help, connection points, logo storage
- **Align / distribute** (`ui/arrange.ts`): Properties › ARRANGE › Align (left / centre / right / top / middle /
  bottom — to the extreme shape or the centre line) and Distribute (equal gaps, 3+). Also the ALIGN command. A group
  moves as one.
- **ARRAY**: Rectangular (columns × rows × spacing) or Polar (centre, count, angle to fill), in one undo step.
  Outlet copies get the next free labels.
- **MIRROR**: about a two-point line, keeping or erasing the source (`groupXf.mirrorAbout`). Blocks flip; text and
  images move but stay unmirrored.
- **MATCHPROP** (the layer + style of one shape onto others) and **SELECTSIMILAR** (the same type + layer / block).
  The "Select shapes" prompt also takes a typed point.
- **Help** (`parts/HelpDialog.svelte`, modelled on Kestrel's; the title bar ?, F1 or HELP):
  - "How do I…" answers;
  - keys & mouse;
  - the command line, with examples;
  - every command (click to run it);
  - one search box filters all of it.
- **Connection points** (F6) are ratios of the box: U / V of the width / depth, so they survive a resize; legacy mm
  offsets are still read. Properties › Place… then click on the plan to add points (they snap).
- **Title-block logos in file storage** (UploadThing's image route, like Uploads). The project doc keeps only the URL
  + key. An upload failure keeps an inline copy; "Move to storage" uploads a logo still stored inline.

## Command line, round 2 (2026-09-25) — AutoCAD-style commands (from the todo.md pick-list)
- **Scripted commands** (`ui/cmdScripts.ts`): async scripts that ask "Specify base point:" etc.; an ask is answered
  by typed input (a point, a number, an option letter, text, Enter) or a click in the view, which is snapped, shows a
  rubber band from the base point and a ghost preview (`cmdBus.pick`). Right-click / Enter / Esc in the view answer
  or cancel. A typed point on a shape picks it; `;;` in a typed line is an Enter (AutoCAD script style).
- **Base-point MOVE / COPY / ROTATE / SCALE**: pick a base point, then a second point / angle / factor. COPY places
  copies until Enter (multiple).
- **Space = Enter** in ACAD mode (not while typing a name).
- **Draw**:
  - ARC: a new `arc` shape, stored as three points on it. It is drawn, picked, snapped (ends / middle / centre),
    gripped, moved / rotated / scaled and exported to DXF.
  - CIRCLE: centre + radius, or Diameter.
  - POLYGON: sides, centre, inscribed / circumscribed, radius.
  - LEADER: arrowhead, landing, text.
- **Modify** (geometry in `ui/modify.ts`):
  - OFFSET: lines / polylines (mitred), rectangles / ellipses (grow / shrink), arcs (radius).
  - TRIM: quick mode; click the part of a line to remove.
  - EXTEND: the nearer end grows to the next shape.
  - BREAK: between two points, or a split at one.
  - LENGTHEN: DElta / Percent / Total, for lines and arcs.
  - DRAWORDER.
- **Inquiry / view**: DIST; ZOOM (window / Extents / Previous), ZW, ZP.
- **Layers**: NEWLAYER (named, made current) and LAYMCUR.
- **File**:
  - SVGOUT / PNGOUT: the active view without the screen-only UI (the Viewport's `.vp-screen` group); PNG at 2×.
  - PDF: print, then Save as PDF.
  - SAVE / NEW / OPEN.
- **E5**: several outlets / block inserts are edited together in Properties (block, shared attributes, scale,
  mirror). A field they disagree on shows “— mixed —”.
- **F4**: select a segment vs the full trunk. A click selects the run; a second click selects the segment (Delete
  removes just it).

## Command line (2026-09-25) — Kestrel's, ported
- A command line above the status bar (`parts/CommandLine.svelte`): typing over the canvas lands there; Tab
  completes, ↑/↓ walk the suggestions / history, Enter runs (an empty Enter finishes a draw, else repeats).
- Vocabulary + parsing in `ui/commands.ts` (draw tools, MOVE / ROTATE / SCALE / ERASE / COPY / GROUP, views,
  toggles, panels, files; points `X,Y` · `@DX,DY` · `D<A` · a bare number = distance toward the cursor; `C` / `U`
  while drawing). `ui/commandRunner.svelte.ts` runs a line; points / selection edits go to the focused pane's active
  viewport through `ui/cmdBus.svelte.ts` (`VpInteraction.cmdTarget`, user coords Y-up).

## Parity pick-list, large + medium items (2026-09-25) — parity-review.md
- **Export**: File › Export… writes the active view as DXF (`exportDxf.ts`); File › Outlet Schedule… writes
  the model's outlets to Excel (`store/outletSchedule.ts`).
- **Sheets**:
  - duplicate a sheet;
  - copy / cut / paste / duplicate a viewport frame across sheets (`ui/frameClip.ts`);
  - a revision list (edit / delete / set current, P1 → P2 codes) and a revision table in the title block;
  - link sheets that open another tool;
  - print a set of sheets as one job, each at its own paper size (`parts/PrintBook.svelte`).
- **Title block**: our + the client's logos; strip / band / corner-box layouts.
- **Blocks** (intelligent blocks):
  - symbols (north arrow, section / detail / photo markers, elevation tags, faceplate, door), and a marker's
    LINK to a sheet or a URL;
  - a Blocks panel to place / drag in / save the selection as a block;
  - a legend built from the model's layers.
- **Annotations**:
  - floor-tile grids on a rectangle;
  - auto-number a selection;
  - project drawing defaults (Format menu), including a dimension unit;
  - a group transform box that rotates about the barycentre / scales from a corner. Multi-shape edits are
    one undo step.
- **Outlets**:
  - Insert › Outlet with sticky ports / type / layer;
  - the next label on placing;
  - walk renumber;
  - allocate outlets to a patch panel (`store/allocate.ts`).
- **Conduits**:
  - cable fill and a fill-rate viewport (`3dview/fill.ts`);
  - per-corner bend handles;
  - merge / join runs (`3dview/graphJoin.ts`);
  - connection points on boxes and outlets that conduit ends follow (`3dview/connect.ts`).
- **Racks**: a rack row becomes a 'rack' model with devices on U (`store/racksImport.ts`).
- **Views**:
  - per viewport, hidden-line removal, B/W and a plan cut band;
  - images inserted in an elevation stand on that elevation;
  - floorplans follow the Uploads calibration live, with an origin crosshair (`ui/floorplanLink.ts`).
- **Review round 2 fixes**:
  - Undo:
    - a new rack row is seeded before it enters the undo history;
    - async floorplan attaches and live calibration moves go into every undo step (`timeline.amendModel`);
    - a walk renumber folds into one step without a long-open gesture (`timeline.squashSince`);
    - moving the undo pointer closes an open gesture.
  - Overwriting a revision rewrites that revision's own version.
  - A copied frame carries its model.
  - Attached conduit ends follow every move (via DocEdit).
  - Logos are size-capped.
  - Group drags do one array pass per move.
- **Refactor**:
  - `canvasNav.svelte.ts` and `pageActions.ts` (out of `+page`);
  - `floorplans.svelte.ts` (out of `pagesProject`);
  - `ui/vpModelEdit.ts` (out of `vpInteraction`).

## Parity pick-list, small items (2026-09-25) — parity-review.md
- **Nav bar Pan / Orbit** are latched tools: a left drag (or one finger) pans / orbits; Esc, a right-click or a
  tool pick drops them.
- **Title block**:
  - a company block (name / address / contact);
  - Show toggles (logo / company / fields);
  - an optional printed margin border;
  - a per-sheet "shown on this sheet" switch;
  - frames snap to the drawing-area and title-block edges.
- **Sheets**: viewport labels print and have an editable Label; Ctrl/Shift-click sheets in the tree and drag
  them as a block; PageUp / PageDown page-pan the sheet.
- **Annotations**:
  - line text labels (start / middle / end);
  - a callout frame (box / underline / none);
  - type a dimension's length.

  The Sheets import keeps all three.
- **Editing**:
  - repeat clicks step down through overlapping shapes;
  - copied outlets get the next free label;
  - model objects Ctrl/Shift-click multi-select and move together;
  - shared layer / colour / base Z / height edits;
  - a model object's own colour;
  - greyscale images.
- **Layers**: the active layer can't be deleted; a layer with items asks, then takes them with it. Nothing is
  drawn onto a hidden or locked layer.
- **Keys and prompts**: `+` / `-` / Home zoom keys; a point count while drawing a run.
- **Refactor**:
  - `PropertiesPanel` is a dispatcher over `parts/props/` (Frame, ModelObj, ModelObjs, Place, Page, Ent, with
    shared `props.css` + `fields.ts`);
  - `docEdit.svelte.ts` holds the document edits (out of `+page`);
  - `projectImports.svelte.ts` holds the phase-8 imports (out of `pagesProject`).

## Drawings, models, places (2026-09-24) — drawings-plan.md phases 1–5
- Places, stored models (`projects/{pid}/models`) and sheets (registry `toolType 'pages'`); floorplan PDFs as
  image shapes; a global **Blocks** library with `insert` shapes; **Outlets import** (outlets → block inserts,
  trunks → conduits) per place; model views restored on reload; a click opens any place with a model.
- **Title block** (phase 5): one template per project (`pages.titleBlock`), auto-filled per sheet (project,
  title, location, Dwg №, rev, date, scale, size, drawn); edited in a sheet's page Properties.
- **Drawings dialog** (phase 6): sheets register (search, filters, grouping, sort, inline + bulk edit, renumber
  patterns, tags, archive, Excel export), archived list with restore / hard delete, and a Models tab (usage,
  archive / restore, frames showing a Missing model).
- **History** (phase 7): model versions (1.0 first; majors keep a full copy you can restore, minors are notes;
  "edited since" by content hash), sheet revisions (Issue rev N / Overwrite rev N, blocked until every model is at
  an unedited major — with Overwrite / Open per model), title block rev + date from the latest issue, draft
  packages of issued sheets. The mock revisions are gone.
- **Sheets import** (phase 8): a Sheets-tool sheet → a Pages sheet in a chosen place (drawings dialog › Import
  from Sheets), or another tool's register drawing → a one-frame Pages sheet (tree ⋮). Outlets viewports keep
  their scale + framing on the place model, with their annotations (text, lines, dims, rects / clouds, ellipses,
  callouts, images, outlet symbols as block inserts) scoped to the frame; unmappable viewports show "Not mapped
  yet"; a note lists everything that didn't map.
- `+page.svelte` split: `pagesProject.svelte.ts` (project side), `history.svelte.ts` (undo timeline),
  `ui/clipboard.ts` — 1640 → ~1200 lines.

## Refactors — code-review 2 R-items (2026-09-22 → 09-24)
Work was split across sessions: one spec'd and diff-reviewed, one implemented, one live-gated each
commit in the browser (`review.md §0a` holds the gate records). The working notes were in `HANDOFF.md`,
now deleted; it's in git history.
- **R1 Viewport split** (`refactor-plan.md` executed, then deleted — it's in git history before this
  commit): `ui/Viewport.svelte` 2209 → 90 lines. Pure modules `annotations.ts`, `mapper.ts` (one layout
  read per event), `hit.ts` (+ `pickAt`), `grips.ts`, `snap.ts`, `place.ts`, `gestures.ts`
  (`beginPointerDrag` + `DragRegistry`), `render/EntRender.svelte`. Then two classes: `vpView.svelte.ts`
  (view model) and `vpInteraction.svelte.ts` (pointer/key state machine). Plus `vpPrompt.ts`, `vpTypes.ts`
  and `render/VpMarks`/`VpOverlays`/`VpWidgets`.
- **R2** `viewState.svelte.ts`, `doc.svelte.ts` (PageDoc) and one `session` object. **R3** one Selection
  model (`selection.ts`, per-viewport `editor.sel`, including frames). **R4** the mock `'box'` Ent removed (3D
  solids are model prisms) and `line` retired for a 2-point polyline. **R5** one layer model per model. **R6** `modelEdit.ts` store mutations; `VpOn` = view events,
  plus an `Editor` for document edits. **R7** one projection path for render and edit. **R9** `+page`
  split (`Pane`, `ToolStrip`, `TabMenu`, `printing.ts`, the `Workspace` object).
- **R8-lite** `PaperPage` frames use the shared modules: `inBox`/`marqueeSelect` picking, `gripsLocal`
  resize, and `frameSnapDelta` paper-edge/margin/5 mm snap with Alt bypass. Full R8 (sheet = Viewport) is parked.
- **P1–P6** per-event mapper, hover via `pickAt` once per frame, history folding, cached iso pick faces and
  grips, and a pages-scoped pre-commit gate (`pnpm check:pages`).

## Features & fixes (2026-09-22 → 09-24)
- Bugs B19–B31 fixed. Highlights:
  - drag threshold + Properties remount (B19)
  - odd-sided prisms (B21)
  - elevation snap points sit on the drawn ground line, not in empty space (B22)
  - Shift-press toggle (B25)
  - first section/guide lost behind the `$state` proxy (B26)
  - stable drawing ids (B18)
  - dark AutoCAD-style model space (B31)
- **K5** model corners/nodes are OSNAP targets.
- **VP Freeze**: hide a layer in one sheet frame only.
- Split view keeps the left pane.
- One rotate/Shift-15° rule for every handle.
- Rack tabs at 1:10 with an editable grid step.
- XP7/19/22/26/32/33: margins, custom + Fit scale, viewport lock, frame mm, line types, line-end heads.
- **Real project data**:
  - File › Open Project (Ctrl+O)
  - project tree from Firestore, with buildings (create, drag floors, reorder)
  - Properties that edit project/building/floor/zone/room names
  - clicking a floor opens its model with the calibrated floorplan PDF on a Background layer
  - the last tree item is restored on load
- Zoom up to 2000 % everywhere (one clamp in `constants.ts`).

## Code-review 2 fixes (2026-09-22)
- **B1** svelte-check green (dropped the instance-script type re-export).
- **B2** paper frames render true 1:N scale (`PAPER_PX_PER_MM`, not the mock `BASE`).
- **B3** annotative sizing — dims/text/arrows/clouds are a fixed size on paper (`paperMm`), not on screen.
- **B4** one global undo timeline (per-tab history no longer reverts other tabs' edits).
- **B5** sections live in the model (`Model.sections`) — model-scoped + undoable.
- **B6** closing/reopening a tab keeps the page (document state keyed by drawing id).
- **B7/B9/B10** hit-testing follows paint order, one `tolMm` pick tolerance, tilted prisms pick/grip on their true silhouette.
- **B8** Edit-menu Cut/Copy/Paste/Delete wired.
- **B11/B12** removed the dead FrameSel path + other dead code/props/CSS.
- **B13** one nanoid id generator (`ids.ts`). **B14** fixed by B4. **B15** one home for the duplicated types (`types.ts`).
- **B16** the Layers panel can hide/lock model objects (walls/furniture/trunks).
- **R11** README file map + this changelog. **R1** started: `ui/annotations.ts` extracted.

## Capability milestones (earlier, from `todo.md` / model-plan)
- Ported the model3d engine into `3dview/` — a real 3D wall/conduit/prism model with plan/elevation/iso
  projection, hidden-line + shaded iso, section boxes driving live elevations.
- Data into the model: entities, guides and sections live in `Model`, shared across every view of a floor;
  undo rides one model snapshot.
- Multi-viewport paper space (draggable frames, per-frame scale/projection/clip), split panes, a drawing
  navigator, a title block, and a model registry (a floor + a rack as separate models in one sheet).
- Real dimensions (arrows + extension ticks + measured length), revision clouds, callouts, arrows.
- Grid + object snap, rotated-shape grips (provably fixed anchor), per-axis (X/Y/Z) prism rotation with
  rotate handles in plan + elevation, elevation depth-snap for drawing conduits across views.
- Image underlays with origin/scale/crop calibration; layers with groups + view presets.
- Touch: 1-finger draw/select, 2-finger navigate, pointer capture (the reference touch model in the app).
- Object styling (colour/weight/layer), copy/paste, group/ungroup, z-order, tool fly-outs with touch parity.
