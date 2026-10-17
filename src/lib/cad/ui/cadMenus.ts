// The MENU BAR's contents (UX review S4): File · Edit · View · Draw · Modify · Annotate · Cabling · Drawings · Project · Window · Help (menus review option 2, User 2026-10-15).
// Built from what the shell can do (`MenuCtx`), so the menus never hold state of their own; each item shows its key.
import type { ToolId } from '../app/workspace.svelte'
import { WIN_IDS, WIN_TITLES, type WinId } from '../app/windows.svelte'
import type { Entity } from '../domain/drawing'
import { KEYS } from './shellKeys'
import { labelKind } from '../domain/labelEdit'

export type MenuItem = { label: string; key?: string; checked?: boolean; disabled?: boolean; title?: string; run: () => void }
	/** A submenu (review R45: long flat menus): opens to the side on hover. */
	| { label: string; title?: string; disabled?: boolean; children: MenuItem[] }
	| '-'
export interface Menu { label: string; items: MenuItem[] }

export interface MenuCtx {
	// File
	outletSchedule(all: boolean): void
	/** File › Export › Frame label sheets / Panel labels — this level or all levels (Q47). */
	frameSheets(all: boolean): void; panelLabels(all: boolean): void
	dxf(): void
	pdfAllSheets(): void
	hasSheets: boolean
	/** The sheet open in the active pane, as a PDF; `onSheet`: one is open. */
	pdfThisSheet(): void
	onSheet: boolean
	/** The Uploads tool, in a new tab. */
	uploads(): void
	/** Pick another project and open it in cad (Ctrl+O). */
	openProject(): void
	/** Download backup… / Restore from file… (ADR 0008); only the owner restores. */
	backup(mode: 'download' | 'restore'): void
	canRestore: boolean
	/** File › Import legacy drawings…: chosen Pages models / Sheets-tool sheets of this project, once. */
	legacyDrawings(): void
	/** The photo survey tool for this project, in a new tab (its only way in was the old project page). */
	surveys(): void
	/** File › Export › Monochrome PDFs (T121) — a switch for this user's sheet PDFs. */
	monoPdf: boolean; toggleMonoPdf(): void
	/** View › Copy view as picture (T160): the active view, as on screen, onto the clipboard as a PNG. */
	copyView(): void
	// Edit
	undo(): void; redo(): void; canUndo: boolean; canRedo: boolean
	copy(): void; cut(): void; paste(): void
	remove(): void; hasSelection: boolean
	/** Project groups (User 2026-10-16): this project's group's buildings (it among them), add one, open one, copy one's settings. */
	buildings: { id: string; label: string; current: boolean }[]
	addBuilding(): void; openBuilding(id: string): void; copySettingsFrom(id: string): void
	/** R / Shift+R: the selection turned 90° (User 2026-10-15). */
	turn90(dir: 1 | -1): void
	selectAll(): void; selectSimilar(): void
	group(): void; ungroup(): void
	order(how: 'forward' | 'backward' | 'front' | 'back'): void
	// View
	fit(): void
	find(): void
	zoomSel(): void
	split: boolean; toggleSplit(): void
	tables: boolean; toggleTables(): void
	hideAll: boolean; toggleHideAll(): void
	back(): void; forward(): void; canBack: boolean; canFwd: boolean
	fill: boolean; toggleFill(): void; isPlan: boolean; /** a plan, elevation or section: fill rates draw there */ fillHere: boolean
	drafting: { snap: boolean; osnap: boolean; showGrid: boolean }; toggleDrafting(k: 'snap' | 'osnap' | 'showGrid'): void
	// tools (Insert, Cabling)
	tool(id: ToolId): void; toolOk(id: ToolId): boolean
	/** A tool set to one of its kinds (Shape: rect / polygon / ellipse / arc; Box: rect / ellipse / polygon). */
	toolVariant(id: ToolId, v: string): void
	openTable(t: 'outlets' | 'patch' | 'sheets' | 'links'): void
	/** The Sheets table on one of its views, or a release of the picked sheets started (Drawings menu). */
	sheetsTab(which: 'register' | 'packages' | 'issues' | 'release'): void
	cordBom(): void; cordLabels(): void; portMap(): void; portMapView(): void; cableSchedule(): void; bom(): void; catalogue(): void; serverRoom(): void; allocate(): void
	// Sheets
	newSheet(): void; sheetFromView(): void; canSheetFromView: boolean; titleBlock(): void
	/** Draw › Image…: pick the picture, then the Image tool. */
	image(): void
	// Project
	floors(): void; settings(): void; backups(): void
	/** The project's details (name, codes, client, address, logos — the projects page's dialog); absent = not offered. */
	projectDetails?: () => void
	/** A new project (the projects page's New Project dialog) — for the Walkthrough's first step. */
	newProject(): void
	hasLevel: boolean; renameLevel(): void; deleteLevel(): void
	// Window / Help
	win: { shown(id: WinId): boolean; toggle(id: WinId): void; reset(): void }
	help(keys?: boolean): void
	/** The Walkthrough window (a project from start to release), kept open beside the drawing. */
	walkthrough(): void
	tips(): void
	/** The tools in a floating palette (else the top bar). */
	toolsFloat: boolean; toggleToolsFloat(): void
}

