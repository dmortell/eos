import { describe, it, expect } from 'vitest'
import { liveFileIds, followCalib, unlinkIfMoved } from './floorplanLink'
import type { Ent } from './geometry'
import type { Model } from '../3dview/types'

const fp = (over: Partial<Ent> = {}): Ent => ({ id: 'fp', type: 'image', src: 'pdf:F1#2', a: [0, 0], b: [100, 50], live: true, ...over })

describe('floorplan live calibration (I6)', () => {
	it('collects the files live floorplans follow', () => {
		const ms = [{ shapes: [fp(), fp({ id: 'x', src: 'pdf:F2#1', live: undefined }), fp({ id: 'y', src: 'blob:1' })] }] as unknown as Model[]
		expect(liveFileIds(ms)).toEqual(['F1'])
	})
	it('moves a shape onto a changed calibration, and does nothing when it already matches', () => {
		expect(followCalib(fp(), { a: [0, 0], b: [100, 50] })).toBeNull()
		expect(followCalib(fp({ crop: { x: 0, y: 0, w: 1, h: 1 } }), { a: [-10, 0], b: [90, 50] })).toEqual({ ...fp(), a: [-10, 0], b: [90, 50] })
	})
	it('a user move / crop unlinks it; a label edit keeps the link', () => {
		expect(unlinkIfMoved(fp(), fp({ a: [5, 0] })).live).toBeUndefined()
		expect(unlinkIfMoved(fp(), fp({ crop: { x: 0.1, y: 0, w: 0.9, h: 1 } })).live).toBeUndefined()
		expect(unlinkIfMoved(fp(), fp({ opacity: 0.4 })).live).toBe(true)
	})
})
