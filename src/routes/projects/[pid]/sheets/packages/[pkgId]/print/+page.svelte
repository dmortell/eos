<script lang="ts">
	/**
	 * Package print preview — renders every sheet in a drawing set, one per paper page.
	 *
	 * Reuses the sheet editor's own rendering: each sheet's paper holds its Viewport components
	 * (read-only via a shared, never-activated ViewportEditor — Viewport reads geometry from its
	 * `vp` prop, so one controller serves them all) plus the TitleBlock. Pagination uses named
	 * `@page` rules per paper size + `break-after: page`, and the px→mm scale trick (PX_PER_MM)
	 * so 1 world-unit prints as 1 real millimetre — same contract as the single-sheet canvas print.
	 */
	import { onDestroy, getContext } from 'svelte'
	import { page as routePage } from '$app/state'
	import { Firestore, Spinner, Titlebar } from '$lib'
	import { DEFAULT_PRINT_SETTINGS, paperDimsMm, type PrintSettings } from '$lib/ui/print/types'
	import type { SheetDoc, SheetPackage, TitleBlockConfig } from '../../../types'
	import { subscribeSheets, subscribeSheetPackages } from '../../../data'
	import { ViewportEditor } from '../../../viewports.svelte'
	import Viewport from '../../../Viewport.svelte'
	import TitleBlock, { type TitleBlockProjectDefaults } from '../../../parts/TitleBlock.svelte'

	const db = getContext('db') as Firestore
	let pid = $derived(routePage.params.pid ?? '')
	let pkgId = $derived(routePage.params.pkgId ?? '')

	let sheets = $state<SheetDoc[]>([])
	let packages = $state<SheetPackage[]>([])
	let project = $state<TitleBlockProjectDefaults>({})
	let projectName = $state('')
	let loaded = $state(false)

	$effect(() => { if (!pid) return; const u = subscribeSheets(db, pid, d => { sheets = d; loaded = true }); return () => u?.() })
	$effect(() => { if (!pid) return; const u = subscribeSheetPackages(db, pid, d => packages = d); return () => u?.() })
	$effect(() => {
		if (!pid) return
		const u = db.subscribeOne('projects', pid, (d: any) => {
			projectName = d?.name ?? ''
			project = { name: d?.name, author: d?.author, address: d?.address, logoUrl: d?.logoUrl, client: d?.client }
		})
		return () => u?.()
	})

	let pkg = $derived(packages.find(p => p.id === pkgId) ?? null)
	let sheetsById = $derived(Object.fromEntries(sheets.map(s => [s.id, s])) as Record<string, SheetDoc>)
	// Ordered sheets of the package (skip any that were deleted).
	let printSheets = $derived((pkg?.sheetIds ?? []).map(id => sheetsById[id]).filter(Boolean) as SheetDoc[])

	// One shared read-only controller — nothing is ever selected/active, so it serves all sheets.
	const vps = new ViewportEditor()

	const paperOf = (s: SheetDoc): PrintSettings => ({ ...DEFAULT_PRINT_SETTINGS, ...(s.paper ?? {}) })
	/** Effective title-block config (mirrors SheetEditor): null = hidden, else default vertical strip. */
	function titleBlockOf(s: SheetDoc, paperMm: { w: number; h: number }): TitleBlockConfig | null {
		const tb = s.titleBlock
		if (tb === null) return null
		const cfg = tb ?? { template: 'vertical' as const }
		const m = (s.paper?.margins ?? DEFAULT_PRINT_SETTINGS.margins)
		let w: number, h: number, x: number, y: number
		if (cfg.template === 'compact') { w = 120; h = 20; x = paperMm.w - w - m; y = paperMm.h - h - m }
		else if (cfg.template === 'horizontal') { w = 180; h = 60; x = paperMm.w - w - m; y = paperMm.h - h - m }
		else { w = 40; h = paperMm.h - m * 2; x = paperMm.w - w - m; y = m }
		return { ...cfg, positionMm: cfg.positionMm ?? { x, y }, widthMm: cfg.widthMm ?? w, heightMm: cfg.heightMm ?? h }
	}

	// ── print styles (px→mm scale; named @page only when paper sizes are mixed) ──
	// Kept ALWAYS present (not injected on a button press) so Ctrl-P works the same as the Print
	// button. For a single paper size we use a plain @page (no `page:` property) — the named-page
	// switch is what inserts a blank lead page, so it's only used when sizes actually differ, and
	// then the body is bound to the first sheet's page so the document starts on it.
	const STYLE_ID = 'sheet-pkg-print-style'
	const PX_PER_MM = 96 / 25.4
	const sizeClass = (p: PrintSettings) => `pgsz-${p.paperSize}-${p.orientation}`
	let uniquePapers = $derived.by(() => {
		const seen = new Set<string>(); const out: { cls: string; w: number; h: number }[] = []
		for (const s of printSheets) { const p = paperOf(s); const cls = sizeClass(p); if (seen.has(cls)) continue; seen.add(cls); const d = paperDimsMm(p); out.push({ cls, w: d.w, h: d.h }) }
		return out
	})
	function buildCss(): string {
		const papers = uniquePapers
		if (!papers.length) return ''
		const multi = papers.length > 1
		let r = ''
		if (multi) {
			for (const c of papers) r += `@page ${c.cls}{size:${c.w}mm ${c.h}mm;margin:0}\n`
			r += `@media print{\n body{page:${sizeClass(paperOf(printSheets[0]))}}\n`
			for (const c of papers) r += ` .${c.cls}{page:${c.cls};width:${c.w}mm!important;height:${c.h}mm!important}\n`
		} else {
			const c = papers[0]
			r += `@page{size:${c.w}mm ${c.h}mm;margin:0}\n@media print{\n .${c.cls}{width:${c.w}mm!important;height:${c.h}mm!important}\n`
		}
		r += ` html,body{margin:0;padding:0;background:#fff!important}\n`
		r += ` [data-no-print]{display:none!important}\n`
		r += ` .pkg-root{display:contents!important}\n` // no wrapper box before the first sheet
		r += ` .sheet-wrap{margin:0!important;box-shadow:none!important;overflow:hidden;break-after:page}\n`
		r += ` .sheet-wrap:last-child{break-after:auto}\n`
		r += ` .sheet-content{transform:scale(${PX_PER_MM})!important;transform-origin:0 0!important}\n}\n`
		return r
	}
	// Always-present style element, kept in sync with the package's paper sizes.
	$effect(() => {
		let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
		if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el) }
		el.textContent = buildCss()
	})
	onDestroy(() => document.getElementById(STYLE_ID)?.remove())
	function printNow() { if (printSheets.length) window.print() }
