<script lang="ts">
	// P1 render of a 3D MODEL into a Pages viewport, using the ported model3d projection. Draws each
	// object's projected outline (polygon/polyline) in the current view direction, coloured by layer.
	// Coordinates come out in model mm (plan: u=x, v=y — Pages' y-down, so it aligns with the viewBox);
	// elevation/iso alignment (v = height up) is handled in P1b. Read-only for now (no editing yet).
	import { project } from './projection'
	import type { Model, Obj, Dir } from './types'

	let { model, dir = 'plan', sw = 1.2 }: { model: Model; dir?: Dir; sw?: number } = $props()   // sw = screen px (non-scaling stroke)
	const layerOf = (o: Obj) => model.layers?.find((l) => l.id === o.layer)
	const colorOf = (o: Obj) => layerOf(o)?.color ?? '#475569'
	const visible = (o: Obj) => { const l = layerOf(o); return !l || l.visible }
</script>

<g class="m3d">
	{#each model.objects as o (o.id)}
		{#if visible(o)}
			{@const col = colorOf(o)}
			{#each project(o, dir) as s, i (i)}
				{#if s.closed}
					<polygon points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
</g>

<style>
	.m3d :global(polygon), .m3d :global(polyline) { stroke-linejoin: round; }
</style>
