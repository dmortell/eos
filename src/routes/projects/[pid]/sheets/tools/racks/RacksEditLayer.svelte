<svelte:options namespace="svg" />

<script lang="ts">
	// Spatial editing handles inside the RacksRender <svg>. Plan view: drag a row's origin.
	// Elevation: click a device to select it, drag it vertically to change its U. `namespace="svg"`
	// is required because this layer is hosted via the render's {@render children} slot, which
	// otherwise compiles these elements in the HTML namespace (inert, zero-size).
	import { buildElevation, deviceBox, slotAtY, rackAtX } from './rack-layout'
	import { RU_HEIGHT_MM } from './colors'
	import type { RacksEditor } from './racks-editor.svelte'
	import type { RackFace, DeviceConfig, RackConfig } from './types'
	let { editor, face, rowId = undefined, interactive = false, hidden = [], locked = [] }: { editor: RacksEditor; face: RackFace; rowId?: string; interactive?: boolean; hidden?: string[]; locked?: string[] } = $props()

	const HL = '#2563eb'
	const SEL = '#3b82f6' // thin blue selection outline (matches the original racks tool)
	// Devices live on the 'devices' layer; racks/rows on 'racks'. A hidden or locked layer is
	// non-interactive (hidden objects aren't drawn, so they must not be selectable).
	let offDevices = $derived(hidden.includes('devices') || locked.includes('devices'))
	let offRows = $derived(hidden.includes('racks') || locked.includes('racks'))
	const dpe = $derived(interactive && !offDevices ? 'auto' : 'none')
	const rpe = $derived(interactive && !offRows ? 'auto' : 'none')
	let scoped = $derived(rowId ? editor.racks.filter(r => r.rowId === rowId) : editor.racks)
	let elev = $derived(face === 'plan' ? null : buildElevation(scoped, editor.settings, face))
	let boxes = $derived(elev ? editor.devices.map(d => ({ d, box: deviceBox(d, elev!, face) })).filter(x => x.box) as { d: DeviceConfig; box: { x: number; y: number; w: number; h: number } }[] : [])

	// Feed the editor the device boxes + face so its marquee can hit-test them (none when off, so a
	// marquee can't grab hidden/locked devices).
	$effect(() => { editor.layout = { face, boxes: offDevices ? [] : boxes.map(b => ({ id: b.d.id, box: b.box })) } })

	function dragDevice(d: DeviceConfig, e0: MouseEvent) {
		if (e0.button !== 0) return // right/middle is pan/zoom — let it bubble to the canvas
		e0.stopPropagation()
		if (e0.shiftKey) { editor.toggleDeviceSel(d.id); return } // shift-click → additive multi-pick
		if (e0.ctrlKey || e0.metaKey) d = editor.duplicateDevice(d) // Ctrl-drag duplicates
		else if (editor.inDeviceMulti(d.id)) { dragDeviceGroup(d, e0); return } // grabbed a marquee item
		else { editor.clearMulti(); editor.peer?.clearMulti() }
		editor.selectDevice(d.id)
		const el = elev; const e = el?.byId.get(d.rackId); if (!el || !e) return
		editor.startDrag(ev => { const w = editor.toWorld(ev); if (w) editor.moveDeviceU(d, slotAtY(e, el, w.y, d.heightU)) }, () => editor.notify())
	}

	// Group drag: reassign every selected device into the rack column under the cursor, keeping
	// their U offsets relative to the dragged anchor (devices from several racks all land here).
	function dragDeviceGroup(anchor: DeviceConfig, e0: MouseEvent) {
		const el = elev; if (!el) return
		editor.selectDevice(anchor.id)
		const baseU0 = anchor.positionU
		const offsets = editor.devices.filter(x => editor.inDeviceMulti(x.id)).map(x => ({ id: x.id, off: x.positionU - baseU0 }))
		editor.startDrag(ev => {
			const w = editor.toWorld(ev); if (!w) return
			const e = rackAtX(el, w.x); if (!e) return
			editor.placeDeviceGroup(offsets, e.rack.id, slotAtY(e, el, w.y, anchor.heightU))
		}, () => editor.notify())
	}

	function downRow(row: { id: string }, e: MouseEvent, drag: (e: MouseEvent) => void) {
		if (e.button !== 0) return // right/middle is pan/zoom
		e.stopPropagation()
		if (editor.inRowMulti(row.id)) { editor.beginGroupDrag(e); return }
		editor.clearMulti(); editor.peer?.clearMulti(); drag(e)
	}

	const rackLabelMm = RU_HEIGHT_MM * 0.8 // matches the label size in RacksRender
	function selectRack(rack: RackConfig, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		editor.clearMulti(); editor.peer?.clearMulti()
		editor.selectRack(rack.id)
	}
</script>

{#if face === 'plan'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g class="print:hidden">
		{#each editor.rows as row (row.id)}
			{@const o = row.plan?.originMm ?? { x: 0, y: 0 }}
			{#if editor.inRowMulti(row.id) && !offRows}
				<circle cx={o.x} cy={o.y} r={360} fill="none" stroke={HL} stroke-width="1" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
			{#if !offRows}
				<circle cx={o.x} cy={o.y} r={250} fill="#2563eb" fill-opacity="0.55" stroke="#1d4ed8" stroke-width="1" vector-effect="non-scaling-stroke"
					style:pointer-events={rpe} style:cursor="move" onmousedown={(e: MouseEvent) => downRow(row, e, (ev) => editor.dragRow(row, ev))} />
			{/if}
		{/each}
	</g>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g class="print:hidden">
		{#each elev?.placements ?? [] as { rack, x, z } (rack.id)}
			{#if !offRows}
				<!-- Label band above the rack frame — click to select the rack (syncs the Racks window). -->
				<rect x={x} y={elev!.Y(z + rack.heightMm) - rackLabelMm * 1.3} width={rack.widthMm} height={rackLabelMm * 1.3}
					fill="transparent" style:pointer-events={rpe} style:cursor="pointer" onmousedown={(e: MouseEvent) => selectRack(rack, e)} />
				{#if editor.selRack?.id === rack.id}
					<rect x={x} y={elev!.Y(z + rack.heightMm)} width={rack.widthMm} height={rack.heightMm} fill="none" stroke={SEL} stroke-width="1" vector-effect="non-scaling-stroke" style:pointer-events="none" />
				{/if}
			{/if}
		{/each}
		{#each boxes as { d, box } (d.id)}
			{#if !offDevices}
				<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent"
					style:pointer-events={dpe} style:cursor="move" onmousedown={(e: MouseEvent) => dragDevice(d, e)} />
			{/if}
			{#if (editor.selDeviceId === d.id || editor.inDeviceMulti(d.id)) && !offDevices}
				<rect x={box.x} y={box.y} width={box.w} height={box.h} fill={editor.inDeviceMulti(d.id) ? `${SEL}1a` : 'none'} stroke={SEL} stroke-width="1" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/each}
	</g>
{/if}

<!-- marquee box -->
{#if editor.marquee}
	<rect class="print:hidden" x={editor.marquee.x} y={editor.marquee.y} width={editor.marquee.w} height={editor.marquee.h} fill="{HL}1a" stroke={HL} stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style:pointer-events="none" />
{/if}
