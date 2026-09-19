<script lang="ts">
	// Right-sidebar LAYERS panel (Pages mockup) — modelled on the reference design:
	// a View-Presets picker (saved layer states = "views"), a search box, a nested
	// layer tree (groups → sub-layers) with eye toggles + colour/line swatches, and
	// a New-Layer button. Mock data + local state only.
	import { Icon } from '$lib'
	import { tick } from 'svelte'
	// Focus + select a rename input once it's in the DOM (a tick after it renders).
	function focusEdit(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }

	type Sub = { name: string; on: boolean; swatch: 'color' | 'line'; color?: string; dash?: 'solid' | 'dashed' | 'dotted'; weight?: number }
	type Group = { name: string; on: boolean; open: boolean; kids: Sub[] }

	const PRESETS = ['High Level Outlets', 'Low Level Outlets', 'Trunk Routes', 'Desk Numbering', 'All Layers']
	let preset = $state(PRESETS[0])
	let search = $state('')

	let groups = $state<Group[]>([
		{ name: 'Outlets — High', on: true, open: true, kids: [
			{ name: 'Data Outlets', on: true, swatch: 'color', color: '#2563eb' },
			{ name: 'Power Outlets', on: true, swatch: 'color', color: '#16a34a' },
			{ name: 'Wireless', on: true, swatch: 'color', color: '#9333ea' },
		] },
		{ name: 'Outlets — Low', on: false, open: false, kids: [
			{ name: 'Data Outlets', on: false, swatch: 'color', color: '#2563eb' },
			{ name: 'Power Outlets', on: false, swatch: 'color', color: '#16a34a' },
		] },
		{ name: 'Trunk Routes', on: true, open: true, kids: [
			{ name: 'Copper Trunks', on: true, swatch: 'line', color: '#2563eb', dash: 'dashed', weight: 1.5 },
			{ name: 'Fiber Trunks', on: true, swatch: 'line', color: '#2563eb', dash: 'solid', weight: 2 },
			{ name: 'Conduit', on: false, swatch: 'line', color: '#94a3b8', dash: 'dotted', weight: 1 },
		] },
		{ name: 'Walls & Structure', on: false, open: false, kids: [
			{ name: 'Walls', on: false, swatch: 'line', color: '#334155', dash: 'solid', weight: 2.5 },
			{ name: 'Doors', on: false, swatch: 'line', color: '#334155', dash: 'solid', weight: 1.5 },
		] },
		{ name: 'Rooms & Labels', on: false, open: false, kids: [
			{ name: 'Room Fills', on: false, swatch: 'color', color: '#e2e8f0' },
			{ name: 'Room Names', on: false, swatch: 'color', color: '#64748b' },
		] },
		{ name: 'Dimensions', on: false, open: false, kids: [
			{ name: 'Linear', on: false, swatch: 'color', color: '#0e7490' },
		] },
		{ name: 'Grid', on: true, open: false, kids: [] },
	])
	// A group with no children is a single toggleable layer (like Grid).
	const matches = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())

	// ── new / edit layers ──
	const PALETTE = ['#2563eb', '#16a34a', '#9333ea', '#dc2626', '#ea580c', '#0e7490', '#334155', '#64748b']
	let editing = $state<string | null>(null)   // "g<i>" (group) or "g<i>s<j>" (sub) being renamed
	function newGroup() {
		groups.push({ name: 'New Layer', on: true, open: false, kids: [] })
		editing = `g${groups.length - 1}`
	}
	function addSub(gi: number) {
		const g = groups[gi]
		g.open = true
		g.kids.push({ name: 'Sub-layer', on: true, swatch: 'color', color: PALETTE[g.kids.length % PALETTE.length] })
		editing = `g${gi}s${g.kids.length - 1}`
	}
	function delGroup(gi: number) { groups.splice(gi, 1); editing = null }
	function commit(e: KeyboardEvent) { if (e.key === 'Enter' || e.key === 'Escape') editing = null }
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
		{#each groups as g, gi (gi)}
			{#if matches(g.name) || g.kids.some(k => matches(k.name))}
				<div class="lg-row" class:off={!g.on}>
					{#if g.kids.length}
						<button class="lg-chev" aria-label={g.open ? 'Collapse' : 'Expand'} onclick={() => (g.open = !g.open)}>
							<Icon name={g.open ? 'chevronDown' : 'chevronRight'} size={12} />
						</button>
					{:else}
						<span class="lg-chev spacer"></span>
					{/if}
					{#if editing === `g${gi}`}
						<input class="ly-edit" bind:value={g.name} use:focusEdit onblur={() => (editing = null)} onkeydown={commit} />
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span class="lg-name" ondblclick={() => (editing = `g${gi}`)}>{g.name}</span>
					{/if}
					<button class="lp-mini" title="Add sub-layer" aria-label="Add sub-layer" onclick={() => addSub(gi)}><Icon name="plus" size={12} /></button>
					<button class="lp-mini" title="Delete layer" aria-label="Delete layer" onclick={() => delGroup(gi)}><Icon name="close" size={12} /></button>
					<button class="lp-check" class:on={g.on} aria-label="Toggle {g.name}" onclick={() => (g.on = !g.on)}></button>
				</div>
				{#if g.open}
					{#each g.kids as k, si (si)}
						{#if matches(k.name) || matches(g.name)}
							<div class="ly-row" class:off={!k.on}>
								<button class="ly-eye" aria-label="Show/hide {k.name}" onclick={() => (k.on = !k.on)}>
									<Icon name={k.on ? 'eye' : 'eyeSlash'} size={13} />
								</button>
								{#if editing === `g${gi}s${si}`}
									<input class="ly-edit" bind:value={k.name} use:focusEdit onblur={() => (editing = null)} onkeydown={commit} />
								{:else}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span class="ly-name" ondblclick={() => (editing = `g${gi}s${si}`)}>{k.name}</span>
								{/if}
								{#if k.swatch === 'color'}
									<input class="sw-color sw-input" type="color" bind:value={k.color} aria-label="Layer colour" title="Colour" />
								{:else}
									<!-- line layer: editable colour · line type · thickness (like the trunk layers) -->
									<input class="sw-color sw-input" type="color" bind:value={k.color} aria-label="Line colour" title="Colour" />
									<select class="sw-dash" bind:value={k.dash} title="Line type" aria-label="Line type">
										<option value="solid">──</option>
										<option value="dashed">- -</option>
										<option value="dotted">···</option>
									</select>
									<input class="sw-wt" type="number" min="0.25" max="6" step="0.25" bind:value={k.weight} title="Thickness (mm)" aria-label="Thickness" />
								{/if}
							</div>
						{/if}
					{/each}
				{/if}
			{/if}
		{/each}
	</div>

	<button class="lp-new" onclick={newGroup}><Icon name="plus" size={13} /> New Layer</button>
</div>

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
	.lg-chev.spacer { width:16px; }
	.lg-chev:hover { color:var(--text); background:var(--line); }
	.lg-name { flex:1; min-width:0; font-size:12px; font-weight:600; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.lg-row.off .lg-name { color:var(--muted); font-weight:500; }
	/* group visibility checkbox */
	.lp-check { width:15px; height:15px; flex:0 0 auto; border:1.5px solid var(--line); border-radius:3px; background:var(--input); position:relative; }
	.lp-check.on { background:var(--accent); border-color:var(--accent); }
	.lp-check.on::after { content:''; position:absolute; left:4px; top:1px; width:4px; height:8px; border:solid #06232a; border-width:0 2px 2px 0; transform:rotate(45deg); }

	.ly-row { display:flex; align-items:center; gap:6px; padding:3px 4px 3px 22px; border-radius:5px; }
	.ly-row:hover { background:var(--hover); }
	.ly-eye { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.ly-eye:hover { color:var(--text); background:var(--line); }
	.ly-name { flex:1; min-width:0; font-size:12px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.ly-row.off .ly-name, .ly-row.off .ly-eye { color:var(--faint); }
	.sw-color { width:22px; height:14px; flex:0 0 auto; border-radius:3px; box-shadow:0 0 0 1px #0002 inset; }
	.sw-input { -webkit-appearance:none; appearance:none; padding:0; border:none; background:none; cursor:pointer; }
	.sw-input::-webkit-color-swatch-wrapper { padding:0; }
	.sw-input::-webkit-color-swatch { border:none; border-radius:3px; }
	.sw-line { width:24px; height:0; flex:0 0 auto; border-bottom-width:2px; }
	.sw-dash { -webkit-appearance:none; appearance:none; width:34px; flex:0 0 auto; background:var(--input); color:var(--text);
		border:1px solid var(--line); border-radius:3px; font-size:11px; padding:1px 2px; text-align:center; }
	.sw-wt { width:36px; flex:0 0 auto; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:3px;
		font-size:10px; padding:2px 3px; font-family:Consolas,monospace; }
	.sw-dash:focus, .sw-wt:focus { outline:none; border-color:var(--accent); }
	.ly-edit { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:4px; padding:2px 5px; font-size:12px; }
	.ly-edit:focus { outline:none; }
	.lp-mini { display:none; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; border-radius:3px; color:var(--muted); background:none; border:none; }
	.lg-row:hover .lp-mini { display:inline-flex; }
	.lp-mini:hover { background:var(--line); color:var(--text); }
	.ly-row.off .sw-color, .ly-row.off .sw-line { opacity:.4; }

	.lp-new { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; margin:6px; padding:7px;
		font-size:11px; border-radius:5px; color:var(--text); background:var(--panel2); border:1px dashed var(--line); }
	.lp-new:hover { background:var(--hover); border-style:solid; border-color:var(--accent-dim); }
</style>
