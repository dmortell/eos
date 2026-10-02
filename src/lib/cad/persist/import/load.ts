// Fetch a project's legacy tool docs for the importer. READ-ONLY: getDoc / getDocs by the doc-id conventions.
import { collection, doc, documentId, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore'
import type { LegacySource } from './ctx'

async function docsFor(db: Firestore, coll: string, pid: string): Promise<Record<string, unknown>> {
	// Every per-floor doc id starts `${pid}_F`; '_G' is the next prefix up, so this is a range scan on the id.
	const q = query(collection(db, coll), where(documentId(), '>=', `${pid}_F`), where(documentId(), '<', `${pid}_G`))
	const snap = await getDocs(q)
	return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

export async function loadLegacy(db: Firestore, pid: string): Promise<LegacySource> {
	const project = (await getDoc(doc(db, 'projects', pid))).data()
	const [frames, racks, patching, outlets] = await Promise.all(['frames', 'racks', 'patching', 'outlets'].map((c) => docsFor(db, c, pid)))
	return { pid, project, frames, racks, patching, outlets } as LegacySource
}
