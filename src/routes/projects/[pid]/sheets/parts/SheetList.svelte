<script lang="ts">
	import { Button, Icon, Firestore } from '$lib'
	import { goto } from '$app/navigation'
	import { paperDimsMm } from '$lib/ui/print/types'
	import type { SheetDoc } from '../types'
	import { createSheet, createFileSheet, updateSheet, deleteSheet, planRenumber } from '../data'
	import ListTabs from './ListTabs.svelte'

	// Tools a "file" sheet can link to — dense tabular docs exported to Excel/PDF from their own tool.
	// floor/room flag which scope params the tool's route accepts (set per-row via inline edit).
	const FILE_TOOLS: { tool: string; label: string; title: string; floor: boolean; room: boolean }[] = [
		{ tool: 'patching', label: 'Patch list', title: 'Patch Schedule', floor: true, room: true },
		{ tool: 'frames', label: 'Patch frames', title: 'Patch Frames', floor: true, room: false },
	]
	const fileTool = (tool?: string) => FILE_TOOLS.find(t => t.tool === tool)
	/** Route (with ?floor=&room=) a "file" sheet opens. */
	function fileHref(s: SheetDoc): string {
		const l = s.link!
		const q = new URLSearchParams()
		if (l.floor != null) q.set('floor', String(l.floor))
		if (l.room) q.set('room', l.room)
		const qs = q.toString()
		return `/projects/${projectId}/${l.tool}${qs ? `?${qs}` : ''}`
	}

	let {
		sheets,
		projectId,
		uid,
		db,
		mode = 'sheets',
		onmode = () => {},
	}: {
		sheets: SheetDoc[]
		projectId: string
		uid: string
		db: Firestore
		mode?: 'sheets' | 'packages'
		onmode?: (m: 'sheets' | 'packages') => void
	} = $props()

	// ── Inline row editing ── (floor/room only apply to "file" rows)
	type EditBuffer = { drawingNumber: string; title: string; floor: string; room: string }
	let rowEditingId = $state<string | null>(null)
	let rowEdits = $state<EditBuffer>({ drawingNumber: '', title: '', floor: '', room: '' })

	function startRowEdit(sheet: SheetDoc) {
		rowEditingId = sheet.id
		rowEdits = {
			drawingNumber: sheet.drawingNumber ?? '',
			title: sheet.title ?? '',
			floor: sheet.link?.floor != null ? String(sheet.link.floor) : '',
			room: sheet.link?.room ?? '',
		}
	}
	async function commitRowEdit() {
		if (!rowEditingId) return
		const sheet = sheets.find(s => s.id === rowEditingId)
		const patch: Partial<SheetDoc> = { drawingNumber: rowEdits.drawingNumber, title: rowEdits.title }
		if (sheet?.link) {
			// Rebuild the link without undefined keys (Firestore rejects them); merge keeps the rest.
			const link: NonNullable<SheetDoc['link']> = { tool: sheet.link.tool }
			if (sheet.link.label) link.label = sheet.link.label
			const f = parseInt(rowEdits.floor, 10)
			if (Number.isFinite(f)) link.floor = f
			if (rowEdits.room.trim()) link.room = rowEdits.room.trim()
			patch.link = link
		}
		await updateSheet(db, projectId, rowEditingId, patch)
		rowEditingId = null
	}
	function cancelRowEdit() { rowEditingId = null }
	function handleRowEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRowEdit()
		else if (e.key === 'Escape') cancelRowEdit()
	}

	function openSheet(sheet: SheetDoc) {
		if (rowEditingId) return // don't navigate while editing
		// "File" rows open their linked tool (at the chosen floor/room); normal sheets open the editor.
		if (sheet.link) goto(fileHref(sheet))
		else goto(`/projects/${projectId}/sheets/${sheet.id}`)
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

	// ── "Add file" rows: a list entry that opens a tool (Patching, Frames, …) for manual Excel export ──
	let fileMenuOpen = $state(false)
	async function addFile(t: { tool: string; label: string; title: string; floor: boolean; room: boolean }) {
		fileMenuOpen = false
		if (creating) return
		creating = true
		try {
			const link = { tool: t.tool, label: 'export to Excel', ...(t.floor ? { floor: 1 } : {}), ...(t.room ? { room: 'A' } : {}) }
			await createFileSheet(db, projectId, sheets, uid, link, t.title)
		} finally { creating = false }
	}

	let confirmDeleteId = $state<string | null>(null)
	async function handleDelete(id: string) {
		await deleteSheet(db, projectId, id)
		confirmDeleteId = null
	}

	// ── Multi-select + renumber ──
	let selected = $state<Set<string>>(new Set())
	let lastClickedIdx = $state<number | null>(null) // anchor for shift-click range selection
	let menuOpen = $state(false)
	let allSelected = $derived(sheets.length > 0 && sheets.every(s => selected.has(s.id)))
	function toggleSel(id: string) {
		const n = new Set(selected)
		n.has(id) ? n.delete(id) : n.add(id)
		selected = n
	}
	// Checkbox click: shift-click selects/deselects the whole range from the last-clicked row.
	function onRowCheck(e: MouseEvent, idx: number) {
		e.preventDefault() // we drive `checked` from state, so don't let the native toggle race us
		const id = sheets[idx].id
		if (e.shiftKey && lastClickedIdx !== null && lastClickedIdx < sheets.length) {
			const want = !selected.has(id) // apply the clicked row's new state across the range
			const [a, b] = lastClickedIdx <= idx ? [lastClickedIdx, idx] : [idx, lastClickedIdx]
			const n = new Set(selected)
			for (let i = a; i <= b; i++) want ? n.add(sheets[i].id) : n.delete(sheets[i].id)
			selected = n
		} else {
			toggleSel(id)
		}
		lastClickedIdx = idx
	}
	function toggleAll() { selected = allSelected ? new Set() : new Set(sheets.map(s => s.id)); lastClickedIdx = null }

	// ── Drag-reorder (persists sortOrder); a selected row drags the whole selection as a block ──
	let dragId = $state<string | null>(null)
	// Rows that move with the current drag: the selection (if the dragged row is part of it) else just it.
	let dragMoving = $derived.by(() => {
		if (!dragId) return new Set<string>()
		return selected.has(dragId) && selected.size > 1 ? new Set(selected) : new Set([dragId])
	})
	async function dropOnRow(targetId: string) {
		const d = dragId; dragId = null
		if (!d) return
		const ids = sheets.map(s => s.id)
		const moving = selected.has(d) && selected.size > 1 ? ids.filter(id => selected.has(id)) : [d]
		if (moving.includes(targetId)) return // dropping onto a moving row = no-op
		const targetFrom = ids.indexOf(targetId)
		const firstFrom = ids.indexOf(moving[0])
		if (targetFrom < 0 || firstFrom < 0) return
		const without = ids.filter(id => !moving.includes(id))
		let at = without.indexOf(targetId)
		if (firstFrom < targetFrom) at += 1    // moving down → drop after the target row
		without.splice(at, 0, ...moving)
		// Renumber sortOrder to the new positions; only write rows that actually moved.
		await Promise.all(without.map((id, i) => {
			const s = sheets.find(x => x.id === id)
			return s && s.sortOrder !== i ? updateSheet(db, projectId, id, { sortOrder: i }) : null
		}).filter(Boolean) as Promise<void>[])
	}
	async function renumberSelected() {
		menuOpen = false
		const chosen = sheets.filter(s => selected.has(s.id)) // already in list order
		const plan = planRenumber(chosen, sheets)
		await Promise.all(plan.map(p => updateSheet(db, projectId, p.id, { drawingNumber: p.drawingNumber })))
	}

	const toolLabel = (tool: string) => FILE_TOOLS.find(t => t.tool === tool)?.label ?? tool
	function paperLabel(sheet: SheetDoc): string {
		if (sheet.link) {
			const l = sheet.link
			const scope = l.floor != null ? ` · F${l.floor}${l.room ? ` R-${l.room}` : ''}` : ''
			return toolLabel(l.tool) + scope
		}
		const p = sheet.paper
		if (!p) return '—'
		const o = p.orientation === 'portrait' ? 'P' : 'L'
		return `${p.paperSize} ${o}`
	}
	function scaleLabel(sheet: SheetDoc): string {
		if (sheet.link) return '—'
		const s = sheet.paper?.scale
		return s ? `1:${s}` : 'Fit'
	}
</script>

<div class="p-4 md:p-6">
	<div class="mx-auto max-w-5xl">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<ListTabs {mode} {onmode} />
			<div class="flex items-center gap-2">
				<Button onclick={handleNewSheet}>
					<Icon name="plus" size={14} />
					New Sheet
				</Button>
				<div class="relative">
					<button class="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1.5 text-sm leading-none text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						title="Add a file row that opens a tool to export (Excel/PDF)" onclick={() => fileMenuOpen = !fileMenuOpen}>
						<Icon name="fileText" size={14} /> Add file
					</button>
					{#if fileMenuOpen}
						<button class="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onclick={() => fileMenuOpen = false}></button>
						<div class="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
							{#each FILE_TOOLS as t (t.tool)}
								<button class="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800" onclick={() => addFile(t)}>{t.label}</button>
							{/each}
						</div>
					{/if}
				</div>
				<div class="relative">
					<button class="rounded border border-zinc-300 px-2 py-1.5 leading-none text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						title="More actions" aria-label="More actions" onclick={() => menuOpen = !menuOpen}>⋮</button>
					{#if menuOpen}
						<button class="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onclick={() => menuOpen = false}></button>
						<div class="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
							<button class="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
								disabled={selected.size === 0} onclick={renumberSelected}>
								Renumber selected ({selected.size})
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<p class="my-2 text-xs text-zinc-400">Click a row to open the sheet. Pencil = edit fields inline. Tick rows (shift-click for a range) then ⋮ ▸ Renumber, or drag a selected row to move them all.</p>

		<div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-zinc-100 dark:[&>th]:bg-zinc-900 [&>th]:shadow-[inset_0_-1px_0] [&>th]:shadow-zinc-200 dark:[&>th]:shadow-zinc-800 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
						<th class="px-2 py-2 w-8 text-center"><input type="checkbox" checked={allSelected} onchange={toggleAll} title="Select all" /></th>
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
						{@const ftool = sheet.link ? fileTool(sheet.link.tool) : null}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<tr class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors {dragMoving.has(sheet.id) ? 'opacity-40' : ''} {selected.has(sheet.id) ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}"
							class:cursor-pointer={!isRowEditing}
							draggable={!isRowEditing}
							ondragstart={() => dragId = sheet.id}
							ondragover={e => e.preventDefault()}
							ondrop={e => { e.preventDefault(); dropOnRow(sheet.id) }}
							onclick={() => { if (!isRowEditing) openSheet(sheet) }}>
							<td class="px-2 py-1.5 text-center" onclick={e => e.stopPropagation()}>
								<input type="checkbox" checked={selected.has(sheet.id)} title="Shift-click to select a range"
									onclick={e => onRowCheck(e, idx)} />
							</td>
							<td class="px-3 py-1.5 text-zinc-400 tabular-nums">
								<span class="inline-flex items-center gap-1"><Icon name="grip" size={12} class="cursor-grab text-zinc-300" />{idx + 1}</span>
							</td>

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
									{#if sheet.link}
										<span class="inline-flex items-center gap-1">
											<span class="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" title="Opens the {toolLabel(sheet.link.tool)} tool — export from there">
												<Icon name="fileText" size={10} /> File
											</span>
											{sheet.title || '—'}
										</span>
									{:else}
										{sheet.title || '—'}
									{/if}
								{/if}
							</td>

							<!-- Paper (file rows in edit mode: floor input) -->
							<td class="px-3 py-1.5 text-xs text-center text-zinc-500">
								{#if isRowEditing && ftool?.floor}
									<input type="number" min="1" placeholder="Floor" title="Floor"
										class="w-16 rounded border border-blue-400 bg-white px-1 py-0.5 text-xs dark:bg-zinc-800"
										bind:value={rowEdits.floor} onkeydown={handleRowEditKeydown} onclick={e => e.stopPropagation()} />
								{:else}
									{paperLabel(sheet)}
								{/if}
							</td>
							<!-- Scale (file rows in edit mode: room input, when the tool is room-scoped) -->
							<td class="px-3 py-1.5 text-xs text-center text-zinc-500">
								{#if isRowEditing && ftool?.room}
									<input placeholder="Room" title="Room"
										class="w-12 rounded border border-blue-400 bg-white px-1 py-0.5 text-xs dark:bg-zinc-800"
										bind:value={rowEdits.room} onkeydown={handleRowEditKeydown} onclick={e => e.stopPropagation()} />
								{:else}
									{scaleLabel(sheet)}
								{/if}
							</td>
							<td class="px-3 py-1.5 text-xs text-center text-zinc-400 tabular-nums">{sheet.link ? '—' : (sheet.viewports?.length ?? 0)}</td>

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
							<td colspan={8} class="px-3 py-8 text-center text-zinc-400">
								No sheets yet. Click "New Sheet" to create one.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
