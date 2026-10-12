// Prims.svelte (screen) and pdf.ts (paper) each keep a class → look table. They can't share one object (CSS vs jspdf
// calls), so this test stops them drifting apart: every class the screen styles is either in the PDF table or listed
// below as screen-only, and where both give a color, the colors agree.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { styleOf } from './pdf'

/** Classes that exist only on screen (selection, hover, grips, tracing, drafts, the screen-only fill meters …). */
const SCREEN_ONLY = new Set([
	'sel-line', 'sel-box', 'sel', 'band', 'grip', 'grip-bar', 'grip-bar-sel', 'grip-hover', 'grip-sel', 'grip-plus', 'workplane-grip', 'workplane-label',
	'seg-sel', 'port-sel', 'trace-cord', 'trace-route', 'trace-route-est', 'trace-port', 'all-route', 'all-route-est', 'hover', 'snap', 'pick-order',
	'logo-sel', 'far', 'band-edge', 'draft-bad', 'draft-label', 'section-extent', 'fill-band', 'fill-ok', 'fill-warn', 'fill-over', 'fill-label',
	'port-label-sel', 'port-label-trace', 'cord-installed', 'cord-change', 'on-ports', 'port-count', 'line', 'filled',
])
/** Looks that differ on purpose (screen shows more than paper does). */
const SAME_COLOR_EXEMPT = new Set<string>(['viewport'])

const css = readFileSync(new URL('../ui/Prims.svelte', import.meta.url), 'utf8').split('<style>')[1].replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
const hex = (body: string, prop: string) => body.match(new RegExp(String.raw`(?:^|[;\s])${prop}:\s*(#[0-9a-f]{6})`, 'i'))?.[1]

describe('screen / paper class styles', () => {
	const single = rules.filter((r) => /^(text)?(\.[a-z-]+)+$/.test(r.sel) && !r.sel.includes(','))
	it('every class Prims.svelte styles is on paper too, or listed as screen-only', () => {
		const missing = new Set<string>()
		for (const r of single) for (const c of r.sel.match(/\.[a-z-]+/g)!.map((s) => s.slice(1))) if (!SCREEN_ONLY.has(c) && !(c in classes())) missing.add(c)
		expect([...missing]).toEqual([])
	})
	it('where both give a color, they agree', () => {
		const bad: string[] = []
		let checked = 0
		for (const r of single) {
			const cls = r.sel.match(/\.[a-z-]+/g)!.map((s) => s.slice(1))
			if (cls.some((c) => SCREEN_ONLY.has(c) && c !== 'filled') || cls.some((c) => SAME_COLOR_EXEMPT.has(c))) continue
			const st = styleOf(cls.filter((c) => c !== 'filled').join(' '))   // paper: the prim's fill flag, not a class
			if (st.skip) continue
			const isText = r.sel.startsWith('text')
			const want = isText ? { text: hex(r.body, 'fill') } : { stroke: hex(r.body, 'stroke'), fill: hex(r.body, 'fill') }
			for (const [k, v] of Object.entries(want)) { if (v) checked++; if (v && (st as Record<string, unknown>)[k] !== v) bad.push(`${r.sel}: ${k} screen ${v}, paper ${(st as Record<string, unknown>)[k]}`) }
		}
		expect(checked).toBeGreaterThan(40)   // the check really compares something
		expect(bad).toEqual([])
	})
})
function classes(): Record<string, true> {
	// a class is "on paper" when it has an entry of its own: probe by comparing against the empty style
	const out: Record<string, true> = {}
	for (const r of single()) for (const c of r.sel.match(/\.[a-z-]+/g)!.map((s) => s.slice(1))) if (Object.keys(styleOf(c)).length) out[c] = true
	return out
	function single() { return rules.filter((r) => /^(text)?(\.[a-z-]+)+$/.test(r.sel) && !r.sel.includes(',')) }
}
