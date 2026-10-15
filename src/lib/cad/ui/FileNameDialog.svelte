<!-- SAVE AS (Dave 2026-10-15, "Edit file names on export"): every export asks for its file name before it saves —
     filled from the project's pattern (Settings › Files) or the export's own name. Enter / Save saves; Esc / Cancel
     saves nothing. The extension stays as the export makes it. -->
<script lang="ts">
	import { tick } from 'svelte'
	import CadDialog from './CadDialog.svelte'
	import { canShareFile, type SaveAction } from '../render/download'

	let { name, ext, type = '', ondone }: { name: string; ext: string; type?: string; ondone: (r: string | { name: string; action: SaveAction } | null) => void } = $props()
	// besides Save (Dave 2026-10-15, as the print tab has): Email / share… where the browser shares files; Open / print for a PDF
	const share = $derived(!!type && canShareFile(type)), pdf = $derived(ext.toLowerCase() === 'pdf')

	// svelte-ignore state_referenced_locally
	let value = $state(ext ? name.replace(new RegExp(`\\.${ext}$`, 'i'), '') : name)
	let input: HTMLInputElement | undefined = $state()
	$effect(() => { void tick().then(() => { input?.focus(); input?.select() }) })
	const save = (action: SaveAction = 'save') => { if (value.trim()) ondone(action === 'save' ? value.trim() : { name: value.trim(), action }) }
</script>

<CadDialog title="Save as" width="34rem" top="20vh" onclose={() => ondone(null)}>
	<label class="row">
		<input bind:this={input} bind:value aria-label="File name" onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save() } }} />
		{#if ext}<span class="ext">.{ext}</span>{/if}
	</label>
	<p class="hint">Project › Settings… › Files sets the pattern names start from.</p>
	{#snippet footer()}
		<span class="keys">Enter saves · Esc cancels</span>
		<button class="btn" onclick={() => ondone(null)}>Cancel</button>
		{#if share}<button class="btn" disabled={!value.trim()} title="Send it with Outlook, Mail, Teams … (the system share sheet)" onclick={() => save('share')}>Email / share…</button>{/if}
		{#if pdf}<button class="btn" disabled={!value.trim()} title="Open it in a new browser tab to print" onclick={() => save('open')}>Open / print</button>{/if}
		<button class="btn go" disabled={!value.trim()} onclick={() => save()}>Save</button>
	{/snippet}
</CadDialog>

<style>
	.row { display: flex; align-items: center; gap: 4px; }
	input { flex: 1; min-width: 0; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 5px; padding: 5px 8px; font-size: 13px; background: var(--cad-input, white); color: var(--cad-text); }
	.ext { color: var(--cad-muted); font-size: 13px; }
	.hint { margin: 8px 0 0; font-size: 11px; color: var(--cad-muted); }
</style>
