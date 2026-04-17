<script lang="ts">
	import { Button, Icon, Input, Select, Firestore } from '$lib'
	import type { DrawingDoc, RevisionDoc, PackageDoc, PackageItemDoc, PackageType } from '$lib/types/versioning'
	import { createPackage, updatePackage, subscribePackageItems, updatePackageItems, publishPackage } from '$lib/versioning/service'
	import PublishDialog from './PublishDialog.svelte'

	const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
		{ value: 'concept', label: 'Concept Design' },
		{ value: 'schematic', label: 'Schematic Design' },
		{ value: 'detailed', label: 'Detailed Design' },
		{ value: 'rfp', label: 'RFP Drawings' },
		{ value: 'shop', label: 'Shop Drawings' },
		{ value: 'as-built', label: 'As-Built' },
		{ value: 'custom', label: 'Custom' },
	]

	const STATUS_BADGE: Record<string, string> = {
		draft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
		published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
		superseded: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
	}

	let {
		packages,
		drawings,
		revisionsByDrawing,
		projectId,
		uid,
		db,
	}: {
		packages: PackageDoc[]
		drawings: DrawingDoc[]
		revisionsByDrawing: Record<string, RevisionDoc[]>
		projectId: string
		uid: string
		db: Firestore
	} = $props()

	// Create package form
	let showCreate = $state(false)
	let newPkg = $state({ name: '', type: 'detailed' as PackageType, description: '' })

	// Active package builder
	let activePackageId = $state<string | null>(null)
	let activeItems = $state<PackageItemDoc[]>([])

	// Publish dialog
	let publishingPackageId = $state<string | null>(null)

	// Subscribe to items when a package is opened
	$effect(() => {
		if (!activePackageId || !projectId) return
		const unsub = subscribePackageItems(db, projectId, activePackageId, (items) => {
			activeItems = items
		})
		return () => { unsub?.() }
	})

	async function handleCreate() {
		if (!newPkg.name) return
		const { packageId } = await createPackage(db, {
			projectId,
			name: newPkg.name,
			type: newPkg.type,
			uid,
			description: newPkg.description || undefined,
		})
		newPkg = { name: '', type: 'detailed', description: '' }
		showCreate = false
		activePackageId = packageId
	}

	// Add a drawing revision to the active package
	async function addItem(drawingId: string, revisionId: string) {
		if (!activePackageId) return
		const maxOrder = activeItems.reduce((m, i) => Math.max(m, i.sheetOrder), 0)
		const updated = [
			...activeItems.map(i => ({ drawingId: i.drawingId, revisionId: i.revisionId, sheetOrder: i.sheetOrder, include: i.include })),
			{ drawingId, revisionId, sheetOrder: maxOrder + 1, include: true },
		]
		await updatePackageItems(db, projectId, activePackageId, updated)
	}

	// Remove an item
	async function removeItem(drawingId: string, revisionId: string) {
		if (!activePackageId) return
		const updated = activeItems
			.filter(i => !(i.drawingId === drawingId && i.revisionId === revisionId))
			.map((i, idx) => ({ drawingId: i.drawingId, revisionId: i.revisionId, sheetOrder: idx + 1, include: i.include }))
		await updatePackageItems(db, projectId, activePackageId, updated)
	}

	// Move item up/down
	async function moveItem(index: number, direction: -1 | 1) {
		if (!activePackageId) return
		const items = [...activeItems]
		const targetIdx = index + direction
		if (targetIdx < 0 || targetIdx >= items.length) return
		;[items[index], items[targetIdx]] = [items[targetIdx], items[index]]
		const updated = items.map((i, idx) => ({ drawingId: i.drawingId, revisionId: i.revisionId, sheetOrder: idx + 1, include: i.include }))
		await updatePackageItems(db, projectId, activePackageId, updated)
	}

	function fmtDate(iso?: string) {
		if (!iso) return ''
		return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
	}

	function getDrawing(id: string) { return drawings.find(d => d.id === id) }
	function getRevision(drawingId: string, revisionId: string) {
		return (revisionsByDrawing[drawingId] ?? []).find(r => r.id === revisionId)
	}

	// Available revisions not yet in the package
	let availableRevisions = $derived(
		drawings.flatMap(d =>
			(revisionsByDrawing[d.id] ?? []).map(r => ({ drawing: d, revision: r }))
		).filter(({ drawing, revision }) =>
			!activeItems.some(i => i.drawingId === drawing.id && i.revisionId === revision.id)
		)
	)

	let activePackage = $derived(packages.find(p => p.id === activePackageId))

	// Package editing
	let editingPackage = $state(false)
	let editPkgName = $state('')
	let editPkgDescription = $state('')

	function startEditPackage() {
		if (!activePackage) return
		editPkgName = activePackage.name
		editPkgDescription = activePackage.description ?? ''
		editingPackage = true
	}

	async function saveEditPackage() {
		if (!activePackageId || !editPkgName) return
		await updatePackage(db, projectId, activePackageId, {
			name: editPkgName,
			description: editPkgDescription || undefined,
		})
		editingPackage = false
	}
