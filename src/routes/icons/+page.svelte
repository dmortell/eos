<script lang="ts">
	// Icon reference — every name Icon.svelte accepts: the Lucide map and the
	// Kestrel CAD set (kestrel-adoption.md A2). Shadowed = a Kestrel glyph whose
	// name is taken by Lucide; use it with the k- prefix shown on its card.
	import { Titlebar, Icon } from '$lib'
	import { KESTREL_ICONS } from '$lib/ui/kestrel-icons'
	import { LUCIDE_NAMES } from '$lib/ui/Icon.svelte'

	let q = $state('')
	const match = (n: string) => !q.trim() || n.toLowerCase().includes(q.trim().toLowerCase())
	let lucideShown = $derived(LUCIDE_NAMES.filter(match))
	let kestrelShown = $derived(Object.keys(KESTREL_ICONS).filter(match))
	const shadowed = (n: string) => LUCIDE_NAMES.includes(n)
</script>

<Titlebar title="EOS — Icons" />
<div class="p-4 text-sm text-zinc-700">
	<div class="mb-3 flex items-center gap-3">
		<input class="w-64 rounded border border-zinc-300 px-2 py-1" placeholder="Filter icons…" bind:value={q} />
		<span class="text-xs text-zinc-400">{lucideShown.length} Lucide · {kestrelShown.length} Kestrel — click a card to copy its name</span>
	</div>

	<h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Kestrel CAD ({kestrelShown.length})</h2>
	<div class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1">
		{#each kestrelShown as n (n)}
			{@const use = shadowed(n) ? `k-${n}` : n}
			<button class="flex flex-col items-center gap-1 rounded border border-zinc-200 bg-white p-2 hover:bg-zinc-100"
				title={shadowed(n) ? `"${n}" is taken by Lucide — use "${use}"` : use}
				onclick={() => navigator.clipboard?.writeText(use)}>
				<Icon name={use} size={22} />
				<span class="max-w-full truncate text-[10px] {shadowed(n) ? 'text-amber-700' : 'text-zinc-500'}">{use}</span>
			</button>
		{/each}
	</div>

	<h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Lucide ({lucideShown.length})</h2>
	<div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1">
		{#each lucideShown as n (n)}
			<button class="flex flex-col items-center gap-1 rounded border border-zinc-200 bg-white p-2 hover:bg-zinc-100"
				title={n} onclick={() => navigator.clipboard?.writeText(n)}>
				<Icon name={n} size={22} />
				<span class="max-w-full truncate text-[10px] text-zinc-500">{n}</span>
			</button>
		{/each}
	</div>
</div>
