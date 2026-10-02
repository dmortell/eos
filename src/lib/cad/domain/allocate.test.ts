// Allocation (Phase 3.4) as behaviour: Dave's rules from phase3.md §9.
import { describe, it, expect } from 'vitest'
import { allocate, assignFrom, panelsInOrder } from './allocate'
import { ProjectIndex } from './project'
import type { Entity } from './drawing'
import type { Device, Link, Outlet, Rack, Cord } from './types'

const rack = (id: string, order: number, x?: number): Rack => ({ type: 'rack', id, levelId: 'L', spaceId: 'S', order, name: id, kind: 'cabinet', heightU: 45, widthMm: 600, depthMm: 1000, ...(x !== undefined ? { at: { x, y: 0 } } : {}) })
const panel = (id: string, rackId: string, u: number, tier: 'low' | 'high' = 'low', ports = 24, extra: Partial<NonNullable<Device['panel']>> = {}): Device =>
	({ type: 'device', id, rackId, name: id, kind: 'panel', u, heightU: 1, face: 'both', portCount: ports, panel: { tier, ...extra } })
/** `room` null = a port with no server room set. */
const outlet = (n: number, opts: Partial<Outlet> = {}, ports = 2, room: string | null = 'S'): Outlet => {
	const label = `A.${String(n).padStart(3, '0')}`
	return { type: 'outlet', id: label, levelId: 'L', label, tier: 'low', usage: 'desk', mount: 'floor', ports: Array.from({ length: ports }, (_, i) => ({ port: i + 1, label: `${label}${'AB'[i]}`, serverRoomId: room ?? undefined, cableType: 'cat6a' })), ...opts }
}
const base = (): Entity[] => [
	{ type: 'level', id: 'L', buildingId: 'B', number: 1, name: '1F', order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } } as Entity,
	{ type: 'space', id: 'S', levelId: 'L', kind: 'server room', name: 'SR-A', code: 'A', order: 1 } as Entity,
	rack('R1', 0), rack('R2', 1),
	panel('P2', 'R1', 40), panel('P1', 'R1', 42), panel('P3', 'R2', 42),
]
const outlets = (n: number, from = 1) => Array.from({ length: n }, (_, i) => outlet(from + i))
/** "outlet:port" on each port of a panel, from the links. */
const onPanel = (links: Link[], panelId: string) => {
	const m = new Map(links.filter((l) => l.a.on === panelId).map((l) => [l.a.port, `${l.b.on}:${l.b.port}`]))
	return (n: number) => m.get(n)
}
const run = (ents: Entity[], opts = {}) => allocate(new ProjectIndex(ents), opts)

describe('allocation order', () => {
	it('top U down within a rack, racks one after another, port 1…n — outlets by label, then port', () => {
		const r = run([...base(), ...outlets(30)])
		const p1 = onPanel(r.add, 'P1'), p2 = onPanel(r.add, 'P2'), p3 = onPanel(r.add, 'P3')
		expect([p1(1), p1(2), p1(24)]).toEqual(['A.001:1', 'A.001:2', 'A.012:2'])
		expect(p2(1)).toBe('A.013:1')          // P2 is lower in R1, so it fills after P1
		expect(p3(1)).toBe('A.025:1')          // then the next rack
		expect(p3(13)).toBeUndefined()
		expect(r.unallocated).toEqual([])
		expect(r.add.every((l) => l.a.face === 'rear' && l.kind === 'horizontal' && !l.pinned)).toBe(true)
	})
	it('labels sort naturally (A.2 before A.10) and the panel order follows the row on the plan', () => {
		const ents = [...base().filter((e) => e.id !== 'R1' && e.id !== 'R2'), rack('R1', 0, 5000), rack('R2', 1, 1000)]
		expect(panelsInOrder(new ProjectIndex(ents), 'S').map((d) => d.id)).toEqual(['P3', 'P1', 'P2'])
		const o2 = { ...outlet(2), id: 'X2', label: 'A.2' }, o10 = { ...outlet(10), id: 'X10', label: 'A.10' }
		const r = run([...base(), o10, o2])
		expect(onPanel(r.add, 'P1')(1)).toBe('X2:1')
	})
})

describe('tiers', () => {
	it('high ports go to high panels first; only when those are full do they take spare floor-panel ports', () => {
		const ents = [...base(), panel('H1', 'R1', 44, 'high', 24), ...outlets(4), ...Array.from({ length: 14 }, (_, i) => outlet(100 + i, { tier: 'high' }))]
		const r = run(ents)
		const h1 = onPanel(r.add, 'H1')
		expect(h1(1)).toBe('A.100:1')
		expect(r.rooms[0].high).toMatchObject({ wanted: 28, placed: 24, onFloor: 4 })
		// low ports keep the first floor-panel ports; the overflowing high ports follow them
		expect(onPanel(r.add, 'P1')(8)).toBe('A.004:2')
		expect(onPanel(r.add, 'P1')(9)).toBe('A.112:1')
		expect(r.issues.some((i) => i.kind === 'high-on-floor-panel')).toBe(true)
	})
})

describe('reservations', () => {
	it('reserved panel ports take outlets of that usage first; the rest fill around them', () => {
		const ents = [...base().map((e) => (e.id === 'P1' ? panel('P1', 'R1', 42, 'low', 24, { reservations: [{ id: 'r', usage: 'ap', ports: [1, 2] }] }) : e)), ...outlets(5), outlet(20, { usage: 'ap' })]
		const p1 = onPanel(run(ents).add, 'P1')
		expect([p1(1), p1(2), p1(3)]).toEqual(['A.020:1', 'A.020:2', 'A.001:1'])
	})
})

