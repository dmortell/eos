// SECTION LINES (elevation-section-plan.md phase 3 — OpenCad's "O4" marker): a section cut along a LINE at any angle.
// Pure geometry only — the view it drives, how it draws in plan (dashed line, an arrow at each end, "A" / "A′"), its
// grips / hit / move, and the sheet frames linked to it — so it is unit-tested (sectionLine.test.ts); vpView / VpMarks /
// +page wire it up. Box sections (the pre-phase-3 kind) keep their own code (hit.ts / grips.ts / annotations.ts).
//
// LOOK DIRECTION. A line section looks to the LEFT of a → b as drawn on the plan (y down) — `flip` turns it to the
// right. That's the side from which the elevation reads left-to-right along a → b: the SAME convention as a box
// section's front arrow (at the box's bottom edge pointing up the sheet, the elevation's +x on the right). Its view (an
// OClip, 3dview/types) is the cut line's own frame (geometry frameOnLine: t along the line, n = its right-hand normal on
// the drawing), with the clip reaching `depth` along the LOOK — i.e. a NEGATIVE OClip depth (the look is −n); a flip
// swaps the ends, which turns t and n round together. So an unflipped line along a box's bottom edge (bottom-left →
// bottom-right, depth = the box's height) draws exactly that box's front elevation (the tests pin it).
//
// (The engine's depth sort — Model3d's hidden-line `far`, phase 6 — counts +n as "farther" for every elevation, box
// sections included; that's the same for both kinds and is phase 6's to settle, not this file's.)
import type { Section, LineSection, OClip, Clip } from '../3dview/types'
import { frameOnLine, segDist, type Pt, type ElevDir } from './geometry'

/** A new line section's depth (mm past the cut line) — the spec bar's default. */
export const LINE_SECTION_DEPTH = 5000
/** The z band of a line section that has none set: every height (mm, ±). */
export const ALL_Z = 1e6

export const isLineSection = (s: Section | null | undefined): s is LineSection => s?.kind === 'line'

const unit = (a: Pt, b: Pt): Pt => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
const rnd = (p: Pt): [number, number] => [Math.round(p[0]), Math.round(p[1])]
type LineLike = Pick<LineSection, 'a' | 'b' | 'flip'>

/** The unit direction a line section looks along on the plan: left of a → b as drawn (y down), right when flipped.
 *  (`0 −` rather than unary minus: no −0 components.) */
export function lineLook(s: LineLike): Pt {
	const [tx, ty] = unit(s.a, s.b), l: Pt = [ty, 0 - tx]
	return s.flip ? [0 - l[0], 0 - l[1]] : l
}

/** Its ORIENTED clip — the view every linked frame draws: the cut line (ends swapped when flipped, so the view's
 *  horizontal runs left-to-right for the viewer), `depth` along the look (negative in the OClip's n terms), its z band
 *  or every height. */
export function lineSectionOClip(s: LineSection): OClip {
	const [a, b] = s.flip ? [s.b, s.a] : [s.a, s.b]
	return { a: [a[0], a[1]], b: [b[0], b[1]], depth: 0 - Math.abs(s.depth), z0: s.z0 ?? -ALL_Z, z1: s.z1 ?? ALL_Z }
}

/** The ElevDir a frame dropped from it is filed under: the one whose horizontal is nearest the view's (the OClip's t).
 *  An axis-aligned line then gets exactly that dir's frame (3D objects editable as in any elevation); an oblique one
 *  keeps the dir as the plane shapes drawn in it land on (as the phase-2 dev hook does). */
export function lineSectionDir(s: LineSection): ElevDir {
	const oc = lineSectionOClip(s), { t } = frameOnLine(oc.a, oc.b)
	return Math.abs(t[0]) >= Math.abs(t[1]) ? (t[0] > 0 ? 'front' : 'rear') : t[1] > 0 ? 'left' : 'right'   // geometry DIR_T
}

