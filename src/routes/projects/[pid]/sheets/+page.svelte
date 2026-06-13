<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner, Session } from '$lib'
	import { subscribeSheets, subscribeSheetPackages } from './data'
	import type { SheetDoc, SheetPackage } from './types'
	import SheetList from './parts/SheetList.svelte'
	import PackageManager from './parts/PackageManager.svelte'

	let db = getContext('db') as Firestore
	let session = getContext('session') as Session
	let pid = $derived(page.params.pid)

	let projectName = $state('')
	let sheets = $state<SheetDoc[]>([])
	let packages = $state<SheetPackage[]>([])
	let loading = $state(true)
	// Initial view + package come from the URL so returning from print preview (Close) restores them.
	let mode = $state<'sheets' | 'packages'>(page.url.searchParams.get('view') === 'packages' ? 'packages' : 'sheets')
	const initialPkg = page.url.searchParams.get('pkg') ?? null

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

	// Packages (drawing sets)
	$effect(() => {
		if (!pid) return
		const unsub = subscribeSheetPackages(db, pid, (docs) => { packages = docs })
		return () => { unsub?.() }
	})
</script>

<Titlebar title="{projectName} — Sheets" height={30} />

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading sheets...</Spinner>
	</div>
{:else if mode === 'sheets'}
	<SheetList {sheets} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} {mode} onmode={(m) => mode = m} />
{:else}
	<PackageManager {packages} {sheets} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} {mode} onmode={(m) => mode = m} {initialPkg} />
{/if}
