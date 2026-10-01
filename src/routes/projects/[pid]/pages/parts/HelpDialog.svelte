<script lang="ts">
	// HELP (the title bar's ?, F1, or the HELP command) — modelled on Kestrel CAD's help dialog: the keyboard / mouse
	// shortcuts, typing into the command line, "how do I…" answers, and every command (from ui/commands.ts, so it
	// stays current; click one to run it). One search box filters all of it.
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import { COMMANDS, primaryName, type CmdDef } from '../ui/commands'

	let { onclose, onrun }: { onclose: () => void; onrun?: (id: string) => void } = $props()

	const SHORTCUTS: [string, string][] = [
		['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Find a drawing', 'Ctrl+K'], ['Delete the selection', 'Delete'],
		['Copy / Cut / Paste', 'Ctrl+C / X / V'], ['Duplicate', 'Ctrl+D'], ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'],
		['Draw order: forward / to front', 'Ctrl+] / Ctrl+Shift+]'], ['Draw order: backward / to back', 'Ctrl+[ / Ctrl+Shift+['],
		['Nudge (× 10 with Shift)', 'Arrow keys'], ['Zoom in / out / fit', '+ / − / Home'], ['Pan', 'Right- or middle-drag'],
		['Zoom at the cursor', 'Wheel (ACAD on)'], ['Keep square / 15° / H-V', 'Shift while drawing'],
		['Finish a line / run', 'Enter · double-click · right-click'], ['Cancel · back to Select · deselect', 'Esc (repeat)'],
		['Edit text / a label in place (outlet, block, box, rack, line, dimension)', 'Double-click it · F2 (the selected one)'], ['…then the next / previous one of the same kind (reading order)', 'Tab / Shift+Tab in the label editor'], ['Open a linked symbol', 'Click its badge (hover) · double-click it'], ['Align / distribute shapes + 3D objects', 'Properties › ALIGN (2+ selected) · ALIGN'], ['Rotate the selection 90° / 180° / by an angle', 'Properties › ROTATE ⟲ ⟳'], ['Add a node to a wall / conduit', 'Double-click a segment'],
		['Branch from a node', 'Ctrl-drag the node'], ['Pull a node off a joined run / split a run there', 'Alt-drag the node'],
		['Select a run, then one segment', 'Click it, click again'], ['Enter a viewport on a sheet', 'Double-click it'],
		['Set one wall / trunk / pipe segment’s width (plan)', 'Select the segment, drag the bar on its side edge · Shift = 50 mm steps · Alt = no grid snap'],
		['Window select (enclosed) / crossing (touched)', 'Drag left → right / right → left'], ['Edit a dimension’s text or a line’s label', 'Double-click it'],
		['Big text editor for a note / text', 'Double-click a note · Shift+double-click a text'], ['Orbit the 3D view (about the view middle)', 'Drag (3D view)'],
		['Repeat the last command', 'Enter / Space on an empty line'], ['Drag out a copy of shapes / 3D objects / viewports', 'Ctrl+drag — press / release Ctrl mid-drag to switch copy ↔ move'],
		['Select shapes and 3D objects together', 'Drag a box · Shift / Ctrl+click (they move, copy, nudge and delete together)'],
		['Sheet viewport: zoom = change its SCALE (any whole 1:N, at the cursor) / pan its contents (no need for Pan content — inactive, selected or active; in the active one Alt-drag on empty space)', 'Alt+wheel / Alt+drag over it'],
		['Sheet viewport: a standard or custom scale', 'Enter it (double-click) → scale list in its bar · Custom… → type 1:37 or 37, Enter'],
		['Sheet viewports: select several / nudge them', 'Shift+click borders or drag a box · arrows (Shift = 10 mm)'],
		['Sheet viewports: MOVE / COPY / ARRAY / ALIGN / ERASE (paper mm, e.g. M, 0,0, @20,0)', 'Type the command with no viewport active'],
		['Drag / resize without snapping (free, exact spot)', 'Hold Alt while dragging (F9 / SNAP and OSNAP in the status bar turn snapping off for good)'],
		['Draw a new sheet viewport', 'Viewport tool: two clicks (ACAD) or press-drag · Alt = no snap'],
		['Select several layers / tree items (places, sheets) / drawings', 'Ctrl+click toggles · Shift+click takes the range'],
		['…then act on them all', 'Layers: eye / lock / drag, or the bar below · tree: drag, ⋮ Delete / Tags…'],
		['Copy a model / sheet into another folder (a custom tree view)', 'Ctrl-drag it (a plain drag moves it)'],
		['Dimension: Aligned / Linear (H or V) / Horizontal / Vertical', 'A / L / H / V while drawing one (or its bar)'],
		['Paste at the cursor (Ctrl+V keeps the position)', 'Ctrl+Shift+V'], ['Zoom to the selection', 'Z, Enter (with a selection)'],
		['Type a command', 'Just type (over the drawing)'],
	]
	type HowTo = { q: string; a: string }
	const HOWTO: HowTo[] = [
		{ q: 'Move a wall / trunk / pipe up or down (its height, Z)', a: 'Select it → Properties › POSITION X / Y / Z: Z is its LOWEST point (mm above FL±0, like a box’s underside) — changing it lifts or lowers the whole run, slopes and vertical drops kept; X / Y move it in plan. Click a node of the selected run for NODE X / Y / Z (that corner only). Several objects: Base Z sets each one. Or drag its nodes in an elevation view.' },
		{ q: 'A layer for one viewport only (notes / markup that belong to one drawing)', a: 'Enter the viewport (double-click it), then Layers › New Layer (or the LAYER command): the layer shows ONLY in that viewport — hidden in the model and every other viewport (also ones made later). It carries a VP tag; click the tag to show it everywhere. Elsewhere its eye is crossed — click it to show it in that viewport too (in the model: everywhere).' },
		{ q: 'Hide the section / elevation markers on a plan', a: 'They sit on the “Sections” layer: hide it (or freeze it in one viewport, or lock it so they can’t be picked) in Layers. A marker can go on another layer: select it → Properties › Layer. Hiding a marker doesn’t affect the viewports it drives.' },
		{ q: 'High / low level and height (outlets, shapes, 3D boxes)', a: 'Select them → Properties › Level: High (in the ceiling plenum — WiFi APs, ceiling TVs) or Low (on the raised floor). It sets the height (Z, mm above FL±0 — the raised floor’s top, the same datum as 3D objects): low 0 (a wall-mount outlet +300), high the middle of the plenum (a box is centred in it, never below the ceiling). Type Z, or use the Height buttons (Floor / +300 / +1200 / Plenum / Ceiling), to override it. Low outlets are drawn filled, high ones as an outline. Works on a multi-selection; Items › Level filters by it; the Outlet Schedule has a Height column.' },
		{ q: 'List the outlets (or trunks, racks, text …) in a view', a: 'Left panel › ITEMS: the shapes and objects of the active view’s model. Pick what to list (Outlets, Trunks, Racks …), a layer, and for outlets High / Low level and usage; search by label or text. “In this view” keeps only what the viewport shows (visible, unfrozen layers). Click a row to select it in the view — Ctrl+click adds / removes, Shift+click takes a range, “Select all” takes the whole list — then edit them together in Properties. Double-click brings it into view (a sheet viewport only pans; its scale stays).' },
		{ q: 'Hidden lines, black & white, or a plan cut for one floor', a: 'Select the viewport on the sheet (click its border). Properties › VIEWPORT: Hidden lines Show / Hide and Colour → black and white. In an elevation / section, Hide draws only what you can see: anything behind a nearer wall or object is hidden — except through the wall’s doors, windows and holes (and File › Export DXF writes just those visible lines). A viewport dropped from a section or elevation marker starts with Hide on. PLAN CUT sets the height band (Z↓ / Z↑); “Fit to floor” picks one floor, slab to slab.' },
		{ q: 'Connection points on a box (where trunks / pipes attach)', a: 'Select the box. Properties › CONNECTION POINTS: “Place…”, then click on the plan where each point goes (it snaps to corners / edges); Esc or Done ends. U / V are fractions of the width / depth (0.5 = the middle), so points stay put when the box is resized. “Default” = the centre + the four edge midpoints. The × marks show while the box or a conduit is selected.' },
		{ q: 'A floor-tile grid', a: 'Draw a rectangle over the area, then Properties › RECT › Tile grid: the tile size in mm (dX / dY shift the grid to line up with the building).' },
		{ q: 'Renumber outlets by clicking them in order', a: 'Select the outlet to start from → Properties › “Renumber by clicking from here…”, then click the others in order; each takes the next label. Esc stops.' },
		{ q: 'Auto-number several shapes at once', a: 'Select them → Properties › AUTO-NUMBER: a template (# = the number), start, step, the attribute (LABEL for outlets) and the order (rows / columns), then “Number”.' },
		{ q: 'Edit several outlets together', a: 'Select them (Shift-click, or drag a window). Properties › BLOCKS · n edits the block, ports, note, type, scale and mirror of all of them; “— mixed —” = they differ.' },
		{ q: 'Solid vs outline outlets', a: 'An outlet’s Fill: filled = low level, None = an outline (high level). Properties › STYLE › Fill.' },
		{ q: 'Resize a block (a door swing, a symbol)', a: 'Select it and drag the scale handle at its far corner (Shift = steps of 0.25), or type Properties › BLOCK › Scale.' },
		{ q: 'Join conduits / attach a trunk to a box', a: 'Draw the new run starting or ending on the other run’s node (or on a box’s × connection point) — it joins / attaches, and follows when that moves. Alt-drag a node to pull it off again.' },
		{ q: 'Split a wall / trunk at a node (disconnect it)', a: 'Alt-drag the node: it comes apart. To choose which side comes away, select that segment first (click the run, click again on the segment), then Alt-drag its end node; otherwise the segment pointing the way you drag comes away. Alt-drag also pulls a node off another run it is joined to.' },
		{ q: 'Make one segment of a wall / trunk / pipe wider or narrower', a: 'In a plan view click the run, then click again on the segment. Drag the small bar on its side edge across the run: the width (a wall’s thickness) changes evenly about the centreline, shown by the cursor (W · Δ). Shift = 50 mm steps; with SNAP on it steps by the grid, Alt = free (whole mm). Back at the run’s default width the segment follows the default again. The same value is Properties › SEGMENTS › w / t; one undo step.' },
		{ q: 'Line up or space shapes evenly', a: 'Select 2+ shapes → Properties › ARRANGE › Align (left / centre / right / top / middle / bottom — to the extreme one) or Distribute (equal gaps, 3+). Or the ALIGN command.' },
		{ q: 'Rotate shapes, boxes, racks, blocks or images', a: 'Select them → Properties › ROTATE: ⟲ / ⟳ turn 90°, 180° a half turn, or type an angle in "By" (Enter = counter-clockwise, Shift+Enter = clockwise). One item turns in place; several turn together about their middle. 3D objects turn in the plan view.' },
		{ q: 'Edit several viewports at once', a: 'On the sheet, Shift-click their borders (or drag a box round them) → Properties › VIEWPORTS sets scale / border / hidden lines / colour / lock on all of them. Ctrl+C / Ctrl+D copy / duplicate them all, keeping their layout.' },
		{ q: 'Shapes and 3D objects selected together', a: 'Properties shows both parts — the shape fields edit the shapes, the object fields the objects; ROTATE / ALIGN act on everything selected.' },
		{ q: 'Copies in a grid or round a centre', a: 'Select the shape(s) and type AR: Rectangular (columns, rows, spacing) or Polar (centre, count, angle).' },
		{ q: 'Draw with exact sizes', a: 'Type into the command line: L, then 0,0 (absolute) · @1200,0 (relative) · @900<90 (distance < angle) · or just 1200 = that far toward the cursor. Enter finishes, C closes, U undoes a point.' },
		{ q: 'Freeze or lock a layer in one viewport only', a: 'Activate the viewport (double-click it): the Layers panel’s eye then hides the layer in THAT viewport only (a snowflake shows it is frozen there; Shift+click the eye to hide it everywhere); the lock column beside it locks it in that viewport only.' },
		{ q: 'Show the tree another way (by drawing type, by level, by category, by discipline)', a: 'The switcher under the project name (“By place ▾”) picks how the tree lists the models and sheets: By place (building › floor › zone — the only view where dragging re-files), By drawing type (Outlets › 33F …), Outlets / trunks by level (Outlets › high-level › 33F — tag sheets high-level / low-level), Elevations by category (Racks / Risers / AV rooms … — set an elevation’s Category), By discipline. Nothing moves — only the listing changes; your choice is remembered per project. Opening, ⋮, multi-select, rename and delete work the same in every view. In a grouped view, dragging sheets onto a folder SETS that field (drop on “high-level” adds the tag, on “Trunks” sets the type).' },
		{ q: 'Tell a model from a sheet in the tree', a: 'A MODEL (opens model space) has a cube icon, the model colour and a MODEL pill — “Model — opens in model space” on hover; a place row with a MODEL pill opens its model (click the pill to keep the tab). A SHEET (opens the paper layout) has the paper icon and its drawing number in front (A-201 · Outlets 33F). In a grouped folder the models come first, under “Models”.' },
		{ q: 'Tag a sheet (high-level, AV, server-room …) / set its type or category', a: 'Open the sheet, Properties › DRAWING: Type, Discipline, Category and Tags (type a tag and Enter; suggestions come from the tags used in EVERY project, and a new tag joins that shared list). ✦ suggestions from the sheet’s title / viewports (e.g. a rack-row elevation → Elevation · racks) apply only when clicked. Several sheets: select them in the tree (Ctrl / Shift+click) → ⋮ › Tags…, or File › Drawings… (bulk kind / discipline / category / tag).' },
		{ q: 'Make my own tree view (folders, smart folders)', a: 'Switcher › New view… — a view of your own folders, shared with everyone on the project. The folder / funnel buttons add a folder / a SMART folder (a saved filter — type, tags, discipline, category, place — that fills itself). Drag models and sheets in from “Not in a folder”; drag between folders to move, Ctrl-drag to copy (an item can be in several folders — they are references, the drawings stay where they are); drag folders to reorder / nest them. ⋮ on a folder: rename, edit the filter, delete; on an item: add to / remove from a folder. Rename or delete a view from the switcher.' },
		{ q: 'Delete a sheet (and get it back)', a: 'Tree › the sheet’s menu › Delete (click again to confirm), or the Drawings dialog. The message offers Undo.' },
		{ q: 'Copy shapes to another tab / project, or paste a screenshot', a: 'Ctrl+C copies the selection to the system clipboard too, so Ctrl+V pastes it in another browser tab or project. Ctrl+V with an image on the clipboard (a screenshot, a copied picture) inserts it as an image shape — set its scale / crop in Properties.' },
		{ q: 'Export', a: 'File › Export DXF… (a ZIP with the images when the view has any), File › Outlet Schedule… (Excel), SVGOUT / PNGOUT (the view as on screen), PDF / Print (choose “Save as PDF”).' },
		{ q: 'A section elevation that follows its box', a: 'Select the Section box in plan → the toolbar’s viewport button drops that direction onto the open sheet: sized to the cut, fitted, and LINKED — move / resize the box and the elevation updates. The ground line spans the cut.' },
		{ q: 'Section views / elevations from the plan', a: 'Draw a Section (SEC) box on the plan, select it and click one of its arrows — that elevation drops onto the current sheet as a viewport.' },
		{ q: 'A section at ANY angle (A–A′ line)', a: 'Pick Section line (the Sections group on the tool strip, Insert › Section line, or SECTIONLINE / SECL — or SEC with the bar set to Line) and draw the cut in plan: two clicks (ACAD) or press-drag, or type the two points; Shift = 15° steps. It looks to the LEFT of A → A′ (the arrows at its ends show which way), Depth (bar / Properties) = how far it sees. Select it: drag an end or the line, drag the diamond to set the depth, click an end arrow (or the toolbar’s flip) to look the other way; Properties has the name, depth, flip and an optional height band. The toolbar’s viewport button drops its elevation on the open sheet — again for another viewport (same or another sheet): every one is LINKED and follows the line live, each with its own notes, freezes and scale. The toolbar / Properties list the viewports it drives (click one to open it). Deleting a section that still drives viewports asks: keep them as plain elevations, or delete them too.' },
		{ q: 'An ELEVATION marker (look at a wall from any angle)', a: 'Pick Elevation (beside Sections on the tool strip, Insert › Elevation, or ELEVATION / ELEV) and, in plan, click the marker’s point, then click (or press-drag) the way it looks — it snaps to the four axes, Shift = 15° steps; Enter (or right-click) = looking up the sheet. Or type it: ELEV, X,Y, then an angle (CCW from +X, 90 = up the sheet) or a second point. The bar sets the band it sees: Width across the look × Depth ahead. It draws as a callout — a circle with an arrow — numbered 1, 2 …; once dropped on a sheet it shows its first viewport’s number over that sheet’s number (“1 / A-201”). Select it: drag it to move, drag the arrow tip to turn it (Shift = 15°), the band ends for the width, the diamond for the depth; the toolbar turns it round, drops it and deletes it; Properties has its number, title, angle (↑ → ↓ ← or typed), width, depth and an optional height band. The viewport button / Properties › + Drop drops its elevation on the open sheet — again for more viewports: each is LINKED (it follows the marker live) with its own notes, freezes and scale; the ground line reads “ELEVATION 1” (or its title). Deleting a marker that still drives viewports asks first.' },
		{ q: 'Copy walls / furniture / racks to another model or project (also from the Sheets tool)', a: 'Select them and Ctrl+C (in a Sheets 3D viewport too), then Ctrl+V in the other view — they land at the same coordinates (pasted back into the same model they step 5 paper mm aside). Layers are matched by name.' },
		{ q: 'Draw trunks / pipes of a given size and height', a: 'Pick Trunk or Pipe: the bar at the top of the pane sets the catalogue item (conduit, trunking, tray, ladder …), Rect / Round, W × H, and where it runs (under floor, plenum, below ceiling, wall, custom Z) — the height comes from the floor’s levels.' },
		{ q: 'Doors and windows as holes', a: 'Pick Door, Window or Hole (the Openings group on the tool strip, Insert menu, or DOOR / WINDOW): the bar at the top shows the type, its height and sill. Drag the box across the wall (plan). In 3D the wall is built around it (jambs, header, sill) so you see through it; plan / elevations show the masked gap. Properties › the opening sets door swing / window.' },
		{ q: 'Change the floorplan PDF (or any picture)', a: 'Unlock the Floorplan layer (Layers panel), click the plan, then Properties › IMAGE › File › Replace…: pick another uploaded PDF (page) or picture — this project’s Uploads first, then other projects’. It is placed by that file’s calibration in the Uploads tool (else it keeps its size); recalibrate with Origin / Scale if it doesn’t line up. Lock the layer again after.' },
		{ q: 'Insert a PDF / picture', a: 'Four ways, all onto the ACTIVE layer: Insert › From Uploads… (pick one already uploaded, any project); Insert › Image… (files from this computer); drag files from your desktop / Explorer onto a viewport (placed where dropped); or paste a picture / screenshot with Ctrl+V (at the cursor). Files from this computer are uploaded to the project’s Uploads first, so they are saved and listed there.' },
		{ q: 'Select everything', a: 'Ctrl+A (or SELECTALL): every shape and 3D object on visible, unlocked layers — lock a layer (e.g. Floorplan) to leave it out.' },
		{ q: 'Place racks (turned)', a: 'The Rack tool (Boxes group) or RACK: pick a type, then click each rack’s centre; type L or R (or click Left / Right in the command line) to turn the next one 90° — the preview shows its front line. Enter ends.' },
		{ q: 'Where is each tool?', a: 'The tool strip runs in sections: Select · Text (text / callout / multi-line note), Line, Shapes (rectangle / ellipse / arc) · Walls / trunks / pipes, Openings (door / window / hole), Boxes (box / rack) · Dimension / Measure / H + V guides, Sections (box / line at any angle), Elevation (a marker: a point + the way it looks) · Format painter, Viewport. A button with a corner mark is a group — hover it for the others; it remembers the last one used. Box = a 3D box (furniture, cabinets …).' },
		{ q: 'A desk with legs (a hole through furniture)', a: 'Draw the desk as a Box, then an Opening (Rect hole) through it — right across its full depth or width, as high as the leg space. The box is split into its legs and top in 3D and elevations; the hole shows as a dashed outline in plan. Save it to the library as a block later.' },
		{ q: 'Pick a shape under a box (e.g. under a table top)', a: 'Turn WIRE on in the status bar: boxes then pick only on their outline, so what is under / inside them can be clicked.' },
		{ q: 'Make a shape’s layer the current one', a: 'Select the shape → the ✓ beside Properties › Layer; or the crosshair in the Layers panel search box (LAYMCUR), then click the shape.' },
		{ q: 'Change a sheet viewport’s direction (front / plan / 3D)', a: 'The ViewCube / 3D popout only PREVIEWS the change on a sheet viewport: click Keep in the chip under the ViewCube to make it stick; Revert, or leaving the viewport, puts the old direction back — so a front view isn’t accidentally printed as 3D. It acts on the ACTIVE viewport, else the one(s) SELECTED on the sheet (click a border), else the sheet’s only viewport — with several and none picked it asks you to pick one. Each viewport’s top-right tag shows its direction and scale (e.g. FRONT · 1:50; 3D / ISO / WIRE in 3D).' },
		{ q: 'Share a link to a drawing', a: 'The address bar carries the selected tree item (?node=… / ?doc=…) — copy it; it opens the same place / drawing for someone else.' },
		{ q: 'Measure a distance', a: 'The Measure button (ruler + pencil) or DIST: click two points — the distance and angle show in the command line, nothing is drawn.' },
		{ q: 'Measure an area', a: 'AREA (AA): click the corners (Undo drops the last one), Enter totals — or O (Object) and click a rect, ellipse or closed polyline. The area (m² and mm²) and the perimeter show in the command line.' },
		{ q: 'A dimension along a slanted wall (rotated linear)', a: 'Select the dimension → Properties › DIMENSION › Mode › Rotated, then its Angle (CCW from +X). It measures only along that direction. Turning a horizontal / vertical dimension (ROTATE, Properties ⟲) keeps it linear at the new angle, same figure.' },
		{ q: 'Hide a layer in every NEW viewport', a: 'Layers › the layer’s swatch (settings) › Hide in new viewports: viewports made from now on start with it hidden (VP Freeze); the ones you have are unchanged — use the eye in a viewport for those.' },
		{ q: 'A cable ladder or hatched area', a: 'Draw a rectangle (or ellipse / closed polyline), then Properties › HATCH: Vertical lines at 300 mm spacing reads as ladder rungs; Horizontal, Grid and Diagonal too.' },
		{ q: 'Horizontal / vertical (linear) dimensions', a: 'Pick Dimension: its bar at the top of the pane sets what it measures — Aligned (the true distance, parallel to the points), Linear (horizontal or vertical, whichever way the points are further apart — DIMLINEAR / DLI), Horizontal or Vertical (only Δx / Δy). While drawing, type A / L / H / V (or click the option in the command line). DIMALIGNED / DAL arms Aligned. A drawn dimension: Properties › DIMENSION › Mode switches it, keeping the points it measures.' },
		{ q: 'Move a dimension’s text or its line', a: 'Select the dimension: drag the grip on its figure to slide the text along the line or off it (Properties › Text offset = the distance off the line in paper mm, ± = side — it reads the same at any scale); drag the grip a quarter along the dim line to move the line away from / back onto the measured points (extension lines follow — Properties › Ext. lines).' },
		{ q: 'Move / resize 3D objects in an ANGLED section or elevation', a: 'In a viewport of a section line or elevation marker at any angle, drag a box, rack, wall or trunk as in any elevation: sideways moves it along the view (in plan it slides along the cut line, keeping its distance from it), up / down changes its height; SNAP steps along the view. A selected box’s corner grips resize it — the side you drag moves, the other stays; its size along the box’s own axis nearest the view changes (exactly, when the box is square to the view). Wall / trunk nodes drag the same way. Drawing new walls / trunks and the tilt handle stay in plan or the straight elevations. File › Export DXF writes the angled view as drawn.' },
		{ q: 'See the length / spacing while drawing or moving', a: 'A small readout follows the cursor: while drawing a line, wall, trunk, pipe, dimension or section line — the length, angle and Δx / Δy from the last point; a rectangle, ellipse, box or opening — its W × H; while dragging shapes / objects or a grip — how far (Δ, angle, Δx / Δy) from where it started; in a command like MOVE / COPY — from its base point; placing a guide — the spacing from the selected guide. Type a number to use an exact distance.' },
		{ q: 'Stacked (baseline) dimensions with extension lines', a: 'Draw one dimension, then DIMBASELINE (DBA): each next click stacks a dimension from the same base with extension lines back to the points. Any dimension: Properties › Ext. lines.' },
		{ q: 'Wrapped notes / a notes table', a: 'NOTE, or Properties › TEXT › Wrap on: markdown (# heading, - list, | table |, **bold**) wrapped to a width. The pencil (or double-click it) opens the big editor with a preview; paste from Word / Excel keeps the formatting.' },
		{ q: 'Perspective / iso / wireframe 3D', a: 'The 3D button under the ViewCube opens a popout: 3D = perspective (the default), ISO = parallel iso, WIRE = see-through wireframe (PERSPECTIVE on / off on the command line too). Drag to orbit — it turns about the middle of the view. Callouts and legends face you in 3D (upright, at their paper size) — a callout\'s arrow points at its spot at the callout\'s height (Properties › POSITION › Z — e.g. a ceiling TV); click one to select it (edit it in Properties or a plan).' },
		{ q: 'Add a legend', a: 'Text fly-out › Legend, Insert › Legend, or the LEGEND command: click its top-left corner. Its rows are the visible layers in use (colour / line swatch + counts) and update themselves; Properties sets its Title, Counts (yes / no) and layers to leave out.' },
		{ q: 'Set a plan shape\'s height (see it at that height in elevations)', a: 'A rect / line / ellipse drawn in plan shows in an elevation as an edge-on line at its height above the floor. Drag it up / down there, or type Properties › POSITION › Z (mm). The 3D view lifts it too.' },
		{ q: 'Line up with other points while drawing', a: 'OTRACK (status bar, on by default): move level with an end / midpoint and a dashed blue guide locks you to its x or y. POLAR (F10) gives 15° rays; ORTHO (F8) horizontal / vertical.' },
		{ q: 'The grid (GRID)', a: 'Status bar › GRID: a line grid — minor lines at the SNAP step (or 10× / 100× it when zoomed out, never crowded; they fade in as you zoom in) and a stronger line every 10. It draws over the floorplan / background images and under your drawing; it is never printed or exported. On a sheet the paper shows its own 5 mm grid (where viewports snap) and an entered viewport shows the model grid.' },
		{ q: 'Colour and lineweight "By layer"; lineweights in mm', a: 'Properties › Color › By layer (or no colour) draws a shape in its layer’s colour — change the layer colour and every such shape follows (dimensions and block symbols too). Properties › Lineweight: ByLayer (the layer’s, else 0.25 mm) or a standard weight 0.00–2.11 mm. LWT (status bar) shows them at their true paper width on a sheet (they grow as you zoom the sheet) and proportionally in model space; with LWT off every line is a hairline. Older shapes’ weights read as the nearest mm (1.2 → 0.25 mm). DXF export writes the colour and lineweight. Format › Drawing Defaults sets the lineweight new shapes start with. Walls, boxes and conduits use their layer’s lineweight (Layer settings › Lineweight) the same way. Printing always uses the true lineweights, even with LWT off.' },
		{ q: 'Raised floor / ceiling / slab lines in elevations', a: 'Turn on the Architectural layers A-FLOR and A-CLNG: elevations then draw thin lines at the raised floor (A-FLOR), the ceiling = the plenum’s bottom (A-CLNG, dashed) and the ceiling slab’s underside = the plenum’s top (A-CLNG, dash-dot), from the floor’s heights (a building’s storeys, or a floor model’s own levels). DXF export includes them. On a floor, heights count from FL±0 = the top of the raised floor (racks and furniture stand on it); the slab is below at FL − the raised floor, where under-floor pipes run.' },
		{ q: 'See the project’s building in 3D (site view)', a: 'Click the project name above the tree: the site view opens over the drawings. Type the address (or the building’s name) and Find — it is looked up on OpenStreetMap and the building is shown in 3D with its neighbours on the map (drag to orbit, right-drag to pan, wheel to zoom; Map toggles the ground map; the frame button re-centres). The card lists what OSM knows (height, levels, use, year …) and other matches to pick. “Save as project address” stores it on the project; × (or opening a drawing) closes the view. A test — heights are estimated where OSM has none.' },
		{ q: 'Check walls / conduits for broken bits', a:'AUDIT: lists missing blocks, then broken wall / conduit nodes and segments, loose connections and stale rack allocations, and offers to fix them (one undo step).' },
	]
	const EXAMPLES = ['LINE 0,0 @3000,0 @0,2000 ENTER', 'REC;0,0;1200,600', 'C 500,500 250', 'M · pick a base point · @500,0', 'AR · R · 4 · 1 · 1500', 'ZW · two corners']

	let q = $state('')
	const hit = (...s: string[]) => { const t = q.trim().toLowerCase(); return !t || s.some((x) => x.toLowerCase().includes(t)) }
	const shortcuts = $derived(SHORTCUTS.filter(([a, b]) => hit(a, b)))
	/** Function keys — the app's own, and the browser's (which the app leaves alone). */
	const FKEYS: [string, string][] = [
		['F1', 'This help'], ['F2', 'Edit the selected item’s label in place'], ['F8', 'ORTHO on / off (lines, walls, trunks, pipes: horizontal / vertical)'], ['F9', 'SNAP to the grid on / off'],
		['F10', 'POLAR tracking on / off (15° rays)'], ['F11', 'Full screen (the browser)'], ['F12', 'Developer tools (the browser)'],
		['F3 · F5 · F6 · F7', 'Browser keys (find · reload · address bar · caret browsing) — not used by Pages'],
	]
	const fkeys = $derived(FKEYS.filter(([a, b]) => hit(a, b) || hit('function keys F-keys')))
	const howto = $derived(HOWTO.filter((h) => hit(h.q, h.a)))
	const groups = $derived.by(() => {
		const cs = COMMANDS.filter((c) => hit(c.label, c.names, c.description, c.group))
		return [...new Set(cs.map((c) => c.group))].map((g) => [g, cs.filter((c) => c.group === g)] as [string, CmdDef[]])
	})
	let open = $state<string | null>(null)
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
	function focusSearch(node: HTMLElement) { tick().then(() => node.querySelector('input')?.focus()) }
