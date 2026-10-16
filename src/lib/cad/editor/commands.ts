// Edits that touch more than the selected records: deleting cascades to what can't exist without them.
import type { EntityStore, Txn } from '../store/store'
import type { ProjectIndex } from '../domain/project'
import { namedFrame, type ElevDir } from '../domain/conventions'
import { sectionFrame } from '../views/section'
import { contentCentre } from '../views/sheet'
import { groupShapes, ungroupShapes } from '../domain/groups'
import type { Id, Cord, Level } from '../domain/types'
import type { Entity, Sheet, Viewport } from '../domain/drawing'
import type { Shape, PathNode } from '../domain/shapes'
import { heightsOf } from '../domain/floors'
import { removeCord } from '../domain/cords'
import { untie } from './noteTool'

/** Everything that lives on a level: its outlets, racks, shapes, floorplans, rooms / zones, sections, saved views, and
 *  the rack rows of those rooms (devices, links and cords follow through deleteEntities). For deleting a level; the
 *  sheet viewports showing it come off with `levelViewportsOff`. */
export function levelContents(all: Iterable<Entity>, levelId: Id): Id[] {
	const list = [...all], out: Id[] = [], spaces = new Set<Id>()
	for (const e of list) {
		if ((e.type === 'outlet' || e.type === 'rack' || e.type === 'underlay' || e.type === 'space' || e.type === 'section') && e.levelId === levelId) out.push(e.id)
		else if (e.type === 'view' && (e.params as { levelId?: Id }).levelId === levelId) out.push(e.id)   // its saved views (and their own shapes)
		else if (e.type === 'shape' && e.levelId === levelId) out.push(e.id)   // a run of another floor reaching it: levelRisers
		if (e.type === 'space' && e.levelId === levelId) spaces.add(e.id)
	}
	for (const e of list) if (e.type === 'rackRow' && spaces.has(e.spaceId)) out.push(e.id)
	return out
}

/** W36: runs of OTHER floors that reach this level (a riser up / down to it ends on a node of this level). Deleting the
 *  level ends their risers on the nearest floor with a model, else cuts them back (`withoutLevelNodes`) — the whole run
 *  used to go with it. */
export function levelRisers(all: Iterable<Entity>, levelId: Id): Shape[] {
	return [...all].filter((e): e is Shape => e.type === 'shape' && e.levelId !== levelId && e.geom.kind === 'path' && e.geom.nodes.some((n) => n.levelId === levelId))
}
/** A run without its nodes on `levelId` (and the segments to them); null when fewer than two nodes are left. */
export function withoutLevelNodes(s: Shape, levelId: Id, levels: Level[] = []): Shape | null {
	if (s.geom.kind !== 'path') return s
	const g0 = s.geom, elev = (id: Id | undefined) => levels.find((l) => l.id === (id ?? s.levelId))?.elevationMm
	// User 2026-10-15: a riser to the deleted floor ends on the nearest floor that still has a model between its other
	// end and it (that floor's tray height; FFL for a low run) — only with none in between is it cut back
	const moved = new Map<Id, PathNode>()
	const gone0 = elev(levelId)
	for (const n of g0.nodes) {
		if (n.levelId !== levelId || gone0 === undefined) continue
		for (const sg of g0.segs) {
			const otherId = sg.a === n.id ? sg.b : sg.b === n.id ? sg.a : null, m = otherId ? g0.nodes.find((x) => x.id === otherId) : undefined
			const from = m && m.levelId !== levelId ? elev(m.levelId) : undefined
			if (from === undefined || m!.x !== n.x || m!.y !== n.y) continue   // a vertical riser from another floor only
			const between = levels.filter((l) => !l.area && l.id !== levelId && (from < gone0 ? l.elevationMm > from && l.elevationMm < gone0 : l.elevationMm < from && l.elevationMm > gone0))
			const to = between.sort((a, b) => Math.abs(a.elevationMm - gone0) - Math.abs(b.elevationMm - gone0))[0]
			if (!to) continue
			const h = heightsOf(to), low = s.role?.kind === 'containment' && s.role.tier === 'low'
			moved.set(n.id, { ...n, levelId: to.id === s.levelId ? undefined : to.id, z: low ? 0 : h.clearHeightMm + h.plenumMm / 2 })
		}
	}
	const gone = new Set(g0.nodes.filter((n) => n.levelId === levelId && !moved.has(n.id)).map((n) => n.id))
	const nodes = g0.nodes.filter((n) => !gone.has(n.id)).map((n) => moved.get(n.id) ?? n), segs = g0.segs.filter((g) => !gone.has(g.a) && !gone.has(g.b))
	const used = new Set(segs.flatMap((g) => [g.a, g.b]))
	const kept = nodes.filter((n) => used.has(n.id))
	return kept.length < 2 ? null : { ...s, geom: { ...s.geom, nodes: kept, segs } }
}

