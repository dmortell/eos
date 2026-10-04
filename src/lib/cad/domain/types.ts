// The cad tool's PROJECT DATA: typed entities with stable ids (ADR 0001). Drawings are generated from these; nothing
// here is a "shape with attributes". Drawing-side records (views, sheets, shapes, blocks, guides) are in ./drawing.ts
// and ./shapes.ts.
//
// Rules for this file:
//  - Every entity has `id` (nanoid, never prefix-encoded or derived from a name) and a literal `type`.
//  - References are by id. Labels are plain text stored ONCE (an outlet port's label lives on the outlet; a panel port
//    shows the label of the outlet port it is linked to) — ADR 0002.
//  - Geometry follows ./conventions.ts: plan mm, y down, z above the level's FFL, angles clockwise on screen.
//  - Field names are Firestore-stable: no nested arrays (graphs use arrays of objects), no `undefined` (omit instead).
//  - Persistence metadata (rev, updatedAt, updatedBy) is NOT here — see ADR 0003.
import type { Pt } from './conventions'
import type { TitleBlockTemplate } from './titleBlock'

export type Id = string
export type { Pt, Pt3 } from './conventions'

/** A port on an outlet or a device. `port` is 1-based; `face` only matters on devices with both faces wired. */
export interface PortRef { on: Id; port: number; face?: 'front' | 'rear' }

/** Low = under-floor / floor-level, high = ceiling-level. The `H` label token and the panel tier. */
export type Tier = 'low' | 'high'

// ── Places ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Building {
	type: 'building'; id: Id; name: string; order: number
	/** The Floor manager's settings: the floors the building has (lowest … top, without `skip`, e.g. no GF) and how
	 *  they're named (`{n}` / `{nn}`; basements without the minus). Levels are what exists; this is how they were set. */
	floors?: { lowest: number; top: number; skip?: number[]; above: string; below: string; ground?: string }
}

/** One storey. All heights in mm; z inside the level is measured from FFL (ADR 0004). */
export interface Level {
	type: 'level'
	id: Id
	buildingId: Id
	/** The floor number used in labels (F token) and doc names; negative = basement. */
	number: number
	name: string
	order: number
	/** FFL of this level above the building datum — stacks levels for risers and sections. */
	elevationMm: number
	/** Structure around FFL: slab top is at −raisedFloorMm, ceiling at clearHeightMm, slab above at clear + plenum. */
	heights: { slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }
	/** A separate PLAN of part of a floor (a tenant office: Journey's 33F has 3303 and 3307 in opposite corners, each
	 *  drawn on its own floorplan with its own coordinates). Same number and elevation as the floor; its own plan,
	 *  elevations and racks. Unset = the floor's main plan. */
	area?: string
}

/**
 * Any named area: tenant area, zone, room, server room, EPS. Generic on purpose (drawings-plan §1, "places are
 * generic"): nothing in the code branches on `kind` except display and pickers. `code` is the label token a space
 * contributes (zone letter 'A', server-room letter 'B').
 */
export interface Space {
	type: 'space'
	id: Id
	levelId: Id
	parentId?: Id
	kind: string
	name: string
	code?: string
	boundary?: Pt[]
	order: number
}

// ── Physical layout ───────────────────────────────────────────────────────────────────────────────────────────────
// Walls, containment runs, boxes and every other drawn item are `Shape`s (./shapes.ts, ADR 0007) — listed with the
// drawing entities because a shape can also belong to one view or a sheet.

/** A PDF page or image under a level's plan. The file lives in `files/{fileId}`; never a data URL. */
export interface Underlay {
	type: 'underlay'
	id: Id
	levelId: Id
	fileId: string
	page?: number
	/** Where the page's calibrated origin sits in the plan, and mm per page unit. Read from the file's calibration
	 *  unless overridden here. */
	origin?: Pt
	mmPerUnit?: number
	crop?: { x: number; y: number; w: number; h: number }
	rot?: number
	opacity?: number
}

// ── Outlets and ports ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An outlet = the Frames tool's LOCATION and the Outlets tool's OUTLET in one record (ADR 0001). It can exist before
 * it is drawn (entered in the grid), so `at` is optional. Labels are plain text (ADR 0002).
 */
