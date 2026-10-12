// What Delete says it did (Review 2 Q36): in the Properties header's words, and an installed cord only marked.
import { describe, it, expect } from 'vitest'
import { deletedText } from './selectionActions'
import type { Entity } from '../domain/drawing'
import type { Cord } from '../domain/types'

const cord = (id: string, status: Cord['status']): Entity => ({ type: 'cord', id, kind: 'patch', a: { on: 'A', port: 1 }, b: { on: 'B', port: 1 }, cableType: 'cat6a', colour: 'blue', lengthM: 1, lengthLocked: false, status })
const trunk = { type: 'shape', id: 'T1', levelId: 'L', geom: { kind: 'path', nodes: [] }, role: { kind: 'containment', form: 'trunk', tier: 'high' } } as unknown as Entity
const rect = { type: 'shape', id: 'R', levelId: 'L', geom: { kind: 'rect', at: { x: 0, y: 0 }, w: 1, h: 1 } } as unknown as Entity
const link = { type: 'link', id: 'K', kind: 'horizontal', a: { on: 'P', port: 1 }, b: { on: 'O', port: 1 }, status: 'design' } as Entity
const names: Record<string, string> = { T1: 'T1' }
const nameOf = (e: Entity) => names[e.id] ?? ''

describe('what Delete says', () => {
	it('names one thing in the Properties header’s word, not its type', () => {
		expect(deletedText([trunk], nameOf)).toBe('Deleted trunk T1 — Undo brings it back')
		expect(deletedText([rect], nameOf)).toBe('Deleted rectangle — Undo brings it back')
		expect(deletedText([link], nameOf)).toBe('Deleted cable — Undo brings it back')
		expect(deletedText([cord('C', 'add')], nameOf)).toBe('Deleted patch cord — Undo brings it back')
	})
	it('an installed cord is only marked for removal, and says so', () => {
		expect(deletedText([cord('C', 'installed')], nameOf)).toMatch(/^Marked patch cord for removal — it comes out on site/)
		const mixed = deletedText([cord('C1', 'add'), cord('C2', 'installed'), cord('C3', 'installed')], nameOf)
		expect(mixed).toMatch(/^Deleted patch cord · marked 2 installed patch cords for removal/)
		expect(deletedText([cord('C', 'remove')], nameOf)).toMatch(/^The patch cord is already marked for removal — Purge removed/)
	})
	it('several kinds are counted by kind', () => {
		expect(deletedText([trunk, rect, rect], nameOf)).toBe('Deleted 1 run · 2 shapes — Undo brings it back')
	})
})
