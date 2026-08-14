<script lang="ts">
	import { Icon, Search } from '$lib'
	import { slide } from 'svelte/transition'
	import { DEFAULT_PALETTE } from './constants'
	import type { DeviceTemplate } from './types'

	let { library = [], onedit, ondragstart, oncustomadd }: {
		library?: DeviceTemplate[]
		onedit?: (template: DeviceTemplate) => void
		ondragstart?: (e: MouseEvent, template: DeviceTemplate) => void
		oncustomadd?: (template: DeviceTemplate) => void
	} = $props()

	function createEmptyCustom() {
		return {
			id: null as string | null,
			label: '',
			type: 'other' as const,
			heightU: 1,
			portCount: 0,
			portType: null as any,
			widthMm: 445,		// 445mm for inside of 19" frame, use 460mm for bezel with ears
			depthMm: 200,
			maker: '',
			icon: 'box',
		}
	}

	let query = $state('')
	let builderOpen = $state(false)
	let custom = $state(createEmptyCustom())

	let allTemplates = $derived([...DEFAULT_PALETTE, ...library])
	let filtered = $derived(
		query ? allTemplates.filter(t => t.label.toLowerCase().includes(query.toLowerCase())) : allTemplates
	)

	function editTemplate(template: DeviceTemplate) {
		builderOpen = true
		custom = {
			id: library.some(item => item.id === template.id) ? template.id : null,
			label: template.label,
			type: template.type as any,
			heightU: template.heightU,
			portCount: template.portCount,
			portType: template.portType ?? null,
			widthMm: template.widthMm ?? 445,
			depthMm: template.depthMm ?? 200,
			maker: template.maker ?? '',
			icon: template.icon,
		}
		onedit?.(template)
	}

	function addCustom() {
		const t: DeviceTemplate = {
			id: custom.id ?? `custom-${Date.now()}`,
			label: custom.label,
			description: `${custom.heightU}U ${custom.type}`,
			type: custom.type as any,
			heightU: custom.heightU,
			portCount: custom.portCount,
			portType: custom.portType,
			widthMm: custom.widthMm,
			depthMm: custom.depthMm,
			maker: custom.maker,
			icon: custom.icon,
		}
		oncustomadd?.(t)
		custom = createEmptyCustom()
	}
</script>

<div class="space-y-2 p-2">
	<!-- Custom Device Builder -->
	<div class="space-y-1">

		<div class="flex items-center justify-between gap-2 xxmb-2 text-gray-500 text-[10px] uppercase tracking-wider">
			<span class="flex items-center gap-1"><Icon name="box" size={11} /> Custom Device Builder</span>
			<button onclick={() => { builderOpen = !builderOpen }} class={['transition p-1 rounded hover:bg-slate-200', builderOpen && 'rotate-180']}><Icon name="edit" size={12} /></button>
		</div>

		{#if builderOpen}
			<div class="grid grid-cols-2 gap-1 gap-x-2 text-xs" transition:slide>
				<label class="text-[10px] text-gray-500">Label
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.label} />
				</label>
				<label class="text-[10px] text-gray-500">Type
					<select class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.type}>
						<option value="panel">Panel</option>
						<option value="switch">Switch</option>
						<option value="server">Server</option>
						<option value="manager">Manager</option>
						<option value="shelf">Shelf</option>
						<option value="pdu">PDU</option>
						<option value="other">Other</option>
					</select>
				</label>
				<label class="text-[10px] text-gray-500">Height (U)
					<input type="number" min="1" max="20" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.heightU} />
				</label>
				<label class="text-[10px] text-gray-500">Ports
					<input type="number" min="0" max="96" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.portCount} />
				</label>
				<label class="text-[10px] text-gray-500">Maker
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.maker} />
				</label>
				<div class="flex items-end">
					<button class="flex justify-center items-center gap-1 w-full h-6 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
						onclick={addCustom}>
						<Icon name="plus" size={12} /> Save
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Search -->
	<div><Search bind:value={query} class="text-sm"/></div>

	<!-- Palette -->
	<div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex gap-1">
		<Icon name="layers" size={11} /> Drag to Rack
	</div>
	<div class="text-[10px] text-gray-400 mb-1">Click a device to load it into the builder for editing.</div>
	<div class="space-y-0.5">
		{#each filtered as template (template.id)}
			<button
				class="flex items-center gap-2 w-full p-1.5 bg-gray-50 border border-gray-200 rounded text-left text-xs hover:bg-gray-100 active:bg-gray-200 cursor-grab active:cursor-grabbing transition-colors select-none"
				onmousedown={e => ondragstart?.(e, template)}
				onclick={() => editTemplate(template)}
			>
				<Icon name={template.icon} size={14} class="text-gray-500 shrink-0" />
				<div class="min-w-0">
					<div class="font-medium text-gray-700 truncate" title={template.description}>{template.label}</div>
					<!-- <div class="text-[10px] text-gray-400 truncate">{template.description}</div> -->
				</div>
			</button>
		{/each}
	</div>
</div>
