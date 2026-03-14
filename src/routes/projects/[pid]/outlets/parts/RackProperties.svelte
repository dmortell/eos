<script lang="ts">
	import { Window, Icon } from '$lib'
	import type { RackConfig } from '../../racks/parts/types'
	import type { RackPlacement } from './types'

	let { racks = [], placements = [], onupdate, onsetrotation, onrotate, onremove }: {
		racks: (RackConfig & { room: string })[]
		placements: RackPlacement[]
		onupdate?: (updates: Partial<RackConfig>) => void
		onsetrotation?: (degrees: number) => void
		onrotate?: () => void
		onremove?: () => void
	} = $props()

	function shared<K extends keyof RackConfig>(key: K): RackConfig[K] | undefined {
		if (racks.length === 0) return undefined
		const first = racks[0][key]
		return racks.every(r => r[key] === first) ? first : undefined
	}

	let sharedRotation = $derived(
		placements.length === 0 ? undefined :
		placements.every(p => p.rotation === placements[0].rotation) ? placements[0].rotation : undefined
	)
</script>

<Window title="Rack Properties" open={true} right={16} top={48} class="p-3 space-y-1.5 text-xs w-56">
	<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
		{racks.length === 1 ? racks[0].label : `${racks.length} racks`}
	</div>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Label</span>
		{#if racks.length === 1}
			<input type="text" class="flex-1 min-w-0 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
				value={racks[0].label}
				onchange={e => onupdate?.({ label: e.currentTarget.value })} />
		{:else}
			<span class="text-[10px] text-gray-400 italic">— multiple —</span>
		{/if}
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Height</span>
		<input type="number" min="1" max="60"
			class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('heightU') ?? ''}
			placeholder="—"
			onchange={e => onupdate?.({ heightU: parseInt(e.currentTarget.value) || 42 })} />
		<span class="text-[10px] text-gray-400">U</span>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Width</span>
		<input type="number" min="100" max="2000" step="50"
			class="w-16 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('widthMm') ?? ''}
			placeholder="—"
			onchange={e => onupdate?.({ widthMm: parseInt(e.currentTarget.value) || 600 })} />
		<span class="text-[10px] text-gray-400">mm</span>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Depth</span>
		<input type="number" min="100" max="2000" step="50"
			class="w-16 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('depthMm') ?? ''}
			placeholder="—"
			onchange={e => onupdate?.({ depthMm: parseInt(e.currentTarget.value) || 1000 })} />
		<span class="text-[10px] text-gray-400">mm</span>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Type</span>
		<select class="flex-1 min-w-0 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('type') ?? ''}
			onchange={e => { if (e.currentTarget.value) onupdate?.({ type: e.currentTarget.value as any }) }}>
			{#if !shared('type')}<option value="">— mixed —</option>{/if}
			<option value="cabinet">Cabinet</option>
			<option value="4-post">4-Post</option>
			<option value="2-post">2-Post</option>
		</select>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Maker</span>
		<input type="text"
			class="flex-1 min-w-0 h-5 px-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('maker') ?? ''}
			placeholder={shared('maker') === undefined && racks.length > 1 ? '— mixed —' : '—'}
			onchange={e => onupdate?.({ maker: e.currentTarget.value || undefined })} />
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Model</span>
		<input type="text"
			class="flex-1 min-w-0 h-5 px-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={shared('model') ?? ''}
			placeholder={shared('model') === undefined && racks.length > 1 ? '— mixed —' : '—'}
			onchange={e => onupdate?.({ model: e.currentTarget.value || undefined })} />
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Rotation</span>
		<input type="number" min="0" max="345" step="15"
			class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={sharedRotation ?? ''}
			placeholder="—"
			onchange={e => onsetrotation?.(parseInt(e.currentTarget.value) || 0)} />
		<span class="text-[10px] text-gray-400">°</span>
		<button class="ml-auto text-[10px] text-gray-400 hover:text-blue-500 px-1 rounded hover:bg-blue-50 transition-colors"
			onclick={onrotate}>+90°</button>
	</label>

	{#if placements.length === 1}
		<div class="flex items-center gap-2 text-gray-400">
			<span class="w-14 shrink-0">Pos</span>
			<span class="font-mono text-[10px]">{Math.round(placements[0].position.x)}, {Math.round(placements[0].position.y)} mm</span>
		</div>
	{/if}

	<div class="flex items-center gap-1 pt-1 border-t border-gray-100">
		<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
			title="Remove selected rack(s) from floor plan (does not delete the rack)"
			onclick={onremove}>
			<Icon name="trash" size={10} /> Remove
		</button>
	</div>
</Window>
