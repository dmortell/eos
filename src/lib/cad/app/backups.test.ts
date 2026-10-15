// Backups and restore (ADR 0008, Review 2 Q62): waiting for the data to settle, a stored backup's round trip through
// chunk docs, restore as ONE undo step, owner / project checks, rename / delete, the file form. Fake Firestore.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settled, collect, previewRestore, applyRestore, storeBackup, loadBackup, renameBackup, deleteBackups, gzipText, readBackupFile, backupFileName, checkFile, type BackupHead } from './backups'
import { EntityStore } from '../store/store'
import { demoProject } from '../domain/fixtures'
import { exportProject, makeBackup } from '../persist/file'
import type { CadProject } from './project.svelte'
import type { Entity } from '../domain/drawing'
import type { Issue } from '../domain/drawing'

const fs = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }))

vi.mock('firebase/firestore', () => {
	const at = (c: { path: string } | { app?: unknown }, ...rest: string[]) => ({ path: [(c as { path?: string }).path, ...rest].filter(Boolean).join('/') })
	return {
		collection: (db: unknown, ...p: string[]) => at(db as object, ...p),
		doc: (c: { path?: string }, ...p: string[]) => at(c as { path: string }, ...p),
		getDocs: async (c: { path: string }) => ({
			docs: [...fs.docs].filter(([p]) => p.startsWith(`${c.path}/`) && !p.slice(c.path.length + 1).includes('/')).map(([p, v]) => ({ data: () => v, ref: { path: p } })),
		}),
		updateDoc: async (r: { path: string }, v: Record<string, unknown>) => { fs.docs.set(r.path, { ...fs.docs.get(r.path), ...v }) },
		writeBatch: () => {
			const ops: (() => void)[] = []
			return {
				set: (r: { path: string }, v: Record<string, unknown>) => { ops.push(() => fs.docs.set(r.path, structuredClone(v))) },
				delete: (r: { path: string }) => { ops.push(() => fs.docs.delete(r.path)) },
				commit: async () => { for (const o of ops) o() },
			}
		},
	}
})

type Fake = { loaded: boolean; pendingWrites: number; loadedLevels: Set<string> | 'all' }

function fakeProject(entities: Entity[], o: Partial<Fake> & { ownerId?: string; user?: string; pid?: string } = {}) {
	const store = new EntityStore()
	store.transact('seed', (tx) => { for (const e of entities) tx.put(e) })
	store.clearHistory()
	const st: Fake = { loaded: true, pendingWrites: 0, loadedLevels: 'all', ...o }
	const added: unknown[] = []
	const project = {
		store, db: {}, pid: o.pid ?? 'p', name: 'Proj', user: o.user ?? 'u1', userName: 'User', ownerId: o.ownerId,
		get loaded() { return st.loaded }, get pendingWrites() { return st.pendingWrites },
		levelLoaded: (id: string) => st.loadedLevels === 'all' || st.loadedLevels.has(id),
		blockOf: () => undefined,
		addMissingBlocks: async (b: unknown[]) => { added.push(...b); return b.length },
	} as unknown as CadProject
	return { project, store, st, added }
}

const demo = () => demoProject()
const levelsOf = (es: Entity[]) => es.filter((e) => e.type === 'level').map((e) => e.id)

beforeEach(() => { fs.docs.clear(); vi.useRealTimers() })

describe('settled', () => {
	it('returns at once when loaded with nothing pending', async () => {
		const { project } = fakeProject(demo())
		await expect(settled(project, 'all')).resolves.toBeUndefined()
	})
	it('waits for pending writes to finish', async () => {
		vi.useFakeTimers()
		const { project, st } = fakeProject(demo())
		st.pendingWrites = 2
		let done = false
		const p = settled(project, 'all').then(() => { done = true })
		await vi.advanceTimersByTimeAsync(500)
		expect(done).toBe(false)
		st.pendingWrites = 0
		await vi.advanceTimersByTimeAsync(200)
		await p
		expect(done).toBe(true)
	})
	it('gives up saying the changes are still saving, or that a model is still loading', async () => {
		vi.useFakeTimers()
		const a = fakeProject(demo()); a.st.pendingWrites = 1
		const pa = settled(a.project, 'all', 1000).catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(1500)
		expect(await pa).toMatch(/still saving/)
		const b = fakeProject(demo(), { loadedLevels: new Set() })
		const pb = settled(b.project, 'all', 1000).catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(1500)
		expect(await pb).toMatch(/still loading/)
	})
	it('for chosen models only those need to be loaded; a model not in the store is no reason to wait', async () => {
		const es = demo(), [first] = levelsOf(es)
		const { project } = fakeProject(es, { loadedLevels: new Set([first]) })
		await expect(settled(project, [first], 500)).resolves.toBeUndefined()
		await expect(settled(project, ['not-a-level'], 500)).resolves.toBeUndefined()
	})
})

