<!-- The PACKAGES view of the Sheets tab (sheets-organising slice 6): re-usable issue sets. Each package with what it
     holds (a list, or a rule in words — new sheets that match join by themselves), its sheets now, its last issue and
     what changed since (added / withdrawn / never issued). New from the register's selection (a list) or from its
     chips (a rule). Row: Show (selects its sheets in the register), Issue… (the Issue panel on its sheets, linked to
     it), Edit (purpose, recipients — one per line "Name, Org" — note; a list's sheets: + selected / − selected),
     Freeze to list (a rule), Duplicate, Archive / Restore. One undo step each. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Issue, Sheet, SheetPackage } from '../domain/drawing'
	import type { ListFilter, SheetRow } from '../domain/sheetList'
	import { packageMembers, ruleFromFilter, ruleText, freezeToList, lastIssueOf, sinceLastIssue, recipientsText, parseRecipients } from '../domain/packages'
	import { issueNumbers, issueTag, ISSUE_PURPOSES } from '../domain/issue'
	import { newId } from '../domain/ids'
	import NameInput from './NameInput.svelte'

	let { project, ws, seg, rows, filter, busy, onissue }: {
		project: CadProject; ws: Workspace
		/** The Sheets tab's Sheets · Packages · Issues switch, first in this view's one-line bar. */
		seg?: Snippet
		/** Every sheet's register row (the package rules match over them). */
		rows: SheetRow[]
		/** The register's chips now ("+ From chips" saves them as a rule). */
		filter: ListFilter
		busy: boolean
		onissue: (pkg: SheetPackage, sheets: Sheet[]) => void
	} = $props()

	let showArchived = $state(false), editing = $state<string | null>(null)
	const all = $derived([...project.index.byId.values()].filter((e): e is SheetPackage => e.type === 'package').sort((a, b) => a.order - b.order))
	const list = $derived(all.filter((p) => showArchived || !p.archived))
	const issues = $derived([...project.index.byId.values()].filter((e): e is Issue => e.type === 'issue'))
	const numbers = $derived(issueNumbers(issues))
	const catName = (id: string) => project.sheetCategories.find((c) => c.id === id)?.label ?? id
	const nameOf = (k: 'cat' | 'id', id: string) => (k === 'cat' ? catName(id) : project.index.nameOf(id) || id)
	const selectedSheets = $derived(rows.filter((r) => ws.selection.includes(r.id) && r.status !== 'archived').sort((a, b) => Number(a.order) - Number(b.order)))
	const nextOrder = () => Math.max(0, ...all.map((p) => p.order)) + 10
	/** The package's issues, newest first (slice 9). */
	const issuesOf = (p: SheetPackage) => issues.filter((i) => i.packageId === p.id).sort((a, b) => (numbers.get(b.id) ?? 0) - (numbers.get(a.id) ?? 0))
	const put = (p: SheetPackage, label: string) => project.store.transact(label, (tx) => tx.put(p))

	// a new package's name is typed in the bar (not the status bar, Dave 2026-10-12)
	let naming = $state<{ sheetIds?: string[]; rule?: NonNullable<SheetPackage['rule']>; value: string } | null>(null)
	function fromSelection() {
		if (!selectedSheets.length) { ws.say('Select sheets in the register first'); return }
		naming = { sheetIds: selectedSheets.map((r) => r.id), value: '' }
	}
	function fromChips() {
		const rule = ruleFromFilter(filter)
		if (!rule) { ws.say('Pick some chips in the register first (category, level, room, tag) — the package takes every sheet that matches'); return }
		naming = { rule, value: ruleText(rule, nameOf) }
	}
	function create(name: string) {
		const n = naming
		naming = null
		if (!n) return
		const p: SheetPackage = { type: 'package', id: newId(), name, ...(n.rule ? { rule: n.rule } : { sheetIds: n.sheetIds ?? [] }), order: nextOrder() }
		put(p, `New package ${p.name}`)
		if (!n.rule) editing = p.id
	}
	function issue(p: SheetPackage) {
		const m = packageMembers(p, rows)
		if (!m.length) { ws.say(`${p.name} has no sheets now`); return }
		const sheets = m.map((r) => project.index.get<Sheet>(r.id)).filter((s): s is Sheet => s?.type === 'sheet')
		ws.select(sheets.map((s) => s.id))
		onissue(p, sheets)
	}
	function changeList(p: SheetPackage, add: boolean) {
		const ids = selectedSheets.map((r) => r.id), cur = p.sheetIds ?? []
		const next = add ? [...cur, ...ids.filter((id) => !cur.includes(id))] : cur.filter((id) => !ids.includes(id))
		if (next.length === cur.length && add) { ws.say('Select sheets in the register to add'); return }
		put({ ...p, sheetIds: next }, `${p.name}: ${add ? 'add' : 'remove'} ${ids.length} sheet(s)`)
	}
	function duplicate(p: SheetPackage) { put({ ...structuredClone($state.snapshot(p)) as SheetPackage, id: newId(), name: `${p.name} (copy)`, order: nextOrder(), archived: undefined }, `Duplicate ${p.name}`) }
