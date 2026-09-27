<script lang="ts">
	// A SMART folder's filter (tree-views-plan §3.4): drawing types (incl. Models), tags, disciplines, categories and
	// places — any-of within a row, all of the rows together. The folder fills itself with what matches.
	import { Icon } from '$lib'
	import TagPicker from './TagPicker.svelte'
	import { KIND_LABELS, type TreeFilter } from '../store/treeViews'
	import { SHEET_KINDS } from '../store/schema'
	import { tick } from 'svelte'

	let { filter, tagPools, options, onsave, oncancel }: {
		filter: TreeFilter | undefined; tagPools: readonly (readonly string[])[]
		options: { disciplines: string[]; categories: string[]; places: { id: string; path: string }[] }
		onsave: (f: TreeFilter) => void; oncancel: () => void
	} = $props()

	// a local draft, taken once when the editor opens
	// svelte-ignore state_referenced_locally
	let d = $state<TreeFilter>(structuredClone($state.snapshot(filter) ?? {}))
	const KINDS = ['model', ...SHEET_KINDS]
	const toggleKind = (k: string) => { const ks = d.kinds ?? []; d.kinds = ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k] }
	const pathOf = (id: string) => options.places.find((p) => p.id === id)?.path ?? '(deleted place)'
	// keys go to the editor, not to the button that opened it (a Space / Enter there would add another folder)
	function grabFocus(node: HTMLElement) { tick().then(() => node.focus()) }
	function save() {
		const clean: TreeFilter = {}
		for (const k of ['kinds', 'tags', 'disciplines', 'categories', 'places'] as const) if (d[k]?.length) clean[k] = [...d[k]!]
		onsave(clean)
	}
</script>

<div class="sf" role="dialog" aria-label="Smart folder filter" tabindex="-1" use:grabFocus onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); oncancel() } }}>
	<div class="sf-head"><Icon name="funnel" size={12} /> Smart folder — shows what matches</div>
	<div class="sf-lbl">Drawing type</div>
	<div class="sf-kinds">
		{#each KINDS as k (k)}
			<button class:on={d.kinds?.includes(k)} class:model={k === 'model'} onclick={() => toggleKind(k)}>{KIND_LABELS[k] ?? k}</button>
		{/each}
	</div>
	<div class="sf-lbl">Tags <em>any of</em></div>
	<TagPicker tags={d.tags ?? []} pools={tagPools} onchange={(t) => (d.tags = t)} />
	<div class="sf-lbl">Discipline</div>
	<TagPicker tags={d.disciplines ?? []} pools={[options.disciplines]} placeholder="Add a discipline…" onchange={(t) => (d.disciplines = t)} />
	<div class="sf-lbl">Category</div>
	<TagPicker tags={d.categories ?? []} pools={[options.categories]} placeholder="Add a category…" onchange={(t) => (d.categories = t)} />
	<div class="sf-lbl">At / under a place</div>
	<div class="sf-places">
		{#each d.places ?? [] as id (id)}
			<span class="chip">{pathOf(id)}<button title="Remove" aria-label="Remove" onclick={() => (d.places = (d.places ?? []).filter((x) => x !== id))}><Icon name="x" size={10} /></button></span>
		{/each}
		<select value="" onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v && !d.places?.includes(v)) d.places = [...(d.places ?? []), v]; (e.currentTarget as HTMLSelectElement).value = '' }}>
			<option value="">Add a place…</option>
			{#each options.places as p (p.id)}<option value={p.id}>{p.path}</option>{/each}
		</select>
	</div>
	<div class="sf-btns">
		<span class="sf-note">Empty = everything</span>
		<button class="ghost" onclick={oncancel}>Cancel</button>
		<button class="primary" onclick={save}>Save</button>
	</div>
</div>

<style>
	.sf:focus { outline:none; }
	.sf { display:flex; flex-direction:column; gap:4px; width:290px; padding:8px 10px 10px; background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:0 12px 34px #0009; font-size:11px; color:var(--text); }
	.sf-head { display:flex; align-items:center; gap:6px; font-weight:600; font-size:12px; padding-bottom:2px; }
	.sf-head :global(svg) { color:var(--accent); }
	.sf-lbl { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); margin-top:4px; }
	.sf-lbl em { font-style:normal; text-transform:none; letter-spacing:0; }
	.sf-kinds { display:flex; flex-wrap:wrap; gap:3px; }
	.sf-kinds button { font-size:11px; padding:1px 7px; border-radius:9px; border:1px solid var(--line); background:none; color:var(--muted); cursor:pointer; }
	.sf-kinds button.on { background:var(--active); border-color:var(--accent); color:var(--text); }
	.sf-kinds button.model.on { border-color:var(--model); color:var(--model); }
	.sf-places { display:flex; flex-wrap:wrap; gap:3px; align-items:center; }
	.chip { display:inline-flex; align-items:center; gap:2px; padding:0 2px 0 6px; border-radius:9px; background:var(--active); border:1px solid var(--accent-dim); }
	.chip button { display:inline-grid; place-items:center; width:14px; height:14px; padding:0; border:none; border-radius:50%; background:none; color:var(--muted); cursor:pointer; }
	select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; font-size:11px; padding:2px 4px; max-width:100%; }
	.sf-btns { display:flex; align-items:center; gap:6px; margin-top:8px; }
	.sf-note { flex:1; color:var(--faint); font-size:10px; }
	.sf-btns button { font-size:11px; padding:3px 10px; border-radius:4px; border:1px solid var(--line); background:var(--panel2); color:var(--text); cursor:pointer; }
	.sf-btns button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
	.sf-btns button.ghost { background:none; border-color:transparent; color:var(--muted); }
</style>
