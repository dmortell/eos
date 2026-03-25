<script lang="ts">
	import { Icon } from '$lib'
	import type { PatchSettings, CustomCableType } from './types'
	import { CABLE_TYPES } from './constants'

	let {
		open = false,
		settings,
		customCableTypes = [],
		onclose,
		onsavesettings,
		onsavecabletypes,
	}: {
		open: boolean
		settings: PatchSettings
		customCableTypes: CustomCableType[]
		onclose?: () => void
		onsavesettings?: (s: PatchSettings) => void
		onsavecabletypes?: (types: CustomCableType[]) => void
	} = $props()

	// Local copies for editing
	let localSettings = $state<PatchSettings>({ ...settings })
	let localCustomTypes = $state<CustomCableType[]>([...customCableTypes])
	let newLabel = $state('')
	let newCategory = $state<'copper' | 'fiber' | 'other'>('copper')
	let newColor = $state('#6b7280')

	// Sync when dialog opens
	$effect(() => {
		if (open) {
			localSettings = { ...settings }
			localCustomTypes = customCableTypes.map(t => ({ ...t }))
		}
	})

	function addCustomType() {
		if (!newLabel.trim()) return
		const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
		localCustomTypes = [...localCustomTypes, { id, label: newLabel.trim(), category: newCategory, color: newColor }]
		newLabel = ''
		newColor = '#6b7280'
	}

	function removeCustomType(id: string) {
		localCustomTypes = localCustomTypes.filter(t => t.id !== id)
	}

	function save() {
		onsavesettings?.(localSettings)
		onsavecabletypes?.(localCustomTypes)
		onclose?.()
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={onclose} onkeydown={e => e.key === 'Escape' && onclose?.()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-[420px] max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<!-- Header -->
			<div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
				<h2 class="font-semibold text-sm">Patching Settings</h2>
				<button class="h-6 px-2 text-[11px] rounded border border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-600" onclick={onclose}>Close</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4 space-y-5">
				<!-- Default cable type -->
				<div class="space-y-1.5">
					<div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Defaults</div>
					<div class="flex items-center gap-2">
						<label class="text-[11px] text-gray-500 w-24">Cable type</label>
						<select
							class="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 bg-white"
							bind:value={localSettings.defaultCableType}
						>
							{#each CABLE_TYPES as ct}
								<option value={ct.id}>{ct.label}</option>
							{/each}
							{#each localCustomTypes as ct}
								<option value={ct.id}>{ct.label}</option>
							{/each}
						</select>
					</div>
					<div class="flex items-center gap-2">
						<label class="text-[11px] text-gray-500 w-24">Cable color</label>
						<input type="color" class="w-7 h-7 rounded border border-gray-200 cursor-pointer" bind:value={localSettings.defaultCableColor} />
						<span class="text-[10px] text-gray-400 font-mono">{localSettings.defaultCableColor}</span>
					</div>
				</div>

				<!-- Display options -->
				<div class="space-y-1.5">
					<div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Display</div>
					<label class="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
						<input type="checkbox" class="rounded" bind:checked={localSettings.showLabels} />
						Show port labels
					</label>
					<label class="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
						<input type="checkbox" class="rounded" bind:checked={localSettings.showLengths} />
						Show cable lengths
					</label>
					<div class="flex items-center gap-2">
						<label class="text-[11px] text-gray-500 w-24">Group by</label>
						<select class="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 bg-white" bind:value={localSettings.groupBy}>
							<option value="rack">Rack</option>
							<option value="device">Device</option>
							<option value="cableType">Cable type</option>
						</select>
					</div>
				</div>

				<!-- Custom cable types -->
				<div class="space-y-2">
					<div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom Cable Types</div>

					{#if localCustomTypes.length > 0}
						<div class="space-y-1">
							{#each localCustomTypes as ct, i (ct.id)}
								<div class="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
									<input type="color" class="w-5 h-5 rounded border border-gray-200 cursor-pointer shrink-0"
										value={ct.color}
										oninput={e => {
											localCustomTypes[i] = { ...ct, color: (e.target as HTMLInputElement).value }
										}} />
									<input type="text" class="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white"
										value={ct.label}
										oninput={e => {
											localCustomTypes[i] = { ...ct, label: (e.target as HTMLInputElement).value }
										}} />
									<select class="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-500"
										value={ct.category}
										onchange={e => {
											localCustomTypes[i] = { ...ct, category: (e.target as HTMLSelectElement).value as 'copper' | 'fiber' | 'other' }
										}}>
										<option value="copper">Copper</option>
										<option value="fiber">Fiber</option>
										<option value="other">Other</option>
									</select>
									<button class="text-gray-300 hover:text-red-500 transition-colors shrink-0"
										onclick={() => removeCustomType(ct.id)}>
										<Icon name="trash2" size={12} />
									</button>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Add new custom type -->
					<div class="flex items-center gap-1.5 pt-1">
						<input type="color" class="w-5 h-5 rounded border border-gray-200 cursor-pointer shrink-0" bind:value={newColor} />
						<input type="text" class="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white"
							placeholder="Label (e.g. MPO-12)"
							bind:value={newLabel}
							onkeydown={e => e.key === 'Enter' && addCustomType()} />
						<select class="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-500" bind:value={newCategory}>
							<option value="copper">Copper</option>
							<option value="fiber">Fiber</option>
							<option value="other">Other</option>
						</select>
						<button
							class="h-5 w-5 rounded bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-colors shrink-0 disabled:opacity-30"
							disabled={!newLabel.trim()}
							onclick={addCustomType}
						><Icon name="plus" size={10} /></button>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0">
				<button class="h-7 px-3 text-[11px] rounded border border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-600" onclick={onclose}>Cancel</button>
				<button class="h-7 px-3 text-[11px] rounded bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors" onclick={save}>Save</button>
			</div>
		</div>
	</div>
{/if}
