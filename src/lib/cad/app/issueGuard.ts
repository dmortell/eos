// Protect issued uploads (backlog, Dave 2026-10-04): an issued drawing keeps its floorplan only as a reference to the
// file + page (`underlay:<fileId>#<page>` in the frozen copy, domain/issue.ts) and its package PDF as a file; deleting
// or replacing either file would change or blank old issues. Uploads asks here before a delete or a same-name upload.
// Reads the frozen copies (only when a file is deleted / replaced, which is rare).
import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore'
import { UNDERLAY_REF } from '../domain/issue'
import { freeFileId } from './projectFiles'

/**
 * The file id (= name) for a new upload: its own name — replacing a file of that name keeps its Uploads calibration,
 * as before — unless issued drawings use that file: then a free name beside it ("plan (2).pdf"), `kept` = the old one
 * stays as issued.
 */
export async function uploadId(db: Firestore, name: string): Promise<{ id: string; kept?: string[] }> {
	const old = await getDoc(doc(db, 'files', name))
	if (!old.exists()) return { id: name }
	const x = old.data() as { projectId?: string; projectIds?: string[] }
	const used = await issuesUsingFile(db, name, x.projectIds?.length ? x.projectIds : x.projectId ? [x.projectId] : [])
	return used.length ? { id: await freeFileId(db, name), kept: used } : { id: name }
}

/** The names of the issues (in these projects) that use the file — as a floorplan in a frozen sheet, or as the
 *  package PDF. [] = none: it can go. */
export async function issuesUsingFile(db: Firestore, fileId: string, pids: string[]): Promise<string[]> {
	const names = new Set<string>(), needle = `${UNDERLAY_REF}${fileId}#`
	for (const pid of pids) {
		const issues = new Map<string, string>()
		;(await getDocs(query(collection(db, 'projects', pid, 'cadEntities'), where('type', '==', 'issue')))).forEach((d) => {
			const x = d.data() as { id?: string; name?: string; file?: { id?: string } }
			issues.set(x.id ?? d.id, x.name ?? 'a release')
			if (x.file?.id === fileId) names.add(x.name ?? 'a release')
		})
		if (!issues.size) continue
		// frozen copies: a head per (sheet, rev) names its issue; its parts hold the display list as JSON text
		const heads = new Map<string, string>(), hits = new Set<string>()
		;(await getDocs(collection(db, 'projects', pid, 'cadIssued'))).forEach((d) => {
			const x = d.data() as { issueId?: string; json?: string }
			if (x.issueId) heads.set(d.id, x.issueId)
			if (typeof x.json === 'string' && x.json.includes(needle)) hits.add(d.id.replace(/~p\d+$/, ''))
		})
		for (const k of hits) { const iss = heads.get(k); if (iss) names.add(issues.get(iss) ?? 'a release') }
	}
	return [...names]
}
