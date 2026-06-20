<script lang="ts">
	import { draggable } from '$lib/ui/draggable'
	import { Icon } from '$lib'
	import type { Sheet } from './sheet.svelte'

	let { sheet }: { sheet: Sheet } = $props()

	// Floating windows toggled from the View menu. Placeholder content for now —
	// real Layers / Outlet / Trunk lists slot in here later.
	type Key = 'layers' | 'outlets' | 'trunks'
	const PANELS: { key: Key; title: string; blurb: string }[] = [
		{ key: 'layers', title: 'Layers', blurb: 'Layer visibility & ordering will go here.' },
		{ key: 'outlets', title: 'Outlet list', blurb: 'Inserted outlet symbols, grouped by room.' },
		{ key: 'trunks', title: 'Trunk list', blurb: 'Cable trunks / conduits with fill rates.' },
	]

	// Per-panel position (px from top-left of the canvas area).
	let pos = $state<Record<Key, { x: number; y: number }>>({
		layers: { x: 24, y: 24 }, outlets: { x: 60, y: 60 }, trunks: { x: 96, y: 96 },
	})
</script>

{#each PANELS as p (p.key)}
	{#if sheet.panels[p.key]}
		<div class="absolute z-20 w-56 rounded border border-slate-300 bg-white shadow-lg" style="left:{pos[p.key].x}px; top:{pos[p.key].y}px;">
			<div
				class="flex cursor-move items-center justify-between rounded-t bg-slate-100 px-2 py-1 text-sm font-medium"
				use:draggable={{ cursor: 'move', onMove: (dx, dy) => { pos[p.key].x += dx; pos[p.key].y += dy } }}
			>
				<span>{p.title}</span>
				<button class="rounded p-0.5 hover:bg-slate-200" title="Close" onclick={() => sheet.togglePanel(p.key)}>
					<Icon name="x" size={14} />
				</button>
			</div>
			<div class="p-3 text-xs text-slate-500">{p.blurb}</div>
		</div>
	{/if}
{/each}
