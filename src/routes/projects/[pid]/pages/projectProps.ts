// Properties for a PROJECT-TREE node (projectTree.ts), from the real Firestore data — what to show, and how an
// edit becomes a `projects/{pid}` patch. Pure, so it's unit-tested; ProjectSource (projectData.svelte.ts) feeds
// it the loaded docs and saves the patch. Only project-doc fields are editable here (name / codes / client /
// address / description, building names, floor labels, tenant-area labels, server-room names); racks rows and
// everything owned by another tool's doc are shown read-only. See docs/firestore-structure.md.
import { buildingOf, buildProjectTree, normFloors, racksDocId, floorName, OTHER_BUILDING, type FloorConfig, type TreeInput, type ProjectDoc } from './projectTree'

export type NodeField = { key: string; label: string; value: string; edit?: 'text' | 'textarea'; hint?: string }
export type NodeInfo = { kind: 'project' | 'building' | 'floor' | 'zone' | 'room' | 'row'; title: string; sections: { label: string; fields: NodeField[] }[]; note?: string }
/** The extra project fields the Properties panel shows (lib/types/project.ts). */
export type ProjectFull = ProjectDoc & { description?: string; clientCode?: string; projectCode?: string; author?: string; members?: string[]; createdAt?: unknown; updatedAt?: unknown }

const ROOMS = ['A', 'B', 'C', 'D']
const roomsOf = (f: FloorConfig) => ROOMS.slice(0, Math.max(1, Math.min(4, f.serverRoomCount ?? 1)))
const ro = (key: string, label: string, value: unknown): NodeField => ({ key, label, value: value == null || value === '' ? '—' : String(value) })
const ed = (key: string, label: string, value: unknown, edit: 'text' | 'textarea' = 'text', hint?: string): NodeField => ({ key, label, value: value == null ? '' : String(value), edit, hint })
function when(v: unknown): string {
	const d = v as { toDate?: () => Date; seconds?: number } | string | number | Date | undefined
	const t = !d ? null : typeof d === 'object' && 'toDate' in d && d.toDate ? d.toDate() : typeof d === 'object' && 'seconds' in d && d.seconds != null ? new Date(d.seconds * 1000) : new Date(d as string | number | Date)
	return t && !isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : '—'
}
const homeOf = (p: ProjectDoc) => p.address?.trim() || p.name?.trim() || 'Building'
const inRange = (n: number, r: { fromFloor?: number; toFloor?: number }) => r.fromFloor != null && r.toFloor != null && n >= Math.min(r.fromFloor, r.toFloor) && n <= Math.max(r.fromFloor, r.toFloor)

