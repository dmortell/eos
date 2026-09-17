<script lang="ts">
	// ── Kestrel-layout workspace MOCKUP (kestrel-adoption.md, feel/flow study) ──
	// Self-contained prototype: titlebar · menubar · canvas tabs · collapsible
	// left/right sidebars · status bar. No ribbon, no command history (later).
	// Everything is mock data + local state — nothing touches Firestore. Styled
	// with Kestrel's own tokens scoped to .shell, so it looks like Kestrel in
	// both light/dark regardless of the app theme (toggle in its titlebar).
	import { Icon } from '$lib'
	import { page } from '$app/state'
	import Test from './test.svelte'  // preview: 3-across X/Y/Z inputs

	// Canvas documents — the B1 "each tab owns its own view state" pattern (mock).
	type Kind = 'plan' | 'sheet' | 'elevation'
	type Tab = { id: string; title: string; kind: Kind; dirty: boolean }
	let tabs = $state<Tab[]>([
		{ id: 't1', title: '3303 Floorplan', kind: 'plan', dirty: false },
		{ id: 't2', title: '3303 Outlets', kind: 'sheet', dirty: true },
		{ id: 't3', title: 'Rack A · Elevation', kind: 'elevation', dirty: false },
	])
	let seq = 3
	const kindIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'server' }

	// Editor panes — 1 or 2 side by side (vertical split). Each pane views one open
	// tab; tabs are shared documents, so the same page can show in both panes and
	// each pane tracks its own active tab (VS Code-style split).
	let panes = $state<{ id: string; activeId: string }[]>([{ id: 'p1', activeId: 't2' }])
	let focused = $state(0)      // which pane new tabs / sidebar actions target
	let splitFrac = $state(0.5)  // pane 0 width fraction when split
	let paneSeq = 1
	let active = $derived(tabs.find(t => t.id === panes[focused]?.activeId) ?? null)

	function openTab(id: string, pane = focused) { if (panes[pane]) { panes[pane].activeId = id; focused = pane } }
	function addTab(kind: Kind = 'plan', title?: string) {
		const id = 't' + ++seq
		tabs = [...tabs, { id, title: title ?? `Untitled ${seq}`, kind, dirty: false }]
		if (panes[focused]) panes[focused].activeId = id
	}
	function closeTab(id: string, e?: Event) {
		e?.stopPropagation()
		const i = tabs.findIndex(t => t.id === id); if (i < 0) return
		tabs = tabs.filter(t => t.id !== id)
		if (!tabs.length) { addTab(); return }
		const fallback = tabs[Math.max(0, i - 1)].id
		for (const p of panes) if (p.activeId === id) p.activeId = fallback
	}
	// Vertical split: open a second pane showing a different tab; toggle focus if already split.
	function splitVertical() {
		if (panes.length >= 2) { focused = 1; return }
		const cur = panes[0].activeId
		const other = tabs.find(t => t.id !== cur)?.id ?? cur
		panes = [...panes, { id: 'p' + ++paneSeq, activeId: other }]
		focused = 1; splitFrac = 0.5
	}
	function closePane(idx: number) {
		if (panes.length < 2) return
		panes = panes.filter((_, i) => i !== idx)
		focused = 0
	}
	function startSplitDrag(e: PointerEvent) {
		e.preventDefault()
		const area = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
		const move = (ev: PointerEvent) => { splitFrac = Math.min(0.8, Math.max(0.2, (ev.clientX - area.left) / area.width)) }
		const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
		window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
	}

	// Overflow "all pages" dropdown on the tab strip — reaches tabs scrolled off-screen.
	let tabMenuPane = $state<number | null>(null)
	function pickFromMenu(id: string, pane: number) {
		openTab(id, pane); tabMenuPane = null
		setTimeout(() => document.querySelectorAll('.pane')[pane]?.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 0)
	}

	// Sidebars
	let leftOpen = $state(true)
	let rightOpen = $state(true)
	let leftTab = $state<'pages' | 'layers'>('layers')

	// Menubar
	let openMenu = $state<string | null>(null)
	const MENUS: Record<string, string[]> = {
		File: ['New Page', 'Open…', '—', 'Save', 'Export…', '—', 'Print…'],
		Edit: ['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', '—', 'Delete'],
		View: ['Zoom In', 'Zoom Out', 'Fit', '—', 'Split Editor', 'Unsplit', '—', 'Toggle Left Panel', 'Toggle Right Panel'],
		Insert: ['Outlet', 'Trunk', 'Rack', '—', 'Text', 'Dimension'],
	}
	function menuAction(item: string) {
		openMenu = null
		if (item === 'New Page') addTab()
		else if (item === 'Toggle Left Panel') leftOpen = !leftOpen
		else if (item === 'Toggle Right Panel') rightOpen = !rightOpen
		else if (item === 'Fit') zoom = 100
		else if (item === 'Zoom In') zoom = Math.min(800, zoom + 25)
		else if (item === 'Zoom Out') zoom = Math.max(10, zoom - 25)
		else if (item === 'Split Editor') splitVertical()
		else if (item === 'Unsplit') closePane(1)
		// everything else is a mock no-op
	}

	// Left · Pages list (unopened mock pages you can open into a tab)
	const libraryPages: { title: string; kind: Kind }[] = [
		{ title: '3303 Cable Routes', kind: 'sheet' },
		{ title: '3307 Floorplan', kind: 'plan' },
		{ title: 'Rack B · Elevation', kind: 'elevation' },
		{ title: 'Riser Diagram', kind: 'sheet' },
	]
	// Left · Layers (mock)
	let layers = $state([
		{ name: 'Outlets', color: '#3b82f6', on: true, lock: false },
		{ name: 'Trunks', color: '#0369a1', on: true, lock: false },
		{ name: 'Racks', color: '#10b981', on: true, lock: false },
		{ name: 'Annotations', color: '#ef4444', on: true, lock: false },
		{ name: 'Dimensions', color: '#8b5cf6', on: false, lock: false },
	])
	let activeLayer = $state('Annotations')

	// Canvas · tools + pointer + zoom
	const TOOLS = [
		{ icon: 'k-select', name: 'Select' },
		{ icon: 'k-line', name: 'Line' },
		{ icon: 'rectangle', name: 'Rectangle' },
		{ icon: 'circle', name: 'Circle' },
		{ icon: 'dimension', name: 'Dimension' },
		{ icon: 'k-text', name: 'Text' },
	]
	let tool = $state('Select')
	let cx = $state(0), cy = $state(0)
	let zoom = $state(100)
	function onCanvasMove(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
		cx = Math.round(e.clientX - r.left); cy = Math.round(e.clientY - r.top)
	}

	// Status bar
	let layout = $state<'model' | 'sheet'>('model')
	let toggles = $state<Record<string, boolean>>({ GRID: true, SNAP: true, ORTHO: false, OSNAP: true, LWT: false })

	// Mock theme (scoped to .shell — demos both Kestrel looks, app untouched)
	let mockTheme = $state<'dark' | 'light'>('dark')
