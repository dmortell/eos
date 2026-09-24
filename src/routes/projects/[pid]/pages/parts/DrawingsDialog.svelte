<script lang="ts">
	// DRAWING MANAGEMENT (drawings-plan §5, phase 6) — File › Drawings… or the navigator's list button.
	// Three tabs:
	//   Sheets   — the live sheets as a register: search, filter (kind / discipline / tag), group, sort by any
	//              column, inline edit (number, title, kind, discipline, tags), bulk edit / renumber / archive,
	//              Excel export (the selection, else what's shown). Double-click a row opens the sheet.
	//   Archived — restore, or HARD delete (the only place a sheet is deleted for good; click twice).
	//   Models   — every model, the sheets + frames using it, archive / restore, and frames on live sheets that
	//              show a Missing model.
	// "Save as package" needs issued revisions (phase 7) — shown, disabled.
	// All writes go through the callbacks (the store saves them); the lists are derived from the props.
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import type { PagesSheetDoc, Place, SheetKind } from '../store/schema'
	import { sheetRows, filterRows, sortRows, groupRows, renumber, modelUsage, missingModelFrames, placePath,
		type SortKey, type GroupBy, type ModelInfo } from '../store/drawingList'
	import { exportDrawingRows } from '../store/drawingListExport'

	type Patch = { id: string; patch: Partial<PagesSheetDoc> }
	let { sheets, places, models, projectName = '', onupdate, onarchive, onrestore, ondelete, onopen, onmodelarchive, onopenmodel, onclose }: {
		sheets: PagesSheetDoc[]; places: Place[]; models: ModelInfo[]; projectName?: string
		onupdate: (p: Patch[]) => void; onarchive: (ids: string[]) => void; onrestore: (ids: string[]) => void
		ondelete: (id: string) => void; onopen: (sheetId: string) => void
		onmodelarchive: (id: string, archived: boolean) => void; onopenmodel: (id: string) => void; onclose: () => void
	} = $props()

	const KINDS: SheetKind[] = ['plan', 'elevation', 'schematic', 'detail', 'schedule']
	const COLS: { key: SortKey; label: string }[] = [
		{ key: 'number', label: 'Dwg №' }, { key: 'title', label: 'Title' }, { key: 'placePath', label: 'Place' }, { key: 'kind', label: 'Kind' },
		{ key: 'discipline', label: 'Discipline' }, { key: 'rev', label: 'Rev' }, { key: 'size', label: 'Size' }, { key: 'scale', label: 'Scale' }, { key: 'updatedAt', label: 'Updated' },
	]

	let tab = $state<'sheets' | 'archived' | 'models'>('sheets')
	let q = $state(''), fKind = $state(''), fDisc = $state(''), fTag = $state('')
	let groupBy = $state<GroupBy>('place')
	let sortKey = $state<SortKey>('number'), sortDir = $state<1 | -1>(1)
	let sel = $state<Set<string>>(new Set())

	const all = $derived(sheetRows(sheets, places))
	const live = $derived(all.filter((r) => r.status !== 'archived'))
	const archived = $derived(sortRows(all.filter((r) => r.status === 'archived'), 'updatedAt', -1))
	const shown = $derived(sortRows(filterRows(live, { q, kind: fKind, discipline: fDisc, tag: fTag }), sortKey, sortDir))
	const groups = $derived(groupRows(shown, groupBy))
	const disciplines = $derived([...new Set(live.map((r) => r.discipline).filter(Boolean))].sort())
	const tags = $derived([...new Set(live.flatMap((r) => r.tags))].sort())
	// the selection only ever holds rows that are still shown (a filter / archive drops the rest)
	const selIds = $derived(shown.filter((r) => sel.has(r.id)).map((r) => r.id))
	const usage = $derived(modelUsage(sheets))
	const missing = $derived(missingModelFrames(sheets, models))
	const modelRows = $derived([...models].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name, undefined, { numeric: true })))

	function sortBy(k: SortKey) { if (sortKey === k) sortDir = sortDir === 1 ? -1 : 1; else { sortKey = k; sortDir = 1 } }
	function toggle(id: string) { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); sel = s }
	const allShownSel = $derived(shown.length > 0 && selIds.length === shown.length)
	function toggleAll() { sel = allShownSel ? new Set() : new Set(shown.map((r) => r.id)) }

	const one = (id: string, patch: Partial<PagesSheetDoc>) => onupdate([{ id, patch }])
	const bulk = (patch: (id: string) => Partial<PagesSheetDoc>) => onupdate(selIds.map((id) => ({ id, patch: patch(id) })))
	const tagsOf = (id: string) => sheets.find((s) => s.id === id)?.tags ?? []
	const parseTags = (v: string) => [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))]

	// bulk controls
	let bDisc = $state(''), bTag = $state(''), rnStart = $state(1), rnPattern = $state('{n:3}')
	function applyRenumber() {
		// in the order shown (group by group), so a grouped register numbers place by place
		const order = groups.flatMap((g) => g.rows.map((r) => r.id)).filter((id, i, a) => sel.has(id) && a.indexOf(id) === i)
		const nums = renumber(order.length, rnStart, rnPattern)
		onupdate(order.map((id, i) => ({ id, patch: { drawingNumber: nums[i] } })))
	}
	const rnPreview = $derived(renumber(Math.min(selIds.length, 2), rnStart, rnPattern).join(', ') + (selIds.length > 2 ? ', …' : ''))

	let confirmDel = $state<string | null>(null)
	function del(id: string) {
		if (confirmDel !== id) { confirmDel = id; setTimeout(() => { if (confirmDel === id) confirmDel = null }, 3000); return }
		confirmDel = null; ondelete(id)
	}
	let exporting = $state(false)
	async function exportXlsx() {
		exporting = true
		try { await exportDrawingRows(selIds.length ? shown.filter((r) => sel.has(r.id)) : shown, projectName) } finally { exporting = false }
	}

	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value
	const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.value && e.target.type === 'search')) { e.preventDefault(); onclose() } }
	function autofocus(node: HTMLInputElement) { tick().then(() => node.focus()) }
	const fmtDay = (iso: string) => (iso ? iso.slice(0, 10) : '')
