// Legacy drawings import, Pages half: a Pages model's 3D objects (projects/{pid}/models/{id}) → cad shapes on a level.
// Pure. Pages model mm ARE the cad level's mm (same plan axes, y down, z above FFL — ADR 0004 "Import mapping"), so the
// only change is a box's stored corner → its footprint centre.
//   prism `{ x, y, z, w, d, h, edges, rot? }`  → a box (rect + extent) — or, for edges ≠ 4, a polygon prism
//   wall  `{ thickness, h, nodes, segments }`  → a path with the wall role
// Conduits and the model's 2D shapes (outlet inserts, texts, images) are counted but not imported here.
import type { Id, Pt } from '../../domain/types'
import type { Layer } from '../../domain/drawing'
import type { Shape, PathNode, PathSeg } from '../../domain/shapes'
import { layersOf, nextLayerColour } from '../../domain/layers'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
export interface PagesPrism { type: 'prism'; id?: string; x: number; y: number; z: number; w: number; d: number; h: number; edges: number; rot?: number; rotX?: number; rotY?: number; layer?: string; groupId?: string; label?: string; color?: string; open?: string; rack?: unknown; device?: unknown }
export interface PagesWall { type: 'wall'; id?: string; thickness: number; h: number; nodes: { id: string; x: number; y: number; z?: number }[]; segments: { id: string; a: string; b: string; thickness?: number; h?: number }[]; layer?: string; groupId?: string; label?: string; color?: string }
export type PagesObj = PagesPrism | PagesWall | { type: 'conduit'; id?: string; layer?: string; groupId?: string }
export interface PagesModel { id: string; name: string; placeId?: string; kind?: string; objects?: PagesObj[]; shapes?: { kind?: string; type?: string }[]; layers?: { id: string; name: string; color?: string; opening?: boolean }[] }

/** What a Pages model holds, by the kinds the dialog offers (prisms and walls import; the rest are only counted). */
export interface PagesCounts { prism: number; wall: number; conduit: number; shapes: Record<string, number>; prismLayers: Record<string, number> }
export function pagesCounts(m: PagesModel): PagesCounts {
	const c: PagesCounts = { prism: 0, wall: 0, conduit: 0, shapes: {}, prismLayers: {} }
	for (const o of m.objects ?? []) {
		if (o.type === 'prism') { c.prism++; const n = layerName(m, o.layer) ?? 'no layer'; c.prismLayers[n] = (c.prismLayers[n] ?? 0) + 1 }
		else if (o.type === 'wall') c.wall++
		else if (o.type === 'conduit') c.conduit++
	}
	for (const s of m.shapes ?? []) { const k = String(s.kind ?? s.type ?? 'shape'); c.shapes[k] = (c.shapes[k] ?? 0) + 1 }
	return c
}

/** A Pages object's layer NAME (it stores the layer's id); undefined = on no layer. */
export function layerName(m: PagesModel, id: string | undefined): string | undefined {
	if (!id) return undefined
	return m.layers?.find((l) => l.id === id)?.name ?? id
}

/** Legacy layer names → cad layers: the project's own or a system layer of the same name (any case), else a new
 *  project layer (made once, in the import's transaction). */
