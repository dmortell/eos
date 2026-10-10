// Per-user, per-project session state (ADR 0003 "view and user state"): which level is open, the active tool, its
// options, the selection, the tool-bar prompt. Never stored on the data. One instance per open project, passed down.
import type { Id, Level, Outlet } from '../domain/types'
import { type Tool, type DrawOpts, type PortSel } from '../editor/tools'
import { SelectTool } from '../editor/selectTool'
import { OutletTool } from '../editor/outletTool'
import type { PathSel } from '../editor/pathSel'
import { RackTool } from '../editor/rackTool'
import { PathTool, type PathKind } from '../editor/pathTool'
import { DeviceTool } from '../editor/deviceTool'
import { AssignTool } from '../editor/assignTool'
import { CordTool, type BulkFrom } from '../editor/cordTool'
import { NoteTool, type NoteKind } from '../editor/noteTool'
import { OpeningTool } from '../editor/openingTool'
import { SectionTool } from '../editor/sectionTool'
import { RenumberTool } from '../editor/renumberTool'
import { MatchTool } from '../editor/matchTool'
import { InsertTool } from '../editor/insertTool'
import { ShapeTool, type ShapeOpts } from '../editor/shapeTool'
import { DimTool, type DimMode } from '../editor/dimTool'
import { MoveTool } from '../editor/moveTool'
import { LegendTool } from '../editor/legendTool'
import { ViewportTool } from '../editor/viewportTool'
import type { Viewport } from '../domain/drawing'
import type { Block } from '../domain/blocks'
import type { CordDefaults } from '../domain/cords'
import type { Link } from '../domain/types'
import type { ViewSpec } from '../views/space'
import type { DeviceTemplate } from '../domain/devices'
import { LayerPrefs } from './layerPrefs.svelte'
import type { RepeatEdit } from '../domain/repeatEdit'

export type ToolId = 'select' | 'move' | 'copy' | 'insert' | 'shape' | 'box' | 'image' | 'legend' | 'dimension' | 'outlet' | 'rack' | 'device' | 'assign' | 'cord' | 'opening' | 'section' | 'renumber' | 'viewport' | 'match' | NoteKind | PathKind

/** Which views each tool works in (Dave: an Outlet click in a rack view added outlets by mistake). Select works
 *  everywhere; drawing tools in plan and elevations; the rack tool on the plan; devices / cords / assign in rack views. */
export const TOOL_VIEWS: Record<ToolId, ViewSpec['kind'][]> = {
	select: ['plan', 'elevation', 'row', 'sheet', 'riser', 'section'],
	section: ['plan'], viewport: ['sheet'],
	insert: ['plan', 'elevation', 'section', 'sheet'], shape: ['plan', 'elevation', 'section', 'sheet'], box: ['plan'], image: ['plan', 'elevation', 'section', 'sheet'], legend: ['plan', 'sheet'], dimension: ['plan', 'elevation', 'section', 'sheet'], move: ['plan', 'elevation', 'section', 'sheet'], copy: ['plan', 'elevation', 'section', 'sheet'],
	outlet: ['plan', 'elevation'], line: ['plan', 'elevation', 'sheet'], trunk: ['plan', 'elevation'], conduit: ['plan', 'elevation'], wall: ['plan', 'elevation'],
	rack: ['plan'], opening: ['plan'], renumber: ['plan', 'elevation', 'row'], match: ['plan', 'elevation', 'section', 'sheet'],
	device: ['row'], cord: ['row'], assign: ['row'],
	text: ['sheet', 'plan', 'elevation', 'section'], leader: ['sheet', 'plan', 'elevation', 'section'], cloud: ['sheet', 'plan', 'elevation', 'section'],
}
/** The annotation tools: on a sheet they always annotate the VIEW (an edited viewport is left first, Dave 2026-10-07),
 *  so they work while any viewport is being edited, whatever it shows. */
export const ANNOTATION_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['text', 'leader', 'cloud', 'dimension'])
/** `onSheet`: the view is a viewport being edited on a sheet. */
export const toolWorksIn = (id: ToolId, kind: ViewSpec['kind'], onSheet = false) => TOOL_VIEWS[id].includes(kind) || (onSheet && ANNOTATION_TOOLS.has(id))

export interface Drafting { snap: boolean; grid: number; osnap: boolean; showGrid: boolean }
export interface ViewInfo { loading?: boolean; xy: string | null; readout: string | null; scale: string; zoom: number; mmPerPx: number; extra?: string }
const DRAFTING_KEY = 'cad-drafting'
function loadDrafting(): Drafting {
	const d: Drafting = { snap: true, grid: 10, osnap: true, showGrid: false }
	try { return { ...d, ...JSON.parse(localStorage.getItem(DRAFTING_KEY) ?? '{}') } } catch { return d }
}

