// ELEVATION MARKERS (elevation-section-plan.md phase 4): a point on the plan + the way it looks, any angle, numbered —
// "Drop as sheet" gives a viewport LINKED to it (as many as wanted, each with its own notes / layers / scale), following
// a move / turn / resize live. Pure geometry only (unit-tested, elevMarker.test.ts); vpView / VpMarks / +page wire it.
//
// ONE MACHINE. Underneath, a marker IS a line section (ui/sectionLine.ts): the cut line through `at`, perpendicular to
// the look, `width` wide, the view reaching `depth` ahead. The cut runs left → right for the viewer (a → b = the look
// turned 90° clockwise on the drawing), and a line section looks to the LEFT of a → b — i.e. exactly along the marker's
// look. So its OClip, region, covering Clip and filed ElevDir are the line's (elevMarkerLine), and everything the line
// sections got in phase 3 (drop-as-sheet, many linked viewports, live update, the delete ask) comes for free.
//
// ANGLE CONVENTION (stored): plan degrees on the DRAWING — 0 = → (+x), 90 = ↓ (+y, down the sheet), 180 = ←, 270 = ↑ —
// the plan's rotation sense, like an eltag arm (blocks.ts `arm`). A marker looking UP the sheet (270°) draws the FRONT
// elevation, the same view a box section's front arrow (at its bottom edge, pointing up) gives. The command line types
// angles the CAD way (CCW from +X, Y up: 90 = up the sheet) — userToPlanAngle / planToUserAngle convert.
//
// THE LOOK. `elevMarkerMarks` is the ONE function that draws it (User, 2026-09-27: the eltag look for now — a circle,
// a filled triangle pointing where it looks, its number inside; it may become a plain arrow — change only this).
// It returns plain primitives; ui/render/ElevMarkerGlyph.svelte just renders them.
import type { Section, LineSection, ElevMarker, OClip, Clip } from '../3dview/types'
import { isLineSection, lineSectionOClip, lineSectionRegion, lineSectionClip, lineSectionDir } from './sectionLine'
import { segDist, type Pt, type ElevDir } from './geometry'

/** A new marker's defaults (mm): the band it sees across the look, and how far ahead. */
export const ELEV_WIDTH = 6000
export const ELEV_DEPTH = 5000
/** A marker placed without a direction (Enter / a tap) looks UP the sheet — the front elevation. */
export const ELEV_DEFAULT_ANGLE = 270
/** The callout's radius in annotative units (paper mm × the caller's scale) — the eltag blocks' S (blocks.ts). */
export const ELEV_R = 4

export const isElevMarker = (s: Section | null | undefined): s is ElevMarker => s?.kind === 'elev'
/** A box section (the pre-phase-3 kind: no `kind`, or 'box'). */
export const isBoxSection = (s: Section | null | undefined): boolean => !!s && (!s.kind || s.kind === 'box')

const z0 = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x)   // exact 0 (never −0 / 1e-17) on the axes
/** An angle into 0 ≤ a < 360 (1e-9-rounded, so 90 stays 90 through the float trip). */
export function normDeg(d: number): number { const r = Math.round((((d % 360) + 360) % 360) * 1e9) / 1e9; return r >= 360 ? 0 : r }
/** CAD angle (CCW from +X, Y up — the command line's) → plan angle on the drawing (y down), and back. */
export const userToPlanAngle = (deg: number): number => normDeg(360 - deg)
export const planToUserAngle = (deg: number): number => normDeg(360 - deg)

/** The unit direction it looks along on the drawing (axis angles come out exact). */
export function elevLook(m: Pick<ElevMarker, 'angle'>): Pt {
	const r = (m.angle * Math.PI) / 180
	return [z0(Math.cos(r)), z0(Math.sin(r))]
}
/** The viewer's RIGHT on the drawing (y down) — the elevation's horizontal: the look turned 90° clockwise on screen. */
export function elevRight(m: Pick<ElevMarker, 'angle'>): Pt { const L = elevLook(m); return [0 - L[1], L[0]] }

/** The marker as the LINE SECTION it is: the cut through `at` across the look (a on the viewer's left, b on the right),
 *  its depth and z band. */
