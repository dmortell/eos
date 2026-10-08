// Backups, the app part (ADR 0008): take one from the store, and restore one into it as ONE undo step. What a part
// holds and what a restore changes are worked out in the domain (backupParts.ts, restorePlan.ts); this waits for the
// data to be complete and writes.
import type { CadProject } from './project.svelte'
import type { Id, Level } from '../domain/types'
import type { Issue } from '../domain/drawing'
import { makeBackup, readProjectFile, type ProjectFile } from '../persist/file'
import { partsLabel, type Parts } from '../domain/backupParts'
import { restorePlan, restoreSummary, canRestore, type RestorePlan } from '../domain/restorePlan'
import { splitChunks } from '../persist/chunks'
import { newId } from '../domain/ids'
import { collection, doc, getDocs, writeBatch, updateDoc } from 'firebase/firestore'

/** Wait until the store holds the parts as the server has them: the project and the chosen models loaded, and none
 *  of this tab's own edits still on the way. */
export async function settled(project: CadProject, parts: Parts, timeoutMs = 30_000): Promise<void> {
	const until = Date.now() + timeoutMs
	const ready = () => {
		if (!project.loaded || project.pendingWrites > 0) return false
		const ids: Id[] = parts === 'all' ? project.store.ofType('level').map((l) => l.id) : parts
		return ids.every((id) => !project.store.has(id) || project.levelLoaded(id))
	}
	while (!ready()) {
		if (Date.now() > until) throw new Error(project.pendingWrites > 0 ? 'Your last changes are still saving — try again in a moment' : 'The models are still loading — try again in a moment')
		await new Promise((r) => setTimeout(r, 100))
	}
}

/** A backup of `parts`, as it is on the server now. */
export async function collect(project: CadProject, parts: Parts): Promise<ProjectFile> {
	await settled(project, parts)
	return makeBackup(project.store.all(), parts, { project: { id: project.pid, name: project.name }, by: { uid: project.user, name: project.userName }, blockOf: project.blockOf })
}

export interface RestorePreview { plan: RestorePlan; line: string; skipped: string[]; label: string }

/** What restoring `parts` of a backup would change, without writing anything. */
export async function previewRestore(project: CadProject, file: ProjectFile, parts: Parts): Promise<RestorePreview> {
	checkFile(project, file)
	await settled(project, parts)
	const plan = restorePlan(project.store.all(), file.entities, parts)
	return { plan, ...restoreSummary(plan, file.entities, parts), label: partsLabel(file.entities, parts) }
}

/** Restore `parts` of a backup: ONE undo step ("Restore 33F 3303 from …"). The plan is worked out again here, so an
 *  edit made since the preview is restored too. Returns the summary. */
export async function applyRestore(project: CadProject, file: ProjectFile, parts: Parts, what: string): Promise<RestorePreview> {
	if (!canRestore(project.ownerId, project.user)) throw new Error('Only the project owner can restore this project')
	const p = await previewRestore(project, file, parts)
	await project.addMissingBlocks(file.library?.blocks ?? [])
	project.store.transact(`Restore ${p.label} from ${what}`, (tx) => {
		for (const id of p.plan.del) tx.del(id)
		for (const e of p.plan.put) tx.put(e)
	})
	return p
}

// ── Stored backups (`projects/{pid}/cadBackups/{id}` + `/chunks/{n}`, ADR 0008 §3) ──────────────────────────────

/** A stored backup's head: what the Backups window lists (the data is in its chunks). */
export interface BackupHead {
	id: Id
	name: string
	note?: string
	by: { uid: string; name: string }
	at: number
	/** 'all', or the models it holds with their names then. */
	parts: 'all' | { levelId: Id; name: string }[]
	/** Entities, JSON characters, chunk docs. */
	count: number
	bytes: number
	chunks: number
	/** The issue it was made with (ADR 0008 §7). */
	issueId?: Id
}

export const backupsCol = (p: CadProject) => collection(p.db, 'projects', p.pid, 'cadBackups')
const chunksCol = (p: CadProject, id: Id) => collection(p.db, 'projects', p.pid, 'cadBackups', id, 'chunks')

