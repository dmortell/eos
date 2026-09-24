import { describe, it, expect } from 'vitest'
import { Clipboard, pasteCopies, arrange, setGroup } from './clipboard'
import type { Ent } from './geometry'

const r = (id: string, groupId?: string): Ent => ({ id, type: 'rect', a: [0, 0], b: [10, 10], groupId })
const ids = (a: Ent[] | null) => a?.map((e) => e.id)
const counter = () => { let n = 0; return () => `n${++n}` }

describe('clipboard', () => {
	it('each paste lands a further step away, with fresh ids', () => {
		const cb = new Clipboard(), id = counter()
		expect(cb.paste(5, id)).toEqual([])
		cb.copy([r('a')])
		expect(cb.paste(5, id)[0]).toMatchObject({ id: 'n1', a: [5, 5], b: [15, 15] })
		expect(cb.paste(5, id)[0]).toMatchObject({ id: 'n2', a: [10, 10] })
		cb.copy([r('a')])   // a new copy restarts the stacking
		expect(cb.paste(5, id)[0].a).toEqual([5, 5])
	})
	it('a copied group gets ONE new group id; ungrouped shapes stay ungrouped', () => {
		const out = pasteCopies([r('a', 'g'), r('b', 'g'), r('c')], 0, counter())
		expect(out.map((e) => e.groupId)).toEqual(['n1', 'n1', undefined])
		expect(new Set(out.map((e) => e.id)).size).toBe(3)
	})
})

describe('arrange + groups', () => {
	const arr = ['a', 'b', 'c', 'd'].map((x) => r(x))
	it('front / back move the selection to the ends; forward / backward step it past one neighbour', () => {
		expect(ids(arrange(arr, ['b'], 'front'))).toEqual(['a', 'c', 'd', 'b'])
		expect(ids(arrange(arr, ['c'], 'back'))).toEqual(['c', 'a', 'b', 'd'])
		expect(ids(arrange(arr, ['b'], 'forward'))).toEqual(['a', 'c', 'b', 'd'])
		expect(ids(arrange(arr, ['c'], 'backward'))).toEqual(['a', 'c', 'b', 'd'])
		expect(arrange(arr, ['zz'], 'front')).toBeNull()
	})
	it('groups and ungroups', () => {
		const g = setGroup(arr, ['a', 'c'], 'G')
		expect(g.map((e) => e.groupId)).toEqual(['G', undefined, 'G', undefined])
		expect(setGroup(g, ['a'], undefined)[0].groupId).toBeUndefined()
	})
})
