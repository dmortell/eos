<!-- A table header cell that sorts (UX review T5): click to sort by it, again to reverse, a third time for the table's
     own order. A real button inside the cell, so Tab reaches it and Enter / Space sort. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { TableState } from './tableKit.svelte'

	let { t, key, title, cls = 'px-2', children }: { t: TableState; key: string; title?: string; cls?: string; children: Snippet } = $props()
</script>

<th class={cls} aria-sort={t.sortKey === key ? (t.sortDir === 1 ? 'ascending' : 'descending') : 'none'}>
	<button type="button" class="sort" {title} onclick={() => t.toggle(key)}>{@render children()}<span class="arrow">{t.sortKey === key ? (t.sortDir === 1 ? ' ▲' : ' ▼') : ''}</span></button>
</th>

<style>
	.sort { font: inherit; font-weight: 600; color: inherit; background: none; border: 0; padding: 0; min-height: 20px; cursor: pointer; user-select: none; white-space: nowrap; text-align: left; }
	.sort:hover { color: var(--cad-text); }
	.sort:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; border-radius: 2px; }
	.arrow { font-size: 9px; color: #2563eb; }
</style>
