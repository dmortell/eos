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
	updatedAt?: number
	updatedBy?: string
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
	| { kind: 'racks'; racksDocId: string; face: 'front' | 'rear' | 'plan' }
	| { kind: 'risers'; risersDocId: string; fromFloor?: number; toFloor?: number }

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
