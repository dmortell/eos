<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner, Session } from '$lib'
	import type { DrawingDoc, RevisionDoc, PackageDoc, PackageItemDoc } from '$lib/types/versioning'
	import { subscribeDrawings, subscribePackages } from '$lib/versioning/service'
	import PackageList from './parts/PackageList.svelte'

	let db = new Firestore()
	let session = getContext('session') as Session
	let pid = $derived(page.params.pid)

	let projectName = $state('')
	let drawings = $state<DrawingDoc[]>([])
	let packages = $state<PackageDoc[]>([])
	let revisionsByDrawing = $state<Record<string, RevisionDoc[]>>({})
	let loading = $state(true)

	// Project name
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
		})
		return () => { unsub?.() }
	})

	// Drawings + their revisions
	$effect(() => {
		if (!pid) return
		loading = true
		const unsub = subscribeDrawings(db, pid, (docs) => {
			drawings = docs
			loading = false
		})
		return () => { unsub?.() }
	})

	$effect(() => {
		if (!drawings.length) return
		const unsubs = drawings.map(d =>
			db.subscribeMany(`projects/${pid}/drawings/${d.id}/revisions`, (docs) => {
				revisionsByDrawing = {
					...revisionsByDrawing,
					[d.id]: (docs as unknown as RevisionDoc[]).sort((a, b) => a.code.localeCompare(b.code)),
				}
			})
		)
		return () => { unsubs.forEach(u => u?.()) }
	})

	// Packages
	$effect(() => {
		if (!pid) return
		const unsub = subscribePackages(db, pid, (docs) => { packages = docs })
		return () => { unsub?.() }
	})
</script>

<Titlebar title="{projectName} — Drawing Packages" height={30} />

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading packages...</Spinner>
	</div>
{:else}
	<PackageList {packages} {drawings} {revisionsByDrawing} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} />
{/if}
