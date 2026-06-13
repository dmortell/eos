<script lang="ts">
	import { Button, Icon, Firestore } from '$lib'
	import { goto } from '$app/navigation'
	import type { SheetDoc, SheetPackage } from '../types'
	import { createSheetPackage, updateSheetPackage, deleteSheetPackage } from '../data'
	import ListTabs from './ListTabs.svelte'

	let { packages, sheets, projectId, uid, db, mode = 'packages', onmode = () => {}, initialPkg = null }: {
		packages: SheetPackage[]
		sheets: SheetDoc[]
		projectId: string
		uid: string
		db: Firestore
		mode?: 'sheets' | 'packages'
		onmode?: (m: 'sheets' | 'packages') => void
		initialPkg?: string | null
	} = $props()

	// svelte-ignore state_referenced_locally
	let selectedId = $state<string | null>(initialPkg) // seed once from the URL; user selection drives it after
	// Drop the selection only once packages have loaded and the id is gone (so an initialPkg from
	// the URL survives the initial empty state while the subscription is still loading).
	$effect(() => { if (selectedId && packages.length && !packages.some(p => p.id === selectedId)) selectedId = null })
	let pkg = $derived(packages.find(p => p.id === selectedId) ?? null)

	let sheetsById = $derived(Object.fromEntries(sheets.map(s => [s.id, s])) as Record<string, SheetDoc>)
	// In-package sheets in their stored order (skip ids whose sheet was deleted).
	let inSheets = $derived((pkg?.sheetIds ?? []).map(id => sheetsById[id]).filter(Boolean) as SheetDoc[])
	let availSheets = $derived(pkg ? sheets.filter(s => !pkg!.sheetIds.includes(s.id)) : [])

	const label = (s: SheetDoc) => [s.drawingNumber, s.title].filter(Boolean).join(' · ') || 'Untitled'

	function persist(ids: string[]) { if (pkg) updateSheetPackage(db, projectId, pkg.id, { sheetIds: ids }) }
	function add(id: string) { if (pkg && !pkg.sheetIds.includes(id)) persist([...pkg.sheetIds, id]) }
	function remove(id: string) { if (pkg) persist(pkg.sheetIds.filter(x => x !== id)) }
	function addAll() { if (pkg) persist([...pkg.sheetIds, ...availSheets.map(s => s.id)]) }
	function move(i: number, dir: -1 | 1) {
		if (!pkg) return
		const ids = [...pkg.sheetIds]; const j = i + dir
		if (j < 0 || j >= ids.length) return
		;[ids[i], ids[j]] = [ids[j], ids[i]]
		persist(ids)
	}

	// ── drag/drop (reorder within, move between lists) ──
	let dragged = $state<{ id: string; from: 'in' | 'avail' } | null>(null)
	function dropInto(beforeId?: string) {
		if (!dragged || !pkg) return
		const ids = pkg.sheetIds.filter(x => x !== dragged!.id)
		const at = beforeId ? ids.indexOf(beforeId) : ids.length
		ids.splice(at < 0 ? ids.length : at, 0, dragged.id)
		persist(ids); dragged = null
	}
	function dropOut() { if (dragged?.from === 'in') remove(dragged.id); dragged = null }

	// ── package CRUD ──
	let creating = $state(false)
	async function newPackage() {
		if (creating) return
		creating = true
		try { selectedId = await createSheetPackage(db, projectId, packages, uid) } finally { creating = false }
	}
	let editingId = $state<string | null>(null)
	let nameBuf = $state('')
	function startRename(p: SheetPackage) { editingId = p.id; nameBuf = p.name }
	function commitRename() { if (editingId) { updateSheetPackage(db, projectId, editingId, { name: nameBuf.trim() || 'Untitled' }); editingId = null } }
	let confirmDelete = $state<string | null>(null)
	function doDelete(id: string) { deleteSheetPackage(db, projectId, id); confirmDelete = null; if (selectedId === id) selectedId = null }

	function printPkg(id: string) { goto(`/projects/${projectId}/sheets/packages/${id}/print`) }
</script>

