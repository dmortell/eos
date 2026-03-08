<script lang="ts">
	import type { Point, PageCalibration } from '../parts/types'
	import type { TrunkConfig, TrunkNode, TrunkSegment } from './types'
	import { trunkWidthMm } from './types'
	import { TRUNK_COLORS } from './constants'
	import { generateTrunkPolygons, polygonToPath } from './geometry'

	let { trunks = [], calibration, zoom = 1, selectedTrunkIds = new Set(), selectedNodeIds = new Set(),
		drawingNodes = [], drawingSegments = [], drawingSpec, rubberBandTarget = null,
		toPx }: {
		trunks: TrunkConfig[]
		calibration: PageCalibration | null
		zoom: number
		selectedTrunkIds: Set<string>
		selectedNodeIds: Set<string>
		drawingNodes?: TrunkNode[]
		drawingSegments?: TrunkSegment[]
		drawingSpec?: TrunkConfig | null
		rubberBandTarget?: Point | null
		toPx: (mm: Point) => Point
	} = $props()

	interface RenderedTrunk {
		trunk: TrunkConfig
		/** Single combined path (all polygons joined), using evenodd to cut holes for loops */
		path: string
		color: string
		selected: boolean
	}

	let renderedTrunks = $derived.by(() => {
		const result: RenderedTrunk[] = []
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			const color = trunk.color ?? TRUNK_COLORS[trunk.shape]
			const polys = generateTrunkPolygons(trunk)
			// Combine all sub-polygons into one path string — evenodd fill-rule handles loop holes
			const path = polys.map(poly => polygonToPath(poly.map(p => toPx(p)))).join(' ')
			result.push({ trunk, path, color, selected: selectedTrunkIds.has(trunk.id) })
		}
		return result
	})

	/** Convert node to px for rendering */
	function nodePx(node: TrunkNode): Point { return toPx(node.position) }

	/** Segment midpoint in px */
	function segMidPx(trunk: TrunkConfig, seg: TrunkSegment): Point | null {
		const a = trunk.nodes.find(n => n.id === seg.nodes[0])
		const b = trunk.nodes.find(n => n.id === seg.nodes[1])
		if (!a || !b) return null
		return toPx({ x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 })
	}

	/** Drawing preview: build temporary trunk polygon for in-progress drawing */
	let drawingPath = $derived.by(() => {
		if (drawingNodes.length < 2 || drawingSegments.length === 0 || !drawingSpec) return ''
		const tempTrunk: TrunkConfig = {
			...drawingSpec,
			nodes: drawingNodes,
			segments: drawingSegments,
		}
		const polys = generateTrunkPolygons(tempTrunk)
		return polys.map(poly => polygonToPath(poly.map(p => toPx(p)))).join(' ')
	})

	/** Last drawing node position in px (for rubber-band line) */
	let lastDrawNodePx = $derived(
		drawingNodes.length > 0 ? toPx(drawingNodes[drawingNodes.length - 1].position) : null
	)
	let rubberBandPx = $derived(rubberBandTarget ? toPx(rubberBandTarget) : null)

	/** Is location ceiling-based (render dashed) */
	function isCeiling(trunk: TrunkConfig): boolean {
		return trunk.location === 'ceiling-plenum' || trunk.location === 'ceiling-tray'
	}
</script>

<!-- Committed trunks -->
{#each renderedTrunks as { trunk, path, color, selected } (trunk.id)}
	<!-- Trunk body -->
	{#if selected}
		<path d={path} fill="none" stroke="#06b6d4" stroke-width={trunkWidthMm(trunk) / (calibration?.scaleFactor ?? 1) * 0.1 + 4 / zoom}
			fill-rule="evenodd" class="pointer-events-none" />
	{/if}
	<path d={path}
		fill="{color}33" stroke={color} stroke-width={1.5 / zoom}
		fill-rule="evenodd"
		stroke-dasharray={isCeiling(trunk) ? `${6 / zoom} ${4 / zoom}` : 'none'}
		opacity={trunk.isPrimary ? 0.85 : 0.5}
		class="pointer-events-auto" style:cursor="pointer" />

	<!-- Node handles (only when trunk is selected) -->
	{#if selected}
		{#each trunk.nodes as node (node.id)}
			{@const px = nodePx(node)}
			{@const nodeSelected = selectedNodeIds.has(node.id)}
			<circle cx={px.x} cy={px.y} r={4 / zoom}
				fill={nodeSelected ? '#06b6d4' : color} stroke="white" stroke-width={1.5 / zoom}
				class="pointer-events-auto" style:cursor="grab" />
		{/each}

		<!-- Segment midpoint handles (for splitting) -->
		{#each trunk.segments as seg (seg.id)}
			{@const mid = segMidPx(trunk, seg)}
			{#if mid}
				<circle cx={mid.x} cy={mid.y} r={3 / zoom}
					fill="white" stroke={color} stroke-width={1 / zoom} opacity="0.6"
					class="pointer-events-auto" style:cursor="crosshair" />
			{/if}
		{/each}

		<!-- Labels -->
		{#if trunk.labels}
			{#each trunk.labels as label (label.id)}
				{@const mid = segMidPx(trunk, trunk.segments.find(s => s.id === label.segmentId)!)}
				{#if mid}
					{@const lx = mid.x + (label.offset.x / (calibration?.scaleFactor ?? 1))}
					{@const ly = mid.y + (label.offset.y / (calibration?.scaleFactor ?? 1))}
					<rect x={lx - 20 / zoom} y={ly - 7 / zoom} width={40 / zoom} height={14 / zoom}
						rx={2 / zoom} fill="white" stroke="#d1d5db" stroke-width={0.5 / zoom} />
					<text x={lx} y={ly + 3 / zoom} text-anchor="middle" font-size={10 / zoom}
						fill="#374151" class="select-none pointer-events-none">{label.text}</text>
				{/if}
			{/each}
		{/if}
	{/if}
{/each}

<!-- Drawing preview -->
{#if drawingPath}
	<path d={drawingPath} fill="#8b5cf633" stroke="#8b5cf6" stroke-width={1.5 / zoom}
		fill-rule="evenodd" stroke-dasharray="{4 / zoom} {2 / zoom}" />
{/if}

<!-- Drawing node handles -->
{#each drawingNodes as node (node.id)}
	{@const px = nodePx(node)}
	<circle cx={px.x} cy={px.y} r={4 / zoom}
		fill="#8b5cf6" stroke="white" stroke-width={1.5 / zoom} class="pointer-events-none" />
{/each}

<!-- Rubber-band line -->
{#if lastDrawNodePx && rubberBandPx}
	<line x1={lastDrawNodePx.x} y1={lastDrawNodePx.y} x2={rubberBandPx.x} y2={rubberBandPx.y}
		stroke="#8b5cf6" stroke-width={1.5 / zoom} stroke-dasharray="{6 / zoom} {3 / zoom}" opacity="0.6" />
	<circle cx={rubberBandPx.x} cy={rubberBandPx.y} r={3 / zoom}
		fill="#8b5cf6" opacity="0.4" class="pointer-events-none" />
{/if}
