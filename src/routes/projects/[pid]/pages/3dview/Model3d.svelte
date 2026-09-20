<script lang="ts">
	// Renders a 3D MODEL into a Pages viewport using the ported model3d projection.
	// model3d's project() returns {u, v} with v = height/depth UP (origin bottom-left). Pages draws in
	// model mm with y DOWN, elevations measured DOWN from GROUND and horizontally re-centred (elevU).
	// We reconcile with ONE per-direction affine group transform (computed here) instead of touching
	// the pure engine:
	//   • plan: (u,v) = (x,y) already matches Pages' y-down plan → identity.
	//   • elevation: v-up → GROUND−v (scale(1,-1)+translate y=GROUND); horizontal shifted so it lands on
	//     Pages' elevU centring (front 0, rear 2·cx, right cx−cy, left cx+cy).
	//   • iso: deferred (P1c) — the viewport keeps the mock iso for now.
	// Line thickness is NON-SCALING (constant screen px, `vector-effect`) and LAYER-DEFINED (each layer's
	// `weight`), so lineweight is a paper property independent of the drawing scale/zoom.
	import { project } from './projection'
	import { BASIS } from './types'
	import type { Model, Obj, Dir } from './types'

	let { model, dir = 'plan', cx = 0, cy = 0, ground = 0, defaultWeight = 1 }:
		{ model: Model; dir?: Dir; cx?: number; cy?: number; ground?: number; defaultWeight?: number } = $props()

	const layerOf = (o: Obj) => model.layers?.find((l) => l.id === o.layer)
	const colorOf = (o: Obj) => layerOf(o)?.color ?? '#475569'
	const weightOf = (o: Obj) => layerOf(o)?.weight ?? defaultWeight   // screen px (non-scaling)
	const visible = (o: Obj) => { const l = layerOf(o); return !l || l.visible }

	const xform = $derived.by(() => {
		if (dir === 'plan') return ''
		if (dir === 'iso') return `translate(0 ${2 * cy}) scale(1 -1)`   // iso is centred about (cx,cy), v-up
		const b = BASIS[dir as 'front' | 'rear' | 'left' | 'right']
		const ox = cx - b.hs * (b.h === 'x' ? cx : cy)                    // shift onto Pages' elevU centring
		return `translate(${ox} ${ground}) scale(1 -1)`                   // v-up → GROUND − v
	})
</script>

<g class="m3d" transform={xform}>
	{#each model.objects as o (o.id)}
		{#if visible(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(o, dir, undefined, undefined, cx, cy) as s, i (i)}
				{#if s.closed}
					<polygon points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
</g>

<style>
	.m3d :global(polygon), .m3d :global(polyline) { stroke-linejoin: round; }
</style>
