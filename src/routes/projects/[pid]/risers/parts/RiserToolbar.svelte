<script lang="ts">
	import { Button } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'
	import type { RiserMode } from './types'

	let {
		fromFloor = $bindable(),
		toFloor = $bindable(),
		mode = $bindable(),
		hiddenFloors = $bindable(),
		floors,
		floorFormat = 'L01',
		onZoomIn,
		onZoomOut,
		onZoomFit,
		onSettings,
	}: {
		fromFloor: number
		toFloor: number
		mode: RiserMode
		hiddenFloors: number[]
		floors: FloorConfig[]
		floorFormat?: string
		onZoomIn?: () => void
		onZoomOut?: () => void
		onZoomFit?: () => void
		onSettings?: () => void
	} = $props()

	let visMenuOpen = $state(false)
	let visMenuEl: HTMLDetailsElement | null = $state(null)

	function rangeFloors(): number[] {
		const lo = Math.min(fromFloor, toFloor)
		const hi = Math.max(fromFloor, toFloor)
		return sortedFloors.filter((f) => f >= lo && f <= hi)
	}

	function toggleFloorHidden(f: number) {
		const set = new Set(hiddenFloors)
		if (set.has(f)) set.delete(f)
		else set.add(f)
		hiddenFloors = [...set].sort((a, b) => a - b)
	}

	function showAllFloors() {
		hiddenFloors = []
	}

	const sortedFloors = $derived(
		[...floors].sort((a, b) => a.number - b.number).map((f) => f.number),
	)

	function setMode(m: RiserMode) {
		mode = m
	}
</script>

<div class="riser-toolbar">
	<div class="group">
		<label class="lbl">From
			<select bind:value={fromFloor}>
				{#each sortedFloors as f}
					<option value={f}>{fmtFloor(f, floorFormat, floors)}</option>
				{/each}
			</select>
		</label>
		<label class="lbl">To
			<select bind:value={toFloor}>
				{#each sortedFloors as f}
					<option value={f}>{fmtFloor(f, floorFormat, floors)}</option>
				{/each}
			</select>
		</label>
		<details
			class="vis-menu"
			bind:this={visMenuEl}
			bind:open={visMenuOpen}
		>
			<summary>
				{#if hiddenFloors.length}
					Hide ({hiddenFloors.length})
				{:else}
					Hide…
				{/if}
			</summary>
			<div class="vis-pop">
				<div class="vis-head">
					<span>Hide floors</span>
					{#if hiddenFloors.length}
						<button type="button" onclick={showAllFloors}>Show all</button>
					{/if}
				</div>
				<ul>
					{#each rangeFloors() as f}
						<li>
							<label>
								<input
									type="checkbox"
									checked={hiddenFloors.includes(f)}
									onchange={() => toggleFloorHidden(f)}
								/>
								{fmtFloor(f, floorFormat, floors)}
							</label>
						</li>
					{/each}
				</ul>
			</div>
		</details>
	</div>

	<div class="sep"></div>

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
	</div>

	<div class="sep"></div>

	<div class="group">
		<Button size="sm" variant="ghost" icon="plus" onclick={() => onZoomIn?.()} title="Zoom in" />
		<Button size="sm" variant="ghost" icon="close" onclick={() => onZoomOut?.()} title="Zoom out" />
		<Button size="sm" variant="ghost" icon="expand" onclick={() => onZoomFit?.()} title="Fit to view">Fit</Button>
	</div>

	<div class="grow"></div>

	<Button size="sm" variant="ghost" icon="settings" onclick={() => onSettings?.()} title="Settings" />
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
		font-size: 0.85rem;
		padding: 0.15rem 0.35rem;
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
		list-style: none;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0.15rem 0.5rem;
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