describe('stored backups', () => {
	it('round-trips: head last, chunks complete, same entities back', async () => {
		const { project, store } = fakeProject(demo())
		const head = await storeBackup(project, '  First  ', 'all', { note: ' before the move ', issueId: 'I1' })
		expect(head).toMatchObject({ name: 'First', note: 'before the move', issueId: 'I1', parts: 'all', by: { uid: 'u1', name: 'User' } })
		expect(head.count).toBe(store.all().length)
		expect(fs.docs.has(`projects/p/cadBackups/${head.id}`)).toBe(true)
		expect([...fs.docs.keys()].filter((k) => k.includes('/chunks/')).length).toBe(head.chunks)
		const file = await loadBackup(project, head)
		expect(file.entities.map((e) => e.id).sort()).toEqual(store.all().map((e) => e.id).sort())
	})
	it('a blank name takes the parts label; chosen models are listed by name', async () => {
		const es = demo(), [first] = levelsOf(es)
		const { project } = fakeProject(es)
		const head = await storeBackup(project, '', [first])
		expect(head.name).toBeTruthy()
		expect(head.parts).toEqual([{ levelId: first, name: expect.any(String) }])
	})
	it('refuses an incomplete backup (a chunk missing)', async () => {
		const { project } = fakeProject(demo())
		const head = await storeBackup(project, 'x', 'all')
		const chunk = [...fs.docs.keys()].find((k) => k.includes('/chunks/'))!
		fs.docs.delete(chunk)
		await expect(loadBackup(project, head)).rejects.toThrow(/incomplete/)
	})
	it('refuses data that is not a backup', async () => {
		const { project } = fakeProject(demo())
		const head = await storeBackup(project, 'x', 'all')
		const chunk = [...fs.docs.keys()].find((k) => k.includes('/chunks/'))!
		fs.docs.set(chunk, { n: 0, json: '{"nope":' })
		await expect(loadBackup(project, { ...head, chunks: 1 })).rejects.toThrow()
	})
	it('collect refuses to back up with edits still saving', async () => {
		vi.useFakeTimers()
		const { project, st } = fakeProject(demo())
		st.pendingWrites = 1
		const p = collect(project, 'all').catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(31_000)
		expect(await p).toMatch(/still saving/)
		expect([...fs.docs.keys()]).toEqual([])
	})
	it('renames (trimmed) and deletes: heads and chunks go, an issue forgets its backup', async () => {
		const issue = { type: 'issue', id: 'I1', name: 'Tender', purpose: '', date: '2026-10-12', sheets: [], backupId: 'x' } as unknown as Issue
		const { project, store } = fakeProject([...demo(), issue])
		const head = await storeBackup(project, 'A', 'all', { issueId: 'I1' })
		store.transact('link', (tx) => tx.put({ ...(tx.get('I1') as Issue), backupId: head.id }))
		await renameBackup(project, head.id, ' B ', ' note ')
		expect(fs.docs.get(`projects/p/cadBackups/${head.id}`)).toMatchObject({ name: 'B', note: 'note' })
		await deleteBackups(project, [{ ...head, name: 'B' } as BackupHead])
		expect([...fs.docs.keys()]).toEqual([])
		expect((store.get('I1') as Issue).backupId).toBeUndefined()
	})
})

describe('restore', () => {
	it('only the owner restores; a project with no owner lets anyone', async () => {
		const { project } = fakeProject(demo(), { ownerId: 'boss', user: 'u1' })
		const file = makeBackup(project.store.all(), 'all', { project: { id: 'p', name: 'Proj' } })
		await expect(applyRestore(project, file, 'all', 'x')).rejects.toThrow(/Only the project owner/)
		const open = fakeProject(demo())
		await expect(applyRestore(open.project, makeBackup(open.store.all(), 'all'), 'all', 'x')).resolves.toBeTruthy()
	})
	it('refuses a backup from another project', async () => {
		const { project } = fakeProject(demo())
		const file = exportProject(demo(), { id: 'other', name: 'Other site' })
		expect(() => checkFile(project, file)).toThrow(/Other site, not this project/)
		await expect(previewRestore(project, file, 'all')).rejects.toThrow(/not this project/)
		expect(() => checkFile(project, exportProject(demo()))).not.toThrow()   // a file with no project id is fine
	})
	it('brings back what was deleted and removes what was added since, as ONE undo step; undo returns to before', async () => {
		const { project, store } = fakeProject(demo())
		const file = makeBackup(store.all(), 'all', { project: { id: 'p', name: 'Proj' } })
		const some = store.all().find((e) => e.type === 'outlet')!
		store.transact('Delete outlet', (tx) => tx.del(some.id))
		store.transact('Add junk', (tx) => tx.put({ ...some, id: 'junk' } as Entity))
		const undoBefore = store.canUndo
		const p = await applyRestore(project, file, 'all', 'Backup 1')
		expect(p.plan.put.length + p.plan.del.length).toBeGreaterThan(0)
		expect(store.has(some.id)).toBe(true)
		expect(store.has('junk')).toBe(false)
		store.undo()
		expect(store.has(some.id)).toBe(false)     // one step back: the state before the restore
		expect(store.has('junk')).toBe(true)
		expect(undoBefore).toBe(true)
	})
	it('restoring an unchanged project changes nothing', async () => {
		const { project, store } = fakeProject(demo())
		const file = makeBackup(store.all(), 'all')
		const p = await previewRestore(project, file, 'all')
		expect(p.plan.put).toEqual([])
		expect(p.plan.del).toEqual([])
	})
	it('adds the blocks the backup carries that the library lacks', async () => {
		const { project, store, added } = fakeProject(demo())
		const file = { ...makeBackup(store.all(), 'all'), library: { blocks: [{ type: 'block', id: 'b9', name: 'B', scope: 'global', shapes: [] }] } } as never
		await applyRestore(project, file, 'all', 'x')
		expect(added).toHaveLength(1)
	})
})

describe('as a file', () => {
	it('gzip round-trips, and a plain JSON file reads as it is', async () => {
		const text = JSON.stringify({ a: 'é'.repeat(1000) })
		const gz = await gzipText(text)
		expect(gz.size).toBeLessThan(text.length)
		expect(await readBackupFile(gz)).toBe(text)
		expect(await readBackupFile(new Blob([text]))).toBe(text)
	})
	it('file names have no characters Windows rejects', () => {
		expect(backupFileName('A/B: C', '1F?', new Date(2026, 9, 8, 14, 2))).toBe('A_B_ C 1F_ 2026-10-08 1402.eoscad')
	})
})