/** The plan rectangle it cuts: a, b, then the far side (b, a + look · depth). */
export function lineSectionRegion(s: LineSection): Pt[] {
	const L = lineLook(s), d = Math.abs(s.depth)
	return [s.a, s.b, [s.b[0] + L[0] * d, s.b[1] + L[1] * d], [s.a[0] + L[0] * d, s.a[1] + L[1] * d]]
}

/** An axis-aligned Clip covering it (+ its z band) — the fallback `clip` a linked frame keeps, and what box-only code
 *  (the DXF export's frame clip) sees. */
export function lineSectionClip(s: LineSection): Clip {
	const r = lineSectionRegion(s), xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
	return { x0: Math.round(Math.min(...xs)), y0: Math.round(Math.min(...ys)), z0: s.z0 ?? -ALL_Z, x1: Math.round(Math.max(...xs)), y1: Math.round(Math.max(...ys)), z1: s.z1 ?? ALL_Z }
}

/** One end's arrow: the shaft from the line's end to the tip, and the head triangle (tip first). */
export type SecArrow = { end: Pt; tip: Pt; head: [Pt, Pt, Pt] }
/** The OpenCad plan look, in drawing mm — `u` is one annotative unit (≈ a paper mm; the caller scales it): at each end
 *  (a, then b) an arrow along the look direction, and the labels just past the ends ("A" beyond a, "A′" beyond b). */
export function lineSectionMarks(s: LineSection, u: number): { arrows: [SecArrow, SecArrow]; labels: [{ p: Pt; text: string }, { p: Pt; text: string }] } {
	const t = unit(s.a, s.b), L = lineLook(s), len = 7 * u, hl = 2.6 * u, hw = 1.3 * u, gap = 3 * u
	const arrow = (e: Pt): SecArrow => {
		const tip: Pt = [e[0] + L[0] * len, e[1] + L[1] * len], base: Pt = [tip[0] - L[0] * hl, tip[1] - L[1] * hl]
		return { end: e, tip, head: [tip, [base[0] + t[0] * hw, base[1] + t[1] * hw], [base[0] - t[0] * hw, base[1] - t[1] * hw]] }
	}
	const [na, nb] = lineSectionLabels(s)
	return {
		arrows: [arrow(s.a), arrow(s.b)],
		labels: [{ p: [s.a[0] - t[0] * gap, s.a[1] - t[1] * gap], text: na }, { p: [s.b[0] + t[0] * gap, s.b[1] + t[1] * gap], text: nb }],
	}
}
/** The two end labels: the name at a, the name primed at b ("A" / "A′"). */
export const lineSectionLabels = (s: { name?: string }): [string, string] => { const n = s.name || '?'; return [n, `${n}′`] }
/** A section's display title — "Section A–A′" for a line, the box's own name ("Section A"), an elevation marker's name
 *  else "Elevation 1" (phase 4 — its number). */
export function sectionTitle(s: Section): string {
	if (s.kind === 'elev') return s.name || `Elevation ${s.number || '?'}`
	if (!isLineSection(s)) return s.name ?? 'Section'
	const [a, b] = lineSectionLabels(s)
	return `Section ${a}–${b}`
}

/** A line section under p: within thrMm of its cut line. */
export const hitLineSection = (s: LineSection, p: Pt, thrMm: number): boolean => segDist(p, s.a, s.b) < thrMm

export type LineGripKey = 'a' | 'b' | 'depth'
/** Its grips: both ends, and the DEPTH handle — the middle of the region's far side (drag it along the look). */
export function lineSectionGrips(s: LineSection): { key: LineGripKey; p: Pt }[] {
	const L = lineLook(s), d = Math.abs(s.depth), m: Pt = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
	return [{ key: 'a', p: s.a }, { key: 'b', p: s.b }, { key: 'depth', p: [m[0] + L[0] * d, m[1] + L[1] * d] }]
}
/** A grip dragged to p → the section's patch (whole mm). An END moves (Shift: in 15° steps about the other end, its
 *  length kept to the pointer's); a drag that would collapse the line is ignored ({}). The DEPTH handle sets the depth
 *  to p's distance along the look (≥ 1 mm) — the line itself stays. */
