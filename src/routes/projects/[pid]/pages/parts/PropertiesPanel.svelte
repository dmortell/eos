<script lang="ts">
	// Right-sidebar PROPERTIES panel (Pages mockup). Edits the SELECTED entities of the
	// active document with real two-way binding; with several selected it shows the group's
	// common props (bbox X/Y/W/H) and edits apply to all. Falls back to page/general props
	// when nothing is selected. Geometry is in model units (mock).
	import { Icon, ColorPicker } from '$lib'
	import type { Ent, Pt } from '../ui/Viewport.svelte'
	import { translate, STYLE_DEFAULTS, type TextAlign, type VAlign } from '../ui/geometry'
	import { COLORS } from '../palette'
	import { layers } from '../layers.svelte'
	import type { FrameSel } from './PaperPage.svelte'
	import type { Obj, Layer as MLayer } from '../3dview/types'

	let { ents = [], onupdate, onarrange, pageTitle = '', pageKind = '', activeLayer = '', node = null, viewport = null,
		modelObj = null, modelLayers = [], onmodelupdate, onmodeldelete }:
		{ ents?: Ent[]; onupdate?: (e: Ent) => void; onarrange?: (op: 'front' | 'back' | 'forward' | 'backward') => void;
			pageTitle?: string; pageKind?: string; activeLayer?: string;
			node?: { id: string; label: string; kind: string } | null; viewport?: FrameSel | null;
			modelObj?: Obj | null; modelLayers?: MLayer[]; onmodelupdate?: (patch: Record<string, unknown>) => void; onmodeldelete?: () => void } = $props()
	const MODEL_TYPE_LABEL: Record<string, string> = { prism: 'Prism', wall: 'Wall', conduit: 'Conduit' }

	// Mock property fields per tree-node kind (label → placeholder). Editing is local mock only.
	const NODE_FIELDS: Record<string, [string, string][]> = {
		project: [['Client', 'Journey K.K.'], ['Number', 'EOS-2314'], ['Address', 'Chiyoda, Tokyo'], ['Discipline', 'ICT / Structured Cabling']],
		building: [['Address', '—'], ['Floors', '—']],
		floor: [['Level', '—'], ['Elevation (mm)', '0']],
		zone: [['Type', 'Office'], ['Server room', 'IDF1']],
		room: [['Type', 'IDF'], ['Racks', '2']],
		row: [['Racks', '4']],
	}
	const kindLabel: Record<string, string> = {
		project: 'PROJECT', building: 'BUILDING', floor: 'FLOOR', zone: 'ZONE', room: 'ROOM', row: 'ROW',
	}

	function bbox(e: Ent): [number, number, number, number] {
		if (e.type === 'polyline') { const pts = e.pts ?? []; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
		if (e.type === 'circle') return [e.c![0] - e.r!, e.c![1] - e.r!, e.c![0] + e.r!, e.c![1] + e.r!]
		if (e.type === 'text') return [e.a![0], e.a![1] - 10, e.a![0] + 40, e.a![1]]
		const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	// Group bbox across the selection.
	let gb = $derived.by(() => {
		if (!ents.length) return null
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const e of ents) { const [a, b, c, d] = bbox(e); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
	})
	let single = $derived(ents.length === 1 ? ents[0] : null)
	let typeLabel = $derived(ents.length === 0 ? '' : new Set(ents.map(e => e.type)).size === 1 ? ents[0].type : `Mixed (${ents.length})`)
	const r1 = (n: number) => Math.round(n * 10) / 10

	// (translate lives in ../ui/geometry)
	// Move the whole selection so the group bbox's corner reaches v. Capture the delta and a
	// snapshot up front — each onupdate re-derives gb/ents, so reading them mid-loop drifts.
	function setX(v: number) { if (!gb) return; const dx = v - gb.x, snap = [...ents]; for (const e of snap) onupdate?.(translate(e, dx, 0)) }
	function setY(v: number) { if (!gb) return; const dy = v - gb.y, snap = [...ents]; for (const e of snap) onupdate?.(translate(e, 0, dy)) }
	// Single-entity size edits (anchored at the top-left / centre).
	const boxKind = (e?: Ent | null) => e?.type === 'rect' || e?.type === 'ellipse' || e?.type === 'box'
	function setW(v: number) {
		const e = single; if (!boxKind(e)) return
		const x0 = Math.min(e!.a![0], e!.b![0]), y0 = Math.min(e!.a![1], e!.b![1]), h = Math.abs(e!.b![1] - e!.a![1])
		onupdate?.({ ...e!, a: [x0, y0], b: [x0 + Math.max(1, v), y0 + h] })
	}
	function setH(v: number) {
		const e = single; if (!boxKind(e)) return
		const x0 = Math.min(e!.a![0], e!.b![0]), y0 = Math.min(e!.a![1], e!.b![1]), w = Math.abs(e!.b![0] - e!.a![0])
		onupdate?.({ ...e!, a: [x0, y0], b: [x0 + w, y0 + Math.max(1, v)] })
	}
	function setR(v: number) { const e = single; if (e?.type === 'circle') onupdate?.({ ...e, r: Math.max(1, v) }) }
	function setBoxH(v: number) { const e = single; if (e?.type === 'box') onupdate?.({ ...e, h: Math.max(1, Math.round(v)) }) }
	function setBoxZ0(v: number) { const e = single; if (e?.type === 'box') onupdate?.({ ...e, z0: Math.max(0, Math.round(v)) }) }
	function setText(v: string) { const e = single; if (e?.type === 'text') onupdate?.({ ...e, text: v }) }
	function setRot(v: number) { const r = ((Math.round(v) % 360) + 360) % 360; setAll({ rot: r || undefined }) }
	const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value
	const strVal = (e: Event) => (e.currentTarget as HTMLInputElement).value

	// ── style (color / fill / weight / font / align) — applies to the whole selection ──
	const STROKE_TYPES = new Set(['line', 'polyline', 'dim', 'rect', 'ellipse', 'circle', 'box'])
	const FILL_TYPES = new Set(['rect', 'ellipse', 'circle', 'box', 'polyline'])
	let anyText = $derived(ents.some((e) => e.type === 'text'))
	let anyStroke = $derived(ents.some((e) => STROKE_TYPES.has(e.type)))
	let anyFillable = $derived(ents.some((e) => FILL_TYPES.has(e.type)))
	// common value across the selection (undefined = mixed / unset)
	function cc<K extends keyof Ent>(k: K): Ent[K] | undefined { const v = new Set(ents.map((e) => e[k])); return v.size === 1 ? ents[0][k] : undefined }
	let mixedColor = $derived(new Set(ents.map((e) => e.color)).size > 1)
	let mixedFill = $derived(new Set(ents.map((e) => e.fill)).size > 1)
	function setAll(patch: Partial<Ent>) { const snap = [...ents]; for (const e of snap) onupdate?.({ ...e, ...patch }) }
	function setLayer(v: string) { setAll({ layer: v || undefined }) }
	// Enter / Shift-Enter in a field jumps to the next / previous field in the panel (textareas keep
	// Enter for newlines). Fields opt in with class="navf".
	function fnav(e: KeyboardEvent) {
		if (e.key !== 'Enter' || (e.currentTarget as HTMLElement).tagName === 'TEXTAREA') return
		e.preventDefault()
		const fields = [...document.querySelectorAll<HTMLElement>('.pp .navf')].filter((el) => !(el as HTMLInputElement).disabled)
		const i = fields.indexOf(e.currentTarget as HTMLElement)
		const nx = fields[i + (e.shiftKey ? -1 : 1)]
		if (nx) { nx.focus(); (nx as HTMLInputElement).select?.() }
	}
	// Grow the text textarea to fit its content (and on every input).
	function autoresize(el: HTMLTextAreaElement) {
		const grow = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
		grow(); el.addEventListener('input', grow)
		return { destroy() { el.removeEventListener('input', grow) } }
	}
</script>

<!-- one labelled number cell for the compact X/Y/Z · W/D/H vector rows -->
{#snippet numcell(k: string, v: number, set?: (n: number) => void)}
	<label class="vcell"><em>{k}</em>
		<input class:navf={!!set} type="number" value={v} readonly={!set} onkeydown={set ? fnav : undefined} onchange={(e) => set?.(num(e))} />
	</label>
{/snippet}

<div class="pp">
	{#if modelObj}
		<!-- a 3D MODEL object is selected → edit its geometry + layer straight on the store -->
		<div class="prop-sec">{MODEL_TYPE_LABEL[modelObj.type] ?? 'OBJECT'}</div>
		<div class="prop"><span>Layer</span>
			<select value={modelObj.layer ?? ''} onchange={(e) => onmodelupdate?.({ layer: (e.currentTarget as HTMLSelectElement).value || undefined })}>
				{#each modelLayers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</div>
		{#if modelObj.type === 'prism'}
			<div class="prop-sec">POSITION</div>
			<div class="vecrow">
				{@render numcell('X', Math.round(modelObj.x), (n) => onmodelupdate?.({ x: n }))}
				{@render numcell('Y', Math.round(modelObj.y), (n) => onmodelupdate?.({ y: n }))}
				{@render numcell('Z', Math.round(modelObj.z), (n) => onmodelupdate?.({ z: Math.max(0, n) }))}
			</div>
			<div class="prop-sec">SIZE</div>
			<div class="vecrow">
				{@render numcell('W', Math.round(modelObj.w), (n) => onmodelupdate?.({ w: Math.max(1, n) }))}
				{@render numcell('D', Math.round(modelObj.d), (n) => onmodelupdate?.({ d: Math.max(1, n) }))}
				{@render numcell('H', Math.round(modelObj.h), (n) => onmodelupdate?.({ h: Math.max(1, n) }))}
			</div>
			<div class="prop"><span>Rotation°</span><input type="number" value={modelObj.rot ?? 0} onchange={(e) => onmodelupdate?.({ rot: num(e) })} /></div>
		{:else if modelObj.type === 'wall'}
			<div class="prop"><span>Height</span><input type="number" value={modelObj.h} onchange={(e) => onmodelupdate?.({ h: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Thickness</span><input type="number" value={modelObj.thickness} onchange={(e) => onmodelupdate?.({ thickness: Math.max(1, num(e)) })} /></div>
		{:else if modelObj.type === 'conduit'}
			<div class="prop"><span>Width</span><input type="number" value={modelObj.w} onchange={(e) => onmodelupdate?.({ w: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Height</span><input type="number" value={modelObj.h} onchange={(e) => onmodelupdate?.({ h: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Profile</span>
				<select value={modelObj.edges === 4 ? '4' : '16'} onchange={(e) => onmodelupdate?.({ edges: +(e.currentTarget as HTMLSelectElement).value })}>
					<option value="4">Rectangular</option><option value="16">Round</option>
				</select>
			</div>
		{/if}
		<button class="pp-del" onclick={() => onmodeldelete?.()}>Delete object</button>
		<div class="pp-hint">Editing writes straight to the 3D model.</div>
	{:else if ents.length === 0 && !node && viewport}
		<!-- a viewport frame is selected in paper space → its view/content props (mock) -->
		<div class="prop-sec">VIEWPORT</div>
		<div class="prop"><span>Name</span><input value={viewport.label} /></div>
		<div class="prop"><span>Type</span><input value="Viewport" readonly /></div>
		<div class="prop-sec">FRAME</div>
		<div class="prop"><span>X</span><input type="number" value={viewport.x} onchange={(e) => viewport?.setRect({ x: num(e) })} /></div>
		<div class="prop"><span>Y</span><input type="number" value={viewport.y} onchange={(e) => viewport?.setRect({ y: num(e) })} /></div>
		<div class="prop"><span>Width</span><input type="number" value={viewport.w} onchange={(e) => viewport?.setRect({ w: Math.max(90, num(e)) })} /></div>
		<div class="prop"><span>Height</span><input type="number" value={viewport.h} onchange={(e) => viewport?.setRect({ h: Math.max(90, num(e)) })} /></div>
		<div class="prop-sec">STYLE</div>
		<div class="prop"><span>Border</span>
			<select value={viewport.border} onchange={(e) => viewport?.setBorder((e.currentTarget as HTMLSelectElement).value as 'dashed' | 'solid' | 'none')}>
				<option value="dashed">Dashed</option><option value="solid">Solid</option><option value="none">None</option>
			</select>
		</div>
		<div class="pp-hint">Per-view content config (scale / crop / source) comes later — see §5.</div>
	{:else if ents.length === 0 && node}
		<!-- a tree node is selected → its place properties (mock) -->
		<div class="prop-sec">{kindLabel[node.kind] ?? 'ITEM'}</div>
		<div class="prop"><span>Name</span><input value={node.label} /></div>
		{#each NODE_FIELDS[node.kind] ?? [] as [label, ph] (label)}
			<div class="prop"><span>{label}</span><input value={ph} /></div>
		{/each}
		<div class="pp-hint">Editing these is mock-only for now.</div>
	{:else if ents.length === 0}
		<!-- nothing selected → page / general props (mock) -->
		<div class="prop-sec">PAGE</div>
		<div class="prop"><span>Name</span><input value={pageTitle} /></div>
		<div class="prop"><span>Type</span><input value={pageKind} readonly /></div>
		<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
		<div class="pp-hint">Select an object to edit its properties, or a place in the tree.</div>
	{:else}
		<div class="prop-sec">{ents.length === 1 ? 'OBJECT' : `${ents.length} OBJECTS`}</div>
		<div class="prop"><span>Type</span><input value={typeLabel} readonly /></div>
		<div class="prop-sec">POSITION</div>
		<div class="vecrow">
			{@render numcell('X', r1(gb!.x), setX)}
			{@render numcell('Y', r1(gb!.y), setY)}
			{#if single?.type === 'box'}{@render numcell('Z', Math.round(single.z0 ?? 0), setBoxZ0)}{/if}
		</div>
		<div class="prop-sec">SIZE</div>
		<div class="vecrow">
			{#if single?.type === 'box'}
				{@render numcell('W', r1(Math.abs(single.b![0] - single.a![0])), setW)}
				{@render numcell('D', r1(Math.abs(single.b![1] - single.a![1])), setH)}
				{@render numcell('H', Math.round(single.h ?? 45), setBoxH)}
			{:else if single?.type === 'circle'}
				{@render numcell('R', r1(single.r!), setR)}
			{:else if boxKind(single)}
				{@render numcell('W', r1(Math.abs(single!.b![0] - single!.a![0])), setW)}
				{@render numcell('H', r1(Math.abs(single!.b![1] - single!.a![1])), setH)}
			{:else}
				{@render numcell('W', r1(gb!.w))}
				{@render numcell('H', r1(gb!.h))}
			{/if}
		</div>
		<div class="prop-sec">ROTATION · degrees</div>
		<div class="vecrow">
			{@render numcell('∠', Math.round((cc('rot') as number | undefined) ?? 0), setRot)}
			<span class="vspacer"></span><span class="vspacer"></span>
		</div>
		<div class="prop-sec">ARRANGE</div>
		<div class="prop"><span>Draw order</span>
			<span class="pp-seg">
				<button title="Send to back (Ctrl+Shift+[)" onclick={() => onarrange?.('back')}>⤓</button>
				<button title="Send backward (Ctrl+[)" onclick={() => onarrange?.('backward')}>▽</button>
				<button title="Bring forward (Ctrl+])" onclick={() => onarrange?.('forward')}>△</button>
				<button title="Bring to front (Ctrl+Shift+])" onclick={() => onarrange?.('front')}>⤒</button>
			</span>
		</div>
		{#if single?.type === 'text'}
			<div class="prop-sec">TEXT</div>
			<div class="prop wide"><textarea class="pp-textarea" use:autoresize value={single.text ?? ''} onchange={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}></textarea></div>
		{/if}
		<div class="prop-sec">STYLE</div>
		<div class="prop"><span>Layer</span>
			<select class="navf" value={(cc('layer') as string | undefined) ?? ''} onkeydown={fnav} onchange={(e) => setLayer(strVal(e))}>
				<option value="">— none —</option>
				{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</div>
		<div class="prop"><span>Color</span>
			<ColorPicker value={cc('color') as string | undefined} colors={COLORS} allowByLayer mixed={mixedColor} onchange={(v) => setAll({ color: v })} />
		</div>
		{#if anyStroke}
			<div class="prop"><span>Weight</span><input class="navf" type="number" min="0.1" step="0.1" value={(cc('weight') as number | undefined) ?? STYLE_DEFAULTS.weight} onkeydown={fnav} onchange={(e) => setAll({ weight: Math.max(0.1, num(e)) })} /></div>
		{/if}
		{#if anyFillable}
			<div class="prop"><span>Fill</span>
				<ColorPicker value={(cc('fill') as string | undefined) ?? 'none'} colors={COLORS} allowNone mixed={mixedFill} onchange={(v) => setAll({ fill: v ?? 'none' })} />
			</div>
		{/if}
		{#if anyText}
			<div class="prop"><span>Font (pt)</span><input class="navf" type="number" min="2" max="96" value={(cc('fontPt') as number | undefined) ?? STYLE_DEFAULTS.fontPt} onkeydown={fnav} onchange={(e) => setAll({ fontPt: Math.max(2, Math.round(num(e))) })} /></div>
			<div class="prop"><span>Align</span>
				<span class="pp-seg">
					{#each ['left', 'center', 'right'] as const as al (al)}
						<button class:on={(cc('align') ?? 'left') === al} title="{al} align" onclick={() => setAll({ align: al as TextAlign })}>{al[0].toUpperCase()}</button>
					{/each}
				</span>
			</div>
			<div class="prop"><span>V-align</span>
				<span class="pp-seg">
					{#each ['top', 'middle', 'bottom'] as const as va (va)}
						<button class:on={(cc('valign') ?? 'top') === va} title="{va} align" onclick={() => setAll({ valign: va as VAlign })}>{va[0].toUpperCase()}</button>
					{/each}
				</span>
			</div>
		{/if}
		<div class="pp-hint">{ents.length > 1 ? 'Style + position apply to the whole selection.' : 'Editing writes straight to the object.'} New objects use Sheets’ defaults ({STYLE_DEFAULTS.fontPt}pt, left).</div>
	{/if}
</div>

<style>
	.pp { flex:1; overflow-y:auto; padding:5px; min-height:0; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.prop-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.prop { display:grid; grid-template-columns:64px 1fr; align-items:center; gap:6px; padding:2px 4px; }
	.prop.wide { grid-template-columns:1fr; }
	.prop span { color:var(--muted); font-size:11px; }
	.prop input, .prop select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; font-family:Consolas,monospace; min-width:0; }
	.prop input:read-only { color:var(--muted); }
	.pp-textarea { width:100%; min-height:32px; resize:vertical; overflow:hidden; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:4px 6px; font-size:11px; font-family:'Consolas','SF Mono',ui-monospace,monospace; }
	.pp-textarea:focus { outline:none; border-color:var(--accent); }
	.prop input:focus, .prop select:focus { outline:none; border-color:var(--accent); }
	.pp-hint { font-size:10px; color:var(--faint); padding:10px 6px; line-height:1.4; }
	.pp-del { margin:10px 6px 4px; width:calc(100% - 12px); padding:6px; background:#7f1d1d33; color:#ef4444; border:1px solid #ef444455; border-radius:5px; cursor:pointer; font-size:12px; }
	.pp-del:hover { background:#7f1d1d55; }
	/* compact X/Y/Z · W/D/H vector rows */
	.vecrow { display:flex; gap:5px; padding:2px 4px; }
	.vcell { flex:1; min-width:0; display:flex; align-items:center; gap:4px; }
	.vcell em { font-style:normal; color:var(--faint); font-size:10px; font-weight:600; width:10px; flex:0 0 auto; text-align:center; }
	.vcell input { width:100%; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 4px; font-size:11px; font-family:Consolas,monospace; }
	.vcell input:read-only { color:var(--muted); }
	.vcell input:focus { outline:none; border-color:var(--accent); }
	.vspacer { flex:1; }
	/* L/C/R alignment segmented control */
	.pp-seg { display:flex; gap:2px; }
	.pp-seg button { flex:1; font-size:11px; font-weight:600; color:var(--muted); background:var(--input); border:1px solid var(--line); border-radius:4px; padding:2px 0; }
	.pp-seg button:hover { color:var(--text); border-color:var(--accent-dim); }
	.pp-seg button.on { color:var(--accent); border-color:var(--accent); background:var(--active); }
</style>
