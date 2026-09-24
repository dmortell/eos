// The Pages PERSISTED schema (drawings-plan.md §2) — the shapes written to Firestore. Pure types; the
// mappers (./mappers.ts) convert between these and the in-memory editor state, and the store
// (./pagesStore.svelte.ts) reads / writes them.
//
//   projects/{pid}                      → `pages: PagesProject`   (places, title block, settings)
//   projects/{pid}/drawings/{id}        → PagesSheetDoc           (a registry entry + the sheet's content)
//   projects/{pid}/models/{id}          → ModelDoc                (one model per doc)
//
// Field names are Firestore-stable: rename only with a migration (see 3dview/migrate.ts `ents` → `shapes`).
import type { Model, ModelId, Clip, Dir } from '../3dview/types'
import type { View } from '../ui/geometry'
import type { PaperSize } from '../constants'
import type { ToolType } from '$lib/types/versioning'

// ── places (drawings-plan §2.1) ──────────────────────────────────────────────────────────────────────
/** A node of the place tree. GENERIC: every node is the same object apart from its name — `kind` only picks
 *  an icon, nothing else in the code may depend on it, and the user can nest nodes any way they like. */
export type Place = {
	id: string
	name: string
	/** null = a top-level node. */
	parentId: string | null
	/** Sort position among its siblings (manual drag order). */
	order: number
	/** Display hint only (icon): 'building' | 'floor' | 'zone' | 'room' | 'row' | anything the user types. */
	kind?: string
	/** Where a SEEDED node came from in the old tools' data, so imports (outlets, racks, risers) can find
	 *  their place. Never used for display or tree logic. */
	legacy?: { floor?: number; area?: string; room?: string; row?: string }
	/** A BUILDING's floor stack (basement → roof, like the project's `buildingFloors`): every floor from `bottom`
	 *  to `top` exists except `skipped` (no 4F / 13F …) and 0. Drives its building model's storeys. */
	floors?: { bottom: number; top: number; skipped?: number[] }
}

export type PagesSettings = { paperSize?: PaperSize; landscape?: boolean; scale?: string; marginMm?: number; tags?: string[] }

/** The per-project title block (drawings-plan §2.1) — defined in ../titleBlock.ts. */
export type { TitleBlockTemplate } from '../titleBlock'
import type { TitleBlockTemplate } from '../titleBlock'
import type { DrawingDefaults } from '../ui/drawingDefaults'

/** `projects/{pid}.pages` */
export type PagesProject = {
	places: Place[]
	titleBlock?: TitleBlockTemplate
	settings?: PagesSettings
	/** D10: the style new shapes start with (ui/drawingDefaults.ts; unset fields are '' / 0 — merge-saved). */
	drawingDefaults?: DrawingDefaults
	/** ISO time the places were seeded from the old tools' data (absent = never seeded). */
	seededAt?: string
}

// ── sheets (drawings-plan §2.2) ──────────────────────────────────────────────────────────────────────
export type SheetPaper = { size: PaperSize; landscape: boolean; marginMm?: number }

/** A viewport frame as STORED: geometry in paper MM (the editor works in paper px), plus the per-frame view
 *  state the editor keeps in viewState today (pan/zoom, orbit). */
export type SheetFrameDoc = {
	id: string
	/** Sequence number — the printable default label ("1", "2", …). */
	seq: number
	/** Optional user label; the printed title falls back to `seq`. */
	label?: string
	x: number; y: number; w: number; h: number
	modelId?: ModelId
	direction: Dir
	scale: string
	clip: Clip | null
	view?: View
	yaw?: number; pitch?: number
	frozen?: string[]
	locked?: boolean
	border: 'dashed' | 'solid' | 'none'
	/** An imported frame's unmapped Sheets source (types.ts SheetFrame.source). */
	source?: string
	/** The storeys a building elevation shows (types.ts SheetFrame.storeys). */
	storeys?: string[]
	/** A fill-rate frame: the conduit whose cross-section it shows (types.ts SheetFrame.fillOf). */
	fillOf?: string
	/** Hidden-line removal / black-and-white / a plan's cut band (types.ts SheetFrame). */
	hideHidden?: boolean; mono?: boolean; zBand?: { z0: number; z1: number }
}

/** B5: where a link sheet goes — `/projects/{pid}/{tool}?floor=…&room=…`. */
export type SheetLink = { tool: 'elevations' | 'patching' | 'outlets' | 'risers'; floor?: number; room?: string }
export const LINK_TOOLS: Record<SheetLink['tool'], string> = { elevations: 'Elevations', patching: 'Patching', outlets: 'Outlets', risers: 'Risers' }
export function sheetLinkUrl(pid: string, l: SheetLink): string {
	const q = new URLSearchParams(); if (l.floor != null) q.set('floor', String(l.floor)); if (l.room) q.set('room', l.room)
	return `/projects/${pid}/${l.tool}${q.size ? `?${q}` : ''}`
}
export type SheetKind = 'plan' | 'elevation' | 'schematic' | 'detail' | 'schedule'

/** A Pages sheet: a `projects/{pid}/drawings/{id}` registry entry (`toolType: 'pages'`) with its content on
 *  it (Option A). The registry fields match `$lib/types/versioning` DrawingDoc so the existing packages /
 *  publish code can list it. */
export type PagesSheetDoc = {
	id: string
	projectId: string
	toolType: Extract<ToolType, 'pages'>
	title: string
	/** Editable, starts empty, NOT a key; duplicates are allowed. */
	drawingNumber: string
	status: 'active' | 'archived'
	/** Manual drag order within its place. */
	sortOrder: number
	/** The sheet's one place (filing only); null = project level. */
	placeId: string | null
	tags: string[]
	kind?: SheetKind
	discipline?: string
	sheetSize?: string
	scale?: string
	latestRevisionCode?: string
	/** Phase 7: when the latest revision was issued (the title block's date) and the sheet's content hash then
	 *  (store/versions.ts sheetHash) — differs → "edited since the last issue". */
	latestIssuedAt?: string
	issuedHash?: string
	/** Phase 8: imported from — `sheets/<id>` (a Sheets-tool sheet) or `drawings/<id>` (another tool's view). */
	importedFrom?: string
	/** "Drawn" in the title block (initials); empty → the creator's initials. */
	drawnBy?: string
	/** B5: a LINK sheet — a register row that opens another tool (Elevations / Patching / Outlets / Risers) at a
	 *  floor / room instead of a Pages page; printed as a placeholder page. */
	link?: SheetLink
	/** A4 / B6: the sheet's revisions, oldest first, as the title block's revision table shows them (kept in step
	 *  with the `revisions` sub-collection when issuing / editing / deleting). */
	revLog?: { code: string; date: string; note?: string; /** the registry version (`v<n>`) it froze — overwrite rewrites this one */ v?: number }[]
	/** This sheet shows no title block (the drawing area takes the full paper). */
	hideTitleBlock?: boolean
	currentVersionNumber: number
	/** Registry compatibility: the versioning code expects both. A Pages sheet points at itself. */
	sourceDocId: string
	viewPreset: { name: string; layers: Record<string, boolean | string> }
	createdAt: string; createdBy: string; updatedAt: string
	// content
	paper: SheetPaper
	frames: SheetFrameDoc[]
}

// ── models (drawings-plan §2.3) ──────────────────────────────────────────────────────────────────────
/** `projects/{pid}/models/{id}` — the in-memory Model plus a save stamp. */
export type ModelDoc = Model & { updatedAt?: string }