</script>

<svelte:window onkeydown={onKey} />
<div class="dd-back">
	<button class="dd-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="dd" role="dialog" aria-modal="true" aria-label="Drawings" tabindex="-1">
		<div class="dd-head">
			<span class="dd-title">Drawings</span>
			<div class="dd-tabs">
				<button class:on={tab === 'sheets'} onclick={() => (tab = 'sheets')}>Sheets <em>{live.length}</em></button>
				<button class:on={tab === 'archived'} onclick={() => (tab = 'archived')}>Archived <em>{archived.length}</em></button>
				<button class:on={tab === 'models'} onclick={() => (tab = 'models')}>Models <em>{models.length}</em>{#if missing.length}<b title="Frames showing a Missing model">!</b>{/if}</button>
			</div>
			<button class="dd-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button>
		</div>

		{#if tab === 'sheets'}
			<div class="dd-bar">
				<label class="dd-search"><Icon name="search" size={13} /><input type="search" placeholder="Search number, title, place, tag…" bind:value={q} use:autofocus /></label>
				<select bind:value={fKind} title="Kind"><option value="">All kinds</option>{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}</select>
				<select bind:value={fDisc} title="Discipline"><option value="">All disciplines</option>{#each disciplines as d (d)}<option value={d}>{d}</option>{/each}</select>
				<select bind:value={fTag} title="Tag"><option value="">All tags</option>{#each tags as t (t)}<option value={t}>{t}</option>{/each}</select>
				<select bind:value={groupBy} title="Group by">
					<option value="none">No grouping</option><option value="place">By place</option><option value="kind">By kind</option>
					<option value="discipline">By discipline</option><option value="tag">By tag</option><option value="size">By sheet size</option>
				</select>
				<span class="sp"></span>
				<button class="dd-btn" disabled={exporting || !shown.length} onclick={exportXlsx} title={selIds.length ? 'Export the selected sheets' : 'Export the sheets shown'}>
					<Icon name="download" size={13} /> Excel{selIds.length ? ` (${selIds.length})` : ''}</button>
			</div>
			{#if selIds.length}
				<div class="dd-bulk">
					<b>{selIds.length} selected</b>
					<select value="" onchange={(e) => { const v = val(e); if (v) bulk(() => ({ kind: v as SheetKind })); (e.currentTarget as HTMLSelectElement).value = '' }}>
						<option value="">Set kind…</option>{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}</select>
					<span class="grp"><input placeholder="Discipline" bind:value={bDisc} list="dd-discs" /><button class="dd-btn" onclick={() => bulk(() => ({ discipline: bDisc.trim() }))}>Set</button></span>
					<span class="grp"><input placeholder="Tag" bind:value={bTag} list="dd-tags" />
						<button class="dd-btn" disabled={!bTag.trim()} onclick={() => bulk((id) => ({ tags: [...new Set([...tagsOf(id), bTag.trim()])] }))}>Add</button>
						<button class="dd-btn" disabled={!bTag.trim()} onclick={() => bulk((id) => ({ tags: tagsOf(id).filter((t) => t !== bTag.trim()) }))}>Remove</button></span>
					<span class="grp" title="Renumber the selection in the order shown. {'{n}'} = number, {'{n:3}'} = zero-padded">
						<input class="num" type="number" bind:value={rnStart} /><input class="pat" bind:value={rnPattern} />
						<button class="dd-btn" onclick={applyRenumber}>Renumber</button><em>{rnPreview}</em></span>
					<button class="dd-btn warn" onclick={() => { onarchive(selIds); sel = new Set() }}><Icon name="archive" size={13} /> Archive</button>
					<button class="dd-btn" disabled title="Packages hold issued revisions — available with History (phase 7)"><Icon name="package" size={13} /> Package</button>
					<button class="dd-btn ghost" onclick={() => (sel = new Set())}>Clear</button>
				</div>
			{/if}
			<datalist id="dd-discs">{#each disciplines as d (d)}<option value={d}></option>{/each}</datalist>
			<datalist id="dd-tags">{#each tags as t (t)}<option value={t}></option>{/each}</datalist>
			<div class="dd-table">
				<table>
					<thead><tr>
						<th class="ck"><input type="checkbox" checked={allShownSel} onchange={toggleAll} title="Select all shown" /></th>
						{#each COLS as c (c.key)}<th><button onclick={() => sortBy(c.key)}>{c.label}{#if sortKey === c.key}<Icon name={sortDir === 1 ? 'chevronUp' : 'chevronDown'} size={11} />{/if}</button></th>{/each}
						<th>Tags</th><th></th>
					</tr></thead>
					{#each groups as g (g.key)}
						<tbody>
							{#if groupBy !== 'none'}<tr class="gh"><td colspan={COLS.length + 3}>{g.label} <em>{g.rows.length}</em></td></tr>{/if}
							{#each g.rows as r (r.id)}
								<tr class:sel={sel.has(r.id)} ondblclick={() => onopen(r.id)}>
									<td class="ck"><input type="checkbox" checked={sel.has(r.id)} onchange={() => toggle(r.id)} /></td>
									<td><input class="cell num" value={r.number} placeholder="—" onchange={(e) => one(r.id, { drawingNumber: val(e).trim() })} onkeydown={blurOnEnter} /></td>
									<td><input class="cell" value={r.title} onchange={(e) => { const t = val(e).trim(); if (t) one(r.id, { title: t }) }} onkeydown={blurOnEnter} /></td>
									<td class="muted">{r.placePath || '—'}</td>
									<td><select class="cell" value={r.kind} onchange={(e) => one(r.id, { kind: (val(e) || undefined) as SheetKind | undefined })}>
										<option value="">—</option>{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}</select></td>
									<td><input class="cell" value={r.discipline} placeholder="—" list="dd-discs" onchange={(e) => one(r.id, { discipline: val(e).trim() })} onkeydown={blurOnEnter} /></td>
									<td class="muted">{r.rev || '—'}</td><td class="muted">{r.size}</td><td class="muted">{r.scale}</td><td class="muted">{fmtDay(r.updatedAt)}</td>
									<td><input class="cell" value={r.tags.join(', ')} placeholder="—" title="Comma-separated" onchange={(e) => one(r.id, { tags: parseTags(val(e)) })} onkeydown={blurOnEnter} /></td>
									<td class="act"><button title="Open" onclick={() => onopen(r.id)}><Icon name="link" size={13} /></button></td>
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
				{#if !shown.length}<div class="dd-empty">{live.length ? 'No sheets match' : 'No sheets yet — add one from a place in the tree'}</div>{/if}
			</div>

		{:else if tab === 'archived'}
			<div class="dd-table">
				<table>
					<thead><tr><th>Dwg №</th><th>Title</th><th>Place</th><th>Updated</th><th></th></tr></thead>
					<tbody>
						{#each archived as r (r.id)}
							<tr>
								<td class="muted">{r.number || '—'}</td><td>{r.title}</td><td class="muted">{r.placePath || '—'}</td><td class="muted">{fmtDay(r.updatedAt)}</td>
								<td class="act wide">
									<button class="dd-btn" onclick={() => onrestore([r.id])}>Restore</button>
									<button class="dd-btn warn" class:confirm={confirmDel === r.id} onclick={() => del(r.id)}
										title="Delete for good — cannot be undone">{confirmDel === r.id ? 'Delete for good?' : 'Delete'}</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if !archived.length}<div class="dd-empty">No archived sheets</div>{/if}
			</div>

		{:else}
			<div class="dd-table">
				<table>
					<thead><tr><th>Model</th><th>Place</th><th>Kind</th><th>Version</th><th>Used by</th><th></th></tr></thead>
					<tbody>
						{#each modelRows as m (m.id)}
							{@const uses = usage.get(m.id) ?? []}
							<tr class:dim={m.archived}>
								<td>{m.name}{#if m.archived} <em class="tag">archived</em>{/if}</td>
								<td class="muted">{placePath(places, m.placeId ?? null) || '—'}</td>
								<td class="muted">{m.kind ?? '—'}</td>
								<td class="muted">{m.version ?? '—'}</td>
								<td class="muted">{uses.length ? uses.map((u) => `${u.sheetTitle} (frame ${u.frames.join(', ')})`).join('; ') : '—'}</td>
								<td class="act wide">
									{#if !m.archived}<button class="dd-btn" onclick={() => onopenmodel(m.id)}>Open</button>{/if}
									<button class="dd-btn" class:warn={!m.archived} onclick={() => onmodelarchive(m.id, !m.archived)}
										title={m.archived ? 'Restore' : uses.length ? 'Its frames will show "Missing model"' : ''}>{m.archived ? 'Restore' : 'Archive'}</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if missing.length}
					<div class="dd-sec">Frames showing a Missing model</div>
					<ul class="dd-missing">
						{#each missing as f (f.sheetId + f.seq)}
							<li><button onclick={() => onopen(f.sheetId)}>{f.sheetTitle}</button> · frame {f.seq} · {models.find((m) => m.id === f.modelId)?.name ?? f.modelId}{models.some((m) => m.id === f.modelId) ? ' (archived)' : ' (not found)'}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.dd-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:7vh; }
	.dd-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.dd { position:relative; width:min(1180px,96vw); height:80vh; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; }
	.dd-head { display:flex; align-items:center; gap:14px; padding:9px 12px; border-bottom:1px solid var(--line-soft); }
	.dd-title { font-size:12px; font-weight:700; letter-spacing:.04em; color:var(--text); }
	.dd-tabs { display:flex; gap:2px; flex:1; }
	.dd-tabs button { background:none; border:none; color:var(--muted); font-size:12px; padding:4px 10px; border-radius:5px; cursor:pointer; display:inline-flex; gap:5px; align-items:center; }
	.dd-tabs button.on { background:var(--active); color:var(--text); }
	.dd-tabs em { font-style:normal; font-size:10px; color:var(--faint); }
	.dd-tabs b { color:#f59e0b; font-size:11px; }
	.dd-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.dd-x:hover { color:var(--text); }
	.dd-bar, .dd-bulk { display:flex; align-items:center; gap:6px; padding:7px 12px; flex-wrap:wrap; }
	.dd-bulk { background:var(--active); border-top:1px solid var(--line-soft); border-bottom:1px solid var(--line-soft); font-size:11px; color:var(--text); }
	.dd-bulk em { font-style:normal; color:var(--faint); font-size:10px; font-family:Consolas,monospace; }
	.grp { display:inline-flex; align-items:center; gap:3px; }
	.sp { flex:1; }
	.dd-search { display:flex; align-items:center; gap:6px; background:var(--input); border:1px solid var(--line); border-radius:5px; padding:2px 7px; color:var(--muted); width:260px; }
	.dd-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; padding:2px 0; }
	.dd-search input:focus { outline:none; }
	select, .dd-bulk input { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 5px; font-size:11px; }
	.dd-bulk input { width:92px; }
	.dd-bulk input.num { width:52px; } .dd-bulk input.pat { width:80px; font-family:Consolas,monospace; }
	.dd-btn { display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:3px 8px; border-radius:4px; color:var(--text); background:var(--input); border:1px solid var(--line); cursor:pointer; white-space:nowrap; }
	.dd-btn:hover:not(:disabled) { border-color:var(--accent); }
	.dd-btn:disabled { opacity:.45; cursor:default; }
	.dd-btn.warn { color:#f87171; }
	.dd-btn.warn.confirm { background:#7f1d1d55; border-color:#ef4444; }
	.dd-btn.ghost { background:none; border-color:transparent; color:var(--muted); }
	.dd-table { flex:1; overflow:auto; min-height:0; }
	table { width:100%; border-collapse:collapse; font-size:12px; color:var(--text); }
	thead th { position:sticky; top:0; z-index:1; background:var(--panel); border-bottom:1px solid var(--line); text-align:left; font-weight:600; font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); padding:6px 6px; white-space:nowrap; }
	thead th button { background:none; border:none; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; padding:0; display:inline-flex; align-items:center; gap:2px; }
	td { padding:2px 6px; border-bottom:1px solid var(--line-soft); white-space:nowrap; max-width:260px; overflow:hidden; text-overflow:ellipsis; }
	tr.sel td { background:var(--active); }
	tr.dim td { opacity:.55; }
	tr.gh td { background:var(--bg, #0002); color:var(--muted); font-size:11px; font-weight:600; padding:6px; }
	tr.gh em { font-style:normal; color:var(--faint); font-weight:400; margin-left:4px; }
	td.muted { color:var(--muted); font-size:11px; }
	.ck { width:24px; } .ck input { accent-color:var(--accent); }
	.cell { width:100%; min-width:60px; background:transparent; border:1px solid transparent; border-radius:3px; color:var(--text); font-size:12px; padding:2px 4px; }
	.cell.num { font-family:Consolas,monospace; min-width:70px; }
	.cell:hover { border-color:var(--line); }
	.cell:focus { outline:none; border-color:var(--accent); background:var(--input); }
	select.cell { padding:1px 2px; }
	td.act { text-align:right; } td.act.wide { display:flex; gap:4px; justify-content:flex-end; }
	td.act > button:not(.dd-btn) { background:none; border:none; color:var(--muted); cursor:pointer; display:inline-grid; place-items:center; }
	td.act > button:not(.dd-btn):hover { color:var(--accent); }
	em.tag { font-style:normal; font-size:10px; color:var(--faint); border:1px solid var(--line); border-radius:3px; padding:0 4px; }
	.dd-empty { padding:24px; text-align:center; font-size:12px; color:var(--faint); }
	.dd-sec { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#f59e0b; padding:14px 12px 4px; }
	.dd-missing { margin:0; padding:0 12px 12px 28px; font-size:12px; color:var(--muted); }
	.dd-missing button { background:none; border:none; color:var(--accent); cursor:pointer; padding:0; font-size:12px; }
</style>
