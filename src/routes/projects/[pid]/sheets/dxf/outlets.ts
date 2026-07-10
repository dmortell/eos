/**
 * @file dxf/outlets.ts — outlets floorplan → DXF (real-world mm, plan; y-up 1:1).
 * Exports trunk centrelines, outlet symbols (with port count + label), and floorplan rack
 * rectangles, each on its object's sheet layer. Uses the same data the render reads.
 */
import { DxfDoc, type XY } from './dxf'
import { objLayerOf, type LayerDef } from '../layers/layers'
import type { OutletConfig, TrunkConfig, RackPlacement } from '../tools/outlets/types'
import { OUTLET_RADIUS_MM as R } from '../tools/outlets/colors'

export interface OutletsDxfInput {
	outlets?: OutletConfig[]
	trunks?: TrunkConfig[]
	rackPlacements?: RackPlacement[]
	racksById?: Record<string, { widthMm: number; depthMm: number; label?: string }>
}

/** Sheet layer name for an object kind + optional per-object layerId. */
function layerFor(doc: DxfDoc, layerId: string | undefined, kind: string, layers: LayerDef[]): string {
	const id = objLayerOf(layerId, kind, layers)
	const l = layers.find((x) => x.id === id)
	return doc.layer(l?.name ?? kind, l?.color)
}

export function outletsToDxf(input: OutletsDxfInput, layers: LayerDef[]): string {
	const doc = new DxfDoc()
	doc.addLayers(layers)

	// ── trunks: centreline segments (editable routing) ──
	for (const t of input.trunks ?? []) {
		if (t.visible === false) continue
		const layer = layerFor(doc, t.layerId, 'trunks', layers)
		const pos = new Map(t.nodes.map((n) => [n.id, n.position]))
		for (const s of t.segments) {
			const a = pos.get(s.nodes[0]), b = pos.get(s.nodes[1])
			if (a && b) doc.line([a.x, a.y], [b.x, b.y], layer)
		}
	}

	// ── outlets: mount symbol + port-count + label ──
	for (const o of input.outlets ?? []) {
		const layer = layerFor(doc, o.layerId, 'outlets', layers)
		const x = o.position.x, y = o.position.y
		if (o.mountType === 'wall') {
			// up-pointing triangle inscribed in radius R
			const pts: XY[] = [0, 1, 2].map((k) => {
				const a = Math.PI / 2 + (k * 2 * Math.PI) / 3
				return [x + R * Math.cos(a), y + R * Math.sin(a)]
			})
			doc.poly(pts, { closed: true, layer })
		} else if (o.mountType === 'floor') {
			const h = R * 1.2 // square half-diagonal ~ match render
			doc.rect(x - h, y - h, h * 2, h * 2, layer)
		} else {
			doc.circle([x, y], R * 0.9, layer)
		}
		doc.text([x - R * 0.35, y - R * 0.45], R * 0.9, String(o.portCount ?? ''), layer)
		if (o.label) doc.text([x - R, y + R * 1.1], R * 0.6, o.label, layer)
	}

	// ── floorplan rack placements: rotated rectangle + label ──
	for (const p of input.rackPlacements ?? []) {
		const layer = layerFor(doc, p.layerId, 'racks', layers)
		const cfg = input.racksById?.[p.rackId]
		const w = cfg?.widthMm ?? p.widthMm ?? 600
		const h = cfg?.depthMm ?? p.depthMm ?? 1000
		const cx = p.position.x + w / 2, cy = p.position.y + h / 2
		const rot = ((p.rotation ?? 0) * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot)
		const corner = (dx: number, dy: number): XY => [cx + dx * cr - dy * sr, cy + dx * sr + dy * cr]
		doc.poly([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], { closed: true, layer })
		// front-of-rack edge (top before rotation)
		doc.line(corner(-w / 2, -h / 2), corner(w / 2, -h / 2), layer)
		const label = cfg?.label ?? p.label
		if (label) doc.text([cx - w * 0.2, cy], Math.min(w, h) * 0.18, label, layer)
	}

	return doc.stringify()
}
