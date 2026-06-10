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
	const HL = '#06b6d4'

	// Feed the floor range to the editor so its marquee can rebuild bands to hit-test rooms/ladders.
	$effect(() => { editor.range = { from: fromFloor, to: toFloor } })

	// Grabbing a marquee-selected item drags the whole group; otherwise clear the marquee + single-drag.
	function downRoom(room: { id: string }, e: MouseEvent) {
		e.stopPropagation()
		if (editor.inRoomMulti(room.id)) { editor.beginGroupDrag(e); return }
		editor.clearMulti(); editor.peer?.clearMulti(); editor.dragRoom(room as any, e, fromFloor, toFloor)
	}
	function downLadder(l: { id: string }, e: MouseEvent) {
		e.stopPropagation()
		if (editor.inLadderMulti(l.id)) { editor.beginGroupDrag(e); return }
		editor.clearMulti(); editor.peer?.clearMulti(); editor.dragLadderX(l as any, e)
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="print:hidden">
	{#each editor.rooms as room (room.id)}
		{@const b = bandForFloor(bands, room.floor)}
		{#if b}
			{@const cy = roomCentreYMm(b)}
			{@const sel = editor.isSel('room', room.id) || editor.inRoomMulti(room.id)}
			<!-- centre handle: move (drag between floors / horizontally) -->
			<circle cx={room.xMm} cy={cy} r={250} fill={sel ? HL : '#2563eb'} fill-opacity="0.55" stroke="#1d4ed8" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => downRoom(room, e)} />
			{#if editor.isSel('room', room.id)}
				<!-- edge handles: resize width (single selection only) -->
				{#each [['l', room.xMm - room.widthMm / 2], ['r', room.xMm + room.widthMm / 2]] as [side, ex] (side)}
					<rect x={Number(ex) - 90} y={cy - 350} width={180} height={700} fill="#06b6d4" fill-opacity="0.5" stroke="#0891b2" stroke-width="1" vector-effect="non-scaling-stroke"
						style:pointer-events={pe} style:cursor="ew-resize" onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.resizeRoomEdge(room, side as 'l' | 'r', e) }} />
				{/each}
			{/if}
		{/if}
	{/each}
	{#each editor.ladders as l (l.id)}
		{@const b = bandForFloor(bands, Math.max(l.fromFloor, l.toFloor)) ?? bands[0]}
		{#if b}
			<circle cx={l.xMm} cy={b.topMm + 200} r={250} fill={editor.isSel('ladder', l.id) || editor.inLadderMulti(l.id) ? HL : '#64468c'} fill-opacity="0.55" stroke="#4c3370" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={pe} style:cursor="ew-resize" onmousedown={(e: MouseEvent) => downLadder(l, e)} />
		{/if}
	{/each}

	<!-- marquee box -->
	{#if editor.marquee}
		<rect x={editor.marquee.x} y={editor.marquee.y} width={editor.marquee.w} height={editor.marquee.h} fill="{HL}1a" stroke={HL} stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style:pointer-events="none" />
	{/if}
</g>
