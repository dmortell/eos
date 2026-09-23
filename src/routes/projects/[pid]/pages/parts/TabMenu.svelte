<script lang="ts">
	// The "All pages" dropdown (R9 commit 5, review.md §R9) — split out of parts/Pane.svelte's tab-strip
	// verbatim: every open tab + a "New page" entry. Pure render; Pane.svelte still owns which pane this is
	// for (`activeId`/`onPick`/`onNewPage` all close over `pi` there) and whether it's even open at all
	// (`tabMenuOpen`, unchanged — Pane only renders this component inside its own `{#if tabMenuOpen}`).
	import { Icon } from '$lib'
	import type { Kind, Tab } from '../types'

	let { tabs, kindIcon, activeId, onPick, onNewPage }: {
		tabs: Tab[]; kindIcon: Record<Kind, string>; activeId: string
		onPick: (id: string) => void; onNewPage: () => void
	} = $props()
</script>

<div class="tab-menu">
	{#each tabs as t (t.id)}
		<button class="tab-menu-item" class:on={t.id === activeId} onclick={() => onPick(t.id)}>
			<Icon name={kindIcon[t.kind]} size={13} /><span class="grow txt">{t.title}</span>{#if t.dirty}<span class="dirty">•</span>{/if}
		</button>
	{/each}
	<div class="tab-menu-sep"></div>
	<button class="tab-menu-item" onclick={onNewPage}>
		<Icon name="plus" size={13} /><span class="grow txt">New page</span>
	</button>
</div>

<style>
	.tab-menu { position:absolute; top:100%; right:0; z-index:50; margin-top:2px; min-width:190px; max-height:60vh; overflow-y:auto;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 15px 40px #0006; padding:4px; }
	.tab-menu-item { display:flex; align-items:center; gap:7px; width:100%; padding:5px 8px; border-radius:4px; color:var(--text); background:none; border:none; font-size:12px; text-align:left; }
	.tab-menu-item:hover { background:var(--hover); }
	.tab-menu-item.on { background:var(--active); }
	.tab-menu-sep { height:1px; background:var(--line-soft); margin:4px 6px; }
	.dirty { color:var(--accent); font-size:14px; line-height:0; }
	.grow { flex:1; } .txt { text-align:left; background:none; border:none; color:inherit; font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
