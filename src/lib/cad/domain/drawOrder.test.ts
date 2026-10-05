// Draw order (Dave, 2026-10-05): Ctrl+] / Ctrl+[ and Shift for front / back, among a level's (or sheet's) shapes.
import { describe, it, expect } from 'vitest'
import { reorderShapes, byDrawOrder, type Shape } from './shapes'
import { planDisplayList } from '../views/plan'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'

const box = (id: string, order?: number, levelId = 'L33') => ({ type: 'shape', id, levelId, geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 100, y: 100 } }, ...(order != null ? { order } : {}) }) as Shape
const stack = (all: Shape[], moved: Shape[]) => all.map((s) => moved.find((m) => m.id === s.id) ?? s).sort(byDrawOrder).map((s) => s.id).join('')

describe('draw order', () => {
	const all = [box('a'), box('b'), box('c')]
	it('forward / backward pass one shape; front / back pass them all; only the moved one changes', () => {
		expect(stack(all, reorderShapes(all, ['a'], 'forward'))).toBe('bca')   // all equal: one up goes above the rest
		const spaced = [box('a', 0), box('b', 1), box('c', 2)]
		expect(stack(spaced, reorderShapes(spaced, ['a'], 'forward'))).toBe('bac')
		expect(stack(spaced, reorderShapes(spaced, ['c'], 'back'))).toBe('cab')
		expect(stack(spaced, reorderShapes(spaced, ['b'], 'front'))).toBe('acb')
		expect(reorderShapes(spaced, ['c'], 'front')).toEqual([])   // already on top
		expect(reorderShapes(spaced, ['c'], 'forward')).toEqual([])
		expect(reorderShapes([...spaced, box('x', 9, 'L1')], ['a'], 'front')[0].order).toBe(3)   // other levels don't count
	})
	it('the plan draws in that order', () => {
		const ents = [...demoProject(), box('a', 5), box('b', 1)]
		const srcs = planDisplayList(new ProjectIndex(ents), 'L33', { scale: 100 }).map((p) => p.src).filter((s) => s === 'a' || s === 'b')
		expect(srcs).toEqual(['b', 'a'])
	})
})
