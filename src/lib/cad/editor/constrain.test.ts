// Shift constraints at a junction (backlog "Shift constraints: junctions"): every segment of the dragged node on 15°.
import { describe, it, expect } from 'vitest'
import { angleStep, angleStepAll } from './constrain'

const DEG = Math.PI / 180
const onStep = (p: { x: number; y: number }, q: { x: number; y: number }) => {
	const a = (Math.atan2(q.y - p.y, q.x - p.x) / DEG + 360) % 15
	return Math.min(a, 15 - a) < 0.1
}

describe('Shift at a junction', () => {
	it('one neighbour: the plain 15° step', () => {
		expect(angleStepAll([{ x: 0, y: 0 }], { x: 1000, y: 30 })).toEqual(angleStep({ x: 0, y: 0 }, { x: 1000, y: 30 }))
	})
	it('two neighbours: a point where both segments are on a step, near the pointer', () => {
		const a = { x: 0, y: 0 }, b = { x: 2000, y: 0 }, to = { x: 1030, y: 980 }
		const p = angleStepAll([a, b], to)
		expect(onStep(a, p) && onStep(b, p)).toBe(true)
		expect(Math.hypot(p.x - to.x, p.y - to.y)).toBeLessThan(200)
	})
	it('a T junction (three neighbours) keeps all three on steps where it can', () => {
		const from = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 1000, y: 1500 }], to = { x: 1020, y: 40 }
		const p = angleStepAll(from, to)
		expect(from.every((f) => onStep(f, p))).toBe(true)
		expect(p).toEqual({ x: 1000, y: 0 })
	})
})