/** The tool-bar prompt: a number (rise to Z, riser level) or a typed point (text). `apply` gets the raw text. */
export interface Prompt { label: string; value: string; text: boolean; apply: (v: string) => void }

export class Workspace {
	levelId = $state<Id | null>(null)
	toolId = $state<ToolId>('select')
	/** Replaced wholesale, never mutated ($state.raw: identity changes are the signal). */
	selection = $state.raw<Id[]>([])
	opts = $state<DrawOpts>({ z: 0, w: 100, h: 50 })
	/** The work depth of elevations (ADR 0006); null = the middle of the level's content. */
	depth = $state<number | null>(null)
	prompt = $state<Prompt | null>(null)
	/** The template the device tool adds (chosen in the tool bar). */
	deviceTemplate = $state.raw<DeviceTemplate | null>(null)
	/** A DRAG that arms a tool (the Device library's templates, outlets from the table, ports from Port Properties —
	 *  backlog "Bulk patching by drag"): over a rack view it arms its tool once (`arm`), the drop is that tool's click on
	 *  the port / U under it, and when the drag ends the tool you had comes back (`disarm` undoes an unused arming). */
	dragArm = $state.raw<{ prevTool: ToolId; arm: () => void; disarm?: () => void; armed?: boolean } | null>(null)
	/** Start such a drag (from a dragstart). */
	startDrag(arm: () => void, disarm?: () => void): void { this.dragArm = { prevTool: this.toolId, arm, disarm } }
	/** The drag ended (dropped or not): unused arming undone, the tool you had back. */
	endDrag(): void {
		const d = this.dragArm
		this.dragArm = null
		if (!d) return
		d.disarm?.()
		if (d.armed) this.toolId = d.prevTool
	}
	/** The last device edit made in Properties, for F4 (repeat on the selected devices). */
	lastDeviceEdit = $state.raw<RepeatEdit | null>(null)
	/** The device tool's Mount: a both-face device (a panel) fixed to the front or rear only (shares its U). */
	deviceMount = $state<'front' | 'rear' | undefined>(undefined)
	/** The Shape tool's choice: rectangle / ellipse / polygon (its sides, inscribed or circumscribed). */
	shapeOpts = $state<ShapeOpts>({ kind: 'rect', sides: 6, inscribed: true })
	/** The Box tool's options: a desk by default (750 high, from the floor). */
	boxOpts = $state<ShapeOpts>({ kind: 'rect', sides: 6, inscribed: true, height: 750, z: 0 })
	/** The Image tool's picture (Insert › Image…): its file in Uploads and page, and its name for the hint. */
	imagePick = $state<{ fileId: string; page?: number; name: string } | null>(null)
	/** The Dimension tool's kind: along the two points, or only horizontally / vertically. */
	dimMode = $state<DimMode>('aligned')
	/** The block the Insert tool places (picked in the Blocks list). */
	insertBlock = $state.raw<Block | null>(null)
	/** The Opening tool's swing (none / left / right), sticky like the cord defaults. */
	openingSwing = $state<'left' | 'right' | undefined>(undefined)
	/** The plan's Fill overlay (Phase 5.3). */
	showFill = $state(false)
	/** Drafting switches in the status bar (UX05): SNAP = moves / points to the grid (step `grid` mm), OSNAP = object
	 *  snaps, GRID = the grid drawn. Kept per browser. Alt still skips the snaps for one action. */
	drafting = $state<Drafting>(loadDrafting())
	saveDrafting(): void { try { localStorage.setItem(DRAFTING_KEY, JSON.stringify(this.drafting)) } catch { /* storage blocked */ } }
	/** What the active view reports for the status bar: the cursor, length · angle while drawing, scale and zoom. */
	viewInfo = $state.raw<ViewInfo | null>(null)
	/** Show this one thing when the view next fits (a `?rack=` link, Find a device); cleared once done. Reactive, so a
	 *  focus set after a view switch still fits (Find: set it after the new view is up, or the old view takes it). */
	focus = $state<Id | null>(null)
	/** The Outlet tool's settings for the next outlet (tool bar); unset = like the last one placed. */
	outletNext = $state.raw<{ ports?: number; tier?: Outlet['tier']; usage?: string; mount?: Outlet['mount']; cableType?: string }>({})
	/** The user's hidden / locked / current layers (loaded by the app with the project id). */
	readonly layers = new LayerPrefs()
	/** A short status message (why a click was refused …); clears itself. */
	message = $state<string | null>(null)
	#msgTimer: ReturnType<typeof setTimeout> | undefined
	readonly rackTool = new RackTool(() => { this.toolId = 'select' })
	/** Set by the app: the Delete key's action (with its confirms) — for the Delete buttons. */
	remove: () => void = () => {}
	/** Set by the app: the view a new viewport shows (the Viewport tool) — the other pane's, else the last model view. */
	viewportView: () => Viewport['view'] | null = () => null
	/** Set by the app: open the project's title block dialog (Sheets › Title block…, sheet Properties). */
	openTitleBlock: () => void = () => {}
	/** Open the Restore dialog on a stored backup (an issue's, from the Issues list); set by the shell. */
	restoreBackup: (backupId: string) => void = () => {}
	/** Set by the app: select what the active view shows like the selection (Properties → Select similar). */
	selectSimilar: () => void = () => {}
	/** Set by the app: open a view in its own tab (the viewport chip's "Open view"). */
	openInTab: (v: { levelId?: Id; spec: ViewSpec }) => void = () => {}
	/** Set by the app: show a view in the active pane (a section's Open button). */
	openView: (s: ViewSpec) => void = () => {}
	/** Set by the app (it owns the store): how the assign tool writes. */
	applyLinks: (label: string, add: Link[], remove: Id[]) => void = () => {}
	readonly assignTool = new AssignTool(() => { this.toolId = 'select' }, (l, a, r) => this.applyLinks(l, a, r))
	/** Sticky cord defaults: the last type / colour chosen stays for the next cord (the Patching tool's habit). */
	cordDefaults = $state<CordDefaults>({ cableType: 'cat6a', colour: '#3b82f6' })
	/** The cable type for new interconnects (ties, backbone) — its own, kept as last chosen ('' = the cord type). */
	linkType = $state('')
	bulkFrom = $state.raw<BulkFrom | null>(null)
	/** Match properties: its source is set when it starts (CadShell setTool). */
	readonly matchTool = new MatchTool()
	readonly cordTool = new CordTool(() => this.cordDefaults, { get: () => this.bulkFrom, set: (b) => { this.bulkFrom = b } }, () => this.linkType)
	readonly tools: Record<ToolId, Tool> = {
		select: new SelectTool(), move: new MoveTool('move'), copy: new MoveTool('copy'), insert: new InsertTool(() => this.insertBlock), shape: new ShapeTool(() => this.shapeOpts), box: new ShapeTool(() => this.boxOpts, 'box'), image: new ShapeTool(() => ({ kind: 'image', sides: 4, inscribed: true, ...(this.imagePick ? { image: this.imagePick } : {}) }), 'image'), legend: new LegendTool(), viewport: new ViewportTool(() => this.viewportView(), () => { this.toolId = 'select' }), dimension: new DimTool(() => this.dimMode), outlet: new OutletTool(() => this.outletNext), rack: this.rackTool, device: new DeviceTool(() => this.deviceTemplate, () => this.deviceMount), assign: this.assignTool, cord: this.cordTool,
		text: new NoteTool('text'), leader: new NoteTool('leader'), cloud: new NoteTool('cloud'),
		opening: new OpeningTool(() => this.openingSwing), section: new SectionTool(), renumber: new RenumberTool(), match: this.matchTool,
		line: new PathTool('line'), trunk: new PathTool('trunk'), conduit: new PathTool('conduit'), wall: new PathTool('wall'),
	}