</script>

<div class="p-4 md:p-6">
	<div class="mx-auto max-w-5xl">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Drawing Packages</h2>
			<Button onclick={() => showCreate = !showCreate}>
				<Icon name="plus" size={14} />
				New Package
			</Button>
		</div>

		<p class="text-xs text-zinc-400 mb-4">Packages are curated sets of drawing revisions for a specific purpose (Concept Design, RFP, Shop Drawings, etc.). Publish a package to create an immutable issue record.</p>

		<!-- Create form -->
		{#if showCreate}
			<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
				<div class="grid grid-cols-[2fr_1fr_3fr_auto] gap-2 items-end">
					<Input bind:value={newPkg.name} label="Package Name" placeholder="e.g. Detailed Design Rev B" size="sm" />
					<Select bind:value={newPkg.type} label="Type" size="sm">
						{#each PACKAGE_TYPES as t}
							<option value={t.value}>{t.label}</option>
						{/each}
					</Select>
					<Input bind:value={newPkg.description} label="Description" placeholder="Optional notes" size="sm" />
					<Button onclick={handleCreate} disabled={!newPkg.name}>Create</Button>
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-[1fr_2fr] gap-4">
			<!-- Package list -->
			<div class="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
				<div class="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 text-xs font-semibold uppercase tracking-wider text-zinc-500">Packages</div>
				{#if packages.length === 0}
					<p class="p-4 text-sm text-zinc-400 text-center">No packages yet.</p>
				{:else}
					<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
						{#each packages as pkg (pkg.id)}
							<li>
								<button class="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors {activePackageId === pkg.id ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500' : ''}"
									onclick={() => activePackageId = pkg.id}>
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">{pkg.name}</span>
										<span class="text-[10px] px-1.5 py-0.5 rounded {STATUS_BADGE[pkg.status] ?? STATUS_BADGE.draft}">{pkg.status}</span>
									</div>
									<div class="text-[10px] text-zinc-400 mt-0.5">
										{PACKAGE_TYPES.find(t => t.value === pkg.type)?.label ?? pkg.type}
										{#if pkg.publishedAt} &middot; Published {fmtDate(pkg.publishedAt)}{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Package builder -->
			<div class="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
				{#if activePackage}
					<div class="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
						{#if editingPackage}
							<div class="space-y-2">
								<Input bind:value={editPkgName} label="Name" size="sm" />
								<Input bind:value={editPkgDescription} label="Description" placeholder="Optional" size="sm" />
								<div class="flex gap-1">
									<Button onclick={saveEditPackage} disabled={!editPkgName}>Save</Button>
									<Button onclick={() => editingPackage = false}>Cancel</Button>
								</div>
							</div>
						{:else}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="text-sm font-semibold">{activePackage.name}</span>
									<span class="text-[10px] px-1.5 py-0.5 rounded {STATUS_BADGE[activePackage.status] ?? STATUS_BADGE.draft}">{activePackage.status}</span>
									<button class="text-zinc-400 hover:text-blue-600 transition-colors" onclick={startEditPackage} title="Edit package details">
										<Icon name="edit" size={12} />
									</button>
								</div>
								{#if activePackage.status === 'draft' || activePackage.status === 'published'}
									<Button onclick={() => publishingPackageId = activePackage?.id ?? null}>
										<Icon name="share" size={14} />
										{activePackage.status === 'published' ? 'Publish Update' : 'Publish'}
									</Button>
								{/if}
							</div>
							{#if activePackage.description}
								<p class="text-xs text-zinc-500 mt-1">{activePackage.description}</p>
							{/if}
						{/if}
					</div>

					<!-- Items in package -->
					<div class="p-3">
						<div class="text-xs font-medium text-zinc-500 mb-2">Sheets in Package ({activeItems.length})</div>
						{#if activeItems.length === 0}
							<p class="text-sm text-zinc-400 text-center py-4">No drawings added yet. Select from available revisions below.</p>
						{:else}
							<ul class="space-y-1 mb-4">
								{#each activeItems as item, idx (item.id)}
									{@const drawing = getDrawing(item.drawingId)}
									{@const revision = getRevision(item.drawingId, item.revisionId)}
									<li class="flex items-center gap-2 rounded border border-zinc-100 dark:border-zinc-800 px-2 py-1.5 text-sm">
										<span class="text-zinc-400 tabular-nums w-5 text-right text-xs">{idx + 1}</span>
										<span class="flex-1 truncate">{drawing?.drawingNumber || drawing?.title || item.drawingId}</span>
										{#if revision}
											<span class="text-[10px] px-1 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-bold">{revision.code}</span>
										{/if}
										<button class="text-zinc-400 hover:text-zinc-600" onclick={() => moveItem(idx, -1)} disabled={idx === 0} title="Move up">
											<Icon name="chevronUp" size={12} />
										</button>
										<button class="text-zinc-400 hover:text-zinc-600" onclick={() => moveItem(idx, 1)} disabled={idx === activeItems.length - 1} title="Move down">
											<Icon name="chevronDown" size={12} />
										</button>
										<button class="text-zinc-400 hover:text-red-500" onclick={() => removeItem(item.drawingId, item.revisionId)} title="Remove">
											<Icon name="x" size={12} />
										</button>
									</li>
								{/each}
							</ul>
						{/if}

						<!-- Available revisions to add -->
						<div class="text-xs font-medium text-zinc-500 mb-2">Available Revisions</div>
						{#if availableRevisions.length === 0}
							<p class="text-xs text-zinc-400 text-center py-2">No more revisions available. Issue revisions from the Version History panel in each tool.</p>
						{:else}
							<ul class="space-y-1 max-h-48 overflow-y-auto">
								{#each availableRevisions as { drawing, revision }}
									<li class="flex items-center gap-2 rounded border border-dashed border-zinc-200 dark:border-zinc-700 px-2 py-1 text-sm hover:border-blue-300 hover:bg-blue-50/30 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 transition-colors">
										<span class="flex-1 truncate text-xs">{drawing.drawingNumber || drawing.title}</span>
										<span class="text-[10px] px-1 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-bold">{revision.code}</span>
										<button class="text-blue-500 hover:text-blue-700 text-xs" onclick={() => addItem(drawing.id, revision.id)}>
											<Icon name="plus" size={12} />
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<div class="p-8 text-center text-zinc-400 text-sm">
						Select a package or create a new one.
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Publish dialog -->
{#if publishingPackageId}
	<PublishDialog
		{projectId}
		packageId={publishingPackageId}
		{uid}
		{db}
		onclose={() => publishingPackageId = null}
	/>
{/if}
