<script lang="ts">
	import { Button } from '$lib'
	import type { Section } from './constants'
	import { calcFillRate, fillColor, fillStatus } from './constants'
	import SectionCanvas from './SectionCanvas.svelte'

	let { section, selected = false, onchange, onselect, ondelete }: {
		section: Section
		selected?: boolean
		onchange: () => void
		onselect: () => void
		ondelete: () => void
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="border rounded-lg bg-white {selected ? 'ring-2 ring-blue-400 border-blue-400' : 'border-gray-300'}"
	onclick={onselect}>

	<div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
		<input type="text" bind:value={section.label} oninput={changed}
			class="font-bold text-sm bg-transparent border-b border-dashed border-gray-400 outline-none w-24" />

		<Button variant="toggle" class="rounded border px-2 py-0.5 text-xs" active={section.containmentType === 'round'}
			onclick={() => { section.containmentType = 'round'; changed() }}>Round</Button>
		<Button variant="toggle" class="rounded border px-2 py-0.5 text-xs" active={section.containmentType === 'rectangular'}
			onclick={() => { section.containmentType = 'rectangular'; changed() }}>Rectangular</Button>

		<div class="flex-1"></div>

		<span class="text-xs">Calc:</span>
		<button class="text-xs px-2 py-0.5 border rounded" title="Cable area calculation method" onclick={() => { section.calcMethod = section.calcMethod === 'rectangular' ? 'circular' : 'rectangular'; changed() }}>
			{section.calcMethod}
		</button>

		<Button title="Delete section" icon="trash" class="shrink-0 p-1 print:hidden" onclick={ondelete} />
	</div>

	<div class="flex print:flex">
		<div class="text-sm px-3 py-2 w-64 shrink-0 print:hidden">
			{#if section.containmentType === 'round'}
				<div class="flex items-center gap-2 mb-2">
					<label class="text-xs">Diameter (mm)</label>
					<input type="number" min="1" bind:value={section.diameter} oninput={changed} />
				</div>
			{:else}
				<div class="flex gap-2 mb-2">
					<div>
						<label class="text-xs">Width (mm)</label>
						<input type="number" min="1" bind:value={section.width} oninput={changed} />
					</div>
					<div>
						<label class="text-xs">Height (mm)</label>
						<input type="number" min="1" bind:value={section.height} oninput={changed} />
					</div>
				</div>
			{/if}

			<div class="flex justify-between items-baseline mb-2">
				<div>
					<span class="text-xs">Fill Rate:</span>
					<b class="{colorClass}">{fillRate.toFixed(1)}%</b>
				</div>
			</div>
			<div class="{colorClass} text-xs mb-3">{statusText}</div>

			<div class="text-xs font-bold mb-1">Cables</div>
			<div class="flex items-center gap-2 text-xs text-gray-500 mb-1">
				<div class="flex-1">Dia (mm)</div>
				<div class="flex-1">Qty</div>
				<div class="w-6"></div>
			</div>
			{#each section.cables as cable (cable.id)}
				<div class="flex items-center gap-2 py-0.5">
					<div class="flex-1">
						<input type="number" min="0.1" step="0.1" bind:value={cable.diameter} oninput={changed} class="w-16" />
					</div>
					<div class="flex-1">
						<input type="number" min="1" step="1" bind:value={cable.quantity} oninput={changed} class="w-16" />
					</div>
					<Button icon="trash" onclick={() => removeCable(cable.id)} class="shrink-0 p-1" />
				</div>
			{/each}
			<Button icon="plus" variant="primary" class="w-full rounded text-xs mt-1" onclick={addCable}>Add Cable</Button>
		</div>

		<div class="flex-1 p-2 flex flex-col items-center">
			<div class="text-xs text-gray-500 print:hidden">
				{#each section.cables as cable}{cable.diameter}mm &times; {cable.quantity} &nbsp;{/each}
			</div>
			<SectionCanvas {section} size={350} />
		</div>
	</div>
</div>

<style>
	input[type="number"] { border: 1px solid #bbb; border-radius: 4px; padding: 0 4px; width: 5em; }
</style>
