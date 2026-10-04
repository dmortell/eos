// The project's uploaded PDFs, live (for picking a level's floorplan). A file belongs to a project through the legacy
// `projectId` or the newer `projectIds` list ($lib/files.ts), so both are watched and merged. Issue PDFs (no page
// count) are left out.
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore'

export interface PdfFile {
	id: string
	name: string
	pageCount: number
	/** Per page: calibrated in Uploads (origin + scale) — only those can be placed. */
	calibrated: Record<number, boolean>
}

export function watchProjectPdfs(db: Firestore, pid: string, cb: (files: PdfFile[]) => void): () => void {
	const parts: Record<'legacy' | 'members', Map<string, PdfFile>> = { legacy: new Map(), members: new Map() }
	const emit = () => cb([...new Map([...parts.legacy, ...parts.members]).values()].sort((a, b) => a.name.localeCompare(b.name)))
	const listen = (k: 'legacy' | 'members', q: ReturnType<typeof query>) => onSnapshot(q, (s) => {
		parts[k] = new Map()
		s.forEach((d) => {
			const x = d.data() as { name?: string; pageCount?: number; pages?: Record<string, { origin?: unknown; scale?: { scale?: number } }> }
			if (!x.pageCount) return
			const calibrated: Record<number, boolean> = {}
			for (let n = 1; n <= x.pageCount; n++) { const p = x.pages?.[n]; calibrated[n] = !!(p?.origin && p?.scale?.scale) }
			parts[k].set(d.id, { id: d.id, name: x.name ?? d.id, pageCount: x.pageCount, calibrated })
		})
		emit()
	})
	const files = collection(db, 'files')
	const offs = [listen('legacy', query(files, where('projectId', '==', pid))), listen('members', query(files, where('projectIds', 'array-contains', pid)))]
	return () => offs.forEach((off) => off())
}
