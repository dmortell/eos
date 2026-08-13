<script lang="ts">
	/**
	 * §3.7 assignment dialogs for the block-selected ports:
	 *  - 'generate': create new locations in a zone and PIN them to the ports
	 *  - 'existing': pin the ports to an existing location's ports
	 * Pins are sticky (portAssignments) — zone re-generation never moves them.
	 */
	import { Icon } from '$lib'
	import type { ElevationsEditor } from '../editor.svelte'
	import { DEFAULT_LOC_TYPES, type LocType } from '../../frames/parts/types'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'

	let { editor, mode, onclose }: {
		editor: ElevationsEditor
		mode: 'generate' | 'existing'
		onclose: () => void
	} = $props()

	const zones = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
	let zone = $state(editor.activeZone)
	let portCount = $derived(editor.selectedPorts.size)

	// generate mode
	let portsPerLocation = $state(2)
	let startNumber = $state(0) // 0 = auto (next free)
	let locationType = $state<LocType>('desk')
	let isHighLevel = $state(false)
	let roomNumber = $state('')
	let nextFree = $derived(((editor.zoneLocations[zone] ?? []).reduce((m, l) => Math.max(m, l.locationNumber), 0)) + 1)
	let locCount = $derived(Math.ceil(portCount / Math.max(1, portsPerLocation)))

	// existing mode
	let locationNumber = $state(0)
	let zoneLocs = $derived(editor.zoneLocations[zone] ?? [])
	$effect(() => { if (zoneLocs.length && !zoneLocs.find(l => l.locationNumber === locationNumber)) locationNumber = zoneLocs[0].locationNumber })

	let types = $derived([...DEFAULT_LOC_TYPES.filter(t => t !== 'N/A'), ...(editor.framesData?.customLocationTypes ?? [])])

	function apply() {
		if (mode === 'generate') {
			editor.assignPortsToNewLocations({
				zone,
				startNumber: startNumber > 0 ? startNumber : undefined,
				portsPerLocation,
				locationType,
				isHighLevel,
				roomNumber: roomNumber || undefined,
			})
		} else {
			editor.assignPortsToLocation(zone, locationNumber)
		}
		onclose()
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={onclose}>
	<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80" onclick={e => e.stopPropagation()}>
		<div class="flex items-center gap-2 mb-3">
			<Icon name="mapPin" size={14} />
			<span class="text-sm font-semibold text-gray-700">
				{mode === 'generate' ? 'Auto-generate locations' : 'Assign to existing location'}
			</span>
			<div class="flex-1"></div>
			<span class="text-[11px] text-gray-400">{portCount} port{portCount !== 1 ? 's' : ''}</span>
		</div>

		<div class="space-y-2 text-xs">
			<label class="flex items-center gap-2">
				<span class="w-24 text-gray-500 shrink-0">Zone</span>
				<select class="flex-1 h-7 px-1 border border-gray-200 rounded bg-white font-mono" bind:value={zone}>
					{#each zones as z}<option value={z}>{z}{(editor.zoneLocations[z]?.length ?? 0) ? ` (${editor.zoneLocations[z].length})` : ''}</option>{/each}
				</select>
			</label>

			{#if mode === 'generate'}
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Ports / location</span>
					<input type="number" min="1" max="99" class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={portsPerLocation} />
				</label>
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Start number</span>
					<input type="number" min="0" class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={startNumber} placeholder="auto" />
					<span class="text-[10px] text-gray-400">0 = next ({nextFree})</span>
				</label>
				<div class="flex items-start gap-2">
					<span class="w-24 text-gray-500 shrink-0 pt-1">Type</span>
					<div class="flex-1 flex flex-wrap gap-1">
						{#each types as t}
							<button class="px-1.5 h-5.5 rounded border text-[10px] font-mono {LOC_TYPE_COLORS[t] ?? 'bg-gray-100 border-gray-200 text-gray-600'} {locationType === t ? 'ring-2 ring-blue-400' : ''}"
								title={LOC_TYPE_LABELS[t] ?? t}
								onclick={() => locationType = t}>{t}</button>
						{/each}
					</div>
				</div>
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Room no.</span>
					<input class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={roomNumber} maxlength="4" placeholder="optional" />
					<label class="flex items-center gap-1 text-gray-500">
						<input type="checkbox" bind:checked={isHighLevel} /> HL
					</label>
				</label>
				<div class="text-[10px] text-gray-400 leading-snug">
					Creates <b>{locCount}</b> location{locCount !== 1 ? 's' : ''} numbered from {startNumber > 0 ? startNumber : nextFree}
					and pins their labels to the selected ports (in rack order). Pinned labels never move on re-generation.
				</div>
			{:else}
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Location</span>
					<select class="flex-1 h-7 px-1 border border-gray-200 rounded bg-white font-mono" bind:value={locationNumber}>
						{#each zoneLocs as l (l.locationNumber)}
							<option value={l.locationNumber}>{String(l.locationNumber).padStart(3, '0')} · {l.locationType} · {l.portCount}p{l.isHighLevel ? ' · HL' : ''}</option>
						{/each}
					</select>
				</label>
				{#if zoneLocs.length === 0}
					<div class="text-[10px] text-amber-500">Zone {zone} has no locations yet — use Auto-generate instead.</div>
				{:else}
					<div class="text-[10px] text-gray-400 leading-snug">
						Pins this location's ports (1…{zoneLocs.find(l => l.locationNumber === locationNumber)?.portCount ?? '?'})
						to the selected ports in rack order. Any previous pins for this location are moved here.
					</div>
				{/if}
			{/if}
		</div>

		<div class="flex gap-2 justify-end mt-3">
			<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={onclose}>Cancel</button>
			<button class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
				disabled={portCount === 0 || (mode === 'existing' && zoneLocs.length === 0)}
				onclick={apply}>Assign</button>
		</div>
	</div>
</div>
