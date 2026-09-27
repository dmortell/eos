<script lang="ts">
	// A CHIP PICKER for free-text tags (tree-views-plan §3.3): the tags as chips (× removes one), and an input that
	// suggests from the given pools (the global vocabulary, the project's tags, defaults — store/tags.ts) as you type.
	// Enter / comma / Tab (with text) adds; ↑ ↓ pick a suggestion; Backspace in an empty box removes the last chip.
	// Bulk mode: `counts` + `total` mark chips that only some of the items have ("AV 2/5"); clicking such a chip's
	// + gives it to all of them.
	import { Icon } from '$lib'
	import { tagSuggestions, mergeTags, withoutTags, normTag } from '../store/tags'
	import { tick } from 'svelte'

	let { tags, pools = [], onchange, counts, total = 0, onall, placeholder = 'Add a tag…', autofocus = false, freeText = true }: {
		tags: string[]; pools?: readonly (readonly string[])[]; onchange: (tags: string[]) => void
		/** Bulk: how many of the `total` items have each tag (key lower-cased); `onall` gives a partial one to all. */
		counts?: Record<string, number>; total?: number; onall?: (tag: string) => void
		placeholder?: string; autofocus?: boolean
		/** false = only the suggestions can be picked (e.g. a list of known values). */
		freeText?: boolean
	} = $props()

	let q = $state(''), open = $state(false), hi = $state(0)
	const sugg = $derived(tagSuggestions(pools, q, tags))
	let inputEl = $state<HTMLInputElement>()
	$effect(() => { if (autofocus && inputEl) tick().then(() => inputEl?.focus()) })

	function add(t: string) {
		const n = normTag(t); if (!n) return
		if (!freeText && !sugg.some((s) => s.toLowerCase() === n.toLowerCase())) return
		onchange(mergeTags(tags, [n])); q = ''; hi = 0
	}
	const remove = (t: string) => onchange(withoutTags(tags, [t]))
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); open = true; hi = (hi + 1) % sugg.length }
		else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); open = true; hi = (hi - 1 + sugg.length) % sugg.length }
		else if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && q.trim())) {
			if (!q.trim() && e.key !== 'Enter') return
			e.preventDefault(); e.stopPropagation()
			if (open && sugg[hi] && (!q.trim() || sugg[hi].toLowerCase().includes(q.trim().toLowerCase()))) add(sugg[hi]); else add(q)
		} else if (e.key === 'Backspace' && !q && tags.length) remove(tags[tags.length - 1])
		else if (e.key === 'Escape' && open) { e.stopPropagation(); open = false }
		else e.stopPropagation()   // typing never reaches the page's shortcuts
	}
	const partial = (t: string) => counts && total > 1 && (counts[t.toLowerCase()] ?? 0) < total
</script>

<div class="tp" class:focus={open}>
	{#each tags as t (t.toLowerCase())}
		<span class="chip" class:partial={partial(t)} title={partial(t) ? `${counts![t.toLowerCase()]} of ${total} have it` : t}>
			{t}{#if partial(t)}<em>{counts![t.toLowerCase()]}/{total}</em>
				{#if onall}<button class="x" title="Give it to all {total}" aria-label="Add {t} to all" onclick={() => onall?.(t)}><Icon name="plus" size={9} /></button>{/if}{/if}
			<button class="x" title="Remove {t}" aria-label="Remove {t}" onclick={() => remove(t)}><Icon name="x" size={10} /></button>
		</span>
	{/each}
	<input bind:this={inputEl} bind:value={q} {placeholder} spellcheck="false"
		onfocus={() => { open = true; hi = 0 }} onblur={() => setTimeout(() => (open = false), 120)}
		oninput={() => { open = true; hi = 0 }} onkeydown={key} />
	{#if open && sugg.length}
		<div class="tp-menu" role="listbox">
			{#each sugg as s, i (s)}
				<button role="option" aria-selected={i === hi} class:hi={i === hi} onmousedown={(e) => { e.preventDefault(); add(s) }}><Icon name="tag" size={11} />{s}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tp { position:relative; display:flex; flex-wrap:wrap; align-items:center; gap:3px; min-height:24px; padding:2px 4px; background:var(--input); border:1px solid var(--line); border-radius:4px; }
	.tp.focus { border-color:var(--accent); }
	.chip { display:inline-flex; align-items:center; gap:2px; font-size:11px; line-height:16px; padding:0 2px 0 6px; border-radius:9px; background:var(--active); color:var(--text); border:1px solid var(--accent-dim); white-space:nowrap; }
	.chip.partial { background:none; border-style:dashed; color:var(--muted); }
	.chip em { font-style:normal; font-size:9px; color:var(--faint); margin-left:2px; }
	.x { display:inline-grid; place-items:center; width:14px; height:14px; padding:0; border:none; border-radius:50%; background:none; color:var(--muted); cursor:pointer; }
	.x:hover { background:var(--line); color:var(--text); }
	input { flex:1; min-width:70px; background:none; border:none; color:var(--text); font-size:11px; padding:2px 2px; }
	input:focus { outline:none; }
	.tp-menu { position:absolute; left:-1px; right:-1px; top:calc(100% + 2px); z-index:160; max-height:200px; overflow:auto; padding:3px; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 8px 24px #0008; }
	.tp-menu button { display:flex; align-items:center; gap:6px; padding:3px 6px; border:none; border-radius:4px; background:none; color:var(--text); font-size:11px; text-align:left; cursor:pointer; }
	.tp-menu button :global(svg) { color:var(--faint); }
	.tp-menu button.hi, .tp-menu button:hover { background:var(--hover); }
</style>
