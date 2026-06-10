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
export type AnnotationKind = 'text' | 'line' | 'rect' | 'cloud' | 'symbol' | 'callout' | 'dimension' | 'leader' | 'arrow'
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
	start?: ArrowHead             // line start head
	end?: ArrowHead               // line end head
	dash?: DashStyle              // line style
	color?: string
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