export interface Outlet {
	type: 'outlet'
	id: Id
	levelId: Id
	/** The outlet's own label as printed on the faceplate / plan, e.g. "33-001" or "A.023". Unique per level
	 *  (validation, not the store). Renumber rewrites it and its ports' labels together. */
	label: string
	zoneId?: Id
	roomId?: Id
	tier: Tier
	/** Project-configured usage id (desk, AP, printer, TV …), see ProjectSettings.usages. */
	usage: string
	mount: 'floor' | 'wall' | 'box' | 'desk' | 'ceiling'
	at?: Pt
	z?: number
	rot?: number
	/** The wall shape a wall-mounted outlet sits on (it moves with the wall). */
	hostShapeId?: Id
	/** The block that draws it (a symbol, a block, or the user's own grouped shapes made into one); absent = the
	 *  default block for its usage / mount. */
	blockId?: Id
	/** Its layer when not the default (Outlets / Outlets high by tier) — domain/layers.ts. */
	layerId?: Id
	ports: OutletPort[]
	locked?: boolean
	notes?: string
}

export interface OutletPort {
	/** 1-based, contiguous. */
	port: number
	/** The port's label, e.g. "33-001.A" or "L01.A.023-B07". The ONE copy: panels show it through their link. */
	label: string
	/** The server room this port is cabled to — drives allocation (which panels may serve it). */
	serverRoomId?: Id
	cableType: string
}

// ── Racks, devices, panels ────────────────────────────────────────────────────────────────────────────────────────

export interface RackRow {
	type: 'rackRow'
	id: Id
	spaceId: Id
	name: string
	order: number
	containment?: 'none' | 'hac' | 'cac' | 'combined'
	defaults?: { heightU?: number; depthMm?: number; color?: string }
}

/** `at` = footprint centre; the FRONT is the local +y face (ADR 0004). */
export interface Rack {
	type: 'rack'
	id: Id
	levelId: Id
	/** The server room (or other space) the rack stands in. */
	spaceId: Id
	rowId?: Id
	order: number
	name: string
	kind: '2-post' | '4-post' | 'cabinet' | 'desk' | 'shelf' | 'vcm'
	heightU: number
	widthMm: number
	depthMm: number
	heightMm?: number
	at?: Pt
	rot?: number
	catalogId?: Id
	maker?: string
	model?: string
	/** Its layer when not the default (Racks) — domain/layers.ts. */
	layerId?: Id
	frontProtrusionMm?: number
	/** A cabinet's doors, drawn as swings on the plan (aisle clearance): single or split (two leaves) on the front /
	 *  rear; `hinge` = the side a single door hangs on, as seen standing at that face. */
	doors?: { front?: 'single' | 'split'; rear?: 'single' | 'split'; hinge?: 'left' | 'right' }
	color?: string
	notes?: string
	/** A designated PATCH FRAME: outlets are allocated to its panels. When a server room has any, only those take
	 *  outlets (equipment racks' panels — uplinks, ties — don't); with none, every rack's panels do. */
	patchFrame?: boolean
}

export type DeviceKind = 'panel' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'enclosure' | 'other'

export interface Device {
	type: 'device'
	id: Id
	rackId: Id
	name: string
	kind: DeviceKind
	/** Lowest U occupied, 1-based from the bottom of the rack. */
	u: number
	heightU: number
	face: 'front' | 'rear' | 'both' | 'none'
	portCount: number
	portType?: 'RJ45' | 'LC' | 'SC' | 'SFP'
	/** How ports are numbered on the face: row-major (panels: 1–24 top, 25–48 bottom) or column-major (switches: 1
	 *  above 2). Presentation only — the port number stays the identity (elevations-plan §3.3). */
	portNumbering?: 'row' | 'column'
	catalogId?: Id
	maker?: string
	model?: string
	widthMm?: number
	depthMm?: number
	offsetX?: number
	color?: string
	/** Patch panels only. */
	panel?: PanelInfo
	/** Labels for ports NOT linked to an outlet (ties, uplinks, switch ports), 1-based port → text. A port linked to an
	 *  outlet port shows that port's label instead, so the label exists once. */
	portLabels?: Record<string, string>
}

