/**
 * Frames (termination map) editor — §14 F-1.
 *
 * Multi-room read state (racks/devices for every server room on the floor)
 * plus the floor's frames doc, owning the `structuredLinks` records: the
 * explicit rear-port → far-end terminations that Patching's trace consumes.
 * Existing baked assignments bootstrap into outlet-run links deterministically
 * (persisted on the first edit, like the id repairs). This editor writes ONLY
 * the structuredLinks field (merge:true) — the Elevation view's editor owns
 * the other frames-doc fields, so the two never clobber each other.
 * Bundles are ON HOLD — links carry no bundle fields yet.
 */
import type { Firestore } from '$lib/db.svelte'
import { HistoryStore } from '$lib/history/HistoryStore.svelte'
import { AutoSave } from '$lib/autosave/AutoSave.svelte'
import { buildPortInfoMap, repairLocationIds, fallbackPortLabel, type PortInfo } from '$lib/elevation/portmap'
import { bootstrapLinks, isLocationEnd, linkIdFor, type StructuredLink, type LinkEnd } from '$lib/elevation/links'

export const ROOMS = ['A', 'B', 'C', 'D'] as const

export class FramesEditor {
	pid = ''
	floor = $state(1)
	floorFormat = $state('L01')

	roomData = $state<Record<string, { racks: any[]; devices: any[] }>>({})
	framesDoc = $state<any>(null)
	links = $state<Record<string, StructuredLink>>({})

	/** Bench of rack boards (shared UX with the patching tab). */
	bench = $state<string[]>([])
	selectedLinkId = $state<string | null>(null)
	highlightDeviceId = $state<string | null>(null)
	statusHint = $state<string | null>(null)

	readonly history = new HistoryStore()
	private autosave: AutoSave

	constructor(private db: Firestore) {
		this.autosave = new AutoSave((payload: any) => {
			// merge:true — only structuredLinks; all other frames-doc fields untouched
			this.db.save('frames', { id: this.framesDocId(), ...payload })
		})
	}

	roomDocId(room: string): string {
		return `${this.pid}_F${String(this.floor).padStart(2, '0')}_R${room}`
	}
	framesDocId(): string {
		return `${this.pid}_F${String(this.floor).padStart(2, '0')}`
	}

	// ── Sync ──
	syncRoom(room: string, doc: any) {
		if (!doc?.racks?.length && !doc?.devices?.length) {
			const { [room]: _drop, ...rest } = this.roomData
			this.roomData = rest
			return
		}
		this.roomData = { ...this.roomData, [room]: { racks: doc.racks ?? [], devices: doc.devices ?? [] } }
		this.rebootstrap()
	}

	syncFrames(doc: any) {
		this.framesDoc = doc ?? null
		if (doc?.floorFormat) this.floorFormat = doc.floorFormat
		const comparable = { structuredLinks: doc?.structuredLinks ?? {} }
		if (!this.autosave.shouldApplyRemote(comparable)) return
		this.links = doc?.structuredLinks ?? {}
		this.rebootstrap()
	}

	/** Fill in outlet-run links from baked assignments for every device we know
	 *  about — deterministic + idempotent, so late-arriving room docs just add
	 *  their panels' links. In-memory until the first edit persists. */
	private rebootstrap() {
		const { links, changed } = bootstrapLinks(this.framesDoc?.bakedLabels, this.links, this.devices)
		if (changed) this.links = links
	}

	get saveStatus(): string {
		return this.autosave.status === 'saved' ? 'Saved' : 'Unsaved'
	}

	// ── Merged deriveds ──
	rooms = $derived(Object.keys(this.roomData).sort())
	racks = $derived(Object.entries(this.roomData).flatMap(([room, d]) =>
		(d.racks ?? []).map(r => ({ ...r, _room: room }))))
	devices = $derived(Object.values(this.roomData).flatMap(d => d.devices ?? []))
	rackById = $derived(new Map(this.racks.map(r => [r.id, r])))

	portInfo = $derived.by(() => {
		const merged = new Map<string, PortInfo>()
		for (const [room, d] of Object.entries(this.roomData)) {
			const map = buildPortInfoMap(this.framesDoc, room, d.devices ?? [], d.racks ?? [], this.floor, undefined, this.floorFormat)
			for (const [k, v] of map) merged.set(k, v)
		}
		return merged
	})

	/** Repaired locations, flat + by id. */
	locations = $derived.by(() => {
		const zl = repairLocationIds(this.framesDoc?.zoneLocations).zoneLocations
		return Object.entries(zl).flatMap(([zone, locs]) =>
			(locs ?? []).map(l => ({ id: l.id!, zone, locationNumber: l.locationNumber, portCount: l.portCount, locationType: l.locationType })))
	})
	locationById = $derived(new Map(this.locations.map(l => [l.id, l])))

