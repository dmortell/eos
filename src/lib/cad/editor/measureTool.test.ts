// The Measure tool (W32): two clicks give the distance (status + on screen); nothing is written to the model.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { MeasureTool, measure } from './measureTool'
import { spaceOf, PLAN } from '../views/space'
import type { ToolCtx } from './tools'

function harness() {
	const store = new EntityStore()
	store.load(demoProject())
	const said: string[] = []
	const ctx = (): ToolCtx => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(PLAN), work: { z: 0, depth: 0 },
		prims: () => [], tol: () => 6, snap: (p) => ({ p, kind: 'grid' }), selection: [], select: () => {}, setMarquee: () => {}, ask: () => {}, say: (m) => said.push(m),
	})
	return { store, ctx, said }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })

describe('the Measure tool', () => {
	it('two clicks: the distance and its X / Y in the status line, and on screen; the model is untouched', () => {
		const h = harness(), t = new MeasureTool(), n = h.store.all().length
		t.down(at(0, 0), h.ctx())
		t.down(at(3000, 4000), h.ctx())
		expect(h.said.at(-1)).toBe('Distance 5 000 mm · X 3 000 · Y 4 000 · click to measure again')
		expect(t.preview(h.ctx()).find((p) => p.k === 'text')).toMatchObject({ text: '5 000 mm' })
		expect(h.store.all()).toHaveLength(n)
		t.down(at(100, 100), h.ctx())   // a third click starts again
		expect(h.said.at(-1)).toMatch(/second point/)
	})
	it('in an elevation: along and up', () => {
		const c = { space: spaceOf({ kind: 'elevation', dir: 'front' }), work: { z: 0, depth: 0 } }
		expect(measure({ x: 0, y: 0 }, { x: 0, y: -2700 }, c).text).toBe('2 700 mm · along 0 · up 2 700')
	})
})