/** W35: what a delete takes, counted by kind — "7 outlets, 1 run, 1 floorplan". */
export function contentsText(all: Iterable<Entity>, ids: Id[]): string {
	const want = new Set(ids), n = new Map<string, number>()
	const kind = (e: Entity): string => e.type === 'shape' ? (e.role?.kind === 'containment' ? 'run' : e.role?.kind === 'wall' ? 'wall' : 'drawing item')
		: e.type === 'underlay' ? 'floorplan' : e.type === 'space' ? 'room' : e.type === 'rackRow' ? 'rack row' : e.type === 'view' ? 'saved view' : e.type
	for (const e of all) if (want.has(e.id)) n.set(kind(e), (n.get(kind(e)) ?? 0) + 1)
	return [...n].map(([k, c]) => `${c} ${k}${c === 1 ? '' : 's'}`).join(', ')
}

/**
 * Delete the given entities, plus the links and cords that end on a deleted outlet or device. One undo step.
 * A SELECTED cord follows the install workflow instead (removeCord): a planned one goes, an installed one is only
 * marked `remove` — it still has to come out on site. Cords on a deleted device go with it.
 */
export function deleteEntities(store: EntityStore, ids: Id[], also?: (tx: Txn) => void): number {
	const marked: Cord[] = []
	const gone = new Set(ids.filter((id) => {
		const e = store.get(id)
		if (e?.type !== 'cord') return !!e
		const next = removeCord(e)
		if (next && next !== e) marked.push(next)
		return !next
	}))
	if (marked.length && !gone.size) {
		store.transact(marked.length === 1 ? 'Mark cord for removal' : `Mark ${marked.length} cords for removal`, (tx) => { for (const c of marked) tx.put(c) })
		return marked.length
	}
	if (!gone.size) return 0
	for (const e of store.all()) {
		if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
		if (e.type === 'device' && gone.has(e.rackId)) gone.add(e.id)
		// a sheet's paper notes (and a view's own shapes) belong to it alone
		if (e.type === 'shape' && ((e.sheetId && gone.has(e.sheetId)) || (e.viewId && gone.has(e.viewId)))) gone.add(e.id)
	}
	// Devices removed with their rack take their links / cords too.
	for (const e of store.all()) if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
	// a group whose shapes all go, goes too
	const byGroup = new Map<Id, Id[]>()
	for (const s of store.ofType('shape')) if (s.groupId) { const l = byGroup.get(s.groupId); if (l) l.push(s.id); else byGroup.set(s.groupId, [s.id]) }
	for (const g of store.ofType('group')) {
		const members = byGroup.get(g.id) ?? []
		if (members.length && members.every((id) => gone.has(id))) gone.add(g.id)
	}
	const fixed = unlinkFrom(store.all(), gone)
	store.transact(gone.size === 1 ? 'Delete' : `Delete ${gone.size} items`, (tx) => {
		also?.(tx)   // e.g. a deleted section's viewports kept as elevations or taken off (one undo step with the delete)
		for (const e of fixed) tx.put(e)   // what pointed at them lets go, in the same step (Undo puts it back)
		for (const id of gone) tx.del(id)
		for (const c of marked) if (!gone.has(c.id)) tx.put(c)
	})
	return gone.size + marked.length
}

