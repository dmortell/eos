// Per-user, per-project session state (ADR 0003 "view and user state"): which level each pane shows, the active tool, its
// options, the selection, the tool-bar prompt. Never stored on the data. One instance per open project, passed down.
import type { Id, Level, Outlet, Device } from '../domain/types'
import { heightsOf } from '../domain/floors'
import { type Tool, type DrawOpts, type PortSel } from '../editor/tools'
import { gridStepOf } from '../editor/snap'
import { SelectTool } from '../editor/selectTool'
import { OutletTool, type OutletNext } from '../editor/outletTool'
import type { AlignHow } from '../editor/align'
import type { PathSel } from '../editor/pathSel'
import { RackTool } from '../editor/rackTool'
import { RoomTool } from '../editor/roomTool'
import { MeasureTool } from '../editor/measureTool'
import { PathTool, type PathKind } from '../editor/pathTool'
import { DeviceTool } from '../editor/deviceTool'
import { AssignTool } from '../editor/assignTool'
import { CordTool, type BulkFrom, type PatchPreview } from '../editor/cordTool'
import { NoteTool, type NoteKind } from '../editor/noteTool'
import { OpeningTool } from '../editor/openingTool'
import { SectionTool } from '../editor/sectionTool'
import { RenumberTool } from '../editor/renumberTool'
import { MatchTool } from '../editor/matchTool'
import { InsertTool } from '../editor/insertTool'
import { ShapeTool, type ShapeOpts } from '../editor/shapeTool'
import { DimTool, type DimMode } from '../editor/dimTool'
import { MoveTool } from '../editor/moveTool'
import { TransformTool } from '../editor/transformTool'
import { LegendTool } from '../editor/legendTool'
import { ViewportTool } from '../editor/viewportTool'
import type { Viewport } from '../domain/drawing'
import type { Prim } from '../domain/prim'
import { linkUrl, type InsertLink } from '../domain/links'
import type { Block } from '../domain/blocks'
import type { CordDefaults } from '../domain/cords'
import type { Link } from '../domain/types'
import type { ViewSpec } from '../views/space'
import type { DeviceTemplate } from '../domain/devices'
import { LayerPrefs } from './layerPrefs.svelte'
import type { RepeatEdit } from '../domain/repeatEdit'
import { CalibrateTool, type CalibTarget, type CalibMode } from '../editor/calibrateTool'
import { GuideTool } from '../editor/guideTool'
import { parseInputMode, INPUT_MODE_KEY, type InputMode } from '../editor/inputMode'
import type { Underlay } from '../domain/types'
import type { Guide } from '../domain/guides'
import type { PageCalibUsed } from './pdf.svelte'
import type { ToolDefaults } from '../domain/toolDefaults'

export type ToolId = 'select' | 'move' | 'copy' | 'array' | 'room' | 'measure' | 'rotate' | 'mirror' | 'insert' | 'shape' | 'box' | 'image' | 'legend' | 'dimension' | 'outlet' | 'rack' | 'device' | 'assign' | 'cord' | 'opening' | 'section' | 'renumber' | 'viewport' | 'match' | 'calibrate' | 'guide' | NoteKind | PathKind

/** Which views each tool works in (User: an Outlet click in a rack view added outlets by mistake). Select works
 *  everywhere; drawing tools in plan and elevations; the rack tool on the plan; devices / cords / assign in rack views. */
export const TOOL_VIEWS: Record<ToolId, ViewSpec['kind'][]> = {
	select: ['plan', 'elevation', 'row', 'sheet', 'riser', 'section', 'portmap', 'ports', 'schedule', 'fill'],
	section: ['plan'], room: ['plan'], measure: ['plan', 'elevation', 'section'], viewport: ['sheet'], calibrate: ['plan'], guide: ['plan', 'elevation', 'section', 'sheet', 'row'],
	insert: ['plan', 'elevation', 'section', 'sheet'], shape: ['plan', 'elevation', 'section', 'sheet'], box: ['plan', 'elevation', 'section'], image: ['plan', 'elevation', 'section', 'sheet'], legend: ['plan', 'sheet'], dimension: ['plan', 'elevation', 'section', 'sheet'], move: ['plan', 'elevation', 'section', 'sheet'], copy: ['plan', 'elevation', 'section', 'sheet'], array: ['plan', 'elevation', 'section', 'sheet'], rotate: ['plan', 'sheet'], mirror: ['plan', 'sheet'],
	outlet: ['plan', 'elevation', 'section'], line: ['plan', 'elevation', 'section', 'sheet'], trunk: ['plan', 'elevation', 'section'], conduit: ['plan', 'elevation', 'section'], wall: ['plan', 'elevation'],
	rack: ['plan'], opening: ['plan'], renumber: ['plan', 'elevation', 'row'], match: ['plan', 'elevation', 'section', 'sheet'],
	device: ['row'], cord: ['row'], assign: ['row'],
	text: ['sheet', 'plan', 'elevation', 'section'], leader: ['sheet', 'plan', 'elevation', 'section'], cloud: ['sheet', 'plan', 'elevation', 'section'],
}
/** The annotation tools: on a sheet they always annotate the VIEW (an edited viewport is left first, User 2026-10-07),
 *  so they work while any viewport is being edited, whatever it shows. */
