<script lang="ts">
	import { Button, Icon, Input, Firestore } from '$lib'
	import type { VersionDoc, RevisionDoc } from '$lib/types/versioning'
	import {
		createVersion, subscribeVersions, restoreVersion,
		createRevision, subscribeRevisions, nextRevisionCode,
	} from '$lib/versioning/service'

	let {
		open = $bindable(false),
		projectId,
		drawingId,
		uid,
		db,
		currentSnapshot,
		onrestore,
	}: {
		open: boolean
		projectId: string
		drawingId: string
		uid: string
		db: Firestore
		currentSnapshot: () => unknown
		onrestore?: (snapshot: unknown) => void
	} = $props()

	let versions = $state<VersionDoc[]>([])
	let revisions = $state<RevisionDoc[]>([])
	let saving = $state(false)
	let tab = $state<'versions' | 'revisions'>('versions')

	// Save version form
	let versionNotes = $state('')

	// Create revision form
	let showRevisionForm = $state(false)
	let revisionFromVersionId = $state('')
	let revisionCode = $state('')
	let revisionTitle = $state('')
	let revisionDescription = $state('')

	// Subscribe to versions + revisions when panel opens and drawingId is set
	$effect(() => {
		if (!open || !projectId || !drawingId) return
		const unsub1 = subscribeVersions(db, projectId, drawingId, (v) => { versions = v })
		const unsub2 = subscribeRevisions(db, projectId, drawingId, (r) => {
			revisions = r
			revisionCode = nextRevisionCode(r[r.length - 1]?.code)
		})
		return () => { unsub1?.(); unsub2?.() }
	})

	async function handleSaveVersion() {
		if (!projectId || !drawingId || saving) return
		saving = true
		try {
			const snapshot = currentSnapshot()
			await createVersion(db, { projectId, drawingId, snapshot, uid, notes: versionNotes || undefined })
			versionNotes = ''
		} finally {
			saving = false
		}
	}

	async function handleRestore(versionId: string) {
		if (!projectId || !drawingId || saving) return
		saving = true
		try {
			const result = await restoreVersion(db, { projectId, drawingId, versionId, uid })
			// Load the restored snapshot and pass to parent
			const { getVersion } = await import('$lib/versioning/service')
			const ver = await getVersion(db, projectId, drawingId, result.versionId)
			if (ver?.snapshot && onrestore) onrestore(ver.snapshot)
		} finally {
			saving = false
		}
	}

	function startRevision(versionId: string) {
		revisionFromVersionId = versionId
		showRevisionForm = true
	}

	async function handleCreateRevision() {
		if (!projectId || !drawingId || !revisionFromVersionId || !revisionCode || saving) return
		saving = true
		try {
			await createRevision(db, {
				projectId,
				drawingId,
				fromVersionId: revisionFromVersionId,
				code: revisionCode,
				uid,
				title: revisionTitle || undefined,
				description: revisionDescription || undefined,
			})
			showRevisionForm = false
			revisionTitle = ''
			revisionDescription = ''
		} finally {
			saving = false
		}
	}

	function fmtDate(iso?: string) {
		if (!iso) return ''
		return new Date(iso).toLocaleString('ja-JP', {
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit',
		})
	}

	function close() { open = false }
</script>

