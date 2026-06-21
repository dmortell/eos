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
	n: 'callout',     // note: leader + text (border: none / underline / box)
	l: 'line',        // line
	a: 'arrow',       // arrow
	d: 'dimension',   // dimension
	r: 'rect',        // rectangle (highlight a region)
	e: 'ellipse',     // ellipse
	g: 'grid',        // floor-tile grid
}

/** Popular symbols get plain-key hotkeys too (kind = 'symbol', symbol = id). Keys avoid the
 *  markup letters above and the viewport shortcuts. */
export const SYMBOL_HOTKEYS: Record<string, string> = {
	o: 'outlet',
	s: 'section',
	v: 'elevation', // "view"
	p: 'photo',
}

/** The annote tool for a plain-key press, or null (modifiers / unmapped keys are ignored). */
export function markupHotkey(e: KeyboardEvent): AnnotationKind | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null
	return MARKUP_HOTKEYS[e.key.toLowerCase()] ?? null
}

/** Combined resolver: a markup kind OR a symbol (tool:'symbol' + symbol id), for a plain-key press. */
export function armHotkey(e: KeyboardEvent): { tool: AnnotationKind | 'symbol'; symbol?: string } | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null
	const k = e.key.toLowerCase()
	if (MARKUP_HOTKEYS[k]) return { tool: MARKUP_HOTKEYS[k] }
	if (SYMBOL_HOTKEYS[k]) return { tool: 'symbol', symbol: SYMBOL_HOTKEYS[k] }
	return null
}

/** Annotation kind / symbol id → its uppercase hotkey letter, for tooltips/menus (undefined if none). */
export const HOTKEY_OF: Record<string, string> = Object.fromEntries([
	...Object.entries(MARKUP_HOTKEYS).map(([k, v]) => [v, k.toUpperCase()]),
	...Object.entries(SYMBOL_HOTKEYS).map(([k, v]) => [v, k.toUpperCase()]),
])
