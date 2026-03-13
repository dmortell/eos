<script lang="ts">
	import { Icon } from '$lib'
	import type { OutletConfig, ToolMode } from './types'
	import { USAGE_COLORS, MOUNT_LABELS, MOUNT_SHORT, CABLE_COLORS, LEVEL_INFO } from './constants'

	import type { StickyDefaults } from './constants'

	let { outlets, selectedIds, activeTool, activeZone, stickyDefaults, onzonechange, ontoolchange, onselect, onrangeselect, ondelete, ondefaultschange }: {
		outlets: OutletConfig[]
		selectedIds: Set<string>
		activeTool: ToolMode
		activeZone: string
		stickyDefaults: StickyDefaults
		onzonechange: (zone: string) => void
		ontoolchange: (tool: ToolMode) => void
		onselect: (id: string, multi: boolean) => void
		onrangeselect: (fromIndex: number, toIndex: number) => void
		ondelete: () => void
		ondefaultschange: (updates: Partial<StickyDefaults>) => void
	} = $props()

	let lastClickedIndex = $state(-1)

	function handleListClick(e: MouseEvent, outlet: OutletConfig, index: number) {
		if (e.shiftKey && lastClickedIndex >= 0) {
			onrangeselect(lastClickedIndex, index)
		} else {
			onselect(outlet.id, e.ctrlKey || e.metaKey)
		}
		lastClickedIndex = index
	}
</script>

<div class="p-3 h-full flex flex-col gap-4 text-xs">
	<!-- Zone selector -->
	<div class="space-y-1.5">
		<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium" title="Outlet labels zone">Zone</div>
		<div class="flex gap-0.5">
			{#each ['A', 'B', 'C', 'D', 'E', 'F'] as z}
				<button
					class="h-6 w-7 rounded text-[11px] font-semibold transition-colors
						{activeZone === z ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}"
					onclick={() => onzonechange(z)}
				>{z}</button>
			{/each}
		</div>
	</div>

	<!-- Defaults editor (always shown; selected outlet properties are in the floating window) -->
	<div class="space-y-1 border-t border-gray-200 pt-2">
		<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{activeTool === 'outlet' ? 'Next outlet' : 'Defaults'}</div>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Ports</span>
				<input type="number" min="1" max="12"
					class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={stickyDefaults.portCount}
					onchange={e => ondefaultschange({ portCount: parseInt(e.currentTarget.value) || 2 })} />
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Level</span>
				<div class="flex gap-0.5">
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{stickyDefaults.level === 'low' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => ondefaultschange({ level: 'low' as const })}>Low</button>
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{stickyDefaults.level === 'high' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => ondefaultschange({ level: 'high' as const })}>High</button>
				</div>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Usage</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={stickyDefaults.usage}
					onchange={e => ondefaultschange({ usage: e.currentTarget.value as any })}>
					{#each Object.entries(USAGE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Mount</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={stickyDefaults.mountType}
					onchange={e => ondefaultschange({ mountType: e.currentTarget.value as any })}>
					{#each Object.entries(MOUNT_LABELS) as [key, label]}
						<option value={key}>{label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Cable</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={stickyDefaults.cableType}
					onchange={e => ondefaultschange({ cableType: e.currentTarget.value as any })}>
					{#each Object.entries(CABLE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>
		</div>

	<!-- Outlet list -->
	<div class="flex-1 min-h-0 flex flex-col gap-1.5">
		<div class="flex items-center justify-between shrink-0">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
				Outlets <span class="text-gray-300">({outlets.length})</span>
			</div>
			{#if selectedIds.size > 0}
				<button class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 hover:text-red-600 transition-colors" onclick={() => ondelete()}>
					<Icon name="trash" size={10} />
					Delete {selectedIds.size}
				</button>
			{/if}
		</div>

		{#if outlets.length === 0}
			<p class="text-gray-400 text-[10px] py-2">No outlets yet. Select outlet tool and click on the floorplan.</p>
		{:else}
			<div class="flex-1 min-h-0 overflow-y-auto">
				{#each outlets as outlet, i (outlet.id)}
					{@const uColors = USAGE_COLORS[outlet.usage]}
					{@const cColors = CABLE_COLORS[outlet.cableType]}
					{@const selected = selectedIds.has(outlet.id)}
					<button class="w-full flex items-center gap-1.5 px-1.5 pb-0.5 text-left transition-colors
							{selected ? 'bg-blue-50 border-y border-blue-200' : 'hover:bg-gray-50 border-y border-transparent'}"
						onclick={e => handleListClick(e, outlet, i)}>
						<span class="w-2 h-2 rounded-full shrink-0" style:background={uColors.fill}></span>
						<span class="font-mono text-[10px] text-gray-700 truncate">{outlet.label ?? outlet.id.slice(0, 8)}</span>
						<span class="text-[10px] text-gray-400 shrink-0">{outlet.portCount}p</span>
						<span class="xxml-auto flex items-center gap-1 shrink-0">
						<span class="text-[10px] px-0.5 rounded" style:color={cColors.color} title={cColors.title}>{cColors.short}</span>
						<span class="text-[10px] text-gray-500" title={MOUNT_SHORT[outlet.mountType].title}>{MOUNT_SHORT[outlet.mountType].short}</span>
						<span class="text-[10px] {LEVEL_INFO[outlet.level].bgClass} {LEVEL_INFO[outlet.level].textClass}" title={LEVEL_INFO[outlet.level].title}>{LEVEL_INFO[outlet.level].short}</span>
						<span class="text-[10px] text-gray-500" title={USAGE_COLORS[outlet.usage].title}>{outlet.usage}</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
