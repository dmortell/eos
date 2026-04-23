<script lang="ts">
	/**
	 * Package print preview.
	 *
	 * Loads the target package + its items, resolves each item to a Page doc
	 * (walking the linked DrawingDoc's sourceDocId), and renders every page's
	 * paper stacked vertically with CSS `break-after: page`. The browser's
	 * native print dialog turns the result into a multi-page PDF / paper job.
	 *
	 * Mixed paper sizes are supported via named `@page` rules + the CSS `page`
	 * property: we emit one `@page pkg_<size>_<orientation> { size: … }` rule
	 * per unique (paperSize, orientation) combination in the package, then tag
	 * each sheet with a matching class so the browser switches page size as it
	 * paginates between sheets.
	 */
	import { onMount, onDestroy } from 'svelte'
	import { page as routePage } from '$app/state'
	import { Firestore, Spinner, Titlebar } from '$lib'
	import type { DrawingDoc, PackageDoc, PackageItemDoc, RevisionDoc } from '$lib/types/versioning'
	import type { Page } from '$lib/types/pages'
	import { pageDocId } from '$lib/pages/service'
	import { paperDimsMm } from '$lib/ui/print/types'
	import ViewportFrame from '../../../drawings/parts/ViewportFrame.svelte'
	import TitleBlock, { type TitleBlockProjectDefaults } from '../../../drawings/parts/TitleBlock.svelte'

	let db = new Firestore()
	let pid = $derived(routePage.params.pid)
	let pkgId = $derived(routePage.params.pkgId)

	let pkg = $state<PackageDoc | null>(null)
	let items = $state<PackageItemDoc[]>([])
	let projectName = $state('')
	let projectDefaults = $state<TitleBlockProjectDefaults>({})
	/** Per-item resolved page snapshot — keyed by `${drawingId}_${revisionId}`. */
	let resolvedPages = $state<Array<{ page: Page; revisionCode: string; drawingId: string }>>([])
	let loading = $state(true)
	let error = $state('')

	// Project metadata for title blocks.
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
			projectDefaults = {
				name: data?.name,
				author: data?.author ?? data?.ownerName,
				address: data?.address,
				logoUrl: data?.logoUrl,
				client: data?.client,
			}
		})
		return () => { unsub?.() }
	})

	onMount(async () => {
		if (!pid || !pkgId) return
		try {
			pkg = await db.getOne(`projects/${pid}/packages`, pkgId) as unknown as PackageDoc
			if (!pkg) { error = 'Package not found'; loading = false; return }

			items = (await db.getMany(`projects/${pid}/packages/${pkgId}/items`)) as unknown as PackageItemDoc[]
			items = items.filter(i => i.include).sort((a, b) => a.sheetOrder - b.sheetOrder)

			// Walk items: only page-typed drawings render here. For each, load the
			// pinned revision's snapshot — which contains the viewport array as it
			// was at publish time, including sourcePin fields.
			const out: typeof resolvedPages = []
			for (const item of items) {
				const drawing = await db.getOne(`projects/${pid}/drawings`, item.drawingId) as unknown as DrawingDoc
				if (!drawing || drawing.toolType !== 'page') continue
				const revision = await db.getOne(`projects/${pid}/drawings/${item.drawingId}/revisions`, item.revisionId) as unknown as RevisionDoc
				if (!revision) continue
				const version = await db.getOne(`projects/${pid}/drawings/${item.drawingId}/versions`, revision.fromVersionId) as any
				const snapshot = version?.snapshot as Partial<Page> | undefined
				if (!snapshot) continue

				// Extract pageId from the sourceDocId `${pid}_${pageId}`.
				const prefix = `${pid}_`
				const pageId = drawing.sourceDocId.startsWith(prefix) ? drawing.sourceDocId.slice(prefix.length) : drawing.sourceDocId
				const id = pageDocId(pid ?? '', pageId)

				const page: Page = {
					id,
					projectId: pid ?? '',
					title: snapshot.title ?? drawing.title,
					drawingNumber: snapshot.drawingNumber,
					order: snapshot.order ?? 0,
					paper: snapshot.paper ?? { paperSize: 'A3', orientation: 'landscape', drawingOffset: { x: 0, y: 0 }, scale: 100, showPaper: false, margins: 10 },
					titleBlock: snapshot.titleBlock ?? null,
					viewports: snapshot.viewports ?? [],
					notes: snapshot.notes,
					includeInPackages: snapshot.includeInPackages,
				}
				out.push({ page, revisionCode: revision.code, drawingId: drawing.id })
			}
			resolvedPages = out
			loading = false
		} catch (e: any) {
			error = e?.message ?? 'Failed to load package'
			loading = false
		}
	})

	/**
	 * Per-sheet class name used to tag each sheet-wrap + to build CSS rules.
	 * Two sheets sharing paperSize+orientation share a class (and named @page).
	 */
	function sheetClassFor(p: Page['paper']): string {
		return `sheet-size-${p.paperSize}-${p.orientation}`
	}
	function pageNameFor(p: Page['paper']): string {
		return `pkg_${p.paperSize}_${p.orientation}`
	}

	/**
	 * Unique (paperSize, orientation) pairs present in the package. One named
	 * `@page` rule + one `.sheet-size-…` CSS rule emitted per entry.
	 */
	let uniquePaperConfigs = $derived.by(() => {
		const seen = new Set<string>()
		const out: Array<{ paper: Page['paper']; wMm: number; hMm: number }> = []
		for (const { page } of resolvedPages) {
			const key = sheetClassFor(page.paper)
			if (seen.has(key)) continue
			seen.add(key)
			const dims = paperDimsMm(page.paper)
			out.push({ paper: page.paper, wMm: dims.w, hMm: dims.h })
		}
		return out
	})

	const PRINT_STYLE_ID = 'pkg-multi-page-style'

	/**
	 * Inject named @page rules + the `.sheet-size-…` classes that bind each
	 * sheet to its size. Chrome honours the CSS `page:` property, shifting
	 * paper size at page-break boundaries — the mechanism powering
	 * mixed-paper-size output.
	 */
	function injectMultiPageStyles() {
		let rules = ''
		for (const cfg of uniquePaperConfigs) {
			const pageName = pageNameFor(cfg.paper)
			const cls = sheetClassFor(cfg.paper)
			rules += `@page ${pageName} { size: ${cfg.wMm}mm ${cfg.hMm}mm; margin: 0; }\n`
			rules += `.${cls} { page: ${pageName}; }\n`
		}
		rules += `@media print {\n`
		rules += `  html, body { margin: 0; padding: 0; background: white !important; }\n`
		rules += `  .sidebar-area, [data-no-print] { display: none !important; }\n`
		rules += `  .sheet-wrap { margin: 0 !important; box-shadow: none !important; page-break-after: always; break-after: page; }\n`
		rules += `  .sheet-wrap:last-child { page-break-after: auto; break-after: auto; }\n`
		rules += `}\n`

		let el = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null
		if (!el) {
			el = document.createElement('style')
			el.id = PRINT_STYLE_ID
			document.head.appendChild(el)
		}
		el.textContent = rules
	}

	function removeMultiPageStyles() {
		document.getElementById(PRINT_STYLE_ID)?.remove()
	}

	onDestroy(removeMultiPageStyles)

	function handlePrintNow() {
		if (!resolvedPages.length) return
		injectMultiPageStyles()
		const cleanup = () => {
			removeMultiPageStyles()
			window.removeEventListener('afterprint', cleanup)
		}
		window.addEventListener('afterprint', cleanup)
		requestAnimationFrame(() => window.print())
	}
