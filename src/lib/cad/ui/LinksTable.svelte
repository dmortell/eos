<!-- The LINKS table (backlog "Links table", User 2026-10-05): every permanent cable — panel → outlet runs, ties within a
     room, backbones between rooms — with both ends, the label it carries, its cable type and status (both editable),
     its length, and remove. A click selects the link (its route lights up on the plan); Ctrl / Shift add. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Link } from '../domain/types'
	import { linkRows, type LinkRow } from '../domain/cableList'
	import { deleteEntities } from '../editor/commands'
	import { TableState, arrowSelect, selectAllRows, copyRows, RowPick, CellEdit, focusCell, noTextPick } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import TableFrame from './TableFrame.svelte'
	import StatusChip from './StatusChip.svelte'

	/** `levelId` = the open level ("This view": links with an end on it). */
	let { project, ws, levelId }: { project: CadProject; ws: Workspace; levelId?: string } = $props()

	const KINDS = ['run', 'tie', 'backbone'] as const
	let show = $state<Record<LinkRow['kind'], boolean>>({ run: true, tie: true, backbone: true })
	const STATUSES = ['design', 'installed'] as const
	let showStatus = $state<Record<Link['status'], boolean>>({ design: true, installed: true })
	const t = new TableState('links')
	/** How many rows are drawn: a big project has thousands of runs — the rest come with a narrower filter, or Show all. */
	let limit = $state(500)

	/** An end's level: an outlet's, or its device's rack's. */
	const levelOf = (on: string) => { const e = project.index.get(on); const r = e?.type === 'device' ? project.index.get(e.rackId) : e; return r && 'levelId' in r ? (r as { levelId?: string }).levelId : undefined }
	const all = $derived.by(() => {
		const list = linkRows(project.index, (id) => project.routes.get(id)?.lengthM)
		if (t.scope === 'all') return list
		const sel = new Set(ws.selection)
		return list.filter((r) => {
			const l = project.index.getOf('link', r.id)
			if (l?.type !== 'link') return false
			return t.scope === 'sel' ? sel.has(l.id) || sel.has(l.a.on) || sel.has(l.b.on) : !levelId || levelOf(l.a.on) === levelId || levelOf(l.b.on) === levelId
		})
	})
	const count = $derived(Object.fromEntries(KINDS.map((k) => [k, all.filter((r) => r.kind === k).length])) as Record<LinkRow['kind'], number>)
	const statusCount = $derived(Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<Link['status'], number>)
	const rows = $derived(t.apply(all.filter((r) => show[r.kind] && showStatus[r.status]), (r) => `${r.a} ${r.b} ${r.label} ${r.cableType}`,
		{ kind: (r) => r.kind, a: (r) => r.a, b: (r) => r.b, label: (r) => r.label, type: (r) => r.cableType, len: (r) => r.lengthM ?? -1, status: (r) => r.status }))
	const nSel = $derived(rows.filter((r) => selected.has(r.id)).length)
	/** ↑ / ↓ move the selection; F2 / Enter edit the selected row; Ctrl+C copies the shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, shown.map((r) => r.id), ws.selection, ws.selectAndReveal) || ed.tableKey(e, ws.selection) || selectAllRows(e, shown.map((r) => r.id), ws.select)) { e.preventDefault(); e.stopPropagation(); return }
		if (copyRows(e, ['Kind', 'Panel end', 'Other end', 'Label', 'Cable type', 'Length (m)', 'Status'], rows.map((r) => [r.kind, r.a, r.b, r.label, r.cableType, r.lengthM, r.status]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const types = $derived([...new Set(all.map((r) => r.cableType).filter(Boolean))].sort())
	const selected = $derived(new Set(ws.selection))

	/** A core of a multi-core cable: the edit goes to all its cores (they share type and status). */
	function edit(id: string, label: string, patch: Partial<Link>) {
		const l = project.index.getOf('link', id)
		if (l?.type !== 'link') return
		const all = l.cable ? project.index.links.filter((x) => x.cable === l.cable) : [l]
		project.store.transact(label, (tx) => { for (const x of all) tx.put({ ...x, ...patch }) })
	}
	// click = one, Shift = the range from the last clicked, Ctrl = add / drop one (tableKit.RowPick, as every table)
	const rp = new RowPick()
	const shown = $derived(rows.slice(0, limit))
	const pick = (id: string, e: MouseEvent) => rp.pick(id, e, shown.map((r) => r.id), ws.selection, ws.selectAndReveal)
	// ── editing in place (tableKit.CellEdit): double-click the cable type or status, or F2 / Enter on the selected row ──
	type Field = 'type' | 'status'
	const FIELDS: Field[] = ['type', 'status']
	const ed = new CellEdit<Field>({
		fields: () => FIELDS, ids: () => shown.map((r) => r.id),
		save: (id, field, value) => {
			const l = project.index.getOf('link', id)
			if (l?.type !== 'link') return
			if (field === 'type') { const v = value.trim(); if (v !== (l.cableType ?? '')) edit(id, 'Cable type', { cableType: v || undefined }) }
			else if (value !== l.status) edit(id, 'Link status', { status: value as Link['status'] })
		},
	})
	function remove(ids: string[]) {
		deleteEntities(project.store, ids)
		ws.say(`${ids.length === 1 ? 'Link' : `${ids.length} links`} removed · Ctrl+Z brings ${ids.length === 1 ? 'it' : 'them'} back`)
	}
	const selLinks = $derived(rows.filter((r) => selected.has(r.id)).map((r) => r.id))
