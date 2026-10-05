import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { navTree, filterTree, pathTo, type NavNode } from './navTree'
import type { Entity, Sheet } from './drawing'

const sheet: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, status: 'active',
	viewports: [{ id: 'V1', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 10, y: 10, w: 100, h: 80 }, scale: 100, centre: { x: 0, y: 0 } }] }
const ix = () => new ProjectIndex([...demoProject(), sheet as Entity])
const labels = (ns: NavNode[]): string[] => ns.flatMap((n) => [n.label, ...labels(n.children ?? [])])

describe('navigator tree', () => {
	it('levels with their views and server rooms (rack view, racks); the riser view; sheets with their viewports', () => {
		const t = navTree(ix())
		const all = labels(t)
		expect(all).toEqual(expect.arrayContaining(['Plan', 'Front elevation', 'IDF-A', 'A01', 'Riser view (building)', 'S001 Plan']))
		const sh = t.find((n) => n.kind === 'sheets')!
		expect(sh.children?.[0].children?.[0]).toMatchObject({ kind: 'viewport', detail: '1:100', open: { levelId: 'L33', spec: { kind: 'plan' } } })
		const room = pathTo(t, (n) => n.key === 'room:SR-A')
		expect(room?.length).toBeGreaterThan(2)   // building › level › room
	})
	it('a search keeps the matches and their parents', () => {
		const f = filterTree(navTree(ix()), 'a01')
		expect(labels(f)).toContain('A01')
		expect(labels(f)).not.toContain('Front elevation')
		expect(f[0].kind).toBe('building')
		expect(filterTree(navTree(ix()), 'zzz')).toEqual([])
	})
})
