// HELP's words (backlog "Help (F1 / ?)", UX22): how-to answers, keys and mouse, function keys. Keep this current with
// every user-visible feature or key (Dave). The tools list comes from the tool strip (TOOL_GROUPS) and the hints.

export interface HowTo { q: string; a: string; featured?: boolean }

export const HOWTO: HowTo[] = [
	{ featured: true, q: 'Edit labels one after another (outlets, racks, run labels, texts, leaders)', a: 'Double-click a label (or select it and press F2): a box opens on the drawing. Type, then Tab saves and opens the NEXT one of the same kind in reading order (Shift+Tab: the previous one). Enter saves and stops; Esc cancels. Renaming an outlet renames its ports too (it asks first when the panel labels were already printed).' },
	{ q: 'Find what a click will take', a: 'Move the pointer over the drawing: what a click would select gets a thin light-blue outline, and the cursor says what a press does — a cross on a grip, a four-way arrow on something you can drag, a hand on the rest.' },
	{ q: 'Move, copy or nudge things', a: 'Drag the selection (it moves as one undo step; attached runs follow). Ctrl-drag leaves a copy. Arrow keys nudge 50 mm (Shift: 500 mm; on a sheet 1 / 10 mm; in a rack view 1 U). Move / Copy tools take a base point and a target (snaps, typed @dx,dy).' },
	{ q: 'Snap to the grid, to objects, or not at all', a: 'The status bar: SNAP (F9) steps moves and points on the grid (pick the step beside it), OSNAP (F3) snaps to nodes, midpoints, centres, outlets and racks, GRID (F7) draws the grid. Hold Alt while dragging to skip snapping for one action.' },
	{ q: 'Draw a run (trunk, conduit, wall, line)', a: 'Pick the tool, click each point (or type x,y · @dx,dy · @d<angle · a distance towards the cursor). Shift = 15° steps. Enter or a right-click ends it; C closes it. Trunks / conduits: R = rise / drop, V = a riser to another level; the Location in the tool options sets the height from the level\'s heights.' },
	{ q: 'Add a point to a run, or pick one segment', a: 'Select the run, then double-click a segment to add a point there. Click the selected run again to pick the segment under the cursor (Ctrl-click: several). Ctrl-drag a node to branch from it; Alt-drag it to pull it off another run.' },
	{ q: 'Select several things', a: 'Ctrl-click adds / drops one. Drag a box on empty space: left → right takes what it encloses, right → left what it touches. Ctrl+A takes everything this view shows; Edit › Select similar takes everything like the selection.' },
	{ q: 'Find a level, view, sheet, room or rack', a: 'The Navigator window (Ctrl+K puts you in its search box): type part of a name — matching rows show with their parents. A click opens the row’s view in the active pane; a rack opens its room’s rack view zoomed to it; a sheet unfolds to its viewports, and a click on one opens that view. The open view’s row is marked.' },
	{ q: 'Delete a level, a server room or a section', a: 'In the Navigator, hover the row: ✎ renames it, ✕ deletes it. A level goes with everything on it; a server room with its racks (and their devices, links, cords) — it asks first when more goes with it, and an empty room just goes. A section: click its row (or the cut line on the plan) and press Delete. Undo brings any of them back.' },
	{ q: 'Go back to the view you were in', a: 'The ‹ › buttons at the left of each pane\'s strip, or Alt+← / Alt+→. Each pane keeps its own history.' },
	{ q: 'Put a view on a sheet', a: 'In the view, "To sheet…" on its strip: a new sheet or one that\'s there, centred where you\'re looking at a scale that fits. Or on a sheet, the Viewport tool: drag a box — it shows the other pane\'s view (or the last one you looked at), scaled to fit.' },
	{ q: 'Make the same change to more devices', a: 'Change a field of a device (or several) in Properties — its kind, height, ports, maker, a panel’s tier … — then select other devices and press F4: the same change goes on them, one undo step. Its name and U aren’t repeated; a device it won’t fit is skipped and named.' },
	{ q: 'Add a device from the library', a: 'Window › Device library (it opens with the Device tool): find a template, then DRAG it onto a rack in a rack view — the outline shows where it lands (red: it overlaps or runs off the rack) and the drop adds it, selected. Or click a template, then click a U in a rack.' },
	{ q: 'Draw cords along the cable channels', a: 'In a rack view, Cord channels (in the strip over the view) draws every patch cord down to the channel at the side of its panel, across through the nearest horizontal manager when it changes side, and between racks at mid-height. Off = straight cords. It is a project setting: sheets and PDFs follow it.' },
	{ q: 'Move, resize or pan a viewport', a: 'Click a viewport’s FRAME (its border) on the sheet: drag the frame to move it, a corner to resize it. Its middle doesn’t pick it, so it can’t be dragged by mistake — double-click inside to edit the model in it. The chip on its corner sets its scale and has Pan / zoom content (a drag inside pans its view, the wheel steps its scale). Its view, level and scale are also in Properties.' },
	{ q: 'Hide a layer in a viewport', a: 'The eye in Layers hides a layer on screen everywhere, viewports included. What PRINTS is each viewport’s ❄: pick the viewport (or edit inside it) and click a layer’s snowflake to freeze it in that viewport (Shift: every viewport on the sheet).' },
	{ q: 'Open, move and dock windows', a: 'Window menu: tick a window to open it. Drag a window by its title to float it over the drawing; drop it on the left or right edge to dock it there. Ctrl+. hides every window and brings them back; Window › Reset layout puts everything back.' },
	{ q: 'Patch ports in a rack view', a: 'Open the room\'s rack view (Racks › Rack view). Pick the Cord tool, click a port, then the port it goes to. Several ports: select them (Shift-click a range), Properties › Patch to…, then click the first target port.' },
	{ q: 'Allocate outlets to panel ports', a: 'Outlets table › Allocate (the selected outlets, else this level): each port gets a panel port of its server room, racks in row order, top U down. Assign → port… places them by hand (pinned).' },
	{ q: 'Print panels with their labels', a: 'Racks window: a room\'s ⋯ → "Print panels with labels (PDF)…" (or "Export panel labels (Excel)…"). Afterwards it offers to mark the panels as printed, so later label changes ask first.' },
	{ q: 'Undo a mistake', a: 'Ctrl+Z (Edit › Undo). Undo selects what came back or changed and opens its level.' },
]

