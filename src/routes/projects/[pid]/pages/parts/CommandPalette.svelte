<script lang="ts">
	// Ctrl-K command palette (Pages mockup): fuzzy-ish search over drawings/rooms/floors;
	// Enter or click opens the pick. Overlay closes on Esc / backdrop click.
	import { Icon } from '$lib'

	type Item = { title: string; kind: 'plan' | 'sheet' | 'elevation' | 'place'; path?: string }
	let { items = [], onpick, onclose }:
		{ items?: Item[]; onpick?: (i: Item) => void; onclose?: () => void } = $props()

	let query = $state('')
	let sel = $state(0)
	const kindIcon: Record<string, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'box', place: 'crop' }
	let results = $derived.by(() => {
		const q = query.trim().toLowerCase()
		const list = q ? items.filter(i => (i.title + ' ' + (i.path ?? '')).toLowerCase().includes(q)) : items
		return list.slice(0, 30)
	})
	$effect(() => { results; sel = 0 })   // reset highlight when the query changes

	function choose(i: Item | undefined) { if (i) { onpick?.(i); onclose?.() } }
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); onclose?.() }
		else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0) }
		else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]) }
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="cp-back" onclick={() => onclose?.()}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="cp" onclick={(e) => e.stopPropagation()}>
		<div class="cp-search">
			<Icon name="search" size={15} />
			<!-- svelte-ignore a11y_autofocus -->
			<input placeholder="Search drawings, floors, rooms…" bind:value={query} autofocus onkeydown={onKey} />
			<span class="cp-kbd">Esc</span>
		</div>
		<div class="cp-list">
			{#each results as it, i (it.title + i)}
				<!-- svelte-ignore a11y_mouse_events_have_key_events -->
				<button class="cp-item" class:sel={i === sel} onmousemove={() => (sel = i)} onclick={() => choose(it)}>
					<Icon name={kindIcon[it.kind]} size={14} />
					<span class="cp-title">{it.title}</span>
					{#if it.path}<span class="cp-path">{it.path}</span>{/if}
				</button>
			{/each}
			{#if !results.length}<div class="cp-empty">No matches</div>{/if}
		</div>
	</div>
</div>

<style>
	.cp-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:12vh; }
	.cp { width:min(560px,92vw); background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; }
	.cp-search { display:flex; align-items:center; gap:9px; padding:11px 13px; border-bottom:1px solid var(--line-soft); }
	.cp-search :global(svg) { color:var(--muted); flex:0 0 auto; }
	.cp-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:14px; }
	.cp-search input:focus { outline:none; }
	.cp-kbd { font-size:10px; color:var(--faint); border:1px solid var(--line); border-radius:4px; padding:1px 5px; }
	.cp-list { max-height:52vh; overflow-y:auto; padding:5px; }
	.cp-item { display:flex; align-items:center; gap:9px; width:100%; padding:8px 10px; border-radius:6px; background:none; border:none; color:var(--text); text-align:left; }
	.cp-item.sel { background:var(--active); }
	.cp-item :global(svg) { color:var(--muted); flex:0 0 auto; }
	.cp-item.sel :global(svg) { color:var(--accent); }
	.cp-title { flex:1; min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.cp-path { font-size:11px; color:var(--faint); flex:0 0 auto; }
	.cp-empty { padding:16px; text-align:center; font-size:12px; color:var(--faint); }
</style>
