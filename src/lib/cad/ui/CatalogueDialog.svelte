<!-- The PRODUCT CATALOGUE (backlog "Catalogue, with links to product specs"; Cabling › Product catalogue…): the built-in
     Panduit catalogue plus the custom products everyone has added (one global list, $lib/catalog/service.ts), filtered
     by kind, maker, RU and a search; each product's spec sheet opens from its row. A rack or VCM can be drawn from
     here (the Rack tool, each click one of it: its size, kind, SKU — the rack BOM then adds its accessories). Custom
     products are added here and deleted (the built-in ones are read-only). -->
<script lang="ts">
	import { Firestore } from '$lib'
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import { subscribeCatalog, saveCustomProduct, deleteCustomProduct } from '$lib/catalog/service'
	import { productId, type CatalogProduct, type ProductKind } from '$lib/catalog/types'
	import { rackFromProduct } from '../domain/rackBom'
	import { naturalCompare } from '../domain/labels'

	let { project, onclose, ondraw }: { project: CadProject; onclose: () => void; ondraw: (p: ReturnType<typeof rackFromProduct>, name: string) => void } = $props()

	const db = new Firestore()
	let all = $state.raw<CatalogProduct[]>([])
	$effect(() => subscribeCatalog(db, (ps) => (all = ps)))

	const KINDS: [ProductKind | '', string][] = [['', 'any kind'], ['rack', 'racks'], ['vcm', 'cable managers'], ['accessory', 'accessories'], ['device', 'devices']]
	let kind = $state<ProductKind | ''>(''), maker = $state(''), ru = $state(''), q = $state('')
	const makers = $derived([...new Set(all.map((p) => p.maker))].sort(naturalCompare))
	const shown = $derived.by(() => {
		const s = q.trim().toLowerCase(), u = Number(ru)
		return all.filter((p) => (!kind || p.kind === kind) && (!maker || p.maker === maker) && (!ru || p.ru === u)
			&& (!s || `${p.sku} ${p.description} ${p.family ?? ''} ${p.color ?? ''}`.toLowerCase().includes(s)))
			.sort((a, b) => naturalCompare(a.maker, b.maker) || naturalCompare(a.sku, b.sku))
	})
	const LIMIT = 300

	// ── a custom product (everyone's list) ──
	let adding = $state(false), err = $state('')
	let nw = $state({ maker: '', sku: '', kind: 'rack' as ProductKind, description: '', ru: '', widthMm: '', depthMm: '', productUrl: '' })
	const n = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0))
	async function addProduct() {
		err = ''
		if (!nw.maker.trim() || !nw.sku.trim() || !nw.description.trim()) { err = 'A maker, a SKU and a description'; return }
		const id = productId(nw.maker.trim(), nw.sku.trim())
		if (all.some((p) => p.id === id && p.seeded)) { err = `${nw.maker} ${nw.sku} is in the built-in catalogue already`; return }
		const p: Omit<CatalogProduct, 'seeded'> = { id, maker: nw.maker.trim(), sku: nw.sku.trim(), kind: nw.kind, description: nw.description.trim(),
			...(n(nw.ru) ? { ru: n(nw.ru) } : {}), ...(n(nw.widthMm) ? { widthMm: n(nw.widthMm) } : {}), ...(n(nw.depthMm) ? { depthMm: n(nw.depthMm) } : {}), ...(nw.productUrl.trim() ? { productUrl: nw.productUrl.trim() } : {}) }
		try { await saveCustomProduct(db, p, undefined, project.pid); adding = false; nw = { ...nw, sku: '', description: '', productUrl: '' }; q = p.sku }
		catch (e) { err = `Couldn't add it: ${(e as Error).message}` }
	}
	/** Delete: a second click on the same row confirms (custom products only; racks already drawn keep their SKU). */
	let sure = $state('')
	async function remove(p: CatalogProduct) {
		if (sure !== p.id) { sure = p.id; return }
		sure = ''
		try { await deleteCustomProduct(db, p.id) } catch (e) { err = `Couldn't delete it: ${(e as Error).message}` }
	}
	const canDraw = (p: CatalogProduct) => p.kind === 'rack' || p.kind === 'vcm'
