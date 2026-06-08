<svelte:options namespace="svg" />

<script lang="ts">
	// Plan-view spatial editing: drag a row's origin. (Elevation device positions are edited via
	// the panel since the U-layout is render-internal.) `namespace="svg"` is required because this
	// layer is hosted via the render's {@render children} slot, which otherwise compiles these
	// elements in the HTML namespace (inert, zero-size).
	import type { RacksEditor } from './racks-editor.svelte'
	import type { RackFace } from './types'
	let { editor, face, interactive = false }: { editor: RacksEditor; face: RackFace; interactive?: boolean } = $props()
</script>

{#if face === 'plan'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g>
		{#each editor.rows as row (row.id)}
			{@const o = row.plan?.originMm ?? { x: 0, y: 0 }}
			<circle cx={o.x} cy={o.y} r={250} fill="#2563eb" fill-opacity="0.55" stroke="#1d4ed8" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="move" onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragRow(row, e) }} />
		{/each}
	</g>
{/if}
