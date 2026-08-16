<script lang="ts">
	/**
	 * One bench board = one rack (§13 resolved: per-rack-group boards).
	 * Port-bearing devices stacked top-down in RU order, each a collapsible
	 * row-group with a constant-size port grid (PanelDetailStrip pattern —
	 * fixed-size readable chips, no zoom LOD).
	 */
	import { Icon } from '$lib'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'
	import { fallbackPortLabel } from '$lib/elevation/portmap'
	import type { BenchEditor } from './bench.svelte'

	let { editor, rackId }: { editor: BenchEditor; rackId: string } = $props()

	let rack = $derived(editor.rackById.get(rackId))
	/** Port-bearing devices of this rack, top of rack first. */
	let portDevices = $derived(editor.devices
		.filter(d => d.rackId === rackId && (d.portCount ?? 0) > 0)
		.sort((a, b) => b.positionU - a.positionU))

	let collapsed = $state<Set<string>>(new Set())
	function toggle(deviceId: string) {
		const next = new Set(collapsed)
		next.has(deviceId) ? next.delete(deviceId) : next.add(deviceId)
		collapsed = next
	}

	function rowsFor(d: any): number[][] {
		const count = d.portCount ?? 0
		const rows: number[][] = []
		for (let start = 1; start <= count; start += 24) {
			rows.push(Array.from({ length: Math.min(24, count - start + 1) }, (_, i) => start + i))
		}
		return rows
	}

	/** Strip the floor prefix for chip display (full label in the tooltip). */
	function shortLabel(label: string): string {
		return label.replace(/^[LB]?\d{1,2}F?[.\-]/, '')
	}

	/** Scroll + flash the device row-group added via the tree. */
	function highlightWhenTargeted(el: HTMLElement, deviceId: string) {
		$effect(() => {
			if (editor.highlightDeviceId === deviceId) {
				el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
			}
		})
	}
</script>

{#if rack}
	<div class="border border-gray-200 rounded-lg bg-white shadow-sm min-w-0">
		<div class="h-7 px-2 flex items-center gap-1.5 bg-gray-50 border-b border-gray-200 rounded-t-lg text-[11px]">
			<Icon name="server" size={12} />
			<span class="font-semibold text-gray-700 truncate">{rack.label}</span>
			<span class="text-gray-400 shrink-0">Room {rack._room ?? rack.serverRoom} · {rack.heightU}U</span>
			<div class="flex-1"></div>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200" title="Move board left" onclick={() => editor.moveBench(rackId, -1)}><Icon name="chevronLeft" size={11} /></button>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200" title="Move board right" onclick={() => editor.moveBench(rackId, 1)}><Icon name="chevronRight" size={11} /></button>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title="Remove from bench" onclick={() => editor.removeFromBench(rackId)}><Icon name="x" size={11} /></button>
		</div>

		{#if portDevices.length === 0}
			<div class="p-3 text-[11px] text-gray-400">No port-bearing devices in this rack.</div>
		{/if}

		{#each portDevices as d (d.id)}
			{@const isCollapsed = collapsed.has(d.id)}
			{@const highlighted = editor.highlightDeviceId === d.id}
			<div class="border-b border-gray-100 last:border-b-0 last:rounded-b-lg {highlighted ? 'ring-2 ring-blue-400 ring-inset' : ''}"
				use:highlightWhenTargeted={d.id}>
				<button class="w-full h-6 px-2 flex items-center gap-1.5 text-[11px] hover:bg-gray-50 text-left"
					onclick={() => toggle(d.id)}>
					<Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={10} class="text-gray-400 shrink-0" />
					<span class="font-medium text-gray-700 truncate">{d.label}</span>
					<span class="text-gray-400 shrink-0">U{d.positionU} · {d.type} · {d.portCount}p{d.patchLevel === 'high' ? ' · HL' : ''}</span>
				</button>
				{#if !isCollapsed}
					<div class="px-2 pb-1.5 space-y-px overflow-x-auto">
						{#each rowsFor(d) as ports (ports[0])}
							<div class="flex gap-px min-w-max">
								{#each ports as p (p)}
									{@const info = editor.portInfo.get(`${d.id}:${p}`)}
									{@const conn = editor.portConnMap.get(`${d.id}:${p}`)}
									{@const isConnSel = !!conn && editor.selectedConnectionId === conn.id}
									<button
										class="relative w-16 h-6.5 rounded-sm border flex items-center justify-center shrink-0
											{info ? (LOC_TYPE_COLORS[info.locationType] ?? 'bg-blue-500/15 border-blue-500/40 text-blue-600') : 'bg-gray-100 border-gray-200/50 text-gray-300'}
											{isConnSel ? 'ring-2 ring-blue-400' : ''}"
										title={`${info?.label ?? fallbackPortLabel(rack.label, d.positionU, p)}${info ? `\n${LOC_TYPE_LABELS[info.locationType] ?? info.locationType}` : ' — unlabeled'}${conn ? '\npatched — click to select the cord' : ''}`}
										onclick={() => { if (conn) editor.selectConnection(isConnSel ? null : conn.id) }}>
										<span class="font-mono text-[9px] leading-none select-none whitespace-nowrap overflow-hidden">
											{info ? shortLabel(info.label) : p}
										</span>
										{#if conn}
											<span class="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full {conn.status === 'installed' ? 'bg-emerald-500' : 'bg-blue-500'}"
												title="patched"></span>
										{/if}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
