<script lang="ts">
	/**
	 * Package print preview.
	 *
	 * Loads the target package + its items, resolves each item to a Page doc
	 * (walking the linked DrawingDoc's sourceDocId), and renders every page's
	 * paper stacked vertically with CSS `break-after: page`. The browser's
	 * native print dialog turns the result into a multi-page PDF / paper job.
	 *
	 * Limitation: CSS `@page { size }` is applied globally to the entire print
	 * job, so if the package mixes paper sizes, the first page's size wins.
	 * For mixed-size packages, export in groups.
	 */
	import { onMount } from 'svelte'
	import { page as routePage } from '$app/state'
	import { Firestore, Spinner, Titlebar } from '$lib'
	import type { DrawingDoc, PackageDoc, PackageItemDoc, RevisionDoc } from '$lib/types/versioning'
	import type { Page } from '$lib/types/pages'
	import { pageDocId } from '$lib/pages/service'
	import { paperDimsMm } from '$lib/ui/print/types'
	import { triggerPrint } from '$lib/ui/print'
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

	function handlePrintNow() {
		if (!resolvedPages.length) return
		// Use the first page's paper for the global @page size.
		triggerPrint(resolvedPages[0].page.paper, '.pkg-print-container')
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
			<!-- Each sheet forces a page break after it (except the last). -->
			<div class="sheet-wrap mx-auto my-4 bg-white shadow-md relative"
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
