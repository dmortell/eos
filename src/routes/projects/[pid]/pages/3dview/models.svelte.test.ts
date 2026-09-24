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
	it('setModels restores BY ID and keeps a model the snapshot never saw (created after it)', () => {
		const before = snapModels()
		upsertModel({ id: 't-new', name: 'New', objects: [], shapes: [] })
		const first = models[0].id, renamed = before.map((m) => (m.id === first ? { ...m, name: 'renamed' } : m))
		setModels(renamed)
		expect(modelById(first)?.name).toBe('renamed')
		expect(modelById('t-new')?.name).toBe('New')   // not dropped (was: the whole array replaced → gone)
		setModels(before)
		removeModels(['t-new'])
	})
})
