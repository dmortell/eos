<script lang="ts">
	/**
	 * §3.7 assignment dialogs for the block-selected ports:
	 *  - 'generate': create new locations in a zone and PIN them to the ports
	 *  - 'existing': pin the ports to an existing location's ports
	 * Pins are sticky (portAssignments) — zone re-generation never moves them.
	 */
	import { Icon, Firestore } from '$lib'
	import type { ElevationsEditor } from '../editor.svelte'
	import { DEFAULT_LOC_TYPES, type LocType } from '../../frames/parts/types'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'
	import { templateExample, templateIssues, templateForLegacyFormat } from '$lib/elevation/labelTemplate'

	let { editor, db = new Firestore(), mode, onclose }: {
		editor: ElevationsEditor
		db?: Firestore
		mode: 'generate' | 'existing'
		onclose: () => void
	} = $props()

	// ── Label format presets (global user library, `labelFormats` collection) ──
	type Preset = { id: string; name: string; template: string }
	let presets = $state<Preset[]>([])
	$effect(() => db.subscribeMany('labelFormats', (docs: any[]) => {
		presets = docs.filter(d => d.template).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
	}))

	const BUILTINS = [
		{ key: 'legacy', name: 'Standard' },
		{ key: 'period', name: 'Periods' },
		{ key: 'hyphen', name: 'Hyphens' },
	] as const

	// Current selection derived from the stored format: a template matching a
	// library preset selects it; any other template is "custom"; no template =
	// the legacy separator built-ins. forceCustom keeps the Custom editor open
	// even when the template happens to EQUAL a saved preset — without it,
	// picking "Custom…" would instantly re-derive back to the matching preset
	// and the template input could never appear.
	let forceCustom = $state(false)
	let formatChoice = $derived.by(() => {
		if (forceCustom) return 'custom'
		const t = editor.labelFormat.template
		if (!t) return `builtin:${editor.labelFormat.separator}`
		const p = presets.find(p => p.template === t)
		return p ? `preset:${p.id}` : 'custom'
	})
	// Seed from the stored template so reopening the dialog shows it
	let customTemplate = $state(editor.labelFormat.template ?? '')
	let presetName = $state('')
	let effectiveTemplate = $derived(editor.labelFormat.template
		?? templateForLegacyFormat(editor.labelFormat, editor.floorFormat))
	let example = $derived(templateExample(effectiveTemplate))
	let customIssues = $derived(customTemplate ? templateIssues(customTemplate) : [])

	function pickFormat(v: string) {
		forceCustom = v === 'custom'
		if (v.startsWith('builtin:')) {
			editor.updateLabelFormat({ separator: v.slice(8) as any, template: undefined })
		} else if (v.startsWith('preset:')) {
			const p = presets.find(p => p.id === v.slice(7))
			if (p) editor.updateLabelFormat({ template: p.template })
		} else if (v === 'custom') {
			customTemplate = editor.labelFormat.template ?? effectiveTemplate
			editor.updateLabelFormat({ template: customTemplate })
		}
	}

	function applyCustom() {
		if (customTemplate && customIssues.length === 0) editor.updateLabelFormat({ template: customTemplate })
	}

	async function savePreset() {
		if (!presetName.trim() || !customTemplate || customIssues.length > 0) return
		await db.save('labelFormats', { id: `fmt-${Date.now().toString(36)}`, name: presetName.trim(), template: customTemplate })
		presetName = ''
	}

	const zones = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
	let zone = $state(editor.activeZone)
	let portCount = $derived(editor.selectedPorts.size)

	// generate mode
	let portsPerLocation = $state(2)
	let startNumber = $state(0) // 0 = auto (next free)
	let locationType = $state<LocType>('desk')
	let isHighLevel = $state(false)
	let roomNumber = $state('')
	let nextFree = $derived(((editor.zoneLocations[zone] ?? []).reduce((m, l) => Math.max(m, l.locationNumber), 0)) + 1)
	let locCount = $derived(Math.ceil(portCount / Math.max(1, portsPerLocation)))

	// existing mode
	let locationNumber = $state(0)
	let zoneLocs = $derived(editor.zoneLocations[zone] ?? [])
	$effect(() => { if (zoneLocs.length && !zoneLocs.find(l => l.locationNumber === locationNumber)) locationNumber = zoneLocs[0].locationNumber })

	let types = $derived([...DEFAULT_LOC_TYPES.filter(t => t !== 'N/A'), ...(editor.framesData?.customLocationTypes ?? [])])

	function apply() {
		if (mode === 'generate') {
			editor.assignPortsToNewLocations({
				zone,
				startNumber: startNumber > 0 ? startNumber : undefined,
				portsPerLocation,
				locationType,
				isHighLevel,
				roomNumber: roomNumber || undefined,
			})
		} else {
			editor.assignPortsToLocation(zone, locationNumber)
		}
		onclose()
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={onclose}>
	<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 {mode === 'generate' ? 'w-96' : 'w-80'}" onclick={e => e.stopPropagation()}>
		<div class="flex items-center gap-2 mb-3">
			<Icon name="mapPin" size={14} />
			<span class="text-sm font-semibold text-gray-700">
				{mode === 'generate' ? 'Auto-generate locations' : 'Assign to existing location'}
			</span>
			<div class="flex-1"></div>
			<span class="text-[11px] text-gray-400">{portCount} port{portCount !== 1 ? 's' : ''}</span>
		</div>

		<div class="space-y-2 text-xs">
			<label class="flex items-center gap-2">
				<span class="w-24 text-gray-500 shrink-0">Zone</span>
				<select class="flex-1 h-7 px-1 border border-gray-200 rounded bg-white font-mono" bind:value={zone}>
					{#each zones as z}<option value={z}>{z}{(editor.zoneLocations[z]?.length ?? 0) ? ` (${editor.zoneLocations[z].length})` : ''}</option>{/each}
				</select>
			</label>

			{#if mode === 'generate'}
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Ports / location</span>
					<input type="number" min="1" max="99" class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={portsPerLocation} />
				</label>
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Start number</span>
					<input type="number" min="0" class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={startNumber} placeholder="auto" />
					<span class="text-[10px] text-gray-400">0 = next ({nextFree})</span>
				</label>
				<div class="flex items-start gap-2">
					<span class="w-24 text-gray-500 shrink-0 pt-1">Type</span>
					<div class="flex-1 flex flex-wrap gap-1">
						{#each types as t}
							<button class="px-1.5 h-5.5 rounded border text-[10px] font-mono {LOC_TYPE_COLORS[t] ?? 'bg-gray-100 border-gray-200 text-gray-600'} {locationType === t ? 'ring-2 ring-blue-400' : ''}"
								title={LOC_TYPE_LABELS[t] ?? t}
								onclick={() => locationType = t}>{t}</button>
						{/each}
					</div>
				</div>
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Label format</span>
					<select class="flex-1 h-7 px-1 border border-gray-200 rounded bg-white text-[11px]"
						value={formatChoice}
						onchange={e => pickFormat(e.currentTarget.value)}>
						<optgroup label="Built-in">
							{#each BUILTINS as b (b.key)}
								<option value={'builtin:' + b.key}>{b.name} · {templateExample(templateForLegacyFormat({ ...editor.labelFormat, separator: b.key }, editor.floorFormat)).normal}</option>
							{/each}
						</optgroup>
						{#if presets.length}
							<optgroup label="Library">
								{#each presets as p (p.id)}
									<option value={'preset:' + p.id}>{p.name} · {templateExample(p.template).normal}</option>
								{/each}
							</optgroup>
						{/if}
						<option value="custom">Custom…</option>
					</select>
				</label>
				<div class="flex items-center gap-3">
					<span class="w-24 shrink-0"></span>
					{#if !editor.labelFormat.template}
						<label class="flex items-center gap-1 text-gray-500">
							<input type="checkbox" checked={editor.labelFormat.includeZone}
								onchange={e => editor.updateLabelFormat({ includeZone: e.currentTarget.checked })} /> zone
						</label>
						<label class="flex items-center gap-1 text-gray-500">
							<input type="checkbox" checked={editor.labelFormat.includeRoom}
								onchange={e => editor.updateLabelFormat({ includeRoom: e.currentTarget.checked })} /> room no.
						</label>
					{:else}
						<span class="font-mono text-[10px] text-gray-600">{example.normal}</span>
						<span class="font-mono text-[10px] text-gray-400" title="high-level variant">{example.highLevel}</span>
					{/if}
					<span class="text-[10px] text-gray-400">project-wide setting</span>
				</div>
				{#if formatChoice === 'custom'}
					<div class="flex items-start gap-2">
						<span class="w-24 text-gray-500 shrink-0 pt-1.5">Template</span>
						<div class="flex-1 space-y-1">
							<input class="w-full h-7 px-2 border border-gray-200 rounded font-mono text-[11px]"
								bind:value={customTemplate} onblur={applyCustom}
								onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCustom() } }}
								placeholder={'"L"FF.Z.NNN-SPP[-H]'} />
							{#if customIssues.length}
								<div class="text-[10px] text-amber-500">{customIssues.join(' · ')}</div>
							{:else if customTemplate}
								<div class="font-mono text-[10px] text-gray-500">{templateExample(customTemplate).normal} <span class="text-gray-400">/ {templateExample(customTemplate).highLevel}</span></div>
							{/if}
							<div class="text-[10px] text-gray-400 leading-snug">
								F floor · Z zone · N location · S room letter · P port · A port as letter · R room no. · H high-level.
								Repeat = zero-pad (NNN → 001). "quotes" for literal text, [ ] only renders when its tokens have values.
							</div>
							<div class="flex items-center gap-1">
								<input class="flex-1 h-6 px-2 border border-gray-200 rounded text-[11px]" bind:value={presetName} placeholder="preset name" />
								<button class="px-2 h-6 text-[11px] rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
									disabled={!presetName.trim() || !customTemplate || customIssues.length > 0}
									onclick={savePreset}>Save to library</button>
							</div>
							{#if presets.length}
								<div class="space-y-0.5 pt-1">
									{#each presets as p (p.id)}
										<div class="flex items-center gap-1.5 text-[10px] text-gray-500">
											<span class="truncate flex-1">{p.name} · <span class="font-mono">{p.template}</span></span>
											<button class="w-4 h-4 shrink-0 flex items-center justify-center rounded text-gray-600 hover:text-red-600 hover:bg-red-50"
												title="Delete preset from the library (all projects)" onclick={() => db.delete('labelFormats', p.id)}>×</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Room no.</span>
					<input class="flex-1 h-7 px-2 border border-gray-200 rounded" bind:value={roomNumber} maxlength="4" placeholder="optional" />
					<label class="flex items-center gap-1 text-gray-500">
						<input type="checkbox" bind:checked={isHighLevel} /> HL
					</label>
				</label>
				<div class="text-[10px] text-gray-400 leading-snug">
					Creates <b>{locCount}</b> location{locCount !== 1 ? 's' : ''} numbered from {startNumber > 0 ? startNumber : nextFree}
					and pins their labels to the selected ports (in rack order). Pinned labels never move on re-generation.
				</div>
			{:else}
				<label class="flex items-center gap-2">
					<span class="w-24 text-gray-500 shrink-0">Location</span>
					<select class="flex-1 h-7 px-1 border border-gray-200 rounded bg-white font-mono" bind:value={locationNumber}>
						{#each zoneLocs as l (l.locationNumber)}
							<option value={l.locationNumber}>{String(l.locationNumber).padStart(3, '0')} · {l.locationType} · {l.portCount}p{l.isHighLevel ? ' · HL' : ''}</option>
						{/each}
					</select>
				</label>
				{#if zoneLocs.length === 0}
					<div class="text-[10px] text-amber-500">Zone {zone} has no locations yet — use Auto-generate instead.</div>
				{:else}
					<div class="text-[10px] text-gray-400 leading-snug">
						Pins this location's ports (1…{zoneLocs.find(l => l.locationNumber === locationNumber)?.portCount ?? '?'})
						to the selected ports in rack order. Any previous pins for this location are moved here.
					</div>
				{/if}
			{/if}
		</div>

		<div class="flex gap-2 justify-end mt-3">
			<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={onclose}>Cancel</button>
			<button class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
				disabled={portCount === 0 || (mode === 'existing' && zoneLocs.length === 0)}
				onclick={apply}>Assign</button>
		</div>
	</div>
</div>
