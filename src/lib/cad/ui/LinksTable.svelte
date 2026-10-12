<!-- The LINKS table (backlog "Links table", Dave 2026-10-05): every permanent cable — panel → outlet runs, ties within a
     room, backbones between rooms — with both ends, the label it carries, its cable type and status (both editable),
     its length, and remove. A click selects the link (its route lights up on the plan); Ctrl / Shift add. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Link } from '../domain/types'
	import { linkRows, type LinkRow } from '../domain/cableList'
	import { deleteEntities } from '../editor/commands'
	import { TableState, arrowSelect, copyRows } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import ScopeSelect from './ScopeSelect.svelte'
	import StatusChip from './StatusChip.svelte'

	/** `levelId` = the open level ("This view": links with an end on it). */
	let { project, ws, levelId }: { project: CadProject; ws: Workspace; levelId?: string } = $props()

	const KINDS = ['run', 'tie', 'backbone'] as const
	let show = $state<Record<LinkRow['kind'], boolean>>({ run: true, tie: true, backbone: true })
	let status = $state<'' | Link['status']>('')
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
			const l = project.index.get<Link>(r.id)
			if (l?.type !== 'link') return false
			return t.scope === 'sel' ? sel.has(l.id) || sel.has(l.a.on) || sel.has(l.b.on) : !levelId || levelOf(l.a.on) === levelId || levelOf(l.b.on) === levelId
		})
	})
	const count = $derived(Object.fromEntries(KINDS.map((k) => [k, all.filter((r) => r.kind === k).length])) as Record<LinkRow['kind'], number>)
	const rows = $derived(t.apply(all.filter((r) => show[r.kind] && (!status || r.status === status)), (r) => `${r.a} ${r.b} ${r.label} ${r.cableType}`,
		{ kind: (r) => r.kind, a: (r) => r.a, b: (r) => r.b, label: (r) => r.label, type: (r) => r.cableType, len: (r) => r.lengthM ?? -1, status: (r) => r.status }))
	const nSel = $derived(rows.filter((r) => selected.has(r.id)).length)
	/** ↑ / ↓ move the selection; Ctrl+C copies the shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.slice(0, limit).map((r) => r.id), ws.selection, ws.select)) { e.preventDefault(); return }
		if (copyRows(e, ['Kind', 'Panel end', 'Other end', 'Label', 'Cable type', 'Length (m)', 'Status'], rows.map((r) => [r.kind, r.a, r.b, r.label, r.cableType, r.lengthM, r.status]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const types = $derived([...new Set(all.map((r) => r.cableType).filter(Boolean))].sort())
	const selected = $derived(new Set(ws.selection))

	/** A core of a multi-core cable: the edit goes to all its cores (they share type and status). */
	function edit(id: string, label: string, patch: Partial<Link>) {
		const l = project.index.get<Link>(id)
		if (l?.type !== 'link') return
		const all = l.cable ? project.index.links.filter((x) => x.cable === l.cable) : [l]
		project.store.transact(label, (tx) => { for (const x of all) tx.put({ ...x, ...patch }) })
	}
	function pick(id: string, e: MouseEvent) {
		if (e.ctrlKey || e.metaKey || e.shiftKey) ws.select(selected.has(id) ? ws.selection.filter((x) => x !== id) : [...ws.selection, id])
		else ws.select([id])
	}
	function remove(id: string) {
		deleteEntities(project.store, [id])
		ws.say('Link removed · Ctrl+Z brings it back')
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="h-full overflow-auto text-xs" tabindex="0" role="grid" aria-label="Links" onkeydown={tableKey}>
	<div class="actions">
		<ScopeSelect {t} view={levelId ? project.index.nameOf(levelId) : 'This view'} />
		{#each KINDS as k (k)}
			<StatusChip tone={k} label="{k} {count[k]}" off={!show[k]} onclick={() => (show[k] = !show[k])} title="Show / hide {k}s" />
		{/each}
		<select class="btn" bind:value={status} title="Only design or only installed links">
			<option value="">any status</option><option value="design">design</option><option value="installed">installed</option>
		</select>
		<input class="find" placeholder="Find…" bind:value={t.q} />
		<span class="faint" title="Shown · in this scope · selected">{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}</span>
	</div>
	<datalist id="cad-link-types">{#each types as t (t)}<option value={t}></option>{/each}</datalist>
	<table class="w-full border-collapse">
		<thead>
			<tr><SortTh {t} key="kind" cls="px-2 py-1">Kind</SortTh><SortTh {t} key="a">Panel end</SortTh><SortTh {t} key="b">Other end</SortTh><SortTh {t} key="label">Label</SortTh><SortTh {t} key="type">Cable type</SortTh><SortTh {t} key="len">Len (m)</SortTh><SortTh {t} key="status">Status</SortTh><th></th></tr>
		</thead>
		<tbody>
			{#each rows.slice(0, limit) as r (r.id)}
				<tr class="hov" class:row-sel={selected.has(r.id)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5 whitespace-nowrap"><StatusChip tone={r.kind} label={r.kind} />{#if r.core} <span class="muted" title="A core of a multi-core cable: type and status changes go to all its cores">{r.core}</span>{/if}</td>
					<td class="px-2">{r.a}</td>
					<td class="px-2">{r.b}</td>
					<td class="px-2 font-mono muted">{r.label || '—'}</td>
					<td class="px-2"><input class="cell" list="cad-link-types" value={r.cableType} placeholder="cable" onclick={(e) => e.stopPropagation()}
						onchange={(e) => edit(r.id, 'Cable type', { cableType: e.currentTarget.value.trim() || undefined })} /></td>
					<td class="px-2">{r.lengthM ?? ''}</td>
					<td class="px-2"><select class="cell s-{r.status}" value={r.status} onclick={(e) => e.stopPropagation()} onchange={(e) => edit(r.id, 'Link status', { status: e.currentTarget.value as Link['status'] })}>
						<option value="design">design</option><option value="installed">installed</option></select></td>
					<td class="px-1"><button class="del" title="Remove this link (Ctrl+Z undoes)" onclick={(e) => { e.stopPropagation(); remove(r.id) }}>✕</button></td>
				</tr>
			{:else}
				<tr><td colspan="8" class="px-2 py-3 faint">No links{all.length ? ' match' : ' yet — allocate outlets, or link panels from a port (Link to…)'}.</td></tr>
			{/each}
			{#if rows.length > limit}<tr><td colspan="8" class="px-2 py-2 faint">{rows.length - limit} more not drawn — narrow it with Find or the chips, or <button class="more" title="Draw every row (slower on a big project)" onclick={(e) => { e.stopPropagation(); limit = Infinity }}>Show all ({rows.length})</button></td></tr>{/if}
		</tbody>
	</table>
</div>

<style>
	.hov:hover { background: var(--cad-hover); }
	div[role='grid']:focus { outline: none; }
	.actions { position: sticky; left: 0; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	.cell { border: 1px solid transparent; border-radius: 3px; padding: 0 3px; background: transparent; color: var(--cad-text); width: 8rem; }
	.cell:hover, .cell:focus { border-color: var(--cad-line); background: var(--cad-input); }
	select.cell { width: auto; }
	.s-installed { color: #166534; }
	.del { visibility: hidden; color: var(--cad-faint); padding: 0 4px; }
	tr:hover .del { visibility: visible; }
	.del:hover { color: #dc2626; }
	.more { color: var(--cad-link); text-decoration: underline; min-height: 20px; }
</style>
