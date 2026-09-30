<script lang="ts">
	// The left sidebar's ITEMS tab: the shapes + 3D objects of the ACTIVE view's model as a filterable list (outlets by
	// level / usage, trunks, racks …). Click / Ctrl+click / Shift+click select them in the view (like a file list);
	// double-click brings them into view. ui/itemList.ts builds + filters the rows.
	import type { Snippet } from 'svelte'
	import { Icon, listClick } from '$lib'
	import type { Model } from '../3dview/types'
	import { itemRows, filterItems, catCounts, rowKey, type ItemCat, type ItemFilter, type ItemRow } from '../ui/itemList'

	let { model, view = null, selected = [], onselect, onshow, oncollapse, head }: {
		model: Model | null
		/** The active viewport (for "In this view"): its hidden / frozen layers, frame id and direction; null = none. */
		view?: ItemFilter['view'] | null
		/** The selected row keys ('ent:<id>' / 'obj:<id>') in the active view. */
		selected?: string[]
		onselect?: (rows: ItemRow[]) => void
		/** Double-click: bring the selection into view. */
		onshow?: () => void
		oncollapse?: () => void
		/** The sidebar's tab strip (Drawings | Items), drawn in the header. */
		head?: Snippet
	} = $props()

	// the filters (kept for the session: switching tabs / models doesn't reset them)
	const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('pages.items.' + k); return v == null ? d : JSON.parse(v) } catch { return d } }
	const keep = (k: string, v: unknown) => { try { localStorage.setItem('pages.items.' + k, JSON.stringify(v)) } catch { /* private mode */ } }
	let cat = $state<ItemCat | ''>(load('cat', 'outlet'))
	let layer = $state('')
	let q = $state('')
	let level = $state<'' | 'High' | 'Low'>('')
	let usage = $state('')
	let inView = $state<boolean>(load('inView', true))
	$effect(() => keep('cat', cat))
	$effect(() => keep('inView', inView))

	const all = $derived(model ? itemRows(model) : [])
	const cats = $derived(catCounts(all))
	// the layers / usages that have rows (in the chosen category), for their lists
	const inCat = $derived(cat ? all.filter((r) => r.cat === cat) : all)
	const layers = $derived.by(() => { const m = new Map<string, string>(); for (const r of inCat) if (r.layerId) m.set(r.layerId, r.layer || r.layerId); return [...m].sort((a, b) => a[1].localeCompare(b[1])) })
	const usages = $derived([...new Set(inCat.map((r) => r.usage).filter((u): u is string => !!u))].sort())
	// the level filter shows where anything in the category has a level (outlets always; other shapes once given one)
	const hasLevels = $derived(inCat.some((r) => r.level))
	const rows = $derived(filterItems(all, { cat, layer, q, level: hasLevels ? level : '', usage: cat === 'outlet' || !cat ? usage : '', view: inView && view ? view : undefined }))
	const keys = $derived(rows.map(rowKey))
	const selSet = $derived(new Set(selected))
	const nSel = $derived(keys.filter((k) => selSet.has(k)).length)
	const ports = $derived(rows.reduce((s, r) => s + (r.ports ?? 0), 0))
	const LIMIT = 2000
	// a filter value that no longer exists (another model) falls back to all
	$effect(() => { if (layer && !layers.some(([id]) => id === layer)) layer = '' })
	$effect(() => { if (usage && !usages.includes(usage)) usage = '' })

	let anchor = $state<string | null>(null)
	function click(e: MouseEvent, r: ItemRow) {
		const k = rowKey(r), res = listClick(keys, selected.filter((x) => keys.includes(x)), anchor, k, e)
		anchor = res.anchor
		const pick = new Set(res.sel)
		onselect?.(rows.filter((x) => pick.has(rowKey(x))))
	}
	function selectAll() { anchor = null; onselect?.(rows.slice(0, LIMIT)) }

	// a selection made in the view scrolls its (first) row into sight
	let listEl = $state<HTMLDivElement>()
	$effect(() => {
		const first = selected[0]; if (!first || !listEl) return
		const el = listEl.querySelector<HTMLElement>(`[data-key="${CSS.escape(first)}"]`)
		el?.scrollIntoView({ block: 'nearest' })
	})
	const clearFilters = () => { layer = ''; q = ''; level = ''; usage = '' }
	const filtered = $derived(!!(layer || q || level || usage))
</script>

