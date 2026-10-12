// A FILL SECTION on paper (backlog "Fill-rate drawing as a viewport from a trunk"; the old Drawings tool's "Fill
// Rate" viewport): one run segment's inside with its cables packed in — the picture Properties › Fill draws
// (ui/RunFill.svelte, domain/fill.ts packCables) — at a true scale, then its fill % against the limit, its inside
// size and its cables by type. Paper mm at 1:1 from (0, 0), y down. Pure; tested in fillSection.test.ts.
import type { ProjectIndex } from '../domain/project'
import type { Id, ProjectSettings } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Prim } from './display'
import { cableColor, cableCountText, cableOd, fillTone, insideOf, packCables, segKey, FILL_LIMIT_PCT, type SegFill } from '../domain/fill'

/** The section's scales (1:N): the closest at which it fits a 80 × 60 mm box. */
const SCALES = [1, 2, 5, 10, 20], BOX_W = 80, BOX_H = 60
const TONE: Record<ReturnType<typeof fillTone>, string> = { ok: '#15803d', warn: '#b45309', over: '#dc2626' }

/** "28.3%", as Properties › Fill shows it. */
export const pctText = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : 'no section size')

/** The run and segment named: "T1 · seg 2". */
export function fillTitle(ix: ProjectIndex, shapeId: Id, segId: Id): string {
	const s = ix.get<Shape>(shapeId)
	if (s?.type !== 'shape' || s.geom.kind !== 'path') return 'Fill section (run gone)'
	const i = s.geom.segs.findIndex((g) => g.id === segId)
	return `${s.label || ix.nameOf(s.id) || 'Run'} · ${i < 0 ? 'segment gone' : `seg ${i + 1}`}`
}

export function fillSectionDisplayList(ix: ProjectIndex, shapeId: Id, segId: Id, fills: Map<string, SegFill>): Prim[] {
	const out: Prim[] = [{ k: 'text', at: { x: 0, y: 4 }, text: `Fill · ${fillTitle(ix, shapeId, segId)}`, size: 3.5, cls: 'legend-title' }]
	const note = (y: number, text: string, color?: string): Prim => ({ k: 'text', at: { x: 0, y }, text, size: 2.5, cls: 'legend-text', ...(color ? { color } : {}) })
	const s = ix.get<Shape>(shapeId), seg = s?.type === 'shape' && s.geom.kind === 'path' ? s.geom.segs.find((g) => g.id === segId) : undefined
	const f = fills.get(segKey(shapeId, segId))
	if (!s || !seg) return out
	if (!f) return [...out, note(9, 'No cables through this segment')]
	const st = ix.get<ProjectSettings>('settings'), settings = st?.type === 'settings' ? st : undefined
	const od = (t: string) => f.od?.[t] ?? cableOd(settings, t)
	// colors as Properties › Fill draws them: by the cable types of the whole run
	const runTypes = [...new Set(s.geom.kind === 'path' ? s.geom.segs.flatMap((g) => Object.keys(fills.get(segKey(shapeId, g.id))?.cables ?? {})) : [])]
	const sec = seg.section ?? s.section
	let y = 8
	if (sec) {
		const p = packCables(sec, f.cables, od), n = SCALES.find((k) => p.w / k <= BOX_W && p.h / k <= BOX_H) ?? SCALES.at(-1)!
		const cx = p.w / n / 2, cy = y + p.h / n / 2
		out.push(p.round ? { k: 'circle', c: { x: cx, y: cy }, r: p.w / n / 2, fill: true, cls: 'legend' }
			: { k: 'line', pts: [{ x: 0, y }, { x: p.w / n, y }, { x: p.w / n, y: y + p.h / n }, { x: 0, y: y + p.h / n }], closed: true, fill: true, cls: 'legend' })
		for (const c of p.cables) out.push({ k: 'circle', c: { x: cx + c.x / n, y: cy + c.y / n }, r: c.r / n, fill: true, cls: 'fill-cable', color: cableColor(settings, runTypes, c.type) })
		y += p.h / n + 5
		out.push({ k: 'text', at: { x: 0, y }, text: `${pctText(f.pct)} full (limit ${FILL_LIMIT_PCT}%)`, size: 3, cls: 'legend-title', color: TONE[fillTone(f.pct)] })
		const inside = insideOf(sec)
		out.push(note(y += 4.5, `${sec.round ? `Ø${inside.w}` : `${inside.w}×${inside.h}`} inside · section 1:${n}`))
		out.push(note(y += 4, cableCountText(f)))
		if (p.dropped) out.push(note(y += 4, `${p.dropped} cable${p.dropped === 1 ? '' : 's'} don’t fit`, TONE.over))
	} else out.push(note(y += 1, `${pctText(f.pct)} — the run has no section size`, TONE.over))
	// the cables by type, each with its color
	const label = (t: string) => settings?.cableTypes.find((c) => c.id === t)?.label ?? t
	for (const [t, n] of Object.entries(f.cables)) {
		y += 4
		const of = (m: number | undefined, what: string) => (m ? (m === n ? what : `${m} ${what}`) : '')
		const notes = [of(f.hand?.[t], 'by hand'), of(f.est?.[t], 'estimated')].filter(Boolean), by = notes.length ? ` (${notes.join(', ')})` : ''
		out.push({ k: 'circle', c: { x: 1.2, y: y - 0.9 }, r: 1.1, fill: true, cls: 'fill-cable', color: cableColor(settings, runTypes, t) })
		out.push({ k: 'text', at: { x: 3.5, y }, text: `${n} × ${label(t)}  Ø${od(t)}${by}`, size: 2.5, cls: 'legend-text' })
	}
	return out
}
