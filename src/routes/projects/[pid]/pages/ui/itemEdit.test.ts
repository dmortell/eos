import { describe, it, expect } from 'vitest'
import { ItemEditor, type ItemSource } from './itemEdit.svelte'
import type { Pt } from './geometry'

// A tiny fake kind: boxes, a selection, and a log of what was committed.
type B = { id: string; x: number; y: number; w: number; locked?: boolean }
function world(init: B[]) {
	let items = init.map((b) => ({ ...b })), sel: string[] = [], n = 0
	const log: string[] = []
	const put = (ts: B[]) => { for (const t of ts) items = items.some((i) => i.id === t.id) ? items.map((i) => (i.id === t.id ? { ...t } : i)) : [...items, { ...t }] }
	const src: ItemSource<B> = {
		kind: 'box',
		get: (id) => items.find((i) => i.id === id),
		id: (t) => t.id,
		translate: (t, dx, dy) => ({ ...t, x: t.x + dx, y: t.y + dy }),
		grips: (t) => [{ x: t.x + t.w, y: t.y, apply: (p: Pt) => ({ ...t, w: Math.max(1, p[0] - t.x) }) }],
		snapDelta: (dx, dy) => [Math.round(dx / 10) * 10, Math.round(dy / 10) * 10],
		duplicate: (ts) => ts.map((t) => ({ ...t, id: `c${++n}` })),
		canMove: (t) => !t.locked,
		marquee: (a, b) => items.filter((i) => i.x >= Math.min(a[0], b[0]) && i.x <= Math.max(a[0], b[0])).map((i) => i.id),
		sel: { ids: () => sel, set: (ids) => { sel = ids } },
		commit: { begin: () => log.push('begin'), update: (ts) => put(ts), add: (ts) => { put(ts); log.push(`add ${ts.length}`) }, end: (ms) => log.push(ms ? `end ${ms}` : 'end') },
	}
	return { src, items: () => items, sel: () => sel, log, ed: new ItemEditor(src, { ortho: () => false }) }
}

describe('ItemEditor (the one editing engine)', () => {
	it('a press on an unselected item selects it and drags it (grid-snapped), one step', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }, { id: 'b', x: 100, y: 0, w: 10 }])
		expect(w.ed.beginMove('a', [0, 0], 'move', -1, { dup: false, additive: false })).toBe(true)
		expect(w.sel()).toEqual(['a'])
		w.ed.moveTo([23, 7], false); w.ed.endMove()
		expect(w.items()[0]).toMatchObject({ x: 20, y: 10 }); expect(w.log).toEqual(['begin', 'end'])
	})
	it('pressing one of a selection moves them all; Shift axis-locks', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }, { id: 'b', x: 100, y: 0, w: 10 }])
		w.src.sel.set(['a', 'b'])
		w.ed.beginMove('b', [100, 0], 'move', -1, { dup: false, additive: false })
		w.ed.moveTo([150, 12], true); w.ed.endMove()   // Shift: the larger axis only
		expect(w.items().map((i) => [i.x, i.y])).toEqual([[50, 0], [150, 0]])
	})
	it('Ctrl-drag duplicates on the first move and drags the copies; the originals stay', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }])
		w.ed.beginMove('a', [0, 0], 'move', -1, { dup: true, additive: true })
		w.ed.moveTo([40, 0], false); w.ed.endMove()
		expect(w.items().map((i) => [i.id, i.x])).toEqual([['a', 0], ['c1', 40]]); expect(w.sel()).toEqual(['c1'])
	})
	it('a grip reshapes; a locked item never drags; a cancel puts things back', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }, { id: 'L', x: 50, y: 0, w: 10, locked: true }])
		w.ed.beginMove('a', [10, 0], 'grip', 0, { dup: false, additive: false }); w.ed.moveTo([35, 0], false); w.ed.endMove()
		expect(w.items()[0].w).toBe(35)
		expect(w.ed.beginMove('L', [50, 0], 'move', -1, { dup: false, additive: false })).toBe(false)
		w.ed.beginMove('a', [0, 0], 'move', -1, { dup: false, additive: false }); w.ed.moveTo([30, 0], false); w.ed.cancelMove(true)
		expect(w.items()[0].x).toBe(0)
	})
	it('marquee selects (Shift unions); a tiny box is a click; nudge + Ctrl+D', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }, { id: 'b', x: 100, y: 0, w: 10 }])
		w.ed.beginMarquee([-5, -5], false); w.ed.marqueeTo([50, 5]); expect(w.ed.endMarquee()).toBe(true); expect(w.sel()).toEqual(['a'])
		w.ed.beginMarquee([90, 0], true); w.ed.marqueeTo([110, 5]); w.ed.endMarquee(); expect(w.sel()).toEqual(['a', 'b'])
		w.ed.beginMarquee([0, 0], false); w.ed.marqueeTo([1, 1]); expect(w.ed.endMarquee()).toBe(false)
		expect(w.ed.nudge(5, 0)).toBe(true); expect(w.items().map((i) => i.x)).toEqual([5, 105]); expect(w.log.at(-1)).toBe('end 600')
		expect(w.ed.duplicateSel(20)).toEqual(['c1', 'c2']); expect(w.items().at(-1)).toMatchObject({ x: 125, y: 20 })
	})
	it('MOVE / COPY (command line): one step each; a copy keeps the originals selected; locked items stay', () => {
		const w = world([{ id: 'a', x: 0, y: 0, w: 10 }, { id: 'L', x: 50, y: 0, w: 10, locked: true }])
		w.src.sel.set(['a', 'L'])
		expect(w.ed.moveSel(10, 0)).toBe(true); expect(w.items().map((i) => i.x)).toEqual([10, 50]); expect(w.log).toEqual(['begin', 'end'])
		expect(w.ed.copySel([[0, 20], [0, 40]])).toEqual(['c1', 'c2', 'c3', 'c4'])
		expect(w.items().filter((i) => i.id.startsWith('c')).map((i) => i.y)).toEqual([20, 20, 40, 40]); expect(w.sel()).toEqual(['a', 'L'])
		expect(w.log.slice(2)).toEqual(['begin', 'add 2', 'add 2', 'end'])
	})
})
