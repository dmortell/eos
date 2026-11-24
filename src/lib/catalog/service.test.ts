import { describe, expect, it } from 'vitest'
import type { Firestore } from '$lib/db.svelte'
import { loadCatalog } from './service'
import { PANDUIT_SEED } from './panduitSeed'

const db = (docs: unknown[] | Error) => ({ getMany: async () => { if (docs instanceof Error) throw docs; return docs } }) as unknown as Firestore

describe('loadCatalog (backlog 55: the rack BOM counts custom products)', () => {
	it('adds the custom products to the seed', async () => {
		const c = await loadCatalog(db([{ id: 'acme-r1', maker: 'Acme', sku: 'R1', kind: 'rack', description: 'Acme rack' }, { id: 'bad' }]))
		expect(c.length).toBe(PANDUIT_SEED.length + 1)
		expect(c.find((p) => p.id === 'acme-r1')?.seeded).toBe(false)
	})
	it('falls back to the seed when the custom list cannot be read', async () => {
		expect((await loadCatalog(db(new Error('offline')))).length).toBe(PANDUIT_SEED.length)
	})
})
