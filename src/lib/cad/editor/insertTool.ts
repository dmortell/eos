// The INSERT tool (the Blocks list): click to place the chosen block; it stays on for the next one, Esc → Select.
// Plan: at the click, at the last insert's height. Elevation / section: the click gives the height too, and the
// block goes ON the nearest wall behind the click (its face, turned to face the viewer: a wall faceplate); with no
// wall there, on the work plane. Only those show in elevations: a block placed on the plan is a plan symbol.
import { placeNote } from './noteTool'
import type { Tool, ToolCtx, PointerIn } from './tools'
import { placeAt } from './tools'
import { insertAttrs, frontOf, type Block } from '../domain/blocks'
import type { Shape } from '../domain/shapes'
import type { Pt } from '../domain/types'
import type { SectionCut } from '../domain/drawing'
import { newId } from '../domain/ids'
import { blockPrims } from '../views/blocks'
import { viewportAt } from '../views/sheet'
import { PLOT_SCALE, type Prim } from '../views/display'

interface Place { at: Pt; z: number; rot?: number; onWall?: boolean; view: Pt }

export class InsertTool implements Tool {
	readonly id = 'insert'
	readonly cursor = 'crosshair'
	#hover: Place | null = null
	#z = 0

	constructor(private blockOf: () => Block | null) {}

	down(e: PointerIn, c: ToolCtx): void {
		const b = this.blockOf()
		if (!b) { c.say?.('Pick a block in the Blocks list first'); return }
		const p = this.#place(e, c)
		const attrs = Object.fromEntries((b.attrs ?? []).filter((a) => a.default).map((a) => [a.tag, a.default!]))
		// a block on a sheet: on the paper, or tied to the viewport it's dropped in (backlog "Any annotation can belong
		// to a viewport"), at paper size
		if (c.space.spec.kind === 'sheet') {
			const at = placeNote(c, [p.at])
			if (!at) return
			const s = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'insert', blockId: b.id, at: at.pts[0], ...(Object.keys(attrs).length ? { attrs } : {}) } } as Shape
			c.store.transact(`Insert ${b.name}`, (tx) => tx.put(s))
			c.select([s.id])
			return
		}
		const s = {
			type: 'shape', id: newId(), levelId: c.levelId, ...(c.layerId ? { layerId: c.layerId } : {}),
			geom: { kind: 'insert', blockId: b.id, at: p.at, ...(p.rot ? { rot: p.rot } : {}), ...(p.z ? { z: p.z } : {}), ...(c.space.spec.kind !== 'plan' ? { inElevations: true } : {}), ...(Object.keys(attrs).length ? { attrs } : {}) },
		} as Shape
		c.store.transact(`Insert ${b.name}`, (tx) => tx.put(s))
		this.#z = p.z
		c.select([s.id])
		if (c.space.spec.kind !== 'plan') c.say?.(p.onWall ? `${b.name} on the wall, Z ${p.z}` : `${b.name} at Z ${p.z} — no wall behind the click, so on the work plane`)
	}
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#place(e, c) }
	cancel(): void { this.#hover = null }

	/** A ghost of the block where it will land. */
	preview(c?: ToolCtx): Prim[] {
		const b = this.blockOf(), h = this.#hover
		if (!b || !h) return []
		const spec = c?.space.spec, kind = spec?.kind, front = kind === 'elevation' || kind === 'section'
		// on a sheet, over an elevation / section viewport: its front, at that viewport's scale (as it will be drawn)
		const sheet = spec?.kind === 'sheet' ? c!.store.get(spec.sheetId) : undefined
		const vp = sheet?.type === 'sheet' && b.front ? viewportAt(sheet, h.view) : undefined
		if (vp && (vp.view.spec.kind === 'elevation' || vp.view.spec.kind === 'section')) return blockPrims(frontOf(b), { at: h.view, scale: 1 / vp.scale }, 1, insertAttrs(b), '', 'draft')
		return blockPrims(front ? frontOf(b) : b, { at: h.view }, kind === 'sheet' ? 1 : PLOT_SCALE, insertAttrs(b), '', 'draft')   // as drawn: unturned in plan, facing you (its front) in elevations
	}

	#place(e: PointerIn, c: ToolCtx): Place {
		if (c.space.spec.kind === 'sheet') { const p = e.alt ? e.p : { x: Math.round(e.p.x * 2) / 2, y: Math.round(e.p.y * 2) / 2 }; return { at: p, z: 0, view: p } }   // paper: 0.5 mm
		const q = placeAt(c, e, this.#z), f = c.space.frame
		if (c.space.spec.kind === 'plan' || !f) return { ...q, view: c.space.fromWorld({ ...q.at, z: q.z }) }
		// the block's front (its local +y, as racks) towards the viewer (n points at the viewer)
		const rot = Math.round((Math.atan2(-f.n.x, f.n.y) * 180) / Math.PI + 360) % 360
		const w = wallFaceAt(c, c.space.fromWorld({ ...q.at, z: q.z }).x, f.n)
		const at = w ?? q.at
		return { at, z: q.z, ...(rot ? { rot } : {}), onWall: !!w, view: c.space.fromWorld({ ...at, z: q.z }) }
	}
}

/** The face (towards the viewer) of the nearest wall at view position `u`, within a section's depth: a plan point. */
function wallFaceAt(c: ToolCtx, u: number, n: Pt): Pt | null {
	const sp = c.space, spec = sp.spec
	const sec = spec.kind === 'section' ? (c.index.get(spec.sectionId) as SectionCut | undefined) : undefined
	let best: { p: Pt; depth: number } | null = null
	for (const s of c.index.shapes) {
		if (s.levelId !== c.levelId || s.role?.kind !== 'wall' || s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((x) => [x.id, x]))
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (!a || !b) continue
			const ua = sp.fromWorld(a).x, ub = sp.fromWorld(b).x
			if (Math.abs(ub - ua) < 1 || u < Math.min(ua, ub) || u > Math.max(ua, ub)) continue   // seen end-on, or not here
			const t = (u - ua) / (ub - ua), half = ((g.section ?? s.section)?.w ?? 100) / 2
			const p = { x: a.x + (b.x - a.x) * t + n.x * half, y: a.y + (b.y - a.y) * t + n.y * half }
			const depth = sp.depthOf({ ...p, z: 0 })
			if (sec && (depth > 50 || depth < -sec.depth)) continue   // outside what the section shows
			if (!best || depth > best.depth) best = { p: { x: Math.round(p.x), y: Math.round(p.y) }, depth }
		}
	}
	return best?.p ?? null
}
