<!-- A FILTER CHIP (sheets-organising slice 1): "Category ▾" opens a list of check boxes; picks show as a count on the
     chip ("Category · 2") and a × clears them. Any of the picked values matches (the register ANDs the chips). -->
<script lang="ts">
	let { label, options, picked = $bindable([]) }: { label: string; options: { id: string; label: string }[]; picked: string[] } = $props()
	let open = $state(false)
	function flip(id: string) { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] }
</script>

<span class="chip" class:on={picked.length}>
	<button class="lbl" title={picked.length ? options.filter((o) => picked.includes(o.id)).map((o) => o.label).join(', ') : `Show only some ${label.toLowerCase()} values`} onclick={() => (open = !open)}>
		{label}{picked.length ? ` · ${picked.length}` : ''} ▾</button>
	{#if picked.length}<button class="x" title="Clear" onclick={() => (picked = [])}>×</button>{/if}
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pop" onmouseleave={() => (open = false)}>
			{#each options as o (o.id)}
				<label><input type="checkbox" checked={picked.includes(o.id)} onchange={() => flip(o.id)} /> {o.label}</label>
			{:else}<span class="none">none here</span>{/each}
		</div>
	{/if}
</span>

<style>
	.chip { position: relative; display: inline-flex; align-items: center; border: 1px solid var(--cad-line); border-radius: 10px; background: var(--cad-input); white-space: nowrap; }
	.chip.on { border-color: #93c5fd; background: #dbeafe; color: #1e3a8a; }
	.lbl { padding: 0 8px; color: inherit; }
	.x { padding: 0 6px 0 0; color: inherit; opacity: 0.7; }
	.x:hover { opacity: 1; }
	.pop { position: absolute; top: 100%; left: 0; z-index: 20; min-width: 10rem; max-height: 16rem; overflow: auto; display: flex; flex-direction: column; gap: 1px;
		padding: 4px 6px; border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-panel); box-shadow: 0 4px 12px rgb(0 0 0 / 0.15); color: var(--cad-text); }
	.pop label { display: flex; align-items: center; gap: 4px; }
	.none { color: var(--cad-faint); }
</style>
