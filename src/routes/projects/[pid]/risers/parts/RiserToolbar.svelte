<script lang="ts">
	import { Button } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'
	import type { RiserMode } from './types'
	import DrawingPicker from './DrawingPicker.svelte'

	let {
		fromFloor = $bindable<number | undefined>(undefined),
		toFloor = $bindable<number | undefined>(undefined),
		mode = $bindable<RiserMode>('select'),
		hiddenFloors = $bindable<number[] | undefined>(undefined),
		serverFloors = [],
		floors,
		buildingFloors = undefined,
		skippedFloors = [],
		floorFormat = 'L01',
		drawings = [],
		activeDrawingId = '',
		onSelectDrawing,
		onNewDrawing,
		onRenameDrawing,
		onDeleteDrawing,
		onZoomFit,
		onSettings,
		onFloors,
	}: {
		/** Floor range / hide controls are optional — the workspace lifts them
		 *  into its right panel and only the mode + zoom buttons live here. */
		fromFloor?: number
		toFloor?: number
		mode: RiserMode
		hiddenFloors?: number[]
		/** Floor numbers that contain at least one server room. */
		serverFloors?: number[]
		floors?: FloorConfig[]
		/** Physical building extent — drives the From/To range options. */
		buildingFloors?: { bottom: number; top: number }
		/** Floors that don't physically exist — excluded from all floor lists. */
		skippedFloors?: number[]
		floorFormat?: string
		/** Riser drawing switcher — rendered at the far left when `onSelectDrawing`
		 *  is supplied (standalone page only; the workspace omits it). */
		drawings?: { id: string; name?: string }[]
		activeDrawingId?: string
		onSelectDrawing?: (id: string) => void
		onNewDrawing?: () => void
		onRenameDrawing?: (id: string, name: string) => void
		onDeleteDrawing?: (id: string) => void
		onZoomFit?: () => void
		onSettings?: () => void
		onFloors?: () => void
	} = $props()

	let visMenuOpen = $state(false)
	let visMenuEl: HTMLDetailsElement | null = $state(null)

	const showFloorControls = $derived(
		fromFloor !== undefined && toFloor !== undefined && hiddenFloors !== undefined && !!floors,
	)

	const sortedFloors = $derived(
		[...(floors ?? [])].sort((a, b) => a.number - b.number).map((f) => f.number),
	)

	/** Floors selectable in the From/To dropdowns — the full physical building
	 *  stack when an extent is set, else just the configured floors. */
	const selectableFloors = $derived.by(() => {
		const skip = new Set(skippedFloors)
		if (buildingFloors) {
			const out: number[] = []
			for (let f = buildingFloors.bottom; f <= buildingFloors.top; f++) {
				if (!skip.has(f)) out.push(f)
			}
			return out
		}
		return sortedFloors.filter((f) => !skip.has(f))
	})

	/** Every integer floor in the visible From–To range, highest first (matching
	 *  the elevation). The canvas draws all integers in range, not just the
	 *  configured floors, so the visibility list must cover them too. */
	const rangeFloors = $derived.by(() => {
		if (fromFloor === undefined || toFloor === undefined) return []
		const lo = Math.min(fromFloor, toFloor)
		const hi = Math.max(fromFloor, toFloor)
		const skip = new Set(skippedFloors)
		const out: number[] = []
		for (let f = hi; f >= lo; f--) if (!skip.has(f)) out.push(f)
		return out
	})

	/** Floor of the last visibility checkbox clicked — anchors shift-click ranges. */
	let lastToggled = $state<number | null>(null)

	/** Set the visibility of one or more floors. `visible` true → ensure shown
	 *  (remove from hiddenFloors); false → ensure hidden. */
	function setFloorsVisible(targets: number[], visible: boolean) {
		if (!hiddenFloors) return
		const set = new Set(hiddenFloors)
		for (const f of targets) {
			if (visible) set.delete(f)
			else set.add(f)
		}
		hiddenFloors = [...set].sort((a, b) => a - b)
	}

	/** Handle a click on a floor's visibility checkbox. Shift-click extends the
	 *  toggle across every floor between the last click and this one (multi-select
	 *  list behaviour), all set to the clicked checkbox's new state. */
	function onFloorClick(f: number, e: MouseEvent & { currentTarget: HTMLInputElement }) {
		const visible = e.currentTarget.checked
		if (e.shiftKey && lastToggled !== null && lastToggled !== f) {
			const lo = Math.min(lastToggled, f)
			const hi = Math.max(lastToggled, f)
			setFloorsVisible(rangeFloors.filter((x) => x >= lo && x <= hi), visible)
		} else {
			setFloorsVisible([f], visible)
		}
		lastToggled = f
	}

	/** Floors currently shown (not in hiddenFloors) within the view range. */
	const shownCount = $derived(
		rangeFloors.filter((f) => !(hiddenFloors ?? []).includes(f)).length,
	)

	function showAllFloors() {
		hiddenFloors = []
	}

	/** In-range floors with no server room. */
	const emptyFloors = $derived(rangeFloors.filter((f) => !serverFloors.includes(f)))
	/** True when every empty floor is currently hidden (and there's something to
	 *  hide) — drives the toggle's on/off state. */
	const emptyFloorsHidden = $derived(
		emptyFloors.length > 0 && emptyFloors.every((f) => (hiddenFloors ?? []).includes(f)),
	)

	function toggleEmptyFloors() {
		if (!hiddenFloors) return
		if (emptyFloorsHidden) {
			// Show the empty floors again, leaving any other manual hides intact.
			const empty = new Set(emptyFloors)
			hiddenFloors = hiddenFloors.filter((f) => !empty.has(f))
		} else {
			const set = new Set(hiddenFloors)
			for (const f of emptyFloors) set.add(f)
			hiddenFloors = [...set].sort((a, b) => a - b)
		}
	}

	function setMode(m: RiserMode) {
		mode = m
	}
