<script lang="ts">
	import { untrack, setContext } from "svelte";
	import { DEFAULT_PRINT_SETTINGS, paperDimsMm, type PrintSettings } from '$lib/ui/print/types'
	import { ViewportEditor, numberViewports } from "./viewports.svelte";
	import { updateSheet, subscribeSheets } from "./data";
	import type { SheetDoc, SheetViewport, TitleBlockConfig } from "./types";
	import type { Firestore } from "$lib/db.svelte";
	import type { TitleBlockProjectDefaults } from "./parts/TitleBlock.svelte";
	import TitleBlock from "./parts/TitleBlock.svelte";
	import Canvas from "./parts/Canvas.svelte";
	import Viewport from "./Viewport.svelte";
	import SheetMenubar from "./SheetMenubar.svelte";
	import StatusBar from "./StatusBar.svelte";
	import SheetPropertiesWindow from "./parts/SheetPropertiesWindow.svelte";
	import ViewportPropertiesWindow from "./parts/ViewportPropertiesWindow.svelte";
	import ModelView from "./edit/ModelView.svelte";
	import LayersPanel from "./layers/LayersPanel.svelte";
	import RevisionsPanel from "./revisions/RevisionsPanel.svelte";
	import ProjectSettingsDialog, { type Project } from "../../ProjectSettingsDialog.svelte";

	let { sheet, project = {}, floors = [], db, pid }: {
		sheet: SheetDoc
		project?: TitleBlockProjectDefaults
		floors?: { number: number }[]
		db: Firestore
		pid: string
	} = $props()

	// Link targets for annotation symbol pickers (section/detail → other sheets). Surveys/photos
	// fall back to free-text in AnnotationControls until wired. Shared via context to avoid drilling.
	type Opt = { id: string; label: string }
	let annLinks = $state<{ sheets: Opt[]; surveys: Opt[]; photos: (id?: string) => Opt[] }>({ sheets: [], surveys: [], photos: () => [] })
	setContext('annLinks', annLinks)
	$effect(() => {
		const unsub = subscribeSheets(db, pid, (list) => {
			annLinks.sheets = list.filter(s => s.id !== sheet?.id).map(s => ({ id: s.id, label: s.drawingNumber ? `${s.drawingNumber} · ${s.title}` : s.title }))
		})
		return () => unsub?.()
	})

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

	// Snap targets for dragging/resizing viewport frames (19d): paper edges, the printable margin,
	// the title-block edges, and a 5mm grid on the page.
	let snap = $derived({
		w: paperMm.w, h: paperMm.h, margins: page.paper.margins, grid: 5,
		tb: titleBlockCfg
			? { x: titleBlockCfg.positionMm?.x ?? 0, y: titleBlockCfg.positionMm?.y ?? 0, w: titleBlockCfg.widthMm ?? 0, h: titleBlockCfg.heightMm ?? 0 }
			: null,
	})

	// ── Viewports ──
	const vps = new ViewportEditor()
	// Model mode: when set, that viewport's content fills the content area (paper hidden).
	let modelVpId = $state<string | null>(null)
	let modelVp = $derived(modelVpId ? vps.viewports.find(v => v.id === modelVpId) ?? null : null)
	let canvasComp = $state<{ fitToPaper: () => void } | undefined>() // for the menubar "Fit" reset

	// True when a touch lands on empty, pannable paper — not a menu/portal, a viewport, or the
	// title-block grip. Drives single-finger touch panning (objects keep synthesized-mouse drag).
	function isPannableBackground(t: EventTarget | null): boolean {
		const el = t as Element | null
		if (!el?.closest) return true
		if (el.closest('.dwg-menubar, .ctx-menu, .fp-toolbar, .gui, [data-slot="menubar-content"], #sheet-portal-root, .tb-logo-grip')) return false
		return !el.closest('.vp')
	}
	let vpNums = $derived(numberViewports(vps.viewports)) // top-down, reading-order viewport numbers
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

	// ── Custom layers (project-wide) ── load from the project doc and persist edits back to it.
	// Layer definitions are shared across all sheets (per-viewport hidden/locked stays on the sheet).
	let projectDoc = $state<Project | null>(null) // full project doc, for the Project-details dialog
	let settingsOpen = $state(false)
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			projectDoc = data ? { ...(data as Project), id: pid } : null
			const next = Array.isArray(data?.sheetLayers) ? data.sheetLayers : []
			// Skip no-op echoes (our own writes round-trip) so an in-progress rename isn't clobbered.
			if (JSON.stringify(next) !== JSON.stringify($state.snapshot(vps.customLayers))) vps.customLayers = next
		})
		return () => { unsub?.() }
	})
	vps.onLayersChange = () => { if (pid) db.save('projects', { id: pid, sheetLayers: $state.snapshot(vps.customLayers) }) }

	// Window-level gestures: Insert drag-out, marquee select, double-click activate, delete/esc.
	// Capture phase so we run before the Canvas/viewport handlers call stopPropagation.
	$effect(() => {
		const el = (t: EventTarget | null) => t as Element | null
		// `#sheet-portal-root` holds the portalled floating UI (panels, the scale Dialog, colour/annote
		// popovers) — clicks there must not start a canvas marquee (which would clear the selection and
		// unmount a `selected`-gated dialog mid-click).
		const inMenu = (t: EventTarget | null) => !!el(t)?.closest?.('.dwg-menubar, .ctx-menu, .fp-toolbar, .gui, [data-slot="menubar-content"], #sheet-portal-root, .tb-logo-grip')
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
			// Page Up/Down pan the sheet page vertically (horizontally with Shift) — works at any time.
			if ((e.key === 'PageUp' || e.key === 'PageDown') && !isField(e.target)) {
				e.preventDefault(); canvasComp?.panByPage(e.shiftKey, e.key === 'PageUp'); return
			}
			if (modelVpId) { if (e.key === 'Escape') { const id = modelVpId; modelVpId = null; vps.activate(id) } return }
				// Sheet-level viewport clipboard — only when no viewport is active (active viewports own
				// Ctrl-C/V for their own annotations). Cut/Copy/Duplicate need a selection; Paste doesn't.
				if ((e.ctrlKey || e.metaKey) && !isField(e.target) && !vps.activeId) {
					const k = e.key.toLowerCase()
					if (k === 'c' && vps.selectedIds.length) { e.preventDefault(); vps.copySelected(); return }
					if (k === 'x' && vps.selectedIds.length) { e.preventDefault(); vps.cutSelected(); return }
					if (k === 'v') { e.preventDefault(); vps.pasteClipboard(); return }
					if (k === 'd' && vps.selectedIds.length) { e.preventDefault(); vps.duplicateSelected(); return }
				}
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

<SheetMenubar {vps} onsettings={() => (settingsOpen = true)} onfit={() => canvasComp?.fitToPaper()} />
<ProjectSettingsDialog bind:open={settingsOpen} mode="edit" project={projectDoc} />

<!-- Flex row: a flex-1 cell that the canvas fills. The `relative` cell is the canvas's
     positioning context; Canvas measures it via ResizeObserver, so it adapts to the
     menubar/status bar without hardcoded sizes. -->
<div class="flex min-h-0 flex-1">
	<div class="relative min-w-0 flex-1">
		<!-- Canvas owns pan/zoom; everything below is drawn in mm (world units) inside its
		     transform group. The paper sheet is the positioning context for the margin guide
		     and title block. -->
		<Canvas bind:this={canvasComp} paper={page.paper} viewKey={`sheet-${sheet.id}`} bind:zoom={mainZoom} bind:panX={mainPanX} bind:panY={mainPanY} cursor={vps.insertMode ? 'crosshair' : ''}
			singleTouchPan={!modelVpId && !vps.insertMode} canPanAt={isPannableBackground} onBackgroundTap={() => { vps.deactivate(); vps.clearSel() }}>
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
					<Viewport {vps} {vp} zoom={mainZoom} {snap} num={vpNums.get(vp.id) ?? 0} total={vps.viewports.length} onmodel={(id) => { vps.deactivate(); modelVpId = id }} />
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
						pxPerMm={mainZoom}
						onlogoresize={(which, h) => { if (pid) db.save('projects', { id: pid, [which === 'company' ? 'companyLogoHeightMm' : 'logoHeightMm']: h }) }}
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

		<!-- Model mode: full-area content editor over the sheet (no route / refresh). Re-activate the
		     viewport on exit so returning to the sheet keeps it active. -->
		{#if modelVp}
			<ModelView vp={modelVp} {vps} onexit={() => { const id = modelVpId; modelVpId = null; if (id) vps.activate(id) }} />
			<LayersPanel {vps} vp={modelVp} />
		{/if}
	</div>
</div>

<StatusBar {vps} zoom={mainZoom} panX={mainPanX} panY={mainPanY} />
