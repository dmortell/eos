<!-- The BILL OF MATERIALS on screen (backlog "On-screen BOM dialog"; Dave: Export → BOM opens this, then Excel): the
     project's materials, and the rack BOM — all racks together or row by row, for the rooms ticked (any levels; all at
     first) — with totals and product links; what
     goes in the workbook is chosen here, then "Export to Excel". -->
<script lang="ts">
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { CatalogProduct } from '$lib/catalog/types'
	import type { RackRow } from '../domain/types'
	import { bom } from '../domain/reports'
	import { rackBom, bomRooms } from '../domain/rackBom'
	import { exportBom } from '../render/exports'
	import { naturalCompare } from '../domain/labels'

	let { project, projectName, onclose, ondone }: { project: CadProject; projectName: string; onclose: () => void; ondone: (msg: string) => void } = $props()

	let catalog = $state<CatalogProduct[] | null>(null)
	$effect(() => { import('$lib/catalog/panduitSeed').then((m) => (catalog = m.PANDUIT_SEED)) })

	let materials = $state(true)
	let rack = $state<'consolidated' | 'byRow' | 'none'>('consolidated')
	let busy = $state(false)

	/** The rooms with racks, by level; `off` = the ones unticked (so every room is in at first, and a new one too). */
	const groups = $derived(bomRooms(project.index))
	const roomCount = $derived(groups.reduce((n, g) => n + g.rooms.length, 0))
	let off = $state<string[]>([])
	const setRooms = (ids: string[], on: boolean) => (off = on ? off.filter((x) => !ids.includes(x)) : [...new Set([...off, ...ids])])
	/** The rooms picked — undefined = all of them (no filter, and the sheet doesn't list them). */
	const rooms = $derived(off.length ? groups.flatMap((g) => g.rooms.filter((r) => !off.includes(r.id)).map((r) => r.id)) : undefined)
	// the rooms ticked scope the materials too (W25: what serves those rooms — a phased tender)
	const lines = $derived(catalog ? bom(project.index, catalog, project.routes, project.estimates, rooms ? { rooms } : {}) : [])
	/** The quote's header (W25): the client from Project details; a revision and a note typed here. */
	let rev = $state(''), note = $state('')
	const roomsText = $derived(rooms && groups.flatMap((g) => { const rs = g.rooms.filter((r) => rooms.includes(r.id)); return rs.length ? [`${g.level} ${rs.map((r) => r.name).join(', ')}`] : [] }).join(' · '))
	/** Every row (by room, then row order), and "No row" when some racks have none: [row id | null, heading] — in the
	 *  rooms picked. */
	const rows = $derived.by((): [string | null, string][] => {
		const inRoom = (id: string) => !rooms || rooms.includes(id)
		const rs = project.index.ofType('rackRow').filter((e) => inRoom(e.spaceId))
			.sort((a, b) => naturalCompare(project.index.nameOf(a.spaceId), project.index.nameOf(b.spaceId)) || a.order - b.order)
		const out: [string | null, string][] = rs.map((r) => [r.id, `${project.index.nameOf(r.spaceId)} · ${r.name}`])
		if (project.index.racks.some((r) => !r.rowId && inRoom(r.spaceId))) out.push([null, 'No row'])
		return out
	})
	const blocks = $derived(!catalog || rack === 'none' ? [] : rack === 'byRow'
		? rows.map(([id, name]) => ({ name, lines: rackBom(project.index, catalog!, { row: id, rooms }) })).filter((b) => b.lines.length)
		: [{ name: '', lines: rackBom(project.index, catalog, { rooms }) }].filter((b) => b.lines.length))
	const rackQty = $derived(blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.qty, 0), 0))

	async function exportXlsx() {
		if (!catalog || busy) return
		busy = true
		try { const n = await exportBom(project.index, projectName, catalog, project.routes, { materials, rack, rows, rooms, roomsText, header: { client: project.sheetBase.details?.client || undefined, rev: rev.trim() || undefined, note: note.trim() || undefined } }, project.estimates); if (n !== null) { ondone(`BOM: ${n} lines`); onclose() } }
		catch (e) { project.error = `BOM export failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<CadDialog title="Bill of materials" width="64rem" top="5vh" {onclose} bar={catalog ? opts : undefined}>
	{#if !catalog}
		<p>Loading the catalogue…</p>
	{:else}
		{#if materials}
			<p class="h">Materials <span class="hint">— what to buy: installed cables and cords aren’t counted, only cords to add or replace</span></p>
			<table>
				<thead><tr><th>Category</th><th>Item</th><th class="n">Qty</th><th>Unit</th><th>Note</th></tr></thead>
				<tbody>{#each lines as l, i (i)}<tr><td>{l.category}</td><td>{l.item}</td><td class="n">{l.qty}</td><td>{l.unit}</td><td class="hint">{l.note ?? ''}</td></tr>{/each}</tbody>
			</table>
		{/if}
		{#if roomCount > 1}
			<!-- which rooms the BOM is for (materials and rack BOM), on any levels: all at first; a level's box ticks / unticks its rooms -->
			<div class="rooms" role="group" aria-label="Rooms in the BOM">
				<span class="hint" title="The materials count what serves the rooms ticked (outlets with a port to one, its panels and cables, the runs on those floors); the rack BOM their racks">BOM for:</span>
				{#each groups as g (g.levelId)}
					{@const all = g.rooms.every((r) => !off.includes(r.id))}
					{@const none = g.rooms.every((r) => off.includes(r.id))}
					<span class="lv">
						<label class="lvl"><input type="checkbox" checked={all} indeterminate={!all && !none} onchange={(e) => setRooms(g.rooms.map((r) => r.id), e.currentTarget.checked)} /> {g.level}</label>
						{#each g.rooms as r (r.id)}
							<label><input type="checkbox" checked={!off.includes(r.id)} onchange={(e) => setRooms([r.id], e.currentTarget.checked)} /> {r.name} <span class="hint">({r.racks})</span></label>
						{/each}
					</span>
				{/each}
			</div>
		{/if}
		{#each blocks as b (b.name)}
			<p class="h">Rack BOM{b.name ? ` — ${b.name}` : ''}</p>
			<table>
				<thead><tr><th>Group</th><th>SKU</th><th>Description</th><th>Role</th><th class="n">Qty</th></tr></thead>
				<tbody>
					{#each b.lines as l, i (i)}
						<tr><td>{l.group}</td><td class="mono">{#if l.url}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.sku}</a>{:else}{l.sku}{/if}</td><td>{l.description}</td><td class="hint">{l.note ?? ''}</td><td class="n">{l.qty}</td></tr>
					{/each}
					<tr class="tot"><td colspan="4">Total</td><td class="n">{b.lines.reduce((n, l) => n + l.qty, 0)}</td></tr>
				</tbody>
			</table>
		{:else}
			{#if rack !== 'none'}<p class="hint">{rooms ? 'No racks in the rooms ticked.' : 'No racks.'}</p>{/if}
		{/each}
	{/if}
</CadDialog>

{#snippet opts()}
				<label><input type="checkbox" bind:checked={materials} /> Materials <span class="hint">({lines.length} lines)</span></label>
				<label>Rack BOM
					<select bind:value={rack}>
						<option value="consolidated">all racks together</option>
						<option value="byRow">row by row</option>
						<option value="none">not included</option>
					</select>
					<span class="hint">{rack === 'none' ? '' : `(${rackQty} items)`}</span>
				</label>
				<!-- W25: the quote's header in the workbook (the client comes from Project details) -->
				<label title="Printed under the workbook's title with the client and today's date">Revision <input class="inp w" bind:value={rev} placeholder="e.g. Q1" /></label>
				<label title="A line under the header, e.g. what the quote covers">Note <input class="inp wn" bind:value={note} placeholder="(optional)" /></label>
				<span class="grow"></span>
				<button class="btn go" disabled={busy || (!materials && rack === 'none')} onclick={exportXlsx}>{busy ? 'Exporting…' : 'Export to Excel'}</button>
{/snippet}

<style>
	.grow { flex: 1; }
	.inp { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; padding: 0 4px; }
	.inp.w { width: 4.5rem; }
	.inp.wn { width: 12rem; }
	select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.h { font-weight: 600; margin: 10px 0 4px; }
	.h:first-child { margin-top: 0; }
	.hint { color: var(--cad-muted, #71717a); }
	.h .hint { font-weight: 400; }
	.rooms { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin: 10px 0 4px; }
	.rooms .lv { display: inline-flex; flex-wrap: wrap; gap: 2px 10px; }
	.rooms .lvl { font-weight: 600; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 2px 6px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	.n { text-align: right; white-space: nowrap; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
	a { color: var(--cad-link, #2563eb); }
	.tot td { font-weight: 600; border-bottom: none; }
</style>