describe('designated frames and usage panels (Dave)', () => {
	it('only patch frames take outlets once the room has any; equipment racks are skipped', () => {
		const ents = [...base().map((e) => (e.id === 'R2' ? { ...(e as Rack), patchFrame: true } : e)), ...outlets(2)]
		const r = run(ents)
		expect(new Set(r.add.map((l) => l.a.on))).toEqual(new Set(['P3']))
		expect(panelsInOrder(new ProjectIndex(ents), 'S').map((d) => d.id)).toEqual(['P3'])
	})
	it('an outlet goes to a panel of its usage first, else a general panel; a usage panel takes nothing else', () => {
		const apPanel = panel('P2', 'R1', 40, 'low', 24, { usages: ['ap'] })   // the lower panel in R1 is for APs
		const ents = [...base().map((e) => (e.id === 'P2' ? apPanel : e)), ...outlets(13), outlet(50, { usage: 'ap' })]
		const r = run(ents)
		expect(onPanel(r.add, 'P2')(1)).toBe('A.050:1')     // the AP skips past P1's free ports to its own panel
		expect(onPanel(r.add, 'P2')(3)).toBeUndefined()       // and nothing else lands there
		expect(onPanel(r.add, 'P3')(1)).toBe('A.013:1')     // desks overflow P1 into the next GENERAL panel, not P2
	})
})

describe('sticky', () => {
	it('re-running is additive: existing links stay, the second run adds nothing', () => {
		const ents = [...base(), ...outlets(3)]
		const first = run(ents)
		const second = run([...ents, ...first.add])
		expect(second.add).toEqual([])
		const more = run([...ents, ...first.add, outlet(4)])
		expect(more.add.map((l) => `${l.a.on}:${l.a.port}`)).toEqual(['P1:7', 'P1:8'])
	})
	it('re-allocating drops unpinned links, keeps pinned ones and patched ones (and says why)', () => {
		const ents = [...base(), ...outlets(2)]
		const pinned: Link = { type: 'link', id: 'LP', kind: 'horizontal', a: { on: 'P3', port: 5, face: 'rear' }, b: { on: 'A.001', port: 1 }, status: 'design', pinned: true }
		const loose: Link = { type: 'link', id: 'LL', kind: 'horizontal', a: { on: 'P3', port: 6, face: 'rear' }, b: { on: 'A.001', port: 2 }, status: 'design' }
		const patchedL: Link = { type: 'link', id: 'LC', kind: 'horizontal', a: { on: 'P3', port: 7, face: 'rear' }, b: { on: 'A.002', port: 1 }, status: 'design' }
		const cord: Cord = { type: 'cord', id: 'C', kind: 'patch', a: { on: 'P3', port: 7, face: 'front' }, b: { on: 'P3', port: 20 }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'installed' } as Cord
		const r = run([...ents, pinned, loose, patchedL, cord], { reallocate: true })
		expect(r.remove).toEqual(['LL'])
		expect(r.issues.map((i) => i.kind)).toContain('kept-patched')
		expect(r.add.map((l) => `${l.b.on}:${l.b.port}→${l.a.on}:${l.a.port}`)).toEqual(['A.001:2→P1:1', 'A.002:2→P1:2'])
	})
})

describe('what does not fit is reported', () => {
	it('a full server room, a port with no server room, a room with no panels', () => {
		const ents = [...base(), ...outlets(40), outlet(90, {}, 2, null), { type: 'space', id: 'S2', levelId: 'L', kind: 'server room', name: 'SR-B', code: 'B', order: 2 } as Entity, outlet(91, {}, 1, 'S2')]
		const r = run(ents)
		expect(r.add).toHaveLength(72)
		expect(r.unallocated.filter((u) => /full/.test(u.reason))).toHaveLength(8)
		expect(r.unallocated.filter((u) => /no server room/.test(u.reason))).toHaveLength(2)
		expect(r.unallocated.filter((u) => /no patch panels/.test(u.reason))).toHaveLength(1)
		expect(r.issues.map((i) => i.kind).sort()).toEqual(['full', 'no-panels', 'no-server-room', 'no-server-room'])
	})
	it("N/A outlets aren't cabled to a frame", () => {
		expect(run([...base(), outlet(1, { usage: 'N/A' })]).add).toEqual([])
	})
	it('a link to a panel of another room than the port asks for is flagged', () => {
		const ents = [...base(), { ...rack('RX', 2), spaceId: 'S9' }, panel('PX', 'RX', 42), outlet(1)]
		const l: Link = { type: 'link', id: 'L1', kind: 'horizontal', a: { on: 'PX', port: 1, face: 'rear' }, b: { on: 'A.001', port: 1 }, status: 'design' }
		expect(run([...ents, l]).issues.map((i) => i.kind)).toContain('room-mismatch')
	})
})

describe('assign by hand', () => {
	it('moves outlet ports onto consecutive free ports from a start port, skipping taken ones, pinned', () => {
		const ents = [...base(), ...outlets(3)]
		const first = run(ents).add
		const ix = new ProjectIndex([...ents, ...first])
		const r = assignFrom(ix, [{ outletId: 'A.001', port: 1 }, { outletId: 'A.001', port: 2 }, { outletId: 'A.002', port: 1 }], { on: 'P1', port: 5 })
		// first run: A.001 → P1:1–2, A.002 → P1:3–4, A.003 → P1:5–6. Starting at P1:5 skips A.003's two ports.
		expect(r.remove).toHaveLength(3)
		expect(r.add.map((l) => `${l.b.on}:${l.b.port}→${l.a.port}`)).toEqual(['A.001:1→7', 'A.001:2→8', 'A.002:1→9'])
		expect(r.add.every((l) => l.pinned)).toBe(true)
	})
})
