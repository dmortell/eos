<script lang="ts">
	import { page as routePage } from '$app/state'
	import { goto } from '$app/navigation'
	import { getContext } from 'svelte'
	import { Button, Icon, Input, Firestore, Spinner, Titlebar, Session } from '$lib'
	import type { Page, Viewport, ViewportSource } from '$lib/types/pages'
	import type { DrawingDoc } from '$lib/types/versioning'
	import { subscribePage, savePage, deletePage } from '$lib/pages/service'
	import { DEFAULT_PRINT_SETTINGS } from '$lib/ui/print/types'
	import PageCanvas from '../../parts/PageCanvas.svelte'

	let db = new Firestore()
	let session = getContext('session') as Session

	let pid = $derived(routePage.params.pid)
	let pageId = $derived(routePage.params.pageId)

	let pageData = $state<Page | null>(null)
	let drawing = $state<DrawingDoc | null>(null)
	let loading = $state(true)
	let selectedViewportId = $state<string | null>(null)
	let projectName = $state('')

	// Window dims for canvas sizing.
	let innerWidth = $state(1200)
	let innerHeight = $state(800)
	const SIDEBAR_W = 280
	let canvasWidth = $derived(innerWidth - SIDEBAR_W)
	let canvasHeight = $derived(innerHeight - 30) // titlebar only

	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
		})
		return () => { unsub?.() }
	})

	// Subscribe to the page doc.
	$effect(() => {
		if (!pid || !pageId) return
		loading = true
		const unsub = subscribePage(db, pid, pageId, p => {
			pageData = p ?? {
				id: `${pid}_${pageId}`,
				projectId: pid,
				title: 'Untitled Page',
				order: 0,
				paper: { ...DEFAULT_PRINT_SETTINGS },
				viewports: [],
				includeInPackages: true,
			}
			loading = false
		})
		return () => { unsub?.() }
	})

	// Find the linked DrawingDoc so we can mirror title/includeInPackages edits onto it.
	$effect(() => {
		if (!pid || !pageId) return
		const unsub = db.subscribeWhere(`projects/${pid}/drawings`, 'sourceDocId', `${pid}_${pageId}`, docs => {
			const match = (docs as unknown as DrawingDoc[]).find(d => d.toolType === 'page' && d.status === 'active')
			drawing = match ?? null
		})
		return () => { unsub?.() }
	})

	let selectedViewport = $derived.by(() => {
		if (!selectedViewportId || !pageData) return null
		return pageData.viewports.find(v => v.id === selectedViewportId) ?? null
	})

	async function persist(patch: Partial<Omit<Page, 'id' | 'projectId'>>) {
		if (!pageData || !pid || !pageId) return
		await savePage(db, pid, pageId, patch, {
			uid: session?.user?.uid,
			linkedDrawingId: drawing?.id,
		})
	}

	function defaultSourceFor(kind: ViewportSource['kind']): ViewportSource {
		switch (kind) {
			case 'rack-elevation': return { kind, rackDocId: '', face: 'front' }
			case 'rack-plan':      return { kind, rackDocId: '' }
			case 'frame-detail':   return { kind, frameDocId: '', frameId: '' }
			case 'fillrate':       return { kind, projectId: pid ?? '' }
			case 'floorplan':      return { kind, fileId: '', pageNum: 1 }
			case 'text':           return { kind, content: 'Note' }
			case 'image':          return { kind, url: '' }
		}
	}

	async function addViewport(kind: ViewportSource['kind']) {
		if (!pageData) return
		const id = crypto.randomUUID().slice(0, 10)
		const vp: Viewport = {
			id,
			positionMm: { x: 40, y: 40 },
			widthMm: 150,
			heightMm: 100,
			source: defaultSourceFor(kind),
			scale: pageData.paper.scale || 100,
		}
		selectedViewportId = id
		await persist({ viewports: [...pageData.viewports, vp] })
	}

	async function updateViewport(id: string, patch: Partial<Viewport>) {
		if (!pageData) return
		const next = pageData.viewports.map(v => v.id === id ? { ...v, ...patch } : v)
		await persist({ viewports: next })
	}

	async function removeViewport(id: string) {
		if (!pageData) return
		if (selectedViewportId === id) selectedViewportId = null
		await persist({ viewports: pageData.viewports.filter(v => v.id !== id) })
	}

	async function handleDeletePage() {
		if (!pid || !pageId) return
		if (!confirm('Delete this page? The linked drawing entry will also be archived.')) return
		await deletePage(db, pid, pageId, drawing?.id)
		await goto(`/projects/${pid}/drawings`)
	}

	const inputValue = (e: Event): string => (e.currentTarget as HTMLInputElement).value
	const inputNumber = (e: Event): number => Number((e.currentTarget as HTMLInputElement).value)

	const VIEWPORT_KINDS: { kind: ViewportSource['kind']; label: string }[] = [
		{ kind: 'rack-elevation', label: 'Rack Elevation' },
		{ kind: 'rack-plan',      label: 'Rack Plan' },
		{ kind: 'frame-detail',   label: 'Frame Detail' },
		{ kind: 'floorplan',      label: 'Floorplan' },
		{ kind: 'fillrate',       label: 'Fill Rate' },
		{ kind: 'text',           label: 'Text' },
		{ kind: 'image',          label: 'Image' },
	]
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<Titlebar title="{projectName} — {pageData?.title ?? 'Page'}" height={30} />

