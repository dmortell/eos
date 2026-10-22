// Reports derived from the project data (ADR 0001 §5): nothing here is stored, everything is recomputed.
//  - outletSchedule: one row per outlet with its ports, where each is patched to, and totals
//  - patchList:      one row per cord, both ends with their labels
//  - cordBom:        cords counted by type × length, a column per status (the dialog and the Excel BOM sheet)
//  - runLengths:     containment metres per run, split horizontal / vertical
//  - bom:            quantities by item for a quote (no prices — User, 2026-10-02)
import type { ProjectIndex } from './project'
import type { Id, Outlet, Cord, Link } from './types'
import { cableMedia, cableTypeLabel } from './cableTypes'
import type { Shape, Section, PathNode } from './shapes'
import { naturalCompare } from './labels'
import { sameEnd } from './cords'
import { isVertical } from './shapes'
import { rackBom, makerModel } from './rackBom'
import { estimateMetres, type Estimate } from './estimates'
import { cablesOf, linkCores } from './multicore'
import { routeLinks, cableMetres, cableSettings, boxNote, levelElevation, type Route } from './routing'
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
	/** Plan position, mm (unplaced outlets have none). */
	x?: number
	y?: number
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
			...(o.at ? { x: Math.round(o.at.x), y: Math.round(o.at.y) } : {}),
			ports: o.ports.map((pt) => {
				const far = p.farEnd({ on: o.id, port: pt.port })
				return { label: pt.label, cableType: pt.cableType, serverRoom: p.nameOf(pt.serverRoomId), patchedTo: far ? p.portPlace(far) : '' }
			}),
			placed: !!o.at,
		}))
		.sort((a, b) => naturalCompare(a.level, b.level) || naturalCompare(a.label, b.label))
	const byUsage: Record<string, number> = {}
	for (const r of rows) byUsage[r.usage || 'other'] = (byUsage[r.usage || 'other'] ?? 0) + 1   // a cleared usage counts as "other"
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
	notes: string
	/** Where a moved end was (a `change`): shown as ↶ in the list. */
	wasFrom?: string
	wasTo?: string
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
			cableType: c.cableType, colour: c.colour, lengthM: c.lengthM, cordId: c.cordId ?? '', notes: c.notes ?? '',
			...(c.status === 'change' && c.previous && !sameEnd(c.previous.a, c.a) ? { wasFrom: p.portPlace(c.previous.a) } : {}),
			...(c.status === 'change' && c.previous && !sameEnd(c.previous.b, c.b) ? { wasTo: p.portPlace(c.previous.b) } : {}),
		}))
		.sort((a, b) => naturalCompare(a.from, b.from))
}

/** One line of the cord BOM: a cable type at one length, how many cords of each status, and in all. */
export interface CordBomLine { type: string; lengthM: number; n: Record<Cord['status'], number>; total: number }

/** Cords counted by type × length (A → Z, then shortest first); `typeLabel` names the type. A cord with no length
 *  counts at 0 (shown as "-"). */
