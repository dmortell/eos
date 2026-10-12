<!-- The layers list (docs/plan/layers.md) in drawing order: the first row (Floorplans) draws at the bottom. The eye and lock are the user's own (this browser, this
     project — nobody else's view changes); the color, name and order are the project's (undoable). With a viewport
     picked on a sheet, the snowflake freezes a layer in THAT viewport (stored: it prints); Shift = every viewport on the
     sheet. Click a name to make it the current layer (highlighted like the open level), where new lines go. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Id } from '../domain/types'
	import type { Layer, Sheet } from '../domain/drawing'
	import { layersOf, layerOf, nextLayerColour, freezeInExisting, type LayerInfo } from '../domain/layers'
	import { layerCounts } from '../views/layers'
	import { newId } from '../domain/ids'
	import { DASHES, WEIGHTS } from '../views/display'
	import { Icon, DragReorder } from '$lib'
	import SideSection from './SideSection.svelte'
	import ColorPick from './ColorPick.svelte'
	import NameInput from './NameInput.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	let q = $state('')
	const all = $derived(layersOf(project.index.layers))
	const rows = $derived(q.trim() ? all.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())) : all)
	const counts = $derived(layerCounts(project.index))
	// the picked viewport — or the one being edited inside (its ❄ freeze is what prints)
	const sheet = $derived(ws.vpEdit ? project.index.get<Sheet>(ws.vpEdit.sheetId) : ws.viewportId && ws.selection.length === 1 ? project.index.get<Sheet>(ws.selection[0]) : undefined)
	const vp = $derived(sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === (ws.vpEdit?.vpId ?? ws.viewportId)) : undefined)
	/** Any layer can be current (Dave: clicking a name did nothing on most); new lines go on it. */
	const canBeCurrent = (_l: LayerInfo) => true

	/** The layer's record with a change (a system layer gets one the first time it's restyled). */
	const record = (l: LayerInfo, change: Partial<Layer>): Layer => {
		const next: Layer = { ...(project.index.get<Layer>(l.id) ?? { type: 'layer', id: l.id, name: l.name, order: l.order }), ...change }
		if (!next.color) delete next.color
		if (!next.weightMm) delete next.weightMm
		if (!next.dash) delete next.dash
		return next
	}
	const put = (label: string, ...ls: Layer[]) => project.store.transact(label, (tx) => ls.forEach((l) => tx.put(l)))

	// names are typed in the list (Dave 2026-10-12): "+ Layer" opens a name box at the end, ✎ swaps a name for one
	let adding = $state(false), renaming = $state<string | null>(null)
	function add(name: string): void {
		adding = false
		const order = Math.max(0, ...all.map((l) => l.order)) + 10, id = newId()
		// it starts hidden in the drawings that already exist (Dave): they don't change when something is drawn on it
		const sheets = freezeInExisting(project.store.ofType('sheet'), id)
		project.store.transact(`Add layer ${name}`, (tx) => { tx.put({ type: 'layer', id, name, order, color: nextLayerColour(project.index.layers) }); for (const s of sheets) tx.put(s) })
		if (sheets.length) ws.say(`Layer ${name} added — hidden in the viewports of the ${sheets.length} existing sheet${sheets.length === 1 ? '' : 's'} (show it per viewport)`)
	}
	function rename(l: LayerInfo): void { if (!l.system) renaming = l.id }
	function remove(l: LayerInfo): void {
		const n = counts.get(l.id) ?? 0
		if (n) { ws.say(`${l.name} has ${n} item${n === 1 ? '' : 's'} — move them to another layer first (Properties → Layer)`); return }
		project.store.transact(`Delete layer ${l.name}`, (tx) => tx.del(l.id))
		ws.layers.forget(l.id)
		ws.say(`Layer ${l.name} deleted — Undo brings it back`)
	}
	const setColour = (l: LayerInfo, color: string | undefined) => put(`${l.name} color`, record(l, { color }))
	// the layer's line type and lineweight (backlog "Layer line type and lineweight"): its items without their own use them
	let styling = $state<Id | null>(null)
	const DASH_NAMES: Record<string, string> = { '': 'Solid', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' }
	const SAMPLE: Record<string, string | undefined> = { dashed: '4 2', dotted: '1 2', dashdot: '5 2 1 2' }

	// hiding or locking a layer lets go of its selected items (Delete / Properties mustn't act on what you can't see
	// or have locked); showing / unlocking leaves the selection alone
	function letGo(id: Id): void {
		const known = new Set(all.map((l) => l.id))
		const keep = ws.selection.filter((s) => { const e = project.index.get(s); return !e || layerOf(e, known) !== id })
		if (keep.length !== ws.selection.length) ws.select(keep)
	}
	function hide(l: LayerInfo): void { ws.layers.toggleHidden(l.id); if (ws.layers.hidden.has(l.id)) letGo(l.id) }
	function lock(l: LayerInfo): void { ws.layers.toggleLocked(l.id); if (ws.layers.locked.has(l.id)) letGo(l.id) }

	function freeze(l: LayerInfo, every: boolean): void {
		if (!sheet || !vp) return
		const on = !vp.frozen?.includes(l.id)
		const flip = (ids: Id[] = []) => (on ? [...new Set([...ids, l.id])] : ids.filter((x) => x !== l.id))
		const viewports = sheet.viewports.map((v) => (every || v.id === vp.id ? { ...v, frozen: flip(v.frozen) } : v))
		project.store.transact(`${on ? 'Freeze' : 'Thaw'} ${l.name}${every ? ' in every viewport' : ''}`, (tx) => tx.put({ ...sheet, viewports }))
	}

	// drag a row to change what draws on top: the list is in drawing order, so the first row gets the lowest order
	const dr = new DragReorder((id, targetId, after) => {
		const list = all.filter((l) => l.id !== id), moved = all.find((l) => l.id === id)!
		list.splice(list.findIndex((l) => l.id === targetId) + (after ? 1 : 0), 0, moved)
		const changed = list.flatMap((l, i) => { const order = (i + 1) * 10; return order === l.order ? [] : [record(l, { order })] })
		if (changed.length) put(`Move layer ${moved.name}`, ...changed)
	}, (id) => all.findIndex((l) => l.id === id))
</script>

<SideSection key="layers" title="Layers">
{#snippet actions()}<button title="A new layer of this project (at the end of the list: drawn on top; drag to move it)" onclick={() => (adding = true)}>+ Layer</button>{/snippet}
{#if all.length > 16}<input class="search" placeholder="Find a layer" bind:value={q} />{/if}
{#if vp}<p class="note">👁 hides on screen · ❄ = frozen in this viewport (prints) · Shift = every viewport on the sheet</p>{/if}
{#each rows as l (l.id)}
	{@const n = counts.get(l.id) ?? 0}
	{@const off = ws.layers.hidden.has(l.id)}
	{@const locked = ws.layers.locked.has(l.id)}
	<div class="row" class:cur={(ws.layers.current ?? 'sys:drawing') === l.id} class:off {...dr.row(l.id)} class:drag-before={dr.isBefore(l.id)} class:drag-after={dr.isAfter(l.id)}>
		<!-- a square = a color set on the layer (applied to its items); a round dot = the default, the color its items
		     already draw in (not forced on them). cad's color picker, as in Properties; its By layer = back to the default -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span class="sw" class:dflt={!l.color} title={l.color ? 'Layer color: its items draw in it (unless they have their own) — By layer (or right-click) goes back to the default'
			: l.look ? 'Default color: how its items draw now — click to set a layer color' : 'No color — click to set one'}
			oncontextmenu={(e) => { e.preventDefault(); if (l.color) setColour(l, undefined) }}>
			<ColorPick compact value={l.color ?? l.look} allowByLayer title="{l.name}: layer color" onchange={(v) => { if (v !== l.color) setColour(l, v) }} />
		</span>
		{#if renaming === l.id}
			<NameInput wide value={l.name} title="Layer name" onsave={(t) => { renaming = null; put(`Rename layer ${l.name}`, record(l, { name: t })) }} oncancel={() => (renaming = null)} />
		{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<span class="nm"
			title={[l.name, canBeCurrent(l) ? 'click: make it the current layer (new lines go here)' : '', l.system ? '' : '✎: rename'].filter(Boolean).join(' — ')}
			onclick={() => { if (canBeCurrent(l)) ws.layers.setCurrent(l.id === 'sys:drawing' ? null : l.id) }}>{l.name}</span>
		{/if}
		{#if !l.system}
			<button class="ic ren" title="Rename this layer" onclick={() => rename(l)}><Icon name="edit" size={11} /></button>
			<button class="ic" title={n ? `Has ${n} item${n === 1 ? '' : 's'} — move them first` : 'Delete this layer'} onclick={() => remove(l)}><Icon name="trash" size={11} /></button>
		{/if}
		<span class="ct">{n || ''}</span>
		<button class="ic ln" class:on={styling === l.id} title="Line type and lineweight of this layer: {DASH_NAMES[l.dash ?? ''] ?? l.dash}, {l.weightMm ? `${l.weightMm} mm` : 'default weight'} (its items use them unless they set their own)"
			onclick={() => (styling = styling === l.id ? null : l.id)}>
			<svg width="14" height="8" viewBox="0 0 14 8"><line x1="0" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width={l.weightMm ? Math.min(3, Math.max(0.75, l.weightMm * 3)) : 1} stroke-dasharray={SAMPLE[l.dash ?? '']} /></svg>
		</button>
		{#if vp}
			<button class="ic" class:on={vp.frozen?.includes(l.id)} title="Freeze in this viewport (Shift: every viewport on the sheet)" onclick={(e) => freeze(l, e.shiftKey)}><Icon name="snowflake" size={12} /></button>
		{/if}
		<button class="ic" title={off ? 'Show (only for you)' : 'Hide (only for you)'} onclick={() => hide(l)}><Icon name={off ? 'eyeSlash' : 'eye'} size={12} /></button>
		<button class="ic" class:on={locked} title={locked ? 'Unlock' : 'Lock: still drawn and snapped to, but can’t be picked (only for you)'} onclick={() => lock(l)}><Icon name={locked ? 'lock' : 'lockOpen'} size={12} /></button>
	</div>
	{#if styling === l.id}
		<div class="sub">
			<select title="Line type of this layer's items (unless they set their own)" aria-label="{l.name}: line type" value={l.dash ?? ''} onchange={(e) => put(`${l.name} line type`, record(l, { dash: e.currentTarget.value || undefined }))}>
				{#each ['', ...DASHES] as d (d)}<option value={d}>{DASH_NAMES[d]}</option>{/each}
			</select>
			<select title="Lineweight of this layer's items on paper (unless they set their own) — prints as set" aria-label="{l.name}: lineweight" value={String(l.weightMm ?? 0)} onchange={(e) => put(`${l.name} lineweight`, record(l, { weightMm: Number(e.currentTarget.value) || undefined }))}>
				<option value="0">Default weight</option>
				{#each WEIGHTS as w (w)}<option value={String(w)}>{w} mm</option>{/each}
			</select>
		</div>
	{/if}
{/each}
{#if adding}<div class="row new"><NameInput wide placeholder="New layer name — Enter adds it" onsave={add} oncancel={() => (adding = false)} /></div>{/if}
</SideSection>

<style>
	.search { width: 100%; margin-bottom: 0.25rem; padding: 1px 4px; font-size: 12px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
	.note { padding: 0 0.25rem 0.25rem; font-size: 10px; color: var(--cad-faint); }
	.row { display: flex; align-items: center; gap: 1px; padding: 0 2px; font-size: 12px; border-radius: 3px; }
	/* the current layer is highlighted like the open level in LEVELS */
	.row.cur { background: var(--cad-sel); }
	.nm { flex: 1; min-width: 0; }
	.row.drag-before { box-shadow: inset 0 2px 0 var(--cad-link); }
	.row.drag-after { box-shadow: inset 0 -2px 0 var(--cad-link); }
	.row:not(.cur):hover { background: var(--cad-hover); }
	.off .nm { color: var(--cad-faint); text-decoration: line-through; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
	.ct { font-size: 10px; color: var(--cad-faint); min-width: 1.1rem; text-align: right; }
	.sw { flex: none; display: inline-flex; line-height: 0; margin-right: 3px; }
	.sw :global(.cp-btn .sw) { width: 0.75rem; height: 0.75rem; border-radius: 2px; }
	.sw.dflt :global(.cp-btn .sw) { border-radius: 50%; transform: scale(0.85); }
	.ic { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; min-height: 20px; padding: 0; color: var(--cad-faint); border-radius: 3px; }
	.ic:hover { color: var(--cad-text); background: var(--cad-hover); }
	.ic.on { color: var(--cad-link); }
	/* ✎: on hover, and on the current layer's row or one with the focus (keyboard); always on a touch screen */
	.ren { visibility: hidden; }
	.row:hover .ren, .row:focus-within .ren, .row.cur .ren { visibility: visible; }
	@media (hover: none) { .ren { visibility: visible; } }
	.sub { display: flex; gap: 0.25rem; padding: 1px 2px 3px 1.1rem; }
	.sub select { flex: 1; min-width: 0; font-size: 11px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
</style>
