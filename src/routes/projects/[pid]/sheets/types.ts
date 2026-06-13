import type { PrintSettings, Point } from '$lib/ui/print/types'

/**
 * A sheet = one sheet of paper (default A3 landscape) with a title block and a set of
 * viewports. One Firestore doc per sheet at `projects/{pid}/sheets/{sheetId}`; viewports
 * are embedded as an array (tool *content* is referenced by id, not copied).
 */
export interface SheetDoc {
	id: string
	projectId: string
	title: string                          // shown in the list + title block
	drawingNumber?: string
	sortOrder: number
	paper: PrintSettings                   // paper size / orientation / margins / scale
	titleBlock?: TitleBlockConfig | null   // null = hidden, undefined = default
	viewports: SheetViewport[]
	revisions?: SheetRevision[]
	currentRevision?: string               // revision code shown in the title block
	/**
	 * A "file" sheet: a list entry that links to another tool (Patching, Frames, …) instead of the
	 * sheet editor. Clicking the row opens that tool, where the user exports to Excel/PDF manually.
	 * In a package it's a reminder placeholder (no viewports). Undefined = a normal drawing sheet.
	 */
	link?: ExternalLink
	updatedAt?: number
	updatedBy?: string
}

/** A "file" sheet's link target — a tool route within this project. */
export interface ExternalLink {
	tool: string            // route segment under /projects/{pid}/ (e.g. 'patching', 'frames')
	label?: string          // optional note shown on the placeholder/list (e.g. 'export to Excel')
}

/**
 * A drawing set: an ordered selection of sheets, printable as one multi-page PDF.
 * Stored at `projects/{pid}/sheetPackages/{id}`.
 */
export interface SheetPackage {
	id: string
	projectId: string
	name: string
	sheetIds: string[]      // ordered membership (the print order)
	sortOrder: number
	updatedAt?: number
	updatedBy?: string
}

/** A title-block revision entry. Notes are tracked for history; not normally drawn. */
export interface SheetRevision {
	code: string                           // 'A', 'B', 'P1', …
	date?: string                          // ISO yyyy-mm-dd
	note?: string
	by?: string
}

/** A rectangle on the paper (mm) that renders a view from one tool. */
export interface SheetViewport {
	id: string
	x: number; y: number; w: number; h: number   // mm on the paper
	label?: string
	source: ViewportSource
	scale?: number                // 1:N denominator; 0 / undefined = fit-to-viewport
	contentOffsetMm?: Point       // pan offset of source content within the viewport
	border?: 'none' | 'thin'
	/** Locks the viewport against content edits (geometry still movable via handles). */
	locked?: boolean
	/** Per-viewport layer overrides (independent of the model & other viewports). */
	layerOverrides?: Record<string, { hidden?: boolean; locked?: boolean }>
	/** Model-space annotations drawn over this viewport's content. */
	annotations?: Annotation[]
	/**
	 * Coordinate-convention version for this viewport's source data. Drives the y-axis
	 * flip in ViewportContent.
	 *   1 = y-down (legacy outlet floorplans)
	 *   2 = y-up   (current standard — default for all NEW viewports)
	 * undefined ⇒ treat as the current default (2 / y-up).
	 */
	version?: 1 | 2
}

export type ViewportSource =
	| { kind: 'empty' }
	| { kind: 'text'; content: string; fontSizePt?: number }
	| { kind: 'outlets'; outletsDocId: string; fileId?: string; pageNum?: number; showPdf?: boolean }
	| { kind: 'racks'; racksDocId: string; face: 'front' | 'rear' | 'plan'; rowId?: string; showWalls?: boolean; colorDevices?: boolean }
	| { kind: 'risers'; risersDocId: string; fromFloor?: number; toFloor?: number }

/** A model-space annotation in the viewport's real-mm space.
 *  - Box kinds (text/rect/cloud/symbol/callout): x,y = top-left, w,h = size, rotation° about centre.
 *  - Line kinds (line/dimension/leader, legacy arrow): x,y = start, x2,y2 = end.
 *  - Callout/leader also use x2,y2 as the pointer target. */
export type AnnotationKind = 'text' | 'line' | 'rect' | 'ellipse' | 'cloud' | 'symbol' | 'callout' | 'dimension' | 'leader' | 'arrow'
export type ArrowHead = 'none' | 'arrow' | 'dot' | 'tick'
export type DashStyle = 'solid' | 'dashed' | 'dotted'
export type TextAlign = 'left' | 'center' | 'right'
export interface AnnotationLink {
	kind: 'drawing' | 'photo'
	sheetId?: string
	ref?: string
	surveyId?: string
	photoId?: string
}
export interface Annotation {
	id: string
	kind: AnnotationKind
	x: number; y: number          // box top-left, or line start
	x2?: number; y2?: number      // line end, or callout/leader pointer target
	w?: number; h?: number        // box size (text/rect/cloud/symbol/callout)
	rotation?: number             // degrees, about the box centre
	text?: string                 // may contain newlines (multi-line)
	fontPt?: number
	align?: TextAlign
	border?: boolean              // callout text-box outline (false = leader-style, no box)
	symbol?: string               // symbol registry id
	flip?: boolean                // mirror the symbol horizontally (e.g. door hinge side)
	start?: ArrowHead             // line start head
	end?: ArrowHead               // line end head
	dash?: DashStyle              // line style
	color?: string                // stroke / border / text color
	fill?: string                 // shape fill (rect/cloud/callout/symbol); 'none' = unfilled
	link?: AnnotationLink
	layerId?: string
}

export interface TitleBlockConfig {
	template?: 'vertical' | 'compact' | 'horizontal'
	positionMm?: Point; widthMm?: number; heightMm?: number
	/**
	 * Per-sheet field overrides. A `null` value means "no override — fall back to the project
	 * default" (works under Firestore merge: setting null lets TitleBlock's `?? projectFallback`
	 * resolve to the default, whereas an absent key would be ambiguous and '' would force-blank).
	 */
	fields?: Record<string, string | null>
}
