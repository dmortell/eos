<script lang="ts">
	import { untrack } from "svelte";
	import { DEFAULT_PRINT_SETTINGS, paperDimsMm, type PrintSettings } from '$lib/ui/print/types'
	import Canvas from "./parts/Canvas.svelte";
	import TitleBlock from "./parts/TitleBlock.svelte";
	import type { TitleBlockProjectDefaults } from "./parts/TitleBlock.svelte";
	import Viewport from "./Viewport.svelte";
	import SheetMenubar from "./SheetMenubar.svelte";
	import StatusBar from "./StatusBar.svelte";
	import SheetPropertiesWindow from "./parts/SheetPropertiesWindow.svelte";
	import ViewportPropertiesWindow from "./parts/ViewportPropertiesWindow.svelte";
	import ModelView from "./edit/ModelView.svelte";
	import LayersPanel from "./layers/LayersPanel.svelte";
	import RevisionsPanel from "./revisions/RevisionsPanel.svelte";
	import { ViewportEditor } from "./viewports.svelte";
	import type { SheetDoc, SheetViewport, TitleBlockConfig } from "./types";
	import { updateSheet } from "./data";
	import type { Firestore } from "$lib/db.svelte";

	let { sheet, project = {}, floors = [], db, pid }: {
		sheet: SheetDoc
		project?: TitleBlockProjectDefaults
		floors?: { number: number }[]
		db: Firestore
		pid: string
	} = $props()

	// Normalized view of the sheet — guarantees paper/title exist even for a partial doc.
	let page = $derived({
		title: sheet?.title ?? 'Untitled Sheet',
		drawingNumber: sheet?.drawingNumber,
		titleBlock: sheet?.titleBlock as TitleBlockConfig | null | undefined,
		paper: { ...DEFAULT_PRINT_SETTINGS, ...(sheet?.paper ?? {}) } as PrintSettings,
	})

	// Paper footprint in mm (world units on the Canvas = 1mm).
	let paperMm = $derived(paperDimsMm(page.paper))

	// Effective title-block config. `null` titleBlock = hidden; otherwise default to a
	// vertical strip pinned inside the bottom-right margin.
	let titleBlockCfg = $derived.by<TitleBlockConfig | null>(() => {
		if (page.titleBlock === null) return null
		const cfg = page.titleBlock ?? { template: 'vertical' as const }
		const margin = page.paper.margins
		let defaultW: number, defaultH: number, defaultX: number, defaultY: number
		if (cfg.template === 'compact') {
			defaultW = 120; defaultH = 20
			defaultX = paperMm.w - defaultW - margin; defaultY = paperMm.h - defaultH - margin
		} else if (cfg.template === 'horizontal') {
			defaultW = 180; defaultH = 60
			defaultX = paperMm.w - defaultW - margin; defaultY = paperMm.h - defaultH - margin
		} else { // vertical (default)
			defaultW = 40; defaultH = paperMm.h - margin * 2
			defaultX = paperMm.w - defaultW - margin; defaultY = margin
		}
		return {
			...cfg,
			positionMm: cfg.positionMm ?? { x: defaultX, y: defaultY },
			widthMm: cfg.widthMm ?? defaultW,
			heightMm: cfg.heightMm ?? defaultH,
		}
	})

	// ── Viewports ──
	const vps = new ViewportEditor()
	// Model mode: when set, that viewport's content fills the content area (paper hidden).
	let modelVpId = $state<string | null>(null)
	let modelVp = $derived(modelVpId ? vps.viewports.find(v => v.id === modelVpId) ?? null : null)
	let mainZoom = $state(1)              // outer Canvas zoom — counter-scales viewport handles
	let mainPanX = $state(0)             // outer Canvas pan (px) — for the status-bar readout
	let mainPanY = $state(0)
	let paperEl = $state<HTMLDivElement>()
	$effect(() => { vps.paper = paperEl ?? null }) // paper sheet → client px ↔ paper mm mapping

	// Load the embedded viewport array when the sheet IDENTITY changes (not on every snapshot).
	// The `lastLoadedId` guard means our own save round-trips (same id, new object) don't reset
	// the working set or clear the current selection.
	let lastLoadedId: string | null = null
	$effect(() => {
		const id = sheet?.id
		if (!id || id === lastLoadedId) return
		lastLoadedId = id
		untrack(() => {
			vps.viewports = (sheet.viewports ?? []).map(v => ({ ...v }))
			vps.clearSel()
			vps.deactivate()
		})
	})

	// ── Persist viewport geometry (debounced) ──
	// The editor calls vps.notify() after add / delete / move / resize. We coalesce bursts
	// (drag emits one notify on mouseup; rapid edits collapse) into a single merge-write of
	// the viewports array. $state.snapshot() unwraps the reactive proxies into plain objects
	// that Firestore can serialise.
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			saveTimer = null
			if (!sheet?.id) return
			const viewports = $state.snapshot(vps.viewports) as SheetViewport[]
			updateSheet(db, pid, sheet.id, { viewports })
		}, 400)
	}
	vps.onChange = scheduleSave
	$effect(() => () => { if (saveTimer) clearTimeout(saveTimer) })

	// Window-level gestures: Insert drag-out, marquee select, double-click activate, delete/esc.
	// Capture phase so we run before the Canvas/viewport handlers call stopPropagation.
	$effect(() => {
		const el = (t: EventTarget | null) => t as Element | null
		const inMenu = (t: EventTarget | null) => !!el(t)?.closest?.('.dwg-menubar, .ctx-menu, .fp-toolbar, .gui, [data-slot="menubar-content"]')
		const inViewport = (t: EventTarget | null) => !!el(t)?.closest?.('.vp')
		const isField = (t: EventTarget | null) => !!el(t)?.closest?.('input, select, textarea, [contenteditable]')
		let dragging = false

		function onDown(e: MouseEvent) {
			if (modelVpId) return // model mode overlay owns the content area
			if (e.button !== 0 || inMenu(e.target)) return
			const p = vps.toPaper(e.clientX, e.clientY); if (!p) return
			if (vps.insertMode) { e.preventDefault(); e.stopPropagation(); vps.beginDrag(p); dragging = true; return }
			if (inViewport(e.target)) return // a frame strip / handle / active body handles its own press
			vps.beginDrag(p); dragging = true // marquee from empty paper
		}
		function onMove(e: MouseEvent) {
			if (!dragging) return
			const p = vps.toPaper(e.clientX, e.clientY); if (p) vps.updateDrag(p)
		}
		function onUp(e: MouseEvent) {
			if (!dragging) return
			dragging = false
			const p = vps.toPaper(e.clientX, e.clientY)
			if (p) vps.endDrag(p, e.shiftKey); else vps.cancelInsert()
		}
		function onDbl(e: MouseEvent) {
			if (modelVpId || inMenu(e.target)) return
			const p = vps.toPaper(e.clientX, e.clientY); if (!p) return
			const hit = vps.hitTest(p)
			if (hit) vps.activate(hit.id); else vps.deactivate()
		}
		function onKey(e: KeyboardEvent) {
			if (modelVpId) { if (e.key === 'Escape') modelVpId = null; return }
			if (e.key === 'Escape') { if (vps.insertMode) vps.cancelInsert(); else { vps.deactivate(); vps.clearSel() } }
			else if ((e.key === 'Delete' || e.key === 'Backspace') && !isField(e.target) && !vps.activeId && vps.selectedIds.length) {
				e.preventDefault(); vps.deleteSelected()
			}
		}
		window.addEventListener('mousedown', onDown, true)
		window.addEventListener('mousemove', onMove, true)
		window.addEventListener('mouseup', onUp, true)
		window.addEventListener('dblclick', onDbl, true)
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('mousedown', onDown, true)
			window.removeEventListener('mousemove', onMove, true)
			window.removeEventListener('mouseup', onUp, true)
			window.removeEventListener('dblclick', onDbl, true)
			window.removeEventListener('keydown', onKey)
		}
	})
