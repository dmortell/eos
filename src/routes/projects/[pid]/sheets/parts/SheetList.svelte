<script lang="ts">
	import { Button, Icon, Firestore } from '$lib'
	import { goto } from '$app/navigation'
	import { paperDimsMm } from '$lib/ui/print/types'
	import type { SheetDoc } from '../types'
	import { createSheet, updateSheet, deleteSheet } from '../data'

	let {
		sheets,
		projectId,
		uid,
		db,
	}: {
		sheets: SheetDoc[]
		projectId: string
		uid: string
		db: Firestore
	} = $props()

	// ── Inline row editing ──
	type EditBuffer = { drawingNumber: string; title: string }
	let rowEditingId = $state<string | null>(null)
	let rowEdits = $state<EditBuffer>({ drawingNumber: '', title: '' })

	function startRowEdit(sheet: SheetDoc) {
		rowEditingId = sheet.id
		rowEdits = { drawingNumber: sheet.drawingNumber ?? '', title: sheet.title ?? '' }
	}
	async function commitRowEdit() {
		if (!rowEditingId) return
		await updateSheet(db, projectId, rowEditingId, { ...rowEdits })
		rowEditingId = null
	}
	function cancelRowEdit() { rowEditingId = null }
	function handleRowEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRowEdit()
		else if (e.key === 'Escape') cancelRowEdit()
	}

	function openSheet(sheet: SheetDoc) {
		if (rowEditingId) return // don't navigate while editing
		goto(`/projects/${projectId}/sheets/${sheet.id}`)
	}

	let creating = $state(false)
	async function handleNewSheet() {
		if (creating) return
		creating = true
		try {
			const id = await createSheet(db, projectId, sheets, uid)
			await goto(`/projects/${projectId}/sheets/${id}`)
		} finally {
			creating = false
		}
	}

	let confirmDeleteId = $state<string | null>(null)
	async function handleDelete(id: string) {
		await deleteSheet(db, projectId, id)
		confirmDeleteId = null
	}

	function paperLabel(sheet: SheetDoc): string {
		const p = sheet.paper
		if (!p) return '—'
		const o = p.orientation === 'portrait' ? 'P' : 'L'
		return `${p.paperSize} ${o}`
	}
	function scaleLabel(sheet: SheetDoc): string {
		const s = sheet.paper?.scale
		return s ? `1:${s}` : 'Fit'
	}
</script>

<div class="p-4 md:p-6">
	<div class="mx-auto max-w-5xl">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Sheets</h2>
			<Button onclick={handleNewSheet}>
				<Icon name="plus" size={14} />
				New Sheet
			</Button>
		</div>

		<p class="my-2 text-xs text-zinc-400">Click a row to open the sheet. Click the pencil icon to edit fields inline.</p>

		<div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-zinc-100 dark:[&>th]:bg-zinc-900 [&>th]:shadow-[inset_0_-1px_0] [&>th]:shadow-zinc-200 dark:[&>th]:shadow-zinc-800 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
						<th class="px-3 py-2 w-12">#</th>
						<th class="px-3 py-2 w-40">Drawing No.</th>
						<th class="px-3 py-2">Title</th>
						<th class="px-3 py-2 w-20 text-center">Paper</th>
						<th class="px-3 py-2 w-16 text-center">Scale</th>
						<th class="px-3 py-2 w-16 text-center">VPs</th>
						<th class="px-3 py-2 w-20 text-center">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each sheets as sheet, idx (sheet.id)}
						{@const isRowEditing = rowEditingId === sheet.id}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<tr class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
							class:cursor-pointer={!isRowEditing}
							onclick={() => { if (!isRowEditing) openSheet(sheet) }}>
							<td class="px-3 py-1.5 text-zinc-400 tabular-nums">{idx + 1}</td>

							<!-- Drawing Number -->
							<td class="px-3 py-1.5 font-mono text-xs">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs font-mono bg-white dark:bg-zinc-800"
										bind:value={rowEdits.drawingNumber}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{sheet.drawingNumber || '—'}
								{/if}
							</td>

							<!-- Title -->
							<td class="px-3 py-1.5">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-sm bg-white dark:bg-zinc-800"
										bind:value={rowEdits.title}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{sheet.title || '—'}
								{/if}
							</td>

							<td class="px-3 py-1.5 text-xs text-center text-zinc-500">{paperLabel(sheet)}</td>
							<td class="px-3 py-1.5 text-xs text-center text-zinc-500">{scaleLabel(sheet)}</td>
							<td class="px-3 py-1.5 text-xs text-center text-zinc-400 tabular-nums">{sheet.viewports?.length ?? 0}</td>

							<!-- Actions -->
							<td class="px-2 py-1.5 text-center whitespace-nowrap" onclick={e => e.stopPropagation()}>
								{#if isRowEditing}
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 mr-1"
										onclick={commitRowEdit} title="Save changes (Enter)">Save</button>
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
										onclick={cancelRowEdit} title="Cancel (Escape)">Cancel</button>
								{:else if confirmDeleteId === sheet.id}
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 mr-1"
										onclick={() => handleDelete(sheet.id)}>Confirm</button>
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
										onclick={() => confirmDeleteId = null}>Cancel</button>
								{:else}
									<button class="text-zinc-400 hover:text-blue-600 transition-colors mr-2" title="Edit sheet"
										onclick={() => startRowEdit(sheet)}>
										<Icon name="edit" size={13} />
									</button>
									<button class="text-zinc-300 hover:text-red-500 transition-colors" title="Delete sheet"
										onclick={() => confirmDeleteId = sheet.id}>
										<Icon name="trash" size={13} />
									</button>
								{/if}
							</td>
						</tr>
					{/each}

					{#if sheets.length === 0}
						<tr>
							<td colspan={7} class="px-3 py-8 text-center text-zinc-400">
								No sheets yet. Click "New Sheet" to create one.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
