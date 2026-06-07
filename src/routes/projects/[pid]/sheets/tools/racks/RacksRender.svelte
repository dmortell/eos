<script lang="ts">
	import type { SheetViewport } from '../../types'
	import type { RackConfig, DeviceConfig, RackSettings, RoomObject, RackRow, RackFace } from './types'
	import { RU_HEIGHT_MM, RACK_19IN_MM, RACK_19IN_INNER, RACK_GAP_MM, DEVICE_TYPE_COLORS, RACK_STYLE, DEFAULT_SETTINGS } from './colors'

	let {
		racks = [], devices = [], settings = null, roomObjects = [], rows = [], face = 'front', vp,
	}: {
		racks?: RackConfig[]
		devices?: DeviceConfig[]
		settings?: RackSettings | null
		roomObjects?: RoomObject[]
		rows?: RackRow[]
		face?: RackFace
		vp: SheetViewport
	} = $props()

	let cfg = $derived(settings ?? DEFAULT_SETTINGS)

	// ── Elevation layout (racks side-by-side by order; rear reverses order) ──
	let elevRacks = $derived.by(() => {
		if (face === 'plan') return []
		const sorted = [...racks].sort((a, b) => a.order - b.order)
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
	const Y = (z: number) => topZ - z // world z (up) → SVG y (down)
	let lastRight = $derived(elevRacks.length ? elevRacks[elevRacks.length - 1].x + elevRacks[elevRacks.length - 1].rack.widthMm : 480)

	function devOpacity(d: DeviceConfig): number {
		const m = d.mounting ?? 'both'
		if (m === 'both' || m === 'none') return 1
		return m === face ? 1 : 0.4
	}

	// ── Plan layout (rows at originMm + rotation; racks within a row by order) ──
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
		return rows.map(row => ({ row, origin: row.plan?.originMm ?? { x: 0, y: 0 }, rot: row.plan?.rotationDeg ?? 0, ...rowRacks(row) }))
	})

	// ── Content bounds (real-mm) for fit + default offset ──
	let bounds = $derived.by(() => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		const ext = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
		if (face === 'plan') {
			for (const pr of planRows) {
				const rad = (pr.rot * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad)
				for (const [lx, ly] of [[0, 0], [pr.width, 0], [0, pr.depth], [pr.width, pr.depth]] as const) {
					ext(lx * cs - ly * sn + pr.origin.x, lx * sn + ly * cs + pr.origin.y)
				}
			}
			for (const o of roomObjects) {
				ext(o.position.x, o.position.y)
				if (o.endPosition) ext(o.endPosition.x, o.endPosition.y)
				if (o.widthMm && o.depthMm) ext(o.position.x + o.widthMm, o.position.y + o.depthMm)
			}
		} else {
			ext(0, 0); ext(lastRight, topZ - cfg.slabLevel)
			ext(0, Y(cfg.ceilingLevel)); ext(lastRight, Y(cfg.floorLevel))
		}
		if (!isFinite(minX)) return { x: 0, y: 0, w: 2000, h: 2000 }
		const padX = (maxX - minX) * 0.04 || 200, padY = (maxY - minY) * 0.04 || 200
		return { x: minX - padX, y: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 }
	})

	let fit = $derived(!vp.scale || vp.scale <= 0)
	let viewBox = $derived.by(() => {
		if (fit) return `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
		const s = vp.scale as number
		const ox = vp.contentOffsetMm?.x ?? bounds.x
		const oy = vp.contentOffsetMm?.y ?? bounds.y
		return `${ox} ${oy} ${vp.w * s} ${vp.h * s}`
	})
	let par = $derived(fit ? 'xMidYMid meet' : 'xMinYMin meet')

	function rackStyle(r: RackConfig) { return RACK_STYLE[r.type] ?? RACK_STYLE['2-post'] }
</script>

<svg class="h-full w-full" {viewBox} preserveAspectRatio={par} style:overflow="hidden">
	{#if face === 'plan'}
		<!-- Room objects (room-relative mm) -->
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
				{#if o.label}
					<text x={o.position.x + w / 2} y={o.position.y + d / 2} text-anchor="middle" dominant-baseline="middle" font-size={Math.min(w, d) / 6} fill="#475569">{o.label}</text>
				{/if}
			{/if}
		{/each}

		<!-- Rows + rack footprints -->
		{#each planRows as pr (pr.row.id)}
			<g transform="translate({pr.origin.x} {pr.origin.y}) rotate({pr.rot})">
				{#each pr.placed as { rack, x, y } (rack.id)}
					{@const s = rackStyle(rack)}
					<g>
						<rect {x} {y} width={rack.widthMm} height={rack.depthMm} fill={s.fill} stroke={s.border} stroke-width="1.5" vector-effect="non-scaling-stroke" />
						<text x={x + rack.widthMm / 2} y={y + rack.depthMm / 2} text-anchor="middle" dominant-baseline="middle" font-size={Math.min(rack.widthMm, rack.depthMm) * 0.4} fill={s.text} font-weight="bold">{rack.label}</text>
					</g>
				{/each}
				{#if pr.width > 0}
					<!-- front-edge indicator -->
					<line x1="0" y1={pr.depth} x2={pr.width} y2={pr.depth} stroke="#2563eb" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity="0.7" />
				{/if}
			</g>
		{/each}
	{:else}
		<!-- Elevation: floor + ceiling reference lines -->
		<line x1={bounds.x} y1={Y(cfg.floorLevel)} x2={bounds.x + bounds.w} y2={Y(cfg.floorLevel)} stroke="#94a3b8" stroke-width="0.75" vector-effect="non-scaling-stroke" />
		<line x1={bounds.x} y1={Y(cfg.ceilingLevel)} x2={bounds.x + bounds.w} y2={Y(cfg.ceilingLevel)} stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" />

		<!-- Rack frames -->
		{#each elevRacks as { rack, x, z } (rack.id)}
			{@const innerX = x + (rack.widthMm - RACK_19IN_INNER) / 2}
			<rect {x} y={Y(z + rack.heightMm)} width={rack.widthMm} height={rack.heightMm} fill="white" stroke="#333" stroke-width="1.25" vector-effect="non-scaling-stroke" />
			<rect x={innerX} y={Y(z + (rack.heightU + 1) * RU_HEIGHT_MM)} width={RACK_19IN_INNER} height={rack.heightU * RU_HEIGHT_MM} fill="none" stroke="#bbb" stroke-width="0.75" vector-effect="non-scaling-stroke" />
			<text x={x + rack.widthMm / 2} y={Y(z + rack.heightMm) - 40} text-anchor="middle" font-size="140" fill="#333" font-weight="bold">{rack.label}</text>
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
				<g opacity={devOpacity(d)}>
					<rect x={dx} y={dyTop} width={devW} height={dh} fill="{color}33" stroke={color} stroke-width="1" vector-effect="non-scaling-stroke" />
					<text x={dx + 30} y={dyTop + dh / 2} dominant-baseline="middle" font-size={Math.min(dh * 0.55, 130)} fill="#1f2937">{d.label}{d.portCount > 7 ? ` (${d.portCount})` : ''}</text>
				</g>
			{/if}
		{/each}
	{/if}
</svg>