</script>

<SheetMenubar {vps} />

<!-- Flex row: a flex-1 cell that the canvas fills. The `relative` cell is the canvas's
     positioning context; Canvas measures it via ResizeObserver, so it adapts to the
     menubar/status bar without hardcoded sizes. -->
<div class="flex min-h-0 flex-1">
	<div class="relative min-w-0 flex-1">
		<!-- Canvas owns pan/zoom; everything below is drawn in mm (world units) inside its
		     transform group. The paper sheet is the positioning context for the margin guide
		     and title block. -->
		<Canvas paper={page.paper} viewKey={`sheet-${sheet.id}`} bind:zoom={mainZoom} bind:panX={mainPanX} bind:panY={mainPanY} cursor={vps.insertMode ? 'crosshair' : ''}>
			<!-- Paper sheet (cad-thin → drawing borders render as hairlines, not 1mm) -->
			<div
				bind:this={paperEl}
				class="cad-thin absolute bg-white shadow-md pointer-events-none"
				style:left="0px"
				style:top="0px"
				style:width="{paperMm.w}px"
				style:height="{paperMm.h}px"
			>
				<!-- Margin guide — SVG non-scaling stroke so it matches the title-block lines. -->
				{#if page.paper.margins > 0}
					<svg
						class="absolute inset-0 pointer-events-none"
						width="100%"
						height="100%"
						viewBox="0 0 {paperMm.w} {paperMm.h}"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<rect
							class="dwg-line"
							x={page.paper.margins}
							y={page.paper.margins}
							width={paperMm.w - 2 * page.paper.margins}
							height={paperMm.h - 2 * page.paper.margins}
							vector-effect="non-scaling-stroke"
						/>
					</svg>
				{/if}

				{#each vps.viewports as vp (vp.id)}
					<Viewport {vps} {vp} zoom={mainZoom} onmodel={(id) => { vps.deactivate(); modelVpId = id }} />
				{/each}

				<!-- Insert drag-out preview -->
				{#if vps.draft}
					<div class="absolute border-blue-600 bg-blue-500/10 pointer-events-none"
						style:left="{vps.draft.x}px" style:top="{vps.draft.y}px"
						style:width="{vps.draft.w}px" style:height="{vps.draft.h}px"
						style:border-style="solid" style:border-width="{2 / mainZoom}px"></div>
				{/if}
				<!-- Marquee selection box -->
				{#if vps.marquee}
					<div class="absolute border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
						style:left="{vps.marquee.x}px" style:top="{vps.marquee.y}px"
						style:width="{vps.marquee.w}px" style:height="{vps.marquee.h}px"
						style:border-width="{1 / mainZoom}px"></div>
				{/if}

				<!-- Title block — pinned to the paper -->
				{#if titleBlockCfg}
					<TitleBlock
						config={titleBlockCfg}
						{project}
						drawingTitle={page.title}
						drawingNumber={page.drawingNumber}
						revisionCode={sheet.currentRevision}
						revisions={sheet.revisions ?? []}
						paperSize={page.paper.paperSize}
						scaleDenominator={page.paper.scale || 100}
						pxPerMm={1}
					/>
				{/if}
			</div>
		</Canvas>

		<!-- Floating property windows (over the canvas). Hidden in model mode so only the model
		     viewport's own edit/annotate panels show. -->
		{#if !modelVpId}
			<SheetPropertiesWindow {sheet} {project} {db} {pid} />
			<ViewportPropertiesWindow {vps} {floors} {pid} />
			<LayersPanel {vps} />
			<RevisionsPanel {sheet} {db} {pid} />
		{/if}

		<!-- Model mode: full-area content editor over the sheet (no route / refresh). -->
		{#if modelVp}
			<ModelView vp={modelVp} {vps} onexit={() => modelVpId = null} />
		{/if}
	</div>
</div>

<StatusBar {vps} zoom={mainZoom} panX={mainPanX} panY={mainPanY} />
