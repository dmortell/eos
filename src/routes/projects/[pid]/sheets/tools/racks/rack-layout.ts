// Pure elevation geometry shared by RacksRender (drawing) and RacksEditLayer (hit areas / drag),
// so the device boxes and U-slot maths stay in one place.
import { RU_HEIGHT_MM, RACK_GAP_MM, RACK_19IN_MM, DEFAULT_SETTINGS } from './colors'
import type { RackConfig, DeviceConfig, RackSettings, RackFace } from './types'

export interface ElevPlacement { rack: RackConfig; x: number; z: number }
export interface Elevation {
	placements: ElevPlacement[]
	byId: Map<string, ElevPlacement>
	topZ: number
	right: number
	Y: (z: number) => number
}

/** Lay racks out side-by-side (rear reverses order); Y flips world-z to screen-down. */
export function buildElevation(scoped: RackConfig[], settings: RackSettings | null, face: RackFace): Elevation {
	const cfg = settings ?? DEFAULT_SETTINGS
	const ordered = [...scoped].sort((a, b) => a.order - b.order)
	if (face === 'rear') ordered.reverse()
	let x = 0
	const placements = ordered.map(rack => { const o = { rack, x, z: cfg.floorLevel }; x += rack.widthMm + RACK_GAP_MM; return o })
	let topZ = cfg.ceilingLevel
	for (const e of placements) topZ = Math.max(topZ, e.z + e.rack.heightMm)
	topZ += 200
	const right = placements.length ? placements[placements.length - 1].x + placements[placements.length - 1].rack.widthMm : 480
	return { placements, byId: new Map(placements.map(e => [e.rack.id, e])), topZ, right, Y: (z: number) => topZ - z }
}

/** Device rectangle in real-mm (matches the render exactly). */
export function deviceBox(d: DeviceConfig, el: Elevation, face: RackFace): { x: number; y: number; w: number; h: number } | null {
	const e = el.byId.get(d.rackId); if (!e) return null
	const devW = d.widthMm ?? RACK_19IN_MM
	const ox = (d.offsetX ?? 0) * (face === 'rear' ? -1 : 1)
	return { x: e.x + e.rack.widthMm / 2 - devW / 2 + ox, y: el.Y(e.z + (d.positionU + d.heightU) * RU_HEIGHT_MM), w: devW, h: d.heightU * RU_HEIGHT_MM }
}

/** Rack placement whose column contains world-x. */
export function rackAtX(el: Elevation, worldX: number): ElevPlacement | null {
	return el.placements.find(e => worldX >= e.x && worldX <= e.x + e.rack.widthMm) ?? null
}

/** Bottom U index (1-based) for a device of `heightU` whose body is centred on world-y, clamped. */
export function slotAtY(e: ElevPlacement, el: Elevation, worldY: number, heightU = 1): number {
	const u = Math.floor((el.topZ - worldY - e.z) / RU_HEIGHT_MM - heightU / 2 + 0.5)
	return Math.max(1, Math.min(e.rack.heightU - heightU + 1, u))
}