export interface PanelInfo {
	tier: Tier
	serverRoomId?: Id
	/** The outlet usages this panel takes (desk, AP, printer …). Unset = a general panel: any usage without a panel
	 *  of its own. Allocation puts an outlet on a panel of its usage first, then on a general panel. */
	usages?: string[]
	/** Ports held for a usage type before allocation (block reservations). */
	reservations?: { id: Id; usage: string; ports: number[]; note?: string }[]
	/** When the port labels were printed and stuck on. Editing or renumbering a label linked to this panel then asks
	 *  first (ADR 0002); the issued sheets record what was printed. */
	labelsPrintedAt?: number
	/** What was printed, by port number (non-empty labels only) — a later difference is flagged on the panel. */
	printedLabels?: Record<string, string>
}

// ── Cabling ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A permanent cable: panel rear port → outlet port (horizontal), panel ↔ panel (tie / backbone). Allocation IS the
 * set of links: an outlet port is allocated when a link reaches it.
 */
export interface Link {
	type: 'link'
	id: Id
	kind: 'horizontal' | 'tie' | 'backbone'
	/** The panel end. */
	a: PortRef
	/** The outlet port (horizontal) or the other panel port. */
	b: PortRef
	cableType?: string
	/** Hand-set length; otherwise derived from the route. */
	lengthM?: number
	/** The containment-shape segments the cable runs through, in order (set by routing or by hand). */
	route?: { shape: Id; seg: Id }[]
	/** A run the route must use — which riser a backbone takes (two risers for diversity). Routing still finds the
	 *  shortest way to and from it (Phase 5). */
	via?: Id
	/** Re-allocation never moves a pinned link. */
	pinned?: boolean
	status: 'design' | 'installed'
	notes?: string
}

/** A patch cord between two device ports in one room, with the install workflow from the Patching tool. */
export interface Cord {
	type: 'cord'
	id: Id
	kind: 'patch' | 'cross-connect'
	a: PortRef
	b: PortRef
	cableType: string
	colour: string
	lengthM: number
	lengthLocked: boolean
	status: 'add' | 'remove' | 'change' | 'installed'
	/** The endpoints and status before a re-patch / soft delete, so it can be reverted. */
	previous?: { a: PortRef; b: PortRef; status: Cord['status'] }
	cordId?: string
	notes?: string
}

// ── Project-wide settings (one doc) ───────────────────────────────────────────────────────────────────────────────

export interface ProjectSettings {
	type: 'settings'
	id: 'settings'
	/** How a new outlet's port labels are made from its label: "33-001" → 33-001.A / .B, or .1 / .2 (ADR 0002). */
	portSuffix: 'alpha' | 'numeric'
	/** Between the outlet label and the suffix: '.' (default) 201.A, '' 201A, '-' 201-A. */
	portSeparator?: '.' | '-' | ''
	/** The project's title-block template (Pages' model, domain/titleBlock.ts); absent = the default. */
	titleBlock?: TitleBlockTemplate
	/** What the legacy import said to check, kept for reference (right sidebar → Import notes). `id` = the item it's
	 *  about, when it still exists. */
	importNotes?: { at: number; notes: { id: Id; code: string; message: string; severity: 'error' | 'warning' }[] }
	/** Optional patterns ($lib/elevation/labelTemplate syntax) for Relabel (a later tool) and for new labels, e.g.
	 *  outlet `Z.NNN`, port `"L"FF.Z.NNN-SPP[-H]`. Absent = new labels come from "next number" only. */
	labelPatterns?: { outlet?: string; port?: string }
	/** Cable lengths (Phase 5): slack at the outlet (m, added to each routed length) and waste % (on BOM metres). */
	cable?: { slackM?: number; wastePct?: number }
	usages: { id: string; label: string; color: string }[]
	cableTypes: { id: string; label: string; media: 'copper' | 'fibre' | 'other'; color: string; diameterMm?: number }[]
	defaults: { outletCableType: string; cordCableType: string; cordColour: string; panelPorts: number }
}

// ── The union ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type DomainEntity =
	| Building | Level | Space
	| Underlay
	| Outlet | RackRow | Rack | Device
	| Link | Cord
	| ProjectSettings

export type DomainType = DomainEntity['type']
