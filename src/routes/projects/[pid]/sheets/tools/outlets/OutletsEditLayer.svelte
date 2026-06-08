<script lang="ts">
	// Interactive overlay for the outlets editor — inside the OutletsRender <svg> (shared real-mm
	// space). Object hit-areas are click-through unless the Select tool is active, so the Outlet /
	// Trunk add tools place via the background catcher.
	import { portal } from '../../edit/portal'
	import type { OutletsEditor } from './outlets-editor.svelte'
	let { editor, locked = [] }: { editor: OutletsEditor; locked?: string[] } = $props()

	const HM = 140 // node handle radius (mm)
	const HL = '#06b6d4'
	let interactive = $derived(editor.tool === 'select')
	let lockO = $derived(locked.includes('outlets'))
	let lockT = $derived(locked.includes('trunks'))
	let lockR = $derived(locked.includes('racks'))

	function bg(e: MouseEvent) {
		if (e.button !== 0) return
		const w = editor.toWorld(e); if (!w) return
		if (editor.tool === 'outlet') { if (lockO) return; e.stopPropagation(); editor.addOutlet(w) }
		else if (editor.tool === 'trunk') { if (lockT) return; e.stopPropagation(); editor.drawClick(w, e.shiftKey) }
		else editor.clearSel()
	}
	function bgMove(e: MouseEvent) { if (editor.tool === 'trunk' && editor.draw) { const w = editor.toWorld(e); if (w) editor.preview = w } }
	function bgDbl() { if (editor.tool === 'trunk') editor.finishDraw() }

	let drawNode = $derived(editor.draw ? editor.trunks.find(t => t.id === editor.draw!.trunkId)?.nodes.find(n => n.id === editor.draw!.lastNodeId) ?? null : null)
	let selTrunkId = $derived(editor.sel?.kind === 'trunk' ? editor.sel.id : null)
	const m = $derived(editor.menu)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g>
	<!-- background: add/draw clicks (+ empty-click deselect in select mode) -->
	<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="transparent"
		style:cursor={interactive ? 'default' : 'crosshair'}
		onmousedown={bg} onmousemove={bgMove} ondblclick={bgDbl} />

	<!-- trunks: segment hit lines (+ insert / context); nodes for the selected trunk -->
	{#each editor.trunks as t (t.id)}
		{#each t.segments as s (s.id)}
			{@const a = editor.nodePos(t, s.nodes[0])}
			{@const b = editor.nodePos(t, s.nodes[1])}
			{#if a && b}
				{#if editor.tsegs.includes(s.id)}
					<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={HL} stroke-width="2" vector-effect="non-scaling-stroke" style:pointer-events="none" />
				{/if}
				<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" stroke-width={260}
					style:pointer-events={interactive && !lockT ? 'stroke' : 'none'} style:cursor="move"
					onmousedown={(e: MouseEvent) => editor.onSegDown(e, t, s)}
					ondblclick={(e: MouseEvent) => editor.insertNode(e, t, s)}
					oncontextmenu={(e: MouseEvent) => editor.onSegContext(e, t, s)} />
			{/if}
		{/each}
		{#if selTrunkId === t.id && !lockT}
			{#each t.nodes as n (n.id)}
				<circle cx={n.position.x} cy={n.position.y} r={HM} fill={editor.tnode === n.id ? HL : 'white'} stroke={editor.tnode === n.id ? HL : '#0369a1'} stroke-width="1" vector-effect="non-scaling-stroke"
					style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="grab"
					onmousedown={(e: MouseEvent) => editor.onNodeDown(e, t, n)}
					oncontextmenu={(e: MouseEvent) => editor.onNodeContext(e, t, n)} />
			{/each}
		{/if}
	{/each}

	<!-- snap-to-node indicator while dragging -->
	{#if editor.snap}
		<circle cx={editor.snap.pos.x} cy={editor.snap.pos.y} r={HM + 60} fill="none" stroke={HL} stroke-width="1" vector-effect="non-scaling-stroke" style:pointer-events="none" />
	{/if}
	<!-- draw-mode ghost segment -->
	{#if editor.draw && drawNode && editor.preview}
		<line x1={drawNode.position.x} y1={drawNode.position.y} x2={editor.preview.x} y2={editor.preview.y} stroke="#0369a1" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style:pointer-events="none" />
	{/if}

	<!-- outlets — selectable/draggable in Select or the Outlet tool (so clicking an existing
	     outlet picks it up instead of stacking a duplicate). -->
	{#if !lockO}
		{#each editor.outlets as o (o.id)}
			<circle cx={o.position.x} cy={o.position.y} r={260} fill="transparent"
				style:pointer-events={interactive || editor.tool === 'outlet' ? 'auto' : 'none'} style:cursor="move"
				onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragOutlet(o, e) }} />
			{#if editor.isSel('outlet', o.id)}
				<circle cx={o.position.x} cy={o.position.y} r={300} fill="none" stroke={HL} stroke-width="1.5" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/each}
	{/if}

	<!-- rack placement move handles -->
	{#if !lockR}
		{#each editor.rackPlacements as rp (rp.rackId)}
			<circle cx={rp.position.x} cy={rp.position.y} r={HM} fill="#3b82f6" fill-opacity="0.5" stroke="#2563eb" stroke-width="1" vector-effect="non-scaling-stroke"
				style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="move"
				onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragRack(rp, e) }} />
		{/each}
	{/if}
</g>

{#if m}
	<div use:portal>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ctx-menu fixed z-50 rounded border border-slate-200 bg-white py-1 text-xs shadow-lg" style:left="{m.x}px" style:top="{m.y}px">
			{#if m.kind === 'node'}
				{#if m.canDisconnect}
					<button class="block w-full px-3 py-1 text-left hover:bg-slate-100" onclick={() => { editor.disconnectNode(m.trunk, m.nodeId) }}>Disconnect</button>
				{/if}
				<button class="block w-full px-3 py-1 text-left text-red-600 hover:bg-slate-100" onclick={() => { editor.deleteNode(m.trunk, m.nodeId) }}>Delete node</button>
			{:else}
				<button class="block w-full px-3 py-1 text-left hover:bg-slate-100" onclick={() => { editor.deleteSegment(m.trunk, m.segId) }}>Delete segment</button>
			{/if}
		</div>
	</div>
{/if}
