import { SurfaceEditor } from '../../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { RackConfig, DeviceConfig, RackRow, RackSettings, RoomObject, RackDocData, DeviceType } from './types'

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

	seed(d: RackDocData | null) {
		this.racks = (d?.racks ?? []).map(r => ({ ...r }))
		this.devices = (d?.devices ?? []).map(x => ({ ...x }))
		this.rows = (d?.rows ?? []).map(r => ({ ...r, plan: r.plan ? { ...r.plan, originMm: { ...r.plan.originMm } } : undefined }))
		this.settings = d?.settings ? { ...d.settings } : null
		this.roomObjects = (d?.roomObjects ?? []).map(o => ({ ...o }))
	}
	snapshot() {
		return { racks: $state.snapshot(this.racks), devices: $state.snapshot(this.devices), rows: $state.snapshot(this.rows) }
	}

	selRack = $derived(this.sel?.kind === 'rack' ? this.racks.find(r => r.id === this.sel!.id) ?? null : null)
	selDevice = $derived(this.selDeviceId ? this.devices.find(d => d.id === this.selDeviceId) ?? null : null)
	rackDevices = $derived(this.selRack ? this.devices.filter(d => d.rackId === this.selRack!.id).sort((a, b) => a.positionU - b.positionU) : [])

	selectRack(id: string) { this.select('rack', id); this.selDeviceId = null }
	selectDevice(id: string) { this.selDeviceId = id; const d = this.devices.find(x => x.id === id); if (d) this.select('rack', d.rackId) }

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
