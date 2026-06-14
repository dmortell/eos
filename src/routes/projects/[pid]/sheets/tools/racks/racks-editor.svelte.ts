import { SurfaceEditor } from '../../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { RackConfig, DeviceConfig, RackRow, RackSettings, RoomObject, RackDocData, DeviceType, RackFace } from './types'
import type { DeviceTemplate } from './palette'

type Rect = { x: number; y: number; w: number; h: number }
/** Device boxes + face, injected by the edit layer so the editor can hit-test a marquee. */
type RackLayout = { face: RackFace; boxes: { id: string; box: Rect }[] }

/**
 * Editor for a racks viewport. Spatial editing is plan-view (drag a row's origin); rack/device
 * detail is edited via the panel (the elevation U-layout is render-internal, so device position
 * is a numeric field rather than a canvas drag — keeps the editor decoupled from the layout).
 */
export class RacksEditor extends SurfaceEditor {
	racks = $state<RackConfig[]>([])
	devices = $state<DeviceConfig[]>([])
	rows = $state<RackRow[]>([])
	settings = $state<RackSettings | null>(null)
	roomObjects = $state<RoomObject[]>([])
	selDeviceId = $state<string | null>(null)
	library = $state<DeviceTemplate[]>([]) // user-added custom device templates (persisted on the doc)

	// marquee multi-select: devices (elevation) or rows (plan). `layout` is fed by the edit layer
	// (which builds the elevation) so the editor can hit-test the box. The live `marquee` rect +
	// beginMarquee live in SurfaceEditor.
	selDevices = $state<string[]>([])
	selRows = $state<string[]>([])
	layout: RackLayout | null = null
	#gbRows = new Map<string, Point>()   // row-origin snapshot for a plan group drag

	seed(d: RackDocData | null) {
		this.racks = (d?.racks ?? []).map(r => ({ ...r }))
		this.devices = (d?.devices ?? []).map(x => ({ ...x }))
		this.rows = (d?.rows ?? []).map(r => ({ ...r, plan: r.plan ? { ...r.plan, originMm: { ...r.plan.originMm } } : undefined }))
		this.settings = d?.settings ? { ...d.settings } : null
		this.roomObjects = (d?.roomObjects ?? []).map(o => ({ ...o }))
		this.library = ((d as { library?: DeviceTemplate[] })?.library ?? []).map(t => ({ ...t }))
	}
	snapshot() {
		return { racks: $state.snapshot(this.racks), devices: $state.snapshot(this.devices), rows: $state.snapshot(this.rows), library: $state.snapshot(this.library) }
	}

	selRack = $derived(this.sel?.kind === 'rack' ? this.racks.find(r => r.id === this.sel!.id) ?? null : null)
	selDevice = $derived(this.selDeviceId ? this.devices.find(d => d.id === this.selDeviceId) ?? null : null)
	rackDevices = $derived(this.selRack ? this.devices.filter(d => d.rackId === this.selRack!.id).sort((a, b) => a.positionU - b.positionU) : [])

	selectRack(id: string) { this.select('rack', id); this.selDeviceId = null }
	selectDevice(id: string) { this.selDeviceId = id; const d = this.devices.find(x => x.id === id); if (d) this.select('rack', d.rackId) }

	// ── marquee multi-select (devices in elevation, rows in plan) + annotation peer ──
	clearSel() { super.clearSel(); this.selDeviceId = null; this.clearMulti() }
	clearMulti() { this.selDevices = []; this.selRows = [] }
	hasMultiSel() { return this.selDevices.length + this.selRows.length > 0 }
	inDeviceMulti(id: string) { return this.selDevices.includes(id) }
	inRowMulti(id: string) { return this.selRows.includes(id) }

	marqueeCollect(m: Rect) {
		const inRect = (p: Point) => p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h
		if (this.layout?.face === 'plan') {
			this.selRows = this.rows.filter(r => r.plan?.originMm && inRect(r.plan.originMm)).map(r => r.id)
			this.selDevices = []
		} else {
			const hit = (b: Rect) => !(b.x + b.w < m.x || b.x > m.x + m.w || b.y + b.h < m.y || b.y > m.y + m.h)
			this.selDevices = (this.layout?.boxes ?? []).filter(b => hit(b.box)).map(b => b.id)
			this.selRows = []
		}
	}
	// Rows (plan) move freely → use the shared group-translate protocol (devices use a custom path
	// in the layer because they snap to a rack column + U slot).
	beginGroupTranslate() {
		this.#gbRows.clear()
		const ids = new Set(this.selRows)
		for (const r of this.rows) if (ids.has(r.id) && r.plan) this.#gbRows.set(r.id, { ...r.plan.originMm })
	}
	applyGroupTranslate(dx: number, dy: number) {
		for (const r of this.rows) {
			const b = this.#gbRows.get(r.id); if (!b) continue
			r.plan = { originMm: { x: b.x + dx, y: b.y + dy }, rotationDeg: r.plan?.rotationDeg ?? 0 }
		}
	}
	/** Move every selected device into `rackId`, each at baseU + its original offset (clamped),
	 *  preserving relative U. Multi-rack selections all land in the dropped rack. */
	placeDeviceGroup(offsets: { id: string; off: number }[], rackId: string, baseU: number) {
		const rack = this.racks.find(r => r.id === rackId); if (!rack) return
		for (const { id, off } of offsets) {
			const d = this.devices.find(x => x.id === id); if (!d) continue
			d.rackId = rackId
			d.positionU = Math.max(1, Math.min(rack.heightU - d.heightU + 1, baseU + off))
		}
		this.notify()
	}
	/** Delete the marquee multi-selection (devices + the annotation peer is handled by the host). */
	deleteMany() {
		if (!this.selDevices.length) return false
		const ids = new Set(this.selDevices)
		this.devices = this.devices.filter(d => !ids.has(d.id))
		this.clearMulti(); this.notify(); return true
	}

