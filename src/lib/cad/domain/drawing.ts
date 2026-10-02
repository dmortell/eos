// DRAWING records: what is stored about drawings, as opposed to the project data they show (./types.ts). Plans,
// elevations, rack fronts, risers and schedules are GENERATED from the data by a ViewDef; only view configuration,
// per-viewport overrides and drawn shapes (./shapes.ts) are stored (ADR 0001).
import type { Id, Pt, DomainEntity } from './types'
import type { ElevFrame } from './conventions'
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
	titleBlock?: { hidden?: boolean; fields?: Record<string, string> }
	viewports: Viewport[]
	kind?: string
	discipline?: string
	tags?: string[]
	status: 'active' | 'archived'
}

/** A window on a sheet onto one view, at a true scale. */
export interface Viewport {
	id: Id
	viewId: Id
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

export type DrawingEntity = ViewDef | Sheet | Shape | Layer | Group | BlockDef
export type Entity = DomainEntity | DrawingEntity
export type EntityType = Entity['type']
