<script lang="ts">
	import { draggable } from '$lib/ui/draggable'
	import { Icon } from '$lib'
	import type { Sheet } from './sheet.svelte'

	let { sheet }: { sheet: Sheet } = $props()

	// Floating windows toggled from the View menu.
	type Key = 'layers' | 'outlets' | 'trunks'
	const PANELS: { key: Key; title: string; blurb: string }[] = [
		{ key: 'layers', title: 'Layers', blurb: '' },
		{ key: 'outlets', title: 'Outlet list', blurb: 'Inserted outlet symbols, grouped by room.' },
		{ key: 'trunks', title: 'Trunk list', blurb: 'Cable trunks / conduits with fill rates.' },
	]

	// Per-panel position (px from top-left of the canvas area).
	let pos = $state<Record<Key, { x: number; y: number }>>({
		layers: { x: 24, y: 24 }, outlets: { x: 60, y: 60 }, trunks: { x: 96, y: 96 },
	})

	// The layer id of the currently selected object (to highlight + assign target).
	const selLayer = $derived(sheet.selectedObject?.obj.layer ?? null)
</script>

{#each PANELS as p (p.key)}
	{#if sheet.panels[p.key]}
		<div class="absolute z-20 w-64 rounded border border-slate-300 bg-white shadow-lg" style="left:{pos[p.key].x}px; top:{pos[p.key].y}px;">
			<div
				class="flex cursor-move items-center justify-between rounded-t bg-slate-100 px-2 py-1 text-sm font-medium"
				use:draggable={{ cursor: 'move', onMove: (dx, dy) => { pos[p.key].x += dx; pos[p.key].y += dy } }}
			>
				<span>{p.title}</span>
				<button class="rounded p-0.5 hover:bg-slate-200" title="Close" onclick={() => sheet.togglePanel(p.key)}>
					<Icon name="x" size={14} />
				</button>
			</div>

			{#if p.key === 'layers'}
				{@const model = sheet.layerModel}
				<div class="p-2 text-xs">
					{#if model}
						<div class="mb-1 truncate text-[11px] text-slate-400">{model.name}</div>
						<ul class="space-y-0.5">
							{#each model.layers ?? [] as layer (layer.id)}
								<li class="flex items-center gap-1 rounded px-1 py-0.5 {selLayer === layer.id ? 'bg-blue-50' : ''}">
									<button class="shrink-0 rounded p-0.5 text-slate-600 hover:bg-slate-100" title={layer.visible ? 'Hide' : 'Show'}
										onclick={() => (layer.visible = !layer.visible)}>
										<Icon name={layer.visible ? 'eye' : 'eyeSlash'} size={14} />
									</button>
									<button class="shrink-0 rounded p-0.5 text-slate-600 hover:bg-slate-100" title={layer.locked ? 'Unlock' : 'Lock'}
										onclick={() => (layer.locked = !layer.locked)}>
										<Icon name={layer.locked ? 'lock' : 'lockOpen'} size={14} />
									</button>
									<input type="color" class="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" bind:value={layer.color} title="Layer colour" />
									<input class="min-w-0 flex-1 rounded border border-transparent px-1 hover:border-slate-200 focus:border-slate-300" bind:value={layer.name} />
									{#if selLayer && selLayer !== layer.id}
										<button class="shrink-0 rounded px-1 text-blue-600 hover:bg-blue-100" title="Assign selected object to this layer"
											onclick={() => sheet.assignSelectedToLayer(layer.id)}>→</button>
									{/if}
									<button class="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete layer"
										onclick={() => sheet.removeLayer(layer.id)}>
										<Icon name="trash" size={13} />
									</button>
								</li>
							{/each}
						</ul>
						<button class="mt-2 w-full rounded border border-dashed border-slate-300 py-1 text-slate-500 hover:bg-slate-50" onclick={sheet.addLayer}>＋ Add layer</button>
						{#if !sheet.selectedObject}
							<p class="mt-2 text-[11px] text-slate-400">Select an object (double-click a view, click an object) to assign it to a layer.</p>
						{/if}
					{:else}
						<p class="text-slate-400">No model.</p>
					{/if}
				</div>
			{:else}
				<div class="p-3 text-xs text-slate-500">{p.blurb}</div>
			{/if}
		</div>
	{/if}
{/each}
