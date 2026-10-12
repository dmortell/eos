// Fetch a project's legacy DRAWINGS for File › Import legacy drawings. READ-ONLY: getDoc / getDocs only.
//   projects/{pid}/models/{id}   Pages models (3D objects, 2D shapes, layers)
//   projects/{pid}/sheets/{id}   Sheets-tool sheets (paper, title block, viewports with annotations)
//   models3d/{pid}               the Sheets tool's model3d models (names + layers, for its viewports)
//   projects/{pid}.sheetLayers   the Sheets tool's own layers
import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore'
import type { DrawingsSource, PagesModel, LegacySheetDoc } from './drawings'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
export async function loadLegacyDrawings(db: Firestore, pid: string): Promise<DrawingsSource> {
	const [models, sheets, m3d, project] = await Promise.all([
		getDocs(collection(db, 'projects', pid, 'models')),
		getDocs(collection(db, 'projects', pid, 'sheets')),
		getDoc(doc(db, 'models3d', pid)),
		getDoc(doc(db, 'projects', pid)),
	])
	const models3d = ((m3d.data()?.models ?? []) as any[]).map((m) => ({ id: Number(m.id), name: String(m.name ?? ''), layers: ((m.layers ?? []) as any[]).map((l) => ({ id: String(l.id), name: String(l.name ?? l.id) })) }))
	return {
		pid,
		models: models.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as PagesModel).filter((m) => !(m as any).archived),
		// "file" sheets only link to another tool: nothing to draw
		sheets: sheets.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as LegacySheetDoc & { link?: unknown }).filter((s) => !s.link),
		models3d,
		sheetLayers: Array.isArray(project.data()?.sheetLayers) ? project.data()!.sheetLayers : [],
	}
}