/** Back up `parts` into the project. The chunks go first and the head last, so the list never shows half of one. */
export async function storeBackup(project: CadProject, name: string, parts: Parts, o: { note?: string; issueId?: Id } = {}): Promise<BackupHead> {
	const file = await collect(project, parts)
	const json = JSON.stringify(file), chunks = splitChunks(json), id = newId()
	for (let i = 0; i < chunks.length; i += 8) {           // ≤ 2.4 M characters a batch, under its 10 MB limit
		const b = writeBatch(project.db)
		chunks.slice(i, i + 8).forEach((c, k) => b.set(doc(chunksCol(project, id), String(i + k)), { n: i + k, json: c }))
		await b.commit()
	}
	const levels = new Map(file.entities.filter((e): e is Level => e.type === 'level').map((l) => [l.id, l.name]))
	const head: BackupHead = {
		id, name: name.trim() || partsLabel(file.entities, parts), by: file.by!, at: Date.now(),
		parts: parts === 'all' ? 'all' : parts.map((levelId) => ({ levelId, name: levels.get(levelId) ?? levelId })),
		count: file.entities.length, bytes: json.length, chunks: chunks.length,
		...(o.note?.trim() ? { note: o.note.trim() } : {}), ...(o.issueId ? { issueId: o.issueId } : {}),
	}
	const b = writeBatch(project.db)
	b.set(doc(backupsCol(project), id), head)
	await b.commit()
	return head
}

/** A stored backup's data, as a file. */
export async function loadBackup(project: CadProject, head: BackupHead): Promise<ProjectFile> {
	const docs = (await getDocs(chunksCol(project, head.id))).docs.map((d) => d.data() as { n: number; json: string }).sort((a, b) => a.n - b.n)
	if (docs.length !== head.chunks) throw new Error(`The backup "${head.name}" is incomplete (${docs.length} of ${head.chunks} parts)`)
	const r = readProjectFile(docs.map((d) => d.json).join(''))
	if (r.error || !r.file) throw new Error(r.error ?? 'Not a backup')
	return r.file
}

export async function renameBackup(project: CadProject, id: Id, name: string, note: string): Promise<void> {
	await updateDoc(doc(backupsCol(project), id), { name: name.trim(), note: note.trim() })
}

/** Delete backups (heads first, so the list drops them at once; then their chunks). An issue that pointed at one
 *  forgets it (it can still be reprinted). Not undoable. */
export async function deleteBackups(project: CadProject, heads: BackupHead[]): Promise<void> {
	const ids = new Set(heads.map((h) => h.id))
	const b = writeBatch(project.db)
	for (const h of heads) b.delete(doc(backupsCol(project), h.id))
	await b.commit()
	for (const h of heads) {
		const cs = (await getDocs(chunksCol(project, h.id))).docs
		for (let i = 0; i < cs.length; i += 400) { const cb = writeBatch(project.db); cs.slice(i, i + 400).forEach((d) => cb.delete(d.ref)); await cb.commit() }
	}
	const issues = project.store.ofType('issue').filter((i) => i.backupId && ids.has(i.backupId))
	if (issues.length) project.store.transact('Forget deleted backups', (tx) => { for (const i of issues) { const { backupId: _, ...rest } = i; tx.put(rest as Issue) } })
}

// ── As a file (.eoscad = gzipped JSON) ──────────────────────────────────────────────────────────────────────────

export async function gzipText(text: string): Promise<Blob> {
	return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
}

/** A backup file's text: gzipped (as downloaded) or plain JSON. */
export async function readBackupFile(f: Blob): Promise<string> {
	const head = new Uint8Array(await f.slice(0, 2).arrayBuffer())
	if (head[0] !== 0x1f || head[1] !== 0x8b) return f.text()
	return new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

/** "Test Project 33F 3303 2026-10-08 1402.eoscad" */
export function backupFileName(projectName: string, label: string, at = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0')
	const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}${p(at.getMinutes())}`
	return `${`${projectName} ${label} ${stamp}`.replace(/[\\/:*?"<>|]+/g, '_').trim()}.eoscad`
}

/** Restores go into the project the backup came from (ADR 0008 §5). */
export function checkFile(project: CadProject, file: ProjectFile): void {
	if (file.project?.id && file.project.id !== project.pid) throw new Error(`This backup is from ${file.project.name || file.project.id}, not this project`)
}
