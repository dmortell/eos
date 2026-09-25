<script lang="ts">
	// Properties › ONE 3D model object (a box / wall / conduit): label, layer, colour, then its geometry — a box's
	// position / size / shape / rotation (+ door / window settings on an opening layer), a wall's or conduit's
	// defaults and per-segment overrides with each segment's true 3D length. Edits write straight to the model.
	import { ColorPicker } from '$lib'
	import { COLORS } from '../../palette'
	import NumCell from './NumCell.svelte'
	import { num, strVal, blurOnEnter, fmtLen } from './fields'
	import type { Obj, Layer as MLayer, Model, CableRun } from '../../3dview/types'
	import FillSection from '../FillSection.svelte'
	import RackProps from './RackProps.svelte'
	import { CABLE_TYPES, DEFAULT_CABLE, conduitFill, fillTone, portsNearest } from '../../3dview/fill'
	import { toast } from 'svelte-sonner'
	import { newId } from '../../ids'

	let { obj, layers = [], model = null, onupdate, ondelete, onseg, onadd, outletsFor, allocated, nodeId }: {
		obj: Obj; layers?: MLayer[]
		/** F9: the selected node of this wall / conduit (its own bend radius). */
		nodeId?: string
		/** E8 (a panel device): the outlets its row can serve + every allocated outlet → where. */
		outletsFor?: (rackModelId: string) => (import('../../store/allocate').OutletRef & { modelName: string })[]
		allocated?: Map<string, string>
		/** Add an object to the model (a rack's "+ Device"). */
		onadd?: (o: Obj) => void
		/** The model it's in (a conduit's "Count from outlets" reads its outlets + other conduits). */
		model?: Model | null
		onupdate?: (patch: Record<string, unknown>) => void; ondelete?: () => void
		/** A wall / conduit segment's own override (index into `segments`). */
		onseg?: (segIdx: number, patch: Record<string, unknown>) => void
	} = $props()

	// R4 (Dave's decision 2026-09-23): a prism is CALLED "Box" in the UI — the data/code keep `type: 'prism'`.
	const TYPE_LABEL: Record<string, string> = { prism: 'Box', wall: 'Wall', conduit: 'Conduit' }
	// A prism on an "opening" layer is a door/window/hole; label it as such.
	const isOpening = $derived(obj.type === 'prism' && !!layers.find((l) => l.id === obj.layer)?.opening)
	const typeLabel = $derived(obj.rack ? 'Rack' : obj.device ? 'Device' : isOpening ? 'Opening' : TYPE_LABEL[obj.type] ?? 'Object')
	const selNode = $derived(nodeId && obj.type === 'conduit' ? obj.nodes.find((n) => n.id === nodeId) ?? null : null)
	const setCables = (c: CableRun[]) => onupdate?.({ cables: c.length ? c : undefined })
	// F10 "advanced": the cables this conduit would carry if every outlet runs to its nearest conduit
	function countFromOutlets() {
		if (!model || !obj.id) return
		const r = portsNearest(obj.id, model.objects, model.shapes ?? [])
		if (!r.ports) { toast('No outlets have this as their nearest conduit'); return }
		const rest = (obj.type === 'conduit' ? obj.cables ?? [] : []).filter((c) => c.type !== DEFAULT_CABLE)
		setCables([{ type: DEFAULT_CABLE, qty: r.ports }, ...rest])
		toast(`${r.outlets} outlet${r.outlets === 1 ? '' : 's'} → ${r.ports} ${CABLE_TYPES[DEFAULT_CABLE].label} cables`)
	}
	/** A wall / conduit segment's true 3D length (model mm) between its two nodes. */
	function segLen(o: Obj, s: { a: string; b: string }): number {
		if (o.type !== 'conduit' && o.type !== 'wall') return 0
		const a = o.nodes.find((n) => n.id === s.a), b = o.nodes.find((n) => n.id === s.b)
		return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0
	}
</script>

