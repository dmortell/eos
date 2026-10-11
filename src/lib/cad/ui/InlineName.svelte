<!-- A name renamed where it shows (Dave 2026-10-12: not in the status bar): click → an input in its place, Enter or
     clicking away saves, Esc keeps the old one. -->
<script lang="ts">
	let { value, onsave, title, placeholder }: { value: string; onsave: (name: string) => void; title?: string; placeholder?: string } = $props()

	let editing = $state(false), draft = $state('')
	function start() { draft = value; editing = true }
	function done(save: boolean) {
		if (!editing) return
		editing = false
		const t = draft.trim()
		if (save && t && t !== value) onsave(t)
	}
	function focus(el: HTMLInputElement) { el.focus(); el.select() }
</script>

{#if editing}
	<input class="ed" use:focus bind:value={draft} {placeholder} onblur={() => done(true)}
		onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false) }} />
{:else}
	<button class="nm" {title} onclick={start}>{value || placeholder}</button>
{/if}

<style>
	.nm { color: inherit; font-size: inherit; text-align: left; }
	.nm:hover { color: #2563eb; text-decoration: underline; }
	.ed { font-size: inherit; color: var(--cad-text); background: var(--cad-input); border: 1px solid #2563eb; border-radius: 3px; padding: 0 3px; min-width: 0; width: 9rem; }
</style>