</script>

<div class="print:hidden">
	<Titlebar title="{projectName} — Print preview" height={30} />
</div>

{#if loading}
	<div class="flex items-center justify-center h-screen"><Spinner>Loading package…</Spinner></div>
{:else if error}
	<div class="p-6 text-red-500 text-sm">{error}</div>
{:else}
	<!-- Floating toolbar (hidden during print) -->
	<div class="print:hidden sticky top-0 z-10 flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs">
		<span class="font-semibold">{pkg?.name}</span>
		<span class="text-zinc-500">· {resolvedPages.length} sheet{resolvedPages.length === 1 ? '' : 's'}</span>
		<div class="ml-auto flex gap-1.5">
			<button class="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500" onclick={handlePrintNow}>Print</button>
			<a href="/projects/{pid}/packages" class="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-blue-400">Close</a>
		</div>
	</div>

	<div class="bg-zinc-200 dark:bg-zinc-950 min-h-screen pkg-print-container">
		{#each resolvedPages as { page: pg, revisionCode }, idx (pg.id + '_' + revisionCode)}
			{@const paperMm = paperDimsMm(pg.paper)}
			{@const titleBlockCfg = pg.titleBlock === null
				? null
				: {
					...(pg.titleBlock ?? { template: 'standard' as const }),
					positionMm: pg.titleBlock?.positionMm ?? (
						pg.titleBlock?.template === 'vertical'
							? { x: paperMm.w - 40 - pg.paper.margins, y: pg.paper.margins }
							: pg.titleBlock?.template === 'compact'
								? { x: paperMm.w - 120 - pg.paper.margins, y: paperMm.h - 20 - pg.paper.margins }
								: { x: paperMm.w - 180 - pg.paper.margins, y: paperMm.h - 60 - pg.paper.margins }
					),
					widthMm: pg.titleBlock?.widthMm ?? (
						pg.titleBlock?.template === 'vertical' ? 40
							: pg.titleBlock?.template === 'compact' ? 120 : 180
					),
					heightMm: pg.titleBlock?.heightMm ?? (
						pg.titleBlock?.template === 'vertical' ? paperMm.h - pg.paper.margins * 2
							: pg.titleBlock?.template === 'compact' ? 20 : 60
					),
			}}
			<!--
				Each sheet forces a page break after it (except the last). The
				`sheet-size-…` class binds it to a named @page rule injected by
				`injectMultiPageStyles`, so mixed-paper-size packages pick up the
				right paper size at each break.
			-->
			<div class="sheet-wrap mx-auto my-4 bg-white shadow-md relative {sheetClassFor(pg.paper)}"
				class:break-after-page={idx < resolvedPages.length - 1}
				style:width="{paperMm.w}px"
				style:height="{paperMm.h}px">
				<div class="absolute inset-0 relative" style:width="{paperMm.w}px" style:height="{paperMm.h}px">
					{#each pg.viewports as vp (vp.id)}
						<ViewportFrame
							viewport={vp}
							selected={false}
							pxPerMm={1}
							{db}
							projectId={pid ?? ''}
							onselect={() => {}}
							onupdate={() => {}} />
					{/each}
					{#if titleBlockCfg}
						<TitleBlock
							config={titleBlockCfg}
							project={projectDefaults}
							drawingTitle={pg.title}
							drawingNumber={pg.drawingNumber}
							revisionCode={revisionCode}
							paperSize={pg.paper.paperSize}
							scaleDenominator={pg.paper.scale || 100}
							pxPerMm={1} />
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* Per-sheet page break — Tailwind JIT covers `break-after-page` from v3. */
	:global(.break-after-page) { break-after: page; page-break-after: always; }
	@media print {
		.sheet-wrap { margin: 0 !important; box-shadow: none !important; }
		:global(body) { background: white !important; }
	}
</style>