export function elevMarkerLine(m: ElevMarker): LineSection {
	const t = elevRight(m), h = Math.abs(m.width) / 2
	return {
		id: m.id, kind: 'line', a: [m.at[0] - t[0] * h, m.at[1] - t[1] * h], b: [m.at[0] + t[0] * h, m.at[1] + t[1] * h], depth: Math.abs(m.depth),
		...(m.z0 != null ? { z0: m.z0 } : {}), ...(m.z1 != null ? { z1: m.z1 } : {}),
	}
}
/** Its ORIENTED clip — the view every linked frame draws (live). */
export const elevMarkerOClip = (m: ElevMarker): OClip => lineSectionOClip(elevMarkerLine(m))
/** The plan rectangle it sees: the cut's ends, then the far side. */
export const elevMarkerRegion = (m: ElevMarker): Pt[] => lineSectionRegion(elevMarkerLine(m))
/** An axis-aligned Clip covering it (+ its z band) — the fallback a linked frame keeps, what box-only code reads. */
export const elevMarkerClip = (m: ElevMarker): Clip => lineSectionClip(elevMarkerLine(m))
/** The ElevDir a frame dropped from it is filed under (the nearest to its view's horizontal). */
export const elevMarkerDir = (m: ElevMarker): ElevDir => lineSectionDir(elevMarkerLine(m))

// ── any section kind: what a linked frame reads (the page's liveClip / liveOClip / drop) ──
/** A section's ORIENTED view (a line / a marker); null for a box (it has one per direction — its clip + ElevDir). */
export function sectionOClip(s: Section): OClip | null {
	return isLineSection(s) ? lineSectionOClip(s) : isElevMarker(s) ? elevMarkerOClip(s) : null
}
/** A section's axis-aligned Clip: a box's own, else the box covering its region (+ z band). */
export function sectionClip(s: Section): Clip {
	return isLineSection(s) ? lineSectionClip(s) : isElevMarker(s) ? elevMarkerClip(s) : (s as { clip: Clip }).clip
}
/** The ElevDir a frame dropped from it is filed under: a box's requested `dir` (else its own), a line's / marker's
 *  nearest dir. */
export function sectionDir(s: Section, dir?: ElevDir): ElevDir {
	return isLineSection(s) ? lineSectionDir(s) : isElevMarker(s) ? elevMarkerDir(s) : dir ?? (s as { dir: ElevDir }).dir
}
/** No z band set (a line / marker then sees every height; a dropped frame sizes to the model's height). */
export const sectionAllHeights = (s: Section): boolean => (isLineSection(s) || isElevMarker(s)) && (s.z0 == null || s.z1 == null)

// ── numbering + the callout text ──
/** The first number ("1", "2" …) no elevation marker of the model uses yet (deleting 2 and placing again gives 2). */
export function elevMarkerNumber(existing: Section[]): string {
	const used = new Set(existing.flatMap((s) => (isElevMarker(s) && s.number ? [s.number] : [])))
	for (let i = 1; ; i++) if (!used.has(String(i))) return String(i)
}
/** What the callout shows: PER SHEET like an eltag — a linked marker, its FIRST viewport's number over that sheet's
 *  number ("1" / "A-201"); unlinked, its own number. */
export type ElevRef = { num: string; sheet?: string }
export function elevMarkerRef(m: Pick<ElevMarker, 'number'>, links: { frame: string; sheet: string }[]): ElevRef {
	const l = links[0]
	return l ? { num: l.frame, sheet: l.sheet } : { num: m.number || '?' }
}

// ── THE plan drawing (the one function to change for a different look) ──
export type MarkPrim =
	| { k: 'circle'; c: Pt; r: number }
	| { k: 'poly'; pts: Pt[]; fill?: boolean }
	| { k: 'line'; a: Pt; b: Pt }
	| { k: 'text'; p: Pt; text: string; size: number }
/** `prims` in drawing mm (text centred on `p`, `size` = its height), `tip` = the arrow's tip (the rotate grip). */
export type ElevMarks = { prims: MarkPrim[]; tip: Pt }
/** The ELTAG look, `u` = one annotative unit (≈ a paper mm; the caller scales it): a circle of radius 4u on `at`, a filled
 *  triangle pointing the look (its tip 1.55 radii out, its base on the circle at ±40° — blocks.ts `arm`), and inside the
 *  number — over a divider and the sheet number when linked. Text stays upright whatever the angle. */
