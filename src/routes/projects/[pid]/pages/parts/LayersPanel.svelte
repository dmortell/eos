<script lang="ts">
	// Right-sidebar LAYERS panel (Pages mockup) — modelled on the reference design:
	// a View-Presets picker (saved layer states = "views"), a search box, a nested
	// layer tree (groups → sub-layers) with eye toggles + colour/line swatches, and
	// a New-Layer button. Mock data + local state only.
	import { Icon } from '$lib'

	type Sub = { name: string; on: boolean; swatch: 'color' | 'line'; color?: string; dash?: 'solid' | 'dashed' | 'dotted' }
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
			{ name: 'Copper Trunks', on: true, swatch: 'line', color: '#2563eb', dash: 'dashed' },
			{ name: 'Fiber Trunks', on: true, swatch: 'line', color: '#2563eb', dash: 'solid' },
			{ name: 'Conduit', on: false, swatch: 'line', color: '#94a3b8', dash: 'dotted' },
		] },
		{ name: 'Walls & Structure', on: false, open: false, kids: [
			{ name: 'Walls', on: false, swatch: 'line', color: '#334155', dash: 'solid' },
			{ name: 'Doors', on: false, swatch: 'line', color: '#334155', dash: 'solid' },
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
		{#each groups as g (g.name)}
			{#if matches(g.name) || g.kids.some(k => matches(k.name))}
				<div class="lg-row" class:off={!g.on}>
					{#if g.kids.length}
						<button class="lg-chev" aria-label={g.open ? 'Collapse' : 'Expand'} onclick={() => (g.open = !g.open)}>
							<Icon name={g.open ? 'chevronDown' : 'chevronRight'} size={12} />
						</button>
					{:else}
						<span class="lg-chev spacer"></span>
					{/if}
					<span class="lg-name">{g.name}</span>
					<button class="lp-check" class:on={g.on} aria-label="Toggle {g.name}" onclick={() => (g.on = !g.on)}></button>
				</div>
				{#if g.open}
					{#each g.kids as k (k.name)}
						{#if matches(k.name) || matches(g.name)}
							<div class="ly-row" class:off={!k.on}>
								<button class="ly-eye" aria-label="Show/hide {k.name}" onclick={() => (k.on = !k.on)}>
									<Icon name={k.on ? 'eye' : 'eyeSlash'} size={13} />
								</button>
								<span class="ly-name">{k.name}</span>
								{#if k.swatch === 'color'}
									<span class="sw-color" style:background={k.color}></span>
								{:else}
									<span class="sw-line" style:border-bottom-style={k.dash} style:border-bottom-color={k.color}></span>
								{/if}
							</div>
						{/if}
					{/each}
				{/if}
			{/if}
		{/each}
	</div>

	<button class="lp-new"><Icon name="plus" size={13} /> New Layer</button>
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
	.sw-color { width:22px; height:13px; flex:0 0 auto; border-radius:3px; box-shadow:0 0 0 1px #0002 inset; }
	.sw-line { width:24px; height:0; flex:0 0 auto; border-bottom-width:2px; }
	.ly-row.off .sw-color, .ly-row.off .sw-line { opacity:.4; }

	.lp-new { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; margin:6px; padding:7px;
		font-size:11px; border-radius:5px; color:var(--text); background:var(--panel2); border:1px dashed var(--line); }
	.lp-new:hover { background:var(--hover); border-style:solid; border-color:var(--accent-dim); }
</style>
