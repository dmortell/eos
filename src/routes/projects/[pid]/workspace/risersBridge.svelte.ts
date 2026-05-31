/**
 * Shared state bridge between the bare Risers instance (mounted by
 * RisersView in the canvas) and the workspace right panel (RisersInspector).
 *
 * Risers writes its reactive state + callback references into this object
 * via `$effect`; RisersInspector reads from it to render the sidebar.
 *
 * A simple module-scope `$state` is used here instead of Svelte context so
 * RisersView and RightPanel can share it across the component tree without
 * needing a common ancestor that knows about both. There's only one Risers
 * instance live in the workspace at a time, so a single bridge per module
 * is fine.
 */
export const risersBridge = $state<{
	selection: { kind: 'room' | 'ladder' | 'cable' | 'label'; id: string } | null
	cables: any[]
	rooms: any[]
	ladders: any[]
	labels: any[]
	selectCable: ((id: string) => void) | null
	startNewCable: (() => void) | null
	updateCable: ((id: string, patch: any) => void) | null
	deleteCable: ((id: string) => void) | null
	updateRoom: ((id: string, patch: any) => void) | null
	updateLadder: ((id: string, patch: any) => void) | null
	updateLabel: ((id: string, patch: any) => void) | null
	deleteLabel: ((id: string) => void) | null
	deleteSelected: (() => void) | null
	mounted: boolean
}>({
	selection: null,
	cables: [],
	rooms: [],
	ladders: [],
	labels: [],
	selectCable: null,
	startNewCable: null,
	updateCable: null,
	deleteCable: null,
	updateRoom: null,
	updateLadder: null,
	updateLabel: null,
	deleteLabel: null,
	deleteSelected: null,
	mounted: false,
})