<div class="it">
	<div class="it-head">
		{#if head}{@render head()}{:else}<span class="it-title">ITEMS</span>{/if}
		<div class="it-acts">
			<button title="Collapse" aria-label="Collapse panel" onclick={() => oncollapse?.()}><Icon name="chevronLeft" size={14} /></button>
		</div>
	</div>
	{#if !model}
		<div class="it-hint">Open a model or a sheet — the list shows the shapes and objects of the active view's model.</div>
	{:else}
		<div class="it-model" title="The active view's model">{model.name}</div>
		<div class="it-search">
			<Icon name="search" size={12} />
			<input placeholder="Search label, text, layer…" bind:value={q} onkeydown={(e) => e.stopPropagation()} />
			{#if q}<button class="it-x" aria-label="Clear search" onclick={() => (q = '')}><Icon name="x" size={11} /></button>{/if}
		</div>
		<div class="it-filters">
			<select bind:value={cat} title="What to list" aria-label="Category">
				<option value="">Everything ({all.length})</option>
				{#each cats as c (c.id)}<option value={c.id}>{c.label} ({c.n})</option>{/each}
			</select>
			<select bind:value={layer} title="Only this layer" aria-label="Layer">
				<option value="">All layers</option>
				{#each layers as [id, name] (id)}<option value={id}>{name}</option>{/each}
			</select>
			{#if hasLevels}
				<select bind:value={level} title="High / low level (Properties › LEVEL)" aria-label="Level">
					<option value="">High + low</option><option value="High">High level</option><option value="Low">Low level</option>
				</select>
			{/if}
			{#if cat === 'outlet'}
				<select bind:value={usage} title="Outlet usage (its TYPE)" aria-label="Usage" disabled={!usages.length}>
					<option value="">All usages</option>
					{#each usages as u (u)}<option value={u}>{u}</option>{/each}
				</select>
			{/if}
		</div>
		<div class="it-opts">
			<label title={view ? 'Only what this view shows: visible, unfrozen layers; this view\'s own notes; its plane' : 'No active view'}>
				<input type="checkbox" bind:checked={inView} disabled={!view} /> In this view
			</label>
			{#if filtered}<button class="it-link" onclick={clearFilters}>Clear filters</button>{/if}
		</div>
		<div class="it-count">
			<span>{rows.length} {rows.length === 1 ? 'item' : 'items'}{#if cat === 'outlet' && ports} · {ports} ports{/if}{#if nSel} · <b>{nSel} selected</b>{/if}</span>
			{#if rows.length}<button class="it-link" onclick={selectAll} title="Select every listed item in the view">Select all</button>{/if}
		</div>
		<div class="it-list" bind:this={listEl} role="listbox" aria-multiselectable="true" aria-label="Items">
			{#each rows.slice(0, LIMIT) as r (rowKey(r))}
				<button class="it-row" class:sel={selSet.has(rowKey(r))} data-key={rowKey(r)} role="option" aria-selected={selSet.has(rowKey(r))}
					title={[r.name + (r.detail ? ` — ${r.detail}` : ''), r.level ? `${r.level} level` : '', r.z ? `Height FL+${Math.round(r.z)}` : '', r.layer ? `Layer: ${r.layer}` : '',
						'Click to select · Ctrl / Shift+click for several · double-click to show it'].filter(Boolean).join('\n')}
					onclick={(e) => click(e, r)} ondblclick={() => onshow?.()}>
					{#if r.level}<span class="it-dot" class:low={r.level === 'Low'} title="{r.level} level"></span>{/if}
					<span class="it-name" class:mono={r.cat === 'outlet' || r.cat === 'rack'}>{r.name}</span>
					<span class="it-detail">{r.detail}</span>
				</button>
			{:else}
				<div class="it-hint">{all.length ? 'Nothing matches — widen the filters (or untick “In this view”).' : 'This model has no shapes or objects yet.'}</div>
			{/each}
			{#if rows.length > LIMIT}<div class="it-hint">…and {rows.length - LIMIT} more — narrow the filters.</div>{/if}
		</div>
	{/if}
</div>

<style>
	.it { flex:1; display:flex; flex-direction:column; min-height:0; }
	.it-head { display:flex; align-items:center; justify-content:space-between; height:30px; padding:0 6px; border-bottom:1px solid var(--line-soft); }
	.it-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:600; }
	.it-acts button { display:inline-flex; align-items:center; justify-content:center; width:24px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.it-acts button:hover { background:var(--hover); color:var(--text); }
	.it-model { font-size:11px; font-weight:600; color:var(--text); padding:6px 8px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.it-search { display:flex; align-items:center; gap:5px; margin:6px; background:var(--input); border:1px solid var(--line); border-radius:5px; padding:0 7px; }
	.it-search :global(svg) { color:var(--faint); flex:0 0 auto; }
	.it-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; padding:5px 0; }
	.it-search input:focus { outline:none; }
	.it-x { display:inline-grid; place-items:center; width:16px; height:16px; border:none; background:none; color:var(--muted); border-radius:3px; cursor:pointer; }
	.it-filters { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:0 6px; }
	.it-filters select { min-width:0; font-size:11px; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 4px; }
	.it-opts { display:flex; align-items:center; justify-content:space-between; padding:6px 8px 2px; font-size:11px; color:var(--muted); }
	.it-opts label { display:inline-flex; align-items:center; gap:4px; cursor:pointer; }
	.it-link { border:none; background:none; color:var(--accent); font-size:11px; cursor:pointer; padding:0; }
	.it-link:hover { text-decoration:underline; }
	.it-count { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:2px 8px 4px; font-size:10.5px; color:var(--faint); border-bottom:1px solid var(--line-soft); }
	.it-count b { color:var(--text); font-weight:600; }
	.it-list { flex:1; overflow:auto; min-height:0; padding:2px 0; }
	.it-row { display:flex; align-items:center; gap:6px; width:100%; padding:2px 8px; border:none; background:none; color:var(--text); font-size:12px; text-align:left; cursor:default; user-select:none; }
	.it-row:hover { background:var(--hover); }
	.it-row.sel { background:color-mix(in srgb, var(--accent) 22%, transparent); }
	.it-name { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.it-name.mono { font-family:Consolas, monospace; font-size:11.5px; }
	.it-detail { flex:none; max-width:55%; font-size:10.5px; color:var(--faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.it-dot { flex:none; width:8px; height:8px; border-radius:50%; border:1.5px solid var(--muted); }
	.it-dot.low { background:var(--muted); }
	.it-hint { font-size:11px; color:var(--faint); padding:8px; line-height:1.45; }
</style>
