<svelte:options namespace="svg" />

<script lang="ts">
	// One editing handle (Kestrel-style grip): a small square with a teal border, drawn as
	// an SVG <rect> so the same component serves both the entity grips inside a Viewport and
	// the viewport-frame grips on the paper — identical size and look everywhere.
	// `size` and `cx`/`cy` are in the host SVG's user units. non-scaling-stroke keeps the stroke
	// constant against SVG-internal transforms, but NOT against an ancestor CSS canvas zoom — so
	// callers pass strokeWidth = 1.2 / canvasZoom to keep the border a constant ~1.2px on screen.
	let { cx, cy, size, cursor = 'default', strokeWidth = 1.2, onpointerdown }:
		{ cx: number; cy: number; size: number; cursor?: string; strokeWidth?: number; onpointerdown?: (e: PointerEvent) => void } = $props()
</script>

<rect class="handle" x={cx - size / 2} y={cy - size / 2} width={size} height={size} style:cursor style:stroke-width={strokeWidth} {onpointerdown} />

<style>
	/* Mostly-transparent fill so the point/endpoint underneath stays visible while dragging. */
	.handle {
		fill:#ffffff2e; stroke:#0e7490; vector-effect:non-scaling-stroke;
		pointer-events:auto; touch-action:none;
	}
	.handle:hover { fill:#0e749040; }
</style>
