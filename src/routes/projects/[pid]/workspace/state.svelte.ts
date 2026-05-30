import { getContext, setContext } from 'svelte'

export type NodeKind =
	| 'group'
	| 'floor'
	| 'frames'
	| 'outletsHigh'
	| 'outletsLow'
	| 'trunks'
	| 'fillrate'
	| 'serverRoom'
	| 'row'
	| 'rack'
	| 'panel'
	| 'building'
	| 'risers'

export interface TreeNode {
	id: string
	kind: NodeKind
	label: string
	meta?: {
		floor?: number
		room?: string
		rowId?: string
		rackId?: string
		panelId?: string
	}
	children?: TreeNode[]
}

export interface Viewport {
	x: number
	y: number
	zoom: number
}

export interface ViewOption {
	id: string
	label: string
}

/** Label-rendering preferences. Settings are workspace-level and persisted to
 *  localStorage. They drive how port labels render across Frames / Patching /
 *  Outlets views in the workspace canvas. */
export interface LabelRendering {
	/** Level-of-detail: shrink / abbreviate labels at low zoom. */
	lod: boolean
	/** Hover shows the full label even when shrunk. */
	tooltip: boolean
	/** Magnifying-glass lens follows the cursor and enlarges nearby labels. */
	hoverMagnifier: boolean
	/** Right-panel inspector always shows the full canonical label of the
	 *  currently-selected port / device, regardless of canvas LOD. */
	inspectorAlways: boolean
}

export const DEFAULT_LABEL_RENDERING: LabelRendering = {
	lod: true,
	tooltip: true,
	hoverMagnifier: false,
	inspectorAlways: true,
}

/** A workspace tab is a saved snapshot of selection + view + viewport.
 *  Closing the panel selections (device / connection) is intentionally NOT
 *  persisted per-tab — those are transient picks within whichever tab is
 *  active. */
export interface WorkspaceTab {
	id: string
	title: string
	selectedNodeId: string | null
	selectedNodeKind: NodeKind | null
	selectedNodeMeta: TreeNode['meta'] | null
	activeView: string | null
	viewport: Viewport
}

function makeTabId(): string {
	return 't-' + Math.random().toString(36).slice(2, 10)
}