</script>

<div class="riser-toolbar">
	{#if onSelectDrawing}
		<div class="group">
			<DrawingPicker
				{drawings}
				activeId={activeDrawingId}
				onSelect={onSelectDrawing}
				onNew={onNewDrawing}
				onRename={onRenameDrawing}
				onDelete={onDeleteDrawing}
			/>
		</div>
		<div class="sep"></div>
	{/if}
	{#if showFloorControls}
		<div class="group">
			<label class="lbl">From
				<select bind:value={fromFloor}>
					{#each selectableFloors as f}
						<option value={f}>{fmtFloor(f, floorFormat, floors)}</option>
					{/each}
				</select>
			</label>
			<label class="lbl">To
				<select bind:value={toFloor}>
					{#each selectableFloors as f}
						<option value={f}>{fmtFloor(f, floorFormat, floors)}</option>
					{/each}
				</select>
			</label>
			<details
				class="vis-menu"
				bind:this={visMenuEl}
				bind:open={visMenuOpen}
			>
				<summary title="Show / hide floors in view">
					Visible {shownCount}/{rangeFloors.length}
				</summary>
				<div class="vis-pop">
					<div class="vis-head">
						<span>Show floors</span>
						<div class="vis-actions">
							<button
								type="button"
								onclick={toggleEmptyFloors}
								disabled={emptyFloors.length === 0}
							>{emptyFloorsHidden ? 'Show empty' : 'Hide empty'}</button>
							{#if hiddenFloors && hiddenFloors.length}
								<button type="button" onclick={showAllFloors}>Show all</button>
							{/if}
						</div>
					</div>
					<ul>
						{#each rangeFloors as f}
							<li>
								<label>
									<input
										type="checkbox"
										checked={!(hiddenFloors ?? []).includes(f)}
										onclick={(e) => onFloorClick(f, e)}
									/>
									{fmtFloor(f, floorFormat, floors ?? [])}
									{#if !serverFloors.includes(f)}
										<span class="empty-tag">empty</span>
									{/if}
								</label>
							</li>
						{/each}
					</ul>
					<p class="vis-hint">Shift-click to toggle a range</p>
				</div>
			</details>
		</div>

		<div class="sep"></div>
	{/if}

	<div class="group">
		<Button size="sm" variant={mode === 'select' ? 'primary' : 'ghost'}
			icon="select" onclick={() => setMode('select')} title="Select">Select</Button>
		<Button size="sm" variant={mode === 'addServer' ? 'primary' : 'ghost'}
			icon="server" onclick={() => setMode('addServer')} title="Add Server Room">Server</Button>
		<Button size="sm" variant={mode === 'addEps' ? 'primary' : 'ghost'}
			icon="power" onclick={() => setMode('addEps')} title="Add EPS Room">EPS</Button>
		<Button size="sm" variant={mode === 'addLadder' ? 'primary' : 'ghost'}
			icon="rectVertical" onclick={() => setMode('addLadder')} title="Add Ladder">Ladder</Button>
		<Button size="sm" variant={mode === 'addCable' ? 'primary' : 'ghost'}
			icon="cable" onclick={() => setMode('addCable')} title="Add Cable">Cable</Button>
		<Button size="sm" variant={mode === 'addLabel' ? 'primary' : 'ghost'}
			icon="text" onclick={() => setMode('addLabel')} title="Add Label">Label</Button>
	</div>

	<div class="sep"></div>

	<div class="group">
		<Button size="sm" variant="ghost" icon="expand" onclick={() => onZoomFit?.()} title="Fit to view">Fit</Button>
	</div>

	<div class="grow"></div>

	{#if onFloors}
		<Button size="sm" variant="ghost" icon="layers" onclick={() => onFloors?.()} title="Manage floors">Floors</Button>
	{/if}
	{#if onSettings}
		<Button size="sm" variant="ghost" icon="settings" onclick={() => onSettings?.()} title="Settings" />
	{/if}
</div>

<style>
	.riser-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid rgb(228, 228, 231);
		background: rgb(250, 250, 252);
		flex-wrap: wrap;
	}
	:global(.dark) .riser-toolbar {
		background: rgb(24, 24, 27);
		border-bottom-color: rgb(39, 39, 42);
	}
	.group {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.sep {
		width: 1px;
		height: 22px;
		background: rgb(228, 228, 231);
	}
	:global(.dark) .sep {
		background: rgb(63, 63, 70);
	}
	.grow {
		flex: 1;
	}
	.lbl {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: rgb(82, 82, 91);
	}
	:global(.dark) .lbl {
		color: rgb(212, 212, 216);
	}
	select {
		height: 1.75rem;
		box-sizing: border-box;
		font-size: 0.85rem;
		padding: 0 0.35rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
	}
	:global(.dark) select {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	.vis-menu {
		position: relative;
	}
	.vis-menu > summary {
		display: inline-flex;
		align-items: center;
		height: 1.75rem;
		box-sizing: border-box;
		list-style: none;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0 0.5rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
		user-select: none;
	}
	:global(.dark) .vis-menu > summary {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	.vis-menu > summary::-webkit-details-marker { display: none; }
	.vis-pop {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.2rem;
		z-index: 50;
		min-width: 160px;
		max-height: 320px;
		overflow-y: auto;
		padding: 0.4rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.35rem;
		background: white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		user-select: none;
	}
	:global(.dark) .vis-pop {
		background: rgb(24, 24, 27);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.vis-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: rgb(82, 82, 91);
		padding: 0.15rem 0.2rem 0.3rem;
		border-bottom: 1px solid rgb(228, 228, 231);
	}
	:global(.dark) .vis-head {
		color: rgb(161, 161, 170);
		border-bottom-color: rgb(39, 39, 42);
	}
	.vis-actions {
		display: flex;
		gap: 0.4rem;
	}
	.vis-head button {
		background: none;
		border: none;
		color: rgb(59, 130, 246);
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0 0.2rem;
		text-transform: none;
		letter-spacing: 0;
	}
	.vis-head button:disabled {
		color: rgb(161, 161, 170);
		cursor: default;
	}
	.vis-hint {
		margin: 0.35rem 0.2rem 0;
		padding-top: 0.3rem;
		border-top: 1px solid rgb(228, 228, 231);
		font-size: 0.65rem;
		color: rgb(161, 161, 170);
	}
	:global(.dark) .vis-hint {
		border-top-color: rgb(39, 39, 42);
	}
	.empty-tag {
		margin-left: auto;
		font-size: 0.65rem;
		color: rgb(161, 161, 170);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.vis-pop ul {
		list-style: none;
		padding: 0;
		margin: 0.3rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.vis-pop li label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		padding: 0.15rem 0.3rem;
		border-radius: 0.2rem;
		cursor: pointer;
	}
	.vis-pop li label:hover {
		background: rgba(120, 120, 140, 0.1);
	}
</style>
