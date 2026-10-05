<!-- A table's scope (UX review T6): This view (the level / room / sheet you're looking at) · Selection (only what's
     selected — the quickest way to see which 12 of 47 are picked) · All. -->
<script lang="ts">
	import { SCOPES, type TableState } from './tableKit.svelte'

	let { t, view = 'This view' }: { t: TableState; view?: string } = $props()
</script>

<select class="scope" title="Which rows: this view's, only the selected ones, or the whole project" value={t.scope} onchange={(e) => { t.scope = e.currentTarget.value as typeof t.scope; t.save() }}>
	{#each SCOPES as [k, label] (k)}<option value={k}>{k === 'view' ? view : label}</option>{/each}
</select>

<style>
	.scope { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
</style>