export const ANNOTATION_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['text', 'leader', 'cloud', 'dimension'])
/** `onSheet`: the view is a viewport being edited on a sheet. */
export const toolWorksIn = (id: ToolId, kind: ViewSpec['kind'], onSheet = false) => TOOL_VIEWS[id].includes(kind) || (onSheet && ANNOTATION_TOOLS.has(id))

export interface Drafting { snap: boolean; grid: number; osnap: boolean; showGrid: boolean }
export interface ViewInfo { loading?: boolean; xy: string | null; readout: string | null; scale: string; zoom: number; mmPerPx: number; extra?: string }
const DRAFTING_KEY = 'cad-drafting'
function loadDrafting(): Drafting {
	const d: Drafting = { snap: true, grid: 10, osnap: true, showGrid: false }
	try {
		const o = { ...d, ...JSON.parse(localStorage.getItem(DRAFTING_KEY) ?? '{}') } as Drafting
		return { ...o, grid: gridStepOf(o.grid) ?? d.grid }   // the step is typed now: a bad stored one is the default
	} catch { return d }
}

/** How plans and rack views look ON SCREEN for this user (User 2026-10-12: a personal toggle, not a project setting —
 *  sheets have their own): floorplans black and white, outlets in their usage's color, cords along the channels. */
export interface ScreenLook { gray: boolean; byUsage: boolean; cordChannels: boolean }
const SCREEN_KEY = 'cad-screen'
function loadScreen(): ScreenLook {
	const d: ScreenLook = { gray: false, byUsage: true, cordChannels: false }
	try { return { ...d, ...JSON.parse(localStorage.getItem(SCREEN_KEY) ?? '{}') } } catch { return d }
}

