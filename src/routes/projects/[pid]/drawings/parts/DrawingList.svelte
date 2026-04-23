<script lang="ts">
	import { Button, Icon, Input, Select, Firestore } from '$lib'
	import type { DrawingDoc, RevisionDoc, ToolType } from '$lib/types/versioning'
	import type { FloorConfig } from '$lib/types/project'
	import { createDrawing, updateDrawing } from '$lib/versioning/service'
	import { exportDrawingListToExcel } from '$lib/versioning/export'
	import { allToolMeta, buildSourceDocId, defaultDrawingTitle, drawingToolHref, parsePageSourceDocId } from '$lib/versioning/adapters/index'
	import { createPage, setPageIncludeInPackages } from '$lib/pages/service'
	import { goto } from '$app/navigation'

	const toolMeta = allToolMeta()
	// Pages are added via the dedicated "New Page" button, not the generic Add Drawing form.
	const TOOL_TYPES = (Object.keys(toolMeta) as ToolType[]).filter(t => t !== 'page')

	let {
		drawings,
		revisionsByDrawing,
		floors,
		projectId,
		uid,
		db,
	}: {
		drawings: DrawingDoc[]
		revisionsByDrawing: Record<string, RevisionDoc[]>
		floors: FloorConfig[]
		projectId: string
		uid: string
		db: Firestore
	} = $props()

	// Compute max revision columns needed
	let maxRevisions = $derived(
		Math.max(1, ...Object.values(revisionsByDrawing).map(r => r.length))
	)

	// ── Row-level inline editing ──
	type EditBuffer = {
		drawingNumber: string
		title: string
		sheetSize: string
		scale: string
	}
	let rowEditingId = $state<string | null>(null)
	let rowEdits = $state<EditBuffer>({ drawingNumber: '', title: '', sheetSize: '', scale: '' })

	function startRowEdit(drawing: DrawingDoc) {
		rowEditingId = drawing.id
		rowEdits = {
			drawingNumber: drawing.drawingNumber ?? '',
			title: drawing.title ?? '',
			sheetSize: drawing.sheetSize ?? '',
			scale: drawing.scale ?? '',
		}
	}

	async function commitRowEdit() {
		if (!rowEditingId) return
		await updateDrawing(db, projectId, rowEditingId, { ...rowEdits })
		rowEditingId = null
	}

	function cancelRowEdit() {
		rowEditingId = null
	}

	function handleRowEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRowEdit()
		else if (e.key === 'Escape') cancelRowEdit()
	}

	function openDrawing(drawing: DrawingDoc) {
		if (rowEditingId) return // don't navigate while editing
		goto(drawingToolHref(projectId, drawing.toolType, drawing.sourceDocId, drawing.viewPreset))
	}

	// ── Add drawing form state ──
	let showAdd = $state(false)
	let addToolType = $state<ToolType>('outlets')
	let addFloorStr = $state('1')
	let addFloor = $derived(Number(addFloorStr))
	let addRoom = $state('A')
	let addPresetStr = $state('0')
	let addPresetIdx = $derived(Number(addPresetStr))
	let addDrawingNumber = $state('')
	let addSheetSize = $state('A1')
	let addScale = $state('1/150')
	let addTitleOverride = $state('')

	let addMeta = $derived(toolMeta[addToolType])
	let addScope = $derived(addMeta.scope)
	let addPresets = $derived(addMeta.presets)
	let addPreset = $derived(addPresets[addPresetIdx] ?? addPresets[0])
	let addAutoTitle = $derived(defaultDrawingTitle(addToolType, addPreset?.name ?? '', addScope !== 'project' ? addFloor : undefined, addScope === 'floor-room' ? addRoom : undefined))
	let addTitle = $derived(addTitleOverride || addAutoTitle)

	// Available rooms for selected floor
	let addRoomCount = $derived(floors.find(f => f.number === addFloor)?.serverRoomCount ?? 1)
	let addRooms = $derived(['A', 'B', 'C', 'D'].slice(0, addRoomCount))

	// Reset preset index when tool type changes
	$effect(() => { addToolType; addPresetStr = '0' })

	async function addDrawing() {
		if (!addTitle) return
		const sourceDocId = buildSourceDocId(projectId, addToolType,
			addScope !== 'project' ? addFloor : undefined,
			addScope === 'floor-room' ? addRoom : undefined)
		await createDrawing(db, {
			projectId,
			toolType: addToolType,
			drawingNumber: addDrawingNumber,
			title: addTitle,
			sourceDocId,
			viewPreset: addPreset,
			uid,
			sheetSize: addSheetSize,
			scale: addScale,
		})
		addDrawingNumber = ''
		addTitleOverride = ''
		showAdd = false
	}

	let confirmDeleteId = $state<string | null>(null)

	async function deleteDrawing(drawingId: string) {
		await updateDrawing(db, projectId, drawingId, { status: 'archived' })
		confirmDeleteId = null
	}

	async function handleExport() {
		await exportDrawingListToExcel(db, projectId)
	}

	async function handleNewPage() {
		const { pageId } = await createPage(db, { projectId, uid })
		await goto(`/projects/${projectId}/drawings/pages/${pageId}`)
	}

	/**
	 * Returns the page id for a page-typed drawing row. Non-page rows return null.
	 * Used to gate the "include in packages" checkbox + page-editor link.
	 */
	function pageIdFor(drawing: DrawingDoc): string | null {
		if (drawing.toolType !== 'page') return null
		return parsePageSourceDocId(projectId, drawing.sourceDocId)
	}

	async function toggleIncludeInPackages(drawing: DrawingDoc, checked: boolean) {
		const pageId = pageIdFor(drawing)
		if (!pageId) return
		await setPageIncludeInPackages(db, projectId, pageId, checked, drawing.id)
	}

	function fmtDate(iso?: string) {
		if (!iso) return ''
		return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
	}
