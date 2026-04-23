<script lang="ts">
	/**
	 * Patch-schedule viewport.
	 *
	 * Subscribes to `patching/{pid}_F{NN}_R{X}` and renders a compact table of
	 * connections: From → To / Cable / Length (m) / Status. This is a read-only
	 * extract — full editing lives in the Patching tool.
	 *
	 * Note: port labels come from the port engine in the frames tool. For now
	 * we show the raw port ref (`rack/device/portIndex`). A future pass can
	 * subscribe to the frames doc too and resolve human labels like `FF.Z.NNN-SPP`.
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { PatchConnection } from '../../../patching/parts/types'
	import { CABLE_TYPES } from '../../../patching/parts/constants'
	import { Firestore } from '$lib'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'patching' ? viewport.source : null)

	let patchDoc = $state<any>(null)
	$effect(() => {
		const id = src?.patchDocId
		if (!id) { patchDoc = null; return }
		const unsub = db.subscribeOne('patching', id, (data: any) => { patchDoc = data ?? null })
		return () => unsub?.()
	})

	let connections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])

	function cableLabel(typeId: string): string {
		const t = CABLE_TYPES.find(c => c.id === typeId)
		return t?.label ?? typeId
	}

	function portLabel(p: PatchConnection['fromPortRef']): string {
		if (p.label) return p.label
		return `${p.rackId.slice(-3)}/${p.deviceId.slice(-3)}:${p.portIndex}`
	}

	const STATUS_COLOR: Record<string, string> = {
		add: 'bg-emerald-100 text-emerald-700',
		remove: 'bg-red-100 text-red-700',
		change: 'bg-amber-100 text-amber-700',
		installed: 'bg-zinc-100 text-zinc-600',
	}

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
