// Copy from a Sheets 3D viewport into PAGES: the copied objects also go to the SYSTEM clipboard in the Pages
// clipboard format (pages/ui/clipboard.ts `clipText`: `{ 'eos-pages-shapes': 1, ents, objs, layers }`), so a Pages
// view (any project, any tab) pastes them with Ctrl+V. The object shapes are the same (prism / wall / conduit), but
// this tool's plan is y-UP and Pages' is y-DOWN, so the copy is mirrored in y (a box's y becomes −(y + d), its z
// rotation reverses; graph nodes' y negate). Layer ids go with their names — Pages matches a layer by id, then name.
import type { Obj } from './types'

export function toPagesClip(objs: Obj[], layerName: (id: string) => string | undefined): string {
	const layers: Record<string, string> = {}
	const out = objs.map((o) => {
		const c = structuredClone(o) as Obj
		if (c.layer) { const n = layerName(c.layer); if (n) layers[c.layer] = n }
		if (c.type === 'prism') { c.y = -(c.y + c.d); if (c.rot) c.rot = -c.rot }
		else for (const n of c.nodes) n.y = -n.y
		return c
	})
	return JSON.stringify({ 'eos-pages-shapes': 1, ents: [], objs: out, layers })
}
