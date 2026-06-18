<script lang="ts">
	import type { Sheet } from './sheet.svelte'

	let { sheet }: { sheet: Sheet } = $props()
</script>

<aside class="w-64 shrink-0 overflow-y-auto border-r p-3 text-sm print:hidden">
	{#if sheet.selectedObject}
		{@const o = sheet.selectedObject.obj}
		<h2 class="mb-2 font-semibold">Object — {o.type}</h2>
		{#if o.type === 'circle'}
			<div class="grid grid-cols-2 gap-2">
				<label class="block"><span class="text-xs text-gray-500">X</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.x} /></label>
				<label class="block"><span class="text-xs text-gray-500">Y</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.y} /></label>
				<label class="block"><span class="text-xs text-gray-500">Radius</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.r} /></label>
			</div>
		{:else if o.type === 'rect'}
			<div class="grid grid-cols-2 gap-2">
				<label class="block"><span class="text-xs text-gray-500">X</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.x} /></label>
				<label class="block"><span class="text-xs text-gray-500">Y</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.y} /></label>
				<label class="block"><span class="text-xs text-gray-500">Width</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.w} /></label>
				<label class="block"><span class="text-xs text-gray-500">Height</span>
					<input type="number" class="w-full rounded border px-2 py-1" bind:value={o.h} /></label>
			</div>
		{:else if o.type === 'line'}
			<p class="mb-2 text-xs text-gray-500">{o.points.length} points</p>
			{#each o.points as p, i (i)}
				<div class="mb-1 grid grid-cols-2 gap-2">
					<label class="block"><span class="text-xs text-gray-500">X{i + 1}</span>
						<input type="number" class="w-full rounded border px-2 py-1" bind:value={p.x} /></label>
					<label class="block"><span class="text-xs text-gray-500">Y{i + 1}</span>
						<input type="number" class="w-full rounded border px-2 py-1" bind:value={p.y} /></label>
				</div>
			{/each}
		{/if}
		<button
			class="mt-3 rounded border px-2 py-1 text-xs hover:bg-gray-100"
			onclick={() => (sheet.selectedObj = null)}
		>← Back to view</button>
	{:else if sheet.selected}
		{@const sel = sheet.selected}
		{@const m = sheet.modelFor(sel)}
		<h2 class="mb-2 font-semibold">View properties</h2>
		<label class="mb-2 block">
			<span class="text-xs text-gray-500">Name</span>
			<input class="w-full rounded border px-2 py-1" bind:value={sel.name} />
		</label>
		<label class="mb-2 block">
			<span class="text-xs text-gray-500">Model</span>
			<select class="w-full rounded border px-2 py-1" bind:value={sel.modelId}>
				{#each sheet.models as md (md.id)}
					<option value={md.id}>{md.name}</option>
				{/each}
			</select>
		</label>
		<label class="mb-2 block">
			<span class="text-xs text-gray-500">Scale (px/mm)</span>
			<input type="number" step="0.1" class="w-full rounded border px-2 py-1" bind:value={sel.scale} />
		</label>
		<div class="grid grid-cols-2 gap-2">
			<label class="block"><span class="text-xs text-gray-500">Pan X</span>
				<input type="number" class="w-full rounded border px-2 py-1" bind:value={sel.mx} /></label>
			<label class="block"><span class="text-xs text-gray-500">Pan Y</span>
				<input type="number" class="w-full rounded border px-2 py-1" bind:value={sel.my} /></label>
		</div>
		<p class="mt-3 text-xs text-gray-500">Frame {Math.round(sel.fw)}×{Math.round(sel.fh)}mm · {m?.objects.length ?? 0} objects</p>
	{:else}
		<h2 class="mb-2 font-semibold">Views</h2>
		<ul class="space-y-1">
			{#each sheet.views as v (v.id)}
				<li>
					<button class="w-full rounded px-2 py-1 text-left hover:bg-gray-100" onclick={() => (sheet.selectedId = v.id)}>{v.name}</button>
				</li>
			{/each}
		</ul>
		<p class="mt-3 text-xs text-gray-500">Click a view on the page to edit it.</p>
	{/if}
</aside>
