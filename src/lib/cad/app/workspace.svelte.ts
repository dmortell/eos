// Per-user, per-project session state (ADR 0003 "view and user state"): which level is open, the active tool, its
// options, the selection, the tool-bar prompt. Never stored on the data. One instance per open project, passed down.
import type { Id, Level } from '../domain/types'
import { SelectTool, OutletTool, RackTool, type Tool, type DrawOpts } from '../editor/tools'
import { PathTool, type PathKind } from '../editor/pathTool'

export type ToolId = 'select' | 'outlet' | 'rack' | PathKind

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
	readonly rackTool = new RackTool(() => { this.toolId = 'select' })
	readonly tools: Record<ToolId, Tool> = {
		select: new SelectTool(), outlet: new OutletTool(), rack: this.rackTool,
		line: new PathTool('line'), trunk: new PathTool('trunk'), conduit: new PathTool('conduit'), wall: new PathTool('wall'),
	}

	get tool(): Tool { return this.tools[this.toolId] }

	/** Arm the rack tool with one rack from the racks list; the next click on the plan places it. */
	placeRack(id: Id): void {
		this.rackTool.target = id
		this.toolId = 'rack'
	}
	select = (ids: Id[]): void => { this.selection = ids }
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
	}
}
