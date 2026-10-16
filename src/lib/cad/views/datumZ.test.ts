// {Z} on a placed datum (User 2026-10-17): drawn in the elevation it was placed in, reading its height.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import { elevationDisplayList } from './elevation'
import { spaceOf } from './space'
import type { Entity } from '../domain/drawing'

describe('a datum placed in an elevation', () => {
	it('reads its own height', () => {
		const ins = { type: 'shape', id: 'DAT', levelId: 'L33', geom: { kind: 'insert', blockId: 'builtin:datum', at: { x: 1000, y: 2000 }, z: 2010, inElevations: true } } as unknown as Entity
		const ix = new ProjectIndex([...demoProject(), ins]), blocks = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
		const texts = elevationDisplayList(ix, 'L33', spaceOf({ kind: 'elevation', dir: 'front' }), { scale: 100, blocks }).filter((p) => p.src === 'DAT' && p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''))
		expect(texts).toEqual(['FFL +2010'])
	})
})

describe('a block placed in a section, beside its width', () => {
	it('is still drawn there (the section\'s range cuts the model, not its own annotations)', async () => {
		const { sectionDisplayList } = await import('./section')
		const sec = { type: 'section', id: 'SEC', levelId: 'L33', name: 'A', a: { x: 0, y: 3000 }, b: { x: 3000, y: 3000 }, depth: 1500 } as unknown as Entity
		const frame = { o: { x: 0, y: 3000 }, t: { x: 1, y: 0 }, n: { x: 0, y: 1 } }
		const ins = { type: 'shape', id: 'DAT', levelId: 'L33', geom: { kind: 'insert', blockId: 'builtin:datum', at: { x: 4000, y: 3000 }, z: 2010, inElevations: true, frame } } as unknown as Entity
		const ix = new ProjectIndex([...demoProject(), sec, ins]), blocks = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
		const texts = sectionDisplayList(ix, sec as never, { scale: 100, blocks }).filter((p) => p.src === 'DAT' && p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''))
		expect(texts).toEqual(['FFL +2010'])
	})
})
