<script lang="ts">
	/**
	 * Patch-cord overlay in mm-accurate canvas space (elevations-plan.md §3.4).
	 * Orthogonal routes: port → short drop → nearest side channel (the gap at
	 * the rack edge) → vertical run → transit toward the other rack → re-enter.
	 * Zoom-invariant strokes; a wide transparent twin path carries the hit
	 * area. Dashed = not yet installed. Selecting a cord dims the others.
	 * Also draws the rubber band from the armed port to the cursor.
	 */
	import type { ElevationsEditor } from '../editor.svelte'
	import type { PatchConnection, PortRef } from '../../patching/parts/types'
	import { getCableType } from '../../patching/parts/constants'
	import { SCALE, RU_HEIGHT_MM, DEVICE_W_MM } from '../../racks/parts/constants'

	let { editor }: { editor: ElevationsEditor } = $props()

	let zoom = $derived(editor.view.zoom)
	let rackList = $derived(editor.face === 'rear' ? editor.rearRacks : editor.activeRacks)
	let rackById = $derived(new Map(rackList.map(r => [r.id, r])))
	let deviceById = $derived(new Map(editor.devices.map(d => [d.id, d])))

	const CHANNEL_PX = 6 // channel offset outside the rack edge (canvas px ≈ 12mm)

	/** Anchor = bottom-center of the port cell, in unscaled canvas px. */
	function anchor(ref: PortRef) {
		const rack = rackById.get(ref.rackId)
		const device = deviceById.get(ref.deviceId)
		if (!rack || !device) return null
		const rackLeft = rack._x * SCALE
		const rackTop = (editor.view.bottom - rack._z - rack.heightMm) * SCALE
		const rackW = rack.widthMm * SCALE
		const rackH = rack.heightMm * SCALE
		const devW = (device.widthMm ?? DEVICE_W_MM) * SCALE
		const ox = (device.offsetX ?? 0) * SCALE * (editor.face === 'rear' ? -1 : 1)
		const devLeft = rackLeft + (rackW - devW) / 2 + ox
		const ruBottom = rackTop + rackH - device.positionU * RU_HEIGHT_MM * SCALE
		const devTop = ruBottom - device.heightU * RU_HEIGHT_MM * SCALE
		const devH = device.heightU * RU_HEIGHT_MM * SCALE

		const count = device.portCount ?? 24
		const rows = count > 24 ? 2 : 1
		const cols = Math.min(count, 24)
		const padX = 2, padY = 1.5
		const cw = (devW - padX * 2) / cols
		const ch = (devH - padY * 2) / rows
		const i = ref.portIndex - 1
		const row = i < 24 ? 0 : 1
		const col = i % 24
		return {
			x: devLeft + padX + col * cw + cw / 2,
			y: devTop + padY + row * ch + ch - 0.5,
			col, cols,
			rackLeft, rackRight: rackLeft + rackW, rackBottom: rackTop + rackH,
		}
	}

	/** Nearest side-channel x for an anchor (just outside the rack edge). */
	function channelX(a: NonNullable<ReturnType<typeof anchor>>, towards?: number): number {
		if (towards !== undefined) {
			// exit the side facing the other endpoint
			return towards > (a.rackLeft + a.rackRight) / 2 ? a.rackRight + CHANNEL_PX : a.rackLeft - CHANNEL_PX
		}
		return a.col < a.cols / 2 ? a.rackLeft - CHANNEL_PX : a.rackRight + CHANNEL_PX
	}

	function route(c: PatchConnection): string | null {
		const a = anchor(c.fromPortRef)
		const b = anchor(c.toPortRef)
		if (!a || !b) return null
		const drop = 2.5
		if (c.fromPortRef.rackId === c.toPortRef.rackId) {
			// Same rack: out to the nearest shared channel, vertical, back in
			const ch = channelX(a)
			return `M ${a.x} ${a.y} V ${a.y + drop} H ${ch} V ${b.y + drop} H ${b.x} V ${b.y}`
		}
		// Cross rack: exit facing channels, transit at the mid Y between the two
		const chA = channelX(a, b.x)
		const chB = channelX(b, a.x)
		const midY = (a.y + b.y) / 2
		return `M ${a.x} ${a.y} V ${a.y + drop} H ${chA} V ${midY} H ${chB} V ${b.y + drop} H ${b.x} V ${b.y}`
	}

	let armAnchor = $derived(editor.patchArm ? anchor(editor.patchArm) : null)

	function cordColor(c: PatchConnection): string {
		return c.cableColor || getCableType(c.cableType, editor.customCableTypes).color
	}
</script>

<svg class="absolute inset-0 overflow-visible" style:z-index="5" style:pointer-events="none"
	width={editor.view.width} height={editor.view.height}>
	{#each editor.elevationConnections as c (c.id)}
		{@const d = route(c)}
		{#if d}
			{@const selected = editor.selectedConnectionId === c.id}
			{@const dimmed = editor.selectedConnectionId !== null && !selected}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g>
				<path {d} fill="none" stroke="transparent" stroke-width={10 / zoom}
					style:pointer-events="stroke" style:cursor="pointer"
					onmousedown={e => { if (e.button === 0) { e.stopPropagation(); e.preventDefault() } }}
					onclick={e => { e.stopPropagation(); editor.selectConnection(c.id) }}>
					<title>{c.cableType} · {c.lengthMeters}m · {c.status}</title>
				</path>
				<path {d} fill="none"
					stroke={cordColor(c)}
					stroke-width={(selected ? 2.5 : 1.5) / zoom}
					stroke-dasharray={c.status !== 'installed' ? `${4 / zoom} ${3 / zoom}` : undefined}
					opacity={dimmed ? 0.12 : selected ? 1 : 0.65}
					style:pointer-events="none" />
			</g>
		{/if}
	{/each}

	{#if armAnchor}
		<circle cx={armAnchor.x} cy={armAnchor.y} r={4 / zoom} fill="none" stroke="#22c55e" stroke-width={2 / zoom} />
		{#if editor.cursor}
			<line x1={armAnchor.x} y1={armAnchor.y} x2={editor.cursor.x} y2={editor.cursor.y}
				stroke="#22c55e" stroke-width={1.5 / zoom} stroke-dasharray={`${5 / zoom} ${4 / zoom}`} opacity="0.8" />
		{/if}
	{/if}
</svg>
