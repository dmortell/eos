<script lang="ts">
	import { Button } from '$lib'
	import type { Section } from './constants'
	import { calcFillRate, fillColor, fillStatus } from './constants'

	let { section, canMoveUp = false, canMoveDown = false, onchange, onmoveup, onmovedown }: {
		section: Section
		canMoveUp?: boolean
		canMoveDown?: boolean
		onchange: () => void
		onmoveup: () => void
		onmovedown: () => void
	} = $props()

	let fillRate = $derived(calcFillRate(section))
	let colorClass = $derived(fillColor(fillRate))
	let statusText = $derived(fillStatus(fillRate))

	function addCable() {
		const newId = (Math.max(...section.cables.map(c => parseInt(c.id)), 0) + 1).toString()
		section.cables = [...section.cables, { id: newId, diameter: 10, quantity: 1 }]
		onchange()
	}

	function removeCable(id: string) {
		if (section.cables.length > 1) {
			section.cables = section.cables.filter(c => c.id !== id)
			onchange()
		}
	}

	function changed() { onchange() }
</script>

<div class="px-3 py-2 text-sm space-y-2">
	<div class="flex items-center gap-2">
		<label class="text-xs text-gray-500">Label</label>
		<input type="text" bind:value={section.label} oninput={changed}
			class="font-bold text-sm bg-transparent border-b border-dashed border-gray-400 outline-none w-24" />
		<div class="flex-1"></div>
		<Button icon="chevronUp" class="rounded px-1 py-0.5" onclick={onmoveup} disabled={!canMoveUp} />
		<Button icon="chevronDown" class="rounded px-1 py-0.5" onclick={onmovedown} disabled={!canMoveDown} />
	</div>

	<div class="flex items-center gap-1">
		<Button variant="toggle" class="rounded border px-2 py-0.5 text-xs" active={section.containmentType === 'round'}
			onclick={() => { section.containmentType = 'round'; changed() }}>Round</Button>
		<Button variant="toggle" class="rounded border px-2 py-0.5 text-xs" active={section.containmentType === 'rectangular'}
			onclick={() => { section.containmentType = 'rectangular'; changed() }}>Rectangular</Button>
		<div class="flex-1"></div>
		<span class="text-[10px] text-gray-500">Calc:</span>
		<button class="text-[10px] px-1.5 py-0.5 border rounded" title="Cable area calculation method"
			onclick={() => { section.calcMethod = section.calcMethod === 'rectangular' ? 'circular' : 'rectangular'; changed() }}>
			{section.calcMethod}
		</button>
	</div>

	{#if section.containmentType === 'round'}
		<div class="flex items-center gap-2">
			<label class="text-xs text-gray-500">Diameter (mm)</label>
			<input type="number" min="1" bind:value={section.diameter} oninput={changed} />
		</div>
	{:else}
		<div class="flex gap-2">
			<div>
				<label class="text-xs text-gray-500">Width (mm)</label>
				<input type="number" min="1" bind:value={section.width} oninput={changed} />
			</div>
			<div>
				<label class="text-xs text-gray-500">Height (mm)</label>
				<input type="number" min="1" bind:value={section.height} oninput={changed} />
			</div>
		</div>
	{/if}

	<div class="flex items-baseline justify-between">
		<div>
			<span class="text-xs text-gray-500">Fill:</span>
			<b class="{colorClass}">{fillRate.toFixed(1)}%</b>
		</div>
		<div class="{colorClass} text-[10px]">{statusText}</div>
	</div>

	<div class="text-xs font-bold">Cables</div>
	<div class="flex items-center gap-2 text-[10px] text-gray-500">
		<div class="flex-1">Qty</div>
		<div class="flex-1">Dia (mm)</div>
		<div class="w-6"></div>
	</div>
	{#each section.cables as cable (cable.id)}
		<div class="flex items-center gap-2">
			<div class="flex-1">
				<input type="number" min="1" step="1" bind:value={cable.quantity} oninput={changed} class="w-16" />
			</div>
			<div class="flex-1">
				<input type="number" min="0.1" step="0.1" bind:value={cable.diameter} oninput={changed} class="w-16" />
			</div>
			<Button icon="trash" onclick={() => removeCable(cable.id)} class="shrink-0 p-1" />
		</div>
	{/each}
	<Button icon="plus" variant="primary" class="w-full rounded text-xs" onclick={addCable}>Add Cable</Button>
</div>

<style>
	input[type="number"] { border: 1px solid #bbb; border-radius: 4px; padding: 0 4px; width: 5em; font-size: 12px; }
</style>
