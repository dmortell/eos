// SECTIONS SEEN FROM THE SIDE (User 2026-10-01): in an elevation every section / elevation marker / box section shows
// as a dashed BAND — its plan region's span along the view × its height band (Z↓..Z↑; "every height" = the model's
// height range) — clickable to select, with a handle on its top / bottom edge to drag Z↑ / Z↓ (a section seen on the
// plan has no height to grab). Pure; vpView builds the bands, VpMarks draws them. Tested in sectionElev.test.ts.
import type { Section } from '../3dview/types'
import { segDist, type Pt } from './geometry'
import { ALL_Z, isLineSection, lineSectionRegion, sectionTitle } from './sectionLine'
import { isElevMarker, elevMarkerRegion } from './elevMarker'

/** In drawing coords (y down): u0..u1 along the view, `top` = Z↑'s y, `bot` = Z↓'s y; `all` = it sees every height
 *  (the band then spans the model); z0 / z1 = the band in model mm as drawn. */
export type SecBand = { id: string; u0: number; u1: number; top: number; bot: number; z0: number; z1: number; all: boolean; label: string }
export type BandGripKey = 'z0' | 'z1'

const real = (z: number | undefined) => z != null && Math.abs(z) < ALL_Z / 2

function regionOf(s: Section): { pts: Pt[]; z0?: number; z1?: number } {
	if (isLineSection(s)) return { pts: lineSectionRegion(s), z0: s.z0, z1: s.z1 }
	if (isElevMarker(s)) return { pts: elevMarkerRegion(s), z0: s.z0, z1: s.z1 }
	const c = s.clip
	return { pts: [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]], z0: c.z0, z1: c.z1 }
}

/** A section's band in this elevation (`toDraw` = the view's model → drawing map; `model` = the model's z range, for a
 *  section that sees every height). */
export function sectionBand(s: Section, toDraw: (p: { x: number; y: number; z: number }) => Pt, model: { z0: number; z1: number }): SecBand {
	const r = regionOf(s), all = !real(r.z0) || !real(r.z1)
	const z0 = real(r.z0) ? r.z0! : model.z0, z1 = real(r.z1) ? r.z1! : model.z1
	const us = r.pts.map((p) => toDraw({ x: p[0], y: p[1], z: z0 })[0])
	const q = r.pts[0]
	return { id: s.id, u0: Math.min(...us), u1: Math.max(...us), top: toDraw({ x: q[0], y: q[1], z: z1 })[1], bot: toDraw({ x: q[0], y: q[1], z: z0 })[1], z0, z1, all, label: sectionTitle(s) }
}

/** A press within `tol` (drawing mm) of the band's outline. */
export function hitBand(b: SecBand, p: Pt, tol: number): boolean {
	const c: Pt[] = [[b.u0, b.top], [b.u1, b.top], [b.u1, b.bot], [b.u0, b.bot]]
	return c.some((a, i) => segDist(p, a, c[(i + 1) % 4]) < tol)
}

/** The selected band's handles: the middle of its top (Z↑) and bottom (Z↓) edges. */
export const bandGrips = (b: SecBand): { key: BandGripKey; p: Pt }[] => [{ key: 'z1', p: [(b.u0 + b.u1) / 2, b.top] }, { key: 'z0', p: [(b.u0 + b.u1) / 2, b.bot] }]

/** Dragging a handle to height `z` (model mm): the section's patch. A section that saw every height gets an explicit band
 *  (the other edge where it was drawn); the band never inverts (≥ 1 mm). A box section moves its clip's z. */
export function applyBandGrip(s: Section, b: SecBand, key: BandGripKey, z: number): Record<string, unknown> {
	const zr = Math.round(z)
	const z0 = key === 'z0' ? Math.min(zr, Math.round(b.z1) - 1) : Math.round(b.z0)
	const z1 = key === 'z1' ? Math.max(zr, Math.round(b.z0) + 1) : Math.round(b.z1)
	if (isLineSection(s) || isElevMarker(s)) return { z0, z1 }
	return { clip: { ...s.clip, z0, z1 } }
}
