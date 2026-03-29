<script lang="ts">
	import { Icon } from '$lib'
	import type { DeviceConfig, ViewState } from './types'
	import { DEVICE_TYPE_COLORS } from './constants'

	let { device, view, showPorts=false, opacity=1, ondelete }: {
		device: DeviceConfig
		view: ViewState
		showPorts?: boolean
		opacity?: number
		ondelete?: () => void
	} = $props()

	let scale = $derived(view.scale)
	let zoom = $derived(view.zoom < 1.5 ? 1.8 : view.zoom < 2.4 ? 1.5 : 1)
	let color = $derived(DEVICE_TYPE_COLORS[device.type] ?? '#6b7280')

	let iconName = $derived(
		device.type === 'panel' ? 'hgrip' :
		device.type === 'switch' ? 'server' :
		device.type === 'server' ? 'server' :
		device.type === 'manager' ? 'box' :
		'square'
	)
</script>

<div class="flex h-full relative cursor-pointer group" style:border-left="3px solid {color}"
	style:opacity={opacity} class:pointer-events-none={opacity < 1}>
	<!-- Label -->
	<div class="flex items-center pl-1.5 text-gray-700 font-bold truncate"
	class:rotate-label={(device.widthMm ?? 450) <= 150}
	style:font-size={Math.max(8, 16 * zoom * scale) + 'px'}>
		<Icon name={iconName} size={Math.max(8, 14 * zoom * scale)} />
		<span class="ml-1 truncate">{device.label}</span>
	</div>

	<!-- Port indicators -->
	{#if showPorts && device.portCount > 0}
		<div class="absolute right-1 top-0 bottom-0 flex items-center">
			{#each Array.from({ length: Math.min(device.portCount, 24) }) as _, idx}
				<div class="w-1.5 h-1.5 rounded-full border border-gray-400 bg-gray-200 mx-px"
					style:font-size={8 * scale + 'px'}></div>
			{/each}
			{#if device.portCount > 24}
				<span class="text-[8px] text-gray-400 ml-1">+{device.portCount - 24}</span>
			{/if}
		</div>
	{/if}

	<!-- Hover actions -->
	<div class="absolute bottom-0 right-0 hidden group-hover:flex gap-0.5 z-30 p-0.5">
		{#if ondelete}
			<button onclick={e => { e.stopPropagation(); ondelete?.() }}
				class="text-red-400 hover:text-red-600" title="Remove">
				<Icon name="trash" size={10} />
			</button>
		{/if}
	</div>
</div>

<style>
.rotate-label {
	position: absolute;
	left: 20px;
	bottom: 40%;
	transform: rotate(-90deg);
	transform-origin: bottom left;
	white-space: nowrap;
}
</style>
