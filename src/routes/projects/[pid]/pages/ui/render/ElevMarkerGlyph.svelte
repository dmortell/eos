<svelte:options namespace="svg" />

<script lang="ts">
	// An elevation marker's plan drawing — a DUMB renderer of the primitives ui/elevMarker.ts `elevMarkerMarks` returns
	// (the one function that decides the look: the eltag callout today, maybe a plain arrow later). Used for the placed
	// markers (VpMarks) and the Elevation tool's preview (VpOverlays). Never takes pointer events: the marker is hit /
	// grabbed through the Viewport's own pick cascade (hit.ts hitSection, grips.ts pickElevGrip).
	import type { ElevMarks } from '../elevMarker'

	let { marks, sel = false, preview = false, sw = 1 }: {
		marks: ElevMarks
		/** Selected: a heavier outline. */ sel?: boolean
		/** The tool's rubber-band preview: fainter. */ preview?: boolean
		/** ~1 screen px in drawing units (1 / canvas zoom — non-scaling-stroke can't see the CSS zoom). */ sw?: number
	} = $props()
</script>

<g class="elev-mark" class:sel class:preview>
	{#each marks.prims as p, i (i)}
		{#if p.k === 'circle'}<circle class="em-ring" cx={p.c[0]} cy={p.c[1]} r={p.r} stroke-width={(sel ? 1.8 : 1.3) * sw} />
		{:else if p.k === 'poly'}<polygon class={p.fill ? 'em-fill' : 'em-ring'} points={p.pts.map((q) => q.join(',')).join(' ')} stroke-width={1.1 * sw} />
		{:else if p.k === 'line'}<line class="em-line" x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke-width={sw} />
		{:else}<text class="em-text" x={p.p[0]} y={p.p[1]} font-size={p.size} text-anchor="middle" dominant-baseline="central">{p.text}</text>{/if}
	{/each}
</g>

<style>
	/* Section teal (VpMarks' markers): a paper-white ring so the number reads over any drawing, a solid arrow. */
	.elev-mark { pointer-events:none; }
	.elev-mark.preview { opacity:0.7; }
	.em-ring { fill:#ffffffd9; stroke:#0e7490; vector-effect:non-scaling-stroke; }
	.sel .em-ring { fill:#e6f4f7; }
	.em-fill { fill:#0e7490; stroke:#0e7490; vector-effect:non-scaling-stroke; }
	.em-line { stroke:#0e7490; vector-effect:non-scaling-stroke; }
	.em-text { fill:#0e7490; font-weight:700; font-family:Consolas,monospace; }
</style>
