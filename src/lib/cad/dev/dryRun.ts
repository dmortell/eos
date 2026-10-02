// READ-ONLY dry run of the legacy import against a real project (Phase 1 exit check). Run it in the browser on the
// dev server:   const m = await import('/src/lib/cad/dev/dryRun.ts'); await m.dryRun('<pid>')
// It only calls getDoc / getDocs. Nothing is written anywhere.
import { collection, getDocs } from 'firebase/firestore'
import { firestore } from '../../db.svelte'
import { importLegacy, type LegacySource } from '../persist/import/legacy'
import { loadLegacy as load } from '../persist/import/load'
import { ProjectIndex } from '../domain/project'
import { validateProject } from '../domain/validate'
import { outletSchedule, patchList, bom, runLengths } from '../domain/reports'

export async function listProjects(): Promise<{ id: string; name: string; floors: number }[]> {
	const snap = await getDocs(collection(firestore, 'projects'))
	return snap.docs.filter((d) => !d.data().deleted).map((d) => ({ id: d.id, name: d.data().name, floors: (d.data().floors ?? []).length }))
}

export const loadLegacy = (pid: string): Promise<LegacySource> => load(firestore, pid)

export async function dryRun(pid: string) {
	const t0 = performance.now()
	const src = await loadLegacy(pid)
	const t1 = performance.now()
	const { entities, issues } = importLegacy(src)
	const ix = new ProjectIndex(entities)
	const count = (t: string) => entities.filter((e) => e.type === t).length
	const validation = validateProject(entities)
	const tally = (xs: { code: string }[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x.code] = (m[x.code] ?? 0) + 1), m), {})
	return {
		project: src.project?.name,
		sourceDocs: { frames: Object.keys(src.frames).length, racks: Object.keys(src.racks).length, patching: Object.keys(src.patching).length, outlets: Object.keys(src.outlets).length },
		ms: { fetch: Math.round(t1 - t0), importAndReports: Math.round(performance.now() - t1) },
		entities: { total: entities.length, levels: count('level'), spaces: count('space'), outlets: count('outlet'), racks: count('rack'), devices: count('device'), links: count('link'), cords: count('cord'), shapes: count('shape'), underlays: count('underlay') },
		importIssues: tally(issues),
		validation: tally(validation),
		reports: {
			outletSchedule: outletSchedule(ix).totals,
			patchListRows: patchList(ix).length,
			containment: runLengths(ix).length,
			bomLines: bom(ix).length,
			bomSample: bom(ix).slice(0, 12),
		},
		samples: {
			importIssues: issues.slice(0, 8).map((i) => `${i.code}: ${i.message}`),
			validation: validation.slice(0, 8).map((i) => `${i.code}: ${i.message}`),
		},
	}
}
