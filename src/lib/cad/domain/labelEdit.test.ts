// Edit a label in place (User, 2026-10-05): which things have words, and the thing with new ones.
import { describe, it, expect } from 'vitest'
import { labelKind, labelOf, withLabel } from './labelEdit'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Outlet } from './types'

const outlet = demoProject().find((e) => e.type === 'outlet') as Outlet

describe('labels in place', () => {
	it('kinds: outlets, racks, runs, texts / leaders; not a plain rectangle', () => {
		expect(labelKind(outlet)).toBe('outlet')
		expect(labelKind({ type: 'shape', id: 'R', geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 1, y: 1 } } } as Entity)).toBeNull()
		expect(labelKind({ type: 'shape', id: 'P', geom: { kind: 'path', nodes: [], segs: [] } } as unknown as Entity)).toBe('run')
	})
	it('an outlet\'s new label carries its ports along; blank or unchanged = nothing', () => {
		const next = withLabel(outlet, 'X-999') as Outlet
		expect(next.label).toBe('X-999')
		expect(next.ports.every((p) => p.label.startsWith('X-999'))).toBe(true)
		expect(withLabel(outlet, '  ')).toBeNull()
		expect(withLabel(outlet, labelOf(outlet))).toBeNull()
	})
	it('a run\'s label can be cleared; a leader\'s words too', () => {
		const run = { type: 'shape', id: 'P', label: 'TR1', geom: { kind: 'path', nodes: [], segs: [] } } as unknown as Entity
		expect(withLabel(run, '')).toMatchObject({ label: undefined })
		const leader = { type: 'shape', id: 'L', geom: { kind: 'leader', pts: [], text: 'A' } } as unknown as Entity
		expect(withLabel(leader, '')).toMatchObject({ geom: { text: undefined } })
	})
})
