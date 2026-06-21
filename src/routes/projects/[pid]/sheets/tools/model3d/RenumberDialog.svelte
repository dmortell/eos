<script lang="ts">
	import { Dialog } from '$lib'
	import { toast } from 'svelte-sonner'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'

	let { editor, open = $bindable(false) }: { editor: AnnotationEditor; open?: boolean } = $props()

	let start = $state(1)
	let step = $state(1)
	let mode = $state<'overwrite' | 'prefix' | 'suffix' | 'replace'>('overwrite')
	let replaceChar = $state('#')
	let order = $state<'index' | 'value' | 'xy' | 'yx'>('index')

	// Count the labelled items in the selection (outlets + text/callout) — what renumber will touch.
	const count = $derived(editor.selectedAnnList().filter((a) => a.symbol === 'outlet' || a.kind === 'text' || a.kind === 'callout').length)
	const fld = 'h-7 w-full rounded border border-zinc-300 px-1.5 text-sm'

	function apply() {
		const n = editor.renumber({ start, step, mode, replaceChar, order })
		toast.success(`Renumbered ${n} item${n === 1 ? '' : 's'}`)
		open = false
	}
</script>

<Dialog title="Auto number" bind:open>
	<div class="grid grid-cols-2 gap-2 px-6 pb-3 text-xs">
		<p class="col-span-2 text-[11px] text-zinc-500">{count} labelled item{count === 1 ? '' : 's'} selected (outlets + text). Objects have no number.</p>
		<label class="text-zinc-500">Start
			<input type="number" class={fld} bind:value={start} /></label>
		<label class="text-zinc-500">Increment
			<input type="number" class={fld} bind:value={step} /></label>
		<label class="col-span-2 text-zinc-500">Mode
			<select class={fld} bind:value={mode}>
				<option value="overwrite">Overwrite label</option>
				<option value="prefix">Prefix to label</option>
				<option value="suffix">Suffix to label</option>
				<option value="replace">Replace a character</option>
			</select></label>
		{#if mode === 'replace'}
			<label class="col-span-2 text-zinc-500">Character to replace (e.g. # in “OL-#”)
				<input class={fld} maxlength="3" bind:value={replaceChar} /></label>
		{/if}
		<label class="col-span-2 text-zinc-500">Order
			<select class={fld} bind:value={order}>
				<option value="index">Selection order</option>
				<option value="value">By existing number</option>
				<option value="xy">Left→right, then top→bottom (X, Y)</option>
				<option value="yx">Top→bottom, then left→right (Y, X)</option>
			</select></label>
		<div class="col-span-2 flex justify-end gap-2 pt-1">
			<button class="rounded border px-3 py-1 hover:bg-slate-100" onclick={() => (open = false)}>Cancel</button>
			<button class="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 disabled:opacity-40" disabled={!count} onclick={apply}>Apply</button>
		</div>
	</div>
</Dialog>
