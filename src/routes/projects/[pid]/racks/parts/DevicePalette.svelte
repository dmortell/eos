<script lang="ts">
	import { Icon, Search } from '$lib'
	import { DEFAULT_PALETTE } from './constants'
	import type { DeviceTemplate } from './types'

	let { library = [], onadd, oncustomadd }: {
		library?: DeviceTemplate[]
		onadd?: (template: DeviceTemplate) => void
		oncustomadd?: (template: DeviceTemplate) => void
	} = $props()

	let query = $state('')
	let builderOpen = $state(false)
	let custom = $state({
		label: 'Custom Device',
		type: 'other' as const,
		heightU: 1,
		portCount: 0,
		portType: null as any,
		widthMm: 480,
		depthMm: 200,
		maker: '',
	})

	let allTemplates = $derived([...DEFAULT_PALETTE, ...library])
	let filtered = $derived(
		query ? allTemplates.filter(t => t.label.toLowerCase().includes(query.toLowerCase())) : allTemplates
	)

	function addCustom() {
		const t: DeviceTemplate = {
			id: `custom-${Date.now()}`,
			label: custom.label,
			description: `${custom.heightU}U ${custom.type}`,
			type: custom.type as any,
			heightU: custom.heightU,
			portCount: custom.portCount,
			portType: custom.portType,
			widthMm: custom.widthMm,
			depthMm: custom.depthMm,
			maker: custom.maker,
			icon: 'box',
		}
		oncustomadd?.(t)
	}
</script>

<div class="space-y-2 p-2">
	<!-- Custom Device Builder -->
	<div class="space-y-1">
		<button class="flex items-center justify-between w-full text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
			onclick={() => builderOpen = !builderOpen}>
			<span class="flex items-center gap-1"><Icon name="box" size={11} /> Device Builder</span>
			<Icon name={builderOpen ? 'chevronUp' : 'chevronDown'} size={12} />
		</button>

		{#if builderOpen}
			<div class="grid grid-cols-2 gap-1 gap-x-2 text-xs">
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
					<button class="w-full h-6 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
						onclick={addCustom}>
						<Icon name="plus" size={12} /> Save
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Search -->
	<div><Search bind:value={query} /></div>

	<!-- Palette -->
	<div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
		<Icon name="layers" size={11} /> Drag to Rack
	</div>
	<div class="space-y-0.5">
		{#each filtered as template (template.id)}
			<button
				class="flex items-center gap-2 w-full p-1.5 bg-gray-50 border border-gray-200 rounded text-left text-xs hover:bg-gray-100 active:bg-gray-200 cursor-grab active:cursor-grabbing transition-colors"
				onclick={() => onadd?.(template)}
			>
				<Icon name={template.icon} size={14} class="text-gray-500 shrink-0" />
				<div class="min-w-0">
					<div class="font-medium text-gray-700 truncate">{template.label}</div>
					<div class="text-[10px] text-gray-400 truncate">{template.description}</div>
				</div>
			</button>
		{/each}
	</div>
</div>
