<!-- A name typed where it shows (Dave 2026-10-12: names aren't typed in the status bar): focused and selected at once;
     Enter or clicking away saves (an empty or unchanged name does nothing), Esc cancels. Keys stay in the box. Used for
     renames (a ✎ / Rename… swaps the label for this) and for new things (a room, a row, a layer …). -->
<script lang="ts">
	import { untrack } from 'svelte'
	/** `create`: a new thing's name — saved even when left as suggested. */
	let { value = '', onsave, oncancel, placeholder, title, wide = false, create = false }: {
		value?: string; onsave: (name: string) => void; oncancel?: () => void; placeholder?: string; title?: string; wide?: boolean; create?: boolean
	} = $props()

	let draft = $state(untrack(() => value)), done = false
	function finish(save: boolean) {
		if (done) return
		done = true
		const t = draft.trim()
		if (save && t && (create || t !== value)) onsave(t)
		else oncancel?.()
	}
	function focus(el: HTMLInputElement) { el.focus(); el.select() }
</script>

<input class="name-input" class:wide use:focus bind:value={draft} {placeholder} {title} onblur={() => finish(true)} onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true) } else if (e.key === 'Escape') { e.preventDefault(); finish(false) } }} />

<style>
	.name-input { font-size: inherit; color: var(--cad-text); background: var(--cad-input); border: 1px solid #2563eb; border-radius: 3px; padding: 0 3px; min-width: 0; width: 9rem; }
	.name-input.wide { flex: 1; width: auto; }
</style>
