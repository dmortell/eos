<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { mx2paper, my2paper, type Obj, type View } from './types'

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	const m = $derived(sheet.modelFor(view))
	const pe = $derived(clickable ? 'stroke' : 'none')

	// Index of the selected object in this view (editable only while clickable).
	const selIdx = $derived(
		clickable && sheet.selectedObj?.viewId === view.id ? sheet.selectedObj.index : null,
	)

	const HS = 2 // edit-handle size, paper mm

	// Edit handles (paper coords) for the selected object, by type.
	type Handle = { hx: number; hy: number; cur: string; handle: string }
	function handlesFor(o: Obj): Handle[] {
		if (o.type === 'rect') {
			return [
				{ handle: 'nw', cur: 'nwse-resize', hx: o.x, hy: o.y },
				{ handle: 'ne', cur: 'nesw-resize', hx: o.x + o.w, hy: o.y },
				{ handle: 'sw', cur: 'nesw-resize', hx: o.x, hy: o.y + o.h },
				{ handle: 'se', cur: 'nwse-resize', hx: o.x + o.w, hy: o.y + o.h },
			].map((h) => ({ ...h, hx: mx2paper(view, h.hx), hy: my2paper(view, h.hy) }))
		}
		if (o.type === 'circle') {
			return [{ handle: 'radius', cur: 'ew-resize', hx: mx2paper(view, o.x + o.r), hy: my2paper(view, o.y) }]
		}
		return o.points.map((p, k) => ({
			handle: `p${k}`, cur: 'move', hx: mx2paper(view, p.x), hy: my2paper(view, p.y),
		}))
	}
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
				style="pointer-events:{pe};cursor:move"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.startObjectMove(e, view, i)}
			/>
		{:else if o.type === 'rect'}
			<rect
				x={mx2paper(view, o.x)} y={my2paper(view, o.y)}
				width={o.w * view.scale} height={o.h * view.scale}
				fill="none" {stroke} stroke-width={sw}
				style="pointer-events:{pe};cursor:move"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.startObjectMove(e, view, i)}
			/>
		{:else if o.type === 'circle'}
			<circle cx={mx2paper(view, o.x)} cy={my2paper(view, o.y)} r={o.r * view.scale}
				fill="none" {stroke} stroke-width={sw}
				style="pointer-events:{pe};cursor:move"
				role="button" tabindex="-1" aria-label="object"
				onpointerdown={(e) => sheet.startObjectMove(e, view, i)}
			/>
		{/if}
	{/each}

	{#if selIdx !== null && m.objects[selIdx]}
		{#each handlesFor(m.objects[selIdx]) as h (h.handle)}
			<rect
				class="ohandle"
				x={h.hx - HS / 2} y={h.hy - HS / 2} width={HS} height={HS}
				style="pointer-events:all;cursor:{h.cur}"
				role="button" tabindex="-1" aria-label="resize"
				onpointerdown={(e) => sheet.startObjectResize(e, view, selIdx, h.handle)}
			/>
		{/each}
	{/if}
{/if}

<style>
	.ohandle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }
</style>
