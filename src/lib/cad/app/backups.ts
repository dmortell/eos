// Backups, the app part (ADR 0008): take one from the store, and restore one into it as ONE undo step. What a part
// holds and what a restore changes are worked out in the domain (backupParts.ts, restorePlan.ts); this waits for the
// data to be complete and writes.
import type { CadProject } from './project.svelte'
import type { Id } from '../domain/types'
import { makeBackup, type ProjectFile } from '../persist/file'
import { partsLabel, type Parts } from '../domain/backupParts'
import { restorePlan, restoreSummary, canRestore, type RestorePlan } from '../domain/restorePlan'

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
