<!-- The LINKS table (backlog "Links table", Dave 2026-10-05): every permanent cable — panel → outlet runs, ties within a
     room, backbones between rooms — with both ends, the label it carries, its cable type and status (both editable),
     its length, and remove. A click selects the link (its route lights up on the plan); Ctrl / Shift add. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Link } from '../domain/types'
	import { linkRows, type LinkRow } from '../domain/cableList'
	import { deleteEntities } from '../editor/commands'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const KINDS = ['run', 'tie', 'backbone'] as const
	let show = $state<Record<LinkRow['kind'], boolean>>({ run: true, tie: true, backbone: true })
	let status = $state<'' | Link['status']>('')
	let q = $state('')
	const LIMIT = 500   // a big project has thousands of runs: the rest come with a narrower filter

	const all = $derived(linkRows(project.index, (id) => project.routes.get(id)?.lengthM))
	const count = $derived(Object.fromEntries(KINDS.map((k) => [k, all.filter((r) => r.kind === k).length])) as Record<LinkRow['kind'], number>)
	const rows = $derived.by(() => {
		const f = q.trim().toLowerCase()
		return all.filter((r) => show[r.kind] && (!status || r.status === status) && (!f || `${r.a} ${r.b} ${r.label} ${r.cableType}`.toLowerCase().includes(f)))
	})
	const types = $derived([...new Set(all.map((r) => r.cableType).filter(Boolean))].sort())
	const selected = $derived(new Set(ws.selection))

	function edit(id: string, label: string, patch: Partial<Link>) {
		const l = project.index.get<Link>(id)
		if (l?.type === 'link') project.store.transact(label, (tx) => tx.put({ ...l, ...patch }))
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

<div class="h-full overflow-auto text-xs">
	<div class="actions">
		<span class="font-semibold text-zinc-600">Links</span>
		{#each KINDS as k (k)}
			<button class="chip k-{k}" class:off={!show[k]} onclick={() => (show[k] = !show[k])} title="Show / hide {k}s">{k} {count[k]}</button>
		{/each}
		<select class="btn" bind:value={status} title="Only design or only installed links">
			<option value="">any status</option><option value="design">design</option><option value="installed">installed</option>
		</select>
		<input class="find" placeholder="Find…" bind:value={q} />
		<span class="text-zinc-400">{rows.length} of {all.length}</span>
		{#if selected.size > 1}<span class="text-zinc-400">· {[...selected].filter((id) => project.index.get(id)?.type === 'link').length} selected (Properties / Delete)</span>{/if}
	</div>
	<datalist id="cad-link-types">{#each types as t (t)}<option value={t}></option>{/each}</datalist>
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr><th class="px-2 py-1">Kind</th><th class="px-2">Panel end</th><th class="px-2">Other end</th><th class="px-2">Label</th><th class="px-2">Cable type</th><th class="px-2">Len (m)</th><th class="px-2">Status</th><th></th></tr>
		</thead>
		<tbody>
			{#each rows.slice(0, LIMIT) as r (r.id)}
				<tr class="hov border-b border-zinc-100" class:row-sel={selected.has(r.id)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(r.id, e)}>
					<td class="px-2 py-0.5"><span class="chip k-{r.kind}">{r.kind}</span></td>
					<td class="px-2">{r.a}</td>
					<td class="px-2">{r.b}</td>
					<td class="px-2 font-mono text-zinc-600">{r.label || '—'}</td>
					<td class="px-2"><input class="cell" list="cad-link-types" value={r.cableType} placeholder="cable" onclick={(e) => e.stopPropagation()}
						onchange={(e) => edit(r.id, 'Cable type', { cableType: e.currentTarget.value.trim() || undefined })} /></td>
					<td class="px-2">{r.lengthM ?? ''}</td>
					<td class="px-2"><select class="cell s-{r.status}" value={r.status} onclick={(e) => e.stopPropagation()} onchange={(e) => edit(r.id, 'Link status', { status: e.currentTarget.value as Link['status'] })}>
						<option value="design">design</option><option value="installed">installed</option></select></td>
					<td class="px-1"><button class="del" title="Remove this link (Ctrl+Z undoes)" onclick={(e) => { e.stopPropagation(); remove(r.id) }}>✕</button></td>
				</tr>
			{:else}
				<tr><td colspan="8" class="px-2 py-3 text-zinc-400">No links{all.length ? ' match' : ' yet — allocate outlets, or interconnect panels from a port'}.</td></tr>
			{/each}
			{#if rows.length > LIMIT}<tr><td colspan="8" class="px-2 py-2 text-zinc-400">… and {rows.length - LIMIT} more — narrow it with Find or the chips.</td></tr>{/if}
		</tbody>
	</table>
</div>

<style>
	.hov:hover { background: var(--cad-hover); }
	.actions { position: sticky; left: 0; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.chip { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 5px; text-transform: uppercase; border: 0; }
	.chip.off { opacity: 0.35; }
	.k-run { background: #e0f2fe; color: #075985; }
	.k-tie { background: #f3e8ff; color: #6b21a8; }
	.k-backbone { background: #ffedd5; color: #9a3412; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	.cell { border: 1px solid transparent; border-radius: 3px; padding: 0 3px; background: transparent; color: var(--cad-text); width: 8rem; }
	.cell:hover, .cell:focus { border-color: var(--cad-line); background: var(--cad-input); }
	select.cell { width: auto; }
	.s-installed { color: #166534; }
	.del { visibility: hidden; color: var(--cad-faint); padding: 0 4px; }
	tr:hover .del { visibility: visible; }
	.del:hover { color: #dc2626; }
</style>
