// Racks and devices through the real tools (Phase 3.2): draw racks on the plan, add devices in the rack row view,
// drag them by U and into the next rack, refused overlaps.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { SelectTool, RackTool, type ToolCtx, type PortSel } from './tools'
import { portCell } from '../views/rackRow'
import { DeviceTool } from './deviceTool'
import { CordTool } from './cordTool'
import { deleteEntities, racksWithDevices } from './commands'
import { BUILTIN_DEVICE_TEMPLATES, type DeviceTemplate } from '../domain/devices'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import { rackRowDisplayList, rackLayout, rackHeight, rowHit, RU_MM } from '../views/rackRow'
import type { Entity } from '../domain/drawing'
import type { Device, Rack, Cord } from '../domain/types'

const ROW: ViewSpec = { kind: 'row', spaceId: 'SR-A', face: 'front' }
const R2: Rack = { type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }

function harness(spec: ViewSpec, extra: Entity[] = []) {
	const store = new EntityStore()
	store.load([...demoProject(), ...extra])
	let sel: string[] = []
	let ports: PortSel | null = null
	const said: string[] = []
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		const row = spec.kind === 'row' ? spec : null
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(spec), work: { z: 0, depth: 0 },
			prims: () => (row ? rackRowDisplayList(index, row) : []), tol: () => 5,
			snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {}, say: (m) => said.push(m),
			...(row ? { rowHit: (p: { x: number; y: number }) => rowHit(index, row, p), portSel: () => ports, selectPorts: (s: PortSel | null) => { ports = s } } : {}),
		}
	}
	return { store, ctx, sel: () => sel, ports: () => ports, said }
}
const at = (x: number, y: number, extra: Partial<{ count: number }> = {}) => ({ p: { x, y }, shift: false, ctrl: false, alt: false, ...extra })
/** The view point in the middle of U `u` of a rack in the front row view. */
function uPoint(store: EntityStore, rackId: string, u: number) {
	const ix = new ProjectIndex(store.all())
	const l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' }).find((x) => x.rack.id === rackId)!
	const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2
	return { x: l.x0 + l.rack.widthMm / 2, y: -(base + (u - 0.5) * RU_MM) }
}
const tpl = (id: string): DeviceTemplate => BUILTIN_DEVICE_TEMPLATES.find((t) => t.id === id)!

describe('drawing racks on the plan', () => {
	it('each click draws a new rack like the last one, named after it, in the same room and row', () => {
		const h = harness(PLAN, [{ ...R2, rowId: 'ROW', at: { x: 0, y: 0 }, rot: 90 }])
		const tool = new RackTool(() => {})
		tool.down(at(1000, 0), h.ctx())
		tool.down(at(2000, 0), h.ctx())
		const drawn = h.store.ofType('rack').filter((r) => r.id !== 'R1' && r.id !== 'R2')
		expect(drawn.map((r) => r.name)).toEqual(['A03', 'A04'])
		expect(drawn[0]).toMatchObject({ spaceId: 'SR-A', rowId: 'ROW', rot: 90, at: { x: 1000, y: 0 } })
	})
})

