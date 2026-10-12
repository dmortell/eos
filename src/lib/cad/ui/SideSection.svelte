<!-- A window's body section (once a sidebar section with its own fold): `actions` (+ Layer, + Server room …) sit on
     the right above the content. -->
<script lang="ts">
	import type { Snippet } from 'svelte'

	let { key, title, actions, children, first = false }: { key: string; title: string; actions?: Snippet; children: Snippet; first?: boolean } = $props()

</script>

<!-- inside a window (all its uses now): the window's title bar names it and folds it, so no second title / fold here
     (review R75: a "Layers" window showed a "▾ LAYERS" header, and folding that left an empty window) — just its links -->
{#if actions}<div class="head" class:first data-key={key} aria-label={title}><span class="acts">{@render actions()}</span></div>{/if}
{@render children()}

<style>
	.head { display: flex; align-items: center; justify-content: flex-end; padding: 0 0.25rem 0.25rem; }
	.acts { display: flex; gap: 0.5rem; font-size: 11px; }
	.acts :global(button) { color: var(--cad-link, #2563eb); }
	.acts :global(button:hover) { text-decoration: underline; }
</style>