</script>

<div data-no-print><Titlebar title="{projectName} — Print preview" height={30} /></div>

{#if !loaded}
	<div class="flex h-screen items-center justify-center"><Spinner>Loading…</Spinner></div>
{:else if !pkg}
	<div class="p-6 text-sm text-red-500">Package not found.</div>
{:else}
	<div class="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900" data-no-print>
		<span class="font-semibold">{pkg.name}</span>
		<span class="text-zinc-500">· {printSheets.length} sheet{printSheets.length === 1 ? '' : 's'}</span>
		<div class="ml-auto flex gap-1.5">
			<button class="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500" onclick={printNow}>Print</button>
			<a href="/projects/{pid}/sheets" class="rounded border border-zinc-300 px-2 py-1 text-zinc-600 hover:border-blue-400 dark:border-zinc-700 dark:text-zinc-300">Close</a>
		</div>
	</div>

	{#if printSheets.length === 0}
		<div class="p-6 text-sm text-zinc-400">This package has no sheets.</div>
	{/if}

	<div class="pkg-root min-h-screen bg-zinc-200 dark:bg-zinc-950">
		{#each printSheets as sheet (sheet.id)}
			{@const paper = paperOf(sheet)}
			{@const paperMm = paperDimsMm(paper)}
			{@const tbCfg = titleBlockOf(sheet, paperMm)}
			<div class="sheet-wrap mx-auto my-4 bg-white shadow-md {sizeClass(paper)}" style:width="{paperMm.w}px" style:height="{paperMm.h}px">
				<div class="sheet-content cad-thin relative" style:width="{paperMm.w}px" style:height="{paperMm.h}px" style:--screen-scale="1">
					{#if paper.margins > 0}
						<svg class="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox="0 0 {paperMm.w} {paperMm.h}" preserveAspectRatio="none" aria-hidden="true">
							<rect class="dwg-line" x={paper.margins} y={paper.margins} width={paperMm.w - 2 * paper.margins} height={paperMm.h - 2 * paper.margins} vector-effect="non-scaling-stroke" />
						</svg>
					{/if}
					{#each sheet.viewports ?? [] as vp (vp.id)}
						<Viewport {vps} {vp} zoom={1} />
					{/each}
					{#if tbCfg}
						<TitleBlock config={tbCfg} {project} drawingTitle={sheet.title} drawingNumber={sheet.drawingNumber}
							revisionCode={sheet.currentRevision} revisions={sheet.revisions ?? []}
							paperSize={paper.paperSize} scaleDenominator={paper.scale || 100} pxPerMm={1} />
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
