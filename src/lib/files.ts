/**
 * Cross-project file membership helpers.
 *
 * A `files/{id}` doc can belong to multiple projects. Membership is the
 * `projectIds: string[]` array; the legacy scalar `projectId` is kept in sync
 * as `projectIds[0]` so pre-membership docs and old queries keep working.
 * Docs written before this feature have only `projectId` — treat that as a
 * single-member list. When `projectIds` exists it is authoritative.
 *
 * Because membership spans two fields, per-project queries must union an
 * equality query on `projectId` (legacy docs) with an array-contains query on
 * `projectIds` — use `subscribeProjectFiles` instead of hand-rolling that.
 */

import type { Firestore, DocWithId } from '$lib'

/**
 * Doc shape shared by every file-list consumer. Deliberately minimal — no
 * index signature, so callers' concrete FileDoc interfaces stay assignable.
 */
export interface MemberFileDoc {
	id: string
	projectId?: string
	projectIds?: string[]
}

/** Full membership of a file: `projectIds` when present, else the legacy scalar. */
export function fileProjectIds(f: MemberFileDoc): string[] {
	if (Array.isArray(f.projectIds) && f.projectIds.length) return f.projectIds
	return f.projectId ? [f.projectId] : []
}

/** True if the file belongs to the given project. */
export function fileInProject(f: MemberFileDoc, pid: string): boolean {
	return fileProjectIds(f).includes(pid)
}

/** True if the file belongs to more than one project. */
export function fileIsShared(f: MemberFileDoc): boolean {
	return fileProjectIds(f).length > 1
}

/**
 * Firestore payload that sets a file's membership. Keeps the invariant
 * `projectId === projectIds[0]` so legacy equality queries still match.
 */
export function membershipPayload(id: string, members: string[]): { id: string; projectId: string; projectIds: string[] } {
	const projectIds = [...new Set(members)].filter(Boolean)
	return { id, projectId: projectIds[0] ?? '', projectIds }
}

/**
 * Real-time subscription to every file belonging to a project, across both the
 * legacy `projectId` field and the `projectIds` membership array. Results are
 * deduped by id and post-filtered through `fileInProject` (a doc whose stale
 * `projectId` still matches but whose authoritative `projectIds` no longer
 * includes the project is excluded).
 */
export function subscribeProjectFiles(db: Firestore, pid: string, callback: (files: DocWithId[]) => void): () => void {
	let legacy: DocWithId[] = []
	let members: DocWithId[] = []
	const emit = () => {
		const map = new Map<string, DocWithId>()
		for (const f of [...legacy, ...members]) {
			if (f.id && fileInProject(f as MemberFileDoc, pid)) map.set(f.id, f)
		}
		callback([...map.values()])
	}
	const unsubLegacy = db.subscribeWhere('files', 'projectId', pid, data => { legacy = data; emit() })
	const unsubMembers = db.subscribeWhereContains('files', 'projectIds', pid, data => { members = data; emit() })
	return () => { unsubLegacy?.(); unsubMembers?.() }
}
