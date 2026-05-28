<script lang="ts">
	import type { Ladder as LadderType } from './types'
	import type { FloorYBand } from './engine'

	let {
		ladder,
		bands,
		selected = false,
		onmousedown,
	}: {
		ladder: LadderType
		bands: FloorYBand[]
		selected?: boolean
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	const lo = $derived(Math.min(ladder.fromFloor, ladder.toFloor))
	const hi = $derived(Math.max(ladder.fromFloor, ladder.toFloor))

	const topBand = $derived(bands.find((b) => b.floor === hi))
	const bottomBand = $derived(bands.find((b) => b.floor === lo))

	const yTop = $derived(topBand?.topMm ?? 0)
	const yBot = $derived(bottomBand?.slabBottomMm ?? 0)
	const width = $derived(ladder.widthMm ?? 150)
	const xLeft = $derived(ladder.xMm - width / 2)
	const height = $derived(Math.max(100, yBot - yTop))

	const stroke = $derived(ladder.color ?? 'rgb(100, 70, 140)')
	const fill = $derived(ladder.color ? `${ladder.color}33` : 'rgba(100, 70, 140, 0.12)')

	// Hash pattern id needs to be unique per ladder.
	const patternId = $derived(`ladder-hatch-${ladder.id}`)
</script>

<g
	class="ladder"
	class:selected
	data-ladder-id={ladder.id}
	onmousedown={(e) => onmousedown?.(e)}
	role="button"
	tabindex="-1"
>
	<defs>
		<pattern
			id={patternId}
			width="80"
			height="80"
			patternUnits="userSpaceOnUse"
			patternTransform="rotate(45)"
		>
			<line x1="0" y1="0" x2="0" y2="80" stroke={stroke} stroke-width="14" opacity="0.5" />
		</pattern>
	</defs>

	<!-- Body -->
	<rect
		x={xLeft}
		y={yTop}
		{width}
		{height}
		{fill}
		stroke={stroke}
		stroke-width="20"
		vector-effect="non-scaling-stroke"
	/>
	<!-- Hatched overlay -->
	<rect
		x={xLeft}
		y={yTop}
		{width}
		{height}
		fill={`url(#${patternId})`}
		pointer-events="none"
	/>

	<!-- Label at top -->
	<text
		x={ladder.xMm}
		y={yTop - 120}
		class="label"
		text-anchor="middle"
		fill={stroke}
	>
		{ladder.label}
	</text>

	<!-- Level indicator -->
	{#if ladder.level !== 'both'}
		<text
			x={ladder.xMm}
			y={yBot + 220}
			class="level-tag"
			text-anchor="middle"
			fill={stroke}
		>
			{ladder.level === 'high' ? 'HIGH' : 'LOW'}
		</text>
	{/if}

	{#if selected}
		<rect
			x={xLeft - 60}
			y={yTop - 60}
			width={width + 120}
			height={height + 120}
			class="selection"
		/>
	{/if}
</g>

<style>
	.ladder {
		cursor: pointer;
	}
	.label {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 220px;
		font-weight: 700;
		pointer-events: none;
	}
	.level-tag {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 180px;
		font-weight: 600;
		opacity: 0.7;
		pointer-events: none;
	}
	.selection {
		fill: none;
		stroke: rgb(59, 130, 246);
		stroke-width: 3;
		stroke-dasharray: 12 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
</style>
