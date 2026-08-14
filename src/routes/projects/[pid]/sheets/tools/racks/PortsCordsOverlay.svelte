<script lang="ts">
	/**
	 * Port grids + patch cords for the sheets racks viewport, drawn in the same
	 * real-mm world space as RacksRender (rendered as its SVG child, under the
	 * annotation layer). Print-oriented: full stacked labels wherever they fit,
	 * no zoom LOD — a sheet is a fixed-scale deliverable (elevations-plan §10).
	 *
	 * Geometry mirrors elevations/parts/portGeometry.ts in mm (cells capped at
	 * 60×40 mm, portAlign placement) and cords mirror the elevations CordsLayer
	 * routing (side channels outside the rack edges).
	 */
	import type { RackConfig, DeviceConfig, RackSettings, RackFace } from './types'
	import { RACK_19IN_MM } from './colors'
	import { buildElevation, deviceBox } from './rack-layout'
	import { PORT_TYPE_COLORS } from '$lib/elevation/loc-colors'
	import type { PortInfo } from '$lib/elevation/portmap'

	let { racks = [], devices = [], settings = null, face = 'front', rowId = undefined, portInfoMap = new Map(), connections = [], showPorts = false, showCords = false }: {
		racks?: RackConfig[]
		devices?: DeviceConfig[]
		settings?: RackSettings | null
		face?: RackFace
		rowId?: string
		portInfoMap?: Map<string, PortInfo>
		connections?: any[]
		showPorts?: boolean
		showCords?: boolean
	} = $props()

	// mm geometry (mirror of elevations portGeometry, which is canvas px = mm × 0.5)
	const MAX_CELL_W = 60, MAX_CELL_H = 40, PAD_X = 4, PAD_Y = 3
	const CHANNEL_MM = 12, DROP_MM = 5

	let scopedRacks = $derived(rowId ? racks.filter(r => r.rowId === rowId) : racks)
	let elev = $derived(buildElevation(face === 'plan' ? [] : scopedRacks, settings, face))

	function matchesFace(d: DeviceConfig): boolean {
		const m = d.mounting ?? 'both'
		return m === 'both' || m === 'none' || m === face
	}

	function layoutFor(d: DeviceConfig) {
		const devW = d.widthMm ?? RACK_19IN_MM
		const devH = d.heightU * 45
		const count = d.portCount ?? 0
		const rows = count > 24 ? 2 : 1
		const cols = Math.min(Math.max(count, 1), 24)
		const cw = Math.min((devW - PAD_X * 2) / cols, MAX_CELL_W)
		const ch = Math.min((devH - PAD_Y * 2) / rows, MAX_CELL_H)
		const align = (d.portAlign ?? 'bl') as string
		const freeX = devW - PAD_X * 2 - cols * cw
		const freeY = devH - PAD_Y * 2 - rows * ch
		const ox = PAD_X + (align[1] === 'r' ? freeX : align[1] === 'c' ? freeX / 2 : 0)
		const oy = PAD_Y + (align[0] === 'b' ? freeY : 0)
		return { cols, rows, cw, ch, ox, oy }
	}

	function cellRect(l: ReturnType<typeof layoutFor>, portIndex: number) {
		const i = portIndex - 1
		const row = i < 24 ? 0 : 1
		const col = i % 24
		return { x: l.ox + col * l.cw, y: l.oy + row * l.ch, w: l.cw - 1, h: l.ch - 1 }
	}

	/** Devices with ports, visible on this face, in scoped racks. */
	let portDevices = $derived.by(() => {
		if (face === 'plan') return []
		return devices
			.filter(d => (d.portCount ?? 0) > 0 && elev.byId.has(d.rackId) && matchesFace(d))
			.map(d => ({ d, box: deviceBox(d, elev, face)!, layout: layoutFor(d) }))
			.filter(e => e.box)
	})

	function stackParts(label: string): string[] {
		const parts = label.split(/[.\-]/)
		if (parts[parts.length - 1] === 'H' && parts.length > 1) {
			parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]}-H`)
		}
		if (parts.length >= 4) return [`${parts[0]}.${parts[1]}`, parts[2], parts.slice(3).join('-')]
		return parts
	}

	// ── Cords ──
	let deviceById = $derived(new Map(devices.map(d => [d.id, d])))

	function anchor(ref: { rackId: string; deviceId: string; portIndex: number }) {
		const e = elev.byId.get(ref.rackId)
		const d = deviceById.get(ref.deviceId)
		if (!e || !d) return null
		const box = deviceBox(d, elev, face)
		if (!box) return null
		const r = cellRect(layoutFor(d), ref.portIndex)
		return {
			x: box.x + r.x + r.w / 2,
			y: box.y + r.y + r.h,
			rackLeft: e.x, rackRight: e.x + e.rack.widthMm,
		}
	}

	function channelX(a: NonNullable<ReturnType<typeof anchor>>, towards: number): number {
		return towards > (a.rackLeft + a.rackRight) / 2 ? a.rackRight + CHANNEL_MM : a.rackLeft - CHANNEL_MM
	}

	function route(c: any): string | null {
		const a = anchor(c.fromPortRef)
		const b = anchor(c.toPortRef)
		if (!a || !b) return null
		if (c.fromPortRef.rackId === c.toPortRef.rackId) {
			const ch = a.x < (a.rackLeft + a.rackRight) / 2 ? a.rackLeft - CHANNEL_MM : a.rackRight + CHANNEL_MM
			return `M ${a.x} ${a.y} V ${a.y + DROP_MM} H ${ch} V ${b.y + DROP_MM} H ${b.x} V ${b.y}`
		}
		const chA = channelX(a, b.x)
		const chB = channelX(b, a.x)
		const midY = (a.y + b.y) / 2
		return `M ${a.x} ${a.y} V ${a.y + DROP_MM} H ${chA} V ${midY} H ${chB} V ${b.y + DROP_MM} H ${b.x} V ${b.y}`
	}

	let shownConnections = $derived(showCords ? connections.filter((c: any) => c.status !== 'remove') : [])
</script>

{#if showPorts}
	{#each portDevices as { d, box, layout } (d.id)}
		<g>
			{#each Array.from({ length: d.portCount ?? 0 }) as _, i (i)}
				{@const r = cellRect(layout, i + 1)}
				{@const info = portInfoMap.get(`${d.id}:${i + 1}`)}
				{@const x = box.x + r.x}
				{@const y = box.y + r.y}
				<rect {x} {y} width={r.w} height={r.h} rx="1.5"
					fill={info ? (PORT_TYPE_COLORS[info.locationType] ?? '#9ca3af') + '4D' : 'white'}
					stroke="#9ca3af" stroke-width="0.25" vector-effect="non-scaling-stroke" />
				{#if info}
					{@const lines = stackParts(info.label)}
					{@const fs = Math.min(r.w / (0.68 * Math.max(...lines.map(s => s.length))), (r.h - 2) / (lines.length * 1.15))}
					{#each lines as line, li (li)}
						<text x={x + r.w / 2}
							y={y + r.h / 2 + (li - (lines.length - 1) / 2) * fs * 1.12 + fs * 0.35}
							text-anchor="middle" font-family="monospace" font-size={fs}
							fill="#374151">{line}</text>
					{/each}
				{:else}
					<text x={x + r.w / 2} y={y + r.h / 2} text-anchor="middle" dominant-baseline="central"
						font-family="monospace" font-size={Math.min(r.w / 1.4, r.h / 1.6)}
						fill="#b6bcc6">{i + 1}</text>
				{/if}
			{/each}
		</g>
	{/each}
{/if}

{#each shownConnections as c (c.id)}
	{@const d = route(c)}
	{#if d}
		<path {d} fill="none"
			stroke={c.cableColor || '#3b82f6'}
			stroke-width="0.6" vector-effect="non-scaling-stroke"
			stroke-dasharray={c.status !== 'installed' ? '8 6' : undefined}
			opacity="0.75" />
	{/if}
{/each}