describe('devices in the rack row', () => {
	it('the device tool adds the chosen template at the clicked U', () => {
		const h = harness(ROW)
		const tool = new DeviceTool(() => tpl('builtin:panel-24'))
		tool.down(at(uPoint(h.store, 'R1', 30).x, uPoint(h.store, 'R1', 30).y), h.ctx())
		const added = h.store.ofType('device').find((d) => d.u === 30)
		expect(added).toMatchObject({ rackId: 'R1', kind: 'panel', portCount: 24, name: 'PP1' })
	})
	it('a spot taken on that face is refused with the reason', () => {
		const h = harness(ROW)
		const tool = new DeviceTool(() => tpl('builtin:panel-24'))
		const p = uPoint(h.store, 'R1', 40)   // Panel 1 is at U40
		tool.down(at(p.x, p.y), h.ctx())
		expect(h.store.ofType('device')).toHaveLength(2)
		expect(h.said[0]).toMatch(/overlap Panel 1/)
	})
	it('Select drags a device by whole U; onto another rack it moves there', () => {
		const h = harness(ROW, [R2])
		const sel = new SelectTool()
		const from = uPoint(h.store, 'R1', 38)   // Switch 1
		sel.down(at(from.x, from.y), h.ctx())
		const to = uPoint(h.store, 'R1', 35)
		sel.move(at(to.x, to.y), h.ctx()); sel.up(at(to.x, to.y), h.ctx())
		expect((h.store.get('SW1') as Device).u).toBe(35)
		const other = uPoint(h.store, 'R2', 35)
		sel.down(at(to.x, to.y), h.ctx())
		sel.move(at(other.x, other.y), h.ctx()); sel.up(at(other.x, other.y), h.ctx())
		expect(h.store.get('SW1')).toMatchObject({ rackId: 'R2', u: 35 })
	})
	it('clicking ports selects them: one, Shift = a range, Ctrl = add / drop one; empty space clears', () => {
		const h = harness(ROW)
		const sel = new SelectTool()
		// the centre of Panel 1's port n, in the front row view
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, p1 = h.store.get('P1') as Device
		const port = (n: number) => { const c = portCell(p1, n, l.x0 + l.rack.widthMm / 2, base + (p1.u - 1) * RU_MM)!; return { x: c.x + c.w / 2, y: c.y + c.h / 2 } }
		const click = (n: number, mods: Partial<{ shift: boolean; ctrl: boolean }> = {}) => { const q = port(n); const ev = { ...at(q.x, q.y), ...mods }; sel.down(ev, h.ctx()); sel.up(ev, h.ctx()) }
		click(3)
		expect(h.ports()).toMatchObject({ on: 'P1', ports: [3], face: 'front' })
		expect(h.sel()).toEqual(['P1'])
		click(6, { shift: true })
		expect(h.ports()?.ports).toEqual([3, 4, 5, 6])
		click(10, { ctrl: true }); click(4, { ctrl: true })
		expect(h.ports()?.ports).toEqual([3, 5, 6, 10])
		sel.down(at(-5000, 5000), h.ctx()); sel.up(at(-5000, 5000), h.ctx())
		expect(h.ports()).toBeNull()
	})
	it('the cord tool: port A then port B makes a cord; an unlabelled panel port refuses with the reason', () => {
		const h = harness(ROW)
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, mid = l.x0 + l.rack.widthMm / 2
		const portOf = (id: string, n: number) => { const d = h.store.get(id) as Device; const c = portCell(d, n, mid, base + (d.u - 1) * RU_MM)!; return at(c.x + c.w / 2, c.y + c.h / 2) }
		const tool = new CordTool(() => ({ cableType: 'cat6a', colour: '#ef4444' }), { get: () => null, set: () => {} })
		tool.down(portOf('P1', 10), h.ctx())
		expect(h.said.at(-1)).toMatch(/no label yet/)
		tool.down(portOf('P1', 3), h.ctx()); tool.down(portOf('SW1', 5), h.ctx())
		const cord = h.store.ofType('cord').find((c) => c.a.on === 'P1' && c.a.port === 3)
		expect(cord).toMatchObject({ status: 'add', colour: '#ef4444', a: { face: 'front' }, b: { on: 'SW1', port: 5 } })
		expect(h.sel()).toEqual([cord!.id])
	})
	it('Delete on cords: a planned one goes, an installed one is only marked `remove`', () => {
		const h = harness(ROW)
		h.store.transact('installed', (tx) => tx.put({ ...(h.store.get('C2') as Cord), status: 'installed' }))
		deleteEntities(h.store, ['C1', 'C2'])
		expect(h.store.get('C1')).toBeUndefined()
		expect(h.store.get('C2')).toMatchObject({ status: 'remove' })
	})
	it('racks with devices are found before Delete (to ask first); an empty rack is not', () => {
		const h = harness(ROW, [R2])
		const inR1 = h.store.ofType('device').filter((d) => d.rackId === 'R1').length
		expect(racksWithDevices(h.store, ['R1', 'R2', 'C1'])).toEqual({ racks: 1, devices: inR1 })
		expect(racksWithDevices(h.store, ['R2'])).toEqual({ racks: 0, devices: 0 })
	})
	it('a drag onto an occupied U stops at the last good place', () => {
		const h = harness(ROW)
		const sel = new SelectTool()
		const from = uPoint(h.store, 'R1', 38), onPanel = uPoint(h.store, 'R1', 40)
		sel.down(at(from.x, from.y), h.ctx())
		sel.move(at(from.x, from.y - RU_MM), h.ctx())     // up one U: free
		sel.move(at(onPanel.x, onPanel.y), h.ctx())       // onto Panel 1: refused
		sel.up(at(onPanel.x, onPanel.y), h.ctx())
		expect((h.store.get('SW1') as Device).u).toBe(39)
		expect(h.said.at(-1)).toMatch(/overlap/)
	})
})