export function elevMarkerMarks(m: Pick<ElevMarker, 'at' | 'angle'>, u: number, ref: ElevRef): ElevMarks {
	const S = ELEV_R * u, c = m.at, a = (m.angle * Math.PI) / 180, w = (40 * Math.PI) / 180
	const at = (ang: number, r: number): Pt => [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]
	const tip = at(a, S * 1.55)
	const prims: MarkPrim[] = [{ k: 'circle', c, r: S }, { k: 'poly', pts: [tip, at(a + w, S), at(a - w, S)], fill: true }]
	if (ref.sheet) {
		prims.push({ k: 'text', p: [c[0], c[1] - S * 0.36], text: ref.num, size: 2.2 * u },
			{ k: 'line', a: [c[0] - S * 0.82, c[1] + S * 0.08], b: [c[0] + S * 0.82, c[1] + S * 0.08] },
			{ k: 'text', p: [c[0], c[1] + S * 0.46], text: ref.sheet, size: 1.5 * u })
	} else prims.push({ k: 'text', p: c, text: ref.num, size: 2.6 * u })
	return { prims, tip }
}

/** A marker under p: its circle, or its arrow (thrMm of slack). The seen region stays free for model picks. */
export function hitElevMarker(m: Pick<ElevMarker, 'at' | 'angle'>, p: Pt, u: number, thrMm: number): boolean {
	const S = ELEV_R * u, L = elevLook(m), tip: Pt = [m.at[0] + L[0] * S * 1.55, m.at[1] + L[1] * S * 1.55]
	return Math.hypot(p[0] - m.at[0], p[1] - m.at[1]) <= S + thrMm || segDist(p, m.at, tip) <= S * 0.45 + thrMm
}

// ── grips (shown when selected): turn (the arrow tip), the band's two ends (width, symmetric about `at`), depth ──
export type ElevGripKey = 'rot' | 'wa' | 'wb' | 'depth'
export function elevMarkerGrips(m: ElevMarker, u: number): { key: ElevGripKey; p: Pt }[] {
	const ln = elevMarkerLine(m), L = elevLook(m), d = Math.abs(m.depth), S = ELEV_R * u
	return [
		{ key: 'rot', p: [m.at[0] + L[0] * S * 1.55, m.at[1] + L[1] * S * 1.55] },
		{ key: 'wa', p: ln.a }, { key: 'wb', p: ln.b },
		{ key: 'depth', p: [m.at[0] + L[0] * d, m.at[1] + L[1] * d] },
	]
}
/** A grip dragged to p → the marker's patch. TURN: the angle from `at` to p (0.1°; Shift = 15° steps); a drag onto `at`
 *  itself is ignored ({}). A band END: the width = twice p's distance across the look (whole mm, ≥ 1 — it stays centred
 *  on `at`). DEPTH: p's distance along the look (whole mm, ≥ 1). */
export function applyElevGrip(m0: ElevMarker, key: ElevGripKey, p: Pt, shift = false): Partial<ElevMarker> {
	const dx = p[0] - m0.at[0], dy = p[1] - m0.at[1]
	if (key === 'rot') {
		if (Math.hypot(dx, dy) < 1e-6) return {}
		return { angle: lookAngle(m0.at, p, shift ? 15 : 0.1) }
	}
	if (key === 'depth') { const L = elevLook(m0); return { depth: Math.max(1, Math.round(dx * L[0] + dy * L[1])) } }
	const t = elevRight(m0)
	return { width: Math.max(1, Math.round(2 * Math.abs(dx * t[0] + dy * t[1]))) }
}

// ── placing ──
/** The plan angle from `at` toward p (0 ≤ a < 360), snapped to `step` degrees (the tool: 90 — the four axes — by
 *  default, 15 with Shift; 0 = exact, e.g. a typed point). */
export function lookAngle(at: Pt, p: Pt, step = 90): number {
	const d = (Math.atan2(p[1] - at[1], p[0] - at[0]) * 180) / Math.PI
	return normDeg(step > 0 ? Math.round(d / step) * step : d)
}
/** A new marker at `at` (whole mm) looking along plan `angle`, numbered `number`, `width` × `depth` (≥ 1 mm), every
 *  height. */
export function elevMarkerObj(at: Pt, angle: number, id: string, number: string, width = ELEV_WIDTH, depth = ELEV_DEPTH): ElevMarker {
	return { id, kind: 'elev', at: [Math.round(at[0]), Math.round(at[1])], angle: normDeg(angle), width: Math.max(1, Math.round(width)), depth: Math.max(1, Math.round(depth)), number }
}
