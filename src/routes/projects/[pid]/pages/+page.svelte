<script lang="ts">
	// ── Kestrel-layout workspace MOCKUP (kestrel-adoption.md, feel/flow study) ──
	// Self-contained prototype: titlebar · menubar · canvas tabs · collapsible
	// left/right sidebars · status bar. No ribbon, no command history (later).
	// Everything is mock data + local state — nothing touches Firestore. Styled
	// with Kestrel's own tokens scoped to .shell, so it looks like Kestrel in
	// both light/dark regardless of the app theme (toggle in its titlebar).
	import { Icon } from '$lib'
	import { flushSync, tick } from 'svelte'
	import { page } from '$app/state'
	import PaperPage from './parts/PaperPage.svelte'
	import Viewport, { type Ent } from './ui/Viewport.svelte'
	import DrawingNavigator from './parts/DrawingNavigator.svelte'
	import LayersPanel from './parts/LayersPanel.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import { panzoom } from './ui/panzoom'
	import { PAPER_W, PAPER_H } from './constants'

	// Which pane (if any) has its viewport activated — groundwork for editing/CAD
	// tools inside a sheet's viewport. Null = no active viewport.
	let activeVpPane = $state<number | null>(null)

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
	type View = { zoom: number; x: number; y: number }
	// Each pane (view) remembers its own tool + its own canvas (paper-space) pan/zoom.
	let panes = $state<{ id: string; activeId: string; tool: string; canvasView: View }[]>([{ id: 'p1', activeId: 't2', tool: 'Select', canvasView: { zoom: 1, x: 0, y: 0 } }])
	let focused = $state(0)      // which pane new tabs / sidebar actions target
	let canvasEls = $state<(HTMLElement | undefined)[]>([])   // each pane's .canvas, for navFit
	let splitFrac = $state(0.5)  // pane 0 width fraction when split
	let paneSeq = 1
	let active = $derived(tabs.find(t => t.id === panes[focused]?.activeId) ?? null)

	// Per-DOCUMENT state (keyed by tab id): drawn entities, selection, and the
	// viewport's own pan/zoom — so all three persist across tab switches and show
	// wherever the doc is open. (Tool + canvas pan/zoom are per view, above.)
	let docEnts = $state<Record<string, Ent[]>>({})
	let docSel = $state<Record<string, string[]>>({})
	let docView = $state<Record<string, View>>({})
	const entsOf = (id: string) => docEnts[id] ?? []
	const selOf = (id: string) => docSel[id] ?? []
	const viewOf = (id: string) => docView[id] ?? { zoom: 1, x: 0, y: 0 }
	function addEnt(id: string, e: Ent) { docEnts = { ...docEnts, [id]: [...(docEnts[id] ?? []), e] } }
	function updateEnt(id: string, e: Ent) { docEnts = { ...docEnts, [id]: (docEnts[id] ?? []).map(x => x.id === e.id ? e : x) } }
	function setSel(id: string, ids: string[]) { docSel = { ...docSel, [id]: ids } }
	function setView(id: string, v: View) { docView = { ...docView, [id]: v } }
	// Selected entities of the focused document (for the Properties panel).
	let selEnts = $derived.by(() => {
		const a = tabs.find(t => t.id === panes[focused]?.activeId); if (!a) return []
		const ids = new Set(docSel[a.id] ?? [])
		return (docEnts[a.id] ?? []).filter(e => ids.has(e.id))
	})
	function dropDoc(id: string) {   // free a closed doc's per-document state
		const de = { ...docEnts }, ds = { ...docSel }, dv = { ...docView }
		delete de[id]; delete ds[id]; delete dv[id]
		docEnts = de; docSel = ds; docView = dv
	}

	function openTab(id: string, pane = focused) {
		const p = panes[pane]; if (!p) return
		p.activeId = id; focused = pane   // selection now lives per doc, so it's preserved
	}
	function addTab(kind: Kind = 'plan', title?: string) {
		const id = 't' + ++seq
		tabs = [...tabs, { id, title: title ?? `Untitled ${seq}`, kind, dirty: false }]
		if (panes[focused]) panes[focused].activeId = id
	}
	function closeTab(id: string, e?: Event) {
		e?.stopPropagation()
		const i = tabs.findIndex(t => t.id === id); if (i < 0) return
		tabs = tabs.filter(t => t.id !== id)
		dropDoc(id)
		// Point any pane that showed this tab at a neighbour, or '' → the "No page open"
		// empty state (don't auto-spawn an Untitled tab on the last close).
		const fallback = tabs[Math.max(0, i - 1)]?.id ?? ''
		for (const p of panes) if (p.activeId === id) p.activeId = fallback
	}
	// Vertical split: open a second pane showing a different tab; toggle focus if already split.
	function splitVertical() {
		if (panes.length >= 2) { focused = 1; return }
		const cur = panes[0].activeId
		const other = tabs.find(t => t.id !== cur)?.id ?? cur
		panes = [...panes, { id: 'p' + ++paneSeq, activeId: other, tool: 'Select', canvasView: { zoom: 1, x: 0, y: 0 } }]
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
	let rightTab = $state<'layers' | 'props'>('layers')   // right sidebar: Layers | Properties (reference layout)

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
		else if (item === 'Fit') navFit()
		else if (item === 'Zoom In') navZoom(1.25)
		else if (item === 'Zoom Out') navZoom(0.8)
		else if (item === 'Split Editor') splitVertical()
		else if (item === 'Unsplit') closePane(1)
		else if (item === 'Print…') window.print()
		// everything else is a mock no-op
	}

	// Drawing Navigator (left) → open the picked drawing/view as a tab (focus if already open).
	function openDrawing(d: { title: string; kind: Kind }) {
		const existing = tabs.find(t => t.title === d.title)
		if (existing) openTab(existing.id)
		else addTab(d.kind, d.title)
	}
	let activeLayer = $state('Annotations')   // shown in the Properties panel (mock)

	// Canvas · tools + pointer + zoom
	const TOOLS = [
		{ icon: 'k-select', name: 'Select' },
		{ icon: 'k-line', name: 'Line' },
		{ icon: 'rectangle', name: 'Rectangle' },
		{ icon: 'circle', name: 'Circle' },
		{ icon: 'dimension', name: 'Dimension' },
		{ icon: 'k-text', name: 'Text' },
	]
	let cx = $state(0), cy = $state(0)
	function onCanvasMove(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
		cx = Math.round(e.clientX - r.left); cy = Math.round(e.clientY - r.top)
	}

	// ── canvas (paper-space) pan/zoom — one pane's canvasView, CSS transform ──
	function canvasPan(pane: { canvasView: View }, dx: number, dy: number) {
		pane.canvasView.x += dx; pane.canvasView.y += dy
	}
	function canvasZoom(pane: { canvasView: View }, el: HTMLElement, f: number, clientX: number, clientY: number) {
		const r = el.getBoundingClientRect(), mx = clientX - r.left, my = clientY - r.top
		const v = pane.canvasView, nz = Math.min(8, Math.max(0.1, v.zoom * f)), ratio = nz / v.zoom
		v.x = mx - (mx - v.x) * ratio; v.y = my - (my - v.y) * ratio; v.zoom = nz
	}
	// Nav toolbar / status zoom act on the active viewport if one is active, else the canvas.
	let dispZoom = $derived.by(() => {
		const p = panes[focused]; if (!p) return 100
		return Math.round((activeVpPane === focused ? viewOf(p.activeId).zoom : p.canvasView.zoom) * 100)
	})
	function navZoom(f: number) {
		const p = panes[focused]; if (!p) return
		if (activeVpPane === focused) { const v = viewOf(p.activeId); setView(p.activeId, { ...v, zoom: Math.min(8, Math.max(0.25, v.zoom * f)) }) }
		else { const v = p.canvasView; v.zoom = Math.min(8, Math.max(0.1, v.zoom * f)) }
	}
	function navFit() {
		const p = panes[focused]; if (!p) return
		if (activeVpPane === focused) { setView(p.activeId, { zoom: 1, x: 0, y: 0 }); return }
		// Frame the fixed-size paper in the pane (transform-origin 0 0, paper centred in the
		// canvas box): pick a zoom that fits with margin, then translate to re-centre.
		const a2 = tabs.find(t => t.id === p.activeId)
		const canvas = canvasEls[focused]
		if (a2?.kind === 'sheet' && canvas && canvas.clientWidth > 50) {
			const r = canvas.getBoundingClientRect()
			const z = Math.min(r.width / PAPER_W, r.height / PAPER_H) * 0.9
			p.canvasView = { zoom: z, x: r.width * (1 - z) / 2, y: r.height * (1 - z) / 2 }
		} else {
			p.canvasView = { zoom: 1, x: 0, y: 0 }
		}
	}
	// Fit the sheet once on load so the fixed-size paper starts framed, not clipped.
	let didFit = false
	$effect(() => {
		if (didFit) return
		didFit = true
		tick().then(navFit)
	})

	// ── Print — on Ctrl+P / window.print(), an @media-print stylesheet shows ONLY the
	// focused sheet's A3 paper: it hides all UI + the selection highlight and pins the
	// paper to the page. The stylesheet lives in the document at all times (inert on
	// screen); beforeprint just marks the focused paper and clears the selection.
	// (Paper size is A3 landscape via @page; the printer's own default paper must be set
	// to A3 for a physical-printer destination — @page sizes the layout, not the printer.)
	let savedSel: Record<string, string[]> | null = null
	const PRINT_ID = 'pages-print-style'
	const PRINT_CSS = `@page { size: A3 landscape; margin: 0; }
@media print {
	html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
	.canvas-content { transform: none !important; }   /* so fixed positions to the page, not a transformed ancestor */
	body * { visibility: hidden !important; }
	.print-target, .print-target * { visibility: visible !important; }
	.print-target { position: fixed !important; inset: 0 !important; width: 420mm !important; height: 297mm !important; margin: 0 !important; box-shadow: none !important; background:#fff !important; }
	.print-target .vp { border: none !important; box-shadow: none !important; }
	.print-target .vp-tag, .print-target .vp-badge { display: none !important; }
}`
	function applyPrint() {
		savedSel = { ...docSel }
		docSel = {}   // selection is screen-only; clear so no highlight prints
		const target = document.querySelector('.pane.focused .paper')
			?? document.querySelector('.pane.focused .vp')
		target?.classList.add('print-target')
		flushSync()   // apply the cleared selection to the DOM before the print snapshot
	}
	function removePrint() {
		document.querySelectorAll('.print-target').forEach(el => el.classList.remove('print-target'))
		if (savedSel) { docSel = savedSel; savedSel = null }
	}
	$effect(() => {
		let style = document.getElementById(PRINT_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_ID; document.head.appendChild(style) }
		style.textContent = PRINT_CSS
		window.addEventListener('beforeprint', applyPrint)
		window.addEventListener('afterprint', removePrint)
		return () => {
			window.removeEventListener('beforeprint', applyPrint)
			window.removeEventListener('afterprint', removePrint)
			removePrint()
			document.getElementById(PRINT_ID)?.remove()
		}
	})

	// Status bar
	// Model = drawing fills the pane (no paper); Sheet = the A3 paper with the viewport frame.
	let layout = $state<'model' | 'sheet'>('sheet')
	let toggles = $state<Record<string, boolean>>({ GRID: true, SNAP: true, ORTHO: false, OSNAP: true, LWT: false })
	// AutoCAD mode: wheel = zoom, draw = two clicks. Off = EOS: wheel = pan, draw = press-drag.
	let acadMode = $state(true)
	// Active-viewport content pan/zoom (Sheets-style): OFF by default, so wheel/drag over an
	// active viewport pans/zooms the CANVAS; toggle on to pan/zoom the model inside it.
	let navContent = $state(false)

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

		<!-- Left sidebar: Drawing Navigator (location tree → drawings/views) -->
		{#if leftOpen}
			<aside class="side left">
				<DrawingNavigator onopen={openDrawing} oncollapse={() => (leftOpen = false)} activeTitle={active?.title ?? ''} />
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<main class="canvas" bind:this={canvasEls[pi]} onpointermove={onCanvasMove}
						use:panzoom={{ enabled: () => !!a, wheelZoom: () => acadMode, onpan: (dx, dy) => canvasPan(p, dx, dy), onzoom: (f, x, y, node) => canvasZoom(p, node, f, x, y) }}>
						<div class="floattools glass-bar" class:dim={a && activeVpPane !== pi}>
							{#each TOOLS as t (t.name)}
								<button class="tool" class:on={p.tool === t.name} title={t.name} onclick={() => (p.tool = t.name)}><Icon name={t.icon} size={16} /></button>
							{/each}
						</div>
						<!-- Pane-level exit: fixed on screen (outside the zoomed content), so a viewport
						     can always be left even when zoomed right in and its own corner is off-screen. -->
						{#if activeVpPane === pi}
							<div class="vp-active-bar glass-bar">
								<button class="vab-btn" onclick={() => (activeVpPane = null)} title="Exit viewport (Esc)">
									<Icon name="chevronLeft" size={14} /> Exit
								</button>
								<button class="vab-btn" class:on={navContent} onclick={() => (navContent = !navContent)}
									title="Pan/zoom the model inside the viewport (off = pan/zoom the sheet)">
									<Icon name="pan" size={14} /> Pan content
								</button>
							</div>
						{/if}
						{#key p.activeId}
							<div class="canvas-content" style:transform="translate({p.canvasView.x}px, {p.canvasView.y}px) scale({p.canvasView.zoom})">
								{#if a?.kind === 'sheet' && layout === 'sheet'}
									<PaperPage title={a.title} tool={p.tool} acad={acadMode} navContent={navContent} grid={toggles.GRID} entities={entsOf(a.id)} sel={selOf(a.id)} view={viewOf(a.id)} active={activeVpPane === pi}
										onactivate={() => (activeVpPane = pi)}
										ondeactivate={() => { if (activeVpPane === pi) activeVpPane = null }}
										onadd={(e) => addEnt(a.id, e)} onupdate={(e) => updateEnt(a.id, e)} onselect={(ids) => setSel(a.id, ids)} onview={(v) => setView(a.id, v)} />
								{:else if a}
									<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
									<div class="vp-fill" ondblclick={() => { if (activeVpPane === pi) activeVpPane = null }}>
										<Viewport kind={a.kind === 'elevation' ? 'model' : 'floorplan'} label={a.title} tool={p.tool} acad={acadMode} navContent={navContent} grid={toggles.GRID} entities={entsOf(a.id)} sel={selOf(a.id)} view={viewOf(a.id)}
											active={activeVpPane === pi} onactivate={() => (activeVpPane = pi)} ondeactivate={() => { if (activeVpPane === pi) activeVpPane = null }}
											onadd={(e) => addEnt(a.id, e)} onupdate={(e) => updateEnt(a.id, e)} onselect={(ids) => setSel(a.id, ids)} onview={(v) => setView(a.id, v)} />
									</div>
								{:else}
									<div class="canvas-center">
										<Icon name="fileText" size={22} />
										<div class="cc-title">No page open</div>
										<div class="cc-sub">Pick a drawing from the sidebar, or</div>
										<button class="cc-new" onpointerdown={(e) => e.stopPropagation()} onclick={() => { focused = pi; addTab() }}><Icon name="plus" size={13} /> New page</button>
									</div>
								{/if}
							</div>
						{/key}
						<div class="navtools glass-bar">
							<button class="tool" title="Zoom in" onclick={() => navZoom(1.25)}><Icon name="zoomin" size={16} /></button>
							<button class="tool" title="Zoom out" onclick={() => navZoom(0.8)}><Icon name="zoomout" size={16} /></button>
							<button class="tool" title="Fit" onclick={() => navFit()}><Icon name="fit" size={16} /></button>
							<button class="tool" title="Pan (right-drag)"><Icon name="pan" size={16} /></button>
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
					<div class="side-tabs rt">
						<button class:on={rightTab === 'layers'} onclick={() => (rightTab = 'layers')}>Layers</button>
						<button class:on={rightTab === 'props'} onclick={() => (rightTab = 'props')}>Properties</button>
					</div>
				</div>
				{#if rightTab === 'layers'}
					<LayersPanel />
				{:else}
					<PropertiesPanel ents={selEnts} onupdate={(e) => { if (active) updateEnt(active.id, e) }}
						pageTitle={active?.title ?? ''} pageKind={active?.kind ?? ''} {activeLayer} />
				{/if}
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
			<button class:on={acadMode} title="AutoCAD interactions: wheel zooms, draw with two clicks (off = EOS: wheel pans, press-drag to draw)" onclick={() => (acadMode = !acadMode)}>ACAD</button>
		</div>
		<div class="sb-spacer"></div>
		<div class="zoom">
			<button onclick={() => navZoom(0.8)}>−</button>
			<span>{dispZoom}%</span>
			<button onclick={() => navZoom(1.25)}>+</button>
			<button class="fit" onclick={() => navFit()}>Fit</button>
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

	/* Light mode: keep the titlebar dark (like EOS's slate-800 header), with
	   light text for contrast. Status bar deliberately left as the theme default. */
	.shell[data-mock-theme='light'] .titlebar { background:#1e293b; border-bottom-color:#0f172a; }
	.shell[data-mock-theme='light'] .titlebar .tb-icon { color:#94a3b8; }
	.shell[data-mock-theme='light'] .titlebar .tb-icon:hover { background:#334155; color:#fff; }
	.shell[data-mock-theme='light'] .titlebar .brand { color:#94a3b8; }
	.shell[data-mock-theme='light'] .titlebar .brand b { color:#f1f5f9; }
	.shell[data-mock-theme='light'] .titlebar .tb-title { color:#e2e8f0; }
	.shell[data-mock-theme='light'] .titlebar .mock-badge { color:#5ac6d2; border-color:#3b556b; }

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
	.side-collapse { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.side-collapse:hover { background:var(--hover); color:var(--text); }
	.side-body { flex:1; overflow-y:auto; padding:5px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.side-body::-webkit-scrollbar { width:9px; }
	.side-body::-webkit-scrollbar-track { background:transparent; }
	.side-body::-webkit-scrollbar-thumb { background:var(--line); border-radius:6px; border:3px solid transparent; background-clip:padding-box; }
	.side-body:hover::-webkit-scrollbar-thumb { background:var(--faint); background-clip:padding-box; }

	.grow { flex:1; } .txt { text-align:left; background:none; border:none; color:inherit; font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

	.rail { flex:0 0 auto; width:28px; display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:8px;
		background:var(--panel); color:var(--muted); border:none; }
	.rail.left { border-right:1px solid var(--line); } .rail.right { border-left:1px solid var(--line); }
	.rail:hover { background:var(--hover); color:var(--text); }

	/* Canvas */
	.canvas { position:relative; flex:1 1 auto; min-width:0; min-height:0; background:var(--canvas);
		background-image:radial-gradient(var(--line) 1px, transparent 1px); background-size:22px 22px;
		display:flex; align-items:center; justify-content:center; overflow:hidden; }
	.canvas-center { display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--faint); pointer-events:none; }
	.canvas-center :global(svg) { color:var(--faint); margin-bottom:2px; }
	.cc-title { font-size:15px; color:var(--muted); font-weight:600; }
	.cc-sub { font-size:12px; color:var(--faint); }
	.cc-new { pointer-events:auto; margin-top:6px; display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
		font-size:12px; border-radius:6px; color:var(--text); background:var(--panel2); border:1px solid var(--line); }
	.cc-new:hover { background:var(--hover); border-color:var(--accent-dim); }
	.glass-bar { position:absolute; display:flex; gap:2px; padding:4px; border-radius:8px;
		background:color-mix(in srgb, var(--panel) 82%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0004; }
	.canvas-content { position:absolute; inset:0; transform-origin:0 0; }
	.vp-fill { position:absolute; inset:0; padding:14px; }
	/* Tools/nav sit above the paper/viewport regardless of DOM order. */
	.floattools, .navtools { z-index:5; }
	.floattools { top:12px; left:12px; flex-direction:column; transition:opacity .15s; }
	.floattools.dim { opacity:.4; }
	.floattools.dim:hover { opacity:.85; }
	.navtools { bottom:12px; right:12px; flex-direction:column; }
	.vp-active-bar { top:12px; left:50%; transform:translateX(-50%); z-index:6; align-items:center; gap:2px; padding:3px; }
	.vab-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; min-height:30px; border-radius:6px;
		font-size:12px; font-weight:600; color:var(--muted); background:none; border:none; }
	.vab-btn:hover { background:var(--hover); color:var(--text); }
	.vab-btn.on { background:var(--active); color:var(--accent); }
	.tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:6px; color:var(--muted); background:none; border:none; }
	.tool:hover { background:var(--hover); color:var(--text); }
	.tool.on { background:var(--active); color:var(--accent); }

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
