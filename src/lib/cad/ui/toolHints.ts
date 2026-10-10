// Each tool's hint (the status bar, and Help's tools list).
import type { ToolId } from '../app/workspace.svelte'

export const HINT: Partial<Record<ToolId, string>> = {
	insert: 'Click to place the block (pick it in Blocks, left) · in an elevation / section it goes on the wall behind the click, at that height · Esc stops',
	move: 'Select first · click a base point, then where it goes (snaps · Shift 15° · type @dx,dy) · Esc stops',
	copy: 'Select first · click a base point, then each place for a copy (snaps · Shift 15° · type @dx,dy) · Enter / Esc ends',
	dimension: 'Click the two points to measure (they snap), then where the dimension line goes · Backspace drops a point · Esc stops',
	legend: 'Click where its top-left corner goes (plan: lists this level · sheet: the levels its viewports show) · rows, title, size in Properties',
	viewport: 'Drag a box on the paper (or click two corners) · it shows the other pane’s view, else the last plan / elevation / rack view, scaled to fit · at least 20 × 20 mm · Esc stops',
	box: 'A box / desk on the plan: its footprint corner to corner (or drag) · its height and Z in the tool bar (and Properties) · shows in elevations and sections · Esc stops',
	image: 'Drag the image’s box (or click two corners) on a plan, an elevation / section or a sheet — it fits inside, keeping its proportions · Esc stops',
	shape: 'Click two points (or drag) · on a plan, on an elevation (at the work depth), on a sheet or inside a viewport · Esc stops',
	select: 'Double-click (or F2) a label / text to edit it, Tab = the next one · double-click a selected run to add a point · Ctrl-drag a point to branch, an item to copy · Ctrl+G groups, Ctrl+Shift+G ungroups · Ctrl+] / Ctrl+[ draw order',
	outlet: 'Click to place the next outlet · or type @1200,0 for the next one 1.2 m along',
	line: 'Click or type points (x,y · @dx,dy · @d<a · a distance) · Shift = 15° steps · Enter finishes · C or a click on the first point closes it · Esc / right-click ends it, again → Select · Backspace undoes a point',
	trunk: 'Click or type points · Shift = 15° steps · R = rise / drop · V = riser to another level · Enter finishes · C closes it · Esc / right-click ends it, again → Select · snap onto an outlet or rack to attach',
	conduit: 'Click or type points · Shift = 15° steps · R = rise / drop · V = riser to another level · Enter finishes · C closes it · Esc / right-click ends it, again → Select',
	wall: 'Click or type points · Shift = 15° steps · Enter finishes · C or a click on the first point closes it (a room) · Esc / right-click ends it, again → Select',
	section: 'Click (or type) the two ends of the cut line · it looks to the line\'s left as drawn · Flip, depth and Open in Properties',
	opening: 'Click a wall: a hole W wide from Z to Z + H, with the chosen swing · edit or delete it in the wall\'s Properties',
	rack: 'Click on the plan to draw a rack (like the last one: room, row, size, rotation) · Esc stops',
	device: 'In a rack view (Racks list → Rack view): click a rack at the U for the device · drag devices with Select to move them',
	assign: 'Click a panel port in a rack view — the chosen outlets go on from there (the panel itself: from its first free port; pinned) · Esc cancels',
	cord: 'In a rack view: click a port, then the port to patch it to · a panel port needs a label first · Esc cancels',
	match: 'Click shapes to give them the source’s layer and look (colour, fill, line type, lineweight, text size) · no source selected: click it first · Esc / right-click ends',
	renumber: 'Click outlets, racks or labelled shapes in order · click a picked one to go back to it · Backspace drops the last · start / step in Properties, then Renumber · Esc / right-click ends',
	text: 'Click where the text goes and type over "Text" · click a text to edit it · Enter saves, Shift+Enter = new line',
	leader: 'Press at the tip and drag to where the words go (a callout) — or click the tip, then bends, Enter ends · then type its words on the drawing · border in Properties · Backspace undoes a point',
	cloud: 'On a sheet: click round the area to mark · Enter closes the cloud · Esc / right-click ends it, again → Select · Backspace undoes a point',
}
export const HINT_PLACE = 'Click on the plan to place the rack (its centre) · Esc cancels'
