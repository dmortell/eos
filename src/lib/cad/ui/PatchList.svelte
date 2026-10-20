<!-- The patch list (Phase 3.5): every cord, from / to with the labels they carry, type, color, length, ID, status.
     Status chips filter (the install workflow at a glance); a row click selects the cord, and a cord (or a port's
     cord) selected in a rack view is highlighted here and scrolled into view. "Export…" opens the patch schedule export with
     the Excel export (ui/PatchScheduleDialog.svelte). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { untrack } from 'svelte'
	import type { Cord } from '../domain/types'
	import { cableTypeLabel } from '../domain/cableTypes'
	import { patchList, type PatchRow } from '../domain/reports'
	import { importCordIds } from '../render/exports'
	import PatchScheduleDialog from './PatchScheduleDialog.svelte'
	import CordLabelsDialog from './CordLabelsDialog.svelte'
	import { Icon } from '$lib'
	import { TableState, arrowSelect, selectAllRows, copyRows, RowPick, CellEdit, focusCell, noTextPick } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import TableFrame from './TableFrame.svelte'
	import type { MenuItem } from './cadMenus'
	import CordActions from './CordActions.svelte'
	import StatusChip from './StatusChip.svelte'
	import CordMode from './CordMode.svelte'
	import ContextMenu from './ContextMenu.svelte'
	import { cordActionMenu, runCordAction, repatchFrom } from './cordActions'
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
	/** A moved cord's old ends in words (User 2026-10-20, cutovers: the installer needs where to unplug it, not just a ↶
	 *  tip) — a "Was" column while any cord in the list has moved. */
	const wasText = (r: PatchRow) => [r.wasFrom && `From ${r.wasFrom}`, r.wasTo && `To ${r.wasTo}`].filter(Boolean).join(' · ')
	const hasWas = $derived(all.some((r) => r.wasFrom || r.wasTo))
	const rows = $derived(t.apply(all.filter((r) => show[r.status]), (r) => `${r.from} ${r.fromLabel} ${r.to} ${r.toLabel} ${wasText(r)} ${r.cordId} ${r.notes} ${typeLabel(r.cableType)}`,
		{ from: (r) => r.from, fromLabel: (r) => r.fromLabel, to: (r) => r.to, toLabel: (r) => r.toLabel, was: wasText, type: (r) => typeLabel(r.cableType), len: (r) => r.lengthM, cordId: (r) => r.cordId, status: (r) => STATUSES.indexOf(r.status), notes: (r) => r.notes }))
	const nSel = $derived(rows.filter((r) => selected.has(r.id)).length)
	/** The selected rows' cords — what the action bar and the right-click act on (patch-list-plan.md Slice 2). */
	const selCords = $derived(rows.filter((r) => selected.has(r.id)).map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	/** The rows shown (scope, status chips, Find) as cords — the export's "rows the list shows". */
	const rowCords = $derived(rows.map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	/** Purge removed: every cord marked for removal in this scope is out on site — their records go. */
	const removed = $derived(all.filter((r) => r.status === 'remove').map((r) => project.index.get(r.id)).filter((c): c is Cord => c?.type === 'cord'))
	/** Asks first (the installer's list can't bring the records back — only Undo can): names how many cords go; yes is ONE undo step. */
	function purgeRemoved() {
		const cords = removed, n = cords.length
		if (!n) return
		ws.ask2(`Purge ${n} cord${n === 1 ? '' : 's'} marked for removal${room ? ` in ${room.name}` : ''}? ${n === 1 ? 'Its record goes' : 'Their records go'} — the installer’s list can’t bring ${n === 1 ? 'it' : 'them'} back (Undo does).`,
			`Purge ${n} cord${n === 1 ? '' : 's'}`, () => runCordAction(project, ws, cords, 'installed'))
	}
	/** ⋯: the cord labels bought, cord IDs back in, and Purge removed. */
	const more = $derived<MenuItem[]>([
		{ label: 'Cord labels…', title: 'The patch cords bought, as batches of pre-printed labels per type, length and color: labels used and free, cords still short, where the next order continues', run: () => (labelsOpen = true) },
		{ label: 'Import cord IDs…', title: 'Read cord IDs back from a patch list (schedule) the installer filled in', run: () => fileInput?.click() },
		'-',
		{ label: `Purge removed (${removed.length})`, disabled: !removed.length, title: `The cords marked for removal${room ? ` in ${room.name}` : ''} are out on site: their records go (asks first)`, run: purgeRemoved },
	])
	let menu = $state<{ x: number; y: number } | null>(null)
	function rowMenu(id: string, e: MouseEvent) {
		e.preventDefault()
		if (!selected.has(id)) ws.select([id])
		menu = { x: e.clientX, y: e.clientY }
	}
	/** ↑ / ↓ move the selection; F2 / Enter edit the selected row; Ctrl+A selects the shown rows; Ctrl+C copies the
	 *  shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.map((r) => r.id), ws.selection, ws.selectAndReveal) || ed.tableKey(e, ws.selection)) { e.preventDefault(); e.stopPropagation(); return }
		if (selectAllRows(e, rows.map((r) => r.id), ws.select)) { e.preventDefault(); e.stopPropagation(); return }
		if (copyRows(e, ['From', 'Label', 'To', 'Label', ...(hasWas ? ['Was'] : []), 'Type', 'Length (m)', 'Cord ID', 'Status', 'Notes'], rows.map((r) => [r.from, r.fromLabel, r.to, r.toLabel, ...(hasWas ? [wasText(r)] : []), typeLabel(r.cableType), r.lengthM, r.cordId, r.status, r.notes]), ws.say)) { e.preventDefault(); e.stopPropagation() }
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
	// click = one, Shift = the range from the last clicked, Ctrl = add / drop one (tableKit.RowPick, as every table)
	const rp = new RowPick()
	const pick = (id: string, e: MouseEvent) => rp.pick(id, e, rows.map((r) => r.id), ws.selection, ws.selectAndReveal)
	const typeLabel = (id: string) => cableTypeLabel(project.settings, id)

	// ── inline editing (User's note on patch-list-plan.md; tableKit.CellEdit): double-click a Cord ID, Status or Notes
	// cell, or F2 / Enter on the selected row; Enter runs down a column (typing a run of cord IDs), Tab along the row ──
	type Field = 'to' | 'cordId' | 'status' | 'notes'
	// To last: F2 / Enter still opens the Cord ID first (typing a run of IDs); a double-click opens To (W17)
	const FIELDS: Field[] = ['cordId', 'status', 'notes', 'to']
	/** Save one cell. The status goes through the install rules (setStatus). */
	function save(id: string, field: Field, value: string) {
		const c = project.index.get(id)
		if (c?.type !== 'cord') return
		if (field === 'to') { repatchFrom(project, ws, [c], value, 'b'); return }   // the typed port (W17)
		if (field === 'status') { if (value !== c.status) project.store.transact('Cord status', (tx) => tx.put(setStatus(c, value as Cord['status']))); return }
		const v = field === 'cordId' ? value.trim() : value
		if (v === (c[field] ?? '')) return
		project.store.transact(field === 'cordId' ? 'Cord ID' : 'Cord notes', (tx) => tx.put({ ...c, [field]: v || undefined }))
	}
	const ed = new CellEdit<Field>({ fields: () => FIELDS, ids: () => rows.map((r) => r.id), save })
</script>

<input bind:this={fileInput} type="file" accept=".xlsx" hidden onchange={(e) => importIds(e.currentTarget.files?.[0])} />
<TableFrame label="Patch list" {t} view={inRoomView && roomId ? project.index.nameOf(roomId) : 'This view (all rooms)'} onkeydown={tableKey} {more}
	count="{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}" nSel={selCords.length}
	hint="Select cords (click · Shift · Ctrl · Ctrl+A) to mark them installed, add, remove, restore or delete, or set their type / color — or right-click them">
	{#snippet chips()}
		{#each STATUSES as s (s)}
			<StatusChip tone={s} label="{s} {count[s]}" off={!show[s]} onclick={() => (show[s] = !show[s])} title="Show / hide {s} cords" />
		{/each}
	{/snippet}
	{#snippet sel()}<CordActions {project} {ws} cords={selCords} />{/snippet}
	{#snippet tail()}
		<!-- what new cords start as, shown where cords are listed (D1); the patch list out (User 2026-10-12: easy to find) -->
		<span class="muted" title="What new cords start as (a project setting)">New cords</span><CordMode {project} />
		<button class="tb" title="The patch list (schedule) as Excel for the installer — all rooms (a sheet each), a room, the selected or shown rows; every cord or only the changes — with the cord BOM" onclick={() => (bomOpen = true)}><Icon name="download" size={12} /> Patch schedule · cord BOM…</button>
	{/snippet}
	<table class="w-full border-collapse">
		<thead>
			<tr><SortTh {t} key="from" cls="px-2 py-1">From</SortTh><SortTh {t} key="fromLabel">Label</SortTh><SortTh {t} key="to">To</SortTh><SortTh {t} key="toLabel">Label</SortTh>{#if hasWas}<SortTh {t} key="was">Was</SortTh>{/if}<SortTh {t} key="type">Type</SortTh><SortTh {t} key="len">Len (m)</SortTh><SortTh {t} key="cordId">Cord ID</SortTh><SortTh {t} key="status">Status</SortTh><SortTh {t} key="notes">Notes</SortTh></tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				{@const rep = r.status === 'replace' ? replacedText(project.index.getOf('cord', r.id)!, typeLabel) : ''}
				<tr bind:this={rowEls[r.id]} class="hov" class:row-sel={selected.has(r.id) || onPorts.has(r.id)} class:gone={r.status === 'remove'} oncontextmenu={(e) => rowMenu(r.id, e)} onmousedown={noTextPick} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5">{r.from}{#if r.wasFrom}<span class="was" title="Was {r.wasFrom}">↶</span>{/if}</td>
					<td class="px-2 font-mono muted">{r.fromLabel || '—'}</td>
					{#if ed.is(r.id, 'to')}
						<td class="ed"><input class="ed-box" value={r.to} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'to')} onblur={(e) => ed.blur(r.id, 'to', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2" title="Double-click to re-patch: type device : port (SW1:41), or just the port · several cords at once: select them, Re-patch… (the rest go to the next free ports)" ondblclick={(e) => ed.start(r.id, 'to', e)}>{r.to}{#if r.wasTo}<span class="was" title="Was {r.wasTo}">↶</span>{/if}</td>{/if}
					<td class="px-2 font-mono muted">{r.toLabel || '—'}</td>
					{#if hasWas}<td class="px-2 was-txt">{wasText(r)}</td>{/if}
					<td class="px-2"><span class="sw" style:background={r.colour}></span>{typeLabel(r.cableType)}{#if rep}<span class="was" title="Replaces the cord there now — {rep}">↶</span>{/if}</td>
					<td class="px-2">{r.lengthM}</td>
					{#if ed.is(r.id, 'cordId')}
						<td class="ed"><input class="ed-box font-mono" value={r.cordId} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'cordId')} onblur={(e) => ed.blur(r.id, 'cordId', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2 font-mono" title="Double-click (or F2) to edit (Enter: next row · Tab: next cell)" ondblclick={(e) => ed.start(r.id, 'cordId', e)}>{r.cordId}</td>{/if}
					{#if ed.is(r.id, 'status')}
						<td class="ed"><select class="ed-box" value={r.status} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'status')} onblur={(e) => ed.blur(r.id, 'status', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							{#each STATUSES as s (s)}<option value={s}>{s}</option>{/each}
						</select></td>
					{:else}<td class="px-2" title="Double-click to set the status (the install rules apply: installed / add clear the history, remove keeps it)" ondblclick={(e) => ed.start(r.id, 'status', e)}><StatusChip tone={r.status} label={r.status} /></td>{/if}
					{#if ed.is(r.id, 'notes')}
						<td class="ed"><input class="ed-box" value={r.notes} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'notes')} onblur={(e) => ed.blur(r.id, 'notes', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="clip px-2 muted" title={r.notes ? `${r.notes} — double-click to edit` : 'Double-click to add a note'} ondblclick={(e) => ed.start(r.id, 'notes', e)}>{r.notes}</td>{/if}
				</tr>
			{:else}
				<tr><td colspan={hasWas ? 10 : 9} class="px-2 py-3 faint">No cords{all.length ? ' match' : ' yet — use the Cord tool in a rack view'}.</td></tr>
			{/each}
		</tbody>
	</table>
</TableFrame>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={cordActionMenu(project, ws, selCords)} onclose={() => (menu = null)} />{/if}
{#if bomOpen}<PatchScheduleDialog {project} {projectName} {roomId} thisRoom={!!room} selected={selCords} shown={rowCords} onclose={() => (bomOpen = false)} ondone={(m) => ws.say(m)} />{/if}
{#if labelsOpen}<CordLabelsDialog {project} onclose={() => (labelsOpen = false)} />{/if}

<style>
	.hov:hover { background: var(--cad-hover); }
	/* marked for removal: still listed (the work order), struck through */
	.gone td { text-decoration: line-through; opacity: 0.6; }
	.gone td:nth-child(8) { text-decoration: none; }
	.was { margin-left: 4px; color: #d97706; font-weight: 600; cursor: help; }
	.was-txt { color: #b45309; white-space: nowrap; }   /* the CHANGE amber, as the ↶ */
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid #0002; }
</style>
