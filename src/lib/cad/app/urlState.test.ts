import { describe, it, expect } from 'vitest'
import { encodeSpec, decodeSpec, readViewState, writeViewState } from './urlState'
import type { ViewSpec } from '../views/space'

describe('view state in the URL', () => {
	it('every view kind round-trips', () => {
		const specs: ViewSpec[] = [{ kind: 'plan' }, { kind: 'elevation', dir: 'left' }, { kind: 'row', spaceId: 'S1', face: 'rear' }, { kind: 'row', spaceId: 'S1', face: 'front', rowId: 'R9' }, { kind: 'sheet', sheetId: 'SH' }, { kind: 'portmap', deviceIds: ['d-1', 'Xy_2'] }]
		for (const s of specs) expect(decodeSpec(encodeSpec(s))).toEqual(s)
		expect(decodeSpec('nonsense')).toBeNull()
	})
	it('level, two panes and the active one; other params kept; junk ignored', () => {
		const p = writeViewState(new URLSearchParams('x=1'), { levelId: 'L3', panes: [{ kind: 'plan' }, { kind: 'sheet', sheetId: 'SH' }], active: 1 })
		expect(p.toString()).toBe('x=1&level=L3&v=plan%2Csheet.SH&a=1')
		expect(readViewState(p)).toEqual({ levelId: 'L3', panes: [{ kind: 'plan' }, { kind: 'sheet', sheetId: 'SH' }], active: 1 })
		expect(readViewState(new URLSearchParams('v=bogus&a=7'))).toEqual({})
	})
})
