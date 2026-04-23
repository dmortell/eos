<script lang="ts">
	import { page as routePage } from '$app/state'
	import { goto } from '$app/navigation'
	import { getContext } from 'svelte'
	import { Button, Icon, Input, Select, Firestore, Spinner, Titlebar, Session } from '$lib'
	import type { Page, Viewport, ViewportSource, TitleBlockConfig } from '$lib/types/pages'
	import type { DrawingDoc } from '$lib/types/versioning'
	import type { FloorConfig } from '$lib/types/project'
	import { subscribePage, savePage, deletePage } from '$lib/pages/service'
	import { publishPage } from '$lib/pages/publish'
	import { DEFAULT_PRINT_SETTINGS } from '$lib/ui/print/types'
	import { migrateFloors } from '$lib/utils/floor'
	import PageCanvas from '../../parts/PageCanvas.svelte'
	import VersionPanel from '../../../parts/VersionPanel.svelte'
	import type { TitleBlockProjectDefaults } from '../../parts/TitleBlock.svelte'

	let db = new Firestore()
	let session = getContext('session') as Session

	let pid = $derived(routePage.params.pid)
	let pageId = $derived(routePage.params.pageId)

	let pageData = $state<Page | null>(null)
	let drawing = $state<DrawingDoc | null>(null)
	let loading = $state(true)
	let selectedViewportId = $state<string | null>(null)
	let projectName = $state('')
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let projectDefaults = $state<TitleBlockProjectDefaults>({})

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
			if (Array.isArray(data?.floors) && data.floors.length) floors = migrateFloors(data.floors)
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

	async function updateTitleBlock(patch: Partial<TitleBlockConfig>) {
		if (!pageData) return
		const current: TitleBlockConfig = pageData.titleBlock ?? { template: 'standard' }
		// Switching template invalidates cached size/position — let PageCanvas recompute defaults.
		const merged: TitleBlockConfig = { ...current, ...patch }
		if (patch.template && patch.template !== current.template) {
			delete merged.widthMm
			delete merged.heightMm
			delete merged.positionMm
		}
		await persist({ titleBlock: merged })
	}

	async function removeTitleBlock() {
		// `null` sentinel means "explicitly hidden" — distinct from "never set".
		await persist({ titleBlock: null })
	}

	async function restoreTitleBlock() {
		await persist({ titleBlock: { template: 'standard' } })
	}

	function rackDocIdFor(floor: number, room: string): string {
		return `${pid}_F${String(floor).padStart(2, '0')}_R${room}`
	}

	/** Parse `{pid}_F{NN}_R{X}` back into floor + room for the source pickers. */
	function parseRackDocId(id: string): { floor: number; room: string } {
		const m = id.match(/_F(\d+)_R([A-D])/)
		return m ? { floor: Number(m[1]), room: m[2] } : { floor: floors[0]?.number ?? 1, room: 'A' }
	}

	function updateSource(id: string, patch: Partial<ViewportSource>) {
		if (!pageData) return
		const vp = pageData.viewports.find(v => v.id === id)
		if (!vp) return
		updateViewport(id, { source: { ...vp.source, ...patch } as ViewportSource })
	}

	/**
	 * Navigate to the owning tool for a viewport's source. Each viewport kind
	 * maps to a different route (rack source → racks tool at the right floor+room
	 * +face; floorplan → uploads tool; fillrate → fillrate tool; …). Sources
	 * without a target (text, image) are skipped.
	 */
	function openViewportSource(vp: Viewport): string | null {
		const src = vp.source
		switch (src.kind) {
			case 'rack-elevation': {
				const parsed = parseRackDocId(src.rackDocId)
				return `/projects/${pid}/racks?floor=${parsed.floor}&room=${parsed.room}&view=${src.face}`
			}
			case 'rack-plan': {
				const parsed = parseRackDocId(src.rackDocId)
				return `/projects/${pid}/racks?floor=${parsed.floor}&room=${parsed.room}&view=plan`
			}
			case 'frame-detail': {
				const floorMatch = src.frameDocId.match(/_F(\d+)/)
				const floor = floorMatch ? Number(floorMatch[1]) : 1
				return `/projects/${pid}/frames?floor=${floor}&frame=${encodeURIComponent(src.frameId)}`
			}
			case 'fillrate':  return `/projects/${pid}/fillrate`
			case 'floorplan': return `/projects/${pid}/uploads?file=${encodeURIComponent(src.fileId)}&page=${src.pageNum}`
			case 'text':
			case 'image':
				return null
		}
	}

	function handleOpenSource(vp: Viewport) {
		const href = openViewportSource(vp)
		if (href) goto(href)
	}

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

	/**
	 * Optimistic + debounced page update. Mutates the local `pageData` state
	 * immediately so the UI reflects the change on every keystroke / number-spin,
	 * then coalesces Firestore writes on a trailing 250 ms timer so we don't
	 * flood the backend while the user is still dragging an input.
	 */
	let persistTimer: ReturnType<typeof setTimeout> | null = null
	let pendingPatch: Partial<Omit<Page, 'id' | 'projectId'>> = {}
	function persistLive(patch: Partial<Omit<Page, 'id' | 'projectId'>>) {
		if (!pageData || !pid || !pageId) return
		// Optimistic local mutation — assign a new object so Svelte reactivity fires.
		pageData = { ...pageData, ...patch }
		pendingPatch = { ...pendingPatch, ...patch }
		if (persistTimer) clearTimeout(persistTimer)
		persistTimer = setTimeout(() => {
			const toSave = pendingPatch
			pendingPatch = {}
			persistTimer = null
			void persist(toSave)
		}, 250)
	}

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

	/** Live variant of updateViewport — mirrors `persistLive`. */
	function updateViewportLive(id: string, patch: Partial<Viewport>) {
		if (!pageData) return
		const next = pageData.viewports.map(v => v.id === id ? { ...v, ...patch } : v)
		persistLive({ viewports: next })
	}

	async function removeViewport(id: string) {
		if (!pageData) return
		if (selectedViewportId === id) selectedViewportId = null
		await persist({ viewports: pageData.viewports.filter(v => v.id !== id) })
	}

	let versionPanelOpen = $state(false)
	let publishing = $state(false)

	function getCurrentSnapshot(): unknown {
		return pageData
	}

	function handleRestore(snapshot: unknown) {
		if (!snapshot || typeof snapshot !== 'object') return
		const s = snapshot as Partial<Page>
		// Apply restored fields; keep the page's identity fields intact.
		void persist({
			title: s.title,
			drawingNumber: s.drawingNumber,
			order: s.order,
			paper: s.paper,
			titleBlock: s.titleBlock,
			viewports: s.viewports,
			notes: s.notes,
			includeInPackages: s.includeInPackages,
		})
	}

	async function handlePublish() {
		if (!pageData || !pid || !pageId || !drawing) return
		publishing = true
		try {
			const title = prompt('Revision title (optional):', '') ?? undefined
			const res = await publishPage(db, {
				projectId: pid,
				uid: session?.user?.uid ?? 'unknown',
				page: pageData,
				pageDrawingId: drawing.id,
				revisionTitle: title,
				latestPageRevisionCode: drawing.latestRevisionCode,
			})
			alert(`Published as revision ${res.revisionCode}`)
		} catch (err: any) {
			alert(`Publish failed: ${err?.message ?? err}`)
		} finally {
			publishing = false
		}
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
			<div class="p-3 border-b border-zinc-200 dark:border-zinc-800">
				<a href="/projects/{pid}/drawings" class="inline-flex items-center gap-1 text-zinc-500 hover:text-blue-600">
					<Icon name="chevronLeft" size={12} />
					Back to drawings
				</a>
				<div class="mt-3 space-y-2">
					<label class="block">
						<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Page Title</div>
						<input type="text"
							class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
							value={pageData.title}
							oninput={(e: Event) => persistLive({ title: inputValue(e) })} />
					</label>
					<label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
						<input type="checkbox"
							class="h-3.5 w-3.5 accent-blue-600"
							checked={pageData.includeInPackages ?? true}
							onchange={e => persist({ includeInPackages: e.currentTarget.checked })} />
						Include in packages
					</label>
				</div>
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
				<div class="flex items-center justify-between mb-1.5">
					<div class="text-[10px] uppercase tracking-wider text-zinc-400">Selected Viewport</div>
					{#if selectedViewport && openViewportSource(selectedViewport)}
						<button class="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
							onclick={() => handleOpenSource(selectedViewport!)}>
							<Icon name="link" size={10} /> Open source
						</button>
					{/if}
				</div>
				{#if selectedViewport}
					{@const vp = selectedViewport}
					<div class="space-y-1.5">
						<div class="grid grid-cols-[1fr_auto] gap-1.5 items-end">
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Label</div>
								<input type="text" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={vp.label ?? ''}
									oninput={(e: Event) => updateViewportLive(vp.id, { label: inputValue(e) })} />
							</label>
							<label class="block w-12">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Pt</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(vp.labelFontPt ?? 6)}
									oninput={(e: Event) => updateViewportLive(vp.id, { labelFontPt: inputNumber(e) || 6 })} />
							</label>
						</div>
						<div class="grid grid-cols-2 gap-1.5">
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">X (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.positionMm.x))}
									oninput={(e: Event) => updateViewportLive(vp.id, { positionMm: { x: inputNumber(e), y: vp.positionMm.y } })} />
							</label>
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Y (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.positionMm.y))}
									oninput={(e: Event) => updateViewportLive(vp.id, { positionMm: { x: vp.positionMm.x, y: inputNumber(e) } })} />
							</label>
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">W (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.widthMm))}
									oninput={(e: Event) => updateViewportLive(vp.id, { widthMm: inputNumber(e) })} />
							</label>
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">H (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.heightMm))}
									oninput={(e: Event) => updateViewportLive(vp.id, { heightMm: inputNumber(e) })} />
							</label>
						</div>
						<div class="grid grid-cols-3 gap-1.5">
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Scale 1:</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(vp.scale)}
									oninput={(e: Event) => updateViewportLive(vp.id, { scale: inputNumber(e) })} />
							</label>
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Off X (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.contentOffsetMm?.x ?? 0))}
									oninput={(e: Event) => updateViewportLive(vp.id, { contentOffsetMm: { x: inputNumber(e), y: vp.contentOffsetMm?.y ?? 0 } })} />
							</label>
							<label class="block">
								<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Off Y (mm)</div>
								<input type="number" class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900"
									value={String(Math.round(vp.contentOffsetMm?.y ?? 0))}
									oninput={(e: Event) => updateViewportLive(vp.id, { contentOffsetMm: { x: vp.contentOffsetMm?.x ?? 0, y: inputNumber(e) } })} />
							</label>
						</div>

						<!-- Source-specific fields -->
						<div class="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
							<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
								Source · <span class="font-mono text-zinc-500">{vp.source.kind}</span>
							</div>

							{#if vp.source.kind === 'rack-elevation'}
								{@const parsed = parseRackDocId(vp.source.rackDocId)}
								<div class="grid grid-cols-3 gap-1.5">
									<Select label="Floor" size="sm"
										value={String(parsed.floor)}
										onchange={(e: Event) => updateSource(vp.id, { rackDocId: rackDocIdFor(inputNumber(e), parsed.room) })}>
										{#each floors as fl}
											<option value={String(fl.number)}>{fl.number}F</option>
										{/each}
									</Select>
									<Select label="Room" size="sm"
										value={parsed.room}
										onchange={(e: Event) => updateSource(vp.id, { rackDocId: rackDocIdFor(parsed.floor, inputValue(e)) })}>
										{#each ['A','B','C','D'].slice(0, floors.find(f => f.number === parsed.floor)?.serverRoomCount ?? 1) as r}
											<option value={r}>{r}</option>
										{/each}
									</Select>
									<Select label="Face" size="sm"
										value={vp.source.face}
										onchange={(e: Event) => updateSource(vp.id, { face: inputValue(e) as 'front' | 'rear' })}>
										<option value="front">Front</option>
										<option value="rear">Rear</option>
									</Select>
								</div>

							{:else if vp.source.kind === 'rack-plan'}
								{@const parsed = parseRackDocId(vp.source.rackDocId)}
								<div class="grid grid-cols-2 gap-1.5">
									<Select label="Floor" size="sm"
										value={String(parsed.floor)}
										onchange={(e: Event) => updateSource(vp.id, { rackDocId: rackDocIdFor(inputNumber(e), parsed.room) })}>
										{#each floors as fl}
											<option value={String(fl.number)}>{fl.number}F</option>
										{/each}
									</Select>
									<Select label="Room" size="sm"
										value={parsed.room}
										onchange={(e: Event) => updateSource(vp.id, { rackDocId: rackDocIdFor(parsed.floor, inputValue(e)) })}>
										{#each ['A','B','C','D'].slice(0, floors.find(f => f.number === parsed.floor)?.serverRoomCount ?? 1) as r}
											<option value={r}>{r}</option>
										{/each}
									</Select>
								</div>

							{:else if vp.source.kind === 'text'}
								<textarea
									class="w-full border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-zinc-900 min-h-16 resize-y"
									value={vp.source.content}
									placeholder="Note text…"
									onchange={(e: Event) => updateSource(vp.id, { content: (e.currentTarget as HTMLTextAreaElement).value })}
								></textarea>
								<div class="grid grid-cols-2 gap-1.5 mt-1.5">
									<Input label="Pt" type="number" value={String(vp.source.fontSizePt ?? 10)} size="sm"
										onchange={(e: Event) => updateSource(vp.id, { fontSizePt: inputNumber(e) })} />
									<Select label="Align" size="sm"
										value={vp.source.align ?? 'left'}
										onchange={(e: Event) => updateSource(vp.id, { align: inputValue(e) as 'left' | 'center' | 'right' })}>
										<option value="left">Left</option>
										<option value="center">Center</option>
										<option value="right">Right</option>
									</Select>
								</div>

							{:else if vp.source.kind === 'image'}
								<Input label="URL" value={vp.source.url} size="sm" placeholder="https://…"
									onchange={(e: Event) => updateSource(vp.id, { url: inputValue(e) })} />
								<div class="mt-1.5">
									<Select label="Fit" size="sm"
										value={vp.source.fit ?? 'contain'}
										onchange={(e: Event) => updateSource(vp.id, { fit: inputValue(e) as 'contain' | 'cover' })}>
										<option value="contain">Contain</option>
										<option value="cover">Cover</option>
									</Select>
								</div>

							{:else if vp.source.kind === 'frame-detail'}
								{@const frameFloor = Number(vp.source.frameDocId.match(/_F(\d+)/)?.[1] ?? floors[0]?.number ?? 1)}
								<Select label="Floor" size="sm"
									value={String(frameFloor)}
									onchange={(e: Event) => updateSource(vp.id, { frameDocId: `${pid}_F${String(inputNumber(e)).padStart(2, '0')}` })}>
									{#each floors as fl}
										<option value={String(fl.number)}>{fl.number}F</option>
									{/each}
								</Select>
								<Input label="Frame ID" value={vp.source.frameId} size="sm" placeholder="e.g. frame-A1"
									onchange={(e: Event) => updateSource(vp.id, { frameId: inputValue(e) })} />

							{:else if vp.source.kind === 'fillrate'}
								<div class="text-[10px] text-zinc-500">Reads <span class="font-mono">fillrate/{vp.source.projectId}</span></div>

							{:else if vp.source.kind === 'floorplan'}
								<Input label="File ID" value={vp.source.fileId} size="sm" placeholder="files/<id>"
									onchange={(e: Event) => updateSource(vp.id, { fileId: inputValue(e) })} />
								<Input label="Page" type="number" value={String(vp.source.pageNum)} size="sm"
									onchange={(e: Event) => updateSource(vp.id, { pageNum: inputNumber(e) || 1 })} />

							{:else}
								<div class="text-[10px] text-zinc-400 italic">Source picker not yet available for this kind.</div>
							{/if}
						</div>

						<Button onclick={() => removeViewport(vp.id)}>
							<Icon name="trash" size={12} />
							Delete viewport
						</Button>
					</div>
				{:else}
					<div class="text-zinc-400 italic">Nothing selected. Click a viewport on the page to edit its properties.</div>
				{/if}
			</div>

			<!-- Title block -->
			<div class="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
				<div class="flex items-center justify-between">
					<div class="text-[10px] uppercase tracking-wider text-zinc-400">Title Block</div>
					{#if pageData.titleBlock === null}
						<button class="text-[10px] text-blue-600 hover:underline" onclick={restoreTitleBlock}>Show</button>
					{:else}
						<button class="text-[10px] text-zinc-500 hover:text-red-500" onclick={removeTitleBlock}>Hide</button>
					{/if}
				</div>
				{#if pageData.titleBlock !== null}
					{@const tb = pageData.titleBlock ?? { template: 'standard' as const }}
					<Select label="Template" size="sm"
						value={tb.template}
						onchange={(e: Event) => updateTitleBlock({ template: inputValue(e) as 'standard' | 'compact' | 'vertical' | 'custom' })}>
						<option value="standard">Standard</option>
						<option value="compact">Compact</option>
						<option value="vertical">Vertical (right edge)</option>
					</Select>
					<Input label="Drawing No." value={tb.fields?.drawingNumber ?? pageData.drawingNumber ?? ''} size="sm"
						onchange={(e: Event) => updateTitleBlock({ fields: { ...(tb.fields ?? {}), drawingNumber: inputValue(e) } })} />
					<div class="grid grid-cols-3 gap-1.5">
						<Input label="Drawn" value={tb.fields?.drawnBy ?? projectDefaults.author ?? ''} size="sm"
							onchange={(e: Event) => updateTitleBlock({ fields: { ...(tb.fields ?? {}), drawnBy: inputValue(e) } })} />
						<Input label="Chkd" value={tb.fields?.checkedBy ?? ''} size="sm"
							onchange={(e: Event) => updateTitleBlock({ fields: { ...(tb.fields ?? {}), checkedBy: inputValue(e) } })} />
						<Input label="App" value={tb.fields?.approvedBy ?? ''} size="sm"
							onchange={(e: Event) => updateTitleBlock({ fields: { ...(tb.fields ?? {}), approvedBy: inputValue(e) } })} />
					</div>
					<Input label="Date" value={tb.fields?.date ?? ''} size="sm" placeholder="YYYY-MM-DD"
						onchange={(e: Event) => updateTitleBlock({ fields: { ...(tb.fields ?? {}), date: inputValue(e) } })} />
				{/if}
			</div>

			<!-- Publish + versions -->
			<div class="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
				<div class="flex items-center gap-1.5">
					<Button onclick={handlePublish} disabled={publishing || !drawing}>
						<Icon name="check" size={12} />
						{publishing ? 'Publishing…' : 'Publish'}
					</Button>
					<button class="text-[10px] text-zinc-500 hover:text-blue-600"
						onclick={() => versionPanelOpen = !versionPanelOpen}>
						<Icon name="history" size={11} /> Versions
					</button>
				</div>
				<div class="text-[10px] text-zinc-500">
					Latest rev: <span class="font-mono font-bold">{drawing?.latestRevisionCode ?? '—'}</span>
				</div>
			</div>

			<!-- Page-level actions -->
			<div class="p-3 border-t border-zinc-200 dark:border-zinc-800">
				<button class="text-red-500 hover:text-red-600 text-xs" onclick={handleDeletePage}>
					Delete page…
				</button>
			</div>
		</aside>

		{#if versionPanelOpen && drawing}
			<VersionPanel
				bind:open={versionPanelOpen}
				projectId={pid ?? ''}
				drawingId={drawing.id}
				uid={session?.user?.uid ?? ''}
				{db}
				currentSnapshot={getCurrentSnapshot}
				onrestore={handleRestore} />
		{/if}

		<!-- Canvas -->
		<PageCanvas
			page={pageData}
			{selectedViewportId}
			width={canvasWidth}
			height={canvasHeight}
			{db}
			projectId={pid ?? ''}
			{projectDefaults}
			revisionCode={drawing?.latestRevisionCode}
			onselect={id => selectedViewportId = id}
			ondeselect={() => selectedViewportId = null}
			onupdateviewport={updateViewport}
			onupdatetitleblock={updateTitleBlock}
			onopensource={handleOpenSource} />
	</div>
{/if}
