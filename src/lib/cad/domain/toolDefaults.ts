// USE AS DEFAULT (Dave 2026-10-15, backlog "Keep a drawn item's settings for the next ones"): Properties' Use as default
// saves the selected item's settings as its tool's starting point, kept with the project (`ProjectSettings.toolDefaults`)
// so everyone drawing in it gets them. A rack → the Rack tool (kind, size, rotation, doors, color …); a trunk / conduit /
// wall → that tool's size (a trunk's kind too: tray / ladder); a box → the Box tool's height and Z; a text → the Text
// tool's size; a line / rectangle / circle … → the project's drawing style (Settings › Drawing, `shapeStyle`).
import type { ProjectSettings, Rack } from './types'
import type { Entity } from './drawing'
import type { Shape } from './shapes'

/** What a tool starts with, per tool. Fields left out keep the tool's own behaviour (e.g. a rack like the last one). */
export interface ToolDefaults {
	rack?: Partial<Pick<Rack, 'kind' | 'heightU' | 'widthMm' | 'depthMm' | 'heightMm' | 'rot' | 'doors' | 'color' | 'frontProtrusionMm' | 'catalogId' | 'maker' | 'model' | 'productUrl'>>
	trunk?: { w: number; h: number; form?: 'trunk' | 'tray' | 'ladder' }
	conduit?: { w: number }
	wall?: { w: number }
	box?: { height: number; z?: number }
	text?: { sizeMm: number }
}

const RACK_KEYS = ['kind', 'heightU', 'widthMm', 'depthMm', 'heightMm', 'rot', 'doors', 'color', 'frontProtrusionMm', 'catalogId', 'maker', 'model', 'productUrl'] as const

/** "Use as default" for this item: what it says ("new racks") and the settings it saves — null when it has nothing a
 *  tool starts from (an outlet: its tool bar already carries on from the last one). */
export function useAsDefault(e: Entity | undefined): { what: string; apply: (s: ProjectSettings) => ProjectSettings } | null {
	if (!e) return null
	const put = (patch: ToolDefaults) => (s: ProjectSettings): ProjectSettings => ({ ...s, toolDefaults: { ...s.toolDefaults, ...patch } })
	if (e.type === 'rack') {
		const rack: NonNullable<ToolDefaults['rack']> = {}
		for (const k of RACK_KEYS) if (e[k] !== undefined) (rack as Record<string, unknown>)[k] = e[k]
		if (!rack.rot) rack.rot = 0   // a square rack is a default too (else the last rack's turn would carry on)
		return { what: 'new racks', apply: put({ rack }) }
	}
	if (e.type !== 'shape') return null
	const s = e as Shape, role = s.role
	if (role?.kind === 'containment' && s.section) {
		if (role.form === 'conduit') return { what: 'new conduits', apply: put({ conduit: { w: s.section.w } }) }
		return { what: 'new trunks', apply: put({ trunk: { w: s.section.w, h: s.section.h, ...(role.form !== 'trunk' ? { form: role.form } : {}) } }) }
	}
	if (role?.kind === 'wall' && s.section) return { what: 'new walls', apply: put({ wall: { w: s.section.w } }) }
	if (role) return null
	if (s.extent && s.geom.kind !== 'insert') {
		const z = s.plane?.kind === 'plan' ? s.plane.z : undefined
		return { what: 'new boxes', apply: put({ box: { height: s.extent, ...(z ? { z } : {}) } }) }
	}
	if (s.geom.kind === 'text') return { what: 'new texts', apply: put({ text: { sizeMm: s.geom.sizeMm } }) }
	if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'arc'].includes(s.geom.kind)) {
		const st = s.style
		return { what: 'new lines and shapes (their color, line type and lineweight)', apply: (x) => ({ ...x, shapeStyle: { color: st?.stroke ?? '', dash: st?.dash ?? '', weightMm: st?.weightMm ?? 0 } }) }
	}
	return null
}
