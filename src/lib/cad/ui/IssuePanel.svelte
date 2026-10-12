<!-- ISSUE a package (Phase 4.6), shown over the register: the selected sheets with what issuing does to each (a new
     revision when changed since its last issue, else as last issued), the package fields, then Issue → frozen copies,
     the package PDF uploaded to file storage, revisions recorded. -->
<script lang="ts">
	import { enterKey } from './keyGuards'
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Issue, Sheet, SheetPackage } from '../domain/drawing'
	import { ISSUE_PURPOSES, withCodes, revCodeProblem, changesText, changeLines, type IssuePlanRow } from '../domain/issue'
	import { lastIssueOf } from '../domain/packages'
	import { previewIssue, issuePackage, freshSheets, today } from '../app/issue'
	import { runToken } from '../app/runToken'
	import { unsupportedNote } from '../app/sheetsPdf'

	/** `pkg` = issuing a PACKAGE (sheets-organising slice 6): its name, purpose and recipients fill the form, and the
	 *  issue is linked to it (the next issue of the package diffs against this one). */
	let { project, ws, sheets, pkg, onclose }: { project: CadProject; ws: Workspace; sheets: Sheet[]; pkg?: SheetPackage; onclose: (issued?: boolean) => void } = $props()

	const PURPOSES = ISSUE_PURPOSES
	// svelte-ignore state_referenced_locally
	let name = $state(pkg?.name ?? ''), purpose = $state(pkg?.purpose ?? 'For construction'), date = $state(today()), to = $state(pkg?.recipients?.map((r) => (r.org ? `${r.name} (${r.org})` : r.name)).join(', ') ?? ''), note = $state(''), first = $state('A')
	let plan = $state.raw<IssuePlanRow[] | null>(null), busy = $state(false), err = $state('')
	// slice 7: typed revision codes (D7), what changed per sheet, who issues it (remembered in this browser)
	let cover = $state(true)
	/** Back up the whole project with this issue (ADR 0008 §7): off by default — every one is a full copy. */
	let backup = $state(false)
	const projectSize = $derived.by(() => { if (!backup) return ''; const n = JSON.stringify(project.store.all()).length; return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB` })
	let codes = $state<Record<string, string>>({}), descs = $state<Record<string, string>>({}), setAll = $state('')
	let by = $state((() => { try { return localStorage.getItem('cad-issue-by') ?? '' } catch { return '' } })())
	const shown = $derived(plan ? withCodes(plan, codes) : null)
	const problems = $derived((shown ?? []).map((r) => (r.changed ? revCodeProblem(r.sheet, r.rev) : null)).filter((x): x is string => !!x))
	/** Issuing a package: its last issue — sheets added since, and ones withdrawn (in it then, not now). */
	const last = $derived(pkg ? lastIssueOf(pkg, project.index.ofType('issue')) : undefined)
	const added = $derived(new Set(last ? sheets.filter((s) => !last.sheets.some((x) => x.sheetId === s.id)).map((s) => s.id) : []))
	const withdrawn = $derived(last ? last.sheets.filter((x) => !sheets.some((s) => s.id === x.sheetId)).map((x) => ({ sheetId: x.sheetId, number: x.number, title: x.title, rev: x.rev })) : [])
	function applyAll() { if (!plan || !setAll.trim()) return; codes = Object.fromEntries(plan.filter((r) => r.changed).map((r) => [r.sheet.id, setAll.trim()])) }
	// re-checked when the sheets or the first rev change (not on every project edit)
	// A run token: a slow older preview finishing after a newer one must not replace it (nor one after the panel closed).
	const runs = runToken()
	$effect(() => {
		const list = sheets, f = first
		untrack(() => {
			plan = null
			const current = runs.start()
			// the sheets as they are now, not as they were when the panel opened
			let fresh: Sheet[]
			try { fresh = freshSheets(project, list) } catch (e) { err = (e as Error).message; return }
			previewIssue(project, fresh, f.trim() || 'A').then((p) => { if (current()) plan = p }, (e) => { if (current()) err = (e as Error).message })
		})
		return () => runs.cancel()
	})
	async function issue() {
		if (!name.trim()) { err = 'Name the package'; return }
		busy = true; err = ''
		try {
			try { localStorage.setItem('cad-issue-by', by.trim()) } catch { /* storage blocked */ }
			const r = await issuePackage(project, sheets, { name: name.trim(), purpose, date, to: to.trim() || undefined, note: note.trim() || undefined, first: first.trim() || 'A', packageId: pkg?.id,
				codes: $state.snapshot(codes), descs: $state.snapshot(descs), by, withdrawn, cover, backup, recipients: pkg?.recipients ?? (to.trim() ? [{ name: to.trim() }] : undefined) })
			const bumped = r.issue.sheets.filter((s) => s.changed).length
			ws.say(`Issued ${r.issue.name}: ${r.issue.sheets.length} sheet(s), ${bumped} new revision(s); PDF saved to Uploads${unsupportedNote(r.unsupported, r.rasterised)}`)
			onclose(true)
		} catch (e) { err = `Issue failed — nothing was recorded: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<div class="panel">
	<div class="flex flex-wrap items-center gap-2">
		<span class="font-semibold">Issue {sheets.length} sheet(s)</span>
		<label>Package <input class="inp w-40" bind:value={name} placeholder="e.g. Tender issue 1" /></label>
		<label>Purpose <input class="inp w-32" list="cad-purposes" bind:value={purpose} /></label>
		<datalist id="cad-purposes">{#each PURPOSES as p (p)}<option value={p}></option>{/each}</datalist>
		<label>Date <input class="inp" type="date" bind:value={date} /></label>
		<label>To <input class="inp w-32" bind:value={to} placeholder="(optional)" /></label>
		<label title="The revision a sheet gets the first time it is issued">First rev <input class="inp w-12 font-mono" bind:value={first} /></label>
		<label>Note <input class="inp w-40" bind:value={note} placeholder="(optional)" /></label>
		<label title="A cover page first in the PDF: the project, the issue, who gets it and the drawing register (the first sheet's size, with the title block)"><input type="checkbox" bind:checked={cover} /> Cover page</label>
		<label title="Keep a backup of the whole project with this issue, so it can be restored from the Issues list later. Each one is a full copy of the project: tick it only for an issue you may need to go back to."><input type="checkbox" bind:checked={backup} /> Back up the project with this issue</label>
		<label title="Who issues it: initials, recorded on each new revision">By <input class="inp w-12" bind:value={by} placeholder="DM" /></label>
		<label title="Give every sheet getting a new revision this code (P01 → C01 at construction)">Set all to <input class="inp w-14 font-mono" bind:value={setAll} placeholder="C01" onkeydown={(e) => enterKey(e) && applyAll()} onchange={applyAll} /></label>
		<button class="btn primary" disabled={busy || !plan || problems.length > 0} title={problems.join(' · ')} onclick={issue}>{busy ? 'Issuing…' : 'Issue'}</button>
		<button class="btn" disabled={busy} onclick={() => onclose()}>Cancel</button>
	</div>
	{#if backup}<p class="text-amber-700">A full copy of the project (about {projectSize}) is kept with this issue. Tick it only for an issue you may need to go back to (old ones can be deleted in Project › Backups…)</p>{/if}
	{#if err}<p class="text-red-600">{err}</p>{/if}
	{#if shown}
		<!-- per sheet: a new revision (its code editable; what changed) or as last issued; a package's added / withdrawn -->
		<table class="plan">
			<thead><tr><th>No.</th><th>Title</th><th>Revision</th><th>What changed</th></tr></thead>
			<tbody>
				{#each shown as r (r.sheet.id)}
					<tr>
						<td class="font-mono">{r.sheet.number}{#if added.has(r.sheet.id)} <span class="tag add" title="Not in the package's last issue">added</span>{/if}</td>
						<td>{r.sheet.title}</td>
						{#if r.changed}
							<td class="whitespace-nowrap"><span class="text-zinc-500">{r.from ? `${r.from} →` : 'new'}</span>
								<input class="inp w-14 font-mono" class:bad={!!revCodeProblem(r.sheet, r.rev)} value={r.rev} title={revCodeProblem(r.sheet, r.rev) ?? 'Its new revision (type another code to override)'}
									onchange={(e) => (codes = { ...codes, [r.sheet.id]: e.currentTarget.value })} /></td>
							<td><input class="inp w-full" value={descs[r.sheet.id] ?? ''} placeholder={changesText(r.sheet) || purpose}
								title={r.sheet.changes?.length ? `Its change notes (Sheet Properties), recorded on the revision:\n${changeLines(r.sheet.changes)}` : 'What changed (else the purpose)'} onchange={(e) => (descs = { ...descs, [r.sheet.id]: e.currentTarget.value })} /></td>
						{:else}
							<td class="text-zinc-400" colspan="2">stays {r.rev} (unchanged since issued)</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if withdrawn.length}<p class="text-red-700">Withdrawn since its last issue: {withdrawn.map((w) => `${w.number} ${w.rev}`).join(', ')} — listed on the transmittal</p>{/if}
		{#if problems.length}<p class="text-red-600">{problems.join(' · ')}</p>{/if}
	{:else if !err}<p class="mt-1 text-zinc-400">Checking what changed…</p>{/if}
</div>

<style>
	.panel { padding: 4px 8px 6px; border-bottom: 1px solid var(--cad-line); background: var(--cad-pick); }
	.inp { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 8px; background: var(--cad-input); color: var(--cad-text); }
	.btn:disabled { opacity: 0.4; }
	.plan { margin-top: 4px; border-collapse: collapse; width: 100%; max-width: 60rem; }
	.plan th { text-align: left; font-weight: 600; color: var(--cad-muted); padding: 0 6px; }
	.plan td { padding: 1px 6px; }
	.inp.bad { border-color: #dc2626; }
	.tag { border-radius: 3px; padding: 0 4px; font-size: 10px; font-weight: 600; }
	.add { background: #dcfce7; color: #166534; }
	.primary { background: #2563eb; border-color: #2563eb; color: white; }
	label { color: var(--cad-muted); }
</style>
