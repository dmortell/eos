<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { Firestore, Spinner } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import Workspace from './Workspace.svelte'
	import { WorkspaceState, setWorkspace } from './state.svelte'

	const db = new Firestore()
	const ws = new WorkspaceState(page.params.pid ?? '')
	setWorkspace(ws)

	let project: Record<string, any> | null = $state(null)
	let floors: FloorConfig[] = $state([])
	let loading = $state(true)

	$effect(() => {
		ws.pid = page.params.pid ?? ''
	})

	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			project = data
			if (data?.floors?.length) floors = migrateFloors(data.floors)
			loading = false
		})
		return () => unsub?.()
	})

	// URL → workspace state (on mount / nav)
	$effect(() => {
		const sp = page.url.searchParams
		const node = sp.get('node')
		if (node && ws.selectedNodeId !== node) ws.selectedNodeId = node
		const view = sp.get('view')
		if (view && ws.activeView !== view) ws.activeView = view
		const v = sp.get('v')
		if (v) {
			const [x, y, zoom] = v.split(',').map(Number)
			if ([x, y, zoom].every(Number.isFinite)) ws.viewport = { x, y, zoom }
		}
	})

	// workspace state → URL (replaceState, no history pollution)
	let lastUrl = ''
	$effect(() => {
		const sp = new URLSearchParams()
		if (ws.selectedNodeId) sp.set('node', ws.selectedNodeId)
		if (ws.activeView) sp.set('view', ws.activeView)
		const { x, y, zoom } = ws.viewport
		if (x || y || zoom !== 1) sp.set('v', `${x},${y},${zoom}`)
		const qs = sp.toString()
		const url = qs ? `${page.url.pathname}?${qs}` : page.url.pathname
		if (url !== lastUrl) {
			lastUrl = url
			goto(url, { replaceState: true, keepFocus: true, noScroll: true })
		}
	})
</script>

{#if loading}
	<div class="h-screen grid place-items-center"><Spinner /></div>
{:else if project}
	<Workspace projectName={project.name ?? ''} {floors} />
{:else}
	<div class="p-6">Project not found.</div>
{/if}
