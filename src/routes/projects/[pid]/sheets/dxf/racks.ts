/**
 * @file dxf/racks.ts — rack elevation → DXF (real-world mm). The elevation layout is computed in
 * render (y-down) space via buildElevation/deviceBox; y is negated to DXF y-up so heights read up.
 */
import { DxfDoc, objLayer, type XY } from './dxf'
import type { LayerDef } from '../layers/layers'
import type { DeviceConfig, RackConfig, RackFace, RackSettings } from '../tools/racks/types'
import { buildElevation, deviceBox } from '../tools/racks/rack-layout'

export interface RacksDxfInput {
	racks?: RackConfig[]
	devices?: DeviceConfig[]
	settings?: RackSettings | null
	rowId?: string
	face?: RackFace
}

export function racksToDxf(input: RacksDxfInput, layers: LayerDef[]): string {
	const doc = new DxfDoc()
	doc.addLayers(layers)
	const face = input.face ?? 'front'
	const scoped = input.rowId ? (input.racks ?? []).filter((r) => r.rowId === input.rowId) : (input.racks ?? [])
	const el = buildElevation(scoped, input.settings ?? null, face)
	const Y = (y: number) => -y // render y-down → DXF y-up
	// Rectangle given render-space top-left (x, yTop) + size (yTop is the small/upper y).
	const rectR = (x: number, yTop: number, w: number, h: number, layer?: string) => {
		const pts: XY[] = [[x, Y(yTop)], [x + w, Y(yTop)], [x + w, Y(yTop + h)], [x, Y(yTop + h)]]
		doc.poly(pts, { closed: true, layer })
	}

	for (const e of el.placements) {
		const layer = objLayer(doc, (e.rack as any).layerId, 'racks', layers)
		const yTop = el.Y(e.z + e.rack.heightMm)
		rectR(e.x, yTop, e.rack.widthMm, e.rack.heightMm, layer)
		doc.text([e.x + e.rack.widthMm * 0.15, Y(yTop) + 40], 90, e.rack.label ?? '', layer)
	}
	for (const d of input.devices ?? []) {
		const bx = deviceBox(d, el, face)
		if (!bx) continue
		const layer = objLayer(doc, (d as any).layerId, 'devices', layers)
		rectR(bx.x, bx.y, bx.w, bx.h, layer)
		doc.text([bx.x + bx.w * 0.05, Y(bx.y + bx.h / 2)], Math.min(bx.h * 0.5, 60), d.label ?? '', layer)
	}
	return doc.stringify()
}