{#if loading || !pageData}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading page...</Spinner>
	</div>
{:else}
	<div class="flex" style:height="{canvasHeight}px">
		<!-- Sidebar -->
		<aside class="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col text-xs"
			style:width="{SIDEBAR_W}px">
			<div class="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
				<a href="/projects/{pid}/drawings" class="inline-flex items-center gap-1 text-zinc-500 hover:text-blue-600">
					<Icon name="chevronLeft" size={12} />
					Back to drawings
				</a>
				<Input
					label="Page Title"
					value={pageData.title}
					size="sm"
					onchange={(e: Event) => persist({ title: inputValue(e) })} />
				<label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
					<input type="checkbox"
						class="h-3.5 w-3.5 accent-blue-600"
						checked={pageData.includeInPackages ?? true}
						onchange={e => persist({ includeInPackages: e.currentTarget.checked })} />
					Include in packages
				</label>
			</div>

			<!-- Add viewport palette -->
			<div class="p-3 border-b border-zinc-200 dark:border-zinc-800">
				<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">Add Viewport</div>
				<div class="grid grid-cols-2 gap-1.5">
					{#each VIEWPORT_KINDS as vk}
						<button
							class="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 text-left"
							onclick={() => addViewport(vk.kind)}>
							{vk.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Selected viewport properties -->
			<div class="p-3 flex-1 overflow-y-auto">
				<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">Selected Viewport</div>
				{#if selectedViewport}
					{@const vp = selectedViewport}
					<div class="space-y-1.5">
						<Input label="Label" value={vp.label ?? ''} size="sm"
							onchange={(e: Event) => updateViewport(vp.id, { label: inputValue(e) })} />
						<div class="grid grid-cols-2 gap-1.5">
							<Input label="X (mm)" type="number" value={String(Math.round(vp.positionMm.x))} size="sm"
								onchange={(e: Event) => updateViewport(vp.id, { positionMm: { x: inputNumber(e), y: vp.positionMm.y } })} />
							<Input label="Y (mm)" type="number" value={String(Math.round(vp.positionMm.y))} size="sm"
								onchange={(e: Event) => updateViewport(vp.id, { positionMm: { x: vp.positionMm.x, y: inputNumber(e) } })} />
							<Input label="W (mm)" type="number" value={String(Math.round(vp.widthMm))} size="sm"
								onchange={(e: Event) => updateViewport(vp.id, { widthMm: inputNumber(e) })} />
							<Input label="H (mm)" type="number" value={String(Math.round(vp.heightMm))} size="sm"
								onchange={(e: Event) => updateViewport(vp.id, { heightMm: inputNumber(e) })} />
						</div>
						<div class="text-[10px] text-zinc-500">kind: <span class="font-mono">{vp.source.kind}</span></div>
						<Button onclick={() => removeViewport(vp.id)}>
							<Icon name="trash" size={12} />
							Delete viewport
						</Button>
					</div>
				{:else}
					<div class="text-zinc-400 italic">Nothing selected. Click a viewport on the page to edit its properties.</div>
				{/if}
			</div>

			<!-- Page-level actions -->
			<div class="p-3 border-t border-zinc-200 dark:border-zinc-800">
				<button class="text-red-500 hover:text-red-600 text-xs" onclick={handleDeletePage}>
					Delete page…
				</button>
			</div>
		</aside>

		<!-- Canvas -->
		<PageCanvas
			page={pageData}
			{selectedViewportId}
			width={canvasWidth}
			height={canvasHeight}
			onselect={id => selectedViewportId = id}
			ondeselect={() => selectedViewportId = null}
			onupdateviewport={updateViewport} />
	</div>
{/if}
