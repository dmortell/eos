// The NAVIGATOR's tree (UX review S3; Dave: "Pages' tree is the right idea, but it must make models and drawings
// easier to find"): the building side is the model — buildings › levels › their plan and sections (no elevation rows: Dave 2026-10-15, use sections; the view strip switches), the
// server rooms (rack view, rows, racks) — then the riser view; the sheets after it, grouped by place, each unfolding to
// its viewports. A search filters as you type and keeps each match's parents. Pure; tested in navTree.test.ts.
import { categoryOf, DEFAULT_SHEET_CATEGORIES, type SheetCategory } from './sheetCategories'
import { sheetPlaces, sheetRows } from './sheetList'
import { packageMembers } from './packages'
import type { ProjectIndex } from './project'
import type { Id, Level, RackRow, Rack } from './types'
import type { Sheet, SectionCut, Entity, SheetPackage } from './drawing'
import type { ViewSpec } from '../views/space'
import { naturalCompare } from './labels'
import { portMapTitle } from './portMap'
import { riserLevels } from './fill'

export interface NavNode {
	key: string
	label: string
	/** A small note on the right (outlet count, scale, "frame"). */
	detail?: string
	kind: 'building' | 'level' | 'view' | 'section' | 'room' | 'row' | 'rack' | 'riser' | 'sheets' | 'place' | 'sheet' | 'viewport'
	/** What a click opens: a view of a level (the riser view has no level). */
	open?: { levelId?: Id; spec: ViewSpec }
	/** What a click selects (a rack, a sheet, a section). */
	select?: Id
	/** The entity this row is (rename / delete actions). */
	id?: Id
	children?: NavNode[]
}

const all = <T extends Entity['type']>(ix: ProjectIndex, t: T) => [...ix.ofType(t)] as Extract<Entity, { type: T }>[]

/** How the Sheets node groups its sheets (the Navigator's choice, per project in this browser). */
export interface NavOpts { sheetsBy?: 'place' | 'category' | 'level' | 'package'; categories?: SheetCategory[] }