/** What still points at deleted things, let go: a link's chosen runs, a run node's / leader's attachment, an outlet's
 *  host wall, a port's or panel's server room, the rooms a run serves (a run left serving only a gone room serves
 *  every room again). (Left, routing said "can't reach a chosen run" and tips showed rooms that were gone.) */
export function unlinkFrom(all: Iterable<Entity>, gone: Set<Id>): Entity[] {
	const out: Entity[] = []
	for (const e of all) {
		if (gone.has(e.id)) continue
		if (e.type === 'link' && e.via != null) {
			const via = (Array.isArray(e.via) ? e.via : [e.via]).filter((id) => !gone.has(id))
			if (via.length !== (Array.isArray(e.via) ? e.via.length : 1)) { const { via: _, ...rest } = e; out.push(via.length ? { ...rest, via: Array.isArray(e.via) ? via : via[0] } : rest) }
		} else if (e.type === 'shape') {
			let s = e
			if (s.geom.kind === 'path' && s.geom.nodes.some((n) => n.attach && gone.has(n.attach)))
				s = { ...s, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (n.attach && gone.has(n.attach) ? (({ attach: _, ...rest }) => rest)(n) : n)) } }
			if (s.geom.kind === 'leader' && s.geom.attach && gone.has(s.geom.attach)) {
				const { attach: _, ...geom } = s.geom
				s = { ...s, geom }
			}
			if (s.role?.kind === 'containment' && s.role.serves?.some((id) => gone.has(id))) {
				const serves = s.role.serves.filter((id) => !gone.has(id))
				s = { ...s, role: { ...s.role, serves: serves.length ? serves : undefined } }
			}
			if (s !== e) out.push(s)
		} else if (e.type === 'outlet' && ((e.hostShapeId && gone.has(e.hostShapeId)) || e.ports.some((p) => p.serverRoomId && gone.has(p.serverRoomId)))) {
			const { hostShapeId, ...rest } = e
			out.push({ ...rest, ...(hostShapeId && !gone.has(hostShapeId) ? { hostShapeId } : {}), ports: e.ports.map((p) => (p.serverRoomId && gone.has(p.serverRoomId) ? (({ serverRoomId: _, ...q }) => q)(p) : p)) })
		} else if (e.type === 'device' && e.panel?.serverRoomId && gone.has(e.panel.serverRoomId)) {
			const { serverRoomId: _, ...panel } = e.panel
			out.push({ ...e, panel })
		}
	}
	return out
}

/** Group the selected shapes (Ctrl+G): one undo step. Returns how many, or a reason it can't. */
export function groupSelection(store: EntityStore, ids: Id[]): { n: number } | { problem: string } {
	const r = groupShapes(store.all(), ids)
	if (!r.group) return { problem: 'Select two or more drawn shapes to group them' }
	store.transact(`Group ${r.put.length - 1} shapes`, (tx) => { for (const e of r.put) tx.put(e); for (const id of r.del) tx.del(id) })
	return { n: r.put.length - 1 }
}
/** Ungroup the selected shapes (Ctrl+Shift+G): one undo step; how many left a group. */
export function ungroupSelection(store: EntityStore, ids: Id[]): number {
	const r = ungroupShapes(store.all(), ids)
	if (r.put.length) store.transact(`Ungroup ${r.put.length} shapes`, (tx) => { for (const e of r.put) tx.put(e); for (const id of r.del) tx.del(id) })
	return r.put.length
}

/** The sheet viewports showing any of these sections. */
export function sectionViewports(store: EntityStore, sectionIds: Id[]): { sheet: Sheet; vp: Viewport }[] {
	return store.ofType('sheet').flatMap((sheet) => sheet.viewports.filter((v) => v.view.spec.kind === 'section' && sectionIds.includes(v.view.spec.sectionId)).map((vp) => ({ sheet, vp })))
}

