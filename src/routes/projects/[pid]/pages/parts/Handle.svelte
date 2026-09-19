<svelte:options namespace="svg" />

<script lang="ts">
	// One editing handle (Kestrel-style grip): a small square with a teal border, drawn as
	// an SVG <rect> so the same component serves both the entity grips inside a Viewport and
	// the viewport-frame grips on the paper — identical size and look everywhere.
	// `size` and `cx`/`cy` are in the host SVG's user units; the border stays 1px on screen.
	let { cx, cy, size, cursor = 'default', onpointerdown }:
		{ cx: number; cy: number; size: number; cursor?: string; onpointerdown?: (e: PointerEvent) => void } = $props()
</script>

<rect class="handle" x={cx - size / 2} y={cy - size / 2} width={size} height={size} style:cursor {onpointerdown} />

<style>
	.handle {
		fill:#fff; stroke:#0e7490; stroke-width:1.2; vector-effect:non-scaling-stroke;
		pointer-events:auto; touch-action:none;
	}
</style>
