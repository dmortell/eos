<!-- The BILL OF MATERIALS on screen (backlog "On-screen BOM dialog"; Dave: Export → BOM opens this, then Excel): the
     project's materials, and the rack BOM — all racks together or row by row — with totals and product links; what
     goes in the workbook is chosen here, then "Export to Excel". -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { CatalogProduct } from '$lib/catalog/types'
	import type { RackRow } from '../domain/types'
	import { bom } from '../domain/reports'
	import { rackBom } from '../domain/rackBom'
	import { exportBom } from '../render/exports'
	import { naturalCompare } from '../domain/labels'

	let { project, projectName, onclose, ondone }: { project: CadProject; projectName: string; onclose: () => void; ondone: (msg: string) => void } = $props()

	let catalog = $state<CatalogProduct[] | null>(null)
	$effect(() => { import('$lib/catalog/panduitSeed').then((m) => (catalog = m.PANDUIT_SEED)) })

	let materials = $state(true)
	let rack = $state<'consolidated' | 'byRow' | 'none'>('consolidated')
	let busy = $state(false)

	const lines = $derived(catalog ? bom(project.index, catalog, project.routes) : [])
	/** Every row (by room, then row order), and "No row" when some racks have none: [row id | null, heading]. */
	const rows = $derived.by((): [string | null, string][] => {
		const rs = [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow')
			.sort((a, b) => naturalCompare(project.index.nameOf(a.spaceId), project.index.nameOf(b.spaceId)) || a.order - b.order)
		const out: [string | null, string][] = rs.map((r) => [r.id, `${project.index.nameOf(r.spaceId)} · ${r.name}`])
		if (project.index.racks.some((r) => !r.rowId)) out.push([null, 'No row'])
		return out
	})
	const blocks = $derived(!catalog || rack === 'none' ? [] : rack === 'byRow'
		? rows.map(([id, name]) => ({ name, lines: rackBom(project.index, catalog!, { row: id }) })).filter((b) => b.lines.length)
		: [{ name: '', lines: rackBom(project.index, catalog) }])
	const rackQty = $derived(blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.qty, 0), 0))

	async function exportXlsx() {
		if (!catalog || busy) return
		busy = true
		try { const n = await exportBom(project.index, projectName, catalog, project.routes, { materials, rack, rows }); ondone(`BOM: ${n} lines`); onclose() }
		catch (e) { project.error = `BOM export failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
	<div class="dlg" role="dialog" aria-label="Bill of materials" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Bill of materials</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		{#if !catalog}
			<p class="pad">Loading the catalogue…</p>
		{:else}
			<section class="opts">
				<label><input type="checkbox" bind:checked={materials} /> Materials <span class="hint">({lines.length} lines)</span></label>
				<label>Rack BOM
					<select bind:value={rack}>
						<option value="consolidated">all racks together</option>
						<option value="byRow">row by row</option>
						<option value="none">not included</option>
					</select>
					<span class="hint">{rack === 'none' ? '' : `(${rackQty} items)`}</span>
				</label>
				<span class="grow"></span>
				<button class="btn go" disabled={busy || (!materials && rack === 'none')} onclick={exportXlsx}>{busy ? 'Exporting…' : 'Export to Excel'}</button>
			</section>
			<div class="body">
				{#if materials}
					<p class="h">Materials</p>
					<table>
						<thead><tr><th>Category</th><th>Item</th><th class="n">Qty</th><th>Unit</th><th>Note</th></tr></thead>
						<tbody>{#each lines as l, i (i)}<tr><td>{l.category}</td><td>{l.item}</td><td class="n">{l.qty}</td><td>{l.unit}</td><td class="hint">{l.note ?? ''}</td></tr>{/each}</tbody>
					</table>
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
					{#if rack !== 'none'}<p class="pad hint">No racks.</p>{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(64rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.pad { padding: 8px 12px; }
	.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.grow { flex: 1; }
	select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.body { overflow: auto; padding: 0 12px 12px; }
	.h { font-weight: 600; margin: 10px 0 4px; }
	.hint { color: var(--cad-muted, #71717a); }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 2px 6px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	.n { text-align: right; white-space: nowrap; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
	a { color: var(--cad-link, #2563eb); }
	.tot td { font-weight: 600; border-bottom: none; }
</style>
