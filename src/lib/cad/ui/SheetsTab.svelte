<!-- The SHEET REGISTER (Phase 4.4), a bottom-panel tab: every sheet with its number, title, place, kind, discipline,
     tags, revision, size, scale and status. Find, active / archived, group, click a heading to sort. Number, title,
     kind, discipline and tags are edited in place. Click selects (Shift / Ctrl for more), double-click opens the sheet
     in the active pane. PDF, Archive / Restore and Excel act on the selection (Excel: else the rows shown); select
     several sheets (in order) and Properties → Renumber numbers them, like outlets and racks. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet } from '../domain/drawing'
	import type { ViewSpec } from '../views/space'
	import { sheetRows, filterRows, sortRows, groupRows, type SortKey, type GroupBy, type SheetRow } from '../domain/sheetList'
	import { exportSheetRows } from '../render/sheetList'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'
	import type { Issue } from '../domain/drawing'
	import { reprintIssue } from '../app/issue'
	import { exportTransmittal } from '../render/transmittal'
	import { issueNumbers } from '../domain/issue'
	import IssuePanel from './IssuePanel.svelte'
	import { deleteEntities, deleteImpact, impactText } from '../editor/commands'

	let { project, ws, onview }: { project: CadProject; ws: Workspace; onview: (s: ViewSpec) => void } = $props()

	const sheets = $derived([...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet'))
	let q = $state(''), status = $state<'active' | 'archived' | ''>('active'), by = $state<GroupBy>('none')
	let sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'number', dir: 1 })
	const rows = $derived(sortRows(filterRows(sheetRows(project.index, sheets), { q, status: status || undefined }), sort.key, sort.dir))
	const groups = $derived(groupRows(rows, by))
	const selected = $derived(new Set(ws.selection))
	const picked = $derived(rows.filter((r) => selected.has(r.id)))
	const sheetOf = (id: string) => project.index.get(id) as Sheet

	const COLS: [SortKey, string][] = [['number', 'No.'], ['title', 'Title'], ['place', 'Place'], ['kind', 'Kind'], ['discipline', 'Discipline'], ['rev', 'Rev'], ['size', 'Size'], ['scale', 'Scale']]
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
	const put = (r: SheetRow, label: string, patch: Partial<Sheet>) => project.store.transact(label, (tx) => tx.put({ ...sheetOf(r.id), ...patch }))

	function setStatus(s: Sheet['status']) {
		if (!picked.length) return
		project.store.transact(`${s === 'archived' ? 'Archive' : 'Restore'} ${picked.length} sheet(s)`, (tx) => { for (const r of picked) tx.put({ ...sheetOf(r.id), status: s }) })
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
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim()

	// issuing (4.6): the selection, frozen when the panel opens
	let issuing = $state.raw<Sheet[] | null>(null), show = $state<'register' | 'issues'>('register')
	function startIssue() {
		if (!picked.length) { ws.say('Select the sheets for the package'); return }
		issuing = picked.map((r) => sheetOf(r.id))
	}
	const issues = $derived([...project.index.byId.values()].filter((e): e is Issue => e.type === 'issue').sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)))
	const numbers = $derived(issueNumbers(issues))
	async function reprint(i: Issue) {
		try { const r = await reprintIssue(project, i); ws.say(`Reprinted ${i.name} as issued${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `Reprint failed: ${(e as Error).message}` }
	}
	async function transmittal(i: Issue) {
		try { await exportTransmittal(i, project.name, numbers.get(i.id)) } catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
	}
</script>

<div class="h-full overflow-auto text-xs">
	<div class="actions">
		<span class="seg">
			<button class:on={show === 'register'} onclick={() => (show = 'register')}>Sheets</button>
			<button class:on={show === 'issues'} onclick={() => (show = 'issues')}>Issues {issues.length || ''}</button>
		</span>
	{#if show === 'register'}
		<input class="find" placeholder="Find…" bind:value={q} />
		<select bind:value={status} title="Show"><option value="active">Active</option><option value="archived">Archived</option><option value="">All</option></select>
		<label class="text-zinc-500">Group <select bind:value={by}>{#each ['none', 'place', 'kind', 'discipline', 'tag', 'size'] as g (g)}<option value={g}>{g}</option>{/each}</select></label>
		<span class="text-zinc-400">{picked.length ? `${picked.length} selected · ` : ''}{rows.length} of {sheets.length}</span>
		<button class="btn" disabled={busy} title="The selected sheets (else those shown) in one PDF" onclick={pdf}>{busy ? 'PDF…' : 'PDF'}</button>
		{#if status !== 'archived'}<button class="btn" disabled={!picked.length} onclick={() => setStatus('archived')}>Archive</button>{/if}
		<button class="btn" disabled={!picked.length} title="Delete the selected sheets (asks first; Undo brings them back)" onclick={deletePicked}>Delete</button>
		{#if status !== 'active'}<button class="btn" disabled={!picked.length} onclick={() => setStatus('active')}>Restore</button>{/if}
		<button class="btn" title="The register (the selection, else the rows shown) as Excel" onclick={excel}>Excel</button>
		<button class="btn" disabled={!!issuing} title="Issue the selected sheets as one package: changed sheets get a new revision" onclick={startIssue}>Issue…</button>
	{/if}
	</div>
	{#if issuing}<IssuePanel {project} {ws} sheets={issuing} onclose={() => { issuing = null; show = 'issues' }} />{/if}
	{#if show === 'issues'}
		<table class="w-full border-collapse">
			<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
				<tr><th class="px-2 py-1" title="The issue's number (edit it to renumber)">No.</th><th class="px-2">Date</th><th class="px-2">Package</th><th class="px-2">Purpose</th><th class="px-2">To</th><th class="px-2">Sheets (rev)</th><th class="px-2">PDF</th><th class="px-2"></th></tr>
			</thead>
			<tbody>
				{#each issues as i (i.id)}
					<tr class="border-b border-zinc-100 align-top">
						<td class="px-2"><input class="no" type="number" min="1" value={numbers.get(i.id)} onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); if (n > 0) project.store.transact(`Issue number ${n}`, (tx) => tx.put({ ...i, number: n })) }} /></td>
						<td class="px-2 font-mono">{i.date}</td>
						<td class="px-2">{i.name}</td>
						<td class="px-2">{i.purpose}</td>
						<td class="px-2">{i.to ?? ''}</td>
						<td class="px-2">{#each i.sheets as s, n (s.sheetId)}{n ? ', ' : ''}<span class="font-mono" class:font-bold={s.changed} title={s.changed ? 'New revision in this package' : 'As last issued'}>{s.number} {s.rev}</span>{/each}</td>
						<td class="px-2">{#if i.file}<a class="text-blue-600 underline" href={i.file.url} target="_blank" rel="noopener">{i.file.name}</a>{:else}—{/if}</td>
						<td class="px-2 whitespace-nowrap">
							<button class="btn" title="The transmittal as Excel" onclick={() => transmittal(i)}>Transmittal</button>
							<button class="btn" title="Draw the package again exactly as issued" onclick={() => reprint(i)}>Reprint</button>
						</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="px-2 py-3 text-zinc-400">Nothing issued yet — select sheets in the register, then Issue….</td></tr>
				{/each}
			</tbody>
		</table>
	{:else}
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr>
				{#each COLS as [k, label] (k)}<th class="px-2 py-1"><button class="th" onclick={() => sortBy(k)}>{label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>{/each}
				<th class="px-2">Tags</th><th class="px-2">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as g (g.key)}
				{#if by !== 'none'}<tr class="grp"><td colspan="10">{g.label} <span class="text-zinc-400">{g.rows.length}</span></td></tr>{/if}
				{#each g.rows as r (g.key + r.id)}
					<tr class="hov border-b border-zinc-100" class:bg-amber-50={selected.has(r.id)}
						onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)} ondblclick={() => onview({ kind: 'sheet', sheetId: r.id })}>
						<td class="px-2"><input class="cell font-mono w-20" value={r.number} onchange={(e) => put(r, 'Sheet number', { number: val(e) })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2"><input class="cell w-56" value={r.title} onchange={(e) => put(r, 'Sheet title', { title: val(e) })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2">{r.place}</td>
						<td class="px-2"><input class="cell w-20" value={r.kind} placeholder="—" onchange={(e) => put(r, 'Sheet kind', { kind: val(e) || undefined })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2"><input class="cell w-20" value={r.discipline} placeholder="—" onchange={(e) => put(r, 'Sheet discipline', { discipline: val(e) || undefined })} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2 font-mono">{r.rev || '—'}</td>
						<td class="px-2">{r.size}</td>
						<td class="px-2">{r.scale}</td>
						<td class="px-2"><input class="cell w-28" value={r.tags.join(', ')} placeholder="—" title="Comma-separated" onchange={(e) => { const t = val(e).split(',').map((x) => x.trim()).filter(Boolean); put(r, 'Sheet tags', { tags: t.length ? t : undefined }) }} onclick={(e) => e.stopPropagation()} /></td>
						<td class="px-2 text-zinc-500">{r.status}</td>
					</tr>
				{/each}
			{:else}
				<tr><td colspan="10" class="px-2 py-3 text-zinc-400">{sheets.length ? 'No sheets match.' : 'No sheets yet — Sheets → + New in the left panel.'}</td></tr>
			{/each}
		</tbody>
	</table>
	{/if}
</div>

<style>
	.hov:hover { background: var(--cad-hover); }
	input.no { width: 3rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); font-family: ui-monospace, monospace; }
	.seg { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; }
	.seg button { padding: 0 8px; font-weight: 600; color: var(--cad-muted); }
	.seg button.on { background: var(--cad-strong); color: var(--cad-text); }
	.actions { position: sticky; left: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.btn:disabled { opacity: 0.4; }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; background: var(--cad-input); color: var(--cad-text); }
	.th { font-weight: 600; color: inherit; }
	.cell { border: 1px solid transparent; border-radius: 3px; background: transparent; padding: 0 3px; color: inherit; }
	.cell:hover { border-color: var(--cad-line); }
	.cell:focus { border-color: #60a5fa; background: var(--cad-input); outline: none; }
	.grp td { background: var(--cad-hover); font-weight: 600; padding: 2px 8px; color: var(--cad-muted); }
</style>
