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

export class WorkspaceState {
	pid = $state('')
	selectedNodeId = $state<string | null>(null)
	selectedNodeKind = $state<NodeKind | null>(null)
	selectedNodeMeta = $state<TreeNode['meta'] | null>(null)
	expanded = $state<Set<string>>(new Set())
	viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 })
	activeView = $state<string | null>(null)
	leftPanelWidth = $state(280)
	rightPanelOpen = $state(true)
	rightPanelWidth = $state(320)
	bottomPanelOpen = $state(false)
	bottomPanelHeight = $state(220)

	constructor(pid: string) {
		this.pid = pid
	}

	toggleExpanded(id: string) {
		const next = new Set(this.expanded)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		this.expanded = next
	}

	select(id: string, kind: NodeKind, meta?: TreeNode['meta']) {
		this.selectedNodeId = id
		this.selectedNodeKind = kind
		this.selectedNodeMeta = meta ?? null
		this.activeView = defaultViewFor(kind)
	}
}

export function viewsFor(kind: NodeKind | null): ViewOption[] {
	switch (kind) {
		case 'floor':
			return [
				{ id: 'outlets-high', label: 'Outlets (high)' },
				{ id: 'outlets-low', label: 'Outlets (low)' },
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

const WORKSPACE_CTX = Symbol('workspace')
export function setWorkspace(state: WorkspaceState): void {
	setContext(WORKSPACE_CTX, state)
}
export function getWorkspace(): WorkspaceState {
	return getContext(WORKSPACE_CTX) as WorkspaceState
}
