<script lang="ts">
	import { Window, Icon } from '$lib'
	import { type RackConfig, rackTypes, DEFAULT_SHELF_HEIGHTS } from './types'

	let { selectedRacks = [], floorFrames = [], allRacks = [], onupdaterack }: {
		selectedRacks?: RackConfig[]
		/** Frames on the active floor (any room). Used for Frame ↔ Rack linkage. */
		floorFrames?: { id: string; name: string; serverRoom: string }[]
		/** All racks in the current doc — used to detect other racks already linked to a frame. */
		allRacks?: RackConfig[]
		onupdaterack?: (id: string, updates: Record<string, any>) => void
	} = $props()

	let multi = $derived(selectedRacks.length > 1)
	let selectedRack = $derived(selectedRacks[0] ?? null)

	let isRU = $derived(selectedRack && selectedRack.type !== 'desk' && selectedRack.type !== 'shelf' && selectedRack.type !== 'vcm')
	let hasShelves = $derived(selectedRack && !multi && (selectedRack.type === 'desk' || selectedRack.type === 'shelf'))

	let title = $derived(
		multi ? `Rack (${selectedRacks.length})` : 'Rack'
	)

	function shared<T>(fn: (r: RackConfig) => T): T | undefined {
		if (selectedRacks.length === 0) return undefined
		const first = fn(selectedRacks[0])
		return selectedRacks.every(r => fn(r) === first) ? first : undefined
	}

	function updateAll(updates: Record<string, any>) {
		for (const r of selectedRacks) onupdaterack?.(r.id, updates)
	}
</script>

{#if selectedRack}
	<Window {title} open={true} top={70} right={20} class="w-56 p-2 overflow-hidden print:hidden">
		<div class="space-y-1 text-xs">
			{#if multi}
				{@render Field('label', shared(r => r.label), v => updateAll({ label: v }))}
			{:else}
				{@render Field('label', selectedRack.label, v => onupdaterack?.(selectedRack!.id, { label: v }))}
			{/if}
			{@render SelectField('serverRoom', shared(r => r.serverRoom ?? '') ?? '', [['', '—'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateAll({ serverRoom: v || undefined }))}
			{@render SelectField('type', shared(r => r.type) ?? '', rackTypes.map(rt => [rt.id, rt.label]), v => updateAll({ type: v }))}
			{#if isRU}
				{@render NumberField('heightU', shared(r => r.heightU), v => updateAll({ heightU: v }))}
			{:else}
				{@render NumberField('heightMm', shared(r => r.heightMm), v => updateAll({ heightMm: v }))}
			{/if}
			{@render NumberField('widthMm', shared(r => r.widthMm), v => updateAll({ widthMm: v }))}
			{@render NumberField('depthMm', shared(r => r.depthMm), v => updateAll({ depthMm: v }))}
			{#if hasShelves}
				{@const heights = selectedRack.shelfHeights ?? DEFAULT_SHELF_HEIGHTS[selectedRack.type] ?? [0,0,0,0]}
				{#each [0,1,2,3] as i}
					{@render NumberField(`shelf ${i+1}`, heights[i] ?? 0, v => {
						const h = [...heights]; h[i] = v;
						onupdaterack?.(selectedRack!.id, { shelfHeights: h })
					})}
				{/each}
			{/if}
			{@render Field('maker', shared(r => r.maker ?? ''), v => updateAll({ maker: v }))}
			{@render Field('model', shared(r => r.model ?? ''), v => updateAll({ model: v }))}
			{#if selectedRack.sku}
				{@render Field('sku', shared(r => r.sku ?? ''), undefined)}
			{/if}

			<!-- Frame ↔ Rack link (single-select only). Picker is scoped to racks
			     in the same server room; already-linked frames are hidden. -->
			{#if !multi}
				{@const rackRoom = selectedRack.serverRoom ?? ''}
				{@const roomFrames = floorFrames.filter(f => !rackRoom || f.serverRoom === rackRoom)}
				{@const linkedElsewhere = new Set(allRacks.filter(r => r.id !== selectedRack!.id && r.frameId).map(r => r.frameId!))}
				{@const availableFrames = roomFrames.filter(f => !linkedElsewhere.has(f.id))}
				{@const currentFrame = selectedRack.frameId ? floorFrames.find(f => f.id === selectedRack!.frameId) : null}
				{@const staleFrame = selectedRack.frameId && !currentFrame}
				<label class="flex gap-2 items-center">
					<span class="w-16 text-gray-500 text-[10px] shrink-0">frame</span>
					<select
						class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
						value={selectedRack.frameId ?? ''}
						onchange={e => onupdaterack?.(selectedRack!.id, { frameId: e.currentTarget.value || undefined })}>
						<option value="">— none —</option>
						{#if currentFrame}
							<option value={currentFrame.id}>{currentFrame.name} (Room {currentFrame.serverRoom})</option>
						{/if}
						{#each availableFrames.filter(f => !currentFrame || f.id !== currentFrame.id) as f}
							<option value={f.id}>{f.name} (Room {f.serverRoom})</option>
						{/each}
						{#if staleFrame}
							<option value={selectedRack.frameId} selected>{selectedRack.frameId} (missing)</option>
						{/if}
					</select>
				</label>
				{#if staleFrame}
					<div class="ml-18 text-[10px] text-amber-700 flex items-center gap-1">
						<Icon name="warning" size={10} /> linked frame no longer exists
					</div>
				{/if}
			{/if}

			<label class="flex gap-2 items-start">
				<span class="w-16 text-gray-500 text-[10px] shrink-0 pt-1">notes</span>
				<textarea
					rows="2"
					value={shared(r => r.notes ?? '') ?? ''}
					placeholder={shared(r => r.notes) === undefined ? 'mixed' : ''}
					class="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded text-xs resize-y"
					onchange={e => updateAll({ notes: e.currentTarget.value || undefined })}></textarea>
			</label>
		</div>
	</Window>
{/if}

{#snippet Field(key: string, value: string | undefined, onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input value={value ?? ''} class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
				placeholder={value === undefined ? 'mixed' : ''}
				onchange={e => onchange(e.currentTarget.value)} />
		{:else}
			<span class="text-gray-700">{value ?? ''}</span>
		{/if}
	</label>
{/snippet}

{#snippet SelectField(key: string, value: string, options: [string, string][], onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		<select class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs" {value}
			onchange={e => onchange?.(e.currentTarget.value)}>
			{#if !options.some(([v]) => v === value)}
				<option value="" disabled selected>mixed</option>
			{/if}
			{#each options as [val, label]}
				<option value={val} selected={val === value}>{label}</option>
			{/each}
		</select>
	</label>
{/snippet}

{#snippet NumberField(key: string, value: number | undefined, onchange?: (v: number) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input type="number" value={value ?? ''} class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
				placeholder={value === undefined ? 'mixed' : ''}
				onchange={e => onchange(parseInt(e.currentTarget.value) || 0)} />
		{:else}
			<span class="text-gray-700">{value ?? ''}</span>
		{/if}
	</label>
{/snippet}
