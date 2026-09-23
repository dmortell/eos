<script lang="ts">
	// ONE editor pane (R9, review.md §R9) — split out of +page.svelte's `{#each session.panes}` loop
	// verbatim: tab strip + floating tool strip + active-viewport bar + canvas (PaperPage or Viewport) +
	// nav tools + view gizmos + the pane-local status chip. +page.svelte still OWNS every piece of state
	// this reads/writes (session, groupTool, openGroup, guideVert, navContent, …) — this component is a
	// pure RENDER of one pane, not a new state owner, so behaviour is unchanged.
	//
	// Every doc/view accessor (framesOf, viewOf, vpEditor, …) + the small per-pane actions (setFocused,
	// setPaneTool, …) arrive bundled in ONE `ws: Workspace` prop (types.ts) instead of ~30 separate props —
	// eos-07's review of the first cut of this file flagged the flat prop list as an R6-callback-bundle
	// problem one level down. `pane`/`canvasEl` writes go through `ws`'s action functions rather than
	// mutating the `pane` prop or a `canvasEls[pi]` prop directly: Svelte 5 flags mutating a plain
	// (non-bindable) prop from outside the component that owns it as an ownership violation at runtime,
	// even though it "works" via the shared $state proxy — the actual mutation must happen in the
	// component that owns the state (+page.svelte), triggered by a call up through `ws`, not reached into
	// directly from here.
	import { Icon } from '$lib'
	import Viewport from '../ui/Viewport.svelte'
	import PaperPage from './PaperPage.svelte'
	import ToolStrip from './ToolStrip.svelte'
	import TabMenu from './TabMenu.svelte'
	import ViewGizmos from './ViewGizmos.svelte'
	import { panzoom } from '../ui/panzoom'
	import { type Proj, type WorkPane, type Workspace, SCALES } from '../types'
	import { selStore } from '../selStore.svelte'
	import { selClear } from '../ui/selection'
	import { FLOOR_MODEL_ID } from '../3dview/models.svelte'
	import { tick } from 'svelte'

	let {
		pane, pi, focused, splitFrac, panesCount, tabMenuOpen,
		navContent = $bindable(), guideVert = $bindable(), openGroup = $bindable(), groupTool = $bindable(),
		ws,
	}: {
		pane: WorkPane; pi: number; focused: boolean; splitFrac: number; panesCount: number; tabMenuOpen: boolean
		navContent: boolean; guideVert: boolean; openGroup: string | null; groupTool: Record<string, string>
		ws: Workspace
	} = $props()
	// A local mirror of the canvas element, reported up via `ws.setCanvasEl` (see the file-header note on
	// why this isn't a `canvasEls[pi]` prop mutated directly). Cleaned up on unmount too, matching
	// `bind:this`'s own destroy behaviour (eos-07 caught the first cut missing this).
	let canvasEl: HTMLElement | undefined = $state()
	$effect(() => { ws.setCanvasEl(pi, canvasEl); return () => ws.setCanvasEl(pi, undefined) })

	// Pure, no closure — cheaper to redefine here than to thread through `ws` as two more members.
	const projKind = (p: Proj) => p as 'plan' | 'iso' | 'front' | 'rear' | 'left' | 'right'
	const fmtDate = (t?: number) => new Date(t ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

	const p = $derived(pane)   // local alias — matches the inline block's `p` from `{#each session.panes as p, pi}`
	const a = $derived(ws.tabs.find((t) => t.id === p.activeId) ?? null)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pane" class:focused
	style:flex={panesCount === 1 ? '1 1 0' : `${pi === 0 ? splitFrac : 1 - splitFrac} 1 0`}
	onpointerdown={() => ws.setFocused(pi)}>

	<!-- this pane's tab strip -->
	<div class="tabbar">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tabs" onwheel={(e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() } }}>
			{#each ws.tabs as t (t.id)}
				<div class="tab" class:active={t.id === p.activeId} class:preview={t.preview} onclick={() => ws.openTab(t.id, pi)}
					ondblclick={() => ws.promoteTab(t.id)}
					role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') ws.openTab(t.id, pi) }}>
					<Icon name={ws.kindIcon[t.kind]} size={12} />
					<span class="tab-name">{t.title}</span>
					{#if t.dirty}<span class="dirty">•</span>{/if}
					<button class="tab-x" title="Close" onclick={(e) => ws.closeTab(t.id, e)}><Icon name="close" size={11} /></button>
				</div>
			{/each}
		</div>
		<div class="tabbar-right">
			<button class="strip-btn" title="New page" onclick={() => { ws.setFocused(pi); ws.addTab() }}><Icon name="plus" size={14} /></button>
			<button class="strip-btn" title="All pages" onclick={(e) => { e.stopPropagation(); ws.setFocused(pi); ws.toggleTabMenu(pi) }}><Icon name="chevronDown" size={14} /></button>
			{#if panesCount === 1}
				<button class="strip-btn" title="Split editor right" onclick={ws.splitVertical}><Icon name="panels" size={14} /></button>
			{:else}
				<button class="strip-btn" title="Close this split" onclick={() => ws.closePane(pi)}><Icon name="close" size={14} /></button>
			{/if}
			{#if tabMenuOpen}
				<TabMenu tabs={ws.tabs} kindIcon={ws.kindIcon} activeId={p.activeId}
					onPick={(id) => ws.pickFromMenu(id, pi)}
					onNewPage={() => { ws.toggleTabMenu(pi); ws.setFocused(pi); ws.addTab() }} />
			{/if}
		</div>
	</div>

	<!-- this pane's canvas -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<main class="canvas" bind:this={canvasEl} onpointermove={ws.onCanvasMove}
		ondblclick={(e) => { if (a && !(e.target as Element).closest?.('.paper, button, .glass-bar, .vp-active-bar, .navtools, .floattools')) { const av = ws.activeVpOf(a.id); if (av) ws.deactivateVp(av); selStore.set(a.id, selClear()) } }}
		use:panzoom={{ enabled: () => !!a, wheelZoom: () => ws.acadMode, onpan: (dx, dy) => ws.canvasPan(p, dx, dy), onzoom: (f, x, y, node) => ws.canvasZoomFn(p, node, f, x, y) }}>
		<ToolStrip tool={p.tool} onTool={(t) => ws.setPaneTool(pane, t)} dim={!!(a && !ws.isVpActive(a.id))} STRIP={ws.STRIP} iconOf={ws.iconOf} bind:guideVert bind:openGroup bind:groupTool />
		<!-- Pane-level exit: fixed on screen (outside the zoomed content), so a viewport
		     can always be left even when zoomed right in and its own corner is off-screen. -->
		{#if a && ws.activeVpOf(a.id)}
			{@const avId = ws.activeVpOf(a.id)!}
			{@const avFrame = avId === a.id ? null : ws.framesOf(a.id).find((f) => f.id === avId)}
			{@const avScale = avFrame ? avFrame.scale : ws.scaleOf(a.id)}
			<div class="vp-active-bar glass-bar">
				<button class="vab-btn" onclick={() => ws.deactivateVp(avId)} title="Exit viewport (Esc)">
					<Icon name="chevronLeft" size={14} /> Exit
				</button>
				<button class="vab-btn" class:on={navContent} onclick={() => (navContent = !navContent)}
					title="Pan/zoom the model inside the viewport (off = pan/zoom the sheet)">
					<Icon name="pan" size={14} /> Pan content
				</button>
				<!-- viewport scale (like the Sheets tool's per-view scale) — the primary's tab scale, or the active extra frame's own scale -->
				<label class="vab-scale" title="Drawing scale">
					<select value={avScale} onchange={(e) => { const s = (e.currentTarget as HTMLSelectElement).value; if (avFrame) ws.updateFrame(a.id, avId, { scale: s }); else ws.setScale(a.id, s); }}>
						{#if !SCALES.includes(avScale)}<option value={avScale}>{avScale}</option>{/if}
						{#each SCALES as s (s)}<option value={s}>{s}</option>{/each}
					</select>
				</label>
				<!-- full-size: only the primary viewport fills the pane (an extra frame is a fixed window) -->
				{#if !avFrame}
					<button class="vab-btn" class:on={p.layout === 'model'} onclick={() => { ws.toggleLayout(pane); tick().then(() => ws.fitPane(pi)) }}
						title="Full-size: fill the pane with the drawing (off = the paper sheet)">
						<Icon name={p.layout === 'model' ? 'panels' : 'expand'} size={14} /> Full-size
					</button>
				{/if}
			</div>
		{/if}
		{#key p.activeId}
			{@const cv = ws.canvasViewOf(p)}
			<div class="canvas-content" style:transform="translate({cv.x}px, {cv.y}px) scale({cv.zoom})">
				{#if a?.kind === 'sheet' && p.layout === 'sheet'}
					<PaperPage title={a.title} tool={p.tool} scale={ws.framesOf(a.id)[0]?.scale ?? ws.scaleOf(a.id)} env={ws.envFor(p)} pw={ws.paperDimsOf(a.id).w} ph={ws.paperDimsOf(a.id).h}
						sizeLabel="{ws.paperOf(a.id).size} {ws.paperOf(a.id).landscape ? 'L' : 'P'}" rev={ws.rev} revDate={fmtDate(ws.revisions[0]?.t)}
						entities={ws.entsOf(a.id)} {focused}
						entsForModel={ws.entsForModel} tabModelId={a.modelId ?? FLOOR_MODEL_ID}
						frames={ws.framesOf(a.id)} editor={ws.paperEditor(a)} frameKind={(pr) => projKind(pr as Proj)}
						isFrameActive={(id) => ws.isVpActive(id)} frameView={(id, proj) => ws.viewOf(p.id, id, proj as Proj)} frameEnv={ws.envFor(p)}
						frameOrbit={(id, proj) => ws.orbitOf(p.id, id, proj as Proj)} makeFrameOn={(f) => ws.vpFrameView(a, p, f)} makeFrameEditor={(f) => ws.vpEditor(a, f.id)}
						onseed={(x, y, w, h) => ws.seedFrame(a.id, x, y, w, h)}
						onaddframe={(x, y, w, h) => ws.addFrame(a.id, x, y, w, h)}
						onframegeom={(id, g) => ws.updateFrame(a.id, id, g)}
						onframecommit={() => ws.commitFrame(a.id, 'Move viewport')}
						ondeactivate={() => { const av = ws.activeVpOf(a.id); if (av) ws.deactivateVp(av) }} />
				{:else if a}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="vp-fill" ondblclick={() => ws.deactivateVp(a.id)}>
						<Viewport kind={projKind(ws.projOf(p, a))} label={a.title} tool={p.tool} scale={ws.scaleOf(a.id)} env={ws.envFor(p)} on={ws.vpView(a, p)} editor={ws.vpEditor(a, a.id)} modelId={a.modelId ?? FLOOR_MODEL_ID}
							entities={ws.entsOf(a.id)} view={ws.viewOf(p.id, a.id, ws.projOf(p, a))} active={ws.isVpActive(a.id)} {focused} clip={null} yaw={ws.orbitOf(p.id, a.id, ws.projOf(p, a)).yaw} pitch={ws.orbitOf(p.id, a.id, ws.projOf(p, a)).pitch} />
					</div>
				{:else}
					<div class="canvas-center">
						<Icon name="fileText" size={22} />
						<div class="cc-title">No page open</div>
						<div class="cc-sub">Pick a drawing from the sidebar, or</div>
						<button class="cc-new" onpointerdown={(e) => e.stopPropagation()} onclick={() => { ws.setFocused(pi); ws.addTab() }}><Icon name="plus" size={13} /> New page</button>
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
			<button class="tool" title="Zoom in" onclick={() => ws.navZoom(1.25)}><Icon name="zoomin" size={16} /></button>
			<button class="tool" title="Zoom out" onclick={() => ws.navZoom(0.8)}><Icon name="zoomout" size={16} /></button>
			<button class="tool" title="Fit" onclick={() => ws.navFit()}><Icon name="fit" size={16} /></button>
			<button class="tool" title="Pan (right-drag)"><Icon name="pan" size={16} /></button>
			{#if a && ws.gizmoProj(p, a) === 'iso'}
				<button class="tool" title="Orbit — drag in the 3D view (Shift = 15° snap)"><Icon name="rotate3d" size={16} /></button>
			{/if}
		</div>
		{#if a}
			<!-- fixed-size view gizmos (ViewCube + WCS axes), screen space so they don't zoom -->
			<!-- ViewCube re-orients the view's content in place (the sheet's paper viewport too) — it
			     no longer flips a sheet to fullscreen. Use the Full-size button for that. -->
			{@const gvp = ws.activeVpOf(a.id) ?? a.id}
			{@const gorb = ws.orbitOf(p.id, gvp, ws.gizmoProj(p, a))}
			<ViewGizmos projection={ws.gizmoProj(p, a)} yaw={gorb.yaw} pitch={gorb.pitch}
				onset={(proj) => ws.gizmoSet(p, a, proj)} />
		{/if}
		<!-- tool prompt / inline-edit help, pinned to the pane bottom-centre (screen space) -->
		{#if focused && ws.statusText}<div class="pane-status">{ws.statusText}</div>{/if}
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
	/* .tab-menu* now lives in TabMenu.svelte's own scoped styles — R9 commit 5. */

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
