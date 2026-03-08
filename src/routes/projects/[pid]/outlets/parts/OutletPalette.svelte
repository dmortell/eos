<script lang="ts">
	import { Icon } from '$lib'
	import type { OutletConfig, PageCalibration, ToolMode } from './types'
	import { USAGE_COLORS, MOUNT_LABELS, MOUNT_SHORT, CABLE_COLORS, LEVEL_INFO } from './constants'

	import type { StickyDefaults } from './constants'

	let { projectFiles, selectedFileId, selectedPage, selectedFile, calibration, outlets, selectedIds, activeTool, activeZone, stickyDefaults, onfilechange, onpagechange, onzonechange, ontoolchange, onselect, onrangeselect, onupdate, onupdateselected, ondelete, ondefaultschange }: {
		projectFiles: any[]
		selectedFileId: string
		selectedPage: number
		selectedFile: any
		calibration: PageCalibration | null
		outlets: OutletConfig[]
		selectedIds: Set<string>
		activeTool: ToolMode
		activeZone: string
		stickyDefaults: StickyDefaults
		onfilechange: (id: string) => void
		onpagechange: (page: number) => void
		onzonechange: (zone: string) => void
		ontoolchange: (tool: ToolMode) => void
		onselect: (id: string, multi: boolean) => void
		onrangeselect: (fromIndex: number, toIndex: number) => void
		onupdate: (id: string, updates: Partial<OutletConfig>) => void
		onupdateselected: (updates: Partial<OutletConfig>) => void
		ondelete: () => void
		ondefaultschange: (updates: Partial<StickyDefaults>) => void
	} = $props()

	let selectedOutlet = $derived(outlets.find(o => selectedIds.size === 1 && selectedIds.has(o.id)) ?? null)
	let selectedOutlets = $derived(outlets.filter(o => selectedIds.has(o.id)))

	/** For multi-select: return value if all selected share it, else undefined */
	function shared<K extends keyof OutletConfig>(key: K): OutletConfig[K] | undefined {
		if (selectedOutlets.length === 0) return undefined
		const first = selectedOutlets[0][key]
		return selectedOutlets.every(o => o[key] === first) ? first : undefined
	}
	let lastClickedIndex = $state(-1)

	function isPageCalibrated(file: any, page: number): boolean {
		const p = file?.pages?.[page]
		return !!(p?.origin && p?.scale?.scale)
	}

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

	<!-- Properties panel (selected outlet) or defaults editor (outlet tool, nothing selected) -->
	{#if selectedOutlet}
		<div class="space-y-1 border-t border-gray-200 pt-2">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Properties</div>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Label</span>
				<input type="text" class="flex-1 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.label ?? ''}
					onchange={e => onupdate(selectedOutlet!.id, { label: e.currentTarget.value || undefined })} />
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Ports</span>
				<input type="number" min="1" max="12"
					class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.portCount}
					onchange={e => onupdate(selectedOutlet!.id, { portCount: parseInt(e.currentTarget.value) || 2 })} />
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Level</span>
				<div class="flex gap-0.5">
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{selectedOutlet.level === 'low' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdate(selectedOutlet!.id, { level: 'low' })}>Low</button>
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{selectedOutlet.level === 'high' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdate(selectedOutlet!.id, { level: 'high' })}>High</button>
				</div>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Usage</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.usage}
					onchange={e => onupdate(selectedOutlet!.id, { usage: e.currentTarget.value as any })}>
					{#each Object.entries(USAGE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Mount</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.mountType}
					onchange={e => onupdate(selectedOutlet!.id, { mountType: e.currentTarget.value as any })}>
					{#each Object.entries(MOUNT_LABELS) as [key, label]}
						<option value={key}>{label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Cable</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.cableType}
					onchange={e => onupdate(selectedOutlet!.id, { cableType: e.currentTarget.value as any })}>
					{#each Object.entries(CABLE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Room</span>
				<input type="text" class="w-20 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={selectedOutlet.roomNumber ?? ''}
					placeholder="—"
					onchange={e => onupdate(selectedOutlet!.id, { roomNumber: e.currentTarget.value || undefined })} />
			</label>

			<div class="flex items-center gap-2 text-gray-400">
				<span class="w-12 shrink-0">Pos</span>
				<span class="font-mono text-[10px]">{Math.round(selectedOutlet.position.x)}, {Math.round(selectedOutlet.position.y)} mm</span>
			</div>
		</div>
	{:else if selectedIds.size > 1}
		<div class="space-y-1 border-t border-gray-200 pt-2">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{selectedIds.size} selected</div>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Ports</span>
				<input type="number" min="1" max="12"
					class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={shared('portCount') ?? ''}
					placeholder="—"
					onchange={e => onupdateselected({ portCount: parseInt(e.currentTarget.value) || 2 })} />
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Level</span>
				<div class="flex gap-0.5">
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{shared('level') === 'low' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdateselected({ level: 'low' })}>Low</button>
					<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
						{shared('level') === 'high' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => onupdateselected({ level: 'high' })}>High</button>
				</div>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Usage</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={shared('usage') ?? ''}
					onchange={e => { if (e.currentTarget.value) onupdateselected({ usage: e.currentTarget.value as any }) }}>
					{#if !shared('usage')}<option value="">— mixed —</option>{/if}
					{#each Object.entries(USAGE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Mount</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={shared('mountType') ?? ''}
					onchange={e => { if (e.currentTarget.value) onupdateselected({ mountType: e.currentTarget.value as any }) }}>
					{#if !shared('mountType')}<option value="">— mixed —</option>{/if}
					{#each Object.entries(MOUNT_LABELS) as [key, label]}
						<option value={key}>{label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Cable</span>
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={shared('cableType') ?? ''}
					onchange={e => { if (e.currentTarget.value) onupdateselected({ cableType: e.currentTarget.value as any }) }}>
					{#if !shared('cableType')}<option value="">— mixed —</option>{/if}
					{#each Object.entries(CABLE_COLORS) as [key, val]}
						<option value={key}>{val.label}</option>
					{/each}
				</select>
			</label>

			<label class="flex items-center gap-2">
				<span class="text-gray-500 w-12 shrink-0">Room</span>
				<input type="text" class="w-20 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={shared('roomNumber') ?? ''}
					placeholder={shared('roomNumber') === undefined ? '— mixed —' : '—'}
					onchange={e => onupdateselected({ roomNumber: e.currentTarget.value || undefined })} />
			</label>
		</div>
	{:else if activeTool === 'outlet' || selectedIds.size === 0}
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
	{/if}

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
