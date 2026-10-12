// A patch schedule drawn on paper: each cord's from / to as the Excel has them, grouped by status, paginated to its
// viewport's window.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Cord } from '../domain/types'
import type { Prim } from './display'
import { patchScheduleDisplayList } from './schedule'

const texts = (ps: Prim[]) => ps.flatMap((p) => (p.k === 'text' ? [p.text] : []))
/** The texts on the table line that starts with cord number `n`, left to right. */
function rowOf(ps: Prim[], n: number): string[] {
	const first = ps.find((p) => p.k === 'text' && p.cls === 'legend-text' && p.at.x < 2 && p.text === String(n))
	if (first?.k !== 'text') return []
	return ps.flatMap((p) => (p.k === 'text' && Math.abs(p.at.y - first.at.y) < 0.01 ? [p] : [])).sort((a, b) => a.at.x - b.at.x).map((p) => p.text)
}
/** The cord numbers a schedule shows. */
const shown = (ps: Prim[]) => ps.flatMap((p) => (p.k === 'text' && p.cls === 'legend-text' && p.at.x < 2 && /^\d+$/.test(p.text) ? [Number(p.text)] : []))
const cords = (n: number): Cord[] => Array.from({ length: n }, (_, i) => ({ type: 'cord', id: `CX${i}`, kind: 'patch', a: { on: 'P1', port: 5 + i, face: 'front' }, b: { on: 'SW1', port: 5 + i }, cableType: 'cat6a', colour: '#000', lengthM: 2, lengthLocked: false, status: 'installed' }))

describe('patch schedule on paper', () => {
	it('shows each cord with its from and to ends (device, label, rack, port), under its status', () => {
		const ps = patchScheduleDisplayList(new ProjectIndex(demoProject()), 'SR-A')
		const t = texts(ps)
		expect(t[0]).toBe('Patch schedule · IDF-A')
		expect(t).toContain('2 add')
		expect(t).toContain('ADD - install these cords  (2)')
		// C1: panel 1 port 1 (33-001.A) → switch 1 port 1 (SW1-01); C2 the next ports
		expect(rowOf(ps, 1)).toEqual(['1', 'Panel 1', '33-001.A', 'A01', '40', 'front', '1', 'Switch 1', 'SW1-01', 'A01', '38', '1', 'cat6a', '1'])
		expect(rowOf(ps, 2)).toEqual(expect.arrayContaining(['Panel 1', '33-001.B', 'Switch 1', 'SW1-02']))
		// a ruled table: an outline and rules
		expect(ps.some((p) => p.k === 'line' && p.cls === 'legend' && p.closed)).toBe(true)
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'legend-rule').length).toBeGreaterThan(3)
	})
	it('a room with no cords says so', () => {
		const ix = new ProjectIndex(demoProject().filter((e) => e.type !== 'cord'))
		expect(texts(patchScheduleDisplayList(ix, 'SR-A'))).toContain('No patch cords')
	})
	it('a window too small for every row shows what fits and how many more; another starts where it stopped', () => {
		const ix = new ProjectIndex([...demoProject(), ...cords(30)])
		expect(texts(patchScheduleDisplayList(ix, 'SR-A')).some((t) => t.startsWith('…'))).toBe(false)
		const first = patchScheduleDisplayList(ix, 'SR-A', 1, { fit: 60 })
		const [, n, from] = texts(first).find((t) => t.startsWith('…'))!.match(/… (\d+) more cords: from #(\d+)/)!
		for (const p of first) if (p.k === 'line') for (const q of p.pts) expect(q.y).toBeLessThanOrEqual(60)   // inside the window
		expect(shown(first).length + Number(n)).toBe(32)
		const next = shown(patchScheduleDisplayList(ix, 'SR-A', Number(from)))
		expect(next[0]).toBe(Number(from))
		expect(next).toHaveLength(Number(n))
	})
})
