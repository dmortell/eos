<script lang="ts">
	// Interactive overlay for the outlets editor — rendered inside the OutletsRender <svg> so it
	// shares the real-mm coordinate space. Handles in world-mm (scale with content).
	import type { OutletsEditor } from './outlets-editor.svelte'
	let { editor }: { editor: OutletsEditor } = $props()

	const HM = 140 // handle radius (mm)

	function bg(e: MouseEvent) {
		if (e.button !== 0) return
		const w = editor.toWorld(e); if (!w) return
		if (editor.tool === 'outlet') { e.stopPropagation(); editor.addOutlet(w) }
		else if (editor.tool === 'trunk') { e.stopPropagation(); editor.drawClick(w) }
		else editor.clearSel()
	}
	function bgMove(e: MouseEvent) {
		if (editor.tool === 'trunk' && editor.draw) { const w = editor.toWorld(e); if (w) editor.preview = w }
	}
	let drawNode = $derived(editor.draw ? editor.trunks.find(t => t.id === editor.draw!.trunkId)?.nodes.find(n => n.id === editor.draw!.lastNodeId) ?? null : null)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g>
	<!-- background hit area (add/draw clicks; covers a large region) -->
	<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="transparent"
		style:cursor={editor.tool === 'select' ? 'default' : 'crosshair'}
		onmousedown={bg} onmousemove={bgMove} />

	<!-- trunk segments (hit) + nodes -->
	{#each editor.trunks as t (t.id)}
		{#each t.segments as s (s.id)}
			{@const a = t.nodes.find(n => n.id === s.nodes[0])}
			{@const b = t.nodes.find(n => n.id === s.nodes[1])}
			{#if a && b}
				<line x1={a.position.x} y1={a.position.y} x2={b.position.x} y2={b.position.y} stroke="transparent" stroke-width={260}
					style:cursor="move"
					onmousedown={(e: MouseEvent) => { e.stopPropagation(); if (editor.tool === 'select') editor.dragTrunk(t, e) }}
					ondblclick={(e: MouseEvent) => { const w = editor.toWorld(e); if (w) editor.insertNode(t, s.id, w) }} />
			{/if}
		{/each}
		{#each t.nodes as n (n.id)}
			<circle cx={n.position.x} cy={n.position.y} r={HM} fill="white" stroke={editor.isSel('trunk', t.id) ? '#06b6d4' : '#0369a1'} stroke-width="1" vector-effect="non-scaling-stroke"
				style:cursor="move" onmousedown={(e: MouseEvent) => { e.stopPropagation(); if (editor.tool === 'select') editor.dragNode(t, n.id) }} />
		{/each}
	{/each}

	<!-- draw preview -->
	{#if editor.draw && editor.preview && drawNode}
		<line x1={drawNode.position.x} y1={drawNode.position.y} x2={editor.preview.x} y2={editor.preview.y} stroke="#0369a1" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" />
	{/if}

	<!-- outlets (hit + selection ring) -->
	{#each editor.outlets as o (o.id)}
		<circle cx={o.position.x} cy={o.position.y} r={260} fill="transparent" style:cursor="move"
			onmousedown={(e: MouseEvent) => { e.stopPropagation(); if (editor.tool === 'select') editor.dragOutlet(o, e) }} />
		{#if editor.isSel('outlet', o.id)}
			<circle cx={o.position.x} cy={o.position.y} r={300} fill="none" stroke="#06b6d4" stroke-width="1.5" vector-effect="non-scaling-stroke" />
		{/if}
	{/each}

	<!-- rack placement move handles -->
	{#each editor.rackPlacements as rp (rp.rackId)}
		<circle cx={rp.position.x} cy={rp.position.y} r={HM} fill="#3b82f6" fill-opacity="0.5" stroke="#2563eb" stroke-width="1" vector-effect="non-scaling-stroke"
			style:cursor="move" onmousedown={(e: MouseEvent) => { e.stopPropagation(); if (editor.tool === 'select') editor.dragRack(rp, e) }} />
	{/each}
</g>
