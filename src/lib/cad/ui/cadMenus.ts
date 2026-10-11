// The MENU BAR's contents (UX review S4): File · Edit · View · Insert · Cabling · Sheets · Project · Window · Help.
// Built from what the shell can do (`MenuCtx`), so the menus never hold state of their own; each item shows its key.
import type { ToolId } from '../app/workspace.svelte'
import { WIN_IDS, WIN_TITLES, type WinId } from '../app/windows.svelte'
import type { Entity } from '../domain/drawing'
import { labelKind } from '../domain/labelEdit'

export type MenuItem = { label: string; key?: string; checked?: boolean; disabled?: boolean; title?: string; run: () => void } | '-'
export interface Menu { label: string; items: MenuItem[] }

export interface MenuCtx {
	// File
	outletSchedule(all: boolean): void
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
	// Edit
	undo(): void; redo(): void; canUndo: boolean; canRedo: boolean
	copy(): void; cut(): void; paste(): void
	remove(): void; hasSelection: boolean
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
	fill: boolean; toggleFill(): void; isPlan: boolean
	drafting: { snap: boolean; osnap: boolean; showGrid: boolean }; toggleDrafting(k: 'snap' | 'osnap' | 'showGrid'): void
	// tools (Insert, Cabling)
	tool(id: ToolId): void; toolOk(id: ToolId): boolean
	openTable(t: 'outlets' | 'patch' | 'sheets' | 'links'): void
	cordBom(): void; portMap(): void; portMapView(): void; cableSchedule(): void; bom(): void
	// Sheets
	newSheet(): void; sheetFromView(): void; canSheetFromView: boolean; titleBlock(): void
	/** Insert › Image…: pick the picture, then the Image tool. */
	image(): void
	// Project
	floors(): void; settings(): void; backups(): void
	hasLevel: boolean; renameLevel(): void; deleteLevel(): void
	// Window / Help
	win: { shown(id: WinId): boolean; toggle(id: WinId): void; reset(): void }
	help(keys?: boolean): void
}

