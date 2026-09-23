import { describe, it, expect } from 'vitest'
import { docs } from './doc.svelte'

describe('paperOf / setPaper', () => {
	it('defaults to A3 landscape for an unknown or missing id', () => {
		expect(docs.paperOf('unknown-doc-1')).toEqual({ size: 'A3', landscape: true })
		expect(docs.paperOf(undefined)).toEqual({ size: 'A3', landscape: true })
		expect(docs.paperOf('')).toEqual({ size: 'A3', landscape: true })
	})
	it('round-trips a patch, keyed by the given id', () => {
		docs.setPaper('doc-paper-1', { size: 'A2' })
		expect(docs.paperOf('doc-paper-1')).toEqual({ size: 'A2', landscape: true })
		docs.setPaper('doc-paper-1', { landscape: false })
		expect(docs.paperOf('doc-paper-1')).toEqual({ size: 'A2', landscape: false })   // merges, doesn't replace
		expect(docs.paperOf('doc-paper-2')).toEqual({ size: 'A3', landscape: true })   // a different id untouched
	})
	it('is a no-op for an undefined id', () => {
		expect(() => docs.setPaper(undefined, { size: 'A2' })).not.toThrow()
	})
})

describe('scaleOf / setScale', () => {
	it('defaults to 1:100 for an unknown or missing id', () => {
		expect(docs.scaleOf('unknown-doc-2')).toBe('1:100')
		expect(docs.scaleOf(undefined)).toBe('1:100')
	})
	it('round-trips, keyed by the given id', () => {
		docs.setScale('doc-scale-1', '1:50')
		expect(docs.scaleOf('doc-scale-1')).toBe('1:50')
		expect(docs.scaleOf('doc-scale-2')).toBe('1:100')
	})
})

describe('framesOf / setFrames', () => {
	it('defaults to an empty array for an unknown id', () => {
		expect(docs.framesOf('unknown-doc-3')).toEqual([])
	})
	it('round-trips a frame list, keyed by the given id, independent of paper/scale on the same doc', () => {
		docs.setScale('doc-frames-1', '1:25')
		docs.setFrames('doc-frames-1', [{ id: 'f1', x: 0, y: 0, w: 100, h: 100, border: 'solid', proj: 'plan', scale: '1:25', clip: null, label: 'Plan' }])
		expect(docs.framesOf('doc-frames-1')).toHaveLength(1)
		expect(docs.framesOf('doc-frames-1')[0].id).toBe('f1')
		expect(docs.scaleOf('doc-frames-1')).toBe('1:25')   // untouched by setFrames
	})
})

describe('allFrames / restoreFrames — the history snapshot/restore seam', () => {
	it('allFrames reflects every doc\'s current frames', () => {
		docs.setFrames('doc-hist-a', [{ id: 'a1', x: 0, y: 0, w: 1, h: 1, border: 'solid', proj: 'plan', scale: '1:1', clip: null, label: 'A' }])
		docs.setFrames('doc-hist-b', [{ id: 'b1', x: 0, y: 0, w: 1, h: 1, border: 'solid', proj: 'plan', scale: '1:1', clip: null, label: 'B' }])
		const snap = docs.allFrames()
		expect(snap['doc-hist-a'].map((f) => f.id)).toEqual(['a1'])
		expect(snap['doc-hist-b'].map((f) => f.id)).toEqual(['b1'])
	})
	it('restoreFrames replaces frames for docs present in the snapshot, leaving paper/scale untouched', () => {
		docs.setPaper('doc-hist-c', { size: 'A2' })
		docs.setFrames('doc-hist-c', [{ id: 'c-old', x: 0, y: 0, w: 1, h: 1, border: 'solid', proj: 'plan', scale: '1:1', clip: null, label: 'old' }])
		docs.restoreFrames({ 'doc-hist-c': [{ id: 'c-new', x: 0, y: 0, w: 1, h: 1, border: 'solid', proj: 'plan', scale: '1:1', clip: null, label: 'new' }] })
		expect(docs.framesOf('doc-hist-c').map((f) => f.id)).toEqual(['c-new'])
		expect(docs.paperOf('doc-hist-c')).toEqual({ size: 'A2', landscape: true })   // paper survives
	})
	it('restoreFrames WIPES a doc\'s frames to [] if it exists now but had no entry in the snapshot (matches the old full-replace `docFrames = snapshot` assignment)', () => {
		docs.setFrames('doc-hist-d', [{ id: 'd1', x: 0, y: 0, w: 1, h: 1, border: 'solid', proj: 'plan', scale: '1:1', clip: null, label: 'D' }])
		docs.restoreFrames({})   // a history point BEFORE doc-hist-d's frame existed
		expect(docs.framesOf('doc-hist-d')).toEqual([])
	})
})

describe('seed', () => {
	it('applies a patch once, without clobbering anything set afterwards', () => {
		docs.seed('doc-seed-1', { scale: '1:25' })
		expect(docs.scaleOf('doc-seed-1')).toBe('1:25')
		docs.setScale('doc-seed-1', '1:10')
		expect(docs.scaleOf('doc-seed-1')).toBe('1:10')
	})
})
