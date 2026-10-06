<!-- ISSUE a package (Phase 4.6), shown over the register: the selected sheets with what issuing does to each (a new
     revision when changed since its last issue, else as last issued), the package fields, then Issue → frozen copies,
     the package PDF uploaded to file storage, revisions recorded. -->
<script lang="ts">
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, SheetPackage } from '../domain/drawing'
	import { ISSUE_PURPOSES, type IssuePlanRow } from '../domain/issue'
	import { previewIssue, issuePackage, today } from '../app/issue'
	import { unsupportedNote } from '../app/sheetsPdf'

	/** `pkg` = issuing a PACKAGE (sheets-organising slice 6): its name, purpose and recipients fill the form, and the
	 *  issue is linked to it (the next issue of the package diffs against this one). */
	let { project, ws, sheets, pkg, onclose }: { project: CadProject; ws: Workspace; sheets: Sheet[]; pkg?: SheetPackage; onclose: () => void } = $props()

	const PURPOSES = ISSUE_PURPOSES
	// svelte-ignore state_referenced_locally
	let name = $state(pkg?.name ?? ''), purpose = $state(pkg?.purpose ?? 'For construction'), date = $state(today()), to = $state(pkg?.recipients?.map((r) => (r.org ? `${r.name} (${r.org})` : r.name)).join(', ') ?? ''), note = $state(''), first = $state('A')
	let plan = $state.raw<IssuePlanRow[] | null>(null), busy = $state(false), err = $state('')
	// re-checked when the sheets or the first rev change (not on every project edit)
	$effect(() => {
		const list = sheets, f = first
		untrack(() => {
			plan = null
			previewIssue(project, list, f.trim() || 'A').then((p) => { plan = p }, (e) => { err = (e as Error).message })
		})
	})
	async function issue() {
		if (!name.trim()) { err = 'Name the package'; return }
		busy = true; err = ''
		try {
			const r = await issuePackage(project, sheets, { name: name.trim(), purpose, date, to: to.trim() || undefined, note: note.trim() || undefined, first: first.trim() || 'A', packageId: pkg?.id })
			const bumped = r.issue.sheets.filter((s) => s.changed).length
			ws.say(`Issued ${r.issue.name}: ${r.issue.sheets.length} sheet(s), ${bumped} new revision(s); PDF saved to Uploads${unsupportedNote(r.unsupported, r.rasterised)}`)
			onclose()
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
		<button class="btn primary" disabled={busy || !plan} onclick={issue}>{busy ? 'Issuing…' : 'Issue'}</button>
		<button class="btn" disabled={busy} onclick={onclose}>Cancel</button>
	</div>
	{#if err}<p class="text-red-600">{err}</p>{/if}
	{#if plan}
		<p class="mt-1 text-zinc-600">
			{#each plan as r, i (r.sheet.id)}{i ? ' · ' : ''}<span class="font-mono">{r.sheet.number}</span>
				{#if r.changed}<b class="text-amber-700">{r.from ? `${r.from} → ` : 'new '}{r.rev}</b>{:else}<span class="text-zinc-400">stays {r.rev} (unchanged)</span>{/if}{/each}
		</p>
	{:else if !err}<p class="mt-1 text-zinc-400">Checking what changed…</p>{/if}
</div>

<style>
	.panel { padding: 4px 8px 6px; border-bottom: 1px solid var(--cad-line); background: var(--cad-pick); }
	.inp { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 8px; background: var(--cad-input); color: var(--cad-text); }
	.btn:disabled { opacity: 0.4; }
	.primary { background: #2563eb; border-color: #2563eb; color: white; }
	label { color: var(--cad-muted); }
</style>
