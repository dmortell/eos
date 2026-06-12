<script lang="ts">
	// Labeled color picker for the property windows: a swatch button → dropdown of preset colors
	// (incl. transparent + None), a custom picker, and an opacity slider. `value` is a CSS color
	// string — '#rrggbb', '#rrggbbaa' (with alpha), 'transparent', or 'none' (no paint).
	let { label = '', value = $bindable('#000000'), onchange, allowNone = true, allowOpacity = true, class: className = '' }: {
		label?: string
		value?: string
		onchange?: (c: string) => void
		allowNone?: boolean
		allowOpacity?: boolean
		class?: string
	} = $props()

	const COLORS = [
		'#000000', '#ffffff', '#6b7280', '#dc2626', '#ea580c', '#d97706', '#eab308', '#16a34a',
		'#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#92400e', 'transparent',
	]
	let open = $state(false)

	type Parsed = { special: string | null; hex: string; a: number }
	function parse(v: string): Parsed {
		if (v === 'transparent' || v === 'none') return { special: v, hex: '#000000', a: 1 }
		if (/^#[0-9a-f]{8}$/i.test(v)) return { special: null, hex: v.slice(0, 7), a: parseInt(v.slice(7, 9), 16) / 255 }
		return { special: null, hex: /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000', a: 1 }
	}
	const compose = (hex: string, a: number) => (a >= 0.999 ? hex : hex + Math.round(a * 255).toString(16).padStart(2, '0'))
	let p = $derived(parse(value))

	function set(v: string) { value = v; onchange?.(v) }
	function pick(c: string) { set(c === 'transparent' || c === 'none' ? c : compose(c, p.a)); open = false }
	function setOpacity(pct: number) { if (!p.special) set(compose(p.hex, Math.max(0, Math.min(100, pct)) / 100)) }

	const checker = 'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 50% / 8px 8px'
	const bg = (c: string) => (c === 'transparent' ? checker : c === 'none' ? '#fff' : c)
	const labelOf = (c: string) => (c === 'transparent' ? 'Transparent' : c === 'none' ? 'None' : c.length > 7 ? `${c.slice(0, 7)} ${Math.round(parse(c).a * 100)}%` : c)
</script>

<div class="flex items-center justify-between gap-2 {className}">
	{#if label}<span class="w-24 shrink-0 text-xs text-zinc-500">{label}</span>{/if}
	<div class="relative w-full">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<button type="button" class="flex h-6 w-full items-center gap-2 rounded border border-zinc-300 px-1 text-xs hover:bg-slate-50" onclick={() => (open = !open)}>
			<span class="grid h-4 w-4 shrink-0 place-items-center rounded border border-zinc-300" style:background={bg(value)}>
				{#if value === 'none'}<span class="h-3.5 w-px rotate-45 bg-red-500"></span>{/if}
			</span>
			<span class="flex-1 truncate text-left text-zinc-600">{labelOf(value)}</span>
		</button>
		{#if open}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onmousedown={() => (open = false)}></div>
			<div class="absolute right-0 z-50 mt-1 w-44 rounded border border-zinc-200 bg-white p-1.5 shadow-lg">
				<div class="grid grid-cols-4 gap-1">
					{#each COLORS as c (c)}
						<button type="button" class="h-7 w-7 rounded border border-zinc-300 {p.hex === c || value === c ? 'ring-2 ring-blue-500' : ''}" style:background={bg(c)} title={labelOf(c)} onclick={() => pick(c)} aria-label={labelOf(c)}></button>
					{/each}
				</div>
				<label class="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">Custom
					<input type="color" class="h-6 w-full rounded border" value={p.hex} oninput={(e) => pick((e.currentTarget as HTMLInputElement).value)} />
				</label>
				{#if allowOpacity}
					<label class="mt-1.5 block text-[10px] text-zinc-500">
						Opacity {Math.round(p.a * 100)}%
						<input type="range" min="0" max="100" class="w-full accent-blue-600" value={Math.round(p.a * 100)} disabled={!!p.special} oninput={(e) => setOpacity(Number((e.currentTarget as HTMLInputElement).value))} />
					</label>
				{/if}
				{#if allowNone}
					<button type="button" class="mt-1 w-full rounded border border-zinc-200 px-1 py-0.5 text-[11px] text-zinc-600 hover:bg-slate-100" onclick={() => pick('none')}>None (no fill / border)</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
