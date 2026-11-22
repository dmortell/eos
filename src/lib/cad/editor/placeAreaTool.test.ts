// The Place area tool (backlog 6): four clicks on the whole-floor plan — a point on the greyed area, the same point on
// the floorplan, twice — place the area plan (one undo step); Esc stops without a change.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { PlaceAreaTool } from './placeAreaTool'
import { spaceOf, PLAN } from '../views/space'
import { toMain } from '../domain/areaPlace'
import type { ToolCtx } from './tools'
import type { Entity } from '../domain/drawing'

const H = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
function harness() {
	const store = new EntityStore()
	store.load([
		{ type: 'level', id: 'M', buildingId: 'B', number: 33, name: '33F', order: 33, elevationMm: 0, heights: H },
		{ type: 'level', id: 'C', buildingId: 'B', number: 33, name: '33F 3307', order: 33.5, elevationMm: 0, heights: H, area: '3307' },
	] as Entity[])
	const said: string[] = []
	let ended: boolean | null = null
	const ctx = (): ToolCtx => ({
		store, index: new ProjectIndex(store.all()), levelId: 'M', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(PLAN), work: { z: 0, depth: 0 },
		prims: () => [], tol: () => 6, snap: (p) => ({ p, kind: 'grid' }), selection: [], select: () => {}, setMarquee: () => {}, ask: () => {}, say: (m) => said.push(m),
	})
	const tool = new PlaceAreaTool(() => 'C', (ok) => { ended = ok })
	return { store, ctx, said, tool, ended: () => ended }
}
const at = (p: { x: number; y: number }) => ({ p, shift: false, ctrl: false, alt: false })

describe('the Place area tool', () => {
	it('two point pairs place the area (turned and moved); one undo step puts it back', () => {
		const h = harness(), want = { x: 50000, y: -2000, rot: 90 }
		// the area isn't placed yet: it shows on the whole floor at 0, 0, so its points are clicked where they are
		const a1 = { x: 1000, y: 1000 }, a2 = { x: 9000, y: 1000 }
		h.tool.down(at(a1), h.ctx()); h.tool.down(at(toMain(want, a1)), h.ctx())
		expect(h.said.at(-1)).toContain('3 of 4')
		h.tool.down(at(a2), h.ctx()); h.tool.down(at(toMain(want, a2)), h.ctx())
		const c = h.store.get('C') as { place?: { x: number; y: number; rot: number } }
		expect(c.place!.rot).toBeCloseTo(90)
		expect(c.place!.x).toBeCloseTo(50000, 0)
		expect(c.place!.y).toBeCloseTo(-2000, 0)
		expect(h.ended()).toBe(true)
		expect(h.said.at(-1)).toContain('33F 3307 placed')
		h.store.undo()
		expect((h.store.get('C') as { place?: unknown }).place).toBeUndefined()
	})
	it('Esc stops with nothing changed', () => {
		const h = harness()
		h.tool.down(at({ x: 0, y: 0 }), h.ctx())
		expect(h.tool.key({ key: 'Escape' } as KeyboardEvent)).toBe(true)
		expect(h.ended()).toBe(false)
		expect((h.store.get('C') as { place?: unknown }).place).toBeUndefined()
	})
})
