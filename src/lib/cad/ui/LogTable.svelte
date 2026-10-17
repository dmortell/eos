<!-- The LOG table (the design log, docs/plan/design-log.md, User 2026-10-17): every change — its number in this
     revision round, when, what, who asked, where it came from, what it's about, where it went out, its status, who
     entered it. A click selects the change (Properties shows it whole: why, reference, its items and sheets); "Show
     items" selects what it's about. What / Asked / Status edit in place (double-click); a row at the bottom adds one. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { DesignChange } from '../domain/drawing'
	import { newChange, askedNames, byNewest, STATUSES, REF_KINDS, today } from '../domain/changes'
	import { newId } from '../domain/ids'
	import { TableState, RowPick, CellEdit, focusCell, noTextPick } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import TableFrame from './TableFrame.svelte'
	import StatusChip from './StatusChip.svelte'
	import { enterKey } from './keyGuards'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	/** A status's chip look. */
	const TONE: Record<DesignChange['status'], string> = { open: 'design', done: 'issued', rejected: 'bad', superseded: 'superseded' }
	let show = $state<Record<DesignChange['status'], boolean>>({ open: true, done: true, rejected: true, superseded: true })
	const t = new TableState('log', 'all', null, ['sel', 'all'])
	const changes = $derived(project.index.ofType('change') as DesignChange[])
	// "Selection": the changes about what's selected (or the selected changes themselves)
	const all = $derived.by(() => {
		if (t.scope !== 'sel') return changes
		const sel = new Set(ws.selection)
		return changes.filter((c) => sel.has(c.id) || c.links.some((l) => sel.has(l)))
	})
	const count = $derived(Object.fromEntries(STATUSES.map(([s]) => [s, all.filter((c) => c.status === s).length])) as Record<DesignChange['status'], number>)
	const name = (id: string) => { const e = project.index.get(id); return e?.type === 'sheet' ? e.number || e.title : e ? project.index.nameOf(id) || e.type : '(deleted)' }
	const items = (c: DesignChange) => c.links.filter((l) => project.index.get(l)?.type !== 'sheet')
	const itemsText = (c: DesignChange) => { const ls = items(c); return ls.length > 3 ? `${ls.slice(0, 3).map(name).join(', ')} +${ls.length - 3}` : ls.map(name).join(', ') }
	const sheetsText = (c: DesignChange) => c.links.filter((l) => project.index.get(l)?.type === 'sheet').map(name).join(', ')
	const releasedText = (c: DesignChange) => (c.released ?? []).map((r) => `${name(r.sheetId)} ${r.code}`).join(', ')
	const refText = (c: DesignChange) => (c.ref ? `${REF_KINDS.find((k) => k[0] === c.ref!.kind)?.[1] ?? ''}${c.ref.text ? `: ${c.ref.text}` : ''}` : '')
	const rows = $derived(t.apply([...all].sort(byNewest).filter((c) => show[c.status]), (c) => [c.n, c.date, c.what, c.why, c.asked, c.ref?.text, c.by?.name, itemsText(c), sheetsText(c)].filter(Boolean).join(' '),
		{ no: (c) => c.cycle * 10000 + c.n, date: (c) => c.date, what: (c) => c.what, asked: (c) => c.asked ?? '', status: (c) => c.status, by: (c) => c.by?.name ?? '' }))
	const selected = $derived(new Set(ws.selection))
	const nSel = $derived(rows.filter((c) => selected.has(c.id)).length)
	const rp = new RowPick()
	const pick = (id: string, e: MouseEvent) => rp.pick(id, e, rows.map((c) => c.id), ws.selection, ws.select)
	const names = $derived(askedNames(changes))

	const put = (c: DesignChange, label: string, patch: Partial<DesignChange>) => project.store.transact(label, (tx) => tx.put({ ...c, ...patch }))
	type Field = 'what' | 'asked' | 'status'
	const ed = new CellEdit<Field>({
		fields: () => ['what', 'asked', 'status'], ids: () => rows.map((c) => c.id),
		save: (id, field, value) => {
			const c = project.index.get<DesignChange>(id)
			if (c?.type !== 'change') return
			const v = value.trim()
			if (field === 'what' && v && v !== c.what) put(c, `Change ${c.n}: what`, { what: v })
			if (field === 'asked' && v !== (c.asked ?? '')) put(c, `Change ${c.n}: asked by`, { asked: v || undefined })
			if (field === 'status' && v !== c.status) put(c, `Change ${c.n}: ${v}`, { status: v as DesignChange['status'] })
		},
	})

	// a new change, typed in the last row (linked to nothing yet: link it from an item's or a sheet's Properties)
	let newWhat = $state(''), newAsked = $state('')
	function add() {
		if (!newWhat.trim()) return
		const c = newChange(changes, newId(), { what: newWhat, asked: newAsked, by: project.user ? { uid: project.user, name: project.userName } : undefined }, project.settings?.changeCycle)
		project.store.transact(`Change ${c.n}`, (tx) => tx.put(c))
		ws.say(`Change ${c.n} logged — link it to items from their Properties (Changes › Link the selection)`)
		newWhat = ''
	}
	const selChanges = $derived(rows.filter((c) => selected.has(c.id)))
	/** Select what the selected changes are about. */
	function showItems() {
		const ids = [...new Set(selChanges.flatMap((c) => c.links))].filter((id) => project.index.get(id))
		if (ids.length) ws.selectAndReveal(ids)
		else ws.say('These changes aren’t linked to anything yet')
	}
	function remove() {
		const ids = selChanges.map((c) => c.id)
		project.store.transact(ids.length === 1 ? 'Delete change' : `Delete ${ids.length} changes`, (tx) => { for (const id of ids) tx.del(id) })
		ws.say(`${ids.length === 1 ? 'Change' : `${ids.length} changes`} deleted · Ctrl+Z brings ${ids.length === 1 ? 'it' : 'them'} back — to keep a record, set it Rejected instead`)
	}
