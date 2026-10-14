<!-- The SHEET REGISTER (Phase 4.4; sheets-organising slice 1), a tables-panel tab: every sheet with its print order,
     number, title, CATEGORY (its own, else derived from its viewports — grey "auto"), LEVEL and ROOM (from its place,
     else its viewports), discipline, tags, revision, size, scale and status. Find, active / archived, filter CHIPS
     (category, level, room, tag: any pick within a chip, every chip), group, click a heading to sort (level in level
     order, category in the list's order). Number, title, category, discipline and tags are edited in place. Click
     selects (Shift / Ctrl for more), double-click opens the sheet, ↑ / ↓ move the selection, Ctrl+C copies the rows.
     PDF, Archive / Restore and Excel act on the selection (Excel: else the rows shown). The Issues view is
     IssuesList.svelte. -->
<script lang="ts">
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, SheetPackage } from '../domain/drawing'
	import { put as kitPut } from './propsKit'
	import type { ViewSpec } from '../views/space'
	import { sheetRows, filterRows, sortRows, groupRows, moveInPrintOrder, moveBefore, type SortKey, type GroupBy, type SheetRow } from '../domain/sheetList'
	import { ordered } from '../domain/sheetCategories'
	import { exportSheetRows } from '../render/sheetList'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'
	import IssuePanel from './IssuePanel.svelte'
	import IssuesList from './IssuesList.svelte'
	import PackagesList from './PackagesList.svelte'
	import ChipPick from './ChipPick.svelte'
	import { TableState, arrowSelect, selectAllRows, copyRows, RowPick, CellEdit, focusCell, noTextPick } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import TableFrame from './TableFrame.svelte'
	import type { MenuItem } from './cadMenus'
	import { deleteEntities, deleteImpact, impactText } from '../editor/commands'
	import { duplicateSheets, numberSheets } from '../app/sheetActions'
	import { issueStatesOf } from '../app/issueStates.svelte'
	import { ISSUE_STATE_TEXT } from '../domain/issue'
	import NameInput from './NameInput.svelte'
	import StatusChip from './StatusChip.svelte'

	let { project, ws, onview }: { project: CadProject; ws: Workspace; onview: (s: ViewSpec) => void } = $props()

	/** The global list (retired ones left out of pickers; they still name sheets that use them). */
	const cats = $derived(ordered(project.sheetCategories))
	const sheets = $derived(project.dataIndex.ofType('sheet'))
	let by = $state<GroupBy>('none')
	let fCats = $state<string[]>([]), fLevels = $state<string[]>([]), fRooms = $state<string[]>([]), fTags = $state<string[]>([])
	/** Active / Archived as chips (both on = all). */
	let showStatus = $state<Record<Sheet['status'], boolean>>({ active: true, archived: false })
	/** Sort (remembered; a third click goes back to the print order), Find and scope (All · Selection) — tableKit, as
	 *  the other tables. */
	const t = new TableState('sheets', 'all', 'number', ['sel', 'all'])
	const all = $derived(sheetRows(project.index, sheets, project.sheetCategories))
	const statusCount = $derived({ active: all.filter((r) => r.status === 'active').length, archived: all.filter((r) => r.status === 'archived').length })
	/** The sort in force: no column picked = the print order. */
	const sortKey = $derived((t.sortKey ?? 'order') as SortKey), sortDir = $derived(t.sortKey ? t.sortDir : 1)
	// the ISSUE STATE column (slice 5): worked out in the background only while it's on
	let showState = $state(true), fStates = $state<string[]>([])   // W24: on by default (⋯ turns it off)
	const states = $derived(issueStatesOf(project))
	$effect(() => { if (showState) return untrack(() => states.want()) })   // untracked: an edit re-checks via `of`, debounced
	const stateOf = (r: SheetRow) => states.of(sheetOf(r.id))
	const stateText = (r: SheetRow) => { const st = stateOf(r); return st === 'issued' || st === 'changed' ? `${ISSUE_STATE_TEXT[st]} ${r.rev}` : ISSUE_STATE_TEXT[st] }
	const STATE_OPTIONS = (['not-issued', 'issued', 'changed', 'superseded'] as const).map((id) => ({ id, label: ISSUE_STATE_TEXT[id] }))
	const selected = $derived(new Set(ws.selection))
	const rows = $derived(sortRows(filterRows(t.scope === 'sel' ? all.filter((r) => selected.has(r.id)) : all, { q: t.q, cats: fCats, levels: fLevels, rooms: fRooms, tags: fTags }), sortKey, sortDir)
		.filter((r) => showStatus[r.status] && (!showState || !fStates.length || fStates.includes(stateOf(r)))))
	const groups = $derived(groupRows(rows, by))
	const picked = $derived(rows.filter((r) => selected.has(r.id)))
	const sheetOf = (id: string) => project.index.get(id) as Sheet

	// the chips offer what the sheets have (categories: the list, plus typed ones in use)
	const catOptions = $derived([...cats.map((c) => ({ id: c.id, label: c.label })), ...[...new Map(all.filter((r) => !cats.some((c) => c.id === r.categoryId)).map((r) => [r.categoryId, { id: r.categoryId, label: r.category }])).values()]])
	const levelOptions = $derived(project.levels.filter((l) => all.some((r) => r.levelIds.includes(l.id))).map((l) => ({ id: l.id, label: l.name })))
	const roomOptions = $derived([...new Map(all.flatMap((r) => r.roomIds.map((id, i) => [id, { id, label: r.room.split(' / ')[i] }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })))
	const tagOptions = $derived([...new Set(all.flatMap((r) => r.tags))].sort().map((t) => ({ id: t, label: t })))

	const COLS: [SortKey, string][] = [['order', '#'], ['number', 'No.'], ['title', 'Title'], ['category', 'Category'], ['level', 'Level'], ['room', 'Room'], ['discipline', 'Discipline'], ['rev', 'Rev'], ['size', 'Size'], ['scale', 'Scale']]
	const GROUPS: [GroupBy, string][] = [['none', 'none'], ['category', 'category'], ['level', 'level'], ['room', 'room'], ['place', 'place'], ['discipline', 'discipline'], ['tag', 'tag'], ['size', 'size']]

	/** The rows in the order shown (grouped: group by group; a sheet with two tags once). */
	const shownIds = $derived([...new Set(groups.flatMap((g) => g.rows.map((r) => r.id)))])
	// click / Shift-range / Ctrl-toggle, as in the other grids (tableKit.RowPick)
	const rp = new RowPick()
	const pick = (id: string, e: MouseEvent) => rp.pick(id, e, shownIds, ws.selection, ws.select)
	// ── editing in place (tableKit.CellEdit): double-click a cell, or F2 / Enter on the selected row ──
	type Field = 'number' | 'title' | 'category' | 'discipline' | 'tags'
	const FIELDS: Field[] = ['number', 'title', 'category', 'discipline', 'tags']
	const ed = new CellEdit<Field>({
		fields: () => FIELDS, ids: () => shownIds,
		save: (id, field, value) => {
			const s = sheetOf(id), v = value.trim()
			if (s?.type !== 'sheet') return
			if (field === 'number') { if (v !== s.number) put(s, 'Sheet number', { number: v }) }
			else if (field === 'title') { if (v !== s.title) put(s, 'Sheet title', { title: v }) }
			else if (field === 'category') { if (v !== (s.kind ?? '')) put(s, 'Sheet category', { kind: v || undefined }) }
			else if (field === 'discipline') { if (v !== (s.discipline ?? '')) put(s, 'Sheet discipline', { discipline: v || undefined }) }
			else {
				const tags = v.split(',').map((x) => x.trim()).filter(Boolean)
				if (tags.join(', ') !== (s.tags ?? []).join(', ')) put(s, 'Sheet tags', { tags: tags.length ? tags : undefined })
			}
		},
	})
	/** ↑ / ↓ move the selection; F2 / Enter edit the selected row; Ctrl+C copies the shown rows for Excel (as the other tables). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, shownIds, ws.selection, ws.select) || ed.tableKey(e, ws.selection) || selectAllRows(e, shownIds, ws.select)) { e.preventDefault(); e.stopPropagation(); return }
		if (copyRows(e, ['#', 'No.', 'Title', 'Category', 'Level', 'Room', 'Discipline', 'Rev', 'Size', 'Scale', 'Tags', 'Status'],
			(picked.length ? picked : rows).map((r) => [r.order, r.number, r.title, r.category, r.level, r.room, r.discipline, r.rev, r.size, r.scale, r.tags.join(', '), r.status]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const put = (r: { id: string }, label: string, patch: Partial<Sheet>) => kitPut(project.store, sheetOf(r.id), label, patch)

	function setStatus(s: Sheet['status']) {
		if (!picked.length) return
		project.store.transact(`${s === 'archived' ? 'Archive' : 'Restore'} ${picked.length} sheet(s)`, (tx) => { for (const r of picked) tx.put({ ...sheetOf(r.id), status: s }) })
	}
	/** Print order (backlog "Print order"): the selected sheets one place earlier / later, as one undo step. */
	function move(dir: -1 | 1) {
		const changed = moveInPrintOrder(sheets, picked.map((r) => r.id), dir)
		t.sortBy('order')
		if (changed.length) project.store.transact(`Print order (${picked.length} sheet${picked.length === 1 ? '' : 's'})`, (tx) => { for (const s of changed) tx.put(s) })
	}
	let busy = $state(false)
	/** Delete the selected sheets: at once when nothing goes with them; asked first, saying what, when viewports or
	 *  notes go too. */
	function deletePicked() {
		const ids = picked.map((r) => r.id), also = impactText(deleteImpact(project.store, ids))
		const what = ids.length === 1 ? `sheet ${sheetOf(ids[0]).number}` : `${ids.length} sheets`
		const go = () => { deleteEntities(project.store, ids); ws.select([]) }
		if (!also) { go(); ws.say(`Deleted ${what} — Undo brings ${ids.length === 1 ? 'it' : 'them'} back`); return }
		ws.ask2(`Delete ${what} with ${also}? Undo brings them back.`, 'Delete', go)
	}
	/** The sheets in one PDF, in the table's order. */
	async function pdf(list: SheetRow[]) {
		busy = true
		try { const r = await downloadSheetsPdf(project, list.map((x) => sheetOf(x.id)), ws.monoPdf); ws.say(`PDF: ${r.pages} page(s)${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	async function excel() {
		try { await exportSheetRows(picked.length ? picked : rows, project.name) } catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
	}
	/** A group's sheets numbered in print order from a pattern, prefilled with the category's code (slice 3). */
	// the first number is typed in the group's heading (not the status bar, Dave 2026-10-12)
	let numbering = $state<string | null>(null)
	const firstNumber = (key: string) => `${(by === 'category' ? cats.find((c) => c.id === key)?.code : undefined) ?? 'S'}-01`
	function numberGroup(g: { key: string; rows: SheetRow[] }, from: string) {
		numbering = null
		ws.say(`${numberSheets(project, g.rows.map((r) => r.id), from)} sheet(s) numbered`)
	}
	// drag rows to reorder when sorted by # (slice 4): the selection if the dragged row is in it, else that row; dropped
	// before the row under the pointer, one undo step
	let dragging: string[] = [], dropOn = $state<string | null>(null)
	function dragStart(e: DragEvent, id: string) {
		dragging = selected.has(id) ? picked.map((r) => r.id) : [id]
		e.dataTransfer?.setData('application/x-cad-sheets', dragging.join(','))
	}
	function dragOver(e: DragEvent, id: string) { if (!dragging.length || sortKey !== 'order') return; e.preventDefault(); dropOn = id }
	function dropRows(e: DragEvent, id: string) {
		e.preventDefault(); dropOn = null
		const ids = dragging; dragging = []
		const changed = sortDir === 1 ? moveBefore(sheets, ids, id) : moveBefore(sheets, ids, rows[rows.findIndex((r) => r.id === id) - 1]?.id ?? null)
		if (changed.length) project.store.transact(`Print order (${ids.length} sheet${ids.length === 1 ? '' : 's'})`, (tx) => { for (const s of changed) tx.put(s) })
	}
	const nChips = $derived(fCats.length + fLevels.length + fRooms.length + fTags.length + fStates.length)
	/** ⋯: the PDF / Excel of the rows shown, the Issue state column, Group by. */
	const more = $derived<MenuItem[]>([
		{ label: busy ? 'PDF…' : `PDF of the ${rows.length} sheets shown`, disabled: busy || !rows.length, title: 'The sheets the table shows in one PDF, in its order (select some for a PDF of those)', run: () => pdf(rows) },
		{ label: `Excel: the register (${picked.length ? `${picked.length} selected` : `${rows.length} shown`})`, title: 'The register as Excel: the selected sheets, else the rows shown', run: excel },
		'-',
		{ label: `Issue state column${states.busy ? '…' : ''}`, checked: showState, title: 'Show each sheet’s issue state — worked out in the background (draws every issued sheet); a State chip filters by it', run: () => { showState = !showState; if (!showState) fStates = [] } },
		'-',
		...GROUPS.map(([g, label]): MenuItem => ({ label: g === 'none' ? 'No groups' : `Group by ${label}`, checked: by === g, run: () => (by = g) })),
	])

	// issuing (4.6): the selection, frozen when the panel opens
	let issuing = $state.raw<Sheet[] | null>(null), issuingPkg = $state.raw<SheetPackage | undefined>(undefined), show = $state<'register' | 'packages' | 'issues'>('register')
	const issueCount = $derived(project.dataIndex.ofType('issue').length)
	const packageCount = $derived(project.dataIndex.ofType('package').filter((e) => !e.archived).length)
	function startIssue() {
		if (!picked.length) { ws.say('Select the sheets for the package'); return }
		issuingPkg = undefined
		issuing = picked.map((r) => sheetOf(r.id))
	}
</script>

{#snippet seg()}
	<!-- the register, its packages and its issues: one tab of the tables, three views (they share the register's
	     selection, chips and the Issue panel) -->
	<span class="seg" role="tablist" aria-label="Sheets view">
		<button role="tab" aria-selected={show === 'register'} class:on={show === 'register'} onclick={() => (show = 'register')}>Sheets</button>
		<button role="tab" aria-selected={show === 'packages'} class:on={show === 'packages'} title="Re-usable sets of sheets for issuing" onclick={() => (show = 'packages')}>Packages {packageCount || ''}</button>
		<button role="tab" aria-selected={show === 'issues'} class:on={show === 'issues'} onclick={() => (show = 'issues')}>Issues {issueCount || ''}</button>
	</span>
{/snippet}

{#snippet issuePanel()}
	{#if issuing}{#key issuingPkg?.id ?? ''}<IssuePanel {project} {ws} sheets={issuing} pkg={issuingPkg} onclose={(issued) => { issuing = null; issuingPkg = undefined; if (issued) show = 'issues' }} />{/key}{/if}
{/snippet}

{#if show === 'issues'}
	<IssuesList {project} {ws} {seg} panel={issuePanel} busy={!!issuing} onreissue={(list, pkg) => { show = pkg ? 'packages' : 'register'; issuingPkg = pkg; issuing = list }} onpackages={() => (show = 'packages')} />
{:else if show === 'packages'}
	<PackagesList {project} {ws} {seg} panel={issuePanel} rows={all} filter={{ cats: fCats, levels: fLevels, rooms: fRooms, tags: fTags }} busy={!!issuing} onissue={(pkg, list) => { issuingPkg = pkg; issuing = list }} />
{:else}
<TableFrame label="Sheets" {t} lead={seg} top={issuePanel} onkeydown={tableKey} {more} countTitle="Shown · sheets · selected"
	count="{rows.length} of {sheets.length}{picked.length ? ` · ${picked.length} selected` : ''}" nSel={picked.length}
	hint="Select sheets (click · Shift · Ctrl) to print, issue, order, archive or delete them — double-click one to open it">
	{#snippet chips()}
		<StatusChip tone="active" label="Active {statusCount.active}" off={!showStatus.active} upper={false} title="Show / hide the active sheets" onclick={() => (showStatus.active = !showStatus.active)} />
		<StatusChip tone="archived" label="Archived {statusCount.archived}" off={!showStatus.archived} upper={false} title="Show / hide the archived sheets" onclick={() => (showStatus.archived = !showStatus.archived)} />
		<ChipPick label="Category" options={catOptions} bind:picked={fCats} />
		<ChipPick label="Level" options={levelOptions} bind:picked={fLevels} />
		<ChipPick label="Room" options={roomOptions} bind:picked={fRooms} />
		{#if tagOptions.length}<ChipPick label="Tag" options={tagOptions} bind:picked={fTags} />{/if}
		{#if showState}<ChipPick label="State{states.busy ? '…' : ''}" options={STATE_OPTIONS} bind:picked={fStates} />{/if}
		{#if nChips}<button class="clear" title="Clear every chip" onclick={() => { fCats = []; fLevels = []; fRooms = []; fTags = []; fStates = [] }}>Clear</button>{/if}
	{/snippet}
	{#snippet sel()}
		<span class="seg" title="Print order: move the selected sheets earlier / later (the table sorts by # so you see it; the PDF follows the table)">
			<button aria-label="Earlier in the print order" onclick={() => move(-1)}>▲</button><button aria-label="Later in the print order" onclick={() => move(1)}>▼</button>
		</span>
		<button class="tb" disabled={busy} title="The selected sheets in one PDF, in the table's order" onclick={() => pdf(picked)}>{busy ? 'PDF…' : 'PDF'}</button>
		<button class="tb" disabled={!!issuing} title="Issue the selected sheets as one package: changed sheets get a new revision" onclick={startIssue}>Issue…</button>
		<button class="tb" title="Copies of the selected sheets with their viewports and notes (no number, no revisions), each after its original" onclick={() => ws.select(duplicateSheets(project, picked.map((r) => r.id)))}>Duplicate</button>
		{#if picked.some((r) => r.status === 'active')}<button class="tb" onclick={() => setStatus('archived')}>Archive</button>{/if}
		{#if picked.some((r) => r.status === 'archived')}<button class="tb" onclick={() => setStatus('active')}>Restore</button>{/if}
		<button class="tb danger" title="Delete the selected sheets (asks first only when viewports or notes go with them; Undo brings them back)" onclick={deletePicked}>Delete</button>
	{/snippet}
	<table class="w-full border-collapse">
		<thead>
			<tr>
				{#each COLS as [k, label] (k)}<SortTh {t} key={k} cls="px-2 py-1" title={k === 'order' ? 'The print order (also the order with no column picked) — drag rows to reorder' : undefined}>{label}</SortTh>{/each}
				{#if showState}<th class="px-2">Issue</th>{/if}<th class="px-2">Tags</th><th class="px-2">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as g (g.key)}
				{#if by !== 'none'}<tr class="grp"><td colspan="12"><button class="gh" title="Select this group's sheets" onclick={() => ws.select(g.rows.map((r) => r.id))}>{g.label}</button> <span class="faint">{g.rows.length}</span>
					{#if numbering === g.key}<span class="muted">Number {g.rows.length} sheets from</span> <NameInput create value={firstNumber(g.key)} title="The first number (RE-01 → RE-02, RE-03 …) — Enter numbers them in print order · Esc cancels" onsave={(t) => numberGroup(g, t)} oncancel={() => (numbering = null)} />
					{:else}<button class="gn" title="Number this group's sheets in print order from a pattern (the category's code: RE-01, RE-02 …)" onclick={() => (numbering = g.key)}>Number…</button>{/if}</td></tr>{/if}
				{#each g.rows as r (g.key + r.id)}
					<tr class="hov" class:row-sel={selected.has(r.id)} class:drop={dropOn === r.id}
						draggable={sortKey === 'order'} ondragstart={(e) => dragStart(e, r.id)} ondragover={(e) => dragOver(e, r.id)} ondragleave={() => (dropOn = null)} ondrop={(e) => dropRows(e, r.id)}
						onmousedown={noTextPick} onclick={(e) => pick(r.id, e)} ondblclick={() => onview({ kind: 'sheet', sheetId: r.id })}>
						<td class="px-2 font-mono faint">{r.order}</td>
						{#if ed.is(r.id, 'number')}
							<td class="ed"><input class="ed-box font-mono" value={r.number} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'number')} onblur={(e) => ed.blur(r.id, 'number', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
						{:else}<td class="px-2 font-mono whitespace-nowrap" title="Double-click (or F2) to edit · double-click elsewhere on the row opens the sheet" ondblclick={(e) => ed.start(r.id, 'number', e)}>{r.number}</td>{/if}
						{#if ed.is(r.id, 'title')}
							<td class="ed"><input class="ed-box" value={r.title} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'title')} onblur={(e) => ed.blur(r.id, 'title', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
						{:else}<td class="clip px-2" title="Double-click to edit" ondblclick={(e) => ed.start(r.id, 'title', e)}>{r.title}</td>{/if}
						<!-- its own category, or "auto" = the one its viewports make it (grey) -->
						{#if ed.is(r.id, 'category')}
							<td class="ed"><select class="ed-box" value={r.categoryAuto ? '' : r.categoryId} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'category')} onblur={(e) => ed.blur(r.id, 'category', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
								<option value="">{r.categoryAuto ? `${r.category} (auto)` : 'Auto (from its viewports)'}</option>
								{#each cats as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
								{#if !r.categoryAuto && !cats.some((c) => c.id === r.categoryId)}<option value={r.categoryId}>{r.category}</option>{/if}
							</select></td>
						{:else}<td class="px-2 whitespace-nowrap" class:muted={r.categoryAuto} title={r.categoryAuto ? 'Worked out from its viewports — double-click to set one' : 'Its category — double-click to change it'} ondblclick={(e) => ed.start(r.id, 'category', e)}>{r.category}{r.categoryAuto ? ' (auto)' : ''}</td>{/if}
						<td class="px-2 whitespace-nowrap">{r.level}</td>
						<td class="px-2 whitespace-nowrap">{r.room}</td>
						{#if ed.is(r.id, 'discipline')}
							<td class="ed"><input class="ed-box" value={r.discipline} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'discipline')} onblur={(e) => ed.blur(r.id, 'discipline', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
						{:else}<td class="px-2" title="Double-click to edit" ondblclick={(e) => ed.start(r.id, 'discipline', e)}>{r.discipline || '—'}</td>{/if}
						<td class="px-2 font-mono">{r.rev || '—'}</td>
						<td class="px-2">{r.size}</td>
						<td class="px-2">{r.scale}</td>
						{#if showState}<td class="px-2 whitespace-nowrap"><StatusChip tone={stateOf(r)} label={stateText(r)} upper={false} /></td>{/if}
						{#if ed.is(r.id, 'tags')}
							<td class="ed"><input class="ed-box" value={r.tags.join(', ')} title="Comma-separated" use:focusCell onkeydown={(e) => ed.key(e, r.id, 'tags')} onblur={(e) => ed.blur(r.id, 'tags', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
						{:else}<td class="px-2" title="Double-click to edit (comma-separated)" ondblclick={(e) => ed.start(r.id, 'tags', e)}>{r.tags.join(', ') || '—'}</td>{/if}
						<td class="px-2 muted">{r.status}</td>
					</tr>
				{/each}
			{:else}
				<tr><td colspan="12" class="px-2 py-3 faint">{sheets.length ? 'No sheets match.' : 'No sheets yet — use + New in the Navigator’s Sheets list (Window › Navigator).'}</td></tr>
			{/each}
		</tbody>
	</table>
</TableFrame>
{/if}

<style>
	.hov:hover { background: var(--cad-hover); }
	.seg { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; }
	.seg button { min-height: 20px; padding: 0 8px; font-weight: 600; color: var(--cad-muted); background: var(--cad-input); }
	.seg button + button { border-left: 1px solid var(--cad-line); }
	.seg button:hover { color: var(--cad-text); }
	.seg button.on { background: var(--cad-strong); color: var(--cad-text); }
	.clear { color: #2563eb; min-height: 20px; }
	.grp td { background: var(--cad-hover); font-weight: 600; padding: 2px 8px; color: var(--cad-muted); }
	.gh { font-weight: 600; color: inherit; }
	.gh:hover { color: #2563eb; text-decoration: underline; }
	tr[draggable='true'] { cursor: grab; }
	tr.drop td { box-shadow: inset 0 2px 0 #2563eb; }
	.gn { margin-left: 8px; font-weight: 400; color: var(--cad-faint); }
	.gn:hover { color: #2563eb; }
</style>
