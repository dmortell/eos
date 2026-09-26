import { describe, it, expect } from 'vitest'
import { Clipboard, pasteCopies, arrange, setGroup, nextFreeLabel, relabelCopies, clipText, fromClipText, readable, clipHtml, fromClipHtml, textToShape, fromClipData, fromClipHtmlData, pasteObjCopies, resolvePastedLayer } from './clipboard'
import type { Obj } from '../3dview/types'
import { toPagesClip } from '../../sheets/tools/model3d/pagesClip'

describe('copy labels (E12)', () => {
	it('counts a trailing number on (padding kept), else appends -copy', () => {
		expect(nextFreeLabel('4A013', new Set(['4A013', '4A014']))).toBe('4A015')
		expect(nextFreeLabel('R-09', new Set(['R-09']))).toBe('R-10')
		expect(nextFreeLabel('Desk', new Set(['Desk', 'Desk-copy']))).toBe('Desk-copy2')
		expect(nextFreeLabel('Free', new Set(['Other']))).toBe('Free')
	})
	it('renames labelled copies so none repeats an existing label (or each other)', () => {
		const o = (id: string, LABEL?: string) => ({ id, type: 'insert', a: [0, 0], attrs: LABEL ? { LABEL } : undefined }) as Ent
		const out = relabelCopies([o('c1', '4A001'), o('c2', '4A001'), o('c3')], [o('a', '4A001'), o('b', '4A002')])
		expect(out.map((e) => e.attrs?.LABEL)).toEqual(['4A003', '4A004', undefined])
	})
})
import type { Ent } from './geometry'

const r = (id: string, groupId?: string): Ent => ({ id, type: 'rect', a: [0, 0], b: [10, 10], groupId })
const ids = (a: Ent[] | null) => a?.map((e) => e.id)
const counter = () => { let n = 0; return () => `n${++n}` }

describe('clipboard', () => {
	it('each paste lands a further step away, with fresh ids', () => {
		const cb = new Clipboard(), id = counter()
		expect(cb.paste(5, id)).toEqual([])
		cb.copy([r('a')])
		expect(cb.paste(5, id)[0]).toMatchObject({ id: 'n1', a: [5, 5], b: [15, 15] })
		expect(cb.paste(5, id)[0]).toMatchObject({ id: 'n2', a: [10, 10] })
		cb.copy([r('a')])   // a new copy restarts the stacking
		expect(cb.paste(5, id)[0].a).toEqual([5, 5])
	})
	it('a copied group gets ONE new group id; ungrouped shapes stay ungrouped', () => {
		const out = pasteCopies([r('a', 'g'), r('b', 'g'), r('c')], 0, counter())
		expect(out.map((e) => e.groupId)).toEqual(['n1', 'n1', undefined])
		expect(new Set(out.map((e) => e.id)).size).toBe(3)
	})
})

describe('arrange + groups', () => {
	const arr = ['a', 'b', 'c', 'd'].map((x) => r(x))
	it('front / back move the selection to the ends; forward / backward step it past one neighbour', () => {
		expect(ids(arrange(arr, ['b'], 'front'))).toEqual(['a', 'c', 'd', 'b'])
		expect(ids(arrange(arr, ['c'], 'back'))).toEqual(['c', 'a', 'b', 'd'])
		expect(ids(arrange(arr, ['b'], 'forward'))).toEqual(['a', 'c', 'b', 'd'])
		expect(ids(arrange(arr, ['c'], 'backward'))).toEqual(['a', 'c', 'b', 'd'])
		expect(arrange(arr, ['zz'], 'front')).toBeNull()
	})
	it('groups and ungroups', () => {
		const g = setGroup(arr, ['a', 'c'], 'G')
		expect(g.map((e) => e.groupId)).toEqual(['G', undefined, 'G', undefined])
		expect(setGroup(g, ['a'], undefined)[0].groupId).toBeUndefined()
	})
})

describe('system clipboard text', () => {
	it('round-trips shapes; ignores foreign text; load keeps stacking for the same content', () => {
		const ents: Ent[] = [{ id: 'a', type: 'rect', a: [0, 0], b: [10, 10] }]
		expect(fromClipText(clipText(ents))).toEqual(ents)
		expect(fromClipText('hello')).toBeNull(); expect(fromClipText('{"eos-pages-shapes":1,"ents":5}')).toBeNull()
		const cb = new Clipboard(); cb.copy(ents)
		let n = 0; const id = () => 'n' + ++n
		cb.paste(5, id); cb.load(JSON.parse(JSON.stringify(ents)))
		expect(cb.paste(5, id)[0].a).toEqual([10, 10])   // 2nd paste: still stacking
		cb.load([{ ...ents[0], id: 'b' }]); expect(cb.paste(5, id)[0].a).toEqual([5, 5])   // new content: restarts
	})
})

