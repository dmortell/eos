<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { mx2paper, my2paper, type View } from './types'

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	const m = $derived(sheet.modelFor(view))
	const pe = $derived(clickable ? 'stroke' : 'none')
</script>

{#if m}
	{#each m.objects as o, i (i)}
		{@const sel = sheet.isObjectSelected(view, i)}
		{@const stroke = sel ? '#2563eb' : '#000000'}
		{@const sw = sel ? 0.8 : 0.4}
		{#if o.type === 'line'}
			<polyline
				points={o.points.map((p) => `${mx2paper(view, p.x)},${my2paper(view, p.y)}`).join(' ')}
				fill="none" {stroke} stroke-width={sw}
				style="pointer-events:{pe};cursor:pointer"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.selectObject(e, view, i)}
			/>
		{:else if o.type === 'rect'}
			<rect
				x={mx2paper(view, o.x)} y={my2paper(view, o.y)}
				width={o.w * view.scale} height={o.h * view.scale}
				fill="none" {stroke} stroke-width={sw}
				style="pointer-events:{pe};cursor:pointer"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.selectObject(e, view, i)}
			/>
		{:else if o.type === 'circle'}
			<circle cx={mx2paper(view, o.x)} cy={my2paper(view, o.y)} r={o.r * view.scale}
				fill="none" {stroke} stroke-width={sw}
				style="pointer-events:{pe};cursor:pointer"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.selectObject(e, view, i)}
			/>
		{/if}
	{/each}
{/if}
