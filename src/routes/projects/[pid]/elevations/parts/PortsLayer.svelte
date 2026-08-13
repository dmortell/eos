<script lang="ts">
	/**
	 * LOD ports layer — draws port grids inside panel devices as SVG overlays
	 * in mm-accurate geometry (elevations-plan.md §3.3). Level of detail keys
	 * off the on-screen cell width:
	 *   ≥ 4px   cells + usage tint + reservation bars
	 *   ≥ 10px  cells become clickable (select port)
	 *   ≥ 16px  2-line short label   (001 / A01)
	 *   ≥ 24px  3-line full label    (L01.A / 001 / A01)
	 * SVG text is vector — crisp at every zoom. Tooltips always carry the
	 * full label. Cells stopPropagation on mousedown so the panel's Draggable
	 * underneath doesn't start a drag from a port click.
	 */
	import type { ElevationsEditor } from '../editor.svelte'
	import type { DeviceConfig, RackConfig } from '../../racks/parts/types'
	import { SCALE, RU_HEIGHT_MM, RACK_19IN_MM } from '../../racks/parts/constants'
	import { matchesFace } from '$lib/elevation/portmap'
	import { PORT_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'

	let { editor }: { editor: ElevationsEditor } = $props()

	let zoom = $derived(editor.view.zoom)
	let rackList = $derived(editor.face === 'rear' ? editor.rearRacks : editor.activeRacks)

	/** Panels visible on the current face, in racks of the active row. */
	let panels = $derived.by(() => {
		const rackById = new Map(rackList.map(r => [r.id, r]))
		return editor.devices.filter(d =>
			d.type === 'panel' && (d.portCount ?? 0) > 0 && rackById.has(d.rackId) && matchesFace(d, editor.face)
		).map(d => ({ device: d, rack: rackById.get(d.rackId)! }))
	})

	function deviceRect(device: DeviceConfig, rack: RackConfig & { _x: number; _z: number }) {
		const rackLeft = rack._x * SCALE
		const rackTop = (editor.view.bottom - rack._z - rack.heightMm) * SCALE
		const rackW = rack.widthMm * SCALE
		const rackH = rack.heightMm * SCALE
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
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
	}

	function cellsFor(device: DeviceConfig, rack: RackConfig): Cell[] {
		const rect = { w: (device.widthMm ?? RACK_19IN_MM) * SCALE, h: device.heightU * RU_HEIGHT_MM * SCALE }
		const count = device.portCount ?? 0
		const rows = count > 24 ? 2 : 1
		const cols = Math.min(count, 24)
		const padX = 2, padY = 1.5
		const cw = (rect.w - padX * 2) / cols
		const ch = (rect.h - padY * 2) / rows
		const cells: Cell[] = []
		for (let i = 0; i < count; i++) {
			const row = i < 24 ? 0 : 1
			const col = i % 24
			const info = editor.portInfo.get(`${device.id}:${i + 1}`)
			const resKey = `${rack.id}:${device.positionU}:${row === 0 ? 'top' : 'bottom'}:${col}`
			cells.push({
				x: padX + col * cw, y: padY + row * ch, w: cw - 0.5, h: ch - 0.5,
				index: i + 1,
				row: row === 0 ? 'top' : 'bottom',
				col,
				label: info?.label,
				locationType: info?.locationType,
				reservation: editor.reservationMap.get(resKey),
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

	function cellFill(c: Cell): string {
		if (c.label) return (PORT_TYPE_COLORS[c.locationType ?? ''] ?? '#9ca3af') + '4D'
		if (c.reservation) return (PORT_TYPE_COLORS[c.reservation] ?? '#9ca3af') + '33'
		return '#f3f4f6'
	}

	function tooltip(c: Cell, device: DeviceConfig): string {
		const lines = [c.label ?? `Port ${c.index} — unlabeled`]
		if (c.locationType) lines.push(LOC_TYPE_LABELS[c.locationType] ?? c.locationType)
		if (c.reservation) lines.push(`Reserved: ${c.reservation}`)
		lines.push(`${device.label} · port ${c.index}`)
		return lines.join('\n')
	}

	let selectedKey = $derived(editor.selectedPort ? `${editor.selectedPort.deviceId}:${editor.selectedPort.portIndex}` : null)
</script>

{#if zoom * SCALE * (RACK_19IN_MM / 24) >= 4}
	{#each panels as { device, rack } (device.id)}
		{@const rect = deviceRect(device, rack)}
		{@const cells = cellsFor(device, rack)}
		{@const cw = cells[0]?.w ?? 0}
		{@const l = lod(cw)}
		{@const rows = (device.portCount ?? 0) > 24 ? 2 : 1}
		{@const ch = cells[0]?.h ?? 0}
		<svg
			class="absolute overflow-visible"
			style:left="{rect.left}px" style:top="{rect.top}px"
			style:z-index="3"
			style:pointer-events="none"
			width={rect.width} height={rect.height}>
			{#each cells as c (c.index)}
				{@const isSel = selectedKey === `${device.id}:${c.index}`}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				{@const conn = editor.portConnMap.get(`${device.id}:${c.index}`)}
				{@const isArmed = editor.patchArm?.deviceId === device.id && editor.patchArm?.portIndex === c.index}
				{@const patchBlocked = editor.mode === 'patch' && !c.label && !conn}
				<g
					style:pointer-events={l.interactive ? 'all' : 'none'}
					style:cursor={l.interactive ? (patchBlocked ? 'not-allowed' : 'pointer') : 'default'}
					onmousedown={e => { if (l.interactive && e.button === 0) { e.stopPropagation(); e.preventDefault() } }}
					onclick={e => {
						if (!l.interactive) return
						e.stopPropagation()
						editor.handlePortClick(rack.id, device.id, c.index)
					}}>
					<title>{tooltip(c, device)}</title>
					<rect x={c.x} y={c.y} width={c.w} height={c.h} rx={0.8}
						fill={cellFill(c)}
						fill-opacity={patchBlocked ? 0.35 : 1}
						stroke={isArmed ? '#22c55e' : isSel ? '#3b82f6' : c.label ? '#9ca3af80' : '#d1d5db'}
						stroke-width={isArmed || isSel ? 2 / zoom : 0.5 / zoom}
						stroke-dasharray={!c.label && c.reservation ? '2 1.5' : undefined} />
					{#if conn}
						<circle cx={c.x + c.w / 2} cy={c.y + c.h - Math.min(2, c.h * 0.15)}
							r={Math.min(1.6, c.w * 0.12)}
							fill={conn.cableColor || '#3b82f6'}
							stroke={editor.duplicatePorts.has(`${device.id}:${c.index}`) ? '#ef4444' : 'white'}
							stroke-width={0.4} />
					{/if}
					{#if c.reservation && c.label}
						<rect x={c.x} y={c.y} width={c.w} height={Math.min(1.5, c.h * 0.12)}
							fill={PORT_TYPE_COLORS[c.reservation] ?? '#9ca3af'} />
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
					{:else if l.labels > 0 && c.reservation}
						<text x={c.x + c.w / 2} y={c.y + c.h / 2 + 2}
							text-anchor="middle" font-family="ui-monospace, monospace"
							font-size={Math.min(c.w / 2, ch / 2.5)} fill="#6b7280" opacity="0.7"
							style:pointer-events="none">{c.reservation}</text>
					{/if}
				</g>
			{/each}
		</svg>
	{/each}
{/if}
