// The left sidebar's ITEMS list: one row per shape / 3D object of a model, with the facts to filter and sort by
// (category, layer, outlet level / usage / ports), and the filters. Pure — parts/ItemsPanel.svelte renders it.
import type { Model, Obj } from '../3dview/types'
import { dimGeom, type Ent } from './geometry'
import { isOutletEnt } from '../store/allocate'

export type ItemCat = 'outlet' | 'block' | 'text' | 'dim' | 'shape' | 'image' | 'trunk' | 'rack' | 'device' | 'wall' | 'opening' | 'box'
export const ITEM_CATS: { id: ItemCat; label: string }[] = [
	{ id: 'outlet', label: 'Outlets' }, { id: 'trunk', label: 'Trunks / conduits' }, { id: 'rack', label: 'Racks' }, { id: 'device', label: 'Rack devices' },
	{ id: 'wall', label: 'Walls' }, { id: 'opening', label: 'Doors / windows' }, { id: 'box', label: '3D boxes' }, { id: 'block', label: 'Blocks (symbols)' },
	{ id: 'text', label: 'Text / notes' }, { id: 'dim', label: 'Dimensions' }, { id: 'shape', label: 'Lines / shapes' }, { id: 'image', label: 'Images' },
]
const CAT_ORDER = new Map(ITEM_CATS.map((c, i) => [c.id, i]))

export type ItemRow = {
	kind: 'ent' | 'obj'; id: string; cat: ItemCat
	/** What the row reads as (an outlet's label, a text's first line, a rack's name …). */
	name: string
	/** A short second column (ports · level · usage, a size, a length). */
	detail: string
	layerId?: string; layer: string
	/** Outlets: 'High' / 'Low' (filled symbol = low), usage (TYPE), ports. */
	level?: 'High' | 'Low'; usage?: string; ports?: number
	/** Shapes: their drawing plane + scope (for "in this view"). */
	plane?: string; space?: string
}

