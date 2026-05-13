<script lang="ts">
	import { Icon, Search } from '$lib'
	import { slide } from 'svelte/transition'
	import type { CatalogProduct, ProductKind } from '$lib/catalog/types'
	import type { RackRow } from './types'
	import { isProductCompatibleWithRow } from './compat'

	let { products = [], contextRow, onadd, onaddcustom, ondelete }: {
		products?: CatalogProduct[]
		contextRow?: RackRow
		onadd?: (product: CatalogProduct) => void
		onaddcustom?: (product: Omit<CatalogProduct, 'seeded'>) => void
		ondelete?: (id: string) => void
	} = $props()

	let query = $state('')
	let kindFilter = $state<ProductKind | 'all'>('rack')
	let colorFilter = $state<'all' | 'Black' | 'White'>('Black')
	let ruFilter = $state<'all' | 45 | 52>('all')
	let builderOpen = $state(false)
	let compatibleOnly = $state(true)		// Auto-filter to products compatible with the active row (on by default when a row context exists)

	let custom = $state({
		maker: '',
		sku: '',
		kind: 'rack' as ProductKind,
		description: '',
		ru: 45,
		widthMm: 600,
		depthMm: 914,
		color: 'Black',
	})

	let makers = $derived(Array.from(new Set(products.map(p => p.maker))).sort())
	let makerFilter = $state<string>('Panduit')

	let filtered = $derived.by(() => {
		const q = query.trim().toLowerCase()
		return products.filter(p => {
			if (kindFilter !== 'all' && p.kind !== kindFilter) return false
			if (colorFilter !== 'all' && p.color !== colorFilter) return false
			if (ruFilter !== 'all' && p.ru !== ruFilter) return false
			if (makerFilter !== 'all' && p.maker !== makerFilter) return false
			if (q && !p.sku.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false
			if (compatibleOnly && contextRow && (p.kind === 'rack' || p.kind === 'vcm')) {
				if (!isProductCompatibleWithRow(p, contextRow).ok) return false
			}
			return true
		})
	})

	function addCustom() {
		if (!custom.sku.trim() || !custom.maker.trim()) return
		const id = `${custom.maker.toLowerCase().replace(/\s+/g, '-')}-${custom.sku}`
		onaddcustom?.({
			id,
			maker: custom.maker.trim(),
			sku: custom.sku.trim(),
			kind: custom.kind,
			description: custom.description.trim() || `${custom.sku}`,
			ru: custom.kind === 'rack' || custom.kind === 'vcm' ? custom.ru : undefined,
			widthMm: custom.widthMm || undefined,
			depthMm: custom.depthMm || undefined,
			color: custom.color || undefined,
		})
		// Reset for next entry
		custom.sku = ''
		custom.description = ''
		builderOpen = false
	}

	const kinds: { value: ProductKind | 'all'; label: string }[] = [
		{ value: 'rack', label: 'Racks' },
		{ value: 'vcm', label: 'VCMs' },
		{ value: 'accessory', label: 'Accessories' },
		{ value: 'all', label: 'All' },
	]
</script>

<div class="space-y-2 p-2">
	<!-- Custom Product Builder -->
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2 text-gray-500 text-[10px] uppercase tracking-wider">
			<span class="flex items-center gap-1"><Icon name="plus" size={11} /> Custom Product</span>
			<button
				onclick={() => builderOpen = !builderOpen}
				class={['transition p-1 rounded hover:bg-slate-200', builderOpen && 'rotate-180']}
				aria-label="Toggle custom product form">
				<Icon name="edit" size={12} />
			</button>
		</div>

		{#if builderOpen}
			<div class="grid grid-cols-2 gap-1 gap-x-2 text-xs" transition:slide>
				<label class="text-[10px] text-gray-500">Maker
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.maker} placeholder="e.g. Chatsworth" />
				</label>
				<label class="text-[10px] text-gray-500">SKU
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs font-mono" bind:value={custom.sku} placeholder="e.g. CPI-45RU" />
				</label>
				<label class="text-[10px] text-gray-500">Kind
					<select class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.kind}>
						<option value="rack">Rack</option>
						<option value="vcm">VCM</option>
						<option value="accessory">Accessory</option>
						<option value="device">Device</option>
					</select>
				</label>
				<label class="text-[10px] text-gray-500">Color
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.color} placeholder="Black / White / ..." />
				</label>
				<label class="text-[10px] text-gray-500 col-span-2">Description
					<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.description} />
				</label>
				{#if custom.kind === 'rack' || custom.kind === 'vcm'}
					<label class="text-[10px] text-gray-500">RU
						<input type="number" min="1" max="60" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.ru} />
					</label>
					<div></div>
				{/if}
				<label class="text-[10px] text-gray-500">Width (mm)
					<input type="number" min="1" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.widthMm} />
				</label>
				<label class="text-[10px] text-gray-500">Depth (mm)
					<input type="number" min="1" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={custom.depthMm} />
				</label>
				<button
					class="col-span-2 mt-1 h-6 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
					disabled={!custom.sku.trim() || !custom.maker.trim()}
					onclick={addCustom}>
					Add to Catalog
				</button>
			</div>
		{/if}
	</div>

	<hr class="border-gray-200" />

	<!-- Filters -->
	<div class="space-y-1.5">
		<Search bind:value={query} placeholder="Search SKU or description…" />

		<div class="flex gap-0.5 rounded overflow-hidden border border-gray-200 text-[11px]">
			{#each kinds as k}
				<button
					class="flex-1 h-6 px-1 transition-colors
						{kindFilter === k.value ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}"
					onclick={() => kindFilter = k.value}>
					{k.label}
				</button>
			{/each}
		</div>

		<div class="grid grid-cols-3 gap-1 text-[11px]">
			<select class="h-6 px-1 border border-gray-300 rounded" bind:value={makerFilter} aria-label="Maker filter">
				<option value="all">All makers</option>
				{#each makers as m}
					<option value={m}>{m}</option>
				{/each}
			</select>
			<select class="h-6 px-1 border border-gray-300 rounded" bind:value={colorFilter} aria-label="Color filter">
				<option value="all">Any color</option>
				<option value="Black">Black</option>
				<option value="White">White</option>
			</select>
			<select class="h-6 px-1 border border-gray-300 rounded" bind:value={ruFilter} aria-label="RU filter">
				<option value="all">Any RU</option>
				<option value={45}>45 RU</option>
				<option value={52}>52 RU</option>
			</select>
		</div>

		{#if contextRow}
			<label class="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none">
				<input type="checkbox" bind:checked={compatibleOnly} class="accent-blue-600" />
				<span>Compatible with <strong class="text-gray-800">{contextRow.label}</strong> only</span>
			</label>
		{/if}

		<div class="text-[10px] text-gray-400">{filtered.length} of {products.length} products</div>
	</div>

	<!-- Product list -->
	<div class="space-y-1">
		{#each filtered as p (p.id)}
			<div class="border border-gray-200 rounded bg-white hover:bg-blue-50/40 transition-colors">
				<div class="p-1.5 flex items-start gap-2">
					<!-- Color swatch -->
					{#if p.color}
						<div class="w-3 h-3 mt-0.5 rounded-sm border border-gray-400 shrink-0"
							style:background-color={p.color.toLowerCase() === 'white' ? '#fff' : p.color.toLowerCase() === 'black' ? '#1f2937' : p.color}></div>
					{:else}
						<div class="w-3 h-3 mt-0.5 shrink-0"></div>
					{/if}

					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1.5">
							<code class="text-[11px] font-mono font-semibold text-gray-800 truncate">{p.sku}</code>
							<span class="text-[9px] px-1 rounded bg-gray-100 text-gray-500 uppercase tracking-wider">{p.kind}</span>
							{#if !p.seeded}
								<span class="text-[9px] px-1 rounded bg-amber-100 text-amber-700">custom</span>
							{/if}
						</div>
						<div class="text-[10px] text-gray-500 leading-tight line-clamp-2">{p.description}</div>
						<div class="text-[10px] text-gray-400 mt-0.5 flex gap-2 flex-wrap">
							{#if p.ru}<span>{p.ru}RU</span>{/if}
							{#if p.widthMm}<span>W {p.widthMm}mm</span>{/if}
							{#if p.depthMm}<span>D {p.depthMm}mm</span>{/if}
							{#if p.adjustable}<span class="text-blue-600">adjustable</span>{/if}
							{#if p.maker !== 'Panduit'}<span class="text-gray-500">· {p.maker}</span>{/if}
						</div>
					</div>

					<div class="flex flex-col gap-0.5 shrink-0">
						{#if p.kind === 'rack' || p.kind === 'vcm'}
							<button
								class="h-5 px-1.5 text-[10px] rounded bg-blue-600 text-white hover:bg-blue-500"
								title="Add to active row"
								onclick={() => onadd?.(p)}>
								+ Add
							</button>
						{/if}
						{#if !p.seeded}
							<button
								class="h-5 px-1.5 text-[10px] rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
								title="Delete custom product"
								onclick={() => ondelete?.(p.id)}>
								Delete
							</button>
						{:else if p.productUrl}
							<a class="h-5 px-1.5 text-[10px] rounded bg-gray-50 text-gray-500 hover:bg-gray-100 flex items-center justify-center border border-gray-200"
								href={p.productUrl} target="_blank" rel="noopener"
								title="View on maker site">
								↗
							</a>
						{/if}
					</div>
				</div>
			</div>
		{/each}

		{#if filtered.length === 0}
			<div class="py-4 text-center text-xs text-gray-400">No products match these filters.</div>
		{/if}
	</div>
</div>
