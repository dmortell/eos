import { SurfaceEditor } from '../../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { OutletConfig, OutletLevel, CableType, MountType, OutletUsage, TrunkConfig, TrunkNode, RackPlacement, OutletsData } from './types'

export type OutletTool = 'select' | 'outlet' | 'trunk'

/** Editor for an outlets viewport — outlets, trunks (polyline routes) and rack placements. */
export class OutletsEditor extends SurfaceEditor {
	outlets = $state<OutletConfig[]>([])
	trunks = $state<TrunkConfig[]>([])
	rackPlacements = $state<RackPlacement[]>([])
	tool = $state<OutletTool>('select')
	draw = $state<{ trunkId: string; lastNodeId: string } | null>(null)
	preview = $state<Point | null>(null)

	/** Last-used outlet properties — a new outlet inherits these. */
	defaults = $state<{ level: OutletLevel; portCount: number; cableType: CableType; mountType: MountType; usage: OutletUsage }>(
		{ level: 'low', portCount: 2, cableType: 'cat6a', mountType: 'box', usage: 'network' },
	)

	seed(d: OutletsData | null) {
		this.outlets = (d?.outlets ?? []).map(o => ({ ...o }))
		this.trunks = (d?.trunks ?? []).map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })), segments: t.segments.map(s => ({ ...s })) }))
		this.rackPlacements = (d?.rackPlacements ?? []).map(r => ({ ...r }))
	}
	snapshot() {
		return {
			outlets: $state.snapshot(this.outlets),
			trunks: $state.snapshot(this.trunks),
			rackPlacements: $state.snapshot(this.rackPlacements),
		}
	}

	selOutlet = $derived(this.sel?.kind === 'outlet' ? this.outlets.find(o => o.id === this.sel!.id) ?? null : null)
	selTrunk = $derived(this.sel?.kind === 'trunk' ? this.trunks.find(t => t.id === this.sel!.id) ?? null : null)

	// ── outlets ──
	addOutlet(p: Point) {
		const d = this.defaults
		const o: OutletConfig = { id: this.uid('O'), position: p, level: d.level, portCount: d.portCount, cableType: d.cableType, mountType: d.mountType, usage: d.usage }
		this.outlets.push(o); this.select('outlet', o.id); this.notify()
	}
	dragOutlet(o: OutletConfig, e0: MouseEvent) {
		this.select('outlet', o.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const p0 = { ...o.position }
		this.startDrag(e => { const w = this.toWorld(e); if (w) o.position = { x: p0.x + (w.x - w0.x), y: p0.y + (w.y - w0.y) } }, () => this.notify())
	}
	setOutlet(patch: Partial<OutletConfig>) {
		const o = this.selOutlet; if (!o) return
		Object.assign(o, patch)
		this.defaults = { level: o.level, portCount: o.portCount, cableType: o.cableType, mountType: o.mountType, usage: o.usage }
		this.notify()
	}

	// ── trunks (polyline routes) ──
	newTrunk(p: Point): TrunkConfig {
		return {
			id: this.uid('T'), shape: 'rect', location: 'floor', spec: { catalog: 'tray', widthMm: 50, heightMm: 50 },
			nodes: [{ id: this.uid('n'), position: p, z: 0 }], segments: [], isPrimary: false, visible: true, color: '#0369a1',
		}
	}
	startDraw() { this.tool = 'trunk'; this.draw = null; this.preview = null; this.clearSel() }
	drawClick(p: Point) {
		if (!this.draw) { const t = this.newTrunk(p); this.trunks.push(t); this.draw = { trunkId: t.id, lastNodeId: t.nodes[0].id }; this.select('trunk', t.id); return }
		const t = this.trunks.find(x => x.id === this.draw!.trunkId); if (!t) return
		const nn: TrunkNode = { id: this.uid('n'), position: p, z: 0 }
		t.nodes.push(nn); t.segments.push({ id: this.uid('s'), nodes: [this.draw.lastNodeId, nn.id] }); this.draw.lastNodeId = nn.id
		this.notify()
	}
	finishDraw() {
		if (this.draw) { const t = this.trunks.find(x => x.id === this.draw!.trunkId); if (t && !t.segments.length) this.trunks = this.trunks.filter(x => x.id !== t.id) }
		this.draw = null; this.preview = null; this.tool = 'select'; this.notify()
	}
	dragNode(t: TrunkConfig, nodeId: string) {
		this.select('trunk', t.id)
		const n = t.nodes.find(x => x.id === nodeId); if (!n) return
		this.startDrag(e => { const w = this.toWorld(e); if (w) n.position = w }, () => this.notify())
	}
	dragTrunk(t: TrunkConfig, e0: MouseEvent) {
		this.select('trunk', t.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const orig = t.nodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const dx = w.x - w0.x, dy = w.y - w0.y
			for (const o of orig) { const n = t.nodes.find(x => x.id === o.id); if (n) n.position = { x: o.x + dx, y: o.y + dy } }
		}, () => this.notify())
	}
	insertNode(t: TrunkConfig, segId: string, p: Point) {
		const seg = t.segments.find(s => s.id === segId); if (!seg) return
		const nn: TrunkNode = { id: this.uid('n'), position: p, z: 0 }
		t.nodes.push(nn)
		const i = t.segments.indexOf(seg)
		t.segments.splice(i, 1, { id: this.uid('s'), nodes: [seg.nodes[0], nn.id] }, { id: this.uid('s'), nodes: [nn.id, seg.nodes[1]] })
		this.notify()
	}
	setTrunk(patch: Partial<TrunkConfig>) { const t = this.selTrunk; if (!t) return; Object.assign(t, patch); this.notify() }
	selTrunkWidth = $derived(((this.selTrunk?.spec as any)?.widthMm ?? (this.selTrunk?.spec as any)?.outerDiameterMm ?? 0) as number)
	setTrunkWidth(w: number) { const t = this.selTrunk; if (!t) return; (t.spec as any).widthMm = w; this.notify() }

	// ── rack placements (move only — dims live in the racks doc) ──
	dragRack(rp: RackPlacement, e0: MouseEvent) {
		this.select('rack', rp.rackId)
		const w0 = this.toWorld(e0); if (!w0) return
		const p0 = { ...rp.position }
		this.startDrag(e => { const w = this.toWorld(e); if (w) rp.position = { x: p0.x + (w.x - w0.x), y: p0.y + (w.y - w0.y) } }, () => this.notify())
	}

	deleteSel() {
		const s = this.sel; if (!s) return
		if (s.kind === 'outlet') this.outlets = this.outlets.filter(o => o.id !== s.id)
		else if (s.kind === 'trunk') this.trunks = this.trunks.filter(t => t.id !== s.id)
		this.clearSel(); this.notify()
	}
}
