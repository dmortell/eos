// DRAWING records: what is stored about drawings, as opposed to the project data they show (./types.ts). Plans,
// elevations, rack fronts, risers and schedules are GENERATED from the data by a ViewDef; only view configuration,
// per-viewport overrides and drawn shapes (./shapes.ts) are stored (ADR 0001).
import type { Id, Pt, DomainEntity } from './types'
import type { ElevFrame, ElevDir } from './conventions'
import type { Shape, ShapeCore } from './shapes'

/** What a view shows. Each kind has one generator; `params` are that generator's inputs. */
export type ViewDef =
	| ViewBase<'plan', { levelId: Id; spaceId?: Id }>
	| ViewBase<'wallElevation', { wallId: Id; segId: Id }>
	| ViewBase<'elevation', { levelId: Id; frame: ElevFrame; depth?: { near: number; far: number }; width?: { from: number; to: number } }>
	| ViewBase<'rackElevation', { rackIds: Id[]; face: 'front' | 'rear' }>
	| ViewBase<'riser', { buildingId: Id; fromLevel?: Id; toLevel?: Id }>
	| ViewBase<'schedule', { table: 'outlets' | 'patchList' | 'links' | 'bom' | 'drawings'; filter?: Record<string, string> }>

interface ViewBase<K extends string, P> {
	type: 'view'
	id: Id
	kind: K
	name: string
	params: P
	/** Entity types / categories shown (empty = the generator's default set). */
	show?: string[]
	/** Layers hidden in this view (layer visibility is per view and per user, never on the data — ADR 0003). */
	hiddenLayers?: Id[]
}

export type ViewKind = ViewDef['kind']

/** A drawing sheet: paper, title block and viewports. Shapes drawn on its paper are Shapes with `sheetId`. */
export interface Sheet {
	type: 'sheet'
	id: Id
	/** The place the sheet is filed under (a level, space or building id). */
	placeId?: Id
	number: string
	title: string
	order: number
	paper: { size: 'A0' | 'A1' | 'A2' | 'A3' | 'A4'; orientation: 'landscape' | 'portrait'; marginMm: number }
	/** This sheet's own title-block settings: hide it, or override auto fields (`drawn`, …). */
	titleBlock?: { hidden?: boolean; fields?: Record<string, string> }
	viewports: Viewport[]
	/** Issued revisions, oldest first (set by issuing, Phase 4.6); the last is the sheet's current revision. `hash` =
	 *  the fingerprint of what the sheet showed at that issue (a sheet is "changed" when it no longer matches). */
	revisions?: { code: string; date: string; note?: string; issueId?: Id; hash?: string }[]
	kind?: string
	discipline?: string
	tags?: string[]
	status: 'active' | 'archived'
}

/** What a pane or a viewport shows: the plan, a named elevation, or a server room's racks (front / rear). The same
 *  generators draw it in both (views/space.ts re-exports this). A sheet itself opens in a pane as `sheet`. */
export type ViewSpec =
	| { kind: 'plan' }
	| { kind: 'elevation'; dir: ElevDir }
	/** The racks of a server room (optionally one row) side by side, front or rear (Phase 3, views/rackRow.ts). */
	| { kind: 'row'; spaceId: Id; rowId?: Id; face: 'front' | 'rear' }
	/** A drawing sheet's paper (Phase 4, views/sheet.ts). */
	| { kind: 'sheet'; sheetId: Id }
	/** The building's risers and backbone, every floor (Phase 5.5, views/riser.ts). */
	| { kind: 'riser' }
	/** A section through a level along a cut line drawn on its plan (Phase 6.2, views/section.ts). */
	| { kind: 'section'; sectionId: Id }

/** A window on a sheet onto one view, at a true scale. */
export interface Viewport {
	id: Id
	/** The level and the view drawn in it (plan / elevation / rack row — not another sheet). The view lives on the
	 *  viewport itself: ViewDef records come back if one view ever needs to be shared by several sheets. */
	view: { levelId: Id; spec: Exclude<ViewSpec, { kind: 'sheet' }> }
	/** Paper mm, from the sheet's top-left. */
	rect: { x: number; y: number; w: number; h: number }
	/** 1:N. */
	scale: number
	/** The view point (in the view's own drawing space) at the viewport centre. */
	centre: Pt
	label?: string
	locked?: boolean
	border?: boolean
	/** Per-viewport tweaks to generated content, keyed by entity id: hide it, nudge its label. */
	overrides?: Record<string, { hidden?: boolean; labelOffset?: Pt }>
}

/** Layers organise shapes. Visibility is NOT stored here (it is per view — ViewDef.hiddenLayers — and per user). */
export interface Layer {
	type: 'layer'
	id: Id
	name: string
	color?: string
	weightMm?: number
	dash?: string
	order: number
}

/** Shapes with the same `groupId` select and move together. Groups nest through `parentId`. */
export interface Group {
	type: 'group'
	id: Id
	name?: string
	parentId?: Id
}

/**
 * A block = a named list of ordinary shapes in local mm (origin = the insertion point), placed by an `insert` shape.
 * Inserted LINKED, every insert follows edits to the definition; inserted COPIED, the shapes are dropped into the
 * drawing as a group and edited freely. "Make block from selection" turns grouped shapes into one. Outlet graphics are
 * any block (symbol, block or the user's own grouped shapes); text shapes in a block can show `{LABEL}`-style
 * attributes filled from the insert (or from the outlet it draws).
 */
export interface BlockDef {
	type: 'block'
	id: Id
	name: string
	/** Blocks are GLOBAL (Dave, 2026-10-02: no per-project blocks): built-ins in code, the rest in `settings/cadBlocks`. */
	scope: 'global'
	category?: string
	shapes: Omit<ShapeCore, 'type' | 'groupId'>[]
	attrs?: { tag: string; label: string; default?: string }[]
}

/** An ISSUE = one package that went out (Phase 4.6): the sheets at the revisions they went at (bumped if changed
 *  since their last issue, else as last issued, so a package mixes revisions), and the package PDF in file storage.
 *  What each (sheet, rev) showed is frozen in `cadIssued` (app/issue.ts), outside the entity store. */
export interface Issue {
	type: 'issue'
	id: Id
	name: string
	/** "For construction" … */
	purpose: string
	/** YYYY-MM-DD. */
	date: string
	to?: string
	note?: string
	sheets: { sheetId: Id; number: string; title: string; rev: string; size: string; changed: boolean }[]
	/** The package PDF in file storage (`files/{id}`, listed in Uploads). */
	file?: { id: string; url: string; name: string }
}

/** A SECTION (Phase 6.2): a cut line `a → b` on a level's plan. The view stands on the line and looks to its LEFT
 *  as drawn on the sheet (a → b left to right looks up the sheet, like the Front elevation); `flip` looks the other
 *  way. It shows what lies within `depth` mm beyond the cut, between the line's ends. */
export interface SectionCut {
	type: 'section'
	id: Id
	levelId: Id
	name: string
	a: Pt
	b: Pt
	depth: number
	flip?: boolean
}

export type DrawingEntity = ViewDef | Sheet | Shape | Layer | Group | BlockDef | Issue | SectionCut
export type Entity = DomainEntity | DrawingEntity
export type EntityType = Entity['type']
