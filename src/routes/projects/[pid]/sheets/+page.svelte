<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner, Session } from '$lib'
	import type { SheetDoc } from './types'
	import { subscribeSheets } from './data'
	import SheetList from './parts/SheetList.svelte'

	let db = getContext('db') as Firestore
	let session = getContext('session') as Session
	let pid = $derived(page.params.pid)

	let projectName = $state('')
	let sheets = $state<SheetDoc[]>([])
	let loading = $state(true)

	// Project name for the titlebar
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
		})
		return () => { unsub?.() }
	})

	// Sheets list
	$effect(() => {
		if (!pid) return
		loading = true
		const unsub = subscribeSheets(db, pid, (docs) => {
			sheets = docs
			loading = false
		})
		return () => { unsub?.() }
	})
</script>

<Titlebar title="{projectName} — Sheets" height={30} />

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading sheets...</Spinner>
	</div>
{:else}
	<SheetList {sheets} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} />
{/if}
