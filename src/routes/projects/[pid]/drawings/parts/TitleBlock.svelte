<script lang="ts">
	import type { TitleBlockConfig } from '$lib/types/pages'

	/**
	 * Project-level defaults for title-block fields. Anything absent here can
	 * still be populated via `config.fields` on a per-page basis.
	 */
	export interface TitleBlockProjectDefaults {
		name?: string
		author?: string
		address?: string
		logoUrl?: string
		client?: string
	}

	let {
		config,
		project = {},
		drawingTitle,
		drawingNumber,
		revisionCode,
		paperSize,
		scaleDenominator,
		pxPerMm,
		onupdate,
	}: {
		config: TitleBlockConfig
		project?: TitleBlockProjectDefaults
		drawingTitle: string
		drawingNumber?: string
		revisionCode?: string
		paperSize: string
		scaleDenominator: number
		/** Canvas zoom factor — used to convert px drag deltas to mm. */
		pxPerMm: number
		/** Optional callback to persist layout changes (position, size, template). */
		onupdate?: (patch: Partial<TitleBlockConfig>) => void
	} = $props()

	let template = $derived(config.template ?? 'standard')

	/** Default placement is computed by the canvas; here we just consume it. Default size per template. */
	let posX = $derived(config.positionMm?.x ?? 0)
	let posY = $derived(config.positionMm?.y ?? 0)
	let widthMm = $derived(config.widthMm ?? (template === 'compact' ? 120 : template === 'vertical' ? 40 : 180))
	let heightMm = $derived(config.heightMm ?? (template === 'compact' ? 20 : template === 'vertical' ? 180 : 60))

	/**
	 * Resolve a field in priority order: per-page override > project default > fallback.
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

	/**
	 * ── Programmable section layout ──
	 * One data structure drives BOTH the text grid AND the SVG divider lines, so
	 * borders always match section boundaries. A dev tunes a drawing's layout by
	 * editing the `sections` config below — relative heights (`h`, 0 = grow to
	 * fill), per-section `cols` with relative widths (`w`), and cell kinds.
	 * Each template is just a different section config + default footprint.
	 */
	type Cell = {
		label?: string
		value?: string
		w?: number
		mono?: boolean
		big?: boolean
		/** Identity block: logo + project name + client + address. */
		kind?: 'identity'
		center?: boolean
	}
	type Section = Cell & { h: number; cols?: Cell[] }

	let sections = $derived.by<Section[]>(() => {
		if (template === 'compact') {
			return [{
				h: 100,
				cols: [
					{ value: `${fProjectName ? fProjectName + ' · ' : ''}${fTitle || '—'}`, w: 4 },
					{ label: 'No.', value: fNumber || '—', mono: true, w: 1 },
					{ label: 'Rev', value: fRevision, mono: true, big: true, w: 1 },
					{ label: 'Scale', value: fScale, mono: true, w: 1 },
					{ label: 'Size', value: fPaper, mono: true, w: 1 },
				],
			}]
		}
		if (template === 'vertical') {
			return [
				{ kind: 'identity', center: true, h: 15 },
				{ label: 'Drawing', value: fTitle || '—', h: 12 },
				{ label: 'Site', value: fAddress || '—', h: 0 }, // grows
				{ h: 6, cols: [
					{ label: 'Drawn', value: fDrawnBy || '—', mono: true },
					{ label: 'Chk', value: fCheckedBy || '—', mono: true },
					{ label: 'App', value: fApprovedBy || '—', mono: true },
				] },
				{ label: 'Date', value: fDate, mono: true, h: 6 },
				{ h: 6, cols: [
					{ label: 'Scale', value: fScale, w: 2, mono: true },
					{ label: 'Size', value: fPaper, w: 1, mono: true },
				] },
				{ h: 6, cols: [
					{ label: 'Drawing No.', value: fNumber || '—', w: 2, mono: true, big: true },
					{ label: 'Rev.', value: fRevision, w: 1, mono: true, big: true },
				] },
			]
		}
		// standard — ISO-style three bands; the 40/60 split + sub-columns reproduce
		// the classic grid using relative widths so it stays dev-tunable + crisp.
		return [
			{ h: 40, cols: [
				{ kind: 'identity', w: 40 },
				{ label: 'Drawing Title', value: fTitle || '—', w: 60, big: true },
			] },
			{ h: 30, cols: [
				{ label: 'Drawn', value: fDrawnBy || '—', mono: true, w: 40 / 3 },
				{ label: 'Checked', value: fCheckedBy || '—', mono: true, w: 40 / 3 },
				{ label: 'Approved', value: fApprovedBy || '—', mono: true, w: 40 / 3 },
				{ label: 'Drawing No.', value: fNumber || '—', mono: true, big: true, w: 40 },
				{ label: 'Rev.', value: fRevision, mono: true, big: true, w: 20 },
			] },
			{ h: 30, cols: [
				{ label: 'Date', value: fDate, mono: true, w: 40 },
				{ label: 'Scale', value: fScale, mono: true, w: 30 },
				{ label: 'Size', value: fPaper, mono: true, w: 30 },
			] },
		]
	})

	// Resolve `h`: fixed sections keep their `h`; each `h: 0` section splits the leftover.
	let heights = $derived.by(() => {
		const fixedSum = sections.reduce((a, s) => a + (s.h > 0 ? s.h : 0), 0)
		const grows = sections.filter(s => s.h === 0).length
		const growH = grows > 0 ? Math.max(0, (100 - fixedSum) / grows) : 0
		return sections.map(s => (s.h === 0 ? growH : s.h))
	})
	let total = $derived(heights.reduce((a, b) => a + b, 0) || 1)
	let gridRows = $derived(heights.map(h => `${h}fr`).join(' '))

	// Horizontal divider y%s (between adjacent sections).
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
		dragStart = { mouseX: e.clientX, mouseY: e.clientY, startX: posX, startY: posY }
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
</script>

{#snippet cell(c: Cell)}
	{#if c.kind === 'identity'}
		<div class="p-1 flex flex-col gap-0.5 overflow-hidden {c.center ? 'items-center text-center' : ''}">
			{#if fLogo}
				<img src={fLogo} alt="logo" class="max-h-8 w-auto object-contain" draggable="false" />
			{/if}
			<div class="text-[3pt] font-bold uppercase tracking-wider leading-tight">{fProjectName || '—'}</div>
			{#if fClient}<div class="text-[2pt] text-zinc-600 leading-tight">{fClient}</div>{/if}
			{#if fAddress}<div class="text-[2pt] text-zinc-500 leading-tight line-clamp-2">{fAddress}</div>{/if}
		</div>
	{:else}
		<div class="p-1 flex flex-col min-w-0 overflow-hidden">
			{#if c.label}<span class="text-[1.6pt] uppercase tracking-wider text-zinc-500 leading-none">{c.label}</span>{/if}
			{#if c.value !== undefined}
				<span class={['leading-tight mt-0.5', c.mono && 'font-mono', c.big ? 'text-[3.2pt] font-bold' : 'text-[2.6pt]']}>{c.value}</span>
			{/if}
		</div>
	{/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Data-driven title block: text lives in the HTML grid, every line is an SVG
     overlay of non-scaling strokes (shared `.dwg-line`), so frame + dividers are
     one identical crisp hairline at any zoom and in PDF. -->
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
			{#if s.cols}
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
	.tb { background: #fff; }
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