export class WorkspaceState {
	pid = $state('')
	selectedNodeId = $state<string | null>(null)
	selectedNodeKind = $state<NodeKind | null>(null)
	selectedNodeMeta = $state<TreeNode['meta'] | null>(null)
	/** Human-readable label of the currently-selected node, used for tab titles
	 *  and breadcrumbs. Set from the tree when the user clicks; falls back to
	 *  the trailing path segment when the URL restores a selection. */
	selectedNodeLabel = $state<string | null>(null)
	expanded = $state<Set<string>>(new Set())
	viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 })
	activeView = $state<string | null>(null)
	leftPanelWidth = $state(280)
	rightPanelOpen = $state(true)
	rightPanelWidth = $state(320)
	rightPanelTab = $state<'properties' | 'library'>('properties')
	bottomPanelOpen = $state(false)
	bottomPanelHeight = $state(220)

	/** Devices selected in the canvas. Lifted out of view components so the
	 *  inspector (and future patch-list cross-highlight) can read it. */
	selectedDeviceIds = $state<Set<string>>(new Set())
	/** Patch connection selected in the bottom-panel list. */
	selectedConnectionId = $state<string | null>(null)

	/** Tabs are per-browser bookmarks (localStorage) for selection + view +
	 *  viewport. Each tab is an independent context the user can flip between. */
	tabs = $state<WorkspaceTab[]>([])
	activeTabId = $state<string | null>(null)

	/** Label-rendering preferences (per-browser, localStorage). */
	labelRendering = $state<LabelRendering>({ ...DEFAULT_LABEL_RENDERING })

	/** Set of tree-node IDs that currently exist in the project. Maintained by
	 *  TreeNavigator as it builds the tree. Tab staleness indicators key off it:
	 *  a persisted tab whose selectedNodeId isn't in this set points to a node
	 *  that's been deleted or never existed in this project. */
	knownNodeIds = $state<Set<string>>(new Set())

	// ── Library → canvas drag handoff ────────────────────────────────────
	// The inspector library drives the drag; the canvas view (RackElevationView)
	// renders the ghost and finalises the drop. State here so the two components
	// don't need a direct reference.
	/** Currently-dragging device template from the inspector library. Null when
	 *  no drag is in flight. */
	draggingTemplate = $state<unknown | null>(null)
	/** Live cursor position in screen pixels during a library drag. */
	dragClientPos = $state<{ x: number; y: number } | null>(null)
	/** Set by the library on mouseup, consumed by the canvas. Carries the final
	 *  cursor position and the template so the canvas can hit-test and place. */
	pendingDrop = $state<{ x: number; y: number; template: any } | null>(null)

	constructor(pid: string) {
		this.pid = pid
	}

	toggleExpanded(id: string) {
		const next = new Set(this.expanded)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		this.expanded = next
	}

	select(id: string, kind: NodeKind, meta?: TreeNode['meta'], label?: string) {
		this.selectedNodeId = id
		this.selectedNodeKind = kind
		this.selectedNodeMeta = meta ?? null
		this.selectedNodeLabel = label ?? null
		this.activeView = defaultViewFor(kind)
		// Tree navigation clears canvas-level selections so the inspector follows
		// the new node, not stale device picks from the previous one.
		this.selectedDeviceIds = new Set()
		this.selectedConnectionId = null
		// Selecting something is a clear "show me properties" signal — reopen
		// the right panel if it was collapsed. Switching to the properties tab
		// too, since that's the panel face users expect for tree picks.
		this.rightPanelOpen = true
		this.rightPanelTab = 'properties'
		this.syncActiveTab()
	}

	selectDevices(ids: Iterable<string>) {
		const next = new Set(ids)
		this.selectedDeviceIds = next
		if (next.size > 0) {
			this.rightPanelOpen = true
			this.rightPanelTab = 'properties'
		}
	}

	// ── Tabs ─────────────────────────────────────────────────────────────

	private snapshotCurrent(title?: string): WorkspaceTab {
		return {
			id: makeTabId(),
			title: title ?? this.titleFromCurrent(),
			selectedNodeId: this.selectedNodeId,
			selectedNodeKind: this.selectedNodeKind,
			selectedNodeMeta: this.selectedNodeMeta ? { ...this.selectedNodeMeta } : null,
			activeView: this.activeView,
			viewport: { ...this.viewport },
		}
	}

	private titleFromCurrent(): string {
		if (this.selectedNodeLabel) return this.selectedNodeLabel
		const id = this.selectedNodeId
		if (!id) return 'Untitled'
		// Fallback: trim path prefixes so the tab label is the leaf segment.
		const tail = id.split('/').pop() ?? id
		return tail.replace(/^[a-z]+:/i, '')
	}

	/** Reflect the current state into the active tab in place — called whenever
	 *  selection / view / viewport changes so closing/switching tabs preserves it. */
	syncActiveTab(): void {
		const tab = this.tabs.find((t) => t.id === this.activeTabId)
		if (!tab) return
		tab.title = this.titleFromCurrent()
		tab.selectedNodeId = this.selectedNodeId
		tab.selectedNodeKind = this.selectedNodeKind
		tab.selectedNodeMeta = this.selectedNodeMeta ? { ...this.selectedNodeMeta } : null
		tab.activeView = this.activeView
		tab.viewport = { ...this.viewport }
	}

	openTab(): void {
		const tab = this.snapshotCurrent()
		this.tabs = [...this.tabs, tab]
		this.activeTabId = tab.id
	}

	switchTab(id: string): void {
		const tab = this.tabs.find((t) => t.id === id)
		if (!tab) return
		this.syncActiveTab()
		this.activeTabId = id
		this.selectedNodeId = tab.selectedNodeId
		this.selectedNodeKind = tab.selectedNodeKind
		this.selectedNodeMeta = tab.selectedNodeMeta ? { ...tab.selectedNodeMeta } : null
		this.activeView = tab.activeView
		this.viewport = { ...tab.viewport }
		this.selectedDeviceIds = new Set()
		this.selectedConnectionId = null
	}

	closeTab(id: string): void {
		const idx = this.tabs.findIndex((t) => t.id === id)
		if (idx < 0) return
		const remaining = this.tabs.filter((t) => t.id !== id)
		this.tabs = remaining
		if (this.activeTabId === id) {
			const next = remaining[Math.min(idx, remaining.length - 1)] ?? null
			if (next) this.switchTab(next.id)
			else this.activeTabId = null
		}
	}

	closeOtherTabs(keepId: string): void {
		const kept = this.tabs.find((t) => t.id === keepId)
		if (!kept) return
		this.tabs = [kept]
		if (this.activeTabId !== keepId) this.switchTab(keepId)
	}

	closeTabsToRight(keepId: string): void {
		const idx = this.tabs.findIndex((t) => t.id === keepId)
		if (idx < 0) return
		const trimmed = this.tabs.slice(0, idx + 1)
		this.tabs = trimmed
		if (!trimmed.find((t) => t.id === this.activeTabId)) this.switchTab(keepId)
	}

	duplicateTab(id: string): void {
		const tab = this.tabs.find((t) => t.id === id)
		if (!tab) return
		const idx = this.tabs.findIndex((t) => t.id === id)
		const clone: WorkspaceTab = {
			id: makeTabId(),
			title: tab.title,
			selectedNodeId: tab.selectedNodeId,
			selectedNodeKind: tab.selectedNodeKind,
			selectedNodeMeta: tab.selectedNodeMeta ? { ...tab.selectedNodeMeta } : null,
			activeView: tab.activeView,
			viewport: { ...tab.viewport },
		}
		this.tabs = [...this.tabs.slice(0, idx + 1), clone, ...this.tabs.slice(idx + 1)]
		this.switchTab(clone.id)
	}

	reorderTab(id: string, toIdx: number): void {
		const fromIdx = this.tabs.findIndex((t) => t.id === id)
		if (fromIdx < 0) return
		const clampedTo = Math.max(0, Math.min(this.tabs.length - 1, toIdx))
		if (fromIdx === clampedTo) return
		const next = [...this.tabs]
		const [moved] = next.splice(fromIdx, 1)
		next.splice(clampedTo, 0, moved)
		this.tabs = next
	}

	/** Ensure there's at least one tab — call once on workspace mount. */
	ensureInitialTab(): void {
		if (this.tabs.length === 0) {
			this.openTab()
		} else if (!this.activeTabId || !this.tabs.find((t) => t.id === this.activeTabId)) {
			this.switchTab(this.tabs[0].id)
		}
	}
}

