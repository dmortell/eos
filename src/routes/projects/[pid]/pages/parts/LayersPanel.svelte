<script lang="ts">
	// Right-sidebar LAYERS panel — R5: ONE grouped list, the focused model's own `layers` (its object
	// layers under "Model" plus its Background / annotation / outlet / trunk layers), so eye/lock/colour/
	// order/active drive both the model objects and the entities on the canvas. View-Preset picker +
	// search, per-layer eye/lock/colour and a settings dialog. Mutations go straight onto the model's
	// reactive list (layers.svelte.ts helpers).
	import { Icon, ColorPicker, DragReorder, listClick, selBlock } from '$lib'
	import { COLORS } from '../palette'
	import { type Layer, layerUI, layerGroup, layerGroups, addLayer, removeLayer, moveLayer,
		presets, presetUI, applyPreset, savePreset, updatePreset, renamePreset, deletePreset, presetMatches } from '../layers.svelte'
	import { tick } from 'svelte'
	import { LINEWEIGHTS, lwLabel, resolveLw } from '../ui/lineweight'
	function focusEdit(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }
	// VP Freeze (AutoCAD): `frozen` is the ACTIVE sheet frame's frozen layer ids — null when no frame is active
	// (model space / paper), which hides the column. `onfreeze` toggles one layer in that frame only.
	// J1 VP Lock: `vpLocked` (the active frame's locked layer ids; null = no frame active) + `onvplock` — the same idea.
	let { layers = [], frozen = null, onfreeze, vpLocked = null, onvplock, countOf, ondelete, onpick }: { layers?: Layer[]; frozen?: string[] | null; onfreeze?: (id: string) => void
		/** Pick a shape → its layer becomes current (runs LAYMCUR). */ onpick?: () => void
		vpLocked?: string[] | null; onvplock?: (id: string) => void
		/** J2: how many shapes / model objects sit on a layer, and delete a layer WITH its items (one undo step). */
		countOf?: (id: string) => number; ondelete?: (id: string) => void } = $props()
	const swatchOf = (l: Layer) => l.swatch ?? 'color'

	let search = $state('')
	// View-preset manage menu + inline rename.
	let presetMenu = $state(false)
	let renamingPreset = $state<string | null>(null)
	const activePreset = $derived(presets.find((p) => p.id === presetUI.active))
	const modified = $derived(!!presetUI.active && !presetMatches(layers, presetUI.active))
	const matches = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())

	// Per-group collapse state (default open). Group visibility = all its layers visible.
	let openGroups = $state<Record<string, boolean>>({})
	const isOpen = (g: string) => openGroups[g] !== false
	const groupOn = (g: string) => layers.filter((l) => layerGroup(l) === g).every((l) => l.visible)
	function setGroup(g: string, on: boolean) { for (const l of layers) if (layerGroup(l) === g) l.visible = on }

	let editing = $state<string | null>(null)   // layer id being renamed
	function commit(e: KeyboardEvent) { if (e.key === 'Enter' || e.key === 'Escape') editing = null }

	// MULTI-SELECT ($lib listClick): Ctrl/⌘-click toggles a layer, Shift-click takes the range from the last one (in the
	// order shown); a plain click makes the layer active (and the only one selected). With several selected, the eye /
	// lock of any of them sets them all, dragging one moves them all, and the bar below the list shows / hides / locks /
	// colours / deletes them together.
	let selLayers = $state<string[]>([]), lAnchor: string | null = null
	const shownIds = $derived(layerGroups(layers).flatMap((g) => (isOpen(g) ? layers.filter((l) => layerGroup(l) === g && (matches(l.name) || matches(g))).map((l) => l.id) : [])))
	const inMulti = (id: string) => selLayers.length > 1 && selLayers.includes(id)
	const selObjs = () => layers.filter((l) => selLayers.includes(l.id))
	/** The layers an eye / lock click on `id` acts on: the selection when `id` is in it, else just `id`. */
	const actOn = (id: string) => (inMulti(id) ? selObjs() : layers.filter((l) => l.id === id))
	function rowClick(e: MouseEvent, id: string) {
		const r = listClick(shownIds, selLayers, lAnchor, id, e)
		selLayers = r.sel; lAnchor = r.anchor
		if (!r.multi) layerUI.active = id
	}
	function eyeClick(e: MouseEvent, l: Layer) {
		// the clicked row's NEW state applies to all of them: frozen in this viewport (paper), else visible everywhere
		if (frozen && !e.shiftKey) { const fz = !frozen.includes(l.id); for (const x of actOn(l.id)) if (frozen.includes(x.id) !== fz) onfreeze?.(x.id) }
		else { const on = !l.visible; for (const x of actOn(l.id)) x.visible = on }
	}
	function lockClick(l: Layer) { const on = !l.locked; for (const x of actOn(l.id)) x.locked = on }
	// bulk delete (the active layer stays — new shapes land on it); click-again when any holds items
	let bulkDelArm = $state(false)
	const bulkDelIds = $derived(selLayers.filter((id) => id !== layerUI.active))
	const bulkDelCount = $derived(countOf ? bulkDelIds.reduce((s, id) => s + countOf(id), 0) : 0)
	function bulkDelete() {
		if (!bulkDelIds.length) return
		if (bulkDelCount && !bulkDelArm) { bulkDelArm = true; return }
		for (const id of bulkDelIds) { if (ondelete) ondelete(id); else removeLayer(layers, id) }
		selLayers = selLayers.filter((id) => id === layerUI.active); bulkDelArm = false
	}

	// DRAG to reorder layers = change draw z-order (array position). Reusable $lib helper handles the DnD
	// state + direction-aware drop; `moveLayer` applies it — to the whole selection when a selected layer is dragged
	// (after the target: the last goes first, so each lands right after it and the block keeps its order).
	const dr = new DragReorder((id, t, after) => {
		const block = selBlock(layers.map((l) => l.id), selLayers, id); if (block.includes(t)) return
		for (const x of after ? [...block].reverse() : block) moveLayer(layers, x, t, after)
	}, (id) => layers.findIndex((l) => l.id === id))

	// Layer-settings dialog (opened from a layer's swatch button).
	let dlgId = $state<string | null>(null)
	let dlg = $derived(dlgId ? layers.find((l) => l.id === dlgId) : null)
	// J2: the active layer can't be deleted (new shapes land on it); a layer with items asks once more — then the
	// items go with it.
	let delConfirm = $state(false)
	const delCount = $derived(dlgId && countOf ? countOf(dlgId) : 0)
	$effect(() => { void dlgId; delConfirm = false })
	function del() {
		if (!dlgId || dlgId === layerUI.active) return
		if (delCount && !delConfirm) { delConfirm = true; return }
		if (ondelete) ondelete(dlgId); else removeLayer(layers, dlgId)
		dlgId = null
	}
