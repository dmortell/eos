<!-- The patch list (Phase 3.5): every cord, from / to with the labels they carry, type, colour, length, ID, status.
     Status chips filter (the install workflow at a glance); a row click selects the cord, and a cord (or a port's
     cord) selected in a rack view is highlighted here and scrolled into view. "Export…" opens the patch schedule export with
     the Excel export (ui/PatchScheduleDialog.svelte). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { untrack } from 'svelte'
	import type { Cord } from '../domain/types'
	import { patchList } from '../domain/reports'
	import { importCordIds } from '../render/exports'
	import PatchScheduleDialog from './PatchScheduleDialog.svelte'
	import CordLabelsDialog from './CordLabelsDialog.svelte'
	import { Icon } from '$lib'
	import { TableState, arrowSelect, copyRows } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import ScopeSelect from './ScopeSelect.svelte'
	import CordActions from './CordActions.svelte'
	import StatusChip from './StatusChip.svelte'
	import CordMode from './CordMode.svelte'
	import ContextMenu from './ContextMenu.svelte'
	import { cordActionMenu, runCordAction } from './cordActions'
	import { setStatus, CORD_STATUSES, replacedText } from '../domain/cords'

	/** `roomId` = the room "This room" means (the open rack view's, else the selected rack's / device's). */
	/** `inRoomView` = a rack view is open: the list starts on its room (UX review R4); "All rooms" is one click away. */
	let { project, ws, projectName, roomId, inRoomView = false }: { project: CadProject; ws: Workspace; projectName: string; roomId?: string; inRoomView?: boolean } = $props()

	// ── scope (UX review T6 / R4): This view = the open rack view's room (else every cord) · Selection · All ──
	const t = new TableState('patch')
	const room = $derived(t.scope === 'view' && inRoomView && roomId ? { id: roomId, name: project.index.nameOf(roomId) } : undefined)

	// ── the cord BOM + Excel out (a dialog) and cord IDs back in (Phase 3.6) ──
	let bomOpen = $state(false), labelsOpen = $state(false)
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

	const STATUSES = CORD_STATUSES
	let show = $state<Record<Cord['status'], boolean>>({ add: true, change: true, replace: true, remove: true, installed: true })
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
	/** The selected rows' cords — what the action bar and the right-click act on (patch-list-plan.md Slice 2). */
	const selCords = $derived(rows.filter((r) => selected.has(r.id)).map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	/** The rows shown (scope, status chips, Find) as cords — the export's "rows the list shows". */
	const rowCords = $derived(rows.map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	/** Purge removed: every cord marked for removal in this scope is out on site — their records go. */
	const removed = $derived(all.filter((r) => r.status === 'remove').map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	let menu = $state<{ x: number; y: number } | null>(null)
	function rowMenu(id: string, e: MouseEvent) {
		e.preventDefault()
		if (!selected.has(id)) ws.select([id])
		menu = { x: e.clientX, y: e.clientY }
	}
	/** ↑ / ↓ move the selection; Ctrl+A selects the shown rows; Ctrl+C copies the shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.map((r) => r.id), ws.selection, ws.select)) { e.preventDefault(); return }
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !(e.target instanceof Element && e.target.closest('input, select'))) { e.preventDefault(); e.stopPropagation(); ws.select(rows.map((r) => r.id)); return }
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

	// ── inline editing (Dave's note on patch-list-plan.md): double-click a Cord ID, Status or Notes cell ──
	type Field = 'cordId' | 'status' | 'notes'
	const FIELDS: Field[] = ['cordId', 'status', 'notes']
	let editing = $state<{ id: string; field: Field } | null>(null)
	function edit(id: string, field: Field, e: MouseEvent) { e.stopPropagation(); editing = { id, field } }
	const isEditing = (id: string, field: Field) => editing?.id === id && editing.field === field
	/** Save one cell. The status goes through the install rules (setStatus). */
	function save(id: string, field: Field, value: string) {
		const c = project.index.get(id)
		if (c?.type !== 'cord') return
		if (field === 'status') { if (value !== c.status) project.store.transact('Cord status', (tx) => tx.put(setStatus(c, value as Cord['status']))); return }
		const v = field === 'cordId' ? value.trim() : value
		if (v === (c[field] ?? '')) return
		project.store.transact(field === 'cordId' ? 'Cord ID' : 'Cord notes', (tx) => tx.put({ ...c, [field]: v || undefined }))
	}
	/** Leaving the box saves it — only while it is still the cell being edited (a key that moved on has saved it). */
	function blurSave(id: string, field: Field, value: string) { if (isEditing(id, field)) { save(id, field, value); editing = null } }
	/** Enter / Shift+Enter: save, then the same column on the next / previous row (typing a run of cord IDs);
	 *  Tab / Shift+Tab: the next / previous cell (Cord ID → Status → Notes → the next row); Esc cancels. */
	function editKey(e: KeyboardEvent, id: string, field: Field) {
		e.stopPropagation()
		if (e.key === 'Escape') { editing = null; return }
		if (e.key !== 'Enter' && e.key !== 'Tab') return
		e.preventDefault()
		save(id, field, (e.currentTarget as HTMLInputElement | HTMLSelectElement).value)
		const ids = rows.map((r) => r.id), i = ids.indexOf(id), back = e.shiftKey
		if (e.key === 'Enter') { const n = ids[i + (back ? -1 : 1)]; editing = n ? { id: n, field } : null; return }
		const k = i * FIELDS.length + FIELDS.indexOf(field) + (back ? -1 : 1), n = ids[Math.floor(k / FIELDS.length)]
		editing = n && k >= 0 ? { id: n, field: FIELDS[k % FIELDS.length] } : null
	}
	const focus = (el: HTMLElement) => { el.focus(); if (el instanceof HTMLInputElement) el.select() }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="h-full overflow-auto text-xs" tabindex="0" role="grid" aria-label="Patch list" onkeydown={tableKey}>
	<div class="actions">
		<ScopeSelect {t} view={inRoomView && roomId ? project.index.nameOf(roomId) : 'This view (all rooms)'} />
		<span class="muted" title="What new cords start as (a project setting)">New cords</span><CordMode {project} />
		{#each STATUSES as s (s)}
			<StatusChip tone={s} label="{s} {count[s]}" off={!show[s]} onclick={() => (show[s] = !show[s])} title="Show / hide {s} cords" />
		{/each}
		{#if removed.length}<button class="btn" title="The cords marked for removal{room ? ` in ${room.name}` : ''} are out on site: their records go (asks first)" onclick={() => runCordAction(project, ws, removed, 'installed')}>Purge removed ({removed.length})</button>{/if}
		<input class="find" placeholder="Find…" bind:value={t.q} />
		<span class="faint" title="Shown · in this scope · selected">{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}</span>
		<!-- the files and records (Dave 2026-10-12: easy to find): the patch list out as Excel, the cord labels bought, cord IDs back in -->
		<span class="files">
			<button class="btn" title="The patch list (schedule) as Excel for the installer — all rooms (a sheet each), a room, the selected or shown rows; every cord or only the changes — with the cord BOM" onclick={() => (bomOpen = true)}><Icon name="download" size={12} /> Patch list…</button>
			<button class="btn" title="The patch cords bought, as batches of pre-printed labels per type, length and colour: labels used and free, cords still short, where the next order continues" onclick={() => (labelsOpen = true)}><Icon name="tag" size={12} /> Cord labels…</button>
			<button class="btn" title="Read cord IDs back from a patch list (schedule) the installer filled in" onclick={() => fileInput?.click()}>Import cord IDs…</button>
		</span>
		<input bind:this={fileInput} type="file" accept=".xlsx" hidden onchange={(e) => importIds(e.currentTarget.files?.[0])} />
	</div>
	<!-- always there (rows mustn't jump under the pointer when the first one is picked) -->
	<div class="actions selbar">
		{#if selCords.length}<b>{selCords.length} selected:</b> <CordActions {project} {ws} cords={selCords} />
		{:else}<span class="faint">Select cords (click · Shift · Ctrl · Ctrl+A) to mark them installed, add, remove, restore or delete, or set their type / color — or right-click them</span>{/if}
	</div>
	<table class="w-full border-collapse">
		<thead>
			<tr><SortTh {t} key="from" cls="px-2 py-1">From</SortTh><SortTh {t} key="fromLabel">Label</SortTh><SortTh {t} key="to">To</SortTh><SortTh {t} key="toLabel">Label</SortTh><SortTh {t} key="type">Type</SortTh><SortTh {t} key="len">Len (m)</SortTh><SortTh {t} key="cordId">Cord ID</SortTh><SortTh {t} key="status">Status</SortTh><SortTh {t} key="notes">Notes</SortTh></tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				{@const rep = r.status === 'replace' ? replacedText(project.index.get<Cord>(r.id)!, typeLabel) : ''}
				<tr bind:this={rowEls[r.id]} class="hov" class:row-sel={selected.has(r.id) || onPorts.has(r.id)} class:gone={r.status === 'remove'} oncontextmenu={(e) => rowMenu(r.id, e)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5">{r.from}{#if r.wasFrom}<span class="was" title="Was {r.wasFrom}">↶</span>{/if}</td>
					<td class="px-2 font-mono muted">{r.fromLabel || '—'}</td>
					<td class="px-2">{r.to}{#if r.wasTo}<span class="was" title="Was {r.wasTo}">↶</span>{/if}</td>
					<td class="px-2 font-mono muted">{r.toLabel || '—'}</td>
					<td class="px-2"><span class="sw" style:background={r.colour}></span>{typeLabel(r.cableType)}{#if rep}<span class="was" title="Replaces the cord there now — {rep}">↶</span>{/if}</td>
					<td class="px-2">{r.lengthM}</td>
					{#if isEditing(r.id, 'cordId')}
						<td class="ed"><input class="cell font-mono" value={r.cordId} use:focus onkeydown={(e) => editKey(e, r.id, 'cordId')} onblur={(e) => blurSave(r.id, 'cordId', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2 font-mono" title="Double-click to edit (Enter: next row · Tab: next cell)" ondblclick={(e) => edit(r.id, 'cordId', e)}>{r.cordId}</td>{/if}
					{#if isEditing(r.id, 'status')}
						<td class="ed"><select class="cell" value={r.status} use:focus onkeydown={(e) => editKey(e, r.id, 'status')} onblur={(e) => blurSave(r.id, 'status', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							{#each STATUSES as s (s)}<option value={s}>{s}</option>{/each}
						</select></td>
					{:else}<td class="px-2" title="Double-click to set the status (the install rules apply: installed / add clear the history, remove keeps it)" ondblclick={(e) => edit(r.id, 'status', e)}><StatusChip tone={r.status} label={r.status} /></td>{/if}
					{#if isEditing(r.id, 'notes')}
						<td class="ed"><input class="cell" value={r.notes} use:focus onkeydown={(e) => editKey(e, r.id, 'notes')} onblur={(e) => blurSave(r.id, 'notes', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="clip px-2 muted" title={r.notes ? `${r.notes} — double-click to edit` : 'Double-click to add a note'} ondblclick={(e) => edit(r.id, 'notes', e)}>{r.notes}</td>{/if}
				</tr>
			{:else}
				<tr><td colspan="9" class="px-2 py-3 faint">No cords{all.length ? ' match' : ' yet — use the Cord tool in a rack view'}.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={cordActionMenu(project, ws, selCords)} onclose={() => (menu = null)} />{/if}
{#if bomOpen}<PatchScheduleDialog {project} {projectName} {roomId} thisRoom={!!room} selected={selCords} shown={rowCords} onclose={() => (bomOpen = false)} ondone={(m) => ws.say(m)} />{/if}
{#if labelsOpen}<CordLabelsDialog {project} onclose={() => (labelsOpen = false)} />{/if}

<style>
	.hov:hover { background: var(--cad-hover); }
	div[role='grid']:focus { outline: none; }
	.actions { position: sticky; left: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.selbar { flex-wrap: wrap; min-height: 26px; }
	/* marked for removal: still listed (the work order), struck through */
	.gone td { text-decoration: line-through; opacity: 0.6; }
	.gone td:nth-child(8) { text-decoration: none; }
	.was { margin-left: 4px; color: #d97706; font-weight: 600; cursor: help; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover { background: var(--cad-hover); }
	.files { margin-left: auto; display: inline-flex; gap: 4px; padding-left: 8px; border-left: 1px solid var(--cad-line); }
	.files .btn { display: inline-flex; align-items: center; gap: 3px; }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	.ed { padding: 0 2px; }
	.cell { width: 100%; min-width: 5rem; border: 1px solid #2563eb; border-radius: 3px; padding: 0 3px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid #0002; }
</style>
