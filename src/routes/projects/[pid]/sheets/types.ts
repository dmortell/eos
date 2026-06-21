import type { PrintSettings, Point } from '$lib/ui/print/types'
import type { Dir, Clip } from './tools/model3d/types'

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

/** A "file" sheet's link target — a tool route within this project, optionally at a floor/room. */
export interface ExternalLink {
	tool: string            // route segment under /projects/{pid}/ (e.g. 'patching', 'frames')
	label?: string          // optional note shown on the placeholder/list (e.g. 'export to Excel')
	floor?: number          // ?floor= for tools that are floor-scoped (outlets/frames/patching)
	room?: string           // ?room= for room-scoped tools (patching)
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
	/** Manual viewport number (for cross-references). Overrides the auto spatial number. */
	number?: number
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
	| { kind: 'fillrate'; sectionId: string }   // a trunk cross-section from the fill-rate tool
	| { kind: 'model3d'; modelId: number; direction: Dir; yaw?: number; pitch?: number; hiddenLines?: boolean; bw?: boolean; clip?: Clip; activeLayer?: string }   // a projected 3D model

/** A model-space annotation in the viewport's real-mm space.
 *  - Box kinds (text/rect/cloud/symbol/callout): x,y = top-left, w,h = size, rotation° about centre.
 *  - Line kinds (line/dimension/leader, legacy arrow): x,y = start, x2,y2 = end.
 *  - Callout/leader also use x2,y2 as the pointer target. */
export type AnnotationKind = 'text' | 'line' | 'rect' | 'ellipse' | 'cloud' | 'symbol' | 'callout' | 'dimension' | 'arrow' | 'image'
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
	text?: string                 // may contain newlines (multi-line). Line/arrow: optional label.
	fontPt?: number
	align?: TextAlign
	labelPos?: 'start' | 'mid' | 'end'  // where a line/arrow label sits along the segment (default mid)
	border?: 'none' | 'underline' | 'box'   // callout text decoration (none = leader-style)
	symbol?: string               // symbol registry id
	flip?: boolean                // mirror the symbol horizontally (e.g. door hinge side)
	start?: ArrowHead             // line start head
	end?: ArrowHead               // line end head
	dash?: DashStyle              // line style
	color?: string                // stroke / border / text color
	fill?: string                 // shape fill (rect/cloud/callout/symbol); 'none' = unfilled
	link?: AnnotationLink
	layerId?: string
	src?: string                  // image annotation source (http(s) URL or data: URL)
	// Elevation/section tag: up to 4 directional arrows (one per wall). A present
	// key shows that arrow with its viewport ref/letter; the centre circle shows
	// the drawing no. (link.ref). `null`/absent = no arrow that way.
	arms?: { n?: string | null; e?: string | null; s?: string | null; w?: string | null }
	// Outlet symbol data (kind:'symbol', symbol:'outlet'). Drawn as a triangle
	// (wallmount) / triangle-in-square (floorbox) / triangle-in-circle (rosette),
	// ports in the triangle, label above, usage abbrev below (unless 'network').
	outlet?: OutletProps
}

export type OutletLevel = 'low' | 'high'
export type OutletMount = 'wall' | 'floor' | 'box' // Wallmount / Floorbox / Rosette
export interface OutletProps {
	label?: string
	ports?: number
	level?: OutletLevel
	usage?: string // a default code or free text (customizable)
	mount?: OutletMount
	cable?: string
	room?: string
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