</script>

<svelte:window onkeydown={onKey} />
<div class="hp-back">
	<button class="hp-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="hp" role="dialog" aria-modal="true" aria-label="Help" tabindex="-1" use:focusSearch>
		<div class="hp-head"><Icon name="help" size={15} /><span>Pages — help</span>
			<input class="hp-q" bind:value={q} placeholder="Search help, shortcuts and commands…" spellcheck="false" />
			<button class="hp-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="hp-body">
			{#if howto.length}
				<h3>How do I…</h3>
				{#each howto as h (h.q)}
					<div class="how" class:open={open === h.q || !!q.trim()}>
						<button class="how-q" onclick={() => (open = open === h.q ? null : h.q)}>{h.q}</button>
						{#if open === h.q || q.trim()}<p>{h.a}</p>{/if}
					</div>
				{/each}
			{/if}
			{#if shortcuts.length}
				<h3>Keys &amp; mouse</h3>
				<div class="grid">{#each shortcuts as [a, b] (a)}<div class="row"><span>{a}</span><kbd>{b}</kbd></div>{/each}</div>
			{/if}
			{#if fkeys.length}
				<h3>Function keys</h3>
				<div class="grid">{#each fkeys as [k, what] (k)}<div class="row"><span>{what}</span><kbd>{k}</kbd></div>{/each}</div>
			{/if}
			{#if !q.trim() || hit('command line coordinates point typed')}
				<h3>The command line</h3>
				<p>Type anywhere over the drawing — it lands in the command line above the status bar (Tab completes, ↑ / ↓ recall). A command asks for what it needs (“Specify base point:”): type <code>X,Y</code>, <code>@DX,DY</code> (from the last point), <code>@D&lt;ANGLE</code>, or a bare distance (toward the cursor) — or click in the view (it snaps). Enter / Space / right-click = done or repeat the last command; Esc cancels. Separate steps with spaces, or with <code>;</code> when Space means Enter (ACAD mode); <code>;;</code> is an Enter.</p>
				<div class="note">{#each EXAMPLES as ex (ex)}<code>{ex}</code><br />{/each}</div>
			{/if}
			{#each groups as [g, cs] (g)}
				<h3>{g} commands</h3>
				<div class="cmds">
					{#each cs as c (c.id)}
						<button class="cmd" title="Run it" onclick={() => { onrun?.(c.id); onclose() }}><b>{primaryName(c)}</b><span class="al">{c.names.split('·').slice(1).join(' ·')}</span><span class="d">{c.description}</span></button>
					{/each}
				</div>
			{/each}
			{#if !howto.length && !shortcuts.length && !groups.length}<p class="none">Nothing matches “{q}”.</p>{/if}
		</div>
	</div>
</div>

<style>
	.hp-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:6vh; }
	.hp-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.hp { position:relative; width:min(760px,94vw); max-height:84vh; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; color:var(--text); }
	.hp-head { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; }
	.hp-q { flex:1; margin-left:10px; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:4px 8px; font-size:12px; font-weight:400; }
	.hp-q:focus { outline:none; border-color:var(--accent); }
	.hp-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.hp-body { overflow:auto; padding:4px 16px 14px; font-size:12px; line-height:1.5; }
	h3 { margin:14px 0 6px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); }
	p { margin:4px 0; color:var(--muted); }
	code { font-family:Consolas,monospace; color:var(--accent); font-size:11px; }
	.note { margin:6px 0; padding:8px 10px; border-left:2px solid var(--accent-dim); background:var(--input); border-radius:4px; }
	.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:2px 18px; }
	.row { display:flex; justify-content:space-between; gap:10px; padding:2px 0; border-bottom:1px solid var(--line-soft); }
	.row span { color:var(--muted); }
	kbd { font-family:Consolas,monospace; font-size:11px; color:var(--text); white-space:nowrap; }
	.how { border-bottom:1px solid var(--line-soft); }
	.how-q { width:100%; text-align:left; background:none; border:none; color:var(--text); padding:5px 0; cursor:pointer; font-size:12px; }
	.how-q::before { content:'▸'; display:inline-block; width:14px; color:var(--faint); }
	.how.open .how-q::before { content:'▾'; }
	.how p { margin:0 0 6px 14px; }
	.cmds { display:flex; flex-direction:column; }
	.cmd { display:flex; gap:10px; align-items:baseline; text-align:left; background:none; border:none; color:var(--text); padding:2px 4px; border-radius:4px; cursor:pointer; font-size:12px; }
	.cmd:hover { background:var(--hover); }
	.cmd b { min-width:96px; color:var(--accent); font-family:Consolas,monospace; font-weight:600; }
	.cmd .al { min-width:120px; color:var(--faint); font-family:Consolas,monospace; font-size:11px; }
	.cmd .d { color:var(--muted); }
	.none { color:var(--faint); }
</style>
