<script lang="ts">
	import type { RackConfig, DeviceConfig, RackSettings, ViewState } from './types'
	import { SCALE, RU_HEIGHT_MM, RACK_19IN_MM } from './constants'
	import RackFrame from './RackFrame.svelte'
	import Rect from './Rect.svelte'
	import Draggable from './Draggable.svelte'
	import DeviceView from './DeviceView.svelte'

	let {
		view, settings, activeRacks, devices, selectedIds, dropGhost, rackOverlaps,
		floorLabel, roomLabel,
		onstarttlinedrag, oneditline, oncleareditline, onsettingchange,
		ondevicedrag, ondevicedragged, ondeletedevice, onselectdevice,
		editingLine = null,
	}: {
		view: ViewState
		settings: RackSettings
		activeRacks: (RackConfig & { _x: number; _z: number })[]
		devices: DeviceConfig[]
		selectedIds: Set<string>
		dropGhost: { left: number; top: number; width: number; height: number } | null
		rackOverlaps: Map<string, Set<number>>
		floorLabel: string
		roomLabel: string
		onstarttlinedrag: (e: MouseEvent, field: 'floorLevel' | 'ceilingLevel' | 'leftWallX' | 'rightWallX') => void
		oneditline: (field: string) => void
		oncleareditline: () => void
		onsettingchange: (field: string, value: number) => void
		ondevicedrag: (rect: any, mouse: any, item: any) => void
		ondevicedragged: (rect: any, device: DeviceConfig, copy?: boolean) => void
		ondeletedevice: (deviceId: string) => void
		onselectdevice: (deviceId: string) => void
		editingLine?: string | null
	} = $props()

	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'

	function screenRect(rack: any) {
		return {
			left: rack._x * SCALE,
			top: (view.bottom - rack._z - rack.heightMm) * SCALE,
			width: rack.widthMm * SCALE,
			height: rack.heightMm * SCALE,
		}
	}

	function deviceScreenRect(device: DeviceConfig) {
		const rack = activeRacks.find(r => r.id === device.rackId)
		if (!rack) return { left: 0, top: 0, width: 0, height: 0 }
		const rackRect = screenRect(rack)
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		const ox = (device.offsetX ?? 0) * SCALE
		const innerLeft = rackRect.left + (rackRect.width - devW) / 2 + ox
		const ruBottom = rackRect.top + rackRect.height - device.positionU * RU_HEIGHT_MM * SCALE
		return {
			left: innerLeft,
			top: ruBottom - device.heightU * RU_HEIGHT_MM * SCALE,
			width: devW,
			height: device.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	let visibleDevices = $derived(
		devices.filter(d => activeRacks.some(r => r.id === d.rackId))
	)

	const wallW = 50
	let roomW = $derived(settings.rightWallX - settings.leftWallX)
	let roomLeft = $derived(settings.leftWallX)

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

<!-- Floor line (draggable, between walls) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute cursor-ns-resize group/fl select-none"
	style:left={roomLeft * SCALE + 'px'}
	style:top={(view.bottom - settings.floorLevel) * SCALE + 'px'}
	style:width={roomW * SCALE + 'px'}
	style:height={20 * SCALE + 'px'}
	onmousedown={e => onstarttlinedrag(e, 'floorLevel')}>
	<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 group-hover/fl:bg-slate-200/40 transition-colors"></div>
	{#if editingLine === 'floorLevel'}
		<!-- svelte-ignore a11y_autofocus -->
		<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
			value={settings.floorLevel}
			autofocus
			onchange={e => { onsettingchange('floorLevel', parseInt(e.currentTarget.value) || 0); oncleareditline() }}
			onkeydown={e => e.key === 'Escape' && oncleareditline()}
			onblur={oncleareditline} />
	{:else}
		<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap cursor-pointer"
			onclick={e => { e.stopPropagation(); oneditline('floorLevel') }}>Floor FL+{settings.floorLevel}</span>
	{/if}
</div>

<!-- Ceiling line (draggable, between walls) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute cursor-ns-resize group/cl select-none"
	style:left={roomLeft * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 20) * SCALE + 'px'}
	style:width={roomW * SCALE + 'px'}
	style:height={20 * SCALE + 'px'}
	onmousedown={e => onstarttlinedrag(e, 'ceilingLevel')}>
	<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 group-hover/cl:bg-slate-200/40 transition-colors"></div>
	{#if editingLine === 'ceilingLevel'}
		<!-- svelte-ignore a11y_autofocus -->
		<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
			value={settings.ceilingLevel}
			autofocus
			onchange={e => { onsettingchange('ceilingLevel', parseInt(e.currentTarget.value) || 0); oncleareditline() }}
			onkeydown={e => e.key === 'Escape' && oncleareditline()}
			onblur={oncleareditline} />
	{:else}
		<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap cursor-pointer"
			onclick={e => { e.stopPropagation(); oneditline('ceilingLevel') }}>Ceiling FL+{settings.ceilingLevel}</span>
	{/if}
</div>

<!-- Left wall (draggable, 50mm thick, from slab top to above ceiling) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute cursor-ew-resize group/lw select-none"
	style:left={(settings.leftWallX - wallW) * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
	style:width={wallW * SCALE + 'px'}
	style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
	onmousedown={e => onstarttlinedrag(e, 'leftWallX')}>
	<div class="w-full h-full bg-gray-300/60 group-hover/lw:bg-gray-400/70 transition-colors border border-gray-400/40"></div>
	<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
</div>

<!-- Right wall (draggable, 50mm thick, from slab top to above ceiling) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute cursor-ew-resize group/rw select-none"
	style:left={settings.rightWallX * SCALE + 'px'}
	style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
	style:width={wallW * SCALE + 'px'}
	style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
	onmousedown={e => onstarttlinedrag(e, 'rightWallX')}>
	<div class="w-full h-full bg-gray-300/60 group-hover/rw:bg-gray-400/70 transition-colors border border-gray-400/40"></div>
	<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
</div>

<!-- Rack frames -->
{#each activeRacks as rack (rack.id)}
	<RackFrame {rack} {view} selected={selectedIds.has(rack.id)} overlaps={rackOverlaps.get(rack.id)} />
{/each}

<!-- Devices -->
{#each visibleDevices as device (device.id)}
	<Draggable {view} shape={deviceScreenRect(device)} item={device}
		selected={selectedIds.has(device.id)}
		onClick={() => onselectdevice(device.id)}
		onDrag={ondevicedrag}
		onDragged={(rect, _item, copy) => ondevicedragged(rect, device, copy)}>
		<DeviceView {device} {view} ondelete={() => ondeletedevice(device.id)} />
	</Draggable>
{/each}

<!-- Drop ghost for palette drag -->
{#if dropGhost}
	<div class="absolute bg-blue-200/50 border-2 border-blue-400 border-dashed rounded-sm pointer-events-none"
		style:left={dropGhost.left + 'px'} style:top={dropGhost.top + 'px'}
		style:width={dropGhost.width + 'px'} style:height={dropGhost.height + 'px'}>
	</div>
{/if}
