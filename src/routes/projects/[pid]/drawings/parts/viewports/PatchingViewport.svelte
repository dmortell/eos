<script lang="ts">
	/**
	 * Patch-schedule viewport.
	 *
	 * Subscribes to `patching/{pid}_F{NN}_R{X}` and renders a compact table of
	 * connections: From → To / Cable / Length (m) / Status. Read-only extract —
	 * full editing lives in the Patching tool.
	 *
	 * Port-label resolution: `PortRef.label` is the cached human label when the
	 * patching tool has written one. When empty, we fall back to the frames
	 * engine: subscribe to the floor's frames doc + all four rooms' racks docs,
	 * re-run `deriveFramesFromRacks` → `generatePortLabels` → `generateRacks`
	 * to assemble `RackData[]`, and look up each port ref's label by mapping
	 * (rackId → frame, deviceId → panel.ru, portIndex → row/col).
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { PatchConnection, PortRef } from '../../../patching/parts/types'
	import type { RackData, PortLabel, PortReservation, LocType, FrameConfig, ZoneConfig } from '../../../frames/parts/types'
	import { portPosKey } from '../../../frames/parts/types'
	import { CABLE_TYPES } from '../../../patching/parts/constants'
	import { deriveFramesFromRacks, generatePortLabels, generateRacks } from '../../../frames/parts/engine'
	import { Firestore } from '$lib'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'patching' ? viewport.source : null)

	/** Parse floor number from the `{pid}_F{NN}_R{X}` patching doc id. */
	let floor = $derived.by<number>(() => {
		const m = src?.patchDocId?.match(/_F(\d+)/)
		return m ? Number(m[1]) : 1
	})

	let patchDoc = $state<any>(null)
	$effect(() => {
		const id = src?.patchDocId
		if (!id) { patchDoc = null; return }
		const unsub = db.subscribeOne('patching', id, (data: any) => { patchDoc = data ?? null })
		return () => unsub?.()
	})

	/** Frames doc is floor-scoped (`{pid}_F{NN}`), shared by all rooms on the floor. */
	let framesDoc = $state<any>(null)
	$effect(() => {
		if (!src?.patchDocId) { framesDoc = null; return }
		const floorDocId = src.patchDocId.replace(/_R[A-D]$/, '')
		const unsub = db.subscribeOne('frames', floorDocId, (data: any) => { framesDoc = data ?? null })
		return () => unsub?.()
	})

	/** Racks docs per room — connections can span rooms, so all four are needed. */
	let racksData = $state<Record<string, any>>({})
	$effect(() => {
		if (!src?.patchDocId) { racksData = {}; return }
		const floorDocId = src.patchDocId.replace(/_R[A-D]$/, '')
		racksData = {}
		const unsubs = ['A', 'B', 'C', 'D'].map(rm => db.subscribeOne('racks', `${floorDocId}_R${rm}`, (data: any) => {
			racksData = { ...racksData, [rm]: data }
		}))
		return () => { unsubs.forEach(u => u?.()) }
	})

	let serverRoomCount = $derived<number>(framesDoc?.serverRoomCount ?? 1)
	let floorFormat = $derived<string>(framesDoc?.floorFormat ?? 'L01')
	let zoneLocations = $derived<Record<string, any[]>>(framesDoc?.zoneLocations ?? {})
	let zoneLetters = $derived<string[]>(
		Object.keys(zoneLocations).filter(k => zoneLocations[k]?.length > 0).sort(),
	)
	let allLabels = $derived<PortLabel[]>(
		zoneLetters.flatMap(z => generatePortLabels(
			{ floor, zone: z, serverRoomCount, locations: zoneLocations[z] } as ZoneConfig,
			floorFormat,
		)),
	)
	let reservationMap = $derived<Map<string, LocType>>(
		new Map(
			((framesDoc?.portReservations ?? []) as PortReservation[]).flatMap(r =>
				r.ports.map(p => [portPosKey(p), r.type] as [string, LocType]),
			),
		),
	)
	let derivedFrames = $derived<FrameConfig[]>(
		deriveFramesFromRacks(racksData, 'front', framesDoc?.frames),
	)
	let racks = $derived<RackData[]>(
		generateRacks(
			allLabels,
			serverRoomCount,
			derivedFrames.length > 0 ? derivedFrames : undefined,
			reservationMap.size > 0 ? reservationMap : undefined,
		),
	)

	/**
	 * Device lookup map `deviceId → {positionU, portCount}` built from all four
	 * rooms' racks.devices. Patching PortRef identifies a physical panel by its
	 * deviceId, but the frames engine identifies panels by `ru`, so we bridge
	 * them here.
	 */
	let deviceMap = $derived.by<Map<string, { positionU: number; portCount: number }>>(() => {
		const map = new Map<string, { positionU: number; portCount: number }>()
		for (const doc of Object.values(racksData)) {
			for (const dev of (doc?.devices ?? []) as any[]) {
				if (dev?.id) map.set(dev.id, { positionU: dev.positionU, portCount: dev.portCount || 48 })
			}
		}
		return map
	})

	/**
	 * Resolve a PortRef to a frames-engine label like `FF.Z.NNN-SPP`. Returns
	 * null if the data to resolve it hasn't loaded yet or the ref doesn't point
	 * to a known panel port — callers fall back to the short `rack/dev:port`
	 * form.
	 */
	function resolvePortLabel(p: PortRef): string | null {
		const rack = racks.find(r => r.frame.id === p.rackId)
		if (!rack) return null
		const dev = deviceMap.get(p.deviceId)
		if (!dev) return null
		const panel = rack.panels.find(pn => pn.ru === dev.positionU)
		if (!panel) return null

		// Row/col derivation: 24-port panels use topRow only; 48-port panels use
		// topRow for ports 1–24, bottomRow for ports 25–48.
		const idx = p.portIndex - 1
		if (panel.portCount === 24) {
			return panel.topRow[idx]?.label ?? null
		}
		if (idx < 24) return panel.topRow[idx]?.label ?? null
		return panel.bottomRow[idx - 24]?.label ?? null
	}

	function portLabel(p: PortRef): string {
		if (p.label) return p.label
		const resolved = resolvePortLabel(p)
		if (resolved) return resolved
		return `${p.rackId.slice(-3)}/${p.deviceId.slice(-3)}:${p.portIndex}`
	}

	function cableLabel(typeId: string): string {
		const t = CABLE_TYPES.find(c => c.id === typeId)
		return t?.label ?? typeId
	}

	const STATUS_COLOR: Record<string, string> = {
		add: 'bg-emerald-100 text-emerald-700',
		remove: 'bg-red-100 text-red-700',
		change: 'bg-amber-100 text-amber-700',
		installed: 'bg-zinc-100 text-zinc-600',
	}

	let connections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])
	let noSource = $derived(!src?.patchDocId)
