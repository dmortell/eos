// A library drag over a view (viewportEdit.ts): which views take it, and what the drop does (backlog "Blocks: drag to
// place", Dave 2026-10-10).
import { describe, it, expect } from 'vitest'
import { dropTakes, dropEffectFor, libraryDrop } from './viewportEdit'
import type { Workspace } from '../app/workspace.svelte'
import type { PointerIn, ToolCtx } from '../editor/tools'

const drag = (tool?: 'insert') => ({ prevTool: 'select' as const, arm: () => {}, ...(tool ? { tool } : {}) })

describe('library drag and drop', () => {
	it('a block (it names Insert) drops on a plan, an elevation, a section or a sheet — not a rack view or inside a viewport', () => {
		expect(['plan', 'elevation', 'section', 'sheet', 'row', 'riser'].map((k) => dropTakes(drag('insert'), k as never, false))).toEqual([true, true, true, true, false, false])
		expect(dropTakes(drag('insert'), 'plan', true)).toBe(false)
	})
	it('a template / outlets / ports (no tool named): rack views only, as before; no drag: nothing', () => {
		expect(['row', 'plan'].map((k) => dropTakes(drag(), k as never, false))).toEqual([true, false])
		expect(dropTakes(null, 'plan', false)).toBe(false)
	})
	it('the drop effect is one the source allows — outlets (link) were refused when every drag was answered with copy', () => {
		expect(['link', 'copy', 'all', 'uninitialized', 'linkMove', 'move'].map((a) => dropEffectFor(a as DataTransfer['effectAllowed']))).toEqual(['link', 'copy', 'copy', 'copy', 'link', 'move'])
	})
	it('over the view it arms the tool once and shows its ghost; the drop is the tool’s click there', () => {
		let armed = 0, hovers = 0, downs: PointerIn[] = []
		const ws = { dragArm: { ...drag('insert'), arm: () => { armed++ } }, tool: { hover: () => { hovers++ }, down: (e: PointerIn) => { downs.push(e) } } } as unknown as Workspace
		const p: PointerIn = { p: { x: 5, y: 6 }, shift: false, ctrl: false, alt: false }
		const h = libraryDrop({ ws, ok: () => dropTakes(ws.dragArm, 'plan', false), input: () => p, ctx: () => ({}) as ToolCtx, surface: () => undefined, changed: () => {} })
		const ev = { preventDefault: () => {}, dataTransfer: null } as unknown as DragEvent
		h.over(ev); h.over(ev); h.drop(ev)
		expect([armed, hovers, downs]).toEqual([1, 2, [p]])
	})
})
