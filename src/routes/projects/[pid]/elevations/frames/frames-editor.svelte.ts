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
import type { PortReservation, LocType } from '../../frames/parts/types'
import { buildSyncPlan, unbakedLocationPorts } from '$lib/elevation/reconcile'

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
			// saveFields: structuredLinks REPLACES the stored map (deletions persist);
			// all other frames-doc fields untouched
			this.db.saveFields('frames', { id: this.framesDocId(), ...payload })
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
		this.portReservations = doc?.portReservations ?? []
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
			(locs ?? []).map(l => ({ id: l.id!, zone, locationNumber: l.locationNumber, portCount: l.portCount, locationType: l.locationType, isHighLevel: l.isHighLevel ?? false })))
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
	/** locationId → set of linked location-port numbers (coverage + free-port picking). */
	linkedLocPorts = $derived.by(() => {
		const m = new Map<string, Set<number>>()
		for (const l of Object.values(this.links)) {
			if (isLocationEnd(l.b)) {
				if (!m.has(l.b.locationId)) m.set(l.b.locationId, new Set())
				m.get(l.b.locationId)!.add(l.b.port)
			}
		}
		return m
	})
	linkedPortsByLocation = $derived(new Map([...this.linkedLocPorts].map(([id, s]) => [id, s.size])))
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

	/** Tie labels (§14 resolved: template-derived, both ends): DISPLAY-derived from
	 *  the link itself — `RackA~RackB:NN` with NN stable per rack pair (sorted link
	 *  ids) — so both ends always match by construction, nothing stored. */
	tieLabels = $derived.by(() => {
		const rackOf = (end: LinkEnd) => {
			const d = this.devices.find(x => x.id === end.deviceId)
			return d ? (this.rackById.get(d.rackId)?.label ?? d.rackId) : '?'
		}
		const byPair = new Map<string, StructuredLink[]>()
		for (const l of Object.values(this.links)) {
			if (isLocationEnd(l.b)) continue
			const pair = [rackOf(l.a), rackOf(l.b as LinkEnd)].sort().join('~')
			if (!byPair.has(pair)) byPair.set(pair, [])
			byPair.get(pair)!.push(l)
		}
		const m = new Map<string, string>()
		for (const [pair, links] of byPair) {
			links.sort((a, b) => a.id.localeCompare(b.id))
			links.forEach((l, i) => m.set(l.id, `${pair}:${String(i + 1).padStart(2, '0')}`))
		}
		return m
	})

	/** Chip display label: canonical port label, else the tie label, else the fallback. */
	chipLabel(deviceId: string, portIndex: number): string {
		const info = this.portInfo.get(`${deviceId}:${portIndex}`)
		if (info) return info.label
		const link = this.linkByPortKey.get(`${deviceId}:${portIndex}`)
		if (link && !isLocationEnd(link.b)) {
			const t = this.tieLabels.get(link.id)
			if (t) return t
		}
		return this.labelOf(deviceId, portIndex)
	}

	/** Floorplan pick: terminate the armed port to the location's next free port. */
	terminateToLocation(locationId: string): boolean {
		if (!this.termArm) return false
		const free = this.freePortsOf(locationId)
		if (free.length === 0) { this.statusHint = 'That location has no free ports'; return false }
		this.terminate(this.termArm, { locationId, port: free[0] }, 'outlet-run', this.stickyLinkCable || undefined)
		this.disarmTerm()
		return true
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

	// ── F-2: manual terminate + block flows ──
	/** Armed rear port waiting for a destination pick. */
	termArm = $state<LinkEnd | null>(null)
	/** Ordered Ctrl+click selection of rear ports (mixed linked/unlinked). */
	termSel = $state<string[]>([])
	/** Sticky structured-cable type for new links ('' = unspecified). */
	stickyLinkCable = $state('cat6a')

	disarmTerm() {
		this.termArm = null
		this.statusHint = null
	}
	cancelTermSel() {
		this.termSel = []
		this.statusHint = null
	}

	/** Anchor for Shift+click range selection. */
	lastTermKey = $state<string | null>(null)

	/** Rear-board port click: linked → select link; unlinked → arm, then a second
	 *  unlinked port completes a TIE (locations complete via the destination pane).
	 *  Ctrl toggles block selection; Shift extends a range within the same device. */
	portClickRear(deviceId: string, portIndex: number, ctrl: boolean, shift = false) {
		const key = `${deviceId}:${portIndex}`
		if (shift && this.lastTermKey) {
			const { deviceId: lastDev, portIndex: lastPort } = this.parseTermKey(this.lastTermKey)
			if (lastDev === deviceId) {
				this.termArm = null
				const lo = Math.min(lastPort, portIndex), hi = Math.max(lastPort, portIndex)
				const add: string[] = []
				for (let p = lo; p <= hi; p++) {
					const k = `${deviceId}:${p}`
					if (!this.termSel.includes(k)) add.push(k)
				}
				this.termSel = [...this.termSel, ...add]
				this.lastTermKey = key
				return
			}
		}
		if (ctrl || shift) {
			this.termArm = null
			this.termSel = this.termSel.includes(key) ? this.termSel.filter(k => k !== key) : [...this.termSel, key]
			this.lastTermKey = key
			return
		}
		const link = this.linkByPortKey.get(key)
		if (link) {
			this.selectedLinkId = this.selectedLinkId === link.id ? null : link.id
			return
		}
		if (this.termArm) {
			if (this.termArm.deviceId === deviceId && this.termArm.portIndex === portIndex) { this.disarmTerm(); return }
			// Second unterminated port → rack tie (§14 F-3)
			const a = this.termArm
			this.terminate(a, { deviceId, portIndex }, 'tie', this.stickyLinkCable || undefined)
			this.disarmTerm()
			return
		}
		this.termArm = { deviceId, portIndex }
		this.selectedLinkId = null
		this.statusHint = `${this.labelOf(deviceId, portIndex)} — pick a location port, an outlet on the floorplan, or another rear port for a tie · Esc cancels`
	}

	/** Free (unlinked) 1-based ports of a location, in order. */
	freePortsOf(locationId: string): number[] {
		const loc = this.locationById.get(locationId)
		if (!loc) return []
		const taken = this.linkedLocPorts.get(locationId)
		const out: number[] = []
		for (let p = 1; p <= loc.portCount; p++) if (!taken?.has(p)) out.push(p)
		return out
	}

	/** Destination pick from the Locations pane (single armed port → this location port). */
	locationPortClick(locationId: string, port: number) {
		if (!this.termArm) return
		if (this.linkedLocPorts.get(locationId)?.has(port)) {
			this.statusHint = 'Location port already linked — pick a free one'
			return
		}
		this.terminate(this.termArm, { locationId, port }, 'outlet-run', this.stickyLinkCable || undefined)
		this.disarmTerm()
	}

	/** Selected rear ports split by link state. */
	private termSelSplit() {
		const linked: string[] = []
		const unlinked: string[] = []
		for (const key of this.termSel) (this.linkByPortKey.has(key) ? linked : unlinked).push(key)
		return { linked, unlinked }
	}
	termSelUnlinkedCount = $derived(this.termSel.filter(k => !this.linkByPortKey.has(k)).length)
	termSelLinkedCount = $derived(this.termSel.length - this.termSelUnlinkedCount)

	/** Block assign: terminate the selected UNLINKED ports to a location's free ports, in order. */
	terminateBlockTo(locationId: string) {
		const { unlinked } = this.termSelSplit()
		if (unlinked.length === 0) return
		const free = this.freePortsOf(locationId)
		const n = Math.min(unlinked.length, free.length)
		if (n === 0) { this.statusHint = 'That location has no free ports'; return }
		const cable = this.stickyLinkCable || undefined
		this.mutateLinks(`terminate ${n} port(s) → location`, links => {
			const next = { ...links }
			for (let i = 0; i < n; i++) {
				const idx = unlinked[i].lastIndexOf(':')
				const a: LinkEnd = { deviceId: unlinked[i].slice(0, idx), portIndex: Number(unlinked[i].slice(idx + 1)) }
				const id = linkIdFor(a.deviceId, a.portIndex)
				next[id] = { id, kind: 'outlet-run', a, b: { locationId, port: free[i] }, status: 'design', ...(cable ? { cableType: cable } : {}) }
			}
			return next
		})
		this.statusHint = n < unlinked.length ? `Only ${n} free port(s) — ${unlinked.length - n} left selected` : null
		this.termSel = n < unlinked.length ? unlinked.slice(n) : []
	}

	/** Block clear: remove the links of the selected LINKED ports. */
	clearSelectedLinks() {
		const { linked } = this.termSelSplit()
		if (linked.length === 0) return
		const ids = linked.map(k => this.linkByPortKey.get(k)!.id)
		this.mutateLinks(`remove ${ids.length} link(s)`, links => {
			const next = { ...links }
			for (const id of ids) delete next[id]
			return next
		})
		this.termSel = this.termSel.filter(k => !linked.includes(k))
		if (this.selectedLinkId && ids.includes(this.selectedLinkId)) this.selectedLinkId = null
	}

	// ── Usage assignment (reservations) on rear ports ──
	// Reservations steer the label engine: reserved cells receive locations of
	// the MATCHING type first — so "assign usage to rear ports, then outlets
	// auto-assign to same-usage ports" is reservations + the engine + the
	// auto-terminate action below. Position-keyed (same records the Elevation
	// view edits); saved as a whole-field replace.
	portReservations = $state<PortReservation[]>([])

	private posOfKey(key: string): { frameId: string; ru: number; row: 'top' | 'bottom'; col: number } | null {
		const { deviceId, portIndex } = this.parseTermKey(key)
		const d = this.devices.find(x => x.id === deviceId)
		if (!d) return null
		return { frameId: d.rackId, ru: d.positionU, row: portIndex <= 24 ? 'top' : 'bottom', col: (portIndex - 1) % 24 }
	}
	private parseTermKey(key: string): { deviceId: string; portIndex: number } {
		const i = key.lastIndexOf(':')
		return { deviceId: key.slice(0, i), portIndex: Number(key.slice(i + 1)) }
	}

	private reservationByPos = $derived.by(() => {
		const m = new Map<string, string>()
		for (const r of this.portReservations) {
			for (const p of r.ports) m.set(`${p.frameId}:${p.ru}:${p.row}:${p.col}`, r.type)
		}
		return m
	})
	private deviceById = $derived(new Map(this.devices.map(d => [d.id, d])))

	reservationTypeOf(deviceId: string, portIndex: number): string | undefined {
		const d = this.deviceById.get(deviceId)
		if (!d || d.type !== 'panel') return undefined
		return this.reservationByPos.get(`${d.rackId}:${d.positionU}:${portIndex <= 24 ? 'top' : 'bottom'}:${(portIndex - 1) % 24}`)
	}

	private saveReservations() {
		this.db.saveFields('frames', { id: this.framesDocId(), portReservations: $state.snapshot(this.portReservations) })
	}

	/** Reserve the selected rear ports as a usage type (undoable). */
	reserveSelection(type: LocType) {
		const positions = this.termSel.map(k => this.posOfKey(k)).filter((p): p is NonNullable<typeof p> => !!p)
		if (positions.length === 0) return
		const before = $state.snapshot(this.portReservations) as PortReservation[]
		const nextId = String(before.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1)
		const after = [...before, { id: nextId, type, ports: positions }]
		const apply = (rs: PortReservation[]) => { this.portReservations = rs; this.saveReservations() }
		apply(after)
		this.history.record({ label: `reserve ${positions.length} as ${type}`, undo: () => apply(before), redo: () => apply(after) })
		this.termSel = []
		this.statusHint = `${positions.length} port(s) reserved as ${type} — the engine allocates matching locations there first`
	}

	/** Remove the selected ports from any reservations (undoable). */
	unreserveSelection() {
		const posKeys = new Set(this.termSel.map(k => this.posOfKey(k)).filter(Boolean)
			.map(p => `${p!.frameId}:${p!.ru}:${p!.row}:${p!.col}`))
		if (posKeys.size === 0) return
		const before = $state.snapshot(this.portReservations) as PortReservation[]
		const after = before
			.map(r => ({ ...r, ports: r.ports.filter(p => !posKeys.has(`${p.frameId}:${p.ru}:${p.row}:${p.col}`)) }))
			.filter(r => r.ports.length > 0)
		const apply = (rs: PortReservation[]) => { this.portReservations = rs; this.saveReservations() }
		apply(after)
		this.history.record({ label: 'unreserve port(s)', undo: () => apply(before), redo: () => apply(after) })
		this.termSel = []
	}

	// ── Auto-terminate: turn the engine's (reservation-aware) allocation into links ──
	/** Allocated-but-unlinked panel ports (the engine already honours usage
	 *  reservations, so links created from it follow usage-first assignment). */
	autoTerminateCount = $derived.by(() => {
		let n = 0
		for (const d of this.devices) {
			if (d.type !== 'panel') continue
			for (let p = 1; p <= (d.portCount ?? 0); p++) {
				const info = this.portInfo.get(`${d.id}:${p}`)
				if (info?.locationId && info.locationPort && !this.linkByPortKey.has(`${d.id}:${p}`)) n++
			}
		}
		return n
	})

	autoTerminate(): number {
		const additions: StructuredLink[] = []
		const cable = this.stickyLinkCable || undefined
		for (const d of this.devices) {
			if (d.type !== 'panel') continue
			for (let p = 1; p <= (d.portCount ?? 0); p++) {
				const key = `${d.id}:${p}`
				const info = this.portInfo.get(key)
				if (!info?.locationId || !info.locationPort || this.linkByPortKey.has(key)) continue
				const id = linkIdFor(d.id, p)
				additions.push({
					id, kind: 'outlet-run',
					a: { deviceId: d.id, portIndex: p },
					b: { locationId: info.locationId, port: info.locationPort },
					status: 'design',
					...(cable ? { cableType: cable } : {}),
				})
			}
		}
		if (additions.length === 0) return 0
		this.mutateLinks(`auto-terminate ${additions.length} port(s)`, links => {
			const next = { ...links }
			for (const l of additions) next[l.id] = l
			return next
		})
		return additions.length
	}

	// ── Maintenance checks (§14 F-4): the labels-v2 health panel, floor-wide ──
	/** Baked-label divergence vs current locations/format (see reconcile.ts). */
	syncPlan = $derived(buildSyncPlan(this.framesDoc, this.devices, this.racks, this.floor, this.floorFormat))
	/** Location ports with baked siblings but no baked position themselves. */
	unbakedPorts = $derived(unbakedLocationPorts(this.framesDoc))
	/** Links whose panel endpoint no longer exists (device removed). */
	orphanedLinks = $derived.by(() => {
		const ids = new Set(this.devices.map(d => d.id))
		return Object.values(this.links).filter(l =>
			!ids.has(l.a.deviceId) || (!isLocationEnd(l.b) && !ids.has((l.b as LinkEnd).deviceId))
			|| (isLocationEnd(l.b) && !this.locationById.has(l.b.locationId)))
	})
	/** Locations with NO linked ports at all (nothing terminated yet). */
	unlinkedLocationCount = $derived(
		this.locations.filter(l => (this.linkedPortsByLocation.get(l.id) ?? 0) === 0).length)

	// ── F-2: bake current allocation (legacy coverage) ──
	/** Engine-derived (unbaked) panel-port labels that have a structural source. */
	bakeableCount = $derived.by(() => {
		let n = 0
		for (const d of this.devices) {
			if (d.type !== 'panel') continue
			for (let p = 1; p <= (d.portCount ?? 0); p++) {
				const info = this.portInfo.get(`${d.id}:${p}`)
				if (info && !info.baked && info.locationId && info.locationPort) n++
			}
		}
		return n
	})

	/**
	 * Bake every engine-derived allocation into stored label strings (bakedLabels)
	 * so links bootstrap for them. Direct merge write (add-only, not undoable —
	 * clearing labels stays an explicit per-port action in the Elevation view).
	 */
	bakeAllocation(): number {
		const patch: Record<string, { label: string; locationId: string; port: number }> = {}
		for (const d of this.devices) {
			if (d.type !== 'panel') continue
			for (let p = 1; p <= (d.portCount ?? 0); p++) {
				const info = this.portInfo.get(`${d.id}:${p}`)
				if (info && !info.baked && info.locationId && info.locationPort) {
					patch[`${d.id}:${p}`] = { label: info.label, locationId: info.locationId, port: info.locationPort }
				}
			}
		}
		const n = Object.keys(patch).length
		if (n === 0) return 0
		// merge:true deep-merges the bakedLabels map — only these keys are touched
		this.db.save('frames', { id: this.framesDocId(), bakedLabels: patch })
		this.framesDoc = { ...this.framesDoc, bakedLabels: { ...(this.framesDoc?.bakedLabels ?? {}), ...patch } }
		this.rebootstrap()
		// persist the newly-bootstrapped links right away
		this.autosave.schedule(() => ({ structuredLinks: $state.snapshot(this.links) }))
		return n
	}
}