<div class="prop-sec">{typeLabel}</div>
<!-- a name drawn with the object in plan / elevations (e.g. an imported riser room "IDF01-A") -->
<div class="prop"><span>Label</span><input value={obj.label ?? ''} placeholder="(none)"
	onchange={(e) => onupdate?.({ label: (e.currentTarget as HTMLInputElement).value.trim() || undefined })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span>Layer</span>
	<select value={obj.layer ?? ''} onchange={(e) => onupdate?.({ layer: (e.currentTarget as HTMLSelectElement).value || undefined })}>
		{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
	</select>
</div>
<!-- F8: the object's own colour over its layer's (ByLayer = none) -->
<div class="prop"><span>Colour</span>
	<ColorPicker value={obj.color} colors={COLORS} allowByLayer onchange={(v) => onupdate?.({ color: v })} />
</div>
{#if obj.type === 'prism'}
	{#if obj.rack || obj.device}<RackProps {obj} {model} {onupdate} {onadd} {outletsFor} {allocated} />{/if}
	<div class="prop-sec">POSITION</div>
	<div class="vecrow">
		<NumCell k="X" v={Math.round(obj.x)} set={(n) => onupdate?.({ x: n })} />
		<NumCell k="Y" v={Math.round(obj.y)} set={(n) => onupdate?.({ y: n })} />
		<NumCell k="Z" v={Math.round(obj.z)} set={(n) => onupdate?.({ z: Math.max(0, n) })} />
	</div>
	<div class="prop-sec">SIZE</div>
	<div class="vecrow">
		<NumCell k="W" v={Math.round(obj.w)} set={(n) => onupdate?.({ w: Math.max(1, n) })} />
		<NumCell k="D" v={Math.round(obj.d)} set={(n) => onupdate?.({ d: Math.max(1, n) })} />
		<NumCell k="H" v={Math.round(obj.h)} set={(n) => onupdate?.({ h: Math.max(1, n) })} />
	</div>
	<div class="prop"><span>Shape</span>
		<select value={obj.edges <= 4 ? '4' : obj.edges >= 16 ? '16' : String(obj.edges)} onchange={(e) => onupdate?.({ edges: +(e.currentTarget as HTMLSelectElement).value })}>
			<option value="4">Box</option><option value="16">Cylinder</option>
			{#if obj.edges > 4 && obj.edges < 16}<option value={String(obj.edges)}>{obj.edges}-gon</option>{/if}
		</select>
	</div>
	<div class="prop"><span>Sides</span><input type="number" min="3" max="24" value={obj.edges} onchange={(e) => onupdate?.({ edges: Math.max(3, Math.min(24, Math.round(num(e)))) })} /></div>
	<div class="prop-sec">ROTATION · degrees</div>
	<div class="vecrow">
		<NumCell k="X" v={Math.round(obj.rotX ?? 0)} set={(n) => onupdate?.({ rotX: n || undefined })} />
		<NumCell k="Y" v={Math.round(obj.rotY ?? 0)} set={(n) => onupdate?.({ rotY: n || undefined })} />
		<NumCell k="Z" v={Math.round(obj.rot ?? 0)} set={(n) => onupdate?.({ rot: n || undefined })} />
	</div>
	{#if isOpening}
		<div class="prop-sec">OPENING</div>
		<div class="prop"><span>Type</span>
			<select value={obj.open ?? 'hole'} onchange={(e) => onupdate?.({ open: (e.currentTarget as HTMLSelectElement).value })}>
				<option value="door">Door</option><option value="window">Window</option><option value="hole">Hole</option>
			</select>
		</div>
		{#if (obj.open ?? 'hole') === 'door'}
			<div class="prop"><span>Swing°</span><input type="number" min="0" max="180" value={obj.swing ?? 90} onchange={(e) => onupdate?.({ swing: Math.max(0, Math.min(180, Math.round(num(e)))) })} /></div>
			<div class="prop"><span>Hinge</span>
				<span class="pp-seg">
					<button class:on={!obj.flip} title="Hinge left" onclick={() => onupdate?.({ flip: false })}>L</button>
					<button class:on={!!obj.flip} title="Hinge right" onclick={() => onupdate?.({ flip: true })}>R</button>
				</span>
			</div>
		{/if}
	{:else if !obj.device}
		<!-- F6: where trunk / pipe ends attach (× in plan) — the default five, or the box's own (offsets from its centre) -->
		{@const cps = obj.cpts ?? []}
		<div class="prop-sec">CONNECTION POINTS<span class="sec-hint">{cps.length ? `${cps.length} own` : 'centre + edges'}</span></div>
		{#each cps as c, i (c.id)}
			<div class="vecrow">
				<NumCell k="dX" v={c.dx} set={(n) => onupdate?.({ cpts: cps.map((q, j) => (j === i ? { ...q, dx: Math.round(n) } : q)) })} />
				<NumCell k="dY" v={c.dy} set={(n) => onupdate?.({ cpts: cps.map((q, j) => (j === i ? { ...q, dy: Math.round(n) } : q)) })} />
				<button class="pp-mini" title="Remove this point" onclick={() => onupdate?.({ cpts: cps.length > 1 ? cps.filter((_, j) => j !== i) : undefined })}>×</button>
			</div>
		{/each}
		{#if cps.length}<div class="pp-hint">dX / dY = mm from the box's centre (+X right, +Y down the plan); the × marks show while a conduit is selected or being drawn.</div>{/if}
		<div class="prop"><span></span><span class="pp-seg">
			<!-- the first "+ Point" keeps the five defaults as editable rows, then adds one (at the centre — set its offset) -->
			<button title="Add a point (at the centre — then set its dX / dY)" onclick={() => {
				const base = cps.length ? cps : [{ id: 'c', dx: 0, dy: 0 }, { id: 'n', dx: 0, dy: -Math.round(obj.d / 2) }, { id: 'e', dx: Math.round(obj.w / 2), dy: 0 }, { id: 's', dx: 0, dy: Math.round(obj.d / 2) }, { id: 'w', dx: -Math.round(obj.w / 2), dy: 0 }]
				onupdate?.({ cpts: [...base, { id: newId('cp'), dx: 0, dy: 0 }] })
			}}>+ Point</button>
			{#if cps.length}<button title="Back to centre + edge midpoints" onclick={() => onupdate?.({ cpts: undefined })}>Default</button>{/if}
		</span></div>
	{/if}
{:else if obj.type === 'wall'}
	<div class="prop-sec">DEFAULTS</div>
	<div class="prop"><span>Height</span><input type="number" value={obj.h} onchange={(e) => onupdate?.({ h: Math.max(1, num(e)) })} /></div>
	<div class="prop"><span>Thickness</span><input type="number" value={obj.thickness} onchange={(e) => onupdate?.({ thickness: Math.max(1, num(e)) })} /></div>
	<div class="prop-sec">SEGMENTS ({obj.segments.length})<span class="sec-hint" title="Total wall length">L {fmtLen(obj.segments.reduce((t, s) => t + segLen(obj, s), 0))}</span></div>
	{#each obj.segments as s, si (s.id)}
		<div class="seg-row"><em>{si + 1}</em>
			<label>t<input type="number" value={s.thickness ?? obj.thickness} placeholder={String(obj.thickness)} onchange={(e) => onseg?.(si, { thickness: Math.max(1, num(e)) })} /></label>
			<label>h<input type="number" value={s.h ?? obj.h} placeholder={String(obj.h)} onchange={(e) => onseg?.(si, { h: Math.max(1, num(e)) })} /></label>
			<span class="seg-len" title="Length">L {fmtLen(segLen(obj, s))}</span>
		</div>
	{/each}
{:else if obj.type === 'conduit'}
	<div class="prop-sec">DEFAULTS</div>
	<div class="prop"><span>Width</span><input type="number" value={obj.w} onchange={(e) => onupdate?.({ w: Math.max(1, num(e)) })} /></div>
	<div class="prop"><span>Height</span><input type="number" value={obj.h} onchange={(e) => onupdate?.({ h: Math.max(1, num(e)) })} /></div>
	<div class="prop"><span>Profile</span>
		<select value={obj.edges === 4 ? '4' : '16'} onchange={(e) => onupdate?.({ edges: +(e.currentTarget as HTMLSelectElement).value })}>
			<option value="4">Rectangular</option><option value="16">Round</option>
		</select>
	</div>
	<div class="prop"><span>Bend r</span><input type="number" min="0" value={obj.bend ?? 0} title="Corner fillet radius (mm) — rounds every corner without its own" onchange={(e) => onupdate?.({ bend: Math.max(0, num(e)) })} /></div>
	{#if selNode}
		<!-- F9: the selected corner's own radius (blank = the default above); also its ◇ handle in plan -->
		<div class="prop"><span>Node bend r</span><input type="number" min="0" value={selNode.bend ?? ''} placeholder={String(obj.bend ?? 0)} title="This corner's fillet radius (mm); empty = the default"
			onchange={(e) => { const v = strVal(e).trim(), id = selNode!.id; onupdate?.({ nodes: obj.nodes.map((n) => (n.id === id ? { ...n, bend: v === '' ? undefined : Math.max(0, Math.round(+v)) } : n)) }) }} /></div>
	{/if}
	<!-- L = the segment's TRUE 3D length (model mm) — floors hidden in a riser drawing don't shorten it -->
	<div class="prop-sec">SEGMENTS ({obj.segments.length})<span class="sec-hint" title="Total run length">L {fmtLen(obj.segments.reduce((t, s) => t + segLen(obj, s), 0))}</span></div>
	{#each obj.segments as s, si (s.id)}
		<div class="seg-row"><em>{si + 1}</em>
			<label>w<input type="number" value={s.w ?? obj.w} placeholder={String(obj.w)} onchange={(e) => onseg?.(si, { w: Math.max(1, num(e)) })} /></label>
			<label>h<input type="number" value={s.h ?? obj.h} placeholder={String(obj.h)} onchange={(e) => onseg?.(si, { h: Math.max(1, num(e)) })} /></label>
			<span class="seg-len" title="Length (3D)">L {fmtLen(segLen(obj, s))}</span>
		</div>
	{/each}
	<!-- F10: the cables it carries → fill % (the tightest segment governs) + the packed cross-section -->
	{@const cables = obj.cables ?? []}
	{@const pct = conduitFill(obj)}
	<div class="prop-sec">CABLES<span class="sec-hint" style:color={cables.length ? fillTone(pct) : undefined}>{cables.length ? `${Math.round(pct)}% fill` : 'none'}</span></div>
	{#each cables as c, ci (ci)}
		<div class="seg-row">
			<select value={c.type} onchange={(e) => setCables(cables.map((x, j) => (j === ci ? { ...x, type: (e.currentTarget as HTMLSelectElement).value } : x)))}>
				{#each Object.entries(CABLE_TYPES) as [k, t] (k)}<option value={k}>{t.label} · Ø{t.d}</option>{/each}
				<option value="custom">Custom Ø</option>
			</select>
			{#if c.type === 'custom'}<label>Ø<input type="number" min="1" value={c.d ?? 7} onchange={(e) => setCables(cables.map((x, j) => (j === ci ? { ...x, d: Math.max(1, num(e)) } : x)))} /></label>{/if}
			<label>×<input type="number" min="0" value={c.qty} onchange={(e) => setCables(cables.map((x, j) => (j === ci ? { ...x, qty: Math.max(0, Math.round(num(e))) } : x)))} /></label>
			<button class="pp-mini" title="Remove" onclick={() => setCables(cables.filter((_, j) => j !== ci))}>×</button>
		</div>
	{/each}
	<div class="prop"><span></span>
		<span class="pp-seg">
			<button onclick={() => setCables([...cables, { type: DEFAULT_CABLE, qty: 1 }])}>+ Cables</button>
			{#if model && obj.id}<button title="Every outlet whose nearest conduit is this one: its PORTS as {CABLE_TYPES[DEFAULT_CABLE].label}" onclick={countFromOutlets}>Count from outlets</button>{/if}
		</span>
	</div>
	{#if cables.some((c) => c.qty > 0)}<div class="fill-prev"><FillSection conduit={obj} name={obj.label} /></div>{/if}
{/if}
<button class="pp-del" onclick={() => ondelete?.()}>Delete object</button>
<div class="pp-hint">Editing writes straight to the 3D model. Reshape geometry by dragging its grips.</div>
