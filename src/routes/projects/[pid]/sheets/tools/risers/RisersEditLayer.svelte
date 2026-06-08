<svelte:options namespace="svg" />

<script lang="ts">
	// Spatial editing for risers — drag rooms/ladders horizontally (xMm). Floor assignment is set
	// via the panel. Floor bands are rebuilt from the same pure engine the render uses.
	// `namespace="svg"` is required because this layer is hosted via the render's {@render children}
	// slot, which otherwise compiles these elements in the HTML namespace (inert, zero-size).
	import { buildFloorBands, bandForFloor, roomCentreYMm } from './engine'
	import { DEFAULT_RISER_SETTINGS } from './types'
	import type { RisersEditor } from './risers-editor.svelte'

	let { editor, fromFloor, toFloor, interactive = false }: { editor: RisersEditor; fromFloor: number; toFloor: number; interactive?: boolean } = $props()
	let bands = $derived(buildFloorBands({ floorHeights: editor.floorHeights, settings: editor.settings ?? DEFAULT_RISER_SETTINGS, hiddenFloors: editor.hiddenFloors }, fromFloor, toFloor))
	const pe = $derived(interactive ? 'auto' : 'none')
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g>
	{#each editor.rooms as room (room.id)}
		{@const b = bandForFloor(bands, room.floor)}
		{#if b}
			<circle cx={room.xMm} cy={roomCentreYMm(b)} r={250} fill={editor.isSel('room', room.id) ? '#06b6d4' : '#2563eb'} fill-opacity="0.55" stroke="#1d4ed8" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragRoom(room, e, fromFloor, toFloor) }} />
		{/if}
	{/each}
	{#each editor.ladders as l (l.id)}
		{@const b = bandForFloor(bands, Math.max(l.fromFloor, l.toFloor)) ?? bands[0]}
		{#if b}
			<circle cx={l.xMm} cy={b.topMm + 200} r={250} fill={editor.isSel('ladder', l.id) ? '#06b6d4' : '#64468c'} fill-opacity="0.55" stroke="#4c3370" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={pe} style:cursor="ew-resize" onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragLadderX(l, e) }} />
		{/if}
	{/each}
</g>