</script>

<CadDialog title="Product catalogue" width="min(96vw, 64rem)" top="5vh" {onclose} bar={filters}>
	{#if adding}
		<div class="add">
			<label>Maker <input class="inp" bind:value={nw.maker} placeholder="e.g. Rittal" /></label>
			<label>SKU <input class="inp mono" bind:value={nw.sku} /></label>
			<label>Kind <select class="inp" bind:value={nw.kind}>{#each KINDS.slice(1) as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
			<label class="wide">Description <input class="inp" bind:value={nw.description} placeholder="e.g. 42U 800×1000 server cabinet" /></label>
			<label>RU <input class="inp n" bind:value={nw.ru} /></label>
			<label>W (mm) <input class="inp n" bind:value={nw.widthMm} /></label>
			<label>D (mm) <input class="inp n" bind:value={nw.depthMm} /></label>
			<label class="wide">Spec sheet <input class="inp" bind:value={nw.productUrl} placeholder="https://…" /></label>
			<button class="btn go" onclick={() => void addProduct()}>Add to the catalogue</button>
			<button class="btn" onclick={() => (adding = false)}>Cancel</button>
			<p class="hint">Custom products are shared with every project (and everyone).</p>
		</div>
	{/if}
	{#if err}<p class="bad">{err}</p>{/if}
	<table>
		<thead><tr><th>Maker</th><th>SKU</th><th>Kind</th><th>Description</th><th class="r">RU</th><th class="r">W × D</th><th>Spec</th><th></th></tr></thead>
		<tbody>
			{#each shown.slice(0, LIMIT) as p (p.id)}
				<tr>
					<td>{p.maker}</td><td class="mono">{p.sku}</td><td>{p.kind}{p.seeded ? '' : ' · custom'}</td><td>{p.description}</td>
					<td class="r">{p.ru ?? ''}</td><td class="r">{p.widthMm || p.depthMm ? `${p.widthMm ?? '—'} × ${p.depthMm ?? '—'}` : ''}</td>
					<td>{#if p.productUrl}<a href={p.productUrl} target="_blank" rel="noopener noreferrer" title="Its data sheet">↗</a>{/if}</td>
					<td class="acts">
						{#if canDraw(p)}<button class="btn" title="The Rack tool, drawing this product with each click on the plan (its size, kind and SKU)" onclick={() => ondraw(rackFromProduct(p), `${p.maker} ${p.sku}`)}>Draw racks</button>{/if}
						{#if !p.seeded}<button class="btn del" title="Delete this custom product from the catalogue (racks already drawn keep their SKU)" onclick={() => void remove(p)}>{sure === p.id ? 'Delete?' : '✕'}</button>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if shown.length > LIMIT}<p class="hint">{shown.length - LIMIT} more — narrow the search</p>{:else if !shown.length}<p class="hint">Nothing matches.</p>{/if}
</CadDialog>

{#snippet filters()}
	<select class="inp" bind:value={kind}>{#each KINDS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
	<select class="inp" bind:value={maker}><option value="">any maker</option>{#each makers as m (m)}<option value={m}>{m}</option>{/each}</select>
	<label>RU <input class="inp n" bind:value={ru} placeholder="any" /></label>
	<input class="inp q" bind:value={q} placeholder="Search SKU, description, family, color…" />
	<span class="hint">{shown.length} of {all.length}</span>
	<span class="grow"></span>
	<button class="btn" onclick={() => (adding = !adding)}>+ Custom product</button>
{/snippet}

<style>
	.grow { flex: 1; }
	.inp { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; padding: 0 4px; }
	.inp.n { width: 3.5rem; }
	.inp.q { width: 18rem; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 8px; background: var(--cad-input, white); white-space: nowrap; }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn.del:hover { color: #dc2626; }
	.hint { color: var(--cad-muted, #71717a); }
	.bad { color: #dc2626; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
	.add { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: 8px; }
	.add .wide .inp { width: 18rem; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 2px 6px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	.r { text-align: right; white-space: nowrap; }
	.acts { white-space: nowrap; text-align: right; }
	a { color: var(--cad-link, #2563eb); }
</style>
