<script lang="ts">
	import { Icon } from '$lib'
	import type { RackConfig, DeviceConfig } from './types'

	let { racks = [], devices = [], selectedIds = new Set<string>(), onselect, onrangeselect, ondelete }: {
		racks: RackConfig[]
		devices: DeviceConfig[]
		selectedIds: Set<string>
		onselect?: (deviceId: string, multi: boolean) => void
		onrangeselect?: (ids: string[]) => void
		ondelete?: (deviceId: string) => void
	} = $props()

	// Flat list of all devices in display order (grouped by rack, front then rear, sorted by position descending)
	let flatDevices = $derived(
		racks.flatMap(rack => {
			const rd = devices.filter(d => d.rackId === rack.id)
			const front = rd.filter(d => (d.mounting ?? 'both') !== 'rear').sort((a, b) => b.positionU - a.positionU)
			const rear = rd.filter(d => (d.mounting ?? 'both') === 'rear').sort((a, b) => b.positionU - a.positionU)
			return [...front, ...rear]
		})
	)

	function handleClick(e: MouseEvent, device: DeviceConfig) {
		if (e.shiftKey && selectedIds.size > 0 && onrangeselect) {
			const anchorIdx = flatDevices.findIndex(d => selectedIds.has(d.id))
			const clickIdx = flatDevices.findIndex(d => d.id === device.id)
			if (anchorIdx >= 0 && clickIdx >= 0) {
				const lo = Math.min(anchorIdx, clickIdx)
				const hi = Math.max(anchorIdx, clickIdx)
				const ids = flatDevices.slice(lo, hi + 1).map(d => d.id)
				onrangeselect(ids)
				return
			}
		}
		onselect?.(device.id, e.ctrlKey || e.metaKey || e.shiftKey)
	}
</script>

<div class="p-2 space-y-2 select-none text-xs">
	{#if racks.length === 0}
		<p class="text-gray-400 py-4 text-center">No racks in this row</p>
	{:else if devices.length === 0}
		<p class="text-gray-400 py-4 text-center">No devices. Add devices from Library</p>
	{:else}
		{#each racks as rack (rack.id)}
			{@const rackDevices = devices.filter(d => d.rackId === rack.id)}
			{@const frontDevices = rackDevices.filter(d => (d.mounting ?? 'both') !== 'rear').sort((a, b) => b.positionU - a.positionU)}
			{@const rearDevices = rackDevices.filter(d => (d.mounting ?? 'both') === 'rear').sort((a, b) => b.positionU - a.positionU)}
			<div>
				{#if rackDevices.length === 0}
				{:else}
					<div class="font-semibold bg-slate-200 px-2 py-1 uppercase tracking-wider mb-1">{rack.label}</div>
					<div class="space-y-0.5">
						{#each frontDevices as device (device.id)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="flex items-center gap-2 w-full pb-1 rounded text-left text-xs transition-colors cursor-pointer
									{selectedIds.has(device.id) ? 'bg-blue-50 border border-blue-300' : 'border border-transparent hover:bg-gray-100'}"
								onclick={e => handleClick(e, device)}
							>
								<div class="min-w-0 flex-1">
									<div class="text-gray-700 truncate">U{device.positionU}: {device.label} · {device.type}</div>
								</div>
								<button class="shrink-0 p-0.5 text-gray-300 hover:text-red-500 transition-colors"
									onclick={e => { e.stopPropagation(); ondelete?.(device.id) }}
									title="Delete device">
									<Icon name="trash" size={12} />
								</button>
							</div>
						{/each}
						{#if rearDevices.length > 0}
							<div class="text-xs font-semibold text-slate-800 uppercase underline tracking-wider mt-0.5 mb-0.5 xxpl-2 ">Rear Mount</div>
							{#each rearDevices as device (device.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex items-center gap-2 w-full pb-1 rounded text-left text-xs transition-colors cursor-pointer
										{selectedIds.has(device.id) ? 'bg-blue-50 border border-blue-300' : 'border border-transparent hover:bg-gray-100'}"
									onclick={e => handleClick(e, device)}
								>
									<div class="min-w-0 flex-1">
										<div class="text-gray-700 truncate">U{device.positionU}: {device.label} · {device.type}</div>
									</div>
									<button class="shrink-0 p-0.5 text-gray-300 hover:text-red-500 transition-colors"
										onclick={e => { e.stopPropagation(); ondelete?.(device.id) }}
										title="Delete device">
										<Icon name="trash" size={12} />
									</button>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