/** What the Properties panel shows for a tree node id (`pid`, `b:…`, `f:…`, `a:…`, `r:…`, `row:…`); null if unknown. */
export function describeNode(input: TreeInput & { project: ProjectFull }, id: string): NodeInfo | null {
	const { project: p, racks, risers, drawings } = input
	const floors = normFloors(p.floors), home = homeOf(p)
	const racksOn = (n: number) => roomsOf(floors.find((f) => f.number === n) ?? { number: n }).map((r) => racks[racksDocId(p.id, n, r)])
	const count = (docs: (typeof racks)[string][], k: 'racks' | 'rows' | 'devices') => docs.reduce((s, d) => s + ((d as Record<string, unknown[]> | undefined)?.[k]?.length ?? 0), 0)
	const drawingsOn = (n: number) => drawings.filter((d) => d.status !== 'archived' && d.sourceDocId?.startsWith(`${p.id}_F${String(n).padStart(2, '0')}`)).length

	if (id === p.id) return {
		kind: 'project', title: 'PROJECT',
		sections: [
			{ label: 'PROJECT', fields: [ed('name', 'Name', p.name), ed('clientCode', 'Client code', p.clientCode), ed('projectCode', 'Project code', p.projectCode), ed('client', 'Client', p.client), ed('address', 'Address', p.address, 'text', 'Also the default building name'), ed('author', 'Author', p.author), ed('description', 'Description', p.description, 'textarea')] },
			{ label: 'SUMMARY', fields: [ro('floors', 'Floors', floors.map((f) => floorName(f.number)).join(', ')), ro('risers', 'Risers', risers.map((r) => r.name || r.id).join(', ')), ro('drawings', 'Drawings', drawings.filter((d) => d.status !== 'archived').length), ro('members', 'Members', p.members?.length ?? 0), ro('created', 'Created', when(p.createdAt)), ro('updated', 'Updated', when(p.updatedAt)), ro('id', 'Id', p.id)] },
		],
	}
	if (id.startsWith('b:')) {
		const name = id.slice(2), fs = floors.filter((f) => buildingOf(f, risers, home) === name)
		const derived = !(p.buildings ?? []).includes(name) && !fs.some((f) => f.building?.trim() === name)
		return {
			kind: 'building', title: 'BUILDING',
			sections: [{ label: 'BUILDING', fields: [ed('name', 'Name', name, 'text', 'Renaming moves its floors with it'),
				ro('floors', 'Floors', fs.map((f) => floorName(f.number)).join(', ') || 'none'),
				ro('risers', 'Risers', risers.filter((r) => fs.some((f) => inRange(f.number, r))).map((r) => `${r.name || r.id} (${r.fromFloor}–${r.toFloor}F)`).join(', '))] }],
			note: name === OTHER_BUILDING ? 'Floors outside every riser range land here. Rename it, or drag its floors to a building.'
				: derived ? `Derived from the risers and the project address. Renaming saves it as a named building.` : undefined,
		}
	}
	const fm = /^f:(-?\d+)$/.exec(id)
	if (fm) {
		const n = Number(fm[1]), f = floors.find((x) => x.number === n); if (!f) return null
		const riser = risers.find((r) => inRange(n, r)) as (typeof risers)[number] & { floorHeights?: Record<string, { slabMm?: number; raisedFloorMm?: number; clearHeightMm?: number; plenumMm?: number }>; rooms?: { floor: number; kind: string; label: string }[] }
		const h = riser?.floorHeights?.[String(n)]
		const docs = racksOn(n)
		return {
			kind: 'floor', title: 'FLOOR',
			sections: [
				{ label: 'FLOOR', fields: [ro('number', 'Floor', floorName(n)), ed('label', 'Label', f.label, 'text', 'e.g. "L10 WeWork"'), ed('building', 'Building', f.building, 'text', 'Empty = from the risers')] },
				{ label: 'CONTENTS', fields: [ro('rooms', 'Server rooms', roomsOf(f).map((r) => f.roomNames?.[r] || `Room ${r}`).join(', ')), ro('zones', 'Zones', (f.areas ?? []).map((a) => a.label).join(', ')),
					ro('racks', 'Racks', count(docs, 'racks')), ro('devices', 'Devices', count(docs, 'devices')), ro('drawings', 'Drawings', drawingsOn(n)),
					ro('riserRooms', 'Riser rooms', (riser?.rooms ?? []).filter((x) => x.floor === n).map((x) => `${x.label} (${x.kind})`).join(', '))] },
				...(h ? [{ label: 'HEIGHTS (mm, from risers)', fields: [ro('slab', 'Slab', h.slabMm), ro('raised', 'Raised floor', h.raisedFloorMm), ro('clear', 'Clear height', h.clearHeightMm), ro('plenum', 'Plenum', h.plenumMm)] }] : []),
			],
		}
	}
	const am = /^a:(-?\d+):(.+)$/.exec(id)
	if (am) {
		const f = floors.find((x) => x.number === Number(am[1])), a = f?.areas?.find((x) => x.id === am[2]); if (!f || !a) return null
		return { kind: 'zone', title: 'ZONE (TENANT AREA)', sections: [{ label: 'ZONE', fields: [ed('label', 'Label', a.label), ro('id', 'Id', a.id), ro('floor', 'Floor', floorName(f.number)), ro('flags', 'Flags', [a.primary && 'primary', a.legacy && 'legacy (owns the unsuffixed outlets doc)'].filter(Boolean).join(', ') || 'none')] }] }
	}
	const rm = /^r:(-?\d+):([A-D])$/.exec(id)
	if (rm) {
		const n = Number(rm[1]), f = floors.find((x) => x.number === n); if (!f) return null
		const doc = racks[racksDocId(p.id, n, rm[2])]
		return { kind: 'room', title: 'SERVER ROOM', sections: [{ label: 'SERVER ROOM', fields: [ed('name', 'Name', f.roomNames?.[rm[2]], 'text', `Empty = "Room ${rm[2]}"`), ro('letter', 'Letter', rm[2]), ro('floor', 'Floor', floorName(n)),
			ro('rows', 'Rows', doc?.rows?.length ?? 0), ro('racks', 'Racks', doc?.racks?.length ?? 0), ro('devices', 'Devices', (doc as { devices?: unknown[] } | undefined)?.devices?.length ?? 0), ro('doc', 'Racks doc', racksDocId(p.id, n, rm[2]).slice(p.id.length + 1))] }] }
	}
	const wm = /^row:(-?\d+):([A-D]):(.+)$/.exec(id)
	if (wm) {
		const doc = racks[racksDocId(p.id, Number(wm[1]), wm[2])], row = doc?.rows?.find((r) => r.id === wm[3]); if (!row) return null
		const rks = ((doc?.racks ?? []) as { rowId?: string; label?: string }[]).filter((k) => k.rowId === row.id)
		return { kind: 'row', title: 'ROW', sections: [{ label: 'ROW', fields: [ro('label', 'Label', row.label), ro('racks', 'Racks', rks.map((k) => k.label).filter(Boolean).join(', ') || rks.length)] }], note: 'Rows and racks are edited in the Racks tool.' }
	}
	return null
}

