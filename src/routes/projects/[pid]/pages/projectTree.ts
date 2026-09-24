// The PROJECT TREE from real Firestore data (see docs/firestore-structure.md) — Project › Building › Floor ›
// Area (tenant zone) › Server room › Row, with the project's registered drawings hung where their
// `sourceDocId` points. Pure: the loader (projectData.svelte.ts) gathers the docs, this shapes the tree.
//
// Firestore has NO building entity, so Pages adds two optional project fields: `buildings: string[]` (the
// building names in tree order, including empty ones — "New building") and `FloorConfig.building` (the
// building a floor was dragged into / typed in its Properties). A floor's building is, in order:
//   1. its explicit `building`;
//   2. inside any riser doc's fromFloor..toFloor range → the project's own building (its address / name);
//   3. anything else → "Other building".
import type { NavNode, NavKind } from './mock/data'

export type FloorArea = { id: string; label: string; legacy?: boolean; primary?: boolean }
export type FloorConfig = { number: number; serverRoomCount?: number; roomNames?: Record<string, string>; label?: string; areas?: FloorArea[]; building?: string }
export type ProjectDoc = { id: string; name?: string; address?: string; client?: string; floors?: FloorConfig[] | number[]
	/** Pages: building names in tree order (incl. empty ones). */ buildings?: string[] }
export type RackDoc = { rows?: { id: string; label?: string }[]; racks?: { rowId?: string }[] }
export type RiserDoc = { id: string; name?: string; fromFloor?: number; toFloor?: number }
export type DrawingDoc = { id: string; toolType?: string; title?: string; sourceDocId?: string; status?: string; sortOrder?: number; drawingNumber?: string }
export type TreeInput = { project: ProjectDoc; racks: Record<string, RackDoc | undefined>; risers: RiserDoc[]; drawings: DrawingDoc[] }

export const OTHER_BUILDING = 'Other building'
const ROOMS = ['A', 'B', 'C', 'D']
/** `F33` / `F-1` — the floor part of every per-floor doc id (floor.ts floorDocId). */
export const floorKey = (n: number) => `F${String(n).padStart(2, '0')}`
/** The model / tab name of a floor ('33F') — the same key the floor model registry uses. */
export const floorName = (n: number) => `${n}F`
export const racksDocId = (pid: string, n: number, room: string) => `${pid}_${floorKey(n)}_R${room}`

/** Legacy `floors: number[]` → FloorConfig[] (lib/utils/floor.ts migrateFloors). */
export function normFloors(floors: ProjectDoc['floors']): FloorConfig[] {
	return (floors ?? []).map((f) => (typeof f === 'number' ? { number: f, serverRoomCount: 1 } : f))
}

/** Where a registry drawing belongs: parsed from `sourceDocId` = `{pid}_F{NN}[__{area}][_R{X}]`; null floor =
 *  project level (`{pid}` / `{pid}_{pageId}`). */
export function drawingPlace(pid: string, sourceDocId: string | undefined): { floor: number | null; area?: string; room?: string } {
	const m = sourceDocId && sourceDocId.startsWith(pid + '_') ? /^_F(-?\d+)(?:__([^_]+))?(?:_R([A-D]))?$/.exec(sourceDocId.slice(pid.length)) : null
	return m ? { floor: Number(m[1]), area: m[2], room: m[3] } : { floor: null }
}

/** The navigator kind a registry drawing opens as. */
export function drawingKind(toolType: string | undefined): NavKind {
	return toolType === 'racks' || toolType === 'risers' ? 'elevation' : toolType === 'outlets' || toolType === 'survey' ? 'plan' : 'sheet'
}

/** The building a floor sits in (see the header). */
export function buildingOf(f: FloorConfig, risers: RiserDoc[], home: string): string {
	if (f.building?.trim()) return f.building.trim()
	return risers.some((r) => r.fromFloor != null && r.toFloor != null && f.number >= Math.min(r.fromFloor, r.toFloor) && f.number <= Math.max(r.fromFloor, r.toFloor)) ? home : OTHER_BUILDING
}

export const drawingLeaf = (d: DrawingDoc): NavNode => ({ id: `d:${d.id}`, label: d.title || d.drawingNumber || d.id, drawing: drawingKind(d.toolType), docId: `drawing:${d.id}` })
const byOrder = (a: DrawingDoc, b: DrawingDoc) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.title ?? '').localeCompare(b.title ?? '')

/** A node by id (or a drawing leaf by its `docId`) with its ancestor chain, root first; null if absent. */
export function findNodePath(tree: NavNode[], match: { id?: string; docId?: string }): { node: NavNode; ancestors: NavNode[] } | null {
	const walk = (ns: NavNode[], up: NavNode[]): { node: NavNode; ancestors: NavNode[] } | null => {
		for (const n of ns) {
			if ((match.id && n.id === match.id) || (match.docId && n.drawing && n.docId === match.docId)) return { node: n, ancestors: up }
			const hit = n.children ? walk(n.children, [...up, n]) : null
			if (hit) return hit
		}
		return null
	}
	return walk(tree, [])
}

