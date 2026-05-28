<script lang="ts">
	import { Button } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'
	import type { RiserMode } from './types'

	let {
		fromFloor = $bindable(),
		toFloor = $bindable(),
		mode = $bindable(),
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
		floors: FloorConfig[]
		floorFormat?: string
		onZoomIn?: () => void
		onZoomOut?: () => void
		onZoomFit?: () => void
		onSettings?: () => void
	} = $props()

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
</style>
