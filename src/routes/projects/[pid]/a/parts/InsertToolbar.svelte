<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { INSERTS } from './insert'

	let { sheet }: { sheet: Sheet } = $props()
</script>

<div class="a-chrome print:hidden flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 text-sm">
	<span class="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Insert</span>
	{#each INSERTS as ins (ins.kind)}
		<button
			class="rounded border px-2 py-0.5 {sheet.insertMode === ins.kind ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white hover:bg-slate-100'} {ins.todo ? 'opacity-50' : ''}"
			title={ins.todo ? `${ins.label} — not yet implemented` : `Insert ${ins.label.toLowerCase()}`}
			onclick={() => sheet.arm(ins.kind)}
		>{ins.label}</button>
	{/each}

	{#if sheet.insertMode === 'section'}
		<span class="ml-2 text-xs text-blue-600">Drag a rectangle on a plan…</span>
	{:else if sheet.insertMode}
		<span class="ml-2 text-xs text-slate-500">“{sheet.insertMode}” is not implemented yet</span>
	{/if}
</div>