export function buildMenus(c: MenuCtx): Menu[] {
	const tool = (id: ToolId, label: string, key?: string): MenuItem => ({ label, key, disabled: !c.toolOk(id), run: () => c.tool(id), ...(c.toolOk(id) ? {} : { title: 'Not in this view' }) })
	return [
		{ label: 'File', items: [
			// the floorplan PDFs (upload; origin, scale, crop — also on the plan: Floor manager) and the issued package PDFs live in Uploads (backlog "Uploads
			// from inside cad": the link; embedding it is still to decide)
			{ label: 'Open project…', key: 'Ctrl+O', run: c.openProject },
			{ label: 'Uploads…', title: 'Open the Uploads tool (floorplan PDFs, issued PDFs) in a new tab', run: c.uploads },
			'-',
			{ label: 'Download backup…', title: 'Save the whole project or chosen models as a file', run: () => c.backup('download') },
			{ label: 'Restore from file…', disabled: !c.canRestore, title: c.canRestore ? 'Put models back as they were in a backup file' : 'Only the project owner can restore', run: () => c.backup('restore') },
			'-',
			{ label: 'Outlet schedule — this level (Excel)', run: () => c.outletSchedule(false) },
			{ label: 'Outlet schedule — all levels (Excel)', run: () => c.outletSchedule(true) },
			{ label: 'This plan (DXF)', disabled: !c.isPlan, run: c.dxf },
			'-',
			{ label: 'Bill of materials…', run: c.bom },
			{ label: 'Cable schedule…', run: c.cableSchedule },
			{ label: 'Patch schedule / cord BOM…', run: c.cordBom },
			{ label: 'Port map of the selected devices (Excel, VLAN)', title: 'Every port of the selected panels / switches with the outlet and port it reaches, and an empty VLAN column — Excel for the network engineers', run: c.portMap },
			'-',
			{ label: 'PDF of this sheet', disabled: !c.onSheet, title: c.onSheet ? 'Download the open sheet as a PDF at true scale' : 'Open a sheet first', run: c.pdfThisSheet },
			{ label: 'PDF of all sheets', disabled: !c.hasSheets, run: c.pdfAllSheets },
		] },
		{ label: 'Edit', items: [
			{ label: 'Undo', key: 'Ctrl+Z', disabled: !c.canUndo, run: c.undo },
			{ label: 'Redo', key: 'Ctrl+Y', disabled: !c.canRedo, run: c.redo },
			'-',
			{ label: 'Cut', key: 'Ctrl+X', disabled: !c.hasSelection, run: c.cut },
			{ label: 'Copy', key: 'Ctrl+C', disabled: !c.hasSelection, run: c.copy },
			{ label: 'Paste', key: 'Ctrl+V', run: c.paste },
			{ label: 'Delete', key: 'Delete', disabled: !c.hasSelection, run: c.remove },
			'-',
			{ label: 'Select all', key: 'Ctrl+A', run: c.selectAll },
			{ label: 'Select similar', disabled: !c.hasSelection, run: c.selectSimilar },
			{ label: 'Match properties', disabled: !c.toolOk('match'), title: 'Copy the selected shape’s layer and look (colour, fill, line type, lineweight, text size) onto the shapes you click', run: () => c.tool('match') },
			'-',
			{ label: 'Group', key: 'Ctrl+G', disabled: !c.hasSelection, run: c.group },
			{ label: 'Ungroup', key: 'Ctrl+Shift+G', disabled: !c.hasSelection, run: c.ungroup },
			'-',
			{ label: 'Bring to front', key: 'Ctrl+Shift+]', disabled: !c.hasSelection, run: () => c.order('front') },
			{ label: 'Bring forward', key: 'Ctrl+]', disabled: !c.hasSelection, run: () => c.order('forward') },
			{ label: 'Send backward', key: 'Ctrl+[', disabled: !c.hasSelection, run: () => c.order('backward') },
			{ label: 'Send to back', key: 'Ctrl+Shift+[', disabled: !c.hasSelection, run: () => c.order('back') },
		] },
		{ label: 'View', items: [
			{ label: 'Find a view, sheet, room, rack…', key: 'Ctrl+K', run: c.find },
			{ label: 'Fit', key: 'Home', run: c.fit },
			{ label: 'Zoom to selection', key: 'Shift+Home', disabled: !c.hasSelection, run: c.zoomSel },
			{ label: 'Split', checked: c.split, run: c.toggleSplit },
			{ label: 'Back', key: 'Alt+←', disabled: !c.canBack, run: c.back },
			{ label: 'Forward', key: 'Alt+→', disabled: !c.canFwd, run: c.forward },
			'-',
			{ label: 'Tables panel', key: 'Ctrl+,', checked: c.tables, run: c.toggleTables },
			{ label: 'Hide all windows', key: 'Ctrl+.', checked: c.hideAll, run: c.toggleHideAll },
			'-',
			{ label: 'Fill overlay', checked: c.fill, disabled: !c.isPlan, run: c.toggleFill },
			{ label: 'Snap to grid (SNAP)', key: 'F9', checked: c.drafting.snap, run: () => c.toggleDrafting('snap') },
			{ label: 'Object snaps (OSNAP)', key: 'F3', checked: c.drafting.osnap, run: () => c.toggleDrafting('osnap') },
			{ label: 'Show the grid (GRID)', key: 'F7', checked: c.drafting.showGrid, run: () => c.toggleDrafting('showGrid') },
		] },
		{ label: 'Insert', items: [
			tool('insert', 'Block…'), tool('legend', 'Legend'), { label: 'Image…', title: 'A picture from this computer or Uploads, on a plan, an elevation, a section or a sheet', disabled: !c.toolOk('image'), run: c.image }, '-',
			tool('text', 'Text'), tool('leader', 'Leader'), tool('cloud', 'Revision cloud'), tool('dimension', 'Dimension'), '-',
			tool('viewport', 'Viewport'),
		] },
		{ label: 'Cabling', items: [
			tool('outlet', 'Outlet'), tool('trunk', 'Trunk'), tool('conduit', 'Conduit'), tool('rack', 'Rack'), tool('device', 'Device'), tool('cord', 'Patch cord'), tool('renumber', 'Renumber'),
			'-',
			{ label: 'Outlets table', run: () => c.openTable('outlets') },
			{ label: 'Patch list', run: () => c.openTable('patch') },
			{ label: 'Links table', run: () => c.openTable('links') },
			'-',
			{ label: 'Patch schedule / cord BOM…', run: c.cordBom },
			{ label: 'Port map view of the selected devices', title: 'The selected panels / switches drawn like their faceplates, each port with its number and the item at its far end — put it on a sheet with To sheet…', run: c.portMapView },
			{ label: 'Port map of the selected devices (Excel, VLAN)', title: 'Every port of the selected panels / switches with the outlet and port it reaches, and an empty VLAN column — Excel for the network engineers', run: c.portMap },
			{ label: 'Cable schedule…', run: c.cableSchedule },
			{ label: 'Bill of materials…', run: c.bom },
		] },
		{ label: 'Sheets', items: [
			{ label: 'New sheet', run: c.newSheet },
			{ label: 'New sheet from this view', disabled: !c.canSheetFromView, run: c.sheetFromView },
			'-',
			{ label: 'Title block…', run: c.titleBlock },
			{ label: 'Sheet register', run: () => c.openTable('sheets') },
			{ label: 'PDF of this sheet', disabled: !c.onSheet, title: c.onSheet ? 'Download the open sheet as a PDF at true scale' : 'Open a sheet first', run: c.pdfThisSheet },
			{ label: 'PDF of all sheets', disabled: !c.hasSheets, run: c.pdfAllSheets },
		] },
		{ label: 'Project', items: [
			{ label: 'Floors…', title: "The building's floors, their names and heights", run: c.floors },
			{ label: 'Settings… (usages, cable types, files)', run: c.settings },
			{ label: 'Backups…', title: 'Back up the project or chosen models, restore, download or delete backups', run: c.backups },
			'-',
			{ label: 'Rename this level…', disabled: !c.hasLevel, run: c.renameLevel },
			{ label: 'Delete this level…', disabled: !c.hasLevel, run: c.deleteLevel },
		] },
		{ label: 'Window', items: [
			...WIN_IDS.map((id): MenuItem => ({ label: WIN_TITLES[id], checked: c.win.shown(id), run: () => c.win.toggle(id) })),
			'-',
			{ label: 'Hide all windows', key: 'Ctrl+.', checked: c.hideAll, run: c.toggleHideAll },
			{ label: 'Reset layout', run: c.win.reset },
		] },
		{ label: 'Help', items: [
			{ label: 'Help', key: 'F1', run: () => c.help() },
			{ label: 'Keys and mouse', key: '?', run: () => c.help(true) },
		] },
	]
}