</script>

<div class="bar">
	{@render seg?.()}
	<button class="btn" title="A package of the sheets selected in the register (a list, in print order)" onclick={fromSelection}>+ From selection ({selectedSheets.length})</button>
	<button class="btn" title="A package of every sheet matching the register's chips now and later (a rule)" onclick={fromChips}>+ From chips</button>
	<label class="muted"><input type="checkbox" bind:checked={showArchived} /> archived</label>
	{#if naming}
		<span class="muted">New package {naming.rule ? '(rule)' : `of ${naming.sheetIds?.length ?? 0} sheet${naming.sheetIds?.length === 1 ? '' : 's'}`}:</span>
		<NameInput create value={naming.value} placeholder="Its name — Enter makes it" title="Enter: make it · Esc: cancel" onsave={create} oncancel={() => (naming = null)} />
	{/if}
</div>
<table class="w-full border-collapse">
	<thead>
		<tr><th class="px-2 py-1">Package</th><th class="px-2">Holds</th><th class="px-2">Sheets</th><th class="px-2">Purpose</th><th class="px-2">To</th><th class="px-2">Last issue</th><th class="px-2">Since then</th><th></th></tr>
	</thead>
	<tbody>
		{#each list as p (p.id)}
			{@const m = packageMembers(p, rows)}
			{@const last = lastIssueOf(p, issues)}
			{@const d = sinceLastIssue(m, last)}
			<tr class="align-top" class:archived={p.archived}>
				<td class="px-2"><input class="cell w-40 font-semibold" value={p.name} onchange={(e) => e.currentTarget.value.trim() && put({ ...p, name: e.currentTarget.value.trim() }, 'Package name')} /></td>
				<td class="px-2 muted">{p.rule ? `Rule: ${ruleText(p.rule, nameOf)}` : 'List'}</td>
				<td class="px-2" title={m.map((r) => `${r.number} ${r.title}`).join('\n')}>{m.length}</td>
				<td class="px-2">{p.purpose ?? '—'}</td>
				<td class="px-2">{p.recipients?.map((r) => r.name).join(', ') || '—'}</td>
				<td class="px-2 whitespace-nowrap">{last ? `${issueTag(numbers.get(last.id) ?? 0)} · ${last.date}` : 'never'}</td>
				<td class="px-2 whitespace-nowrap">
					{#if d.added.length}<span class="tag add" title="In it now, not in its last issue">+{d.added.length} added</span>{/if}
					{#if d.withdrawn.length}<span class="tag wd" title={d.withdrawn.map((s) => s.number).join(', ')}>−{d.withdrawn.length} withdrawn</span>{/if}
					{#if d.notIssued.length}<span class="tag new" title="Never issued">{d.notIssued.length} not issued</span>{/if}
				</td>
				<td class="px-2 whitespace-nowrap">
					<button class="btn" title="Select its sheets in the register" onclick={() => ws.select(m.map((r) => r.id))}>Show</button>
					<button class="btn" disabled={busy || p.archived} title="Issue it: changed sheets get a new revision; the issue is linked to the package" onclick={() => issue(p)}>Issue…</button>
					<button class="btn" onclick={() => (editing = editing === p.id ? null : p.id)}>{editing === p.id ? 'Done' : 'Edit'}</button>
				</td>
			</tr>
			{#if editing === p.id}
				<tr class="edit"><td colspan="8" class="px-2 py-1">
					<div class="form">
						<label>Purpose <input class="cell w-48" list="cad-purposes" value={p.purpose ?? ''} placeholder="For construction" onchange={(e) => put({ ...p, purpose: e.currentTarget.value.trim() || undefined }, 'Package purpose')} /></label>
						<label title="One per line: Name, Organisation">Recipients <textarea class="cell" rows="2" value={recipientsText(p.recipients)} placeholder="Name, Org" onchange={(e) => put({ ...p, recipients: parseRecipients(e.currentTarget.value) }, 'Package recipients')}></textarea></label>
						<label>Note <input class="cell w-64" value={p.note ?? ''} onchange={(e) => put({ ...p, note: e.currentTarget.value.trim() || undefined }, 'Package note')} /></label>
					</div>
					{#if issuesOf(p).length}
						<!-- its issues (slice 9), newest first -->
						<div class="hist">{#each issuesOf(p) as i (i.id)}<span>{issueTag(numbers.get(i.id) ?? 0)} · {i.date} · {i.sheets.filter((x) => x.changed).length} new rev{#if i.file} · <a class="text-blue-600 underline" href={i.file.url} target="_blank" rel="noopener">PDF</a>{/if}</span>{/each}</div>
					{/if}
					<div class="acts">
						{#if p.sheetIds}
							<button class="btn" onclick={() => changeList(p, true)}>+ Selected sheets ({selectedSheets.length})</button>
							<button class="btn" onclick={() => changeList(p, false)}>− Selected sheets</button>
						{:else}
							<button class="btn" title="Turn the rule into a list of the sheets it holds now (to add / drop single sheets)" onclick={() => put(freezeToList(p, m), `${p.name}: freeze to list`)}>Freeze to list</button>
						{/if}
						<button class="btn" onclick={() => duplicate(p)}>Duplicate</button>
						<button class="btn" onclick={() => put({ ...p, archived: p.archived ? undefined : true }, p.archived ? `Restore ${p.name}` : `Archive ${p.name}`)}>{p.archived ? 'Restore' : 'Archive'}</button>
					</div>
				</td></tr>
			{/if}
		{:else}
			<tr><td colspan="8" class="px-2 py-3 faint">No packages yet — select sheets (or pick chips) in the register, then + From selection / + From chips.</td></tr>
		{/each}
	</tbody>
</table>
<datalist id="cad-purposes">{#each ISSUE_PURPOSES as x (x)}<option value={x}></option>{/each}</datalist>

<style>
	.bar { display: flex; align-items: center; gap: 6px; padding: 3px 8px; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.btn:disabled { opacity: 0.4; }
	.cell { border: 1px solid transparent; border-radius: 3px; background: transparent; padding: 0 3px; color: inherit; }
	.cell:hover { border-color: var(--cad-line); }
	.cell:focus { border-color: #60a5fa; background: var(--cad-input); outline: none; }
	textarea.cell { border-color: var(--cad-line); width: 16rem; vertical-align: top; resize: vertical; font-family: inherit; }
	tr.archived { opacity: 0.5; }
	tr.edit { background: var(--cad-subtle); }
	.form, .acts { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px 14px; padding: 2px 0; }
	.form label { display: flex; align-items: flex-start; gap: 4px; color: var(--cad-muted); }
	.hist { display: flex; flex-wrap: wrap; gap: 2px 14px; padding: 2px 0; color: var(--cad-muted); }
	.tag { border-radius: 3px; padding: 0 4px; margin-right: 3px; font-size: 10px; font-weight: 600; }
	.add { background: #dcfce7; color: #166534; }
	.wd { background: #fee2e2; color: #991b1b; }
	.new { background: #fef9c3; color: #854d0e; }
</style>