export function cordBom(cords: Cord[], typeLabel: (id: string) => string = (x) => x): CordBomLine[] {
	const by = new Map<string, CordBomLine>()
	for (const c of cords) {
		const type = typeLabel(c.cableType), lengthM = c.lengthM || 0, k = `${type}|${lengthM}`
		const e = by.get(k) ?? { type, lengthM, n: { add: 0, change: 0, replace: 0, remove: 0, installed: 0 }, total: 0 }
		e.n[c.status]++
		e.total++
		by.set(k, e)
	}
	return [...by.values()].sort((a, b) => naturalCompare(a.type, b.type) || a.lengthM - b.lengthM)
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


// ── BOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface BomLine { category: string; item: string; unit: 'ea' | 'm'; qty: number; note?: string }

/** Tubing per desk outlet (W26): the cables' run from the floor box up to the desk (rising with a sit-stand desk). */
export const DESK_TUBING_M = 2   // User 2026-10-15: 2 m, height-adjustable desks are common

/**
 * Quantities for a quote. Items with a catalogue id are counted by it; the rest by a readable description. Lengths
 * are rounded UP to whole metres per line. Cable comes from the routes (Phase 5); links with no route are counted
 * (unit 'ea') so they're not missed. `routes` = already computed ones (else routed here). Cable and cords are material
 * to buy: installed cables and cords aren't counted, only cords to add or replace. `estimates` = the ESTIMATED cables
 * (outlet ports not linked yet, domain/estimates.ts), each its own line "— estimated": always to buy, and gone once linked.
 * For a QUOTE (W25): cable types by their label (CAT6A, not cat6a); a cable with no route is priced at the routed
 * average of its type (with waste) instead of "length unknown" (still "ea" when none of its type is routed);
 * `rooms` = only what serves these server rooms (a phased tender: outlets with a port to one, its racks / devices,
 * cables and cords there, estimates to it, and the runs on those floors that serve them or any room).
 */
export function bom(p: ProjectIndex, catalog: CatalogProduct[] = [], routes?: Map<Id, Route>, estimates: readonly Estimate[] = [], scope: { rooms?: Id[] } = {}): BomLine[] {
	const lines = new Map<string, BomLine>(), notes = new Map<string, string>()
	const settings0 = p.get('settings'), st = settings0?.type === 'settings' ? settings0 : undefined, label = (t: string) => cableTypeLabel(st, t)
	// the scope: everything, or what serves the rooms picked
	const rooms = scope.rooms ? new Set(scope.rooms) : null
	const roomOfDevice = (id: Id) => { const d = p.get(id), r = d?.type === 'device' ? p.get(d.rackId) : undefined; return r?.type === 'rack' ? r.spaceId : undefined }
	const outletIn = (o: Outlet) => !rooms || o.ports.some((pt) => pt.serverRoomId && rooms.has(pt.serverRoomId))
	const deviceIn = (id: Id) => !rooms || rooms.has(roomOfDevice(id) ?? '')
	const endIn = (r: { on: Id }) => { const e = p.get(r.on); return e?.type === 'outlet' ? outletIn(e) : e?.type === 'device' ? deviceIn(e.id) : false }
	const levelsIn = rooms ? new Set([...p.outlets.filter(outletIn).map((o) => o.levelId), ...[...rooms].map((id) => (p.get(id) as { levelId?: Id } | undefined)?.levelId).filter((x): x is Id => !!x)]) : null
	const add = (category: string, item: string, unit: BomLine['unit'], qty: number) => {
		const k = `${category}|${item}|${unit}`
		const l = lines.get(k)
		if (l) l.qty += qty
		else lines.set(k, { category, item, unit, qty })
	}

	// cables to buy (not installed yet) and the estimated ones (ports not linked yet), in the scope
	const buyLinks = p.links.filter((l) => l.status !== 'installed' && (!rooms || endIn(l.a) || endIn(l.b)))
	const buyEst = rooms ? estimates.filter((e) => e.roomId && rooms.has(e.roomId)) : estimates
	let deskOutlets = 0
	for (const o of p.outlets) {
		if (!outletIn(o)) continue
		add('Outlets', `${o.ports.length}-port outlet (${o.mount})`, 'ea', 1)
		for (const pt of o.ports) add('Outlets', `Jack / module ${label(pt.cableType)}`, 'ea', 1)
		// W26 (User 2026-10-15): what each outlet sits in — a back box in a wall, a surface box on a ceiling, a floor box;
		// a desk outlet goes in the desk's own module, its cables up in tubing
		const box = o.mount === 'wall' ? 'Back box (wall)' : o.mount === 'ceiling' ? 'Surface box (ceiling)' : o.mount === 'floor' || o.mount === 'box' ? 'Floor box' : null
		if (box) add('Outlets', box, 'ea', 1)
		if (o.mount === 'desk') deskOutlets++
	}
	if (deskOutlets) {
		const item = `Spiral / mesh tubing to desk outlets (${DESK_TUBING_M} m each)`
		add('Outlets', item, 'm', deskOutlets * DESK_TUBING_M)
		notes.set(`Outlets|${item}|m`, `${deskOutlets} desk outlet${deskOutlets === 1 ? '' : 's'} × ${DESK_TUBING_M} m`)
	}
	// W26: fibre terminations (a connector at each end of each core), testing (a test per copper link, per fibre core) and
	// labelling (both ends of every cable, and each port it lands on)
	const isFibre = (t: string | undefined) => !!t && cableMedia(st, t) === 'fibre'
	// a link on LC ports is 2 cores (User 2026-10-22): a connector at each end of each
	const coresIn = (l: Link) => linkCores((id) => p.get(id), l)
	for (const l of buyLinks) if (isFibre(l.cableType)) add('Fibre terminations', `Connector / pigtail ${label(l.cableType ?? '')}`, 'ea', 2 * coresIn(l))
	const copperTests = buyLinks.filter((l) => !isFibre(l.cableType)).length + buyEst.filter((e) => !isFibre(e.cableType)).length
	const fibreTests = buyLinks.filter((l) => isFibre(l.cableType)).reduce((s, l) => s + coresIn(l), 0) + buyEst.filter((e) => isFibre(e.cableType)).length
	if (copperTests) add('Testing & labelling', 'Copper permanent-link test', 'ea', copperTests)
	if (fibreTests) add('Testing & labelling', 'Fibre test (per core)', 'ea', fibreTests)
	const cables = cablesOf(buyLinks).length + buyEst.length
	if (cables) {
		add('Testing & labelling', 'Cable labels (both ends)', 'ea', cables * 2)
		add('Testing & labelling', 'Port labels (both ends)', 'ea', (buyLinks.length + buyEst.length) * 2)
	}
	// racks, VCMs and their containment accessories by SKU (the Racks tool's rules, rackBom)
	for (const l of rackBom(p, catalog, rooms ? { rooms: [...rooms] } : {})) {
		add(l.group === 'Rack' || l.group === 'VCM' ? 'Racks' : l.group === 'Desk / shelf' ? 'Desks & shelves' : 'Rack accessories', l.description !== l.sku ? `${l.sku} - ${l.description}` : l.sku, 'ea', l.qty)
	}
	for (const d of p.devices) {
		if (!deviceIn(d.id)) continue
		// no catalogue id: its maker / model when it has them, with what it is
		const what = d.kind === 'panel' ? `Patch panel ${d.portCount}-port${d.portType ? ` ${d.portType}` : ''} ${d.heightU}U` : `${d.kind} ${d.heightU}U`
		const item = d.catalogId ?? (makerModel(d) ? `${makerModel(d)} (${what})` : what)
		add(d.kind === 'panel' ? 'Panels' : 'Devices', item, 'ea', 1)
	}
	// cable: routed (or hand-set) lengths + waste %, in metres with a box estimate; links with no route counted apart
	const cable = cableSettings(p)
	const media = (type: string) => cableMedia(st, type) ?? 'copper'
	// a cable with no route, priced at the routed average of its type (W25): metres already include the waste
	const unknown = (type: string, n: number, est: string, avg: number | null) => {
		if (avg == null) { add('Cable', `${label(type)}${est} — no route, length unknown`, 'ea', n); return }
		const item = `${label(type)}${est} — no route, estimated at ${avg} m each (the routed average, incl. waste)`
		add('Cable', item, 'm', n * avg)
		notes.set(`Cable|${item}|m`, `${n} cable${n === 1 ? '' : 's'} × ${avg} m`)
	}
	// only what is to be bought: cables already installed and cords already in place (or only moved / taken out) aren't
	const routed = cableMetres(p, routes ?? routeLinks(p, cable), cable, buyLinks)
	const avgOf = (type: string) => { const m = routed.find((x) => x.type === type), n = m ? m.links - m.unrouted : 0; return m && n > 0 ? Math.ceil(m.metres / n) : null }
	for (const m of routed) {
		const item = `${label(m.type)} (incl. ${cable.wastePct}% waste)`
		if (m.metres) { add('Cable', item, 'm', m.metres); if (media(m.type) === 'copper') notes.set(`Cable|${item}|m`, boxNote(m.metres)) }   // boxes are a copper thing
		if (m.unrouted) unknown(m.type, m.unrouted, '', avgOf(m.type))
	}
	for (const m of estimateMetres(rooms ? estimates.filter((e) => e.roomId && rooms.has(e.roomId)) : estimates, cable)) {
		const item = `${label(m.type)} — estimated, not allocated yet (incl. ${cable.wastePct}% waste)`
		if (m.metres) { add('Cable', item, 'm', m.metres); if (media(m.type) === 'copper') notes.set(`Cable|${item}|m`, boxNote(m.metres)) }
		const n = m.ports - m.unrouted
		if (m.unrouted) unknown(m.type, m.unrouted, ' — estimated', n > 0 ? Math.ceil(m.metres / n) : avgOf(m.type))
	}
	for (const c of p.cords) if ((c.status === 'add' || c.status === 'replace') && (!rooms || deviceIn(c.a.on) || deviceIn(c.b.on))) add('Patch cords', `${label(c.cableType)} ${c.lengthM} m`, 'ea', 1)
	const runIn = (s: Shape) => !levelsIn || (levelsIn.has(s.levelId ?? '') && (!(s.role?.kind === 'containment' && s.role.serves?.length) || s.role.serves.some((r) => rooms!.has(r))))
	for (const r of runLengths(p)) { const s = p.getOf('shape', r.id); if (!s || runIn(s)) add('Containment', `${r.form} ${r.size}`, 'm', r.horizontalM + r.verticalM) }
	for (const s of p.shapes) {
		if (levelsIn && !levelsIn.has(s.levelId ?? '')) continue
		if (s.role?.kind === 'penetration') add('Penetrations', `Core drill Ø${s.role.diaMm} through ${s.role.through}`, 'ea', 1)
		else if (s.catalogId && s.role?.kind !== 'containment') add('Items', s.catalogId, 'ea', 1)
	}

	return [...lines.entries()]
		.map(([k, l]) => ({ ...(l.unit === 'm' ? { ...l, qty: Math.ceil(l.qty) } : l), ...(notes.has(k) ? { note: notes.get(k) } : {}) }))
		.sort((a, b) => naturalCompare(a.category, b.category) || naturalCompare(a.item, b.item))
}

/** Shapes that are runs, for callers that need the geometry (routing, fill — Phase 5). */
export const containmentRuns = (p: ProjectIndex): Shape[] => p.shapes.filter((s) => s.role?.kind === 'containment')
