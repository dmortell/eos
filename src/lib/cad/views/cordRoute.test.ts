// Cords along the cable channels: same rack / across a manager / between racks.
import { describe, it, expect } from 'vitest'
import { channelRoute, type RackFrame } from './cordRoute'

const R1: RackFrame = { id: 'R1', mid: 300, chan: 220, managers: [-500, -1500] }
const R2: RackFrame = { id: 'R2', mid: 1000, chan: 220, managers: [-800] }
const NONE: RackFrame = { id: 'R3', mid: 300, chan: 220, managers: [] }
const end = (x: number, y: number, rack: RackFrame) => ({ x, y, hh: 10, rack })
/** Every step is horizontal or vertical. */
const orthogonal = (pts: { x: number; y: number }[]) => pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y)

describe('cords along the channels', () => {
	it('same rack, same side: down the side channel', () => {
		const pts = channelRoute(end(150, -1000, R1), end(200, -1200, R1))
		expect(orthogonal(pts)).toBe(true)
		expect(Math.min(...pts.map((p) => p.x))).toBe(80)   // the left channel: 300 − 220
		expect(pts.some((p) => p.y === -500 || p.y === -1500)).toBe(false)
	})
	it('same rack, opposite sides: across through the manager nearest the middle', () => {
		const pts = channelRoute(end(150, -1300, R1), end(450, -1600, R1))
		expect(orthogonal(pts)).toBe(true)
		expect(pts.filter((p) => p.y === -1500).map((p) => p.x)).toEqual([80, 520])
	})
	it('no manager: one side channel only', () => {
		const pts = channelRoute(end(150, -1300, NONE), end(450, -1600, NONE))
		expect(orthogonal(pts)).toBe(true)
		expect(pts.filter((p) => p.x === 520)).toEqual([])
	})
	it('between racks: out the facing side, across, in the facing side — through a manager when the port is on the far side', () => {
		const pts = channelRoute(end(150, -1300, R1), end(1150, -900, R2))
		expect(orthogonal(pts)).toBe(true)
		// a on R1's left: crosses R1 through its nearest manager (−1500) to the right channel (520)
		expect(pts.filter((p) => p.y === -1500).map((p) => p.x)).toEqual([80, 520])
		// b on R2's right: entered from R2's left (780), across its manager (−800) to its right channel (1220)
		expect(pts.filter((p) => p.y === -800).map((p) => p.x)).toEqual([780, 1220])
		expect(pts[0]).toEqual({ x: 150, y: -1300 })
		expect(pts.at(-1)).toEqual({ x: 1150, y: -900 })
	})
	it('lanes keep parallel cords apart', () => {
		const a = channelRoute(end(150, -1000, R1), end(200, -1200, R1), 0)
		const b = channelRoute(end(150, -1000, R1), end(200, -1200, R1), 1)
		expect(Math.min(...a.map((p) => p.x))).not.toBe(Math.min(...b.map((p) => p.x)))
	})
})