<div class="p-4 md:p-6">
	<div class="mx-auto max-w-6xl">
		<div class="mb-4 flex items-center justify-between">
			<ListTabs {mode} {onmode} />
			<Button onclick={newPackage}><Icon name="plus" size={14} /> New package</Button>
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
			<!-- Packages list -->
			<div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
				<div class="border-b border-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800">Packages</div>
				{#each packages as p (p.id)}
					<div class="flex items-center gap-1 border-b border-zinc-100 px-2 py-1.5 text-sm dark:border-zinc-800 {selectedId === p.id ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'}">
						{#if editingId === p.id}
							<input class="w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-sm dark:bg-zinc-800" bind:value={nameBuf}
								onclick={e => e.stopPropagation()}
								onkeydown={e => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') editingId = null }}
								onblur={commitRename} />
						{:else}
							<button class="min-w-0 flex-1 truncate text-left" onclick={() => { selectedId = p.id }}>{p.name}</button>
							<span class="shrink-0 tabular-nums text-xs text-zinc-400">{p.sheetIds?.length ?? 0}</span>
							<button class="text-zinc-400 hover:text-blue-600" title="Print package" onclick={e => { e.stopPropagation(); printPkg(p.id) }}><Icon name="printer" size={13} /></button>
							<button class="text-zinc-400 hover:text-blue-600" title="Rename" onclick={e => { e.stopPropagation(); startRename(p) }}><Icon name="edit" size={13} /></button>
							{#if confirmDelete === p.id}
								<button class="rounded bg-red-600 px-1 text-[10px] text-white" onclick={e => { e.stopPropagation(); doDelete(p.id) }}>Del</button>
							{:else}
								<button class="text-zinc-300 hover:text-red-500" title="Delete" onclick={e => { e.stopPropagation(); confirmDelete = p.id }}><Icon name="trash" size={13} /></button>
							{/if}
						{/if}
					</div>
				{/each}
				{#if packages.length === 0}
					<div class="px-3 py-6 text-center text-xs text-zinc-400">No packages yet.</div>
				{/if}
			</div>

			<!-- Selected package: two lists -->
			{#if pkg}
				<div class="grid grid-cols-2 gap-3">
					<!-- In package (ordered) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="rounded-lg border border-zinc-200 dark:border-zinc-800"
						ondragover={e => { e.preventDefault() }} ondrop={() => dropInto()}>
						<div class="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
							<span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">In “{pkg.name}” ({inSheets.length})</span>
							<button class="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500" onclick={() => printPkg(pkg!.id)}>Print</button>
						</div>
						{#each inSheets as s, i (s.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="flex items-center gap-1 border-b border-zinc-100 px-2 py-1 text-sm dark:border-zinc-800"
								draggable="true"
								ondragstart={() => dragged = { id: s.id, from: 'in' }}
								ondragover={e => { e.preventDefault() }} ondrop={e => { e.stopPropagation(); dropInto(s.id) }}>
								<Icon name="grip" size={12} />
								<span class="w-5 shrink-0 tabular-nums text-xs text-zinc-400">{i + 1}</span>
								<span class="min-w-0 flex-1 truncate">{label(s)}</span>
								<button class="text-zinc-400 hover:text-blue-600 disabled:opacity-20" disabled={i === 0} title="Up" onclick={() => move(i, -1)}><Icon name="chevronUp" size={13} /></button>
								<button class="text-zinc-400 hover:text-blue-600 disabled:opacity-20" disabled={i === inSheets.length - 1} title="Down" onclick={() => move(i, 1)}><Icon name="chevronDown" size={13} /></button>
								<button class="text-zinc-400 hover:text-red-500" title="Remove" onclick={() => remove(s.id)}><Icon name="chevronRight" size={14} /></button>
							</div>
						{/each}
						{#if inSheets.length === 0}
							<div class="px-3 py-6 text-center text-xs text-zinc-400">Drag or add sheets from the right.</div>
						{/if}
					</div>

					<!-- Available -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="rounded-lg border border-zinc-200 dark:border-zinc-800"
						ondragover={e => { e.preventDefault() }} ondrop={() => dropOut()}>
						<div class="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
							<span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Available ({availSheets.length})</span>
							{#if availSheets.length}<button class="text-xs text-blue-600 hover:underline" onclick={addAll}>Add all</button>{/if}
						</div>
						{#each availSheets as s (s.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="flex items-center gap-1 border-b border-zinc-100 px-2 py-1 text-sm dark:border-zinc-800"
								draggable="true" ondragstart={() => dragged = { id: s.id, from: 'avail' }}>
								<button class="text-zinc-400 hover:text-green-600" title="Add" onclick={() => add(s.id)}><Icon name="chevronLeft" size={14} /></button>
								<span class="min-w-0 flex-1 truncate">{label(s)}</span>
							</div>
						{/each}
						{#if availSheets.length === 0}
							<div class="px-3 py-6 text-center text-xs text-zinc-400">All sheets are in this package.</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 p-10 text-sm text-zinc-400 dark:border-zinc-700">
					Select a package to edit its sheets, or create one.
				</div>
			{/if}
		</div>
	</div>
</div>
