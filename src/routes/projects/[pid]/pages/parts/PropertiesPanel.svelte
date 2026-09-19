<script lang="ts">
	// Right-sidebar PROPERTIES panel (Pages mockup). Edits the SELECTED entities of the
	// active document with real two-way binding; with several selected it shows the group's
	// common props (bbox X/Y/W/H) and edits apply to all. Falls back to page/general props
	// when nothing is selected. Geometry is in model units (mock).
	import { Icon } from '$lib'
	import type { Ent, Pt } from '../ui/Viewport.svelte'
	import type { FrameSel } from './PaperPage.svelte'

	let { ents = [], onupdate, pageTitle = '', pageKind = '', activeLayer = '', node = null, viewport = null }:
		{ ents?: Ent[]; onupdate?: (e: Ent) => void; pageTitle?: string; pageKind?: string; activeLayer?: string;
			node?: { id: string; label: string; kind: string } | null; viewport?: FrameSel | null } = $props()

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

	function translate(e: Ent, dx: number, dy: number): Ent {
		const t = (p?: Pt): Pt | undefined => p ? [p[0] + dx, p[1] + dy] : p
		return { ...e, a: t(e.a), b: t(e.b), c: t(e.c), pts: e.pts?.map(p => [p[0] + dx, p[1] + dy] as Pt) }
	}
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
	function setText(v: string) { const e = single; if (e?.type === 'text') onupdate?.({ ...e, text: v }) }
	const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value
</script>

<div class="pp">
	{#if ents.length === 0 && !node && viewport}
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
		<div class="prop-sec">GEOMETRY</div>
		<div class="prop"><span>X</span><input type="number" value={r1(gb!.x)} onchange={(e) => setX(num(e))} /></div>
		<div class="prop"><span>Y</span><input type="number" value={r1(gb!.y)} onchange={(e) => setY(num(e))} /></div>
		{#if single?.type === 'box'}
			<div class="prop"><span>Width</span><input type="number" value={r1(Math.abs(single.b![0] - single.a![0]))} onchange={(e) => setW(num(e))} /></div>
			<div class="prop"><span>Depth</span><input type="number" value={r1(Math.abs(single.b![1] - single.a![1]))} onchange={(e) => setH(num(e))} /></div>
			<div class="prop"><span>Height</span><input type="number" value={Math.round(single.h ?? 0)} onchange={(e) => setBoxH(num(e))} /></div>
		{:else if boxKind(single)}
			<div class="prop"><span>Width</span><input type="number" value={r1(Math.abs(single!.b![0] - single!.a![0]))} onchange={(e) => setW(num(e))} /></div>
			<div class="prop"><span>Height</span><input type="number" value={r1(Math.abs(single!.b![1] - single!.a![1]))} onchange={(e) => setH(num(e))} /></div>
		{:else if single?.type === 'circle'}
			<div class="prop"><span>Radius</span><input type="number" value={r1(single.r!)} onchange={(e) => setR(num(e))} /></div>
		{:else}
			<div class="prop"><span>Width</span><input value={r1(gb!.w)} readonly /></div>
			<div class="prop"><span>Height</span><input value={r1(gb!.h)} readonly /></div>
		{/if}
		{#if single?.type === 'text'}
			<div class="prop-sec">TEXT</div>
			<div class="prop wide"><input value={single.text ?? ''} onchange={(e) => setText((e.currentTarget as HTMLInputElement).value)} /></div>
		{/if}
		<div class="prop-sec">STYLE</div>
		<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
		<div class="prop"><span>Color</span><input value="ByLayer" readonly /></div>
		<div class="pp-hint">{ents.length > 1 ? 'X / Y move the whole selection.' : 'Editing writes straight to the object.'}</div>
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
	.prop input:focus, .prop select:focus { outline:none; border-color:var(--accent); }
	.pp-hint { font-size:10px; color:var(--faint); padding:10px 6px; line-height:1.4; }
</style>
