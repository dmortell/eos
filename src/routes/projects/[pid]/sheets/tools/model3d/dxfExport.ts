/**
 * @file dxfExport.ts
 * @description model3d → DXF (real-world mm, model space) so a draftsman can open the model in
 * AutoCAD as editable geometry. Phase 1 of the DXF plan (sheets/dxf-export-plan.md); mirrors the
 * proven OpenCAD approach (M:\dev\autocad\docs\dxf-export.md): same lib, 1:1 real-mm, Y-up, no
 * transforms. Reuses the SAME projection helpers the render uses, so the DXF matches the drawing.
 */
import { DxfWriter, LWPolylineFlags, Units, point2d, point3d } from '@tarikjabiri/dxf'
import type { Clip, Dir, Model } from './types'
import { project, objBounds, trimToClip } from './projection'

/** AutoCAD rejects these in layer names. */
function sanitizeLayer(name: string): string {
	return (name || '0').replace(/[<>/\\":;?*|=`,]/g, '_').trim().slice(0, 255) || '0'
}

// Nearest ACI (AutoCAD Color Index) from a hex colour — DXF layers use ACI 1..255, not RGB.
// A small curated palette (primaries, greys, a few midtones) is plenty; near-white → 7 so AutoCAD
// auto-inverts it against the background (what CAD users expect).
const ACI_PALETTE: [number, [number, number, number]][] = [
	[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]],
	[5, [0, 0, 255]], [6, [255, 0, 255]], [7, [255, 255, 255]], [8, [128, 128, 128]],
	[9, [192, 192, 192]], [30, [255, 128, 0]], [40, [255, 191, 0]], [140, [0, 128, 255]],
	[150, [128, 0, 255]], [90, [128, 255, 0]], [250, [51, 51, 51]], [254, [204, 204, 204]],
]
function hexToAci(hex?: string): number {
	if (!hex) return 7
	const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
	if (!m) return 7
	const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
	if (r > 230 && g > 230 && b > 230) return 7 // near-white → 7
	let best = 7, bd = Infinity
	for (const [aci, [pr, pg, pb]] of ACI_PALETTE) {
		const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
		if (d < bd) { bd = d; best = aci }
	}
	return best
}

export interface DxfExportOptions {
	/** Projection to export. Default 'plan' (a real-world footprint the draftsman builds on). */
	direction?: Dir
	/** Optional section clip; when set, objects are trimmed to it (like the elevation views). */
	clip?: Clip | null
}

/**
 * Serialise a model3d model to a DXF string (AutoCAD 2007). Each object is projected with the SAME
 * `project()` used on screen; plan footprints keep their base z as the LWPOLYLINE elevation (2.5D:
 * harmless in 2D, meaningful in 3D). Model layers map 1:1 to DXF layers (hidden layers skipped).
 */
export function modelToDxf(model: Model, opts: DxfExportOptions = {}): string {
	const dir: Dir = opts.direction ?? 'plan'
	const clip = opts.clip ?? null
	const dxf = new DxfWriter()
	dxf.setUnits(Units.Millimeters)

	const layers = model.layers ?? []
	const byId = new Map(layers.map((l) => [l.id, l]))
	const hidden = new Set(layers.filter((l) => l.visible === false).map((l) => l.id))
	const nameOf = (id?: string) => {
		const l = id ? byId.get(id) : undefined
		return l ? sanitizeLayer(l.name) : '0'
	}
	// Define the DXF layer table (the built-in layer 0 must not be redefined).
	for (const l of layers) {
		if (l.visible === false) continue
		const name = sanitizeLayer(l.name)
		if (name === '0') continue
		try { dxf.addLayer(name, hexToAci(l.color), 'CONTINUOUS') } catch { /* dup name */ }
	}

	for (const o of model.objects ?? []) {
		if (o.layer && hidden.has(o.layer)) continue
		const obj = clip ? trimToClip(o, clip) : o
		if (!obj) continue
		const layerName = nameOf(o.layer)
		const elevation = dir === 'plan' ? Math.round(objBounds(o).z0) : 0
		for (const s of project(obj, dir)) {
			if (s.pts.length < 2) continue
			if (s.pts.length === 2) {
				const [a, b] = s.pts
				dxf.addLine(point3d(a.u, a.v, elevation), point3d(b.u, b.v, elevation), { layerName })
			} else {
				const verts = s.pts.map((p) => ({ point: point2d(p.u, p.v) }))
				dxf.addLWPolyline(verts, { layerName, elevation, ...(s.closed ? { flags: LWPolylineFlags.Closed } : {}) })
			}
		}
	}
	return dxf.stringify()
}

/** Trigger a browser download of the model as a .dxf file. */
export function downloadModelDxf(model: Model, opts: DxfExportOptions = {}) {
	const text = modelToDxf(model, opts)
	const safe = (model.name || 'model').replace(/[^\w.-]+/g, '_')
	const blob = new Blob([text], { type: 'application/dxf' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${safe}.dxf`
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
