// Issuing (Review 2 Q61): the sheets are re-read when the run starts, a revision already issued can't be frozen again
// (checked inside the transaction), a stale preview can't overwrite a newer one. Firestore is a small in-memory fake.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { freshSheets, issuePackage, saveFrozen } from './issue'
import { runToken } from './runToken'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import type { Issue, Sheet } from '../domain/drawing'
import type { CadProject } from './project.svelte'

const db = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), txWrites: 0 }))

vi.mock('firebase/firestore', () => ({
	doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
	getDoc: async (r: { path: string }) => ({ data: () => db.docs.get(r.path), exists: () => db.docs.has(r.path) }),
	runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
		const pending = new Map<string, Record<string, unknown>>()
		await fn({ get: async (r: { path: string }) => ({ data: () => db.docs.get(r.path) }), set: (r: { path: string }, v: Record<string, unknown>) => { pending.set(r.path, v) } })
		for (const [p, v] of pending) { db.docs.set(p, v); db.txWrites++ }
	},
}))
vi.mock('./projectFiles', () => ({ storeFile: vi.fn() }))

const sheet = (id: string, revisions?: Sheet['revisions']): Sheet => ({
	type: 'sheet', id, number: id, title: `${id} plan`, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active', ...(revisions ? { revisions } : {}),
})
const issue = (id: string): Issue => ({ type: 'issue', id, name: `Issue ${id}`, purpose: '', date: '2026-10-12', sheets: [] }) as Issue
const form = { name: 'Tender', purpose: 'For tender', date: '2026-10-12', first: 'A' }

function fakeProject(...entities: (Sheet | Issue)[]) {
	const store = new EntityStore()
	store.transact('seed', (tx) => { for (const e of entities) tx.put(e) })
	const project = {
		store, db: {}, pid: 'p', name: 'Proj', settings: undefined, blockOf: () => undefined, sheetBase: { projectName: 'Proj' },
		get index() { return new ProjectIndex(store.all()) },
		pdf: { placed: async () => undefined, placement: () => undefined, lookOfRef: () => '' },
	} as unknown as CadProject
	return { project, store }
}

beforeEach(() => { db.docs.clear(); db.txWrites = 0 })

describe('freshSheets', () => {
	it('returns the store’s sheets, in the listed order, not the copies taken when the panel opened', () => {
		const { project, store } = fakeProject(sheet('S1'), sheet('S2'))
		store.transact('edit', (tx) => tx.put({ ...(tx.get('S2') as Sheet), title: 'renamed' }))
		const got = freshSheets(project, [sheet('S2'), sheet('S1')])
		expect(got.map((s) => s.id)).toEqual(['S2', 'S1'])
		expect(got[0].title).toBe('renamed')
	})
	it('a sheet deleted meanwhile is an error that names it', () => {
		const { project } = fakeProject(sheet('S1'))
		expect(() => freshSheets(project, [sheet('S1'), sheet('GONE')])).toThrow(/GONE no longer exists/)
	})
})

describe('issuePackage starts from the sheets as they are now', () => {
	it('a code that was free when the panel opened but was issued since is refused before anything is written', async () => {
		const stale = sheet('S1')                                              // what the panel holds: no revisions
		const { project } = fakeProject(sheet('S1', [{ code: 'A', date: '2026-10-11', hash: 'x' }]))   // someone issued A meanwhile
		await expect(issuePackage(project, [stale], { ...form, codes: { S1: 'A' } })).rejects.toThrow(/S1 already has revision A/)
		expect(db.docs.size).toBe(0)
	})
	it('a sheet deleted since the panel opened stops the issue', async () => {
		const { project } = fakeProject(sheet('S1'))
		await expect(issuePackage(project, [sheet('S1'), sheet('S2')], form)).rejects.toThrow(/S2 no longer exists/)
		expect(db.docs.size).toBe(0)
	})
	it('a revision whose frozen copy a recorded issue holds is refused up front, before the backup or any write', async () => {
		const { project } = fakeProject(sheet('S1'), issue('I1'))
		db.docs.set('projects/p/cadIssued/S1~A', { sheetId: 'S1', rev: 'A', issueId: 'I1', parts: 1 })
		await expect(issuePackage(project, [sheet('S1')], { ...form, backup: true })).rejects.toThrow(/S1: revision A was already issued \(Issue I1\)/)
		expect(db.txWrites).toBe(0)
	})
})

describe('saveFrozen', () => {
	it('writes the head and its parts in one transaction', async () => {
		const { project } = fakeProject(sheet('S1'))
		await saveFrozen(project, sheet('S1'), 'A', 'I9', [])
		expect(db.docs.get('projects/p/cadIssued/S1~A')).toMatchObject({ sheetId: 'S1', rev: 'A', issueId: 'I9', parts: 1 })
		expect(db.docs.has('projects/p/cadIssued/S1~A~p0')).toBe(true)
	})
	it('never overwrites another recorded issue’s frozen copy — nothing of the new one is written', async () => {
		const { project } = fakeProject(sheet('S1'), issue('I1'))
		await saveFrozen(project, sheet('S1'), 'A', 'I1', [])
		const before = JSON.stringify([...db.docs])
		await expect(saveFrozen(project, sheet('S1'), 'A', 'I2', [])).rejects.toThrow(/already issued/)
		expect(JSON.stringify([...db.docs])).toBe(before)
	})
	it('replaces a copy left by an issue that was never recorded (its upload failed), so a retry can use the code', async () => {
		const { project } = fakeProject(sheet('S1'))
		await saveFrozen(project, sheet('S1'), 'A', 'FAILED-RUN', [])
		await saveFrozen(project, sheet('S1'), 'A', 'I2', [])
		expect(db.docs.get('projects/p/cadIssued/S1~A')).toMatchObject({ issueId: 'I2' })
	})
})

describe('runToken', () => {
	it('only the newest run is current; cancel ends them all', () => {
		const runs = runToken()
		const a = runs.start(), b = runs.start()
		expect(a()).toBe(false)
		expect(b()).toBe(true)
		runs.cancel()
		expect(b()).toBe(false)
	})
	it('a slow older preview finishing after a newer one does not replace it', async () => {
		const runs = runToken()
		let shown = ''
		const preview = (label: string, ms: number) => {
			const current = runs.start()
			return new Promise<void>((r) => setTimeout(r, ms)).then(() => { if (current()) shown = label })
		}
		await Promise.all([preview('slow, first typed', 20), preview('fast, last typed', 2)])
		expect(shown).toBe('fast, last typed')
	})
})
