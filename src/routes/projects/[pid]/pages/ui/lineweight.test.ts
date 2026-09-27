import { describe, it, expect } from 'vitest'
import { LINEWEIGHTS, LW_DEFAULT, LW_BYLAYER, HAIRLINE_PX, nearestLw, legacyWeightMm, ownLw, resolveLw, strokePx, resolveColor, isByLayer, lwLabel } from './lineweight'
import { byBlock } from './blocks'
import { withDefaults } from './drawingDefaults'
import { PAPER_PX_PER_MM } from '../constants'
import type { Ent } from './geometry'

describe('lineweights', () => {
	it('the standard list is AutoCAD’s, ascending, from 0.00 mm', () => {
		expect(LINEWEIGHTS[0]).toBe(0)
		expect(LINEWEIGHTS).toContain(0.25)
		expect([...LINEWEIGHTS]).toEqual([...LINEWEIGHTS].sort((a, b) => a - b))
	})
	it('nearestLw snaps to the list', () => {
		expect(nearestLw(0.26)).toBe(0.25)
		expect(nearestLw(-1)).toBe(0)
		expect(nearestLw(9)).toBe(2.11)
	})
	it('legacy px weights map to mm (1.2 px = the old default look = 0.25 mm)', () => {
		expect(legacyWeightMm(1.2)).toBe(0.25)
		expect(legacyWeightMm(0.5)).toBe(0.09)
		expect(legacyWeightMm(1)).toBe(0.2)
		expect(legacyWeightMm(1.5)).toBe(0.3)
		expect(legacyWeightMm(2)).toBe(0.4)
		expect(legacyWeightMm(2.5)).toBe(0.53)
		expect(legacyWeightMm(3)).toBe(0.6)
	})
	it('ownLw: lw wins, else a legacy weight, else ByLayer; lw −1 is ByLayer even beside a stale weight', () => {
		expect(ownLw({ lw: 0.5 })).toBe(0.5)
		expect(ownLw({ lw: 0 })).toBe(0)
		expect(ownLw({ weight: 2 })).toBe(0.4)
		expect(ownLw({ lw: 0.35, weight: 2 })).toBe(0.35)
		expect(ownLw({ lw: LW_BYLAYER, weight: 2 })).toBeUndefined()
		expect(ownLw({})).toBeUndefined()
		expect(ownLw(undefined)).toBeUndefined()
	})
	it('resolveLw: own → layer (lw, else its px weight) → the default', () => {
		expect(resolveLw({ lw: 0.7 }, { lw: 0.35 })).toBe(0.7)
		expect(resolveLw({}, { lw: 0.35 })).toBe(0.35)
		expect(resolveLw({}, { weight: 2.5 })).toBe(0.53)
		expect(resolveLw({}, {})).toBe(LW_DEFAULT)
		expect(resolveLw({})).toBe(LW_DEFAULT)
	})
	it('strokePx: LWT on = mm × px/mm (never under a hairline), off = a hairline; hairlines stay one on screen', () => {
		expect(strokePx(0.5, { lwt: true, pxPerMm: PAPER_PX_PER_MM, canvasZoom: 1 })).toBeCloseTo(0.5 * PAPER_PX_PER_MM)
		expect(strokePx(0.5, { lwt: false, pxPerMm: PAPER_PX_PER_MM, canvasZoom: 1 })).toBe(HAIRLINE_PX)
		expect(strokePx(0, { lwt: true, pxPerMm: PAPER_PX_PER_MM, canvasZoom: 2 })).toBe(HAIRLINE_PX / 2)
		expect(strokePx(0.05, { lwt: true, pxPerMm: PAPER_PX_PER_MM, canvasZoom: 1 })).toBe(HAIRLINE_PX)
	})
	it('labels', () => { expect(lwLabel(0.25)).toBe('0.25 mm'); expect(lwLabel(1)).toBe('1.00 mm') })
})

describe('ByLayer colour', () => {
	it('an own colour wins; none / "" / bylayer / a stray byblock → the layer colour → the ink', () => {
		expect(resolveColor('#ff0000', '#00ff00', '#000')).toBe('#ff0000')
		expect(resolveColor(undefined, '#00ff00', '#000')).toBe('#00ff00')
		expect(resolveColor('', '#00ff00', '#000')).toBe('#00ff00')
		expect(resolveColor('ByLayer', '#00ff00', '#000')).toBe('#00ff00')
		expect(resolveColor('byblock', '#00ff00', '#000')).toBe('#00ff00')
		expect(resolveColor(undefined, undefined, '#000')).toBe('#000')
		expect(isByLayer('BYLAYER')).toBe(true)
		expect(isByLayer('#123456')).toBe(false)
	})
})

describe('blocks + drawing defaults carry the lineweight', () => {
	const ins: Ent = { id: 'i', type: 'insert', a: [0, 0], block: 'b', layer: 'data', color: '#123456', lw: 0.5 }
	it('a block shape with no lineweight takes the insert’s; one with its own keeps it; it lies on the insert’s layer', () => {
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1] }, ins)).toMatchObject({ lw: 0.5, layer: 'data' })
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1], lw: 0.13 }, ins).lw).toBe(0.13)
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1], weight: 2 }, ins).lw).toBeUndefined()
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1] }, { ...ins, lw: undefined }).lw).toBeUndefined()
		// an uncoloured block shape is ByLayer of the insert's layer, a 'byblock' one takes the insert's colour
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1] }, ins).color).toBeUndefined()
		expect(byBlock({ id: 's', type: 'rect', a: [0, 0], b: [1, 1], color: 'byblock' }, ins).color).toBe('#123456')
	})
	it('a default lineweight fills a new stroked shape (not one with its own), a ByLayer default leaves it unset', () => {
		const line: Ent = { id: 'l', type: 'polyline', pts: [[0, 0], [1, 1]] }
		expect(withDefaults(line, { lw: 0.35 }).lw).toBe(0.35)
		expect(withDefaults({ ...line, lw: 0.7 }, { lw: 0.35 }).lw).toBe(0.7)
		expect(withDefaults({ ...line, weight: 2 }, { lw: 0.35 }).lw).toBeUndefined()
		expect(withDefaults(line, { lw: LW_BYLAYER })).toEqual(line)
		expect(withDefaults(line, { lw: LW_BYLAYER, weight: 2 }).weight).toBe(2)   // legacy default still applies
	})
})
