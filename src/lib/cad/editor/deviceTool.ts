// The device tool (Phase 3.2): in a rack-row view, click a U in a rack to add the chosen template there (its lowest U
// at the click). Placing while looking at the rear mounts it at the rear (panels stay 'both'). A spot that would
// overlap or run off the rack is refused with the reason. The tool stays on for the next device.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Device, Id } from '../domain/types'
import { deviceFromTemplate, placementProblem, RACK_DEVICE_W, roomFloor, type DeviceTemplate } from '../domain/devices'
import { nextLabel, naturalCompare } from '../domain/labels'
import { rackLayout, rackHeight, RU_MM } from '../views/rackRow'
import type { Prim } from '../views/display'

const PREFIX: Partial<Record<Device['kind'], string>> = { panel: 'PP', switch: 'SW', manager: 'CM', server: 'SV', shelf: 'SH', pdu: 'PDU' }

export class DeviceTool implements Tool {
	readonly id = 'device'
	readonly cursor = 'copy'
	#hover: { rack: Id; u: number } | null = null

	constructor(private templateOf: () => DeviceTemplate | null, private mountOf: () => Device['mount'] = () => undefined) {}

	/** The device to add: on a view of one face a one-face template goes on that face; a both-face one (a panel) stays
	 *  'both', fixed to one side when the toolbar's Mount says so. */
	#make(t: DeviceTemplate, rackId: Id, u: number, name: string, c: ToolCtx): Device {
		const face = c.space.spec.kind === 'row' && t.face !== 'both' ? c.space.spec.face : t.face
		const d = deviceFromTemplate(t, rackId, t.kind === 'pdu' ? 1 : u, name, face), mount = this.mountOf()
		return mount && d.face === 'both' && d.kind !== 'pdu' ? { ...d, mount } : d
	}

	down(e: PointerIn, c: ToolCtx): void {
		const t = this.templateOf(), hit = c.rowHit?.(e.p)
		if (!t) { c.say?.('Choose a device template first'); return }
		if (!hit) { c.say?.('Click inside a rack, at the U where the device should sit'); return }
		const all = c.store.ofType('device')
		const d = this.#make(t, hit.rack.id, hit.u, nextName(t, all), c)
		const problem = placementProblem(d, hit.rack, all)
		if (problem) { c.say?.(problem); return }
		c.store.transact(`Add ${d.name} to ${hit.rack.name}`, (tx) => tx.put(d))
		c.select([d.id])
	}
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { const h = c.rowHit?.(e.p); this.#hover = h ? { rack: h.rack.id, u: h.u } : null }
	cancel(): void { this.#hover = null }
	/** The pointer (or a library drag) left the view: no ghost. */
	unhover(): void { this.#hover = null }
	/** The rack and U under the cursor (shown in the status line). */
	get hovering() { return this.#hover }

	/** The drop ghost: a dashed outline where the device will land (red when it can't — overlap / off the rack). */
	preview(c: ToolCtx): Prim[] {
		const t = this.templateOf(), h = this.#hover, spec = c.space.spec
		if (!t || !h || spec.kind !== 'row') return []
		const l = rackLayout(c.index, spec).find((x) => x.rack.id === h.rack)
		if (!l) return []
		const u = t.kind === 'pdu' ? 1 : h.u, base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2 + roomFloor(c.index, spec.spaceId)
		const w = Math.min(t.widthMm ?? RACK_DEVICE_W, l.rack.widthMm), x0 = l.x0 + (l.rack.widthMm - w) / 2, x1 = x0 + w
		const y0 = -(base + (u - 1) * RU_MM), y1 = -(base + (u - 1 + t.heightU) * RU_MM)
		const d = this.#make(t, l.rack.id, u, t.name, c)
		const bad = !!placementProblem(d, l.rack, c.store.ofType('device'))
		return [{ k: 'line', pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, cls: bad ? 'draft draft-bad' : 'draft' }]
	}
}

/** PP1, PP2 … per kind across the project (or the template name for kinds without a prefix). */
function nextName(t: DeviceTemplate, all: Device[]): string {
	const p = PREFIX[t.kind]
	if (!p) return t.name
	const used = all.filter((d) => d.name.startsWith(p) && /\d$/.test(d.name)).map((d) => d.name).sort(naturalCompare)
	let name = used.length ? nextLabel(used[used.length - 1]) : `${p}1`
	const taken = new Set(all.map((d) => d.name))
	while (taken.has(name)) name = nextLabel(name)
	return name
}
