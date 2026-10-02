<!-- The patch list (Phase 3.5): every cord, from / to with the labels they carry, type, colour, length, ID, status.
     Status chips filter (the install workflow at a glance); a row click selects the cord, and a cord selected in a
     rack view is highlighted here. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Cord } from '../domain/types'
	import { patchList } from '../domain/reports'
	import { exportPatchSchedule, importCordIds } from '../render/exports'

	let { project, ws, projectName }: { project: CadProject; ws: Workspace; projectName: string } = $props()

	// ── Excel out (the patch schedule + cord BOM) and cord IDs back in (Phase 3.6) ──
	let fileInput: HTMLInputElement | undefined = $state()
	async function exportExcel() {
		try { const n = await exportPatchSchedule(project.index, projectName, undefined, typeLabel); ws.say(`Patch schedule: ${n} cords`) }
		catch (e) { project.error = `Export failed: ${(e as Error).message}` }
	}
	async function importIds(file: File | undefined) {
		if (!file) return
		try {
			const { ids, byKey } = await importCordIds(file, project.index)
			const edits = [...ids].map(([id, cordId]) => ({ c: project.index.get(id) as Cord, cordId })).filter((x) => x.c?.type === 'cord' && x.c.cordId !== x.cordId)
			if (!edits.length) { ws.say(`No new cord IDs in ${file.name}`); return }
			ws.ask2(`${edits.length} cord ID(s) from ${file.name}${byKey ? '' : ' — matched by row number (an old sheet without the Key column): only right if the cords are unchanged since the export'}.`, 'Set cord IDs',
				() => project.store.transact(`Cord IDs from ${file.name}`, (tx) => { for (const x of edits) tx.put({ ...x.c, cordId: x.cordId }) }))
		} catch (e) { project.error = `Import failed: ${(e as Error).message}` }
		finally { if (fileInput) fileInput.value = '' }
	}

	const STATUSES: Cord['status'][] = ['add', 'change', 'remove', 'installed']
	let show = $state<Record<Cord['status'], boolean>>({ add: true, change: true, remove: true, installed: true })
	let q = $state('')
	const all = $derived(patchList(project.index))
	const count = $derived(Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<Cord['status'], number>)
	const rows = $derived(all.filter((r) => show[r.status] && (!q || `${r.from} ${r.fromLabel} ${r.to} ${r.toLabel} ${r.cordId}`.toLowerCase().includes(q.toLowerCase()))))
	const selected = $derived(new Set(ws.selection))
	// click = one, Shift = the range from the last clicked, Ctrl = add / drop one (same as the outlets grid)
	let anchor: string | null = null
	function pick(id: string, e: MouseEvent) {
		if (e.shiftKey && anchor) {
			const i = rows.findIndex((r) => r.id === anchor), j = rows.findIndex((r) => r.id === id)
			if (i >= 0 && j >= 0) { ws.select(rows.slice(Math.min(i, j), Math.max(i, j) + 1).map((r) => r.id)); return }
		}
		anchor = id
		ws.select(e.ctrlKey || e.metaKey ? (selected.has(id) ? ws.selection.filter((x) => x !== id) : [...ws.selection, id]) : [id])
	}
	const typeLabel = (id: string) => project.settings?.cableTypes.find((t) => t.id === id)?.label ?? id
</script>

<div class="h-full overflow-auto text-xs">
	<div class="actions">
		<span class="font-semibold text-zinc-600">Patch list</span>
		{#each STATUSES as s (s)}
			<button class="chip s-{s}" class:off={!show[s]} onclick={() => (show[s] = !show[s])} title="Show / hide {s} cords">{s} {count[s]}</button>
		{/each}
		<input class="find" placeholder="Find…" bind:value={q} />
		<span class="text-zinc-400">{rows.length} of {all.length}</span>
		<button class="btn" title="The patch schedule (work order: remove → change → add → installed) and a cord BOM, as Excel" onclick={exportExcel}>Excel</button>
		<button class="btn" title="Read cord IDs back from a patch schedule the installer filled in" onclick={() => fileInput?.click()}>Import cord IDs…</button>
		<input bind:this={fileInput} type="file" accept=".xlsx" hidden onchange={(e) => importIds(e.currentTarget.files?.[0])} />
	</div>
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr><th class="px-2 py-1">From</th><th class="px-2">Label</th><th class="px-2">To</th><th class="px-2">Label</th><th class="px-2">Type</th><th class="px-2">Len (m)</th><th class="px-2">Cord ID</th><th class="px-2">Status</th></tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr class="border-b border-zinc-100 hover:bg-blue-50" class:bg-amber-50={selected.has(r.id)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5">{r.from}</td>
					<td class="px-2 font-mono text-zinc-600">{r.fromLabel || '—'}</td>
					<td class="px-2">{r.to}</td>
					<td class="px-2 font-mono text-zinc-600">{r.toLabel || '—'}</td>
					<td class="px-2"><span class="sw" style:background={r.colour}></span>{typeLabel(r.cableType)}</td>
					<td class="px-2">{r.lengthM}</td>
					<td class="px-2 font-mono">{r.cordId}</td>
					<td class="px-2"><span class="chip s-{r.status}">{r.status}</span></td>
				</tr>
			{:else}
				<tr><td colspan="8" class="px-2 py-3 text-zinc-400">No cords{all.length ? ' match' : ' yet — use the Cord tool (P) in a rack elevation'}.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.actions { position: sticky; left: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid #e4e4e7; background: white; }
	.chip { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 5px; text-transform: uppercase; border: 0; }
	.chip.off { opacity: 0.35; }
	.s-add { background: #dcfce7; color: #166534; }
	.s-change { background: #fef9c3; color: #854d0e; }
	.s-remove { background: #fee2e2; color: #991b1b; }
	.s-installed { background: #e4e4e7; color: #3f3f46; }
	.btn { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; background: white; }
	.btn:hover { background: #f4f4f5; }
	.find { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 4px; width: 10rem; }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid #0002; }
</style>
