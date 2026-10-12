<!-- A table's ⋯ menu (review R79): its exports and rarely used actions, so the bar keeps to find, filter and what acts
     on the selection. The right-click menu's look (ContextMenu), opened under the button. -->
<script lang="ts">
	import { Icon } from '$lib'
	import type { MenuItem } from './cadMenus'
	import ContextMenu from './ContextMenu.svelte'

	let { items, title = 'More: exports and other actions' }: { items: MenuItem[]; title?: string } = $props()
	let at = $state<{ x: number; y: number } | null>(null)
	function open(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
		at = at ? null : { x: r.left, y: r.bottom + 2 }
	}
</script>

<button type="button" class="more" class:on={!!at} {title} aria-label={title} aria-haspopup="menu" aria-expanded={!!at} onclick={open}><Icon name="ellipsis" size={14} /></button>
{#if at}<ContextMenu x={at.x} y={at.y} {items} onclose={() => (at = null)} />{/if}

<style>
	.more { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 22px; border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-muted); }
	.more:hover, .more.on { background: var(--cad-hover); color: var(--cad-text); }
	.more:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
</style>