	// ── racks ──
	addRack(rowId: string) {
		const order = Math.max(0, ...this.racks.filter(r => r.rowId === rowId).map(r => r.order + 1))
		const r: RackConfig = { id: this.uid('R'), label: 'Rack', rowId, order, heightU: 42, heightMm: 42 * 45 + 80, widthMm: 600, depthMm: 1000, type: '4-post' }
		this.racks.push(r); this.selectRack(r.id); this.notify()
	}
	setRack(patch: Partial<RackConfig>) {
		const r = this.selRack; if (!r) return
		Object.assign(r, patch)
		if (patch.heightU != null) r.heightMm = patch.heightU * 45 + 80
		this.notify()
	}
	/** Reassign rack `order` to the given id sequence (elevation lays racks out left→right by order). */
	reorderRacks(orderedIds: string[]) {
		orderedIds.forEach((id, i) => { const r = this.racks.find(x => x.id === id); if (r) r.order = i })
		this.notify()
	}
	deleteRack() {
		const r = this.selRack; if (!r) return
		this.devices = this.devices.filter(d => d.rackId !== r.id)
		this.racks = this.racks.filter(x => x.id !== r.id)
		this.clearSel(); this.notify()
	}

	// ── devices ──
	addDevice() { const r = this.selRack; if (r) this.addDeviceAt(r.id, 1) }
	/** Add a 1U device to a rack at a given bottom-U (used by canvas click-to-add). */
	addDeviceAt(rackId: string, positionU: number) {
		const d: DeviceConfig = { id: this.uid('D'), rackId, label: 'Device', type: 'switch', heightU: 1, positionU, portCount: 0, mounting: 'both' }
		this.devices.push(d); this.selectDevice(d.id); this.notify()
	}
	/** Place a device into a rack from a library/palette template (used by drag-from-library). */
	addDeviceFromTemplate(rackId: string, positionU: number, t: DeviceTemplate) {
		const d: DeviceConfig = { id: this.uid('D'), rackId, label: t.label, type: t.type, heightU: t.heightU || 1, positionU, portCount: t.portCount ?? 0, mounting: 'both', ...(t.widthMm ? { widthMm: t.widthMm } : {}) }
		this.devices.push(d); this.selectDevice(d.id); this.notify()
	}
	/** Add a custom device template to the persisted library. */
	addLibraryDevice(t: DeviceTemplate) { this.library = [...this.library, { ...t, id: t.id || this.uid('tpl') }]; this.notify() }
	removeLibraryDevice(id: string) { this.library = this.library.filter(t => t.id !== id); this.notify() }
	/** Edit an existing custom library device in place. */
	updateLibraryDevice(id: string, patch: Partial<DeviceTemplate>) {
		this.library = this.library.map(t => t.id === id ? { ...t, ...patch, id } : t); this.notify()
	}
	/** Duplicate a device (same rack/U); returns the new reactive proxy so it can be dragged. */
	duplicateDevice(d: DeviceConfig): DeviceConfig {
		this.devices.push({ ...d, id: this.uid('D') })
		const c = this.devices[this.devices.length - 1]
		this.selectDevice(c.id)
		return c
	}
	setDevice(patch: Partial<DeviceConfig>) { const d = this.selDevice; if (!d) return; Object.assign(d, patch); this.notify() }
	deleteDevice() { const d = this.selDevice; if (!d) return; this.devices = this.devices.filter(x => x.id !== d.id); this.selDeviceId = null; this.notify() }
	/** Live U reposition during an elevation drag (caller supplies the snapped U). */
	moveDeviceU(d: DeviceConfig, positionU: number) { if (d.positionU !== positionU) { d.positionU = positionU; this.notify() } }

	// ── plan: drag a row's origin ──
	dragRow(row: RackRow, e0: MouseEvent) {
		const w0 = this.toWorld(e0); if (!w0) return
		const o0 = row.plan?.originMm ?? { x: 0, y: 0 }
		const start = { x: o0.x, y: o0.y }
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const origin = { x: start.x + (w.x - w0.x), y: start.y + (w.y - w0.y) }
			row.plan = { originMm: origin, rotationDeg: row.plan?.rotationDeg ?? 0 }
		}, () => this.notify())
	}
	setRowRotation(rowId: string, deg: number) {
		const row = this.rows.find(r => r.id === rowId); if (!row) return
		row.plan = { originMm: row.plan?.originMm ?? { x: 0, y: 0 }, rotationDeg: deg }
		this.notify()
	}
}

export const DEVICE_TYPES: DeviceType[] = ['panel', 'enclosure', 'switch', 'server', 'manager', 'shelf', 'pdu', 'other']
