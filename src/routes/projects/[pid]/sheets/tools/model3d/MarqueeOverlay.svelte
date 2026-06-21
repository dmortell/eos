<svelte:options namespace="svg" />

<script lang="ts">
	// The marquee selection box, rendered as a top overlay (after the annotation layer) so it
	// draws ABOVE objects + annotations/symbols. namespace="svg" — see Model3dEditLayer.
	let { marquee, zoom = 1 }: { marquee: { x: number; y: number; w: number; h: number } | null; zoom?: number } = $props()
</script>

{#if marquee}
	{@const m = marquee}
	<rect x={m.x} y={m.y} width={m.w} height={m.h} fill="#3b82f6" fill-opacity="0.08"
		stroke="#3b82f6" stroke-width={1 / zoom} vector-effect="non-scaling-stroke" stroke-dasharray="{4 / zoom} {3 / zoom}" style:pointer-events="none" />
{/if}
