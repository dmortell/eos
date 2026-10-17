// The EDIT HISTORY's Firestore part (design log step 4): `projects/{pid}/cadHistory`, one doc per settled edit made in
// this tab while the project's switch is on (settings.editHistory, off by default — User 2026-10-17: "might be too much
// data … try it but monitor"). Append-only; never read back into the store. What an entry is: domain/history.ts.
import { addDoc, collection, query, where, orderBy, limit, getDocs, getCountFromServer, writeBatch } from 'firebase/firestore'
import type { CadProject } from './project.svelte'
import type { Id } from '../domain/types'
import { historyEntry, newestFirst, type HistoryEntry } from '../domain/history'

const col = (p: CadProject) => collection(p.db, `projects/${p.pid}/cadHistory`)

/** Records this tab's edits while the switch is on; the returned function stops. A failed write is said once, not
 *  retried (the edit itself is saved either way). */
export function recordEdits(project: CadProject, say: (m: string) => void, workingOn: () => Id | null): () => void {
	let warned = false
	return project.store.subscribe((c) => {
		if (!project.settings?.editHistory || !project.user) return
		const e = historyEntry(c, { uid: project.user, name: project.userName }, Date.now(), workingOn())
		if (!e) return
		addDoc(col(project), e).catch((err) => { if (!warned) { warned = true; say(`Edit history: not written (${(err as Error).message})`) } })
	})
}

/** The edits that touched this item, newest first (at most `n`). */
export async function historyOf(project: CadProject, id: Id, n = 50): Promise<HistoryEntry[]> {
	// no orderBy with array-contains: that pair needs a composite index; one item's history is small, sorted here
	const snap = await getDocs(query(col(project), where('ids', 'array-contains', id)))
	return snap.docs.map((d) => d.data() as HistoryEntry).sort(newestFirst).slice(0, n)
}

/** The edits made for a change ("Working on" it), newest first. */
export async function historyForChange(project: CadProject, changeId: Id): Promise<HistoryEntry[]> {
	const snap = await getDocs(query(col(project), where('changeId', '==', changeId)))
	return snap.docs.map((d) => d.data() as HistoryEntry).sort(newestFirst)
}

/** The project's latest edits, newest first. */
export async function recentHistory(project: CadProject, n = 300): Promise<HistoryEntry[]> {
	const snap = await getDocs(query(col(project), orderBy('at', 'desc'), limit(n)))
	return snap.docs.map((d) => d.data() as HistoryEntry)
}

/** How many entries are kept. */
export async function historyCount(project: CadProject): Promise<number> {
	return (await getCountFromServer(col(project))).data().count
}

/** Delete the entries older than `days`; how many went. */
export async function trimHistory(project: CadProject, days: number): Promise<number> {
	const snap = await getDocs(query(col(project), where('at', '<', Date.now() - days * 864e5)))
	for (let i = 0; i < snap.docs.length; i += 400) {
		const b = writeBatch(project.db)
		for (const d of snap.docs.slice(i, i + 400)) b.delete(d.ref)
		await b.commit()
	}
	return snap.docs.length
}

/** " — for change 3" after an edit made while working on a change (step 5); '' otherwise (or that change is gone). */
export function forChange(project: CadProject, e: HistoryEntry): string {
	const c = e.changeId ? project.index.get(e.changeId) : undefined
	return c?.type === 'change' ? ` — for change ${c.n}` : ''
}
