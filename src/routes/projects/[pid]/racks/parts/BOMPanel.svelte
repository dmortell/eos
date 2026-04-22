<script lang="ts">
	import { Icon } from '$lib'
	import type { RackConfig, RackRow } from './types'
	import type { CatalogProduct } from '$lib/catalog/types'
	import { computeRowBOM, computeProjectBOM, computeConsolidatedBOM, type BOMLine } from './bom'
	import { exportBomToExcel } from './bomExcel'

	let { rows = [], racks = [], activeRowId = '', catalog = [], projectName = '', floorLabel = '', roomLabel = '' }: {
		rows?: RackRow[]
		racks?: RackConfig[]
		activeRowId?: string
		catalog?: CatalogProduct[]
		projectName?: string
		floorLabel?: string
		roomLabel?: string
	} = $props()

	let scope = $state<'row' | 'project' | 'consolidated'>('row')
	let busyExport = $state(false)

	let activeRow = $derived(rows.find(r => r.id === activeRowId))

	let lines = $derived.by<BOMLine[]>(() => {
		if (scope === 'row') {
			return activeRow ? computeRowBOM(activeRow, racks, catalog) : []
		}
		if (scope === 'consolidated') {
			return computeConsolidatedBOM(rows, racks, catalog)
		}
		return computeProjectBOM(rows, racks, catalog)
	})

	let totalQty = $derived(lines.reduce((s, l) => s + l.qty, 0))

	async function doExport() {
		busyExport = true
		try {
			const rowLines = computeProjectBOM(rows, racks, catalog)
			const consolidated = computeConsolidatedBOM(rows, racks, catalog)
			await exportBomToExcel(rowLines, consolidated, { projectName, floorLabel, roomLabel })
		} finally {
			busyExport = false
		}
	}

	const scopeLabels = {
		row: 'Current row',
		project: 'Project (by row)',
		consolidated: 'Consolidated',
	} as const
</script>

<div class="p-2 space-y-2 text-xs">
	<!-- Scope tabs -->
	<div class="flex gap-0.5 rounded overflow-hidden border border-gray-200 text-[11px]">
		{#each ['row', 'project', 'consolidated'] as s}
			<button
				class="flex-1 h-6 px-1 transition-colors
					{scope === s ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}"
				onclick={() => scope = s as typeof scope}>
				{scopeLabels[s as keyof typeof scopeLabels]}
			</button>
		{/each}
	</div>

	<!-- Export action -->
	<button
		class="w-full h-7 px-2 rounded bg-green-700 text-white text-[11px] font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1 shadow-sm"
		disabled={busyExport || lines.length === 0}
		onclick={doExport}>
		<Icon name="download" size={12} />
		{busyExport ? 'Generating…' : 'Export to Excel'}
	</button>

	<div class="text-[10px] text-gray-400 flex justify-between">
		<span>{lines.length} line{lines.length === 1 ? '' : 's'}</span>
		<span>total qty {totalQty}</span>
	</div>

	<!-- BOM list -->
	{#if lines.length === 0}
		<div class="text-center py-6 text-[11px] text-gray-400">
			{#if scope === 'row' && !activeRow}
				No active row.
			{:else}
				No items yet — add racks & VCMs to see the BOM.
			{/if}
		</div>
	{:else}
		<div class="space-y-0.5">
			{#each lines as line ((line.rowLabel ?? '') + '|' + line.sku + '|' + (line.note ?? ''))}
				<div class="border border-gray-200 rounded bg-white hover:bg-blue-50/30 p-1.5">
					<div class="flex items-start gap-1.5">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-1.5">
								{#if line.productUrl}
									<a href={line.productUrl} target="_blank" rel="noopener"
										class="font-mono text-[11px] font-semibold text-blue-700 hover:underline truncate">{line.sku}</a>
								{:else}
									<code class="font-mono text-[11px] font-semibold text-gray-800 truncate">{line.sku}</code>
								{/if}
								<span class="text-[9px] px-1 rounded bg-gray-100 text-gray-500 whitespace-nowrap">{line.group}</span>
							</div>
							<div class="text-[10px] text-gray-500 leading-tight line-clamp-2">{line.description}</div>
							<div class="text-[10px] text-gray-400 mt-0.5 flex gap-2 flex-wrap">
								{#if line.rowLabel}<span class="font-medium text-gray-500">{line.rowLabel}</span>{/if}
								{#if line.note}<span class="italic">{line.note}</span>{/if}
							</div>
						</div>
						<span class="font-mono text-xs font-semibold text-gray-800 shrink-0 min-w-6 text-right">{line.qty}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
