<!-- The SHEET REGISTER (Phase 4.4; sheets-organising slice 1), a tables-panel tab: every sheet with its print order,
     number, title, CATEGORY (its own, else derived from its viewports — grey "auto"), LEVEL and ROOM (from its place,
     else its viewports), discipline, tags, revision, size, scale and status. Find, active / archived, filter CHIPS
     (category, level, room, tag: any pick within a chip, every chip), group, click a heading to sort (level in level
     order, category in the list's order). Number, title, category, discipline and tags are edited in place. Click
     selects (Shift / Ctrl for more), double-click opens the sheet, ↑ / ↓ move the selection, Ctrl+C copies the rows.
     PDF, Archive / Restore and Excel act on the selection (Excel: else the rows shown). The Issues view is
     IssuesList.svelte. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, SheetPackage } from '../domain/drawing'
	import type { ViewSpec } from '../views/space'
	import { sheetRows, filterRows, sortRows, groupRows, moveInPrintOrder, moveBefore, type SortKey, type GroupBy, type SheetRow } from '../domain/sheetList'
	import { ordered } from '../domain/sheetCategories'
	import { exportSheetRows } from '../render/sheetList'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'
	import IssuePanel from './IssuePanel.svelte'
	import IssuesList from './IssuesList.svelte'
	import PackagesList from './PackagesList.svelte'
	import ChipPick from './ChipPick.svelte'
	import { arrowSelect, copyRows } from './tableKit.svelte'
	import { deleteEntities, deleteImpact, impactText } from '../editor/commands'
	import { duplicateSheets, numberSheets } from '../app/sheetActions'

	let { project, ws, onview }: { project: CadProject; ws: Workspace; onview: (s: ViewSpec) => void } = $props()

	/** The global list (retired ones left out of pickers; they still name sheets that use them). */
	const cats = $derived(ordered(project.sheetCategories))
	const sheets = $derived([...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet'))
	let q = $state(''), status = $state<'active' | 'archived' | ''>('active'), by = $state<GroupBy>('none')
	let fCats = $state<string[]>([]), fLevels = $state<string[]>([]), fRooms = $state<string[]>([]), fTags = $state<string[]>([])
	let sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'number', dir: 1 })
	const all = $derived(sheetRows(project.index, sheets, project.sheetCategories))
	const rows = $derived(sortRows(filterRows(all, { q, status: status || undefined, cats: fCats, levels: fLevels, rooms: fRooms, tags: fTags }), sort.key, sort.dir))
	const groups = $derived(groupRows(rows, by))
	const selected = $derived(new Set(ws.selection))
	const picked = $derived(rows.filter((r) => selected.has(r.id)))
	const sheetOf = (id: string) => project.index.get(id) as Sheet

	// the chips offer what the sheets have (categories: the list, plus typed ones in use)
	const catOptions = $derived([...cats.map((c) => ({ id: c.id, label: c.label })), ...[...new Map(all.filter((r) => !cats.some((c) => c.id === r.categoryId)).map((r) => [r.categoryId, { id: r.categoryId, label: r.category }])).values()]])
	const levelOptions = $derived(project.levels.filter((l) => all.some((r) => r.levelIds.includes(l.id))).map((l) => ({ id: l.id, label: l.name })))
	const roomOptions = $derived([...new Map(all.flatMap((r) => r.roomIds.map((id, i) => [id, { id, label: r.room.split(' / ')[i] }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })))
	const tagOptions = $derived([...new Set(all.flatMap((r) => r.tags))].sort().map((t) => ({ id: t, label: t })))

	const COLS: [SortKey, string][] = [['order', '#'], ['number', 'No.'], ['title', 'Title'], ['category', 'Category'], ['level', 'Level'], ['room', 'Room'], ['discipline', 'Discipline'], ['rev', 'Rev'], ['size', 'Size'], ['scale', 'Scale']]
	const GROUPS: [GroupBy, string][] = [['none', 'none'], ['category', 'category'], ['level', 'level'], ['room', 'room'], ['place', 'place'], ['discipline', 'discipline'], ['tag', 'tag'], ['size', 'size']]
	const sortBy = (key: SortKey) => (sort = { key, dir: sort.key === key ? (-sort.dir as 1 | -1) : 1 })

	// click / Shift-range / Ctrl-toggle, as in the other grids
	let anchor: string | null = null
	function pick(id: string, e: MouseEvent) {
		if (e.shiftKey && anchor) {
			const i = rows.findIndex((r) => r.id === anchor), j = rows.findIndex((r) => r.id === id)
			if (i >= 0 && j >= 0) { ws.select(rows.slice(Math.min(i, j), Math.max(i, j) + 1).map((r) => r.id)); return }
		}
		anchor = id
		ws.select(e.ctrlKey || e.metaKey ? (selected.has(id) ? ws.selection.filter((x) => x !== id) : [...ws.selection, id]) : [id])
	}
	/** ↑ / ↓ move the selection; Ctrl+C copies the shown rows for Excel (as the other tables). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.map((r) => r.id), ws.selection, ws.select)) { e.preventDefault(); return }
		if (copyRows(e, ['#', 'No.', 'Title', 'Category', 'Level', 'Room', 'Discipline', 'Rev', 'Size', 'Scale', 'Tags', 'Status'],
			(picked.length ? picked : rows).map((r) => [r.order, r.number, r.title, r.category, r.level, r.room, r.discipline, r.rev, r.size, r.scale, r.tags.join(', '), r.status]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const put = (r: SheetRow, label: string, patch: Partial<Sheet>) => project.store.transact(label, (tx) => tx.put({ ...sheetOf(r.id), ...patch }))

	function setStatus(s: Sheet['status']) {
		if (!picked.length) return
		project.store.transact(`${s === 'archived' ? 'Archive' : 'Restore'} ${picked.length} sheet(s)`, (tx) => { for (const r of picked) tx.put({ ...sheetOf(r.id), status: s }) })
	}
	/** Print order (backlog "Print order"): the selected sheets one place earlier / later, as one undo step. */
	function move(dir: -1 | 1) {
		const changed = moveInPrintOrder(sheets, picked.map((r) => r.id), dir)
		sort = { key: 'order', dir: 1 }
		if (changed.length) project.store.transact(`Print order (${picked.length} sheet${picked.length === 1 ? '' : 's'})`, (tx) => { for (const s of changed) tx.put(s) })
	}
	let busy = $state(false)
	/** Delete the selected sheets, after saying what goes with them (viewports, notes). */
	function deletePicked() {
		const ids = picked.map((r) => r.id), also = impactText(deleteImpact(project.store, ids))
		ws.ask2(`Delete ${ids.length === 1 ? `sheet ${sheetOf(ids[0]).number}` : `${ids.length} sheets`}${also ? ` with ${also}` : ''}? Undo brings them back.`, 'Delete', () => { deleteEntities(project.store, ids); ws.select([]) })
	}
	async function pdf() {
		const list = picked.length ? picked : rows
		busy = true
		try { const r = await downloadSheetsPdf(project, list.map((x) => sheetOf(x.id))); ws.say(`PDF: ${r.pages} page(s)${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	async function excel() {
		try { await exportSheetRows(picked.length ? picked : rows, project.name) } catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
	}
	/** A group's sheets numbered in print order from a pattern, prefilled with the category's code (slice 3). */
	function numberGroup(g: { key: string; rows: SheetRow[] }) {
		const code = by === 'category' ? cats.find((c) => c.id === g.key)?.code : undefined
		ws.askText(`Number ${g.rows.length} sheets from`, `${code ?? 'S'}-01`, (t) => { if (t.trim()) ws.say(`${numberSheets(project, g.rows.map((r) => r.id), t)} sheet(s) numbered`) })
	}
	// drag rows to reorder when sorted by # (slice 4): the selection if the dragged row is in it, else that row; dropped
	// before the row under the pointer, one undo step
	let dragging: string[] = [], dropOn = $state<string | null>(null)
	function dragStart(e: DragEvent, id: string) {
		dragging = selected.has(id) ? picked.map((r) => r.id) : [id]
		e.dataTransfer?.setData('application/x-cad-sheets', dragging.join(','))
	}
	function dragOver(e: DragEvent, id: string) { if (!dragging.length || sort.key !== 'order') return; e.preventDefault(); dropOn = id }
	function dropRows(e: DragEvent, id: string) {
		e.preventDefault(); dropOn = null
		const ids = dragging; dragging = []
		const changed = sort.dir === 1 ? moveBefore(sheets, ids, id) : moveBefore(sheets, ids, rows[rows.findIndex((r) => r.id === id) - 1]?.id ?? null)
		if (changed.length) project.store.transact(`Print order (${ids.length} sheet${ids.length === 1 ? '' : 's'})`, (tx) => { for (const s of changed) tx.put(s) })
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim()
	const chips = $derived(fCats.length + fLevels.length + fRooms.length + fTags.length)

	// issuing (4.6): the selection, frozen when the panel opens
	let issuing = $state.raw<Sheet[] | null>(null), issuingPkg = $state.raw<SheetPackage | undefined>(undefined), show = $state<'register' | 'packages' | 'issues'>('register')
	const issueCount = $derived([...project.index.byId.values()].filter((e) => e.type === 'issue').length)
	const packageCount = $derived([...project.index.byId.values()].filter((e) => e.type === 'package' && !e.archived).length)
	function startIssue() {
		if (!picked.length) { ws.say('Select the sheets for the package'); return }
		issuingPkg = undefined
		issuing = picked.map((r) => sheetOf(r.id))
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="h-full overflow-auto text-xs" tabindex="0" role="grid" aria-label="Sheets" onkeydown={tableKey}>
	<div class="actions">
		<span class="seg">
			<button class:on={show === 'register'} onclick={() => (show = 'register')}>Sheets</button>
			<button class:on={show === 'packages'} title="Re-usable sets of sheets for issuing" onclick={() => (show = 'packages')}>Packages {packageCount || ''}</button>
			<button class:on={show === 'issues'} onclick={() => (show = 'issues')}>Issues {issueCount || ''}</button>
		</span>
	{#if show === 'register'}
		<input class="find" placeholder="Find…" bind:value={q} />
		<select bind:value={status} title="Show"><option value="active">Active</option><option value="archived">Archived</option><option value="">All</option></select>
		<ChipPick label="Category" options={catOptions} bind:picked={fCats} />
		<ChipPick label="Level" options={levelOptions} bind:picked={fLevels} />
		<ChipPick label="Room" options={roomOptions} bind:picked={fRooms} />
		{#if tagOptions.length}<ChipPick label="Tag" options={tagOptions} bind:picked={fTags} />{/if}
		{#if chips}<button class="clear" title="Clear every chip" onclick={() => { fCats = []; fLevels = []; fRooms = []; fTags = [] }}>Clear</button>{/if}
		<label class="text-zinc-500">Group <select bind:value={by}>{#each GROUPS as [g, label] (g)}<option value={g}>{label}</option>{/each}</select></label>
		<span class="text-zinc-400">{picked.length ? `${picked.length} selected · ` : ''}{rows.length} of {sheets.length}</span>
		<span class="seg" title="Print order: move the selected sheets earlier / later (the table sorts by # so you see it; the PDF follows the table)">
			<button disabled={!picked.length} onclick={() => move(-1)}>▲</button><button disabled={!picked.length} onclick={() => move(1)}>▼</button>
		</span>
		<button class="btn" disabled={busy} title="The selected sheets (else those shown) in one PDF, in the table's order" onclick={pdf}>{busy ? 'PDF…' : 'PDF'}</button>
		{#if status !== 'archived'}<button class="btn" disabled={!picked.length} onclick={() => setStatus('archived')}>Archive</button>{/if}
		<button class="btn" disabled={!picked.length} title="Copies of the selected sheets with their viewports and notes (no number, no revisions), each after its original" onclick={() => ws.select(duplicateSheets(project, picked.map((r) => r.id)))}>Duplicate</button>
		<button class="btn" disabled={!picked.length} title="Delete the selected sheets (asks first; Undo brings them back)" onclick={deletePicked}>Delete</button>
		{#if status !== 'active'}<button class="btn" disabled={!picked.length} onclick={() => setStatus('active')}>Restore</button>{/if}
		<button class="btn" title="The register (the selection, else the rows shown) as Excel" onclick={excel}>Excel</button>
		<button class="btn" disabled={!!issuing} title="Issue the selected sheets as one package: changed sheets get a new revision" onclick={startIssue}>Issue…</button>
	{/if}
	</div>
	{#if issuing}{#key issuingPkg?.id ?? ''}<IssuePanel {project} {ws} sheets={issuing} pkg={issuingPkg} onclose={() => { issuing = null; issuingPkg = undefined; show = 'issues' }} />{/key}{/if}
	{#if show === 'issues'}
		<IssuesList {project} {ws} busy={!!issuing} onreissue={(list, pkg) => { show = pkg ? 'packages' : 'register'; issuingPkg = pkg; issuing = list }} onpackages={() => (show = 'packages')} />
	{:else if show === 'packages'}
		<PackagesList {project} {ws} rows={all} filter={{ cats: fCats, levels: fLevels, rooms: fRooms, tags: fTags }} busy={!!issuing} onissue={(pkg, list) => { issuingPkg = pkg; issuing = list }} />
	{:else}
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr>
				{#each COLS as [k, label] (k)}<th class="px-2 py-1"><button class="th" title={k === 'order' ? 'The print order — sorted by this, drag rows to reorder' : undefined} onclick={() => sortBy(k)}>{label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>{/each}
				<th class="px-2">Tags</th><th class="px-2">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as g (g.key)}
				{#if by !== 'none'}<tr class="grp"><td colspan="12"><button class="gh" title="Select this group's sheets" onclick={() => ws.select(g.rows.map((r) => r.id))}>{g.label}</button> <span class="text-zinc-400">{g.rows.length}</span>
					<button class="gn" title="Number this group's sheets in print order from a pattern (the category's code: RE-01, RE-02 …)" onclick={() => numberGroup(g)}>Number…</button></td></tr>{/if}
				{#each g.rows as r (g.key + r.id)}
					<tr class="hov border-b border-zinc-100" class:row-sel={selected.has(r.id)} class:drop={dropOn === r.id}
						draggable={sort.key === 'order'} ondragstart={(e) => dragStart(e, r.id)} ondragover={(e) => dragOver(e, r.id)} ondragleave={() => (dropOn = null)} ondrop={(e) => dropRows(e, r.id)}
						onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)} ondblclick={() => onview({ kind: 'sheet', sheetId: r.id })}>
						<td class="px-2 font-mono text-zinc-400">{r.order}</td>
						<td class="px-2"><input class="cell font-mono w-20" value={r.number} onchange={(e) => put(r, 'Sheet number', { number: val(e) })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2"><input class="cell w-56" value={r.title} onchange={(e) => put(r, 'Sheet title', { title: val(e) })} onclick={(e) => e.stopPropagation()} /></td>
						<!-- its own category, or "auto" = the one its viewports make it (grey) -->
						<td class="px-2"><select class="cell" class:auto={r.categoryAuto} value={r.categoryAuto ? '' : r.categoryId} title={r.categoryAuto ? 'Worked out from its viewports — pick one to set it' : 'Its category'}
							onchange={(e) => put(r, 'Sheet category', { kind: e.currentTarget.value || undefined })} onclick={(e) => e.stopPropagation()}>
							<option value="">{r.categoryAuto ? `${r.category} (auto)` : 'Auto (from its viewports)'}</option>
							{#each cats as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
							{#if !r.categoryAuto && !cats.some((c) => c.id === r.categoryId)}<option value={r.categoryId}>{r.category}</option>{/if}
						</select></td>
						<td class="px-2 whitespace-nowrap">{r.level}</td>
						<td class="px-2 whitespace-nowrap">{r.room}</td>
						<td class="px-2"><input class="cell w-20" value={r.discipline} placeholder="—" onchange={(e) => put(r, 'Sheet discipline', { discipline: val(e) || undefined })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2 font-mono">{r.rev || '—'}</td>
						<td class="px-2">{r.size}</td>
						<td class="px-2">{r.scale}</td>
						<td class="px-2"><input class="cell w-28" value={r.tags.join(', ')} placeholder="—" title="Comma-separated" onchange={(e) => { const t = val(e).split(',').map((x) => x.trim()).filter(Boolean); put(r, 'Sheet tags', { tags: t.length ? t : undefined }) }} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2 text-zinc-500">{r.status}</td>
					</tr>
				{/each}
			{:else}
				<tr><td colspan="12" class="px-2 py-3 text-zinc-400">{sheets.length ? 'No sheets match.' : 'No sheets yet — Sheets → + New in the left panel.'}</td></tr>
			{/each}
		</tbody>
	</table>
	{/if}
</div>

<style>
	div[role='grid']:focus { outline: none; }
	.hov:hover { background: var(--cad-hover); }
	.seg { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; }
	.seg button { padding: 0 8px; font-weight: 600; color: var(--cad-muted); }
	.seg button.on { background: var(--cad-strong); color: var(--cad-text); }
	.actions { position: sticky; left: 0; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.btn:disabled { opacity: 0.4; }
	.clear { color: #2563eb; }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; background: var(--cad-input); color: var(--cad-text); }
	.th { font-weight: 600; color: inherit; }
	.cell { border: 1px solid transparent; border-radius: 3px; background: transparent; padding: 0 3px; color: inherit; }
	.cell:hover { border-color: var(--cad-line); }
	.cell:focus { border-color: #60a5fa; background: var(--cad-input); outline: none; }
	select.cell.auto { color: var(--cad-faint); font-style: italic; }
	.grp td { background: var(--cad-hover); font-weight: 600; padding: 2px 8px; color: var(--cad-muted); }
	.gh { font-weight: 600; color: inherit; }
	.gh:hover { color: #2563eb; text-decoration: underline; }
	tr[draggable='true'] { cursor: grab; }
	tr.drop td { box-shadow: inset 0 2px 0 #2563eb; }
	.gn { margin-left: 8px; font-weight: 400; color: var(--cad-faint); }
	.gn:hover { color: #2563eb; }
</style>
