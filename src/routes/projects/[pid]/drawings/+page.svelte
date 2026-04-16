<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner, Session } from '$lib'
	import type { DrawingDoc, RevisionDoc } from '$lib/types/versioning'
	import { subscribeDrawings } from '$lib/versioning/service'
	import DrawingList from './parts/DrawingList.svelte'

	let db = new Firestore()
	let session = getContext('session') as Session
	let pid = $derived(page.params.pid)

	let projectName = $state('')
	let drawings = $state<DrawingDoc[]>([])
	let revisionsByDrawing = $state<Record<string, RevisionDoc[]>>({})
	let loading = $state(true)

	// Subscribe to project name
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
		})
		return () => { unsub?.() }
	})

	// Subscribe to drawings
	$effect(() => {
		if (!pid) return
		loading = true
		const unsub = subscribeDrawings(db, pid, (docs) => {
			drawings = docs
			loading = false
		})
		return () => { unsub?.() }
	})

	// Subscribe to revisions for each drawing
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
</script>

<Titlebar title="{projectName} — Drawing List" height={30} />

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading drawings...</Spinner>
	</div>
{:else}
	<DrawingList {drawings} {revisionsByDrawing} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} />
{/if}