/** The `projects/{pid}` merge patch for editing `key` of node `id` to `value`; null = nothing to save
 *  (unknown node / read-only key / a building rename to an empty or taken name). */
export function fieldPatch(input: TreeInput & { project: ProjectFull }, id: string, key: string, value: string): Record<string, unknown> | null {
	const { project: p, risers } = input
	const v = value.trim(), floors = normFloors(p.floors), home = homeOf(p)
	const withFloor = (n: number, fn: (f: FloorConfig) => FloorConfig) => ({ floors: floors.map((f) => (f.number === n ? fn(f) : f)) })
	const setOpt = <T extends object>(o: T, k: string, val: unknown) => { const c = { ...o } as Record<string, unknown>; if (val === '' || val == null) delete c[k]; else c[k] = val; return c as T }

	if (id === p.id) return ['name', 'clientCode', 'projectCode', 'client', 'address', 'author', 'description'].includes(key) && !(key === 'name' && !v) ? { [key]: key === 'description' ? value : v } : null
	if (id.startsWith('b:') && key === 'name') {
		const old = id.slice(2)
		const order = buildProjectTree(input).tree.filter((n) => n.folder === 'building').map((n) => n.label)   // the tree's own order
		if (!v || v === old || order.includes(v)) return null
		// every floor currently in the building (explicitly or derived) gets the new name explicitly
		return { buildings: order.map((b) => (b === old ? v : b)).filter((b) => b !== OTHER_BUILDING), floors: floors.map((f) => (buildingOf(f, risers, home) === old ? { ...f, building: v } : f)) }
	}
	const fm = /^f:(-?\d+)$/.exec(id)
	if (fm && (key === 'label' || key === 'building')) return withFloor(Number(fm[1]), (f) => setOpt(f, key, v))
	const am = /^a:(-?\d+):(.+)$/.exec(id)
	if (am && key === 'label' && v) return withFloor(Number(am[1]), (f) => ({ ...f, areas: (f.areas ?? []).map((a) => (a.id === am[2] ? { ...a, label: v } : a)) }))
	const rm = /^r:(-?\d+):([A-D])$/.exec(id)
	if (rm && key === 'name') return withFloor(Number(rm[1]), (f) => { const names = setOpt(f.roomNames ?? {}, rm[2], v); return Object.keys(names).length ? { ...f, roomNames: names } : setOpt(f, 'roomNames', '') })
	return null
}
