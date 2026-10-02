// Reports derived from the project data (ADR 0001 §5): nothing here is stored, everything is recomputed.
//  - outletSchedule: one row per outlet with its ports, where each is patched to, and totals
//  - patchList:      one row per cord, both ends with their labels
//  - runLengths:     containment metres per run, split horizontal / vertical
//  - bom:            quantities by item for a quote (no prices — Dave, 2026-10-02)
import type { ProjectIndex } from './project'
import type { Id, Outlet, Cord } from './types'
import type { Shape, Section, PathNode } from './shapes'
import { naturalCompare } from './labels'
import { isVertical } from './shapes'
import { rackBom } from './rackBom'
import type { CatalogProduct } from '$lib/catalog/types'

// ── Outlet schedule ───────────────────────────────────────────────────────────────────────────────────────────────

export interface OutletRow {
	id: Id
	level: string
	zone: string
	room: string
	label: string
	usage: string
	tier: Outlet['tier']
	mount: Outlet['mount']
	heightMm?: number
	ports: { label: string; cableType: string; serverRoom: string; patchedTo: string }[]
	placed: boolean
}

export function outletSchedule(p: ProjectIndex, levelId?: Id): { rows: OutletRow[]; totals: { outlets: number; ports: number; byUsage: Record<string, number> } } {
	const rows = p.outlets
		.filter((o) => !levelId || o.levelId === levelId)
		.map((o): OutletRow => ({
			id: o.id,
			level: p.nameOf(o.levelId),
			zone: p.nameOf(o.zoneId),
			room: p.nameOf(o.roomId),
			label: o.label,
			usage: o.usage,
			tier: o.tier,
			mount: o.mount,
			...(o.z !== undefined ? { heightMm: o.z } : {}),
			ports: o.ports.map((pt) => {
				const far = p.farEnd({ on: o.id, port: pt.port })
				return { label: pt.label, cableType: pt.cableType, serverRoom: p.nameOf(pt.serverRoomId), patchedTo: far ? p.portPlace(far) : '' }
			}),
			placed: !!o.at,
		}))
		.sort((a, b) => naturalCompare(a.level, b.level) || naturalCompare(a.label, b.label))
	const byUsage: Record<string, number> = {}
	for (const r of rows) byUsage[r.usage] = (byUsage[r.usage] ?? 0) + 1
	return { rows, totals: { outlets: rows.length, ports: rows.reduce((n, r) => n + r.ports.length, 0), byUsage } }
}

// ── Patch list ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PatchRow {
	id: Id
	status: Cord['status']
	from: string
	fromLabel: string
	to: string
	toLabel: string
	cableType: string
	colour: string
	lengthM: number
	cordId: string
}

export function patchList(p: ProjectIndex, opts: { rackIds?: Id[] } = {}): PatchRow[] {
	const inRacks = (on: Id) => {
		if (!opts.rackIds) return true
		const d = p.get(on)
		return d?.type === 'device' && opts.rackIds.includes(d.rackId)
	}
	return p.cords
		.filter((c) => inRacks(c.a.on) || inRacks(c.b.on))
		.map((c) => ({
			id: c.id, status: c.status,
			from: p.portPlace(c.a), fromLabel: p.portLabel(c.a),
			to: p.portPlace(c.b), toLabel: p.portLabel(c.b),
			cableType: c.cableType, colour: c.colour, lengthM: c.lengthM, cordId: c.cordId ?? '',
		}))
		.sort((a, b) => naturalCompare(a.from, b.from))
}

// ── Containment lengths ───────────────────────────────────────────────────────────────────────────────────────────

export interface RunLength { id: Id; label: string; form: string; size: string; horizontalM: number; verticalM: number }

/** "100×50" or "Ø25" — the BOM key of a section. */
export const sectionKey = (s: Section | undefined) => (!s ? '?' : s.round ? `Ø${s.w}` : `${s.w}×${s.h}`)