/** The right-click menu on the selection (UX21): its commands, with their keys. */
export function selectionMenu(sel: (Entity | undefined)[], c: {
	editLabel(id: string): void; remove(): void; similar(): void; group(ungroup: boolean): void; match(): void
	order(how: 'forward' | 'backward' | 'front' | 'back'): void; properties(): void
	/** Ports selected on a device: their actions come first (Patch to… / Link to… — a panel's). */
	ports?: { n: number; patch(): void; interconnect?: () => void }
}): MenuItem[] {
	const shapes = sel.filter((e) => e?.type === 'shape'), one = sel.length === 1 ? sel[0] : undefined, p = c.ports
	return [
		...(p ? [
			{ label: `Patch ${p.n > 1 ? `${p.n} ports ` : ''}to…`, key: 'P', run: p.patch } as MenuItem,
			...(p.interconnect ? [{ label: 'Link to…', key: 'L', run: p.interconnect } as MenuItem] : []),
			'-' as const] : []),
		...(one && labelKind(one) ? [{ label: 'Edit label', key: 'F2', run: () => c.editLabel(one.id) } as MenuItem, '-' as const] : []),
		{ label: 'Cut', key: 'Ctrl+X', run: () => document.execCommand('cut') },
		{ label: 'Copy', key: 'Ctrl+C', run: () => document.execCommand('copy') },
		{ label: 'Delete', key: 'Delete', run: c.remove },
		'-',
		{ label: 'Select similar', run: c.similar },
		...(one?.type === 'shape' ? [{ label: 'Match properties…', title: 'Click other shapes to give them this one’s layer and look', run: c.match } as MenuItem] : []),
		...(shapes.length ? ['-' as const,
			...(shapes.length >= 2 ? [{ label: 'Group', key: 'Ctrl+G', run: () => c.group(false) } as MenuItem] : []),
			...(shapes.some((x) => x?.type === 'shape' && x.groupId) ? [{ label: 'Ungroup', key: 'Ctrl+Shift+G', run: () => c.group(true) } as MenuItem] : []),
			{ label: 'Bring to front', key: 'Ctrl+Shift+]', run: () => c.order('front') } as MenuItem,
			{ label: 'Send to back', key: 'Ctrl+Shift+[', run: () => c.order('back') } as MenuItem] : []),
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
		{ label: 'Close', key: 'Alt+W', run: () => c.close(id) },
		{ label: 'Close others', run: () => c.closeOthers(id) },
		{ label: 'Close to the right', run: () => c.closeRight(id) },
		...(c.split ? [{ label: 'Open in the other pane', run: () => c.otherPane(id) } as MenuItem] : []),
		'-',
		{ label: 'Put this view on a sheet', disabled: c.isSheet, run: () => c.toSheet(id) },
	]
}
