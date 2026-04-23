/**
 * @file src/lib/types/pages.ts
 * @description Drawing-page types. A page is a composable canvas hosting one
 * or more viewports that window into source drawings from other tools plus
 * primitives (text, image) and a title block.
 *
 * Stored at Firestore path `pages/{projectId}_{pageId}`. Every page also has
 * a mirrored `DrawingDoc` with `toolType: 'page'` so it flows through the
 * drawing list + versioning system.
 */

import type { PrintSettings } from '$lib/ui/print/types'

export interface Page {
	id: string
	projectId: string
	/** Drawing title shown on the title block. */
	title: string
	/** Optional human drawing number, e.g. "E-001". */
	drawingNumber?: string
	/** Position in the parent drawing package (if any). */
	order: number
	/** Paper settings + default scale seeded onto newly-created viewports. */
	paper: PrintSettings
	/**
	 * Title block config. `undefined` → render the default ('standard' template
	 * at bottom-right). `null` → explicitly hidden. A config object → use those
	 * settings.
	 */
	titleBlock?: TitleBlockConfig | null
	viewports: Viewport[]
	notes?: string
	/**
	 * Whether this page is printed when its drawing packages are published.
	 * Mirrored onto the linked `DrawingDoc.includeInPackages` so the drawing
	 * list can read it without an extra subscription. Default true.
	 */
	includeInPackages?: boolean
	updatedAt?: number
	updatedBy?: string
}

export interface Viewport {
	id: string
	/** Position on the page paper, mm from the paper top-left. */
	positionMm: { x: number; y: number }
	widthMm: number
	heightMm: number
	rotationDeg?: number
	/** Where to draw from — discriminated by `kind`. */
	source: ViewportSource
	/** Optional clip within the source drawing's own coordinate space (mm). */
	sourceClip?: { x: number; y: number; widthMm: number; heightMm: number }
	/**
	 * Drawing scale — 50 = 1:50, 100 = 1:100. Zero means "fit to viewport".
	 * Independent of `Page.paper.scale`.
	 */
	scale: number
	label?: string
	/** Label font size in points. Default 6pt. Stored so users can tune legibility per viewport. */
	labelFontPt?: number
	/** Additional pan offset applied to the source content in source-mm. Default 0,0. */
	contentOffsetMm?: { x: number; y: number }
	border?: 'none' | 'thin' | 'thick'
	/**
	 * When set, the viewport renders a frozen source revision rather than the
	 * live source state. Written at page-publish time (see P7.5).
	 */
	sourcePin?: {
		drawingId: string
		revisionCode: string
	}
}

export type ViewportSource =
	| { kind: 'rack-elevation'; rackDocId: string; face: 'front' | 'rear'; rowId?: string }
	| { kind: 'rack-plan'; rackDocId: string; rowIds?: string[] }
	| { kind: 'frame-detail'; frameDocId: string; frameId: string }
	| { kind: 'fillrate'; projectId: string }
	| { kind: 'floorplan'; fileId: string; pageNum: number }
	| { kind: 'text'; content: string; fontSizePt?: number; align?: 'left' | 'center' | 'right' }
	| { kind: 'image'; url: string; fit?: 'contain' | 'cover' }

export interface TitleBlockConfig {
	/** Position on the paper, mm from top-left. Defaults to bottom-right 180×60 mm. */
	positionMm?: { x: number; y: number }
	widthMm?: number
	heightMm?: number
	template: 'standard' | 'compact' | 'vertical' | 'custom'
	/** Per-field overrides — anything not overridden falls back to project/page defaults. */
	fields?: Record<string, string>
}
