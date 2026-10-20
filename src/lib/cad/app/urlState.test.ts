import { describe, it, expect } from 'vitest'
import { encodeSpec, decodeSpec, readViewState, writeViewState, paneLevelsOf } from './urlState'
import type { ViewSpec } from '../views/space'

describe('view state in the URL', () => {
	it('every view kind round-trips', () => {
		const specs: ViewSpec[] = [{ kind: 'plan' }, { kind: 'elevation', dir: 'left' }, { kind: 'row', spaceId: 'S1', face: 'rear' }, { kind: 'row', spaceId: 'S1', face: 'front', rowId: 'R9' }, { kind: 'sheet', sheetId: 'SH' }, { kind: 'portmap', deviceIds: ['d-1', 'Xy_2'] },
			{ kind: 'riser' }, { kind: 'riser', hideEmpty: true }, { kind: 'riser', buildingId: 'Am0-8_x' }, { kind: 'riser', hideEmpty: true, buildingId: 'B1' },
			{ kind: 'riser', hidden: [13, 14, 15, 29, 31] }, { kind: 'riser', hideEmpty: true, hidden: [-2, -1, 0, 5], buildingId: 'B1' }]
		for (const s of specs) expect(decodeSpec(encodeSpec(s))).toEqual(s)
		expect(decodeSpec('nonsense')).toBeNull()
	})
	it('level, two panes and the active one; other params kept; junk ignored', () => {
		const p = writeViewState(new URLSearchParams('x=1'), { levelId: 'L3', panes: [{ kind: 'plan' }, { kind: 'sheet', sheetId: 'SH' }], active: 1 })
		expect(p.toString()).toBe('x=1&level=L3&v=plan%2Csheet.SH&a=1')
		expect(readViewState(p)).toEqual({ levelId: 'L3', panes: [{ kind: 'plan' }, { kind: 'sheet', sheetId: 'SH' }], active: 1 })
		expect(readViewState(new URLSearchParams('v=bogus&a=7'))).toEqual({})
	})
	it('split on two levels: each pane keeps its own level (3303 beside 3307); one level → no levels param', () => {
		const two = { levelId: 'L7', panes: [{ kind: 'plan' }, { kind: 'plan' }] as ViewSpec[], active: 1, paneLevels: ['L3', 'L7'] }
		const p = writeViewState(new URLSearchParams(), two)
		expect(p.get('level')).toBe('L7')
		expect(p.get('levels')).toBe('L3,L7')
		const back = readViewState(p)
		expect(back.paneLevels).toEqual(['L3', 'L7'])
		expect(paneLevelsOf(back)).toEqual(['L3', 'L7'])
		// both panes on one level, or one pane: only `level` (an old `levels` goes)
		expect(writeViewState(p, { ...two, paneLevels: ['L7', 'L7'] }).has('levels')).toBe(false)
		expect(writeViewState(p, { levelId: 'L3', panes: [{ kind: 'plan' }], active: 0, paneLevels: ['L3', 'L7'] }).has('levels')).toBe(false)
		// a link with one level opens both panes on it; `levels` with one pane is ignored
		expect(paneLevelsOf(readViewState(new URLSearchParams('level=L3&v=plan,front')))).toEqual(['L3', 'L3'])
		expect(readViewState(new URLSearchParams('level=L3&v=plan&levels=L3,L7')).paneLevels).toBeUndefined()
	})
})

describe('floor runs in a URL (a riser view’s hidden floors)', () => {
	it('runs with ":" and "_", basements included; junk skipped', async () => {
		const { floorRuns, parseFloorRuns } = await import('./urlState')
		expect(floorRuns([29, 13, 14, 15, 31, 14])).toBe('13:15_29_31')
		expect(floorRuns([-2, -1, 0, 5])).toBe('-2:0_5')
		expect(parseFloorRuns('13:15_29_x_31')).toEqual([13, 14, 15, 29, 31])
	})
})
