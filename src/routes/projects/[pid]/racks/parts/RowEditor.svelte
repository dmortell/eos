<script lang="ts">
	import { Icon } from '$lib'
	import { slide } from 'svelte/transition'
	import type { RackRow, RackConfig, RowContainment } from './types'
	import type { CatalogProduct } from '$lib/catalog/types'
	import {
		isProductCompatibleWithRow,
		rowContainmentRules,
		rowHomogeneity,
		CONTAINMENT_OPTIONS,
	} from './compat'

	let {
		row,
		racks = [],
		catalog = [],
		onupdate,
		onrename,
		onquickfill,
		onaddn,
		oncopyrowdefaults,
	}: {
		row: RackRow
		racks?: RackConfig[]
		catalog?: CatalogProduct[]
		onupdate?: (partial: Partial<RackRow['defaults']> & Record<string, unknown>) => void
		onrename?: (label: string) => void
		onquickfill?: (kind: 'rack' | 'vcm', productId: string) => void
		onaddn?: (productId: string, count: number) => void
		oncopyrowdefaults?: () => void
	} = $props()

	// Depth presets: 30" and 36" in mm
	const DEPTH_PRESETS: { value: number; label: string }[] = [
		{ value: 762, label: '30"' },
		{ value: 914, label: '36"' },
	]
	const RU_PRESETS = [45, 52]
	const COLOR_PRESETS = ['Black', 'White']

	let rowRacks = $derived(racks.filter(r => r.rowId === row.id))
	let contRules = $derived(rowContainmentRules(rowRacks))
	let homo = $derived(rowHomogeneity(row, racks))

	// Separate catalog into rack / vcm products compatible with row defaults
	let compatibleRacks = $derived(
		catalog.filter(p => p.kind === 'rack' && isProductCompatibleWithRow(p, row).ok)
	)
	let compatibleVcms = $derived(
		catalog.filter(p => p.kind === 'vcm' && isProductCompatibleWithRow(p, row).ok)
	)

	let expanded = $state(true)
	let rackFillValue = $state('')
	let vcmFillValue = $state('')
	let rackAddCount = $state(2)
	let vcmAddCount = $state(3)

	function setDefault(field: string, value: unknown) {
		onupdate?.({ [field]: value } as any)
	}

	function setContainment(c: RowContainment) {
		setDefault('containment', c)
	}

	function fillRacks() {
		if (!rackFillValue) return
		onquickfill?.('rack', rackFillValue)
		rackFillValue = ''
	}
	function fillVcms() {
		if (!vcmFillValue) return
		onquickfill?.('vcm', vcmFillValue)
		vcmFillValue = ''
	}

	const currentContainment: RowContainment = $derived(row.defaults?.containment ?? 'none')
</script>

