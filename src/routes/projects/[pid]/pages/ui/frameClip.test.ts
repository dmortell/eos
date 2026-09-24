import { describe, it, expect } from 'vitest'
import { clipOf, pasteClip } from './frameClip'
import type { SheetFrame } from '../types'
import type { Ent } from './geometry'

const frame = (id: string, seq: number, label?: string): SheetFrame => ({ id, x: 10, y: 20, w: 100, h: 80, border: 'solid', proj: 'plan', scale: '1:100', clip: null, label: label ?? String(seq), seq, modelId: 'm1', locked: true })
const shapes: Ent[] = [
	{ id: 's1', type: 'rect', a: [0, 0], b: [1, 1], space: 'view:f1', groupId: 'g' },
	{ id: 's2', type: 'rect', a: [0, 0], b: [1, 1], space: 'view:f1', groupId: 'g' },
	{ id: 's3', type: 'rect', a: [0, 0], b: [1, 1], space: 'view:other' },
	{ id: 's4', type: 'rect', a: [0, 0], b: [1, 1] },
]

describe('frame clipboard (B2)', () => {
	it('copies frames with their view-scoped annotations only', () => {
		const c = clipOf([frame('f1', 1)], () => shapes, 'm0')
		expect(c.shapes.map((s) => s.ent.id)).toEqual(['s1', 's2'])
	})
	it('a frame showing the sheet default model keeps that model explicitly (pasted elsewhere it must not switch)', () => {
		const c = clipOf([{ ...frame('f1', 1), modelId: undefined }], () => shapes, 'm0')
		expect(c.frames[0].modelId).toBe('m0'); expect(c.shapes[0].modelId).toBe('m0')
	})
	it('pastes with new ids, renumbered, offset, unlocked; annotations re-scoped with shared new group ids', () => {
		let n = 0; const id = (p = 'x') => `${p}${++n}`
		const c = pasteClip(clipOf([frame('f1', 1), frame('f2', 2, 'Plan')], () => shapes, 'm0'), id, 5, 20)
		expect(c.frames.map((f) => [f.seq, f.label, f.x, f.y, f.locked])).toEqual([[5, '5', 30, 40, undefined], [6, 'Plan', 30, 40, undefined]])
		const nf = c.frames[0].id
		expect(c.shapes.every((s) => s.ent.space === `view:${nf}`)).toBe(true)
		expect(new Set(c.shapes.map((s) => s.ent.groupId)).size).toBe(1)
		expect(c.shapes[0].ent.groupId).not.toBe('g')
	})
})
