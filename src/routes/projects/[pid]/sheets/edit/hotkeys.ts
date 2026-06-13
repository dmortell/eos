import type { AnnotationKind } from '../types'

/**
 * Single-key markup shortcuts (no Ctrl/Cmd/Alt) → annotation tool, for fast floorplan redlining.
 * Pressing one arms that annote tool; the next click/drag places it on the active layer (make a
 * "Markup" layer active first — see the Layers panel). Letters chosen to be mnemonic and not clash
 * with the existing viewport shortcuts (Ctrl-Z/Y/C/V/D, Delete, arrows).
 */
export const MARKUP_HOTKEYS: Record<string, AnnotationKind> = {
	c: 'cloud',       // revision cloud
	t: 'text',        // free text note
	n: 'callout',     // note: text box + leader
	l: 'leader',      // leader line + text (no box)
	a: 'arrow',       // arrow
	d: 'dimension',   // dimension
	r: 'rect',        // rectangle (highlight a region)
	e: 'ellipse',     // ellipse
}

/** The annote tool for a plain-key press, or null (modifiers / unmapped keys are ignored). */
export function markupHotkey(e: KeyboardEvent): AnnotationKind | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null
	return MARKUP_HOTKEYS[e.key.toLowerCase()] ?? null
}

/** Annotation kind → its uppercase hotkey letter, for tooltips/menus (undefined if none). */
export const HOTKEY_OF: Record<string, string> = Object.fromEntries(
	Object.entries(MARKUP_HOTKEYS).map(([k, v]) => [v, k.toUpperCase()]),
)
