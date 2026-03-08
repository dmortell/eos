<script lang="ts">
	import type { OutletConfig } from './types'
	import { USAGE_COLORS } from './constants'

	let {
		outlet,
		px,
		radiusPx,
		zoom,
		selected,
		activeTool,
		onmousedown,
	}: {
		outlet: OutletConfig
		px: { x: number; y: number }
		radiusPx: number
		zoom: number
		selected: boolean
		activeTool?: string
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	const colors = $derived(USAGE_COLORS[outlet.usage])

	/** Calculate equilateral triangle vertices centered at (cx, cy) with circumradius r */
	function trianglePoints(cx: number, cy: number, r: number): string {
		const angle1 = Math.PI / 2
		const angle2 = Math.PI / 2 + (2 * Math.PI) / 3
		const angle3 = Math.PI / 2 + (4 * Math.PI) / 3
		const x1 = cx + r * Math.cos(angle1)
		const y1 = cy + r * Math.sin(angle1)
		const x2 = cx + r * Math.cos(angle2)
		const y2 = cy + r * Math.sin(angle2)
		const x3 = cx + r * Math.cos(angle3)
		const y3 = cy + r * Math.sin(angle3)
		return `${x1},${y1} ${x2},${y2} ${x3},${y3}`
	}

	/** Calculate square corners centered at (cx, cy) with "radius" r (half-side) */
	function squarePoints(cx: number, cy: number, r: number): string {
		const side = r * Math.sqrt(2)
		const half = side / 2
		return `${cx - half},${cy - half} ${cx + half},${cy - half} ${cx + half},${cy + half} ${cx - half},${cy + half}`
	}
</script>

<g class="pointer-events-auto" style:cursor={activeTool === 'select' ? 'pointer' : undefined}>
	<!-- Hit area (larger) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<circle cx={px.x} cy={px.y} r={radiusPx * 1.5} fill="transparent" {onmousedown} />

	<!-- Selection highlight -->
	{#if selected}
		<circle cx={px.x} cy={px.y} r={radiusPx + 4 / zoom} fill="none" stroke="#06b6d4" stroke-width={2 / zoom} />
	{/if}

	<!-- Mount type specific shapes -->
	{#if outlet.mountType === 'wall'}
		<!-- Wall: Equilateral triangle -->
		<polygon
			points={trianglePoints(px.x, px.y, radiusPx)}
			fill={outlet.level === 'low' ? colors.fill : 'none'}
			stroke={colors.stroke}
			stroke-width={outlet.level === 'low' ? 1.5 / zoom : 2.5 / zoom}
			opacity="0.85"
		/>
	{:else if outlet.mountType === 'floor'}
		<!-- Floor: Square with triangle inside -->
		<polygon
			points={squarePoints(px.x, px.y, radiusPx * 1.2)}
			fill={outlet.level === 'low' ? colors.fill : 'none'}
			stroke={colors.stroke}
			stroke-width={outlet.level === 'low' ? 1.5 / zoom : 2.5 / zoom}
			opacity="0.85"
		/>
		<!-- Inner triangle (same size) -->
		<polygon
			points={trianglePoints(px.x, px.y - 0.5, radiusPx * 0.9)}
			fill="none"
			stroke={colors.stroke}
			stroke-width={1.5 / zoom}
			opacity="0.6"
		/>
	{:else}
		<!-- Box / other: Circle with inner triangle -->
		<circle
			cx={px.x}
			cy={px.y}
			r={radiusPx * 0.9}
			fill={outlet.level === 'low' ? colors.fill : 'none'}
			stroke={colors.stroke}
			stroke-width={outlet.level === 'low' ? 1.5 / zoom : 2.5 / zoom}
			opacity="0.85"
		/>
		<!-- Inner triangle (inscribed in circle) -->
		<polygon
			points={trianglePoints(px.x, px.y, radiusPx * 0.8)}
			fill="none"
			stroke={colors.stroke}
			stroke-width={1.5 / zoom}
			opacity="0.6"
		/>
	{/if}

	<!-- Port count -->
	<text
		x={px.x}
		y={px.y + radiusPx * 0.35}
		text-anchor="middle"
		font-size={radiusPx * 0.9}
		fill={outlet.level === 'low' ? 'white' : colors.stroke}
		font-weight="bold"
		class="select-none pointer-events-none">{outlet.portCount}</text>

	<!-- Label -->
	{#if outlet.label}
		<text
			x={px.x}
			y={px.y - radiusPx - radiusPx * 0.3}
			text-anchor="middle"
			font-size={radiusPx * 0.6}
			fill="#374151"
			class="select-none pointer-events-none">{outlet.label}</text>
	{/if}
</g>
