/**
 * @file dxf/dxf.ts
 * @description Shared DXF-writing core for the sheets DXF export (real-world mm, AutoCAD 2007).
 * A thin builder over @tarikjabiri/dxf + colour/name helpers, used by the per-tool exporters
 * (outlets/racks/risers) and model3d. See sheets/dxf-export-plan.md.
 */
import { DxfWriter, LWPolylineFlags, Units, point2d, point3d } from '@tarikjabiri/dxf'

/** AutoCAD rejects these in layer names. Empty → the built-in layer '0'. */
export function sanitizeLayer(name: string): string {
	return (name || '0').replace(/[<>/\\":;?*|=`,]/g, '_').trim().slice(0, 255) || '0'
}

// Nearest ACI (AutoCAD Color Index, 1..255) from a hex colour — DXF layers use ACI, not RGB.
// A small curated palette is plenty; near-white → 7 so AutoCAD auto-inverts it against the bg.
const ACI_PALETTE: [number, [number, number, number]][] = [
	[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]],
	[5, [0, 0, 255]], [6, [255, 0, 255]], [7, [255, 255, 255]], [8, [128, 128, 128]],
	[9, [192, 192, 192]], [30, [255, 128, 0]], [40, [255, 191, 0]], [140, [0, 128, 255]],
	[150, [128, 0, 255]], [90, [128, 255, 0]], [250, [51, 51, 51]], [254, [204, 204, 204]],
]
export function hexToAci(hex?: string): number {
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

export type XY = [number, number]

/** Small builder: tracks defined layers, exposes the entity helpers the exporters need. */
export class DxfDoc {
	readonly w = new DxfWriter()
	#layers = new Set<string>()
	constructor() { this.w.setUnits(Units.Millimeters) }

	/** Ensure a layer exists (idempotent); returns its sanitised name. Layer '0' is built-in. */
	layer(name: string, colorHex?: string): string {
		const n = sanitizeLayer(name)
		if (n === '0' || this.#layers.has(n)) return n
		this.#layers.add(n)
		try { this.w.addLayer(n, hexToAci(colorHex), 'CONTINUOUS') } catch { /* dup */ }
		return n
	}
	addLayers(defs: { name: string; color?: string }[]) { for (const d of defs) this.layer(d.name, d.color) }

	line(a: XY, b: XY, layer?: string, z = 0) {
		this.w.addLine(point3d(a[0], a[1], z), point3d(b[0], b[1], z), { layerName: layer })
	}
	poly(pts: XY[], o: { closed?: boolean; layer?: string; elevation?: number } = {}) {
		if (pts.length < 2) return
		if (pts.length === 2 && !o.closed) { this.line(pts[0], pts[1], o.layer, o.elevation ?? 0); return }
		this.w.addLWPolyline(
			pts.map((p) => ({ point: point2d(p[0], p[1]) })),
			{ layerName: o.layer, elevation: o.elevation ?? 0, ...(o.closed ? { flags: LWPolylineFlags.Closed } : {}) },
		)
	}
	/** Axis-aligned rectangle by top-left + size (closed polyline). */
	rect(x: number, y: number, w: number, h: number, layer?: string) {
		this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { closed: true, layer })
	}
	circle(c: XY, r: number, layer?: string, z = 0) {
		this.w.addCircle(point3d(c[0], c[1], z), Math.max(0.01, r), { layerName: layer })
	}
	arc(c: XY, r: number, startDeg: number, endDeg: number, layer?: string) {
		this.w.addArc(point3d(c[0], c[1], 0), Math.max(0.01, r), startDeg, endDeg, { layerName: layer })
	}
	text(at: XY, height: number, value: string, layer?: string) {
		if (!value) return
		this.w.addText(point3d(at[0], at[1], 0), Math.max(1, height), value, { layerName: layer })
	}
	stringify(): string { return this.w.stringify() }
}

/** Trigger a browser download of DXF text. */
export function downloadDxf(text: string, filename: string) {
	const safe = (filename || 'export').replace(/[^\w.-]+/g, '_')
	const blob = new Blob([text], { type: 'application/dxf' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = safe.endsWith('.dxf') ? safe : `${safe}.dxf`
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
