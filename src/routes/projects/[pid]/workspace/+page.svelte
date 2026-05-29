<script lang="ts">
	import { untrack } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { Firestore, Spinner } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import Workspace from './Workspace.svelte'
	import { WorkspaceState, setWorkspace, type NodeKind } from './state.svelte'

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

	// URL → workspace state. Tracks page.url only — reading ws state inside the
	// effect is wrapped in `untrack` so changes to ws state (from ws.select(), etc.)
	// don't cause this effect to re-run with a stale URL and clobber the new state.
	$effect(() => {
		const sp = page.url.searchParams
		const node = sp.get('node')
		const kind = sp.get('kind') as NodeKind | null
		const view = sp.get('view')
		const v = sp.get('v')

		untrack(() => {
			if (node && ws.selectedNodeId !== node) ws.selectedNodeId = node
			if (kind && ws.selectedNodeKind !== kind) ws.selectedNodeKind = kind
			if (view && ws.activeView !== view) ws.activeView = view
			if (v) {
				const [x, y, zoom] = v.split(',').map(Number)
				if ([x, y, zoom].every(Number.isFinite)) ws.viewport = { x, y, zoom }
			}
		})
	})

	// workspace state → URL (replaceState, no history pollution).
	let lastUrl = ''
	$effect(() => {
		const sp = new URLSearchParams()
		if (ws.selectedNodeId) sp.set('node', ws.selectedNodeId)
		if (ws.selectedNodeKind) sp.set('kind', ws.selectedNodeKind)
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