export function navTree(ix: ProjectIndex, o: NavOpts = {}): NavNode[] {
	const levels = [...ix.levels].sort((a, b) => a.order - b.order)
	const buildings = all(ix, 'building').sort((a, b) => a.order - b.order || naturalCompare(a.name, b.name))
	const outlets = new Map<Id, number>()
	for (const o of ix.outlets) outlets.set(o.levelId, (outlets.get(o.levelId) ?? 0) + 1)
	const sections = all(ix, 'section') as SectionCut[], rows = all(ix, 'rackRow') as RackRow[]

	const levelNode = (l: Level): NavNode => {
		const rooms = ix.spaces.filter((s) => s.levelId === l.id && s.kind === 'server room').sort((a, b) => naturalCompare(a.name, b.name))
		const secs = sections.filter((s) => s.levelId === l.id).sort((a, b) => naturalCompare(a.name, b.name))
		const views: NavNode[] = [
			{ key: `v:${l.id}:plan`, label: 'Plan', kind: 'view', open: { levelId: l.id, spec: { kind: 'plan' } } },
			...secs.map((s): NavNode => ({ key: `sec:${s.id}`, label: `Section ${s.name}`, kind: 'section', id: s.id, select: s.id, open: { levelId: l.id, spec: { kind: 'section', sectionId: s.id } } })),
		]
		const roomNodes = rooms.map((r): NavNode => {
			const racks = ix.racks.filter((k) => k.spaceId === r.id).sort((a, b) => naturalCompare(a.name, b.name))
			const rs = rows.filter((w) => w.spaceId === r.id).sort((a, b) => a.order - b.order)
			const n = racks.filter((k) => k.kind !== 'vcm').length   // cable managers are listed, not counted (Dave 2026-10-10)
			return {
				key: `room:${r.id}`, label: r.name, detail: `${n} rack${n === 1 ? '' : 's'}`, kind: 'room', id: r.id, select: r.id,
				open: { levelId: l.id, spec: { kind: 'row', spaceId: r.id, face: 'front' } },
				children: [
					...rs.map((w): NavNode => ({ key: `row:${w.id}`, label: `Row ${w.name}`, kind: 'row', id: w.id, select: w.id, open: { levelId: l.id, spec: { kind: 'row', spaceId: r.id, face: 'front', rowId: w.id } } })),
					...racks.map((k: Rack): NavNode => ({ key: `rack:${k.id}`, label: k.name, kind: 'rack', id: k.id, select: k.id, detail: k.patchFrame ? 'frame' : undefined, open: { levelId: l.id, spec: { kind: 'row', spaceId: r.id, face: 'front' } } })),
				],
			}
		})
		const n = outlets.get(l.id)
		return { key: `lvl:${l.id}`, label: l.name, detail: n ? `${n} outlets` : undefined, kind: 'level', id: l.id, open: { levelId: l.id, spec: { kind: 'plan' } }, children: [...views, ...roomNodes] }
	}

	const out: NavNode[] = []
	const byBuilding = new Map<Id, Level[]>()
	for (const l of levels) byBuilding.set(l.buildingId, [...(byBuilding.get(l.buildingId) ?? []), l])
	const known = new Set(buildings.map((b) => b.id))
	for (const b of buildings) out.push({ key: `bld:${b.id}`, label: b.name, kind: 'building', id: b.id, children: (byBuilding.get(b.id) ?? []).map(levelNode) })
	const loose = levels.filter((l) => !known.has(l.buildingId))
	if (loose.length) out.push({ key: 'bld:none', label: buildings.length ? 'Other levels' : 'Levels', kind: 'building', children: loose.map(levelNode) })
	out.push({ key: 'riser', label: 'Riser view (building)', kind: 'riser', open: { spec: { kind: 'riser' } } })

	// the sheets, grouped by PLACE (its filed place, else the levels its viewports show) — or, chosen in the Sheets row's
	// ⋮ (sheets-organising slice 4), by category (list order), level (level order; a sheet under each of its levels)
	// or package (package order, then "Not in a package")
	const sheets = (all(ix, 'sheet') as Sheet[]).filter((s) => s.status !== 'archived').sort((a, b) => a.order - b.order || naturalCompare(a.number, b.number))
	const by = o.sheetsBy ?? 'place', cats = o.categories ?? DEFAULT_SHEET_CATEGORIES
	const placeOf = (s: Sheet) => (s.placeId ? ix.nameOf(s.placeId) : [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))].join(' / ')) || 'No place'
	const groups = new Map<string, Sheet[]>()   // label → sheets, in the order groups should show
	const add = (label: string, s: Sheet) => groups.set(label, [...(groups.get(label) ?? []), s])
	if (by === 'category') {
		const ranked = sheets.map((s) => ({ s, c: categoryOf(s, cats) })).sort((a, b) => a.c.order - b.c.order)
		for (const { s, c } of ranked) add(c.label, s)
	} else if (by === 'level') {
		const lv = sheets.map((s) => ({ s, ls: sheetPlaces(ix, s).levels }))
		const order = [...new Map(lv.flatMap((x) => x.ls).map((l) => [l.id, l])).values()].sort((a, b) => a.order - b.order)
		for (const l of order) for (const x of lv) if (x.ls.some((y) => y.id === l.id)) add(l.name, x.s)
		for (const x of lv) if (!x.ls.length) add('No level', x.s)
	} else if (by === 'package') {
		const rows = sheetRows(ix, sheets, cats), byId = new Map(sheets.map((s) => [s.id, s])), inOne = new Set<string>()
		const pkgs = (all(ix, 'package') as SheetPackage[]).filter((p) => !p.archived).sort((a, b) => a.order - b.order)
		for (const p of pkgs) for (const r of packageMembers(p, rows)) { add(p.name, byId.get(r.id)!); inOne.add(r.id) }
		for (const s of sheets) if (!inOne.has(s.id)) add('Not in a package', s)
	} else for (const s of sheets) add(placeOf(s), s)
	const sheetNode = (s: Sheet): NavNode => ({
		key: `sh:${s.id}`, label: `${s.number} ${s.title}`, kind: 'sheet', id: s.id, select: s.id, open: { spec: { kind: 'sheet', sheetId: s.id } },
		children: s.viewports.map((v): NavNode => ({
			key: `vp:${s.id}:${v.id}`, label: v.label || viewName(ix, v.view.spec, v.view.levelId), detail: `1:${v.scale}`, kind: 'viewport',
			open: { levelId: v.view.levelId, spec: v.view.spec },
		})),
	})
	out.push({
		key: 'sheets', label: `Sheets (${sheets.length})`, kind: 'sheets',
		children: groups.size <= 1 && by === 'place' ? sheets.map(sheetNode)
			: [...groups].sort((a, b) => (by === 'place' ? naturalCompare(a[0], b[0]) : 0)).map(([label, ss]): NavNode => ({ key: `${by}:${label}`, label, detail: by === 'place' ? undefined : String(ss.length), kind: 'place', children: ss.map(sheetNode) })),
	})
	return out
}

