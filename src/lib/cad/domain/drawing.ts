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
}

export type ViewKind = ViewDef['kind']

/** A drawing sheet: paper, title block and viewports. Shapes drawn on its paper are Shapes with `sheetId`. */
/** One change to a sheet: what changed, when, and who asked for it. */
export type SheetChange = { id: Id; date: string; text: string; asked?: string }

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
	/** `note` = the issue's purpose; `desc` = what changed in this revision (the title block shows it, else the note);
	 *  `by` = who issued it (initials); `changes` = the change notes it went out with (moved from `changes` below). */
	revisions?: { code: string; date: string; note?: string; desc?: string; by?: string; issueId?: Id; hash?: string; changes?: SheetChange[] }[]
	/** What has changed since its last issue (change history, backlog T102): noted in Sheet Properties between issues;
	 *  issuing a new revision moves them onto it (its "what changed" defaults to them). */
	changes?: SheetChange[]
	kind?: string
	discipline?: string
	tags?: string[]
	status: 'active' | 'archived'
	/** How this sheet draws (Dave 2026-10-12: a per-sheet setting, not the project's; absent = the project's old
	 *  setting, so sheets made before print as they did): floorplans black and white, outlets in their usage's
	 *  color or their layer's, cords in rack views along the cable channels or straight. */
	gray?: boolean
	outletColour?: 'usage' | 'layer'
	cordRoute?: 'channels' | 'straight'
	/** Brought in from a Sheets-tool sheet (`sheets:<sheetId>`, File › Import legacy drawings): importing it again skips it. */
	importedFrom?: string
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
	/** The building's risers and backbone, every floor (Phase 5.5, views/riser.ts); `hideEmpty` = floors with no server
	 *  room squeezed into break bands (Dave: like the Midtown risers). */
	| { kind: 'riser'; hideEmpty?: boolean }
	/** A section through a level along a cut line drawn on its plan (Phase 6.2, views/section.ts). */
	| { kind: 'section'; sectionId: Id }
	/** A port map of chosen panels / switches (port-map-plan.md, views/portMap.ts): each drawn like its faceplate, every
	 *  port with its number and the item at its far end — for network engineers assigning VLANs. Paper mm at 1:1. */
	| { kind: 'portmap'; deviceIds: Id[] }
	/** A rack's patch panels (a "frame", in the old Frames tool), or one device, each a grid of its ports with their
	 *  labels, as the printed panel sheets draw them (views/panelSheets.ts). Paper mm at 1:1. */
	| { kind: 'ports'; rackId: Id; deviceId?: Id }
	/** A table drawn on paper (views/schedule.ts): the patch schedule of a server room (none = every room), from cord
	 *  `start` (1-based; a long schedule goes on over several viewports). Paper mm at 1:1. */
	| { kind: 'schedule'; table: 'patch'; spaceId?: Id; start?: number; /** carries on from where this viewport (of the same sheet) stops; wins over `start` */ after?: Id }
	/** A run segment's section with its cables packed in, its fill % and its cables (views/fillSection.ts). Paper mm
	 *  at 1:1, the section at a true scale. */
	| { kind: 'fill'; shapeId: Id; segId: Id }

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
	/** Layers frozen (hidden) in this viewport — stored, so it prints the same for everyone (docs/plan/layers.md). */
	frozen?: Id[]
}

/** A project layer, or a restyle of a system layer (same id, `sys:…`; domain/layers.ts). Show / lock are NOT stored
 *  here: they're per user (the workspace); a viewport's freeze is on the viewport. */
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
	/** Deleted from the library: hidden from pickers, but inserts / outlets already using it keep drawing it. */
	retired?: boolean
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
	/** The issue's number (1, 2, 3 …; editable) — in the Issues list, the transmittal and the PDF's name. Issues from
	 *  before numbers count in date order (`issueNumbers`). */
	number?: number
	/** The package PDF in file storage (`files/{id}`, listed in Uploads). */
	file?: { id: string; url: string; name: string }
	/** The PACKAGE it was issued from (sheets-organising §3) — the next issue of that package diffs against this one. */
	packageId?: Id
	/** Sheets in the package's last issue that aren't in this one (archived or taken out) — listed on the transmittal. */
	withdrawn?: { sheetId: Id; number: string; title: string; rev: string }[]
	/** How many cover pages (a transmittal) open its PDF — frozen with it, so a reprint shows them as issued. */
	cover?: number
	/** The whole-project backup made with it (`cadBackups/{id}`, ADR 0008 §7), when "Back up the project with this
	 *  issue" was ticked — the Issues list can then restore it. */
	backupId?: Id
}

/** A PACKAGE (sheets-organising §3): a named, re-usable set of sheets issued again and again ("Tender set", "IDF1
 *  rack elevations") — either a LIST (sheet ids in its own order) or a RULE (a saved filter: new sheets that match
 *  join by themselves; archived sheets never do). An issue records which package it came from. */
export interface SheetPackage {
	type: 'package'
	id: Id
	name: string
	/** The default purpose of its issues ("For construction" …). */
	purpose?: string
	/** Who gets it (Dave D8): printed on the cover page and the transmittal. */
	recipients?: { name: string; org?: string }[]
	note?: string
	/** Exactly one of these: a list in the package's order, or a rule. */
	sheetIds?: Id[]
	rule?: SheetRule
	/** Its place in the Packages list. */
	order: number
	archived?: boolean
}
/** A package's rule: categories (ids), levels, rooms, tags, disciplines — any value within a field, every field set.
 *  Ids, not names, so renaming a level or a category doesn't break it. */
export interface SheetRule { kinds?: string[]; levelIds?: Id[]; spaceIds?: Id[]; tags?: string[]; disciplines?: string[] }

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
	/** Made for a Sheets-tool elevation's clip box (`sheets:<sheetId>:<viewportId>`, File › Import legacy drawings):
	 *  importing that sheet again uses this section instead of cutting another. */
	importedFrom?: string
}

export type DrawingEntity = ViewDef | Sheet | Shape | Layer | Group | BlockDef | Issue | SheetPackage | SectionCut
export type Entity = DomainEntity | DrawingEntity
export type EntityType = Entity['type']
