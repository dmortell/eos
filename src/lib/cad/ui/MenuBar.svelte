<!-- The MENU BAR (UX review S4, User: the Pages menu bar for opening dialogs): dialogs and project-wide commands, so
     the tool strip holds only tools. Each item shows its key (the menu teaches the keys) and a tick when it's on. Click
     a title to open it; while one is open, hovering another title opens that one; Esc or a click outside closes it. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { Menu, MenuItem } from './cadMenus'

	let { menus, right }: { menus: Menu[]; right?: Snippet } = $props()
	let open = $state<string | null>(null)
	/** The submenu open in the open menu (hovered). */
	let sub = $state<string | null>(null)
	/** A menu opened by HOVERING its title (while another was open): the click that follows is that same pointer
	 *  arriving, not a "close it" (clicking Edit with File open shut both, review R61). */
	let hoverOpened: string | null = null, hoverTimer: ReturnType<typeof setTimeout> | undefined
	type Leaf = Extract<MenuItem, { run: () => void }>
	/** A closed menu gives the keys back to the drawing (UX review: the View button stayed outlined after Esc). */
	function close() { open = null; sub = null; if (document.activeElement instanceof HTMLElement) document.activeElement.blur() }
	function pick(it: Leaf) { if (it.disabled) return; close(); it.run() }
	function clickTitle(label: string) {
		if (hoverOpened === label) { hoverOpened = null; return }
		open = open === label ? null : label
		sub = null
	}
	function hoverTitle(label: string) {
		if (!open || open === label) return
		open = label; sub = null
		hoverOpened = label
		clearTimeout(hoverTimer)
		hoverTimer = setTimeout(() => { hoverOpened = null }, 600)
	}
</script>

<svelte:window onkeydowncapture={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }} />

{#if open}<button class="backdrop" aria-label="Close the menu" onclick={close}></button>{/if}
<nav class="menubar">
	{#each menus as m (m.label)}
		<div class="wrap">
			<button class="title" class:open={open === m.label} onclick={() => clickTitle(m.label)} onmouseenter={() => hoverTitle(m.label)}>{m.label}</button>
			{#if open === m.label}
				<div class="pop" role="menu">
					{#each m.items as it, i (i)}
						{#if it === '-'}<div class="sep"></div>
						{:else if 'children' in it}
							<!-- hover opens it; a click on its name opens it too (R7-27: the click used to toggle it shut again right after
							     the hover had opened it, so it seemed to open only from the ▸) -->
							<div class="subwrap" role="none" onmouseenter={() => { if (!it.disabled) sub = it.label }}>
								<button class="item" class:on={sub === it.label} role="menuitem" aria-haspopup="menu" disabled={it.disabled} title={it.title} onclick={() => (sub = it.label)}>
									<span class="tick"></span><span class="lbl">{it.label}</span><span class="key">▸</span>
								</button>
								{#if sub === it.label}
									<div class="pop sub" role="menu">
										{#each it.children as ch, j (j)}
											{#if ch === '-'}<div class="sep"></div>
											{:else if 'run' in ch}
												<button class="item" role="menuitem" disabled={ch.disabled} title={ch.title} onclick={() => pick(ch)}>
													<span class="tick">{ch.checked ? '✓' : ''}</span><span class="lbl">{ch.label}</span><span class="key">{ch.key ?? ''}</span>
												</button>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<button class="item" role="menuitem" disabled={it.disabled} title={it.title} onclick={() => pick(it)} onmouseenter={() => (sub = null)}>
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
	.item:hover:not(:disabled) { background: var(--cad-sel, #dbeafe); }
	.item:disabled { color: var(--cad-faint); }
	.tick { width: 16px; color: var(--cad-link, #2563eb); font-size: 11px; }
	.lbl { flex: 1; white-space: nowrap; }
	.key { margin-left: 18px; font-size: 11px; color: var(--cad-muted); white-space: nowrap; }
	.sep { height: 1px; margin: 4px 6px; background: var(--cad-line); }
	.subwrap { position: relative; }
	.item.on { background: var(--cad-sel, #dbeafe); }
	.pop.sub { top: -5px; left: 100%; margin: 0 0 0 2px; }
	.grow { flex: 1; }
</style>
