<script lang="ts">
	import { page } from '$app/state'
	import { replaceState, afterNavigate } from '$app/navigation'
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
	// View mirrors the URL (?view=) so print-Close / back / forward restore it. Read the real browser
	// URL (location.search), not page.url, which can be stale at mount / unreactive to shallow
	// replaceState. PackageManager does the same for ?pkg.
	const viewFromUrl = () => (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : page.url.searchParams.get('view'))
	// svelte-ignore state_referenced_locally
	let mode = $state<'sheets' | 'packages'>(viewFromUrl() === 'packages' ? 'packages' : 'sheets')
	afterNavigate(() => { mode = viewFromUrl() === 'packages' ? 'packages' : 'sheets' })
	const setMode = (m: 'sheets' | 'packages') => { mode = m; replaceState(`/projects/${pid}/sheets?view=${m}`, {}) }

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
	<SheetList {sheets} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} {mode} onmode={setMode} />
{:else}
	<PackageManager {packages} {sheets} projectId={pid ?? ''} uid={session.user?.uid ?? ''} {db} {mode} onmode={setMode} />
{/if}
