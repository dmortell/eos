// Display list → DXF (analysis §6.6: one display list feeds screen, print and DXF, so the export is what you see).
// Plan mm in; DXF is y-UP, so y is negated. Banded prims (trunks, walls) become LWPOLYLINEs with their real constant
// width. Layers come from the prim's class. Images (PDF underlays) are not exported — the result lists them.
import { DxfWriter, LWPolylineFlags, Units, point2d, point3d, TextHorizontalAlignment, TextVerticalAlignment } from '@tarikjabiri/dxf'
import type { Prim } from '../views/display'

/** DXF layer + colour (ACI) for a prim class (its first word). */
const LAYERS: Record<string, { name: string; aci: number }> = {
	outlet: { name: 'E-OUTLETS', aci: 5 },
	run: { name: 'E-CONTAINMENT', aci: 4 },
	riser: { name: 'E-RISERS', aci: 6 },
	'riser-label': { name: 'E-RISERS', aci: 6 },
	rack: { name: 'E-RACKS', aci: 7 },
	'rack-x': { name: 'E-RACKS', aci: 8 },
	'rack-front': { name: 'E-RACKS', aci: 7 },
	wall: { name: 'A-WALL', aci: 8 },
	shape: { name: 'A-DETAIL', aci: 7 },
	label: { name: 'ANNO-LABELS', aci: 7 },
	note: { name: 'ANNO-TEXT', aci: 7 },
}
const HIGH = { name: 'E-CONTAINMENT-HIGH', aci: 30 }

export function layerOf(cls: string): { name: string; aci: number } {
	if (/\brun-high\b/.test(cls)) return HIGH
	return LAYERS[cls.split(/\s+/)[0]] ?? { name: '0', aci: 7 }
}

export interface DxfResult { text: string; entities: number; skippedImages: number }

export function displayListToDxf(prims: Prim[]): DxfResult {
	const w = new DxfWriter()
	w.setUnits(Units.Millimeters)
	const made = new Set<string>()
	const layer = (cls: string) => {
		const l = layerOf(cls)
		if (l.name !== '0' && !made.has(l.name)) { made.add(l.name); w.addLayer(l.name, l.aci, 'CONTINUOUS') }
		return l.name
	}
	let entities = 0, skippedImages = 0
	for (const p of prims) {
		switch (p.k) {
			case 'line': {
				if (p.pts.length < 2) break
				w.addLWPolyline(p.pts.map((q) => ({ point: point2d(q.x, -q.y) })), {
					layerName: layer(p.cls),
					...(p.closed ? { flags: LWPolylineFlags.Closed } : {}),
					...(p.w ? { constantWidth: p.w } : {}),
				})
				entities++
				break
			}
			case 'circle':
				w.addCircle(point3d(p.c.x, -p.c.y, 0), Math.max(0.01, p.r), { layerName: layer(p.cls) })
				entities++
				break
			case 'text': {
				if (!p.text) break
				const at = point3d(p.at.x, -p.at.y, 0)
				const centred = p.anchor === 'middle' || p.anchor === 'end'
				w.addText(at, Math.max(1, p.size), p.text, {
					layerName: layer(p.cls),
					...(p.rot ? { rotation: -p.rot } : {}),
					...(centred ? {
						horizontalAlignment: p.anchor === 'middle' ? TextHorizontalAlignment.Center : TextHorizontalAlignment.Right,
						verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: at,
					} : {}),
				})
				entities++
				break
			}
			case 'image':
				skippedImages++
				break
		}
	}
	return { text: w.stringify(), entities, skippedImages }
}
