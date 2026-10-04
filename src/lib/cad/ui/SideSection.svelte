<!-- A sidebar section with a show / hide toggle (Dave: the sidebar got too long): the title shows or hides its body,
     `actions` sit on the right of the header. Open / closed is remembered per section in this browser. -->
<script lang="ts">
	import type { Snippet } from 'svelte'

	let { key, title, actions, children, first = false }: { key: string; title: string; actions?: Snippet; children: Snippet; first?: boolean } = $props()

	const store = () => `cad:side:${key}`
	let open = $state(read())
	function read(): boolean { try { return localStorage.getItem(store()) !== '0' } catch { return true } }
	function toggle() { open = !open; try { localStorage.setItem(store(), open ? '1' : '0') } catch { /* storage blocked: still toggles */ } }
</script>

<div class="head" class:first>
	<button class="ttl" title={open ? `Hide ${title}` : `Show ${title}`} aria-expanded={open} onclick={toggle}><span class="chev">{open ? '▾' : '▸'}</span>{title}</button>
	{#if actions && open}<span class="acts">{@render actions()}</span>{/if}
</div>
{#if open}{@render children()}{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; padding: 0 0.25rem 0.25rem; }
	.head.first { margin-top: 0; }
	.ttl { display: flex; align-items: center; gap: 0.2rem; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.025em; color: var(--cad-muted); }
	.ttl:hover { color: var(--cad-text); }
	.chev { width: 0.7rem; font-size: 9px; }
	.acts { display: flex; gap: 0.5rem; font-size: 11px; }
	.acts :global(button) { color: var(--cad-link, #2563eb); }
	.acts :global(button:hover) { text-decoration: underline; }
</style>
