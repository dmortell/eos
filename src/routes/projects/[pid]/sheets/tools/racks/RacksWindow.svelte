<script lang="ts">
	// Racks list window for rack elevations (parallel to the Devices library): select a rack, drag
	// to reorder (sets the elevation left→right order), and add a rack. Visibility is via layers.
	import { Window, Icon } from '$lib'
	import { portal } from '../../edit/portal'
	import type { RacksEditor } from './racks-editor.svelte'

	// `rowId` scopes the list (and Add) to the viewport's row, matching the elevation. When the
	// viewport shows all rows (no rowId), list everything in the room's racks doc.
	let { editor, rowId, onclose }: { editor: RacksEditor; rowId?: string; onclose: () => void } = $props()

	let targetRow = $derived(rowId || editor.rows[0]?.id || '')
	let ordered = $derived(
		[...editor.racks].filter(r => !rowId || r.rowId === rowId).sort((a, b) => a.order - b.order)
	)

	let dragId = $state<string | null>(null)
	function dropOn(targetId: string) {
		const d = dragId; dragId = null
		if (!d || d === targetId) return
		const ids = ordered.map(r => r.id)
		const from = ids.indexOf(d), to = ids.indexOf(targetId)
		if (from < 0 || to < 0) return
		const without = ids.filter(x => x !== d)
		let at = without.indexOf(targetId)
		if (from < to) at += 1   // dragging downward → drop after the target
		without.splice(at, 0, d)
		editor.reorderRacks(without)
	}
</script>

<div use:portal>
	<Window title="Racks" name="racks-list" right={10} top={72} open class="w-60 space-y-2 p-2 text-zinc-700">
		<div class="max-h-72 space-y-0.5 overflow-auto">
			{#each ordered as r (r.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center gap-1 rounded border px-1.5 py-1 text-xs {editor.selRack?.id === r.id ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'} {dragId === r.id ? 'opacity-40' : ''}"
					draggable="true"
					ondragstart={() => dragId = r.id}
					ondragover={e => e.preventDefault()}
					ondrop={e => { e.preventDefault(); dropOn(r.id) }}>
					<Icon name="grip" size={12} class="cursor-grab text-zinc-300" />
					<button class="min-w-0 flex-1 truncate text-left" onclick={() => editor.selectRack(r.id)}>{r.label}</button>
					<span class="shrink-0 text-[10px] text-zinc-400">{r.heightU}U</span>
				</div>
			{/each}
			{#if !ordered.length}
				<div class="px-2 py-4 text-center text-[11px] text-zinc-400">No racks yet.</div>
			{/if}
		</div>

		<button class="flex w-full items-center justify-center gap-1 rounded border px-1 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-40"
			disabled={!targetRow} title="Add a rack" onclick={() => editor.addRack(targetRow)}>
			<Icon name="plus" size={13} /> Add rack
		</button>
		<button class="w-full rounded border px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-slate-100" onclick={onclose}>Close</button>
	</Window>
</div>
