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
import type { FloorConfig } from '$lib/types/project'

export const risersBridge = $state<{
	// Selection + content (mirrored from Risers internal state)
	selection: { kind: 'room' | 'ladder' | 'cable' | 'label'; id: string } | null
	cables: any[]
	rooms: any[]
	ladders: any[]
	labels: any[]
	// View state (owned by the workspace, two-way with Risers via RisersView)
	fromFloor: number
	toFloor: number
	hiddenFloors: number[]
	floorFormat: string
	floors: FloorConfig[]
	// Setters for view state — RisersView wires these so RisersInspector can
	// write without needing a binding handle.
	setFromFloor: ((n: number) => void) | null
	setToFloor: ((n: number) => void) | null
	setHiddenFloors: ((arr: number[]) => void) | null
	updateFloors: ((floors: FloorConfig[]) => void) | null
	deleteFloor: ((floorNumber: number) => void) | null
	// Riser element callbacks (mirrored from Risers)
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
	fromFloor: 1,
	toFloor: 1,
	hiddenFloors: [],
	floorFormat: 'L01',
	floors: [],
	setFromFloor: null,
	setToFloor: null,
	setHiddenFloors: null,
	updateFloors: null,
	deleteFloor: null,
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