</script>

<div class="lp">
	<div class="lp-head">
		<div class="lp-lbl">View Preset {#if modified}<span class="lp-mod" title="Layer visibility differs from the saved preset">• modified</span>{/if}</div>
		<div class="lp-preset">
			{#if renamingPreset}
				<input class="lp-rename" value={activePreset?.name ?? ''} use:focusEdit
					onblur={() => (renamingPreset = null)}
					onchange={(e) => renamePreset(renamingPreset!, (e.currentTarget as HTMLInputElement).value)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { renamePreset(renamingPreset!, (e.currentTarget as HTMLInputElement).value); renamingPreset = null } }} />
			{:else}
				<select value={presetUI.active} onchange={(e) => applyPreset(layers, (e.currentTarget as HTMLSelectElement).value)}>
					{#each presets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/if}
			<div class="lp-menuwrap">
				<button class="lp-kebab" title="Manage presets" aria-label="Manage presets" onclick={() => (presetMenu = !presetMenu)}>⋮</button>
				{#if presetMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="lp-menu-back" onclick={() => (presetMenu = false)}></div>
					<div class="lp-menu">
						<button onclick={() => { applyPreset(layers, presetUI.active); presetMenu = false }}>Re-apply</button>
						<button disabled={!modified} onclick={() => { updatePreset(layers, presetUI.active); presetMenu = false }}>Update ‹{activePreset?.name ?? '—'}›</button>
						<button onclick={() => { const p = savePreset(layers, 'New view'); presetMenu = false; renamingPreset = p.id }}>Save current as new…</button>
						<button onclick={() => { renamingPreset = presetUI.active; presetMenu = false }}>Rename…</button>
						<button class="danger" disabled={presets.length < 2} onclick={() => { deletePreset(presetUI.active); presetMenu = false }}>Delete</button>
					</div>
				{/if}
			</div>
		</div>
		<div class="lp-search">
			<Icon name="search" size={12} />
			<input placeholder="Search layers…" bind:value={search} />
			{#if onpick}<button class="lp-pick" title="Make a shape's layer current: click this, then click the shape (LAYMCUR)" aria-label="Pick a shape's layer" onclick={onpick}><Icon name="crosshair" size={12} /></button>{/if}
		</div>
	</div>

	<div class="lp-tree">
		{#each layerGroups(layers) as g (g)}
			{@const kids = layers.filter((l) => layerGroup(l) === g)}
			{#if matches(g) || kids.some((k) => matches(k.name))}
				<div class="lg-row">
					<button class="lg-chev" aria-label={isOpen(g) ? 'Collapse' : 'Expand'} onclick={() => (openGroups = { ...openGroups, [g]: !isOpen(g) })}>
						<Icon name={isOpen(g) ? 'chevronDown' : 'chevronRight'} size={12} />
					</button>
					<span class="lg-name">{g}</span>
					<button class="lp-mini" title="Add layer to {g}" aria-label="Add layer" onclick={() => { const l = addLayer(layers, g); openGroups = { ...openGroups, [g]: true }; editing = l.id }}><Icon name="plus" size={12} /></button>
					<button class="lp-check" class:on={groupOn(g)} aria-label="Toggle {g}" onclick={() => setGroup(g, !groupOn(g))}></button>
				</div>
				{#if isOpen(g)}
					{#each kids as l (l.id)}
						{#if matches(l.name) || matches(g)}
							{@const vpHidden = !!frozen?.includes(l.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
							<div class="ly-row" class:off={!l.visible} class:active={l.id === layerUI.active} class:multi={inMulti(l.id)}
								class:dragbefore={dr.isBefore(l.id)} class:dragafter={dr.isAfter(l.id)}
								title={inMulti(l.id) ? `${selLayers.length} layers selected — drag to move them together` : 'Drag to reorder (sets draw z-order) · Ctrl / Shift+click: select several'}
								{...dr.row(l.id)} onclick={(e) => rowClick(e, l.id)}>
								<!-- in a sheet viewport (paper) the eye hides the layer in THAT viewport only (VP Freeze) — hiding it
								     everywhere by accident is too easy; Shift+click hides it globally (Dave 2026-09-26) -->
								<button class="ly-eye" class:vp={!!frozen} aria-label="Show/hide {l.name}"
									title={frozen ? (vpHidden ? 'Show in this viewport' : 'Hide in this viewport only') + ' · Shift+click: ' + (l.visible ? 'hide everywhere' : 'show everywhere') : l.visible ? 'Hide' : 'Show'}
									onclick={(e) => { e.stopPropagation(); eyeClick(e, l) }}>
									<!-- hidden everywhere = crossed eye; frozen in this viewport only = a snowflake (VP Freeze — the eye does it now) -->
									<Icon name={!l.visible ? 'eyeSlash' : vpHidden ? 'snowflake' : 'eye'} size={13} />
								</button>
								<button class="ly-lock-btn" class:on={l.locked} aria-label="{l.locked ? 'Unlock' : 'Lock'} {l.name}" title="{l.locked ? 'Unlock' : 'Lock'} layer" onclick={(e) => { e.stopPropagation(); lockClick(l) }}>
									<Icon name={l.locked ? 'lock' : 'lockOpen'} size={12} />
								</button>
								{#if vpLocked}
									<!-- J1: lock the layer in the ACTIVE viewport only (still shown, can't be picked / edited there) -->
									<button class="ly-lock-btn vp" class:on={vpLocked.includes(l.id)} aria-label="{vpLocked.includes(l.id) ? 'Unlock' : 'Lock'} {l.name} in this viewport"
										title="{vpLocked.includes(l.id) ? 'Unlock' : 'Lock'} in the active viewport only (VP Lock)" onclick={(e) => { e.stopPropagation(); onvplock?.(l.id) }}>
										<Icon name={vpLocked.includes(l.id) ? 'lock' : 'lockOpen'} size={12} /><em>VP</em>
									</button>
								{/if}
								{#if editing === l.id}
									<input class="ly-edit" bind:value={l.name} use:focusEdit onblur={() => (editing = null)} onkeydown={commit} onclick={(e) => e.stopPropagation()} />
								{:else}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span class="ly-name" title="Click to make active · double-click to rename" ondblclick={() => (editing = l.id)}>{l.name}</span>
								{/if}
								{#if l.id === layerUI.active}<span class="ly-active" title="Active layer">●</span>{/if}
								<!-- a coloured button (with a line inside for line layers) → opens the settings dialog -->
								<button class="sw-btn" title="Layer settings" aria-label="Edit {l.name}" onclick={(e) => { e.stopPropagation(); dlgId = l.id }}
									style:background={swatchOf(l) === 'color' ? l.color : 'var(--input)'}>
									{#if swatchOf(l) === 'line'}<span class="sw-btn-line" style:border-bottom-color={l.color} style:border-bottom-style={l.dash} style:border-bottom-width="{Math.min(4, Math.max(1, l.weight ?? 1))}px"></span>{/if}
								</button>
							</div>
						{/if}
					{/each}
				{/if}
			{/if}
		{/each}
	</div>

	{#if selLayers.length > 1}
		<!-- several layers selected: act on them all -->
		<div class="lp-bulk">
			<b>{selLayers.length} layers</b>
			<button title="Show them" onclick={() => { for (const x of selObjs()) x.visible = true }}><Icon name="eye" size={12} /></button>
			<button title="Hide them" onclick={() => { for (const x of selObjs()) x.visible = false }}><Icon name="eyeSlash" size={12} /></button>
			<button title="Lock them" onclick={() => { for (const x of selObjs()) x.locked = true }}><Icon name="lock" size={12} /></button>
			<button title="Unlock them" onclick={() => { for (const x of selObjs()) x.locked = false }}><Icon name="lockOpen" size={12} /></button>
			<span class="lp-bulk-col" title="Colour them"><ColorPicker value={selObjs()[0]?.color ?? ''} colors={COLORS} onchange={(v) => { if (v) for (const x of selObjs()) x.color = v }} /></span>
			<button class="danger" disabled={!bulkDelIds.length} onblur={() => (bulkDelArm = false)} onclick={bulkDelete}
				title={bulkDelIds.length < selLayers.length ? 'Delete them (the active layer stays)' : 'Delete them'}>
				<Icon name="trash" size={12} />{#if bulkDelArm} Delete + {bulkDelCount} items?{/if}</button>
			<button title="Clear the selection" onclick={() => { selLayers = []; bulkDelArm = false }}><Icon name="close" size={12} /></button>
		</div>
	{/if}

	<button class="lp-new" onclick={() => { const l = addLayer(layers); editing = l.id }}><Icon name="plus" size={13} /> New Layer</button>
</div>

{#if dlg}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="lp-dlg-back" onclick={() => (dlgId = null)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="lp-dlg" onclick={(e) => e.stopPropagation()}>
			<div class="lp-dlg-head">Layer settings</div>
			<label class="lp-f"><span>Name</span><input bind:value={dlg.name} /></label>
			<div class="lp-f"><span>Colour</span><ColorPicker value={dlg.color} colors={COLORS} onchange={(v) => { if (dlg && v) dlg.color = v }} /></div>
			<label class="lp-f"><span>Draw as</span>
				<select value={swatchOf(dlg)} onchange={(e) => { if (dlg) dlg.swatch = (e.currentTarget as HTMLSelectElement).value as 'color' | 'line' }}><option value="color">Fill / symbol</option><option value="line">Line</option></select>
			</label>
			{#if swatchOf(dlg) === 'line'}
				<label class="lp-f"><span>Line type</span>
					<select bind:value={dlg.dash}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>
				</label>
				<label class="lp-f"><span>Thickness</span><input type="number" min="0.25" max="6" step="0.25" bind:value={dlg.weight} /><em>mm</em></label>
			{/if}
			<!-- the 2D lineweight its ByLayer shapes draw / print with (paper mm; Default = from the thickness, else 0.25) -->
			<label class="lp-f" title="The lineweight (paper mm) of this layer's ByLayer shapes when LWT is on — and in DXF"><span>Lineweight</span>
				<select value={dlg.lw != null && dlg.lw >= 0 ? String(dlg.lw) : ''} onchange={(e) => { if (!dlg) return; const v = (e.currentTarget as HTMLSelectElement).value; if (v === '') delete dlg.lw; else dlg.lw = Number(v) }}>
					<option value="">Default ({lwLabel(resolveLw({}, { weight: dlg.weight }))})</option>
					{#each LINEWEIGHTS as w (w)}<option value={String(w)}>{lwLabel(w)}</option>{/each}
				</select></label>
			<label class="lp-f"><span>Locked</span><input type="checkbox" bind:checked={dlg.locked} /></label>
			<!-- AutoCAD's "New VP Freeze": viewports created from now on start with this layer frozen (hidden in them);
			     existing viewports are untouched -->
			<label class="lp-f" title="Viewports created from now on start with this layer hidden in them (existing viewports keep theirs)"><span>Hide in new viewports</span>
				<input type="checkbox" checked={!!dlg.newVpFrz} onchange={(e) => { if (dlg) { if ((e.currentTarget as HTMLInputElement).checked) dlg.newVpFrz = true; else delete dlg.newVpFrz } }} /></label>
			<div class="lp-dlg-btns">
				<button class="lp-del" onclick={del} disabled={dlgId === layerUI.active}
					title={dlgId === layerUI.active ? 'This is the active layer — make another layer active first' : delCount ? `${delCount} item${delCount === 1 ? '' : 's'} on this layer are deleted with it` : 'Delete this empty layer'}>
					<Icon name="close" size={12} /> {delConfirm ? `Delete layer + ${delCount} item${delCount === 1 ? '' : 's'}?` : delCount ? `Delete layer (${delCount} items)` : 'Delete layer'}</button>
				<button class="lp-done" onclick={() => (dlgId = null)}>Done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.lp { flex:1; display:flex; flex-direction:column; min-height:0; }
	.lp-head { padding:6px 6px 4px; border-bottom:1px solid var(--line-soft); display:flex; flex-direction:column; gap:6px; }
	.lp-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); }
	.lp-preset { display:flex; gap:4px; }
	.lp-preset select { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--line);
		border-radius:5px; padding:5px 7px; font-size:12px; font-weight:600; }
	.lp-preset select:focus { outline:none; border-color:var(--accent); }
	.lp-kebab { width:28px; height:100%; border:1px solid var(--line); border-radius:5px; color:var(--muted); background:var(--input); font-size:14px; line-height:1; }
	.lp-kebab:hover { background:var(--hover); color:var(--text); }
	.lp-mod { color:var(--accent); font-size:9px; font-weight:600; letter-spacing:0; text-transform:none; }
	.lp-rename { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:5px; padding:5px 7px; font-size:12px; font-weight:600; }
	.lp-rename:focus { outline:none; }
	.lp-menuwrap { position:relative; flex:0 0 auto; }
	.lp-menu-back { position:fixed; inset:0; z-index:40; }
	.lp-menu { position:absolute; z-index:41; top:calc(100% + 3px); right:0; min-width:180px; background:var(--panel);
		border:1px solid var(--line); border-radius:6px; box-shadow:0 10px 30px #0007; padding:4px; display:flex; flex-direction:column; }
	.lp-menu button { text-align:left; font-size:12px; color:var(--text); background:none; border:none; border-radius:4px; padding:6px 8px; }
	.lp-menu button:hover:not(:disabled) { background:var(--hover); }
	.lp-menu button:disabled { color:var(--faint); }
	.lp-menu button.danger { color:var(--danger); }
	.lp-search { display:flex; align-items:center; gap:5px; background:var(--input); border:1px solid var(--line); border-radius:5px; padding:0 7px; }
	.lp-search :global(svg) { color:var(--faint); flex:0 0 auto; }
	.lp-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; padding:5px 0; }
	.lp-search input:focus { outline:none; }

	.lp-tree { flex:1; overflow-y:auto; padding:4px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.lg-row { display:flex; align-items:center; gap:4px; padding:4px 4px 4px 2px; border-radius:5px; }
	.lg-row:hover { background:var(--hover); }
	.lg-chev { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 auto;
		border-radius:3px; color:var(--muted); background:none; border:none; }
	.lg-chev:hover { color:var(--text); background:var(--line); }
	.lg-name { flex:1; min-width:0; font-size:12px; font-weight:600; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	/* group visibility checkbox */
	.lp-check { width:15px; height:15px; flex:0 0 auto; border:1.5px solid var(--line); border-radius:3px; background:var(--input); position:relative; }
	.lp-check.on { background:var(--accent); border-color:var(--accent); }
	.lp-check.on::after { content:''; position:absolute; left:4px; top:1px; width:4px; height:8px; border:solid #06232a; border-width:0 2px 2px 0; transform:rotate(45deg); }

	.ly-row { display:flex; align-items:center; gap:6px; padding:3px 4px 3px 22px; border-radius:5px; cursor:default; }
	.ly-row:hover { background:var(--hover); }
	.ly-row.active { background:var(--active); }
	.ly-row.multi { background:var(--accent-dim, var(--active)); box-shadow:inset 2px 0 0 var(--accent); }
	.lp-bulk { flex:0 0 auto; display:flex; align-items:center; gap:3px; margin:4px 6px 0; padding:4px 6px; border:1px solid var(--accent-dim, var(--line)); border-radius:6px; background:var(--panel2); font-size:11px; color:var(--text); }
	.lp-bulk b { flex:1; font-weight:600; }
	.lp-bulk button { display:inline-flex; align-items:center; gap:3px; height:20px; min-width:20px; justify-content:center; border:none; border-radius:4px; background:none; color:var(--muted); font-size:11px; }
	.lp-bulk button:hover:not(:disabled) { background:var(--hover); color:var(--text); }
	.lp-bulk button.danger { color:var(--danger); }
	.lp-bulk button:disabled { opacity:.4; }
	.lp-bulk-col { display:inline-flex; }
	.ly-row[draggable=true] { cursor:grab; }
	.ly-row.dragbefore { box-shadow:inset 0 2px 0 var(--accent); }   /* insert above the target */
	.ly-row.dragafter { box-shadow:inset 0 -2px 0 var(--accent); }   /* insert below the target */
	.ly-eye { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.ly-eye:hover { color:var(--text); background:var(--line); }
	.ly-eye.vp { color:var(--accent); }
	.lp-pick { display:inline-flex; align-items:center; background:none; border:none; color:var(--muted); cursor:pointer; padding:0 2px; }
	.lp-pick:hover { color:var(--accent); }   /* in a viewport: the eye acts on that viewport only */
	/* lock toggle beside the eye: faint when unlocked, accent when locked */
	.ly-lock-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--faint); background:none; border:none; }
	.ly-lock-btn:hover { color:var(--text); background:var(--line); }
	.ly-lock-btn.on { color:var(--accent); }
	.ly-lock-btn.vp { width:26px; gap:1px; }
	.ly-lock-btn.vp em { font-style:normal; font-size:7px; font-weight:700; letter-spacing:-.02em; }
	.ly-name { flex:1; min-width:0; font-size:12px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.ly-row.active .ly-name { color:var(--accent); font-weight:600; }
	.ly-row.off .ly-name, .ly-row.off .ly-eye { color:var(--faint); }
	.ly-active { color:var(--accent); font-size:9px; flex:0 0 auto; }
	/* one coloured swatch button (with a line inside for line layers) → opens the dialog */
	.sw-btn { width:26px; height:15px; flex:0 0 auto; border:1px solid #0003; border-radius:3px; padding:0;
		display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; }
	.sw-btn:hover { border-color:var(--accent); }
	.sw-btn-line { width:18px; height:0; border-bottom-style:solid; }
	.ly-edit { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:4px; padding:2px 5px; font-size:12px; }
	.ly-edit:focus { outline:none; }
	.lp-mini { display:none; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.lg-row:hover .lp-mini { display:inline-flex; }
	.lp-mini:hover { background:var(--line); color:var(--text); }
	.ly-row.off .sw-btn { opacity:.4; }

	/* Layer-settings dialog */
	.lp-dlg-back { position:fixed; inset:0; z-index:120; background:#0006; display:flex; align-items:center; justify-content:center; }
	.lp-dlg { width:min(300px,92vw); background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 20px 60px #0009; padding:12px 14px; }
	.lp-dlg-head { font-size:13px; font-weight:600; color:var(--text); margin-bottom:8px; }
	.lp-f { display:grid; grid-template-columns:70px 1fr auto; align-items:center; gap:8px; padding:4px 0; font-size:12px; color:var(--muted); }
	.lp-f > span { color:var(--muted); }
	.lp-f input:not([type=color]):not([type=checkbox]), .lp-f select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:4px 7px; font-size:12px; }
	.lp-f input:focus, .lp-f select:focus { outline:none; border-color:var(--accent); }
	.lp-f em { font-style:normal; color:var(--faint); font-size:11px; }
	.lp-dlg-btns { display:flex; justify-content:space-between; margin-top:12px; }
	.lp-del { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--danger); background:none; border:1px solid var(--line); border-radius:6px; padding:6px 11px; }
	.lp-del:hover:not(:disabled) { background:var(--hover); }
	.lp-del:disabled { opacity:.45; cursor:not-allowed; }
	/* the browser picks black / white against the accent where contrast-color() is supported; white otherwise */
	.lp-done { font-size:12px; font-weight:700; color:#fff; color:contrast-color(var(--accent)); background:var(--accent); border:none; border-radius:6px; padding:6px 16px; cursor:pointer; }
	.lp-done:hover { filter:brightness(1.1); }

	.lp-new { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; margin:6px; padding:7px;
		font-size:11px; border-radius:5px; color:var(--text); background:var(--panel2); border:1px dashed var(--line); }
	.lp-new:hover { background:var(--hover); border-style:solid; border-color:var(--accent-dim); }
</style>
