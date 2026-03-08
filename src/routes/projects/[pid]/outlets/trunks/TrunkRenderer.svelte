<script lang="ts">
	import type { Point, PageCalibration } from '../parts/types'
	import type { TrunkConfig, TrunkNode, TrunkSegment } from './types'
	import { trunkWidthMm } from './types'
	import { TRUNK_COLORS } from './constants'
	import { dist, generateTrunkPolygons, polygonToRoundedPath } from './geometry'

	const INNER_CORNER_RADIUS_MM = 10

	let { trunks = [], calibration, zoom = 1, nodeFillMap = new Map(), selectedTrunkIds = new Set(), selectedNodeIds = new Set(),
		drawingNodes = [], drawingSegments = [], drawingSpec, rubberBandTarget = null,
		ctrlKey = false, toPx }: {
		trunks: TrunkConfig[]
		calibration: PageCalibration | null
		zoom: number
		nodeFillMap?: Map<string, { cableCount: number; cableAreaMm2: number; trunkAreaMm2: number; fillRatio: number; byType: Record<string, number> }>
		selectedTrunkIds: Set<string>
		selectedNodeIds: Set<string>
		drawingNodes?: TrunkNode[]
		drawingSegments?: TrunkSegment[]
		drawingSpec?: TrunkConfig | null
		rubberBandTarget?: Point | null
		ctrlKey?: boolean
		toPx: (mm: Point) => Point
	} = $props()

	interface RenderedTrunk {
		trunk: TrunkConfig
		/** Single combined path (all polygons joined), using evenodd to cut holes for loops */
		path: string
		color: string
		selected: boolean
	}

	let innerCornerRadiusPx = $derived.by(() => {
		const mmToPx = (mm: number): number => {
			const origin = toPx({ x: 0, y: 0 })
			const xAxis = toPx({ x: mm, y: 0 })
			const yAxis = toPx({ x: 0, y: mm })
			return (dist(origin, xAxis) + dist(origin, yAxis)) / 2
		}
		return mmToPx(INNER_CORNER_RADIUS_MM)
	})

	function trunkPathPx(trunk: TrunkConfig, polys: Point[][]): string {
		const polygonsPx = polys.map(poly => poly.map(p => toPx(p)))

		const mmToPx = (mm: number): number => {
			const origin = toPx({ x: 0, y: 0 })
			const xAxis = toPx({ x: mm, y: 0 })
			const yAxis = toPx({ x: 0, y: mm })
			return (dist(origin, xAxis) + dist(origin, yAxis)) / 2
		}

		// Build per-node radius map
		const nodeRadiusMap = new Map<string, number>()
		for (const node of trunk.nodes) {
			if (node.radius && node.radius > 0) {
				const nodePx = toPx(node.position)
				const key = `${nodePx.x},${nodePx.y}`
				nodeRadiusMap.set(key, mmToPx(node.radius))
			}
		}

		if (trunk.shape !== 'rect') {
			const halfWidthPx = mmToPx(trunkWidthMm(trunk)) / 2
			return polygonsPx.map(poly =>
				polygonToRoundedPath(poly, innerCornerRadiusPx, {
					nodeRadiusMap,
					skipRoundDistancePx: halfWidthPx + 1,
				})
			).join(' ')
		}

		const nodeDegree = new Map<string, number>()
		for (const n of trunk.nodes) nodeDegree.set(n.id, 0)
		for (const seg of trunk.segments) {
			nodeDegree.set(seg.nodes[0], (nodeDegree.get(seg.nodes[0]) ?? 0) + 1)
			nodeDegree.set(seg.nodes[1], (nodeDegree.get(seg.nodes[1]) ?? 0) + 1)
		}

		const endCentersPx = trunk.nodes
			.filter(n => (nodeDegree.get(n.id) ?? 0) === 1)
			.map(n => toPx(n.position))

		const halfWidthPx = mmToPx(trunkWidthMm(trunk)) / 2
		const endSkipDistancePx = halfWidthPx + 1

		return polygonsPx
			.map(poly => polygonToRoundedPath(poly, innerCornerRadiusPx, {
				skipRoundCenters: endCentersPx,
				skipRoundDistancePx: endSkipDistancePx,
				nodeRadiusMap,
			}))
			.join(' ')
	}

	let renderedTrunks = $derived.by(() => {
		const result: RenderedTrunk[] = []
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			const color = trunk.color ?? TRUNK_COLORS[trunk.shape]
			const polys = generateTrunkPolygons(trunk)
			// Combine all sub-polygons into one path string — evenodd fill-rule handles loop holes
			const path = trunkPathPx(trunk, polys)
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
		return trunkPathPx(tempTrunk, polys)
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

	const CABLE_TYPE_LABELS: Record<string, string> = {
		cat6a: 'C6A', cat6: 'C6', cat5e: 'C5e', 'fiber-sm': 'FSM', 'fiber-mm': 'FMM',
	}

	function formatByType(byType: Record<string, number>): string {
		const parts: string[] = []
		for (const [type, count] of Object.entries(byType)) {
			if (count > 0) parts.push(`${count}${CABLE_TYPE_LABELS[type] ?? type}`)
		}
		return parts.join(' ')
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
		class="pointer-events-auto" style:cursor={selected ? 'move' : 'pointer'} />

	<!-- Per-node fill labels (offset along segment toward neighbor) -->
	{#each trunk.segments as seg (seg.id)}
		{@const nA = trunk.nodes.find(n => n.id === seg.nodes[0])}
		{@const nB = trunk.nodes.find(n => n.id === seg.nodes[1])}
		{#if nA && nB}
			<!-- Label near node A (offset toward B) -->
			{@const fillA = nodeFillMap.get(nA.id)}
			{#if fillA && fillA.cableCount > 0}
				{@const pxA = nodePx(nA)}
				{@const pxB = nodePx(nB)}
				{@const dx = pxB.x - pxA.x}
				{@const dy = pxB.y - pxA.y}
				{@const d = Math.sqrt(dx * dx + dy * dy) || 1}
				{@const off = Math.min(20 / zoom, d * 0.25)}
				{@const lx = pxA.x + dx / d * off}
				{@const ly = pxA.y + dy / d * off}
				{@const fillPct = Math.round(fillA.fillRatio * 100)}
				{@const fillColor = fillPct > 60 ? '#ef4444' : fillPct > 40 ? '#f59e0b' : '#22c55e'}
				{@const labelText = `${formatByType(fillA.byType)} ${fillPct}%`}
				{@const labelW = (labelText.length * 5.5 + 10) / zoom}
				<rect x={lx - labelW / 2} y={ly - 18 / zoom} width={labelW} height={14 / zoom}
					rx={3 / zoom} fill="white" stroke={fillColor} stroke-width={1 / zoom} opacity="0.9" />
				<text x={lx} y={ly - 8 / zoom} text-anchor="middle" font-size={10 / zoom}
					fill={fillColor} font-weight="600" class="select-none pointer-events-none">{labelText}</text>
			{/if}
			<!-- Label near node B (offset toward A) -->
			{@const fillB = nodeFillMap.get(nB.id)}
			{#if fillB && fillB.cableCount > 0}
				{@const pxA2 = nodePx(nA)}
				{@const pxB2 = nodePx(nB)}
				{@const dx2 = pxA2.x - pxB2.x}
				{@const dy2 = pxA2.y - pxB2.y}
				{@const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1}
				{@const off2 = Math.min(20 / zoom, d2 * 0.25)}
				{@const lx2 = pxB2.x + dx2 / d2 * off2}
				{@const ly2 = pxB2.y + dy2 / d2 * off2}
				{@const fillPct2 = Math.round(fillB.fillRatio * 100)}
				{@const fillColor2 = fillPct2 > 60 ? '#ef4444' : fillPct2 > 40 ? '#f59e0b' : '#22c55e'}
				{@const labelText2 = `${formatByType(fillB.byType)} ${fillPct2}%`}
				{@const labelW2 = (labelText2.length * 5.5 + 10) / zoom}
				<rect x={lx2 - labelW2 / 2} y={ly2 - 18 / zoom} width={labelW2} height={14 / zoom}
					rx={3 / zoom} fill="white" stroke={fillColor2} stroke-width={1 / zoom} opacity="0.9" />
				<text x={lx2} y={ly2 - 8 / zoom} text-anchor="middle" font-size={10 / zoom}
					fill={fillColor2} font-weight="600" class="select-none pointer-events-none">{labelText2}</text>
			{/if}
		{/if}
	{/each}

	<!-- Node handles (only when trunk is selected) -->
	{#if selected}
		{#each trunk.nodes as node (node.id)}
			{@const px = nodePx(node)}
			{@const nodeSelected = selectedNodeIds.has(node.id)}
			{@const isConnected = !!(node.connectedRackId || node.connectedOutletId)}
			{#if isConnected}
				<circle cx={px.x} cy={px.y} r={7 / zoom}
					fill="none" stroke={node.connectedRackId ? '#3b82f6' : '#10b981'} stroke-width={1.5 / zoom}
					class="pointer-events-none" />
			{/if}
			<circle cx={px.x} cy={px.y} r={4 / zoom}
				fill={nodeSelected ? '#06b6d4' : isConnected ? (node.connectedRackId ? '#3b82f6' : '#10b981') : color} stroke="white" stroke-width={1.5 / zoom}
				class="pointer-events-auto" style:cursor="pointer" />
		{/each}

		<!-- Segment midpoint handles (for splitting) -->
		{#each trunk.segments as seg (seg.id)}
			{@const mid = segMidPx(trunk, seg)}
			{#if mid}
				<circle cx={mid.x} cy={mid.y} r={3 / zoom}
					fill="white" stroke={color} stroke-width={1 / zoom} opacity={ctrlKey ? 1 : 0.3}
					class="pointer-events-auto" style:cursor={ctrlKey ? 'crosshair' : 'default'} />
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
