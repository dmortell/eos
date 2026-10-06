<!-- The layers list (docs/plan/layers.md) in drawing order: the first row (Floorplans) draws at the bottom. The eye and lock are the user's own (this browser, this
     project — nobody else's view changes); the colour, name and order are the project's (undoable). With a viewport
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
	import { Icon, DragReorder } from '$lib'
	import SideSection from './SideSection.svelte'

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
		return next
	}
	const put = (label: string, ...ls: Layer[]) => project.store.transact(label, (tx) => ls.forEach((l) => tx.put(l)))

	function add(): void {
		ws.askText('New layer name', '', (t) => {
			const name = t.trim()
			if (!name) return
			const order = Math.max(0, ...all.map((l) => l.order)) + 10, id = newId()
			// it starts hidden in the drawings that already exist (Dave): they don't change when something is drawn on it
			const sheets = freezeInExisting(project.store.ofType('sheet'), id)
			project.store.transact(`Add layer ${name}`, (tx) => { tx.put({ type: 'layer', id, name, order, color: nextLayerColour(project.index.layers) }); for (const s of sheets) tx.put(s) })
			if (sheets.length) ws.say(`Layer ${name} added — hidden in the viewports of the ${sheets.length} existing sheet${sheets.length === 1 ? '' : 's'} (show it per viewport)`)
		})
	}
	function rename(l: LayerInfo): void {
		if (l.system) return
		ws.askText('Layer name', l.name, (t) => { if (t.trim() && t.trim() !== l.name) put(`Rename layer ${l.name}`, record(l, { name: t.trim() })) })
	}
	function remove(l: LayerInfo): void {
		const n = counts.get(l.id) ?? 0
		if (n) { ws.say(`${l.name} has ${n} item${n === 1 ? '' : 's'} — move them to another layer first (Properties → Layer)`); return }
		project.store.transact(`Delete layer ${l.name}`, (tx) => tx.del(l.id))
		ws.layers.forget(l.id)
	}
	const setColour = (l: LayerInfo, color: string | undefined) => put(`${l.name} color`, record(l, { color }))

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
{#snippet actions()}<button title="A new layer of this project (at the end of the list: drawn on top; drag to move it)" onclick={add}>+ Layer</button>{/snippet}
{#if all.length > 16}<input class="search" placeholder="Find a layer" bind:value={q} />{/if}
{#if vp}<p class="note">👁 hides on screen · ❄ = frozen in this viewport (prints) · Shift = every viewport on the sheet</p>{/if}
{#each rows as l (l.id)}
	{@const n = counts.get(l.id) ?? 0}
	{@const off = ws.layers.hidden.has(l.id)}
	{@const locked = ws.layers.locked.has(l.id)}
	<div class="row" class:cur={(ws.layers.current ?? 'sys:drawing') === l.id} class:off {...dr.row(l.id)} class:drag-before={dr.isBefore(l.id)} class:drag-after={dr.isAfter(l.id)}>
		<!-- a square = a colour set on the layer (applied to its items); a round dot = the default, the colour its items
		     already draw in (not forced on them) -->
		<label class="sw" title={l.color ? 'Layer color: its items draw in it (unless they have their own) — right-click to go back to the default'
			: l.look ? 'Default color: how its items draw now — click to set a layer color' : 'No color — click to set one'}
			oncontextmenu={(e) => { e.preventDefault(); if (l.color) setColour(l, undefined) }}>
			<input type="color" value={l.color ?? l.look ?? '#888888'} onchange={(e) => setColour(l, (e.currentTarget as HTMLInputElement).value)} />
			<span style:background={l.color ?? l.look ?? 'transparent'} class:none={!l.color && !l.look} class:dflt={!l.color}></span>
		</label>
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<span class="nm"
			title={[l.name, canBeCurrent(l) ? 'click: make it the current layer (new lines go here)' : '', l.system ? '' : 'double-click: rename'].filter(Boolean).join(' — ')}
			onclick={() => { if (canBeCurrent(l)) ws.layers.setCurrent(l.id === 'sys:drawing' ? null : l.id) }} ondblclick={() => rename(l)}>{l.name}</span>
		{#if !l.system}
			<button class="ic" title={n ? `Has ${n} item${n === 1 ? '' : 's'} — move them first` : 'Delete this layer'} onclick={() => remove(l)}><Icon name="trash" size={11} /></button>
		{/if}
		<span class="ct">{n || ''}</span>
		{#if vp}
			<button class="ic" class:on={vp.frozen?.includes(l.id)} title="Freeze in this viewport (Shift: every viewport on the sheet)" onclick={(e) => freeze(l, e.shiftKey)}><Icon name="snowflake" size={12} /></button>
		{/if}
		<button class="ic" title={off ? 'Show (only for you)' : 'Hide (only for you)'} onclick={() => hide(l)}><Icon name={off ? 'eyeSlash' : 'eye'} size={12} /></button>
		<button class="ic" class:on={locked} title={locked ? 'Unlock' : 'Lock: still drawn and snapped to, but can’t be picked (only for you)'} onclick={() => lock(l)}><Icon name={locked ? 'lock' : 'lockOpen'} size={12} /></button>
	</div>
{/each}
</SideSection>

<style>
	.search { width: 100%; margin-bottom: 0.25rem; padding: 1px 4px; font-size: 12px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
	.note { padding: 0 0.25rem 0.25rem; font-size: 10px; color: var(--cad-faint); }
	.row { display: flex; align-items: center; gap: 0.2rem; padding: 0 2px; font-size: 12px; border-radius: 3px; }
	/* the current layer is highlighted like the open level in LEVELS */
	.row.cur { background: var(--cad-sel); }
	.nm { flex: 1; min-width: 0; }
	.row.drag-before { box-shadow: inset 0 2px 0 var(--cad-link); }
	.row.drag-after { box-shadow: inset 0 -2px 0 var(--cad-link); }
	.row:not(.cur):hover { background: var(--cad-hover); }
	.off .nm { color: var(--cad-faint); text-decoration: line-through; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
	.ct { font-size: 10px; color: var(--cad-faint); min-width: 1.1rem; text-align: right; }
	.sw { flex: none; position: relative; width: 0.75rem; height: 0.75rem; cursor: pointer; }
	.sw input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
	.sw span { display: block; width: 100%; height: 100%; border-radius: 2px; border: 1px solid var(--cad-line); }
	.sw span.dflt { border-radius: 50%; transform: scale(0.8); border: none; }
	.sw span.none { background: repeating-linear-gradient(45deg, transparent 0 2px, var(--cad-line) 2px 3px) !important; }
	.ic { display: inline-flex; padding: 1px; color: var(--cad-faint); border-radius: 2px; }
	.ic:hover { color: var(--cad-text); }
	.ic.on { color: var(--cad-link); }
</style>
