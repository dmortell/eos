/**
 * @file dxf/risers.ts — riser diagram → DXF (real-world mm). The stack is built y-down (bands grow
 * downward); y is negated to DXF y-up so the top floor reads at the top.
 */
import { DxfDoc, objLayer, type XY } from './dxf'
import type { LayerDef } from '../layers/layers'
import type { Cable, FloorHeights, Ladder, RiserRoom, RiserSettings } from '../tools/risers/types'
import { DEFAULT_RISER_SETTINGS } from '../tools/risers/types'
import { buildFloorBands, bandForFloor, computeCableLanes, cablePolylinePoints } from '../tools/risers/engine'

export interface RisersDxfInput {
	rooms?: RiserRoom[]
	ladders?: Ladder[]
	cables?: Cable[]
	floorHeights?: Record<number, FloorHeights>
	settings?: RiserSettings | null
	hiddenFloors?: number[]
	fromFloor: number
	toFloor: number
}

export function risersToDxf(input: RisersDxfInput, layers: LayerDef[]): string {
	const doc = new DxfDoc()
	doc.addLayers(layers)
	const settings = input.settings ?? DEFAULT_RISER_SETTINGS
	const bands = buildFloorBands(
		{ floorHeights: input.floorHeights ?? {}, settings, hiddenFloors: input.hiddenFloors ?? [] },
		input.fromFloor, input.toFloor,
	)
	const width = settings.widthMm
	const Y = (y: number) => -y // render y-down → DXF y-up
	const rectR = (x: number, yTop: number, w: number, h: number, layer?: string) =>
		doc.poly([[x, Y(yTop)], [x + w, Y(yTop)], [x + w, Y(yTop + h)], [x, Y(yTop + h)]], { closed: true, layer })

	// building walls + per-floor slab line + floor label
	if (bands.length) {
		const top = bands[0].topMm, bot = bands[bands.length - 1].slabBottomMm
		doc.line([0, Y(top)], [0, Y(bot)])
		doc.line([width, Y(top)], [width, Y(bot)])
	}
	for (const b of bands) {
		doc.line([0, Y(b.slabTopMm)], [width, Y(b.slabTopMm)])
		doc.text([-1600, Y((b.raisedFloorTopMm + b.plenumBottomMm) / 2)], 560, `${b.floor}F`)
	}

	for (const room of input.rooms ?? []) {
		const b = bandForFloor(bands, room.floor)
		if (!b) continue
		const layer = objLayer(doc, room.layerId, 'rooms', layers)
		const yTop = b.topMm + 50, yBot = b.slabTopMm - 50
		rectR(room.xMm - room.widthMm / 2, yTop, room.widthMm, Math.max(200, yBot - yTop), layer)
		doc.text([room.xMm - room.widthMm * 0.4, Y((yTop + yBot) / 2)], 280, room.label ?? '', layer)
	}

	for (const l of input.ladders ?? []) {
		const layer = objLayer(doc, l.layerId, 'ladders', layers)
		const topB = bandForFloor(bands, Math.max(l.fromFloor, l.toFloor))
		const botB = bandForFloor(bands, Math.min(l.fromFloor, l.toFloor))
		if (!topB || !botB) continue
		const w = l.widthMm ?? 450
		rectR(l.xMm - w / 2, topB.topMm, w, botB.slabBottomMm - topB.topMm, layer)
		doc.text([l.xMm - w, Y(topB.topMm - 120)], 220, l.label ?? '', layer)
	}

	const lanes = computeCableLanes(input.cables ?? [], { rooms: input.rooms ?? [], ladders: input.ladders ?? [] })
	for (const c of input.cables ?? []) {
		const layer = objLayer(doc, c.layerId, 'cables', layers)
		const str = cablePolylinePoints(c, lanes.get(c.id) ?? [], { rooms: input.rooms ?? [], ladders: input.ladders ?? [], bands })
		if (!str) continue
		const pts: XY[] = str.trim().split(/\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return [x, Y(y)] as XY })
		if (pts.length >= 2) doc.poly(pts, { layer })
	}
	return doc.stringify()
}
