<svelte:options namespace="svg" />

<script lang="ts">
	// Spatial editing handles inside the RacksRender <svg>. Plan view: drag a row's origin.
	// Elevation: click a device to select it, drag it vertically to change its U. `namespace="svg"`
	// is required because this layer is hosted via the render's {@render children} slot, which
	// otherwise compiles these elements in the HTML namespace (inert, zero-size).
	import { buildElevation, deviceBox, slotAtY } from './layout'
	import type { RacksEditor } from './racks-editor.svelte'
	import type { RackFace, DeviceConfig } from './types'
	let { editor, face, rowId = undefined, interactive = false }: { editor: RacksEditor; face: RackFace; rowId?: string; interactive?: boolean } = $props()

	const pe = $derived(interactive ? 'auto' : 'none')
	let scoped = $derived(rowId ? editor.racks.filter(r => r.rowId === rowId) : editor.racks)
	let elev = $derived(face === 'plan' ? null : buildElevation(scoped, editor.settings, face))
	let boxes = $derived(elev ? editor.devices.map(d => ({ d, box: deviceBox(d, elev!, face) })).filter(x => x.box) as { d: DeviceConfig; box: { x: number; y: number; w: number; h: number } }[] : [])

	function dragDevice(d: DeviceConfig, e0: MouseEvent) {
		e0.stopPropagation()
		if (e0.ctrlKey || e0.metaKey) d = editor.duplicateDevice(d) // Ctrl-drag duplicates
		editor.selectDevice(d.id)
		const el = elev; const e = el?.byId.get(d.rackId); if (!el || !e) return
		editor.startDrag(ev => { const w = editor.toWorld(ev); if (w) editor.moveDeviceU(d, slotAtY(e, el, w.y, d.heightU)) }, () => editor.notify())
	}
</script>

{#if face === 'plan'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g>
		{#each editor.rows as row (row.id)}
			{@const o = row.plan?.originMm ?? { x: 0, y: 0 }}
			<circle cx={o.x} cy={o.y} r={250} fill="#2563eb" fill-opacity="0.55" stroke="#1d4ed8" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragRow(row, e) }} />
		{/each}
	</g>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g>
		{#each boxes as { d, box } (d.id)}
			<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent"
				style:pointer-events={pe} style:cursor="ns-resize" onmousedown={(e: MouseEvent) => dragDevice(d, e)} />
			{#if editor.selDeviceId === d.id}
				<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#06b6d4" stroke-width="1.5" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/each}
	</g>
{/if}
