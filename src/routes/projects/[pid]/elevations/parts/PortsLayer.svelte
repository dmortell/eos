<script lang="ts">
	/**
	 * LOD ports layer — draws port grids inside panel devices as SVG overlays
	 * in mm-accurate geometry (elevations-plan.md §3.3). Level of detail keys
	 * off the on-screen cell width:
	 *   ≥ 4px   cells + usage tint + reservation bars
	 *   ≥ 10px  cells become clickable (select/patch/reserve)
	 *   ≥ 16px  2-line short label   (001 / A01)
	 *   ≥ 24px  3-line full label    (L01.A / 001 / A01)
	 * The panel's own label is ALWAYS readable: constant-screen-size text over
	 * the tint grid at mid zoom, and a faded side tag once port labels take
	 * over (hostnames/panel names stay visible while patching). Panels on the
	 * opposite face still get a (more faded) label, but no interactive cells.
	 * Block selection: Ctrl+click toggles a port, Shift+click extends a range.
	 */
	import type { ElevationsEditor } from '../editor.svelte'
	import type { DeviceConfig, RackConfig } from '../../racks/parts/types'
	import { SCALE, RU_HEIGHT_MM, DEVICE_W_MM } from '../../racks/parts/constants'
	import { matchesFace } from '$lib/elevation/portmap'
	import { PORT_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'
	import { portCellLayout, portCellRect } from './portGeometry'

	let { editor }: { editor: ElevationsEditor } = $props()

	let zoom = $derived(editor.view.zoom)
	let rackList = $derived(editor.face === 'rear' ? editor.rearRacks : editor.activeRacks)

	/** All port-bearing devices (panels, switches, servers…) in racks of the
	 *  active row — off-face ones get a label only. Non-panel ports have no
	 *  frames labels; they're identified by port number and always patchable. */
	let panels = $derived.by(() => {
		const rackById = new Map(rackList.map(r => [r.id, r]))
		return editor.devices.filter(d =>
			(d.portCount ?? 0) > 0 && rackById.has(d.rackId)
		).map(d => ({ device: d, rack: rackById.get(d.rackId)!, onFace: matchesFace(d, editor.face) }))
	})

	function deviceRect(device: DeviceConfig, rack: RackConfig & { _x: number; _z: number }) {
		const rackLeft = rack._x * SCALE
		const rackTop = (editor.view.bottom - rack._z - rack.heightMm) * SCALE
		const rackW = rack.widthMm * SCALE
		const rackH = rack.heightMm * SCALE
		const devW = (device.widthMm ?? DEVICE_W_MM) * SCALE
		const ox = (device.offsetX ?? 0) * SCALE * (editor.face === 'rear' ? -1 : 1)
		const ruBottom = rackTop + rackH - device.positionU * RU_HEIGHT_MM * SCALE
		return {
			left: rackLeft + (rackW - devW) / 2 + ox,
			top: ruBottom - device.heightU * RU_HEIGHT_MM * SCALE,
			width: devW,
			height: device.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	/** Split a joined label into stacked lines. `L01.A.001-A01-H` → [L01.A, 001, A01-H]. */
	function stackParts(label: string): string[] {
		const parts = label.split(/[.\-]/)
		if (parts[parts.length - 1] === 'H' && parts.length > 1) {
			parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]}-H`)
		}
		if (parts.length >= 4) return [`${parts[0]}.${parts[1]}`, parts[2], parts.slice(3).join('-')]
		return parts
	}

	interface Cell {
		x: number; y: number; w: number; h: number
		index: number            // 1-based port index
		row: 'top' | 'bottom'
		col: number
		label?: string
		locationType?: string
		reservation?: string
		pinned?: boolean
	}

	function cellsFor(device: DeviceConfig, rack: RackConfig): Cell[] {
		const layout = portCellLayout(device)
		const count = device.portCount ?? 0
		const cells: Cell[] = []
		// Reservations are POSITION-keyed (rack:RU:row:col) and only steer panel
		// label allocation — never show them on non-panel devices (a server moved
		// onto a previously-reserved RU was rendering stale "desk" marks).
		const isPanel = device.type === 'panel'
		for (let i = 0; i < count; i++) {
			const r = portCellRect(layout, i + 1)
			const info = editor.portInfo.get(`${device.id}:${i + 1}`)
			const resKey = `${rack.id}:${device.positionU}:${r.row === 0 ? 'top' : 'bottom'}:${r.col}`
			cells.push({
				x: r.x, y: r.y, w: r.w, h: r.h,
				index: i + 1,
				row: r.row === 0 ? 'top' : 'bottom',
				col: r.col,
				label: info?.label,
				locationType: info?.locationType,
				reservation: isPanel ? editor.reservationMap.get(resKey) : undefined,
				pinned: info?.pinned,
			})
		}
		return cells
	}

	// LOD thresholds on screen-space cell width
	function lod(cellW: number): { labels: 0 | 2 | 3; interactive: boolean } {
		const sw = cellW * zoom
		return {
			labels: sw >= 24 ? 3 : sw >= 16 ? 2 : 0,
			interactive: sw >= 10,
		}
	}

	function cellFill(c: Cell, isPanel: boolean): string {
		if (c.label) return (PORT_TYPE_COLORS[c.locationType ?? ''] ?? '#9ca3af') + '4D'
		if (c.reservation) return (PORT_TYPE_COLORS[c.reservation] ?? '#9ca3af') + '33'
		return isPanel ? '#f3f4f6' : '#e9eef5'
	}

	function tooltip(c: Cell, device: DeviceConfig): string {
		const lines = [c.label ?? `Port ${c.index} — unlabeled`]
		if (c.locationType) lines.push(LOC_TYPE_LABELS[c.locationType] ?? c.locationType)
		if (c.reservation) lines.push(`Reserved: ${c.reservation}`)
		lines.push(`${device.label} · port ${c.index}`)
		return lines.join('\n')
	}

	let selectedKey = $derived(editor.selectedPort ? `${editor.selectedPort.deviceId}:${editor.selectedPort.portIndex}` : null)

	// ── Ctrl+drag paint-selection across cells ──
	// mousedown adds the cell; dragging over cells (via data-blk hit) adds them;
	// a ctrl+click without movement on an already-selected cell removes it
	// (completing the toggle). The click handler skips its Ctrl branch — paint
	// owns Ctrl entirely.
	let paint: { startKey: string; wasSelected: boolean; moved: boolean } | null = null

	function blkKey(rackId: string, ru: number, portIndex: number): string {
		const row = portIndex <= 24 ? 'top' : 'bottom'
		return `${rackId}:${ru}:${row}:${(portIndex - 1) % 24}`
	}

	function beginPaint(rackId: string, ru: number, portIndex: number) {
		const key = blkKey(rackId, ru, portIndex)
		paint = { startKey: key, wasSelected: editor.hasPortBlockKey(key), moved: false }
		editor.addPortBlockKey(key)
		document.addEventListener('mousemove', paintMove)
		document.addEventListener('mouseup', paintEnd)
	}

	function paintMove(e: MouseEvent) {
		if (!paint) return
		const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null
		const key = el?.closest?.('[data-blk]')?.getAttribute('data-blk')
		if (key && key !== paint.startKey) paint.moved = true
		if (key) editor.addPortBlockKey(key)
	}

	function paintEnd() {
		document.removeEventListener('mousemove', paintMove)
		document.removeEventListener('mouseup', paintEnd)
		if (paint && !paint.moved && paint.wasSelected) editor.removePortBlockKey(paint.startKey)
		paint = null
	}
</script>

{#if editor.viewOpts.ports && zoom * SCALE * (DEVICE_W_MM / 24) >= 4}
	{#each panels as { device, rack, onFace } (device.id)}
		{@const showRes = editor.viewOpts.reservations}
		{@const rect = deviceRect(device, rack)}
		{@const cells = onFace ? cellsFor(device, rack) : []}
		{@const cw = cells[0]?.w ?? (rect.width - 4) / Math.min(device.portCount ?? 24, 24)}
		{@const l = lod(cw)}
		{@const labelFs = Math.min(11 / zoom, rect.height * 0.7)}
		{@const faceNote = onFace ? '' : ` (${device.mounting ?? 'rear'})`}
		{@const sideTag = device.type === 'panel' ? l.labels > 0 : zoom >= 2}
		<svg
			class="absolute overflow-visible"
			style:left="{rect.left}px" style:top="{rect.top}px"
			style:z-index="3"
			style:pointer-events="none"
			width={rect.width} height={rect.height}>
			{#if onFace && l.labels > 0}
				<!-- Opaque backdrop once port labels show: hides the big device label
				     underneath (it read through the translucent tints) and boosts
				     label contrast. -->
				<rect x="0.5" y="0.5" width={rect.width - 1} height={rect.height - 1} fill="white" opacity="0.94" />
			{/if}
			{#each cells as c (c.index)}
				{@const isSel = selectedKey === `${device.id}:${c.index}`}
				{@const conn = editor.portConnMap.get(`${device.id}:${c.index}`)}
				{@const isArmed = editor.patchArm?.deviceId === device.id && editor.patchArm?.portIndex === c.index}
				{@const isBlk = editor.selectedPorts.size > 0 && editor.isPortBlockSelected(rack.id, device.positionU, c.index)}
				{@const patchBlocked = editor.mode === 'patch' && device.type === 'panel' && !c.label && !conn}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g
					data-blk={blkKey(rack.id, device.positionU, c.index)}
					style:pointer-events={l.interactive ? 'all' : 'none'}
					style:cursor={l.interactive ? (patchBlocked ? 'not-allowed' : 'pointer') : 'default'}
					onmousedown={e => {
						if (!l.interactive || e.button !== 0) return
						e.stopPropagation(); e.preventDefault()
						if (e.ctrlKey || e.metaKey) beginPaint(rack.id, device.positionU, c.index)
					}}
					onclick={e => {
						if (!l.interactive) return
						e.stopPropagation()
						if (e.ctrlKey || e.metaKey) return // handled by paint (mousedown/drag)
						if (e.shiftKey) editor.rangePortBlock(rack.id, device.positionU, c.index, device.id)
						else editor.handlePortClick(rack.id, device.id, c.index)
					}}>
					<title>{tooltip(c, device)}</title>
					<rect x={c.x} y={c.y} width={c.w} height={c.h} rx={0.8}
						fill={cellFill(showRes ? c : { ...c, reservation: undefined }, device.type === 'panel')}
						fill-opacity={patchBlocked ? 0.35 : 1}
						stroke={isArmed ? '#22c55e' : isBlk ? '#a855f7' : isSel ? '#3b82f6' : c.label ? '#9ca3af80' : '#d1d5db'}
						stroke-width={isArmed || isSel || isBlk ? 2 / zoom : 0.5 / zoom}
						stroke-dasharray={showRes && !c.label && c.reservation ? '2 1.5' : undefined} />
					{#if conn}
						<circle cx={c.x + c.w / 2} cy={c.y + c.h - Math.min(2, c.h * 0.15)}
							r={Math.min(1.6, c.w * 0.12)}
							fill={conn.cableColor || '#3b82f6'}
							stroke={editor.duplicatePorts.has(`${device.id}:${c.index}`) ? '#ef4444' : 'white'}
							stroke-width={0.4} />
					{/if}
					{#if showRes && c.reservation && c.label}
						<rect x={c.x} y={c.y} width={c.w} height={Math.min(1.5, c.h * 0.12)}
							fill={PORT_TYPE_COLORS[c.reservation] ?? '#9ca3af'} />
					{/if}
					{#if c.pinned}
						<!-- Sticky-pin marker: dark corner triangle -->
						<path d="M {c.x} {c.y} l {Math.min(2.4, c.w * 0.2)} 0 l {-Math.min(2.4, c.w * 0.2)} {Math.min(2.4, c.h * 0.2)} z" fill="#475569" />
					{/if}
					{#if l.labels > 0 && c.label}
						{@const parts = stackParts(c.label)}
						{@const lines = l.labels === 3 ? parts : parts.slice(-2)}
						{@const fs = Math.min(c.w / (0.68 * Math.max(...lines.map(s => s.length))), (c.h - 1) / (lines.length * 1.15))}
						{#each lines as line, li}
							<text
								x={c.x + c.w / 2}
								y={c.y + c.h / 2 + (li - (lines.length - 1) / 2) * fs * 1.12 + fs * 0.35}
								text-anchor="middle"
								font-family="ui-monospace, monospace"
								font-size={fs}
								fill="#374151"
								style:pointer-events="none">{line}</text>
						{/each}
					{:else if showRes && l.labels > 0 && c.reservation}
						<text x={c.x + c.w / 2} y={c.y + c.h / 2 + 2}
							text-anchor="middle" font-family="ui-monospace, monospace"
							font-size={Math.min(c.w / 2, c.h / 2.5)} fill="#6b7280" opacity="0.7"
							style:pointer-events="none">{c.reservation}</text>
					{:else if l.labels > 0}
						<!-- No label (switch ports, unlabeled panel cells): faint port number.
						     Sized for 2 digits regardless of the actual digit count so ports
						     1–9 don't render bigger than 10+. -->
						<text x={c.x + c.w / 2} y={c.y + c.h / 2}
							text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace"
							font-size={Math.min(c.w / (0.68 * 2), c.h / 1.6)}
							fill="#9ca3af" opacity="0.8"
							style:pointer-events="none">{c.index}</text>
					{/if}
				</g>
			{/each}
			<!-- Panel label — drawn ON TOP of the cells so all-unlabeled panels
			     (opaque gray cells) can't paint over it. Off-face devices carry a
			     face indicator so it's obvious why they're inactive. -->
			{#if onFace && sideTag}
				<!-- Side-tag LOD (panels: when port labels render; other devices:
				     flat 200% so few-port devices don't switch at ~50-70%). Faded,
				     top-aligned with the device (RU numbers sit at row centre on
				     the rails — top alignment avoids them). -->
				<text x={-3} y={0.5}
					text-anchor="end" dominant-baseline="hanging"
					font-size={20 / zoom} font-weight="600" fill="#374151" opacity="0.6"
					stroke="white" stroke-width={(20 / zoom) * 0.22} paint-order="stroke"
					style:pointer-events="none">{device.label}</text>
			{:else}
				<!-- Below the side-tag threshold, or opposite face: centered,
				     constant screen size, white halo, semi-transparent so cells
				     stay readable beneath. -->
				<text x={rect.width / 2} y={rect.height / 2}
					text-anchor="middle" dominant-baseline="central"
					font-size={labelFs}
					font-weight="600" fill="#374151" opacity={onFace ? 0.85 : 0.45}
					stroke="white" stroke-width={labelFs * 0.28}
					paint-order="stroke"
					style:pointer-events="none">{device.label}{device.portCount ? ` (${device.portCount})` : ''}{faceNote}</text>
			{/if}
		</svg>
	{/each}
{/if}
