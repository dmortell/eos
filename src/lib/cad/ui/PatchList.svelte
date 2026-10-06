<!-- The patch list (Phase 3.5): every cord, from / to with the labels they carry, type, colour, length, ID, status.
     Status chips filter (the install workflow at a glance); a row click selects the cord, and a cord (or a port's
     cord) selected in a rack view is highlighted here and scrolled into view. "Cord BOM…" opens the cord counts with
     the Excel export (ui/CordBomDialog.svelte). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { untrack } from 'svelte'
	import type { Cord } from '../domain/types'
	import { patchList } from '../domain/reports'
	import { importCordIds } from '../render/exports'
	import CordBomDialog from './CordBomDialog.svelte'
	import { TableState, arrowSelect, copyRows } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import ScopeSelect from './ScopeSelect.svelte'

	/** `roomId` = the room "This room" means (the open rack view's, else the selected rack's / device's). */
	/** `inRoomView` = a rack view is open: the list starts on its room (UX review R4); "All rooms" is one click away. */
	let { project, ws, projectName, roomId, inRoomView = false }: { project: CadProject; ws: Workspace; projectName: string; roomId?: string; inRoomView?: boolean } = $props()

	// ── scope (UX review T6 / R4): This view = the open rack view's room (else every cord) · Selection · All ──
	const t = new TableState('patch')
	const room = $derived(t.scope === 'view' && inRoomView && roomId ? { id: roomId, name: project.index.nameOf(roomId) } : undefined)

	// ── the cord BOM + Excel out (a dialog) and cord IDs back in (Phase 3.6) ──
	let bomOpen = $state(false)
	let fileInput: HTMLInputElement | undefined = $state()
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
	const all = $derived.by(() => {
		const list = patchList(project.index, room ? { rackIds: project.index.racks.filter((r) => r.spaceId === room.id).map((r) => r.id) } : {})
		if (t.scope !== 'sel') return list
		// Selection: the selected cords, and the cords on selected devices / ports
		const sel = new Set(ws.selection), ps = ws.portSel
		const on = (r: { on: string; port: number }) => sel.has(r.on) || (!!ps && r.on === ps.on && ps.ports.includes(r.port))
		const ids = new Set(project.index.cords.filter((c) => sel.has(c.id) || on(c.a) || on(c.b)).map((c) => c.id))
		return list.filter((r) => ids.has(r.id))
	})
	const count = $derived(Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<Cord['status'], number>)
	const rows = $derived(t.apply(all.filter((r) => show[r.status]), (r) => `${r.from} ${r.fromLabel} ${r.to} ${r.toLabel} ${r.cordId} ${r.notes} ${typeLabel(r.cableType)}`,
		{ from: (r) => r.from, fromLabel: (r) => r.fromLabel, to: (r) => r.to, toLabel: (r) => r.toLabel, type: (r) => typeLabel(r.cableType), len: (r) => r.lengthM, cordId: (r) => r.cordId, status: (r) => STATUSES.indexOf(r.status), notes: (r) => r.notes }))
	const nSel = $derived(rows.filter((r) => selected.has(r.id)).length)
	/** ↑ / ↓ move the selection; Ctrl+C copies the shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.map((r) => r.id), ws.selection, ws.select)) { e.preventDefault(); return }
		if (copyRows(e, ['From', 'Label', 'To', 'Label', 'Type', 'Length (m)', 'Cord ID', 'Status', 'Notes'], rows.map((r) => [r.from, r.fromLabel, r.to, r.toLabel, typeLabel(r.cableType), r.lengthM, r.cordId, r.status, r.notes]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const selected = $derived(new Set(ws.selection))
	/** The cords on the ports picked in a rack view: shown like selected rows. */
	const onPorts = $derived.by(() => {
		const ps = ws.portSel
		if (!ps) return new Set<string>()
		const on = (r: { on: string; port: number }) => r.on === ps.on && ps.ports.includes(r.port)
		return new Set(project.index.cords.filter((c) => on(c.a) || on(c.b)).map((c) => c.id))
	})
	// a cord (or a port's cord) picked elsewhere scrolls its row into view
	const rowEls: Record<string, HTMLTableRowElement> = $state({})
	$effect(() => {
		const want = new Set([...selected, ...onPorts])   // only a new pick scrolls, not every edit of the list
		untrack(() => {
			const id = rows.find((r) => want.has(r.id))?.id
			if (id) rowEls[id]?.scrollIntoView({ block: 'nearest' })
		})
	})
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

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="h-full overflow-auto text-xs" tabindex="0" role="grid" aria-label="Patch list" onkeydown={tableKey}>
	<div class="actions">
		<ScopeSelect {t} view={inRoomView && roomId ? project.index.nameOf(roomId) : 'This view (all rooms)'} />
		{#each STATUSES as s (s)}
			<button class="chip s-{s}" class:off={!show[s]} onclick={() => (show[s] = !show[s])} title="Show / hide {s} cords">{s} {count[s]}</button>
		{/each}
		<input class="find" placeholder="Find…" bind:value={t.q} />
		<span class="text-zinc-400" title="Shown · in this scope · selected">{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}</span>
		<button class="btn" title="Cords by type × length and status, and the Excel export (patch schedule + cord BOM)" onclick={() => (bomOpen = true)}>Cord BOM…</button>
		<button class="btn" title="Read cord IDs back from a patch schedule the installer filled in" onclick={() => fileInput?.click()}>Import cord IDs…</button>
		<input bind:this={fileInput} type="file" accept=".xlsx" hidden onchange={(e) => importIds(e.currentTarget.files?.[0])} />
	</div>
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr><SortTh {t} key="from" cls="px-2 py-1">From</SortTh><SortTh {t} key="fromLabel">Label</SortTh><SortTh {t} key="to">To</SortTh><SortTh {t} key="toLabel">Label</SortTh><SortTh {t} key="type">Type</SortTh><SortTh {t} key="len">Len (m)</SortTh><SortTh {t} key="cordId">Cord ID</SortTh><SortTh {t} key="status">Status</SortTh><SortTh {t} key="notes">Notes</SortTh></tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr bind:this={rowEls[r.id]} class="hov border-b border-zinc-100" class:row-sel={selected.has(r.id) || onPorts.has(r.id)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5">{r.from}</td>
					<td class="px-2 font-mono text-zinc-600">{r.fromLabel || '—'}</td>
					<td class="px-2">{r.to}</td>
					<td class="px-2 font-mono text-zinc-600">{r.toLabel || '—'}</td>
					<td class="px-2"><span class="sw" style:background={r.colour}></span>{typeLabel(r.cableType)}</td>
					<td class="px-2">{r.lengthM}</td>
					<td class="px-2 font-mono">{r.cordId}</td>
					<td class="px-2"><span class="chip s-{r.status}">{r.status}</span></td>
					<td class="clip px-2 text-zinc-600" title={r.notes}>{r.notes}</td>
				</tr>
			{:else}
				<tr><td colspan="9" class="px-2 py-3 text-zinc-400">No cords{all.length ? ' match' : ' yet — use the Cord tool in a rack view'}.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
{#if bomOpen}<CordBomDialog {project} {projectName} {roomId} thisRoom={!!room} onclose={() => (bomOpen = false)} ondone={(m) => ws.say(m)} />{/if}

<style>
	.hov:hover { background: var(--cad-hover); }
	div[role='grid']:focus { outline: none; }
	.actions { position: sticky; left: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.chip { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 5px; text-transform: uppercase; border: 0; }
	.chip.off { opacity: 0.35; }
	.s-add { background: #dcfce7; color: #166534; }
	.s-change { background: #fef9c3; color: #854d0e; }
	.s-remove { background: #fee2e2; color: #991b1b; }
	.s-installed { background: #e4e4e7; color: #3f3f46; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover { background: var(--cad-hover); }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid #0002; }
</style>
