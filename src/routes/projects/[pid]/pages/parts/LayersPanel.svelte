<script lang="ts">
	// Right-sidebar LAYERS panel — now backed by the shared reactive layer store (layers.svelte.ts),
	// so eye/lock toggles, colours and the active layer really drive the canvas. Grouped tree with a
	// View-Preset picker + search (cosmetic), per-layer eye/lock/colour and a settings dialog.
	import { Icon, ColorPicker } from '$lib'
	import { COLORS } from '../palette'
	import { layers, layerUI, layerGroups, addLayer, removeLayer } from '../layers.svelte'
	import { tick } from 'svelte'
	function focusEdit(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }

	const PRESETS = ['High Level Outlets', 'Low Level Outlets', 'Trunk Routes', 'Desk Numbering', 'All Layers']
	let preset = $state(PRESETS[0])
	let search = $state('')
	const matches = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())

	// Per-group collapse state (default open). Group visibility = all its layers visible.
	let openGroups = $state<Record<string, boolean>>({})
	const isOpen = (g: string) => openGroups[g] !== false
	const groupOn = (g: string) => layers.filter((l) => l.group === g).every((l) => l.visible)
	function setGroup(g: string, on: boolean) { for (const l of layers) if (l.group === g) l.visible = on }

	let editing = $state<string | null>(null)   // layer id being renamed
	function commit(e: KeyboardEvent) { if (e.key === 'Enter' || e.key === 'Escape') editing = null }

	// Layer-settings dialog (opened from a layer's swatch button).
	let dlgId = $state<string | null>(null)
	let dlg = $derived(dlgId ? layers.find((l) => l.id === dlgId) : null)
	function del() { if (dlgId) { removeLayer(dlgId); dlgId = null } }
</script>

<div class="lp">
	<div class="lp-head">
		<div class="lp-lbl">View Preset</div>
		<div class="lp-preset">
			<select bind:value={preset}>
				{#each PRESETS as p (p)}<option value={p}>{p}</option>{/each}
			</select>
			<button class="lp-kebab" title="Manage presets" aria-label="Manage presets">⋮</button>
		</div>
		<div class="lp-search">
			<Icon name="search" size={12} />
			<input placeholder="Search layers…" bind:value={search} />
		</div>
	</div>

	<div class="lp-tree">
		{#each layerGroups() as g (g)}
			{@const kids = layers.filter((l) => l.group === g)}
			{#if matches(g) || kids.some((k) => matches(k.name))}
				<div class="lg-row">
					<button class="lg-chev" aria-label={isOpen(g) ? 'Collapse' : 'Expand'} onclick={() => (openGroups = { ...openGroups, [g]: !isOpen(g) })}>
						<Icon name={isOpen(g) ? 'chevronDown' : 'chevronRight'} size={12} />
					</button>
					<span class="lg-name">{g}</span>
					<button class="lp-mini" title="Add layer to {g}" aria-label="Add layer" onclick={() => { const l = addLayer(g); openGroups = { ...openGroups, [g]: true }; editing = l.id }}><Icon name="plus" size={12} /></button>
					<button class="lp-check" class:on={groupOn(g)} aria-label="Toggle {g}" onclick={() => setGroup(g, !groupOn(g))}></button>
				</div>
				{#if isOpen(g)}
					{#each kids as l (l.id)}
						{#if matches(l.name) || matches(g)}
							<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
							<div class="ly-row" class:off={!l.visible} class:active={l.id === layerUI.active} onclick={() => (layerUI.active = l.id)}>
								<button class="ly-eye" aria-label="Show/hide {l.name}" onclick={(e) => { e.stopPropagation(); l.visible = !l.visible }}>
									<Icon name={l.visible ? 'eye' : 'eyeSlash'} size={13} />
								</button>
								<button class="ly-lock-btn" class:on={l.locked} aria-label="{l.locked ? 'Unlock' : 'Lock'} {l.name}" title="{l.locked ? 'Unlock' : 'Lock'} layer" onclick={(e) => { e.stopPropagation(); l.locked = !l.locked }}>
									<Icon name={l.locked ? 'lock' : 'lockOpen'} size={12} />
								</button>
								{#if editing === l.id}
									<input class="ly-edit" bind:value={l.name} use:focusEdit onblur={() => (editing = null)} onkeydown={commit} onclick={(e) => e.stopPropagation()} />
								{:else}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span class="ly-name" title="Click to make active · double-click to rename" ondblclick={() => (editing = l.id)}>{l.name}</span>
								{/if}
								{#if l.id === layerUI.active}<span class="ly-active" title="Active layer">●</span>{/if}
								<!-- a coloured button (with a line inside for line layers) → opens the settings dialog -->
								<button class="sw-btn" title="Layer settings" aria-label="Edit {l.name}" onclick={(e) => { e.stopPropagation(); dlgId = l.id }}
									style:background={l.swatch === 'color' ? l.color : 'var(--input)'}>
									{#if l.swatch === 'line'}<span class="sw-btn-line" style:border-bottom-color={l.color} style:border-bottom-style={l.dash} style:border-bottom-width="{Math.min(4, Math.max(1, l.weight ?? 1))}px"></span>{/if}
								</button>
							</div>
						{/if}
					{/each}
				{/if}
			{/if}
		{/each}
	</div>

	<button class="lp-new" onclick={() => { const l = addLayer(); editing = l.id }}><Icon name="plus" size={13} /> New Layer</button>
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
				<select bind:value={dlg.swatch}><option value="color">Fill / symbol</option><option value="line">Line</option></select>
			</label>
			{#if dlg.swatch === 'line'}
				<label class="lp-f"><span>Line type</span>
					<select bind:value={dlg.dash}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>
				</label>
				<label class="lp-f"><span>Thickness</span><input type="number" min="0.25" max="6" step="0.25" bind:value={dlg.weight} /><em>mm</em></label>
			{/if}
			<label class="lp-f"><span>Locked</span><input type="checkbox" bind:checked={dlg.locked} /></label>
			<div class="lp-dlg-btns">
				<button class="lp-del" onclick={del}><Icon name="close" size={12} /> Delete layer</button>
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
	.lp-kebab { width:28px; border:1px solid var(--line); border-radius:5px; color:var(--muted); background:var(--input); font-size:14px; line-height:1; }
	.lp-kebab:hover { background:var(--hover); color:var(--text); }
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
	.ly-eye { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.ly-eye:hover { color:var(--text); background:var(--line); }
	/* lock toggle beside the eye: faint when unlocked, accent when locked */
	.ly-lock-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--faint); background:none; border:none; }
	.ly-lock-btn:hover { color:var(--text); background:var(--line); }
	.ly-lock-btn.on { color:var(--accent); }
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
	.lp-del:hover { background:var(--hover); }
	.lp-done { font-size:12px; font-weight:600; color:#06232a; background:var(--accent); border:none; border-radius:6px; padding:6px 16px; }

	.lp-new { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; margin:6px; padding:7px;
		font-size:11px; border-radius:5px; color:var(--text); background:var(--panel2); border:1px dashed var(--line); }
	.lp-new:hover { background:var(--hover); border-style:solid; border-color:var(--accent-dim); }
</style>