</script>

<div class="absolute inset-0 overflow-auto pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a patching source in the properties panel
		</div>
	{:else if !patchDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if connections.length === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			No connections recorded
		</div>
	{:else}
		<table class="w-full text-[2.6pt] leading-tight table-fixed border-collapse">
			<thead>
				<tr class="bg-zinc-100 text-zinc-600 font-semibold uppercase tracking-wider">
					<th class="px-1 py-0.5 text-left w-10">#</th>
					<th class="px-1 py-0.5 text-left">From</th>
					<th class="px-1 py-0.5 text-left">To</th>
					<th class="px-1 py-0.5 text-left w-16">Cable</th>
					<th class="px-1 py-0.5 text-right w-10">m</th>
					<th class="px-1 py-0.5 text-center w-12">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each connections as c, i (c.id)}
					<tr class="border-t border-zinc-100">
						<td class="px-1 py-0.5 text-zinc-400 tabular-nums">{i + 1}</td>
						<td class="px-1 py-0.5 font-mono truncate">{portLabel(c.fromPortRef)}</td>
						<td class="px-1 py-0.5 font-mono truncate">{portLabel(c.toPortRef)}</td>
						<td class="px-1 py-0.5 text-zinc-600 truncate">{cableLabel(c.cableType)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{c.lengthMeters.toFixed(1)}</td>
						<td class="px-1 py-0.5 text-center">
							<span class="px-1 rounded {STATUS_COLOR[c.status] ?? 'bg-zinc-100 text-zinc-600'}">{c.status}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