</script>

<div class="p-4 md:p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Master Drawing List</h2>
			<div class="flex gap-2">
				<Button onclick={handleNewPage}>
					<Icon name="plus" size={14} />
					New Page
				</Button>
				<Button onclick={() => showAdd = !showAdd}>
					<Icon name="plus" size={14} />
					Add Drawing
				</Button>
				<Button onclick={handleExport}>
					<Icon name="download" size={14} />
					Export Excel
				</Button>
			</div>
		</div>

		<!-- Add drawing form -->
		{#if showAdd}
			<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2 dark:border-blue-800 dark:bg-blue-950/30">
				<!-- Row 1: Tool, Floor, Room, View Preset -->
				<div class="grid grid-cols-[1fr_auto_auto_2fr] gap-2 items-end">
					<Select bind:value={addToolType} label="Tool" size="sm">
						{#each TOOL_TYPES as t}
							<option value={t}>{toolMeta[t].label}</option>
						{/each}
					</Select>
					{#if addScope !== 'project'}
						<Select bind:value={addFloorStr} label="Floor" size="sm">
							{#each floors as fl}
								<option value={String(fl.number)}>{fl.number}F</option>
							{/each}
						</Select>
					{/if}
					{#if addScope === 'floor-room'}
						<Select bind:value={addRoom} label="Room" size="sm">
							{#each addRooms as rm}
								<option value={rm}>{rm}</option>
							{/each}
						</Select>
					{/if}
					{#if addPresets.length > 1}
						<Select bind:value={addPresetStr} label="View Preset" size="sm">
							{#each addPresets as p, i}
								<option value={String(i)}>{p.name}</option>
							{/each}
						</Select>
					{/if}
				</div>
				<!-- Row 2: Drawing No, Title, Size, Scale, Add -->
				<div class="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-2 items-end">
					<Input bind:value={addDrawingNumber} label="Drawing No." placeholder="XX-DR-0001" size="sm" />
					<Input bind:value={addTitleOverride} label="Title" placeholder={addAutoTitle} size="sm" />
					<Input bind:value={addSheetSize} label="Size" placeholder="A1" size="sm" class="w-16" />
					<Input bind:value={addScale} label="Scale" placeholder="1/150" size="sm" class="w-20" />
					<Button onclick={addDrawing}>Add</Button>
				</div>
			</div>
		{/if}

		<p class="my-2 text-xs text-zinc-400">Click a row to open the drawing. Click the pencil icon to edit fields inline.</p>

		<!--
			Table — the previous `overflow-x-auto` wrapper trapped `position: sticky`
			on the thead (it became a scroll container). Sticky is applied to each
			<th> individually because `sticky` on <thead>/<tr> has uneven browser
			support; on a <th> it reliably anchors to the nearest scrolling ancestor
			(the page body in our case).
		-->
		<div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-zinc-100 dark:[&>th]:bg-zinc-900 [&>th]:shadow-[inset_0_-1px_0] [&>th]:shadow-zinc-200 dark:[&>th]:shadow-zinc-800 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
						<th class="px-3 py-2 w-12">#</th>
						<th class="px-3 py-2">Drawing No.</th>
						<th class="px-3 py-2">Title / Description</th>
						<th class="px-3 py-2 w-20">Tool</th>
						<th class="px-3 py-2 w-14">Size</th>
						<th class="px-3 py-2 w-16">Scale</th>
						{#each { length: maxRevisions } as _, i}
							<th class="px-3 py-2 w-24 text-center">Rev {String.fromCharCode(65 + i)}</th>
						{/each}
						<th class="px-3 py-2 w-16 text-center" title="Include in published drawing packages">In Pkg</th>
						<th class="px-3 py-2 w-20 text-center">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each drawings as drawing, idx (drawing.id)}
						{@const revisions = revisionsByDrawing[drawing.id] ?? []}
						{@const isRowEditing = rowEditingId === drawing.id}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<tr class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
							class:cursor-pointer={!isRowEditing}
							onclick={() => { if (!isRowEditing) openDrawing(drawing) }}>
							<td class="px-3 py-1.5 text-zinc-400 tabular-nums">{idx + 1}</td>

							<!-- Drawing Number -->
							<td class="px-3 py-1.5 font-mono text-xs">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs font-mono bg-white"
										bind:value={rowEdits.drawingNumber}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{drawing.drawingNumber || '—'}
								{/if}
							</td>

							<!-- Title -->
							<td class="px-3 py-1.5">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-sm bg-white"
										bind:value={rowEdits.title}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{drawing.title || '—'}
								{/if}
							</td>

							<!-- Tool Type -->
							<td class="px-3 py-1.5 text-xs text-zinc-500">{toolMeta[drawing.toolType]?.label ?? drawing.toolType}</td>

							<!-- Sheet Size -->
							<td class="px-3 py-1.5 text-xs text-center">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs bg-white text-center"
										bind:value={rowEdits.sheetSize}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{drawing.sheetSize || '—'}
								{/if}
							</td>

							<!-- Scale -->
							<td class="px-3 py-1.5 text-xs text-center">
								{#if isRowEditing}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs bg-white text-center"
										bind:value={rowEdits.scale}
										onkeydown={handleRowEditKeydown}
										onclick={e => e.stopPropagation()} />
								{:else}
									{drawing.scale || '—'}
								{/if}
							</td>

							<!-- Revision columns -->
							{#each { length: maxRevisions } as _, i}
								{@const rev = revisions[i]}
								<td class="px-3 py-1.5 text-xs text-center tabular-nums {rev ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-700'}">
									{#if rev}
										<div class="font-medium">{rev.code}</div>
										<div class="text-[10px] text-zinc-400">{fmtDate(rev.issuedAt)}</div>
									{:else}
										—
									{/if}
								</td>
							{/each}

							<!-- Include in packages (page rows only) -->
							<td class="px-3 py-1.5 text-center" onclick={e => e.stopPropagation()}>
								{#if drawing.toolType === 'page'}
									<input type="checkbox"
										class="h-4 w-4 accent-blue-600 cursor-pointer"
										checked={drawing.includeInPackages ?? true}
										onchange={e => toggleIncludeInPackages(drawing, e.currentTarget.checked)}
										title="Include this page when publishing drawing packages" />
								{:else}
									<span class="text-zinc-300 dark:text-zinc-700">—</span>
								{/if}
							</td>

							<!-- Actions -->
							<td class="px-2 py-1.5 text-center whitespace-nowrap" onclick={e => e.stopPropagation()}>
								{#if isRowEditing}
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 mr-1"
										onclick={commitRowEdit} title="Save changes (Enter)">Save</button>
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
										onclick={cancelRowEdit} title="Cancel (Escape)">Cancel</button>
								{:else if confirmDeleteId === drawing.id}
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 mr-1"
										onclick={() => deleteDrawing(drawing.id)}>Confirm</button>
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
										onclick={() => confirmDeleteId = null}>Cancel</button>
								{:else}
									<button class="text-zinc-400 hover:text-blue-600 transition-colors mr-2" title="Edit drawing"
										onclick={() => startRowEdit(drawing)}>
										<Icon name="edit" size={13} />
									</button>
									<button class="text-zinc-300 hover:text-red-500 transition-colors" title="Delete drawing"
										onclick={() => confirmDeleteId = drawing.id}>
										<Icon name="trash" size={13} />
									</button>
								{/if}
							</td>
						</tr>
					{/each}

					{#if drawings.length === 0}
						<tr>
							<td colspan={8 + maxRevisions} class="px-3 py-8 text-center text-zinc-400">
								No drawings yet. Click "Add Drawing" or "New Page" to create one.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

	</div>
</div>
