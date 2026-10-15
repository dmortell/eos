// OUTLETS PER DESK / ARRAY (backlog W13, walkthrough B12): desks come in blocks of 4–8 with the same outlets, one click
// each was slow. Two ways to repeat them:
//  - Array (editor/moveTool.ts): N copies of the selection, a step apart.
//  - Outlets onto desks: the outlets drawn on one desk, onto every other selected desk of the same block, turned with it.
// Unlike a paste (as-is, ADR 0002 / User), the copied outlets are NUMBERED ON: each continues its usage's series on the
// level, as the Outlet tool numbers the next one (W11), and its ports follow.
import type { Id, Pt, Outlet } from './types'
import type { Entity } from './drawing'
import type { Shape } from './shapes'
import type { ProjectIndex } from './project'
import { makeClip, pasteClip } from './clipboard'
import { nextLabel, numberAt, naturalCompare, renumberOutlets, readingOrder } from './labels'
import { rotatePt } from './shapes'
import { norm360 } from './conventions'

/** The outlet relabelled; its ports follow (the matching number group, else a port label that starts with the old one). */
function relabel(o: Outlet, label: string): Outlet {
	const n = numberAt(label)
	const r = n === undefined ? null : renumberOutlets([o], { start: n })[0]
	if (r && r.label === label) return r
	return { ...o, label, ports: o.ports.map((p) => (p.label.startsWith(o.label) ? { ...p, label: label + p.label.slice(o.label.length) } : p)) }
}

/** New labels for the copied outlets among `items`, in the order given: each the next free label of its usage's series
 *  on its level (the series' last label + 1, by natural order), never one already there. Other items pass through. */
export function numberOn(items: Entity[], ix: ProjectIndex): Entity[] {
	const used = new Map<Id, Set<string>>(), last = new Map<string, string>()
	const usedOn = (lv: Id) => {
		if (!used.has(lv)) used.set(lv, new Set(ix.outlets.filter((o) => o.levelId === lv).map((o) => o.label)))
		return used.get(lv)!
	}
	const lastOf = (lv: Id, usage: string): string | undefined => {
		const k = `${lv}\n${usage}`
		if (!last.has(k)) { const l = ix.outlets.filter((o) => o.levelId === lv && o.usage === usage).map((o) => o.label).sort(naturalCompare).at(-1); if (l) last.set(k, l) }
		return last.get(k)
	}
	return items.map((e) => {
		if (e.type !== 'outlet') return e
		const taken = usedOn(e.levelId)
		let label = nextLabel(lastOf(e.levelId, e.usage) ?? e.label)
		while (taken.has(label)) label = nextLabel(label)
		taken.add(label)
		last.set(`${e.levelId}\n${e.usage}`, label)
		return relabel(e, label)
	})
}

/** `n` copies of the selection, copy k moved by k × `step` (world mm), outlets numbered on: what the Array tool puts.
 *  null = nothing here can be copied (devices: copy them in a rack view). */
export function arrayCopies(ix: ProjectIndex, ids: Id[], step: Pt & { z?: number }, n: number): { put: Entity[]; select: Id[] } | null {
	const clip = makeClip(ix, ids, '')
	if (!clip || clip.from.kind === 'rack') return null
	const put: Entity[] = [], select: Id[] = []
	for (let k = 1; k <= n; k++) {
		const r = pasteClip(clip, { pid: '', ix, to: { kind: clip.from.kind, id: clip.from.id }, d: { x: step.x * k, y: step.y * k, ...(step.z ? { z: step.z * k } : {}) } })
		// a layer the copy brings is the same record each time: put it once
		for (const e of r.put) if (!put.some((x) => x.id === e.id)) put.push(e)
		select.push(...r.select)
	}
	return { put: numberOn(put, ix), select }
}

/** An outlet turned `deg` about `c` (its symbol turns too). */
function turned(o: Outlet, c: Pt, deg: number): Outlet {
	const { rot: _, ...rest } = o, rot = (Math.round(norm360((o.rot ?? 0) + deg) * 1e6) / 1e6) % 360
	return { ...rest, at: rotatePt(o.at!, c, deg), ...(rot ? { rot } : {}) }
}

type Desk =Shape & { geom: { kind: 'insert' } }
const isDesk = (e: Entity | undefined): e is Desk => e?.type === 'shape' && e.geom.kind === 'insert' && !!e.levelId

/** The outlets drawn on one desk, onto every other selected desk of the same block: each copy sits where it sits on
 *  that desk, turned as the desk is turned. The template desk is the selected block nearest the outlets' middle; the
 *  desks are numbered in reading order (rows top to bottom, then left to right), each desk's outlets in label order.
 *  `problem` = why nothing was copied. */
export function outletsOntoDesks(ix: ProjectIndex, ids: Id[]): { put: Entity[]; select: Id[]; desks: number } | { problem: string } {
	const sel = ids.map((id) => ix.get(id))
	const outlets = sel.filter((e): e is Outlet => e?.type === 'outlet' && !!e.at).sort((a, b) => naturalCompare(a.label, b.label))
	const desks = sel.filter(isDesk)
	if (!outlets.length || desks.length < 2) return { problem: 'Select the outlets on one desk, and that desk with the desks to copy them to (blocks)' }
	const mid = { x: outlets.reduce((s, o) => s + o.at!.x, 0) / outlets.length, y: outlets.reduce((s, o) => s + o.at!.y, 0) / outlets.length }
	const dist = (d: Desk) => Math.hypot(d.geom.at.x - mid.x, d.geom.at.y - mid.y)
	const from = desks.reduce((a, b) => (dist(b) < dist(a) ? b : a))
	const to = readingOrder(desks.filter((d) => d !== from && d.geom.blockId === from.geom.blockId && d.levelId === from.levelId), (d) => d.geom.at)
	if (!to.length) return { problem: 'None of the other selected desks is the same block as the one with the outlets' }
	const clip = makeClip(ix, outlets.map((o) => o.id), '')
	if (!clip) return { problem: 'Those outlets can’t be copied' }
	const put: Entity[] = [], select: Id[] = []
	for (const d of to) {
		const move = { x: d.geom.at.x - from.geom.at.x, y: d.geom.at.y - from.geom.at.y }
		const turn = (d.geom.rot ?? 0) - (from.geom.rot ?? 0)
		const r = pasteClip(clip, { pid: '', ix, to: { kind: 'level', id: d.levelId! }, d: move })
		for (const e of r.put) put.push(turn && e.type === 'outlet' && e.at ? turned(e, d.geom.at, turn) : e)
		select.push(...r.select)
	}
	return { put: numberOn(put, ix), select, desks: to.length }
}