</script>

<TableFrame label="Log" {t} view="All" count="{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}" nSel={selChanges.length}
	hint="The design log: what changed, why, who asked — click a change for all its fields, double-click What / Asked / Status to edit">
	{#snippet chips()}
		{#each STATUSES as [s, label] (s)}
			<StatusChip tone={TONE[s]} label="{label} {count[s]}" off={!show[s]} onclick={() => (show[s] = !show[s])} title="Show / hide the {label.toLowerCase()} changes" />
		{/each}
	{/snippet}
	{#snippet sel()}
		<button class="tb" title="Select the items and sheets these changes are about" onclick={showItems}>Show items</button>
		<button class="tb danger" title="Delete the selected changes (Ctrl+Z undoes) — Rejected keeps the record" onclick={remove}>Delete {selChanges.length}</button>
	{/snippet}
	<datalist id="cad-log-asked">{#each names as n (n)}<option value={n}></option>{/each}</datalist>
	<table class="w-full border-collapse">
		<thead>
			<tr><SortTh {t} key="no" cls="px-2 py-1">No</SortTh><SortTh {t} key="date">Date</SortTh><SortTh {t} key="what">What</SortTh><SortTh {t} key="asked">Asked</SortTh><th class="px-2 text-left">Ref</th>
				<th class="px-2 text-left">Items</th><th class="px-2 text-left">Sheets</th><th class="px-2 text-left">Released</th><SortTh {t} key="status">Status</SortTh><SortTh {t} key="by">By</SortTh></tr>
		</thead>
		<tbody>
			{#each rows as c (c.id)}
				<tr class="hov" class:row-sel={selected.has(c.id)} class:gone={c.status === 'rejected' || c.status === 'superseded'} onmousedown={noTextPick} onclick={(e) => pick(c.id, e)}>
					<td class="px-2 font-mono" title="Change {c.n} of round {c.cycle}">{c.n}</td>
					<td class="px-2 whitespace-nowrap muted">{c.date}</td>
					{#if ed.is(c.id, 'what')}
						<td class="ed"><input class="ed-box" value={c.what} use:focusCell onkeydown={(e) => ed.key(e, c.id, 'what')} onblur={(e) => ed.blur(c.id, 'what', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2" title={c.why ? `Why: ${c.why}` : 'Double-click (or F2) to edit'} ondblclick={(e) => ed.start(c.id, 'what', e)}>{c.what}</td>{/if}
					{#if ed.is(c.id, 'asked')}
						<td class="ed"><input class="ed-box" list="cad-log-asked" value={c.asked ?? ''} use:focusCell onkeydown={(e) => ed.key(e, c.id, 'asked')} onblur={(e) => ed.blur(c.id, 'asked', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2 whitespace-nowrap" title="Double-click to edit" ondblclick={(e) => ed.start(c.id, 'asked', e)}>{c.asked ?? ''}</td>{/if}
					<td class="px-2 muted">{refText(c)}</td>
					<td class="px-2">{itemsText(c)}</td>
					<td class="px-2 font-mono">{sheetsText(c)}</td>
					<td class="px-2 font-mono muted">{releasedText(c)}</td>
					{#if ed.is(c.id, 'status')}
						<td class="ed"><select class="ed-box" value={c.status} use:focusCell onkeydown={(e) => ed.key(e, c.id, 'status')} onblur={(e) => ed.blur(c.id, 'status', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							{#each STATUSES as [s, label] (s)}<option value={s}>{label}</option>{/each}</select></td>
					{:else}<td class="px-2" title="Double-click to set the status" ondblclick={(e) => ed.start(c.id, 'status', e)}><StatusChip tone={TONE[c.status]} label={c.status} /></td>{/if}
					<td class="px-2 whitespace-nowrap muted">{c.by?.name ?? ''}</td>
				</tr>
			{:else}
				<tr><td colspan="10" class="px-2 py-3 faint">{all.length ? 'No changes match.' : 'No changes logged yet — type one below, or use + Note in an item’s Properties.'}</td></tr>
			{/each}
			<tr class="new">
				<td class="px-2 faint">+</td><td class="px-2 faint whitespace-nowrap">{today()}</td>
				<td class="px-1"><input class="inp w-full" bind:value={newWhat} placeholder="New change: what" aria-label="New change: what" onkeydown={(e) => enterKey(e) && add()} /></td>
				<td class="px-1"><input class="inp w-full" list="cad-log-asked" bind:value={newAsked} placeholder="asked by" aria-label="New change: asked by" onkeydown={(e) => enterKey(e) && add()} /></td>
				<td colspan="6" class="px-1"><button class="tb" disabled={!newWhat.trim()} title="Log this change (Enter)" onclick={add}>Add</button></td>
			</tr>
		</tbody>
	</table>
</TableFrame>

<style>
	.hov:hover { background: var(--cad-hover); }
	tr.gone td { color: var(--cad-faint); }
	tr.gone td:nth-child(3) { text-decoration: line-through; }
</style>
