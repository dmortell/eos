<script lang="ts">
	/**
	 * Panel detail strip — constant-screen-size port grid for one panel device,
	 * docked under the canvas (elevations-plan.md §3.3 readability guarantee).
	 * Full single-line labels at fixed size regardless of canvas zoom; cells are
	 * clickable and stay in sync with the canvas port selection.
	 */
	import { Icon } from '$lib'
	import type { ElevationsEditor } from '../editor.svelte'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'

	let { editor, onclose }: { editor: ElevationsEditor; onclose?: () => void } = $props()

	/** The panel to show: the selected panel device, or the selected port's device. */
	let device = $derived.by(() => {
		const selDev = editor.selectedDevices.find(d => d.type === 'panel' && (d.portCount ?? 0) > 0)
		if (selDev) return selDev
		if (editor.selectedPort) {
			const d = editor.devices.find(d => d.id === editor.selectedPort!.deviceId)
			if (d?.type === 'panel') return d
		}
		return null
	})

	let rack = $derived(device ? editor.racks.find(r => r.id === device!.rackId) : null)

	let rows = $derived.by(() => {
		if (!device) return [] as { row: 'top' | 'bottom'; ports: number[] }[]
		const count = device.portCount ?? 0
		if (count <= 24) return [{ row: 'top' as const, ports: Array.from({ length: count }, (_, i) => i + 1) }]
		return [
			{ row: 'top' as const, ports: Array.from({ length: 24 }, (_, i) => i + 1) },
			{ row: 'bottom' as const, ports: Array.from({ length: count - 24 }, (_, i) => i + 25) },
		]
	})

	function cellInfo(portIndex: number) {
		return editor.portInfo.get(`${device!.id}:${portIndex}`)
	}

	function reservation(portIndex: number): string | undefined {
		if (!device || !rack) return undefined
		const row = portIndex <= 24 ? 'top' : 'bottom'
		const col = (portIndex - 1) % 24
		return editor.reservationMap.get(`${rack.id}:${device.positionU}:${row}:${col}`)
	}
</script>

{#if device && rack}
	<div class="border-t border-gray-200 bg-white shrink-0 print:hidden">
		<div class="h-6 px-2 flex items-center gap-2 text-[11px] bg-gray-50 border-b border-gray-100">
			<Icon name="layers" size={12} />
			<span class="font-semibold text-gray-700">{device.label}</span>
			<span class="text-gray-400">{rack.label} · U{device.positionU} · {device.portCount} ports{device.patchLevel === 'high' ? ' · high-level' : ''}</span>
			<div class="flex-1"></div>
			<button class="p-0.5 rounded text-gray-400 hover:bg-gray-200" title="Close panel detail" onclick={() => onclose?.()}>
				<Icon name="x" size={12} />
			</button>
		</div>
		<div class="p-1.5 overflow-x-auto space-y-1">
			{#each rows as { ports } (ports[0])}
				<div class="flex gap-px min-w-max">
					{#each ports as p (p)}
						{@const info = cellInfo(p)}
						{@const res = reservation(p)}
						{@const isSel = editor.selectedPort?.deviceId === device.id && editor.selectedPort?.portIndex === p}
						<button
							class="relative w-16 h-7 rounded-sm border flex items-center justify-center shrink-0
								{info ? (LOC_TYPE_COLORS[info.locationType] ?? 'bg-blue-500/15 border-blue-500/40 text-blue-600') : (res ? (LOC_TYPE_COLORS[res] ?? '') + ' border-dashed' : 'bg-gray-100 border-gray-200/50 text-gray-300')}
								{isSel ? 'ring-2 ring-blue-400' : ''}"
							title={info ? `${info.label}\n${LOC_TYPE_LABELS[info.locationType] ?? info.locationType}${res ? `\nReserved: ${res}` : ''}` : `Port ${p} — unlabeled${res ? `\nReserved: ${res}` : ''}`}
							onclick={() => editor.selectPort(device!.id, p)}>
							<span class="font-mono text-[9px] leading-none select-none whitespace-nowrap overflow-hidden">
								{info ? info.label.replace(/^[LB]?\d{1,2}F?[.\-]/, '') : (res ?? p)}
							</span>
							{#if res && info}
								<span class="absolute top-0 left-0 right-0 h-0.5 {LOC_TYPE_COLORS[res]?.split(' ')[0] ?? 'bg-gray-400'}"></span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}
