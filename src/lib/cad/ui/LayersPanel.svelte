<!-- The layers list (docs/plan/layers.md) in drawing order: the first row (Floorplans) draws at the bottom. The eye and lock are the user's own (this browser, this
     project — nobody else's view changes); the color, name and order are the project's (undoable). With a viewport
     picked on a sheet (or edited inside), the eye is THAT viewport's (User 2026-10-13: apart from the model's eye;
     stored on the sheet, so it prints and everyone sees it); Shift = every viewport on the sheet. Several viewports
     picked: one eye for all of them, half-shown where they differ; layers none of them draws are folded away (User 2026-10-14). On a sheet with no
     viewport picked, the eye is the sheet's own (its paper notes and legends; stored too) — a sheet prints as it shows; layers its paper doesn't draw on are folded away the same way (User 2026-10-20). Click a name to make it the current layer (highlighted like the open level), where new lines go.
     Ctrl-click / Shift-click names to pick several: the eye, lock, color and line type then change all of them (one undo
     step). Layers sit under group headings (a group field, or a name like "IDF1/Outlets"); a group's eye hides its layers.
     Presets save the eye states under a name (this browser, this project); with a viewport picked they set its layers. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Id } from '../domain/types'
	import type { Layer, Sheet } from '../domain/drawing'
	import { layersOf, layerOf, nextLayerColour, freezeInExisting, groupLayers, targetIds, togglePick, rangePick, type LayerInfo } from '../domain/layers'
	import { layerCounts } from '../views/layers'
	import { viewportLayers, paperLayers } from '../views/sheet'
	import { newId } from '../domain/ids'
	import { DASHES, WEIGHTS } from '../views/display'
	import { Icon, DragReorder } from '$lib'
	import SideSection from './SideSection.svelte'
	import ColorPick from './ColorPick.svelte'
	import NameInput from './NameInput.svelte'

	let { project, ws, sheetId }: {
		project: CadProject; ws: Workspace
		/** The sheet the active pane shows (none = a model view): the eyes are its own then. */
		sheetId?: string
	} = $props()

	let q = $state('')
	const all = $derived(layersOf(project.index.layers))
	const found = $derived(q.trim() ? all.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())) : all)
	// Ctrl / Shift-clicked names: a change to one of them is made to all of them
	let picked = $state.raw<ReadonlySet<Id>>(new Set()), anchor: Id | null = null
	const targets = (l: LayerInfo): LayerInfo[] => { const ids = new Set(targetIds(picked, l.id)); return all.filter((x) => ids.has(x.id)) }
	/** A name click with Ctrl / Shift picks (true); a plain click clears the picks and goes on to make it current. */
	function pick(l: LayerInfo, e: MouseEvent): boolean {
		if (e.shiftKey) picked = rangePick(flat, anchor, l.id)
		else if (e.ctrlKey || e.metaKey) { picked = togglePick(picked, l.id); anchor = l.id }
		else { if (picked.size) picked = new Set(); anchor = l.id; return false }
		return true
	}
	const counts = $derived(layerCounts(project.dataIndex))   // final changes only: not recounted on each frame of a drag
	// the picked viewports — or the one being edited inside: the eyes are theirs then (stored, what prints)
	const sheet = $derived(ws.vpEdit ? project.index.getOf('sheet', ws.vpEdit.sheetId) : ws.viewportId && ws.selection.length === 1 ? project.index.getOf('sheet', ws.selection[0]) : undefined)
	const vps = $derived(sheet?.type === 'sheet' ? (ws.vpEdit ? [ws.vpEdit.vpId] : ws.pickedViewports).flatMap((id) => sheet.viewports.filter((v) => v.id === id)) : [])
	const vp = $derived(vps[0])
	// the sheet the active pane shows, when no viewport is picked: its own paper's layers
	const paper = $derived(!vp && sheetId ? project.index.getOf('sheet', sheetId) : undefined)
	const onPaper = $derived(paper?.type === 'sheet' ? paper : undefined)
	// what the picked viewports draw on — or, none picked, the sheet's own paper (final changes only, with the look the
	// sheet draws in)
	const inViews = $derived.by(() => {
		if (onPaper) return paperLayers(project.dataIndex, onPaper, { blocks: project.blockOf })
		if (!vps.length || sheet?.type !== 'sheet') return null
		const o = { underlay: project.pdf.placement, blocks: project.blockOf, ...project.sheetBase, routes: project.routes, fills: project.fills, cords: project.settings?.cordRoute, gray: !!project.settings?.grayFloorplans }
		const out = new Set<Id>()
		for (const v of vps) for (const id of viewportLayers(project.dataIndex, sheet, v, o)) out.add(id)
		return out
	})
	// with viewports picked (or the paper), the layers none of them draws are folded under "Not in these views" (still
	// settable there) — User 2026-10-20: the paper's eye showed a layer frozen in its viewport as shown
	let showIdle = $state(false)
	const rows = $derived(inViews ? found.filter((l) => inViews.has(l.id)) : found)
	const idle = $derived(inViews ? found.filter((l) => !inViews.has(l.id)) : [])
	const groups = $derived(groupLayers(rows))
	const flat = $derived([...groups.flatMap((g) => g.layers.map((l) => l.id)), ...(showIdle ? idle.map((l) => l.id) : [])])   // the order on screen, for Shift-click ranges
	/** Where the eye points, for the titles and the note. */
	const eyeOf = $derived(vps.length > 1 ? `in the ${vps.length} picked viewports (Shift: every viewport on the sheet)` : vp ? 'in this viewport (Shift: every viewport on the sheet)' : onPaper ? 'on this sheet’s paper (its own notes; not in viewports)' : '(only for you)')
	/** Any layer can be current (User: clicking a name did nothing on most); new lines go on it. */
	const canBeCurrent = (_l: LayerInfo) => true

	/** The layer's record with a change (a system layer gets one the first time it's restyled). */
	const record = (l: LayerInfo, change: Partial<Layer>): Layer => {
		const next: Layer = { ...(project.index.getOf('layer', l.id) ?? { type: 'layer', id: l.id, name: l.name, order: l.order }), ...change }
		if (!next.color) delete next.color
		if (!next.weightMm) delete next.weightMm
		if (!next.dash) delete next.dash
		if (!next.group) delete next.group
		return next
	}
	const put = (label: string, ...ls: Layer[]) => project.store.transact(label, (tx) => ls.forEach((l) => tx.put(l)))

	// names are typed in the list (User 2026-10-12): "+ Layer" opens a name box at the end, ✎ swaps a name for one
	let adding = $state(false), renaming = $state<string | null>(null)
	function add(name: string): void {
		adding = false
		const order = Math.max(0, ...all.map((l) => l.order)) + 10, id = newId()
		// it starts hidden in the drawings that already exist (User): they don't change when something is drawn on it
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
	const many = (ls: LayerInfo[], what: string) => (ls.length > 1 ? `${ls.length} layers ${what}` : `${ls[0].name} ${what}`)
	const setColour = (l: LayerInfo, color: string | undefined) => { const ls = targets(l); put(many(ls, 'color'), ...ls.map((x) => record(x, { color }))) }
	const restyle = (l: LayerInfo, what: string, change: Partial<Layer>) => { const ls = targets(l); put(many(ls, what), ...ls.map((x) => record(x, change))) }
	// a group heading: the picked layers go under it; "-" takes them out
	let grouping = $state(false)
	function setGroup(name: string): void {
		grouping = false
		const ls = all.filter((l) => picked.has(l.id)), group = name.trim() === '-' ? undefined : name.trim()
		if (ls.length) put(group ? `Group ${ls.length} layers as ${group}` : `Ungroup ${ls.length} layers`, ...ls.map((x) => record(x, { group })))
	}
	// the layer's line type and lineweight (backlog "Layer line type and lineweight"): its items without their own use them
	let styling = $state<Id | null>(null)
	const DASH_NAMES: Record<string, string> = { '': 'Solid', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' }
	const SAMPLE: Record<string, string | undefined> = { dashed: '4 2', dotted: '1 2', dashdot: '5 2 1 2' }

	// hiding or locking a layer lets go of its selected items (Delete / Properties mustn't act on what you can't see
	// or have locked); showing / unlocking leaves the selection alone
	function letGo(ids: Id[]): void {
		const known = new Set(all.map((l) => l.id)), gone = new Set(ids)
		const keep = ws.selection.filter((s) => { const e = project.index.get(s); const on = e && layerOf(e, known); return !on || !gone.has(on) })
		if (keep.length !== ws.selection.length) ws.select(keep)
	}
	/** Where the eye points — the picked viewports, the open sheet's paper, else you in the model: is the layer shown
	 *  there, hidden, or (several viewports that differ) mixed? */
	const eyeState = (id: Id): 'on' | 'off' | 'mixed' => {
		if (!vps.length) return (onPaper ? !!onPaper.frozen?.includes(id) : ws.layers.hidden.has(id)) ? 'off' : 'on'
		const n = vps.filter((v) => v.frozen?.includes(id)).length
		return n === 0 ? 'on' : n === vps.length ? 'off' : 'mixed'
	}
	const isOff = (id: Id) => eyeState(id) === 'off'
	/** The eye on one layer — or all the picked ones: shown → hide; hidden or mixed → show (in all the picked viewports). */
	function hide(l: LayerInfo, every: boolean): void { setEye(targets(l).map((x) => x.id), eyeState(l.id) === 'on', every) }
	function lock(l: LayerInfo): void { const ids = targets(l).map((x) => x.id), on = !ws.layers.locked.has(l.id); ws.layers.setLocked(ids, on); if (on) letGo(ids) }
	function setEye(ids: Id[], off: boolean, every = false): void {
		if (vps.length && sheet) setInViewport(sheet, vps.map((v) => v.id), ids, off, every)
		else if (onPaper) setOnPaper(onPaper, ids, off)
		else ws.layers.setHidden(ids, off)
		if (off) letGo(ids)
	}
	/** A group's eye: all hidden → show them all; otherwise hide them all. */
	const groupOff = (ls: LayerInfo[]) => ls.every((l) => isOff(l.id))
	// presets: the eye states under a name
	let savingPreset = $state(false), preset = $state('')
	// with viewports picked, a preset sets their layers (saving takes them from the first)
	const vpWord = $derived(vps.length > 1 ? `the ${vps.length} viewports` : 'the viewport')
	function applyPreset(name: string): void {
		preset = name
		if (!name) return
		const p = ws.layers.presets.find((x) => x.name === name)
		if (vps.length && sheet && p) {
			const known = new Set(all.map((l) => l.id)), hidden = p.hidden.filter((id) => known.has(id)), on = new Set(vps.map((v) => v.id))
			project.store.transact(`Layers ${name} in ${vpWord}`, (tx) => tx.put({ ...sheet, viewports: sheet.viewports.map((v) => (on.has(v.id) ? { ...v, frozen: hidden.length ? hidden : undefined } : v)) }))
			letGo(hidden)
		} else letGo(ws.layers.applyPreset(name))
		ws.say(`Layers: ${name}${vps.length ? ` in ${vpWord}` : ''}`)
	}
	function savePreset(name: string): void {
		savingPreset = false
		ws.layers.savePreset(name, vp ? (vp.frozen ?? []) : undefined)
		preset = name
		ws.say(`Preset ${name} saved (the layers shown ${vps.length > 1 ? 'in the first picked viewport' : vp ? 'in the viewport' : 'now'})`)
	}
	function deletePreset(): void { ws.layers.deletePreset(preset); preset = '' }

	/** A stored hidden list with these layers hidden / shown (none left = no list). */
	const withHidden = (frozen: Id[] = [], ids: Id[], off: boolean) => { const next = off ? [...new Set([...frozen, ...ids])] : frozen.filter((x) => !ids.includes(x)); return next.length ? next : undefined }
	const named = (ids: Id[]) => (ids.length === 1 ? (all.find((l) => l.id === ids[0])?.name ?? 'layer') : `${ids.length} layers`)
	/** Hide / show layers in the picked viewports (every = all the sheet's): stored on the sheet, one undo step. */
	function setInViewport(sheet: Sheet, vpIds: Id[], ids: Id[], off: boolean, every: boolean): void {
		const on = new Set(vpIds)
		const viewports = sheet.viewports.map((v) => (every || on.has(v.id) ? { ...v, frozen: withHidden(v.frozen, ids, off) } : v))
		project.store.transact(`${off ? 'Hide' : 'Show'} ${named(ids)} in ${every ? 'every viewport' : vpWord}`, (tx) => tx.put({ ...sheet, viewports }))
	}
	/** Hide / show layers on a sheet's own paper (its notes and legends): stored, one undo step. */
	function setOnPaper(sheet: Sheet, ids: Id[], off: boolean): void {
		const next: Sheet = { ...sheet, frozen: withHidden(sheet.frozen, ids, off) }
		if (!next.frozen) delete next.frozen
		project.store.transact(`${off ? 'Hide' : 'Show'} ${named(ids)} on the sheet`, (tx) => tx.put(next))
	}

	// drag a row to change what draws on top: the list is in drawing order, so the first row gets the lowest order
	const dr = new DragReorder((id, targetId, after) => {
		const list = all.filter((l) => l.id !== id), moved = all.find((l) => l.id === id)!
		list.splice(list.findIndex((l) => l.id === targetId) + (after ? 1 : 0), 0, moved)
		const changed = list.flatMap((l, i) => { const order = (i + 1) * 10; return order === l.order ? [] : [record(l, { order })] })
		if (changed.length) put(`Move layer ${moved.name}`, ...changed)
	}, (id) => all.findIndex((l) => l.id === id))
</script>

{#snippet layerRow(l: LayerInfo, ing: boolean)}
	{@const n = counts.get(l.id) ?? 0}
	{@const eye = eyeState(l.id)}
	{@const off = eye === 'off'}
	{@const locked = ws.layers.locked.has(l.id)}
	<div class="row" class:cur={(ws.layers.current ?? 'sys:drawing') === l.id} class:pick={picked.has(l.id)} class:ing={ing} class:off {...dr.row(l.id)} class:drag-before={dr.isBefore(l.id)} class:drag-after={dr.isAfter(l.id)}>
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
			title={[l.name, canBeCurrent(l) ? 'click: make it the current layer (new lines go here) · Ctrl / Shift-click: pick several' : '', l.system ? '' : '✎: rename'].filter(Boolean).join(' — ')}
			onclick={(e) => { if (!pick(l, e) && canBeCurrent(l)) ws.layers.setCurrent(l.id === 'sys:drawing' ? null : l.id) }}>{l.name}</span>
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
		<button class="ic" class:mixed={eye === 'mixed'} title="{eye === 'mixed' ? 'Shown in some — click: show' : off ? 'Show' : 'Hide'} {eyeOf}" onclick={(e) => hide(l, e.shiftKey)}><Icon name={off ? 'eyeSlash' : 'eye'} size={12} /></button>
		<button class="ic" class:on={locked} title={locked ? 'Unlock' : 'Lock: still drawn and snapped to, but can’t be picked (only for you)'} onclick={() => lock(l)}><Icon name={locked ? 'lock' : 'lockOpen'} size={12} /></button>
	</div>
	{#if styling === l.id}
		<div class="sub">
			<select title="Line type of this layer's items (unless they set their own)" aria-label="{l.name}: line type" value={l.dash ?? ''} onchange={(e) => restyle(l, 'line type', { dash: e.currentTarget.value || undefined })}>
				{#each ['', ...DASHES] as d (d)}<option value={d}>{DASH_NAMES[d]}</option>{/each}
			</select>
			<select title="Lineweight of this layer's items on paper (unless they set their own) — prints as set" aria-label="{l.name}: lineweight" value={String(l.weightMm ?? 0)} onchange={(e) => restyle(l, 'lineweight', { weightMm: Number(e.currentTarget.value) || undefined })}>
				<option value="0">Default weight</option>
				{#each WEIGHTS as w (w)}<option value={String(w)}>{w} mm</option>{/each}
			</select>
		</div>
	{/if}
{/snippet}

<SideSection key="layers" title="Layers">
<!-- + Layer beside the Find box (User 2026-10-20), not on a line of its own above it -->
<div class="find">
	{#if all.length > 16}<input class="search" placeholder="Find a layer" bind:value={q} />{/if}
	<button class="btn" title="A new layer of this project (at the end of the list: drawn on top; drag to move it)" onclick={() => (adding = true)}>+ Layer</button>
</div>
{#if vps.length > 1}<p class="note">👁 = shown in the {vps.length} picked viewports (half: in some) · Shift = every viewport on the sheet</p>
{:else if vp}<p class="note">👁 = shown in this viewport (prints; apart from the model) · Shift = every viewport on the sheet</p>
{:else if onPaper}<p class="note">👁 = shown on this sheet’s paper (its own notes; prints) — pick a viewport for its layers</p>{/if}
<div class="presets">
	{#if savingPreset}<NameInput wide create placeholder="Preset name — Enter saves the layers shown now" onsave={savePreset} oncancel={() => (savingPreset = false)} />
	{:else}
		<select title="Presets: sets of shown layers saved under a name (for you, in this project)" aria-label="Layer preset" value={preset} onchange={(e) => applyPreset(e.currentTarget.value)}>
			<option value="">Presets…</option>
			{#each ws.layers.presets as p (p.name)}<option value={p.name}>{p.name}</option>{/each}
		</select>
		<button class="ic" title="Save the layers shown now as a preset" onclick={() => (savingPreset = true)}><Icon name="plus" size={12} /></button>
		{#if preset}<button class="ic" title="Delete the preset {preset}" onclick={deletePreset}><Icon name="trash" size={11} /></button>{/if}
	{/if}
</div>
{#if picked.size > 1}
	<div class="presets">
		<span class="nm">{picked.size} layers picked</span>
		{#if grouping}<NameInput wide create placeholder="Group name ( - = none)" onsave={setGroup} oncancel={() => (grouping = false)} />
		{:else}<button class="btn" title="File the picked layers under a heading" onclick={() => (grouping = true)}>Group…</button>{/if}
		<button class="btn" onclick={() => (picked = new Set())}>Clear</button>
	</div>
{/if}
{#each groups as g (g.name ?? '')}
	{#if g.name}
		<div class="row grp" title="A group: its eye hides or shows all {g.layers.length} layers">
			<span class="nm">{g.name}</span>
			<span class="ct">{g.layers.length}</span>
			<button class="ic" title="{groupOff(g.layers) ? 'Show' : 'Hide'} the group {eyeOf}" onclick={(e) => setEye(g.layers.map((l) => l.id), !groupOff(g.layers), e.shiftKey)}><Icon name={groupOff(g.layers) ? 'eyeSlash' : 'eye'} size={12} /></button>
		</div>
	{/if}
{#each g.layers as l (l.id)}{@render layerRow(l, !!g.name)}{/each}
{/each}
{#if idle.length}
	<button class="row grp idle" title="Layers {onPaper ? 'the sheet’s paper' : 'none of the picked viewports'} draws anything on — set here too (e.g. hide one before drawing on it)" onclick={() => (showIdle = !showIdle)}>
		<span class="nm">{showIdle ? '▾' : '▸'} Not {onPaper ? 'on this paper' : `in ${vps.length > 1 ? 'these views' : 'this view'}`}</span><span class="ct">{idle.length}</span>
	</button>
	{#if showIdle}{#each idle as l (l.id)}{@render layerRow(l, true)}{/each}{/if}
{/if}
{#if adding}<div class="row new"><NameInput wide placeholder="New layer name — Enter adds it" onsave={add} oncancel={() => (adding = false)} /></div>{/if}
</SideSection>

<style>
	.find { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-bottom: 0.25rem; padding-right: 0.25rem; }
	.search { flex: 1; min-width: 0; padding: 1px 4px; font-size: 12px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
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
	/* several viewports picked that differ: shown in some */
	.ic.mixed { opacity: 0.45; }
	.row.idle { width: 100%; text-align: left; color: var(--cad-faint); }
	/* ✎: on hover, and on the current layer's row or one with the focus (keyboard); always on a touch screen */
	.ren { visibility: hidden; }
	.row:hover .ren, .row:focus-within .ren, .row.cur .ren { visibility: visible; }
	@media (hover: none) { .ren { visibility: visible; } }
	.presets { display: flex; align-items: center; gap: 2px; padding: 0 2px 3px; font-size: 12px; }
	.presets select { flex: 1; min-width: 0; font-size: 11px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
	.btn { padding: 0 6px; font-size: 11px; border: 1px solid var(--cad-line); border-radius: 3px; background: var(--cad-input); color: var(--cad-text); }
	.row.pick { box-shadow: inset 2px 0 0 var(--cad-link); background: var(--cad-hover); }
	.row.grp { font-weight: 600; color: var(--cad-muted, #71717a); margin-top: 3px; }
	.row.ing { padding-left: 10px; }
	.sub { display: flex; gap: 0.25rem; padding: 1px 2px 3px 1.1rem; }
	.sub select { flex: 1; min-width: 0; font-size: 11px; border: 1px solid var(--cad-line); background: var(--cad-input); color: var(--cad-text); border-radius: 3px; }
</style>
