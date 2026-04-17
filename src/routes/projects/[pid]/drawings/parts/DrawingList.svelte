<script lang="ts">
	import { Button, Icon, Input, Select, Firestore } from '$lib'
	import type { DrawingDoc, RevisionDoc, ToolType } from '$lib/types/versioning'
	import type { FloorConfig } from '$lib/types/project'
	import { createDrawing, updateDrawing } from '$lib/versioning/service'
	import { exportDrawingListToExcel } from '$lib/versioning/export'
	import { allToolMeta, buildSourceDocId, defaultDrawingTitle, drawingToolHref } from '$lib/versioning/adapters/index'

	const toolMeta = allToolMeta()
	const TOOL_TYPES = Object.keys(toolMeta) as ToolType[]

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

	// Inline editing state
	let editingCell = $state<{ drawingId: string; field: string } | null>(null)
	let editValue = $state('')

	function startEdit(drawingId: string, field: string, currentValue: string) {
		editingCell = { drawingId, field }
		editValue = currentValue ?? ''
	}

	async function commitEdit() {
		if (!editingCell) return
		const { drawingId, field } = editingCell
		const fields: Record<string, any> = { [field]: editValue }
		await updateDrawing(db, projectId, drawingId, fields)
		editingCell = null
	}

	function cancelEdit() {
		editingCell = null
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitEdit()
		else if (e.key === 'Escape') cancelEdit()
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

	function isEditing(drawingId: string, field: string) {
		return editingCell?.drawingId === drawingId && editingCell?.field === field
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

		<p class="my-2 text-xs text-zinc-400">Double-click a cell to edit. Press Enter to save, Escape to cancel.</p>

		<!-- Table -->
		<div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
			<table class="w-full text-sm">
				<thead>
					<tr class="bg-zinc-100 dark:bg-zinc-900 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
						<th class="px-3 py-2 w-12">#</th>
						<th class="px-3 py-2">Drawing No.</th>
						<th class="px-3 py-2">Title / Description</th>
						<th class="px-3 py-2 w-20">Tool</th>
						<th class="px-3 py-2 w-14">Size</th>
						<th class="px-3 py-2 w-16">Scale</th>
						{#each { length: maxRevisions } as _, i}
							<th class="px-3 py-2 w-24 text-center">Rev {String.fromCharCode(65 + i)}</th>
						{/each}
						<th class="px-3 py-2 w-10"></th>
					</tr>
				</thead>
				<tbody>
					{#each drawings as drawing, idx (drawing.id)}
						{@const revisions = revisionsByDrawing[drawing.id] ?? []}
						<tr class="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
							<td class="px-3 py-1.5 text-zinc-400 tabular-nums">
								<a href={drawingToolHref(projectId, drawing.toolType, drawing.sourceDocId)}
									class="hover:text-blue-600 transition-colors" title="Open {toolMeta[drawing.toolType]?.label}">
									{idx + 1}
								</a>
							</td>

							<!-- Drawing Number -->
							<td class="px-3 py-1.5 font-mono text-xs">
								{#if isEditing(drawing.id, 'drawingNumber')}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs font-mono bg-white"
										bind:value={editValue} onkeydown={handleKeydown} onblur={commitEdit}
									/>
								{:else}
									<button class="text-left w-full hover:text-blue-600 cursor-text"
										ondblclick={() => startEdit(drawing.id, 'drawingNumber', drawing.drawingNumber)}
									>
										{drawing.drawingNumber || '—'}
									</button>
								{/if}
							</td>

							<!-- Title -->
							<td class="px-3 py-1.5">
								{#if isEditing(drawing.id, 'title')}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-sm bg-white"
										bind:value={editValue} onkeydown={handleKeydown} onblur={commitEdit}
									/>
								{:else}
									<button class="text-left w-full hover:text-blue-600 cursor-text"
										ondblclick={() => startEdit(drawing.id, 'title', drawing.title)}
									>
										{drawing.title || '—'}
									</button>
								{/if}
							</td>

							<!-- Tool Type -->
							<td class="px-3 py-1.5 text-xs text-zinc-500">{toolMeta[drawing.toolType]?.label ?? drawing.toolType}</td>

							<!-- Sheet Size -->
							<td class="px-3 py-1.5 text-xs text-center">
								{#if isEditing(drawing.id, 'sheetSize')}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs bg-white text-center"
										bind:value={editValue} onkeydown={handleKeydown} onblur={commitEdit}
									/>
								{:else}
									<button class="text-center w-full hover:text-blue-600 cursor-text"
										ondblclick={() => startEdit(drawing.id, 'sheetSize', drawing.sheetSize ?? '')}
									>
										{drawing.sheetSize || '—'}
									</button>
								{/if}
							</td>

							<!-- Scale -->
							<td class="px-3 py-1.5 text-xs text-center">
								{#if isEditing(drawing.id, 'scale')}
									<input class="w-full border border-blue-400 rounded px-1 py-0.5 text-xs bg-white text-center"
										bind:value={editValue} onkeydown={handleKeydown} onblur={commitEdit}
									/>
								{:else}
									<button class="text-center w-full hover:text-blue-600 cursor-text"
										ondblclick={() => startEdit(drawing.id, 'scale', drawing.scale ?? '')}
									>
										{drawing.scale || '—'}
									</button>
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
							<td class="px-2 py-1.5 text-center">
								{#if confirmDeleteId === drawing.id}
									<button class="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
										onclick={() => deleteDrawing(drawing.id)}>Delete</button>
								{:else}
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
							<td colspan={7 + maxRevisions} class="px-3 py-8 text-center text-zinc-400">
								No drawings yet. Click "Add Drawing" to create one.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

	</div>
</div>