export function buildMenus(c: MenuCtx): Menu[] {
	const tool = (id: ToolId, label: string, key?: string): MenuItem => ({ label, key, disabled: !c.toolOk(id), run: () => c.tool(id), ...(c.toolOk(id) ? {} : { title: 'Not in this view' }) })
	/** A Shape / Box kind (the tools' flyout items). */
	const variant = (id: ToolId, v: string, label: string): MenuItem => ({ label, disabled: !c.toolOk(id), run: () => c.toolVariant(id, v) })
	return [
		{ label: 'File', items: [
			// the floorplan PDFs (upload; origin, scale, crop — also on the plan: Project › Floors…) and the issued package PDFs live in Uploads (backlog "Uploads
			// from inside cad": the link; embedding it is still to decide)
			{ label: 'Open project…', key: KEYS.openProject, run: c.openProject },
			{ label: 'Uploads…', title: 'Upload and set up floorplan PDFs (origin, scale, crop, masks, layers) without leaving cad', run: c.uploads },
			{ label: 'Photo surveys…', title: 'Open this project’s photo surveys in a new tab', run: c.surveys },
			'-',
			{ label: 'Download backup…', title: 'Save the whole project or chosen models as a file', run: () => c.backup('download') },
			{ label: 'Restore from file…', disabled: !c.canRestore, title: c.canRestore ? 'Put models back as they were in a backup file' : 'Only the project owner can restore', run: () => c.backup('restore') },
			'-',
			{ label: 'Import legacy drawings…', title: 'Bring chosen Pages models (boxes, walls) and Sheets-tool sheets of this project into cad — one undo step', run: c.legacyDrawings },
			'-',
			{ label: 'Export', children: [
				// menus review option 2 (User 2026-10-15): every export here once; this level / all levels as a submenu
				{ label: 'Outlet schedule (Excel)', children: [{ label: 'This level', run: () => c.outletSchedule(false) }, { label: 'All levels', run: () => c.outletSchedule(true) }] },
				{ label: 'Frame label sheets (Excel)', title: 'Every server room: a sheet per frame, labels colored by usage (A3)', children: [{ label: 'This level', run: () => c.frameSheets(false) }, { label: 'All levels', run: () => c.frameSheets(true) }] },
				{ label: 'Panel labels (Excel)', title: 'Every port label of the server rooms, for the label printer', children: [{ label: 'This level', run: () => c.panelLabels(false) }, { label: 'All levels', run: () => c.panelLabels(true) }] },
				{ label: 'This plan (DXF)', disabled: !c.isPlan, run: c.dxf },
				'-',
				{ label: 'Bill of materials…', run: c.bom },
				{ label: 'Cable schedule…', run: c.cableSchedule },
				{ label: 'Patch schedule · cord BOM…', run: c.cordBom },
				{ label: 'Port map of the selected devices (Excel, VLAN)', title: 'Every port of the selected panels / switches with the outlet and port it reaches, and an empty VLAN column — Excel for the network engineers', run: c.portMap },
				'-',
				{ label: 'PDF of this sheet', disabled: !c.onSheet, title: c.onSheet ? 'Download the open sheet as a PDF at true scale' : 'Open a sheet first', run: c.pdfThisSheet },
				{ label: 'PDF of all sheets', disabled: !c.hasSheets, run: c.pdfAllSheets },
				{ label: 'Monochrome PDFs', checked: c.monoPdf, title: 'Sheet PDFs in black ink: lines and text black, fills light grey, floorplans and pictures grey (for cheap prints)', run: c.toggleMonoPdf },
			] },
		] },
		{ label: 'Edit', items: [
			{ label: 'Undo', key: KEYS.undo, disabled: !c.canUndo, run: c.undo },
			{ label: 'Redo', key: KEYS.redo, disabled: !c.canRedo, run: c.redo },
			'-',
			{ label: 'Cut', key: KEYS.cut, disabled: !c.hasSelection, run: c.cut },
			{ label: 'Copy', key: KEYS.copy, disabled: !c.hasSelection, run: c.copy },
			{ label: 'Paste', key: KEYS.paste, run: c.paste },
			{ label: 'Delete', key: KEYS.del, disabled: !c.hasSelection, run: c.remove },
			'-',
			{ label: 'Select all', key: KEYS.selectAll, run: c.selectAll },
			{ label: 'Select similar', disabled: !c.hasSelection, run: c.selectSimilar },
			'-',
			{ label: 'Group', key: KEYS.group, disabled: !c.hasSelection, run: c.group },
			{ label: 'Ungroup', key: KEYS.ungroup, disabled: !c.hasSelection, run: c.ungroup },
			'-',
			{ label: 'Arrange', disabled: !c.hasSelection, children: [
				{ label: 'Bring to front', key: KEYS.toFront, disabled: !c.hasSelection, run: () => c.order('front') },
				{ label: 'Bring forward', key: KEYS.forward, disabled: !c.hasSelection, run: () => c.order('forward') },
				{ label: 'Send backward', key: KEYS.backward, disabled: !c.hasSelection, run: () => c.order('backward') },
				{ label: 'Send to back', key: KEYS.toBack, disabled: !c.hasSelection, run: () => c.order('back') },
			] },
		] },
		{ label: 'View', items: [
			{ label: 'Find a view, sheet, room, rack…', key: KEYS.find, run: c.find },
			{ label: 'Fit', key: KEYS.fit, run: c.fit },
			{ label: 'Zoom to selection', key: KEYS.zoomSel, disabled: !c.hasSelection, run: c.zoomSel },
			{ label: 'Back', key: KEYS.backView, disabled: !c.canBack, run: c.back },
			{ label: 'Forward', key: KEYS.fwdView, disabled: !c.canFwd, run: c.forward },
			'-',
			{ label: 'Split', checked: c.split, run: c.toggleSplit },
			{ label: 'Copy view as picture', title: 'The active view as you see it, onto the clipboard as a picture (paste it into an email or a report)', run: c.copyView },
			'-',
			{ label: 'Fill rates', title: c.fillHere ? 'Draw each run’s fill (the % of its limit) — on a plan, elevation or section (risers too)' : 'Fill rates show on a plan, an elevation or a section', checked: c.fill, disabled: !c.fillHere, run: c.toggleFill },
			{ label: 'Drafting', children: [
				{ label: 'Snap to grid (SNAP)', key: KEYS.snap, checked: c.drafting.snap, run: () => c.toggleDrafting('snap') },
				{ label: 'Object snaps (OSNAP)', key: KEYS.osnap, checked: c.drafting.osnap, run: () => c.toggleDrafting('osnap') },
				{ label: 'Show the grid (GRID)', key: KEYS.grid, checked: c.drafting.showGrid, run: () => c.toggleDrafting('showGrid') },
			] },
		] },
		// menus review option 2 (User 2026-10-15): CAD-style Draw · Modify · Annotate — every tool in one menu
		{ label: 'Draw', items: [
			tool('line', 'Line'),
			{ label: 'Shape', disabled: !c.toolOk('shape'), children: [variant('shape', 'rect', 'Rectangle'), variant('shape', 'polygon', 'Polygon'), variant('shape', 'ellipse', 'Ellipse'), variant('shape', 'arc', 'Arc (3 points)')] },
			{ label: 'Image…', title: 'A picture from this computer or Uploads, on a plan, an elevation, a section or a sheet', disabled: !c.toolOk('image'), run: c.image },
			'-',
			// 3D (User 2026-10-15: box, wall and opening together)
			{ label: 'Box', disabled: !c.toolOk('box'), children: [variant('box', 'rect', 'Box / desk'), variant('box', 'ellipse', 'Cylinder'), variant('box', 'polygon', 'Polygon box')] },
			tool('wall', 'Wall'), tool('opening', 'Opening (door, window, hole)'),
			'-',
			tool('room', 'Room / EPS'),
			{ label: 'Section', disabled: !c.toolOk('section'), children: [variant('section', 'line', 'Section (a cut line)'), variant('section', 'room', 'Room elevations (A–D)')] },
		] },
		{ label: 'Modify', items: [
			tool('move', 'Move'), tool('copy', 'Copy'),
			{ label: 'Array', disabled: !c.toolOk('array') || !c.hasSelection, title: 'Copies of the selection in a line, a step apart: type how many, click the base point and the step · copied outlets are numbered on', run: () => c.tool('array') },
			{ label: 'Rotate', disabled: !c.toolOk('rotate') || !c.hasSelection, title: c.toolOk('rotate') ? 'Turn the selection about a point you click: by a second point’s angle, or typed degrees (anticlockwise) · Ctrl-click keeps the originals' : 'Works in plans and sheets', run: () => c.tool('rotate') },
			{ label: 'Turn 90° right', key: KEYS.turnRight, disabled: !c.toolOk('rotate') || !c.hasSelection, run: () => c.turn90(1) },
			{ label: 'Turn 90° left', key: KEYS.turnLeft, disabled: !c.toolOk('rotate') || !c.hasSelection, run: () => c.turn90(-1) },
			{ label: 'Mirror', disabled: !c.toolOk('mirror') || !c.hasSelection, title: c.toolOk('mirror') ? 'Mirror the selection in a line you click (two points) · Ctrl-click keeps the originals' : 'Works in plans and sheets', run: () => c.tool('mirror') },
			'-',
			{ label: 'Format painter', disabled: !c.toolOk('match'), title: 'Copy the selected shape’s layer and look (color, fill, line type, lineweight, text size) onto the shapes you click', run: () => c.tool('match') },
			tool('renumber', 'Renumber'),
		] },
		{ label: 'Annotate', items: [
			tool('dimension', 'Dimension'), tool('measure', 'Measure a distance'), tool('guide', 'Guide lines'),
			'-',
			tool('text', 'Text'), tool('leader', 'Callout'), tool('cloud', 'Revision cloud'),
			'-',
			tool('legend', 'Legend'), tool('changelist', 'Change list'), tool('insert', 'Block…'),
		] },
		{ label: 'Cabling', items: [
			tool('outlet', 'Outlet'), tool('trunk', 'Trunk'), tool('conduit', 'Conduit'), { label: 'New server room…', title: 'A server room on the open floor — racks belong to one; then the Rack tool draws its racks', run: c.serverRoom }, tool('rack', 'Rack'), tool('device', 'Device'), tool('cord', 'Patch cord'),
			'-',
			{ label: 'Allocate this level', title: 'Every unallocated outlet port on the open floor onto a panel of its server room (racks in row order, top U down); existing links stay — the Outlets table shows the result', run: c.allocate },
			{ label: 'Tables', children: [
				{ label: 'Outlets', run: () => c.openTable('outlets') },
				{ label: 'Patching', run: () => c.openTable('patch') },
				{ label: 'Links', run: () => c.openTable('links') },
			] },
			{ label: 'Port map view of the selected devices', title: 'The selected panels / switches drawn like their faceplates, each port with its number and the item at its far end — put it on a sheet with To sheet…', run: c.portMapView },
			'-',
			{ label: 'Product catalogue…', title: 'Racks, cable managers, accessories and devices: their spec sheets; draw racks of a product; add your own products', run: c.catalogue },
			{ label: 'Cord label batches…', title: 'The patch cords bought, as batches of pre-printed labels: used, free, short, the next order', run: c.cordLabels },
		] },
		{ label: 'Drawings', items: [
			{ label: 'New sheet', run: c.newSheet },
			{ label: 'New sheet from this view', disabled: !c.canSheetFromView, run: c.sheetFromView },
			tool('viewport', 'Viewport'),
			'-',
			{ label: 'Sheets table', title: 'The Sheets table: every sheet with its number, title, category and status', run: () => c.sheetsTab('register') },
			{ label: 'Packages', title: 'Re-usable sets of sheets for releasing', run: () => c.sheetsTab('packages') },
			{ label: 'Releases', title: 'Every release: its sheets and revisions, the PDF, transmittal, reprint', run: () => c.sheetsTab('issues') },
			{ label: 'Release…', title: 'Release the sheets picked in the Sheets table: changed sheets get a new revision', run: () => c.sheetsTab('release') },
			'-',
			{ label: 'Title block…', title: 'The project’s title block template — Project settings, tab Sheets', run: c.titleBlock },
		] },
		{ label: 'Project', items: [
			{ label: 'New project…', title: 'Start another project: the projects page opens on New Project (codes, name, client, address, logos, members) — Save opens it in cad', run: c.newProject },
			{ label: 'Add building…', title: 'Another building of this project: a project of its own in the same group (details, members and settings copied; floors and drawings start empty)', run: c.addBuilding },
			...(c.buildings.length > 1 ? [
				{ label: 'Buildings', title: 'Open another building of this project', children: c.buildings.map((b): MenuItem => ({ label: b.label, checked: b.current, run: () => c.openBuilding(b.id) })) } as MenuItem,
				{ label: 'Copy settings from', title: 'Usages, cable types, label patterns, title block, file names … from another building (one undo step)', children: c.buildings.filter((b) => !b.current).map((b): MenuItem => ({ label: b.label, run: () => c.copySettingsFrom(b.id) })) } as MenuItem] : []),
			'-',
			...(c.projectDetails ? [{ label: 'Project details…', title: 'Name, codes, client, address, author, company, logos — the title block takes the name, client, address (Site), author (a blank Drawn), company and logos (when its template has none); the template’s own logos are set in Title block…', run: c.projectDetails }] : []),
			{ label: 'Floors…', title: "The building's floors, their names and heights — Project settings, tab Floors & heights", run: c.floors },
			{ label: 'Settings…', title: 'Project settings: floors, plans, usages, cable types, lengths & labels, sheets, files', run: c.settings },
			{ label: 'Backups…', title: 'Back up the project or chosen models, restore, download or delete backups', run: c.backups },
			'-',
			{ label: 'Rename this level…', disabled: !c.hasLevel, run: c.renameLevel },
			{ label: 'Delete this level…', disabled: !c.hasLevel, run: c.deleteLevel },
		] },
		{ label: 'Window', items: [
			...WIN_IDS.map((id): MenuItem => ({ label: WIN_TITLES[id], checked: c.win.shown(id), run: () => c.win.toggle(id) })),
			{ label: 'Tables', key: KEYS.tables, checked: c.tables, run: c.toggleTables },
			{ label: 'Tools as a floating palette', checked: c.toolsFloat, title: 'The tools float over the drawing (drag them by the grip); off: in the top bar', run: c.toggleToolsFloat },
			'-',
			{ label: 'Hide all windows', key: KEYS.hideAll, checked: c.hideAll, run: c.toggleHideAll },
			{ label: 'Reset layout', run: c.win.reset },
		] },
		{ label: 'Help', items: [
			{ label: 'Help', key: KEYS.help, run: () => c.help() },
			{ label: 'Keys and mouse', key: KEYS.keys, run: () => c.help(true) },
			{ label: 'Walkthrough: a project from start to release', run: () => c.walkthrough() },
			{ label: 'Tips', run: () => c.tips() },
		] },
	]
}

