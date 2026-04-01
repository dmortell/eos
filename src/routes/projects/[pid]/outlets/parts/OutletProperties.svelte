<script lang="ts">
	import { Icon, Window } from '$lib'
	import type { OutletConfig } from './types'
	import { USAGE_COLORS, MOUNT_LABELS, CABLE_COLORS } from './constants'

	let { outlets, selectedIds, selectedRackIds = new Set(), onupdate, onupdateselected, ondelete }: {
		outlets: OutletConfig[]
		selectedIds: Set<string>
		selectedRackIds?: Set<string>
		onupdate: (id: string, updates: Partial<OutletConfig>) => void
		onupdateselected: (updates: Partial<OutletConfig>) => void
		ondelete: () => void
	} = $props()

	let selectedOutlets = $derived(outlets.filter(o => selectedIds.has(o.id)))
	let singleOutlet = $derived(selectedOutlets.length === 1 ? selectedOutlets[0] : null)

	function sharedOutlet<K extends keyof OutletConfig>(key: K): OutletConfig[K] | undefined {
		const vals = selectedOutlets.map(o => o[key])
		const first = vals[0]
		return vals.every(v => v === first) ? first : undefined
	}
</script>

<Window title="Outlet Properties" open={true} right={16} top={selectedRackIds.size > 0 ? 320 : 48} class="p-3 space-y-1.5 text-xs w-56">
	<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
		{singleOutlet ? (singleOutlet.label ?? singleOutlet.id.slice(0, 8)) : `${selectedIds.size} outlets`}
	</div>

	{#if singleOutlet}
		<label class="flex items-center gap-2">
			<span class="text-gray-500 w-12 shrink-0">Label</span>
			<input type="text" class="flex-1 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
				value={singleOutlet.label ?? ''}
				onchange={e => onupdate(singleOutlet!.id, { label: e.currentTarget.value || undefined })} />
		</label>
	{/if}

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Ports</span>
		<input type="number" min="1" max="12"
			class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={singleOutlet ? singleOutlet.portCount : (sharedOutlet('portCount') ?? '')}
			placeholder="—"
			onchange={e => {
				const v = parseInt(e.currentTarget.value) || 2
				if (singleOutlet) onupdate(singleOutlet.id, { portCount: v })
				else onupdateselected({ portCount: v })
			}} />
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Level</span>
		<div class="flex gap-0.5">
			{#each ['low', 'high'] as lvl}
				{@const active = singleOutlet ? singleOutlet.level === lvl : sharedOutlet('level') === lvl}
				<button class="h-5 px-2 rounded text-[10px] font-medium transition-colors
					{active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
					onclick={() => {
						if (singleOutlet) onupdate(singleOutlet.id, { level: lvl as any })
						else onupdateselected({ level: lvl as any })
					}}>{lvl === 'low' ? 'Low' : 'High'}</button>
			{/each}
		</div>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Usage</span>
		<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={singleOutlet ? singleOutlet.usage : (sharedOutlet('usage') ?? '')}
			onchange={e => {
				if (!e.currentTarget.value) return
				if (singleOutlet) onupdate(singleOutlet.id, { usage: e.currentTarget.value as any })
				else onupdateselected({ usage: e.currentTarget.value as any })
			}}>
			{#if !singleOutlet && !sharedOutlet('usage')}<option value="">— mixed —</option>{/if}
			{#each Object.entries(USAGE_COLORS) as [key, val]}
				<option value={key}>{val.label}</option>
			{/each}
		</select>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Mount</span>
		<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={singleOutlet ? singleOutlet.mountType : (sharedOutlet('mountType') ?? '')}
			onchange={e => {
				if (!e.currentTarget.value) return
				if (singleOutlet) onupdate(singleOutlet.id, { mountType: e.currentTarget.value as any })
				else onupdateselected({ mountType: e.currentTarget.value as any })
			}}>
			{#if !singleOutlet && !sharedOutlet('mountType')}<option value="">— mixed —</option>{/if}
			{#each Object.entries(MOUNT_LABELS) as [key, label]}
				<option value={key}>{label}</option>
			{/each}
		</select>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Cable</span>
		<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={singleOutlet ? singleOutlet.cableType : (sharedOutlet('cableType') ?? '')}
			onchange={e => {
				if (!e.currentTarget.value) return
				if (singleOutlet) onupdate(singleOutlet.id, { cableType: e.currentTarget.value as any })
				else onupdateselected({ cableType: e.currentTarget.value as any })
			}}>
			{#if !singleOutlet && !sharedOutlet('cableType')}<option value="">— mixed —</option>{/if}
			{#each Object.entries(CABLE_COLORS) as [key, val]}
				<option value={key}>{val.label}</option>
			{/each}
		</select>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-12 shrink-0">Room</span>
		<input type="text" class="w-20 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={singleOutlet ? (singleOutlet.roomNumber ?? '') : (sharedOutlet('roomNumber') ?? '')}
			placeholder={!singleOutlet && sharedOutlet('roomNumber') === undefined ? '— mixed —' : '—'}
			onchange={e => {
				const v = e.currentTarget.value || undefined
				if (singleOutlet) onupdate(singleOutlet.id, { roomNumber: v })
				else onupdateselected({ roomNumber: v })
			}} />
	</label>

	{#if singleOutlet}
		<div class="flex items-center gap-2 text-gray-400">
			<span class="w-12 shrink-0">Pos</span>
			<span class="font-mono text-[10px]">{Math.round(singleOutlet.position.x)}, {Math.round(singleOutlet.position.y)} mm</span>
		</div>
	{/if}

	<div class="flex items-center gap-1 pt-1 border-t border-gray-100">
		<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
			onclick={ondelete}>
			<Icon name="trash" size={10} /> Delete {selectedIds.size > 1 ? selectedIds.size : ''}
		</button>
	</div>
</Window>
