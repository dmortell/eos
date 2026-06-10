<script lang="ts">
	// Labeled colour picker for the property windows: a swatch button that opens a dropdown grid
	// of preset colours (incl. transparent + None). `value` is a CSS colour, 'transparent', or
	// 'none' (no paint). Mirrors PropText/PropSelect's labeled-row layout.
	let { label = '', value = $bindable('#000000'), onchange, allowNone = true, class: className = '' }: {
		label?: string
		value?: string
		onchange?: (c: string) => void
		allowNone?: boolean
		class?: string
	} = $props()

	const COLORS = [
		'#000000', '#ffffff', '#6b7280', '#dc2626', '#ea580c', '#d97706', '#eab308', '#16a34a',
		'#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#92400e', 'transparent',
	]
	let open = $state(false)
	function pick(c: string) { value = c; onchange?.(c); open = false }
	// CSS background for a swatch: real colours show solid; transparent shows a checker; none shows a slash.
	const checker = 'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 50% / 8px 8px'
	const bg = (c: string) => (c === 'transparent' ? checker : c === 'none' ? '#fff' : c)
	const labelOf = (c: string) => (c === 'transparent' ? 'Transparent' : c === 'none' ? 'None' : c)
</script>

<div class="flex items-center justify-between gap-2 {className}">
	{#if label}<span class="w-24 shrink-0 text-xs text-zinc-500">{label}</span>{/if}
	<div class="relative w-full">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<button type="button" class="flex h-6 w-full items-center gap-2 rounded border border-zinc-300 px-1 text-xs hover:bg-slate-50" onclick={() => (open = !open)}>
			<span class="h-4 w-4 shrink-0 rounded border border-zinc-300" style:background={bg(value)}>
				{#if value === 'none'}<span class="block h-full w-full rotate-45 border-l border-red-500"></span>{/if}
			</span>
			<span class="flex-1 truncate text-left text-zinc-600">{labelOf(value)}</span>
		</button>
		{#if open}
			<!-- click-away -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onmousedown={() => (open = false)}></div>
			<div class="absolute right-0 z-50 mt-1 w-40 rounded border border-zinc-200 bg-white p-1.5 shadow-lg">
				<div class="grid grid-cols-4 gap-1">
					{#each COLORS as c (c)}
						<button type="button" class="h-7 w-7 rounded border border-zinc-300 {value === c ? 'ring-2 ring-blue-500' : ''}" style:background={bg(c)} title={labelOf(c)} onclick={() => pick(c)} aria-label={labelOf(c)}></button>
					{/each}
				</div>
				<label class="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
					Custom <input type="color" class="h-6 w-full rounded border" value={value.startsWith('#') ? value : '#000000'} oninput={(e) => pick((e.currentTarget as HTMLInputElement).value)} />
				</label>
				{#if allowNone}
					<button type="button" class="mt-1 w-full rounded border border-zinc-200 px-1 py-0.5 text-[11px] text-zinc-600 hover:bg-slate-100" onclick={() => pick('none')}>None (no fill / border)</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