</script>

<svelte:head><title>EOS — Pages (mockup)</title></svelte:head>

<div class="shell" data-mock-theme={mockTheme}>
	{#if openMenu}<button class="menu-backdrop" aria-label="Close menu" onclick={() => (openMenu = null)}></button>{/if}
	{#if tabMenuPane !== null}<button class="menu-backdrop" aria-label="Close menu" onclick={() => (tabMenuPane = null)}></button>{/if}

	<!-- Titlebar -->
	<header class="titlebar">
		<div class="tb-left">
			<a href="/projects/{page.params.pid}" class="tb-icon" title="Back to project"><Icon name="chevronLeft" size={15} /></a>
			<a href="/" class="tb-icon" title="Home"><Icon name="home" size={15} /></a>
			<span class="brand">EOS <b>Pages</b></span>
			<span class="mock-badge">MOCKUP</span>
		</div>
		<div class="tb-title">{active ? active.title : 'No page'}{active?.dirty ? ' •' : ''}</div>
		<div class="tb-right">
			<button class="tb-icon" title="Find (mock)"><Icon name="search" size={15} /></button>
			<button class="tb-icon" title="Toggle light / dark" onclick={(e) => { e.stopPropagation(); mockTheme = mockTheme === 'dark' ? 'light' : 'dark' }}>
				<Icon name={mockTheme === 'dark' ? 'moon' : 'sun'} size={15} />
			</button>
		</div>
	</header>

	<!-- Menubar -->
	<nav class="menubar">
		{#each Object.keys(MENUS) as m (m)}
			<div class="menu-wrap">
				<button class="menu-btn" class:open={openMenu === m} data-menu={m}
					onclick={(e) => { const n = e.currentTarget.dataset.menu!; openMenu = openMenu === n ? null : n }}
					onmouseenter={(e) => { if (openMenu) openMenu = e.currentTarget.dataset.menu! }}>{m}</button>
				{#if openMenu === m}
					<div class="menu-pop">
						{#each MENUS[m] as item, i (i)}
							{#if item === '—'}<div class="menu-sep"></div>
							{:else}<button class="menu-item" data-item={item} onclick={(e) => menuAction(e.currentTarget.dataset.item!)}>{item}</button>{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</nav>

	<!-- Body: left · editor-area (1–2 panes) · right -->
	<div class="body">

		<!-- Left sidebar -->
		{#if leftOpen}
			<aside class="side left">
				<div class="side-head">
					<div class="side-tabs">
						<button class:on={leftTab === 'layers'} onclick={() => (leftTab = 'layers')}>Layers</button>
						<button class:on={leftTab === 'pages'} onclick={() => (leftTab = 'pages')}>Pages</button>
					</div>
					<button class="side-collapse" title="Collapse" onclick={() => (leftOpen = false)}><Icon name="chevronLeft" size={13} /></button>
				</div>
				<div class="side-body">
					{#if leftTab === 'layers'}
						{#each layers as l (l.name)}
							<div class="layer-row" class:active={activeLayer === l.name}>
								<span class="dot" style:background={l.color}></span>
								<button class="grow txt" onclick={() => (activeLayer = l.name)}>{l.name}</button>
								<button class="mini" class:off={!l.on} title="Show/hide" onclick={() => (l.on = !l.on)}><Icon name={l.on ? 'eye' : 'eyeSlash'} size={13} /></button>
								<button class="mini" class:warn={l.lock} title="Lock" onclick={() => (l.lock = !l.lock)}><Icon name={l.lock ? 'lock' : 'lockOpen'} size={13} /></button>
							</div>
						{/each}
					{:else}
						<div class="grp-label">Open</div>
						{#each tabs as t (t.id)}
							<button class="page-row" class:active={t.id === panes[focused]?.activeId} onclick={() => openTab(t.id)}>
								<Icon name={kindIcon[t.kind]} size={13} /><span class="grow txt">{t.title}</span>
							</button>
						{/each}
						<div class="grp-label">Library</div>
						{#each libraryPages as p (p.title)}
							<button class="page-row" onclick={() => addTab(p.kind, p.title)}>
								<Icon name={kindIcon[p.kind]} size={13} /><span class="grow txt">{p.title}</span>
								<Icon name="plus" size={12} />
							</button>
						{/each}
					{/if}
				</div>
				<div class="side-foot">{layers.length} layers · {tabs.length} open</div>
			</aside>
		{:else}
			<button class="rail left" title="Show panel" onclick={() => (leftOpen = true)}>
				<Icon name="chevronRight" size={13} /><Icon name="layers" size={15} />
			</button>
		{/if}

		<!-- Editor area: one pane, or two split vertically -->
		<div class="editor-area" class:split={panes.length === 2}>
			{#each panes as p, pi (p.id)}
				{@const a = tabs.find(t => t.id === p.activeId) ?? null}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<section class="pane" class:focused={focused === pi}
					style:flex={panes.length === 1 ? '1 1 0' : `${pi === 0 ? splitFrac : 1 - splitFrac} 1 0`}
					onpointerdown={() => (focused = pi)}>

					<!-- this pane's tab strip -->
					<div class="tabbar">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="tabs" onwheel={(e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() } }}>
							{#each tabs as t (t.id)}
								<div class="tab" class:active={t.id === p.activeId} onclick={() => openTab(t.id, pi)}
									role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') openTab(t.id, pi) }}>
									<Icon name={kindIcon[t.kind]} size={12} />
									<span class="tab-name">{t.title}</span>
									{#if t.dirty}<span class="dirty">•</span>{/if}
									<button class="tab-x" title="Close" onclick={(e) => closeTab(t.id, e)}><Icon name="close" size={11} /></button>
								</div>
							{/each}
						</div>
						<div class="tabbar-right">
							<button class="strip-btn" title="New page" onclick={() => { focused = pi; addTab() }}><Icon name="plus" size={14} /></button>
							<button class="strip-btn" title="All pages" onclick={(e) => { e.stopPropagation(); focused = pi; tabMenuPane = tabMenuPane === pi ? null : pi }}><Icon name="chevronDown" size={14} /></button>
							{#if panes.length === 1}
								<button class="strip-btn" title="Split editor right" onclick={splitVertical}><Icon name="panels" size={14} /></button>
							{:else}
								<button class="strip-btn" title="Close this split" onclick={() => closePane(pi)}><Icon name="close" size={14} /></button>
							{/if}
							{#if tabMenuPane === pi}
								<div class="tab-menu">
									{#each tabs as t (t.id)}
										<button class="tab-menu-item" class:on={t.id === p.activeId} onclick={() => pickFromMenu(t.id, pi)}>
											<Icon name={kindIcon[t.kind]} size={13} /><span class="grow txt">{t.title}</span>{#if t.dirty}<span class="dirty">•</span>{/if}
										</button>
									{/each}
									<div class="tab-menu-sep"></div>
									<button class="tab-menu-item" onclick={() => { tabMenuPane = null; focused = pi; addTab() }}>
										<Icon name="plus" size={13} /><span class="grow txt">New page</span>
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- this pane's canvas -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<main class="canvas" onpointermove={onCanvasMove}>
						<div class="floattools glass-bar">
							{#each TOOLS as t (t.name)}
								<button class="tool" class:on={tool === t.name} title={t.name} onclick={() => (tool = t.name)}><Icon name={t.icon} size={16} /></button>
							{/each}
						</div>
						<div class="canvas-center">
							{#if a}
								<Icon name={kindIcon[a.kind]} size={40} />
								<div class="cc-title">{a.title}</div>
								<div class="cc-sub">{a.kind} canvas · {tool} tool · layer “{activeLayer}”</div>
							{:else}
								<div class="cc-sub">No page open</div>
							{/if}
						</div>
						<div class="navtools glass-bar">
							<button class="tool" title="Zoom in" onclick={() => (zoom = Math.min(800, zoom + 25))}><Icon name="zoomin" size={16} /></button>
							<button class="tool" title="Zoom out" onclick={() => (zoom = Math.max(10, zoom - 25))}><Icon name="zoomout" size={16} /></button>
							<button class="tool" title="Fit" onclick={() => (zoom = 100)}><Icon name="fit" size={16} /></button>
							<button class="tool" title="Pan"><Icon name="pan" size={16} /></button>
						</div>
					</main>
				</section>
				{#if panes.length === 2 && pi === 0}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="vsplitter" title="Drag to resize" onpointerdown={startSplitDrag}></div>
				{/if}
			{/each}
		</div>

		<!-- Right sidebar -->
		{#if rightOpen}
			<aside class="side right">
				<div class="side-head">
					<button class="side-collapse" title="Collapse" onclick={() => (rightOpen = false)}><Icon name="chevronRight" size={13} /></button>
					<div class="side-title">Properties</div>
				</div>
				<div class="side-body">
					<Test />
					<div class="prop-sec">GENERAL</div>
					<div class="prop"><span>Name</span><input value={active?.title ?? ''} /></div>
					<div class="prop"><span>Type</span><input value={active?.kind ?? ''} readonly /></div>
					<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
					<div class="prop-sec">GEOMETRY</div>
					<div class="prop"><span>X</span><input value="1240" /></div>
					<div class="prop"><span>Y</span><input value="880" /></div>
					<div class="prop"><span>Width</span><input value="600" /></div>
					<div class="prop"><span>Height</span><input value="1000" /></div>
					<div class="prop-sec">STYLE</div>
					<div class="prop"><span>Color</span><input value="ByLayer" readonly /></div>
					<div class="prop"><span>Line</span><input value="0.25 mm" /></div>

				</div>
			</aside>
		{:else}
			<button class="rail right" title="Show panel" onclick={() => (rightOpen = true)}>
				<Icon name="chevronLeft" size={13} /><Icon name="settings" size={15} />
			</button>
		{/if}
	</div>

	<!-- Status bar -->
	<footer class="statusbar">
		<div class="layout-tabs">
			<button class:on={layout === 'model'} onclick={() => (layout = 'model')}>Model</button>
			<button class:on={layout === 'sheet'} onclick={() => (layout = 'sheet')}>Sheet A3</button>
		</div>
		<div class="coords">{cx}, {cy} mm</div>
		<div class="toggles">
			{#each Object.keys(toggles) as k (k)}
				<button class:on={toggles[k]} onclick={() => (toggles[k] = !toggles[k])}>{k}</button>
			{/each}
		</div>
		<div class="sb-spacer"></div>
		<div class="zoom">
			<button onclick={() => (zoom = Math.max(10, zoom - 25))}>−</button>
			<span>{zoom}%</span>
			<button onclick={() => (zoom = Math.min(800, zoom + 25))}>+</button>
			<button class="fit" onclick={() => (zoom = 100)}>Fit</button>
		</div>
	</footer>
</div>

<style>
	/* Kestrel design tokens (scoped) — dark default, light override. */
	.shell {
		--bg:#18212d; --title:#131b26; --panel:#1b2532; --panel2:#202c3a; --tabbar:#212c3a;
		--canvas:#121c29; --hover:#2c3b4d; --active:#244852; --accent:#5ac6d2; --accent-dim:#304d58;
		--text:#dce4ed; --muted:#8b9aab; --faint:#63768b; --line:#344151; --line-soft:#2a3645; --input:#17212e;
		--danger:#ed8d92;
		height:100dvh; display:flex; flex-direction:column; overflow:hidden;
		background:var(--bg); color:var(--text);
		font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif; font-size:12px;
	}
	.shell[data-mock-theme='light'] {
		--bg:#e3e9ef; --title:#f7f9fb; --panel:#f5f7fa; --panel2:#edf1f6; --tabbar:#f3f6f9;
		--canvas:#edf2f6; --hover:#e3ebf3; --active:#d6eef2; --accent:#157a8b; --accent-dim:#b9dce4;
		--text:#23374a; --muted:#697e91; --faint:#8191a2; --line:#ced8e2; --line-soft:#e0e6ed; --input:#fff;
		--danger:#bd4951;
	}
	.shell :global(button) { cursor:pointer; color:inherit; }

	/* Titlebar */
	.titlebar { height:36px; flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
		background:var(--title); border-bottom:1px solid var(--line-soft); padding:0 8px; }
	.tb-left, .tb-right { display:flex; align-items:center; gap:4px; }
	.tb-icon { display:inline-flex; align-items:center; justify-content:center; width:26px; height:24px;
		border-radius:4px; color:var(--muted); }
	.tb-icon:hover { background:var(--hover); color:var(--text); }
	.brand { margin-left:6px; letter-spacing:.02em; color:var(--muted); }
	.brand b { color:var(--text); font-weight:600; }
	.mock-badge { margin-left:8px; font-size:8px; letter-spacing:.1em; color:var(--accent);
		border:1px solid var(--accent-dim); border-radius:3px; padding:1px 5px; }
	.tb-title { color:var(--text); font-weight:500; }

	/* Menubar */
	.menubar { position:relative; z-index:45; height:30px; flex:0 0 auto; display:flex; align-items:stretch; gap:1px;
		background:var(--panel); border-bottom:1px solid var(--line-soft); padding:0 4px; }
	.menu-backdrop { position:fixed; inset:0; z-index:40; background:none; border:none; }
	.menu-wrap { position:relative; display:flex; align-items:stretch; }
	.menu-btn { padding:0 10px; font-size:12px; color:var(--text); border-radius:4px; background:none; border:none; }
	.menu-btn:hover, .menu-btn.open { background:var(--hover); }
	.menu-pop { position:absolute; top:100%; left:0; min-width:170px; z-index:50; margin-top:2px;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 15px 40px #0006; padding:4px; }
	.menu-item { display:block; width:100%; text-align:left; padding:5px 9px; font-size:12px; border-radius:4px; background:none; border:none; color:var(--text); }
	.menu-item:hover { background:var(--active); }
	.menu-sep { height:1px; background:var(--line-soft); margin:4px 6px; }

	/* Tab bar */
	.tabbar { height:34px; flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
		background:var(--tabbar); border-bottom:1px solid var(--line); padding:0 6px; }
	.tabs { flex:1 1 auto; min-width:0; display:flex; align-items:stretch; gap:2px; height:100%;
		overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none; }
	.tabs::-webkit-scrollbar { display:none; }
	.tab { position:relative; display:flex; align-items:center; gap:6px; padding:0 8px 0 10px; height:100%;
		border:none; background:none; color:var(--muted); border-top:2px solid transparent; white-space:nowrap;
		cursor:pointer; user-select:none; }
	.tab:hover { background:var(--hover); color:var(--text); }
	.tab.active { color:var(--text); background:var(--bg); border-top-color:var(--accent-dim); }
	/* The active tab's accent reads bright in the focused pane, dimmed in the other —
	   so focus shows through the tab indicator itself (no strip-wide bar over it). */
	.pane.focused .tab.active { border-top-color:var(--accent); }
	.tab-name { font-size:12px; }
	.dirty { color:var(--accent); font-size:14px; line-height:0; }
	.tab-x { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; color:var(--faint); background:none; border:none; }
	.tab-x:hover { background:var(--line); color:var(--text); }
	.tabbar-right { position:relative; z-index:46; flex:0 0 auto; display:flex; align-items:center; gap:1px; padding:0 2px; border-left:1px solid var(--line-soft); }
	.strip-btn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:24px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.strip-btn:hover { background:var(--hover); color:var(--text); }
	.tab-menu { position:absolute; top:100%; right:0; z-index:50; margin-top:2px; min-width:190px; max-height:60vh; overflow-y:auto;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 15px 40px #0006; padding:4px; }
	.tab-menu-item { display:flex; align-items:center; gap:7px; width:100%; padding:5px 8px; border-radius:4px; color:var(--text); background:none; border:none; font-size:12px; text-align:left; }
	.tab-menu-item:hover { background:var(--hover); }
	.tab-menu-item.on { background:var(--active); }
	.tab-menu-sep { height:1px; background:var(--line-soft); margin:4px 6px; }

	/* Body */
	.body { flex:1 1 auto; display:flex; min-height:0; }

	/* Editor area — 1 pane, or 2 split vertically with a draggable divider */
	.editor-area { flex:1 1 auto; display:flex; min-width:0; }
	.pane { display:flex; flex-direction:column; min-width:0; min-height:0; }
	.vsplitter { flex:0 0 auto; width:5px; cursor:col-resize; background:var(--line); }
	.vsplitter:hover { background:var(--accent-dim); }

	/* Sidebars */
	.side { flex:0 0 auto; display:flex; flex-direction:column; background:var(--panel); min-height:0; }
	.side.left { width:220px; border-right:1px solid var(--line); }
	.side.right { width:250px; border-left:1px solid var(--line); }
	.side-head { display:flex; align-items:center; gap:6px; height:30px; padding:0 6px; border-bottom:1px solid var(--line-soft); }
	.side-tabs { display:flex; gap:2px; flex:1; }
	.side-tabs button { padding:3px 8px; font-size:11px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.side-tabs button.on { background:var(--active); color:var(--text); }
	.side-title { flex:1; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
	.side-collapse { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.side-collapse:hover { background:var(--hover); color:var(--text); }
	.side-body { flex:1; overflow-y:auto; padding:5px; }
	.side-foot { flex:0 0 auto; padding:5px 8px; font-size:10px; color:var(--faint); border-top:1px solid var(--line-soft); background:linear-gradient(145deg,var(--panel2),var(--panel)); }

	.grow { flex:1; } .txt { text-align:left; background:none; border:none; color:inherit; font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.layer-row { display:flex; align-items:center; gap:7px; padding:4px 6px; border-radius:5px; }
	.layer-row:hover { background:var(--hover); }
	.layer-row.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dot { width:11px; height:11px; border-radius:3px; flex:0 0 auto; box-shadow:0 0 0 1px #0003 inset; }
	.mini { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.mini:hover { background:var(--line); color:var(--text); }
	.mini.off { opacity:.4; } .mini.warn { color:var(--danger); }
	.grp-label { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:6px 6px 3px; }
	.page-row { display:flex; align-items:center; gap:7px; width:100%; padding:5px 6px; border-radius:5px; color:var(--text); background:none; border:none; }
	.page-row:hover { background:var(--hover); }
	.page-row.active { background:var(--active); color:var(--text); }

	.rail { flex:0 0 auto; width:28px; display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:8px;
		background:var(--panel); color:var(--muted); border:none; }
	.rail.left { border-right:1px solid var(--line); } .rail.right { border-left:1px solid var(--line); }
	.rail:hover { background:var(--hover); color:var(--text); }

	/* Canvas */
	.canvas { position:relative; flex:1 1 auto; min-width:0; min-height:0; background:var(--canvas);
		background-image:radial-gradient(var(--line) 1px, transparent 1px); background-size:22px 22px;
		display:flex; align-items:center; justify-content:center; overflow:hidden; }
	.canvas-center { display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--faint); pointer-events:none; }
	.cc-title { font-size:18px; color:var(--muted); font-weight:600; }
	.cc-sub { font-size:12px; color:var(--faint); }
	.glass-bar { position:absolute; display:flex; gap:2px; padding:4px; border-radius:8px;
		background:color-mix(in srgb, var(--panel) 82%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0004; }
	.floattools { top:12px; left:12px; flex-direction:column; }
	.navtools { bottom:12px; right:12px; flex-direction:column; }
	.tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:6px; color:var(--muted); background:none; border:none; }
	.tool:hover { background:var(--hover); color:var(--text); }
	.tool.on { background:var(--active); color:var(--accent); }

	/* Properties */
	.prop-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.prop { display:grid; grid-template-columns:64px 1fr; align-items:center; gap:6px; padding:2px 4px; }
	.prop span { color:var(--muted); font-size:11px; }
	.prop input { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; font-family:Consolas,monospace; min-width:0; }
	.prop input:read-only { color:var(--muted); }
	.prop input:focus { outline:none; border-color:var(--accent); }

	/* Status bar */
	.statusbar { height:26px; flex:0 0 auto; display:flex; align-items:center; gap:2px;
		background:var(--title); border-top:1px solid var(--line); padding:0 6px; font-size:11px; color:var(--muted); }
	.layout-tabs { display:flex; gap:2px; }
	.layout-tabs button { padding:2px 9px; border-radius:4px; color:var(--muted); background:none; border:none; font-size:11px; }
	.layout-tabs button.on { background:var(--active); color:var(--text); box-shadow:inset 0 -2px 0 var(--accent); }
	.coords { font-family:Consolas,monospace; padding:0 10px; color:var(--text); min-width:96px; }
	.toggles { display:flex; gap:2px; }
	.toggles button { padding:2px 7px; border-radius:4px; font-size:10px; letter-spacing:.04em; color:var(--faint); background:none; border:1px solid transparent; }
	.toggles button:hover { background:var(--hover); }
	.toggles button.on { color:var(--accent); background:var(--active); border-color:var(--accent-dim); }
	.sb-spacer { flex:1; }
	.zoom { display:flex; align-items:center; gap:4px; }
	.zoom button { width:20px; height:18px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.zoom button.fit { width:auto; padding:0 7px; }
	.zoom button:hover { background:var(--hover); color:var(--text); }
	.zoom span { color:var(--text); min-width:38px; text-align:center; }
</style>