	/** Panel-port key → link, for BOTH endpoints (tie b-ends are panel ports too). */
	linkByPortKey = $derived.by(() => {
		const m = new Map<string, StructuredLink>()
		for (const l of Object.values(this.links)) {
			m.set(`${l.a.deviceId}:${l.a.portIndex}`, l)
			if (!isLocationEnd(l.b)) m.set(`${(l.b as LinkEnd).deviceId}:${(l.b as LinkEnd).portIndex}`, l)
		}
		return m
	})
	/** locationId → linked port count (coverage shown in the Locations pane). */
	linkedPortsByLocation = $derived.by(() => {
		const m = new Map<string, number>()
		for (const l of Object.values(this.links)) {
			if (isLocationEnd(l.b)) m.set(l.b.locationId, (m.get(l.b.locationId) ?? 0) + 1)
		}
		return m
	})
	linkList = $derived(Object.values(this.links).sort((a, b) =>
		this.labelOf(a.a.deviceId, a.a.portIndex).localeCompare(this.labelOf(b.a.deviceId, b.a.portIndex))))

	labelOf(deviceId: string, portIndex: number): string {
		const info = this.portInfo.get(`${deviceId}:${portIndex}`)
		if (info) return info.label
		const d = this.devices.find(x => x.id === deviceId)
		const r = d ? this.rackById.get(d.rackId) : null
		return d ? fallbackPortLabel(r?.label ?? d.rackId, d.positionU, portIndex) : `${deviceId}:${portIndex}`
	}
	/** Human label for a link's far end. */
	endLabel(l: StructuredLink): string {
		if (isLocationEnd(l.b)) {
			const loc = this.locationById.get(l.b.locationId)
			return loc ? `${loc.zone}-${String(loc.locationNumber).padStart(3, '0')} · p${l.b.port}` : `${l.b.locationId} · p${l.b.port} (missing)`
		}
		return this.labelOf((l.b as LinkEnd).deviceId, (l.b as LinkEnd).portIndex)
	}

	// ── Bench (persisted per pid+floor, separate key from the patch bench) ──
	private benchKey(): string {
		return `framesbench:${this.pid}:F${this.floor}`
	}
	loadBench() {
		try {
			const raw = localStorage.getItem(this.benchKey())
			this.bench = raw ? JSON.parse(raw) : []
		} catch { this.bench = [] }
	}
	private persistBench() {
		try { localStorage.setItem(this.benchKey(), JSON.stringify($state.snapshot(this.bench))) } catch {}
	}
	addToBench(rackId: string) {
		if (!this.bench.includes(rackId)) {
			this.bench = [...this.bench, rackId]
			this.persistBench()
		}
	}
	removeFromBench(rackId: string) {
		this.bench = this.bench.filter(id => id !== rackId)
		this.persistBench()
	}
	moveBench(rackId: string, dir: -1 | 1) {
		const i = this.bench.indexOf(rackId)
		const j = i + dir
		if (i < 0 || j < 0 || j >= this.bench.length) return
		const next = [...this.bench]
		;[next[i], next[j]] = [next[j], next[i]]
		this.bench = next
		this.persistBench()
	}
	showDevice(device: { id: string; rackId: string }) {
		this.addToBench(device.rackId)
		this.highlightDeviceId = device.id
	}

	// ── Link mutations (undoable; first edit also persists the bootstrap) ──
	private mutateLinks(label: string, fn: (links: Record<string, StructuredLink>) => Record<string, StructuredLink>) {
		const before = $state.snapshot(this.links) as Record<string, StructuredLink>
		const after = fn({ ...before })
		const apply = (l: Record<string, StructuredLink>) => {
			this.links = l
			this.autosave.schedule(() => ({ structuredLinks: $state.snapshot(this.links) }))
		}
		apply(after)
		this.history.record({ label, undo: () => apply(before), redo: () => apply(after) })
	}

	setLinkAttrs(id: string, partial: Partial<Pick<StructuredLink, 'cableType' | 'lengthM' | 'status' | 'notes'>>) {
		if (!this.links[id]) return
		this.mutateLinks('update link', links => ({ ...links, [id]: { ...links[id], ...partial } }))
	}

	removeLink(id: string) {
		if (!this.links[id]) return
		const l = this.links[id]
		this.mutateLinks(`remove link ${this.labelOf(l.a.deviceId, l.a.portIndex)}`, links => {
			const { [id]: _drop, ...rest } = links
			return rest
		})
		if (this.selectedLinkId === id) this.selectedLinkId = null
	}

	/** Manual terminate (F-2 flows call this): create/replace the link for a panel port. */
	terminate(a: LinkEnd, b: StructuredLink['b'], kind: StructuredLink['kind'], cableType?: string) {
		const id = linkIdFor(a.deviceId, a.portIndex)
		const link: StructuredLink = { id, kind, a, b, status: 'design', ...(cableType ? { cableType } : {}) }
		this.mutateLinks(`terminate ${this.labelOf(a.deviceId, a.portIndex)}`, links => ({ ...links, [id]: link }))
		this.selectedLinkId = id
	}
}
