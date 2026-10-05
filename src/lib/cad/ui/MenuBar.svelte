<!-- The MENU BAR (UX review S4, Dave: the Pages menu bar for opening dialogs): dialogs and project-wide commands, so
     the tool strip holds only tools. Each item shows its key (the menu teaches the keys) and a tick when it's on. Click
     a title to open it; while one is open, hovering another title opens that one; Esc or a click outside closes it. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { Menu, MenuItem } from './cadMenus'

	let { menus, right }: { menus: Menu[]; right?: Snippet } = $props()
	let open = $state<string | null>(null)
	/** A closed menu gives the keys back to the drawing (UX review: the View button stayed outlined after Esc). */
	function close() { open = null; if (document.activeElement instanceof HTMLElement) document.activeElement.blur() }
	function pick(it: Exclude<MenuItem, '-'>) { if (it.disabled) return; close(); it.run() }
</script>

<svelte:window onkeydowncapture={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }} />

{#if open}<button class="backdrop" aria-label="Close the menu" onclick={close}></button>{/if}
<nav class="menubar">
	{#each menus as m (m.label)}
		<div class="wrap">
			<button class="title" class:open={open === m.label} onclick={() => (open = open === m.label ? null : m.label)} onmouseenter={() => { if (open) open = m.label }}>{m.label}</button>
			{#if open === m.label}
				<div class="pop" role="menu">
					{#each m.items as it, i (i)}
						{#if it === '-'}<div class="sep"></div>
						{:else}
							<button class="item" role="menuitem" disabled={it.disabled} title={it.title} onclick={() => pick(it)}>
								<span class="tick">{it.checked ? '✓' : ''}</span><span class="lbl">{it.label}</span><span class="key">{it.key ?? ''}</span>
							</button>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	<span class="grow"></span>
	{#if right}{@render right()}{/if}
</nav>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 70; background: none; border: none; cursor: default; }
	.menubar { grid-area: menu; position: relative; z-index: 71; display: flex; align-items: stretch; gap: 1px; padding: 0 4px; background: var(--cad-panel); border-bottom: 1px solid var(--cad-line); font-size: 12px; }
	.wrap { position: relative; display: flex; align-items: stretch; }
	.title { padding: 0 9px; border-radius: 4px; color: var(--cad-text); }
	.title:hover, .title.open { background: var(--cad-hover); }
	.pop { position: absolute; top: 100%; left: 0; min-width: 230px; margin-top: 2px; padding: 4px; z-index: 72; background: var(--cad-panel); border: 1px solid var(--cad-line); border-radius: 6px; box-shadow: 0 14px 36px rgb(0 0 0 / 0.22); }
	.item { display: flex; align-items: center; width: 100%; padding: 4px 8px 4px 4px; border-radius: 4px; text-align: left; color: var(--cad-text); }
	.item:hover:not(:disabled) { background: #dbeafe; }
	.item:disabled { color: var(--cad-faint); }
	.tick { width: 16px; color: #2563eb; font-size: 11px; }
	.lbl { flex: 1; white-space: nowrap; }
	.key { margin-left: 18px; font-size: 11px; color: var(--cad-muted); white-space: nowrap; }
	.sep { height: 1px; margin: 4px 6px; background: var(--cad-line); }
	.grow { flex: 1; }
</style>