/**
 * What a deleted section's viewports become (backlog "Deleting a section asks about its views"): `keep` = a plain
 * elevation looking the same way (the named direction nearest the section's), same window and scale, centred on its
 * content; else they come off their sheets (notes tied to them go back on the paper). Runs inside the delete's step.
 */
export function retargetSectionViewports(store: EntityStore, ix: ProjectIndex, sectionIds: Id[], keep: boolean): (tx: Txn) => void {
	return (tx) => {
		const hits = sectionViewports(store, sectionIds)
		for (const sheet of new Set(hits.map((h) => h.sheet))) {
			const viewports = sheet.viewports.flatMap((vp): Viewport[] => {
				if (vp.view.spec.kind !== 'section' || !sectionIds.includes(vp.view.spec.sectionId)) return [vp]
				const sec = store.get(vp.view.spec.sectionId)
				if (!keep || sec?.type !== 'section') {
					for (const n of store.ofType('shape')) if (n.sheetId === sheet.id && n.vpId === vp.id) tx.put(untie(n, vp))
					return []
				}
				const n = sectionFrame(sec).f.n
				const dir = (['front', 'rear', 'left', 'right'] as const).reduce((best, d) => { const m = namedFrame(d).n, b = namedFrame(best).n; return m.x * n.x + m.y * n.y > b.x * n.x + b.y * n.y ? d : best }, 'front' as ElevDir)
				const next: Viewport = { ...vp, view: { levelId: vp.view.levelId, spec: { kind: 'elevation', dir } } }
				return [{ ...next, centre: contentCentre(ix, next) }]
			})
			tx.put({ ...sheet, viewports })
		}
	}
}

/** The sheet viewports drawing this level (plans, elevations, sections and rack rows of it). */
export function levelViewports(store: EntityStore, levelId: Id): { sheet: Sheet; vp: Viewport }[] {
	return viewportsWhere(store, (v) => v.view.levelId === levelId)
}
const viewportsWhere = (store: EntityStore, hit: (v: Viewport) => boolean): { sheet: Sheet; vp: Viewport }[] =>
	store.ofType('sheet').flatMap((sheet) => sheet.viewports.filter(hit).map((vp) => ({ sheet, vp })))
/** Inside a level's delete: its viewports come off their sheets (notes tied to them go back on the paper) — else the
 *  sheets would keep printing an empty view. */
export function levelViewportsOff(store: EntityStore, levelId: Id): (tx: Txn) => void {
	return viewportsOff(store, () => levelViewports(store, levelId))
}
/** The sheet viewports showing this server room: its racks (rack view), its patch schedule, its racks' port sheets. */
export function roomViewports(store: EntityStore, roomId: Id): { sheet: Sheet; vp: Viewport }[] {
	const racks = new Set(store.ofType('rack').filter((r) => r.spaceId === roomId).map((r) => r.id))
	// …and its room elevations (Round 7: deleting a room left its A–D sections and their sheets behind)
	const elevs = new Set(roomElevations(store, roomId))
	return viewportsWhere(store, ({ view: { spec } }) =>
		(spec.kind === 'row' || spec.kind === 'schedule') ? spec.spaceId === roomId : spec.kind === 'ports' ? racks.has(spec.rackId) : spec.kind === 'section' && elevs.has(spec.sectionId))
}
/** Inside a room's delete: the viewports showing it come off their sheets (tied notes back on the paper). */
export function roomViewportsOff(store: EntityStore, roomId: Id): (tx: Txn) => void {
	return viewportsOff(store, () => roomViewports(store, roomId))
}
function viewportsOff(store: EntityStore, find: () => { sheet: Sheet; vp: Viewport }[]): (tx: Txn) => void {
	return (tx) => {
		const hits = find()
		for (const sheet of new Set(hits.map((h) => h.sheet))) {
			const off = new Set(hits.filter((h) => h.sheet === sheet).map((h) => h.vp.id))
			for (const n of store.ofType('shape')) if (n.sheetId === sheet.id && n.vpId && off.has(n.vpId)) tx.put(untie(n, sheet.viewports.find((v) => v.id === n.vpId)!))
			tx.put({ ...sheet, viewports: sheet.viewports.filter((v) => !off.has(v.id)) })
		}
	}
}

