<script lang="ts">
	import type { TitleBlockConfig } from '../types'

	/**
	 * Project-level defaults for title-block fields. Anything absent here can
	 * still be populated via `config.fields` on a per-sheet basis.
	 */
	export interface TitleBlockProjectDefaults {
		name?: string
		author?: string
		address?: string
		logoUrl?: string        // client logo
		client?: string
		// Our own company block (19b)
		companyName?: string
		companyLogoUrl?: string
		companyAddress?: string
		companyContact?: string
		/** Logo heights (mm); 0 / absent = auto (max-h-8). Resizable in the editor (19c). */
		logoHeightMm?: number
		companyLogoHeightMm?: number
		/** Per-section include toggles (absent / true = shown). Keys: company, client, site,
		 *  revisions, approvals, scaleSize. */
		sections?: Record<string, boolean>
	}

	let {
		config,
		project = {},
		drawingTitle,
		drawingNumber,
		revisionCode,
		revisions = [],
		paperSize,
		scaleDenominator,
		pxPerMm,
		onupdate,
		onlogoresize,
	}: {
		config: TitleBlockConfig
		project?: TitleBlockProjectDefaults
		drawingTitle: string
		drawingNumber?: string
		revisionCode?: string
		revisions?: { code: string; date?: string; note?: string }[]
		paperSize: string
		scaleDenominator: number
		/** Canvas zoom factor — used to convert px drag deltas to mm. */
		pxPerMm: number
		/** Optional callback to persist layout changes (position, size, template). */
		onupdate?: (patch: Partial<TitleBlockConfig>) => void
		/** Optional: persist a resized logo height (mm). When provided, logos show a resize grip. */
		onlogoresize?: (which: 'logo' | 'company', heightMm: number) => void
	} = $props()

	/** Default bottom-right placement is computed by the canvas; here we just consume it. */
	let posX = $derived(config.positionMm?.x ?? 0)
	let posY = $derived(config.positionMm?.y ?? 0)
	let widthMm = $derived(config.widthMm ?? 40)
	let heightMm = $derived(config.heightMm ?? 180)

	/**
	 * Resolve a field in priority order: per-sheet override > project default > fallback.
	 * Keeps the template free of null-coalescing chains.
	 */
	function field(key: string, projectFallback: string | undefined, fallback = ''): string {
		return (config.fields?.[key] ?? projectFallback ?? fallback).trim()
	}

	let fProjectName = $derived(field('projectName', project.name, ''))
	let fClient      = $derived(field('client', project.client, ''))
	let fAddress     = $derived(field('address', project.address, ''))
	let fDrawnBy     = $derived(field('drawnBy', project.author, ''))
	let fCheckedBy   = $derived(field('checkedBy', undefined, ''))
	let fApprovedBy  = $derived(field('approvedBy', undefined, ''))
	let fDate        = $derived(field('date', undefined, new Date().toISOString().slice(0, 10)))
	let fNumber      = $derived(field('drawingNumber', drawingNumber, ''))
	let fTitle       = $derived(field('title', drawingTitle, ''))
	let fRevision    = $derived(field('revision', revisionCode, '—'))
	let fScale       = $derived(field('scale', `1:${scaleDenominator}`, ''))
	let fPaper       = $derived(field('paper', paperSize, ''))
	let fLogo        = $derived(config.fields?.logoUrl ?? project.logoUrl ?? '')
	// Our company block
	let fCoName     = $derived(field('companyName', project.companyName, ''))
	let fCoAddress  = $derived(field('companyAddress', project.companyAddress, ''))
	let fCoContact  = $derived(field('companyContact', project.companyContact, ''))
	let fCoLogo     = $derived(config.fields?.companyLogoUrl ?? project.companyLogoUrl ?? '')

	// Per-section include toggles (absent / true = shown). The company block also needs content.
	let sec = $derived(project.sections ?? {})
	let showCompany   = $derived(sec.company !== false && !!(fCoName || fCoLogo || fCoAddress || fCoContact))
	let showClient    = $derived(sec.client !== false)
	let showSite      = $derived(sec.site !== false)
	let showRevisions = $derived(sec.revisions !== false)
	let showApprovals = $derived(sec.approvals !== false)
	let showScaleSize = $derived(sec.scaleSize !== false)

	// ── Programmable section layout ──
	// Each section has a label + value (or `cols` of label/value cells, or `logo`). `h` is a
	// relative height; `h: 0` means "grow to fill the remaining height" (computed after the
	// fixed sections). One array drives the text grid AND the SVG divider lines, so the
	// borders always match the section boundaries.
	type Cell = { label?: string; value?: string; w?: number; mono?: boolean; big?: boolean }
	type Section = Cell & { h: number; cols?: Cell[]; logo?: boolean; revs?: boolean; company?: boolean }

	let sections = $derived<Section[]>([
		...(showCompany ? [{ company: true, h: 16 } as Section] : []),
		{ logo: true, h: 15 },
		{ label: 'Drawing', value: fTitle || '—', h: 12 },
		...(showSite ? [{ label: 'Site', value: fAddress || '—', h: 0 } as Section] : []), // grows
		// Revision history (only when present + enabled) — grows with the number of entries.
		...(showRevisions && revisions.length ? [{ revs: true, h: 3 + revisions.length * 3 } as Section] : []),
		{ label: 'Date', value: fDate, h: 5, mono: true },
		...(showApprovals ? [{ h: 5, cols: [
			{ label: 'Drawn', value: fDrawnBy || '—', mono: true },
			{ label: 'Chk', value: fCheckedBy || '—', mono: true },
			{ label: 'App', value: fApprovedBy || '—', mono: true },
		] } as Section] : []),
		...(showScaleSize ? [{ h: 5, cols: [
			{ label: 'Scale', value: fScale, w: 2, mono: true },
			{ label: 'Size', value: fPaper, w: 1, mono: true },
		] } as Section] : []),
		{ h: 5, cols: [
			{ label: 'Drawing No', value: fNumber || '—', w: 2, mono: true, big: true },
			{ label: 'Rev.', value: fRevision, w: 1, mono: true, big: true },
		] },
	])

	// Resolve `h` to concrete heights: fixed sections keep their `h`; each `h: 0` section
	// splits the leftover so everything sums to 100.
	let heights = $derived.by(() => {
		const fixedSum = sections.reduce((a, s) => a + (s.h > 0 ? s.h : 0), 0)
		const grows = sections.filter(s => s.h === 0).length
		const growH = grows > 0 ? Math.max(0, (100 - fixedSum) / grows) : 0
		return sections.map(s => (s.h === 0 ? growH : s.h))
	})
	let total = $derived(heights.reduce((a, b) => a + b, 0) || 1)
	let gridRows = $derived(heights.map(h => `${h}fr`).join(' '))

	// Horizontal divider y%s (between adjacent sections; normalised to the resolved heights).
	let hLines = $derived.by(() => {
		const ys: number[] = []
		let acc = 0
		for (let i = 0; i < sections.length - 1; i++) { acc += heights[i]; ys.push((acc / total) * 100) }
		return ys
	})
	// Vertical divider segments inside multi-column sections.
	let vLines = $derived.by(() => {
		const segs: { x: number; y1: number; y2: number }[] = []
		let top = 0
		for (let i = 0; i < sections.length; i++) {
			const s = sections[i]
			const bottom = top + heights[i]
			if (s.cols) {
				const tw = s.cols.reduce((a, c) => a + (c.w ?? 1), 0)
				let cx = 0
				for (let j = 0; j < s.cols.length - 1; j++) {
					cx += s.cols[j].w ?? 1
					segs.push({ x: (cx / tw) * 100, y1: (top / total) * 100, y2: (bottom / total) * 100 })
				}
			}
			top = bottom
		}
		return segs
	})

	const colTemplate = (cols: Cell[]) => cols.map(c => `${c.w ?? 1}fr`).join(' ')

	// ── Drag (reposition only) ──
	let dragStart = $state<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null)

	function onBodyMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !onupdate) return
		e.stopPropagation()
		dragStart = {
			mouseX: e.clientX,
			mouseY: e.clientY,
			startX: posX,
			startY: posY,
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart || !onupdate) return
		const dxMm = (e.clientX - dragStart.mouseX) / pxPerMm
		const dyMm = (e.clientY - dragStart.mouseY) / pxPerMm
		onupdate({ positionMm: { x: dragStart.startX + dxMm, y: dragStart.startY + dyMm } })
	}

	function onMouseUp() {
		dragStart = null
		window.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('mouseup', onMouseUp)
	}

	// ── Resizable logos (19c) ── drag the grip to set a logo's height (mm), persisted per-project.
	// A live override previews the new height during the drag (the stored value round-trips on up).
	let logoHOverride = $state<{ logo?: number; company?: number }>({})
	let hLogo = $derived(logoHOverride.logo ?? (project.logoHeightMm || 0))
	let hCompany = $derived(logoHOverride.company ?? (project.companyLogoHeightMm || 0))
	let gripMm = $derived(8 / (pxPerMm || 1)) // ~8 screen px regardless of zoom
	let logoDrag: { which: 'logo' | 'company'; startH: number; mouseY: number } | null = null
	let clientImg = $state<HTMLImageElement>()
	let coImg = $state<HTMLImageElement>()

	function startLogoResize(which: 'logo' | 'company', e: MouseEvent, img: HTMLImageElement) {
		if (e.button !== 0 || !onlogoresize) return
		e.stopPropagation(); e.preventDefault()
		const cur = which === 'company' ? hCompany : hLogo
		const startH = cur || img.offsetHeight || 24
		logoDrag = { which, startH, mouseY: e.clientY }
		window.addEventListener('mousemove', onLogoMove)
		window.addEventListener('mouseup', onLogoUp)
	}
	function onLogoMove(e: MouseEvent) {
		if (!logoDrag) return
		const dMm = (e.clientY - logoDrag.mouseY) / (pxPerMm || 1)
		const h = Math.max(4, Math.round(logoDrag.startH + dMm))
		logoHOverride = { ...logoHOverride, [logoDrag.which]: h }
	}
	function onLogoUp() {
		if (logoDrag) { const h = logoHOverride[logoDrag.which]; if (h) onlogoresize?.(logoDrag.which, h) }
		logoDrag = null
		window.removeEventListener('mousemove', onLogoMove)
		window.removeEventListener('mouseup', onLogoUp)
	}

	// 29d: click a logo to select it → show a selection box with full handles (height resize, aspect
	// locked, so any handle drags vertically). Much clearer than the old tiny corner grip.
	let logoSel = $state<'logo' | 'company' | null>(null)
	const LOGO_HANDLES = [
		{ x: '0%', y: '0%', cur: 'nwse-resize' }, { x: '50%', y: '0%', cur: 'ns-resize' }, { x: '100%', y: '0%', cur: 'nesw-resize' },
		{ x: '0%', y: '50%', cur: 'ew-resize' }, { x: '100%', y: '50%', cur: 'ew-resize' },
		{ x: '0%', y: '100%', cur: 'nesw-resize' }, { x: '50%', y: '100%', cur: 'ns-resize' }, { x: '100%', y: '100%', cur: 'nwse-resize' },
	]
	$effect(() => {
		if (!logoSel) return
		const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement)?.closest?.('.tb-logo')) logoSel = null }
		window.addEventListener('mousedown', onDown, true)
		return () => window.removeEventListener('mousedown', onDown, true)
	})
