<!-- A table header cell that sorts (UX review T5): click to sort by it, again to reverse, a third time for the table's
     own order. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { TableState } from './tableKit.svelte'

	let { t, key, title, cls = 'px-2', children }: { t: TableState; key: string; title?: string; cls?: string; children: Snippet } = $props()
</script>

<th class="{cls} sortable" {title} aria-sort={t.sortKey === key ? (t.sortDir === 1 ? 'ascending' : 'descending') : 'none'} onclick={() => t.toggle(key)}>
	{@render children()}<span class="arrow">{t.sortKey === key ? (t.sortDir === 1 ? ' ▲' : ' ▼') : ''}</span>
</th>

<style>
	.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
	.sortable:hover { color: var(--cad-text); }
	.arrow { font-size: 9px; color: #2563eb; }
</style>