export function viewsFor(kind: NodeKind | null): ViewOption[] {
	switch (kind) {
		case 'floor':
			return [
				{ id: 'outlets-low', label: 'Outlets (low)' },
				{ id: 'outlets-high', label: 'Outlets (high)' },
				{ id: 'trunks', label: 'Trunks' },
				{ id: 'fillrate', label: 'Fill rate' },
			]
		case 'rack':
			return [
				{ id: 'elevation', label: 'Elevation' },
				{ id: 'frames', label: 'Frames' },
				{ id: 'patching', label: 'Patching' },
			]
		case 'panel':
			return [
				{ id: 'frames', label: 'Frames' },
				{ id: 'patching', label: 'Patching' },
			]
		case 'row':
			return [{ id: 'row-elevation', label: 'Row elevation' }]
		case 'serverRoom':
			return [{ id: 'room-elevation', label: 'Room elevation' }]
		case 'frames':
			return [{ id: 'frames', label: 'Patch frames' }]
		case 'risers':
			return [{ id: 'risers', label: 'Risers' }]
		case 'building':
		case 'group':
		default:
			return []
	}
}

export function defaultViewFor(kind: NodeKind | null): string | null {
	const v = viewsFor(kind)
	return v[0]?.id ?? null
}

// `Symbol.for` uses the cross-realm Symbol registry so HMR re-evaluating this
// module (or a stale parent holding an old symbol) doesn't break the context
// lookup chain. Plain `Symbol('workspace')` mints a new identity per module
// instance, which is fragile under Vite HMR.
const WORKSPACE_CTX = Symbol.for('eos-workspace-ctx')
export function setWorkspace(state: WorkspaceState): void {
	setContext(WORKSPACE_CTX, state)
}
export function getWorkspace(): WorkspaceState {
	return getContext(WORKSPACE_CTX) as WorkspaceState
}
