<!-- The RIGHT-CLICK MENU on a selected item (UX21; Dave: "ok for context-menu, but keep right-click = Esc while
     drawing"): its commands with their keys, so the keys are learnt from it. Esc or a click outside closes it. -->
<script lang="ts">
	import type { MenuItem } from './cadMenus'

	let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props()
	let el: HTMLDivElement | undefined = $state()
	/** Kept on screen: opened near the right / bottom edge, it flips to the other side of the pointer. */
	const pos = $derived.by(() => {
		const w = el?.offsetWidth ?? 220, h = el?.offsetHeight ?? 260, vw = typeof window !== 'undefined' ? window.innerWidth : 2000, vh = typeof window !== 'undefined' ? window.innerHeight : 1200
		return { left: x + w > vw ? Math.max(4, x - w) : x, top: y + h > vh ? Math.max(4, y - h) : y }
	})
	function pick(it: Exclude<MenuItem, '-'>) { if (it.disabled) return; onclose(); it.run() }
	// on Windows the browser's own `contextmenu` comes AFTER the button is let go — i.e. after this menu opened — and lands
	// on the backdrop: the first one within a moment of opening is that same right-click, not a new one (UX review R1)
	const opened = performance.now()
	function backdropMenu(e: MouseEvent) { e.preventDefault(); if (performance.now() - opened > 400) onclose() }
</script>

<svelte:window onkeydowncapture={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose() } }} />

<button class="backdrop" aria-label="Close the menu" onclick={onclose} oncontextmenu={backdropMenu}></button>
<div bind:this={el} class="pop" role="menu" tabindex="-1" oncontextmenu={(e) => e.preventDefault()} style:left="{pos.left}px" style:top="{pos.top}px">
	{#each items as it, i (i)}
		{#if it === '-'}<div class="sep"></div>
		{:else}
			<button class="item" role="menuitem" disabled={it.disabled} title={it.title} onclick={() => pick(it)}>
				<span class="lbl">{it.label}</span><span class="key">{it.key ?? ''}</span>
			</button>
		{/if}
	{/each}
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 95; background: none; border: none; cursor: default; }
	.pop { position: fixed; z-index: 96; min-width: 210px; padding: 4px; background: var(--cad-panel, white); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; box-shadow: 0 14px 36px rgb(0 0 0 / 0.22); font-size: 12px; }
	.item { display: flex; align-items: center; width: 100%; padding: 4px 8px; border-radius: 4px; text-align: left; color: var(--cad-text); }
	.item:hover:not(:disabled) { background: #dbeafe; }
	.item:disabled { color: var(--cad-faint); }
	.lbl { flex: 1; white-space: nowrap; }
	.key { margin-left: 18px; font-size: 11px; color: var(--cad-muted); white-space: nowrap; }
	.sep { height: 1px; margin: 4px 6px; background: var(--cad-line); }
</style>
