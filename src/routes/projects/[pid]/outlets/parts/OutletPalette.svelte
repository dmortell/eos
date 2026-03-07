<script lang="ts">
	import { Icon } from '$lib'
	import type { OutletConfig, PageCalibration, ToolMode } from './types'
	import { USAGE_COLORS, MOUNT_LABELS, CABLE_COLORS } from './constants'

	let { projectFiles, selectedFileId, selectedPage, selectedFile, calibration, outlets, selectedIds, activeTool, activeZone, onfilechange, onpagechange, onzonechange, ontoolchange, onselect, onupdate, ondelete }: {
		projectFiles: any[]
		selectedFileId: string
		selectedPage: number
		selectedFile: any
		calibration: PageCalibration | null
		outlets: OutletConfig[]
		selectedIds: Set<string>
		activeTool: ToolMode
		activeZone: string
		onfilechange: (id: string) => void
		onpagechange: (page: number) => void
		onzonechange: (zone: string) => void
		ontoolchange: (tool: ToolMode) => void
		onselect: (id: string, multi: boolean) => void
		onupdate: (id: string, updates: Partial<OutletConfig>) => void
		ondelete: () => void
	} = $props()

	let selectedOutlet = $derived(outlets.find(o => selectedIds.size === 1 && selectedIds.has(o.id)) ?? null)

	function isPageCalibrated(file: any, page: number): boolean {
		const p = file?.pages?.[page]
		return !!(p?.origin && p?.scale?.scale)
	}
</script>

<div class="p-3 space-y-4 text-xs">
	<!-- File picker -->
	<div class="space-y-1.5">
		<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Floorplan</div>
		<select
			class="w-full h-7 px-2 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={selectedFileId}
			onchange={e => onfilechange(e.currentTarget.value)}>
			<option value="">— Select file —</option>
			{#each projectFiles as f (f.id)}
				<option value={f.id}>{f.name ?? f.id}</option>
			{/each}
		</select>

		{#if selectedFile?.pageCount && selectedFile.pageCount > 1}
			<div class="flex items-center gap-2">
				<span class="text-gray-400">Page</span>
				<select
					class="h-6 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedPage}
					onchange={e => onpagechange(parseInt(e.currentTarget.value))}>
					{#each Array.from({ length: selectedFile.pageCount }, (_, i) => i + 1) as p}
						<option value={p} disabled={!isPageCalibrated(selectedFile, p)}>
							{p} {isPageCalibrated(selectedFile, p) ? '' : '(not calibrated)'}
						</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if selectedFileId && !calibration}
			<div class="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700">
				This page needs origin and scale set in the uploads tool before outlets can be placed.
			</div>
		{/if}
	</div>

	<!-- Zone selector -->
	<div class="space-y-1.5">
		<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Zone</div>
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

	<!-- Outlet list -->
	<div class="space-y-1.5">
		<div class="flex items-center justify-between">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
				Outlets <span class="text-gray-300">({outlets.length})</span>
			</div>
			{#if selectedIds.size > 0}
				<button class="text-[10px] text-red-400 hover:text-red-600" onclick={() => ondelete()}>
					Delete {selectedIds.size}
				</button>
			{/if}
		</div>

		{#if outlets.length === 0}
			<p class="text-gray-400 text-[10px] py-2">No outlets yet. Select outlet tool and click on the floorplan.</p>
		{:else}
			<div class="space-y-0.5 max-h-60 overflow-y-auto">
				{#each outlets as outlet (outlet.id)}
					{@const colors = USAGE_COLORS[outlet.usage]}
					{@const selected = selectedIds.has(outlet.id)}
					<button
						class="w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors
							{selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}"
						onclick={e => onselect(outlet.id, e.ctrlKey || e.metaKey)}>
						<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={colors.fill}></span>
						<span class="font-mono text-[11px] text-gray-700 truncate">{outlet.label ?? outlet.id.slice(0, 8)}</span>
						<span class="text-gray-400 text-[10px]">{outlet.portCount}p</span>
						<span class="text-gray-400 text-[10px] ml-auto">{outlet.level === 'high' ? 'H' : 'L'}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Properties panel (single selection) -->
	{#if selectedOutlet}
		<div class="space-y-2 border-t border-gray-200 pt-3">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Properties</div>

			<!-- Label -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Label</span>
				<input type="text" class="flex-1 h-6 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.label ?? ''}
					onchange={e => onupdate(selectedOutlet!.id, { label: e.currentTarget.value || undefined })} />
			</label>

			<!-- Port count -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Ports</span>
				<input type="number" min="1" max="12"
					class="w-14 h-6 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.portCount}
					onchange={e => onupdate(selectedOutlet!.id, { portCount: parseInt(e.currentTarget.value) || 2 })} />
			</label>

			<!-- Level -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Level</span>
				<div class="flex gap-0.5">
					<button class="h-6 px-2 rounded text-[10px] font-medium transition-colors
						{selectedOutlet.level === 'low' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdate(selectedOutlet!.id, { level: 'low' })}>Low</button>
					<button class="h-6 px-2 rounded text-[10px] font-medium transition-colors
						{selectedOutlet.level === 'high' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdate(selectedOutlet!.id, { level: 'high' })}>High</button>
				</div>
			</label>

			<!-- Usage -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Usage</span>
				<select class="flex-1 h-6 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.usage}
					onchange={e => onupdate(selectedOutlet!.id, { usage: e.currentTarget.value as any })}>
					{#each Object.entries(USAGE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<!-- Mount type -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Mount</span>
				<select class="flex-1 h-6 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.mountType}
					onchange={e => onupdate(selectedOutlet!.id, { mountType: e.currentTarget.value as any })}>
					{#each Object.entries(MOUNT_LABELS) as [key, label]}
						<option value={key}>{label}</option>
					{/each}
				</select>
			</label>

			<!-- Cable type -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Cable</span>
				<select class="flex-1 h-6 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.cableType}
					onchange={e => onupdate(selectedOutlet!.id, { cableType: e.currentTarget.value as any })}>
					{#each Object.entries(CABLE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<!-- Room number -->
			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Room</span>
				<input type="text" class="w-20 h-6 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.roomNumber ?? ''}
					placeholder="—"
					onchange={e => onupdate(selectedOutlet!.id, { roomNumber: e.currentTarget.value || undefined })} />
			</label>

			<!-- Position (read-only) -->
			<div class="flex items-center gap-2 text-gray-400">
				<span class="w-12 shrink-0">Pos</span>
				<span class="font-mono text-[10px]">{Math.round(selectedOutlet.position.x)}, {Math.round(selectedOutlet.position.y)} mm</span>
			</div>
		</div>
	{/if}
</div>
