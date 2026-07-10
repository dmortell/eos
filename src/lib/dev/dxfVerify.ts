/**
 * @file dxfVerify.ts — DEV-ONLY DXF round-trip checker (do not import from app code).
 * Load from the browser console:  const v = await import('/src/lib/dev/dxfVerify.ts')
 * then `v.verifyDxf(dxfString)`. Kept out of the app import graph so it's tree-shaken from the
 * production bundle. See sheets/dxf-export-plan.md → "Verification".
 */
import DxfParser from 'dxf-parser'

export interface DxfCheck {
	insUnits: unknown
	layers: string[]
	blocks: string[]
	entityCounts: Record<string, number>
	entities: any[]
	/** Raw-text presence of entities dxf-parser silently drops (IMAGE/IMAGEDEF). */
	rawImage: boolean
}

/** Parse our own DXF output and summarise it for spot-assertions. */
export function verifyDxf(text: string): DxfCheck {
	const doc = new DxfParser().parseSync(text) as any
	const counts: Record<string, number> = {}
	for (const e of doc?.entities ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1
	return {
		insUnits: doc?.header?.$INSUNITS,
		layers: Object.keys(doc?.tables?.layer?.layers ?? {}),
		blocks: Object.keys(doc?.blocks ?? {}),
		entityCounts: counts,
		entities: doc?.entities ?? [],
		rawImage: /^IMAGE$/m.test(text) || /^IMAGEDEF$/m.test(text),
	}
}
