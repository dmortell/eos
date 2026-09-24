// Mock data for the Pages tool (R10): the demo drawing tree, command-palette entries, the top-bar
// drawing-set selectors and the per-node property fields — all seed data that a Firestore backend (§12)
// will replace. Kept in one folder so that swap touches this file, not six components.

/** A drawing/view kind that opens as a canvas tab. */
export type NavKind = 'plan' | 'sheet' | 'elevation'

/** A node in the location hierarchy (Building › Floor › Zone › Room › Row) with drawing leaves. */
export type NavNode = { id: string; label: string; folder?: string; drawing?: NavKind; children?: NavNode[]
	/** The floor this node belongs to, as the model / tab name ('33F') — for the real tree (projectTree.ts);
	 *  the mock tree derives it from the floor row's label. */
	floor?: string
	/** A floor row: its number and its explicit building (FloorConfig.building). */
	floorNumber?: number; building?: string
	/** A drawing leaf: the stable drawing id to open it under (B18), e.g. `drawing:<registry id>`. */
	docId?: string
	/** A small trailing note (e.g. a row's rack count). */
	meta?: string
	/** Pages places: the floor whose model this row opens ('33F'), or null = it opens none. Absent = the old
	 *  rule (a 'floor' folder opens its floor). */
	modelFloor?: string | null
	/** Pages places: this row is a PLACE (editable / draggable in the navigator). */
	place?: boolean }

/** The project sits above the tree as a label (click → project props). */
export const NAV_PROJECT = { id: 'project', label: 'Project Journey', kind: 'project' }

/** B18: the navigator node id of a drawing, looked up by its label (the Ctrl-K palette only has titles);
 *  undefined when the drawing isn't in the tree. */
export function navDrawingId(label: string, nodes: NavNode[] = NAV_TREE): string | undefined {
	for (const n of nodes) {
		if (n.drawing && n.label === label) return n.id
		const hit = n.children ? navDrawingId(label, n.children) : undefined
		if (hit) return hit
	}
	return undefined
}

export const NAV_TREE: NavNode[] = [
	{ id: 'b-hibiya', label: 'Hibiya Midtown', folder: 'building', children: [
		{ id: 'f33', label: '33F', folder: 'floor', children: [
			{ id: 'f33-plan', label: '33F — Floorplan', drawing: 'plan' },
			{ id: 'f33-hlo', label: '33F — High Level Outlets', drawing: 'sheet' },
			{ id: 'f33-llo', label: '33F — Low Level Outlets', drawing: 'sheet' },
			{ id: 'f33-tr', label: '33F — Trunk Routes', drawing: 'sheet' },
			{ id: 'z3303', label: 'Zone 3303', folder: 'zone', children: [
				{ id: 'z3303-out', label: 'Zone 3303 — Outlets', drawing: 'sheet' },
				{ id: 'idf1', label: 'IDF1', folder: 'room', children: [
					{ id: 'idf1-elev', label: 'IDF1 — Rack Elevation', drawing: 'elevation' },
					{ id: 'idf1-ra', label: 'Row A', folder: 'row' },
					{ id: 'idf1-rb', label: 'Row B', folder: 'row' },
				] },
				{ id: 'idf2', label: 'IDF2', folder: 'room', children: [
					{ id: 'idf2-ra', label: 'Row A', folder: 'row' },
					{ id: 'idf2-rb', label: 'Row B', folder: 'row' },
				] },
			] },
			{ id: 'z3307', label: 'Zone 3307', folder: 'zone', children: [
				{ id: 'z3307-idf1', label: 'IDF1', folder: 'room', children: [
					{ id: 'z3307-ra', label: 'Row A', folder: 'row' },
				] },
			] },
		] },
		{ id: 'f30', label: '30F', folder: 'floor', children: [
			{ id: 'z3001', label: 'Zone 3001', folder: 'zone', children: [
				{ id: 'z3001-ra', label: 'Row A', folder: 'row' },
			] },
		] },
	] },
	{ id: 'b-shinmaru', label: 'Shinmaru', folder: 'building', children: [
		{ id: 'f18', label: '18F', folder: 'floor', children: [
			{ id: 'o1201', label: 'Office 1201', folder: 'zone', children: [
				{ id: 'o1201-ra', label: 'Row A', folder: 'row' },
			] },
		] },
	] },
]

// ── top-bar drawing-set selectors ──────────────────────────────────────────
export const PACKAGES = ['Concept Design', 'Schematic Design', 'Detailed Design', 'Shop Drawings', 'As Built']
export const VERSIONS = ['v3', 'v2', 'v1']
export const REVISIONS = ['A', 'B', 'C', 'D']

// ── Ctrl-K command palette ─────────────────────────────────────────────────
export type PItem = { title: string; kind: 'plan' | 'sheet' | 'elevation' | 'place'; path?: string }
export const PALETTE_ITEMS: PItem[] = [
	{ title: '33F — Floorplan', kind: 'plan', path: 'Hibiya · 33F' },
	{ title: '33F — High Level Outlets', kind: 'sheet', path: 'Hibiya · 33F' },
	{ title: '33F — Low Level Outlets', kind: 'sheet', path: 'Hibiya · 33F' },
	{ title: '33F — Trunk Routes', kind: 'sheet', path: 'Hibiya · 33F' },
	{ title: 'Zone 3303 — Outlets', kind: 'sheet', path: 'Hibiya · 33F · Zone 3303' },
	{ title: 'IDF1 — Rack Elevation', kind: 'elevation', path: 'Hibiya · 33F · Zone 3303' },
	{ title: 'Zone 3303', kind: 'place', path: 'Hibiya · 33F' },
	{ title: 'IDF1', kind: 'place', path: 'Hibiya · 33F · Zone 3303' },
	{ title: '30F — Floorplan', kind: 'plan', path: 'Hibiya · 30F' },
	{ title: 'Office 1201 — Outlets', kind: 'sheet', path: 'Shinmaru · 18F' },
]

// ── Properties panel: mock fields per tree-node kind (label → placeholder) ──
export const NODE_FIELDS: Record<string, [string, string][]> = {
	project: [['Client', 'Journey K.K.'], ['Number', 'EOS-2314'], ['Address', 'Chiyoda, Tokyo'], ['Discipline', 'ICT / Structured Cabling']],
	building: [['Address', '—'], ['Floors', '—']],
	floor: [['Level', '—'], ['Elevation (mm)', '0']],
	zone: [['Type', 'Office'], ['Server room', 'IDF1']],
	room: [['Type', 'IDF'], ['Racks', '2']],
	row: [['Racks', '4']],
}