export function applyLineGrip(s0: LineSection, key: LineGripKey, p: Pt, shift = false): Partial<LineSection> {
	if (key === 'depth') {
		const L = lineLook(s0), m: Pt = [(s0.a[0] + s0.b[0]) / 2, (s0.a[1] + s0.b[1]) / 2]
		return { depth: Math.max(1, Math.round((p[0] - m[0]) * L[0] + (p[1] - m[1]) * L[1])) }
	}
	const other = key === 'a' ? s0.b : s0.a
	let q = p
	if (shift) {
		const dx = p[0] - other[0], dy = p[1] - other[1], len = Math.hypot(dx, dy), st = Math.PI / 12
		const ang = Math.round(Math.atan2(dy, dx) / st) * st
		q = [other[0] + len * Math.cos(ang), other[1] + len * Math.sin(ang)]
	}
	const e = rnd(q)
	if (Math.hypot(e[0] - other[0], e[1] - other[1]) < 1) return {}
	return key === 'a' ? { a: e } : { b: e }
}

/** A section dragged by (dx, dy) from its press-time copy `s0` → its patch (whole mm): a line's ends, an elevation
 *  marker's point, a box's clip. */
export function moveSection(s0: Section, dx: number, dy: number): Partial<LineSection> | { at: [number, number] } | { clip: Clip } {
	if (isLineSection(s0)) return { a: rnd([s0.a[0] + dx, s0.a[1] + dy]), b: rnd([s0.b[0] + dx, s0.b[1] + dy]) }
	if (s0.kind === 'elev') return { at: rnd([s0.at[0] + dx, s0.at[1] + dy]) }
	const c = s0.clip
	return { clip: { ...c, x0: Math.round(c.x0 + dx), x1: Math.round(c.x1 + dx), y0: Math.round(c.y0 + dy), y1: Math.round(c.y1 + dy) } }
}

// ── the sheet frames a section drives (User: one section usually feeds SEVERAL elevation viewports, on one sheet or
// many, each with its own annotations / freezes / scale — none of that lives on the section) ──
/** One linked frame: its drawing (`did`; a stored sheet also has `sheetId`), the frame, and how to name them. */
export type SectionLink = { did: string; sheetId?: string; frameId: string; frame: string; sheet: string }
/** A drawing to scan: loaded docs (docs.svelte) or stored sheets (not loaded yet). */
export type LinkSource = { did: string; sheetId?: string; title: string; number?: string; frames: { id: string; section?: string; label?: string; seq?: number }[] }
/** Every sheet frame linked to section `id`: the LOADED drawings first (they hold the edits since loading), then the
 *  stored sheets that aren't loaded (a drawing in both is taken from `loaded`). `sheet` = its number, else its title;
 *  `frame` = the frame's label, else its sequence number. */
export function sectionLinksOf(id: string, loaded: LinkSource[], stored: LinkSource[]): SectionLink[] {
	const out: SectionLink[] = [], seen = new Set(loaded.map((d) => d.did))
	for (const d of [...loaded, ...stored.filter((s) => !seen.has(s.did))])
		for (const f of d.frames) if (f.section === id)
			out.push({ did: d.did, ...(d.sheetId ? { sheetId: d.sheetId } : {}), frameId: f.id, frame: f.label || (f.seq != null ? String(f.seq) : '?'), sheet: d.number || d.title })
	return out
}
/** "3 viewports — A-201 · 1, A-202 · 2 …" (the toolbar / Properties summary); '' when none. */
export function linksSummary(links: SectionLink[], max = 4): string {
	if (!links.length) return ''
	const names = links.slice(0, max).map((l) => `${l.sheet} · ${l.frame}`).join(', ')
	return `${links.length} viewport${links.length === 1 ? '' : 's'} — ${names}${links.length > max ? ' …' : ''}`
}
