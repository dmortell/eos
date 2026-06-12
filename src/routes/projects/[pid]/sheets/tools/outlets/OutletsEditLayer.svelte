<svelte:options namespace="svg" />

<script lang="ts">
	// Object edit handles for the outlets editor — inside the OutletsRender <svg> (shared real-mm
	// space). Handles are interactive only when `interactive` (viewport active + Select tool); the
	// single background catcher and add-placement live in EditBackground. `namespace="svg"` is
	// required because this layer is hosted via OutletsRender's {@render children} slot, which
	// otherwise compiles these elements in the HTML namespace (inert, zero-size). The context menu
	// (HTML) lives in OutletsContextMenu so it isn't forced into the SVG namespace.
	import type { OutletsEditor } from './outlets-editor.svelte'
	import type { RackPlacement } from './types'
	type RackCfg = { widthMm: number; depthMm: number }
	let { editor, interactive = false, locked = [], hidden = [], racksById = {} }: { editor: OutletsEditor; interactive?: boolean; locked?: string[]; hidden?: string[]; racksById?: Record<string, RackCfg> } = $props()

	const HM = 70 // node handle radius (mm)
	const HL = '#06b6d4'
	// A layer that's hidden OR locked is non-interactive: skip its handles/hit targets entirely
	// (hidden objects aren't drawn, so they must not be selectable; locked objects can't be edited).
	let offO = $derived(hidden.includes('outlets') || locked.includes('outlets'))
	let offT = $derived(hidden.includes('trunks') || locked.includes('trunks'))
	let offR = $derived(hidden.includes('racks') || locked.includes('racks'))
	const rackDims = (rp: RackPlacement) => ({ w: racksById[rp.rackId]?.widthMm ?? rp.widthMm ?? 600, h: racksById[rp.rackId]?.depthMm ?? rp.depthMm ?? 1000 })

	let drawNode = $derived(editor.draw ? editor.trunks.find(t => t.id === editor.draw!.trunkId)?.nodes.find(n => n.id === editor.draw!.lastNodeId) ?? null : null)
	let selTrunkId = $derived(editor.sel?.kind === 'trunk' ? editor.sel.id : null)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="print:hidden">
	<!-- trunks: segment hit lines (+ insert / context); nodes for the selected trunk -->
	{#each editor.trunks as t (t.id)}
		{#each t.segments as s (s.id)}
			{@const a = editor.nodePos(t, s.nodes[0])}
			{@const b = editor.nodePos(t, s.nodes[1])}
			{#if a && b}
				{#if editor.tsegs.includes(s.id) || (editor.selNodes.includes(s.nodes[0]) && editor.selNodes.includes(s.nodes[1]))}
					<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={HL} stroke-width="2" vector-effect="non-scaling-stroke" style:pointer-events="none" />
				{/if}
				<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" stroke-width={260}
					style:pointer-events={interactive && !offT ? 'stroke' : 'none'} style:cursor="move"
					onmousedown={(e: MouseEvent) => editor.onSegDown(e, t, s)}
					ondblclick={(e: MouseEvent) => editor.insertNode(e, t, s)}
					oncontextmenu={(e: MouseEvent) => editor.onSegContext(e, t, s)} />
			{/if}
		{/each}
		{#if selTrunkId === t.id && !offT}
			{#each t.nodes as n (n.id)}
				<circle cx={n.position.x} cy={n.position.y} r={HM} fill={editor.tnode === n.id ? HL : 'white'} stroke={editor.tnode === n.id ? HL : '#0369a1'} stroke-width="1" vector-effect="non-scaling-stroke"
					style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="grab"
					onmousedown={(e: MouseEvent) => editor.onNodeDown(e, t, n)}
					oncontextmenu={(e: MouseEvent) => editor.onNodeContext(e, t, n)} />
			{/each}
		{:else if !offT}
			<!-- marquee-selected nodes (any trunk): grabbable to move the whole group -->
			{#each t.nodes as n (n.id)}
				{#if editor.selNodes.includes(n.id)}
					<circle cx={n.position.x} cy={n.position.y} r={HM} fill={HL} fill-opacity="0.25" stroke={HL} stroke-width="1.5" vector-effect="non-scaling-stroke"
						style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="move"
						onmousedown={(e: MouseEvent) => editor.onNodeDown(e, t, n)} />
				{/if}
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

	<!-- outlets — selectable/draggable in Select mode. -->
	{#if !offO}
		{#each editor.outlets as o (o.id)}
			<circle cx={o.position.x} cy={o.position.y} r={260} fill="transparent"
				style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="move"
				onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragOutlet(o, e) }} />
			{#if editor.isSel('outlet', o.id) || editor.selOutlets.includes(o.id)}
				<circle cx={o.position.x} cy={o.position.y} r={300} fill="none" stroke={HL} stroke-width="1.5" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/each}
	{/if}

	<!-- rack placements: drag the body to move; selection outline; rotate via panel -->
	{#if !offR}
		{#each editor.rackPlacements as rp (rp.rackId)}
			{@const d = rackDims(rp)}
			{@const cx = rp.position.x + d.w / 2}
			{@const cy = rp.position.y + d.h / 2}
			<g transform="rotate({rp.rotation} {cx} {cy})">
				<rect x={rp.position.x} y={rp.position.y} width={d.w} height={d.h} fill="transparent"
					style:pointer-events={interactive ? 'auto' : 'none'} style:cursor="move"
					onmousedown={(e: MouseEvent) => { e.stopPropagation(); editor.dragRack(rp, e) }} />
				{#if editor.isSel('rack', rp.rackId) || editor.selRacks.includes(rp.rackId)}
					<rect x={rp.position.x} y={rp.position.y} width={d.w} height={d.h} fill="none" stroke={HL} stroke-width="1.5" vector-effect="non-scaling-stroke" style:pointer-events="none" />
				{/if}
			</g>
		{/each}
	{/if}

	<!-- marquee multi-select box -->
	{#if editor.marquee}
		<rect x={editor.marquee.x} y={editor.marquee.y} width={editor.marquee.w} height={editor.marquee.h} fill="{HL}1a" stroke={HL} stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style:pointer-events="none" />
	{/if}
</g>
