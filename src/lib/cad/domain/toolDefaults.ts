// USE AS DEFAULT (User 2026-10-15, backlog "Keep a drawn item's settings for the next ones"; then "expand it to the
// other drawing tools"): Properties' Use as default saves the selected item's settings as its tool's starting point,
// kept with the project (`ProjectSettings.toolDefaults`) so everyone drawing in it gets them:
//  - a rack → the Rack tool (kind, size, rotation, doors, color …); an outlet → the Outlet tool bar (usage, mount,
//    ports, cable type);
//  - a trunk / conduit / wall → that tool's size (a trunk's kind too: tray / ladder); a box → the Box tool's shape,
//    height and Z;
//  - a text → the Text tool's size and alignment; a callout → its frame; a revision cloud → its arc size; a dimension →
//    its kind (aligned / horizontal / vertical); a legend → its text size; a section → its depth;
//  - a line / rectangle / circle … → the project's drawing style (Settings › Drawing, `shapeStyle`).
import type { ProjectSettings, Rack, Outlet } from './types'
import type { Entity } from './drawing'

/** What a tool starts with, per tool. Fields left out keep the tool's own behaviour (e.g. a rack like the last one). */
export interface ToolDefaults {
	rack?: Partial<Pick<Rack, 'kind' | 'heightU' | 'widthMm' | 'depthMm' | 'heightMm' | 'rot' | 'doors' | 'color' | 'frontProtrusionMm' | 'catalogId' | 'maker' | 'model' | 'productUrl'>>
	outlet?: { usage?: string; mount?: Outlet['mount']; ports?: number; cableType?: string }
	trunk?: { w: number; h: number; form?: 'trunk' | 'tray' | 'ladder' }
	conduit?: { w: number }
	wall?: { w: number }
	box?: { height: number; z?: number; kind?: 'rect' | 'ellipse' | 'polygon'; sides?: number }
	text?: { sizeMm: number; align?: 'left' | 'centre' | 'right' }
	/** A callout's frame round its words: 'none' = none (unset = the tool's own, none). */
	callout?: { border: 'underline' | 'box' | 'none' }
	cloud?: { arcMm: number }
	dimension?: { mode: 'aligned' | 'horizontal' | 'vertical' | 'rotated' }
	legend?: { sizeMm: number }
	section?: { depth: number }
}

const RACK_KEYS = ['kind', 'heightU', 'widthMm', 'depthMm', 'heightMm', 'rot', 'doors', 'color', 'frontProtrusionMm', 'catalogId', 'maker', 'model', 'productUrl'] as const

/** "Use as default" for this item: what it says ("new racks") and the settings it saves — null when it has nothing a
 *  tool starts from (a block, a picture, a viewport). */
export function useAsDefault(e: Entity | undefined): { what: string; tool?: keyof ToolDefaults; apply: (s: ProjectSettings) => ProjectSettings } | null {
	if (!e) return null
	const put = (patch: ToolDefaults) => (s: ProjectSettings): ProjectSettings => ({ ...s, toolDefaults: { ...s.toolDefaults, ...patch } })
	if (e.type === 'rack') {
		const rack: NonNullable<ToolDefaults['rack']> = {}
		for (const k of RACK_KEYS) if (e[k] !== undefined) (rack as Record<string, unknown>)[k] = e[k]
		if (!rack.rot) rack.rot = 0   // a square rack is a default too (else the last rack's turn would carry on)
		return { what: 'new racks', tool: 'rack' as const, apply: put({ rack }) }
	}
	if (e.type === 'outlet') {
		const o = e
		return { what: 'new outlets (usage, mount, ports, cable type)', tool: 'outlet' as const, apply: put({ outlet: { ...(o.usage ? { usage: o.usage } : {}), ...(o.mount ? { mount: o.mount } : {}), ports: o.ports?.length || 1, ...(o.ports?.[0]?.cableType ? { cableType: o.ports[0].cableType } : {}) } }) }
	}
	if (e.type === 'section') return { what: 'new sections (their depth)', tool: 'section' as const, apply: put({ section: { depth: e.depth } }) }
	if (e.type !== 'shape') return null
	const s = e, role = s.role, g = s.geom
	if (role?.kind === 'containment' && s.section) {
		if (role.form === 'conduit') return { what: 'new conduits', tool: 'conduit' as const, apply: put({ conduit: { w: s.section.w } }) }
		return { what: 'new trunks', tool: 'trunk' as const, apply: put({ trunk: { w: s.section.w, h: s.section.h, ...(role.form !== 'trunk' ? { form: role.form } : {}) } }) }
	}
	if (role?.kind === 'wall' && s.section) return { what: 'new walls', tool: 'wall' as const, apply: put({ wall: { w: s.section.w } }) }
	if (role) return null
	if (s.extent && g.kind !== 'insert') {
		const z = s.plane?.kind === 'plan' ? s.plane.z : undefined
		const kind = g.kind === 'ellipse' || g.kind === 'polygon' ? g.kind : 'rect'
		return { what: 'new boxes', tool: 'box' as const, apply: put({ box: { height: s.extent, ...(z ? { z } : {}), kind, ...(g.kind === 'polygon' ? { sides: g.pts.length } : {}) } }) }
	}
	switch (g.kind) {
		case 'text': return { what: 'new texts', tool: 'text' as const, apply: put({ text: { sizeMm: g.sizeMm, ...(g.align && g.align !== 'left' ? { align: g.align } : {}) } }) }
		case 'leader': return { what: 'new callouts (their frame)', tool: 'callout' as const, apply: put({ callout: { border: g.border ?? 'none' } }) }
		case 'cloud': return g.arcMm ? { what: 'new revision clouds (their arc size)', tool: 'cloud' as const, apply: put({ cloud: { arcMm: g.arcMm } }) } : null
		case 'dimension': return { what: 'new dimensions (their kind)', tool: 'dimension' as const, apply: put({ dimension: { mode: g.mode } }) }
		case 'legend': return g.sizeMm ? { what: 'new legends (their text size)', tool: 'legend' as const, apply: put({ legend: { sizeMm: g.sizeMm } }) } : null
		case 'path': case 'rect': case 'circle': case 'ellipse': case 'polygon': case 'arc': {
			const st = s.style
			return { what: 'new lines and shapes (their color, line type and lineweight)', apply: (x) => ({ ...x, shapeStyle: { color: st?.stroke ?? '', dash: st?.dash ?? '', weightMm: st?.weightMm ?? 0 } }) }
		}
		default: return null
	}
}