<div class="p-2 border-b border-gray-200 bg-gray-50/50 space-y-1.5 text-xs">
	<!-- Header -->
	<div class="flex items-center gap-1.5">
		<span class="text-[10px] uppercase tracking-wider text-gray-500 flex-1">Row Settings</span>
		<button
			onclick={() => expanded = !expanded}
			class={['p-1 rounded hover:bg-slate-200 transition', expanded && 'rotate-180']}
			aria-label="Toggle row settings">
			<Icon name="chevronDown" size={12} />
		</button>
	</div>

	{#if expanded}
		<div class="space-y-1.5" transition:slide>
			<!-- Name -->
			<label class="flex items-center gap-1.5">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">Name</span>
				<input
					class="flex-1 h-6 px-1 border border-gray-300 rounded"
					value={row.label}
					onchange={e => onrename?.(e.currentTarget.value)} />
			</label>

			<!-- RU -->
			<div class="flex items-center gap-1.5">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">RU</span>
				<div class="flex gap-0.5 flex-1">
					{#each RU_PRESETS as ru}
						<button
							class="flex-1 h-6 rounded text-[11px] transition-colors
								{row.defaults?.heightU === ru ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}"
							onclick={() => setDefault('heightU', ru)}>{ru}</button>
					{/each}
					<button
						class="h-6 px-1.5 rounded text-[10px] transition-colors
							{row.defaults?.heightU == null ? 'bg-gray-300 text-gray-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}"
						title="Clear"
						onclick={() => setDefault('heightU', undefined)}>×</button>
				</div>
			</div>

			<!-- Color -->
			<div class="flex items-center gap-1.5">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">Color</span>
				<div class="flex gap-0.5 flex-1">
					{#each COLOR_PRESETS as c}
						<button
							class="flex-1 h-6 rounded text-[11px] transition-colors flex items-center justify-center gap-1
								{row.defaults?.color === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}"
							onclick={() => setDefault('color', c)}>
							<span class="w-2.5 h-2.5 rounded-sm border border-gray-400"
								style:background-color={c === 'White' ? '#fff' : '#1f2937'}></span>
							{c}
						</button>
					{/each}
					<button
						class="h-6 px-1.5 rounded text-[10px] transition-colors
							{row.defaults?.color == null ? 'bg-gray-300 text-gray-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}"
						title="Clear"
						onclick={() => setDefault('color', undefined)}>×</button>
				</div>
			</div>

			<!-- Depth -->
			<div class="flex items-center gap-1.5">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">Depth</span>
				<div class="flex gap-0.5 flex-1">
					{#each DEPTH_PRESETS as d}
						<button
							class="flex-1 h-6 rounded text-[11px] transition-colors
								{row.defaults?.depthMm === d.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}"
							title="{d.value}mm"
							onclick={() => setDefault('depthMm', d.value)}>{d.label}</button>
					{/each}
					<input
						type="number"
						min="300"
						max="1500"
						class="w-16 h-6 px-1 border border-gray-300 rounded"
						placeholder="mm"
						value={row.defaults?.depthMm && !DEPTH_PRESETS.some(d => d.value === row.defaults?.depthMm) ? row.defaults.depthMm : ''}
						onchange={e => { const v = parseInt(e.currentTarget.value); setDefault('depthMm', v > 0 ? v : undefined) }} />
				</div>
			</div>

			<!-- Containment -->
			<div class="flex items-center gap-1.5">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">Contain</span>
				<select
					class="flex-1 h-6 px-1 border border-gray-300 rounded"
					value={currentContainment}
					onchange={e => setContainment(e.currentTarget.value as RowContainment)}>
					{#each CONTAINMENT_OPTIONS as opt}
						<option
							value={opt.value}
							disabled={(opt.value === 'hac' && contRules.disableHac) ||
								(opt.value === 'cac' && contRules.disableCac) ||
								(opt.value === 'combined' && (contRules.disableHac || contRules.disableCac))}>
							{opt.label}
						</option>
					{/each}
				</select>
			</div>

			{#if contRules.reasons.length > 0}
				<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
					<div class="font-medium">Containment restrictions:</div>
					<ul class="list-disc pl-3">
						{#each contRules.reasons as r}<li>{r}</li>{/each}
					</ul>
				</div>
			{/if}

			<!-- Homogeneity -->
			{#if !homo.homogeneous}
				<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
					<div class="font-medium flex items-center gap-1">
						<Icon name="warning" size={10} /> Row is heterogeneous ({homo.mismatches.length})
					</div>
					<ul class="list-disc pl-3 mt-0.5">
						{#each homo.mismatches.slice(0, 4) as m}
							<li><strong>{m.rackLabel}</strong>: {m.field} {String(m.rackValue)} ≠ {String(m.rowValue)}</li>
						{/each}
						{#if homo.mismatches.length > 4}
							<li class="text-gray-500">…and {homo.mismatches.length - 4} more</li>
						{/if}
					</ul>
					<button
						class="mt-1 w-full h-5 rounded text-[10px] bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
						onclick={oncopyrowdefaults}
						title="Apply row defaults to all racks (overrides per-rack values)">
						Apply row defaults to all
					</button>
				</div>
			{/if}

			<!-- Compose / Quick-fill -->
			<div class="pt-1 border-t border-gray-200 space-y-2">
				<div class="text-[10px] uppercase tracking-wider text-gray-500">Compose row</div>

				<!-- Racks -->
				<div class="space-y-1">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] text-gray-500">Rack</span>
						<span class="text-[9px] text-gray-400">{compatibleRacks.length} compatible</span>
					</div>
					<select
						class="block w-full min-w-0 h-6 px-1 border border-gray-300 rounded text-[11px] font-mono"
						bind:value={rackFillValue}
						aria-label="Select rack SKU">
						<option value="">— select SKU —</option>
						{#each compatibleRacks as p}
							<option value={p.id} title={p.description}>{p.sku}</option>
						{/each}
					</select>
					<div class="flex items-center gap-1">
						<input type="number" min="1" max="20" class="w-10 h-6 px-1 border border-gray-300 rounded text-[11px] text-center"
							bind:value={rackAddCount} aria-label="Rack add count" />
						<button
							class="flex-1 h-6 px-1 text-[10px] rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
							disabled={!rackFillValue || rackAddCount < 1}
							onclick={() => { onaddn?.(rackFillValue, rackAddCount); }}>
							+ Add {rackAddCount}
						</button>
						<button
							class="h-6 px-1 text-[10px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
							disabled={!rackFillValue || rowRacks.filter(r => r.type !== 'vcm').length === 0}
							title="Apply to existing racks in this row"
							onclick={fillRacks}>
							↺ Fill
						</button>
					</div>
				</div>

				<!-- VCMs (optional — rows do not require VCMs) -->
				<div class="space-y-1">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] text-gray-500">VCM <span class="text-gray-400">(optional)</span></span>
						<span class="text-[9px] text-gray-400">{compatibleVcms.length} compatible</span>
					</div>
					<select
						class="block w-full min-w-0 h-6 px-1 border border-gray-300 rounded text-[11px] font-mono"
						bind:value={vcmFillValue}
						aria-label="Select VCM SKU">
						<option value="">— select SKU —</option>
						{#each compatibleVcms as p}
							<option value={p.id} title={p.description}>{p.sku}</option>
						{/each}
					</select>
					<div class="flex items-center gap-1">
						<input type="number" min="1" max="20" class="w-10 h-6 px-1 border border-gray-300 rounded text-[11px] text-center"
							bind:value={vcmAddCount} aria-label="VCM add count" />
						<button
							class="flex-1 h-6 px-1 text-[10px] rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
							disabled={!vcmFillValue || vcmAddCount < 1}
							onclick={() => { onaddn?.(vcmFillValue, vcmAddCount); }}>
							+ Add {vcmAddCount}
						</button>
						<button
							class="h-6 px-1 text-[10px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
							disabled={!vcmFillValue || rowRacks.filter(r => r.type === 'vcm').length === 0}
							title="Apply to existing VCMs in this row"
							onclick={fillVcms}>
							↺ Fill
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
