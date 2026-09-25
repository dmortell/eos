<script lang="ts">
	// Right-sidebar LAYERS panel — R5: ONE grouped list, the focused model's own `layers` (its object
	// layers under "Model" plus its Background / annotation / outlet / trunk layers), so eye/lock/colour/
	// order/active drive both the model objects and the entities on the canvas. View-Preset picker +
	// search, per-layer eye/lock/colour and a settings dialog. Mutations go straight onto the model's
	// reactive list (layers.svelte.ts helpers).
	import { Icon, ColorPicker, DragReorder } from '$lib'
	import { COLORS } from '../palette'
	import { type Layer, layerUI, layerGroup, layerGroups, addLayer, removeLayer, moveLayer,
		presets, presetUI, applyPreset, savePreset, updatePreset, renamePreset, deletePreset, presetMatches } from '../layers.svelte'
	import { tick } from 'svelte'
	function focusEdit(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }
	// VP Freeze (AutoCAD): `frozen` is the ACTIVE sheet frame's frozen layer ids — null when no frame is active
	// (model space / paper), which hides the column. `onfreeze` toggles one layer in that frame only.
	// J1 VP Lock: `vpLocked` (the active frame's locked layer ids; null = no frame active) + `onvplock` — the same idea.
	let { layers = [], frozen = null, onfreeze, vpLocked = null, onvplock, countOf, ondelete }: { layers?: Layer[]; frozen?: string[] | null; onfreeze?: (id: string) => void
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

	// DRAG to reorder layers = change draw z-order (array position). Reusable $lib helper handles the DnD
	// state + direction-aware drop; `moveLayer` applies it.
	const dr = new DragReorder((id, t, after) => moveLayer(layers, id, t, after), (id) => layers.findIndex((l) => l.id === id))

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
							<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
							<div class="ly-row" class:off={!l.visible} class:active={l.id === layerUI.active}
								class:dragbefore={dr.isBefore(l.id)} class:dragafter={dr.isAfter(l.id)} title="Drag to reorder (sets draw z-order)"
								{...dr.row(l.id)} onclick={() => (layerUI.active = l.id)}>
								<button class="ly-eye" aria-label="Show/hide {l.name}" onclick={(e) => { e.stopPropagation(); l.visible = !l.visible }}>
									<Icon name={l.visible ? 'eye' : 'eyeSlash'} size={13} />
								</button>
								<button class="ly-lock-btn" class:on={l.locked} aria-label="{l.locked ? 'Unlock' : 'Lock'} {l.name}" title="{l.locked ? 'Unlock' : 'Lock'} layer" onclick={(e) => { e.stopPropagation(); l.locked = !l.locked }}>
									<Icon name={l.locked ? 'lock' : 'lockOpen'} size={12} />
								</button>
								{#if frozen}
									<button class="ly-lock-btn" class:on={frozen.includes(l.id)} aria-label="{frozen.includes(l.id) ? 'Thaw' : 'Freeze'} {l.name} in this viewport"
										title="{frozen.includes(l.id) ? 'Thaw' : 'Freeze'} in the active viewport only (VP Freeze)" onclick={(e) => { e.stopPropagation(); onfreeze?.(l.id) }}>
										<Icon name="snowflake" size={12} />
									</button>
								{/if}
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
			<label class="lp-f"><span>Locked</span><input type="checkbox" bind:checked={dlg.locked} /></label>
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
	.ly-row[draggable=true] { cursor:grab; }
	.ly-row.dragbefore { box-shadow:inset 0 2px 0 var(--accent); }   /* insert above the target */
	.ly-row.dragafter { box-shadow:inset 0 -2px 0 var(--accent); }   /* insert below the target */
	.ly-eye { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.ly-eye:hover { color:var(--text); background:var(--line); }
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