	get tool(): Tool { return this.tools[this.toolId] }

	say = (msg: string): void => {
		this.message = msg
		clearTimeout(this.#msgTimer)
		this.#msgTimer = setTimeout(() => { this.message = null }, 4000)
	}

	/** Arm the rack tool with one rack from the racks list; the next click on the plan places it. */
	placeRack(id: Id): void {
		this.rackTool.target = id
		this.toolId = 'rack'
	}
	/** Arm a bulk patch from these ports; the next port click is where the cords start on the other device. */
	patchFrom(sel: PortSel): void {
		this.bulkFrom = { on: sel.on, ports: [...sel.ports], face: sel.face }
		this.toolId = 'cord'
	}
	/** Arm an interconnect from these ports (backbone / tie cables, Phase 5): the next port clicked — in any room, on
	 *  any floor — is where they start on the other panel. */
	interconnectFrom(sel: PortSel): void {
		this.bulkFrom = { on: sel.on, ports: [...sel.ports], face: sel.face, kind: 'link' }
		this.toolId = 'cord'
	}
	/** Arm "assign by hand" with these outlets; the next panel-port click places them. */
	assignOutlets(ids: Id[]): void {
		this.assignTool.outlets = ids
		this.toolId = 'assign'
	}
	/** The Rack tool button: draw new racks (like the last one) with each click. */
	drawRacks(): void {
		this.rackTool.target = null
		this.toolId = 'rack'
	}
	/** Ports selected on one device in a rack row; dropped when that device leaves the selection. */
	portSel = $state.raw<PortSel | null>(null)
	/** One opening of the selected wall (Phase 6: holes are selectable; Delete removes just it). */
	openingSel = $state.raw<{ wallId: Id; openingId: string } | null>(null)
	selectOpening = (wallId: Id, openingId: string | null): void => { this.openingSel = openingId ? { wallId, openingId } : null }
	/** Nodes or segments of the selected run (a click on a grip / a second click on a segment); Delete removes them. */
	pathSel = $state.raw<PathSel | null>(null)
	selectPath = (s: PathSel | null): void => { this.pathSel = s && (s.nodes.length || s.segs.length) ? s : null }
	select = (ids: Id[]): void => {
		if (this.openingSel && !(ids.length === 1 && ids[0] === this.openingSel.wallId)) this.openingSel = null
		if (this.pathSel && !(ids.length === 1 && ids[0] === this.pathSel.shape)) this.pathSel = null
		this.selection = ids
		if (this.portSel && !ids.includes(this.portSel.on)) this.portSel = null
		if (ids.length !== 1) this.viewportId = null   // a viewport is picked within ONE selected sheet
	}
	selectPorts = (s: PortSel | null): void => { this.portSel = s && s.ports.length ? s : null }
	/** The viewport selected on the selected sheet (null = the sheet itself). */
	viewportId = $state<Id | null>(null)
	/** Editing the model INSIDE a sheet viewport (UX review S5): double-click it; Esc / a double-click outside leaves. */
	vpEdit = $state<{ sheetId: Id; vpId: Id } | null>(null)
	/** "Pan / zoom content" (Dave: instead of Alt): a drag inside the selected / edited viewport pans its view and the
	 *  wheel steps its scale, with no Alt. */
	vpContentNav = $state(false)
	/** An elevation's DEPTH BAND (UX14, a test): around the work depth, `front` mm towards the viewer and `back` mm away.
	 *  Nearer is left out, further is faded; the plan shows the band in Split. For the session. */
	band = $state({ on: false, front: 1000, back: 4000 })
	/** Bumped to focus the Navigator's search (Ctrl+K). */
	navSearch = $state(0)
	/** The right-click menu on the selection (UX21), at a screen point; null = closed. */
	contextMenu = $state<{ x: number; y: number } | null>(null)
	selectViewport = (id: Id | null): void => { this.viewportId = id }
	/** A question in the tool bar with a yes button (e.g. changing labels that were already printed). */
	confirm = $state<{ msg: string; yes: string; apply: () => void; alt?: { label: string; apply: () => void } } | null>(null)
	/** `alt` = a second answer (two ways to go on, e.g. keep a section's viewports as elevations, or delete them). */
	ask2 = (msg: string, yes: string, apply: () => void, alt?: { label: string; apply: () => void }): void => { this.confirm = { msg, yes, apply, ...(alt ? { alt } : {}) } }
	ask = (label: string, value: number, apply: (v: number) => void): void => {
		this.prompt = { label, value: String(value), text: false, apply: (t) => { const v = Number(t); if (t.trim() !== '' && Number.isFinite(v)) apply(v) } }
	}
	askText = (label: string, value: string, apply: (t: string) => void): void => { this.prompt = { label, value, text: true, apply } }
	/** The text being edited in place on the drawing (double-click / F2; backlog "Text options"). */
	textEdit = $state<Id | null>(null)
	editText = (id: Id): void => { this.textEdit = id }

	/** Switch tool, with the drawing defaults that suit it on this level (ADR 0006 work Z presets). The surface cancels
	 *  the old tool first (it owns the tool context). */
	setTool(id: ToolId, level?: Level): void {
		this.toolId = id
		const h = level?.heights
		if (id === 'trunk' || id === 'conduit') this.opts = { z: h ? h.clearHeightMm + h.plenumMm / 2 : 2900, w: id === 'conduit' ? 25 : 100, h: id === 'conduit' ? 25 : 50 }
		else if (id === 'wall') this.opts = { z: 0, w: 100, h: h?.clearHeightMm ?? 2700 }
		else if (id === 'line') this.opts = { ...this.opts, z: 0 }
		else if (id === 'opening') this.opts = { z: 0, w: 900, h: 2100 }
	}
}