/** Metres of every containment run, segment by segment, at true 3D length; vertical segments counted separately. */
export function runLengths(p: ProjectIndex): RunLength[] {
	const out: RunLength[] = []
	for (const s of p.shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		const z = (n: PathNode) => n.z + levelElevation(p, n.levelId ?? s.levelId)
		let h = 0, v = 0
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (!a || !b) continue
			const len = Math.hypot(b.x - a.x, b.y - a.y, z(b) - z(a)) / 1000
			if (isVertical(a, b)) v += len
			else h += len
		}
		out.push({ id: s.id, label: s.label ?? '', form: s.role.form, size: sectionKey(s.section), horizontalM: h, verticalM: v })
	}
	return out
}

function levelElevation(p: ProjectIndex, levelId: Id | undefined): number {
	const l = p.get(levelId)
	return l?.type === 'level' ? l.elevationMm : 0
}

// ── BOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface BomLine { category: string; item: string; unit: 'ea' | 'm'; qty: number }

/**
 * Quantities for a quote. Items with a catalogue id are counted by it; the rest by a readable description. Lengths
 * are rounded UP to whole metres per line. Links without a length are counted (unit 'ea') so they're not missed.
 */
export function bom(p: ProjectIndex, catalog: CatalogProduct[] = []): BomLine[] {
	const lines = new Map<string, BomLine>()
	const add = (category: string, item: string, unit: BomLine['unit'], qty: number) => {
		const k = `${category}|${item}|${unit}`
		const l = lines.get(k)
		if (l) l.qty += qty
		else lines.set(k, { category, item, unit, qty })
	}

	for (const o of p.outlets) {
		add('Outlets', `${o.ports.length}-port outlet (${o.mount})`, 'ea', 1)
		for (const pt of o.ports) add('Outlets', `Jack / module ${pt.cableType}`, 'ea', 1)
	}
	// racks, VCMs and their containment accessories by SKU (the Racks tool's rules, rackBom)
	for (const l of rackBom(p, catalog)) {
		add(l.group === 'Rack' || l.group === 'VCM' ? 'Racks' : 'Rack accessories', l.description !== l.sku ? `${l.sku} - ${l.description}` : l.sku, 'ea', l.qty)
	}
	for (const d of p.devices) {
		const item = d.catalogId ?? (d.kind === 'panel' ? `Patch panel ${d.portCount}-port${d.portType ? ` ${d.portType}` : ''} ${d.heightU}U` : `${d.kind} ${d.heightU}U`)
		add(d.kind === 'panel' ? 'Panels' : 'Devices', item, 'ea', 1)
	}
	for (const l of p.links) {
		const type = l.cableType ?? 'cable'
		if (l.lengthM) add('Cable', `${type} (${l.kind})`, 'm', l.lengthM)
		else add('Cable', `${type} (${l.kind}) — length unknown`, 'ea', 1)
	}
	for (const c of p.cords) if (c.status !== 'remove') add('Patch cords', `${c.cableType} ${c.lengthM} m`, 'ea', 1)
	for (const r of runLengths(p)) add('Containment', `${r.form} ${r.size}`, 'm', r.horizontalM + r.verticalM)
	for (const s of p.shapes) {
		if (s.role?.kind === 'penetration') add('Penetrations', `Core drill Ø${s.role.diaMm} through ${s.role.through}`, 'ea', 1)
		else if (s.catalogId && s.role?.kind !== 'containment') add('Items', s.catalogId, 'ea', 1)
	}

	return [...lines.values()]
		.map((l) => (l.unit === 'm' ? { ...l, qty: Math.ceil(l.qty) } : l))
		.sort((a, b) => naturalCompare(a.category, b.category) || naturalCompare(a.item, b.item))
}

/** Shapes that are runs, for callers that need the geometry (routing, fill — Phase 5). */
export const containmentRuns = (p: ProjectIndex): Shape[] => p.shapes.filter((s) => s.role?.kind === 'containment')