</script>

{#snippet logoSelOverlay(which: 'logo' | 'company', getImg: () => HTMLImageElement | undefined)}
	{#if onlogoresize && logoSel === which}
		<div class="pointer-events-none absolute inset-0 z-10 border border-blue-500 print:hidden"></div>
		{#each LOGO_HANDLES as h (h.x + h.y)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 border border-blue-500 bg-white print:hidden"
				style:width="{gripMm}px" style:height="{gripMm}px" style:left={h.x} style:top={h.y} style:cursor={h.cur}
				onmousedown={(e: MouseEvent) => { const img = getImg(); if (img) startLogoResize(which, e, img) }}></div>
		{/each}
	{/if}
{/snippet}

{#snippet cell(c: Cell)}
	<div class="p-1 flex flex-col min-w-0 overflow-hidden">
		{#if c.label}<span class="text-[1.6pt] uppercase tracking-wider text-zinc-500 leading-none">{c.label}</span>{/if}
		{#if c.value !== undefined}
			<span class={['leading-tight mt-0.5', c.mono && 'font-mono', c.big ? 'text-[3.2pt] font-bold' : 'text-[2.6pt]']}>{c.value}</span>
		{/if}
	</div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Vertical title block. Sections are data-driven (see `sections`); text lives in the HTML
     grid while all lines are an SVG overlay of non-scaling strokes (shared `.dwg-line`), so
     frame + dividers are one identical crisp hairline at any zoom and in PDF. -->
<div
	class="tb absolute select-none text-black"
	style:left="{posX}px"
	style:top="{posY}px"
	style:width="{widthMm}px"
	style:height="{heightMm}px"
	style:cursor={onupdate ? (dragStart ? 'grabbing' : 'grab') : 'default'}
	onmousedown={onBodyMouseDown}
>
	<div class="tb-grid" style:grid-template-rows={gridRows}>
		{#each sections as s, i (i)}
			{#if s.company}
				<!-- Our company block: logo / name / address / contact -->
				<div class="p-1 flex flex-col items-center gap-0.5 overflow-hidden">
					{#if fCoLogo}
						{@const ch = hCompany}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="tb-logo pointer-events-auto relative inline-block" style:cursor={onlogoresize ? 'pointer' : undefined}
							onmousedown={(e: MouseEvent) => { if (onlogoresize) { e.stopPropagation(); logoSel = 'company' } }}>
							<img bind:this={coImg} src={fCoLogo} alt="company logo" class="w-auto object-contain {ch ? '' : 'max-h-8'}" style:height={ch ? `${ch}px` : undefined} draggable="false" />
							{@render logoSelOverlay('company', () => coImg)}
						</div>
					{/if}
					{#if fCoName}<div class="text-[3pt] font-bold uppercase tracking-wider text-center leading-tight">{fCoName}</div>{/if}
					{#if fCoAddress}<div class="text-[1.8pt] text-zinc-600 text-center leading-tight">{fCoAddress}</div>{/if}
					{#if fCoContact}<div class="text-[1.8pt] text-zinc-600 text-center leading-tight">{fCoContact}</div>{/if}
				</div>
			{:else if s.logo}
				<!-- Client logo / project name -->
				<div class="p-1 flex flex-col items-center gap-0.5 overflow-hidden">
					{#if showClient && fLogo}
						{@const lh = hLogo}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="tb-logo pointer-events-auto relative inline-block" style:cursor={onlogoresize ? 'pointer' : undefined}
							onmousedown={(e: MouseEvent) => { if (onlogoresize) { e.stopPropagation(); logoSel = 'logo' } }}>
							<img bind:this={clientImg} src={fLogo} alt="logo" class="w-auto object-contain {lh ? '' : 'max-h-8'}" style:height={lh ? `${lh}px` : undefined} draggable="false" />
							{@render logoSelOverlay('logo', () => clientImg)}
						</div>
					{/if}
					<div class="text-[3pt] font-bold uppercase tracking-wider text-center leading-tight">{fProjectName || '—'}</div>
					{#if showClient && fClient}<div class="text-[2pt] text-zinc-600 text-center">{fClient}</div>{/if}
				</div>
			{:else if s.revs}
				<!-- Revision history table (code · date · note) -->
				<div class="flex flex-col overflow-hidden">
					<div class="mt-1 grid border-b border-zinc-300 px-1 text-[1.6pt] uppercase tracking-wider text-zinc-500 leading-none" style:grid-template-columns="1fr 2fr 4fr">
						<span>Rev</span><span>Date</span>
						<span>Description</span>
					</div>
					{#each revisions as r (r.code)}
						<div class="grid items-center border-b border-zinc-200 px-1 text-[2pt] leading-tight" style:grid-template-columns="1fr 2fr 4fr">
							<span class="font-mono font-bold">{r.code}</span>
							<span class="font-mono">{r.date ?? ''}</span>
							<span class="truncate">{r.note ?? ''}</span>
						</div>
					{/each}
				</div>
			{:else if s.cols}
				<div class="grid overflow-hidden" style:grid-template-columns={colTemplate(s.cols)}>
					{#each s.cols as c, j (j)}{@render cell(c)}{/each}
				</div>
			{:else}
				{@render cell(s)}
			{/if}
		{/each}
	</div>

	<!-- Line overlay: non-scaling strokes → uniform crisp hairlines, screen + PDF. -->
	<svg class="tb-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
		<rect class="dwg-line" x="0" y="0" width="100" height="100" vector-effect="non-scaling-stroke" />
		{#each hLines as y, i (i)}
			<line class="dwg-line" x1="0" y1={y} x2="100" y2={y} vector-effect="non-scaling-stroke" />
		{/each}
		{#each vLines as v, i (i)}
			<line class="dwg-line" x1={v.x} y1={v.y1} x2={v.x} y2={v.y2} vector-effect="non-scaling-stroke" />
		{/each}
	</svg>
</div>

<style>
	.tb {
		background: #fff;
	}
	.tb-grid {
		display: grid;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	.tb-lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible; /* don't clip the outer frame stroke */
		pointer-events: none;
	}
</style>
