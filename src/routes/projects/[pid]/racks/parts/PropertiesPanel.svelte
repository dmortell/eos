<script lang="ts">
	import { Window, Icon } from '$lib'
	import { type RackConfig, rackTypes, DEFAULT_SHELF_HEIGHTS } from './types'

	let { selectedRacks = [], projectId = '', floor, framesHref, onupdaterack }: {
		selectedRacks?: RackConfig[]
		projectId?: string
		floor?: number
		/** Optional override for the frames-tool URL builder. Defaults to standard path. */
		framesHref?: (rackId: string) => string
		onupdaterack?: (id: string, updates: Record<string, any>) => void
	} = $props()

	/** Build URL to open the frames tool scoped to this rack's derived frame. */
	function buildFramesUrl(rackId: string): string {
		if (framesHref) return framesHref(rackId)
		const fl = floor ?? 1
		return `/projects/${projectId}/frames?floor=${fl}&frame=${encodeURIComponent(rackId)}`
	}

	/** A rack has a derived frame if it's a real RU-bearing rack type. */
	function hasDerivedFrame(rack: RackConfig): boolean {
		return rack.type !== 'desk' && rack.type !== 'shelf' && rack.type !== 'vcm'
	}

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

			<!-- Cross-tool navigation: every non-furniture rack has a derived frame
			     (frame.id === rack.id) in the Frames tool, with the same label.
			     Jump to it to configure patch panel ports. -->
			{#if !multi && hasDerivedFrame(selectedRack) && projectId}
				<a
					class="flex items-center gap-1 px-2 py-1 mt-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-medium no-underline"
					href={buildFramesUrl(selectedRack.id)}
					title="Open this rack's patch frame in the Frames tool">
					<Icon name="link" size={11} /> Open in Frames tool
				</a>
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