/** A view's name for a row: "1F plan", "1F front elevation", "IDF1 racks", "Section A". */
export function viewName(ix: ProjectIndex, spec: ViewSpec, levelId?: Id): string {
	// enough to tell two tabs apart (review R48: four tabs read "33IDF2 racks", one just "plan"): the level, the room,
	// the face; a level / room that's gone says so instead of leaving a blank
	const lv = levelId ? ix.nameOf(levelId) || '(level gone)' : ''
	switch (spec.kind) {
		case 'plan': return lv ? `${lv} plan` : 'Plan (current level)'
		case 'elevation': return `${lv} ${spec.dir} elevation`.trim()
		case 'section': { const sec = ix.get(spec.sectionId) as { levelId?: Id } | undefined; return `${sec?.levelId ? `${ix.nameOf(sec.levelId)} · ` : ''}Section ${ix.nameOf(spec.sectionId) || '(gone)'}` }
		case 'row': {
			const room = ix.get(spec.spaceId) as { levelId?: Id } | undefined
			return `${room?.levelId ? `${ix.nameOf(room.levelId)} · ` : ''}${ix.nameOf(spec.spaceId) || '(room gone)'} racks${spec.rowId ? ` · ${ix.nameOf(spec.rowId)}` : ''}${spec.face === 'rear' ? ' (rear)' : ''}`
		}
		case 'riser': return 'Riser view'
		case 'sheet': return ix.nameOf(spec.sheetId)
		case 'portmap': return portMapTitle(ix, spec.deviceIds)
		case 'ports': return `${ix.nameOf(spec.rackId) || '(rack gone)'}${spec.deviceId ? ` · ${ix.nameOf(spec.deviceId) || '(gone)'}` : ''} port grid`
		case 'schedule': return `Patch schedule${spec.spaceId ? ` · ${ix.nameOf(spec.spaceId) || '(room gone)'}` : ' (all rooms)'}${spec.start && spec.start > 1 ? ` from #${spec.start}` : ''}`
		case 'fill': {
			const s = ix.get(spec.shapeId), segs = s?.type === 'shape' && s.geom.kind === 'path' ? s.geom.segs : [], i = segs.findIndex((g) => g.id === spec.segId)
			const riser = i >= 0 && s?.type === 'shape' ? riserLevels(ix, s, segs[i]) : null   // W22: "Fill · Riser L1 ↕ GF"
			const run = ix.nameOf(spec.shapeId)
			if (riser) return `Fill · ${run ? `${run} · ` : ''}Riser ${riser}`
			return `Fill · ${run || (s ? 'Run' : '(run gone)')}${i >= 0 ? ` seg ${i + 1}` : ''}`
		}
	}
}

/** The tree filtered by a search: nodes whose label (or detail) matches, with their parents; a match keeps its children. */
export function filterTree(nodes: NavNode[], q: string): NavNode[] {
	const w = q.trim().toLowerCase()
	if (!w) return nodes
	const out: NavNode[] = []
	for (const n of nodes) {
		const hit = `${n.label} ${n.detail ?? ''}`.toLowerCase().includes(w)
		if (hit) { out.push(n); continue }
		const kids = n.children ? filterTree(n.children, q) : []
		if (kids.length) out.push({ ...n, children: kids })
	}
	return out
}

/** The keys of the nodes on the way to the row that opens `spec` (of `levelId`): to unfold its branch and mark it. */
export function pathTo(nodes: NavNode[], match: (n: NavNode) => boolean, trail: string[] = []): string[] | null {
	for (const n of nodes) {
		if (match(n)) return [...trail, n.key]
		const r = n.children ? pathTo(n.children, match, [...trail, n.key]) : null
		if (r) return r
	}
	return null
}

/** What a search's Enter and ↑ / ↓ walk: the rows it shows that open something (in tree order), then the devices and
 *  outlets found — Enter on a search that matched only a device opened nothing. */
export function searchHits(shown: NavNode[], finds: FindItem[]): NavNode[] {
	const out: NavNode[] = []
	const walk = (ns: NavNode[]) => { for (const n of ns) { if (n.open) out.push(n); walk(n.children ?? []) } }
	walk(shown)
	return [...out, ...finds]
}

/** Devices and outlets matching a search (review R56: Ctrl+K found only levels, views, sheets, rooms, racks — a device
 *  needed Racks › Find a device, an outlet the tables): rows that open a device's rack view (its side, zoomed to its
 *  rack) or an outlet's plan, with it selected. `focus` = what the view fits to (none for an outlet not placed yet: its
 *  plan opens with it selected). At most `max` `items`; `more` = how many matched past them (the list says so). */
export type FindItem = NavNode & { focus?: Id }
export function findItems(ix: ProjectIndex, q: string, max = 15): { items: FindItem[]; more: number } {
	const w = q.trim().toLowerCase()
	if (w.length < 2) return { items: [], more: 0 }
	const out: FindItem[] = []
	for (const d of ix.devices) {
		const r = ix.get<Rack>(d.rackId)
		if (r?.type !== 'rack' || !`${d.name} ${d.model ?? ''}`.toLowerCase().includes(w)) continue
		out.push({ key: `find:${d.id}`, kind: 'rack', label: d.name.trim() || d.kind, detail: `${r.name} · U${d.u} · ${ix.nameOf(r.levelId)}`, select: d.id, focus: r.id,
			open: { levelId: r.levelId, spec: { kind: 'row', spaceId: r.spaceId, face: d.mount === 'rear' || d.face === 'rear' ? 'rear' : 'front' } } })
	}
	for (const o of ix.outlets) {
		if (!o.label.toLowerCase().includes(w)) continue
		out.push({ key: `find:${o.id}`, kind: 'view', label: o.label, detail: `outlet · ${ix.nameOf(o.levelId)}${o.at ? '' : ' · not placed'}`, select: o.id, ...(o.at ? { focus: o.id } : {}), open: { levelId: o.levelId, spec: { kind: 'plan' } } })
	}
	out.sort((a, b) => naturalCompare(a.label, b.label))
	return { items: out.slice(0, max), more: Math.max(0, out.length - max) }
}
