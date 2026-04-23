<script lang="ts">
	import type { RackConfig, DeviceConfig, RackSettings, ViewState, ElevationFace } from './types'
	import { SCALE, RU_HEIGHT_MM, RACK_19IN_MM } from './constants'
	import RackFrame from './RackFrame.svelte'
	import Rect from './Rect.svelte'
	import Draggable from './Draggable.svelte'
	import DeviceView from './DeviceView.svelte'

	let {
		view, settings, activeRacks, rearRacks = [], face, devices, selectedIds, dropGhost = null, rackOverlaps,
		floorLabel, roomLabel,
		readonly = false,
		onstarttlinedrag, oneditline, oncleareditline, onsettingchange,
		ondevicedrag, ondevicedragged, ondeletedevice, onselectdevice,
		editingLine = null,
	}: {
		view: ViewState
		settings: RackSettings
		activeRacks: (RackConfig & { _x: number; _z: number })[]
		rearRacks?: (RackConfig & { _x: number; _z: number; _face: ElevationFace })[]
		face: ElevationFace
		devices: DeviceConfig[]
		selectedIds: Set<string>
		dropGhost?: { left: number; top: number; width: number; height: number } | null
		rackOverlaps: Map<string, Set<number>>
		floorLabel: string
		roomLabel: string
		/** When true, all interactive affordances are suppressed — used for page viewports. */
		readonly?: boolean
		onstarttlinedrag?: (e: MouseEvent, field: 'floorLevel' | 'ceilingLevel' | 'leftWallX' | 'rightWallX') => void
		oneditline?: (field: string) => void
		oncleareditline?: () => void
		onsettingchange?: (field: string, value: number) => void
		ondevicedrag?: (rect: any, mouse: any, item: any) => void
		ondevicedragged?: (rect: any, device: DeviceConfig, copy?: boolean) => void
		ondeletedevice?: (deviceId: string) => void
		onselectdevice?: (deviceId: string) => void
		editingLine?: string | null
	} = $props()

	let interactive = $derived(!readonly)

	function screenRect(rack: any) {
		return {
			left: rack._x * SCALE,
			top: (view.bottom - rack._z - rack.heightMm) * SCALE,
			width: rack.widthMm * SCALE,
			height: rack.heightMm * SCALE,
		}
	}

	function deviceScreenRect(device: DeviceConfig, rackList: (RackConfig & { _x: number; _z: number })[], f: ElevationFace = 'front') {
		const rack = rackList.find(r => r.id === device.rackId)
		if (!rack) return { left: 0, top: 0, width: 0, height: 0 }
		const rackRect = screenRect(rack)
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		const ox = (device.offsetX ?? 0) * SCALE * (f === 'rear' ? -1 : 1)
		const innerLeft = rackRect.left + (rackRect.width - devW) / 2 + ox
		const ruBottom = rackRect.top + rackRect.height - device.positionU * RU_HEIGHT_MM * SCALE
		return {
			left: innerLeft,
			top: ruBottom - device.heightU * RU_HEIGHT_MM * SCALE,
			width: devW,
			height: device.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	/** Compute device opacity for a given elevation face */
	function deviceOpacity(device: DeviceConfig, f: ElevationFace): number {
		const m = device.mounting ?? 'both'
		if (m === 'both' || m === 'none') return 1
		return m === f ? 1 : 0.5
	}

	let visibleDevices = $derived(
		devices.filter(d => activeRacks.some(r => r.id === d.rackId))
	)

	/** Sort devices so faded (opposite-face) ones render first (underneath) */
	function sortedByFace(devs: DeviceConfig[], f: ElevationFace): DeviceConfig[] {
		return [...devs].sort((a, b) => deviceOpacity(a, f) - deviceOpacity(b, f))
	}

	const wallW = 50

	/**
	 * Rear-view mirroring. Racks in rear face are already re-laid-out starting
	 * at x=0 (see `Racks.svelte`'s `rearRacks` derivation) — visually mirroring
	 * the row. Walls stored in `settings` are front-facing coords, so we mirror
	 * them around the row's mid-x in rear face so the room still frames the
	 * racks correctly.
	 *
	 * `rowEndXMm` is the rightmost edge of the rendered row (front or rear);
	 * mirror formula: `mirror(x) = rowEndXMm - x`.
	 */
	let rowEndXMm = $derived.by(() => {
		const list = face === 'rear' ? rearRacks : activeRacks
		if (list.length === 0) return 0
		const last = list[list.length - 1]
		return last._x + last.widthMm
	})

	let effLeftWallX = $derived(face === 'rear' && rowEndXMm > 0
		? rowEndXMm - settings.rightWallX
		: settings.leftWallX)
	let effRightWallX = $derived(face === 'rear' && rowEndXMm > 0
		? rowEndXMm - settings.leftWallX
		: settings.rightWallX)

	let roomW = $derived(effRightWallX - effLeftWallX)
	let roomLeft = $derived(effLeftWallX)

</script>


<!-- Floor + Room label -->
<div class="absolute pointer-events-none select-none"
	style:left={20 + roomLeft * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 180) * SCALE + 'px'}
	style:font-size="24px">
	<span class="font-semibold text-gray-700">{floorLabel} — {roomLabel}</span>
</div>

<!-- Slab (static, extends to outer wall edges) -->
<Rect item={{ x: roomLeft - wallW, z: settings.slabLevel - 100, width: roomW + wallW * 2, height: 100 }} label="Slab FL+{settings.slabLevel}" {view} />

<!-- Floor line -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute group/fl select-none"
	class:cursor-ns-resize={interactive}
	style:left={roomLeft * SCALE + 'px'}
	style:top={(view.bottom - settings.floorLevel) * SCALE + 'px'}
	style:width={roomW * SCALE + 'px'}
	style:height={20 * SCALE + 'px'}
	onmousedown={interactive && onstarttlinedrag ? (e => onstarttlinedrag(e, 'floorLevel')) : undefined}>
	<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 {interactive ? 'group-hover/fl:bg-slate-200/40' : ''} transition-colors"></div>
	{#if interactive && editingLine === 'floorLevel' && oncleareditline && onsettingchange}
		<!-- svelte-ignore a11y_autofocus -->
		<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
			value={settings.floorLevel}
			autofocus
			onchange={e => { onsettingchange('floorLevel', parseInt(e.currentTarget.value) || 0); oncleareditline() }}
			onkeydown={e => e.key === 'Escape' && oncleareditline()}
			onblur={oncleareditline} />
	{:else}
		<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap"
			class:cursor-pointer={interactive && !!oneditline}
			onclick={interactive && oneditline ? (e => { e.stopPropagation(); oneditline('floorLevel') }) : undefined}>Floor FL+{settings.floorLevel}</span>
	{/if}
</div>

<!-- Ceiling line -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute group/cl select-none"
	class:cursor-ns-resize={interactive}
	style:left={roomLeft * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 20) * SCALE + 'px'}
	style:width={roomW * SCALE + 'px'}
	style:height={20 * SCALE + 'px'}
	onmousedown={interactive && onstarttlinedrag ? (e => onstarttlinedrag(e, 'ceilingLevel')) : undefined}>
	<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 {interactive ? 'group-hover/cl:bg-slate-200/40' : ''} transition-colors"></div>
	{#if interactive && editingLine === 'ceilingLevel' && oncleareditline && onsettingchange}
		<!-- svelte-ignore a11y_autofocus -->
		<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
			value={settings.ceilingLevel}
			autofocus
			onchange={e => { onsettingchange('ceilingLevel', parseInt(e.currentTarget.value) || 0); oncleareditline() }}
			onkeydown={e => e.key === 'Escape' && oncleareditline()}
			onblur={oncleareditline} />
	{:else}
		<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap"
			class:cursor-pointer={interactive && !!oneditline}
			onclick={interactive && oneditline ? (e => { e.stopPropagation(); oneditline('ceilingLevel') }) : undefined}>Ceiling FL+{settings.ceilingLevel}</span>
	{/if}
</div>

<!--
	Walls are rendered at `effLeftWallX` / `effRightWallX` so rear face mirrors
	correctly. Drag handlers still target the *stored* `leftWallX` / `rightWallX`
	fields — in rear face the visual-left wall corresponds to the stored
	`rightWallX` (its physical identity doesn't change, only which side we see
	it from), so the drag-field is swapped to match.
-->
<!-- Left wall (visually — drag field swaps in rear face) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute group/lw select-none"
	class:cursor-ew-resize={interactive}
	style:left={(effLeftWallX - wallW) * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
	style:width={wallW * SCALE + 'px'}
	style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
	onmousedown={interactive && onstarttlinedrag ? (e => onstarttlinedrag(e, face === 'rear' ? 'rightWallX' : 'leftWallX')) : undefined}>
	<div class="w-full h-full bg-gray-300/60 {interactive ? 'group-hover/lw:bg-gray-400/70' : ''} transition-colors border border-gray-400/40"></div>
	<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
</div>

<!-- Right wall (visually — drag field swaps in rear face) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute group/rw select-none"
	class:cursor-ew-resize={interactive}
	style:left={effRightWallX * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
	style:width={wallW * SCALE + 'px'}
	style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
	onmousedown={interactive && onstarttlinedrag ? (e => onstarttlinedrag(e, face === 'rear' ? 'leftWallX' : 'rightWallX')) : undefined}>
	<div class="w-full h-full bg-gray-300/60 {interactive ? 'group-hover/rw:bg-gray-400/70' : ''} transition-colors border border-gray-400/40"></div>
	<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
</div>

<!-- ── ELEVATION (front or rear) ── -->
{#if face === 'front'}
	{#each activeRacks as rack (rack.id)}
		<RackFrame {rack} {view} face="front" selected={selectedIds.has(rack.id)} overlaps={rackOverlaps.get(rack.id)} />
	{/each}

	{#each sortedByFace(visibleDevices, 'front') as device (device.id)}
		{@const opacity = deviceOpacity(device, 'front')}
		{@const faded = opacity < 1}
		{#if interactive && ondevicedrag && ondevicedragged && onselectdevice}
			<Draggable {view} shape={deviceScreenRect(device, activeRacks)} item={device}
				selected={selectedIds.has(device.id)}
				disabled={faded}
				onClick={() => onselectdevice(device.id)}
				onDrag={ondevicedrag}
				onDragged={(rect, _item, copy) => ondevicedragged(rect, device, copy)}>
				<DeviceView {device} {view} {opacity} ondelete={faded ? undefined : () => ondeletedevice?.(device.id)} />
			</Draggable>
		{:else}
			{@const rect = deviceScreenRect(device, activeRacks)}
			<div class="absolute pointer-events-none"
				style:left="{rect.left}px" style:top="{rect.top}px"
				style:width="{rect.width}px" style:height="{rect.height}px">
				<DeviceView {device} {view} {opacity} />
			</div>
		{/if}
	{/each}
{:else if face === 'rear'}
	{#each rearRacks as rack (rack.id)}
		<RackFrame {rack} {view} face="rear" selected={selectedIds.has(rack.id)} overlaps={rackOverlaps.get(rack.id)} />
	{/each}

	{#each sortedByFace(visibleDevices, 'rear') as device (device.id)}
		{@const opacity = deviceOpacity(device, 'rear')}
		{@const faded = opacity < 1}
		{#if interactive && ondevicedrag && ondevicedragged && onselectdevice}
			<Draggable {view} shape={deviceScreenRect(device, rearRacks, 'rear')} item={device}
				selected={selectedIds.has(device.id)}
				disabled={faded}
				onClick={() => onselectdevice(device.id)}
				onDrag={ondevicedrag}
				onDragged={(rect, _item, copy) => ondevicedragged(rect, device, copy)}>
				<DeviceView {device} {view} {opacity} ondelete={faded ? undefined : () => ondeletedevice?.(device.id)} />
			</Draggable>
		{:else}
			{@const rect = deviceScreenRect(device, rearRacks, 'rear')}
			<div class="absolute pointer-events-none"
				style:left="{rect.left}px" style:top="{rect.top}px"
				style:width="{rect.width}px" style:height="{rect.height}px">
				<DeviceView {device} {view} {opacity} />
			</div>
		{/if}
	{/each}
{/if}

<!-- Drop ghost for palette drag -->
{#if interactive && dropGhost}
	<div class="absolute bg-blue-200/50 border-2 border-blue-400 border-dashed rounded-sm pointer-events-none"
		style:left={dropGhost.left + 'px'} style:top={dropGhost.top + 'px'}
		style:width={dropGhost.width + 'px'} style:height={dropGhost.height + 'px'}>
	</div>
{/if}
