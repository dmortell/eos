// The device tool (Phase 3.2): in a rack-row view, click a U in a rack to add the chosen template there (its lowest U
// at the click). Placing while looking at the rear mounts it at the rear (panels stay 'both'). A spot that would
// overlap or run off the rack is refused with the reason. The tool stays on for the next device.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Device, Id } from '../domain/types'
import { deviceFromTemplate, placementProblem, type DeviceTemplate } from '../domain/devices'
import { nextLabel, naturalCompare } from '../domain/labels'

const PREFIX: Partial<Record<Device['kind'], string>> = { panel: 'PP', switch: 'SW', manager: 'CM', server: 'SV', shelf: 'SH', pdu: 'PDU' }

export class DeviceTool implements Tool {
	readonly id = 'device'
	readonly cursor = 'copy'
	#hover: { rack: Id; u: number } | null = null

	constructor(private templateOf: () => DeviceTemplate | null) {}

	down(e: PointerIn, c: ToolCtx): void {
		const t = this.templateOf(), hit = c.rowHit?.(e.p)
		if (!t) { c.say?.('Choose a device template first'); return }
		if (!hit) { c.say?.('Click inside a rack, at the U where the device should sit'); return }
		const all = c.store.ofType('device')
		const face = c.space.spec.kind === 'row' && t.face !== 'both' ? c.space.spec.face : t.face
		const d = deviceFromTemplate(t, hit.rack.id, t.kind === 'pdu' ? 1 : hit.u, nextName(t, all), face)
		const problem = placementProblem(d, hit.rack, all)
		if (problem) { c.say?.(problem); return }
		c.store.transact(`Add ${d.name} to ${hit.rack.name}`, (tx) => tx.put(d))
		c.select([d.id])
	}
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { const h = c.rowHit?.(e.p); this.#hover = h ? { rack: h.rack.id, u: h.u } : null }
	cancel(): void { this.#hover = null }
	/** The rack and U under the cursor (shown in the status line). */
	get hovering() { return this.#hover }
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