const GUIDES_KEY = 'cad-guides'
function loadGuides(): Record<string, Guide[]> {
	try { const o = JSON.parse(localStorage.getItem(GUIDES_KEY) ?? '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

/** The tool-bar prompt: a number (rise to Z, riser level) or a typed point (text). `apply` gets the raw text. */
/** `choices`: answers also shown as buttons at the top of the drawing (R7-17: V's floors) */
export interface Prompt { label: string; value: string; text: boolean; apply: (v: string) => void; choices?: { label: string; value: string }[] }

export class Workspace {
	/** Each pane's level (User: 2F plan beside 3F plan, area plan 3303 beside 3307) and which pane is active.
	 *  `levelId` is the ACTIVE pane's: whatever reads or sets "the open level" (Properties, the tools, the tables,
	 *  Floors, the Navigator, Project › Rename this level…) works on the pane you're in. */
	paneLevels = $state<(Id | null)[]>([null, null])
	pane = $state(0)
	get levelId(): Id | null { return this.paneLevels[this.pane] ?? null }
	set levelId(id: Id | null) { this.paneLevels[this.pane] = id }
	/** One pane → two: the new pane starts on the same level. Two → one: the active pane stays, with its level. */
	setPaneCount(n: 1 | 2): void {
		if (n === 2) { this.paneLevels[1] = this.paneLevels[0]; return }
		this.paneLevels[0] = this.levelId
		this.pane = 0
	}
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
	dragArm = $state.raw<{ prevTool: ToolId; arm: () => void; disarm?: () => void; armed?: boolean; tool?: ToolId } | null>(null)
	/** Start such a drag (from a dragstart). `tool` = the tool it arms, so any view that tool works in takes the drop (a
	 *  block from the Blocks list); without it, rack views only. */
	startDrag(arm: () => void, disarm?: () => void, tool?: ToolId): void { this.dragArm = { prevTool: this.toolId, arm, disarm, ...(tool ? { tool } : {}) } }
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
	boxOpts = $state<ShapeOpts>({ kind: 'rect', sides: 6, inscribed: true, height: 750, z: 0, depth: 600 })
	/** The Section tool: a cut line, or Room elevations A–D (a click inside a drawn room makes its four; User 2026-10-15). */
	sectionMode = $state<'line' | 'room'>('line')
	/** The Image tool's picture (Draw › Image…): its file in Uploads and page, and its name for the hint. */
	/** The last press was a finger (touch screen): the options row shows Finish / Cancel while a run is drawn. */
	touchInput = $state(false)
	/** Points in the run / line being drawn (0 = none), kept by the active ViewCanvas. */
	pathPending = $state(0)
	imagePick = $state<{ fileId: string; page?: number; name: string; /** the picture's width ÷ height, once measured */ ratio?: number } | null>(null)
	/** The Dimension tool's kind: along the two points, or only horizontally / vertically. */
	dimMode = $state<DimMode>('aligned')
	/** The block the Insert tool places (picked in the Blocks list). */
	insertBlock = $state.raw<Block | null>(null)
	/** The Opening tool's swing (none / left / right), sticky like the cord defaults. */
	openingSwing = $state<'left' | 'right' | undefined>(undefined)
	/** The Renumber panel's mode: renumber, or find / replace in labels (the outlet grid's Find/replace opens it). */
	renumberMode = $state<'number' | 'replace'>('number')
	/** The plan's Fill overlay (Phase 5.3). */
	showFill = $state(false)
	/** The plan's Routes overlay: every cable's route, colored by server room (backlog "Show all routes"). */
	showRoutes = $state(false)
	/** Drafting switches in the status bar (UX05): SNAP = moves / points to the grid (step `grid` mm), OSNAP = object
	 *  snaps, GRID = the grid drawn. Kept per browser. Alt still skips the snaps for one action. */
	drafting = $state<Drafting>(loadDrafting())
	saveDrafting(): void { try { localStorage.setItem(DRAFTING_KEY, JSON.stringify(this.drafting)) } catch { /* storage blocked */ } }
	/** File › Export › Monochrome PDFs (decision T121): sheet PDFs in black ink, kept per browser. */
	monoPdf = $state((() => { try { return localStorage.getItem('cad-mono-pdf') === '1' } catch { return false } })())
	toggleMonoPdf = (): void => { this.monoPdf = !this.monoPdf; try { localStorage.setItem('cad-mono-pdf', this.monoPdf ? '1' : '0') } catch { /* storage blocked */ } }
	/** ACAD (wheel zooms, click-click) or EOS (wheel pans, press-drag draws): this user's choice, kept per browser (editor/inputMode.ts). */
	inputMode = $state<InputMode>((() => { try { return parseInputMode(localStorage.getItem(INPUT_MODE_KEY)) } catch { return 'acad' } })())
	toggleInputMode = (): void => {
		this.inputMode = this.inputMode === 'eos' ? 'acad' : 'eos'
		try { localStorage.setItem(INPUT_MODE_KEY, this.inputMode) } catch { /* storage blocked */ }
		this.say(this.inputMode === 'eos' ? 'EOS input: the wheel pans (Ctrl / Alt + wheel zooms), press-drag draws' : 'ACAD input: the wheel zooms, click the points')
	}
	/** The plan / rack view strip's B/W, Usage colors and Cord channels: this user's screen only, kept per browser. */
	screen = $state<ScreenLook>(loadScreen())
	toggleScreen(k: keyof ScreenLook): void {
		this.screen = { ...this.screen, [k]: !this.screen[k] }
		try { localStorage.setItem(SCREEN_KEY, JSON.stringify(this.screen)) } catch { /* storage blocked */ }
	}
	/** GUIDES (User's todo): construction lines per view (`levelId|specKey` → guides), this user's, kept in this browser;
	 *  never in the drawing or the print. `guideAxis` = what the Guide tool places next. */
	guides = $state<Record<string, Guide[]>>(loadGuides())
	guideAxis = $state<Guide['axis'] | 'both'>('both')
	/** The active pane's guides key (set by it), for the tool bar's Clear. */
	activeGuideKey = $state('')
	guidesOf = (key: string): Guide[] => this.guides[key] ?? []
	setGuides = (key: string, gs: Guide[]): void => {
		const next = { ...this.guides }
		if (gs.length) next[key] = gs
		else delete next[key]
		this.guides = next
		try { localStorage.setItem(GUIDES_KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
	}
	/** Compare floorplans (W7; this screen only, not kept): on = each floorplan with something to compare with draws
	 *  it in red underneath — the file picked for it here (`compareWith`, underlay id → file id), else the revision it
	 *  replaced (`Underlay.prevFileId`). */
	compareOn = $state(false)
	compareWith = $state<Record<string, string>>({})
	compareFile = (u: Underlay): string | undefined => (this.compareOn ? this.compareWith[u.id] ?? u.prevFileId : undefined)
	/** Show changes (W23; this screen only): a sheet's last issued list, loaded — the sheet view draws what is new or
	 *  changed since it, and what has gone, over the sheet (domain/issue.ts changeOverlay). Null = off. */
	sheetChanges = $state.raw<{ sheetId: Id; rev: string; issued: Prim[] } | null>(null)
	/** What the active view reports for the status bar: the cursor, length · angle while drawing, scale and zoom. */
	viewInfo = $state.raw<ViewInfo | null>(null)
	/** Show this one thing when the view next fits (a `?rack=` link, Find a device); cleared once done. Reactive, so a
	 *  focus set after a view switch still fits (Find: set it after the new view is up, or the old view takes it). */
	focus = $state<Id | null>(null)
	/** The Outlet tool's settings for the next outlet (tool bar); unset = like the last one placed. */
	outletNext = $state.raw<OutletNext>({})
	/** The user's hidden / locked / current layers (loaded by the app with the project id). */
	readonly layers = new LayerPrefs()
	/** A short status message (why a click was refused …); clears itself. */
	message = $state<string | null>(null)
	#msgTimer: ReturnType<typeof setTimeout> | undefined
	readonly rackTool = new RackTool(() => { this.toolId = 'select' })
	/** Set by the app: the Delete key's action (with its confirms) — for the Delete buttons. */
	remove: () => void = () => {}
	/** Set by the app: align / distribute the selection in the active view (editor/align.ts). */
	align: (how: AlignHow) => void = () => {}
	/** Set by the app: the view a new viewport shows (the Viewport tool) — the other pane's, else the last model view. */
	viewportView: () => Viewport['view'] | null = () => null
	/** Set by the app: open Project settings on its Sheets tab, with the title block template (Sheets › Title block…,
	 *  sheet Properties). */
	openTitleBlock: () => void = () => {}
	/** Open the project's Settings on a tab ('usages' …: SettingsDialog SettingsTab); set by the shell. */
	/** The Sheets table with Release… started on the selected sheet(s); set by the shell (Round 7: Release was only in the
	 *  Sheets table's bar and the Drawings menu). */
	releaseSheets: () => void = () => {}
	openSettings: (tab: 'floors' | 'plans' | 'usages' | 'cables' | 'lengths' | 'drawing' | 'sheets' | 'files') => void = () => {}
	/** Open one of the shell's windows ('blocks', 'devices' …: app/windows.svelte.ts WinId); set by the shell. */
	openWindow: (id: 'blocks' | 'devices' | 'layers' | 'racks' | 'navigator' | 'properties' | 'cables') => void = () => {}
	/** Properties › Renumber (outlet / rack): the Renumber tool, the selection kept as its first picks (CadShell). */
	startRenumber: () => void = () => {}
	/** Open the Restore dialog on a stored backup (an issue's, from the Issues list); set by the shell. */
	restoreBackup: (backupId: string) => void = () => {}
	/** Set by the app: select what the active view shows like the selection (Properties → Select similar). */
	selectSimilar: () => void = () => {}
	/** Set by the app: open a view in its own tab (the viewport chip's "Open view"). */
	openInTab: (v: { levelId?: Id; spec: ViewSpec }) => void = () => {}
	/** Open a linked symbol's target (double-click): a sheet in a tab, a web page in a new browser tab (no opener). */
	openLink = (link: InsertLink): void => {
		if (link.kind === 'sheet') { this.openInTab({ spec: { kind: 'sheet', sheetId: link.sheetId } }); return }
		const url = linkUrl(link.url)
		if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
		else this.say('That link isn’t a web address we open — edit it in Properties')
	}
	/** Set by the app: show a view in the active pane (a section's Open button). */
	openView: (s: ViewSpec) => void = () => {}
	/** Set by the app: show a level (its plan in the active pane) — a level from the list, a riser carrying on (W27). */
	openLevel: (id: Id) => void = () => {}
	/** A point (view mm) the active view centres on once it shows (W27: the riser's top on the other floor), keeping
	 *  its zoom; the view clears it. */
	centreOn = $state.raw<{ x: number; y: number } | null>(null)
	/** Set by the app (it owns the store): how the assign tool writes. */
	applyLinks: (label: string, add: Link[], remove: Id[]) => void = () => {}
	readonly assignTool = new AssignTool(() => { this.toolId = 'select' }, (l, a, r) => this.applyLinks(l, a, r))
	/** Sticky cord defaults: the last type / color chosen stays for the next cord (the Patching tool's habit). */
	cordDefaults = $state<CordDefaults>({ cableType: 'cat6a', colour: '#3b82f6' })
	/** The project's cord defaults last taken in (a JSON key): taken when the project loads and when they change in
	 *  Settings — every way of making cords (the Cord tool, Patch to…, P, drag-to-patch) starts from them; between
	 *  those, the last type / color chosen stays. */
	#seededCords = ''
	seedCordDefaults(d: { cordCableType?: string; cordColour?: string } | undefined): void {
		if (!d?.cordCableType && !d?.cordColour) return
		const key = JSON.stringify([d.cordCableType, d.cordColour])
		if (key === this.#seededCords) return
		this.#seededCords = key
		this.cordDefaults = { cableType: d.cordCableType || this.cordDefaults.cableType, colour: d.cordColour || this.cordDefaults.colour }
	}
	/** The cable type for new interconnects (ties, backbone) — its own, kept as last chosen ('' = the cord type). */
	linkType = $state('')
	bulkFrom = $state.raw<BulkFrom | null>(null)
	/** Match properties: its source is set when it starts (CadShell setTool). */
	readonly matchTool = new MatchTool()
	/** What new cords start as: the project's Planning / Surveying toggle (settings.newCordStatus; CadShell keeps it in step). */
	newCordStatus = $state<'add' | 'installed'>('add')
	/** A bulk patch's plan waiting for OK (ui/PatchPreview.svelte); null = none. */
	patchPreview = $state.raw<PatchPreview | null>(null)
	/** Bulk patch maps in step (false) or fills only the target's free ports (true) — kept as last chosen. */
	patchFill = $state(false)
	readonly cordTool = new CordTool(() => ({ ...this.cordDefaults, status: this.newCordStatus }), { get: () => this.bulkFrom, set: (b) => { this.bulkFrom = b } }, () => this.linkType, () => this.bulkDone(),
		{ show: (p) => { this.patchPreview = p }, fill: () => this.patchFill, setFill: (on) => { this.patchFill = on } })
	/** The Calibrate tool's floorplan and step (Project settings › Plans & floorplans › Origin / Scale / Crop); the app
	 *  sets how it reads a page's calibration and writes it (its file, not the store). */
	calibTarget = $state.raw<CalibTarget | null>(null)
	calibIO: { calib: (u: Underlay) => PageCalibUsed | undefined; write: (u: Underlay, field: CalibMode, value: unknown, what: string) => void } = { calib: () => undefined, write: () => {} }
	/** Told when the Calibrate tool ends (`ok` = it set something; false = Esc) — "Set up each floor" runs its next step (W6). */
	onCalibDone: ((ok: boolean) => void) | null = null
	readonly calibrateTool = new CalibrateTool(() => this.calibTarget, (u) => this.calibIO.calib(u), (u, f, v, w) => this.calibIO.write(u, f, v, w), (ok) => { this.calibTarget = null; this.toolId = 'select'; this.onCalibDone?.(ok) })
	readonly tools: Record<ToolId, Tool> = {
		select: new SelectTool(), move: new MoveTool('move'), copy: new MoveTool('copy'), array: new MoveTool('array'), room: new RoomTool(), measure: new MeasureTool(), rotate: new TransformTool('rotate'), mirror: new TransformTool('mirror'), insert: new InsertTool(() => this.insertBlock), shape: new ShapeTool(() => this.shapeOpts), box: new ShapeTool(() => this.boxOpts, 'box'), image: new ShapeTool(() => ({ kind: 'image', sides: 4, inscribed: true, ...(this.imagePick ? { image: this.imagePick } : {}) }), 'image'), legend: new LegendTool(), viewport: new ViewportTool(() => this.viewportView(), () => { this.toolId = 'select' }), dimension: new DimTool(() => this.dimMode), outlet: new OutletTool(() => this.outletNext), rack: this.rackTool, device: new DeviceTool(() => this.deviceTemplate, () => this.deviceMount), assign: this.assignTool, cord: this.cordTool,
		text: new NoteTool('text'), leader: new NoteTool('leader'), cloud: new NoteTool('cloud'),
		opening: new OpeningTool(() => this.openingSwing), section: new SectionTool(() => this.sectionMode), renumber: new RenumberTool(), match: this.matchTool, calibrate: this.calibrateTool, guide: new GuideTool(),
		line: new PathTool('line'), trunk: new PathTool('trunk'), conduit: new PathTool('conduit'), wall: new PathTool('wall'),
	}

	get tool(): Tool { return this.tools[this.toolId] }

	/** A passing note that clears itself (bottom of the drawing): what doesn't need the status bar's line — it no longer
	 *  hides the hint, a viewport-edit prefix or a tool's own message (User 2026-10-12: "Drawn on the … layer"). */
	toast = $state<string | null>(null)
	#toastTimer: ReturnType<typeof setTimeout> | undefined
	notify = (msg: string): void => {
		this.toast = msg
		clearTimeout(this.#toastTimer)
		this.#toastTimer = setTimeout(() => { this.toast = null }, 2500)
	}

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
	patchFrom(sel: PortSel): void { this.#armBulk({ on: sel.on, ports: [...sel.ports], face: sel.face }) }
	/** Patch to… from a whole device: all its ports, from its patching face (a panel's front). */
	patchDevice(d: Device): void { this.#armBulk({ on: d.id, ports: Array.from({ length: d.portCount }, (_, i) => i + 1), face: d.face === 'rear' ? 'rear' : 'front' }) }
	/** Arm an interconnect from these ports (backbone / tie cables, Phase 5): the next port clicked — in any room, on
	 *  any floor — is where they start on the other panel. */
	interconnectFrom(sel: PortSel): void { this.#armBulk({ on: sel.on, ports: [...sel.ports], face: sel.face, kind: 'link' }) }
	/** The tool to go back to once the armed Patch to… / Link to… is done or Esc'd (User: the crosshair stayed, and two
	 *  more port clicks made a patch cord). */
	#bulkReturn: ToolId = 'select'
	#armBulk(b: BulkFrom): void {
		if (this.toolId !== 'cord') this.#bulkReturn = this.toolId
		this.bulkFrom = b
		this.toolId = 'cord'
	}
	bulkDone = (): void => { this.toolId = this.#bulkReturn }
	/** Link to… with several panels selected: all their ports, the top panel first (by rack, then U), go on from the
	 *  port clicked next — four 24-port panels onto ports 1–96 of a switch. */
	interconnectPanels(panels: Device[]): void {
		const order = [...panels].sort((x, y) => x.rackId.localeCompare(y.rackId) || y.u - x.u)
		const all = order.map((d) => ({ on: d.id, ports: Array.from({ length: d.portCount }, (_, i) => i + 1) }))
		if (!all.length) return
		this.#armBulk({ ...all[0], face: 'rear', kind: 'link', more: all.slice(1) })
	}
	/** Arm "assign by hand" with these outlets; the next panel-port click places them. */
	assignOutlets(ids: Id[]): void {
		this.assignTool.outlets = ids
		this.toolId = 'assign'
	}
	/** The Rack tool button: draw new racks (like the last one) with each click. */
	drawRacks(): void {
		this.rackTool.target = null
		this.rackTool.product = null
		this.toolId = 'rack'
	}
	/** Draw racks of a catalogue product (Product catalogue › Draw racks): the Rack tool, each click one of them. */
	drawProduct(p: NonNullable<RackTool['product']>): void {
		this.rackTool.target = null
		this.rackTool.product = p
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
		if (ids.length !== 1) { this.viewportId = null; this.vpMore = [] }   // viewports are picked within ONE selected sheet
		if (!ids.length) this.renumberMode = 'number'   // Find / replace lasts while its items stay selected
	}
	/** Bumped by a pick in a table: the active view pans the selection into view when it's off-screen (review R52 —
	 *  a pick on the drawing is already in view, so only the tables bump it). */
	reveal = $state(0)
	/** The Drawings menu asks the Sheets table for one of its views (register, packages, releases) or to start a release of
	 *  the selected sheets; the table takes it and clears it. */
	sheetsAsk = $state<'register' | 'packages' | 'issues' | 'release' | null>(null)
	/** Select from a table: as `select`, and the drawing shows it. */
	selectAndReveal = (ids: Id[]): void => { this.select(ids); if (ids.length) this.reveal++ }
	selectPorts = (s: PortSel | null): void => { this.portSel = s && s.ports.length ? s : null }
	/** The sheet the active pane shows (null = a model view): the Layers eyes are its own then (set by the shell). */
	activeSheet = $state<Id | null>(null)
	/** The viewport selected on the selected sheet (null = the sheet itself). */
	viewportId = $state<Id | null>(null)
	/** The other viewports picked with it (Ctrl-click, a window on the paper): `viewportId` is the first. */
	vpMore = $state<Id[]>([])
	/** Every viewport picked on the selected sheet. */
	get pickedViewports(): Id[] { return this.viewportId ? [this.viewportId, ...this.vpMore] : [] }
	/** Editing the model INSIDE a sheet viewport (UX review S5): double-click it; Esc / a double-click outside leaves. */
	vpEdit = $state<{ sheetId: Id; vpId: Id } | null>(null)
	/** "Pan / zoom content" (User: instead of Alt): a drag inside the selected / edited viewport pans its view and the
	 *  wheel steps its scale, with no Alt. */
	vpContentNav = $state(false)
	/** An elevation's DEPTH BAND (UX14, a test): around the work depth, `front` mm towards the viewer and `back` mm away.
	 *  Nearer is left out, further is faded; the plan shows the band in Split. For the session. */
	band = $state({ on: false, front: 1000, back: 4000 })
	/** Bumped to focus the Navigator's search (Ctrl+K). */
	navSearch = $state(0)
	/** A Navigator row being renamed in place (a level, room, section, a sheet's title or number) — Rename… / F2 /
	 *  Project › Rename this level…; the Navigator unfolds to it and swaps its label for an input. */
	navRename = $state<{ id: string; field?: 'title' | 'number' } | null>(null)
	/** The right-click menu on the selection (UX21), at a screen point; null = closed. */
	contextMenu = $state<{ x: number; y: number } | null>(null)
	/** `toggle` = Ctrl-click: add it to the picked viewports, or drop it when it is already one. */
	selectViewport = (id: Id | null, toggle = false): void => {
		if (toggle && id) this.selectViewports(this.pickedViewports.includes(id) ? this.pickedViewports.filter((x) => x !== id) : [...this.pickedViewports, id])
		else this.selectViewports(id ? [id] : [])
	}
	selectViewports = (ids: Id[]): void => { this.viewportId = ids[0] ?? null; this.vpMore = ids.slice(1) }
	/** A question in the tool bar with a yes button (e.g. changing labels that were already printed). */
	confirm = $state<{ msg: string; yes: string; apply: () => void; alt?: { label: string; apply: () => void }; revert?: true } | null>(null)
	/** `alt` = a second answer (two ways to go on, e.g. keep a section's viewports as elevations, or delete them). */
	ask2 = (msg: string, yes: string, apply: () => void, alt?: { label: string; apply: () => void }): void => { this.confirm = { msg, yes, apply, ...(alt ? { alt } : {}) } }
	/** An offer to undo something done outside the undo stack ("Undo" · "Keep", backlog W1): Enter never answers it (a
	 *  later Enter once silently reverted a crop), and the shell closes it when the view or the dialog changes. */
	offerRevert = (msg: string, yes: string, apply: () => void): void => { this.confirm = { msg, yes, apply, revert: true } }
	ask = (label: string, value: number, apply: (v: number) => void, choices?: { label: string; value: number }[]): void => {
		this.prompt = { label, value: String(value), text: false, apply: (t) => { const v = Number(t); if (t.trim() !== '' && Number.isFinite(v)) apply(v) }, ...(choices?.length ? { choices: choices.map((c) => ({ label: c.label, value: String(c.value) })) } : {}) }
	}
	askText = (label: string, value: string, apply: (t: string) => void): void => { this.prompt = { label, value, text: true, apply } }
	/** Free text asked in a dialog, not the status bar (User 2026-10-15: names, port targets — see TextDialog). */
	textAsk = $state<{ title: string; label: string; value: string; hint?: string; ok: string; apply: (t: string) => void } | null>(null)
	askInDialog = (o: { title: string; label: string; value: string; hint?: string; ok?: string }, apply: (t: string) => void): void => { this.textAsk = { ok: 'OK', ...o, apply } }
	/** The text being edited in place on the drawing (double-click / F2; backlog "Text options"). */
	textEdit = $state<Id | null>(null)
	editText = (id: Id): void => { this.textEdit = id }

	/** Switch tool, with the drawing defaults that suit it on this level (ADR 0006 work Z presets) — or the Z / W / H
	 *  typed the last time it was used this session. The surface cancels the old tool first (it owns the tool context). */
	setTool(id: ToolId, level?: Level): void {
		// the Z / W / H typed for the tool being left are kept for the session (they reset at each pick)
		const own = this.#optsOwner
		if (own) { this.#sizes.set(own.tool, { w: this.opts.w, h: this.opts.h }); this.#zs.set(`${own.tool}:${own.level}`, this.opts.z) }
		this.#optsOwner = null
		this.toolId = id
		const h = heightsOf(level)
		// the project's defaults (Properties › Use as default): the box's height / Z once a session, the runs' sizes below
		const td = this.toolDefaults()
		if (td && (id === 'box' || id === 'dimension' || id === 'outlet') && !this.#seeded.has(id)) this.#seed(td, id)
		const d: DrawOpts | null = id === 'trunk' ? { z: h.clearHeightMm + h.plenumMm / 2, w: td?.trunk?.w ?? 100, h: td?.trunk?.h ?? 50 }
			: id === 'conduit' ? { z: h.clearHeightMm + h.plenumMm / 2, w: td?.conduit?.w ?? 25, h: td?.conduit?.w ?? 25 }
			: id === 'wall' ? { z: 0, w: td?.wall?.w ?? 100, h: h.clearHeightMm }
			: id === 'line' ? { ...this.opts, z: 0 }
			: id === 'opening' ? { z: 0, w: 900, h: 2100 } : null
		if (!d) return
		// what was typed last time for this tool: W / H as they were; Z on this level (another level's heights differ)
		const lv = level?.id ?? ''
		this.opts = { ...d, ...this.#sizes.get(id), z: this.#zs.get(`${id}:${lv}`) ?? d.z }
		this.#optsOwner = { tool: id, level: lv }
	}
	/** The project's tool defaults (`ProjectSettings.toolDefaults`; CadShell points this at the open project). */
	toolDefaults: () => ToolDefaults | undefined = () => undefined
	/** The tools whose tool bar took the project's defaults this session (once: what you change after stays). */
	#seeded = new Set<string>()
	/** The Box / Dimension / Outlet tool bar from the project's defaults. */
	#seed(td: ToolDefaults, tool: 'box' | 'dimension' | 'outlet'): void {
		this.#seeded.add(tool)
		if (tool === 'box' && td.box) this.boxOpts = { ...this.boxOpts, height: td.box.height, z: td.box.z ?? 0, ...(td.box.kind ? { kind: td.box.kind } : {}), ...(td.box.sides ? { sides: td.box.sides } : {}) }
		if (tool === 'dimension' && td.dimension) this.dimMode = td.dimension.mode as DimMode
		if (tool === 'outlet' && td.outlet) this.outletNext = { ...this.outletNext, ...td.outlet }
	}
	/** Use as default was pressed for `tool`: that tool takes the new default now, over what was typed for it this
	 *  session. */
	adoptDefaults(td: ToolDefaults, tool: keyof ToolDefaults): void {
		if (tool === 'trunk' || tool === 'conduit' || tool === 'wall') {
			const v = td[tool]
			if (!v) return
			this.#sizes.delete(tool)   // the next pick starts from the saved default
			if (this.#optsOwner?.tool === tool) this.opts = { ...this.opts, w: v.w, ...('h' in v ? { h: v.h } : tool === 'conduit' ? { h: v.w } : {}) }
		}
		if (tool === 'box' || tool === 'dimension' || tool === 'outlet') this.#seed(td, tool)
	}
	/** The drawing tool whose Z / W / H `opts` holds (saved when another tool is picked, however this one ended). */
	#optsOwner: { tool: ToolId; level: string } | null = null
	#sizes = new Map<ToolId, { w: number; h: number }>()
	/** Z per tool and level. */
	#zs = new Map<string, number>()
}