/** Build the navigator tree. Returns the project label + the top-level nodes (buildings, then project-level
 *  drawings and anything the registry points at that isn't a known floor). */
export function buildProjectTree({ project, racks, risers, drawings }: TreeInput): { project: { id: string; label: string }; tree: NavNode[] } {
	const pid = project.id
	const home = project.address?.trim() || project.name?.trim() || 'Building'
	const floors = normFloors(project.floors).slice().sort((a, b) => b.number - a.number)   // top floor first
	const live = drawings.filter((d) => d.status !== 'archived').sort(byOrder)
	const known = new Set(floors.map((f) => f.number))
	const placed = live.map((d) => ({ d, p: drawingPlace(pid, d.sourceDocId) }))

	const floorNode = (f: FloorConfig): NavNode => {
		const here = placed.filter((x) => x.p.floor === f.number)
		const areas = f.areas ?? []
		const legacy = areas.find((a) => a.legacy) ?? areas[0]
		// area drawings: explicit `__{area}` ids, plus the floor's unsuffixed OUTLETS docs → the legacy area
		const inArea = (a: FloorArea) => here.filter((x) => x.p.area === a.id || (!x.p.area && !x.p.room && a === legacy && x.d.toolType === 'outlets'))
		const areaNodes: NavNode[] = areas.map((a) => ({
			id: `a:${f.number}:${a.id}`, label: `Zone ${a.label}`, folder: 'zone', floor: floorName(f.number),
			children: inArea(a).map((x) => drawingLeaf(x.d)),
		}))
		const roomNodes: NavNode[] = ROOMS.slice(0, Math.max(1, Math.min(4, f.serverRoomCount ?? 1))).map((r) => {
			const doc = racks[racksDocId(pid, f.number, r)]
			const rows: NavNode[] = (doc?.rows ?? []).map((row) => {
				const n = (doc?.racks ?? []).filter((k) => k.rowId === row.id).length
				return { id: `row:${f.number}:${r}:${row.id}`, label: row.label || 'Row', folder: 'row', meta: n ? `${n} rack${n === 1 ? '' : 's'}` : undefined }
			})
			const roomDrawings = here.filter((x) => x.p.room === r).map((x) => drawingLeaf(x.d))
			return { id: `r:${f.number}:${r}`, label: f.roomNames?.[r] || `Room ${r}`, folder: 'room', floor: floorName(f.number), children: [...roomDrawings, ...rows] }
		})
		const floorDrawings = here.filter((x) => !x.p.room && !x.p.area && !(legacy && x.d.toolType === 'outlets')).map((x) => drawingLeaf(x.d))
		return {
			id: `f:${f.number}`, label: f.label ? `${floorName(f.number)} — ${f.label}` : floorName(f.number), folder: 'floor',
			floor: floorName(f.number), floorNumber: f.number, building: f.building,
			children: [...floorDrawings, ...areaNodes, ...roomNodes],
		}
	}

	// buildings: the saved `buildings` order first (empty ones too), then any others — the project's own
	// building before the rest, "Other building" last
	const groups = new Map<string, FloorConfig[]>()
	for (const b of project.buildings ?? []) if (b?.trim()) groups.set(b.trim(), [])
	for (const f of floors) { const b = buildingOf(f, risers, home); groups.set(b, [...(groups.get(b) ?? []), f]) }
	const listed = (project.buildings ?? []).map((b) => b.trim()).filter(Boolean)
	const rest = [...groups.keys()].filter((b) => !listed.includes(b))
		.sort((a, b) => (a === home ? -1 : b === home ? 1 : a === OTHER_BUILDING ? 1 : b === OTHER_BUILDING ? -1 : 0))
	const order = [...new Set([...listed, ...rest])]
	const tree: NavNode[] = order.map((b) => {
		const fs = groups.get(b)!
		const riserLeaves: NavNode[] = risers
			.filter((r) => fs.some((f) => r.fromFloor != null && r.toFloor != null && f.number >= Math.min(r.fromFloor, r.toFloor) && f.number <= Math.max(r.fromFloor, r.toFloor)))
			.map((r) => ({ id: `riser:${r.id}`, label: r.name || 'Risers', drawing: 'elevation' as NavKind, docId: `riser:${r.id}` }))
		return { id: `b:${b}`, label: b, folder: 'building', building: b, meta: fs.length ? undefined : 'drag floors here', children: [...riserLeaves, ...fs.map(floorNode)] }
	})

	const projectLevel = placed.filter((x) => x.p.floor === null).map((x) => drawingLeaf(x.d))
	if (projectLevel.length) tree.push({ id: 'g:project', label: 'Project drawings', folder: 'group', children: projectLevel })
	const orphan = placed.filter((x) => x.p.floor !== null && !known.has(x.p.floor))
	if (orphan.length) tree.push({ id: 'g:orphan', label: 'Other floors (not in the project)', folder: 'group', children: orphan.map((x) => ({ ...drawingLeaf(x.d), label: `${drawingLeaf(x.d).label}` })) })
	return { project: { id: pid, label: project.name || pid }, tree }
}