{#if open}
	<!-- Backdrop -->
	<button class="fixed inset-0 bg-black/20 z-40" onclick={close} aria-label="Close panel"></button>

	<!-- Panel -->
	<aside class="fixed right-0 top-0 h-full w-80 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl z-50 flex flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
			<span class="text-sm font-semibold">Version History</span>
			<button onclick={close} class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
				<Icon name="x" size={16} />
			</button>
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-zinc-200 dark:border-zinc-800">
			<button class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors {tab === 'versions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-zinc-500 hover:text-zinc-700'}"
				onclick={() => tab = 'versions'}>
				Versions ({versions.length})
			</button>
			<button class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors {tab === 'revisions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-zinc-500 hover:text-zinc-700'}"
				onclick={() => tab = 'revisions'}>
				Revisions ({revisions.length})
			</button>
		</div>

		<!-- Save version form -->
		{#if tab === 'versions'}
			<div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
				<p class="text-[11px] text-zinc-400 leading-snug">Versions are working saves while you design. Save frequently to keep a history you can restore from.</p>
				<Input bind:value={versionNotes} placeholder="Version notes (optional)" size="sm" class="w-full"/>
				<Button onclick={handleSaveVersion} class="w-full" disabled={saving}>
					<Icon name="save" size={14} />
					{saving ? 'Saving...' : 'Save Version'}
				</Button>
			</div>
		{:else}
			<div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
				<p class="text-[11px] text-zinc-400 leading-snug">Revisions are frozen milestones (A, B, C) issued from a version. Once issued they cannot be changed. Use them to mark design stages for drawing packages.</p>
			</div>
		{/if}

		<!-- Content -->
		<div class="flex-1 overflow-y-auto">
			{#if tab === 'versions'}
				{#if versions.length === 0}
					<p class="p-4 text-sm text-zinc-400 text-center">No versions saved yet.</p>
				{:else}
					<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
						{#each versions as ver (ver.id)}
							<li class="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium">v{ver.number}</span>
									<span class="text-[10px] text-zinc-400 tabular-nums">{fmtDate(ver.createdAt)}</span>
								</div>
								{#if ver.notes}
									<p class="text-xs text-zinc-500 mt-0.5">{ver.notes}</p>
								{/if}
								<div class="flex gap-1 mt-1.5">
									<button class="text-[11px] px-2 py-0.5 rounded bg-zinc-100 hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:hover:bg-blue-900/40 dark:hover:text-blue-300 transition-colors"
										onclick={() => handleRestore(ver.id)} disabled={saving}>
										Restore
									</button>
									<button class="text-[11px] px-2 py-0.5 rounded bg-zinc-100 hover:bg-green-100 hover:text-green-700 dark:bg-zinc-800 dark:hover:bg-green-900/40 dark:hover:text-green-300 transition-colors"
										onclick={() => startRevision(ver.id)} disabled={saving}>
										Issue Revision
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}

			{:else}
				<!-- Revisions tab -->
				{#if revisions.length === 0}
					<p class="p-4 text-sm text-zinc-400 text-center">No revisions issued yet.</p>
				{:else}
					<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
						{#each revisions as rev (rev.id)}
							<li class="px-3 py-2">
								<div class="flex items-center justify-between">
									<span class="flex items-center gap-1.5">
										<span class="inline-flex items-center justify-center w-6 h-6 rounded bg-green-100 text-green-700 text-xs font-bold dark:bg-green-900/40 dark:text-green-300">{rev.code}</span>
										<span class="text-sm font-medium">{rev.title || `Revision ${rev.code}`}</span>
									</span>
									<Icon name="lock" size={12} class="text-zinc-400" />
								</div>
								{#if rev.description}
									<p class="text-xs text-zinc-500 mt-0.5 ml-8">{rev.description}</p>
								{/if}
								<div class="text-[10px] text-zinc-400 mt-1 ml-8 tabular-nums">
									{fmtDate(rev.issuedAt)} &middot; from {rev.fromVersionId}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>

		<!-- Revision creation form (modal overlay within panel) -->
		{#if showRevisionForm}
			<div class="absolute inset-0 bg-white/95 dark:bg-zinc-950/95 z-10 flex flex-col">
				<div class="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
					<span class="text-sm font-semibold">Issue Revision</span>
					<button onclick={() => showRevisionForm = false} class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
						<Icon name="x" size={16} />
					</button>
				</div>
				<div class="p-3 space-y-3 flex-1">
					<p class="text-xs text-zinc-500">Freeze version <strong>{revisionFromVersionId}</strong> as an immutable revision.</p>
					<Input bind:value={revisionCode} label="Revision Code" placeholder="A" size="sm" />
					<Input bind:value={revisionTitle} label="Title" placeholder="e.g. Initial issue" size="sm" />
					<Input bind:value={revisionDescription} label="Description (optional)" placeholder="Notes about this revision" size="sm" multiline rows={3} />
					<Button onclick={handleCreateRevision} class="w-full" disabled={saving || !revisionCode}>
						<Icon name="lock" size={14} />
						{saving ? 'Creating...' : `Issue Revision ${revisionCode}`}
					</Button>
				</div>
			</div>
		{/if}
	</aside>
{/if}
