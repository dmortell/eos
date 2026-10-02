// Per-user, per-project session state (ADR 0003 "view and user state"): which level is open, the active tool, its
// options, the selection, the tool-bar prompt. Never stored on the data. One instance per open project, passed down.
import type { Id, Level } from '../domain/types'
import { SelectTool, OutletTool, RackTool, type Tool, type DrawOpts, type PortSel } from '../editor/tools'
import { PathTool, type PathKind } from '../editor/pathTool'
import { DeviceTool } from '../editor/deviceTool'
import { AssignTool } from '../editor/assignTool'
import { CordTool, type BulkFrom } from '../editor/cordTool'
import { NoteTool, type NoteKind } from '../editor/noteTool'
import { OpeningTool } from '../editor/openingTool'
import { SectionTool } from '../editor/sectionTool'
import type { CordDefaults } from '../domain/cords'
import type { Link } from '../domain/types'
import type { ViewSpec } from '../views/space'
import type { DeviceTemplate } from '../domain/devices'

export type ToolId = 'select' | 'outlet' | 'rack' | 'device' | 'assign' | 'cord' | 'opening' | 'section' | NoteKind | PathKind

/** Which views each tool works in (Dave: an Outlet click in a rack view added outlets by mistake). Select works
 *  everywhere; drawing tools in plan and elevations; the rack tool on the plan; devices / cords / assign in rack views. */
export const TOOL_VIEWS: Record<ToolId, ViewSpec['kind'][]> = {
	select: ['plan', 'elevation', 'row', 'sheet', 'riser', 'section'],
	section: ['plan'],
	outlet: ['plan', 'elevation'], line: ['plan', 'elevation'], trunk: ['plan', 'elevation'], conduit: ['plan', 'elevation'], wall: ['plan', 'elevation'],
	rack: ['plan'], opening: ['plan'],
	device: ['row'], cord: ['row'], assign: ['row'],
	text: ['sheet'], leader: ['sheet'], cloud: ['sheet'],
}
export const toolWorksIn = (id: ToolId, kind: ViewSpec['kind']) => TOOL_VIEWS[id].includes(kind)

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
	/** The Opening tool's swing (none / left / right), sticky like the cord defaults. */
	openingSwing = $state<'left' | 'right' | undefined>(undefined)
	/** The plan's Fill overlay (Phase 5.3). */
	showFill = $state(false)
	/** A short status message (why a click was refused …); clears itself. */
	message = $state<string | null>(null)
	#msgTimer: ReturnType<typeof setTimeout> | undefined
	readonly rackTool = new RackTool(() => { this.toolId = 'select' })
	/** Set by the app: show a view in the active pane (a section's Open button). */
	openView: (s: ViewSpec) => void = () => {}
	/** Set by the app (it owns the store): how the assign tool writes. */
	applyLinks: (label: string, add: Link[], remove: Id[]) => void = () => {}
	readonly assignTool = new AssignTool(() => { this.toolId = 'select' }, (l, a, r) => this.applyLinks(l, a, r))
	/** Sticky cord defaults: the last type / colour chosen stays for the next cord (the Patching tool's habit). */
	cordDefaults = $state<CordDefaults>({ cableType: 'cat6a', colour: '#3b82f6' })
	bulkFrom = $state.raw<BulkFrom | null>(null)
	readonly cordTool = new CordTool(() => this.cordDefaults, { get: () => this.bulkFrom, set: (b) => { this.bulkFrom = b } })
	readonly tools: Record<ToolId, Tool> = {
		select: new SelectTool(), outlet: new OutletTool(), rack: this.rackTool, device: new DeviceTool(() => this.deviceTemplate), assign: this.assignTool, cord: this.cordTool,
		text: new NoteTool('text'), leader: new NoteTool('leader'), cloud: new NoteTool('cloud'),
		opening: new OpeningTool(() => this.openingSwing), section: new SectionTool(),
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
	select = (ids: Id[]): void => {
		if (this.openingSel && !(ids.length === 1 && ids[0] === this.openingSel.wallId)) this.openingSel = null
		this.selection = ids
		if (this.portSel && !ids.includes(this.portSel.on)) this.portSel = null
		if (ids.length !== 1) this.viewportId = null   // a viewport is picked within ONE selected sheet
	}
	selectPorts = (s: PortSel | null): void => { this.portSel = s && s.ports.length ? s : null }
	/** The viewport selected on the selected sheet (null = the sheet itself). */
	viewportId = $state<Id | null>(null)
	selectViewport = (id: Id | null): void => { this.viewportId = id }
	/** A question in the tool bar with a yes button (e.g. changing labels that were already printed). */
	confirm = $state<{ msg: string; yes: string; apply: () => void } | null>(null)
	ask2 = (msg: string, yes: string, apply: () => void): void => { this.confirm = { msg, yes, apply } }
	ask = (label: string, value: number, apply: (v: number) => void): void => {
		this.prompt = { label, value: String(value), text: false, apply: (t) => { const v = Number(t); if (t.trim() !== '' && Number.isFinite(v)) apply(v) } }
	}
	askText = (label: string, value: string, apply: (t: string) => void): void => { this.prompt = { label, value, text: true, apply } }

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