const SHAPE_NAME: Record<string, string> = { rect: 'Rectangle', ellipse: 'Ellipse', polyline: 'Line', arc: 'Arc' }
const mm = (n: number) => `${Math.round(n)}`
/** A text's first line, markdown marks stripped, trimmed to `max`. */
const firstLine = (s: string, max = 48) => { const l = (s.split('\n').find((x) => x.trim()) ?? '').replace(/[#*_`>|]/g, '').trim(); return l.length > max ? l.slice(0, max - 1) + '…' : l }

function entRow(e: Ent, layer: (id?: string) => string): ItemRow {
	const base = { kind: 'ent' as const, id: e.id, layerId: e.layer, layer: layer(e.layer), plane: e.plane ?? 'plan', space: e.space }
	if (isOutletEnt(e)) {
		const ports = Math.max(1, parseInt(e.attrs?.PORTS ?? '1', 10) || 1), level = e.fill && e.fill !== 'none' ? 'Low' as const : 'High' as const, usage = e.attrs?.TYPE ?? ''
		return { ...base, cat: 'outlet', name: e.attrs?.LABEL || '(no label)', detail: [`${ports}p`, level, usage].filter(Boolean).join(' · '), level, usage, ports }
	}
	switch (e.type) {
		case 'insert': return { ...base, cat: 'block', name: e.attrs?.LABEL || e.block || 'Block', detail: e.attrs?.LABEL ? e.block ?? '' : '' }
		case 'text': return { ...base, cat: 'text', name: firstLine(e.text ?? '') || '(empty text)', detail: e.noteW ? 'note' : e.callout ? 'callout' : '' }
		case 'dim': return { ...base, cat: 'dim', name: `${mm(dimGeom(e).len)} mm`, detail: e.text ? firstLine(e.text, 20) : '' }
		case 'image': return { ...base, cat: 'image', name: e.src?.startsWith('pdf') ? 'PDF page' : 'Image', detail: e.a && e.b ? `${mm(Math.abs(e.b[0] - e.a[0]))}×${mm(Math.abs(e.b[1] - e.a[1]))}` : '' }
		default: {
			const size = e.a && e.b ? `${mm(Math.abs(e.b[0] - e.a[0]))}×${mm(Math.abs(e.b[1] - e.a[1]))}` : e.pts ? `${e.pts.length} pts` : ''
			return { ...base, cat: 'shape', name: (e.type === 'polyline' && e.text ? firstLine(e.text, 30) : '') || SHAPE_NAME[e.type] || e.type, detail: size }
		}
	}
}

function objRow(o: Obj, layer: (id?: string) => string): ItemRow | null {
	if (!o.id) return null
	const base = { kind: 'obj' as const, id: o.id, layerId: o.layer, layer: layer(o.layer) }
	if (o.type === 'wall') return { ...base, cat: 'wall', name: o.label || 'Wall', detail: `${o.segments.length} seg · ${mm(o.thickness)} thk` }
	if (o.type === 'conduit') return { ...base, cat: 'trunk', name: o.label || (o.edges >= 12 ? 'Pipe' : 'Trunk'), detail: `${mm(o.w)}×${mm(o.h)} · ${o.segments.length} seg` }
	if (o.rack) return { ...base, cat: 'rack', name: o.label || 'Rack', detail: `${o.rack.u}U` }
	if (o.device) return { ...base, cat: 'device', name: o.label || o.device.kind || 'Device', detail: `${o.device.hU}U @ ${o.device.u}` }
	if (o.open) return { ...base, cat: 'opening', name: o.label || (o.open === 'door' ? 'Door' : o.open === 'window' ? 'Window' : 'Opening'), detail: `${mm(o.w)}×${mm(o.h)}` }
	return { ...base, cat: 'box', name: o.label || 'Box', detail: `${mm(o.w)}×${mm(o.d)}×${mm(o.h)}` }
}

/** Every shape + 3D object of a model as a row, sorted by category then name (natural: 4A2 before 4A10). */
export function itemRows(model: Model): ItemRow[] {
	const names = new Map((model.layers ?? []).map((l) => [l.id, l.name])), layer = (id?: string) => (id ? names.get(id) ?? '' : '')
	const rows = [...(model.shapes ?? []).map((e) => entRow(e, layer)), ...model.objects.map((o) => objRow(o, layer)).filter((r): r is ItemRow => !!r)]
	return rows.sort((a, b) => (CAT_ORDER.get(a.cat)! - CAT_ORDER.get(b.cat)!) || a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export type ItemFilter = {
	cat?: ItemCat | ''
	layer?: string
	/** Matches the name, detail, layer or usage (case-insensitive). */
	q?: string
	level?: '' | 'High' | 'Low'
	usage?: string
	/** "In this view" — drop rows on these (hidden / frozen) layers, and shapes of another view's scope or plane. */
	view?: { hidden: (layerId?: string) => boolean; frameId?: string; dir: string }
}

/** Shapes drawn in `dir`: plan shapes everywhere (except plan symbols + images off the plan), elevation shapes in theirs. */
function inView(r: ItemRow, v: NonNullable<ItemFilter['view']>): boolean {
	if (v.hidden(r.layerId)) return false
	if (r.kind === 'obj') return true
	if (r.space && r.space !== 'model' && r.space !== 'view:' + v.frameId) return false
	const plan = !r.plane || r.plane === 'plan'
	if (!plan) return r.plane === v.dir
	if (v.dir !== 'plan' && (r.cat === 'image' || ((r.cat === 'outlet' || r.cat === 'block') && v.dir !== 'iso'))) return false
	return true
}

export function filterItems(rows: ItemRow[], f: ItemFilter): ItemRow[] {
	const q = f.q?.trim().toLowerCase()
	return rows.filter((r) => (!f.cat || r.cat === f.cat) && (!f.layer || r.layerId === f.layer)
		&& (!f.level || r.level === f.level) && (!f.usage || r.usage === f.usage)
		&& (!q || [r.name, r.detail, r.layer, r.usage ?? ''].some((s) => s.toLowerCase().includes(q)))
		&& (!f.view || inView(r, f.view)))
}

/** The categories present (for the category list — only those with rows, with counts). */
export function catCounts(rows: ItemRow[]): { id: ItemCat; label: string; n: number }[] {
	const n = new Map<ItemCat, number>(); for (const r of rows) n.set(r.cat, (n.get(r.cat) ?? 0) + 1)
	return ITEM_CATS.filter((c) => n.has(c.id)).map((c) => ({ ...c, n: n.get(c.id)! }))
}

/** A row's key in the list's selection ('ent:<id>' / 'obj:<id>'). */
export const rowKey = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`
