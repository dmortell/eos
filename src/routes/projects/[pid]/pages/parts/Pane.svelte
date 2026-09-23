<script lang="ts">
	// ONE editor pane (R9, review.md §R9) — split out of +page.svelte's `{#each session.panes}` loop
	// verbatim: tab strip + floating tool strip + active-viewport bar + canvas (PaperPage or Viewport) +
	// nav tools + view gizmos + the pane-local status chip. +page.svelte still OWNS every piece of state
	// this reads/writes (session, groupTool, openGroup, guideVert, navContent, …) and every doc/view
	// accessor (framesOf, viewOf, vpEditor, …) — this component is a pure RENDER of one pane, not a new
	// state owner, so behaviour is unchanged; every external reference below is a prop, 1:1 with what the
	// inline block used to close over directly.
	import { Icon } from '$lib'
	import { tick } from 'svelte'
	import Viewport, { type Env, type VpOn } from '../ui/Viewport.svelte'
	import PaperPage from './PaperPage.svelte'
	import ToolStrip from './ToolStrip.svelte'
	import ViewGizmos from './ViewGizmos.svelte'
	import { panzoom } from '../ui/panzoom'
	import type { Editor } from '../ui/editor'
	import { type Proj, type SheetFrame, type Kind, type Tab, type WorkPane, type View, type StripItem, SCALES } from '../types'
	import type { PaperSize } from '../constants'
	import type { Ent } from '../ui/geometry'
	import { selStore } from '../selStore.svelte'
	import { selClear } from '../ui/selection'
	import { FLOOR_MODEL_ID } from '../3dview/models.svelte'

	let {
		pane, pi, focused, splitFrac, panesCount, tabs, kindIcon, tabMenuOpen, statusText, acadMode,
		navContent = $bindable(), guideVert = $bindable(), openGroup = $bindable(), groupTool = $bindable(),
		STRIP, iconOf,
		onFocus, onOpenTab, onPromoteTab, onCloseTab, onAddTab, onToggleTabMenu, onPickFromMenu, onSplitRight, onClosePane,
		onTool, onToggleLayout, onCanvasEl,
		activeVpOf, isVpActive, deactivateVp, onCanvasMove, canvasPan, canvasZoomFn,
		framesOf, scaleOf, updateFrame, setScale, fitPane, canvasViewOf, entsOf, entsForModel, paperEditor,
		viewOf, envFor, orbitOf, vpFrameView, vpEditor, seedFrame, addFrame, commitFrame, paperOf, paperDimsOf,
		rev, revisions, vpView, projOf, gizmoProj, gizmoSet, navZoom, navFit,
	}: {
		pane: WorkPane; pi: number; focused: boolean; splitFrac: number; panesCount: number; tabs: Tab[]
		kindIcon: Record<Kind, string>; tabMenuOpen: boolean; statusText: string; acadMode: boolean
		navContent: boolean; guideVert: boolean; openGroup: string | null; groupTool: Record<string, string>
		STRIP: StripItem[]; iconOf: (tool: string) => string
		onFocus: () => void; onOpenTab: (id: string, pane: number) => void; onPromoteTab: (id: string) => void
		onCloseTab: (id: string, e?: Event) => void; onAddTab: () => void; onToggleTabMenu: () => void
		onPickFromMenu: (id: string, pane: number) => void; onSplitRight: () => void; onClosePane: (idx: number) => void
		// R9 follow-up (eos-07 review of commit 1): `pane` is a plain (non-bindable) prop — Pane.svelte must
		// never write through it directly (`pane.tool = …` etc. is an ownership violation Svelte 5 flags at
		// runtime, even though it "works" via the shared $state proxy). Every write goes back up through a
		// callback instead, so +page.svelte (the actual owner of `session.panes`) does its own mutation.
		onTool: (t: string) => void; onToggleLayout: () => void; onCanvasEl: (el: HTMLElement | undefined) => void
		activeVpOf: (tabId: string) => string | null; isVpActive: (id?: string) => boolean; deactivateVp: (id?: string) => void
		onCanvasMove: () => void
		canvasPan: (pane: { id: string; activeId: string }, dx: number, dy: number) => void
		canvasZoomFn: (pane: { id: string; activeId: string }, el: HTMLElement, f: number, clientX: number, clientY: number) => void
		framesOf: (tabId: string) => SheetFrame[]; scaleOf: (id?: string) => string
		updateFrame: (tabId: string, id: string, patch: Partial<SheetFrame>) => void
		setScale: (id: string | undefined, s: string) => void
		fitPane: (idx: number) => void
		canvasViewOf: (pane: { id: string; activeId: string }) => View
		entsOf: (id: string) => Ent[]; entsForModel: (mid?: number) => Ent[]
		paperEditor: (a: Tab) => Editor
		viewOf: (paneId: string, viewId: string, proj: Proj) => View
		envFor: (pane: { id: string; activeId: string }) => Env
		orbitOf: (paneId: string, viewId: string, proj: Proj) => { yaw: number; pitch: number }
		vpFrameView: (a: Tab, pane: { id: string; tool: string }, frame: SheetFrame) => VpOn
		vpEditor: (a: Tab, viewId: string) => Editor
		seedFrame: (tabId: string, x: number, y: number, w: number, h: number) => void
		addFrame: (tabId: string, x: number, y: number, w: number, h: number) => void
		commitFrame: (tabId: string, label: string) => void
		paperOf: (id?: string) => { size: PaperSize; landscape: boolean }
		paperDimsOf: (id?: string) => { w: number; h: number }
		rev: string; revisions: { name: string; note: string; snap: unknown; t: number }[]
		vpView: (a: Tab, pane: { id: string; tool: string }) => VpOn
		projOf: (pane: { id: string }, a: Tab | null) => Proj
		gizmoProj: (pane: { id: string }, a: Tab | null) => Proj
		gizmoSet: (pane: { id: string }, a: Tab | null, proj: Proj) => void
		navZoom: (f: number) => void; navFit: () => void
	} = $props()
	// A local mirror of the canvas element — `bind:this` on a PLAIN prop array index (`canvasEls[pi]`) is
	// the same ownership violation as `pane.tool = …`; mirror it locally and report it up via a callback
	// instead, so +page.svelte's own `canvasEls` array is the only thing that actually gets written.
	let canvasEl: HTMLElement | undefined = $state()
	$effect(() => { onCanvasEl(canvasEl) })

	// Pure, no closure — cheaper to redefine here than to thread through as two more props.
	const projKind = (p: Proj) => p as 'plan' | 'iso' | 'front' | 'rear' | 'left' | 'right'
	const fmtDate = (t?: number) => new Date(t ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

	const p = $derived(pane)   // local alias — matches the inline block's `p` from `{#each session.panes as p, pi}`
	const a = $derived(tabs.find((t) => t.id === p.activeId) ?? null)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pane" class:focused
	style:flex={panesCount === 1 ? '1 1 0' : `${pi === 0 ? splitFrac : 1 - splitFrac} 1 0`}
	onpointerdown={onFocus}>

	<!-- this pane's tab strip -->
	<div class="tabbar">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tabs" onwheel={(e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() } }}>
			{#each tabs as t (t.id)}
				<div class="tab" class:active={t.id === p.activeId} class:preview={t.preview} onclick={() => onOpenTab(t.id, pi)}
					ondblclick={() => onPromoteTab(t.id)}
					role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') onOpenTab(t.id, pi) }}>
					<Icon name={kindIcon[t.kind]} size={12} />
					<span class="tab-name">{t.title}</span>
					{#if t.dirty}<span class="dirty">•</span>{/if}
					<button class="tab-x" title="Close" onclick={(e) => onCloseTab(t.id, e)}><Icon name="close" size={11} /></button>
				</div>
			{/each}
		</div>
		<div class="tabbar-right">
			<button class="strip-btn" title="New page" onclick={() => { onFocus(); onAddTab() }}><Icon name="plus" size={14} /></button>
			<button class="strip-btn" title="All pages" onclick={(e) => { e.stopPropagation(); onFocus(); onToggleTabMenu() }}><Icon name="chevronDown" size={14} /></button>
			{#if panesCount === 1}
				<button class="strip-btn" title="Split editor right" onclick={onSplitRight}><Icon name="panels" size={14} /></button>
			{:else}
				<button class="strip-btn" title="Close this split" onclick={() => onClosePane(pi)}><Icon name="close" size={14} /></button>
			{/if}
			{#if tabMenuOpen}
				<div class="tab-menu">
					{#each tabs as t (t.id)}
						<button class="tab-menu-item" class:on={t.id === p.activeId} onclick={() => onPickFromMenu(t.id, pi)}>
							<Icon name={kindIcon[t.kind]} size={13} /><span class="grow txt">{t.title}</span>{#if t.dirty}<span class="dirty">•</span>{/if}
						</button>
					{/each}
					<div class="tab-menu-sep"></div>
					<button class="tab-menu-item" onclick={() => { onToggleTabMenu(); onFocus(); onAddTab() }}>
						<Icon name="plus" size={13} /><span class="grow txt">New page</span>
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- this pane's canvas -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<main class="canvas" bind:this={canvasEl} onpointermove={onCanvasMove}
		ondblclick={(e) => { if (a && !(e.target as Element).closest?.('.paper, button, .glass-bar, .vp-active-bar, .navtools, .floattools')) { const av = activeVpOf(a.id); if (av) deactivateVp(av); selStore.set(a.id, selClear()) } }}
		use:panzoom={{ enabled: () => !!a, wheelZoom: () => acadMode, onpan: (dx, dy) => canvasPan(p, dx, dy), onzoom: (f, x, y, node) => canvasZoomFn(p, node, f, x, y) }}>
		<ToolStrip tool={p.tool} {onTool} dim={!!(a && !isVpActive(a.id))} {STRIP} {iconOf} bind:guideVert bind:openGroup bind:groupTool />
		<!-- Pane-level exit: fixed on screen (outside the zoomed content), so a viewport
		     can always be left even when zoomed right in and its own corner is off-screen. -->
		{#if a && activeVpOf(a.id)}
			{@const avId = activeVpOf(a.id)!}
			{@const avFrame = avId === a.id ? null : framesOf(a.id).find((f) => f.id === avId)}
			{@const avScale = avFrame ? avFrame.scale : scaleOf(a.id)}
			<div class="vp-active-bar glass-bar">
				<button class="vab-btn" onclick={() => deactivateVp(avId)} title="Exit viewport (Esc)">
					<Icon name="chevronLeft" size={14} /> Exit
				</button>
				<button class="vab-btn" class:on={navContent} onclick={() => (navContent = !navContent)}
					title="Pan/zoom the model inside the viewport (off = pan/zoom the sheet)">
					<Icon name="pan" size={14} /> Pan content
				</button>
				<!-- viewport scale (like the Sheets tool's per-view scale) — the primary's tab scale, or the active extra frame's own scale -->
				<label class="vab-scale" title="Drawing scale">
					<select value={avScale} onchange={(e) => { const s = (e.currentTarget as HTMLSelectElement).value; if (avFrame) updateFrame(a.id, avId, { scale: s }); else setScale(a.id, s); }}>
						{#if !SCALES.includes(avScale)}<option value={avScale}>{avScale}</option>{/if}
						{#each SCALES as s (s)}<option value={s}>{s}</option>{/each}
					</select>
				</label>
				<!-- full-size: only the primary viewport fills the pane (an extra frame is a fixed window) -->
				{#if !avFrame}
					<button class="vab-btn" class:on={p.layout === 'model'} onclick={() => { onToggleLayout(); tick().then(() => fitPane(pi)) }}
						title="Full-size: fill the pane with the drawing (off = the paper sheet)">
						<Icon name={p.layout === 'model' ? 'panels' : 'expand'} size={14} /> Full-size
					</button>
				{/if}
			</div>
		{/if}
		{#key p.activeId}
			{@const cv = canvasViewOf(p)}
			<div class="canvas-content" style:transform="translate({cv.x}px, {cv.y}px) scale({cv.zoom})">
				{#if a?.kind === 'sheet' && p.layout === 'sheet'}
					<PaperPage title={a.title} tool={p.tool} scale={framesOf(a.id)[0]?.scale ?? scaleOf(a.id)} env={envFor(p)} pw={paperDimsOf(a.id).w} ph={paperDimsOf(a.id).h}
						sizeLabel="{paperOf(a.id).size} {paperOf(a.id).landscape ? 'L' : 'P'}" {rev} revDate={fmtDate(revisions[0]?.t)}
						entities={entsOf(a.id)} {focused}
						{entsForModel} tabModelId={a.modelId ?? FLOOR_MODEL_ID}
						frames={framesOf(a.id)} editor={paperEditor(a)} frameKind={(pr) => projKind(pr as Proj)}
						isFrameActive={(id) => isVpActive(id)} frameView={(id, proj) => viewOf(p.id, id, proj as Proj)} frameEnv={envFor(p)}
						frameOrbit={(id, proj) => orbitOf(p.id, id, proj as Proj)} makeFrameOn={(f) => vpFrameView(a, p, f as SheetFrame)} makeFrameEditor={(f) => vpEditor(a, (f as SheetFrame).id)}
						onseed={(x, y, w, h) => seedFrame(a.id, x, y, w, h)}
						onaddframe={(x, y, w, h) => addFrame(a.id, x, y, w, h)}
						onframegeom={(id, g) => updateFrame(a.id, id, g)}
						onframecommit={() => commitFrame(a.id, 'Move viewport')}
						ondeactivate={() => { const av = activeVpOf(a.id); if (av) deactivateVp(av) }} />
				{:else if a}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="vp-fill" ondblclick={() => deactivateVp(a.id)}>
						<Viewport kind={projKind(projOf(p, a))} label={a.title} tool={p.tool} scale={scaleOf(a.id)} env={envFor(p)} on={vpView(a, p)} editor={vpEditor(a, a.id)} modelId={a.modelId ?? FLOOR_MODEL_ID}
							entities={entsOf(a.id)} view={viewOf(p.id, a.id, projOf(p, a))} active={isVpActive(a.id)} {focused} clip={null} yaw={orbitOf(p.id, a.id, projOf(p, a)).yaw} pitch={orbitOf(p.id, a.id, projOf(p, a)).pitch} />
					</div>
				{:else}
					<div class="canvas-center">
						<Icon name="fileText" size={22} />
						<div class="cc-title">No page open</div>
						<div class="cc-sub">Pick a drawing from the sidebar, or</div>
						<button class="cc-new" onpointerdown={(e) => e.stopPropagation()} onclick={() => { onFocus(); onAddTab() }}><Icon name="plus" size={13} /> New page</button>
					</div>
				{/if}
			</div>
		{/key}
		<!-- Model-layout tabs (e.g. "3303 Floorplan", "Rack A Elevation") show the model name at the
		     top-centre of the canvas. Sheet layout has the titleblock + per-viewport bar instead. -->
		{#if a && !(a.kind === 'sheet' && p.layout === 'sheet')}
			<div class="model-name">{a.title}</div>
		{/if}
		<div class="navtools glass-bar">
			<button class="tool" title="Zoom in" onclick={() => navZoom(1.25)}><Icon name="zoomin" size={16} /></button>
			<button class="tool" title="Zoom out" onclick={() => navZoom(0.8)}><Icon name="zoomout" size={16} /></button>
			<button class="tool" title="Fit" onclick={() => navFit()}><Icon name="fit" size={16} /></button>
			<button class="tool" title="Pan (right-drag)"><Icon name="pan" size={16} /></button>
			{#if a && gizmoProj(p, a) === 'iso'}
				<button class="tool" title="Orbit — drag in the 3D view (Shift = 15° snap)"><Icon name="rotate3d" size={16} /></button>
			{/if}
		</div>
		{#if a}
			<!-- fixed-size view gizmos (ViewCube + WCS axes), screen space so they don't zoom -->
			<!-- ViewCube re-orients the view's content in place (the sheet's paper viewport too) — it
			     no longer flips a sheet to fullscreen. Use the Full-size button for that. -->
			{@const gvp = activeVpOf(a.id) ?? a.id}
			{@const gorb = orbitOf(p.id, gvp, gizmoProj(p, a))}
			<ViewGizmos projection={gizmoProj(p, a)} yaw={gorb.yaw} pitch={gorb.pitch}
				onset={(proj) => gizmoSet(p, a, proj)} />
		{/if}
		<!-- tool prompt / inline-edit help, pinned to the pane bottom-centre (screen space) -->
		{#if focused && statusText}<div class="pane-status">{statusText}</div>{/if}
	</main>
</section>

<style>
	.pane { display:flex; flex-direction:column; min-width:0; min-height:0; }

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
	/* VSCode-style preview tab: italic label until promoted (double-click / edit). */
	.tab.preview .tab-name { font-style:italic; }
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

	.grow { flex:1; } .txt { text-align:left; background:none; border:none; color:inherit; font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

	/* Canvas */
	.canvas { position:relative; flex:1 1 auto; min-width:0; min-height:0; background:var(--canvas);
		background-image:radial-gradient(var(--line) 1px, transparent 1px); background-size:22px 22px;
		display:flex; align-items:center; justify-content:center; overflow:hidden;
		user-select:none; -webkit-user-select:none; }
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
	/* Tools/nav sit above the paper/viewport regardless of DOM order. (.floattools now lives in
	   ToolStrip.svelte's own scoped styles — R9 commit 2.) */
	.navtools { bottom:12px; right:12px; flex-direction:column; z-index:5; }
	/* Pane-level status/help chip — screen space, so it stays put & readable at any zoom. */
	.pane-status { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); z-index:6; white-space:nowrap;
		font-size:11px; color:var(--text); background:color-mix(in srgb, var(--panel) 88%, transparent);
		border:1px solid var(--line-soft); border-radius:6px; padding:3px 12px; pointer-events:none;
		backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); box-shadow:0 4px 16px #0004; }
	/* Model name/id, top-centre of a model-layout canvas (screen space, non-interactive). */
	.model-name { position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:6; white-space:nowrap;
		font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--muted); pointer-events:none; user-select:none; }
	.vp-active-bar { top:12px; left:50%; transform:translateX(-50%); z-index:6; align-items:center; gap:2px; padding:3px; }
	.vab-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; min-height:30px; border-radius:6px;
		font-size:12px; font-weight:600; color:var(--muted); background:none; border:none; }
	.vab-btn:hover { background:var(--hover); color:var(--text); }
	.vab-btn.on { background:var(--active); color:var(--accent); }
	.vab-scale select { background:var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:3px 6px; font-size:12px; font-weight:600; }
	.vab-scale select:focus { outline:none; border-color:var(--accent); }
	.tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:6px; color:var(--muted); background:none; border:none; }
	.tool:hover { background:var(--hover); color:var(--text); }
</style>
