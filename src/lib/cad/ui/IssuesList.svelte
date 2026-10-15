<!-- The ISSUES view of the Sheets tab (split out of SheetsTab, sheets-organising slice 1): every issue, newest first —
     its number (edit to renumber), date, package name / note, purpose, recipient, sheets at their revisions (bold =
     new in it), the uploaded PDF; Transmittal (Excel), Reprint (exactly as issued), Re-issue… (its sheets selected and
     the Issue panel opened on them) and Edit (name / purpose / to / note — what was issued stays as it was). -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Issue, Sheet, SheetPackage } from '../domain/drawing'
	import { packageFromIssue } from '../domain/packages'
	import { newId } from '../domain/ids'
	import { reprintIssue } from '../app/issue'
	import { unsupportedNote } from '../app/sheetsPdf'
	import { exportTransmittal } from '../render/transmittal'
	import { exportIssueRegister } from '../render/issueRegister'
	import { issueNumbers, ISSUE_PURPOSES } from '../domain/issue'
	import { canRestore } from '../domain/restorePlan'
	import TableFrame from './TableFrame.svelte'
	import type { MenuItem } from './cadMenus'

	/** `seg`: the Sheets tab's Sheets · Packages · Issues switch, first in this view's one-line bar. */
	/** `panel`: the Issue panel while issuing (over the table, as in the register). */
	let { project, ws, seg, panel, busy, onreissue, onpackages }: { project: CadProject; ws: Workspace; seg?: Snippet; panel?: Snippet; busy: boolean; onreissue: (sheets: Sheet[], pkg?: SheetPackage) => void; onpackages: () => void } = $props()

	const issues = $derived([...project.index.ofType('issue')].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)))
	const numbers = $derived(issueNumbers(issues))
	const owner = $derived(canRestore(project.ownerId, project.user))
	/** The issue whose details are being edited in its row (Edit / Done). */
	let editing = $state<string | null>(null)
	const editIssue = (i: Issue, label: string, patch: Partial<Issue>) => project.store.transact(label, (tx) => tx.put({ ...i, ...patch }))

	/** Re-issue (backlog "Next issue from the last list"): that package's sheets (those still here, not archived)
	 *  selected in the register and the Issue panel opened on them; add / drop sheets in the register, then Issue… again. */
	function reissue(i: Issue) {
		const list = i.sheets.map((x) => project.index.get<Sheet>(x.sheetId)).filter((s): s is Sheet => s?.type === 'sheet' && s.status !== 'archived')
		if (!list.length) { ws.say('None of its sheets are left'); return }
		ws.select(list.map((s) => s.id))
		const pkg = i.packageId ? project.index.get<SheetPackage>(i.packageId) : undefined
		onreissue(list, pkg?.type === 'package' ? pkg : undefined)
		if (list.length < i.sheets.length) ws.say(`${i.sheets.length - list.length} of its sheets are gone or archived`)
	}
	/** An issue from before packages (Dave D9): a list package of its sheets, and the issue linked to it — one undo step. */
	function makePackage(i: Issue) {
		const order = Math.max(0, ...project.index.ofType('package').map((p) => p.order)) + 10
		const p = packageFromIssue(i, newId(), order)
		project.store.transact(`Package from ${i.name}`, (tx) => { tx.put(p); tx.put({ ...i, packageId: p.id }) })
		ws.say(`Package “${p.name}” made from ${i.name} — its next release shows what changed since`)
		onpackages()
	}
	/** `latestOnly`: one column, each sheet's last revision, issue and date. */
	async function register(latestOnly: boolean) {
		try { await exportIssueRegister(issues, project.name, latestOnly) } catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
	}
	/** ⋯: the issue register for the PM (backlog), every issue or the latest revisions only. */
	const more = $derived<MenuItem[]>([
		{ label: 'Release register (Excel)', disabled: !issues.length, title: 'Every sheet that went out (rows) by every release (columns), with the revision it went at — as Excel', run: () => register(false) },
		{ label: 'Release register, latest only (Excel)', disabled: !issues.length, title: 'One column: each sheet’s last revision, release and date', run: () => register(true) },
	])
	async function reprint(i: Issue) {
		try { const r = await reprintIssue(project, i); ws.say(`Reprinted ${i.name} as released${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `Reprint failed: ${(e as Error).message}` }
	}
	async function transmittal(i: Issue) {
		try { await exportTransmittal(i, project.name, numbers.get(i.id)) } catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
	}
</script>

<!-- the register of every issue for the PM (backlog): a sheet per row, an issue per column, or the latest only -->
<datalist id="cad-purposes">{#each ISSUE_PURPOSES as p (p)}<option value={p}></option>{/each}</datalist>
<TableFrame label="Releases" lead={seg} top={panel} count="{issues.length} release{issues.length === 1 ? '' : 's'}" countTitle="Every release, newest first" {more}>
<table class="w-full border-collapse">
	<thead>
		<tr><th class="px-2 py-1" title="The release's number (edit it to renumber)">No.</th><th class="px-2">Date</th><th class="px-2">Package</th><th class="px-2">Purpose</th><th class="px-2">To</th><th class="px-2">Sheets (rev)</th><th class="px-2">PDF</th><th class="px-2"></th></tr>
	</thead>
	<tbody>
		{#each issues as i (i.id)}
			<tr class="align-top">
				<td class="px-2"><input class="no" type="number" min="1" value={numbers.get(i.id)} onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); if (n > 0) project.store.transact(`Release number ${n}`, (tx) => tx.put({ ...i, number: n })) }} /></td>
				<td class="px-2 font-mono">{i.date}</td>
				{#if editing === i.id}
					<!-- the package's details (backlog "Edit package details"): the frozen copies and the PDF stay as issued -->
					<td class="px-2"><input class="cell w-full" value={i.name} onchange={(e) => e.currentTarget.value.trim() && editIssue(i, 'Release name', { name: e.currentTarget.value.trim() })} />
						<input class="cell w-full muted" value={i.note ?? ''} placeholder="Note" onchange={(e) => editIssue(i, 'Release note', { note: e.currentTarget.value.trim() || undefined })} /></td>
					<td class="px-2"><input class="cell w-full" list="cad-purposes" value={i.purpose} onchange={(e) => e.currentTarget.value.trim() && editIssue(i, 'Release purpose', { purpose: e.currentTarget.value.trim() })} /></td>
					<td class="px-2"><input class="cell w-full" value={i.to ?? ''} placeholder="To" onchange={(e) => editIssue(i, 'Release to', { to: e.currentTarget.value.trim() || undefined })} /></td>
				{:else}
					<td class="px-2" title={i.note ?? ''}>{i.name}{#if i.note}<span class="block muted">{i.note}</span>{/if}</td>
					<td class="px-2">{i.purpose}</td>
					<td class="px-2">{i.to ?? ''}</td>
				{/if}
				<td class="px-2">{#each i.sheets as s, n (s.sheetId)}{n ? ', ' : ''}<span class="font-mono" class:font-bold={s.changed} title={s.changed ? 'New revision in this package' : 'As last released'}>{s.number} {s.rev}</span>{/each}</td>
				<td class="px-2">{#if i.file}<a class="text-blue-600 underline" href={i.file.url} target="_blank" rel="noopener">{i.file.name}</a>{:else}—{/if}
					<!-- W21: the Excel files issued with it -->
					{#each i.attachments ?? [] as a (a.id)}<br /><a class="text-blue-600 underline" href={a.url} target="_blank" rel="noopener" title="Released with it, as it was then">{a.name}</a>{/each}</td>
				<td class="px-2 whitespace-nowrap">
					<button class="btn" title="The transmittal as Excel" onclick={() => transmittal(i)}>Transmittal</button>
					<button class="btn" title="Draw the package again exactly as released" onclick={() => reprint(i)}>Reprint</button>
					{#if i.backupId}<button class="btn" disabled={!owner} title={owner ? 'Put the whole project, or chosen models, back as they were when this went out' : 'Only the project owner can restore'} onclick={() => ws.restoreBackup(i.backupId!)}>Restore its backup…</button>{/if}
					<button class="btn" disabled={busy} title="Release these sheets again: they're selected in the register and the Release panel opens (add / drop sheets there first if needed)" onclick={() => reissue(i)}>Re-release…</button>
					{#if !i.packageId}<button class="btn" title="Make a re-usable package of its sheets (this release becomes the package's last release)" onclick={() => makePackage(i)}>Make package</button>
					{:else}<span class="pk" title="Released from a package">{project.index.nameOf(i.packageId) || 'package'}</span>{/if}
					<button class="btn" title="Rename it, or change its purpose / recipient / note (what was released stays as it was)" onclick={() => (editing = editing === i.id ? null : i.id)}>{editing === i.id ? 'Done' : 'Edit'}</button>
				</td>
			</tr>
		{:else}
			<tr><td colspan="8" class="px-2 py-3 faint">Nothing released yet — select sheets in the register, then Release….</td></tr>
		{/each}
	</tbody>
</table>
</TableFrame>

<style>
	.pk { font-size: 10px; color: #0369a1; background: #e0f2fe; border-radius: 3px; padding: 0 4px; }
	input.no { width: 3rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); font-family: ui-monospace, monospace; }
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.btn:disabled { opacity: 0.4; }
	.cell { border: 1px solid transparent; border-radius: 3px; background: transparent; padding: 0 3px; color: inherit; }
	.cell:hover { border-color: var(--cad-line); }
	.cell:focus { border-color: #60a5fa; background: var(--cad-input); outline: none; }
</style>
