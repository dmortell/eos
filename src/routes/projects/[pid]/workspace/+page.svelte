<script lang="ts">
	import { untrack, onMount } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { Firestore, Spinner } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import Workspace from './Workspace.svelte'
	import {
		WorkspaceState,
		setWorkspace,
		type NodeKind,
		type WorkspaceTab,
		type LabelRendering,
		DEFAULT_LABEL_RENDERING,
	} from './state.svelte'

	const db = new Firestore()
	const ws = new WorkspaceState(page.params.pid ?? '')
	setWorkspace(ws)

	let project: Record<string, any> | null = $state(null)
	let floors: FloorConfig[] = $state([])
	let loading = $state(true)

	$effect(() => {
		ws.pid = page.params.pid ?? ''
	})

	// ── Tabs + display settings + panel sizes: load from localStorage on mount, save on change ──
	const tabsStorageKey = $derived(`eos-ws-tabs-${ws.pid}`)
	const displayStorageKey = 'eos-ws-display'
	const panelsStorageKey = 'eos-ws-panels'

	interface PanelSettings {
		leftPanelWidth: number
		rightPanelWidth: number
		bottomPanelHeight: number
		rightPanelOpen: boolean
		bottomPanelOpen: boolean
		rightPanelTab: 'properties' | 'library'
	}

	onMount(() => {
		if (typeof window === 'undefined') return
		try {
			const raw = window.localStorage.getItem(tabsStorageKey)
			if (raw) {
				const parsed = JSON.parse(raw) as { tabs: WorkspaceTab[]; activeTabId: string | null }
				if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
					ws.tabs = parsed.tabs
					if (parsed.activeTabId && parsed.tabs.find((t) => t.id === parsed.activeTabId)) {
						ws.switchTab(parsed.activeTabId)
					} else {
						ws.switchTab(parsed.tabs[0].id)
					}
				}
			}
		} catch {
			// corrupted storage — ignore
		}
		ws.ensureInitialTab()
		try {
			const raw = window.localStorage.getItem(displayStorageKey)
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<LabelRendering>
				ws.labelRendering = { ...DEFAULT_LABEL_RENDERING, ...parsed }
			}
		} catch {
			// corrupted storage — ignore
		}
		try {
			const raw = window.localStorage.getItem(panelsStorageKey)
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<PanelSettings>
				if (typeof parsed.leftPanelWidth === 'number') ws.leftPanelWidth = parsed.leftPanelWidth
				if (typeof parsed.rightPanelWidth === 'number') ws.rightPanelWidth = parsed.rightPanelWidth
				if (typeof parsed.bottomPanelHeight === 'number') ws.bottomPanelHeight = parsed.bottomPanelHeight
				if (typeof parsed.rightPanelOpen === 'boolean') ws.rightPanelOpen = parsed.rightPanelOpen
				if (typeof parsed.bottomPanelOpen === 'boolean') ws.bottomPanelOpen = parsed.bottomPanelOpen
				if (parsed.rightPanelTab === 'properties' || parsed.rightPanelTab === 'library')
					ws.rightPanelTab = parsed.rightPanelTab
			}
		} catch {
			// corrupted storage — ignore
		}
	})

	$effect(() => {
		// Reflect active tab whenever derivable fields change. Use untrack to
		// avoid making syncActiveTab itself create a dep loop.
		const _ = [ws.selectedNodeId, ws.selectedNodeKind, ws.activeView, ws.viewport]
		untrack(() => ws.syncActiveTab())
	})

	$effect(() => {
		if (typeof window === 'undefined') return
		const tabs = ws.tabs
		const activeTabId = ws.activeTabId
		const key = tabsStorageKey
		try {
			window.localStorage.setItem(key, JSON.stringify({ tabs, activeTabId }))
		} catch {
			// quota / disabled — ignore
		}
	})

	$effect(() => {
		if (typeof window === 'undefined') return
		const value = ws.labelRendering
		try {
			window.localStorage.setItem(displayStorageKey, JSON.stringify(value))
		} catch {
			// quota / disabled — ignore
		}
	})

	$effect(() => {
		if (typeof window === 'undefined') return
		const value: PanelSettings = {
			leftPanelWidth: ws.leftPanelWidth,
			rightPanelWidth: ws.rightPanelWidth,
			bottomPanelHeight: ws.bottomPanelHeight,
			rightPanelOpen: ws.rightPanelOpen,
			bottomPanelOpen: ws.bottomPanelOpen,
			rightPanelTab: ws.rightPanelTab,
		}
		try {
			window.localStorage.setItem(panelsStorageKey, JSON.stringify(value))
		} catch {
			// quota / disabled — ignore
		}
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
