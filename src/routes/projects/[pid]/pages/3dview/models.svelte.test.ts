import { describe, it, expect } from 'vitest'
import { models, setModels, upsertModel, removeModels, modelForPlace, snapModels, modelById } from './models.svelte'

describe('model registry (drawings-plan phase 3)', () => {
	it('upsertModel replaces by id or appends; removeModels drops; modelForPlace prefers a live model', () => {
		const n = models.length
		upsertModel({ id: 't-a', name: 'A', objects: [], placeId: 'p1', archived: true })
		upsertModel({ id: 't-b', name: 'B', objects: [], placeId: 'p1' })
		expect(models.length).toBe(n + 2)
		expect(modelForPlace('p1')?.id).toBe('t-b')
		upsertModel({ id: 't-b', name: 'B2', objects: [], placeId: 'p1' })
		expect(models.length).toBe(n + 2); expect(modelById('t-b')?.name).toBe('B2')
		removeModels(['t-a', 't-b'])
		expect(models.length).toBe(n)
	})
	it('a closing loader drops only the models it still owns (a re-opened project keeps them — no duplicate on open)', () => {
		const oldLoad = {}, newLoad = {}
		upsertModel({ id: 't-o', name: 'O', objects: [], placeId: 'p9' }, oldLoad)
		upsertModel({ id: 't-o', name: 'O', objects: [], placeId: 'p9' }, newLoad)   // the same project loaded again
		removeModels(['t-o'], oldLoad)   // the old load's late close
		expect(modelForPlace('p9')?.id).toBe('t-o')
		removeModels(['t-o'], newLoad)
		expect(modelById('t-o')).toBeUndefined()
	})
	it('setModels restores BY ID and keeps a model the snapshot never saw (created after it)', () => {
		upsertModel({ id: 't-old', name: 'Old', objects: [], shapes: [] })   // the registry starts empty (no demo models)
		const before = snapModels()
		upsertModel({ id: 't-new', name: 'New', objects: [], shapes: [] })
		const renamed = before.map((m) => (m.id === 't-old' ? { ...m, name: 'renamed' } : m))
		setModels(renamed)
		expect(modelById('t-old')?.name).toBe('renamed')
		expect(modelById('t-new')?.name).toBe('New')   // not dropped (was: the whole array replaced → gone)
		setModels(before)
		removeModels(['t-new', 't-old'])
	})
	it('starts empty — no demo models in a real project', () => {
		expect(models.filter((m) => /^m[1-4]$/.test(m.id))).toEqual([])
	})
})