/** Take one viewport off its sheet; the notes tied to it go back on the paper where they showed. One undo step. */
export function deleteViewport(store: EntityStore, sheet: Sheet, vp: Viewport): void { deleteViewports(store, sheet, [vp]) }
/** Several viewports in one step. Their notes stay on the paper (untied), or with `withNotes` go too (Cut). */
export function deleteViewports(store: EntityStore, sheet: Sheet, vps: Viewport[], withNotes = false): void {
	const gone = new Map(vps.map((v) => [v.id, v]))
	store.transact(vps.length === 1 ? 'Delete viewport' : `Delete ${vps.length} viewports`, (tx) => {
		tx.put({ ...sheet, viewports: sheet.viewports.filter((x) => !gone.has(x.id)) })
		for (const n of store.ofType('shape')) {
			const vp = n.sheetId === sheet.id && n.vpId ? gone.get(n.vpId) : undefined
			if (vp) { if (withNotes) tx.del(n.id); else tx.put(untie(n, vp)) }
		}
	})
}

/** What deleting `ids` takes WITH it (beyond the selected things): devices in deleted racks, links and cords on
 *  deleted devices, a deleted sheet's viewports and notes. Ask first when any of it is non-zero. */
export interface DeleteImpact { devices: number; links: number; cords: number; viewports: number; notes: number }
function devicesGoing(store: EntityStore, ids: Id[]) {
	const sel = new Set(ids)
	const racks = new Set(ids.filter((id) => store.get(id)?.type === 'rack'))
	const inRacks = store.ofType('device').filter((d) => racks.has(d.rackId) && !sel.has(d.id))
	const devs = new Set([...inRacks.map((d) => d.id), ...ids.filter((id) => store.get(id)?.type === 'device')])
	const on = (e: { id: Id; a: { on: Id }; b: { on: Id } }) => !sel.has(e.id) && (devs.has(e.a.on) || devs.has(e.b.on))
	return { sel, inRacks, on }
}
/** Installed cords (or ones mid-change) that go with deleted devices / racks: out of the record, not marked `remove` —
 *  their end is gone (patch-list-plan.md D3: delete them, after a warning). */
export function installedCordsGoing(store: EntityStore, ids: Id[]): number {
	const { on } = devicesGoing(store, ids)
	return store.ofType('cord').filter((c) => (c.status === 'installed' || c.status === 'change') && on(c)).length
}
export function deleteImpact(store: EntityStore, ids: Id[]): DeleteImpact {
	const { sel, inRacks, on } = devicesGoing(store, ids)
	const sheets = store.ofType('sheet').filter((s) => sel.has(s.id))
	const sheetIds = new Set(sheets.map((s) => s.id))
	return {
		devices: inRacks.length,
		links: store.ofType('link').filter(on).length,
		cords: store.ofType('cord').filter(on).length,
		viewports: sheets.reduce((n, s) => n + s.viewports.length, 0),
		notes: store.ofType('shape').filter((s) => s.sheetId && sheetIds.has(s.sheetId)).length,
	}
}
/** "14 devices, 30 links and 12 cords" — or null when nothing else goes. */
export function impactText(i: DeleteImpact): string | null {
	const parts = (Object.entries(i) as [keyof DeleteImpact, number][]).filter(([, n]) => n > 0)
		.map(([k, n]) => `${n} ${n === 1 ? k.slice(0, -1) : k}`)
	return parts.length ? parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : null
}

/** A room's elevations (Section › Room elevations, A–D): the sections drawn for it. */
export function roomElevations(store: EntityStore, roomId: Id): Id[] {
	return store.ofType('section').filter((s) => s.roomElev?.roomId === roomId).map((s) => s.id)
}