describe('office clipboard', () => {
	it('shapes out: readable text + a table for Excel; our data round-trips through the HTML', () => {
		const ents: Ent[] = [{ id: 't', type: 'text', a: [0, 0], text: 'Hello' }, { id: 'n', type: 'text', noteW: 90, a: [0, 0], text: '# Title\n| A | B |\n|---|---|\n| 1 | 2 |' }]
		const r = readable(ents)
		expect(r.plain).toBe('Hello\nTitle\nA\tB\n1\t2'); expect(r.html).toContain('<table border="1"><tr><td>A</td>')
		expect(fromClipHtml(clipHtml(ents))).toEqual(ents)
		expect(fromClipHtml('<p>x</p>')).toBeNull()
	})
	it('text in: one line → text, lines → a note, tab-separated → a markdown table', () => {
		expect(textToShape('Hi\r\n')).toEqual({ kind: 'text', text: 'Hi' })
		expect(textToShape('a\nb')).toEqual({ kind: 'note', text: 'a\nb' })
		expect(textToShape('Item\tQty\nOutlet\t24\n')!.text).toBe('| Item | Qty |\n| --- | --- |\n| Outlet | 24 |')
		expect(textToShape('  \n')).toBeNull()
	})
})

describe('3D objects on the clipboard', () => {
	const box = { type: 'prism', id: 'b1', x: 0, y: 0, z: 0, w: 600, d: 1000, h: 2000, edges: 4, layer: 'L1' } as Obj
	const run = { type: 'conduit', id: 'c1', w: 100, h: 50, edges: 4, nodes: [{ id: 'a', x: 0, y: 0, z: 0, conn: { obj: 'b1', pt: 'c' } }, { id: 'b', x: 1000, y: 0, z: 0, conn: { obj: 'gone', pt: 'c' } }], segments: [{ id: 's', a: 'a', b: 'b' }] } as Obj
	it('paste: new ids, moved, an attachment to a copied box follows it, others are let go', () => {
		let k = 0; const [b, c] = pasteObjCopies([box, run], 100, () => 'n' + ++k)
		expect(b.id).not.toBe('b1'); expect(b.type === 'prism' && [b.x, b.y]).toEqual([100, 100])
		if (c.type !== 'conduit') throw new Error('conduit expected')
		expect(c.nodes[0].conn).toEqual({ obj: b.id, pt: 'c' }); expect(c.nodes[1].conn).toBeUndefined()
		expect(run.type === 'conduit' && run.nodes[0].x).toBe(0)   // the source is untouched
	})
	it('round-trips through text + HTML; a layer is matched by id, then by name', () => {
		const t = clipText([], [box], { L1: 'Furniture' })
		expect(fromClipData(t)?.objs.length).toBe(1)
		expect(fromClipHtmlData(clipHtml([], [box], { L1: 'Furniture' }))?.layers).toEqual({ L1: 'Furniture' })
		expect(fromClipText(clipText([{ id: 't', type: 'text', a: [0, 0], text: 'x' }]))?.length).toBe(1)
		expect(resolvePastedLayer('L1', { L1: 'Furniture' }, [{ id: 'L1', name: 'Other' }])).toBe('L1')
		expect(resolvePastedLayer('L1', { L1: 'Furniture' }, [{ id: 'f9', name: 'Furniture' }])).toBe('f9')
		expect(resolvePastedLayer('L1', { L1: 'Furniture' }, [])).toBeUndefined()
	})
	it('a Sheets 3D copy arrives mirrored to y-down', () => {
		const d = fromClipData(toPagesClip([{ ...box, y: 500, rot: 30 } as never, run as never], (id) => (id === 'L1' ? 'Furniture' : undefined)))!
		const b = d.objs[0]; expect(b.type === 'prism' && [b.y, b.rot]).toEqual([-1500, -30])
		const c = d.objs[1]; expect(c.type === 'conduit' && c.nodes[1].y).toBe(0)
		expect(d.layers).toEqual({ L1: 'Furniture' })
	})
})