/** The right-click menu on the selection (UX21): its commands, with their keys. */
export function selectionMenu(sel: (Entity | undefined)[], c: {
	editLabel(id: string): void; remove(): void; similar(): void; group(ungroup: boolean): void; match(): void
	turn90?: (dir: 1 | -1) => void
	order(how: 'forward' | 'backward' | 'front' | 'back'): void; properties(): void
	/** Outlets and desks (blocks) selected: copy the outlets on one desk onto the others (W13). */
	desks?: () => void
	/** Ports selected on a device: their actions come first (Patch to… / Link to… — a panel's). */
	ports?: { n: number; patch(): void; interconnect?: () => void }
}): MenuItem[] {
	const shapes = sel.filter((e) => e?.type === 'shape'), one = sel.length === 1 ? sel[0] : undefined, p = c.ports
	return [
		...(p ? [
			{ label: `Patch ${p.n > 1 ? `${p.n} ports ` : ''}to…`, key: KEYS.patch, run: p.patch } as MenuItem,
			...(p.interconnect ? [{ label: 'Link to…', key: KEYS.link, run: p.interconnect } as MenuItem] : []),
			'-' as const] : []),
		...(one && labelKind(one) ? [{ label: 'Edit label', key: KEYS.editLabel, run: () => c.editLabel(one.id) } as MenuItem, '-' as const] : []),
		{ label: 'Cut', key: KEYS.cut, run: () => document.execCommand('cut') },
		{ label: 'Copy', key: KEYS.copy, run: () => document.execCommand('copy') },
		{ label: 'Delete', key: KEYS.del, run: c.remove },
		...(c.turn90 && shapes.length + sel.filter((x) => x?.type === 'rack' || x?.type === 'outlet').length ? [{ label: 'Turn 90° right', key: KEYS.turnRight, run: () => c.turn90!(1) } as MenuItem, { label: 'Turn 90° left', key: KEYS.turnLeft, run: () => c.turn90!(-1) } as MenuItem] : []),
		'-',
		{ label: 'Select similar', run: c.similar },
		...(c.desks && sel.some((x) => x?.type === 'outlet') && sel.filter((x) => x?.type === 'shape' && x.geom.kind === 'insert').length >= 1
			? [{ label: 'Copy outlets onto the other desks', title: 'The outlets on one desk, onto every other selected desk of the same block (the desk they sit on needn’t be selected) — turned with each desk, numbered on', run: c.desks } as MenuItem] : []),
		...(one?.type === 'shape' ? [{ label: 'Format painter…', title: 'Click other shapes to give them this one’s layer and look', run: c.match } as MenuItem] : []),
		...(shapes.length ? ['-' as const,
			...(shapes.length >= 2 ? [{ label: 'Group', key: KEYS.group, run: () => c.group(false) } as MenuItem] : []),
			...(shapes.some((x) => x?.type === 'shape' && x.groupId) ? [{ label: 'Ungroup', key: KEYS.ungroup, run: () => c.group(true) } as MenuItem] : []),
			{ label: 'Bring to front', key: KEYS.toFront, run: () => c.order('front') } as MenuItem,
			{ label: 'Send to back', key: KEYS.toBack, run: () => c.order('back') } as MenuItem] : []),
		'-',
		{ label: 'Properties', run: c.properties },
	]
}

/** The tab menu (a right-click on a drawing tab, UX review D1). */
export function tabMenuOf(id: string, c: {
	preview: boolean; isSheet: boolean; split: boolean
	keep(id: string): void; close(id: string): void; closeOthers(id: string): void; closeRight(id: string): void
	otherPane(id: string): void; toSheet(id: string): void
}): MenuItem[] {
	return [
		...(c.preview ? [{ label: 'Keep it open', run: () => c.keep(id) } as MenuItem] : []),
		{ label: 'Close', key: KEYS.closeTab, run: () => c.close(id) },
		{ label: 'Close others', run: () => c.closeOthers(id) },
		{ label: 'Close to the right', run: () => c.closeRight(id) },
		...(c.split ? [{ label: 'Open in the other pane', run: () => c.otherPane(id) } as MenuItem] : []),
		'-',
		{ label: 'Put this view on a sheet', disabled: c.isSheet, run: () => c.toSheet(id) },
	]
}
