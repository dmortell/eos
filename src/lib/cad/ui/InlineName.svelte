<!-- A name renamed where it shows, by clicking it (where a click does nothing else — the Racks window's rooms and rows):
     an input in its place (ui/NameInput.svelte). -->
<script lang="ts">
	import NameInput from './NameInput.svelte'

	let { value, onsave, title, placeholder }: { value: string; onsave: (name: string) => void; title?: string; placeholder?: string } = $props()

	let editing = $state(false)
</script>

{#if editing}
	<NameInput {value} {placeholder} onsave={(t) => { editing = false; onsave(t) }} oncancel={() => (editing = false)} />
{:else}
	<button class="nm" {title} onclick={() => (editing = true)}>{value || placeholder}</button>
{/if}

<style>
	.nm { color: inherit; font-size: inherit; text-align: left; }
	.nm:hover { color: #2563eb; text-decoration: underline; }
</style>