export class LayerPlan {
	readonly created: Layer[] = []
	#byName = new Map<string, Id>()
	#order: number
	constructor(private records: Layer[], private makeId: () => Id) {
		const all = layersOf(records)
		for (const l of all) this.#byName.set(l.name.trim().toLowerCase(), l.id)
		this.#order = Math.max(0, ...all.map((l) => l.order))
	}
	/** The cad layer of this name, if there is one (no new layer). */
	find(name: string | undefined): Id | undefined { return name ? this.#byName.get(name.trim().toLowerCase()) : undefined }
	/** The cad layer of this name, made when missing. */
	resolve(name: string | undefined, color?: string): Id | undefined {
		if (!name?.trim()) return undefined
		const known = this.find(name)
		if (known) return known
		this.#order += 10
		const layer: Layer = { type: 'layer', id: this.makeId(), name: name.trim(), order: this.#order, color: color ?? nextLayerColour([...this.records, ...this.created]) }
		this.created.push(layer)
		this.#byName.set(layer.name.toLowerCase(), layer.id)
		return layer.id
	}
}

type Extra = { layerId?: Id; groupId?: Id; importedFrom: string }
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/** A Pages prism as a cad box: its footprint centre = corner + half the size, its `rot` (deg, about that centre, the
 *  same on-screen sense as a cad rect's) kept, raised from z by h. Not 4 edges → the n-gon Pages draws, as a polygon. */
export function prismShape(o: PagesPrism, levelId: Id, x: Extra, makeId: () => Id): Shape {
	const w = o.w || 1, d = o.d || 1
	const centre = { x: o.x + w / 2, y: o.y + d / 2 }
	const edges = Math.round(o.edges ?? 4)
	const geom = edges === 4
		? { kind: 'rect' as const, centre, size: { x: w, y: d }, ...(o.rot ? { rot: o.rot } : {}) }
		: { kind: 'polygon' as const, pts: ngonFootprint(o.x, o.y, w, d, edges, o.rot ?? 0) }
	return tidy({
		type: 'shape', id: makeId(), levelId, geom, plane: { kind: 'plan', z: o.z ?? 0 }, extent: o.h || undefined,
		label: o.label || undefined, style: o.color ? { stroke: o.color } : undefined, ...x,
	}) as Shape
}

/** Pages' n-gon footprint (3dview/projection.ts boxFootprint, ported): n points inscribed in the w × d box, filling
 *  it on both axes, turned by `rot` about the box centre. */
export function ngonFootprint(x: number, y: number, w: number, d: number, edges: number, rot = 0): Pt[] {
	const n = Math.max(3, Math.min(24, Math.round(edges)))
	const cx = x + w / 2, cy = y + d / 2
	const angs = Array.from({ length: n }, (_, k) => Math.PI / n + (k * 2 * Math.PI) / n)
	const rx = angs.map(Math.cos), ry = angs.map(Math.sin)
	const minX = Math.min(...rx), maxX = Math.max(...rx), minY = Math.min(...ry), maxY = Math.max(...ry)
	const sx = w / (maxX - minX || 1), sy = d / (maxY - minY || 1)
	const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
	return angs.map((_, i) => {
		const px = x + (rx[i] - minX) * sx, py = y + (ry[i] - minY) * sy
		return rot ? { x: cx + (px - cx) * c - (py - cy) * s, y: cy + (px - cx) * s + (py - cy) * c } : { x: px, y: py }
	})
}

/** A Pages wall as a cad wall: the same node graph (fresh ids, kept consistent), its thickness × height as the section,
 *  a segment's own thickness / height as that segment's section. Null when it has no segment to draw. */
export function wallShape(o: PagesWall, levelId: Id, x: Extra, makeId: () => Id): Shape | null {
	const ids = new Map<string, Id>()
	const nodes: PathNode[] = (o.nodes ?? []).map((n) => { const id = makeId(); ids.set(n.id, id); return { id, x: n.x, y: n.y, z: n.z ?? 0 } })
	const segs: PathSeg[] = []
	for (const s of o.segments ?? []) {
		const a = ids.get(s.a), b = ids.get(s.b)
		if (!a || !b || a === b) continue
		const own = s.thickness !== undefined || s.h !== undefined
		segs.push({ id: makeId(), a, b, ...(own ? { section: { w: s.thickness ?? o.thickness, h: s.h ?? o.h, anchor: 'bottom' as const } } : {}) })
	}
	if (!segs.length) return null
	const used = new Set(segs.flatMap((s) => [s.a, s.b]))
	return tidy({
		type: 'shape', id: makeId(), levelId, geom: { kind: 'path', nodes: nodes.filter((n) => used.has(n.id)), segs },
		section: { w: o.thickness || 100, h: o.h || 2700, anchor: 'bottom' }, role: { kind: 'wall', openings: [] },
		label: o.label || undefined, style: o.color ? { stroke: o.color } : undefined, ...x,
	}) as Shape
}

/** The stamp that marks a Pages object as imported. */
export const pagesKey = (modelId: string, o: { id?: string }, i: number) => `pages:${modelId}:${o.id ?? `#${i}`}`