export const SHORTCUTS: [string, string][] = [
	['Find a level, view, sheet, room, rack', 'Ctrl+K'], ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Delete the selection', 'Delete'], ['Copy / Cut / Paste', 'Ctrl+C / X / V'],
	['Select all in this view', 'Ctrl+A'], ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'],
	['Draw order: forward / to front', 'Ctrl+] / Ctrl+Shift+]'], ['Draw order: backward / to back', 'Ctrl+[ / Ctrl+Shift+['],
	['Edit a label in place', 'Double-click · F2'], ['…save and edit the next / previous', 'Tab / Shift+Tab'],
	['Nudge (× 10 with Shift)', 'Arrow keys'], ['Zoom to fit', 'Home'], ['Page up / down (sideways: Shift)', 'PgUp / PgDn'],
	['Pan', 'Right- or middle-drag'], ['Zoom at the cursor', 'Wheel'], ['15° steps / H-V / square', 'Shift while drawing or dragging'],
	['No snap for this drag', 'Alt'], ['Finish a run', 'Enter · right-click'], ['Cancel · back to Select · deselect', 'Esc (repeat) · right-click'],
	['Copy by dragging', 'Ctrl-drag'], ['Branch a run from a node', 'Ctrl-drag the node'], ['Pull a node off another run', 'Alt-drag the node'],
	['Window / crossing selection', 'Drag left → right / right → left'], ['Cycle through things stacked under the cursor', 'Click again on the same spot'],
	['Back / forward (views in this pane)', 'Alt+← / Alt+→'], ['Hide / show every window', 'Ctrl+.'], ['Show / hide the tables', 'Ctrl+,'],
	['Rack view: focus a rack / the whole row', 'Double-click a rack / empty space'], ['Answer a question box', 'Enter = yes · Esc = Cancel'],
]

export const FKEYS: [string, string][] = [
	['F1', 'Help (this)'], ['F2', 'Edit the selected label in place'], ['F3', 'OSNAP: object snaps on / off'], ['F4', 'Repeat the last device edit on the selected devices'],
	['F7', 'GRID: draw the grid'], ['F9', 'SNAP: grid snap on / off'],
]