</script>

<TableFrame label="Links" {t} view={levelId ? project.index.nameOf(levelId) : 'This view'} onkeydown={tableKey}
	count="{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}" nSel={selLinks.length}
	hint="Select links (click · Shift · Ctrl) to remove them — double-click a cable type or status to change it">
	{#snippet foot()}
		{#each KINDS as k (k)}
			<StatusChip tone={k} label="{k} {count[k]}" off={!show[k]} onclick={() => (show[k] = !show[k])} title="Show / hide {k}s" />
		{/each}
		{#each STATUSES as s (s)}
			<StatusChip tone={s} label="{s} {statusCount[s]}" off={!showStatus[s]} onclick={() => (showStatus[s] = !showStatus[s])} title="Show / hide the {s} links" />
		{/each}
	{/snippet}
	{#snippet sel()}
		<button class="tb danger" title="Remove the selected links (Ctrl+Z undoes)" onclick={() => remove(selLinks)}>Remove {selLinks.length}</button>
	{/snippet}
	<datalist id="cad-link-types">{#each types as t (t)}<option value={t}></option>{/each}</datalist>
	<table class="w-full border-collapse">
		<thead>
			<tr><SortTh {t} key="kind" cls="px-2 py-1">Kind</SortTh><SortTh {t} key="a">Panel end</SortTh><SortTh {t} key="b">Other end</SortTh><SortTh {t} key="label">Label</SortTh><SortTh {t} key="type">Cable type</SortTh><SortTh {t} key="len">Len (m)</SortTh><SortTh {t} key="status">Status</SortTh><th></th></tr>
		</thead>
		<tbody>
			{#each shown as r (r.id)}
				<tr class="hov" class:row-sel={selected.has(r.id)} onmousedown={noTextPick} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5 whitespace-nowrap"><StatusChip tone={r.kind} label={r.kind} />{#if r.core} <span class="muted" title="A core of a multi-core cable: type and status changes go to all its cores">{r.core}</span>{/if}</td>
					<td class="px-2">{r.a}</td>
					<td class="px-2">{r.b}</td>
					<td class="px-2 font-mono muted">{r.label || '—'}</td>
					{#if ed.is(r.id, 'type')}
						<td class="ed"><input class="ed-box" list="cad-link-types" value={r.cableType} placeholder="cable" use:focusCell onkeydown={(e) => ed.key(e, r.id, 'type')} onblur={(e) => ed.blur(r.id, 'type', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2" title="Double-click (or F2) to set the cable type" ondblclick={(e) => ed.start(r.id, 'type', e)}>{r.cableType || '—'}</td>{/if}
					<td class="px-2">{r.lengthM ?? ''}</td>
					{#if ed.is(r.id, 'status')}
						<td class="ed"><select class="ed-box" value={r.status} use:focusCell onkeydown={(e) => ed.key(e, r.id, 'status')} onblur={(e) => ed.blur(r.id, 'status', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							<option value="design">design</option><option value="installed">installed</option></select></td>
					{:else}<td class="px-2" class:s-installed={r.status === 'installed'} title="Double-click to set the status" ondblclick={(e) => ed.start(r.id, 'status', e)}>{r.status}</td>{/if}
					<td class="px-1"><button class="del" title="Remove this link (Ctrl+Z undoes)" onclick={(e) => { e.stopPropagation(); remove([r.id]) }}>✕</button></td>
				</tr>
			{:else}
				<tr><td colspan="8" class="px-2 py-3 faint">No links{all.length ? ' match' : ' yet — allocate outlets, or link panels from a port (Link to…)'}.</td></tr>
			{/each}
			{#if rows.length > limit}<tr><td colspan="8" class="px-2 py-2 faint">{rows.length - limit} more not drawn — narrow it with Find or the chips, or <button class="more" title="Draw every row (slower on a big project)" onclick={(e) => { e.stopPropagation(); limit = Infinity }}>Show all ({rows.length})</button></td></tr>{/if}
		</tbody>
	</table>
</TableFrame>

<style>
	.hov:hover { background: var(--cad-hover); }
	.s-installed { color: #166534; }
	/* the row's ✕: on hover, and on a selected row or one with the focus (keyboard, iPad: no hover) */
	.del { visibility: hidden; color: var(--cad-faint); padding: 0 4px; min-width: 20px; min-height: 20px; }
	tr:hover .del, tr:focus-within .del, tr.row-sel .del { visibility: visible; }
	.del:hover { color: #dc2626; }
	.more { color: var(--cad-link); text-decoration: underline; min-height: 20px; }
</style>
