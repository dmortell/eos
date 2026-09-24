import { describe, it, expect } from 'vitest'
import { PagesStore, type StoreDb } from './pagesStore.svelte'
import type { DocWithId } from '$lib/db.svelte'

// An in-memory Firestore double: records writes, lets the test push snapshots to the subscribers.
function fakeDb() {
	const one: Record<string, (d: DocWithId) => void> = {}, many: Record<string, (d: DocWithId[]) => void> = {}
	const writes: { path: string; data: DocWithId }[] = [], deletes: string[] = []
	const db: StoreDb = {
		subscribeOne: (t, id, cb) => { one[`${t}/${id}`] = cb; return () => { delete one[`${t}/${id}`] } },
		subscribeWhere: (p, _f, _v, cb) => { many[p] = cb; return () => { delete many[p] } },
		subscribeMany: (p, cb) => { many[p] = cb; return () => { delete many[p] } },
		saveFields: async (path, data) => { writes.push({ path, data: JSON.parse(JSON.stringify(data)) }) },
		replace: async (path, data) => { writes.push({ path, data: JSON.parse(JSON.stringify(data)), replace: true } as never) },
		delete: async (path, id) => { deletes.push(`${path}/${id}`) },
	}
	return { db, writes, deletes, pushOne: (k: string, d: DocWithId) => one[k]?.(d), pushMany: (p: string, d: DocWithId[]) => many[p]?.(d) }
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

describe('PagesStore', () => {
	const P = 'proj1'
	const boot = () => {
		const f = fakeDb(), s = new PagesStore(f.db, P, 'dave', { delayMs: 1 })
		s.start()
		f.pushOne(`projects/${P}`, { id: P, name: 'X' })
		f.pushMany(`projects/${P}/drawings`, [])
		f.pushMany(`projects/${P}/models`, [])
		return { f, s }
	}
	it('is ready once all three sources have loaded; a project with no Pages data has project = null', () => {
		const { s } = boot()
		expect(s.status).toBe('ready'); expect(s.project).toBeNull(); expect(s.sheets).toEqual([])
	})
	it('saves places into the `pages` field of projects/{pid} (and ignores the echo)', async () => {
		const { f, s } = boot()
		s.savePlaces([{ id: 'a', name: 'Bldg', parentId: null, order: 0 }])
		await tick()
		expect(f.writes).toEqual([{ path: 'projects', data: { id: P, pages: { places: [{ id: 'a', name: 'Bldg', parentId: null, order: 0 }] } } }])
		const before = s.project
		f.pushOne(`projects/${P}`, { id: P, pages: { places: [{ order: 0, parentId: null, name: 'Bldg', id: 'a' }] } })
		expect(s.project).toBe(before)   // the echo does not replace local state
	})
	it('overwriting a revision made current again rewrites ITS version, never a newer one (B6)', async () => {
		const { f, s } = boot()
		const sh = s.createSheet({ title: 'A', placeId: 'p1' })
		expect(await s.issueSheet(sh.id, { note: '', overwrite: false, models: [], code: 'P1' })).toBe('P1')
		expect(await s.issueSheet(sh.id, { note: '', overwrite: false, models: [], code: 'P2' })).toBe('P2')
		s.setCurrentRevision(sh.id, 'P1', '2026-01-01')
		f.writes.length = 0
		expect(await s.issueSheet(sh.id, { note: 'fix', overwrite: true, models: [] })).toBe('P1')
		const vers = f.writes.filter((w) => w.path.endsWith('/versions')).map((w) => w.data.id), revs = f.writes.filter((w) => w.path.endsWith('/revisions')).map((w) => [w.data.id, w.data.fromVersionId])
		expect(vers).toEqual(['v1']); expect(revs).toEqual([['rP1', 'v1']])
		expect(s.sheets.find((x) => x.id === sh.id)?.currentVersionNumber).toBe(2)   // the next NEW issue is v3
	})
	it('seeds places once, never over existing ones', () => {
		const { s } = boot()
		const input = { project: { id: P, floors: [{ number: 3 }] }, racks: {}, risers: [], drawings: [] }
		expect(s.seedPlaces(input)).toBe(true)
		expect(s.places.map((p) => p.name)).toEqual(['Other building', '3F', 'Room A'])
		expect(s.project?.seededAt).toBeTruthy()
		expect(s.seedPlaces(input)).toBe(false)
	})
	it('creates sheets at the end of their place, as registry entries with toolType pages', async () => {
		const { f, s } = boot()
		const a = s.createSheet({ title: 'A', placeId: 'p1' }), b = s.createSheet({ title: 'B', placeId: 'p1' }), c = s.createSheet({ title: 'C', placeId: 'p2' })
		expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 0])
		expect(s.sheetsIn('p1').map((x) => x.title)).toEqual(['A', 'B'])
		await tick()
		expect(f.writes.filter((w) => w.path === `projects/${P}/drawings`).map((w) => [w.data.toolType, w.data.drawingNumber, w.data.createdBy]))
			.toEqual([['pages', '', 'dave'], ['pages', '', 'dave'], ['pages', '', 'dave']])
	})
	it('applies a remote sheet change, keeps a pending local one, and drops a remotely deleted sheet', async () => {
		const { f, s } = boot()
		const a = s.createSheet({ title: 'A', placeId: null })
		await tick()
		f.pushMany(`projects/${P}/drawings`, [{ ...a, title: 'Renamed elsewhere' }])
		expect(s.sheets[0].title).toBe('Renamed elsewhere')
		s.saveSheet({ ...s.sheets[0], title: 'Mine' })   // pending
		f.pushMany(`projects/${P}/drawings`, [{ ...a, title: 'Theirs' }])
		expect(s.sheets[0].title).toBe('Mine')
		await tick()
		f.pushMany(`projects/${P}/drawings`, [])
		expect(s.sheets).toEqual([])
	})
	it('hard-deletes only archived sheets', async () => {
		const { f, s } = boot()
		const a = s.createSheet({ title: 'A', placeId: null })
		expect(await s.hardDeleteSheet(a.id)).toBe(false)
		s.setSheetStatus(a.id, 'archived')
		expect(await s.hardDeleteSheet(a.id)).toBe(true)
		expect(f.deletes).toEqual([`projects/${P}/drawings/${a.id}`]); expect(s.sheets).toEqual([])
	})
	it('reports REMOTE model changes and deletions to onModels — never the echo of its own save', async () => {
		const f = fakeDb(), calls: [string[], string[]][] = []
		const s = new PagesStore(f.db, P, 'dave', { delayMs: 1, onModels: (c, r) => calls.push([c.map((d) => d.id), r]) })
		s.start()
		const path = `projects/${P}/models`
		f.pushMany(path, [{ id: 'a', name: 'A', objects: [] }])
		expect(calls).toEqual([[['a'], []]])
		s.saveModel({ id: 'b', name: 'B', objects: [] })
		await tick()
		f.pushMany(path, [{ id: 'a', name: 'A', objects: [] }, { id: 'b', name: 'B', objects: [] }])   // b = our own echo, a unchanged
		expect(calls).toHaveLength(1)
		f.pushMany(path, [{ id: 'b', name: 'B renamed elsewhere', objects: [] }])                    // a deleted remotely, b changed
		expect(calls[1]).toEqual([['b'], ['a']])
	})
	it('saves models one doc each under projects/{pid}/models', async () => {
		const { f, s } = boot()
		const m = s.createModel({ name: '33F', placeId: 'p1', kind: 'floor' })
		s.setModelArchived(m.id, true)
		await tick()
		const w = f.writes.filter((x) => x.path === `projects/${P}/models`)
		expect(w).toHaveLength(1)
		expect((w[0] as { replace?: boolean }).replace).toBe(true)   // models are overwritten whole, never merged
		expect(w[0].data).toMatchObject({ id: m.id, name: '33F', placeId: 'p1', kind: 'floor', archived: true, objects: [] })
	})
})
