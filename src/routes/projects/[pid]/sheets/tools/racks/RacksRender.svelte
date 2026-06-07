<script lang="ts">
	import type { SheetViewport } from '../../types'
	import type { RackConfig, DeviceConfig, RackSettings, RoomObject, RackRow, RackFace } from './types'
	import { RU_HEIGHT_MM, RACK_19IN_MM, RACK_19IN_INNER, RACK_GAP_MM, DEVICE_TYPE_COLORS, DEFAULT_SETTINGS } from './colors'

	let {
		racks = [], devices = [], settings = null, roomObjects = [], rows = [], face = 'front',
		rowId = undefined, showWalls = false, colorDevices = true, vp, onview,
	}: {
		racks?: RackConfig[]
		devices?: DeviceConfig[]
		settings?: RackSettings | null
		roomObjects?: RoomObject[]
		rows?: RackRow[]
		face?: RackFace
		rowId?: string
		showWalls?: boolean
		colorDevices?: boolean
		vp: SheetViewport
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()

	const PT_TO_MM = 25.4 / 72
	let cfg = $derived(settings ?? DEFAULT_SETTINGS)
	let scopedRacks = $derived(rowId ? racks.filter(r => r.rowId === rowId) : racks)

	// ── Elevation layout (racks side-by-side by order; rear reverses order) ──
	let elevRacks = $derived.by(() => {
		if (face === 'plan') return []
		const sorted = [...scopedRacks].sort((a, b) => a.order - b.order)
		const ordered = face === 'rear' ? [...sorted].reverse() : sorted
		let x = 0
		return ordered.map(rack => { const o = { rack, x, z: cfg.floorLevel }; x += rack.widthMm + RACK_GAP_MM; return o })
	})
	let elevById = $derived(new Map(elevRacks.map(e => [e.rack.id, e])))
	let topZ = $derived.by(() => {
		let m = cfg.ceilingLevel
		for (const e of elevRacks) m = Math.max(m, e.z + e.rack.heightMm)
		return m + 200
	})
	const Y = (z: number) => topZ - z
	let lastRight = $derived(elevRacks.length ? elevRacks[elevRacks.length - 1].x + elevRacks[elevRacks.length - 1].rack.widthMm : 480)

	function devOpacity(d: DeviceConfig): number {
		const m = d.mounting ?? 'both'
		if (m === 'both' || m === 'none') return 1
		return m === face ? 1 : 0.4
	}

	// ── Plan layout ──
	function rowRacks(row: RackRow) {
		const items = racks.filter(r => r.rowId === row.id).sort((a, b) => a.order - b.order)
		const nonVcm = items.filter(r => r.type !== 'vcm')
		const frontDepth = (nonVcm.length ? nonVcm : items).reduce((m, r) => Math.max(m, r.depthMm), 0)
		let x = 0
		const placed = items.map(r => { const o = { rack: r, x, y: frontDepth - r.depthMm }; x += r.widthMm + RACK_GAP_MM; return o })
		const width = items.reduce((s, r) => s + r.widthMm + RACK_GAP_MM, 0) - (items.length ? RACK_GAP_MM : 0)
		return { placed, width, depth: frontDepth }
	}
	let planRows = $derived.by(() => {
		if (face !== 'plan') return []
		const scoped = rowId ? rows.filter(r => r.id === rowId) : rows
		return scoped.map(row => ({ row, origin: row.plan?.originMm ?? { x: 0, y: 0 }, rot: row.plan?.rotationDeg ?? 0, ...rowRacks(row) }))
	})

	// ── Content bounds (real-mm) ──
	let bounds = $derived.by(() => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		const ext = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
		if (face === 'plan') {
			for (const pr of planRows) {
				const rad = (pr.rot * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad)
				for (const [lx, ly] of [[0, 0], [pr.width, 0], [0, pr.depth], [pr.width, pr.depth]] as const) ext(lx * cs - ly * sn + pr.origin.x, lx * sn + ly * cs + pr.origin.y)
			}
			for (const o of roomObjects) {
				ext(o.position.x, o.position.y)
				if (o.endPosition) ext(o.endPosition.x, o.endPosition.y)
				if (o.widthMm && o.depthMm) ext(o.position.x + o.widthMm, o.position.y + o.depthMm)
			}
		} else {
			ext(0, 0); ext(lastRight, topZ - cfg.slabLevel)
			ext(0, Y(cfg.ceilingLevel)); ext(lastRight, Y(cfg.floorLevel))
			if (showWalls) { ext(cfg.leftWallX - 50, Y(cfg.ceilingLevel)); ext(cfg.rightWallX + 50, Y(cfg.slabLevel)) }
		}
		if (!isFinite(minX)) return { x: 0, y: 0, w: 2000, h: 2000 }
		const padX = (maxX - minX) * 0.04 || 200, padY = (maxY - minY) * 0.04 || 200
		return { x: minX - padX, y: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 }
	})

	let fit = $derived(!vp.scale || vp.scale <= 0)
	let vb = $derived.by(() => {
		if (fit) return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
		const s = vp.scale as number
		return { x: vp.contentOffsetMm?.x ?? bounds.x, y: vp.contentOffsetMm?.y ?? bounds.y, w: vp.w * s, h: vp.h * s }
	})
	let den = $derived(fit ? (vp.w > 0 && vp.h > 0 ? Math.max(bounds.w / vp.w, bounds.h / vp.h) : 0) : (vp.scale as number))
	let viewBox = $derived(`${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
	let par = $derived(fit ? 'xMidYMid meet' : 'xMinYMin meet')
	$effect(() => { onview?.({ ...vb, den }) })

	// Fonts sized in points * den → constant on-screen size during zoom (no roll), correct on paper.
	let rackLabelMm = $derived(8 * PT_TO_MM * den)
	let deviceLabelMm = $derived(6 * PT_TO_MM * den)
	let ruLabelMm = $derived(3.5 * PT_TO_MM * den)
	let planLabelMm = $derived(6 * PT_TO_MM * den)

	// Only standard racks carry a 19" RU area; VCMs / desks / shelves don't get RU numbers.
	const hasRU = (t: string) => t === '2-post' || t === '4-post' || t === 'cabinet'
</script>

<svg class="h-full w-full" {viewBox} preserveAspectRatio={par} style:overflow="hidden">
	{#if face === 'plan'}
		{#each roomObjects as o (o.id)}
			{@const stroke = o.color ?? '#64748b'}
			{#if o.kind === 'wall' && o.endPosition}
				<line x1={o.position.x} y1={o.position.y} x2={o.endPosition.x} y2={o.endPosition.y} stroke={stroke} stroke-width={o.thicknessMm ?? 100} stroke-linecap="butt" />
			{:else if o.kind === 'door'}
				{@const w = o.widthMm ?? 900}
				{@const d = o.depthMm ?? 100}
				{@const sweep = o.swing === 'right' ? 0 : 1}
				{@const sgn = o.swing === 'right' ? -1 : 1}
				<g transform="translate({o.position.x} {o.position.y}) rotate({o.rotationDeg ?? 0})">
					<rect x="0" y="0" width={w} height={d} fill="none" stroke={stroke} stroke-width="40" />
					<path d="M 0 0 L {w} 0 A {w} {w} 0 0 {sweep} 0 {sgn * w} Z" fill="none" stroke={stroke} stroke-width="20" stroke-dasharray="50 50" opacity="0.6" />
				</g>
			{:else if o.kind === 'rect'}
				{@const w = o.widthMm ?? 100}
				{@const d = o.depthMm ?? 100}
				<rect x={o.position.x} y={o.position.y} width={w} height={d} fill={o.color ?? 'rgba(148,163,184,0.25)'} stroke={stroke} stroke-width={o.thicknessMm ?? 30} />
				{#if o.label}<text x={o.position.x + w / 2} y={o.position.y + d / 2} text-anchor="middle" dominant-baseline="middle" font-size={Math.min(w, d) / 6} fill="#475569">{o.label}</text>{/if}
			{/if}
		{/each}

		{#each planRows as pr (pr.row.id)}
			<g transform="translate({pr.origin.x} {pr.origin.y}) rotate({pr.rot})">
				{#each pr.placed as { rack, x, y } (rack.id)}
					<g>
						<rect {x} {y} width={rack.widthMm} height={rack.depthMm} fill="white" stroke="#333" stroke-width="0.4" vector-effect="non-scaling-stroke" stroke-dasharray={rack.type === 'vcm' ? '20 12' : undefined} />
						<text x={x + rack.widthMm / 2} y={y + rack.depthMm / 2} text-anchor="middle" dominant-baseline="middle" font-size={planLabelMm} fill="#333">{rack.label}</text>
					</g>
				{/each}
				{#if pr.width > 0}
					<line x1="0" y1={pr.depth} x2={pr.width} y2={pr.depth} stroke="#555" stroke-width="0.4" vector-effect="non-scaling-stroke" />
				{/if}
			</g>
		{/each}
	{:else}
		<!-- Room shell (slab / ceiling / walls) when enabled -->
		{#if showWalls}
			{@const rx0 = cfg.leftWallX - 50}
			{@const rw = (cfg.rightWallX + 50) - (cfg.leftWallX - 50)}
			<!-- structural slab below the raised floor -->
			<rect x={rx0} y={Y(cfg.slabLevel)} width={rw} height={100} fill="#e5e7eb" stroke="#94a3b8" stroke-width="0.4" vector-effect="non-scaling-stroke" />
			<!-- ceiling slab -->
			<rect x={rx0} y={Y(cfg.ceilingLevel + 100)} width={rw} height={100} fill="#e5e7eb" stroke="#94a3b8" stroke-width="0.4" vector-effect="non-scaling-stroke" />
			<!-- side walls -->
			<rect x={cfg.leftWallX - 50} y={Y(cfg.ceilingLevel)} width={50} height={cfg.ceilingLevel - cfg.slabLevel} fill="#0000000d" stroke="#94a3b8" stroke-width="0.4" vector-effect="non-scaling-stroke" />
			<rect x={cfg.rightWallX} y={Y(cfg.ceilingLevel)} width={50} height={cfg.ceilingLevel - cfg.slabLevel} fill="#0000000d" stroke="#94a3b8" stroke-width="0.4" vector-effect="non-scaling-stroke" />
		{/if}

		<!-- Floor + ceiling reference lines -->
		<line x1={bounds.x} y1={Y(cfg.floorLevel)} x2={bounds.x + bounds.w} y2={Y(cfg.floorLevel)} stroke="#94a3b8" stroke-width="0.5" vector-effect="non-scaling-stroke" />
		<line x1={bounds.x} y1={Y(cfg.ceilingLevel)} x2={bounds.x + bounds.w} y2={Y(cfg.ceilingLevel)} stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" />

		<!-- Rack frames + RU numbers -->
		{#each elevRacks as { rack, x, z } (rack.id)}
			{@const innerX = x + (rack.widthMm - RACK_19IN_INNER) / 2}
			<rect {x} y={Y(z + rack.heightMm)} width={rack.widthMm} height={rack.heightMm} fill="white" stroke="#333" stroke-width="0.4" vector-effect="non-scaling-stroke" />
			{#if hasRU(rack.type)}
				<rect x={innerX} y={Y(z + (rack.heightU + 1) * RU_HEIGHT_MM)} width={RACK_19IN_INNER} height={rack.heightU * RU_HEIGHT_MM} fill="none" stroke="#bbb" stroke-width="0.3" vector-effect="non-scaling-stroke" />
				{#each Array.from({ length: rack.heightU }) as _, i (i)}
					{@const u = i + 1}
					{@const yc = Y(z + u * RU_HEIGHT_MM + RU_HEIGHT_MM / 2)}
					<text x={innerX - 25} y={yc} text-anchor="end" dominant-baseline="middle" font-size={ruLabelMm} fill="#aaa" font-family="monospace">{u}</text>
					<text x={innerX + RACK_19IN_INNER + 25} y={yc} text-anchor="start" dominant-baseline="middle" font-size={ruLabelMm} fill="#aaa" font-family="monospace">{u}</text>
				{/each}
			{/if}
			<text x={x + rack.widthMm / 2} y={Y(z + rack.heightMm) - rackLabelMm * 0.4} text-anchor="middle" font-size={rackLabelMm} fill="#333" font-weight="bold">{rack.label}</text>
		{/each}

		<!-- Devices -->
		{#each devices as d (d.id)}
			{@const e = elevById.get(d.rackId)}
			{#if e}
				{@const devW = d.widthMm ?? RACK_19IN_MM}
				{@const ox = (d.offsetX ?? 0) * (face === 'rear' ? -1 : 1)}
				{@const dx = e.x + e.rack.widthMm / 2 - devW / 2 + ox}
				{@const dyTop = Y(e.z + (d.positionU + d.heightU) * RU_HEIGHT_MM)}
				{@const dh = d.heightU * RU_HEIGHT_MM}
				{@const color = d.color ?? DEVICE_TYPE_COLORS[d.type] ?? '#6b7280'}
				{@const cx = dx + devW / 2}
				{@const cy = dyTop + dh / 2}
				{@const rotated = d.type === 'pdu' || (d.widthMm ?? RACK_19IN_MM) <= 150}
				{@const text = `${d.label}${d.portCount > 7 ? ` (${d.portCount})` : ''}`}
				<g opacity={devOpacity(d)}>
					{#if colorDevices}
						<rect x={dx} y={dyTop} width={devW} height={dh} fill="{color}33" stroke={color} stroke-width="0.5" vector-effect="non-scaling-stroke" />
					{:else}
						<rect x={dx} y={dyTop} width={devW} height={dh} fill="white" stroke="#888" stroke-width="0.4" vector-effect="non-scaling-stroke" />
					{/if}
					{#if rotated}
						<!-- Narrow devices (PDUs etc.): label runs bottom-to-top so it fits. -->
						<text x={cx} y={cy} transform="rotate(-90 {cx} {cy})" text-anchor="middle" dominant-baseline="middle" font-size={deviceLabelMm} fill="#374151">{text}</text>
					{:else}
						<text x={dx + devW * 0.04} y={cy} dominant-baseline="middle" font-size={deviceLabelMm} fill="#374151">{text}</text>
					{/if}
				</g>
			{/if}
		{/each}
	{/if}
</svg>
